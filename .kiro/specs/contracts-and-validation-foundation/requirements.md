# Requirements Document

## Introduction

The Contracts and Validation Foundation establishes the core data structures, schemas, and validation system for Aura Fit v2. This foundation includes the exercise catalog with 10 starter exercises, JSON Schema definitions for exercises and workout plans, a validation system with correctness properties, the Supabase backend data model with Row Level Security, and an AI service using OpenRouter that generates schema-valid workout plans. The schemas serve as the contract between all system components, ensuring that AI-generated plans are always valid, safe (respecting user injuries), and executable.

## Glossary

- **Exercise_Catalog**: A JSON file containing the complete list of exercises available for workout generation
- **Workout_Plan**: A structured JSON object representing a multi-day workout program with exercises organized into blocks
- **JSON_Schema**: A JSON Schema draft 2020-12 document that defines the structure and validation rules for data
- **Validator**: A TypeScript module that validates workout plans against schemas and business rules
- **Plan_Generator**: The AI service component that creates workout plans using the OpenRouter API
- **Profile**: A user's fitness information including age, weight, goals, fitness level, injuries, and preferences
- **Supabase**: The backend-as-a-service platform providing database, authentication, and storage
- **Row_Level_Security**: Postgres security policies that restrict data access to row owners only
- **OpenRouter**: An API gateway providing unified access to multiple LLM models
- **MET**: Metabolic Equivalent of Task - a measure of exercise intensity used for calorie estimation
- **EARS_Pattern**: Easy Approach to Requirements Syntax - structured requirement patterns for clarity

## Requirements

### Requirement 1: Exercise Catalog Structure

**User Story:** As a system architect, I want a well-defined exercise catalog structure, so that all components can reliably reference exercises with complete metadata.

#### Acceptance Criteria

1. THE Exercise_Catalog SHALL be stored as a JSON file at `catalog/exercises.json`
2. THE Exercise_Catalog SHALL contain at least the 10 starter exercises (Requirement 13), distributed across 5 groups; it may grow beyond them
3. THE Exercise_Catalog SHALL include these groups: warm_up, lower_body, upper_body, core, and cardio
4. WHEN an exercise is defined, THE Exercise_Catalog SHALL include: id, group, name_key, body_parts array, level (1-3), unit (reps or seconds), default configuration (sets, amount, rest_seconds), MET value, avoid_if array, quiet boolean, and media object
5. THE Exercise_Catalog SHALL use kebab-case for exercise IDs (e.g. "push-up"), and each ID SHALL be unique
6. WHEN an exercise has avoid_if entries, THE Exercise_Catalog SHALL use snake_case injury identifiers
7. THE Exercise_Catalog SHALL set quiet to true for exercises that can be done silently in an office
8. FOR ALL exercises, the MET value SHALL be a positive number greater than 1.0 and less than 15.0

### Requirement 2: Exercise Localization

**User Story:** As a developer, I want exercise names and descriptions stored separately from exercise data, so that I can support multiple languages without duplicating exercise metadata.

#### Acceptance Criteria

1. THE System SHALL store localized text in `catalog/locales/<lang>.json` files
2. THE System SHALL support English as the initial language with locale code `en`
3. WHEN an exercise uses name_key, THE Localization_File SHALL provide a corresponding translation keyed by that name_key
4. THE Localization_File SHALL include at minimum: exercise name, description, and form tips
5. THE System SHALL use dot notation for locale keys (e.g., "exercise.squat.name")

### Requirement 3: Exercise JSON Schema

**User Story:** As a developer, I want a JSON Schema for exercises, so that I can validate the catalog structure automatically.

#### Acceptance Criteria

1. THE System SHALL provide an Exercise JSON Schema at `schemas/exercise.schema.json`
2. THE Exercise_Schema SHALL use JSON Schema draft 2020-12
3. THE Exercise_Schema SHALL enforce that id, group, name_key, body_parts, level, unit, default, met, avoid_if, quiet, and media are present
4. THE Exercise_Schema SHALL restrict level to integers 1, 2, or 3
5. THE Exercise_Schema SHALL restrict unit to enum values "reps" or "seconds"
6. THE Exercise_Schema SHALL require default to contain sets (positive integer), amount (positive integer), and rest_seconds (non-negative integer)
7. THE Exercise_Schema SHALL require media to contain video, poster, and model string properties
8. THE Exercise_Schema SHALL enforce that body_parts and avoid_if are arrays of strings

