/**
 * Database tools for chat, the active plan, injuries and account deletion (Supabase client faked).
 */

import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { addInjuries, archivePlans, deleteAccount, getActivePlan, getMessages, saveMessages } from '../src/tools/database';
import { DatabaseError } from '../src/types';
import type { WorkoutPlan } from '../src/types';

interface FakeResponse {
  data?: unknown;
  error?: { message: string } | null;
}

/** A chainable stand-in for the query builder: records calls and answers each query in turn. */
function fakeDb(...responses: FakeResponse[]) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const answer = () => Promise.resolve(responses.shift() ?? { data: null, error: null });
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order', 'limit', 'insert', 'update']) {
    builder[m] = (...args: unknown[]) => (calls.push({ method: m, args }), builder);
  }
  for (const m of ['single', 'maybeSingle']) builder[m] = (...args: unknown[]) => (calls.push({ method: m, args }), answer());
  builder['then'] = (resolve: (v: FakeResponse) => unknown, reject?: (e: unknown) => unknown) => answer().then(resolve, reject);
  const deleteUser = vi.fn(async () => responses.shift() ?? { data: null, error: null });
  const rpc = vi.fn(async (_name: string, _args: unknown) => responses.shift() ?? { data: null, error: null });
  const client = {
    rpc,
    from: (table: string) => (calls.push({ method: 'from', args: [table] }), builder),
    auth: { admin: { deleteUser } },
  };
  const args = (method: string) => calls.filter((c) => c.method === method).map((c) => c.args);
  return { db: client as unknown as SupabaseClient, calls, args, deleteUser, rpc };
}

const plan: WorkoutPlan = {
  schema_version: '1.0.0',
  id: '6f1c2c1e-6a1e-4b8a-9d55-2f6e1f0a7b11',
  created_at: '2026-01-10T09:00:00Z',
  goal: 'move_more',
  notes: 'test',
  days: [{ day: 1, title: 'Core', minutes: 10, blocks: [{ type: 'main', items: [{ exercise_id: 'plank', sets: 2, amount: 30 }] }] }],
};

describe('getActivePlan', () => {
  it("returns the user's newest active plan", async () => {
    const { db, args } = fakeDb({ data: { id: 'plan-1', plan_json: plan }, error: null });
    expect(await getActivePlan('user-1', db)).toEqual({ id: 'plan-1', plan });
    expect(args('from')).toEqual([['plans']]);
    expect(args('eq')).toEqual([
      ['user_id', 'user-1'],
      ['status', 'active'],
    ]);
    expect(args('order')).toEqual([['created_at', { ascending: false }]]);
    expect(args('limit')).toEqual([[1]]);
  });

  it('is null when there is none, or when the stored plan no longer passes validation', async () => {
    expect(await getActivePlan('user-1', fakeDb({ data: null, error: null }).db)).toBeNull();
    const broken = { ...plan, days: [{ ...plan.days[0]!, blocks: [{ type: 'main', items: [{ exercise_id: 'not-in-catalog', sets: 1, amount: 1 }] }] }] };
    expect(await getActivePlan('user-1', fakeDb({ data: { id: 'plan-1', plan_json: broken }, error: null }).db)).toBeNull();
  });

  it('throws a DatabaseError when the query fails', async () => {
    await expect(getActivePlan('user-1', fakeDb({ data: null, error: { message: 'boom' } }).db)).rejects.toBeInstanceOf(DatabaseError);
  });
});

