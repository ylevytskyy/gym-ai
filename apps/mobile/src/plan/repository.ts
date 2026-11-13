/** The signed-in user's plan and workout logs in Supabase, and plan generation through the assistant service. */

import type { SupabaseClient } from '@supabase/supabase-js';

import { parseUsage, type Usage } from '@/assistant/usage';

import { isWorkoutPlan, type StoredPlan, type WorkoutLogRow } from './model';

export type PlanClient = Pick<SupabaseClient, 'from'>;

/**
 * An error whose message is fit to show to the user. `usage` is set when the AI allowance is used
 * up; `duplicate` when the same request was already counted, so the plan may still appear.
 */
export class PlanError extends Error {
  constructor(
    message: string,
    readonly usage?: Usage,
    readonly duplicate = false,
  ) {
    super(message);
  }
}

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

export interface PlanAnswer {
  stored: StoredPlan;
  /** The allowance after this plan, or null when the service did not say. */
  usage: Usage | null;
}

/** Words for a failed response. Server text can carry details that mean nothing to the user; only the status and code decide. */
function failure(status: number, body: unknown): PlanError {
  const code = (body as { error?: unknown } | null)?.error;
  if (status === 401) return new PlanError('Your session has expired. Sign in again.');
  if (status === 400) return new PlanError('A plan could not be made this time. Try again.');
  if (status === 429 && code === 'USAGE_LIMIT') {
    return new PlanError('You have used your new plans for now.', parseUsage((body as { details?: unknown }).details) ?? undefined);
  }
  if (status === 429) return new PlanError('You have asked for a lot in a short time. Wait a few minutes and try again.');
  if (status === 409) return new PlanError('This plan was already asked for. It shows here once it is ready.', undefined, true);
  if (status === 503) return new PlanError('New plans are not available right now. Try again in a few minutes.');
  return new PlanError('The plan service is not available right now. Try again later.');
}

/**
 * Asks the assistant service for a new plan. The service validates and stores it; this returns it.
 * `idempotencyKey` is new for each time the user asks and the same when that request is sent again.
 */
export async function requestPlan(
  fetchFn: typeof fetch,
  assistantUrl: string,
  accessToken: string,
  request: PlanRequest,
  idempotencyKey: string,
  timeoutMs = GENERATION_TIMEOUT_MS,
): Promise<PlanAnswer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetchFn(`${assistantUrl}/api/plans/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}`, 'idempotency-key': idempotencyKey },
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

  // The time limit covers reading the body too: headers can arrive long before the plan does.
  const body = (await response.json().catch(() => null)) as { id?: unknown; plan?: unknown; usage?: unknown } | null;
  clearTimeout(timer);
  if (!response.ok) throw failure(response.status, body);
  if (controller.signal.aborted) throw new PlanError('Making your plan took too long. Try again.');
  if (!body || typeof body.id !== 'string' || !isWorkoutPlan(body.plan)) {
    throw new PlanError('The plan that came back could not be read. Try again.');
  }
  return { stored: { id: body.id, plan: body.plan }, usage: parseUsage(body.usage) };
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
