import { NextRequest, NextResponse } from "next/server";
import { requireClient, ok, err } from "@/lib/api-helpers";
import { getBriefs } from "@/lib/notion-queries";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get("clientId");
  if (!clientId) {
    return NextResponse.json({ error: "clientId is required" }, { status: 400 });
  }
  const auth = await requireClient(req, clientId);
  if (auth instanceof NextResponse) return auth;

  try {
    return ok(await getBriefs(clientId));
  } catch (e) {
    console.error("GET /api/data/briefs", e);
    return err("Failed to fetch briefs");
  }
}
