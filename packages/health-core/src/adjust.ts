/**
 * Adjustment: the deterministic change that readiness or an external workout makes to today's
 * planned session. The stored plan is not rewritten; the app shows the adjusted day and why.
 *
 * Guarantees, for any input:
 *  - the result has the same shape as the input (every block keeps at least one item, sets >= 1);
 *  - every exercise the adjustment introduces comes from the catalog, is within the user's
 *    fitness level and does not conflict with the user's injuries. A day that was safe for the
 *    user stays safe.
 */

import type { CatalogExercise, ExerciseItem, ReadinessLevel, WorkoutBlock, WorkoutDay } from './types.js';

/** An external workout this long (today) turns the session into mobility work. */
export const EXTERNAL_WORKOUT_MINUTES = 30;
/** High readiness never pushes an item beyond this many sets. */
export const MAX_SETS = 6;

export type AdjustmentChange =
  | 'mobility_swap'
  | 'sets_reduced'
  | 'exercise_replaced'
  | 'exercise_removed'
  | 'sets_added';

const CHANGE_ORDER: AdjustmentChange[] = [
  'mobility_swap',
  'sets_reduced',
  'exercise_replaced',
  'exercise_removed',
  'sets_added',
];

export interface AdjustmentInput {
  readiness: ReadinessLevel;
  /** Minutes of workouts recorded today by other apps. */
  externalWorkoutMinutes: number;
  fitnessLevel: 1 | 2 | 3;
  injuries: string[];
}

export interface Adjustment {
  day: WorkoutDay;
  /** What was done, in a fixed order; empty when the day is unchanged. */
  changes: AdjustmentChange[];
}

type Changes = Set<AdjustmentChange>;

function isSafe(exercise: CatalogExercise, injuries: string[]): boolean {
  return !exercise.avoid_if.some((injury) => injuries.includes(injury));
}

/** Rebuild the day with each main block passed through `rewrite`; other blocks are copied. */
function mapMainBlocks(day: WorkoutDay, rewrite: (items: ExerciseItem[]) => ExerciseItem[]): WorkoutDay {
  return {
    ...day,
    blocks: day.blocks.map(
      (block): WorkoutBlock => ({
        ...block,
        items: block.type === 'main' ? rewrite(block.items) : block.items.map((item) => ({ ...item })),
      }),
    ),
  };
}

/** Mobility: replace main items with warm-up exercises. Undefined when no warm-up is usable. */
function mobilityDay(day: WorkoutDay, input: AdjustmentInput, catalog: CatalogExercise[]): WorkoutDay | undefined {
  const usable = catalog.filter(
    (e) => e.group === 'warm_up' && e.level <= input.fitnessLevel && isSafe(e, input.injuries),
  );
  if (usable.length === 0) return undefined;

  // Prefer movements the session does not already contain outside the main block.
  const alreadyThere = new Set(
    day.blocks.filter((b) => b.type !== 'main').flatMap((b) => b.items.map((i) => i.exercise_id)),
  );
  const ordered = [...usable.filter((e) => !alreadyThere.has(e.id)), ...usable.filter((e) => alreadyThere.has(e.id))];

  return mapMainBlocks(day, (items) =>
    ordered.slice(0, Math.max(1, items.length)).map((e) => ({
      exercise_id: e.id,
      sets: e.default.sets,
      amount: e.default.amount,
      rest_seconds: e.default.rest_seconds,
    })),
  );
}

/** Low readiness: one set fewer, and level-3 exercises swapped for something easier. */
function lighterDay(day: WorkoutDay, input: AdjustmentInput, catalog: CatalogExercise[], changes: Changes): WorkoutDay {
  const byId = new Map(catalog.map((e) => [e.id, e]));

  return mapMainBlocks(day, (items) => {
    const taken = new Set(items.map((i) => i.exercise_id));
    const result: ExerciseItem[] = [];
    const dropped: ExerciseItem[] = [];

    for (const item of items) {
      const sets = Math.max(1, item.sets - 1);
      if (sets !== item.sets) changes.add('sets_reduced');
      const lighter: ExerciseItem = { ...item, sets };

      const exercise = byId.get(item.exercise_id);
      if (!exercise || exercise.level < 3) {
        result.push(lighter);
        continue;
      }

      // Hardest easier exercise of the same group; catalog order breaks ties.
      const replacement = catalog
        .filter(
          (e) =>
            e.group === exercise.group &&
            e.level < 3 &&
            e.level <= input.fitnessLevel &&
            isSafe(e, input.injuries) &&
            !taken.has(e.id),
        )
        .reduce<CatalogExercise | undefined>((best, e) => (!best || e.level > best.level ? e : best), undefined);

      if (replacement) {
        taken.add(replacement.id);
        result.push({ ...lighter, exercise_id: replacement.id, amount: replacement.default.amount });
        changes.add('exercise_replaced');
      } else {
        dropped.push(lighter);
      }
    }

    // A block must keep at least one item: with nothing else left, the hard exercise stays, lighter.
    if (result.length === 0 && dropped[0]) {
      if (dropped.length > 1) changes.add('exercise_removed');
      return [dropped[0]];
    }
    if (dropped.length > 0) changes.add('exercise_removed');
    return result;
  });
}

/** High readiness: one more set of what is already planned and within the user's level. */
function harderDay(day: WorkoutDay, input: AdjustmentInput, catalog: CatalogExercise[], changes: Changes): WorkoutDay {
  const byId = new Map(catalog.map((e) => [e.id, e]));
  return mapMainBlocks(day, (items) =>
    items.map((item) => {
      const exercise = byId.get(item.exercise_id);
      if (!exercise || exercise.level > input.fitnessLevel || item.sets >= MAX_SETS) return { ...item };
      changes.add('sets_added');
      return { ...item, sets: item.sets + 1 };
    }),
  );
}

/**
 * The workout day to actually show today. An external workout wins over readiness; `normal`
 * and `unknown` readiness leave the day as planned. The input day is never mutated.
 */
export function adjustDay(day: WorkoutDay, input: AdjustmentInput, catalog: CatalogExercise[]): Adjustment {
  const changes: Changes = new Set();
  let adjusted: WorkoutDay | undefined;

  if (input.externalWorkoutMinutes >= EXTERNAL_WORKOUT_MINUTES) {
    adjusted = mobilityDay(day, input, catalog);
    if (adjusted) changes.add('mobility_swap');
    else adjusted = lighterDay(day, input, catalog, changes);
  } else if (input.readiness === 'low') {
    adjusted = lighterDay(day, input, catalog, changes);
  } else if (input.readiness === 'high') {
    adjusted = harderDay(day, input, catalog, changes);
  }

  return {
    day: adjusted ?? mapMainBlocks(day, (items) => items.map((item) => ({ ...item }))),
    changes: CHANGE_ORDER.filter((c) => changes.has(c)),
  };
}
