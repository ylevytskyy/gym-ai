/**
 * Validation property tests
 *
 * Property 1: Schema Validation Round-Trip (Requirement 6.6, task 3.5)
 * Property 2: Exercise Reference Integrity (Requirements 5.4, 5.5, task 3.6)
 *
 * Design: .kiro/specs/contracts-and-validation-foundation/design.md
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  validateWorkoutPlan,
  parseWorkoutPlan,
  formatWorkoutPlan,
} from '../src/validator/index';
import type { Exercise, WorkoutPlan } from '../src/types';
import catalogData from '../../../catalog/exercises.json';
import { workoutPlanArbitrary } from './generators';

const catalog = catalogData.exercises as Exercise[];
const catalogIds = new Set(catalog.map((ex) => ex.id));
const NUM_RUNS = 100;

/** Collect every exercise_id referenced anywhere in the plan tree (days → blocks → items). */
function collectExerciseIds(plan: WorkoutPlan): string[] {
  return plan.days.flatMap((day) =>
    day.blocks.flatMap((block) => block.items.map((item) => item.exercise_id)),
  );
}

describe('Property: Schema validation round-trip', () => {
  it('format → parse → validate preserves a generated plan and it stays valid', () => {
    fc.assert(
      fc.property(workoutPlanArbitrary(catalog), (originalPlan) => {
        const formatted = formatWorkoutPlan(originalPlan);
        const parsed = parseWorkoutPlan(formatted);

        expect(parsed.success).toBe(true);
        expect(parsed.data).toEqual(originalPlan);

        const validation = validateWorkoutPlan(parsed.data!, catalog);
        expect(validation.errors).toEqual([]);
        expect(validation.success).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe('Property: Exercise reference integrity', () => {
  it('a plan that validates only references exercises that exist in the catalog', () => {
    fc.assert(
      fc.property(workoutPlanArbitrary(catalog), (plan) => {
        const validation = validateWorkoutPlan(plan, catalog);
        const referenced = collectExerciseIds(plan);

        if (validation.success) {
          expect(referenced.every((id) => catalogIds.has(id))).toBe(true);
        } else {
          // Failure must be explained by a missing reference, not by something else.
          const hasMissing = referenced.some((id) => !catalogIds.has(id));
          expect(hasMissing || validation.errors.length > 0).toBe(true);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('an injected unknown exercise_id fails with EXERCISE_NOT_FOUND at that exact path', () => {
    const unknownIdArb = fc
      .stringMatching(/^[a-z][a-z-]{3,20}$/)
      .filter((id) => !catalogIds.has(id));

    fc.assert(
      fc.property(workoutPlanArbitrary(catalog), unknownIdArb, (plan, unknownId) => {
        const mutated = structuredClone(plan);
        mutated.days[0]!.blocks[0]!.items[0]!.exercise_id = unknownId;

        const validation = validateWorkoutPlan(mutated, catalog);

        expect(validation.success).toBe(false);
        expect(validation.errors).toContainEqual(
          expect.objectContaining({
            code: 'EXERCISE_NOT_FOUND',
            path: 'days[0].blocks[0].items[0].exercise_id',
          }),
        );
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
