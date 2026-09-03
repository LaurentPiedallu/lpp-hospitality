// Toggles an Action's Status between "Not Started" and "Complete" in Notion.
// This is the only Action field the portal can currently write.

import { NextRequest, NextResponse } from "next/server";
import { requireClient } from "@/lib/api-helpers";
import { getProperty, getActions, updateActionStatus } from "@/lib/notion-queries";
import { authorizeActionWrite } from "@/lib/action-authz";
import type { Action } from "@/types/portal";

const ALLOWED_STATUSES: Action["status"][] = ["Not Started", "Complete"];

export async function POST(req: NextRequest) {
  const { clientId, propertyId, actionId, status } = await req.json() as {
    clientId?: string;
    propertyId?: string;
    actionId?: string;
    status?: string;
  };

  if (!clientId || !propertyId || !actionId || !status) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  if (!ALLOWED_STATUSES.includes(status as Action["status"])) {
    return NextResponse.json({ error: "Status must be 'Not Started' or 'Complete'" }, { status: 400 });
  }

  const session = await requireClient(req, clientId);
  if (session instanceof NextResponse) return session;

  const property = await getProperty(propertyId, clientId);
  if (!property) {
    return NextResponse.json({ error: "Property not found" }, { status: 404 });
  }

  // getActions returns the property's Published Actions with the current
  // Client Visible flag straight from Notion. Gate the write on it: a
  // forged request naming a real-but-hidden Action must not succeed even
  // though the propertyId check above passed.
  const actions = await getActions(propertyId);
  const authz = authorizeActionWrite(actions, actionId);
  if (!authz.ok) {
    return NextResponse.json({ error: authz.error }, { status: authz.status });
  }

  try {
    const confirmedStatus = await updateActionStatus(actionId, status as Action["status"]);
    return NextResponse.json({ success: true, status: confirmedStatus });
  } catch (e) {
    console.error("Notion action status update failed:", e);
    return NextResponse.json({ error: "Failed to update action" }, { status: 502 });
  }
}
