/**
 * Parser and pretty printer for workout plans
 * Requirement 6: Parser and Pretty Printer for Workout Plans
 */

import type { WorkoutPlan, ParseResult } from '../types.js';

/**
 * Parse a JSON string into a WorkoutPlan object
 * Requirement 6.1: Export parseWorkoutPlan(json: string): ParseResult<WorkoutPlan>
 * Requirement 6.2: Parse valid JSON into WorkoutPlan object
 * Requirement 6.3: Return ParseResult with success: false and error message for invalid JSON
 */
export function parseWorkoutPlan(json: string): ParseResult<WorkoutPlan> {
  try {
    const parsed = JSON.parse(json);
    return { 
      success: true, 
      data: parsed as WorkoutPlan 
    };
  } catch (error) {
    return {
      success: false,
      error: `Input is not valid JSON: ${error instanceof Error ? error.message : 'unknown parse error'}`
    };
  }
}

/**
 * Format a WorkoutPlan object as indented JSON
 * Requirement 6.4: Export formatWorkoutPlan(plan: WorkoutPlan): string
 * Requirement 6.5: Format WorkoutPlan as indented JSON with 2-space indentation
 * Requirement 6.6: Round-trip property - parsing formatted output produces equivalent object
 */
export function formatWorkoutPlan(plan: WorkoutPlan): string {
  return JSON.stringify(plan, null, 2);
}
