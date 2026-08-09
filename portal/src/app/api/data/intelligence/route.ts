import { NextRequest, NextResponse } from "next/server";
import { requireClient, ok, err } from "@/lib/api-helpers";
import { getIntelligence, getProperty } from "@/lib/notion-queries";

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
    // Client-authenticated (requireClient above) — must not leak internal
    // Data Quality findings or individual-staff-named records over the API
    // any more than the pages that read this same data are allowed to.
    return ok(await getIntelligence(propertyId, { clientVisibleOnly: true }));
  } catch (e) {
    console.error("GET /api/data/intelligence", e);
    return err("Failed to fetch intelligence");
  }
}
