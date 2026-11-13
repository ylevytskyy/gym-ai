/**
 * The health section of the plan-generation prompt. Shared by every provider.
 *
 * Only what the summary holds is written: a measurement with no data produces no line, so the
 * model never reads a missing value as zero.
 */

import type { HealthSummary } from '@aura-fit/health-core';

const HEALTH_HEADING = '## Health data';

function hoursAndMinutes(minutes: number): string {
  return `${Math.floor(minutes / 60)} h ${Math.round(minutes % 60)} min`;
}

export function buildHealthSection(health: HealthSummary | null | undefined): string[] {
  if (!health) {
    return [
      HEALTH_HEADING,
      'No health data is available for this user. Do not assume anything about their activity or recovery; plan from the profile alone.',
    ];
  }

  const lines = [HEALTH_HEADING, `Totals from the user's phone. Days with data (today and the 14 days before): ${health.days_with_data}.`];
  const add = (label: string, value: string | number | undefined): void => {
    if (value !== undefined) lines.push(`- ${label}: ${value}`);
  };

  add('Average steps per day', health.avg_steps);
  add('Average active energy per day', health.avg_active_energy_kcal === undefined ? undefined : `${health.avg_active_energy_kcal} kcal`);
  add('Average sleep', health.avg_sleep_minutes === undefined ? undefined : hoursAndMinutes(health.avg_sleep_minutes));
  add('Average resting heart rate', health.avg_resting_hr_bpm === undefined ? undefined : `${health.avg_resting_hr_bpm} bpm`);
  add('Last night', health.last_night_sleep_minutes === undefined ? undefined : hoursAndMinutes(health.last_night_sleep_minutes));
  add('Steps yesterday', health.yesterday_steps);
  add('Most recent weight', health.latest_weight_kg === undefined ? undefined : `${health.latest_weight_kg} kg`);

  const reasons = health.readiness.reasons.map((r) => r.replace(/_/g, ' ')).join(', ');
  add('Readiness today', reasons ? `${health.readiness.level} (${reasons})` : health.readiness.level);

  const workouts = health.external_workouts_7d;
  add(
    'Workouts recorded by other apps in the last 7 days',
    workouts.count === 0 ? 'none' : `${workouts.count} (${workouts.minutes} min; ${workouts.types.join(', ')})`,
  );
  if (health.external_workout_minutes_today > 0) {
    add('Workouts recorded by other apps today', `${health.external_workout_minutes_today} min`);
  }

  lines.push(
    '',
    'Use this to set volume and intensity: start gentler when readiness is low or the user is mostly sedentary, and leave room for recovery around the workouts they already do elsewhere.',
    'This is a training hint, not a medical assessment: do not diagnose or mention health conditions in the plan notes.',
    'Health data never overrides the safety rules below.',
  );
  return lines;
}

/**
 * The same text with the health section's contents removed, for anything that is logged.
 * Health values must not reach logs at any level.
 */
export function redactHealth(text: string): string {
  const start = text.indexOf(HEALTH_HEADING);
  if (start === -1) return text;
  const next = text.indexOf('\n## ', start + HEALTH_HEADING.length);
  const rest = next === -1 ? '' : `\n${text.slice(next)}`;
  return `${text.slice(0, start)}${HEALTH_HEADING}\n[redacted]${rest}`;
}
