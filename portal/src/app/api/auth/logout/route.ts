import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const response = NextResponse.redirect(new URL("/portal/login", req.url));
  response.cookies.delete(COOKIE_NAME);
  return response;
}
