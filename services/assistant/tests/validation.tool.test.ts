/**
 * validatePlanTool tests
 * Requirement: 11.6
 */

import { describe, it, expect } from 'vitest';
import { validatePlanTool } from '../src/tools/validation';

const validPlan = {
  schema_version: '1.0.0',
  id: '6f1c2c1e-6a1e-4b8a-9d55-2f6e1f0a7b11',
  created_at: '2026-01-10T09:00:00Z',
  goal: 'move_more',
  notes: 'test plan',
  days: [
    {
      day: 1,
      title: 'Starter',
      minutes: 10,
      blocks: [{ type: 'main', items: [{ exercise_id: 'squat', sets: 2, amount: 10 }] }],
    },
  ],
};

describe('validatePlanTool', () => {
  it('reports success for a valid plan', () => {
    const result = validatePlanTool(validPlan);
    expect(result.success).toBe(true);
    expect(result.errors ?? []).toEqual([]);
    expect(result.message).toMatch(/valid/i);
  });

  it('returns structured errors with paths for an invalid plan', () => {
    const broken = structuredClone(validPlan) as any;
    broken.days[0].blocks[0].items[0].exercise_id = 'no-such-exercise';

    const result = validatePlanTool(broken);

    expect(result.success).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: 'EXERCISE_NOT_FOUND',
        path: 'days[0].blocks[0].items[0].exercise_id',
      }),
    );
    expect(result.message).toMatch(/failed/i);
  });

  it('accepts unknown input and never throws', () => {
    expect(validatePlanTool(null).success).toBe(false);
    expect(validatePlanTool('not a plan').success).toBe(false);
  });
});
