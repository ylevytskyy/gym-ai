/**
 * Property 3: Injury Safety Constraint (Requirements 5.7, 5.8, 16.5, 16.6)
 *
 * For any profile and plan, validatePlanSafety must report exactly the
 * (exercise, injury, location) conflicts that a direct walk of the plan finds.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { validatePlanSafety } from '../src/validator/validate';
import type { Exercise } from '../src/types';
import catalogData from '../../../catalog/exercises.json';
import { profileArbitrary, workoutPlanArbitrary } from './generators';

const catalog = catalogData.exercises as Exercise[];
const catalogMap = new Map(catalog.map((ex) => [ex.id, ex]));

describe('Property: Injury safety constraint', () => {
  it('reports exactly the injury conflicts present in the plan, and only those', () => {
    fc.assert(
      fc.property(profileArbitrary(), workoutPlanArbitrary(catalog), (profile, plan) => {
        const userInjuries = new Set(profile.injuries);

        // Independent oracle: walk the tree and collect every conflicting (item, injury) pair.
        const expected: string[] = [];
        plan.days.forEach((day, d) =>
          day.blocks.forEach((block, b) =>
            block.items.forEach((item, i) => {
              const ex = catalogMap.get(item.exercise_id);
              for (const injury of ex?.avoid_if ?? []) {
                if (userInjuries.has(injury)) {
                  expected.push(`${item.exercise_id}|${injury}|days[${d}].blocks[${b}].items[${i}]`);
                }
              }
            }),
          ),
        );

        const result = validatePlanSafety(plan, profile, catalog);
        const actual = result.violations.map((v) => `${v.exercise_id}|${v.injury}|${v.location}`);

        expect(result.success).toBe(expected.length === 0);
        expect([...actual].sort()).toEqual([...expected].sort());
      }),
      { numRuns: 100 },
    );
  });

  it('a safe plan never contains an exercise whose avoid_if matches a user injury', () => {
    fc.assert(
      fc.property(profileArbitrary(), workoutPlanArbitrary(catalog), (profile, plan) => {
        const result = validatePlanSafety(plan, profile, catalog);
        if (!result.success) return;

        const userInjuries = new Set(profile.injuries);
        for (const day of plan.days) {
          for (const block of day.blocks) {
            for (const item of block.items) {
              const ex = catalogMap.get(item.exercise_id)!;
              expect(ex.avoid_if.some((i) => userInjuries.has(i))).toBe(false);
            }
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});