### Requirement 4: Workout Plan JSON Schema

**User Story:** As a system architect, I want a JSON Schema for workout plans, so that all generated plans follow a consistent, validatable structure.

#### Acceptance Criteria

1. THE System SHALL provide a Workout Plan JSON Schema at `schemas/workout-plan.schema.json`
2. THE Workout_Plan_Schema SHALL use JSON Schema draft 2020-12
3. THE Workout_Plan_Schema SHALL enforce that schema_version, id, created_at, goal, days, and notes are present
4. THE Workout_Plan_Schema SHALL require days to be a non-empty array of day objects
5. WHEN a day is defined, THE Workout_Plan_Schema SHALL require: day (positive integer), title, minutes (positive integer), and blocks (non-empty array)
6. WHEN a block is defined, THE Workout_Plan_Schema SHALL require: type (enum: warm_up, main, cool_down) and items (non-empty array)
7. WHEN an exercise item is defined, THE Workout_Plan_Schema SHALL require: exercise_id, sets (positive integer), and amount (positive integer)
8. THE Workout_Plan_Schema SHALL allow optional rest_seconds (non-negative integer) on exercise items
9. THE Workout_Plan_Schema SHALL enforce schema_version format as semver (e.g., "1.0.0")
10. THE Workout_Plan_Schema SHALL enforce created_at as ISO 8601 date-time string
11. THE Workout_Plan_Schema SHALL enforce id as a non-empty string

### Requirement 5: Workout Plan Validator

**User Story:** As a developer, I want a validation function that checks both schema compliance and business rules, so that I can reject invalid plans before they reach users.

#### Acceptance Criteria

1. THE Validator SHALL export a function `validateWorkoutPlan(plan: unknown, catalog: Exercise[]): ValidationResult`
2. WHEN validateWorkoutPlan is called, THE Validator SHALL first validate the plan against the Workout Plan JSON Schema
3. WHEN schema validation fails, THE Validator SHALL return a ValidationResult with success: false and an array of schema error messages
4. WHEN schema validation passes, THE Validator SHALL verify that every exercise_id in the plan exists in the catalog
5. WHEN an exercise_id does not exist in the catalog, THE Validator SHALL return a ValidationResult indicating which exercise_id is missing
6. THE Validator SHALL export a function `validatePlanSafety(plan: WorkoutPlan, profile: Profile, catalog: Exercise[]): SafetyValidationResult`
7. WHEN validatePlanSafety is called, THE Validator SHALL check that no exercise in the plan matches any injury in the user's profile avoid list
8. WHEN an unsafe exercise is found, THE Validator SHALL return which exercise violates which injury constraint
9. THE Validator SHALL use Ajv library version 8.x or higher for JSON Schema validation
10. FOR ALL valid workout plans, validating the plan SHALL return success: true with an empty errors array

### Requirement 6: Parser and Pretty Printer for Workout Plans

**User Story:** As a developer, I want reliable parsing and formatting functions for workout plans, so that I can safely convert between JSON strings and validated objects.

#### Acceptance Criteria

1. THE Validator SHALL export a function `parseWorkoutPlan(json: string): ParseResult<WorkoutPlan>`
2. WHEN parseWorkoutPlan receives valid JSON, THE Validator SHALL parse it into a WorkoutPlan object
3. WHEN parseWorkoutPlan receives invalid JSON, THE Validator SHALL return a ParseResult with success: false and a parse error message
4. THE Validator SHALL export a function `formatWorkoutPlan(plan: WorkoutPlan): string`
5. THE Pretty_Printer SHALL format WorkoutPlan objects as indented JSON with 2-space indentation
6. FOR ALL valid WorkoutPlan objects, parsing the formatted output SHALL produce an equivalent WorkoutPlan object (round-trip property)

