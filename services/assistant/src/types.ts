/**
 * Core type definitions for the Aura Fit AI Service
 * These types define the contracts between system components
 */

import type { HealthSummary } from '@aura-fit/health-core';

// ============================================================================
// User Profile Types
// ============================================================================

/**
 * User profile from Supabase profiles table
 * Requirement 9.2: Define TypeScript type matching profiles table structure
 */
export interface Profile {
  id: string;
  age_range: string;             // e.g., "25-34"
  weight_kg: number;
  goal: string;                  // e.g., "move_more", "build_strength"
  fitness_level: 1 | 2 | 3;      // 1=beginner, 2=intermediate, 3=advanced
  injuries: string[];            // Array of injury identifiers (snake_case)
  minutes_per_day: number;
  language: string;              // ISO 639-1 code
  created_at: string;            // ISO 8601 date-time
  updated_at: string;            // ISO 8601 date-time
}

// ============================================================================
// Plan Request Types
// ============================================================================

/**
 * Request for generating a workout plan
 * Requirement 9.3: Define PlanRequest with duration_days, focus_areas, custom_instructions
 */
export interface PlanRequest {
  duration_days: number;         // Number of days in the plan
  focus_areas: string[];         // e.g., ["lower_body", "core"]
  custom_instructions?: string;  // Optional user-provided instructions
}

// ============================================================================
// Exercise Catalog Types
// ============================================================================

/**
 * Exercise from the catalog
 * Requirement 9.4: Define Exercise interface matching exercise schema
 */
export interface Exercise {
  id: string;                    // kebab-case identifier, e.g. "push-up"
  group: ExerciseGroup;          // Exercise category
  name_key: string;              // Localization key (dot notation)
  body_parts: string[];          // Body parts targeted
  level: 1 | 2 | 3;             // Difficulty level
  unit: "reps" | "seconds";     // Measurement unit
  default: ExerciseDefault;      // Default configuration
  met: number;                   // MET value (1.0-15.0)
  avoid_if: string[];            // Injury identifiers (snake_case)
  quiet: boolean;                // Can be done silently
  media: ExerciseMedia;          // Media file references
}

export type ExerciseGroup = "warm_up" | "lower_body" | "upper_body" | "core" | "cardio";

export interface ExerciseDefault {
  sets: number;                  // Positive integer
  amount: number;                // Positive integer (reps or seconds)
  rest_seconds: number;          // Non-negative integer
}

export interface ExerciseMedia {
  video: string;                 // Filename in Storage
  poster: string;                // Filename in Storage
  model: string;                 // Filename in Storage (3D model)
}

// ============================================================================
// Workout Plan Types
// ============================================================================

/**
 * Complete workout plan structure
 * Requirement 9.4: Define WorkoutPlan matching workout-plan.schema.json
 */
export interface WorkoutPlan {
  schema_version: string;        // Semver (e.g., "1.0.0")
  id: string;                    // UUID
  created_at: string;            // ISO 8601 date-time
  goal: string;                  // User's fitness goal
  days: WorkoutDay[];            // Non-empty array
  notes: string;                 // AI-generated notes
}

/**
 * Single day in a workout plan
 * Requirement 9.4: Define WorkoutDay interface
 */
export interface WorkoutDay {
  day: number;                   // Positive integer (1-based)
  title: string;                 // Day description
  minutes: number;               // Estimated duration
  blocks: WorkoutBlock[];        // Non-empty array
}

/**
 * Block within a workout day (warm_up, main, cool_down)
 * Requirement 9.4: Define WorkoutBlock interface
 */
export interface WorkoutBlock {
  type: "warm_up" | "main" | "cool_down";
  items: ExerciseItem[];         // Non-empty array
}

/**
 * Individual exercise within a block
 * Requirement 9.4: Define ExerciseItem interface
 */
export interface ExerciseItem {
  exercise_id: string;           // Must exist in catalog
  sets: number;                  // Positive integer
  amount: number;                // Positive integer (reps or seconds)
  rest_seconds?: number;         // Optional, non-negative
}

// ============================================================================
// Validation Result Types
// ============================================================================

/**
 * Result of workout plan validation
 * Requirement 9.5: Define ValidationResult interface
 */
export interface ValidationResult {
  success: boolean;
  errors: ValidationError[];
}

/**
 * Individual validation error with location
 * Requirement 9.5: Define ValidationError interface
 */
export interface ValidationError {
  path: string;                  // JSON path to error (e.g., "days[0].blocks[1].items[2]")
  message: string;               // Human-readable error message
  code: string;                  // Error code for programmatic handling
}

/**
 * Result of safety validation (injury checking)
 * Requirement 9.5: Define SafetyValidationResult interface
 */
export interface SafetyValidationResult {
  success: boolean;
  violations: SafetyViolation[];
}

/**
 * Individual safety violation
 * Requirement 9.5: Define SafetyViolation interface
 */
export interface SafetyViolation {
  exercise_id: string;           // Exercise causing the violation
  injury: string;                // Injury identifier that conflicts
  location: string;              // Path in plan where violation occurs
}

// ============================================================================
// Parser Types
// ============================================================================

/**
 * Generic result type for parsing operations
 * Requirement 9.5: Define ParseResult<T> generic type
 */
export interface ParseResult<T> {
  success: boolean;
  data?: T;                      // Parsed data if success is true
  error?: string;                // Error message if success is false
}

