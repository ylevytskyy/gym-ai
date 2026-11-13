/**
 * Sync: copying health days from the phone to the server (table `health_days`).
 *
 * Only the daily totals are sent, never a reading (docs/adr/0001-health-days-on-server.md).
 * The same days are re-sent whenever they change, because watches and other apps deliver data
 * late; the row of a day is replaced, and a measurement that is no longer there becomes NULL.
 */

import type { HealthDay } from '@aura-fit/health-core';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Today and the 14 days before it: what readiness needs, and what is synced. */
export const HISTORY_DAYS = 14;

export type SyncClient = Pick<SupabaseClient, 'from'>;

/** A health day as a row: every column present, NULL where the day has no data. */
export function toRow(userId: string, day: HealthDay) {
  return {
    user_id: userId,
    day: day.day,
    tz: day.tz,
    platform: day.platform,
    steps: day.steps ?? null,
    active_energy_kcal: day.active_energy_kcal ?? null,
    resting_hr_bpm: day.resting_hr_bpm ?? null,
    sleep_minutes: day.sleep_minutes ?? null,
    weight_kg: day.weight_kg ?? null,
    external_workouts: day.external_workouts ?? [],
  };
}

export type SyncResult = 'synced' | 'unchanged' | 'failed';
export interface HealthSync {
  (userId: string, days: HealthDay[]): Promise<SyncResult>;
  /** Forget what was sent for a user, so the next sync sends again (after disconnect or a delete). */
  forget(userId: string): void;
}

/**
 * A sync function that remembers what it last sent for each user and skips an identical send.
 * It never throws: syncing is background work and must not disturb the screen that triggered it.
 */
export function createHealthSync(client: SyncClient): HealthSync {
  const lastSent = new Map<string, string>();

  const sync = async (userId: string, days: HealthDay[]): Promise<SyncResult> => {
    if (days.length === 0) return 'unchanged';
    const rows = days.map((day) => toRow(userId, day));
    const fingerprint = JSON.stringify(rows);
    if (lastSent.get(userId) === fingerprint) return 'unchanged';

    try {
      const { error } = await client.from('health_days').upsert(rows, { onConflict: 'user_id,day' });
      if (error) return 'failed';
    } catch {
      return 'failed';
    }
    lastSent.set(userId, fingerprint);
    return 'synced';
  };
  return Object.assign(sync, { forget: (userId: string) => void lastSent.delete(userId) });
}
