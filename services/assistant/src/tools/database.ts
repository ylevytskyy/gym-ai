/**
 * Database tools
 * Requirements: 11.4, 11.5, 11.7, 11.8, 11.9
 *
 * Server-side access to Supabase with the secret key. Row Level Security does
 * not apply to this client, so every query here filters by user_id explicitly.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getConfig } from '../config.js';
import { validateWorkoutPlan } from '../validator/index.js';
import { loadCatalog } from './catalog.js';
import {
  DatabaseError,
  ValidationErrorClass,
  type Profile,
  type WorkoutLog,
  type WorkoutPlan,
} from '../types.js';

let client: SupabaseClient | undefined;

/** Lazily create the service-role client from validated config. */
export function getDatabaseClient(): SupabaseClient {
  if (!client) {
    const { supabaseUrl, supabaseSecretKey } = getConfig();
    client = createClient(supabaseUrl, supabaseSecretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

/**
 * Fetch the profile row for a user.
 * Requirement 11.4: throws a clear error when the profile does not exist.
 */
export async function getProfile(
  userId: string,
  db: SupabaseClient = getDatabaseClient(),
): Promise<Profile> {
  const { data, error } = await db
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error || !data) {
    throw new DatabaseError(`Profile not found for user ${userId}`, 'getProfile', error);
  }
  return data as Profile;
}

/**
 * Most recent workout logs for a user, newest first.
 * Requirement 11.5: getRecentLogs(userId, limit)
 */
export async function getRecentLogs(
  userId: string,
  limit: number,
  db: SupabaseClient = getDatabaseClient(),
): Promise<WorkoutLog[]> {
  const { data, error } = await db
    .from('workout_logs')
    .select('*')
    .eq('user_id', userId)
    .order('completed_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new DatabaseError(`Failed to load workout logs for user ${userId}`, 'getRecentLogs', error);
  }
  return (data ?? []) as WorkoutLog[];
}

/**
 * Validate a plan and store it as the user's active plan.
 * Requirements 11.7, 11.8: an invalid plan is never written.
 * Requirement 11.9: returns the inserted plan id.
 */
export async function savePlan(
  userId: string,
  plan: WorkoutPlan,
  provider: string,
  db: SupabaseClient = getDatabaseClient(),
): Promise<string> {
  const validation = validateWorkoutPlan(plan, loadCatalog());
  if (!validation.success) {
    const first = validation.errors[0];
    throw new ValidationErrorClass(
      `Plan failed validation: ${first?.message ?? 'unknown error'}`,
      first?.code ?? 'VALIDATION_FAILED',
      first?.path,
    );
  }

  const { data, error } = await db
    .from('plans')
    .insert({
      user_id: userId,
      schema_version: plan.schema_version,
      plan_json: plan,
      provider,
      status: 'active',
    })
    .select('id')
    .single();

  if (error || !data) {
    throw new DatabaseError(`Failed to save plan for user ${userId}`, 'savePlan', error);
  }
  return (data as { id: string }).id;
}
