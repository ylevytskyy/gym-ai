/**
 * Turns platform-neutral readings into health days.
 *
 * Both adapters end here, so this is where the health-day contract
 * (schemas/health-day.schema.json) is enforced on the phone: totals are rounded to the
 * contract's precision, anything outside its ranges is dropped, and a day with no reading for
 * a measurement simply has no field for it. An absent field means "no data", never zero.
 */

import type { ExternalWorkout, HealthDay } from '@aura-fit/health-core';

import { daysInRange, localDayOf } from './local-day';
import type { RawHealth } from './types';

export interface BuildOptions {
  from: string;
  to: string;
  tz: string;
  platform: 'ios' | 'android';
}

/** A night belongs to the day it ended on. Sleep ending after 18:00 counts toward the next day. */
const SLEEP_DAY_SHIFT_MS = 6 * 3_600_000;
const MAX_EXTERNAL_WORKOUTS = 50;

const round1 = (value: number): number => Math.round(value * 10) / 10;

/** The value when it is a finite number inside [min, max] after rounding; otherwise undefined. */
function within(value: number, min: number, max: number, round: (v: number) => number): number | undefined {
  if (!Number.isFinite(value)) return undefined;
  const rounded = round(value);
  return rounded >= min && rounded <= max ? rounded : undefined;
}

/** Total length of the union of the intervals, so time two sources both recorded counts once. */
function mergeIntervals(intervals: { start: Date; end: Date }[]): { start: number; end: number }[] {
  const sorted = intervals
    .map(({ start, end }) => ({ start: start.getTime(), end: end.getTime() }))
    .filter(({ start, end }) => Number.isFinite(start) && Number.isFinite(end) && end > start)
    .sort((a, b) => a.start - b.start);

  const merged: { start: number; end: number }[] = [];
  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (last && interval.start <= last.end) last.end = Math.max(last.end, interval.end);
    else merged.push({ ...interval });
  }
  return merged;
}

function sumByDay(readings: { day: string; value: number }[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const { day, value } of readings) {
    if (Number.isFinite(value)) totals.set(day, (totals.get(day) ?? 0) + value);
  }
  return totals;
}

export function buildHealthDays(raw: RawHealth, options: BuildOptions): HealthDay[] {
  const steps = sumByDay(raw.steps);
  const energy = sumByDay(raw.activeEnergyKcal);
  const restingHr = new Map(raw.restingHrBpm.map(({ day, value }) => [day, value]));

  const weight = new Map<string, { at: number; value: number }>();
  for (const { at, value } of raw.weightKg) {
    const day = localDayOf(at);
    const known = weight.get(day);
    if (!known || at.getTime() > known.at) weight.set(day, { at: at.getTime(), value });
  }

  const sleepMs = new Map<string, number>();
  for (const { start, end } of mergeIntervals(raw.sleep)) {
    const day = localDayOf(new Date(end + SLEEP_DAY_SHIFT_MS));
    sleepMs.set(day, (sleepMs.get(day) ?? 0) + (end - start));
  }

  const workouts = new Map<string, ExternalWorkout[]>();
  for (const workout of raw.workouts) {
    if (workout.own) continue;
    const minutes = within((workout.end.getTime() - workout.start.getTime()) / 60_000, 1, 1440, Math.round);
    if (minutes === undefined) continue;
    const entry: ExternalWorkout = { type: workout.type, minutes };
    const energyKcal = workout.energyKcal === undefined ? undefined : within(workout.energyKcal, 0, 20_000, round1);
    if (energyKcal !== undefined) entry.energy_kcal = energyKcal;
    const day = localDayOf(workout.start);
    const list = workouts.get(day) ?? [];
    if (list.length < MAX_EXTERNAL_WORKOUTS) list.push(entry);
    workouts.set(day, list);
  }

  return daysInRange(options.from, options.to).map((day) => {
    const built: HealthDay = { day, tz: options.tz, platform: options.platform };

    const put = <K extends 'steps' | 'active_energy_kcal' | 'resting_hr_bpm' | 'sleep_minutes' | 'weight_kg'>(
      key: K,
      value: number | undefined,
    ): void => {
      if (value !== undefined) built[key] = value;
    };

    const daySteps = steps.get(day);
    const dayEnergy = energy.get(day);
    const dayHr = restingHr.get(day);
    const dayWeight = weight.get(day)?.value;
    const daySleep = sleepMs.get(day);

    put('steps', daySteps === undefined ? undefined : within(daySteps, 0, 200_000, Math.round));
    put('active_energy_kcal', dayEnergy === undefined ? undefined : within(dayEnergy, 0, 20_000, round1));
    put('resting_hr_bpm', dayHr === undefined ? undefined : within(dayHr, 20, 250, round1));
    put('sleep_minutes', daySleep === undefined ? undefined : within(daySleep / 60_000, 1, 1440, Math.round));
    // The contract wants 0 < weight < 500.
    put('weight_kg', dayWeight === undefined ? undefined : within(dayWeight, 0.1, 499.9, round1));

    const dayWorkouts = workouts.get(day);
    if (dayWorkouts && dayWorkouts.length > 0) built.external_workouts = dayWorkouts;
    return built;
  });
}
