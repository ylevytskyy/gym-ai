/**
 * RevenueCat webhook endpoint: signature, status codes and what reaches the database seam.
 * See docs/revenuecat-webhook-spec.md. The database function is tested in supabase/tests.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

vi.hoisted(() => {
  process.env.LOG_LEVEL = 'silent';
});

import { createHmac } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp, type AppDeps } from '../src/api/server';
import { DatabaseError, type Assistant, type RevenueCatDbOutcome } from '../src/types';

const SECRET = 'whsec_test';
const USER = '11111111-0000-4000-8000-000000000001';
const NOW = Date.parse('2026-11-14T12:00:00Z');
const FUTURE = NOW + 30 * 24 * 3600 * 1000;

function makeDeps(overrides: Partial<AppDeps> = {}): AppDeps {
  return {
    assistant: { generatePlan: vi.fn(), adjustPlan: vi.fn(), chat: vi.fn() } as unknown as Assistant,
    authenticate: vi.fn(async () => 'user-1'),
    loadProfile: vi.fn(),
    storePlan: vi.fn(),
    loadActivePlan: vi.fn(),
    loadMessages: vi.fn(),
    storeMessages: vi.fn(),
    addInjuries: vi.fn(),
    archivePlans: vi.fn(),
    deleteAccount: vi.fn(),
    reserveUse: vi.fn(),
    finishUse: vi.fn(),
    applyRevenueCatEvent: vi.fn(async (): Promise<RevenueCatDbOutcome> => 'applied'),
    revenuecat: { webhookSecret: SECRET, acceptSandbox: false, proEntitlement: 'pro' },
    now: () => NOW,
    ...overrides,
  } as AppDeps;
}

let server: Server | undefined;
afterEach(() => {
  server?.close();
});

async function start(deps: AppDeps) {
  const listening = createApp(deps).listen(0, '127.0.0.1');
  server = listening;
  await new Promise<void>((resolve) => listening.once('listening', () => resolve()));
  return `http://127.0.0.1:${(listening.address() as AddressInfo).port}`;
}

const purchase = {
  id: 'evt-1',
  type: 'INITIAL_PURCHASE',
  environment: 'PRODUCTION',
  app_user_id: USER,
  event_timestamp_ms: NOW - 1000,
  entitlement_ids: ['pro'],
  expiration_at_ms: FUTURE,
};

function signed(body: string, t = Math.floor(NOW / 1000), secret = SECRET): Record<string, string> {
  const v1 = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  return { 'x-revenuecat-webhook-signature': `t=${t},v1=${v1}` };
}

function send(base: string, event: unknown, headers?: Record<string, string>, rawBody?: string) {
  const body = rawBody ?? JSON.stringify({ api_version: '1.0', event });
  return fetch(`${base}/api/webhooks/revenuecat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(headers ?? signed(body)) },
    body,
  });
}

describe('POST /api/webhooks/revenuecat', () => {
  it('returns 200 {outcome: applied} for a correctly signed purchase and passes the mapped event to the database', async () => {
    const deps = makeDeps();
    const res = await send(await start(deps), purchase);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ outcome: 'applied' });
    expect(deps.applyRevenueCatEvent).toHaveBeenCalledWith({
      eventId: 'evt-1',
      eventType: 'INITIAL_PURCHASE',
      environment: 'PRODUCTION',
      userId: USER,
      eventAt: new Date(NOW - 1000).toISOString(),
      action: 'set_expiry',
      expiresAt: new Date(FUTURE).toISOString(),
    });
  });

  it('returns 401 and writes nothing for a missing, wrong, or 6-minute-old signature', async () => {
    const deps = makeDeps();
    const base = await start(deps);
    const body = JSON.stringify({ event: purchase });
    const bad: Array<Record<string, string>> = [
      {},
      { 'x-revenuecat-webhook-signature': 'nonsense' },
      signed(body, Math.floor(NOW / 1000), 'wrong-secret'),
      signed(body, Math.floor(NOW / 1000) - 6 * 60),
    ];
    for (const headers of bad) {
      const res = await send(base, purchase, headers, body);
      expect(res.status).toBe(401);
    }
    expect(deps.applyRevenueCatEvent).not.toHaveBeenCalled();
  });

  it('rejects a body that was changed after signing', async () => {
    const deps = makeDeps();
    const base = await start(deps);
    const original = JSON.stringify({ event: purchase });
    const tampered = JSON.stringify({ event: { ...purchase, expiration_at_ms: FUTURE + 1 } });
    const res = await send(base, purchase, signed(original), tampered);
    expect(res.status).toBe(401);
    expect(deps.applyRevenueCatEvent).not.toHaveBeenCalled();
  });

  it('verifies the exact raw bytes, not a re-serialised body', async () => {
    const deps = makeDeps();
    const raw = `{ "event" :   ${JSON.stringify(purchase)}  }\n`;
    const res = await send(await start(deps), purchase, signed(raw), raw);
    expect(res.status).toBe(200);
  });

  it('returns 503 when REVENUECAT_WEBHOOK_SECRET is not set, and does not call the database', async () => {
    const deps = makeDeps({ revenuecat: { acceptSandbox: false, proEntitlement: 'pro' } });
    const res = await send(await start(deps), purchase);
    expect(res.status).toBe(503);
    expect(deps.applyRevenueCatEvent).not.toHaveBeenCalled();
  });

  it('returns 503 when the app is built without the webhook configuration at all', async () => {
    const deps = makeDeps({ revenuecat: undefined });
    expect((await send(await start(deps), purchase)).status).toBe(503);
  });

  it('returns 400 for a correctly signed body that is not JSON', async () => {
    const deps = makeDeps();
    const raw = 'this is not json';
    const res = await send(await start(deps), null, signed(raw), raw);
    expect(res.status).toBe(400);
    expect(deps.applyRevenueCatEvent).not.toHaveBeenCalled();
  });

  it('returns 400 for signed JSON that has no event with an id, user and time', async () => {
    const deps = makeDeps();
    const base = await start(deps);
    for (const event of [null, 'x', { ...purchase, id: undefined }, { ...purchase, event_timestamp_ms: 'soon' }, { ...purchase, app_user_id: undefined }]) {
      expect((await send(base, event)).status).toBe(400);
    }
    expect(deps.applyRevenueCatEvent).not.toHaveBeenCalled();
  });

  it('returns 400 for an event time beyond the range a Date holds, instead of a 500 that RevenueCat would retry', async () => {
    const deps = makeDeps();
    const base = await start(deps);
    expect((await send(base, { ...purchase, event_timestamp_ms: 1e20 })).status).toBe(400);
    expect(deps.applyRevenueCatEvent).not.toHaveBeenCalled();
  });

  it.each<RevenueCatDbOutcome>(['duplicate', 'stale', 'unknown_user'])('returns 200 {outcome: %s} when the database says so', async (outcome) => {
    const deps = makeDeps({ applyRevenueCatEvent: vi.fn(async () => outcome) });
    const res = await send(await start(deps), purchase);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ outcome });
  });

  it('returns 200 {outcome: ignored} for an event that changes nothing (a plain cancel)', async () => {
    const deps = makeDeps();
    const res = await send(await start(deps), { ...purchase, type: 'CANCELLATION', cancel_reason: 'UNSUBSCRIBE' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ outcome: 'ignored' });
    expect(deps.applyRevenueCatEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'none' }));
  });

  it('sends a refund as a revoke and an expiration as a revoke', async () => {
    const deps = makeDeps();
    const base = await start(deps);
    await send(base, { ...purchase, id: 'r', type: 'CANCELLATION', cancel_reason: 'CUSTOMER_SUPPORT' });
    await send(base, { ...purchase, id: 'x', type: 'EXPIRATION' });
    expect(deps.applyRevenueCatEvent).toHaveBeenNthCalledWith(1, expect.objectContaining({ eventId: 'r', action: 'revoke', expiresAt: null }));
    expect(deps.applyRevenueCatEvent).toHaveBeenNthCalledWith(2, expect.objectContaining({ eventId: 'x', action: 'revoke', expiresAt: null }));
  });

  it('ignores a SANDBOX event unless sandbox is accepted, and applies it when it is', async () => {
    const sandbox = { ...purchase, environment: 'SANDBOX' };
    const off = makeDeps();
    const resOff = await send(await start(off), sandbox);
    expect(resOff.status).toBe(200);
    expect(await resOff.json()).toEqual({ outcome: 'sandbox_ignored' });
    expect(off.applyRevenueCatEvent).not.toHaveBeenCalled();
    server?.close();

    const on = makeDeps({ revenuecat: { webhookSecret: SECRET, acceptSandbox: true, proEntitlement: 'pro' } });
    const resOn = await send(await start(on), sandbox);
    expect(await resOn.json()).toEqual({ outcome: 'applied' });
    expect(on.applyRevenueCatEvent).toHaveBeenCalledWith(expect.objectContaining({ environment: 'SANDBOX', action: 'set_expiry' }));
  });

  it('uses the configured Pro entitlement id', async () => {
    const deps = makeDeps({ revenuecat: { webhookSecret: SECRET, acceptSandbox: false, proEntitlement: 'premium' } });
    const base = await start(deps);
    expect(await (await send(base, purchase)).json()).toEqual({ outcome: 'ignored' });
    expect(await (await send(base, { ...purchase, id: 'e2', entitlement_ids: ['premium'] })).json()).toEqual({ outcome: 'applied' });
  });

  it('answers unknown_user without a database call when app_user_id is not a UUID (an anonymous RevenueCat id)', async () => {
    const deps = makeDeps();
    const res = await send(await start(deps), { ...purchase, app_user_id: '$RCAnonymousID:abc123' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ outcome: 'unknown_user' });
    expect(deps.applyRevenueCatEvent).not.toHaveBeenCalled();
  });

  it('returns 500 when the database call fails, so RevenueCat retries', async () => {
    const deps = makeDeps({
      applyRevenueCatEvent: vi.fn(async () => {
        throw new DatabaseError('Failed to apply a RevenueCat event', 'applyRevenueCatEvent');
      }),
    });
    const res = await send(await start(deps), purchase);
    expect(res.status).toBe(500);
  });

  it('does not use the user login: no Authorization header is needed or read', async () => {
    const deps = makeDeps();
    await send(await start(deps), purchase);
    expect(deps.authenticate).not.toHaveBeenCalled();
  });

  it('leaves JSON parsing for the other routes working', async () => {
    const deps = makeDeps();
    const base = await start(deps);
    const res = await fetch(`${base}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer x' }, body: '{bad' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('INVALID_JSON');
  });
});
