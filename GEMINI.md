# Gemini Project Context: Home & Desk Fitness

This project is a fitness system designed for sedentary remote workers. It provides equipment-free exercise reminders, personalized workout plans, and calorie tracking. The repository is a monorepo consisting of a shared data foundation, an Expo React Native app, and a NestJS backend.

## Project Structure

- **Data Foundation (Root):** The source of truth for exercise data, schemas, and LLM prompts.
    - `expo/exercises.json`: Catalog of 75 exercises with MET values and instructions.
    - `expo/workout-plan.schema.json`: JSON Schema (Draft 2020-12) for workout plans.
    - `expo/workout-generator-prompt.md`: Markdown template for LLM plan generation.
    - `expo/locales/`: Localized exercise names and instructions (English and Ukrainian).
- **Expo App (`expo/app/`):** A mobile application built with React Native and Expo Router.
    - `src/store/`: State management using **Zustand** (persisted via AsyncStorage).
    - `src/lib/`: Core logic (calorie math, LLM integration, scheduler, validation).
    - `src/theme/`: Custom theme provider for styling (Vanilla React Native styles, no Tailwind).
- **NestJS Backend (`nestjs/`):** A Fastify-based API for authentication and LLM orchestration.
    - `src/auth/`: Google OAuth and JWT-based authentication.
    - `src/llm/`: Swappable LLM provider logic (e.g., OpenRouter).

## Key Technologies

- **Frontend:** Expo (SDK 54+), React Native, TypeScript, Expo Router, Zustand, i18next.
- **Backend:** NestJS (v11+), Fastify, Passport.js (JWT, Google OAuth2), Docker.
- **Data:** JSON Schema (Draft 2020-12), MET-based calorie modeling.

## Development Workflows

### Data Synchronization (Essential)
The root-level files in `expo/` are the source of truth. When modifying exercises or schemas, you **must** sync them to the app's assets:
```bash
cd expo/app
pnpm sync-data
```
This is also triggered automatically before `pnpm start`.

### Building and Running

#### Expo App
```bash
cd expo/app
pnpm install
pnpm start
```
*Note: Uses Node 25.7.0 (Homebrew path: `/opt/homebrew/Cellar/node/25.7.0/bin/node`).*

#### NestJS Backend
```bash
cd nestjs
pnpm install
cp .env.example .env  # Configure JWT_SECRET and LLM keys
pnpm start:dev
```

### Calorie Calculation
Calculations follow the formula in `expo/exercises.json`.
- **Planned Calories:** Calculated based on sets/reps/duration in the generated plan.
- **Actual Calories:** Recomputed during workout execution based on actual completion.
- Logic is implemented in `expo/app/src/lib/calorie.ts`.

### Plan Generation
1. App compiles user profile + exercise catalog into the `workout-generator-prompt.md`.
2. Prompt is sent to an LLM (via NestJS backend or directly).
3. JSON response is validated against `workout-plan.schema.json`.

## Technical Standards

- **TypeScript:** Strict mode is mandatory. Run `pnpm typecheck` in both `expo/app` and `nestjs`.
- **State Management:** Use Zustand for global state. Maintain immutability (see `planStore.ts` for deep updates).
- **Styling:** Use the custom `ThemeProvider` and `StyleSheet.create`. Do **not** use TailwindCSS.
- **Icons:** Use `@expo/vector-icons` (Ionicons).
- **Testing:**
    - App: Data validation via `scripts/validate-locales.ts`.
    - Backend: Jest for unit and E2E tests (`pnpm test`, `pnpm test:e2e`).

## Important Commands Summary

| Location | Command | Description |
|---|---|---|
| `expo/app` | `pnpm sync-data` | Sync source files to assets. |
| `expo/app` | `pnpm typecheck` | Validate TypeScript types. |
| `expo/app` | `pnpm lint` | Run ESLint (Expo flat config). |
| `nestjs` | `pnpm test` | Run unit tests. |
| `nestjs` | `pnpm start:debug` | Start with debugging enabled (port 9229). |
