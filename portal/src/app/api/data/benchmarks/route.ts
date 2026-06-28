import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest, ok, err } from "@/lib/api-helpers";
import { getBenchmarks } from "@/lib/notion-queries";

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const concept = req.nextUrl.searchParams.get("concept") ?? undefined;

  try {
    return ok(await getBenchmarks(concept));
  } catch (e) {
    console.error("GET /api/data/benchmarks", e);
    return err("Failed to fetch benchmarks");
  }
}
