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
import { KNOWN_INJURIES } from '../providers/chat-prompt.js';
import {
  DatabaseError,
  ValidationErrorClass,
  type ChatTurn,
  type Profile,
  type RevenueCatDbOutcome,
  type RevenueCatEventInput,
  type UsageAction,
  type UsageDecision,
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

/** The user's newest active plan, or null when they have none (or the stored one is no longer valid). */
export async function getActivePlan(
  userId: string,
  db: SupabaseClient = getDatabaseClient(),
): Promise<{ id: string; plan: WorkoutPlan } | null> {
  const { data, error } = await db
    .from('plans')
    .select('id, plan_json')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new DatabaseError(`Failed to load the active plan for user ${userId}`, 'getActivePlan', error);
  }
  if (!data) return null;
  const row = data as { id: string; plan_json: WorkoutPlan };
  // A plan stored before the catalog changed may no longer be valid; it is not handed to the model.
  if (!validateWorkoutPlan(row.plan_json, loadCatalog()).success) return null;
  return { id: row.id, plan: row.plan_json };
}

/** The user's last `limit` chat turns, oldest first. */
export async function getMessages(
  userId: string,
  limit: number,
  db: SupabaseClient = getDatabaseClient(),
): Promise<ChatTurn[]> {
  const { data, error } = await db
    .from('assistant_messages')
    .select('role, content')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new DatabaseError(`Failed to load messages for user ${userId}`, 'getMessages', error);
  }
  return ((data ?? []) as Array<{ role: string; content: string }>)
    .filter((row): row is ChatTurn => (row.role === 'user' || row.role === 'assistant') && typeof row.content === 'string')
    .reverse();
}

/** Stores one exchange: the user's message, then the reply. */
export async function saveMessages(
  userId: string,
  message: string,
  reply: string,
  db: SupabaseClient = getDatabaseClient(),
  now: Date = new Date(),
): Promise<void> {
  const { error } = await db.from('assistant_messages').insert([
    { user_id: userId, role: 'user', content: message, created_at: now.toISOString() },
    // One millisecond later, so the pair always reads back in order.
    { user_id: userId, role: 'assistant', content: reply, created_at: new Date(now.getTime() + 1).toISOString() },
  ]);
  if (error) {
    throw new DatabaseError(`Failed to store messages for user ${userId}`, 'saveMessages', error);
  }
}

/**
 * Adds injuries to the profile and returns the updated profile. Only injuries the catalog
 * knows are written, and none is ever removed: this can only make plans more careful.
 * The append is one database statement, so two requests at once cannot lose an injury.
 */
export async function addInjuries(
  userId: string,
  injuries: string[],
  db: SupabaseClient = getDatabaseClient(),
): Promise<Profile> {
  const known = [...new Set(injuries)].filter((injury) => KNOWN_INJURIES.includes(injury));
  if (known.length === 0) return getProfile(userId, db);

  const { data, error } = await db.rpc('add_profile_injuries', { p_user_id: userId, p_injuries: known });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row) {
    throw new DatabaseError(`Failed to update injuries for user ${userId}`, 'addInjuries', error);
  }
  return row as Profile;
}

/** Retires the user's active plans, so the app offers to make a new one. */
export async function archivePlans(userId: string, db: SupabaseClient = getDatabaseClient()): Promise<void> {
  const { error } = await db.from('plans').update({ status: 'archived' }).eq('user_id', userId).eq('status', 'active');
  if (error) {
    throw new DatabaseError(`Failed to archive plans for user ${userId}`, 'archivePlans', error);
  }
}

/** Deletes the user. Their profile, plans, logs, messages and health days go with them (ON DELETE CASCADE). */
export async function deleteAccount(userId: string, db: SupabaseClient = getDatabaseClient()): Promise<void> {
  const { error } = await db.auth.admin.deleteUser(userId);
  if (error) {
    throw new DatabaseError(`Failed to delete user ${userId}`, 'deleteAccount', error);
  }
}

/**
 * Reserves one AI use for the user, or refuses when the allowance is used up. The check and the
 * reservation are one database call, so parallel requests cannot both take the last use.
 * Any failure throws: a request is never let through without being counted.
 */
export async function reserveAiUse(
  userId: string,
  action: UsageAction,
  requestId: string,
  db: SupabaseClient = getDatabaseClient(),
): Promise<UsageDecision> {
  const { data, error } = await db.rpc('reserve_ai_use', { p_user_id: userId, p_action: action, p_request_id: requestId });
  const row = data as Record<string, unknown> | null;
  if (
    error ||
    !row ||
    typeof row['allowed'] !== 'boolean' ||
    typeof row['duplicate'] !== 'boolean' ||
    (row['tier'] !== 'free' && row['tier'] !== 'pro') ||
    typeof row['limit'] !== 'number' ||
    typeof row['remaining'] !== 'number' ||
    typeof row['resets_at'] !== 'string' ||
    Number.isNaN(Date.parse(row['resets_at'])) ||
    (row['allowed'] === true && typeof row['use_id'] !== 'string')
  ) {
    throw new DatabaseError(`Failed to check the AI allowance for user ${userId}`, 'reserveAiUse', error);
  }
  return {
    allowed: row['allowed'],
    duplicate: row['duplicate'],
    useId: row['allowed'] ? (row['use_id'] as string) : null,
    tier: row['tier'],
    limit: row['limit'],
    remaining: row['remaining'],
    resetsAt: new Date(row['resets_at']).toISOString(),
  };
}

/** Marks a reserved use as used (ok) or released (the request failed, so it does not count). */
export async function finishAiUse(useId: string, ok: boolean, db: SupabaseClient = getDatabaseClient()): Promise<void> {
  const { error } = await db.rpc('finish_ai_use', { p_use_id: useId, p_ok: ok });
  if (error) {
    throw new DatabaseError(`Failed to finish AI use ${useId}`, 'finishAiUse', error);
  }
}

/**
 * Records one verified RevenueCat event and updates the user's entitlement in one database
 * transaction. Any failure throws, so the webhook answers 500 and RevenueCat retries; the
 * transaction leaves no event row behind in that case. The message carries no user data.
 */
export async function applyRevenueCatEvent(
  input: RevenueCatEventInput,
  db: SupabaseClient = getDatabaseClient(),
): Promise<RevenueCatDbOutcome> {
  const { data, error } = await db.rpc('apply_revenuecat_event', {
    p_event_id: input.eventId,
    p_event_type: input.eventType,
    p_environment: input.environment,
    p_user_id: input.userId,
    p_event_ts: input.eventAt,
    p_action: input.action,
    p_expires_at: input.expiresAt,
  });
  if (error || (data !== 'applied' && data !== 'duplicate' && data !== 'stale' && data !== 'unknown_user')) {
    throw new DatabaseError('Failed to apply a RevenueCat event', 'applyRevenueCatEvent', error);
  }
  return data;
}
