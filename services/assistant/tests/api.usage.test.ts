/**
 * AI usage limits on the HTTP API: every model request is counted before the model is called,
 * refused at the limit, and released when it fails. See docs/usage-limits-spec.md.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

vi.hoisted(() => {
  process.env.LOG_LEVEL = 'silent';
});

import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp, type AppDeps } from '../src/api/server';
import { APIError, AuthenticationError, DatabaseError, type Assistant, type Profile, type UsageDecision, type WorkoutPlan } from '../src/types';

const profile: Profile = {
  id: 'user-1',
  age_range: '25-34',
  weight_kg: 70,
  goal: 'move_more',
  fitness_level: 1,
  injuries: [],
  minutes_per_day: 15,
  language: 'en',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const plan: WorkoutPlan = {
  schema_version: '1.0.0',
  id: '6f1c2c1e-6a1e-4b8a-9d55-2f6e1f0a7b11',
  created_at: '2026-01-10T09:00:00Z',
  goal: 'move_more',
  notes: 'test',
  days: [{ day: 1, title: 'Core', minutes: 10, blocks: [{ type: 'main', items: [{ exercise_id: 'plank', sets: 2, amount: 30 }] }] }],
};

const allowed: UsageDecision = { allowed: true, duplicate: false, useId: 'use-1', tier: 'free', limit: 10, remaining: 2, resetsAt: '2026-11-13T22:00:00.000Z' };
const refused: UsageDecision = { allowed: false, duplicate: false, useId: null, tier: 'free', limit: 10, remaining: 0, resetsAt: '2026-11-13T22:00:00.000Z' };

function makeDeps(overrides: Partial<AppDeps> = {}): AppDeps {
  return {
    assistant: {
      generatePlan: vi.fn(async () => plan),
      adjustPlan: vi.fn(async () => plan),
      chat: vi.fn(async () => ({ reply: 'ok' })),
    } satisfies Assistant,
    authenticate: vi.fn(async (req: any) => {
      if (req.headers.authorization === 'Bearer good') return 'user-1';
      throw new AuthenticationError();
    }),
    loadProfile: vi.fn(async () => profile),
    storePlan: vi.fn(async () => 'plan-1'),
    loadActivePlan: vi.fn(async () => ({ id: 'plan-0', plan })),
    loadMessages: vi.fn(async () => []),
    storeMessages: vi.fn(async () => undefined),
    addInjuries: vi.fn(async () => profile),
    archivePlans: vi.fn(async () => undefined),
    deleteAccount: vi.fn(async () => undefined),
    reserveUse: vi.fn(async () => allowed),
    finishUse: vi.fn(async () => undefined),
    requestTimeoutMs: 1000,
    ...overrides,
  };
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

const endpoints = [
  { path: '/api/chat', body: { message: 'hi' }, action: 'chat_message', model: 'chat' as const },
  { path: '/api/plans/generate', body: { duration_days: 3, focus_areas: ['core'] }, action: 'new_plan', model: 'generatePlan' as const },
  { path: '/api/plans/adjust', body: { feedback: 'easier please' }, action: 'new_plan', model: 'adjustPlan' as const },
];

function post(base: string, path: string, body: unknown, headers: Record<string, string> = {}) {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer good', ...headers },
    body: JSON.stringify(body),
  });
}

describe.each(endpoints)('$path usage limits', ({ path, body, action, model }) => {
  it(`counts the request as ${action} before calling the model, and marks it used on success`, async () => {
    const deps = makeDeps();
    const base = await start(deps);
    const res = await post(base, path, body);
    expect(res.status).toBeLessThan(300);
    expect(deps.reserveUse).toHaveBeenCalledWith('user-1', action, expect.any(String));
    const reserveOrder = (deps.reserveUse as any).mock.invocationCallOrder[0];
    const modelOrder = (deps.assistant[model] as any).mock.invocationCallOrder[0];
    expect(reserveOrder).toBeLessThan(modelOrder);
    expect(deps.finishUse).toHaveBeenCalledWith('use-1', true);
    expect((await res.json()).usage).toEqual({ tier: 'free', limit: 10, remaining: 2, resetsAt: '2026-11-13T22:00:00.000Z' });
  });

  it('refuses with 429 USAGE_LIMIT at the limit and never calls the model', async () => {
    const deps = makeDeps({ reserveUse: vi.fn(async () => refused) });
    const base = await start(deps);
    const res = await post(base, path, body);
    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.error).toBe('USAGE_LIMIT');
    expect(json.details).toEqual({ tier: 'free', limit: 10, remaining: 0, resetsAt: '2026-11-13T22:00:00.000Z' });
    expect(deps.assistant[model]).not.toHaveBeenCalled();
    expect(deps.finishUse).not.toHaveBeenCalled();
  });

  it('releases the use when the model call fails, so a failure does not count', async () => {
    const deps = makeDeps();
    (deps.assistant[model] as any).mockRejectedValue(new APIError('upstream down', 'openrouter', 502));
    const base = await start(deps);
    const res = await post(base, path, body);
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(deps.finishUse).toHaveBeenCalledWith('use-1', false);
    expect(deps.finishUse).not.toHaveBeenCalledWith('use-1', true);
  });

  it('refuses a replayed request with 409 DUPLICATE_REQUEST and never calls the model', async () => {
    const deps = makeDeps({ reserveUse: vi.fn(async () => ({ ...allowed, allowed: false, duplicate: true })) });
    const base = await start(deps);
    const res = await post(base, path, body, { 'idempotency-key': 'key-1' });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('DUPLICATE_REQUEST');
    expect(deps.assistant[model]).not.toHaveBeenCalled();
    expect(deps.finishUse).not.toHaveBeenCalled();
  });

  it('counts the use once the model has answered, even if storing the result then fails', async () => {
    const deps = makeDeps({ storePlan: vi.fn(async () => Promise.reject(new DatabaseError('down', 'savePlan'))), storeMessages: vi.fn(async () => Promise.reject(new DatabaseError('down', 'saveMessages'))) });
    const base = await start(deps);
    await post(base, path, body);
    expect(deps.assistant[model]).toHaveBeenCalled();
    expect(deps.finishUse).toHaveBeenCalledWith('use-1', true);
    expect(deps.finishUse).not.toHaveBeenCalledWith('use-1', false);
  });

  it('fails closed with 503 when the usage store cannot be reached', async () => {
    const deps = makeDeps({ reserveUse: vi.fn(async () => Promise.reject(new DatabaseError('down', 'reserveAiUse'))) });
    const base = await start(deps);
    const res = await post(base, path, body);
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe('USAGE_UNAVAILABLE');
    expect(deps.assistant[model]).not.toHaveBeenCalled();
  });

  it('passes the Idempotency-Key, scoped to the action, as the request id', async () => {
    const deps = makeDeps();
    const base = await start(deps);
    await post(base, path, body, { 'idempotency-key': 'key-123' });
    expect(deps.reserveUse).toHaveBeenCalledWith('user-1', action, `${action}:key-123`);
  });

  it('rejects an Idempotency-Key longer than 100 characters with 400, before counting', async () => {
    const deps = makeDeps();
    const base = await start(deps);
    const res = await post(base, path, body, { 'idempotency-key': 'k'.repeat(101) });
    expect(res.status).toBe(400);
    expect(deps.reserveUse).not.toHaveBeenCalled();
  });

  it('does not count a request that fails authentication or validation', async () => {
    const deps = makeDeps();
    const base = await start(deps);
    await post(base, path, body, { authorization: 'Bearer bad' });
    await post(base, path, { nonsense: true, message: 42, duration_days: 'x', feedback: 7 });
    expect(deps.reserveUse).not.toHaveBeenCalled();
  });

  it('still answers when marking the use fails afterwards', async () => {
    const deps = makeDeps({ finishUse: vi.fn(async () => Promise.reject(new DatabaseError('down', 'finishAiUse'))) });
    const base = await start(deps);
    const res = await post(base, path, body);
    expect(res.status).toBeLessThan(300);
  });
});

describe('generated request ids', () => {
  it('uses a fresh id per request when no Idempotency-Key is sent', async () => {
    const deps = makeDeps();
    const base = await start(deps);
    await post(base, '/api/chat', { message: 'one' });
    await post(base, '/api/chat', { message: 'two' });
    const ids = (deps.reserveUse as any).mock.calls.map((c: unknown[]) => c[2]);
    expect(ids[0]).not.toBe(ids[1]);
    expect(ids[0]).toMatch(/^chat_message:/);
  });
});
