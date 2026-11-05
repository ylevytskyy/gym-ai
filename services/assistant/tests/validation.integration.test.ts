/**
 * Integration: validation pipeline with the real schema, catalog and parser.
 * No mocks. Requirements: 15.1-15.5, 15.7
 */

import { describe, it, expect } from 'vitest';
import {
  validateWorkoutPlan,
  validatePlanSafety,
  parseWorkoutPlan,
  formatWorkoutPlan,
} from '../src/validator/index';
import type { Exercise, Profile, WorkoutPlan } from '../src/types';
import catalogData from '../../../catalog/exercises.json';

const catalog = catalogData.exercises as Exercise[];

const basePlan = (): WorkoutPlan => ({
  schema_version: '1.0.0',
  id: '6f1c2c1e-6a1e-4b8a-9d55-2f6e1f0a7b11',
  created_at: '2026-01-10T09:00:00Z',
  goal: 'move_more',
  notes: 'Integration plan',
  days: [
    {
      day: 1,
      title: 'Warm up and core',
      minutes: 15,
      blocks: [
        { type: 'warm_up', items: [{ exercise_id: 'neck-rolls', sets: 1, amount: 30 }] },
        {
          type: 'main',
          items: [
            { exercise_id: 'plank', sets: 3, amount: 30, rest_seconds: 60 },
            { exercise_id: 'glute-bridge', sets: 2, amount: 12 },
          ],
        },
      ],
    },
  ],
});

const profile = (injuries: string[] = []): Profile => ({
  id: 'user-1',
  age_range: '25-34',
  weight_kg: 70,
  goal: 'move_more',
  fitness_level: 1,
  injuries,
  minutes_per_day: 15,
  language: 'en',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
});

describe('Integration: validation pipeline', () => {
  it('a valid plan passes schema, reference and safety stages', () => {
    const plan = basePlan();
    expect(validateWorkoutPlan(plan, catalog)).toEqual({ success: true, errors: [] });
    expect(validatePlanSafety(plan, profile(), catalog)).toEqual({ success: true, violations: [] });
  });

  it('a schema violation fails at stage 1 with a path that names the missing field', () => {
    const plan = { ...basePlan(), schema_version: undefined } as unknown as WorkoutPlan;
    const result = validateWorkoutPlan(plan, catalog);

    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.every((e) => e.code === 'SCHEMA_VALIDATION_ERROR')).toBe(true);
    expect(result.errors.some((e) => /schema_version/.test(`${e.path} ${e.message}`))).toBe(true);
  });

  it('an unknown exercise_id passes stage 1 but fails stage 2 with the exact location', () => {
    const plan = basePlan();
    plan.days[0]!.blocks[1]!.items[1]!.exercise_id = 'burpee-deluxe';
    const result = validateWorkoutPlan(plan, catalog);

    expect(result.success).toBe(false);
    expect(result.errors).toEqual([
      {
        path: 'days[0].blocks[1].items[1].exercise_id',
        code: 'EXERCISE_NOT_FOUND',
        message: "Exercise 'burpee-deluxe' not found in catalog",
      },
    ]);
  });

  it('an injury conflict passes stages 1 and 2 but fails the safety stage', () => {
    const plan = basePlan();
    const knee = profile(['lower_back_injury']); // plank and glute-bridge both avoid lower_back_injury

    expect(validateWorkoutPlan(plan, catalog).success).toBe(true);

    const safety = validatePlanSafety(plan, knee, catalog);
    expect(safety.success).toBe(false);
    expect(safety.violations).toEqual([
      { exercise_id: 'plank', injury: 'lower_back_injury', location: 'days[0].blocks[1].items[0]' },
      { exercise_id: 'glute-bridge', injury: 'lower_back_injury', location: 'days[0].blocks[1].items[1]' },
    ]);
  });

  it('parse → format → parse gives back an equal plan that still validates', () => {
    const plan = basePlan();
    const first = parseWorkoutPlan(formatWorkoutPlan(plan));
    expect(first.success).toBe(true);
    const second = parseWorkoutPlan(formatWorkoutPlan(first.data!));
    expect(second.data).toEqual(plan);
    expect(validateWorkoutPlan(second.data!, catalog).success).toBe(true);
  });

  it('malformed JSON fails at parsing and never reaches validation', () => {
    const parsed = parseWorkoutPlan('{"schema_version": ');
    expect(parsed.success).toBe(false);
    expect(parsed.data).toBeUndefined();
    expect(parsed.error).toMatch(/not valid JSON/);
  });
});
