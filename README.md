# Aura Fit (gym-ai) — v2

A fitness app that builds short, equipment-free workouts with AI, and shows every exercise as an
animated 3D person.

> **Status:** fresh start. This branch (`v2`) has no code yet. This README is the plan.
> The old implementation lives on `main` and `feat/exercise-images`. We keep its lessons,
> not its code.

## Goal

- Help people who sit a lot (remote workers) move every day.
- No equipment. Home or office. 5–30 minutes.
- The AI assistant makes a personal plan and adjusts it from feedback.
- Every exercise has a clear 3D demo, so the user knows how to do it right.

## Main parts

| Part | What it does | Tech |
|---|---|---|
| Mobile app | Profile, today's workout, workout player, chat, history | Expo (React Native) |
| Backend | Users, data, files, security | Supabase (Postgres, Auth, Storage) |
| AI service | Makes and changes plans, answers questions | Node.js, two implementations: OpenRouter and Anthropic (Messages API + Batch API) |
| Exercise catalog | The list of exercises the AI may use, grouped | JSON file |
| Plan schema | The exact shape of a workout plan | JSON Schema (draft 2020-12) |
| 3D pipelines | Turn an exercise into an animated demo | Blender and Three.js; we test both and keep the best |

## How the parts fit together

```text
 ┌──────────────┐   sign in, read/write data    ┌───────────────────────────┐
 │  Mobile app  │ ────────────────────────────▶ │ Supabase                  │
 │  (Expo)      │                               │ Auth · Postgres · Storage │
 └──────┬───────┘                               └────────────▲──────────────┘
        │ "make me a plan" / chat (user JWT)                 │ save plan
        ▼                                                    │
 ┌─────────────────────────────────────────────┐             │
 │ AI service (Node.js)                        │─────────────┘
 │  one interface, two providers:              │
 │   • OpenRouter    • Anthropic               │──▶ LLM API
 │  validates every plan against the schema    │
 └─────────────────────────────────────────────┘

 3D pipelines (offline, on a dev machine or CI):
   exercise animation ──▶ Blender or Three.js ──▶ video / 3D file ──▶ Supabase Storage ──▶ app
```

## Rules we follow

- **The schema is the contract.** The app, the AI service and the pipelines all read the same
  catalog and plan schema. Change them first, then the code.
- **Never trust AI output.** Every plan is checked against the schema and the catalog before we
  save it. Bad plan → one retry with the errors → else a clear error to the user.
- **Secrets stay on the server.** LLM keys live only in the AI service. The app only has the
  public Supabase key.
- **Start small.** A few exercises, one plan type, one screen at a time. Add more only when the
  basics work.
- **Not medical advice.** The app asks about injuries and avoids risky exercises, and says so.

---

## 1. Backend — Supabase

Supabase gives us the database, sign-in and file storage, so we write very little backend code.

**Auth:** email magic link first. Apple / Google sign-in later.

**Tables (first version):**

| Table | Holds |
|---|---|
| `profiles` | One row per user: age range, weight, goal, level, injuries, minutes per day, language |
| `plans` | A generated plan as JSON (`plan_json`), its schema version, provider used, status |
| `workout_logs` | What the user actually did: plan day, exercises done, duration, rating, notes |
| `assistant_messages` | Chat history with the AI assistant |

- The exercise catalog is a file in the repo, not a table, until we need to edit it live.
- **Row Level Security** on every table: a user reads and writes only their own rows.
- **Storage** buckets: `exercise-media` (public: videos, posters, 3D files).
- Schema changes go in `supabase/migrations/`. Test data goes in `supabase/seed.sql`.
- Local dev runs with the Supabase CLI (`supabase start`).

**Why the AI runs in its own service, not in Supabase Edge Functions:** one place for both
providers, the shared tools and checks, the LLM keys, and the background job that sends and
collects batches. Edge Functions may work for the simple calls later; we have not tested this.

## 2. AI assistant — two implementations

Both implementations follow one interface, so the app does not care which one runs:

```ts
interface Assistant {
  generatePlan(profile: Profile, request: PlanRequest): Promise<WorkoutPlan>; // schema-valid
  adjustPlan(plan: WorkoutPlan, feedback: string): Promise<WorkoutPlan>;
  chat(userId: string, message: string): AsyncIterable<string>;              // streamed reply
}
```

Pick one with an env var: `ASSISTANT_PROVIDER=openrouter | anthropic`.

**Tools both assistants can use** (same names, same inputs):