describe('getMessages', () => {
  it('returns the last turns of this user, oldest first, and nothing but user and assistant turns', async () => {
    const { db, args } = fakeDb({
      data: [
        { role: 'assistant', content: 'second' },
        { role: 'system', content: 'injected' },
        { role: 'user', content: 'first' },
      ],
      error: null,
    });
    expect(await getMessages('user-1', 20, db)).toEqual([
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'second' },
    ]);
    expect(args('from')).toEqual([['assistant_messages']]);
    expect(args('eq')).toEqual([['user_id', 'user-1']]);
    expect(args('order')).toEqual([['created_at', { ascending: false }]]);
    expect(args('limit')).toEqual([[20]]);
  });

  it('throws a DatabaseError when the query fails', async () => {
    await expect(getMessages('user-1', 20, fakeDb({ data: null, error: { message: 'boom' } }).db)).rejects.toBeInstanceOf(DatabaseError);
  });
});

describe('saveMessages', () => {
  it('stores the message and the reply for this user, the message first', async () => {
    const { db, args } = fakeDb({ error: null });
    await saveMessages('user-1', 'hi', 'hello', db, new Date('2026-11-13T08:00:00.000Z'));
    expect(args('insert')[0]![0]).toEqual([
      { user_id: 'user-1', role: 'user', content: 'hi', created_at: '2026-11-13T08:00:00.000Z' },
      { user_id: 'user-1', role: 'assistant', content: 'hello', created_at: '2026-11-13T08:00:00.001Z' },
    ]);
  });

  it('throws a DatabaseError when the insert fails', async () => {
    await expect(saveMessages('user-1', 'hi', 'hello', fakeDb({ error: { message: 'boom' } }).db)).rejects.toBeInstanceOf(DatabaseError);
  });
});

describe('addInjuries', () => {
  const stored = { id: 'user-1', injuries: ['neck_injury', 'knee_injury'] };

  it('adds known injuries in one database call, for this user, and returns the updated profile', async () => {
    const { db, rpc, args } = fakeDb({ data: [stored], error: null });
    const profile = await addInjuries('user-1', ['knee_injury', 'knee_injury', 'made_up'], db);
    expect(profile.injuries).toEqual(['neck_injury', 'knee_injury']);
    expect(rpc).toHaveBeenCalledWith('add_profile_injuries', { p_user_id: 'user-1', p_injuries: ['knee_injury'] });
    expect(args('update')).toEqual([]);
  });

  it('writes nothing when no known injury was given', async () => {
    const { db, rpc } = fakeDb({ data: { id: 'user-1', injuries: [] }, error: null });
    expect((await addInjuries('user-1', ['made_up'], db)).injuries).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('throws a DatabaseError when the call fails or the profile does not exist', async () => {
    await expect(addInjuries('user-1', ['knee_injury'], fakeDb({ data: null, error: { message: 'boom' } }).db)).rejects.toBeInstanceOf(DatabaseError);
    await expect(addInjuries('user-1', ['knee_injury'], fakeDb({ data: [], error: null }).db)).rejects.toBeInstanceOf(DatabaseError);
  });
});

describe('archivePlans', () => {
  it("retires this user's active plans only", async () => {
    const { db, args } = fakeDb({ error: null });
    await archivePlans('user-1', db);
    expect(args('from')).toEqual([['plans']]);
    expect(args('update')).toEqual([[{ status: 'archived' }]]);
    expect(args('eq')).toEqual([
      ['user_id', 'user-1'],
      ['status', 'active'],
    ]);
  });

  it('throws a DatabaseError when the update fails', async () => {
    await expect(archivePlans('user-1', fakeDb({ error: { message: 'boom' } }).db)).rejects.toBeInstanceOf(DatabaseError);
  });
});

describe('deleteAccount', () => {
  it('deletes exactly the given user', async () => {
    const { db, deleteUser } = fakeDb({ data: {}, error: null });
    await deleteAccount('user-1', db);
    expect(deleteUser).toHaveBeenCalledTimes(1);
    expect(deleteUser).toHaveBeenCalledWith('user-1');
  });

  it('throws a DatabaseError when deletion fails', async () => {
    await expect(deleteAccount('user-1', fakeDb({ data: null, error: { message: 'boom' } }).db)).rejects.toBeInstanceOf(DatabaseError);
  });
});
