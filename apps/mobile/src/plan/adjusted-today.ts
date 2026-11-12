/**
 * Today's session after the health adjustment: what the plan says, changed by how the user
 * slept and what they already did today. The rules live in packages/health-core and are
 * deterministic; this file only gathers their inputs and words the reason.
 */

import { adjustDay, readiness, type AdjustmentChange, type HealthDay, type Readiness, type ReadinessReason, type WorkoutDay } from '@aura-fit/health-core';

import { catalog } from '@/catalog/catalog';

import { todayPlan, type WorkoutLogRow, type WorkoutPlan } from './model';

export interface AdjustedToday {
  day: WorkoutDay;
  doneToday: boolean;
  /** Present only when the session differs from the plan. */
  adjustment?: { changes: AdjustmentChange[]; readiness: Readiness; externalWorkoutMinutes: number; reason: string };
}

const REASONS: Record<ReadinessReason, string> = {
  short_sleep: 'you slept less than 6 hours',
  sleep_below_baseline: 'you slept much less than usual',
  resting_hr_elevated: 'your resting heart rate is higher than usual',
  well_recovered: 'you slept well',
  not_enough_data: '',
};

/** Why the session changed, in one sentence. A training suggestion, never a health statement. */
export function explain(changes: AdjustmentChange[], state: Readiness, externalWorkoutMinutes: number): string {
  if (changes.includes('mobility_swap')) {
    return `You already trained for ${externalWorkoutMinutes} minutes today, so this session is mobility work instead.`;
  }
  const because = state.reasons.map((reason) => REASONS[reason]).filter(Boolean).join(' and ');
  if (changes.includes('sets_added')) return `One more set today${because ? `: ${because}` : ''}.`;
  return `A lighter session today${because ? `: ${because}` : ''}.`;
}

export function adjustedToday(
  plan: WorkoutPlan,
  logs: WorkoutLogRow[],
  now: Date,
  today: string,
  /** Recent health days; empty when Health is not connected. */
  healthDays: HealthDay[],
  profile: { fitness_level: 1 | 2 | 3; injuries: string[] } | null,
): AdjustedToday {
  const planned = todayPlan(plan, logs, now);
  // A session that is already done is shown as it was done, not re-adjusted after the fact.
  if (healthDays.length === 0 || !profile || planned.doneToday) return planned;

  const state = readiness(healthDays, today);
  const externalWorkoutMinutes = (healthDays.find((day) => day.day === today)?.external_workouts ?? []).reduce((sum, w) => sum + w.minutes, 0);
  const { day, changes } = adjustDay(
    planned.day,
    { readiness: state.level, externalWorkoutMinutes, fitnessLevel: profile.fitness_level, injuries: profile.injuries },
    catalog,
  );
  if (changes.length === 0) return planned;
  return { ...planned, day, adjustment: { changes, readiness: state, externalWorkoutMinutes, reason: explain(changes, state, externalWorkoutMinutes) } };
}
