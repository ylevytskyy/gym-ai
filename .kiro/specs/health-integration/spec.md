# Health integration and mobile app — spec

Status: draft, awaiting approval. Written 2026-11-12 on branch `feat/health-integration`.

## What we are building

Aura Fit reads from and writes to the phone's health store (HealthKit on iOS, Health Connect on
Android), and uses what it reads to change the workout the user gets. Because `apps/mobile` is
empty today, this build also creates the Expo app the README describes.

Decisions made with the user on 2026-11-12:

| Question | Decision |
|---|---|
| Where it lives | Full stack in fitness-v2: contracts, Supabase, assistant service, new Expo app |
| Direction | Two-way: finished workouts are written to the health store, activity/body/recovery data is read |
| Where read data goes | One daily summary row per user per day in Supabase; raw samples never leave the phone |
| Behaviours | Readiness adjustment, activity-aware plans, profile from Health, sitting nudges |
| App scope | The whole app from the README: profile, today, player with exercise demos, chat, history |
| Verification hardware | iOS Simulator, Android emulator, a physical iPhone with a paid Apple Developer account. No Apple Watch, no physical Android phone |

## Shape

```text
 phone                                              server
 ┌──────────────────────────────────────────┐      ┌──────────────────────────────┐
 │ screens ──▶ HealthStore (one interface)  │      │ Supabase                     │
 │              ├─ HealthKit adapter (iOS)  │ sync │  health_days (RLS)           │
 │              ├─ Health Connect (Android) │─────▶│  workout_logs.health_record  │
 │              └─ fake (tests)             │      └───────────▲──────────────────┘
 │ health-core: readiness + activity rules  │                  │ reads
 └──────────────────────────────────────────┘      ┌───────────┴──────────────────┐
                                                   │ assistant service            │
                                                   │  health-core (same package)  │
                                                   │  get_health_summary tool     │
                                                   └──────────────────────────────┘
```

**Contract first.** `schemas/health-day.schema.json` (draft 2020-12) defines a daily summary:
local date, time zone, steps, active energy (kcal), resting heart rate (bpm), sleep minutes,
weight (kg), and workouts recorded by other apps (type, minutes, energy). Every field except the
date and time zone is optional, because a phone without a watch has no resting heart rate.

**`packages/health-core`** — pure TypeScript, no platform imports, used by the app and the
assistant service:

- `readiness(days)` → `low | normal | high | unknown` plus the reasons. Baseline is the median of
  the previous 14 days and needs at least 5 days of data, otherwise `unknown`. `low` when last
  night's sleep is under 6 hours or under 80% of baseline, or resting heart rate is 7% or more
  above baseline. `high` when sleep is at least baseline and resting heart rate is at or below
  baseline, and no `low` condition holds.
- `adjustDay(day, readiness, activity, catalog)` → the workout day to actually show. `low` cuts
  one set from each main-block item (never below one) and replaces level-3 exercises with a
  lower-level exercise of the same group. `high` adds one set to main-block items, never beyond
  the user's fitness level. An external workout of 30 minutes or more today swaps the main block
  for a mobility block built from `warm_up` exercises. The result always passes the existing
  validator, and every exercise the adjustment introduces is safe for the user's injuries and
  within their fitness level, so a day that was safe stays safe.
- `nudgeDue(stepsByHour, now, settings, history)` → whether to offer a desk break.

The rules are deterministic and tested. The AI explains an adjustment in words; it never decides
one.

**`HealthStore`** (in `apps/mobile/src/health/`) is the only thing screens talk to:
`status()`, `connect()`, `readDays(from, to)`, `readProfileHints()`, `writeWorkout(log)`,
`deleteWorkout(id)`, `watchSteps(handler)`. Callers never see a HealthKit identifier or a Health
Connect record type; the adapters translate both into the health-day contract.

**Supabase**

- `006_create_health_days.sql`: `health_days(user_id, day, tz, steps, active_energy_kcal,
  resting_hr_bpm, sleep_minutes, weight_kg, external_workouts jsonb, platform, updated_at)`,
  primary key `(user_id, day)`, row-level security for select, insert, update and delete on own
  rows.
- `007_workout_logs_health_record.sql`: `workout_logs.health_record_id` so a written workout can
  be found, not written twice, and deleted. Adds update and delete policies on `workout_logs`
  (the record id is attached after the log exists, because the write to the health store can
  fail and be retried).
- "Delete my health data" removes every `health_days` row for the user and turns sync off.

**Assistant service**

- `get_health_summary` tool and a health block in the generation prompt: 14-day averages,
  yesterday, external workouts this week. Absent data is stated as absent, not as zero.
- Plan generation works unchanged for users who never connect Health.
- The service does not have chat or plan-adjustment endpoints today (`/api/plans/generate` is the
  only one). The whole-app scope needs both, so they are part of this build.

**Mobile app** — Expo SDK 58 (React Native 0.88), TypeScript, expo-router, development builds
(HealthKit and Health Connect do not work in Expo Go).

- iOS: `@kingstinct/react-native-healthkit` 16.2.0 with `react-native-nitro-modules`, config
  plugin with both usage descriptions and `background: true`.
- Android: `react-native-health-connect` 4.1.3 with its bundled Expo plugin and
  `expo-build-properties` (`minSdkVersion` 26). Not `expo-health-connect`: it was archived on
  2026-08-01 and breaks the build when both are installed.
- Read: steps, active energy, resting heart rate, sleep, weight, workouts; on iOS also date of
  birth for the age range. Write: workouts and their active energy.
- Sync re-reads and upserts the last 14 days whenever the app comes to the foreground and from
  the background task, because watches and other apps deliver data late.
