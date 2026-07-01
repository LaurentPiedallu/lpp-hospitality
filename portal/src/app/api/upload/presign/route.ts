// Accepts a file via FormData, stores it in R2 via Workers binding,
// creates a Notion Uploads record, then notifies the Make.com pipeline.

import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/api-helpers";
import { getProperty } from "@/lib/notion-queries";
import { NOTION_DBS } from "@/lib/notion-ids";
import { getCloudflareContext } from "@opennextjs/cloudflare";

const NOTION_VERSION = "2022-06-28";

const WEBHOOK_CSV = "https://hook.us2.make.com/vzh17uueiewwg75b9g3xpmpf1wnxrgwa";
const WEBHOOK_PDF = process.env.MAKE_WEBHOOK_URL_PDF ?? "https://hook.us2.make.com/6njuyc3vcs78eqro495b7ygo3ic6hjmm";

type FileFormat = "CSV" | "PDF" | "Excel" | "Other";

function getFileFormat(fileName: string): FileFormat {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf")                return "PDF";
  if (ext === "csv")                return "CSV";
  if (ext === "xlsx" || ext === "xls") return "Excel";
  return "Other";
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || "status" in session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData        = await req.formData();
  const file            = formData.get("file") as File | null;
  const clientId        = formData.get("clientId") as string | null;
  const propertyId      = formData.get("propertyId") as string | null;
  const uploadType      = formData.get("uploadType") as string | null;
  const reportingPeriod = formData.get("reportingPeriod") as string | null;
  const notes           = formData.get("notes") as string | null;

  if (!file || !clientId || !propertyId) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  if (session.role !== "admin" && session.clientId !== clientId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const prop = await getProperty(propertyId, clientId);
  if (!prop) return NextResponse.json({ error: "Property not found" }, { status: 404 });

  // 1. Store in R2 via Workers binding
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { env } = await getCloudflareContext() as any;
  const ts   = Date.now();
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const key  = `${clientId}/${propertyId}/${ts}-${safe}`;

  await env.R2.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
  });

  // 2. Create Notion Uploads record
  const today      = new Date().toISOString().slice(0, 10);
  const fileFormat = getFileFormat(file.name);

  const notionBody: Record<string, unknown> = {
    parent: { database_id: NOTION_DBS.UPLOADS },
    properties: {
      "Upload Name":       { title: [{ text: { content: file.name } }] },
      "Client":            { relation: [{ id: clientId }] },
      "Property":          { relation: [{ id: propertyId }] },
      "Upload Date":       { date: { start: today } },
      "Processing Status": { select: { name: "Uploaded" } },
      "File Format":       { select: { name: fileFormat } },
      ...(uploadType?.trim()        ? { "Upload Type":       { select:     { name: uploadType.trim() } } } : {}),
      ...(reportingPeriod?.trim()   ? { "Reporting Period":  { date:       { start: reportingPeriod.trim() } } } : {}),
      ...(notes?.trim()             ? { "Validation Notes":  { rich_text:  [{ text: { content: notes.trim() } }] } } : {}),
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

  // 3. Notify Make.com pipeline — route by file format
  const webhookUrl = fileFormat === "PDF" ? WEBHOOK_PDF : WEBHOOK_CSV;

  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      uploadPageId: notionPage.id,
      propertyId,
      clientId,
      requestedAt: today,
    }),
  }).catch((err) => console.error("Make webhook failed:", err));

  return NextResponse.json({ ok: true, key, notionPageId: notionPage.id });
}
