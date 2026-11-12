/**
 * Health tools: read a user's health days and reduce them to the summary the plan generator sees.
 *
 * Health days are the only health data the server holds (docs/adr/0001-health-days-on-server.md).
 * This client uses the secret key, so Row Level Security does not apply: every query here
 * filters by user_id explicitly.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { Ajv2020, type ValidateFunction } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {
  addDays,
  localDay,
  summarize,
  SUMMARY_DAYS,
  type ExternalWorkout,
  type HealthDay,
  type HealthSummary,
} from '@aura-fit/health-core';
import { getDatabaseClient } from './database.js';
import { loadRepoJson } from '../repo-files.js';
import { DatabaseError } from '../types.js';

/** A health_days row as PostgREST returns it. NUMERIC columns may arrive as strings. */
type HealthDayRow = Record<string, unknown>;

const COLUMNS =
  'day, tz, platform, steps, active_energy_kcal, resting_hr_bpm, sleep_minutes, weight_kg, external_workouts';

const MEASUREMENTS = ['steps', 'active_energy_kcal', 'resting_hr_bpm', 'sleep_minutes', 'weight_kg'] as const;

/**
 * The health-day contract decides what a row may contribute. The table has its own checks, but
 * the app writes it directly, so each field is checked again here against
 * schemas/health-day.schema.json before it can reach a rule or the model prompt.
 */
interface HealthDaySchema {
  properties: Record<string, object> & { external_workouts: { items: object; maxItems: number } };
}

let fieldChecks: { field: Record<string, ValidateFunction>; workout: ValidateFunction; maxWorkouts: number } | undefined;

function checks(): NonNullable<typeof fieldChecks> {
  if (!fieldChecks) {
    const schema = loadRepoJson<HealthDaySchema>('schemas/health-day.schema.json');
    const ajv = new Ajv2020({ allErrors: false, strict: true });
    (addFormats as unknown as (a: Ajv2020) => void)(ajv);
    const field: Record<string, ValidateFunction> = {};
    for (const name of [...MEASUREMENTS, 'tz', 'platform', 'day']) {
      const sub = schema.properties[name];
      if (!sub) throw new Error(`health-day schema has no property ${name}`);
      field[name] = ajv.compile(sub);
    }
    fieldChecks = {
      field,
      workout: ajv.compile(schema.properties.external_workouts.items),
      maxWorkouts: schema.properties.external_workouts.maxItems,
    };
  }
  return fieldChecks;
}

/**
 * A row as a health day. NULL means the health store had no data: the field is left out, never
 * turned into zero. A value outside the contract is left out the same way, and an external
 * workout that does not match the contract is dropped.
 */
function toHealthDay(row: HealthDayRow): HealthDay | undefined {
  const { field, workout, maxWorkouts } = checks();
  if (!field['day']?.(row['day']) || !field['platform']?.(row['platform'])) return undefined;

  const day: HealthDay = {
    day: row['day'] as string,
    tz: field['tz']?.(row['tz']) ? (row['tz'] as string) : 'UTC',
    platform: row['platform'] as HealthDay['platform'],
  };

  for (const name of MEASUREMENTS) {
    const raw = row[name];
    if (raw === null || raw === undefined) continue;
    const value = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
    if (field[name]?.(value)) day[name] = value as number;
  }

  const workouts = row['external_workouts'];
  if (Array.isArray(workouts)) {
    const valid = workouts.filter((item) => workout(item)).slice(0, maxWorkouts) as ExternalWorkout[];
    if (valid.length > 0) day.external_workouts = valid;
  }
  return day;
}

/** A user's health days from fromDay to toDay (both YYYY-MM-DD, inclusive), newest first. */
export async function getHealthDays(
  userId: string,
  fromDay: string,
  toDay: string,
  db: SupabaseClient = getDatabaseClient(),
): Promise<HealthDay[]> {
  const { data, error } = await db
    .from('health_days')
    .select(COLUMNS)
    .eq('user_id', userId)
    .gte('day', fromDay)
    .lte('day', toDay)
    .order('day', { ascending: false });

  if (error) {
    throw new DatabaseError(`Failed to load health days for user ${userId}`, 'getHealthDays', error);
  }
  return ((data ?? []) as unknown as HealthDayRow[]).flatMap((row) => toHealthDay(row) ?? []);
}

/**
 * The health summary for a user as of `now`, or null when they have no recent health days
 * (they never connected Health, or turned sync off).
 *
 * The server does not know the user's time zone up front, so it reads one day either side of
 * the UTC day and then cuts to the user's local day, taken from their most recent health day.
 */
export async function getHealthSummary(
  userId: string,
  now: Date = new Date(),
  db: SupabaseClient = getDatabaseClient(),
): Promise<HealthSummary | null> {
  const utcDay = now.toISOString().slice(0, 10);
  const days = await getHealthDays(userId, addDays(utcDay, -(SUMMARY_DAYS + 1)), addDays(utcDay, 1), db);

  const latest = days[0];
  if (!latest) return null;

  const today = localDay(now, latest.tz);
  return summarize(days.filter((d) => d.day <= today), today);
}
