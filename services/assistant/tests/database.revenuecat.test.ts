/**
 * RevenueCat webhook: the database call behind it (Supabase client faked).
 * The function itself is tested in supabase/tests/revenuecat_tests.sql.
 */

import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { applyRevenueCatEvent } from '../src/tools/database';
import { DatabaseError, type RevenueCatEventInput } from '../src/types';

function fakeDb(response: { data?: unknown; error?: { message: string } | null }) {
  const rpc = vi.fn(async (_name: string, _args: unknown) => response);
  return { db: { rpc } as unknown as SupabaseClient, rpc };
}

const input: RevenueCatEventInput = {
  eventId: 'evt-1',
  eventType: 'INITIAL_PURCHASE',
  environment: 'PRODUCTION',
  userId: 'user-1',
  eventAt: '2026-11-14T10:00:00.000Z',
  action: 'set_expiry',
  expiresAt: '2026-12-14T10:00:00.000Z',
};

describe('applyRevenueCatEvent', () => {
  it('calls apply_revenuecat_event with the event and returns the outcome', async () => {
    const { db, rpc } = fakeDb({ data: 'applied', error: null });
    expect(await applyRevenueCatEvent(input, db)).toBe('applied');
    expect(rpc).toHaveBeenCalledWith('apply_revenuecat_event', {
      p_event_id: 'evt-1',
      p_event_type: 'INITIAL_PURCHASE',
      p_environment: 'PRODUCTION',
      p_user_id: 'user-1',
      p_event_ts: '2026-11-14T10:00:00.000Z',
      p_action: 'set_expiry',
      p_expires_at: '2026-12-14T10:00:00.000Z',
    });
  });

  it.each(['duplicate', 'stale', 'unknown_user'])('passes through %s', async (outcome) => {
    const { db } = fakeDb({ data: outcome, error: null });
    expect(await applyRevenueCatEvent(input, db)).toBe(outcome);
  });

  it('throws a DatabaseError when the database fails, so RevenueCat retries', async () => {
    const { db } = fakeDb({ data: null, error: { message: 'connection refused' } });
    await expect(applyRevenueCatEvent(input, db)).rejects.toBeInstanceOf(DatabaseError);
  });

  it('throws a DatabaseError when the answer is not a known outcome', async () => {
    const { db } = fakeDb({ data: 'maybe', error: null });
    await expect(applyRevenueCatEvent(input, db)).rejects.toBeInstanceOf(DatabaseError);
  });

  it('never puts the event contents in the error message', async () => {
    const { db } = fakeDb({ data: null, error: { message: 'boom' } });
    const err = await applyRevenueCatEvent(input, db).catch((e: Error) => e);
    expect((err as Error).message).not.toContain('user-1');
  });
});
