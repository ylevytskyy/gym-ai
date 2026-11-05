/**
 * Validation tool wrapper
 * Requirement 11.6: validatePlanTool(plan) for assistant tool calls.
 *
 * Never throws: the assistant gets a structured result it can act on.
 */

import { validateWorkoutPlan } from '../validator/index.js';
import { loadCatalog } from './catalog.js';
import type { ValidationToolResult } from '../types.js';

export function validatePlanTool(plan: unknown): ValidationToolResult {
  const result = validateWorkoutPlan(plan, loadCatalog());

  if (result.success) {
    return { success: true, message: 'Plan is valid.' };
  }
  const count = result.errors.length;
  return {
    success: false,
    errors: result.errors,
    message: `Plan failed validation with ${count} error${count === 1 ? '' : 's'}.`,
  };
}
