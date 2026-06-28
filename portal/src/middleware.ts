import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(process.env.JWT_SECRET);
const COOKIE = "lpp_session";

// Routes that don't require a session
const PUBLIC_PATHS = ["/login", "/api/auth/send-magic-link", "/api/auth/verify"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (isPublic) return NextResponse.next();

  // /api/auth/logout is public (clears the cookie)
  if (pathname === "/api/auth/logout") return NextResponse.next();

  const token = req.cookies.get(COOKIE)?.value;

  if (!token) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  try {
    await jwtVerify(token, SECRET);
    return NextResponse.next();
  } catch {
    // Expired or tampered token — clear it and send to login
    const res = NextResponse.redirect(new URL("/login?error=session-expired", req.url));
    res.cookies.delete(COOKIE);
    return res;
  }
}

export const config = {
  // Run on every route except Next.js internals and static files
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png|.*\\.jpg|.*\\.svg).*)"],
};
