// Accepts a file via FormData, validates format, stores in R2,
// creates a Notion Uploads record, then notifies the Make.com pipeline.

import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/api-helpers";
import { getProperty } from "@/lib/notion-queries";
import { NOTION_DBS } from "@/lib/notion-ids";
import { getCloudflareContext } from "@opennextjs/cloudflare";

const NOTION_VERSION = "2022-06-28";

// ─── Webhook URLs ────────────────────────────────────────────────────────────

const WEBHOOK_CSV = (process.env.MAKE_WEBHOOK_URL     ?? "https://hook.us2.make.com/vzh17uueiewwg75b9g3xpmpf1wnxrgwa").trim();
const WEBHOOK_PDF = (process.env.MAKE_WEBHOOK_URL_PDF ?? "https://hook.us2.make.com/6njuyc3vcs78eqro495b7ygo3ic6hjmm").trim();

// ─── File format helpers ──────────────────────────────────────────────────────

type FileFormat = "CSV" | "PDF" | "Excel";

const FORMAT_RULES: Record<FileFormat, { exts: string[]; mimes: string[] }> = {
  CSV:   { exts: ["csv"],        mimes: ["text/csv", "text/plain"] },
  PDF:   { exts: ["pdf"],        mimes: ["application/pdf"] },
  Excel: { exts: ["xlsx", "xls"], mimes: [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
  ]},
};

function extOf(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function isValidFormat(format: FileFormat, fileName: string, mimeType: string): boolean {
  const rules = FORMAT_RULES[format];
  return rules.exts.includes(extOf(fileName)) || rules.mimes.includes(mimeType.toLowerCase());
}

function mismatchMessage(format: FileFormat, fileName: string): string {
  const ext = extOf(fileName);
  return `You selected ${format} but the file is a .${ext}. Please correct the format or choose a different file.`;
}

// ─── R2 URL helpers ───────────────────────────────────────────────────────────

function sanitizeFilename(name: string): string {
  const ext   = name.split(".").pop() ?? "";
  const base  = name.slice(0, name.length - ext.length - 1).replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${base}.${ext}`;
}

function buildKey(clientId: string, propertyId: string, reportingPeriod: string | null, fileName: string): string {
  const safe = sanitizeFilename(fileName);
  const period = reportingPeriod?.trim() || "unspecified";
  return `${clientId}/${propertyId}/${period}/${safe}`;
}

// Encode each path segment but leave slashes intact.
function encodeKey(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

async function hmac(key: ArrayBuffer | string, data: string): Promise<ArrayBuffer> {
  const raw = typeof key === "string" ? new TextEncoder().encode(key) : key;
  const k   = await crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", k, new TextEncoder().encode(data));
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function generatePresignedGet(key: string, expireSecs = 2592000 /* 30 days */): Promise<string> {
  const accountId   = process.env.R2_ACCOUNT_ID!;
  const bucket      = process.env.R2_BUCKET!;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID!;
  const secretKey   = process.env.R2_SECRET_ACCESS_KEY!;

  const host    = `${accountId}.r2.cloudflarestorage.com`;
  const now     = new Date();
  const date    = now.toISOString().slice(0, 10).replace(/-/g, "");
  const datetime = date + "T" + now.toISOString().slice(11, 19).replace(/:/g, "") + "Z";
  const region  = "auto";
  const scope   = `${date}/${region}/s3/aws4_request`;

  // Canonical query string must be sorted alphabetically by key
  const qp = (
    [
      ["X-Amz-Algorithm",     "AWS4-HMAC-SHA256"],
      ["X-Amz-Credential",    `${accessKeyId}/${scope}`],
      ["X-Amz-Date",          datetime],
      ["X-Amz-Expires",       String(expireSecs)],
      ["X-Amz-SignedHeaders", "host"],
    ] as [string, string][]
  ).sort(([a], [b]) => a < b ? -1 : 1);

  const canonicalQS = qp.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
  const canonicalUri = `/${bucket}/${encodeKey(key)}`;

  const canonicalRequest = [
    "GET",
    canonicalUri,
    canonicalQS,
    `host:${host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const reqHash     = toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalRequest)));
  const stringToSign = ["AWS4-HMAC-SHA256", datetime, scope, reqHash].join("\n");

  const k1  = await hmac(`AWS4${secretKey}`, date);
  const k2  = await hmac(k1, region);
  const k3  = await hmac(k2, "s3");
  const k4  = await hmac(k3, "aws4_request");
  const sig = toHex(await hmac(k4, stringToSign));

  const signedQS = canonicalQS + `&X-Amz-Signature=${sig}`;
  return `https://${host}${canonicalUri}?${signedQS}`;
}

