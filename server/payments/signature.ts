/**
 * Mercado Pago webhook signature (x-signature header).
 * Header: "ts=<timestamp>,v1=<hex HMAC-SHA256>". Signed manifest, with the parts that are present:
 *   id:<data.id>;request-id:<x-request-id>;ts:<ts>;
 * data.id comes from the notification URL query and is lowercased when alphanumeric.
 * Secret: "Clave secreta" of the Webhooks section in the Mercado Pago developer panel.
 */
import crypto from "crypto";

export interface SignatureInput {
  xSignature: string | undefined;
  xRequestId: string | undefined;
  dataId: string | undefined;
  secret: string;
}

export function parseSignatureHeader(header: string | undefined): { ts?: string; v1?: string } {
  const parts: Record<string, string> = {};
  for (const piece of (header || "").split(",")) {
    const index = piece.indexOf("=");
    if (index > 0) parts[piece.slice(0, index).trim()] = piece.slice(index + 1).trim();
  }
  return { ts: parts.ts, v1: parts.v1 };
}

export function signatureManifest(dataId: string | undefined, xRequestId: string | undefined, ts: string): string {
  let manifest = "";
  if (dataId) manifest += `id:${/^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId};`;
  if (xRequestId) manifest += `request-id:${xRequestId};`;
  return `${manifest}ts:${ts};`;
}

export function signManifest(manifest: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(manifest).digest("hex");
}

export function verifyWebhookSignature({ xSignature, xRequestId, dataId, secret }: SignatureInput): boolean {
  const { ts, v1 } = parseSignatureHeader(xSignature);
  if (!secret || !ts || !v1 || !/^[0-9a-f]{64}$/i.test(v1)) return false;
  const expected = Buffer.from(signManifest(signatureManifest(dataId, xRequestId, ts), secret), "hex");
  const received = Buffer.from(v1.toLowerCase(), "hex");
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

/** Builds a valid header (simulated Mercado Pago and tests). */
export function buildSignatureHeader(dataId: string, xRequestId: string, secret: string, ts = String(Date.now())): string {
  return `ts=${ts},v1=${signManifest(signatureManifest(dataId, xRequestId, ts), secret)}`;
}
