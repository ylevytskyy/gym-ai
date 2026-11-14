/**
 * RevenueCat webhook signature: header `X-RevenueCat-Webhook-Signature: t=<unix>,v1=<hex>`,
 * HMAC-SHA256 over `<t>.<raw body>`. See docs/revenuecat-webhook-spec.md.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

const MAX_SKEW_MS = 5 * 60_000;

/**
 * True when the header carries a v1 signature that matches the raw body and a timestamp within
 * 5 minutes of now. Never throws; anything unexpected is a failed check.
 */
export function verifySignature(rawBody: Buffer, header: string | undefined, secret: string, nowMs: number): boolean {
  if (!header || !secret) return false;

  let t: string | undefined;
  const candidates: string[] = [];
  for (const part of header.split(',')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === 't' && t === undefined) t = value;
    else if (key === 'v1') candidates.push(value);
  }
  if (t === undefined || !/^\d{1,15}$/.test(t) || candidates.length === 0) return false;
  if (Math.abs(nowMs - Number(t) * 1000) > MAX_SKEW_MS) return false;

  const expected = createHmac('sha256', secret).update(`${t}.`).update(rawBody).digest();
  let ok = false;
  for (const candidate of candidates) {
    if (!/^[0-9a-fA-F]{64}$/.test(candidate)) continue;
    // Equal-length buffers: timingSafeEqual throws on different lengths.
    if (timingSafeEqual(Buffer.from(candidate, 'hex'), expected)) ok = true;
  }
  return ok;
}
