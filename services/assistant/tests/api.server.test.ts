/**
 * HTTP API tests. The assistant, auth and database are injected fakes, so these
 * run without network access. Requirements: 18.1, 18.5-18.10, 17.3-17.8
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';

// Keep test output quiet. vi.hoisted runs before the logger module is imported.
vi.hoisted(() => {
  process.env.LOG_LEVEL = 'silent';
});

import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp, type AppDeps } from '../src/api/server';
import {
  APIError,
  AuthenticationError,
  DatabaseError,
  PlanGenerationError,
  type Assistant,
  type HealthSummary,
  type Profile,
  type WorkoutPlan,
} from '../src/types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

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

function makeDeps(overrides: Partial<AppDeps> = {}) {
  const deps: AppDeps = {
    assistant: {
      generatePlan: vi.fn(async () => plan),
      adjustPlan: vi.fn(async () => plan),
      chat: vi.fn(async () => ({ reply: 'ok' })),
    } satisfies Assistant,
    loadActivePlan: vi.fn(async () => null),
    loadMessages: vi.fn(async () => []),
    storeMessages: vi.fn(async () => undefined),
    addInjuries: vi.fn(async () => profile),
    archivePlans: vi.fn(async () => undefined),
    deleteAccount: vi.fn(async () => undefined),
    reserveUse: vi.fn(async () => ({ allowed: true, duplicate: false, useId: 'use-1', tier: 'free' as const, limit: 10, remaining: 9, resetsAt: '2026-11-13T22:00:00.000Z' })),
    finishUse: vi.fn(async () => undefined),
    authenticate: vi.fn(async (req: any) => {
      if (req.headers.authorization === 'Bearer good') return 'user-1';
      throw new AuthenticationError();
    }),
    loadProfile: vi.fn(async () => profile),
    storePlan: vi.fn(async () => 'plan-1'),
    requestTimeoutMs: 1000,
    ...overrides,
  };
  return deps;
}

async function start(deps: AppDeps) {
  const server: Server = createApp(deps).listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { server, base };
}

const validBody = { duration_days: 3, focus_areas: ['core'], custom_instructions: 'Quiet please' };

function post(base: string, body: unknown, auth: string | null = 'Bearer good', raw = false) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (auth) headers['authorization'] = auth;
  return fetch(`${base}/api/plans/generate`, {
    method: 'POST',
    headers,
    body: raw ? (body as string) : JSON.stringify(body),
  });
}

describe('GET /health', () => {
  let server: Server;
  let base: string;
  beforeAll(async () => ({ server, base } = await start(makeDeps())));
  afterAll(() => server.close());

  it('returns 200 with status ok (Requirement 18.10)', async () => {
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });
});

describe('POST /api/plans/generate', () => {
  let server: Server;
  let base: string;
  let deps: AppDeps;

  beforeAll(async () => {
    deps = makeDeps();
    ({ server, base } = await start(deps));
  });
  beforeEach(() => {
    vi.clearAllMocks(); // each test counts its own calls
  });
  afterAll(() => server.close());

  it('returns 201 with the plan id and plan, after loading the profile and storing the plan (18.5-18.7)', async () => {
    const res = await post(base, validBody);

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: 'plan-1', plan, usage: { tier: 'free', limit: 10, remaining: 9, resetsAt: '2026-11-13T22:00:00.000Z' } });
    expect(deps.loadProfile).toHaveBeenCalledWith('user-1');
    expect(deps.assistant.generatePlan).toHaveBeenCalledWith(
      profile,
      { duration_days: 3, focus_areas: ['core'], custom_instructions: 'Quiet please' },
      { health: null }, // no health lookup wired in: the plan is made without health data
    );
    expect(deps.storePlan).toHaveBeenCalledWith('user-1', plan, 'openrouter');
  });

  it('returns 401 without a token and never reaches the assistant (18.2)', async () => {
    const res = await post(base, validBody, null);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe('AUTHENTICATION_ERROR');
    expect(body.correlationId).toMatch(UUID);
    expect(deps.assistant.generatePlan).not.toHaveBeenCalled();
  });

  it('returns 400 with the field path for an invalid body, before any work is done (18.9)', async () => {
    const res = await post(base, { duration_days: 0, focus_areas: [] });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe('VALIDATION_ERROR');
    expect(body.details).toContainEqual(expect.objectContaining({ path: 'duration_days' }));
    expect(deps.loadProfile).not.toHaveBeenCalled();
  });

  it('returns 400 for a body that is not valid JSON', async () => {
    const res = await post(base, '{ not json', 'Bearer good', true);
    expect((await res.json()).error).toBe('INVALID_JSON');
    expect(res.status).toBe(400);
  });

  it('returns 400 with attempts and validation errors when plan generation fails (18.8)', async () => {
    const failing = makeDeps({
      assistant: {
        generatePlan: vi.fn(async () => {
          throw new PlanGenerationError('Plan generation failed after 2 attempts', 2, [
            { path: 'days[0]', message: 'bad', code: 'INJURY_CONFLICT' },
          ]);
        }),
      },
    });
    const h = await start(failing);
    try {
      const res = await post(h.base, validBody);
      const body = await res.json();
      expect(res.status).toBe(400);
      expect(body.error).toBe('PLAN_GENERATION_FAILED');
      expect(body.details.attempts).toBe(2);
      expect(body.details.validation_errors).toEqual([
        { path: 'days[0]', message: 'bad', code: 'INJURY_CONFLICT' },
      ]);
    } finally {
      h.server.close();
    }
  });

  it('stores a plan that the model needs 45 seconds for when no time limit is set', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const generatePlan = vi.fn(() => new Promise<WorkoutPlan>((resolve) => setTimeout(() => resolve(plan), 45_000)));
    const slow = makeDeps({ assistant: { generatePlan }, requestTimeoutMs: undefined });
    const h = await start(slow);
    try {
      const pending = post(h.base, validBody);
      while (generatePlan.mock.calls.length === 0) await new Promise((resolve) => setImmediate(resolve));
      await vi.advanceTimersByTimeAsync(45_000);
      const res = await pending;
      expect(res.status).toBe(201);
      expect((await res.json()).id).toBe('plan-1');
    } finally {
      vi.useRealTimers();
      h.server.close();
    }
  });

  it('gives up after 55 seconds when no time limit is set, before the app stops waiting at 60', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const generatePlan = vi.fn(() => new Promise<WorkoutPlan>(() => {}));
    const h = await start(makeDeps({ assistant: { generatePlan }, requestTimeoutMs: undefined }));
    try {
      const pending = post(h.base, validBody);
      while (generatePlan.mock.calls.length === 0) await new Promise((resolve) => setImmediate(resolve));
      await vi.advanceTimersByTimeAsync(55_000);
      const res = await pending;
      expect(res.status).toBe(504);
    } finally {
      vi.useRealTimers();
      h.server.close();
    }
  });

  it('returns 504 when generation exceeds the request timeout (18.10)', async () => {
    const slow = makeDeps({
      assistant: { generatePlan: vi.fn(() => new Promise<WorkoutPlan>(() => {})) },
      requestTimeoutMs: 50,
    });
    const h = await start(slow);
    try {
      const res = await post(h.base, validBody);
      expect(res.status).toBe(504);
      expect((await res.json()).error).toBe('GATEWAY_TIMEOUT');
    } finally {
      h.server.close();
    }
  });

  it('hides internal and upstream error details from the client but returns a correlation id (17.5, 17.6)', async () => {
    const broken = makeDeps({
      storePlan: vi.fn(async () => {
        throw new DatabaseError('relation "plans" secret-internal-detail', 'savePlan');
      }),
    });
    const h = await start(broken);
    try {
      const res = await post(h.base, validBody);
      const text = await res.text();
      expect(res.status).toBe(500);
      expect(text).not.toContain('secret-internal-detail');
      expect(text).not.toMatch(/stack|at .*\.ts/);
      const body = JSON.parse(text);
      expect(body.error).toBe('INTERNAL_SERVER_ERROR');
      expect(body.correlationId).toMatch(UUID);
    } finally {
      h.server.close();
    }
  });

  it('does not leak upstream LLM error text to the client', async () => {
    const upstream = makeDeps({
      assistant: {
        generatePlan: vi.fn(async () => {
          throw new APIError('OpenRouter request failed: sk-or-SECRET-KEY-123', 'openrouter', 429);
        }),
      },
    });
    const h = await start(upstream);
    try {
      const res = await post(h.base, validBody);
      const text = await res.text();
      expect(res.status).toBe(500);
      expect(text).not.toContain('sk-or-SECRET-KEY-123');
    } finally {
      h.server.close();
    }
  });

  it('sends the correlation id in a header that matches the error body', async () => {
    const res = await post(base, validBody, null);
    const header = res.headers.get('x-correlation-id');
    const body = await res.json();
    expect(header).toMatch(UUID);
    expect(body.correlationId).toBe(header);
  });
});

describe('POST /api/plans/generate with health data', () => {
  const summary: HealthSummary = {
    days_with_data: 9,
    avg_steps: 5200,
    readiness: { level: 'normal', reasons: [] },
    external_workouts_7d: { count: 1, minutes: 40, types: ['running'] },
    external_workout_minutes_today: 0,
  };

  async function run(loadHealthSummary: AppDeps['loadHealthSummary']) {
    const deps = makeDeps({ ...(loadHealthSummary ? { loadHealthSummary } : {}) });
    const { server, base } = await start(deps);
    try {
      const res = await post(base, validBody);
      return { res, deps, body: await res.json() };
    } finally {
      server.close();
    }
  }

  it('loads the health summary for the authenticated user and hands it to the assistant', async () => {
    const loadHealthSummary = vi.fn(async () => summary);
    const { res, deps } = await run(loadHealthSummary);

    expect(res.status).toBe(201);
    expect(loadHealthSummary).toHaveBeenCalledWith('user-1');
    expect(deps.assistant.generatePlan).toHaveBeenCalledWith(profile, expect.anything(), { health: summary });
  });

  it('generates the plan without health data for a user who never connected Health', async () => {
    const { res, deps, body } = await run(vi.fn(async () => null));

    expect(res.status).toBe(201);
    expect(body).toEqual({ id: 'plan-1', plan, usage: { tier: 'free', limit: 10, remaining: 9, resetsAt: '2026-11-13T22:00:00.000Z' } });
    expect(deps.assistant.generatePlan).toHaveBeenCalledWith(profile, expect.anything(), { health: null });
  });

  it('still generates the plan when the health lookup fails', async () => {
    const { res, deps, body } = await run(vi.fn(async () => {
      throw new DatabaseError('health_days unavailable', 'getHealthDays');
    }));

    expect(res.status).toBe(201);
    expect(body).toEqual({ id: 'plan-1', plan, usage: { tier: 'free', limit: 10, remaining: 9, resetsAt: '2026-11-13T22:00:00.000Z' } });
    expect(deps.assistant.generatePlan).toHaveBeenCalledWith(profile, expect.anything(), { health: null });
  });

  it('does not let a hung health lookup hold the request: the plan is generated without it', async () => {
    const deps = makeDeps({ loadHealthSummary: vi.fn(() => new Promise<HealthSummary | null>(() => {})), healthTimeoutMs: 50 });
    const { server, base } = await start(deps);
    try {
      const res = await post(base, validBody);
      expect(res.status).toBe(201);
      expect(deps.assistant.generatePlan).toHaveBeenCalledWith(profile, expect.anything(), { health: null });
    } finally {
      server.close();
    }
  });

  it('does not look up health data for an unauthenticated or invalid request', async () => {
    const loadHealthSummary = vi.fn(async () => summary);
    const deps = makeDeps({ loadHealthSummary });
    const { server, base } = await start(deps);
    try {
      expect((await post(base, validBody, null)).status).toBe(401);
      expect((await post(base, { duration_days: 0, focus_areas: [] })).status).toBe(400);
      expect(loadHealthSummary).not.toHaveBeenCalled();
    } finally {
      server.close();
    }
  });
});
