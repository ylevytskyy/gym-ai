# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

This directory is the **data foundation** workspace of a two-workspace monorepo (`../`):

- `./` (here) — curated exercise catalog, JSON Schema, LLM prompt template, localized exercise data, validated example plan.
- `./app/` — Expo React Native app that consumes this data. Has its own `CLAUDE.md` with the full app architecture; **read it before touching anything under `app/`**.
- `../nestjs/` — NestJS API (separate workspace, separate `AGENTS.md`).

Repo-wide conventions live in `../AGENTS.md`. This workspace's conventions live in `./AGENTS.md`.

## Source of truth and sync direction

The files at this directory's root are **the source of truth**:

| File | Role |
|---|---|
| `exercises.json` | Catalog of 75 equipment-free exercises. Defines MET values, default sets/reps, modifications, and `calorie_model`. |
| `workout-plan.schema.json` | Draft 2020-12 JSON Schema for a generated plan. `additionalProperties: false` is enforced, so app-only fields like notification IDs cannot live inside the plan. |
| `workout-generator-prompt.md` | LLM prompt template with `<<EXERCISES_JSON>>`, `<<WORKOUT_PLAN_SCHEMA_JSON>>`, `<<SAMPLE_WEEKLY_PLAN_JSON>>`, and `{{user_input}}` placeholders. |
| `sample-weekly-plan.json` | Few-shot example plan, also a regression fixture. |
| `locales/{en,uk}/exercises.json` | Localized catalog strings. |

`app/scripts/sync-data.sh` copies these into `app/assets/data/` and `app/src/i18n/locales/{en,uk}/exercises.json`, **and generates** `app/src/lib/prompt-template.generated.ts` (the markdown prompt as an escaped TS template literal). The app's `prestart` hook runs sync + locale validation, so any change to a root-level file is picked up by the next `pnpm start` in `app/`.

**Edit at the root, never in `app/assets/data/` or the generated TS file.** When you change anything here, mention it on the PR — `../AGENTS.md` calls out that `sync-data` affects generated app assets.

## Validation (no JS toolchain at this level)

This workspace itself has no `package.json`. Validate with Python + `jsonschema`:

```sh
pip3 install jsonschema
python3 -m json.tool exercises.json > /dev/null
python3 -m json.tool workout-plan.schema.json > /dev/null
python3 -m json.tool sample-weekly-plan.json > /dev/null

python3 -c "
import json
from jsonschema import Draft202012Validator
schema = json.load(open('workout-plan.schema.json'))
plan = json.load(open('sample-weekly-plan.json'))
Draft202012Validator.check_schema(schema)
errors = list(Draft202012Validator(schema).iter_errors(plan))
print('valid' if not errors else f'{len(errors)} errors')
"
```

The schema **cannot** enforce that every `exercise_id` exists in `exercises.json` — cross-reference manually (or rely on the app's `src/lib/validate.ts`, which does exactly this with fuzzy suggestions).

Or with Node:

```sh
npx ajv compile -s workout-plan.schema.json
npx ajv validate -s workout-plan.schema.json -d sample-weekly-plan.json
```

## App commands (run from `./app/`)

The app workspace uses **pnpm** — per `../AGENTS.md`, never `npm` or `yarn` unless the user explicitly asks.

```sh
cd app
pnpm start              # prestart syncs data + validates locales, then `expo start`
pnpm ios | pnpm android # native dev builds
pnpm typecheck          # tsc --noEmit (strict)
pnpm lint               # expo lint
pnpm sync-data          # manually re-run the sync (also runs via prestart)
pnpm validate-locales   # locale parity check (also runs via prestart)
```

There is **no test runner** in `app/`. Verification = typecheck + lint + locale validation + manual Expo run. The sibling `nestjs/` workspace has Jest (`pnpm test`, `pnpm test:e2e`).

### Node PATH caveat

`/usr/local/bin/node` on this machine is broken. Prefix invocations with `PATH="/opt/homebrew/Cellar/node/25.7.0/bin:$PATH"` when running outside the user's normal shell.

## Calorie formula (defined once, used everywhere)

`exercises.json → calorie_model` is the single definition. App code mirrors it in `app/src/lib/calorie.ts`. If the formula changes, bump `exercises.json` `version`, update the app, and update plans (`summary.calorie_model_version` is stamped into every plan).

```
work_seconds       = sets * amount * seconds_per_rep   # unit == "reps"
work_seconds       = sets * amount                     # unit == "seconds"
kcal_per_minute    = met_value * weight_kg / 60
estimated_calories = kcal_per_minute * (work_seconds / 60) * intensity_multiplier
```

Rest seconds are intentionally **not** counted as work time. Strength sessions will look low-calorie next to cardio — that's correct.

## Versioning

- `exercises.json → version` (semver) — bump on any catalog change.
- `workout-plan.schema.json → schema_version` (currently `1.0.0`, also enforced as a `const` in the schema).
- Both are stamped into generated plans (`summary.calorie_model_version`, `schema_version`).

## Generating a plan with an LLM

`workout-generator-prompt.md` is consumed two ways:

1. **Manually**: substitute `<<…>>` placeholders with file contents, `{{…}}` placeholders with user inputs, send to a capable model.
2. **By the app**: `app/src/lib/prompt.ts` fills the same placeholders against `prompt-template.generated.ts` and posts to `POST /llm/workout-plan` on the NestJS API (`EXPO_PUBLIC_API_URL`, default `https://wiseland.ngrok.pro/api` for local dev).

If you change placeholder names in the prompt, update both `app/src/lib/prompt.ts` and the NestJS `llm` module.

## Out of scope (don't add without an explicit ask)

- Diet / nutrition planning
- Heart-rate or RPE-based calorie correction
- Wearable / Apple Health / Garmin / Fitbit integration
- Web as a target — `expo-notifications` isn't browser-safe; the app explicitly does not support web

## When working in `app/`

Switch context to `app/CLAUDE.md` — it covers Zustand stores, the runner step machine, notification deep-link ordering, path aliases, and the Expo/New-Architecture configuration in detail. Don't duplicate that here.
