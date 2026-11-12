import { describe, it, expect } from 'vitest';
import { adjustDay } from '../src/index.js';
import type { CatalogExercise, ExerciseGroup, WorkoutDay } from '../src/index.js';

function ex(id: string, group: ExerciseGroup, level: 1 | 2 | 3, avoid_if: string[] = []): CatalogExercise {
  return { id, group, level, unit: 'reps', default: { sets: 2, amount: 10, rest_seconds: 30 }, avoid_if, quiet: true };
}

const catalog: CatalogExercise[] = [
  ex('neck-rolls', 'warm_up', 1),
  ex('cat-cow', 'warm_up', 1, ['wrist_injury']),
  ex('hip-circles', 'warm_up', 1),
  ex('inchworm', 'warm_up', 2),
  ex('squat', 'lower_body', 1, ['knee_injury']),
  ex('split-squat', 'lower_body', 2, ['knee_injury']),
  ex('calf-raise', 'lower_body', 1),
  ex('single-leg-deadlift', 'lower_body', 3),
  ex('push-up', 'upper_body', 2),
  ex('diamond-push-up', 'upper_body', 3),
  ex('hollow-body-hold', 'core', 3),
];

function day(mainItems: WorkoutDay['blocks'][number]['items']): WorkoutDay {
  return {
    day: 1,
    title: 'Full body',
    minutes: 20,
    blocks: [
      { type: 'warm_up', items: [{ exercise_id: 'neck-rolls', sets: 1, amount: 30 }] },
      { type: 'main', items: mainItems },
      { type: 'cool_down', items: [{ exercise_id: 'hip-circles', sets: 1, amount: 30 }] },
    ],
  };
}

const base = { externalWorkoutMinutes: 0, fitnessLevel: 3 as const, injuries: [] as string[] };
const mainOf = (d: WorkoutDay) => d.blocks.find((b) => b.type === 'main')!.items;

