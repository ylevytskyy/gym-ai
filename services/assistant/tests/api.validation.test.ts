/**
 * Request body validation tests
 * Requirements: 18.3, 18.9
 */

import { describe, it, expect } from 'vitest';
import { validatePlanRequest } from '../src/api/validation';

describe('validatePlanRequest', () => {
  it('accepts a minimal valid body and returns the typed request', () => {
    const result = validatePlanRequest({ duration_days: 3, focus_areas: ['core'] });
    expect(result).toEqual({ valid: true, request: { duration_days: 3, focus_areas: ['core'] } });
  });

  it('keeps custom_instructions when present', () => {
    const result = validatePlanRequest({
      duration_days: 2,
      focus_areas: [],
      custom_instructions: 'Quiet please',
    });
    expect(result).toEqual({
      valid: true,
      request: { duration_days: 2, focus_areas: [], custom_instructions: 'Quiet please' },
    });
  });

  it('rejects a non-object body', () => {
    const result = validatePlanRequest(null);
    expect(result.valid).toBe(false);
  });

  it.each([0, -1, 2.5, '3', null])('rejects duration_days = %j', (duration) => {
    const result = validatePlanRequest({ duration_days: duration, focus_areas: [] });
    expect(result).toMatchObject({ valid: false });
    expect((result as any).errors).toContainEqual(expect.objectContaining({ path: 'duration_days' }));
  });

  it('rejects missing focus_areas', () => {
    const result = validatePlanRequest({ duration_days: 3 });
    expect(result).toMatchObject({ valid: false });
    expect((result as any).errors).toContainEqual(expect.objectContaining({ path: 'focus_areas' }));
  });

  it('rejects focus areas that are not catalog groups', () => {
    const result = validatePlanRequest({ duration_days: 3, focus_areas: ['core', 'arms'] });
    expect(result).toMatchObject({ valid: false });
    expect((result as any).errors).toContainEqual(
      expect.objectContaining({ path: 'focus_areas[1]', code: 'INVALID_FOCUS_AREA' }),
    );
  });

  it('caps focus areas at 10', () => {
    const many = Array.from({ length: 11 }, () => 'core');
    const result = validatePlanRequest({ duration_days: 3, focus_areas: many });
    expect(result).toMatchObject({ valid: false });
  });

  it('rejects custom_instructions over 500 characters or of the wrong type', () => {
    const long = validatePlanRequest({ duration_days: 3, focus_areas: [], custom_instructions: 'x'.repeat(501) });
    expect(long).toMatchObject({ valid: false });
    const wrongType = validatePlanRequest({ duration_days: 3, focus_areas: [], custom_instructions: 42 });
    expect(wrongType).toMatchObject({ valid: false });
  });

  it('accepts custom_instructions of exactly 500 characters', () => {
    const result = validatePlanRequest({ duration_days: 3, focus_areas: [], custom_instructions: 'x'.repeat(500) });
    expect(result.valid).toBe(true);
  });
});
