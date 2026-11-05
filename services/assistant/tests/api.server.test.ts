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
    assistant: { generatePlan: vi.fn(async () => plan) } satisfies Assistant,
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
    expect(await res.json()).toEqual({ id: 'plan-1', plan });
    expect(deps.loadProfile).toHaveBeenCalledWith('user-1');
    expect(deps.assistant.generatePlan).toHaveBeenCalledWith(profile, {
      duration_days: 3,
      focus_areas: ['core'],
      custom_instructions: 'Quiet please',
    });
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
