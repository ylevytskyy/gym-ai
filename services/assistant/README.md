# AI service (services/assistant)

Node.js and TypeScript service that generates workout plans with an LLM (through OpenRouter) and
accepts a plan only if it passes validation against the schema, the exercise catalog and the user's
injuries. It exposes a small HTTP API built on Express.

Related documents:

- `../../docs/validation-flow.md`: the three validation stages and the error shapes.
- `../../docs/plan-generation.md`: prompts, retry logic and the call flow.
- `../../README.md`: the project plan and the contracts-first overview.

## What has not been verified

Read this before relying on the service.

- **Live OpenRouter generation was not exercised.** The tests use a fake chat client. No real call to
  OpenRouter was made, so real model output quality, the model's response to `response_format: json_object`,
  and the retry behaviour with a real model are untested.
- **Real Supabase Auth was not exercised.** `authenticateRequest` and the database functions are tested with
  fakes. A real login, a real token check and real `profiles` and `plans` reads and writes against a running
  Supabase were not run by the test suite.
- The end-to-end path (token, profile, generation, save) has therefore never run as one piece.

## Quickstart

Requirements: Node.js 18 or newer (`engines` in `package.json`).

This package has a `package-lock.json`, so use `npm`. (The root README mentions a `pnpm` workspace as the
plan for the repository; this package is not set up that way.)

```bash
# 1. clone
git clone <repository-url>
cd fitness-v2/services/assistant

# 2. install. The shared health rules (packages/health-core) are a local dependency and must be
#    built first; its own install does that.
(cd ../../packages/health-core && npm install)
npm install

# 3. configure
cp .env.example .env
# edit .env: set OPENROUTER_API_KEY, SUPABASE_URL, SUPABASE_SECRET_KEY (see below)

# 4. run (development, restarts on change)
set -a; source .env; set +a
npm run dev

# or build and run
npm run build
npm start
```

The service does not load `.env` itself: there is no `dotenv` in the source or the dependencies. Export
the variables into the shell (as above), or use your own process manager. If a required variable is
missing, the service prints the problem and exits with code 1.

Check that it is up:

```bash
curl http://localhost:3000/health
# {"status":"ok"}
```

(Use the port you set in `PORT`; the default is 3000.)

## Environment variables

Read in `src/config.ts` (and `LOG_LEVEL` and `NODE_ENV` also in `src/logger.ts`).

| Variable | Required | Default | Description | Example |
|---|---|---|---|---|
| `OPENROUTER_API_KEY` | yes | none | OpenRouter API key. Secret. | `sk-or-...` |
| `SUPABASE_URL` | yes | none | Supabase project URL. Must start with `https://` or `http://`. | `http://127.0.0.1:54321` |
| `SUPABASE_SECRET_KEY` | yes | none | Supabase secret key (`sb_secret_...`). Bypasses Row Level Security. Secret. Used to verify user tokens and to read and write `profiles` and `plans`. | `sb_secret_...` |
| `OPENROUTER_MODEL` | no | `anthropic/claude-3.5-sonnet` | Model id to request from OpenRouter. | `anthropic/claude-3.5-sonnet` |
| `PORT` | no | `3000` | HTTP port. | `3101` |
| `LOG_LEVEL` | no | `info` | Pino log level: trace, debug, info, warn, error, fatal. | `debug` |
| `NODE_ENV` | no | `development` | Environment name, written to log lines. | `production` |
| `APP_URL` | no | `http://localhost:3000` | Parsed into the config object. Nothing in `src` uses it yet. | `https://assistant.example.com` |

Notes:

- Empty strings count as unset. For `OPENROUTER_MODEL`, `PORT`, `LOG_LEVEL`, `NODE_ENV` and `APP_URL` the
  default then applies.
- `.env.example` also lists `ASSISTANT_PROVIDER`, `OPENROUTER_BASE_URL`, `ANTHROPIC_API_KEY`,
  `ANTHROPIC_MODEL`, `BATCH_ENABLED`, `BATCH_CRON` and `BATCH_POLL_SECONDS`. **Nothing in `src` reads these.**
  They are for planned work (the Anthropic provider and background batches). Setting them has no effect today.
  The OpenRouter base URL is a constant in `src/providers/openrouter.ts`.
