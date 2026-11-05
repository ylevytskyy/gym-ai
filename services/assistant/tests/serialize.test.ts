/**
 * Unit tests for serialize module
 * Tests requirements 6.1-6.6 for parser and pretty printer
 */

import { describe, it, expect } from 'vitest';
import { parseWorkoutPlan, formatWorkoutPlan } from '../src/validator/serialize';
import { WorkoutPlan } from '../src/types';

describe('parseWorkoutPlan', () => {
  it('should parse valid JSON successfully (Requirement 6.2)', () => {
    const validJSON = JSON.stringify({
      schema_version: '1.0.0',
      id: 'test-123',
      created_at: '2024-01-01T00:00:00Z',
      goal: 'Build strength',
      days: [{
        day: 1,
        title: 'Day 1',
        minutes: 30,
        blocks: [{
          type: 'main',
          items: [{
            exercise_id: 'squat',
            sets: 3,
            amount: 12
          }]
        }]
      }],
      notes: 'Test plan'
    });

    const result = parseWorkoutPlan(validJSON);

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data?.id).toBe('test-123');
    expect(result.error).toBeUndefined();
  });

  it('should return error for invalid JSON (Requirement 6.3)', () => {
    const invalidJSON = '{ invalid json }';

    const result = parseWorkoutPlan(invalidJSON);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toContain('not valid JSON');
    expect(result.data).toBeUndefined();
  });

  it('should handle empty string with error', () => {
    const result = parseWorkoutPlan('');

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should return appropriate error message for parse failures', () => {
    const result = parseWorkoutPlan('not json at all');

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
    expect(typeof result.error).toBe('string');
  });
});

describe('formatWorkoutPlan', () => {
  it('should format with 2-space indentation (Requirement 6.5)', () => {
    const plan: WorkoutPlan = {
      schema_version: '1.0.0',
      id: 'test-plan',
      created_at: '2024-01-01T00:00:00Z',
      goal: 'Test goal',
      days: [{
        day: 1,
        title: 'Test Day',
        minutes: 15,
        blocks: [{
          type: 'warm_up',
          items: [{
            exercise_id: 'neck-rolls',
            sets: 1,
            amount: 5
          }]
        }]
      }],
      notes: 'Test'
    };

    const formatted = formatWorkoutPlan(plan);

    // Check for 2-space indentation
    const lines = formatted.split('\n');
    const hasProperIndentation = lines.some(line => line.startsWith('  ') && !line.startsWith('   '));
    
    expect(formatted).toContain('{\n');
    expect(hasProperIndentation).toBe(true);
    expect(formatted).toContain('"schema_version"');
  });

  it('should produce valid JSON', () => {
    const plan: WorkoutPlan = {
      schema_version: '1.0.0',
      id: 'test',
      created_at: '2024-01-01T00:00:00Z',
      goal: 'Test',
      days: [],
      notes: ''
    };

    const formatted = formatWorkoutPlan(plan);

    // Should be parseable JSON
    expect(() => JSON.parse(formatted)).not.toThrow();
  });
});

describe('round-trip property', () => {
  it('should preserve data through format and parse cycle (Requirement 6.6)', () => {
    const originalPlan: WorkoutPlan = {
      schema_version: '1.0.0',
      id: 'round-trip-test',
      created_at: '2024-01-15T10:30:00Z',
      goal: 'Build muscle',
      days: [
        {
          day: 1,
          title: 'Upper Body',
          minutes: 25,
          blocks: [
            {
              type: 'warm_up',
              items: [
                {
                  exercise_id: 'arm-circles',
                  sets: 1,
                  amount: 30
                }
              ]
            },
            {
              type: 'main',
              items: [
                {
                  exercise_id: 'push-up',
                  sets: 3,
                  amount: 10,
                  rest_seconds: 30
                },
                {
                  exercise_id: 'chair-dip',
                  sets: 3,
                  amount: 8,
                  rest_seconds: 30
                }
              ]
            }
          ]
        }
      ],
      notes: 'Focus on proper form'
    };

    // Format -> Parse -> Compare
    const formatted = formatWorkoutPlan(originalPlan);
    const parsed = parseWorkoutPlan(formatted);

    expect(parsed.success).toBe(true);
    expect(parsed.data).toBeDefined();
    
    // Deep equality check
    expect(JSON.stringify(parsed.data)).toBe(JSON.stringify(originalPlan));
    expect(parsed.data?.id).toBe(originalPlan.id);
    expect(parsed.data?.days.length).toBe(originalPlan.days.length);
    expect(parsed.data?.days[0].blocks.length).toBe(originalPlan.days[0].blocks.length);
  });

  it('should handle complex nested structures', () => {
    const complexPlan: WorkoutPlan = {
      schema_version: '1.0.0',
      id: 'complex-plan',
      created_at: '2024-01-01T00:00:00Z',
      goal: 'Full body',
      days: [
        {
          day: 1,
          title: 'Day 1',
          minutes: 45,
          blocks: [
            {
              type: 'warm_up',
              items: [{ exercise_id: 'a', sets: 1, amount: 10 }]
            },
            {
              type: 'main',
              items: [
                { exercise_id: 'b', sets: 2, amount: 20 },
                { exercise_id: 'c', sets: 3, amount: 30, rest_seconds: 60 }
              ]
            },
            {
              type: 'cool_down',
              items: [{ exercise_id: 'd', sets: 1, amount: 5 }]
            }
          ]
        },
        {
          day: 2,
          title: 'Day 2',
          minutes: 30,
          blocks: [
            {
              type: 'main',
              items: [{ exercise_id: 'e', sets: 4, amount: 15 }]
            }
          ]
        }
      ],
      notes: 'Complex structure test'
    };

    const formatted = formatWorkoutPlan(complexPlan);
    const parsed = parseWorkoutPlan(formatted);

    expect(parsed.success).toBe(true);
    expect(JSON.stringify(parsed.data)).toBe(JSON.stringify(complexPlan));
  });
});
