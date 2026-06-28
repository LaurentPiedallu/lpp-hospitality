import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest, ok, err } from "@/lib/api-helpers";
import { getClients, getClient } from "@/lib/notion-queries";

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    if (session.role === "admin") {
      return ok(await getClients());
    }
    // Non-admin: return only their own client record
    if (!session.clientId) return err("No client assigned to this account", 403);
    const client = await getClient(session.clientId);
    return ok(client ? [client] : []);
  } catch (e) {
    console.error("GET /api/data/clients", e);
    return err("Failed to fetch clients");
  }
}
