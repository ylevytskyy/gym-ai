import type { SupabaseClient } from '@supabase/supabase-js';

import type { HistoryLog } from './model';

const HISTORY_LIMIT = 50;

/** The signed-in user's finished workouts, newest first. Throws an Error fit to show when it cannot load. */
export async function loadHistory(client: Pick<SupabaseClient, 'from'>, userId: string): Promise<HistoryLog[]> {
  const { data, error } = await client
    .from('workout_logs')
    .select('id, day_number, duration_minutes, rating, completed_at, health_record_id, exercises_completed')
    .eq('user_id', userId)
    .order('completed_at', { ascending: false })
    .limit(HISTORY_LIMIT);
  if (error) throw new Error('Could not load your workouts. Check your connection and try again.');
  return ((data ?? []) as Record<string, unknown>[]).flatMap((row) => {
    if (typeof row['id'] !== 'string' || typeof row['completed_at'] !== 'string' || !Number.isFinite(new Date(row['completed_at']).getTime())) return [];
    const done = Array.isArray(row['exercises_completed']) ? row['exercises_completed'] : [];
    const sets = done.reduce((sum: number, entry: unknown) => {
      const count = (entry as { sets_done?: unknown } | null)?.sets_done;
      return sum + (typeof count === 'number' && Number.isFinite(count) && count > 0 ? count : 0);
    }, 0);
    return [
      {
        id: row['id'],
        day_number: typeof row['day_number'] === 'number' ? row['day_number'] : 0,
        duration_minutes: typeof row['duration_minutes'] === 'number' ? row['duration_minutes'] : 0,
        rating: typeof row['rating'] === 'number' ? row['rating'] : null,
        completed_at: row['completed_at'],
        health_record_id: typeof row['health_record_id'] === 'string' ? row['health_record_id'] : null,
        sets,
      },
    ];
  });
}