describe('adjustDay', () => {
  const plain = day([
    { exercise_id: 'squat', sets: 3, amount: 12, rest_seconds: 30 },
    { exercise_id: 'push-up', sets: 1, amount: 8 },
  ]);

  it('returns the day unchanged for normal and unknown readiness', () => {
    for (const readiness of ['normal', 'unknown'] as const) {
      const result = adjustDay(plain, { ...base, readiness }, catalog);
      expect(result.day).toEqual(plain);
      expect(result.changes).toEqual([]);
    }
  });

  it('never mutates the day it was given', () => {
    const copy = JSON.parse(JSON.stringify(plain)) as WorkoutDay;
    adjustDay(plain, { ...base, readiness: 'low' }, catalog);
    adjustDay(plain, { ...base, readiness: 'high' }, catalog);
    adjustDay(plain, { ...base, readiness: 'normal', externalWorkoutMinutes: 60 }, catalog);
    expect(plain).toEqual(copy);
  });

  describe('low readiness', () => {
    it('cuts one set from each main item, never below one, and leaves other blocks alone', () => {
      const result = adjustDay(plain, { ...base, readiness: 'low' }, catalog);
      expect(mainOf(result.day)).toEqual([
        { exercise_id: 'squat', sets: 2, amount: 12, rest_seconds: 30 },
        { exercise_id: 'push-up', sets: 1, amount: 8 },
      ]);
      expect(result.day.blocks[0]).toEqual(plain.blocks[0]);
      expect(result.day.blocks[2]).toEqual(plain.blocks[2]);
      expect(result.changes).toEqual(['sets_reduced']);
    });

    it('replaces a level-3 exercise with the hardest lower-level one of the same group', () => {
      const hard = day([{ exercise_id: 'single-leg-deadlift', sets: 3, amount: 8, rest_seconds: 45 }]);
      const result = adjustDay(hard, { ...base, readiness: 'low' }, catalog);
      expect(mainOf(result.day)).toEqual([{ exercise_id: 'split-squat', sets: 2, amount: 10, rest_seconds: 45 }]);
      expect(result.changes).toEqual(['sets_reduced', 'exercise_replaced']);
    });

    it('never replaces with an exercise above the user fitness level', () => {
      // split-squat (level 2) is the hardest easier one, but this user is level 1.
      const hard = day([{ exercise_id: 'single-leg-deadlift', sets: 3, amount: 8 }]);
      const result = adjustDay(hard, { ...base, readiness: 'low', fitnessLevel: 1 }, catalog);
      expect(mainOf(result.day)).toEqual([{ exercise_id: 'squat', sets: 2, amount: 10 }]);
    });

    it('skips replacements that conflict with an injury or are already in the block', () => {
      const hard = day([
        { exercise_id: 'single-leg-deadlift', sets: 2, amount: 8 },
        { exercise_id: 'calf-raise', sets: 2, amount: 15 },
      ]);
      const result = adjustDay(hard, { ...base, readiness: 'low', injuries: ['knee_injury'] }, catalog);
      // split-squat and squat conflict with the knee, calf-raise is already there: nothing left.
      expect(mainOf(result.day)).toEqual([{ exercise_id: 'calf-raise', sets: 1, amount: 15 }]);
      expect(result.changes).toEqual(['sets_reduced', 'exercise_removed']);
    });

    it('keeps the block non-empty when the only item has no replacement', () => {
      const hard = day([{ exercise_id: 'hollow-body-hold', sets: 3, amount: 20 }]);
      const result = adjustDay(hard, { ...base, readiness: 'low' }, catalog);
      expect(mainOf(result.day)).toEqual([{ exercise_id: 'hollow-body-hold', sets: 2, amount: 20 }]);
      expect(result.changes).toEqual(['sets_reduced']);
    });

    it('leaves an exercise the catalog does not know in place', () => {
      const odd = day([{ exercise_id: 'mystery', sets: 2, amount: 5 }]);
      expect(mainOf(adjustDay(odd, { ...base, readiness: 'low' }, catalog).day)).toEqual([
        { exercise_id: 'mystery', sets: 1, amount: 5 },
      ]);
    });
  });

  describe('high readiness', () => {
    it('adds one set to main items within the user fitness level, up to 6 sets', () => {
      const d = day([
        { exercise_id: 'squat', sets: 3, amount: 12 },
        { exercise_id: 'push-up', sets: 6, amount: 8 },
        { exercise_id: 'diamond-push-up', sets: 2, amount: 6 },
      ]);
      const result = adjustDay(d, { ...base, readiness: 'high', fitnessLevel: 2 }, catalog);
      expect(mainOf(result.day).map((i) => i.sets)).toEqual([4, 6, 2]);
      expect(mainOf(result.day).map((i) => i.exercise_id)).toEqual(['squat', 'push-up', 'diamond-push-up']);
      expect(result.changes).toEqual(['sets_added']);
    });

    it('reports no change when nothing could be added', () => {
      const d = day([{ exercise_id: 'push-up', sets: 6, amount: 8 }]);
      const result = adjustDay(d, { ...base, readiness: 'high' }, catalog);
      expect(result.day).toEqual(d);
      expect(result.changes).toEqual([]);
    });
  });

  describe('after an external workout of 30 minutes or more', () => {
    it('swaps the main block for warm-up exercises not already in the day', () => {
      const result = adjustDay(plain, { ...base, readiness: 'normal', externalWorkoutMinutes: 30 }, catalog);
      expect(mainOf(result.day)).toEqual([
        { exercise_id: 'cat-cow', sets: 2, amount: 10, rest_seconds: 30 },
        { exercise_id: 'inchworm', sets: 2, amount: 10, rest_seconds: 30 },
      ]);
      expect(result.changes).toEqual(['mobility_swap']);
    });

    it('wins over high readiness and does nothing under 30 minutes', () => {
      const swapped = adjustDay(plain, { ...base, readiness: 'high', externalWorkoutMinutes: 45 }, catalog);
      expect(swapped.changes).toEqual(['mobility_swap']);
      const short = adjustDay(plain, { ...base, readiness: 'normal', externalWorkoutMinutes: 29 }, catalog);
      expect(short.day).toEqual(plain);
    });

    it('uses only exercises safe for the injuries and within the fitness level', () => {
      const result = adjustDay(
        plain,
        { readiness: 'normal', externalWorkoutMinutes: 60, fitnessLevel: 1, injuries: ['wrist_injury'] },
        catalog,
      );
      // cat-cow conflicts with the wrist and inchworm is level 2, so the day's own warm-ups are reused.
      expect(mainOf(result.day).map((i) => i.exercise_id)).toEqual(['neck-rolls', 'hip-circles']);
    });

    it('falls back to the low-readiness rule when no warm-up exercise is usable', () => {
      const noWarmUps = catalog.filter((e) => e.group !== 'warm_up');
      const result = adjustDay(plain, { ...base, readiness: 'normal', externalWorkoutMinutes: 60 }, noWarmUps);
      expect(mainOf(result.day).map((i) => i.sets)).toEqual([2, 1]);
      expect(result.changes).toEqual(['sets_reduced']);
    });
  });
});
