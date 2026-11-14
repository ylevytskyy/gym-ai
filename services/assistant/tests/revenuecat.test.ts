/**
 * RevenueCat webhook: signature check and the mapping from event to entitlement action.
 * See docs/revenuecat-webhook-spec.md.
 */

import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { mapEvent, verifySignature } from '../src/revenuecat';

const secret = 'whsec_test';
const NOW = Date.parse('2026-11-14T12:00:00Z');
const nowSec = Math.floor(NOW / 1000);

function sign(body: Buffer, t: number, key = secret): string {
  return `t=${t},v1=${createHmac('sha256', key).update(`${t}.`).update(body).digest('hex')}`;
}

describe('verifySignature', () => {
  const body = Buffer.from('{"event":{"id":"e1"}}');

  it('accepts a correct signature with a fresh timestamp', () => {
    expect(verifySignature(body, sign(body, nowSec), secret, NOW)).toBe(true);
  });

  it('matches the documented construction: HMAC-SHA256 over "<t>.<raw body>", hex', () => {
    const expected = createHmac('sha256', secret).update(`${nowSec}.${body.toString('utf8')}`).digest('hex');
    expect(verifySignature(body, `t=${nowSec},v1=${expected}`, secret, NOW)).toBe(true);
  });

  it('rejects a missing or malformed header', () => {
    for (const header of [undefined, '', 'garbage', `t=${nowSec}`, `v1=abcd`, `t=abc,v1=abcd`, `t=${nowSec},v1=`]) {
      expect(verifySignature(body, header, secret, NOW)).toBe(false);
    }
  });

  it('rejects a wrong secret, a changed body, and a wrong-length or non-hex digest', () => {
    expect(verifySignature(body, sign(body, nowSec, 'other'), secret, NOW)).toBe(false);
    expect(verifySignature(Buffer.from('{"event":{"id":"e2"}}'), sign(body, nowSec), secret, NOW)).toBe(false);
    expect(verifySignature(body, `t=${nowSec},v1=abcd`, secret, NOW)).toBe(false);
    expect(verifySignature(body, `t=${nowSec},v1=${'z'.repeat(64)}`, secret, NOW)).toBe(false);
  });

  it('rejects a timestamp more than 5 minutes from now, either way, and accepts one just inside', () => {
    expect(verifySignature(body, sign(body, nowSec - 6 * 60), secret, NOW)).toBe(false);
    expect(verifySignature(body, sign(body, nowSec + 6 * 60), secret, NOW)).toBe(false);
    expect(verifySignature(body, sign(body, nowSec - 4 * 60), secret, NOW)).toBe(true);
  });

  it('accepts when one of several v1 values is right', () => {
    const good = sign(body, nowSec);
    expect(verifySignature(body, `${good},v1=${'0'.repeat(64)}`, secret, NOW)).toBe(true);
  });
});

describe('mapEvent', () => {
  const options = { acceptSandbox: false, proEntitlement: 'pro', nowMs: NOW };
  const future = NOW + 30 * 24 * 3600 * 1000;
  const base = { id: 'e1', event_timestamp_ms: NOW - 1000, app_user_id: 'u', environment: 'PRODUCTION', entitlement_ids: ['pro'], expiration_at_ms: future };

  it.each(['INITIAL_PURCHASE', 'RENEWAL', 'PRODUCT_CHANGE', 'UNCANCELLATION', 'REFUND_REVERSED'])('%s grants Pro until expiration_at_ms', (type) => {
    expect(mapEvent({ ...base, type }, options)).toEqual({ action: 'set_expiry', expiresAt: new Date(future).toISOString(), eventType: type });
  });

  it('does not grant when the Pro entitlement is not among entitlement_ids', () => {
    expect(mapEvent({ ...base, type: 'INITIAL_PURCHASE', entitlement_ids: ['gold'] }, options).action).toBe('none');
    expect(mapEvent({ ...base, type: 'INITIAL_PURCHASE', entitlement_ids: null }, options).action).toBe('none');
    expect(mapEvent({ ...base, type: 'INITIAL_PURCHASE', entitlement_ids: ['gold'] }, { ...options, proEntitlement: 'gold' }).action).toBe('set_expiry');
  });

  it('does not grant when expiration_at_ms is missing, invalid or not in the future', () => {
    for (const expiration_at_ms of [undefined, null, 'x', NaN, NOW, NOW - 1]) {
      expect(mapEvent({ ...base, type: 'RENEWAL', expiration_at_ms }, options).action).toBe('none');
    }
  });

  it('does not grant, and does not throw, when expiration_at_ms is beyond the range a Date holds', () => {
    expect(mapEvent({ ...base, type: 'RENEWAL', expiration_at_ms: 1e20 }, options).action).toBe('none');
    expect(mapEvent({ ...base, type: 'RENEWAL', expiration_at_ms: -1e20 }, options).action).toBe('none');
  });

  it('treats a CANCELLATION with CUSTOMER_SUPPORT (a refund) as a revoke', () => {
    expect(mapEvent({ ...base, type: 'CANCELLATION', cancel_reason: 'CUSTOMER_SUPPORT' }, options)).toEqual({ action: 'revoke', expiresAt: null, eventType: 'CANCELLATION' });
  });

  it('leaves other cancellations alone', () => {
    for (const cancel_reason of ['UNSUBSCRIBE', 'BILLING_ERROR', 'DEVELOPER_INITIATED', 'PRICE_INCREASE', 'UNKNOWN', undefined]) {
      expect(mapEvent({ ...base, type: 'CANCELLATION', cancel_reason }, options).action).toBe('none');
    }
  });

  it('treats EXPIRATION as a revoke', () => {
    expect(mapEvent({ ...base, type: 'EXPIRATION', expiration_reason: 'UNSUBSCRIBE' }, options).action).toBe('revoke');
  });

  it('changes nothing for BILLING_ISSUE, TEST, TRANSFER and unknown types', () => {
    for (const type of ['BILLING_ISSUE', 'TEST', 'TRANSFER', 'SUBSCRIBER_ALIAS', 'SOMETHING_NEW', undefined, 5]) {
      expect(mapEvent({ ...base, type }, options).action).toBe('none');
    }
  });

  it('ignores SANDBOX events unless sandbox is accepted', () => {
    const sandbox = { ...base, type: 'INITIAL_PURCHASE', environment: 'SANDBOX' };
    expect(mapEvent(sandbox, options).action).toBe('sandbox_ignored');
    expect(mapEvent(sandbox, { ...options, acceptSandbox: true }).action).toBe('set_expiry');
  });

  it('does not act on an unknown environment', () => {
    expect(mapEvent({ ...base, type: 'INITIAL_PURCHASE', environment: 'STAGING' }, { ...options, acceptSandbox: true }).action).toBe('none');
  });
});
