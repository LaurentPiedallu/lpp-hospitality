// Shared helpers for API route handlers

import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { COOKIE_NAME } from "./auth";
import type { SessionPayload } from "./auth";

const SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

export async function getSessionFromRequest(
  req: NextRequest
): Promise<SessionPayload | null> {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

// Verify the request is authenticated AND the requested clientId matches the
// session (or the session is admin). Returns the session or a 401/403 Response.
export async function requireClient(
  req: NextRequest,
  clientId: string
): Promise<SessionPayload | NextResponse> {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "admin" && session.clientId !== clientId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return session;
}

export function ok(data: unknown): NextResponse {
  return NextResponse.json(data);
}

export function err(message: string, status = 500): NextResponse {
  return NextResponse.json({ error: message }, { status });
}
