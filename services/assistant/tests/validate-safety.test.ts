/**
 * Safety Validation Tests
 * 
 * Tests for validatePlanSafety function
 * Requirements: 5.6, 5.7, 5.8
 */

import { describe, it, expect } from 'vitest';
import { validatePlanSafety } from '../src/validator/validate';
import {
  WorkoutPlan,
  Profile,
  Exercise,
} from '../src/types';
import catalogData from '../../../catalog/exercises.json';

describe('validatePlanSafety', () => {
  const catalog = catalogData.exercises as Exercise[];

  it('should pass validation when plan has no exercises conflicting with user injuries', () => {
    // Profile with no injuries
    const profile: Profile = {
      id: 'user-1',
      age_range: '25-34',
      weight_kg: 70,
      goal: 'move_more',
      fitness_level: 1,
      injuries: [],
      minutes_per_day: 15,
      language: 'en',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    };

    // Simple plan with squat (avoid_if: ["knee_injury"])
    const plan: WorkoutPlan = {
      schema_version: '1.0.0',
      id: 'plan-1',
      created_at: '2024-01-01T00:00:00Z',
      goal: 'move_more',
      notes: 'Test plan',
      days: [
        {
          day: 1,
          title: 'Day 1',
          minutes: 15,
          blocks: [
            {
              type: 'main',
              items: [
                {
                  exercise_id: 'squat',
                  sets: 3,
                  amount: 12,
                  rest_seconds: 30,
                },
              ],
            },
          ],
        },
      ],
    };

    const result = validatePlanSafety(plan, profile, catalog);

    expect(result.success).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('should fail validation when plan contains exercise conflicting with user injury', () => {
    // Profile with knee injury
    const profile: Profile = {
      id: 'user-2',
      age_range: '25-34',
      weight_kg: 70,
      goal: 'move_more',
      fitness_level: 1,
      injuries: ['knee_injury'],
      minutes_per_day: 15,
      language: 'en',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    };

    // Plan with squat (avoid_if: ["knee_injury"])
    const plan: WorkoutPlan = {
      schema_version: '1.0.0',
      id: 'plan-2',
      created_at: '2024-01-01T00:00:00Z',
      goal: 'move_more',
      notes: 'Test plan',
      days: [
        {
          day: 1,
          title: 'Day 1',
          minutes: 15,
          blocks: [
            {
              type: 'main',
              items: [
                {
                  exercise_id: 'squat',
                  sets: 3,
                  amount: 12,
                  rest_seconds: 30,
                },
              ],
            },
          ],
        },
      ],
    };

    const result = validatePlanSafety(plan, profile, catalog);

    expect(result.success).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]).toEqual({
      exercise_id: 'squat',
      injury: 'knee_injury',
      location: 'days[0].blocks[0].items[0]',
    });
  });

  it('should detect multiple violations across different exercises', () => {
    // Profile with multiple injuries
    const profile: Profile = {
      id: 'user-3',
      age_range: '25-34',
      weight_kg: 70,
      goal: 'build_strength',
      fitness_level: 2,
      injuries: ['knee_injury', 'shoulder_injury'],
      minutes_per_day: 30,
      language: 'en',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    };

    // Plan with multiple conflicting exercises
    const plan: WorkoutPlan = {
      schema_version: '1.0.0',
      id: 'plan-3',
      created_at: '2024-01-01T00:00:00Z',
      goal: 'build_strength',
      notes: 'Test plan with violations',
      days: [
        {
          day: 1,
          title: 'Day 1',
          minutes: 30,
          blocks: [
            {
              type: 'warm_up',
              items: [
                {
                  exercise_id: 'arm-circles', // avoid_if: ["shoulder_injury"]
                  sets: 1,
                  amount: 30,
                },
              ],
            },
            {
              type: 'main',
              items: [
                {
                  exercise_id: 'squat', // avoid_if: ["knee_injury"]
                  sets: 3,
                  amount: 12,
                  rest_seconds: 30,
                },
                {
                  exercise_id: 'push-up', // avoid_if: ["shoulder_injury", "wrist_injury"]
                  sets: 3,
                  amount: 10,
                  rest_seconds: 30,
                },
              ],
            },
          ],
        },
      ],
    };

    const result = validatePlanSafety(plan, profile, catalog);

    expect(result.success).toBe(false);
    expect(result.violations).toHaveLength(3);
    
    // Check that all violations are reported with correct locations
    expect(result.violations).toContainEqual({
      exercise_id: 'arm-circles',
      injury: 'shoulder_injury',
      location: 'days[0].blocks[0].items[0]',
    });
    expect(result.violations).toContainEqual({
      exercise_id: 'squat',
      injury: 'knee_injury',
      location: 'days[0].blocks[1].items[0]',
    });
    expect(result.violations).toContainEqual({
      exercise_id: 'push-up',
      injury: 'shoulder_injury',
      location: 'days[0].blocks[1].items[1]',
    });
  });

  it('should detect violations across multiple days', () => {
    // Profile with knee injury
    const profile: Profile = {
      id: 'user-4',
      age_range: '25-34',
      weight_kg: 70,
      goal: 'move_more',
      fitness_level: 1,
      injuries: ['knee_injury'],
      minutes_per_day: 15,
      language: 'en',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    };

    // Plan with violations on different days
    const plan: WorkoutPlan = {
      schema_version: '1.0.0',
      id: 'plan-4',
      created_at: '2024-01-01T00:00:00Z',
      goal: 'move_more',
      notes: 'Multi-day plan',
      days: [
        {
          day: 1,
          title: 'Day 1',
          minutes: 15,
          blocks: [
            {
              type: 'main',
              items: [
                {
                  exercise_id: 'squat', // avoid_if: ["knee_injury"]
                  sets: 3,
                  amount: 12,
                },
              ],
            },
          ],
        },
        {
          day: 2,
          title: 'Day 2',
          minutes: 15,
          blocks: [
            {
              type: 'main',
              items: [
                {
                  exercise_id: 'jumping-jacks', // avoid_if: ["knee_injury"]
                  sets: 3,
                  amount: 20,
                },
              ],
            },
          ],
        },
      ],
    };

    const result = validatePlanSafety(plan, profile, catalog);

    expect(result.success).toBe(false);
    expect(result.violations).toHaveLength(2);
    expect(result.violations).toContainEqual({
      exercise_id: 'squat',
      injury: 'knee_injury',
      location: 'days[0].blocks[0].items[0]',
    });
    expect(result.violations).toContainEqual({
      exercise_id: 'jumping-jacks',
      injury: 'knee_injury',
      location: 'days[1].blocks[0].items[0]',
    });
  });

  it('should handle exercises with multiple avoid_if entries', () => {
    // Profile with hip injury
    const profile: Profile = {
      id: 'user-5',
      age_range: '25-34',
      weight_kg: 70,
      goal: 'move_more',
      fitness_level: 2,
      injuries: ['hip_injury'],
      minutes_per_day: 15,
      language: 'en',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    };

    // Plan with reverse-lunge (avoid_if: ["knee_injury", "hip_injury"])
    const plan: WorkoutPlan = {
      schema_version: '1.0.0',
      id: 'plan-5',
      created_at: '2024-01-01T00:00:00Z',
      goal: 'move_more',
      notes: 'Test plan',
      days: [
        {
          day: 1,
          title: 'Day 1',
          minutes: 15,
          blocks: [
            {
              type: 'main',
              items: [
                {
                  exercise_id: 'reverse-lunge',
                  sets: 3,
                  amount: 10,
                },
              ],
            },
          ],
        },
      ],
    };

    const result = validatePlanSafety(plan, profile, catalog);

    expect(result.success).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]).toEqual({
      exercise_id: 'reverse-lunge',
      injury: 'hip_injury',
      location: 'days[0].blocks[0].items[0]',
    });
  });

  it('should skip exercises not found in catalog', () => {
    // Profile with injury
    const profile: Profile = {
      id: 'user-6',
      age_range: '25-34',
      weight_kg: 70,
      goal: 'move_more',
      fitness_level: 1,
      injuries: ['knee_injury'],
      minutes_per_day: 15,
      language: 'en',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    };

    // Plan with non-existent exercise
    const plan: WorkoutPlan = {
      schema_version: '1.0.0',
      id: 'plan-6',
      created_at: '2024-01-01T00:00:00Z',
      goal: 'move_more',
      notes: 'Test plan',
      days: [
        {
          day: 1,
          title: 'Day 1',
          minutes: 15,
          blocks: [
            {
              type: 'main',
              items: [
                {
                  exercise_id: 'non-existent-exercise',
                  sets: 3,
                  amount: 12,
                },
              ],
            },
          ],
        },
      ],
    };

    // Should not throw error, just skip unknown exercise
    const result = validatePlanSafety(plan, profile, catalog);

    // No violations since the exercise doesn't exist in catalog
    expect(result.success).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('should handle empty injuries array', () => {
    // Profile with empty injuries
    const profile: Profile = {
      id: 'user-7',
      age_range: '25-34',
      weight_kg: 70,
      goal: 'move_more',
      fitness_level: 1,
      injuries: [],
      minutes_per_day: 15,
      language: 'en',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    };

    // Plan with exercises that have avoid_if entries
    const plan: WorkoutPlan = {
      schema_version: '1.0.0',
      id: 'plan-7',
      created_at: '2024-01-01T00:00:00Z',
      goal: 'move_more',
      notes: 'Test plan',
      days: [
        {
          day: 1,
          title: 'Day 1',
          minutes: 30,
          blocks: [
            {
              type: 'main',
              items: [
                {
                  exercise_id: 'squat',
                  sets: 3,
                  amount: 12,
                },
                {
                  exercise_id: 'push-up',
                  sets: 3,
                  amount: 10,
                },
                {
                  exercise_id: 'plank',
                  sets: 3,
                  amount: 30,
                },
              ],
            },
          ],
        },
      ],
    };

    const result = validatePlanSafety(plan, profile, catalog);

    expect(result.success).toBe(true);
    expect(result.violations).toHaveLength(0);
  });
});
