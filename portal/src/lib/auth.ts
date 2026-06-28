import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const SECRET = new TextEncoder().encode(process.env.JWT_SECRET);
const COOKIE = "lpp_session";
const SESSION_DAYS = 30;

export type SessionPayload = {
  email: string;
  clientId: string | null; // null = LPP Admin (sees all)
  role: "admin" | "executive" | "manager";
};

export async function createSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(SECRET);
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export function setSessionCookie(token: string): void {
  // Called from API routes via Response headers
  // Cookie is set httpOnly, Secure, SameSite=Lax
  void token; // actual set happens in route handler
}

export const COOKIE_NAME = COOKIE;
export const SESSION_MAX_AGE = SESSION_DAYS * 24 * 60 * 60;

// LPP Admin email — sees all clients
export const ADMIN_EMAIL = "laurent@lpphospitality.com";
