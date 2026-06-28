// Accepts a file via FormData, stores it in R2 via Workers binding,
// and records the upload in Notion. No S3 credentials required.

import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/api-helpers";
import { getProperty } from "@/lib/notion-queries";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NOTION_DBS } from "@/lib/notion-ids";

const NOTION_VERSION = "2022-06-28";

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || "status" in session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const file        = formData.get("file") as File | null;
  const clientId    = formData.get("clientId") as string | null;
  const propertyId  = formData.get("propertyId") as string | null;
  const notes       = formData.get("notes") as string | null;

  if (!file || !clientId || !propertyId) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  if (session.role !== "admin" && session.clientId !== clientId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const prop = await getProperty(propertyId, clientId);
  if (!prop) return NextResponse.json({ error: "Property not found" }, { status: 404 });

  // Store in R2 via Workers binding
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { env } = await getCloudflareContext() as any;
  const ts   = Date.now();
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const key  = `${clientId}/${propertyId}/${ts}-${safe}`;

  await env.R2.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
  });

  // Record in Notion Uploads database
  const today = new Date().toISOString().slice(0, 10);
  const notionRes = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      parent: { database_id: NOTION_DBS.UPLOADS },
      properties: {
        "Upload Name":       { title: [{ text: { content: file.name } }] },
        "Property":          { relation: [{ id: propertyId }] },
        "Upload Date":       { date: { start: today } },
        "Processing Status": { select: { name: "Uploaded" } },
        "Uploaded By":       { rich_text: [{ text: { content: "Portal" } }] },
        ...(notes?.trim() ? { "Validation Notes": { rich_text: [{ text: { content: notes.trim() } }] } } : {}),
      },
    }),
  });

  if (!notionRes.ok) {
    const err = await notionRes.text();
    console.error("Notion upload record failed:", err);
    return NextResponse.json({ error: "Stored in R2 but failed to record in Notion" }, { status: 502 });
  }

  return NextResponse.json({ ok: true, key });
}
