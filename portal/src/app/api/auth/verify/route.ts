import { NextRequest, NextResponse } from "next/server";
import { jwtVerify, SignJWT } from "jose";
import { ADMIN_EMAIL, COOKIE_NAME, SESSION_MAX_AGE } from "@/lib/auth";
import type { SessionPayload } from "@/lib/auth";
import { NOTION_DBS } from "@/lib/notion-ids";

const SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

// Look up the client record in Notion whose "Contact Email" matches this email.
// Returns the Notion page ID (used as clientId throughout the portal).
async function lookupClientId(email: string): Promise<string | null> {
  const res = await fetch(
    `https://api.notion.com/v1/databases/${NOTION_DBS.CLIENTS}/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filter: {
          property: "Primary Contact Email",
          email: { equals: email },
        },
        page_size: 1,
      }),
    }
  );

  if (!res.ok) return null;

  const data = (await res.json()) as { results: { id: string }[] };
  return data.results[0]?.id ?? null;
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(new URL("/login?error=missing-token", req.url));
  }

  let email: string;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    if (payload.type !== "magic-link" || typeof payload.email !== "string") {
      throw new Error("Invalid token shape");
    }
    email = payload.email;
  } catch {
    return NextResponse.redirect(new URL("/login?error=invalid-token", req.url));
  }

  const isAdmin = email.toLowerCase() === ADMIN_EMAIL.toLowerCase();

  let clientId: string | null = null;
  let role: SessionPayload["role"] = "executive";

  if (isAdmin) {
    role = "admin";
    clientId = null; // admin sees all clients
  } else {
    clientId = await lookupClientId(email);
    // If no client record found, deny access
    if (!clientId) {
      return NextResponse.redirect(new URL("/login?error=no-access", req.url));
    }
    role = "executive";
  }

  const sessionPayload: SessionPayload = { email, clientId, role };

  const sessionToken = await new SignJWT({ ...sessionPayload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(SECRET);

  const destination = isAdmin ? "/dashboard" : `/dashboard`;
  const response = NextResponse.redirect(new URL(destination, req.url));
  response.cookies.set(COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });

  return response;
}
