import { NextRequest, NextResponse } from "next/server";
import { SignJWT } from "jose";

const SECRET = new TextEncoder().encode(process.env.JWT_SECRET);
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://lpphospitality.com";

export async function POST(req: NextRequest) {
  const { email } = await req.json();

  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  // Build a short-lived token (15 min) that encodes the email
  const token = await new SignJWT({ email, type: "magic-link" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(SECRET);

  const magicLink = `${SITE_URL}/portal/api/auth/verify?token=${token}`;

  // Send via Resend
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "LPP Hospitality Portal <portal@lpphospitality.com>",
      to: [email],
      subject: "Your sign-in link — LPP Hospitality Portal",
      html: `
        <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;padding:40px 24px;color:#111">
          <p style="font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#9ca3af;margin-bottom:8px">LPP Hospitality</p>
          <h1 style="font-size:22px;font-weight:600;margin:0 0 16px">Sign in to your portal</h1>
          <p style="font-size:14px;color:#6b7280;margin-bottom:28px">
            Click the button below to sign in. This link expires in 15 minutes.
          </p>
          <a href="${magicLink}"
             style="display:inline-block;background:#111827;color:#fff;font-size:14px;font-weight:500;padding:12px 24px;border-radius:8px;text-decoration:none">
            Sign in to Portal
          </a>
          <p style="font-size:12px;color:#9ca3af;margin-top:32px">
            If you didn't request this, you can safely ignore this email.
          </p>
        </div>
      `,
    }),
  });

  if (!res.ok) {
    return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