async function getFileUrl(key: string): Promise<string> {
  if (process.env.R2_PUBLIC_URL) {
    return `${process.env.R2_PUBLIC_URL.replace(/\/$/, "")}/${key}`;
  }
  return generatePresignedGet(key);
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || "status" in session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData        = await req.formData();
  const file            = formData.get("file")            as File | null;
  const clientId        = formData.get("clientId")        as string | null;
  const propertyId      = formData.get("propertyId")      as string | null;
  const fileFormat      = formData.get("fileFormat")      as string | null;
  const uploadType      = formData.get("uploadType")      as string | null;
  const reportingPeriod = formData.get("reportingPeriod") as string | null;
  const notes           = formData.get("notes")           as string | null;

  if (!file || !clientId || !propertyId || !fileFormat) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  if (!["CSV", "PDF", "Excel"].includes(fileFormat)) {
    return NextResponse.json({ error: "Invalid file format" }, { status: 400 });
  }

  // Server-side format validation
  const fmt = fileFormat as FileFormat;
  if (!isValidFormat(fmt, file.name, file.type)) {
    return NextResponse.json({ error: mismatchMessage(fmt, file.name) }, { status: 400 });
  }

  if (session.role !== "admin" && session.clientId !== clientId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const prop = await getProperty(propertyId, clientId);
  if (!prop) return NextResponse.json({ error: "Property not found" }, { status: 404 });

  // 1. Store in R2 — must succeed before Notion record is created
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { env } = await getCloudflareContext() as any;
  const key = buildKey(clientId, propertyId, reportingPeriod, file.name);

  try {
    await env.R2.put(key, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type || "application/octet-stream" },
    });
  } catch (err) {
    console.error("R2 upload failed:", err);
    return NextResponse.json({ error: "File storage failed — please try again" }, { status: 500 });
  }

  // 2. Resolve public/signed URL for the R2 object
  const fileUrl = await getFileUrl(key);

  // 3. Create Notion Uploads record
  const today = new Date().toISOString().slice(0, 10);

  const notionBody: Record<string, unknown> = {
    parent: { database_id: NOTION_DBS.UPLOADS },
    properties: {
      "Upload Name":       { title:     [{ text: { content: file.name } }] },
      "Client":            { relation:  [{ id: clientId }] },
      "Property":          { relation:  [{ id: propertyId }] },
      "Upload Date":       { date:      { start: today } },
      "Processing Status": { select:    { name: "Uploaded" } },
      "File Format":       { select:    { name: fmt } },
      "File URL":          { url:       fileUrl },
      ...(uploadType?.trim()       ? { "Upload Type":      { select:    { name: uploadType.trim() } } } : {}),
      ...(reportingPeriod?.trim()  ? { "Reporting Period": { date:      { start: reportingPeriod.trim() } } } : {}),
      ...(notes?.trim()            ? { "Validation Notes": { rich_text: [{ text: { content: notes.trim() } }] } } : {}),
    },
  };

  const notionRes = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(notionBody),
  });

  if (!notionRes.ok) {
    const err = await notionRes.text();
    console.error("Notion upload record failed:", err);
    return NextResponse.json({ error: "Stored in R2 but failed to record in Notion" }, { status: 502 });
  }

  const notionPage = await notionRes.json() as { id: string };

  // 4. Notify Make.com — PDF uses its own scenario, everything else uses the CSV scenario
  const webhookUrl = fmt === "PDF" ? WEBHOOK_PDF : WEBHOOK_CSV;

  const webhookPayload = {
    uploadPageId: notionPage.id,
    propertyId,
    clientId,
    requestedAt: today,
    fileUrl,
  };

  // Fire-and-forget — Make can take 30-60s; don't block the client on it.
  console.log("Firing Make webhook (async):", webhookUrl);
  fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(webhookPayload),
  }).catch((err) => console.error("Make webhook fire failed:", err));

  return NextResponse.json({ ok: true, key, notionPageId: notionPage.id });
}