// ============================================================================
// Catalog Filter Types
// ============================================================================

/**
 * Filters for catalog queries
 */
export interface CatalogFilters {
  group?: string;                // Filter by exercise group
  max_level?: number;            // Maximum difficulty level
  exclude_injuries?: string[];   // Exclude exercises with these injury conflicts
}

// ============================================================================
// Tool Result Types
// ============================================================================

/**
 * Result from validation tool function
 */
export interface ValidationToolResult {
  success: boolean;
  errors?: ValidationError[];
  message: string;
}

// ============================================================================
// Database Types
// ============================================================================

/**
 * Workout log from database
 */
export interface WorkoutLog {
  id: string;
  user_id: string;
  plan_id: string | null;
  day_number: number;
  exercises_completed: any[];    // JSONB array
  duration_minutes: number;
  rating: number;                // 1-5
  notes: string | null;
  completed_at: string;          // ISO 8601 date-time
}

// ============================================================================
// Assistant Interface
// ============================================================================

/**
 * Provider-agnostic interface for AI plan generation
 * Requirement 9.1: Define Assistant interface
 */
export interface Assistant {
  generatePlan(
    profile: Profile,
    request: PlanRequest,
    context?: PlanContext
  ): Promise<WorkoutPlan>;
  /** The plan changed as the feedback asks. Validated like a new plan; throws PlanGenerationError otherwise. */
  adjustPlan(
    profile: Profile,
    plan: WorkoutPlan,
    feedback: string,
    context?: PlanContext
  ): Promise<WorkoutPlan>;
  /** One reply in a conversation. Never throws for unreadable model output, only for a failed call. */
  chat(input: ChatInput): Promise<ChatResult>;
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatInput {
  profile: Profile;
  message: string;
  /** Earlier turns, oldest first. */
  history: ChatTurn[];
  /** The user's active plan, or null when they have none. */
  plan: WorkoutPlan | null;
  health?: HealthSummary | null;
}

export interface ChatResult {
  reply: string;
  /** How the plan should change, in the model's words. The server applies it through adjustPlan. */
  adjustPlan?: string;
  /** Injuries the user reported, already limited to known ones the profile does not have. */
  addInjuries?: string[];
}

/**
 * What the server knows about the user beyond the profile when a plan is generated.
 * `health` is null or absent for a user with no recent health days.
 */
export interface PlanContext {
  health?: HealthSummary | null;
}

export type { HealthSummary } from '@aura-fit/health-core';

/** An AI action counted against the user's allowance (see docs/usage-limits-spec.md). */
export type UsageAction = 'chat_message' | 'new_plan';

/** The database's answer to "may this user make one more AI request?". */
export interface UsageDecision {
  allowed: boolean;
  /** The request id was seen before and not released: a replay, which must not run the model again. */
  duplicate: boolean;
  /** The reserved use, to be finished after the model call; null when refused. */
  useId: string | null;
  tier: 'free' | 'pro';
  limit: number;
  /** Uses left after this one. */
  remaining: number;
  /** ISO time when a refused user may ask again. */
  resetsAt: string;
}

/** What the database did with one RevenueCat event (see docs/revenuecat-webhook-spec.md). */
export type RevenueCatDbOutcome = 'applied' | 'duplicate' | 'stale' | 'unknown_user';

/** One verified RevenueCat event, ready for apply_revenuecat_event. */
export interface RevenueCatEventInput {
  eventId: string;
  eventType: string;
  environment: string;
  userId: string;
  /** ISO time of the event (event_timestamp_ms). */
  eventAt: string;
  action: 'set_expiry' | 'revoke' | 'none';
  /** ISO time; set for 'set_expiry' only. */
  expiresAt: string | null;
}


// ============================================================================
// Custom Error Classes
// ============================================================================

/**
 * Base application error class
 * Requirement 9.6: Define custom error classes extending base AppError
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error thrown when plan generation fails
 * Requirement 9.6: Define PlanGenerationError
 */
export class PlanGenerationError extends AppError {
  constructor(
    message: string,
    public readonly attempts: number,
    public readonly lastErrors: ValidationError[]
  ) {
    super(message, 'PLAN_GENERATION_ERROR', 500);
  }
}

/**
 * Error thrown when validation fails
 * Requirement 9.6: Define ValidationError (class)
 * Note: This is the error class, distinct from the ValidationError interface
 */
export class ValidationErrorClass extends AppError {
  constructor(
    message: string,
    public readonly validationCode: string,
    public readonly path?: string
  ) {
    super(message, 'VALIDATION_ERROR', 400);
  }
}

/**
 * Error thrown when API calls fail
 * Requirement 9.6: Define APIError
 */
export class APIError extends AppError {
  constructor(
    message: string,
    public readonly provider: string,
    statusCode: number = 500
  ) {
    super(message, 'API_ERROR', statusCode);
  }
}

/**
 * Error thrown when authentication fails
 * Requirement 9.6: Define AuthenticationError
 */
export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 'AUTHENTICATION_ERROR', 401);
  }
}

/**
 * Error thrown when database operations fail
 * Requirement 9.6: Define DatabaseError
 */
export class DatabaseError extends AppError {
  constructor(
    message: string,
    public readonly operation: string,
    public readonly details?: any
  ) {
    super(message, 'DATABASE_ERROR', 500);
  }
}