- The example port in `.env.example` is `3101`; the code default is `3000`.
- Never commit `.env`. Logs redact authorization headers and common secret fields (`src/logger.ts`).

## npm scripts

From `package.json`:

| Script | Command | Notes |
|---|---|---|
| `npm run build` | `tsc` | Compiles to `dist/`. |
| `npm start` | `node dist/index.js` | Run after `build`. |
| `npm run dev` | `tsx watch src/index.ts` | Restarts on change. |
| `npm test` | `vitest run` | Runs every test file once. |
| `npm run test:watch` | `vitest` | Watch mode. |
| `npm run test:integration` | `vitest run --config vitest.integration.config.ts` | Runs `tests/*.integration.test.ts`. Those suites skip themselves unless `SUPABASE_TEST_URL` and `SUPABASE_TEST_SECRET` point at a PostgREST-compatible instance (see `supabase/tests/run-local.sh`). |
| `npm run test:properties` | `vitest run --config vitest.properties.config.ts` | Runs `tests/*.property.test.ts`. The live generation properties skip unless `OPENROUTER_API_KEY` is set; `GEN_PROPERTY_RUNS` sets the run count (default 50). |
| `npm run test:coverage` | `vitest run --coverage` | Uses `@vitest/coverage-v8`. |
| `npm run lint` | `eslint src/**/*.ts` | No ESLint config file was found in the package. Not run. |
| `npm run typecheck` | `tsc --noEmit` | |

## API

Responses carry an `X-Correlation-Id` header. Error bodies include the same value as `correlationId`.

### GET /health

No authentication.

```bash
curl http://localhost:3000/health
```

```json
{ "status": "ok" }
```

### POST /api/plans/generate

Generates a plan for the authenticated user, validates it, saves it, and returns it.

Headers:

- `Authorization: Bearer <Supabase access token>`
- `Content-Type: application/json`

Body:

| Field | Type | Rule |
|---|---|---|
| `duration_days` | integer | Required. Greater than 0. |
| `focus_areas` | string[] | Required (may be empty). At most 10. Each must be a catalog group: `warm_up`, `lower_body`, `upper_body`, `core`, `cardio`. |
| `custom_instructions` | string | Optional. At most 500 characters. |

Request:

```bash
curl -X POST http://localhost:3000/api/plans/generate \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"duration_days": 3, "focus_areas": ["core", "lower_body"], "custom_instructions": "Keep it quiet, I work from home"}'
```

Success: HTTP 201. `id` is the id of the saved row in the `plans` table. `plan` is a `WorkoutPlan`
(see `../../examples/plans/` for full examples).

```json
{
  "id": "<plans row id>",
  "plan": {
    "schema_version": "1.0.0",
    "id": "3f6d2a1e-8b4c-4d57-9a10-5c2e7b9f0a11",
    "created_at": "2026-11-05T08:00:00Z",
    "goal": "move_more",
    "days": [ "..." ],
    "notes": "..."
  }
}
```

Failure examples:

```json
// 400, invalid body
{
  "error": "VALIDATION_ERROR",
  "message": "Invalid request body",
  "details": [
    { "path": "duration_days", "code": "INVALID_DURATION", "message": "duration_days must be a positive integer" }
  ],
  "correlationId": "<uuid>"
}
```

```json
// 400, the model could not produce a valid plan in 2 attempts
{
  "error": "PLAN_GENERATION_FAILED",
  "message": "Plan generation failed after 2 attempts",
  "details": { "attempts": 2, "validation_errors": [ { "path": "...", "message": "...", "code": "..." } ] },
  "correlationId": "<uuid>"
}
```

```json
// 401, missing or invalid token
{ "error": "AUTHENTICATION_ERROR", "message": "Authentication required", "correlationId": "<uuid>" }
```

Order of work: authenticate, validate the body, load the profile, generate (30 second limit), save.

## Health data

When the user has health days in Supabase (`health_days`, synced by the mobile app from HealthKit or
Health Connect), plan generation reads them:

