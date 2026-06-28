// Triggers a Make automation webhook that runs Claude analysis
// for a given property and writes the results back to the Notion
// Intelligence database. The portal itself never calls Claude directly —
// Make owns the orchestration.

import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/api-helpers";
import { getProperty, getIntelligence } from "@/lib/notion-queries";
import { isRateLimited, RATE_LIMIT_MINUTES } from "@/lib/analysis-config";

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || "status" in session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { clientId, propertyId, category } = await req.json() as {
    clientId: string;
    propertyId: string;
    category?: string; // optional — if omitted, Make runs analysis for all categories
  };

  if (!clientId || !propertyId) {
    return NextResponse.json({ error: "clientId and propertyId are required" }, { status: 400 });
  }

  // Client isolation + property ownership
  if (session.role !== "admin" && session.clientId !== clientId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const prop = await getProperty(propertyId, clientId);
  if (!prop) return NextResponse.json({ error: "Property not found" }, { status: 404 });

  // Rate limit: non-admin users cannot re-request the same category within RATE_LIMIT_MINUTES.
  if (session.role !== "admin" && category && category !== "all") {
    const existing = await getIntelligence(propertyId);
    const recentMatch = existing.find(
      (i) => i.category === category && isRateLimited(i.createdAt)
    );
    if (recentMatch) {
      const ageMin = Math.floor((Date.now() - new Date(recentMatch.createdAt!).getTime()) / 60_000);
      const waitMin = RATE_LIMIT_MINUTES - ageMin;
      return NextResponse.json(
        { error: `Analysis for ${category} was run ${ageMin} min ago. Try again in ${waitMin} min.` },
        { status: 429 }
      );
    }
  }

  const webhookUrl = process.env.MAKE_WEBHOOK_URL;
  if (!webhookUrl) {
    return NextResponse.json(
      { error: "AI analysis is not configured yet. Contact your LPP team." },
      { status: 503 }
    );
  }

  const payload = {
    clientId,
    propertyId,
    category: category ?? "all",
    requestedBy: session.email,
    requestedAt: new Date().toISOString(),
  };

  const resp = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    console.error("Make webhook failed:", resp.status, await resp.text().catch(() => ""));
    return NextResponse.json(
      { error: "Failed to trigger analysis. Please try again." },
      { status: 502 }
    );
  }

  return NextResponse.json({
    success: true,
    message: "Analysis requested. Commentary will update within a few minutes.",
  });
}
