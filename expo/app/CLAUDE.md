# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

This workspace is the Expo React Native app (`expo/app/`). The full product is a monorepo: data foundation lives in `expo/`, the API in `nestjs/`, this app consumes both. Repo-wide conventions are in `../../AGENTS.md`; workspace conventions in `../AGENTS.md`. Architecture and feature map are in `README.md`.

## Package manager

**Use `pnpm`.** Per `../../AGENTS.md`, all JS/TS commands in this repo go through pnpm — never `npm` or `yarn` unless the user explicitly says otherwise.

## Common commands

```sh
pnpm start              # prestart hook syncs data + validates locales, then `expo start`
pnpm ios | pnpm android # native dev builds (require Xcode / Android Studio toolchain)
pnpm typecheck          # tsc --noEmit (strict mode)
pnpm lint               # expo lint
pnpm sync-data          # re-run data sync (also runs automatically via prestart)
pnpm validate-locales   # check locale parity (also runs via prestart)
```

There is no test runner configured for this workspace; verification = typecheck + lint + locale validation + manual Expo run. The sibling `nestjs/` workspace has Jest.

### Node PATH caveat

`/usr/local/bin/node` on this machine is broken. Use Homebrew Node: prefix invocations with `PATH="/opt/homebrew/Cellar/node/25.7.0/bin:$PATH"` when running outside the user's normal shell environment.

## Architecture (read this before touching multiple files)

### Data flow: parent dir → bundled assets

Source of truth for the workout schema, exercise catalog, sample plan, locales, and the LLM prompt template lives **two directories up** (`../../*.json`, `../../locales/`, `../../workout-generator-prompt.md`). `scripts/sync-data.sh` copies them into `assets/data/` and `src/i18n/locales/{en,uk}/exercises.json`, and **generates** `src/lib/prompt-template.generated.ts` (the markdown prompt as an escaped TS template literal). The `prestart` script auto-runs sync + locale validation, so `pnpm start` always sees fresh data.

**Never hand-edit `src/lib/prompt-template.generated.ts`** — re-run `pnpm sync-data`. When you change anything in `../../`, mention it on the PR (per `../../AGENTS.md`).

### State (Zustand + AsyncStorage)

Four stores in `src/store/`:

- `profileStore` — onboarding fields + work-schedule fields used by the Generate Plan wizard. Persisted.
- `planStore` — the current `WorkoutPlan` JSON (the full LLM response). All mutators are immutable and call `recomputeActuals` from `src/lib/calorie.ts`, which cascades exercise → session → day → period calorie totals. Persisted.
- `settingsStore` — theme, toggles, postpone duration, language. Persisted. Language changes call `i18n.changeLanguage` directly (the root layout reads it once at mount).
- `onboardingStore` — draft fields during the onboarding wizard. **Not** persisted.

### Library layer (`src/lib/`)

This is where most non-trivial logic lives. The README has the full table; the load-bearing pieces:

- `runner.ts` — linearizes a `Session` into a flat array of runner steps (countdown → set → rest → next set/round/block → summary). The workout screen iterates this list.
- `calorie.ts` — MET-based math used both for planning estimates and execution actuals. `recomputeActuals` is the single rollup entry point any plan mutation must invoke.
- `validate.ts` — Ajv (Draft 2020-12) schema validation **plus** cross-reference against the catalog with fuzzy suggestions. Used when pasting LLM JSON.
- `scheduler.ts` — all `expo-notifications` interaction. Schedules only `required` and `preferred` sessions (not `optional`). A separate `@fitness/notification-map` `{sessionId → notificationId}` is persisted **outside** the plan JSON because the plan schema sets `additionalProperties: false`.
- `api.ts` — talks to the NestJS backend at `EXPO_PUBLIC_API_URL` (or derives `http://<expo-host>:3000/api` in local dev). Single endpoint today: `POST /llm/workout-plan`.
- `prompt.ts` — fills `<<>>` and `{{}}` placeholders in `prompt-template.generated.ts`.
- `catalog.ts` — loads bundled `exercises.json`, exposes `exerciseById` / `exercisesForAlternative`.
- `session-picker.ts` — picks the dashboard "up next" session honoring time windows + priority.

### Routes (`app/` — Expo Router with typed routes)

`/` is a gate that redirects to `/onboarding/welcome` or `/(tabs)` based on whether a profile exists. The README has the full route → behavior table. Notable: `/workout/[sessionId]` is the full-screen runner that drives `runner.ts` steps and cancels notifications on completion.

### Notification deep links

`app/_layout.tsx` runs `useNotificationDeepLink`, which captures the cold-start notification response and queues it until `useRootNavigationState().key` is set, then routes to `/plan/preview/:id`. Don't move the `Stack` mount earlier than the gate — the hook depends on that ordering.

## Path aliases (tsconfig)

- `@/*` → repo root (`./`)
- `@src/*` → `./src/*`
- `@data/*` → `./assets/data/*`

Use these in imports rather than `../../../`.

## Localization

i18next + react-i18next, locales in `src/i18n/locales/{en,uk}/{common,enums,exercises}.json`. `exercises.json` is **synced from `../../locales/`** — edit there, then `pnpm sync-data`. `common.json` and `enums.json` are edited in place. `pnpm validate-locales` (also in prestart) verifies parity.

## Expo configuration

- New Architecture **on** (`newArchEnabled: true`)
- React Compiler experiment **on**
- Typed routes experiment **on** — keep route paths literal-string-friendly
- iOS bundle: `com.yuriylev.homedeskfitness`; Android package matches
- Notifications channel: `fitness-reminders`

## Production bundle check

```sh
npx expo export --platform ios
npx expo export --platform android
```

Web is **not** a supported target — `expo-notifications` isn't browser-safe.
