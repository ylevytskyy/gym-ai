/**
 * Property: the health adjustment never produces a day the validator would reject.
 *
 * adjustDay (packages/health-core) changes today's session from readiness and external
 * workouts. Whatever it is given, the result must still be a schema-valid plan day that only
 * references catalog exercises, and it must never add an exercise that conflicts with the
 * user's injuries or exceeds their fitness level.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { adjustDay, type ReadinessLevel } from '@aura-fit/health-core';
import { validatePlanSafety, validateWorkoutPlan } from '../src/validator/validate';
import type { Exercise, WorkoutPlan } from '../src/types';
import catalogData from '../../../catalog/exercises.json';
import { profileArbitrary, workoutPlanArbitrary } from './generators';

const catalog = catalogData.exercises as Exercise[];
const byId = new Map(catalog.map((ex) => [ex.id, ex]));

const inputArbitrary = fc.record({
  readiness: fc.constantFrom<ReadinessLevel>('low', 'normal', 'high', 'unknown'),
  externalWorkoutMinutes: fc.constantFrom(0, 10, 29, 30, 45, 120),
});

/** The plan with each day passed through adjustDay for this profile. */
function adjustPlan(
  plan: WorkoutPlan,
  profile: { fitness_level: 1 | 2 | 3; injuries: string[] },
  input: { readiness: ReadinessLevel; externalWorkoutMinutes: number },
): WorkoutPlan {
  return {
    ...plan,
    days: plan.days.map(
      (day) => adjustDay(day, { ...input, fitnessLevel: profile.fitness_level, injuries: profile.injuries }, catalog).day,
    ),
  };
}

const idsOf = (plan: WorkoutPlan) => plan.days.flatMap((d) => d.blocks.flatMap((b) => b.items.map((i) => i.exercise_id)));

describe('Property: health adjustment keeps plans valid', () => {
  it('an adjusted plan passes schema and reference validation', () => {
    fc.assert(
      fc.property(profileArbitrary(), workoutPlanArbitrary(catalog), inputArbitrary, (profile, plan, input) => {
        const result = validateWorkoutPlan(adjustPlan(plan, profile, input), catalog);
        expect(result.errors).toEqual([]);
        expect(result.success).toBe(true);
      }),
      { numRuns: 300 },
    );
  });

  it('a plan that was safe for the user stays safe', () => {
    fc.assert(
      fc.property(profileArbitrary(), workoutPlanArbitrary(catalog), inputArbitrary, (profile, plan, input) => {
        fc.pre(validatePlanSafety(plan, profile, catalog).success);
        expect(validatePlanSafety(adjustPlan(plan, profile, input), profile, catalog).violations).toEqual([]);
      }),
      { numRuns: 300 },
    );
  });

  it('every exercise the adjustment introduces is safe and within the fitness level', () => {
    fc.assert(
      fc.property(profileArbitrary(), workoutPlanArbitrary(catalog), inputArbitrary, (profile, plan, input) => {
        const before = new Set(idsOf(plan));
        const introduced = idsOf(adjustPlan(plan, profile, input)).filter((id) => !before.has(id));
        for (const id of introduced) {
          const ex = byId.get(id)!;
          expect(ex.level).toBeLessThanOrEqual(profile.fitness_level);
          expect(ex.avoid_if.some((injury) => profile.injuries.includes(injury))).toBe(false);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('normal or unknown readiness without an external workout changes nothing', () => {
    fc.assert(
      fc.property(
        profileArbitrary(),
        workoutPlanArbitrary(catalog),
        fc.constantFrom<ReadinessLevel>('normal', 'unknown'),
        fc.integer({ min: 0, max: 29 }),
        (profile, plan, readiness, externalWorkoutMinutes) => {
          expect(adjustPlan(plan, profile, { readiness, externalWorkoutMinutes })).toEqual(plan);
        },
      ),
      { numRuns: 100 },
    );
  });
});
