/**
 * Integration: the HTTP API wired to the real database tools (PostgREST), with a
 * fake assistant (no OpenRouter calls) and a token-to-user stub in place of
 * Supabase Auth. Runs only when SUPABASE_TEST_URL and SUPABASE_TEST_SECRET are set.
 * Requirements: 15.8, 15.9, 18.1, 18.5-18.7, 17.8
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

vi.hoisted(() => {
  process.env.LOG_LEVEL = 'silent';
});

import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createClient } from '@supabase/supabase-js';
import { createApp } from '../src/api/server';
import { finishAiUse, getProfile, reserveAiUse, savePlan } from '../src/tools/database';
import { AuthenticationError, type Assistant, type WorkoutPlan } from '../src/types';

const url = process.env.SUPABASE_TEST_URL;
const secret = process.env.SUPABASE_TEST_SECRET;
const enabled = Boolean(url && secret);

const USER_A = 'aaaaaaaa-0000-4000-8000-000000000001';

const planFor = (exerciseId: string): WorkoutPlan => ({
  schema_version: '1.0.0',
  id: '8b8b8b8b-0000-4000-8000-00000000bbbb',
  created_at: '2026-02-02T09:00:00Z',
  goal: 'move_more',
  notes: 'api integration',
  days: [{ day: 1, title: 'Core', minutes: 10, blocks: [{ type: 'main', items: [{ exercise_id: exerciseId, sets: 2, amount: 20 }] }] }],
});

describe.skipIf(!enabled)('Integration: POST /api/plans/generate with real database', () => {
  let server: Server;
  let base: string;
  let generatePlan: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    const db = createClient(url!, secret!, { auth: { persistSession: false, autoRefreshToken: false } });
    generatePlan = vi.fn(async () => planFor('plank'));
    const assistant = { generatePlan } as unknown as Assistant;

    const app = createApp({
      assistant,
      authenticate: async (req) => {
        // Stub for Supabase Auth: the test token is the user id.
        const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
        if (token !== USER_A) throw new AuthenticationError();
        return token;
      },
      loadProfile: (userId) => getProfile(userId, db),
      storePlan: (userId, plan, provider) => savePlan(userId, plan, provider, db),
      reserveUse: (userId, action, requestId) => reserveAiUse(userId, action, requestId, db),
      finishUse: (useId, ok) => finishAiUse(useId, ok, db),
    });
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => server?.close());

  it('generates, saves and returns 201 with the plan id (18.5-18.7)', async () => {
    const res = await fetch(`${base}/api/plans/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${USER_A}` },
      body: JSON.stringify({ duration_days: 1, focus_areas: ['core'] }),
    });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.plan.days[0].blocks[0].items[0].exercise_id).toBe('plank');
    expect(generatePlan).toHaveBeenCalledTimes(1);
  });

  it('rejects an unauthenticated request with 401 and a correlation id (18.2, 17.8)', async () => {
    const res = await fetch(`${base}/api/plans/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ duration_days: 1, focus_areas: [] }),
    });
    const body = await res.json();
    expect(res.status).toBe(401);
    expect(body.correlationId).toMatch(/^[0-9a-f-]{36}$/);
  });
});
