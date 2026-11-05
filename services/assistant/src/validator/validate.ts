/**
 * Workout Plan Validation Module
 * 
 * Implements a three-stage validation pipeline:
 * 1. Schema Validation: Validates structural correctness using Ajv
 * 2. Reference Validation: Ensures all exercise_id references exist in catalog
 * 3. Safety Validation: Checks for injury conflicts
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10
 */

import { loadRepoJson } from '../repo-files.js';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';
import type { AnySchemaObject, ErrorObject } from 'ajv';
import {
  ValidationResult,
  ValidationError,
  WorkoutPlan,
  Exercise,
  Profile,
  SafetyValidationResult,
  SafetyViolation,
} from '../types.js';

const workoutPlanSchema = loadRepoJson<AnySchemaObject>('schemas/workout-plan.schema.json');

// ============================================================================
// Ajv Configuration and Schema Compilation
// ============================================================================

/**
 * Initialize Ajv with comprehensive error reporting
 * - allErrors: true - Collect all validation errors, not just the first one
 * - verbose: true - Include detailed error information with data paths
 * 
 * Requirement 5.9: Use Ajv library version 8.x or higher for JSON Schema validation
 */
const ajv = new Ajv2020({ 
  allErrors: true,
  verbose: true,
  strict: true
});

// Add format validation (date-time, uri, etc.)
// ajv-formats is CJS with `export default`; under NodeNext the default import is
// the whole module object, so the plugin lives on `.default`.
addFormatsModule.default(ajv);

/**
 * Pre-compiled schema validator for performance
 * Compilation happens once at module initialization
 * 
 * Requirement 5.1: Validate plan against Workout Plan JSON Schema
 */
const validateSchema = ajv.compile(workoutPlanSchema);

// ============================================================================
// Main Validation Functions
// ============================================================================

/**
 * Validates a workout plan against both schema and catalog constraints
 * 
 * Stage 1: Schema Validation - Validates structure, types, required fields
 * Stage 2: Reference Validation - Verifies all exercise_id references exist
 * 
 * @param plan - The workout plan to validate (unknown type for type safety)
 * @param catalog - Array of available exercises from the catalog
 * @returns ValidationResult with success status and any errors found
 * 
 * Requirements:
 * - 5.1: Export validateWorkoutPlan function
 * - 5.2: First validate against JSON Schema
 * - 5.3: Return errors if schema validation fails
 * - 5.4: Verify every exercise_id exists in catalog
 * - 5.5: Return missing exercise_id errors
 * - 5.10: Return success: true with empty errors for valid plans
 */
export function validateWorkoutPlan(
  plan: unknown,
  catalog: Exercise[]
): ValidationResult {
  // Stage 1: Schema Validation
  // Requirement 5.2: First validate the plan against the Workout Plan JSON Schema
  const schemaValid = validateSchema(plan);
  
  if (!schemaValid) {
    // Requirement 5.3: Return ValidationResult with success: false and schema errors
    return {
      success: false,
      errors: transformAjvErrors(validateSchema.errors || [])
    };
  }
  
  // Type assertion safe here because schema validation passed
  // (ValidateFunction narrows to a loose object type, so go through unknown.)
  const typedPlan = plan as unknown as WorkoutPlan;
  
  // Stage 2: Reference Validation
  // Requirement 5.4: Verify that every exercise_id in the plan exists in the catalog
  const catalogIndex = buildCatalogIndex(catalog);
  const referenceErrors = validateReferences(typedPlan, catalogIndex);
  
  if (referenceErrors.length > 0) {
    // Requirement 5.5: Return ValidationResult indicating which exercise_id is missing
    return {
      success: false,
      errors: referenceErrors
    };
  }
  
  // Requirement 5.10: For all valid plans, return success: true with empty errors array
  return { 
    success: true, 
    errors: [] 
  };
}

/**
 * Validates that a workout plan does not contain exercises that conflict
 * with the user's injuries.
 * 
 * Algorithm:
 * 1. Build catalog Map keyed by exercise ID for O(1) lookups
 * 2. Create Set of user injuries for O(1) intersection checks
 * 3. Walk plan tree (days → blocks → items) and check each exercise
 * 4. For each exercise, check if avoid_if array intersects with user injuries
 * 5. Collect all violations with exercise_id, injury, and location path
 * 
 * Requirement 5.6: Export validatePlanSafety function
 * Requirement 5.7: Check that no exercise matches any injury in user's profile
 * Requirement 5.8: Return which exercise violates which injury constraint
 * 
 * @param plan - The workout plan to validate
 * @param profile - The user profile containing injuries
 * @param catalog - The exercise catalog to lookup exercise metadata
 * @returns SafetyValidationResult with success boolean and violations array
 */