- `src/tools/health.ts` loads the last two weeks of health days for the authenticated user and reduces
  them to a summary: 14-day averages, last night's sleep, yesterday's steps, today's readiness and
  the workouts other apps recorded in the last 7 days.
- `src/providers/health-prompt.ts` writes that summary into the system prompt. A measurement with no
  data produces no line; it is never written as zero.
- A user with no health days, or a failed health lookup, still gets a plan. The prompt then says no
  health data is available, and a failed lookup is logged as a warning.
- The readiness and adjustment rules live in `packages/health-core` and are deterministic. The model
  is told the readiness; it does not compute it.

Tests import `packages/health-core` from source (see `vitest.shared.ts`), so they never run against a
stale build. `npm run build` and `npm run dev` use the built package: after changing
`packages/health-core/src`, run `npm run build` there.

Not verified: the health path against hosted Supabase, and whether health data improves plans from a
real model. The database tools were run against a local Postgres 16 with PostgREST.

## Error codes

From `describeError` in `src/api/server.ts`. Errors that are not listed fall into the last row.

| HTTP | `error` | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Request body failed `validatePlanRequest` (with `details`), or `savePlan` rejected the plan (no `details`). |
| 400 | `PLAN_GENERATION_FAILED` | `PlanGenerationError`: 2 attempts failed validation. `details.attempts` and `details.validation_errors`. |
| 400 | `INVALID_JSON` | The request body is not valid JSON. |
| 401 | `AUTHENTICATION_ERROR` | No Bearer token, or the token check failed or returned no user. |
| 504 | `GATEWAY_TIMEOUT` | Generation took longer than the limit (30 seconds). |
| 500 | `PLAN_SERVICE_UNAVAILABLE` | The OpenRouter call failed (`APIError`). Upstream text is logged only, not returned. |
| 500 | `INTERNAL_SERVER_ERROR` | Anything else, including `DatabaseError` (for example a missing profile). |

Request-body error codes inside `details`: `INVALID_BODY`, `INVALID_DURATION`, `INVALID_FOCUS_AREAS`,
`TOO_MANY_FOCUS_AREAS`, `INVALID_FOCUS_AREA`, `INVALID_CUSTOM_INSTRUCTIONS`, `TOO_LONG`
(`src/api/validation.ts`). Plan validation codes (`SCHEMA_VALIDATION_ERROR`, `EXERCISE_NOT_FOUND`,
`INJURY_CONFLICT`, `INVALID_JSON`) appear inside `PLAN_GENERATION_FAILED` details; see
`../../docs/validation-flow.md`.

## Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| Service exits at start with "Environment configuration validation failed" | A required variable is missing or `SUPABASE_URL` has no `http(s)://` prefix. The service does not read `.env` by itself; export the variables first. |
| `curl` to the port gets "connection refused" | The service listens on `PORT`, default 3000, not the 3101 shown in `.env.example`. |
| 401 `AUTHENTICATION_ERROR` | Header must be `Authorization: Bearer <token>`. The token must be a valid Supabase access token for the project in `SUPABASE_URL`. |
| 500 `INTERNAL_SERVER_ERROR` right after a valid request | Often a missing `profiles` row for the user (`DatabaseError`). Check the service log for the correlation id. Not confirmed against a real database. |
| 500 `PLAN_SERVICE_UNAVAILABLE` | The OpenRouter call failed: bad key, unknown model id, quota, or network. The log line "openrouter request failed" has the status code. |
| 400 `PLAN_GENERATION_FAILED` | The model's output failed validation twice. Read `details.validation_errors`. Try another `OPENROUTER_MODEL`, or fewer focus areas. |
| 504 `GATEWAY_TIMEOUT` | Slow model; two attempts can pass 30 seconds. The generation keeps running in the background but its result is dropped. |
| `npm run test:integration` skips every test | `SUPABASE_TEST_URL` or `SUPABASE_TEST_SECRET` is not set. Set both to run them. |
| Cannot find `schemas/workout-plan.schema.json` or `catalog/exercises.json` | The service looks for these files in parent directories of the code (`src/repo-files.ts`). Run it from inside the repository checkout. |
| More log detail needed | Set `LOG_LEVEL=debug`. Request and response bodies are logged at debug. |
