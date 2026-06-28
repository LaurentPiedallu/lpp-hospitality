import { NextRequest, NextResponse } from "next/server";
import { requireClient, ok, err } from "@/lib/api-helpers";
import { getInitiatives, getProperty } from "@/lib/notion-queries";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get("clientId");
  const propertyId = req.nextUrl.searchParams.get("propertyId");
  if (!clientId || !propertyId) {
    return NextResponse.json({ error: "clientId and propertyId are required" }, { status: 400 });
  }
  const auth = await requireClient(req, clientId);
  if (auth instanceof NextResponse) return auth;

  const property = await getProperty(propertyId, clientId);
  if (!property) return err("Property not found", 404);

  try {
    return ok(await getInitiatives(propertyId));
  } catch (e) {
    console.error("GET /api/data/initiatives", e);
    return err("Failed to fetch initiatives");
  }
}
