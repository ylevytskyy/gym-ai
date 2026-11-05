/**
 * fast-check arbitraries shared by the property tests.
 *
 * Requirement 16: Property-based generators for workout plans and profiles.
 * Design: "Property-Based Test Generators" in
 * .kiro/specs/contracts-and-validation-foundation/design.md
 */

import fc from 'fast-check';
import type { Exercise, Profile, WorkoutPlan } from '../src/types';

/**
 * Generates WorkoutPlan objects that are schema-valid by construction.
 * Every exercise_id is drawn from the given catalog, so reference checks pass too.
 */
export function workoutPlanArbitrary(catalog: Exercise[]): fc.Arbitrary<WorkoutPlan> {
  const exerciseIds = catalog.map((ex) => ex.id);

  const exerciseItem = fc.record({
    exercise_id: fc.constantFrom(...exerciseIds),
    sets: fc.integer({ min: 1, max: 5 }),
    amount: fc.integer({ min: 5, max: 60 }),
    // Optional means absent, not null: the schema types rest_seconds as an integer.
    rest_seconds: fc.option(fc.integer({ min: 0, max: 120 }), { nil: undefined }),
  });

  const block = fc.record({
    type: fc.constantFrom<'warm_up' | 'main' | 'cool_down'>('warm_up', 'main', 'cool_down'),
    items: fc.array(exerciseItem, { minLength: 1, maxLength: 5 }),
  });

  const day = fc.record({
    day: fc.integer({ min: 1, max: 7 }),
    title: fc.string({ minLength: 5, maxLength: 50 }),
    minutes: fc.integer({ min: 5, max: 60 }),
    blocks: fc.array(block, { minLength: 1, maxLength: 3 }),
  });

  return fc.record({
    schema_version: fc.constant('1.0.0'),
    id: fc.uuid(),
    created_at: fc
      .date({ min: new Date('2000-01-01T00:00:00Z'), max: new Date('2100-01-01T00:00:00Z') })
      .map((d) => d.toISOString()),
    goal: fc.constantFrom('move_more', 'build_strength', 'lose_weight', 'improve_flexibility'),
    days: fc.array(day, { minLength: 1, maxLength: 7 }),
    notes: fc.string({ maxLength: 500 }),
  });
}

/** Injury identifiers the catalog uses in avoid_if. */
export const REALISTIC_INJURIES = [
  'knee_injury',
  'shoulder_injury',
  'lower_back_injury',
  'wrist_injury',
  'hip_injury',
  'elbow_injury',
  'neck_injury',
] as const;

/** Generates profiles with 0-3 distinct realistic injuries. */
export function profileArbitrary(): fc.Arbitrary<Profile> {
  return fc.record({
    id: fc.uuid(),
    age_range: fc.constantFrom('18-24', '25-34', '35-44', '45-54', '55-64', '65+'),
    weight_kg: fc.integer({ min: 40, max: 150 }),
    goal: fc.constantFrom('move_more', 'build_strength', 'lose_weight'),
    fitness_level: fc.constantFrom<1 | 2 | 3>(1, 2, 3),
    // uniqueArray: a duplicated injury would not change the result, but keep profiles realistic.
    injuries: fc.uniqueArray(fc.constantFrom(...REALISTIC_INJURIES), { maxLength: 3 }),
    minutes_per_day: fc.integer({ min: 5, max: 60 }),
    language: fc.constant('en'),
    created_at: fc.constant('2026-01-01T00:00:00Z'),
    updated_at: fc.constant('2026-01-01T00:00:00Z'),
  });
}
