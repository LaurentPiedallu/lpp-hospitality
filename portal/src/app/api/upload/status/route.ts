// Polled by the client while a file is processing — reads a single Upload
// record's Processing Status by ID so the Upload page can reflect the real
// backend state instead of a fixed-duration spinner.

import { NextRequest, NextResponse } from "next/server";
import { requireClient } from "@/lib/api-helpers";
import { getPage, select, relationId } from "@/lib/notion-fetch";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const clientId = searchParams.get("clientId");

  if (!id || !clientId) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const session = await requireClient(req, clientId);
  if (session instanceof NextResponse) return session;

  let page;
  try {
    page = await getPage(id);
  } catch (err) {
    console.error("Upload status fetch failed:", err);
    return NextResponse.json({ error: "Upload not found" }, { status: 404 });
  }

  // requireClient only confirms the caller may act as clientId — also confirm
  // the fetched record actually belongs to that client before revealing it.
  if (session.role !== "admin" && relationId(page, "Client") !== clientId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ status: select(page, "Processing Status") });
}
