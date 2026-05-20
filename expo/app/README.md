# Fitness — Expo React Native app

Home-workout app built on top of the data foundation (`../exercises.json`,
`../workout-plan.schema.json`, `../workout-generator-prompt.md`,
`../sample-weekly-plan.json`). Runs in Expo Go on a physical iOS or Android
device — no native build required.

## Quick start

```sh
# From the project root:
cd app

# Install deps (only needed once)
PATH="/opt/homebrew/Cellar/node/25.7.0/bin:$PATH" pnpm install

# Sync the data foundation into the app's assets (idempotent; runs automatically
# via pnpm start's prestart hook, but you can also run it by hand)
pnpm sync-data

# Start the dev server
PATH="/opt/homebrew/Cellar/node/25.7.0/bin:$PATH" pnpm start
```

Scan the QR code from your phone's Expo Go app.

### Node PATH note

The system-level `/usr/local/bin/node` symlink on this machine is stale; only
the Homebrew binary at `/opt/homebrew/Cellar/node/25.7.0/bin/node` works. Every
`node`/`pnpm` invocation in the docs above therefore sets `PATH=` inline.
You can fix this permanently by fixing the symlink or adding Homebrew's node
bin to your shell config.

## Feature map

| Route | What it does |
|---|---|
| `/` | Gate — redirects to `/onboarding/welcome` or `/(tabs)` depending on whether a profile exists. |
| `/onboarding/*` | 7-screen wizard: welcome → name → photo → dob → body → fitness level → goals. Writes to `profileStore`. |
| `/(tabs)/` | Plan dashboard. Day strip, up-next card with Start/Postpone, calorie bar, all-sessions list. |
| `/(tabs)/settings` | User profile, edit plan, notifications/haptics/audio/keep-awake toggles, theme, postpone duration, clear all data. |
| `/plan/generate` | Wizard to collect work-schedule details, build the LLM prompt, copy it to clipboard. |
| `/plan/paste` | Paste the LLM's JSON response, validate against schema + catalog, save plan, schedule notifications. |
| `/plan/preview/[sessionId]` | Full read of a session: blocks, exercises, instructions. Start Workout button. |
| `/workout/[sessionId]` | Full-screen workout runner: countdown → set (timed or reps) → rest → next set/round/block → summary. Keep-awake, haptics. |
| `/profile/edit` | Edit profile fields. |

## State

Three Zustand stores, each persisted to AsyncStorage:

- `profileStore` — user profile (onboarding fields + schedule fields filled in the Generate Plan wizard)
- `planStore` — current workout plan JSON (the full LLM response), with immutable mutation helpers that recompute rolling actuals (exercise → session → day → period calories)
- `settingsStore` — app preferences (theme, toggles, postpone duration)

Plus one throwaway `onboardingStore` (not persisted) for the onboarding draft.

## Library layer (`src/lib`)

| Module | Responsibility |
|---|---|
| `catalog.ts` | Loads bundled `exercises.json`, provides `exerciseById`, `exercisesForAlternative`. |
| `calorie.ts` | MET-based calorie math for planning-time estimates AND execution-time actuals; `recomputeActuals` rolls everything up. |
| `dates.ts` | Date-fns helpers — today, weekday, time window containment, postpone arithmetic. |
| `prompt.ts` | Fills the `<<>>` and `{{}}` placeholders in the generated prompt template. |
| `prompt-template.generated.ts` | AUTO-GENERATED from `../workout-generator-prompt.md` by `scripts/sync-data.sh`. |
| `validate.ts` | Ajv (Draft 2020-12) schema validation + cross-reference against catalog with fuzzy suggestions. |
| `session-picker.ts` | Picks the "up next" session for the dashboard; honors time windows and priority. |
| `runner.ts` | Linearizes a session into a flat list of runner steps (countdown → set → rest → …). |
| `scheduler.ts` | All `expo-notifications` interaction: permission, schedule, cancel, reschedule, deep-link data. |
| `storage.ts` | Profile photo storage via `expo-file-system`. |

## Data bundling

The source-of-truth data lives in the parent directory. The `scripts/sync-data.sh`
script copies the 4 files into `assets/data/` and generates
`src/lib/prompt-template.generated.ts` (the prompt as a TS template literal,
escaped). The script is idempotent; `pnpm start` re-runs it via `prestart`.

If you edit `../exercises.json` or any root-level data file, just run
`pnpm sync-data` (or restart).

## Notifications

- Scheduled only for `required` and `preferred` sessions (not `optional` — too noisy).
- Trigger type: `DATE` at the session's `time_window.earliest` on the session's day.
- Data payload: `{ sessionId, planId }` — deep-linked to `/plan/preview/:id` via the root layout's `useNotificationDeepLink` hook.
- Rescheduled on plan save and on postpone.
- Cancelled on session completion (via the workout runner `finish` handler).
- A separate map `{sessionId: notificationIdentifier}` is persisted under `@fitness/notification-map` so individual cancels work without mutating the plan JSON (the schema uses `additionalProperties: false` on session execution, so we can't stuff the notification id inside).

## TypeScript

Strict mode. Run `pnpm typecheck` for a quick check.

```sh
PATH="/opt/homebrew/Cellar/node/25.7.0/bin:$PATH" pnpm typecheck
```

## Exporting a production bundle

```sh
PATH="/opt/homebrew/Cellar/node/25.7.0/bin:$PATH" pnpm dlx expo export --platform ios
PATH="/opt/homebrew/Cellar/node/25.7.0/bin:$PATH" pnpm dlx expo export --platform android
```

Both targets bundle cleanly as of the last verification.

## Known limitations (V1)

- **Audio cues are stubbed.** The settings toggle exists, but no `.mp3` files are bundled yet. Haptics provide the feedback channel for now. Drop files into `assets/sounds/` and wire them up in `app/workout/[sessionId].tsx`'s `playBeep` / `playDing`.
- **Swap exercise during workout** — not implemented in V1. A "Skip" button exists for bailing out of an exercise.
- **Progress history across periods** — not yet. The plan JSON itself holds execution state so history can be visualized later without schema changes.
- **Web target fails SSR** — `expo-notifications` isn't browser-safe. V1 is iOS/Android only via Expo Go. Native builds via `expo export --platform ios|android` bundle cleanly.
