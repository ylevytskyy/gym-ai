/**
 * Health summary: what the plan generator is told about a user's recent health days.
 *
 * The window is today and the 14 days before it; step and energy averages leave out today,
 * which is still in progress. A measurement nobody recorded is left out
 * of the summary entirely; it is never reported as zero, because "no data" and "no steps" are
 * different facts and the model must not confuse them.
 */

import { daysBetween } from './days.js';
import { readiness } from './readiness.js';
import type { ExternalWorkoutType, HealthDay, Readiness } from './types.js';

export const SUMMARY_DAYS = 14;
export const EXTERNAL_WORKOUT_DAYS = 7;

export interface HealthSummary {
  /** Days in the window that hold at least one measurement or external workout. */
  days_with_data: number;
  avg_steps?: number;
  avg_sleep_minutes?: number;
  avg_resting_hr_bpm?: number;
  avg_active_energy_kcal?: number;
  /** Sleep of the night that ended today. */
  last_night_sleep_minutes?: number;
  yesterday_steps?: number;
  latest_weight_kg?: number;
  readiness: Readiness;
  /** Workouts Aura Fit did not write, over the last 7 days including today. */
  external_workouts_7d: { count: number; minutes: number; types: ExternalWorkoutType[] };
  external_workout_minutes_today: number;
}

function hasData(day: HealthDay): boolean {
  return (
    day.steps !== undefined ||
    day.active_energy_kcal !== undefined ||
    day.resting_hr_bpm !== undefined ||
    day.sleep_minutes !== undefined ||
    day.weight_kg !== undefined ||
    (day.external_workouts?.length ?? 0) > 0
  );
}

function average(values: Array<number | undefined>, decimals = 0): number | undefined {
  const present = values.filter((v): v is number => v !== undefined);
  if (present.length === 0) return undefined;
  const factor = 10 ** decimals;
  return Math.round((present.reduce((sum, v) => sum + v, 0) / present.length) * factor) / factor;
}

/** Copy `value` under `key` only when it exists (exactOptionalPropertyTypes-safe). */
function put<K extends keyof HealthSummary>(target: HealthSummary, key: K, value: HealthSummary[K] | undefined): void {
  if (value !== undefined) target[key] = value;
}

/**
 * @param days  health days in any order; days after `today` or older than 14 days are ignored
 * @param today the user's local day (YYYY-MM-DD)
 * @returns null when the window holds no data at all
 */
export function summarize(days: HealthDay[], today: string): HealthSummary | null {
  const aged = days
    .map((day) => ({ day, age: daysBetween(day.day, today) }))
    .filter(({ day, age }) => age >= 0 && age <= SUMMARY_DAYS && hasData(day))
    .sort((a, b) => a.age - b.age);
  if (aged.length === 0) return null;

  const window = aged.map(({ day }) => day);
  const at = (age: number): HealthDay | undefined => aged.find((entry) => entry.age === age)?.day;
  const recentWorkouts = aged
    .filter(({ age }) => age < EXTERNAL_WORKOUT_DAYS)
    .flatMap(({ day }) => day.external_workouts ?? []);

  const summary: HealthSummary = {
    days_with_data: window.length,
    readiness: readiness(window, today),
    external_workouts_7d: {
      count: recentWorkouts.length,
      minutes: recentWorkouts.reduce((sum, w) => sum + w.minutes, 0),
      types: [...new Set(recentWorkouts.map((w) => w.type))].sort(),
    },
    external_workout_minutes_today: (at(0)?.external_workouts ?? []).reduce((sum, w) => sum + w.minutes, 0),
  };

  // Steps and energy accumulate through the day, so the unfinished today would drag the averages
  // down. Sleep and resting heart rate for today are already final.
  const finished = aged.filter(({ age }) => age >= 1).map(({ day }) => day);

  put(summary, 'avg_steps', average(finished.map((d) => d.steps)));
  put(summary, 'avg_sleep_minutes', average(window.map((d) => d.sleep_minutes)));
  put(summary, 'avg_resting_hr_bpm', average(window.map((d) => d.resting_hr_bpm), 1));
  put(summary, 'avg_active_energy_kcal', average(finished.map((d) => d.active_energy_kcal)));
  put(summary, 'last_night_sleep_minutes', at(0)?.sleep_minutes);
  put(summary, 'yesterday_steps', at(1)?.steps);
  put(summary, 'latest_weight_kg', window.find((d) => d.weight_kg !== undefined)?.weight_kg);

  return summary;
}
