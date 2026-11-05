/**
 * Integration: database tools against a real PostgREST + Postgres with the
 * migrations applied and RLS in force. Skipped unless the test environment is set:
 *   SUPABASE_TEST_URL      e.g. http://127.0.0.1:54321 (PostgREST base, no /rest/v1)
 *   SUPABASE_TEST_SECRET   service-role JWT for that instance
 * Requirements: 15.6, 15.8, 11.4, 11.5, 11.7
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getProfile, getRecentLogs, savePlan } from '../src/tools/database';
import type { WorkoutPlan } from '../src/types';

const url = process.env.SUPABASE_TEST_URL;
const secret = process.env.SUPABASE_TEST_SECRET;
const enabled = Boolean(url && secret);

const USER_A = 'aaaaaaaa-0000-4000-8000-000000000001'; // seeded beginner
const USER_B = 'bbbbbbbb-0000-4000-8000-000000000002'; // seeded knee-injury user

describe.skipIf(!enabled)('Integration: database tools', () => {
  let db: SupabaseClient;

  beforeAll(() => {
    db = createClient(url!, secret!, { auth: { persistSession: false, autoRefreshToken: false } });
  });

  it('getProfile returns the seeded profile for a user (11.4)', async () => {
    const profile = await getProfile(USER_A, db);
    expect(profile.id).toBe(USER_A);
    expect(profile.fitness_level).toBe(1);
    expect(profile.injuries).toEqual([]);
  });

  it('getProfile throws a DatabaseError for an unknown user (11.4)', async () => {
    await expect(getProfile('ffffffff-0000-4000-8000-00000000ffff', db)).rejects.toThrow(/Profile not found/);
  });

  it('getRecentLogs returns only that user logs, newest first, limited (11.5)', async () => {
    const logs = await getRecentLogs(USER_B, 1, db);
    expect(logs).toHaveLength(1);
    expect(logs[0]!.user_id).toBe(USER_B);
    // Seeded B logs: 2026-01-13 and 2026-01-15; newest is the 15th.
    expect(logs[0]!.completed_at.startsWith('2026-01-15')).toBe(true);
  });

  it('savePlan stores a valid plan as active and returns its id (11.7, 11.9)', async () => {
    const plan: WorkoutPlan = {
      schema_version: '1.0.0',
      id: '7a7a7a7a-0000-4000-8000-00000000aaaa',
      created_at: '2026-02-01T09:00:00Z',
      goal: 'move_more',
      notes: 'integration save',
      days: [{ day: 1, title: 'Core', minutes: 10, blocks: [{ type: 'main', items: [{ exercise_id: 'plank', sets: 2, amount: 20 }] }] }],
    };

    const planId = await savePlan(USER_A, plan, 'integration', db);
    const { data, error } = await db.from('plans').select('user_id, status, provider').eq('id', planId).single();

    expect(error).toBeNull();
    expect(data).toEqual({ user_id: USER_A, status: 'active', provider: 'integration' });
  });

  it('savePlan rejects an invalid plan and writes nothing (11.8)', async () => {
    const before = await db.from('plans').select('id', { count: 'exact', head: true }).eq('user_id', USER_A);
    const bad = { schema_version: '1.0.0', id: 'x', created_at: '2026-02-01T09:00:00Z', goal: 'g', notes: '', days: [] } as unknown as WorkoutPlan;

    await expect(savePlan(USER_A, bad, 'integration', db)).rejects.toThrow();

    const after = await db.from('plans').select('id', { count: 'exact', head: true }).eq('user_id', USER_A);
    expect(after.count).toBe(before.count);
  });
});
