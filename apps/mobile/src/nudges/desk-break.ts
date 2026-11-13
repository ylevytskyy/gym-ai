/**
 * The two-minute desk break a sitting nudge offers: a few standing mobility moves that need no
 * floor, no space and make no noise.
 */

import type { WorkoutDay } from '@aura-fit/health-core';

import { exerciseById } from '@/catalog/catalog';

/**
 * Warm-up exercises that are done standing. The catalog does not say which ones are, so the
 * list is kept here; each entry is still checked against the catalog (quiet, level 1) and the
 * user's injuries before it is used.
 */
export const DESK_BREAK_EXERCISES = [
  'neck-rolls',
  'chest-opener',
  'side-bend',
  'calf-stretch',
  'arm-circles',
  'torso-twist',
  'standing-quad-stretch',
  'arm-swings',
  'hip-circles',
  'leg-swings',
];

const BREAK_EXERCISES = 4;

/** A break for someone with these injuries. The seed rotates the choice, so breaks differ. */
export function deskBreak(injuries: readonly string[], seed: number): WorkoutDay {
  const safe = DESK_BREAK_EXERCISES.flatMap((id) => {
    const exercise = exerciseById(id);
    const usable = exercise && exercise.quiet && exercise.level === 1 && exercise.group === 'warm_up';
    return usable && !exercise.avoid_if.some((injury) => injuries.includes(injury)) ? [exercise] : [];
  });
  const count = Math.min(BREAK_EXERCISES, safe.length);
  const start = safe.length === 0 ? 0 : Math.abs(Math.trunc(seed)) % safe.length;
  const chosen = Array.from({ length: count }, (_, i) => safe[(start + i) % safe.length]).filter((e) => e !== undefined);
  return {
    day: 0,
    title: 'Desk break',
    minutes: 2,
    blocks: [{ type: 'main', items: chosen.map((e) => ({ exercise_id: e.id, sets: 1, amount: e.default.amount, rest_seconds: 0 })) }],
  };
}
