// Accepts a file via FormData, validates format, stores in R2,
// creates a Notion Uploads record (status: Pending), then triggers the
// Make extraction webhook so processing starts automatically.

import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/api-helpers";
import { getProperty } from "@/lib/notion-queries";
import { NOTION_DBS } from "@/lib/notion-ids";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import * as XLSX from "xlsx";

const NOTION_VERSION = "2022-06-28";

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

// ─── Excel → CSV conversion ───────────────────────────────────────────────────
// The extraction pipeline reads plain text (Claude parses the file content);
// it has no way to parse Excel's binary/compressed format, so a raw .xlsx
// reaching Make silently fails or produces garbage. Applies to any upload
// with an .xlsx/.xls extension, not just Menu Engineering specifically —
// File Format and Upload Type are independent selections in the upload form,
// so any upload type can already be submitted as Excel today.
//
// Multi-sheet workbooks get a "--- Sheet: {name} ---" header before each
// sheet's rows so sheet boundaries survive being flattened into one file —
// real Menu Engineering reports have separate sheets per daypart/category
// and that structure matters for extraction accuracy.
function convertExcelToCsv(buffer: ArrayBuffer): string {
  const workbook = XLSX.read(new Uint8Array(buffer), { type: "array" });
  const { SheetNames } = workbook;
  const multiSheet = SheetNames.length > 1;

  const parts = SheetNames.map((name) => {
    const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[name]);
    return multiSheet ? `--- Sheet: ${name} ---\n${csv}` : csv;
  });

  return parts.join("\n\n");
}

// Same key with the extension swapped to .csv — kept alongside the original
// binary file in R2 (not overwritten), so the converted version has its own
// stable object rather than colliding with the source upload.
function csvKeyFor(originalKey: string): string {
  return originalKey.replace(/\.(xlsx|xls)$/i, ".csv");
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

  const fileBuffer = await file.arrayBuffer();

  try {
    await env.R2.put(key, fileBuffer, {
      httpMetadata: { contentType: file.type || "application/octet-stream" },
    });
  } catch (err) {
    console.error("R2 upload failed:", err);
    return NextResponse.json({ error: "File storage failed — please try again" }, { status: 500 });
  }

  // 1b. Excel files can't be read by the extraction pipeline as-is — convert
  // to CSV and store alongside the original, then point everything
  // downstream (Notion's File URL, the extraction webhook) at the CSV
  // instead. The original binary file is kept in R2, not overwritten.
  // Conversion failure doesn't fail the whole upload — the raw file is
  // already safely stored — it falls back to the original key so the
  // upload still completes, just without the fix this step was for.
  let downstreamKey = key;
  if (fmt === "Excel") {
    try {
      const csvText = convertExcelToCsv(fileBuffer);
      const csvKey = csvKeyFor(key);
      await env.R2.put(csvKey, csvText, {
        httpMetadata: { contentType: "text/csv" },
      });
      downstreamKey = csvKey;
    } catch (err) {
      console.error("Excel-to-CSV conversion failed, falling back to original file:", err);
    }
  }

  // 2. Resolve public/signed URL for the R2 object
  const fileUrl = await getFileUrl(downstreamKey);

  // 3. Create Notion Uploads record
  const today = new Date().toISOString().slice(0, 10);

  const notionBody: Record<string, unknown> = {
    parent: { database_id: NOTION_DBS.UPLOADS },
    properties: {
      "Upload Name":       { title:     [{ text: { content: file.name } }] },
      "Client":            { relation:  [{ id: clientId }] },
      "Property":          { relation:  [{ id: propertyId }] },
      "Upload Date":       { date:      { start: today } },
      "Processing Status": { select:    { name: "Pending" } },
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

  // 4. Trigger the extraction pipeline for this Upload record. Routing, in
  // priority order:
  //   - Menu Engineering → its own Make automation (different output shape:
  //     many item-level records with relational rollups, not scalar metrics)
  //   - PDF uploads       → the PDF extraction scenario
  //   - CSV / Excel       → the CSV extraction scenario (Excel is converted
  //     to CSV upstream, so it goes through the same pipeline)
  //   - anything else     → the old combined extraction scenario as a
  //     fallback, so an unexpected format still triggers rather than
  //     silently resolving to undefined (upstream validation should keep
  //     fileFormat to CSV/PDF/Excel, so this is a safety net only)
  // Same payload shape for every destination; only the URL differs.
  // Processing Status in Notion is just a label — this webhook is the only
  // thing that actually kicks off extraction, so a failure here means the
  // upload is stored correctly but sits inert until someone retries it.
  let extractionTriggered = false;
  let extractionWebhook: string | undefined;
  if (uploadType?.trim() === "Menu Engineering") {
    extractionWebhook = process.env.MAKE_WEBHOOK_URL_MENU_ENGINEERING;
  } else if (fmt === "PDF") {
    extractionWebhook = process.env.MAKE_WEBHOOK_URL_PDF;
  } else if (fmt === "CSV" || fmt === "Excel") {
    extractionWebhook = process.env.MAKE_WEBHOOK_URL_CSV;
  } else {
    extractionWebhook = process.env.MAKE_WEBHOOK_URL_EXTRACTION;
  }
  if (extractionWebhook) {
    try {
      const webhookRes = await fetch(extractionWebhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: { id: notionPage.id } }),
      });
      extractionTriggered = webhookRes.ok;
      if (!webhookRes.ok) {
        console.error("Extraction webhook failed:", webhookRes.status, await webhookRes.text().catch(() => ""));
      }
    } catch (err) {
      console.error("Extraction webhook request failed:", err);
    }
  } else {
    const missingVar =
      uploadType?.trim() === "Menu Engineering" ? "MAKE_WEBHOOK_URL_MENU_ENGINEERING"
      : fmt === "PDF"                           ? "MAKE_WEBHOOK_URL_PDF"
      : fmt === "CSV" || fmt === "Excel"        ? "MAKE_WEBHOOK_URL_CSV"
      :                                          "MAKE_WEBHOOK_URL_EXTRACTION";
    console.error(`${missingVar} is not configured — upload recorded but extraction was not triggered`);
  }

  return NextResponse.json({ ok: true, key, notionPageId: notionPage.id, extractionTriggered });
}