export function validatePlanSafety(
  plan: WorkoutPlan,
  profile: Profile,
  catalog: Exercise[]
): SafetyValidationResult {
  const violations: SafetyViolation[] = [];
  
  // Build catalog Map keyed by exercise ID for fast O(1) lookups
  const catalogMap = new Map<string, Exercise>(
    catalog.map(exercise => [exercise.id, exercise])
  );
  
  // Create Set of user injuries from profile for fast O(1) intersection checks
  const userInjuries = new Set<string>(profile.injuries || []);
  
  // Walk plan tree: days → blocks → items
  for (const [dayIdx, day] of plan.days.entries()) {
    for (const [blockIdx, block] of day.blocks.entries()) {
      for (const [itemIdx, item] of block.items.entries()) {
        // Lookup exercise in catalog
        const exercise = catalogMap.get(item.exercise_id);
        
        // Skip if exercise not found (will be caught by reference validation)
        if (!exercise) {
          continue;
        }
        
        // Check if avoid_if array intersects with user injuries
        for (const injury of exercise.avoid_if) {
          if (userInjuries.has(injury)) {
            // Collect violation with exercise_id, injury, and location path
            violations.push({
              exercise_id: item.exercise_id,
              injury,
              location: `days[${dayIdx}].blocks[${blockIdx}].items[${itemIdx}]`
            });
          }
        }
      }
    }
  }
  
  // Return SafetyValidationResult with success boolean and violations array
  return {
    success: violations.length === 0,
    violations
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Builds a fast lookup index from the exercise catalog
 * 
 * Uses a Set for O(1) lookup performance when validating references
 * 
 * @param catalog - Array of exercises
 * @returns Set of exercise IDs for fast existence checking
 */
function buildCatalogIndex(catalog: Exercise[]): Set<string> {
  return new Set(catalog.map(ex => ex.id));
}

/**
 * Validates that all exercise_id references in the plan exist in the catalog
 * 
 * Walks the entire plan tree (days → blocks → items) and collects all
 * exercise_id references, checking each against the catalog index.
 * 
 * @param plan - The workout plan to validate
 * @param catalogIndex - Set of valid exercise IDs
 * @returns Array of validation errors for missing exercises
 * 
 * Requirement 5.4: Verify every exercise_id in the plan exists in catalog
 */
function validateReferences(
  plan: WorkoutPlan,
  catalogIndex: Set<string>
): ValidationError[] {
  const errors: ValidationError[] = [];
  
  // Walk through the plan tree structure
  for (const [dayIdx, day] of plan.days.entries()) {
    for (const [blockIdx, block] of day.blocks.entries()) {
      for (const [itemIdx, item] of block.items.entries()) {
        // Check if this exercise_id exists in the catalog
        if (!catalogIndex.has(item.exercise_id)) {
          // Requirement 5.5: Return which exercise_id is missing
          errors.push({
            path: `days[${dayIdx}].blocks[${blockIdx}].items[${itemIdx}].exercise_id`,
            message: `Exercise '${item.exercise_id}' not found in catalog`,
            code: 'EXERCISE_NOT_FOUND'
          });
        }
      }
    }
  }
  
  return errors;
}

/**
 * Transforms Ajv validation errors into our ValidationError format
 * 
 * Ajv errors contain detailed information about schema violations.
 * This function converts them into a consistent format with paths,
 * messages, and error codes.
 * 
 * @param ajvErrors - Array of Ajv error objects (may be null)
 * @returns Array of ValidationError objects
 * 
 * Requirement 5.3: Return errors if schema validation fails
 */
function transformAjvErrors(ajvErrors: ErrorObject[] | null): ValidationError[] {
  if (!ajvErrors) {
    return [];
  }
  
  return ajvErrors.map(err => {
    // Build a descriptive error message
    let message = err.message || 'Validation failed';
    
    // Add more context for specific error types
    if (err.keyword === 'required') {
      message = `Missing required field: ${err.params.missingProperty}`;
    } else if (err.keyword === 'type') {
      message = `Invalid type: expected ${err.params.type}`;
    } else if (err.keyword === 'enum') {
      message = `Value must be one of: ${err.params.allowedValues?.join(', ')}`;
    } else if (err.keyword === 'minimum') {
      message = `Value must be >= ${err.params.limit}`;
    } else if (err.keyword === 'minItems') {
      message = `Array must have at least ${err.params.limit} items`;
    } else if (err.keyword === 'pattern') {
      message = `Value does not match required pattern`;
    } else if (err.keyword === 'format') {
      message = `Invalid format: expected ${err.params.format}`;
    }
    
    return {
      // Use instancePath from Ajv (JSON pointer format)
      // Convert from '/days/0/blocks/1' to 'days[0].blocks[1]' for readability
      path: err.instancePath 
        ? err.instancePath.slice(1).replace(/\//g, '.').replace(/\.(\d+)/g, '[$1]')
        : 'root',
      message,
      code: 'SCHEMA_VALIDATION_ERROR'
    };
  });
}
