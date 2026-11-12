# Health integration — plan for milestone 1 (contracts and server)

Goal: the server side of the health integration exists and is tested without a phone: the
health-day contract, its storage with row-level security, the deterministic rules, and a plan
generator that reads health data.

Spec: [spec.md](spec.md). Later milestones are planned when reached.

## Global constraints

- The schema is the contract: `schemas/health-day.schema.json` (draft 2020-12) comes first.
- The server holds daily summaries only, never raw samples (`docs/adr/0001-health-days-on-server.md`).
- Readiness and adjustment are deterministic code; the AI never decides them.
- Plan generation must work unchanged for a user with no health days.
- `services/assistant` uses `npm`, TypeScript strict with `exactOptionalPropertyTypes`, vitest.
- Vocabulary follows `CONTEXT.md`: health store, health day, external workout, readiness,
  adjustment, sitting nudge.

## Seam

There is no end-to-end tool in this repo, so tests attach at the highest existing seams:

- HTTP: `createApp(deps)` with injected fakes (`tests/api.server.test.ts` style).
- Model prompt: `OpenRouterAssistant` with a fake chat client (`tests/openrouter.assistant.test.ts`).
- Database: `supabase/tests/run-local.sh` (throwaway Postgres 16 with a Supabase stand-in).
- Rules: `packages/health-core` is pure, tested directly; its link to the validator is tested in
  `services/assistant/tests/`.

Baseline before any change (2026-11-12): `npx vitest run` in `services/assistant` → 108 passed,
10 skipped.

## Slices

### Slice 1 — Health-day contract

- **Files:** `schemas/health-day.schema.json`, `examples/health-days/*.json` (three valid),
  `examples/health-days/invalid/*.json` (three invalid),
  `services/assistant/tests/health-day.schema.test.ts`.
- **Produces:** the health-day shape: `day` (`YYYY-MM-DD`), `tz` (IANA name), optional `steps`,
  `active_energy_kcal`, `resting_hr_bpm`, `sleep_minutes`, `weight_kg`, `external_workouts[]`
  (`type`, `minutes`, optional `energy_kcal`), `platform` (`ios` | `android`). No other properties.
- **Acceptance:**
  - Given the valid examples, when validated in Ajv strict mode, then all pass.
  - Given the invalid examples (bad date, negative steps, unknown property), then each is rejected.
  - Given a day with only `day`, `tz` and `platform`, then it passes (a phone with no data).
- **Verify:** `cd services/assistant && npx vitest run tests/health-day.schema.test.ts`
- **Blocked-by:** None.

### Slice 2 — Storage with row-level security

- **Files:** `supabase/migrations/006_create_health_days.sql`,
  `supabase/migrations/007_workout_logs_health_record.sql`, `supabase/seed.sql`,
  `supabase/tests/rls_tests.sql`.
- **Produces:** table `health_days` keyed by `(user_id, day)` with CHECK constraints matching the
  schema's ranges; `workout_logs.health_record_id TEXT` unique per user; update and delete
  policies on `workout_logs`.
- **Acceptance:**
  - Given users A and B, when A selects, inserts, updates or deletes B's health days, then A sees
    nothing or gets `42501`.
  - Given A's own day, when A upserts the same `(user_id, day)` twice, then one row remains with
    the newer values and a newer `updated_at`.
  - Given A's profile is deleted, then A's health days are gone.
  - Given two logs of one user with the same `health_record_id`, then the second insert fails.
- **Verify:** `supabase/tests/run-local.sh` ends with `ALL CHECKS PASSED` and exit 0.
- **Blocked-by:** Slice 1.

### Slice 3 — Readiness

- **Files:** `packages/health-core/package.json`, `packages/health-core/tsconfig.json`,
  `packages/health-core/src/types.ts`, `packages/health-core/src/readiness.ts`,
  `packages/health-core/src/index.ts`, `packages/health-core/tests/readiness.test.ts`.
- **Produces:**
  `readiness(days: HealthDay[], today: string): { level: 'low'|'normal'|'high'|'unknown'; reasons: ReadinessReason[] }`
  where `ReadinessReason` is `'short_sleep' | 'sleep_below_baseline' | 'resting_hr_elevated' | 'well_recovered' | 'not_enough_data'`.
- **Acceptance:**
  - Given fewer than 5 days with data in the 14 days before today, then `unknown` with
    `not_enough_data`.
  - Given a normal baseline and last night under 360 minutes, or under 80% of the median, then
    `low` with the matching reason; a resting heart rate at or above 107% of the median is `low`.
  - Given sleep at or above the median and resting heart rate at or below it, then `high`.
  - Given no resting heart rate anywhere, then the result rests on sleep alone and never throws.