### Requirement 7: Supabase Database Schema

**User Story:** As a backend developer, I want a complete Supabase database schema, so that I can store user profiles, workout plans, logs, and chat history with proper security.

#### Acceptance Criteria

1. THE System SHALL create a `profiles` table with columns: id (uuid, primary key, references auth.users), age_range (text), weight_kg (integer), goal (text), fitness_level (integer 1-3), injuries (text array), minutes_per_day (integer), language (text), created_at (timestamptz), updated_at (timestamptz)
2. THE System SHALL create a `plans` table with columns: id (uuid, primary key), user_id (uuid, references profiles.id), schema_version (text), plan_json (jsonb), provider (text), status (text), created_at (timestamptz)
3. THE System SHALL create a `workout_logs` table with columns: id (uuid, primary key), user_id (uuid, references profiles.id), plan_id (uuid, references plans.id), day_number (integer), exercises_completed (jsonb array), duration_minutes (integer), rating (integer 1-5), notes (text), completed_at (timestamptz)
4. THE System SHALL create a `assistant_messages` table with columns: id (uuid, primary key), user_id (uuid, references profiles.id), role (text: user or assistant), content (text), created_at (timestamptz)
5. THE System SHALL store all migration files in `supabase/migrations/` directory
6. THE System SHALL provide seed data in `supabase/seed.sql` with at least 2 test profiles
7. WHEN a user signs up, THE System SHALL automatically create a profile row via database trigger or application code

### Requirement 8: Row Level Security Policies

**User Story:** As a security engineer, I want Row Level Security policies on all tables, so that users can only access their own data.

#### Acceptance Criteria

1. THE System SHALL enable Row Level Security on profiles, plans, workout_logs, and assistant_messages tables
2. THE System SHALL create a SELECT policy on profiles allowing users to read only their own profile where `auth.uid() = id`
3. THE System SHALL create an INSERT policy on profiles allowing users to create only their own profile where `auth.uid() = id`
4. THE System SHALL create an UPDATE policy on profiles allowing users to update only their own profile where `auth.uid() = id`
5. THE System SHALL create a SELECT policy on plans allowing users to read only their own plans where `auth.uid() = user_id`
6. THE System SHALL create an INSERT policy on plans allowing users to create only their own plans where `auth.uid() = user_id`
7. THE System SHALL create a SELECT policy on workout_logs allowing users to read only their own logs where `auth.uid() = user_id`
8. THE System SHALL create an INSERT policy on workout_logs allowing users to create only their own logs where `auth.uid() = user_id`
9. THE System SHALL create SELECT and INSERT policies on assistant_messages allowing users to access only their own messages where `auth.uid() = user_id`
10. THE System SHALL document all RLS policies in the migration files with comments explaining their purpose

### Requirement 9: AI Service Core Interface

**User Story:** As a developer, I want a clear TypeScript interface for the AI service, so that plan generation has a consistent contract regardless of provider.

#### Acceptance Criteria

1. THE System SHALL define a TypeScript interface `Assistant` with method `generatePlan(profile: Profile, request: PlanRequest): Promise<WorkoutPlan>`
2. THE System SHALL define a TypeScript type `Profile` matching the profiles table structure
3. THE System SHALL define a TypeScript type `PlanRequest` with properties: duration_days (integer), focus_areas (string array), and custom_instructions (optional string)
4. THE System SHALL define a TypeScript type `WorkoutPlan` matching the workout-plan.schema.json structure
5. THE Assistant interface SHALL use types that are automatically generated from JSON schemas or manually maintained with strict type checking
6. THE System SHALL export all types from a central `types.ts` file in the service

### Requirement 10: OpenRouter Plan Generator

**User Story:** As a developer, I want an OpenRouter-based plan generator, so that I can create workout plans using LLM models through a unified API.

#### Acceptance Criteria

