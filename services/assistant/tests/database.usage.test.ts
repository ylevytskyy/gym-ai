/**
 * AI usage limits: the database calls behind them (Supabase client faked).
 * The limits themselves are tested in supabase/tests/usage_tests.sql.
 */

import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { finishAiUse, reserveAiUse } from '../src/tools/database';
import { DatabaseError } from '../src/types';

function fakeDb(response: { data?: unknown; error?: { message: string } | null }) {
  const rpc = vi.fn(async (_name: string, _args: unknown) => response);
  return { db: { rpc } as unknown as SupabaseClient, rpc };
}

describe('reserveAiUse', () => {
  it('reserves through the database function and returns the decision', async () => {
    const { db, rpc } = fakeDb({
      data: { allowed: true, duplicate: false, use_id: 'use-1', tier: 'free', limit: 10, remaining: 9, resets_at: '2026-11-13T22:00:00+00:00' },
      error: null,
    });
    const decision = await reserveAiUse('user-1', 'chat_message', 'req-1', db);
    expect(rpc).toHaveBeenCalledWith('reserve_ai_use', { p_user_id: 'user-1', p_action: 'chat_message', p_request_id: 'req-1' });
    expect(decision).toEqual({ allowed: true, duplicate: false, useId: 'use-1', tier: 'free', limit: 10, remaining: 9, resetsAt: '2026-11-13T22:00:00.000Z' });
  });

  it('returns a refusal without a use id', async () => {
    const { db } = fakeDb({
      data: { allowed: false, duplicate: false, use_id: null, tier: 'free', limit: 2, remaining: 0, resets_at: '2026-11-20T21:30:00+00:00' },
      error: null,
    });
    expect(await reserveAiUse('user-1', 'new_plan', 'req-2', db)).toEqual({
      allowed: false,
      duplicate: false,
      useId: null,
      tier: 'free',
      limit: 2,
      remaining: 0,
      resetsAt: '2026-11-20T21:30:00.000Z',
    });
  });

  it('reports a replayed request id as a duplicate', async () => {
    const { db } = fakeDb({
      data: { allowed: false, duplicate: true, use_id: 'use-1', tier: 'free', limit: 10, remaining: 3, resets_at: '2026-11-13T22:00:00+00:00' },
      error: null,
    });
    expect(await reserveAiUse('user-1', 'chat_message', 'req-1', db)).toMatchObject({ allowed: false, duplicate: true, useId: null });
  });

  it('throws a DatabaseError when the database fails, so the request is not let through', async () => {
    const { db } = fakeDb({ data: null, error: { message: 'connection refused' } });
    await expect(reserveAiUse('user-1', 'chat_message', 'req-3', db)).rejects.toBeInstanceOf(DatabaseError);
  });

  it('throws a DatabaseError when the answer has an unexpected shape', async () => {
    const { db } = fakeDb({ data: { allowed: 'yes' }, error: null });
    await expect(reserveAiUse('user-1', 'chat_message', 'req-4', db)).rejects.toBeInstanceOf(DatabaseError);
  });
});

describe('finishAiUse', () => {
  it('marks the use as used or released through the database function', async () => {
    const { db, rpc } = fakeDb({ data: null, error: null });
    await finishAiUse('use-1', true, db);
    await finishAiUse('use-2', false, db);
    expect(rpc).toHaveBeenNthCalledWith(1, 'finish_ai_use', { p_use_id: 'use-1', p_ok: true });
    expect(rpc).toHaveBeenNthCalledWith(2, 'finish_ai_use', { p_use_id: 'use-2', p_ok: false });
  });

  it('throws a DatabaseError when the database fails', async () => {
    const { db } = fakeDb({ data: null, error: { message: 'timeout' } });
    await expect(finishAiUse('use-1', true, db)).rejects.toBeInstanceOf(DatabaseError);
  });
});
