// Generates a presigned PUT URL for direct browser → R2 upload.
// The client PUTs the file to that URL, then calls /api/upload/complete.

import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/api-helpers";
import { getProperty } from "@/lib/notion-queries";

export const runtime = "edge";

// R2 presigning uses the S3-compatible API with AWS Signature V4.
// We implement it with the Web Crypto API (edge-compatible).

async function hmacSha256(key: ArrayBuffer, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(data: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
  return toHex(buf);
}

async function deriveSigningKey(
  secret: string, date: string, region: string, service: string
): Promise<ArrayBuffer> {
  const kDate    = await hmacSha256(new TextEncoder().encode("AWS4" + secret), date);
  const kRegion  = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  return hmacSha256(kService, "aws4_request");
}

async function presignPut(opts: {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  key: string;
  contentType: string;
  expiresIn: number; // seconds
}): Promise<string> {
  const { accountId, accessKeyId, secretAccessKey, bucket, key, contentType, expiresIn } = opts;
  const region  = "auto";
  const service = "s3";
  const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
  const host     = `${accountId}.r2.cloudflarestorage.com`;

  const now = new Date();
  const amzDate  = now.toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const credential = `${accessKeyId}/${credentialScope}`;

  const encodedKey = encodeURIComponent(key).replace(/%2F/g, "/");
  const url = `${endpoint}/${bucket}/${encodedKey}`;

  const params = new URLSearchParams({
    "X-Amz-Algorithm":     "AWS4-HMAC-SHA256",
    "X-Amz-Credential":    credential,
    "X-Amz-Date":          amzDate,
    "X-Amz-Expires":       String(expiresIn),
    "X-Amz-SignedHeaders": "content-type;host",
    "content-type":        contentType,
    "host":                host,
  });
  // Sort canonical query string
  const sortedParams = new URLSearchParams([...params.entries()].sort());

  const canonicalRequest = [
    "PUT",
    `/${bucket}/${encodedKey}`,
    sortedParams.toString(),
    `content-type:${contentType}\nhost:${host}\n`,
    "content-type;host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = await deriveSigningKey(secretAccessKey, dateStamp, region, service);
  const signature  = toHex(await hmacSha256(signingKey, stringToSign));

  sortedParams.set("X-Amz-Signature", signature);
  return `${url}?${sortedParams.toString()}`;
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || "status" in session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { clientId, propertyId, fileName, contentType } = await req.json() as {
    clientId: string;
    propertyId: string;
    fileName: string;
    contentType: string;
  };

  if (!clientId || !propertyId || !fileName || !contentType) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  // Client isolation + property ownership
  if (session.role !== "admin" && session.clientId !== clientId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const prop = await getProperty(propertyId, clientId);
  if (!prop) return NextResponse.json({ error: "Property not found" }, { status: 404 });

  const accountId      = (process.env.R2_ACCOUNT_ID ?? "").trim();
  const accessKeyId    = (process.env.R2_ACCESS_KEY_ID ?? "").trim();
  const secretKey      = (process.env.R2_SECRET_ACCESS_KEY ?? "").trim();
  const bucket         = (process.env.R2_BUCKET ?? "lpp-portal-uploads").trim();
  const publicBase     = (process.env.R2_PUBLIC_URL ?? "").trim();

  if (!accountId || !accessKeyId || !secretKey) {
    return NextResponse.json({ error: "Storage not configured" }, { status: 503 });
  }

  // Namespaced key: clientId/propertyId/timestamp-filename
  const ts  = Date.now();
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const key  = `${clientId}/${propertyId}/${ts}-${safe}`;

  const presignedUrl = await presignPut({
    accountId, accessKeyId, secretAccessKey: secretKey,
    bucket, key, contentType, expiresIn: 300,
  });

  const publicUrl = publicBase
    ? `${publicBase.replace(/\/$/, "")}/${key}`
    : null;

  return NextResponse.json({ presignedUrl, key, publicUrl });
}
