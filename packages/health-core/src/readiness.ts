/**
 * Readiness: a training suggestion for today, derived from recent health days.
 * It is not a health assessment and must never be presented as one.
 *
 * The baseline is the median of the 14 days before today. A measurement takes part only when
 * today has a value for it and at least 5 baseline days do; with no such measurement the
 * result is `unknown`. A phone without a watch usually has no resting heart rate, so the rule
 * has to work on sleep alone.
 */

import { daysBetween, median } from './days.js';
import type { HealthDay, Readiness, ReadinessReason } from './types.js';

export const BASELINE_DAYS = 14;
export const MIN_BASELINE_DAYS = 5;
export const SHORT_SLEEP_MINUTES = 360;
export const SLEEP_BASELINE_RATIO = 0.8;
export const RESTING_HR_RATIO = 1.07;

const EPSILON = 1e-9;

/** Today's value and the baseline median for one measurement, when both exist. */
function compare(
  days: HealthDay[],
  today: string,
  pick: (day: HealthDay) => number | undefined,
): { value: number; base: number } | undefined {
  const value = days.map((d) => (d.day === today ? pick(d) : undefined)).find((v) => v !== undefined);
  if (value === undefined) return undefined;

  const history = days.flatMap((d) => {
    const age = daysBetween(d.day, today);
    const v = pick(d);
    return age >= 1 && age <= BASELINE_DAYS && v !== undefined ? [v] : [];
  });
  if (history.length < MIN_BASELINE_DAYS) return undefined;

  const base = median(history);
  return base === undefined ? undefined : { value, base };
}

/**
 * @param days  health days in any order; days outside the 14-day window are ignored
 * @param today the local day to judge (YYYY-MM-DD); its sleep is the night that ended on it
 */
export function readiness(days: HealthDay[], today: string): Readiness {
  const sleep = compare(days, today, (d) => d.sleep_minutes);
  const restingHr = compare(days, today, (d) => d.resting_hr_bpm);

  if (!sleep && !restingHr) {
    return { level: 'unknown', reasons: ['not_enough_data'] };
  }

  const reasons: ReadinessReason[] = [];
  if (sleep && sleep.value < SHORT_SLEEP_MINUTES) reasons.push('short_sleep');
  if (sleep && sleep.value < sleep.base * SLEEP_BASELINE_RATIO - EPSILON) reasons.push('sleep_below_baseline');
  if (restingHr && restingHr.value >= restingHr.base * RESTING_HR_RATIO - EPSILON) reasons.push('resting_hr_elevated');
  if (reasons.length > 0) return { level: 'low', reasons };

  // High needs a good night; a low resting heart rate alone is not enough to push harder.
  const sleptWell = sleep !== undefined && sleep.value >= sleep.base;
  const heartCalm = restingHr === undefined || restingHr.value <= restingHr.base;
  if (sleptWell && heartCalm) return { level: 'high', reasons: ['well_recovered'] };

  return { level: 'normal', reasons: [] };
}
