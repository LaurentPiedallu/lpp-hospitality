// Called after the browser has PUT the file to R2.
// Creates a record in the Notion Uploads database.

import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/api-helpers";
import { getProperty } from "@/lib/notion-queries";
import { NOTION_DBS } from "@/lib/notion-ids";

const NOTION_VERSION = "2022-06-28";

async function notionPost(path: string, body: unknown): Promise<Response> {
  return fetch(`https://api.notion.com/v1${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || "status" in session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { clientId, propertyId, fileName, fileUrl, contentType, notes } = await req.json() as {
    clientId: string;
    propertyId: string;
    fileName: string;
    fileUrl: string;
    contentType: string;
    notes?: string;
  };

  if (!clientId || !propertyId || !fileName || !fileUrl) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  if (session.role !== "admin" && session.clientId !== clientId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const prop = await getProperty(propertyId, clientId);
  if (!prop) return NextResponse.json({ error: "Property not found" }, { status: 404 });

  const today = new Date().toISOString().slice(0, 10);

  const resp = await notionPost("/pages", {
    parent: { database_id: NOTION_DBS.UPLOADS },
    properties: {
      "File Name": {
        title: [{ text: { content: fileName } }],
      },
      "File URL": {
        url: fileUrl,
      },
      "Property": {
        relation: [{ id: propertyId }],
      },
      "Upload Date": {
        date: { start: today },
      },
      "Status": {
        select: { name: "Pending Review" },
      },
      "Publish Status": {
        select: { name: "Published" },
      },
      ...(notes ? { "Notes": { rich_text: [{ text: { content: notes } }] } } : {}),
    },
  });

  if (!resp.ok) {
    const err = await resp.text();
    console.error("Notion create upload failed:", err);
    return NextResponse.json({ error: "Failed to record upload" }, { status: 502 });
  }

  const page = await resp.json() as { id: string };
  return NextResponse.json({ success: true, notionPageId: page.id });
}
