/**
 * Request body validation for POST /api/plans/generate
 * Requirements: 18.3, 18.9
 */

import { loadCatalog } from '../tools/catalog.js';
import type { PlanRequest, ValidationError } from '../types.js';

const MAX_FOCUS_AREAS = 10;
const MAX_CUSTOM_INSTRUCTIONS = 500;

export type RequestValidation =
  | { valid: true; request: PlanRequest }
  | { valid: false; errors: ValidationError[] };

const CATALOG_GROUPS = new Set<string>(loadCatalog().map((ex) => ex.group));

function fail(path: string, code: string, message: string): ValidationError {
  return { path, code, message };
}

export function validatePlanRequest(body: unknown): RequestValidation {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { valid: false, errors: [fail('', 'INVALID_BODY', 'Request body must be a JSON object')] };
  }
  const input = body as Record<string, unknown>;
  const errors: ValidationError[] = [];

  const duration = input['duration_days'];
  if (!Number.isInteger(duration) || (duration as number) <= 0) {
    errors.push(fail('duration_days', 'INVALID_DURATION', 'duration_days must be a positive integer'));
  }

  const focus = input['focus_areas'];
  if (!Array.isArray(focus)) {
    errors.push(fail('focus_areas', 'INVALID_FOCUS_AREAS', 'focus_areas must be an array'));
  } else {
    if (focus.length > MAX_FOCUS_AREAS) {
      errors.push(fail('focus_areas', 'TOO_MANY_FOCUS_AREAS', `At most ${MAX_FOCUS_AREAS} focus areas`));
    }
    focus.forEach((area, i) => {
      if (typeof area !== 'string' || !CATALOG_GROUPS.has(area)) {
        errors.push(
          fail(`focus_areas[${i}]`, 'INVALID_FOCUS_AREA', `Unknown focus area; use one of: ${[...CATALOG_GROUPS].join(', ')}`),
        );
      }
    });
  }

  const instructions = input['custom_instructions'];
  if (instructions !== undefined) {
    if (typeof instructions !== 'string') {
      errors.push(fail('custom_instructions', 'INVALID_CUSTOM_INSTRUCTIONS', 'custom_instructions must be a string'));
    } else if (instructions.length > MAX_CUSTOM_INSTRUCTIONS) {
      errors.push(
        fail('custom_instructions', 'TOO_LONG', `custom_instructions must be at most ${MAX_CUSTOM_INSTRUCTIONS} characters`),
      );
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const request: PlanRequest = {
    duration_days: input['duration_days'] as number,
    focus_areas: input['focus_areas'] as string[],
  };
  if (typeof instructions === 'string') {
    request.custom_instructions = instructions;
  }
  return { valid: true, request };
}
