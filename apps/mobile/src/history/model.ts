/** What the History tab shows: finished workouts and how the health days moved. Pure functions. */

import type { HealthDay } from '@aura-fit/health-core';

export interface HistoryLog {
  id: string;
  day_number: number;
  duration_minutes: number;
  rating: number | null;
  completed_at: string;
  health_record_id: string | null;
  /** Sets finished in the session. */
  sets: number;
}

export interface TrendBar {
  day: string;
  /** Height from 0 to 1 relative to the largest day; undefined when the day has no data. */
  steps?: number;
  sleep?: number;
}

export interface HealthTrends {
  /** Days that have at least one measurement. */
  daysWithData: number;
  avgSteps?: number;
  avgSleepMinutes?: number;
  avgRestingHr?: number;
  bars: TrendBar[];
  externalWorkouts: { count: number; minutes: number };
}

const defined = (values: (number | undefined)[]): number[] => values.filter((value): value is number => value !== undefined);
const average = (values: number[]): number | undefined => (values.length === 0 ? undefined : Math.round(values.reduce((a, b) => a + b, 0) / values.length));

/** Averages and day-by-day bars. A day without a value is left out of the average and gets no bar: absent is never zero. */
export function healthTrends(days: HealthDay[]): HealthTrends {
  const steps = defined(days.map((d) => d.steps));
  const sleep = defined(days.map((d) => d.sleep_minutes));
  const restingHr = defined(days.map((d) => d.resting_hr_bpm));
  const maxSteps = Math.max(0, ...steps);
  const maxSleep = Math.max(0, ...sleep);
  const scaled = (value: number | undefined, max: number) => (value === undefined ? undefined : max === 0 ? 0 : value / max);
  const workouts = days.flatMap((d) => d.external_workouts ?? []);

  const avgSteps = average(steps);
  const avgSleepMinutes = average(sleep);
  const avgRestingHr = average(restingHr);
  return {
    daysWithData: days.filter(
      (d) => d.steps !== undefined || d.sleep_minutes !== undefined || d.resting_hr_bpm !== undefined || d.active_energy_kcal !== undefined || d.weight_kg !== undefined,
    ).length,
    ...(avgSteps === undefined ? {} : { avgSteps }),
    ...(avgSleepMinutes === undefined ? {} : { avgSleepMinutes }),
    ...(avgRestingHr === undefined ? {} : { avgRestingHr }),
    bars: days.map((d) => {
      const stepBar = scaled(d.steps, maxSteps);
      const sleepBar = scaled(d.sleep_minutes, maxSleep);
      return { day: d.day, ...(stepBar === undefined ? {} : { steps: stepBar }), ...(sleepBar === undefined ? {} : { sleep: sleepBar }) };
    }),
    externalWorkouts: { count: workouts.length, minutes: workouts.reduce((sum, w) => sum + w.minutes, 0) },
  };
}

/** Workouts finished since Monday 00:00 local time of the current week. */
export function weekSummary(logs: HistoryLog[], now: Date): { workouts: number; minutes: number } {
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const thisWeek = logs.filter((log) => new Date(log.completed_at).getTime() >= monday.getTime());
  return { workouts: thisWeek.length, minutes: thisWeek.reduce((sum, log) => sum + log.duration_minutes, 0) };
}
