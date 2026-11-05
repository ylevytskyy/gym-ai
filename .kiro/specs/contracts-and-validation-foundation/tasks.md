# Implementation Plan: Contracts and Validation Foundation

## Overview

This implementation establishes the core contracts layer for Aura Fit v2, including JSON schemas, the exercise catalog, validation system, Supabase database with RLS, and the AI service with OpenRouter. The approach follows a bottom-up strategy: contracts first (schemas and catalog), then validation logic, then database layer, then AI service, and finally integration with tests at each level.

## Tasks

- [x] 1. Create JSON Schema definitions and exercise catalog
  - [x] 1.1 Create exercise JSON Schema
    - Create `schemas/exercise.schema.json` using JSON Schema draft 2020-12
    - Define required fields: id, group, name_key, body_parts, level, unit, default, met, avoid_if, quiet, media
    - Enforce level as enum [1, 2, 3], unit as enum ["reps", "seconds"]
    - Enforce default object with sets, amount (positive integers), rest_seconds (non-negative)
    - Enforce media object with video, poster, model strings
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

  - [x] 1.2 Create workout plan JSON Schema
    - Create `schemas/workout-plan.schema.json` using JSON Schema draft 2020-12
    - Define required fields: schema_version, id, created_at, goal, days, notes
    - Enforce days as non-empty array with day, title, minutes, blocks
    - Enforce blocks with type enum ["warm_up", "main", "cool_down"] and non-empty items array
    - Enforce exercise items with exercise_id, sets, amount (positive integers), optional rest_seconds
    - Add format validation for schema_version (semver), created_at (date-time), id (non-empty string)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11_

  - [x] 1.3 Create exercise catalog with 10 starter exercises
    - Create `catalog/exercises.json` with version "1.0.0"
    - Add 2 warm_up exercises: neck-rolls, arm-circles (level 1, quiet: true)
    - Add 2 lower_body exercises: squat (level 1, knee_injury), reverse-lunge (level 2, knee_injury, hip_injury)
    - Add 2 upper_body exercises: push-up (level 2, shoulder_injury, wrist_injury), chair-dip (level 2, shoulder_injury, elbow_injury)
    - Add 2 core exercises: plank (level 1, seconds, lower_back_injury, shoulder_injury), glute-bridge (level 1, lower_back_injury)
    - Add 2 cardio exercises: jumping-jacks (level 1, quiet: false, knee_injury), high-knees (level 2, seconds, quiet: false, knee_injury, hip_injury)
    - Use realistic MET values (2.0-9.0 range) based on exercise intensity
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8, 13.9, 13.10_

  - [x] 1.4 Create English localization file
    - Create `catalog/locales/en.json`
    - Add translations for all 10 exercises with name, description, and tips
    - Use dot notation keys matching name_key from catalog (e.g., "exercise.squat.name")
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 2. Set up TypeScript project structure for AI service
  - [x] 2.1 Initialize AI service package
    - Create `services/assistant/package.json` with dependencies: @supabase/supabase-js ^2.0.0, ajv ^8.0.0, ajv-formats, openai ^4.0.0, pino
    - Add dev dependencies: typescript ^5.0.0, vitest, @types/node, fast-check
    - Define scripts: build, start, dev, test, test:integration, test:properties
    - Set Node.js engine requirement to >=18.0.0
    - Create `services/assistant/tsconfig.json` with strict mode, target ES2022, module NodeNext
    - Create `services/assistant/.gitignore` for node_modules, .env, dist, coverage
    - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5, 19.6, 19.7, 19.8_

  - [x] 2.2 Create TypeScript type definitions
    - Create `services/assistant/src/types.ts`
    - Define Profile interface matching profiles table structure
    - Define PlanRequest interface with duration_days, focus_areas, custom_instructions
    - Define WorkoutPlan, WorkoutDay, WorkoutBlock, ExerciseItem interfaces matching schema
    - Define Exercise interface matching exercise schema
    - Define ValidationResult, ValidationError, SafetyValidationResult, SafetyViolation interfaces
    - Define ParseResult<T> generic type
    - Define custom error classes: PlanGenerationError, ValidationError, APIError, AuthenticationError, DatabaseError extending base AppError
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [x] 2.3 Create environment configuration
    - Create `services/assistant/.env.example` with required vars: OPENROUTER_API_KEY, SUPABASE_URL, SUPABASE_SECRET_KEY
    - Add optional vars: OPENROUTER_MODEL, PORT, LOG_LEVEL, NODE_ENV, APP_URL
    - Create `services/assistant/src/config.ts` with validateConfig() function
    - Implement startup validation checking for required environment variables
    - Exit with code 1 and clear error message if required vars are missing
    - Validate SUPABASE_URL format (must start with https://)
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7_

  - [x] 2.4 Set up structured logging
    - Create `services/assistant/src/logger.ts` using pino
    - Configure log level from LOG_LEVEL environment variable (default: info)
    - Add redaction for sensitive fields: authorization headers, api_key, secret, token
    - Add serializers for errors
    - Include service name and environment in base log context
    - _Requirements: 17.1, 17.2, 17.9, 17.10_

- [x] 3. Implement validation module
  - [x] 3.1 Create schema validation with Ajv
    - Create `services/assistant/src/validator/validate.ts`
    - Import Ajv with allErrors: true, verbose: true configuration
    - Load and compile workout-plan.schema.json at module initialization
    - Implement validateWorkoutPlan(plan: unknown, catalog: Exercise[]): ValidationResult
    - Stage 1: Run Ajv schema validation, return errors if fails
    - Stage 2: Build catalog index (Set of exercise IDs) and validate all exercise_id references
    - Return ValidationResult with success boolean and errors array
    - Implement transformAjvErrors() helper to convert Ajv errors to ValidationError format
    - Implement buildCatalogIndex() and validateReferences() helpers
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.9, 5.10_

  - [x] 3.2 Implement safety validation
    - In `services/assistant/src/validator/validate.ts`, implement validatePlanSafety(plan: WorkoutPlan, profile: Profile, catalog: Exercise[]): SafetyValidationResult
    - Build catalog Map keyed by exercise ID for fast lookups
    - Create Set of user injuries from profile
    - Walk plan tree (days → blocks → items) and check each exercise
    - For each exercise, check if avoid_if array intersects with user injuries
    - Collect all violations with exercise_id, injury, and location path
    - Return SafetyValidationResult with success boolean and violations array
    - _Requirements: 5.6, 5.7, 5.8_

  - [x] 3.3 Implement parser and pretty printer
    - Create `services/assistant/src/validator/serialize.ts`
    - Implement parseWorkoutPlan(json: string): ParseResult<WorkoutPlan>
    - Wrap JSON.parse in try-catch, return success: false with error message on failure
    - Implement formatWorkoutPlan(plan: WorkoutPlan): string
    - Use JSON.stringify with 2-space indentation
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 3.4 Create validator module exports
    - Create `services/assistant/src/validator/index.ts`
    - Export validateWorkoutPlan, validatePlanSafety from validate.ts
    - Export parseWorkoutPlan, formatWorkoutPlan from serialize.ts
    - Export all types: ValidationResult, SafetyValidationResult, ValidationError, SafetyViolation
    - _Requirements: 5.1, 5.6, 6.1, 6.4_

  - [x] 3.5 Write property test for schema round-trip
    - **Property 1: Schema Validation Round-Trip**
    - **Validates: Requirements 6.6**
    - Create `services/assistant/tests/generators.ts` with fast-check arbitraries
    - Implement workoutPlanArbitrary(catalog: Exercise[]) generating valid plans
    - Create `services/assistant/tests/validation.property.test.ts`
    - Write property test: format → parse → validate produces equivalent plan
    - Run with minimum 100 iterations
    - _Requirements: 16.1, 16.2, 16.3, 16.7, 16.8_

  - [x] 3.6 Write property test for exercise reference integrity
    - **Property 2: Exercise Reference Integrity**
    - **Validates: Requirements 5.4, 5.5**
    - In `services/assistant/tests/validation.property.test.ts`
    - Write property test: validated plans only reference existing exercises
    - Generate random plans, extract all exercise_ids, verify all exist in catalog
    - For invalid plans, verify EXERCISE_NOT_FOUND error is present
    - Run with minimum 100 iterations
    - _Requirements: 16.3, 16.4, 16.7, 16.8_

- [x] 4. Set up Supabase database schema
  - [x] 4.1 Create profiles table migration
    - Create `supabase/migrations/001_create_profiles.sql`
    - Define profiles table with all required columns and types
    - Add CHECK constraints for weight_kg (> 0, < 500), fitness_level (1-3), minutes_per_day (> 0, <= 120)
    - Set default values: injuries to empty array, language to 'en', created_at to NOW(), updated_at to NOW()
    - Create trigger for auto-updating updated_at column
    - _Requirements: 7.1, 7.7_

  - [x] 4.2 Create RLS policies for profiles
    - In `supabase/migrations/001_create_profiles.sql`, enable RLS on profiles table
    - Create SELECT policy: users can read own profile where auth.uid() = id
    - Create INSERT policy: users can insert own profile where auth.uid() = id
    - Create UPDATE policy: users can update own profile where auth.uid() = id
    - Add comments documenting each policy's purpose
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.10_

  - [x] 4.3 Create plans table migration
    - Create `supabase/migrations/002_create_plans.sql`
    - Define plans table with id, user_id (references profiles.id ON DELETE CASCADE), schema_version, plan_json (jsonb), provider, status, created_at
    - Set default values: id to gen_random_uuid(), status to 'active', created_at to NOW()
    - Create indexes on user_id and created_at DESC for query performance
    - _Requirements: 7.2, 7.5_

  - [x] 4.4 Create RLS policies for plans
    - In `supabase/migrations/002_create_plans.sql`, enable RLS on plans table
    - Create SELECT policy: users can read own plans where auth.uid() = user_id
    - Create INSERT policy: users can insert own plans where auth.uid() = user_id
    - Add comments documenting each policy's purpose
    - _Requirements: 8.1, 8.5, 8.6, 8.10_

  - [x] 4.5 Create workout_logs table migration
    - Create `supabase/migrations/003_create_workout_logs.sql`
    - Define workout_logs table with id, user_id (references profiles.id), plan_id (references plans.id ON DELETE SET NULL), day_number, exercises_completed (jsonb), duration_minutes, rating (1-5), notes, completed_at
    - Add CHECK constraints for day_number (> 0), duration_minutes (> 0), rating (>= 1 AND <= 5)
    - Set default values: id to gen_random_uuid(), completed_at to NOW()
    - Create indexes on user_id and completed_at DESC
    - _Requirements: 7.3, 7.5_

  - [x] 4.6 Create RLS policies for workout_logs
    - In `supabase/migrations/003_create_workout_logs.sql`, enable RLS on workout_logs table
    - Create SELECT policy: users can read own logs where auth.uid() = user_id
    - Create INSERT policy: users can insert own logs where auth.uid() = user_id
    - Add comments documenting each policy's purpose
    - _Requirements: 8.1, 8.7, 8.8, 8.10_

  - [x] 4.7 Create assistant_messages table migration
    - Create `supabase/migrations/004_create_assistant_messages.sql`
    - Define assistant_messages table with id, user_id (references profiles.id), role (CHECK role IN ('user', 'assistant')), content, created_at
    - Set default values: id to gen_random_uuid(), created_at to NOW()
    - Create indexes on user_id and created_at DESC
    - _Requirements: 7.4, 7.5_

  - [x] 4.8 Create RLS policies for assistant_messages
    - In `supabase/migrations/004_create_assistant_messages.sql`, enable RLS on assistant_messages table
    - Create SELECT policy: users can read own messages where auth.uid() = user_id
    - Create INSERT policy: users can insert own messages where auth.uid() = user_id
    - Add comments documenting each policy's purpose
    - _Requirements: 8.1, 8.9, 8.10_

  - [x] 4.9 Create Supabase Storage bucket
    - Create `supabase/migrations/005_create_storage_bucket.sql`
    - Insert exercise-media bucket with public: true
    - Create storage policy for public read access on exercise-media bucket
    - Create subdirectories structure: videos/, posters/, models/ (document in migration comments)
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6_

  - [x] 4.10 Create seed data
    - Create `supabase/seed.sql` with test data
    - Insert 2 test profiles with realistic data (different fitness levels, one with injuries)
    - Insert 1 sample plan for each test user
    - Insert 2-3 workout logs for each test user
    - _Requirements: 7.6_

- [x] 5. Checkpoint - Ensure validation and database setup complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement tool functions
  - [x] 6.1 Create catalog tools
    - Create `services/assistant/src/tools/catalog.ts`
    - Implement loadCatalog(): Exercise[] to load and parse catalog/exercises.json
    - Implement getCatalog(filters?: CatalogFilters): Exercise[]
    - Support optional filters: group (exact match), max_level (<=), exclude_injuries (avoid_if intersection)
    - Build injury Set for efficient exclude_injuries filtering
    - _Requirements: 11.1, 11.2, 11.3_

  - [x] 6.2 Create database tools
    - Create `services/assistant/src/tools/database.ts`
    - Initialize Supabase client with SUPABASE_URL and SUPABASE_SECRET_KEY
    - Implement getProfile(userId: string): Promise<Profile>
    - Use Supabase select query with .eq('id', userId).single()
    - Throw clear error if profile not found
    - _Requirements: 11.4_

  - [x] 6.3 Implement getRecentLogs
    - In `services/assistant/src/tools/database.ts`, implement getRecentLogs(userId: string, limit: number): Promise<WorkoutLog[]>
    - Query workout_logs with .eq('user_id', userId), .order('completed_at', { ascending: false }), .limit(limit)
    - Return array of WorkoutLog objects
    - _Requirements: 11.5_

  - [x] 6.4 Implement validatePlanTool wrapper
    - Create `services/assistant/src/tools/validation.ts`
    - Implement validatePlanTool(plan: unknown): ValidationToolResult
    - Load catalog and call validateWorkoutPlan(plan, catalog)
    - Return structured result with success boolean and error details
    - _Requirements: 11.6_

  - [x] 6.5 Implement savePlan
    - In `services/assistant/src/tools/database.ts`, implement savePlan(userId: string, plan: WorkoutPlan, provider: string): Promise<string>
    - Validate plan before saving using validateWorkoutPlan
    - Throw error if validation fails (don't save invalid plans)
    - Insert into plans table with user_id, schema_version, plan_json, provider, status: 'active'
    - Return inserted plan ID
    - _Requirements: 11.7, 11.8, 11.9_

  - [x] 6.6 Create tool definitions for OpenRouter
    - Create `services/assistant/src/tools/definitions.ts`
    - Export tool definitions in OpenAI tool format (array of tool objects with type: "function")
    - Define schemas for: get_catalog, get_profile, get_recent_logs, validate_plan, save_plan
    - Include parameter descriptions and required fields
    - _Requirements: 11.10_

- [x] 7. Implement OpenRouter assistant
  - [x] 7.1 Create OpenRouter assistant class
    - Create `services/assistant/src/providers/openrouter.ts`
    - Implement class OpenRouterAssistant implementing Assistant interface
    - Initialize OpenAI client with baseURL: 'https://openrouter.ai/api/v1'
    - Read API key from OPENROUTER_API_KEY environment variable
    - Read model from OPENROUTER_MODEL with default 'anthropic/claude-3.5-sonnet'
    - Load catalog in constructor
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [x] 7.2 Implement system prompt builder
    - In OpenRouterAssistant, implement private method buildSystemPrompt(profile: Profile, request: PlanRequest): string
    - Include exercise catalog JSON
    - Include user profile details (fitness level, goal, minutes, injuries)
    - Add critical safety rules: never include exercises matching user injuries, only use catalog IDs, respect fitness level, stay within time constraint
    - Include workout plan schema structure
    - Instruct to return only valid JSON (no markdown)
    - _Requirements: 10.5_

  - [x] 7.3 Implement user prompt builder
    - In OpenRouterAssistant, implement private method buildUserPrompt(profile: Profile, request: PlanRequest): string
    - Include duration_days in plan request
    - Include focus_areas if provided
    - Include custom_instructions if provided
    - _Requirements: 10.5_

  - [x] 7.4 Implement plan generation with retry logic
    - In OpenRouterAssistant, implement generatePlan(profile: Profile, request: PlanRequest): Promise<WorkoutPlan>
    - Build system and user prompts
    - Set attempt counter (max 2 attempts)
    - Call OpenAI chat.completions.create with model, messages, temperature: 0.7, response_format: { type: 'json_object' }
    - Parse JSON response
    - Validate with validateWorkoutPlan (schema + references)
    - Validate safety with validatePlanSafety
    - If validation fails on attempt 1, retry with validation errors included in messages
    - If both attempts fail, throw PlanGenerationError with attempts count and last errors
    - Log all API calls with correlation context
    - _Requirements: 10.6, 10.7, 10.8, 10.9, 10.10_

  - [x] 7.5 Write property test for injury safety
    - **Property 3: Injury Safety Constraint**
    - **Validates: Requirements 5.7, 5.8**
    - In `services/assistant/tests/generators.ts`, implement profileArbitrary() with realistic injuries
    - Create `services/assistant/tests/safety.property.test.ts`
    - Write property test: safe plans have no injury conflicts
    - Generate random profiles and plans, verify validatePlanSafety correctness
    - For safe plans, verify no exercise avoid_if intersects with user injuries
    - For unsafe plans, verify violations are correctly identified
    - Run with minimum 100 iterations
    - _Requirements: 16.3, 16.5, 16.6, 16.7, 16.8_

- [x] 8. Implement REST API
  - [x] 8.1 Create authentication middleware
    - Create `services/assistant/src/api/auth.ts`
    - Implement authenticateRequest(req: Request): Promise<string>
    - Extract JWT from Authorization header (Bearer token)
    - Call Supabase auth.getUser(token) to verify token
    - Return user ID if valid, throw AuthenticationError if invalid
    - _Requirements: 18.2, 18.4_

  - [x] 8.2 Create request validation
    - Create `services/assistant/src/api/validation.ts`
    - Implement validatePlanRequest(body: unknown): { valid: boolean; errors?: any[] }
    - Check required fields: duration_days (integer > 0), focus_areas (array)
    - Check optional fields: custom_instructions (string, max 500 chars)
    - Validate focus_areas contains valid group names from catalog
    - _Requirements: 18.3, 18.9_

  - [x] 8.3 Create API server with plan generation endpoint
    - Create `services/assistant/src/api/server.ts`
    - Set up Express app with express.json() middleware
    - Implement POST /api/plans/generate endpoint
    - Call authenticateRequest to get userId
    - Validate request body with validatePlanRequest
    - Fetch user profile with getProfile(userId)
    - Call assistant.generatePlan(profile, planRequest)
    - Save plan with savePlan(userId, plan, 'openrouter')
    - Return 201 with plan ID and plan JSON on success
    - Return 400 with error details for validation failures
    - Return 401 for authentication errors
    - Return 500 for server errors with correlation ID
    - Add request timeout of 30 seconds (return 504 if exceeded)
    - _Requirements: 18.1, 18.5, 18.6, 18.7, 18.8, 18.10_

  - [x] 8.4 Create health check endpoint
    - In `services/assistant/src/api/server.ts`, add GET /health endpoint
    - Return { status: 'ok' } with 200 status
    - _Requirements: 18.10_

  - [x] 8.5 Create global error handler
    - In `services/assistant/src/api/server.ts`, add Express error middleware
    - Generate correlation ID for each error (crypto.randomUUID())
    - Log error with full context (error details, request info, correlation ID)
    - Return appropriate status code and error response based on error type
    - Never expose stack traces or internal details to client (only in logs)
    - Sanitize sensitive headers and body fields before logging
    - _Requirements: 17.3, 17.4, 17.5, 17.6, 17.7, 17.8_

  - [x] 8.6 Create server startup script
    - Create `services/assistant/src/index.ts`
    - Call validateConfig() before starting server
    - Import and start API server
    - Listen on PORT from environment (default: 3000)
    - Log startup message with port and environment
    - Handle process signals for graceful shutdown
    - _Requirements: 12.4, 12.5_

- [x] 9. Checkpoint - Ensure AI service implementation complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Write integration tests
  - [x] 10.1 Set up test environment
    - Create `services/assistant/tests/setup.ts`
    - Configure test Supabase instance or use Supabase local development
    - Load environment variables from .env.test
    - Set up test catalog and schemas
    - _Requirements: 15.6, 15.8, 15.9_

  - [x] 10.2 Write validation pipeline integration tests
    - Create `services/assistant/tests/validation.integration.test.ts`
    - Test: valid plan passes all validation stages
    - Test: plan with invalid schema fails at stage 1 with specific errors
    - Test: plan with missing exercise_id fails at stage 2 with clear message
    - Test: plan with injury conflict fails safety validation
    - Test: round-trip property (parse → format → parse) produces equivalent plan
    - Use real schemas and catalog (not mocks)
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.7_

  - [x] 10.3 Write database integration tests
    - Create `services/assistant/tests/database.integration.test.ts`
    - Test: profile CRUD with RLS (users can only access own data)
    - Test: plan CRUD with RLS
    - Test: workout log CRUD with RLS
    - Test: assistant messages CRUD with RLS
    - Test: foreign key constraints are enforced
    - Test: updated_at trigger fires on profile updates
    - Use test Supabase instance
    - _Requirements: 15.6, 15.8_

  - [x] 10.4 Write API integration tests
    - Create `services/assistant/tests/api.integration.test.ts`
    - Test: POST /api/plans/generate with valid request returns 201 and saves plan
    - Test: POST /api/plans/generate without auth returns 401
    - Test: POST /api/plans/generate with invalid request returns 400
    - Test: GET /health returns 200
    - Test: error responses include correlation IDs
    - Mock OpenRouter API calls or use test mode
    - _Requirements: 15.8, 15.9_

  - [x] 10.5 Verify test coverage
    - Run tests with coverage reporting (vitest --coverage)
    - Verify validator module has >= 90% coverage
    - Verify overall codebase has >= 80% coverage
    - _Requirements: 15.10_

- [ ] 11. Write property-based tests for plan generation
  - [x] 11.1 Set up property test environment
    - Install fast-check library
    - Configure test timeout to 5 minutes for multiple LLM calls
    - Set up test API key and model (consider using cheaper/faster model for tests)
    - _Requirements: 16.1, 16.2, 16.9, 16.10_

  - [x] 11.2 Generate realistic test profiles
    - In `services/assistant/tests/generators.ts`, implement profileArbitrary()
    - Generate age_range from realistic set ('18-24', '25-34', etc.)
    - Generate weight_kg between 40-150
    - Generate fitness_level from [1, 2, 3]
    - Generate injuries from realistic set (0-3 injuries)
    - Generate minutes_per_day between 5-30
    - _Requirements: 16.6_

  - [~] 11.3 Write plan validation property test
    - Create `services/assistant/tests/generation.property.test.ts`
    - Property: FOR ALL generated plans, plan validates against schema
    - Generate 50+ random profiles
    - Call OpenRouterAssistant.generatePlan for each
    - Assert every plan passes validateWorkoutPlan
    - Log and report any failures with profile details
    - _Requirements: 16.3, 16.7, 16.9_

  - [~] 11.4 Write exercise reference property test
    - In `services/assistant/tests/generation.property.test.ts`
    - Property: FOR ALL generated plans, every exercise_id exists in catalog
    - Generate 50+ random profiles
    - Extract all exercise_ids from each generated plan
    - Assert all IDs exist in catalog
    - _Requirements: 16.4, 16.7_

  - [~] 11.5 Write injury safety property test
    - In `services/assistant/tests/generation.property.test.ts`
    - Property: FOR ALL profiles with injuries, no plan contains conflicting exercises
    - Generate 50+ profiles with at least 1 injury each
    - Call generatePlan for each
    - Assert validatePlanSafety returns success: true
    - Assert no exercise avoid_if matches user injuries
    - _Requirements: 16.5, 16.6, 16.7_

- [x] 12. Create documentation and examples
  - [x] 12.1 Create example workout plans
    - Create `examples/plans/` directory
    - Create beginner-3day-plan.json (level 1 exercises only, 10-15 minutes per day)
    - Create intermediate-5day-plan.json (mix of level 1-2, 20-25 minutes per day)
    - Create advanced-7day-plan.json (all levels, 30 minutes per day, varied focus)
    - Validate all examples against workout-plan.schema.json
    - _Requirements: 20.2, 20.8_

  - [x] 12.2 Create example profiles
    - Create `examples/profiles/` directory
    - Create beginner-no-injuries.json
    - Create intermediate-knee-injury.json
    - Create advanced-multiple-injuries.json
    - Ensure all profiles have realistic data matching Profile type
    - _Requirements: 20.3, 20.8_

  - [x] 12.3 Document validation flow
    - Create `docs/validation-flow.md`
    - Explain three-stage validation pipeline (schema → references → safety)
    - Include mermaid diagram showing validation stages and error paths
    - Document ValidationResult and SafetyValidationResult formats
    - Include example validation errors with JSON paths
    - _Requirements: 20.4_

  - [x] 12.4 Document plan generation process
    - Create `docs/plan-generation.md`
    - Explain OpenRouter integration and retry logic
    - Document system prompt structure and safety rules
    - Include sequence diagram of API call flow
    - Document PlanGenerationError structure
    - _Requirements: 20.5_

  - [x] 12.5 Create AI service README
    - Create `services/assistant/README.md`
    - Document all environment variables with descriptions and examples
    - Provide quickstart guide: clone, install, configure, run
    - Document available npm scripts (build, start, dev, test, test:integration, test:properties)
    - Include API endpoint documentation with request/response examples
    - Document error codes and troubleshooting
    - _Requirements: 12.8, 20.7, 20.9, 20.10_

  - [x] 12.6 Document contracts-first architecture
    - Create or update main project README.md
    - Explain contracts-first approach (schemas as source of truth)
    - Document relationship between schemas, catalog, validator, and AI service
    - Include architecture diagram showing all components
    - _Requirements: 20.1, 20.6_

- [~] 13. Final checkpoint - Verify complete system integration
  - Ensure all tests pass (unit, integration, property-based)
  - Verify schemas validate correctly against examples
  - Test complete flow: authenticate → generate plan → validate → save
  - Verify RLS policies work correctly in Supabase
  - Test API endpoint with real requests
  - Ensure all documentation is complete and accurate

## Notes

- Tasks marked with `*` are optional test-related sub-tasks and can be skipped for faster MVP
- Each task references specific requirements for traceability (e.g., _Requirements: 1.1, 1.2_)
- Checkpoints ensure incremental validation at major milestones
- Property-based tests verify universal correctness properties across random inputs
- Integration tests use real schemas and catalog to catch contract violations
- The implementation follows bottom-up order: contracts → validation → data layer → AI service → API → tests
- All TypeScript code uses strict mode and proper type safety
- Security is enforced at multiple layers: RLS in database, JWT auth in API, validation before saving
- Structured logging with correlation IDs enables production debugging

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.3", "2.4"] },
    { "id": 2, "tasks": ["3.1", "3.2", "3.3", "3.4"] },
    { "id": 3, "tasks": ["3.5", "3.6", "4.1"] },
    { "id": 4, "tasks": ["4.2", "4.3"] },
    { "id": 5, "tasks": ["4.4", "4.5"] },
    { "id": 6, "tasks": ["4.6", "4.7"] },
    { "id": 7, "tasks": ["4.8", "4.9", "4.10"] },
    { "id": 8, "tasks": ["6.1", "6.2", "6.3"] },
    { "id": 9, "tasks": ["6.4", "6.5", "6.6"] },
    { "id": 10, "tasks": ["7.1", "7.2", "7.3"] },
    { "id": 11, "tasks": ["7.4"] },
    { "id": 12, "tasks": ["7.5", "8.1", "8.2"] },
    { "id": 13, "tasks": ["8.3", "8.4", "8.5"] },
    { "id": 14, "tasks": ["8.6", "10.1"] },
    { "id": 15, "tasks": ["10.2", "10.3", "10.4", "11.1"] },
    { "id": 16, "tasks": ["10.5", "11.2"] },
    { "id": 17, "tasks": ["11.3", "11.4", "11.5"] },
    { "id": 18, "tasks": ["12.1", "12.2", "12.3", "12.4", "12.5", "12.6"] }
  ]
}
```