| Tool | Does |
|---|---|
| `get_catalog` | Returns the exercises, filtered by group, level or injury |
| `get_profile` | Returns the user's profile |
| `get_recent_logs` | Returns the last N workouts and ratings |
| `validate_plan` | Checks a draft plan against the schema and catalog, returns errors |
| `save_plan` | Saves a valid plan to Supabase |

### 2a. OpenRouter

- One API for many models (OpenAI-style chat API). The model is set by env var, so we can
  compare models without code changes.
- We run the tool loop ourselves: send messages + tool definitions → run the tool calls →
  repeat until the model returns a final plan.
- Good for: cheap tests, trying many models.

### 2b. Anthropic — Messages API + Batch API

Package `@anthropic-ai/sdk` (TypeScript). Default model `claude-sonnet-5-5`, set by env var.
Two modes, same request format:

| Mode | Use it when | How it works |
|---|---|---|
| **Live** — Messages API | The user is waiting: "make me a plan", chat, "my knee hurts" | We run the tool loop ourselves, like 2a. Chat replies stream. |
| **Background** — Batch API | Nobody is waiting: weekly plan refresh for all users, test runs, plan templates | One request per user. Results come back later. |

**Batch API facts** (from Anthropic's docs):

- 50% cheaper than live calls.
- Most batches finish within 1 hour; a batch can take up to 24 hours.
- Up to 100,000 requests or 256 MB per batch.
- No streaming. Results are kept for 29 days; we delete a batch after we save its results.

**How a background run works:**

1. A scheduled job builds one request per user. Each request already holds everything the
   model needs: the catalog, the profile, recent workouts and the plan schema. A batch
   request is one call, so the model cannot wait for our tools to answer.
2. Each request gets a `custom_id` (the user id), so we can match results to users.
3. The job checks the batch status until it ends, then downloads the results.
4. Every plan goes through the same schema and catalog check as live plans. Valid → save.
   Invalid → retry in the next batch, or with one live call if the plan is due soon.

**To check before we build:** that structured outputs (forcing the reply to match our JSON
schema) work inside a batch. The docs say "most beta features" are supported.

**Later, only if needed:** the Claude Agent SDK, if the assistant grows into real multi-step
work (read history → reason → draft → check → fix). For making one plan it adds weight we
don't need: it runs a full agent program on the server.

### How we compare them

Same test set for both: ~10 sample profiles (beginner, knee injury, 10 minutes only, and so on).
For Anthropic we run the test set through the Batch API, at half the price.

| Measure | How |
|---|---|
| Valid plans | % of plans that pass the schema and catalog check on the first try |
| Safety | No exercise listed under the user's injuries |
| Quality | A person rates each plan 1–5 |
| Speed | Seconds to a saved plan |
| Cost | Dollars per plan |

The results go in `docs/assistant-comparison.md`. We may keep both.

## 3. Exercise catalog

File: `catalog/exercises.json`. Start very small: **5 groups, 10 exercises**. Grow later.

| Group | Exercises |
|---|---|
| `warm_up` | Neck rolls, Arm circles |
| `lower_body` | Squat, Reverse lunge |
| `upper_body` | Push-up, Chair dip |
| `core` | Plank, Glute bridge |
| `cardio` | Jumping jacks, High knees |

One exercise:

```json
{
  "id": "squat",
  "group": "lower_body",
  "name_key": "exercise.squat.name",
  "body_parts": ["legs", "glutes"],
  "level": 1,
  "unit": "reps",
  "default": { "sets": 3, "amount": 12, "rest_seconds": 30 },
  "met": 5.0,
  "avoid_if": ["knee_injury"],
  "quiet": true,
  "media": { "video": "squat.mp4", "poster": "squat.jpg", "model": "squat.glb" }
}
```

- `unit` is `reps` or `seconds`.
- `level` is 1 (easy) to 3 (hard).
- `met` lets us estimate calories: `kcal = MET × weight_kg × hours`.
- Text (names, steps, tips) lives in `catalog/locales/<lang>.json`, keyed by `name_key`.
  English first.
- The catalog has its own JSON Schema (`schemas/exercise.schema.json`) and a check in CI.

## 4. Workout plan schema

File: `schemas/workout-plan.schema.json` (JSON Schema draft 2020-12). The AI must return
exactly this shape.

```json
{
  "schema_version": "1.0.0",
  "id": "6f1c…",
  "created_at": "2026-11-04T10:00:00Z",
  "goal": "move_more",
  "days": [
    {
      "day": 1,
      "title": "Legs and core",
      "minutes": 15,
      "blocks": [
        { "type": "warm_up",   "items": [{ "exercise_id": "neck-rolls", "sets": 1, "amount": 5 }] },
        { "type": "main",      "items": [{ "exercise_id": "squat", "sets": 3, "amount": 12, "rest_seconds": 30 },
                                         { "exercise_id": "plank", "sets": 3, "amount": 30, "rest_seconds": 30 }] },
        { "type": "cool_down", "items": [{ "exercise_id": "glute-bridge", "sets": 1, "amount": 10 }] }
      ]
    }
  ],
  "notes": "Go slow on the squats. Stop if your knee hurts."
}
```

- `amount` means reps or seconds, taken from the exercise's `unit`.
- The schema checks the shape. The code also checks what a schema can't: every
  `exercise_id` exists, no `avoid_if` matches the user's injuries, and the minutes add up.
- `schema_version` changes when the shape changes. Old plans keep their version.

## 5. 3D exercise demos — two pipelines

**Input (shared):** one rigged human character + one animation clip per exercise
(for example from Mixamo, or our own). Check the license of every asset before we ship it.

**Output (what the app needs):** a short loop that shows correct form, plus a poster image.

### 5a. Blender pipeline

- Headless script: `blender -b -P pipelines/blender/render.py -- <exercise_id>`.
- Steps: import character + clip → fix the clip (trim, loop, fix bad poses) → set camera and
  light → render → encode an 800×800 H.264 MP4 + poster.
- Upload to Supabase Storage `exercise-media`.
- **Pros:** best image quality, works offline, small files, simple to play in the app.
- **Cons:** fixed camera angle; any change means a new render.
- **Lesson from v1:** some stock clips look wrong (for example high knees had shallow knees and
  a leaning body). Fixes must be scripted and repeatable, never done by hand.

### 5b. Three.js pipeline

- Export character + clip to glTF/GLB (`.glb`).
- Play it with Three.js `AnimationMixer`, two ways:
  1. **Live in the app** (react-three-fiber on Expo): the user can rotate, zoom and slow down.
  2. **Render to video** in a headless browser, as a fallback for weak phones.
- **Pros:** interactive, one file per exercise, also works on the web.
- **Cons:** heavier on the phone, more native setup, the look depends on the device.

### How we choose

Build the same 3 exercises (squat, push-up, plank) with both pipelines, then score:

| Measure | Blender | Three.js |
|---|---|---|
| Form looks correct (person rates 1–5) | | |
| File size per exercise | | |
| Time to first frame on a mid-range phone | | |
| Battery and frame rate during a 10-minute workout | | |
| Effort to add a new exercise | | |
| Works offline | | |

The results go in `docs/3d-pipeline-comparison.md`. The winner becomes the default. If both
win in different places, we keep video for the player and 3D for an "inspect" view.

## 6. Mobile app

Expo (React Native) with Expo Router. First screens only:

1. **Sign in** and **Profile** (goal, level, injuries, minutes per day)
2. **Today** — today's workout from the current plan
3. **Player** — demo, timer, reps, rest; works offline once downloaded
4. **Assistant** — chat: "make it easier", "I have 10 minutes", "my knee hurts"
5. **History** — past workouts and ratings

---

## Repo layout (planned)

```text
apps/mobile/            Expo app
services/assistant/     AI service
  core/                 interface, tools, validation (shared)
  openrouter/           provider 2a
  anthropic/            provider 2b (live + batch)
  eval/                 test profiles + comparison script
supabase/               migrations/, seed.sql, config
catalog/                exercises.json, locales/
schemas/                workout-plan.schema.json, exercise.schema.json
pipelines/
  blender/              render scripts
  threejs/              glTF export + viewer + headless render
  assets/               characters and clips (large files via Git LFS)
docs/                   comparisons, decisions
```

One `pnpm` workspace for all JavaScript/TypeScript packages. Python only inside
`pipelines/blender/`.

## Roadmap

| Step | Done when |
|---|---|
| 1. Contracts | Catalog (10 exercises), both schemas, and a validator with tests |
| 2. Backend | Supabase tables, RLS, auth, seed data, running locally |
| 3. AI service | Both providers make valid plans for all test profiles; comparison written |
| 4. 3D bake-off | 3 exercises in both pipelines; comparison written; winner picked |
| 5. App MVP | Sign in → plan → do a workout → log it, on a real phone |
| 6. Grow | More exercises, languages, reminders, calorie tracking |

## Open questions

- Are the target users still remote workers who sit a lot, or wider?
- Which languages at launch? (v1 had English and Ukrainian.)
- Where do we host the AI service (Fly.io, Railway, Cloud Run, other)?
- Do we need reminders and calorie tracking in the MVP, or later?
- Where do the 3D assets come from long term: stock clips, our own motion capture, or AI
  motion generation?