1. THE System SHALL implement the Assistant interface as class `OpenRouterAssistant`
2. THE OpenRouterAssistant SHALL use the OpenRouter API endpoint at `https://openrouter.ai/api/v1/chat/completions`
3. THE OpenRouterAssistant SHALL read the API key from environment variable `OPENROUTER_API_KEY`
4. THE OpenRouterAssistant SHALL read the model name from environment variable `OPENROUTER_MODEL` with default `anthropic/claude-3.5-sonnet`
5. WHEN generatePlan is called, THE OpenRouterAssistant SHALL construct a system prompt including the exercise catalog, user profile, and plan schema
6. WHEN generatePlan is called, THE OpenRouterAssistant SHALL request a JSON response matching the WorkoutPlan schema
7. WHEN the LLM returns a response, THE OpenRouterAssistant SHALL parse the JSON and validate it using the Validator
8. IF validation fails, THE OpenRouterAssistant SHALL make one retry attempt with the validation errors included in the prompt
9. IF the retry also fails, THE OpenRouterAssistant SHALL throw a PlanGenerationError with details of both attempts
10. THE OpenRouterAssistant SHALL log all API calls with request/response bodies for debugging (excluding sensitive data)

### Requirement 11: AI Service Tool Functions

**User Story:** As a developer, I want tool functions that the AI can call, so that the plan generator can access catalog data, user profiles, and validation.

#### Acceptance Criteria

1. THE System SHALL implement function `getCatalog(filters?: CatalogFilters): Exercise[]` that returns filtered exercises
2. THE CatalogFilters type SHALL support optional properties: group, max_level, exclude_injuries (string array)
3. WHEN getCatalog is called with exclude_injuries, THE Function SHALL return only exercises where avoid_if does not intersect with exclude_injuries
4. THE System SHALL implement function `getProfile(userId: string): Promise<Profile>` that fetches from Supabase
5. THE System SHALL implement function `getRecentLogs(userId: string, limit: number): Promise<WorkoutLog[]>` that fetches recent logs ordered by completed_at descending
6. THE System SHALL implement function `validatePlanTool(plan: unknown): ValidationToolResult` that wraps the Validator and returns a structured result
7. THE System SHALL implement function `savePlan(userId: string, plan: WorkoutPlan, provider: string): Promise<string>` that inserts into the plans table and returns the plan ID
8. WHEN savePlan is called, THE Function SHALL validate the plan before saving
9. IF validation fails, THE Function SHALL throw an error without saving
10. THE System SHALL export tool definitions in OpenAI tool format for use with OpenRouter

### Requirement 12: AI Service Configuration

**User Story:** As a DevOps engineer, I want a clear configuration structure for the AI service, so that I can deploy it with proper secrets management.

#### Acceptance Criteria

1. THE System SHALL provide a `.env.example` file at `services/assistant/.env.example`
2. THE Environment_Example SHALL document these required variables: OPENROUTER_API_KEY, SUPABASE_URL, SUPABASE_SECRET_KEY
3. THE Environment_Example SHALL document these optional variables: OPENROUTER_MODEL, PORT, LOG_LEVEL
4. THE System SHALL validate that all required environment variables are present at startup
5. WHEN a required environment variable is missing, THE System SHALL log a clear error message and exit with code 1
6. THE System SHALL never log or expose API keys in error messages or responses
7. THE System SHALL use the Supabase secret key (not publishable key) for server-side operations
8. THE System SHALL include a README.md in `services/assistant/` explaining the configuration and how to run the service

### Requirement 13: 10 Starter Exercises

**User Story:** As a content creator, I want 10 starter exercises distributed across 5 groups, so that the system has a minimal viable catalog for testing and initial deployment. Later exercises add to this set; they do not replace it.

#### Acceptance Criteria

