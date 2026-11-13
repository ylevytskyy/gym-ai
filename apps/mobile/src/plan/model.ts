/**
 * The workout plan as the app uses it: which day to do today, and what a finished session
 * means in numbers. The plan itself is made and validated by the assistant service
 * (schemas/workout-plan.schema.json); the app only checks that what it loaded has the shape
 * it is about to walk through.
 */

import type { WorkoutDay } from '@aura-fit/health-core';

import type { Exercise } from '@/catalog/catalog';
import { localDayOf } from '@/health/local-day';
import type { WorkoutKind } from '@/health/types';

export interface WorkoutPlan {
  schema_version: string;
  id: string;
  created_at: string;
  goal: string;
  days: WorkoutDay[];
  notes: string;
}

export interface StoredPlan {
  id: string;
  plan: WorkoutPlan;
}

export interface WorkoutLogRow {
  id: string;
  plan_id: string | null;
  day_number: number;
  completed_at: string;
  health_record_id: string | null;
}

const positiveInt = (value: unknown): value is number => Number.isInteger(value) && (value as number) > 0;

// Far above anything a real plan holds. The plan schema sets no upper bounds, and the player
// builds one step per set, so an absurd number must not get as far as the player.
const MAX_SETS = 50;
const MAX_AMOUNT = 3600;
const MAX_REST_SECONDS = 3600;

/** True when the value can be walked as a plan: days with blocks with items, all well-formed. */
export function isWorkoutPlan(value: unknown): value is WorkoutPlan {
  const plan = value as Partial<WorkoutPlan> | null;
  if (!plan || typeof plan !== 'object' || !Array.isArray(plan.days) || plan.days.length === 0) return false;
  return plan.days.every(
    (day) =>
      day &&
      positiveInt(day.day) &&
      typeof day.title === 'string' &&
      positiveInt(day.minutes) &&
      Array.isArray(day.blocks) &&
      day.blocks.length > 0 &&
      day.blocks.every(
        (block) =>
          block &&
          ['warm_up', 'main', 'cool_down'].includes(block.type) &&
          Array.isArray(block.items) &&
          block.items.length > 0 &&
          block.items.every(
            (item) =>
              item &&
              typeof item.exercise_id === 'string' &&
              positiveInt(item.sets) &&
              item.sets <= MAX_SETS &&
              positiveInt(item.amount) &&
              item.amount <= MAX_AMOUNT &&
              (item.rest_seconds === undefined ||
                (Number.isInteger(item.rest_seconds) && item.rest_seconds >= 0 && item.rest_seconds <= MAX_REST_SECONDS)),
          ),
      ),
  );
}

export interface TodayPlan {
  day: WorkoutDay;
  /** True when a session of this plan was already finished today. */
  doneToday: boolean;
}

/**
 * The day to show today. Days are done in order and the plan repeats: after the last day
 * comes the first. A session finished today keeps that day on screen until tomorrow.
 */
export function todayPlan(plan: WorkoutPlan, logs: WorkoutLogRow[], now: Date): TodayPlan {
  const ordered = [...plan.days].sort((a, b) => a.day - b.day);
  const first = ordered[0] as WorkoutDay;
  const latest = logs
    .filter((log) => Number.isFinite(Date.parse(log.completed_at)))
    .sort((a, b) => Date.parse(b.completed_at) - Date.parse(a.completed_at))[0];
  if (!latest) return { day: first, doneToday: false };

  const position = ordered.findIndex((day) => day.day === latest.day_number);
  if (localDayOf(new Date(latest.completed_at)) === localDayOf(now)) {
    return { day: ordered[position] ?? first, doneToday: true };
  }
  // An unknown day number (the plan changed) starts the plan over.
  return { day: ordered[(position + 1) % ordered.length] ?? first, doneToday: false };
}

/** What kind of workout the health store should record for a day, from what dominates its main work. */
export function sessionKind(day: WorkoutDay, exercise: (id: string) => Exercise | undefined): WorkoutKind {
  const groups = day.blocks
    .filter((block) => block.type === 'main')
    .flatMap((block) => block.items.map((item) => exercise(item.exercise_id)?.group))
    .filter((group): group is Exercise['group'] => group !== undefined);
  if (groups.length === 0) return 'mobility';
  const count = (wanted: Exercise['group'][]) => groups.filter((group) => wanted.includes(group)).length;
  if (count(['warm_up']) === groups.length) return 'mobility';
  return count(['cardio']) > groups.length / 2 ? 'hiit' : 'strength';
}

/**
 * Active energy for the time actually spent working: (MET - 1) x body weight (kg) x hours,
 * summed per exercise. One MET is what the body burns at rest, which the health stores count
 * separately, so it is left out. Rest between sets is not counted. An estimate, like every
 * MET-based figure.
 */
export function estimateEnergyKcal(
  workMsByExercise: Record<string, number>,
  weightKg: number,
  exercise: (id: string) => Exercise | undefined,
): number {
  let kcal = 0;
  for (const [id, ms] of Object.entries(workMsByExercise)) {
    const met = exercise(id)?.met;
    if (met && met > 1 && ms > 0 && weightKg > 0) kcal += (met - 1) * weightKg * (ms / 3_600_000);
  }
  return Math.round(kcal * 10) / 10;
}
