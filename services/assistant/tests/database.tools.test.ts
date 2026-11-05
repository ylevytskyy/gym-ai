/**
 * Database tools unit tests (Supabase client faked; real-database checks live in
 * the integration tests).
 * Requirements: 11.4, 11.5, 11.7, 11.8, 11.9
 */

import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getProfile, getRecentLogs, savePlan } from '../src/tools/database';
import { DatabaseError, ValidationErrorClass } from '../src/types';
import type { Profile, WorkoutPlan } from '../src/types';

interface FakeResponse {
  data?: unknown;
  error?: { message: string; code?: string } | null;
}

/** Minimal chainable stand-in for the Supabase query builder that records calls. */
function fakeDb(response: FakeResponse) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const builder: Record<string, unknown> = {};
  const chain = (method: string) => (...args: unknown[]) => {
    calls.push({ method, args });
    return builder;
  };
  for (const m of ['select', 'eq', 'order', 'limit', 'insert']) {
    builder[m] = chain(m);
  }
  builder['single'] = (...args: unknown[]) => {
    calls.push({ method: 'single', args });
    return Promise.resolve(response);
  };
  builder['then'] = (resolve: (v: FakeResponse) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(response).then(resolve, reject);

  const client = {
    from: (table: string) => {
      calls.push({ method: 'from', args: [table] });
      return builder;
    },
  };
  return { db: client as unknown as SupabaseClient, calls };
}

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

const validPlan: WorkoutPlan = {
  schema_version: '1.0.0',
  id: '6f1c2c1e-6a1e-4b8a-9d55-2f6e1f0a7b11',
  created_at: '2026-01-10T09:00:00Z',
  goal: 'move_more',
  notes: 'test plan',
  days: [
    {
      day: 1,
      title: 'Starter',
      minutes: 10,
      blocks: [
        { type: 'main', items: [{ exercise_id: 'squat', sets: 2, amount: 10 }] },
      ],
    },
  ],
};

describe('getProfile (Requirement 11.4)', () => {
  it('selects the profile row by id and returns it', async () => {
    const { db, calls } = fakeDb({ data: profile, error: null });

    const result = await getProfile('user-1', db);

    expect(result).toEqual(profile);
    expect(calls).toEqual([
      { method: 'from', args: ['profiles'] },
      { method: 'select', args: ['*'] },
      { method: 'eq', args: ['id', 'user-1'] },
      { method: 'single', args: [] },
    ]);
  });

  it('throws a clear DatabaseError when the profile does not exist', async () => {
    const { db } = fakeDb({ data: null, error: { code: 'PGRST116', message: 'no rows' } });

    await expect(getProfile('missing', db)).rejects.toThrow(DatabaseError);
    await expect(getProfile('missing', db)).rejects.toThrow(/Profile not found for user missing/);
  });
});

describe('getRecentLogs (Requirement 11.5)', () => {
  it('queries the user logs newest first, limited to the requested count', async () => {
    const logs = [{ id: 'log-1' }];
    const { db, calls } = fakeDb({ data: logs, error: null });

    const result = await getRecentLogs('user-1', 5, db);

    expect(result).toEqual(logs);
    expect(calls).toEqual([
      { method: 'from', args: ['workout_logs'] },
      { method: 'select', args: ['*'] },
      { method: 'eq', args: ['user_id', 'user-1'] },
      { method: 'order', args: ['completed_at', { ascending: false }] },
      { method: 'limit', args: [5] },
    ]);
  });

  it('wraps query errors in DatabaseError', async () => {
    const { db } = fakeDb({ data: null, error: { message: 'boom' } });
    await expect(getRecentLogs('user-1', 5, db)).rejects.toThrow(DatabaseError);
  });
});

describe('savePlan (Requirements 11.7, 11.8, 11.9)', () => {
  it('rejects an invalid plan without touching the database', async () => {
    const { db, calls } = fakeDb({ data: { id: 'x' }, error: null });
    const broken = { ...validPlan, days: [] } as unknown as WorkoutPlan;

    await expect(savePlan('user-1', broken, 'openrouter', db)).rejects.toThrow(ValidationErrorClass);
    expect(calls).toEqual([]);
  });

  it('rejects a plan that references an unknown exercise', async () => {
    const { db, calls } = fakeDb({ data: { id: 'x' }, error: null });
    const unknown = structuredClone(validPlan);
    unknown.days[0]!.blocks[0]!.items[0]!.exercise_id = 'no-such-exercise';

    await expect(savePlan('user-1', unknown, 'openrouter', db)).rejects.toThrow(ValidationErrorClass);
    expect(calls).toEqual([]);
  });

  it('inserts a valid plan as active and returns the new id', async () => {
    const { db, calls } = fakeDb({ data: { id: 'plan-123' }, error: null });

    const id = await savePlan('user-1', validPlan, 'openrouter', db);

    expect(id).toBe('plan-123');
    expect(calls).toEqual([
      { method: 'from', args: ['plans'] },
      {
        method: 'insert',
        args: [
          {
            user_id: 'user-1',
            schema_version: '1.0.0',
            plan_json: validPlan,
            provider: 'openrouter',
            status: 'active',
          },
        ],
      },
      { method: 'select', args: ['id'] },
      { method: 'single', args: [] },
    ]);
  });

  it('wraps insert errors in DatabaseError', async () => {
    const { db } = fakeDb({ data: null, error: { message: 'insert failed' } });
    await expect(savePlan('user-1', validPlan, 'openrouter', db)).rejects.toThrow(DatabaseError);
  });
});
