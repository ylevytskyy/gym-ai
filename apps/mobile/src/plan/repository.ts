/** The signed-in user's plan and workout logs in Supabase, and plan generation through the assistant service. */

import type { SupabaseClient } from '@supabase/supabase-js';

import { isWorkoutPlan, type StoredPlan, type WorkoutLogRow } from './model';

export type PlanClient = Pick<SupabaseClient, 'from'>;

/** An error whose message is fit to show to the user. */
export class PlanError extends Error {}

export async function loadActivePlan(client: PlanClient, userId: string): Promise<StoredPlan | null> {
  const { data, error } = await client
    .from('plans')
    .select('id, plan_json')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new PlanError('Could not load your plan. Check your connection and try again.');
  if (!data) return null;
  const row = data as { id: string; plan_json: unknown };
  if (!isWorkoutPlan(row.plan_json)) throw new PlanError('Your plan could not be read. Create a new one.');
  return { id: row.id, plan: row.plan_json };
}

export async function loadPlanLogs(client: PlanClient, userId: string, planId: string): Promise<WorkoutLogRow[]> {
  const { data, error } = await client
    .from('workout_logs')
    .select('id, plan_id, day_number, completed_at, health_record_id')
    .eq('user_id', userId)
    .eq('plan_id', planId)
    .order('completed_at', { ascending: false })
    .limit(20);
  if (error) throw new PlanError('Could not load your workouts. Check your connection and try again.');
  return (data ?? []) as WorkoutLogRow[];
}

export interface PlanRequest {
  duration_days: number;
  focus_areas: string[];
}

const GENERATION_TIMEOUT_MS = 60_000;

/** Asks the assistant service for a new plan. The service validates and stores it; this returns it. */
export async function requestPlan(
  fetchFn: typeof fetch,
  assistantUrl: string,
  accessToken: string,
  request: PlanRequest,
  timeoutMs = GENERATION_TIMEOUT_MS,
): Promise<StoredPlan> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetchFn(`${assistantUrl}/api/plans/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
  } catch {
    clearTimeout(timer);
    throw new PlanError(
      controller.signal.aborted
        ? 'Making your plan took too long. Try again.'
        : 'Could not reach the plan service. Check your connection and try again.',
    );
  }

  if (response.status === 401 || !response.ok) {
    clearTimeout(timer);
    if (response.status === 401) throw new PlanError('Your session has expired. Sign in again.');
    // Server text can carry details that mean nothing to the user; only the status decides the message.
    throw new PlanError(
      response.status === 400 ? 'A plan could not be made this time. Try again.' : 'The plan service is not available right now. Try again later.',
    );
  }

  // The time limit covers reading the body too: headers can arrive long before the plan does.
  const body = (await response.json().catch(() => null)) as { id?: unknown; plan?: unknown } | null;
  clearTimeout(timer);
  if (controller.signal.aborted) throw new PlanError('Making your plan took too long. Try again.');
  if (!body || typeof body.id !== 'string' || !isWorkoutPlan(body.plan)) {
    throw new PlanError('The plan that came back could not be read. Try again.');
  }
  return { id: body.id, plan: body.plan };
}

export interface NewWorkoutLog {
  /** Chosen by the app, so saving the same session twice cannot create two rows. */
  id: string;
  plan_id: string;
  day_number: number;
  exercises_completed: { exercise_id: string; sets_done: number }[];
  duration_minutes: number;
  rating: number | null;
  completed_at: string;
}

const UNIQUE_VIOLATION = '23505';

/**
 * Saves a finished session. Saving the same id again is not an error: the row is already
 * there, and the caller is told so.
 */
export async function saveWorkoutLog(client: PlanClient, userId: string, log: NewWorkoutLog): Promise<'created' | 'existed'> {
  const { error } = await client.from('workout_logs').insert({ user_id: userId, ...log });
  if (!error) return 'created';
  if ((error as { code?: string }).code === UNIQUE_VIOLATION) return 'existed';
  throw new PlanError('Could not save your workout. Check your connection and try again.');
}

/** The health-store record a log points to; null when it has none (or the log is not this user's). */
export async function loadHealthRecordId(client: PlanClient, userId: string, logId: string): Promise<string | null> {
  const { data, error } = await client.from('workout_logs').select('health_record_id').eq('id', logId).eq('user_id', userId).maybeSingle();
  if (error) throw new PlanError('Could not check the saved workout. Check your connection and try again.');
  return (data as { health_record_id: string | null } | null)?.health_record_id ?? null;
}

export async function attachHealthRecord(client: PlanClient, userId: string, logId: string, recordId: string): Promise<void> {
  const { error } = await client.from('workout_logs').update({ health_record_id: recordId }).eq('id', logId).eq('user_id', userId);
  if (error) throw new PlanError('Could not link the workout to Health.');
}