1. THE Exercise_Catalog SHALL include these warm_up exercises: "neck-rolls" and "arm-circles"
2. THE Exercise_Catalog SHALL include these lower_body exercises: "squat" and "reverse-lunge"
3. THE Exercise_Catalog SHALL include these upper_body exercises: "push-up" and "chair-dip"
4. THE Exercise_Catalog SHALL include these core exercises: "plank" and "glute-bridge"
5. THE Exercise_Catalog SHALL include these cardio exercises: "jumping-jacks" and "high-knees"
6. WHEN defining squat, THE Exercise_Catalog SHALL set level to 1, unit to "reps", default sets to 3, default amount to 12, and avoid_if to ["knee_injury"]
7. WHEN defining push-up, THE Exercise_Catalog SHALL set level to 2, unit to "reps", and avoid_if to ["shoulder_injury", "wrist_injury"]
8. WHEN defining plank, THE Exercise_Catalog SHALL set level to 1, unit to "seconds", default amount to 30, and avoid_if to ["lower_back_injury", "shoulder_injury"]
9. WHEN defining jumping-jacks, THE Exercise_Catalog SHALL set quiet to false and avoid_if to ["knee_injury"]
10. FOR ALL exercises, THE Exercise_Catalog SHALL provide realistic MET values based on standard exercise intensity tables

### Requirement 14: Supabase Storage Configuration

**User Story:** As a backend developer, I want a Supabase Storage bucket configured for exercise media, so that the system can serve videos and 3D models.

#### Acceptance Criteria

1. THE System SHALL create a public Storage bucket named `exercise-media`
2. THE Storage_Bucket SHALL allow public read access for all files
3. THE Storage_Bucket SHALL restrict write access to authenticated service role only
4. THE System SHALL organize files in the bucket by media type: `videos/`, `posters/`, `models/`
5. THE System SHALL document the bucket configuration in `supabase/migrations/` or in a setup script
6. THE System SHALL provide a placeholder file in each subdirectory to maintain the folder structure

### Requirement 15: Validation Integration Tests

**User Story:** As a QA engineer, I want integration tests that verify the complete validation pipeline, so that I can ensure plans are properly validated before reaching users.

#### Acceptance Criteria