- **Verify:** `cd packages/health-core && npx vitest run tests/readiness.test.ts`
- **Blocked-by:** Slice 1.

### Slice 4 — Adjustment

- **Files:** `packages/health-core/src/adjust.ts`, `packages/health-core/src/index.ts`,
  `packages/health-core/tests/adjust.test.ts`,
  `services/assistant/tests/health-adjust.property.test.ts`, `services/assistant/package.json`.
- **Produces:**
  `adjustDay(day: WorkoutDay, input: { readiness: ReadinessLevel; externalWorkoutMinutes: number; fitnessLevel: 1|2|3; injuries: string[] }, catalog: Exercise[]): { day: WorkoutDay; changes: AdjustmentChange[] }`.
- **Acceptance:**
  - Given `low`, then every main-block item has one set fewer but never below one, and every
    level-3 exercise is replaced by a lower-level one from the same group that does not conflict
    with the user's injuries (or removed when none exists, keeping the block non-empty).
  - Given `high`, then main-block items gain one set and no exercise above the user's fitness
    level appears.
  - Given an external workout of 30 minutes or more, then the main block holds only `warm_up`
    exercises safe for the user's injuries; this wins over `high`.
  - Property: for generated plan days, profiles and inputs, the adjusted day passes
    `validateWorkoutPlan`, a day that passed `validatePlanSafety` still passes it, and every
    introduced exercise is safe and within the fitness level; `normal` or `unknown` with no external
    workout returns the day unchanged.
- **Verify:** `cd packages/health-core && npx vitest run tests/adjust.test.ts` and
  `cd services/assistant && npx vitest run --config vitest.properties.config.ts tests/health-adjust.property.test.ts`
- **Blocked-by:** Slice 3.

### Slice 5 — Sitting-nudge rule

- **Files:** `packages/health-core/src/nudge.ts`, `packages/health-core/src/index.ts`,
  `packages/health-core/tests/nudge.test.ts`.
- **Produces:**
  `nudgeDue(input: { stepsLastHour: number; now: Date; tz: string; sentToday: Date[]; settings: NudgeSettings }): boolean`
  with defaults 250 steps, active hours 09:00–18:00 on weekdays, at most 3 a day, 90 minutes apart.
- **Acceptance:**
  - Given a sedentary hour inside active hours with nothing sent, then true.
  - Given the same outside active hours, at the weekend, or with nudges off, then false.
  - Given 3 already sent today, or one sent under 90 minutes ago, then false.
  - Active hours are judged in the user's time zone, not the server's.
- **Verify:** `cd packages/health-core && npx vitest run tests/nudge.test.ts`
- **Blocked-by:** Slice 3.

### Slice 6 — The plan generator reads health data

- **Files:** `packages/health-core/src/summary.ts` (+ test), `services/assistant/src/tools/health.ts`,
  `services/assistant/src/tools/definitions.ts`, `services/assistant/src/providers/openrouter.ts`,
  `services/assistant/src/api/server.ts`, `services/assistant/src/index.ts`,
  `services/assistant/src/types.ts`, tests `health.tools.test.ts`, additions to
  `openrouter.assistant.test.ts`, `api.server.test.ts`, `definitions.test.ts`.
- **Produces:**
  `summarize(days, today): HealthSummary | null`;
  `getHealthDays(userId, fromDay, toDay, db?)`;
  `Assistant.generatePlan(profile, request, context?: { health?: HealthSummary })`;
  `AppDeps.loadHealthSummary?: (userId) => Promise<HealthSummary | null>`;
  tool definition `get_health_summary`.
- **Acceptance:**
  - Given 14 health days, when a plan is generated, then the system prompt has a health section
    with the averages, last night, readiness and external workouts this week.
  - Given no health days, then the request still returns 201 and the prompt says no health data
    is available; it contains no zeros standing in for missing values.
  - Given the health lookup throws, then the plan is still generated and the failure is logged
    (health is never a reason to fail a plan).
  - `getHealthDays` filters by the given user id and date range.
- **Verify:** `cd services/assistant && npx vitest run && npx tsc --noEmit`
- **Blocked-by:** Slices 1, 2, 3.

## Order

1 → 2 and 3 → 4 and 5 → 6, then an independent review of the whole diff and the full runs:
`npx vitest run` and `npx tsc --noEmit` in both packages, the properties config, and
`supabase/tests/run-local.sh`.

## Requirement map

| Spec item | Slice |
|---|---|
| Health-day schema, examples (done 1) | 1 |
| `health_days`, `health_record_id`, delete policy (done 2) | 2 |
| `readiness` (done 3) | 3 |
| `adjustDay` always validator-safe (done 3) | 4 |
| `nudgeDue` | 5 |
| Health tool, prompt block, absent data (done 4) | 6 |