- A finished workout is written as one workout record: duration from the player, energy from
  each exercise's `met` × the user's weight × time. Aura Fit's own records are excluded when
  counting "workouts recorded by other apps".
- Profile from Health: onboarding shows the weight and age range found in Health; nothing is
  saved until the user confirms. Later weight changes are offered, not applied silently.
- Sitting nudges: local notifications only. Fewer than 250 steps in the last 60 minutes, inside
  the user's active hours (default 09:00–18:00 on weekdays), at most 3 a day and at least 90
  minutes apart, offers a two-minute break built from `quiet: true` exercises. Off until the
  user turns it on.
- Exercise demos in the player are the rendered Blender loops played as video from Supabase
  Storage (assumption: the Three.js pipeline stays out of this build).

## Milestones

Health is provable from milestone 2; each milestone is planned in detail when reached.

1. **Contracts and server.** Health-day schema, both migrations with row-level-security tests,
   `packages/health-core`, the assistant's health tool and prompt block. Fully testable today
   without a phone.
2. **App foundation and connect.** Expo project, magic-link sign-in, onboarding and profile, the
   `HealthStore` with both adapters and the fake, the Health settings screen, profile from
   Health.
3. **Today and player.** Today's plan, the player with video demos, workout logging, writing the
   workout to the health store.
4. **Sync and adaptation.** Daily-summary sync, readiness and activity-aware adjustment on the
   Today screen with the reason shown.
5. **Sitting nudges.** Background step delivery, notifications, settings.
6. **Chat, history and store readiness.** Chat and plan-adjustment endpoints and screens,
   history with health trends, delete-my-data, privacy text, review notes for both stores.

## Definition of done

All of these hold, each checked by something that can fail:

1. `catalog`/schema tests: every example in `examples/health-days/` validates against
   `health-day.schema.json`, and three deliberately broken ones are rejected.
2. Row-level-security tests: user A cannot select, insert, update or delete user B's
   `health_days` rows; deleting a user removes their rows.
3. `health-core` property tests: for every generated plan day and every readiness and activity
   input, `adjustDay` returns a day that passes the validator, introduces no exercise that
   conflicts with the profile's injuries, and keeps a safe day safe;
   `readiness` returns `unknown` with fewer than 5 baseline days.
4. Assistant tests: with a health summary present, the prompt contains it; with none, the request
   succeeds and the prompt says no health data is available.
5. iOS Simulator and Android emulator, each from a clean install: grant permissions, seed health
   data, open the app → the matching `health_days` rows exist in local Supabase with the seeded
   values; finish a workout → exactly one workout record appears in the health store with the
   expected duration and energy, and finishing is not duplicated by a second sync.
6. Same platforms: seeding a 5-hour sleep after 14 normal days makes Today show the lighter
   session and the reason; denying every permission leaves the app fully usable with no health
   prompts repeated.
7. Physical iPhone: with the app in the background and nudges on, a nudge arrives after a
   sedentary hour inside active hours and none arrives outside them.
8. "Delete my health data" leaves zero `health_days` rows for the user and a later foreground
   does not recreate them.

## Deliberately does NOT do

- No Apple Watch or Wear OS app, no live heart rate during a workout.
- No raw samples on the server, no heart-rate series, no sleep stages, no location or routes.
- No clinical data, cycle tracking, nutrition or mindfulness types.
- No medical claims: readiness is described as a training suggestion, never a health assessment.
- The AI never overrides the deterministic adjustment and never sees raw health samples.
- No server push notifications; nudges are local.
- No Three.js exercise demos, no Apple or Google sign-in.
- No changes to the old app on `main` / `feat/exercise-images`.

## Alternatives considered

- **Send a summary with each request and store nothing.** Simplest privacy story. Lost because
  trends, history and the background plan refresh all need data the server can read when the app
  is closed.
- **Sync raw samples.** Most analytical power. Lost on table size and on the privacy and
  store-review burden, with no behaviour in this build that needs more than a day's totals.
- **One cross-platform health library** (a single package wrapping both stores). Lost because the
  maintained options are per-platform, and the `HealthStore` interface already gives callers one
  surface while keeping each adapter replaceable.
- **Let the model decide the adjustment from health data.** Lost because the project rule is
  "never trust AI output" and a readiness rule has to be testable.

## Open questions

1. Android nudges and background reads can only be checked on the emulator here. Is that enough
   to ship them, or should they stay behind a flag until a physical Android phone is available?
2. Without an Apple Watch the iPhone supplies steps and sleep schedule but usually no resting
   heart rate, so readiness will often rest on sleep alone or be `unknown`. Is sleep-only
   readiness acceptable?
3. Are the readiness thresholds above (6 hours, 80% of baseline, +7% resting heart rate) and the
   nudge defaults (250 steps, 60 minutes, 3 a day) the ones you want, or do you have preferred
   numbers?
4. Who submits the Health Connect permission declaration in Play Console and the HealthKit
   review notes in App Store Connect, and under which app identifiers?
5. Should the weekly background plan refresh (Anthropic Batch API in the README) be part of
   milestone 6, or stay out of this build?

## Not yet verified

- The HealthKit library's function names for saving a workout, reading sleep and reading date of
  birth were not on the pages read; its minimum iOS and simulator behaviour were not stated.
  Checked at the start of milestone 2 against the library's own docs and a simulator run.
- Which Android version first supports background health reads was not stated in the Health
  Connect library docs.
- Health Connect's permission-rationale screen setup for an Expo project was not stated.

## Next implementation step

Write `schemas/health-day.schema.json` with its passing and failing examples and the schema test
that loads them, in `services/assistant/tests/`.
