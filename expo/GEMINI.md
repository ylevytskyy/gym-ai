# Gemini Project Context: Home & Desk Fitness

This project is a fitness system designed for sedentary remote workers. It provides equipment-free exercise reminders, personalized workout plans, and calorie tracking.

## Project Structure

The repository follows a dual-layer architecture:

1.  **Data Foundation (Root):**
    *   `exercises.json`: The source of truth for the exercise catalog (75 exercises, MET values, etc.).
    *   `workout-plan.schema.json`: JSON Schema (Draft 2020-12) for workout plans.
    *   `workout-generator-prompt.md`: LLM prompt template for generating plans.
    *   `sample-weekly-plan.json`: A validated example plan used for few-shot prompting and regression testing.
    *   `locales/`: Internationalization data for exercises (currently English and Ukrainian).

2.  **App Layer (`/app`):**
    *   An Expo React Native application built with TypeScript and Expo Router.
    *   `app/src/store/`: State management using **Zustand** (persisted via AsyncStorage).
        *   `planStore.ts`: Manages the current workout plan and its execution state.
        *   `profileStore.ts`: User profile and schedule preferences.
        *   `settingsStore.ts`: App preferences (theme, haptics, etc.).
    *   `app/src/lib/`: Core business logic (calorie math, scheduling, validation, runner logic).
    *   `app/src/components/`: Reusable UI components.
    *   `app/app/`: File-based routing using Expo Router.

## Getting Started

### Prerequisites
*   Node.js (version 25.7.0 preferred)
*   Expo Go app on iOS or Android

### Setup and Running
1.  Navigate to the app directory: `cd app`
2.  Install dependencies: `pnpm install`
3.  Sync data from the root: `pnpm sync-data` (this copies root data to assets and generates the prompt template).
4.  Start the development server: `pnpm start`

## Development Workflows

### Data Synchronization
The root-level files are the source of truth. If you modify `exercises.json`, `workout-plan.schema.json`, or `workout-generator-prompt.md`, you **must** run:
```sh
pnpm sync-data
```
This is also triggered automatically by `pnpm start` via a `prestart` hook.

### Plan Generation & Validation
1.  The app fills `workout-generator-prompt.md` with user profile data and the full exercise catalog.
2.  The resulting prompt is sent to an LLM.
3.  The LLM's JSON response is validated against `workout-plan.schema.json` and cross-referenced with `exercises.json` before being saved to the `planStore`.

### Calorie Math
Calorie calculations follow the formula in `exercises.json` -> `calorie_model`.
Implementation: `app/src/lib/calorie.ts`.
It uses MET values and user weight to estimate calories during planning and compute actuals during workout execution.

### Notifications
*   Handled via `expo-notifications`.
*   Logic resides in `app/src/lib/scheduler.ts`.
*   Notifications are scheduled for `required` and `preferred` sessions.
*   Deep linking is implemented in `app/app/_layout.tsx` to open the preview of the relevant session.

### Localization
*   Uses `i18next` and `react-i18next`.
*   App UI strings are in `app/src/i18n/locales`.
*   Exercise-specific localized content is synced from the root `locales/` directory.

## Technical Standards

*   **TypeScript:** Strict mode enabled. Run `pnpm typecheck` to validate.
*   **Linting:** ESLint with Expo's flat config. Run `pnpm lint`.
*   **State Management:** Prefer Zustand for global state. Use immutable updates (see `planStore.ts` for examples of deep-state updates).
*   **UI:** Vanilla React Native / Expo components with a custom `ThemeProvider` (`app/src/theme/`). Avoid TailwindCSS.
*   **Icons:** `@expo/vector-icons` (Ionicons).
*   **Images:** `expo-image` for optimized loading.

## Important Commands (from `/app`)

| Command | Description |
|---|---|
| `pnpm start` | Start Expo development server (syncs data first). |
| `pnpm sync-data` | Copy root-level data into app assets and generate TS prompt template. |
| `pnpm typecheck` | Run TypeScript compiler for type checking. |
| `pnpm lint` | Run ESLint. |
| `pnpm validate-locales` | Validate locale files. |
| `npx expo export --platform ios` | Export a production bundle for iOS. |

## Path Note
On this machine, use the Homebrew Node binary: `/opt/homebrew/Cellar/node/25.7.0/bin/node`. Build scripts and documentation often prefix commands with this PATH.
