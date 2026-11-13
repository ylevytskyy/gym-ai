/**
 * HTTP tests for plan adjustment, chat and account deletion. Everything behind the server is
 * an injected fake.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.hoisted(() => {
  process.env.LOG_LEVEL = 'silent';
});

import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp, type AppDeps } from '../src/api/server';
import { APIError, AuthenticationError, PlanGenerationError, type Profile, type WorkoutPlan } from '../src/types';

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
const planOf = (exerciseId: string): WorkoutPlan => ({
  schema_version: '1.0.0',
  id: '6f1c2c1e-6a1e-4b8a-9d55-2f6e1f0a7b11',
  created_at: '2026-01-10T09:00:00Z',
  goal: 'move_more',
  notes: 'test',
  days: [{ day: 1, title: 'Core', minutes: 10, blocks: [{ type: 'main', items: [{ exercise_id: exerciseId, sets: 2, amount: 30 }] }] }],
});
const current = planOf('squat');
const adjusted = planOf('plank');

function makeDeps(overrides: Partial<AppDeps> = {}): AppDeps {
  return {
    assistant: {
      generatePlan: vi.fn(async () => adjusted),
      adjustPlan: vi.fn(async () => adjusted),
      chat: vi.fn(async () => ({ reply: 'Hello!' })),
    },
    authenticate: vi.fn(async (req: any) => {
      if (req.headers.authorization === 'Bearer good') return 'user-1';
      throw new AuthenticationError();
    }),
    loadProfile: vi.fn(async () => profile),
    storePlan: vi.fn(async () => 'plan-2'),
    loadActivePlan: vi.fn(async () => ({ id: 'plan-1', plan: current })),
    loadMessages: vi.fn(async () => [{ role: 'user' as const, content: 'earlier' }]),
    storeMessages: vi.fn(async () => undefined),
    addInjuries: vi.fn(async (_userId: string, injuries: string[]) => ({ ...profile, injuries })),
    archivePlans: vi.fn(async () => undefined),
    deleteAccount: vi.fn(async () => undefined),
    reserveUse: vi.fn(async () => ({ allowed: true, duplicate: false, useId: 'use-1', tier: 'free' as const, limit: 10, remaining: 9, resetsAt: '2026-11-13T22:00:00.000Z' })),
    finishUse: vi.fn(async () => undefined),
    requestTimeoutMs: 1000,
    ...overrides,
  };
}

let server: Server;
let base: string;
async function start(deps: AppDeps) {
  server = createApp(deps).listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return deps;
}
afterEach(() => server?.close());
beforeEach(() => vi.clearAllMocks());

function call(method: string, path: string, body?: unknown, auth: string | null = 'Bearer good') {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (auth) headers['authorization'] = auth;
  return fetch(`${base}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

describe('POST /api/plans/adjust', () => {
  it('adjusts the active plan, stores the result and returns it', async () => {
    const deps = await start(makeDeps());
    const res = await call('POST', '/api/plans/adjust', { feedback: '  Make it easier  ' });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: 'plan-2', plan: adjusted, usage: { tier: 'free', limit: 10, remaining: 9, resetsAt: '2026-11-13T22:00:00.000Z' } });
    expect(deps.assistant.adjustPlan).toHaveBeenCalledWith(profile, current, 'Make it easier', { health: null });
    expect(deps.storePlan).toHaveBeenCalledWith('user-1', adjusted, 'openrouter');
  });

  it('is a 404 when the user has no plan', async () => {
    const deps = await start(makeDeps({ loadActivePlan: vi.fn(async () => null) }));
    const res = await call('POST', '/api/plans/adjust', { feedback: 'easier' });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('NO_ACTIVE_PLAN');
    expect(deps.assistant.adjustPlan).not.toHaveBeenCalled();
  });

  it('rejects missing, empty and over-long feedback', async () => {
    const deps = await start(makeDeps());
    for (const body of [{}, { feedback: '   ' }, { feedback: 5 }, { feedback: 'a'.repeat(501) }, []]) {
      const res = await call('POST', '/api/plans/adjust', body);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('VALIDATION_ERROR');
    }
    expect(deps.assistant.adjustPlan).not.toHaveBeenCalled();
  });

  it('is a 401 without a token', async () => {
    const deps = await start(makeDeps());
    expect((await call('POST', '/api/plans/adjust', { feedback: 'easier' }, null)).status).toBe(401);
    expect(deps.loadActivePlan).not.toHaveBeenCalled();
  });

  it('stores nothing when the adjusted plan conflicts with the profile as it is at that moment', async () => {
    const loadProfile = vi.fn(async () => profile);
    const deps = await start(makeDeps({ loadProfile }));
    (deps.assistant.adjustPlan as any).mockImplementationOnce(async () => {
      loadProfile.mockResolvedValue({ ...profile, injuries: ['knee_injury'] });
      return current; // squats
    });
    const res = await call('POST', '/api/plans/adjust', { feedback: 'more legs' });
    expect(res.status).toBe(400);
    expect(deps.storePlan).not.toHaveBeenCalled();
  });

  it('stores nothing when the adjusted plan fails validation', async () => {
    const deps = await start(makeDeps());
    (deps.assistant.adjustPlan as any).mockRejectedValueOnce(new PlanGenerationError('failed', 2, []));
    const res = await call('POST', '/api/plans/adjust', { feedback: 'easier' });
    expect(res.status).toBe(400);
    expect(deps.storePlan).not.toHaveBeenCalled();
  });
});

describe('POST /api/chat', () => {
  it('answers, and stores the message with the reply', async () => {
    const deps = await start(makeDeps());
    const res = await call('POST', '/api/chat', { message: '  How am I doing?  ' });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ reply: 'Hello!', plan: null, plan_removed: false, injuries_added: [], usage: { tier: 'free', limit: 10, remaining: 9, resetsAt: '2026-11-13T22:00:00.000Z' } });
    expect(deps.assistant.chat).toHaveBeenCalledWith({
      profile,
      message: 'How am I doing?',
      history: [{ role: 'user', content: 'earlier' }],
      plan: current,
      health: null,
    });
    expect(deps.loadMessages).toHaveBeenCalledWith('user-1', 20);
    expect(deps.storeMessages).toHaveBeenCalledWith('user-1', 'How am I doing?', 'Hello!');
    expect(deps.storePlan).not.toHaveBeenCalled();
  });

  it('changes the plan when the model asks for it, through adjustPlan', async () => {
    const deps = await start(makeDeps());
    (deps.assistant.chat as any).mockResolvedValueOnce({ reply: 'Lighter it is.', adjustPlan: 'Fewer sets' });
    const res = await call('POST', '/api/chat', { message: 'make it easier' });

    expect(await res.json()).toEqual({ reply: 'Lighter it is.', plan: { id: 'plan-2', plan: adjusted }, plan_removed: false, injuries_added: [], usage: { tier: 'free', limit: 10, remaining: 9, resetsAt: '2026-11-13T22:00:00.000Z' } });
    expect(deps.assistant.adjustPlan).toHaveBeenCalledWith(profile, current, 'Fewer sets', { health: null });
    expect(deps.storePlan).toHaveBeenCalledWith('user-1', adjusted, 'openrouter');
  });

  it('adds a reported injury to the profile first, so the adjusted plan is checked against it', async () => {
    const deps = await start(makeDeps());
    (deps.assistant.chat as any).mockResolvedValueOnce({ reply: 'Noted.', addInjuries: ['knee_injury'] });
    const res = await call('POST', '/api/chat', { message: 'my knee hurts' });

    expect((await res.json()).injuries_added).toEqual(['knee_injury']);
    expect(deps.addInjuries).toHaveBeenCalledWith('user-1', ['knee_injury']);
    // The plan is adjusted even though the model did not ask: the old one was made without the injury.
    const [usedProfile, , feedback] = (deps.assistant.adjustPlan as any).mock.calls[0];
    expect(usedProfile.injuries).toEqual(['knee_injury']);
    expect(feedback).toContain('knee_injury');
  });

  it('keeps the old plan and says so when the change fails', async () => {
    const deps = await start(makeDeps());
    (deps.assistant.chat as any).mockResolvedValueOnce({ reply: 'Lighter it is.', adjustPlan: 'Fewer sets' });
    (deps.assistant.adjustPlan as any).mockRejectedValueOnce(new PlanGenerationError('failed', 2, []));
    const body = await (await call('POST', '/api/chat', { message: 'make it easier' })).json();

    expect(body.plan).toBeNull();
    expect(body.reply).toContain('could not change your plan');
    expect(body.reply).not.toContain('Lighter it is.');
    expect(deps.storePlan).not.toHaveBeenCalled();
    expect(deps.storeMessages).toHaveBeenCalledWith('user-1', 'make it easier', body.reply);
  });

  it('makes a new plan when an injury was added and the old plan could not be adjusted', async () => {
    const deps = await start(makeDeps());
    (deps.assistant.chat as any).mockResolvedValueOnce({ reply: 'Noted.', addInjuries: ['knee_injury'] });
    (deps.assistant.adjustPlan as any).mockRejectedValueOnce(new APIError('down', 'openrouter', 500));
    const body = await (await call('POST', '/api/chat', { message: 'my knee hurts' })).json();

    expect(body.plan).toEqual({ id: 'plan-2', plan: adjusted });
    const [usedProfile, request] = (deps.assistant.generatePlan as any).mock.calls[0];
    expect(usedProfile.injuries).toEqual(['knee_injury']);
    expect(request).toEqual({ duration_days: 1, focus_areas: [] });
  });

  it('warns plainly when an injury was added and no safe plan could be made', async () => {
    const deps = await start(makeDeps());
    (deps.assistant.chat as any).mockResolvedValueOnce({ reply: 'Noted.', addInjuries: ['knee_injury'] });
    (deps.assistant.adjustPlan as any).mockRejectedValueOnce(new PlanGenerationError('failed', 2, []));
    (deps.assistant.generatePlan as any).mockRejectedValueOnce(new PlanGenerationError('failed', 2, []));
    const body = await (await call('POST', '/api/chat', { message: 'my knee hurts' })).json();

    expect(body.plan).toBeNull();
    expect(body.injuries_added).toEqual(['knee_injury']);
    expect(body.reply).toMatch(/skip any exercise that hurts/i);
    // The old plan was made without the injury: it is taken away, so the app offers a new one.
    expect(deps.archivePlans).toHaveBeenCalledWith('user-1');
    expect(body.plan_removed).toBe(true);
    expect(body.reply).toMatch(/Today tab/);
  });

  it('never stores a plan that conflicts with the profile as it is at that moment', async () => {
    // Another request added a knee injury while this one was running with the older profile.
    const loadProfile = vi.fn(async () => profile);
    const deps = await start(makeDeps({ loadProfile }));
    (deps.assistant.chat as any).mockResolvedValueOnce({ reply: 'More legs it is.', adjustPlan: 'More legs' });
    (deps.assistant.adjustPlan as any).mockImplementationOnce(async () => {
      loadProfile.mockResolvedValue({ ...profile, injuries: ['knee_injury'] });
      return current; // squats
    });
    const body = await (await call('POST', '/api/chat', { message: 'more legs' })).json();

    expect(deps.storePlan).not.toHaveBeenCalled();
    expect(body.plan).toBeNull();
    expect(body.reply).toContain('could not change your plan');
  });

  it('stops trying to change the plan when the time for it is used up', async () => {
    const deps = await start(makeDeps({ requestTimeoutMs: 100 }));
    (deps.assistant.chat as any).mockResolvedValueOnce({ reply: 'Noted.', addInjuries: ['knee_injury'] });
    (deps.assistant.adjustPlan as any).mockImplementationOnce(() => new Promise(() => undefined));
    const body = await (await call('POST', '/api/chat', { message: 'my knee hurts' })).json();

    expect(deps.assistant.generatePlan).not.toHaveBeenCalled();
    expect(body.plan_removed).toBe(true);
  });

  it('answers one request per user at a time', async () => {
    let finish: (value: { reply: string }) => void = () => undefined;
    const deps = await start(makeDeps());
    (deps.assistant.chat as any).mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    const first = call('POST', '/api/chat', { message: 'one' });
    await vi.waitFor(() => expect(deps.assistant.chat).toHaveBeenCalledTimes(1));

    const second = await call('POST', '/api/chat', { message: 'two' });
    expect(second.status).toBe(429);
    expect((await second.json()).error).toBe('TOO_MANY_REQUESTS');

    finish({ reply: 'done' });
    expect((await first).status).toBe(200);
    expect((await call('POST', '/api/chat', { message: 'three' })).status).toBe(200);
  });

  it('limits how many requests a user may make in a while, across the model endpoints', async () => {
    const deps = await start(makeDeps({ limits: { max: 2, windowMs: 60_000 } }));
    expect((await call('POST', '/api/chat', { message: 'one' })).status).toBe(200);
    expect((await call('POST', '/api/plans/adjust', { feedback: 'easier' })).status).toBe(201);
    expect((await call('POST', '/api/chat', { message: 'three' })).status).toBe(429);
    expect((await call('POST', '/api/plans/generate', { duration_days: 1, focus_areas: [] })).status).toBe(429);
    expect(deps.assistant.chat).toHaveBeenCalledTimes(1);
    // Deleting the account is never held back.
    expect((await call('DELETE', '/api/account')).status).toBe(204);
  });

  it('does not touch the plan when the user has none', async () => {
    const deps = await start(makeDeps({ loadActivePlan: vi.fn(async () => null) }));
    (deps.assistant.chat as any).mockResolvedValueOnce({ reply: 'ok', adjustPlan: 'Fewer sets' });
    const body = await (await call('POST', '/api/chat', { message: 'easier' })).json();
    expect(body.plan).toBeNull();
    expect(deps.assistant.adjustPlan).not.toHaveBeenCalled();
  });

  it('still answers when the message cannot be stored or the history cannot be loaded', async () => {
    await start(
      makeDeps({
        storeMessages: vi.fn(async () => Promise.reject(new Error('db down'))),
        loadMessages: vi.fn(async () => Promise.reject(new Error('db down'))),
      }),
    );
    const res = await call('POST', '/api/chat', { message: 'hi' });
    expect(res.status).toBe(200);
    expect((await res.json()).reply).toBe('Hello!');
  });

  it('rejects missing, empty and over-long messages, and requires a token', async () => {
    const deps = await start(makeDeps());
    for (const body of [{}, { message: '' }, { message: 7 }, { message: 'a'.repeat(1001) }]) {
      expect((await call('POST', '/api/chat', body)).status).toBe(400);
    }
    expect((await call('POST', '/api/chat', { message: 'hi' }, null)).status).toBe(401);
    expect(deps.assistant.chat).not.toHaveBeenCalled();
  });

  it('is a 500 without provider detail when the model is unavailable', async () => {
    const deps = await start(makeDeps());
    (deps.assistant.chat as any).mockRejectedValueOnce(new APIError('OpenRouter said: secret detail', 'openrouter', 500));
    const res = await call('POST', '/api/chat', { message: 'hi' });
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('secret detail');
    expect(deps.storeMessages).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/account', () => {
  it('deletes the signed-in user and nobody else', async () => {
    const deps = await start(makeDeps());
    const res = await call('DELETE', '/api/account');
    expect(res.status).toBe(204);
    expect(deps.deleteAccount).toHaveBeenCalledTimes(1);
    expect(deps.deleteAccount).toHaveBeenCalledWith('user-1');
  });

  it('is a 401 without a token and deletes nothing', async () => {
    const deps = await start(makeDeps());
    expect((await call('DELETE', '/api/account', undefined, null)).status).toBe(401);
    expect(deps.deleteAccount).not.toHaveBeenCalled();
  });

  it('is a 500 with no detail when deletion fails', async () => {
    await start(makeDeps({ deleteAccount: vi.fn(async () => Promise.reject(new Error('admin api: secret detail'))) }));
    const res = await call('DELETE', '/api/account');
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('secret detail');
  });
});
