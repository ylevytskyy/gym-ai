# Home & Desk Fitness

A "Lose Belly Fat"-style fitness system for sedentary remote workers who have **no equipment**, **cannot exercise outdoors**, and only have access to a chair, wall, doorway, and stairs. It:

- Reminds the user about exercise breaks during the workday
- Generates personalized workout plans for arbitrary periods (week / month / custom)
- Tracks calories burned at planning AND execution time
- Survives interruptions from meetings (flexible time windows, priority levels)

This repo has two layers:

1. **Data foundation** — curated exercise catalog, JSON Schema, LLM prompt, and a validated example plan (at the root of this directory).
2. **Expo React Native app** — installable on iOS/Android via Expo Go (in `./app/`). See [`app/README.md`](./app/README.md) for how to run it.

## Files at the root (data foundation)

| File | Purpose |
|---|---|
| `exercises.json` | Exercise catalog (source of truth). 75 equipment-free exercises across 8 categories, each with MET values, default sets/reps, instructions, modifications, and contraindications. |
| `workout-plan.schema.json` | JSON Schema (Draft 2020-12) describing the structure of a personalized plan. |
| `workout-generator-prompt.md` | Markdown prompt template the LLM consumes. Inline placeholders for user inputs. |
| `sample-weekly-plan.json` | A valid example plan for a fictional 35-year-old, 80kg, 178cm beginner with belly-fat & posture goals. Used as the few-shot example inside the prompt and as a regression fixture. |
| `app/` | The Expo React Native app built on top of this foundation. |
| `README.md` | This file. |

The app bundles copies of the data foundation files at build time via `app/scripts/sync-data.sh`. The root-level files remain the source of truth — edit them here, then re-run the sync script (or just restart the dev server).

## How the pieces fit together

```
                     ┌─────────────────┐
                     │  exercises.json │ ─────┐
                     └─────────────────┘      │
                                              ▼
user inputs ─► fill placeholders in workout-generator-prompt.md
                                              │
                                              ▼
                                            LLM
                                              │
                                              ▼
                                       plan JSON output
                                              │
                                              ▼
              ┌────────────────────────────────────────────────┐
              │ Validate: Draft 2020-12 against                │
              │ workout-plan.schema.json                       │
              │ + cross-reference all exercise_id's against    │
              │   exercises.json                               │
              └────────────────────────────────────────────────┘
                                              │
                                              ▼
                                  consumed by future app
                                  (mutates execution blocks at runtime)
```

## Validation

The repo has no JS toolchain. Validate with Python and the `jsonschema` package:

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

If you have Node available, `pnpm dlx ajv-cli` works too:

```sh
pnpm dlx ajv-cli compile -s workout-plan.schema.json
pnpm dlx ajv-cli validate -s workout-plan.schema.json -d sample-weekly-plan.json
```

## Generating a plan with an LLM

1. Read `workout-generator-prompt.md`.
2. Replace the `<<EXERCISES_JSON>>`, `<<WORKOUT_PLAN_SCHEMA_JSON>>`, and `<<SAMPLE_WEEKLY_PLAN_JSON>>` placeholders with the verbatim contents of those files.
3. Replace each `{{user_input}}` placeholder with real values for your user.
4. Send the result as a single user message to a capable model (Claude Opus / Sonnet, GPT-4 class).
5. Parse the response as JSON.
6. Validate against `workout-plan.schema.json` (see above).
7. Cross-reference every `exercise_id` in the response against `exercises.json` (the schema can't enforce this).

## Calorie formula

Defined once in `exercises.json` → `calorie_model`, used everywhere:

```
work_seconds = sets * amount * seconds_per_rep   # for unit == "reps"
work_seconds = sets * amount                     # for unit == "seconds"
work_minutes = work_seconds / 60
kcal_per_minute = met_value * weight_kg / 60
estimated_calories = kcal_per_minute * work_minutes * intensity_multiplier
```

`intensity_multipliers`: `low: 0.85`, `medium: 1.0`, `high: 1.20`

Rest seconds are NOT counted as work time. This makes strength sessions look "low" in calories vs continuous cardio — that's accurate.

MET values come from the [Compendium of Physical Activities](https://pacompendium.com/) (Ainsworth et al. 2011).

## Adding an exercise to the catalog

1. Choose a stable, kebab-case `id` that doesn't collide with anything in `exercises.json`.
2. Fill all required fields. Don't omit anything.
3. Look up the MET value in the Compendium of Physical Activities. If the exact movement isn't there, use the nearest analog and explain in the `notes` field.
4. For rep-based exercises, estimate `seconds_per_rep` honestly — count yourself doing the exercise. For time-based exercises, set it to `null`.
5. Set `desk_friendly: true` only if the exercise can be done at a desk in office clothes without taking up floor space.
6. Set `noise_level` honestly — `silent` (no impact), `quiet` (minor floor contact), `moderate` (jumping/landing).
7. Bump the catalog `version` and run the validation steps above.

## Versioning

- `exercises.json` → top-level `version` (semver). Bump on any catalog change.
- `workout-plan.schema.json` → `schema_version` (currently `1.0.0`, also enforced as a `const` in the schema).
- Both versions are stamped into every generated plan via `summary.calorie_model_version` and `schema_version`.

## Running the app

```sh
cd app
PATH="/opt/homebrew/Cellar/node/25.7.0/bin:$PATH" pnpm install
PATH="/opt/homebrew/Cellar/node/25.7.0/bin:$PATH" pnpm start
```

Scan the QR code from Expo Go on your phone. Full setup and architecture notes
are in [`app/README.md`](./app/README.md).

## Out of scope

- A code-side calorie correction model based on `perceived_effort_rpe`.
- Diet / nutrition planning.
- Heart-rate-based intensity tracking.
- Wearable integration (Apple Health, Garmin, Fitbit).