1. THE System SHALL provide integration tests in `services/assistant/tests/validation.integration.test.ts`
2. THE Tests SHALL verify that a valid plan passes all validation checks
3. THE Tests SHALL verify that a plan with an invalid exercise_id fails validation with a clear error message
4. THE Tests SHALL verify that a plan with an exercise conflicting with user injuries fails safety validation
5. THE Tests SHALL verify that a plan failing JSON Schema validation returns specific schema errors
6. THE Tests SHALL use the real Exercise_Catalog and JSON schemas (not mocks)
7. THE Tests SHALL cover the round-trip property: parse → format → parse produces equivalent plans
8. THE Tests SHALL run with `npm test` or `pnpm test` command
9. THE Tests SHALL use a testing framework appropriate for Node.js (Jest, Vitest, or Node's native test runner)
10. THE Tests SHALL achieve at least 90% code coverage on the validator module

### Requirement 16: Plan Generation Property-Based Tests

**User Story:** As a QA engineer, I want property-based tests for plan generation, so that I can verify correctness properties hold across many randomly generated profiles.

#### Acceptance Criteria

1. THE System SHALL provide property-based tests in `services/assistant/tests/generation.property.test.ts`
2. THE Tests SHALL use a property-based testing library (fast-check, jsverify, or testcheck-js)
3. THE Tests SHALL verify property: FOR ALL generated plans, the plan validates against workout-plan.schema.json
4. THE Tests SHALL verify property: FOR ALL generated plans, every exercise_id exists in the catalog
5. THE Tests SHALL verify property: FOR ALL profiles with injuries, no plan contains exercises matching those injuries
6. THE Tests SHALL generate random but realistic profiles with varying: age_range, fitness_level (1-3), injuries (0-3 from a realistic set), and minutes_per_day (5-30)
7. THE Tests SHALL generate at least 50 random test cases per property
8. WHEN a property fails, THE Test_Framework SHALL provide a minimal failing example
9. THE Tests SHALL use the real OpenRouterAssistant (with API calls) for property verification
10. THE Tests SHALL have a timeout of 5 minutes to account for multiple LLM API calls

### Requirement 17: Error Handling and Logging

**User Story:** As a site reliability engineer, I want comprehensive error handling and structured logging, so that I can diagnose issues in production.

#### Acceptance Criteria

1. THE System SHALL use a structured logging library (pino, winston, or bunyan)
2. THE System SHALL log at appropriate levels: error, warn, info, debug
3. WHEN an LLM API call fails, THE System SHALL log the error with: timestamp, provider, model, HTTP status, error message, and request ID
4. WHEN validation fails, THE System SHALL log: plan ID, validation errors, and which validator rule failed
5. WHEN an exception occurs in generatePlan, THE System SHALL catch it, log details, and throw a typed error
6. THE System SHALL define custom error types: PlanGenerationError, ValidationError, APIError
7. THE System SHALL never log full workout plans or user profiles at info level (only at debug level)
8. THE System SHALL include correlation IDs in logs to trace a request across multiple log entries
9. THE System SHALL export logs in JSON format for structured log aggregation
10. THE System SHALL respect LOG_LEVEL environment variable (default: "info")

### Requirement 18: API Endpoint for Plan Generation

**User Story:** As a mobile app developer, I want a REST API endpoint to generate workout plans, so that I can integrate plan generation into the mobile app.

#### Acceptance Criteria

1. THE System SHALL expose POST endpoint `/api/plans/generate`
2. THE Endpoint SHALL require authentication via Supabase JWT in Authorization header
3. THE Endpoint SHALL accept JSON body with: duration_days, focus_areas, custom_instructions
4. WHEN the request is authenticated, THE Endpoint SHALL extract user_id from the JWT
5. THE Endpoint SHALL fetch the user's profile using the user_id
6. THE Endpoint SHALL call OpenRouterAssistant.generatePlan with the profile and request
7. WHEN plan generation succeeds, THE Endpoint SHALL return 201 with the generated plan JSON and plan ID
8. WHEN plan generation fails, THE Endpoint SHALL return 400 with error details for validation failures or 500 for server errors
9. THE Endpoint SHALL validate request body schema before processing
10. THE Endpoint SHALL respond within 30 seconds or return 504 Gateway Timeout

### Requirement 19: Service Dependency Management

**User Story:** As a developer, I want clear dependency management for the AI service, so that I can install and run the service reliably.

#### Acceptance Criteria

1. THE System SHALL provide a `package.json` in `services/assistant/` directory
2. THE Package_JSON SHALL declare dependencies: @supabase/supabase-js (^2.0.0), ajv (^8.0.0), openai (^4.0.0 for OpenRouter compatibility), and a logging library
3. THE Package_JSON SHALL declare dev dependencies: typescript (^5.0.0), a test framework, and a property-based testing library
4. THE Package_JSON SHALL define scripts: "build", "start", "dev", "test", "test:integration", "test:properties"
5. THE System SHALL use TypeScript with strict mode enabled
6. THE System SHALL provide a `tsconfig.json` with target ES2022 and module NodeNext
7. THE Package_JSON SHALL specify Node.js engine requirement: ">=18.0.0"
8. THE System SHALL include a `.gitignore` excluding node_modules, .env, dist, and coverage directories

### Requirement 20: Documentation and Examples

**User Story:** As a new developer joining the project, I want clear documentation and examples, so that I can understand and work with the contracts and validation system.

#### Acceptance Criteria

1. THE System SHALL provide a README.md in the project root explaining the contracts-first architecture
2. THE System SHALL provide example workout plans in `examples/plans/` directory with at least 3 valid plans
3. THE System SHALL provide example profiles in `examples/profiles/` directory covering: beginner, intermediate, advanced, and profiles with various injuries
4. THE System SHALL document the validation flow in `docs/validation-flow.md` with a diagram
5. THE System SHALL document the plan generation process in `docs/plan-generation.md`
6. THE System SHALL include inline code comments explaining complex validation logic
7. THE System SHALL document all environment variables in services/assistant/README.md
8. THE Examples SHALL be valid against their respective schemas
9. THE System SHALL provide a quickstart guide in services/assistant/README.md with setup steps
10. THE Documentation SHALL include API request/response examples for the plan generation endpoint

