# Expo Workspace Guidelines

## Project Structure

- `exercises.json`, `workout-plan.schema.json`, `sample-weekly-plan.json`, and `workout-generator-prompt.md` are source data used by the mobile app.
- `locales/` contains localized exercise catalog data.
- `app/` contains the Expo React Native application. Routes live in `app/app/`; shared UI, stores, theme, i18n, and types live in `app/src/`; bundled generated assets live in `app/assets/data/`.

## Package Manager

Use `pnpm` for all JavaScript and TypeScript commands in this workspace. Do not use `npm` or `yarn` for installs, scripts, or one-off package execution unless the user explicitly asks for it.

## Mobile App Commands

Run these from `expo/app`:

- `pnpm start`: sync data, validate locales, and start Expo.
- `pnpm ios` / `pnpm android`: run native development builds.
- `pnpm lint`: run Expo ESLint.
- `pnpm typecheck`: run TypeScript without emitting files.
- `pnpm validate-locales`: verify locale data consistency.
- `pnpm sync-data`: copy shared data, locale files, and prompt templates into app assets.

## API Environment

- Local mobile development should use `EXPO_PUBLIC_APP_ENV=local`.
- The current local API base URL is `https://wiseland.ngrok.pro/api`.
- Start Expo with `EXPO_PUBLIC_APP_ENV=local EXPO_PUBLIC_API_URL=https://wiseland.ngrok.pro/api pnpm start` when the local API is exposed through ngrok.
- If creating or changing a mobile `.env` file is required, stop and ask the user to do it.

## Implementation Notes

- Keep React Native components typed, focused, and aligned with existing Expo Router patterns.
- Use PascalCase for components, camelCase for functions and variables, and existing route naming conventions.
- When changing source data or localization files, run `pnpm sync-data` and `pnpm validate-locales` from `expo/app`.
