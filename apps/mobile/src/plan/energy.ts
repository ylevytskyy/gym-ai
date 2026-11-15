/**
 * How much active energy a planned exercise or day is expected to burn, before it is done.
 * Same rule as the figure written to Health after a workout: (MET - 1) x body weight (kg) x
 * hours of work, rest between sets left out. A rep has no clock in the player, so a planned rep
 * counts as SECONDS_PER_REP seconds. An estimate, like every MET-based figure.
 */

import type { ExerciseItem, WorkoutDay } from '@aura-fit/health-core';

import type { Exercise } from '@/catalog/catalog';

/** A steady, controlled bodyweight rep. */
export const SECONDS_PER_REP = 3;

/** Active kcal for `ms` of work at `met`; one MET is the body at rest, counted separately by Health. */
export function activeKcal(met: number, weightKg: number, ms: number): number {
  return met > 1 && weightKg > 0 && ms > 0 ? (met - 1) * weightKg * (ms / 3_600_000) : 0;
}

/** Expected kcal for one planned exercise; undefined when the exercise or the weight is not known. */
export function itemKcal(item: ExerciseItem, weightKg: number | undefined, exercise: (id: string) => Exercise | undefined): number | undefined {
  const known = exercise(item.exercise_id);
  if (!known || weightKg === undefined || !(weightKg > 0)) return undefined;
  const seconds = item.sets * item.amount * (known.unit === 'reps' ? SECONDS_PER_REP : 1);
  return activeKcal(known.met, weightKg, seconds * 1000);
}

/** Expected kcal for a whole day; undefined when no exercise in it can be estimated. */
export function dayKcal(day: WorkoutDay, weightKg: number | undefined, exercise: (id: string) => Exercise | undefined): number | undefined {
  const parts = day.blocks
    .flatMap((block) => block.items)
    .map((item) => itemKcal(item, weightKg, exercise))
    .filter((kcal): kcal is number => kcal !== undefined);
  return parts.length === 0 ? undefined : parts.reduce((sum, kcal) => sum + kcal, 0);
}

/** A kcal estimate as shown: whole kilocalories, marked as approximate. */
export function kcalLabel(kcal: number): string {
  if (kcal <= 0) return '0 kcal';
  if (kcal < 0.5) return '< 1 kcal';
  return `≈ ${Math.round(kcal)} kcal`;
}
