# Repository Guidelines

## Project Structure & Module Organization

This repository has two main workspaces:

- `expo/`: fitness data, schemas, prompts, and localized exercise catalogs.
- `expo/app/`: Expo React Native app. Routes live in `app/`; shared UI, stores, theme, i18n, and types live in `src/`; bundled JSON assets live in `assets/data/`.
- `nestjs/`: NestJS API. Feature modules live in `src/auth`, `src/health`, and `src/llm`; shared configuration lives in `src/common/config`.

NestJS unit tests use `*.spec.ts` beside source files. API e2e tests live in `nestjs/test/`.

## Build, Test, and Development Commands

From `expo/app`:

- `pnpm start`: sync data, validate locales, and start Expo.
- `pnpm ios` / `pnpm android`: run native development builds.
- `pnpm lint`: run Expo ESLint.
- `pnpm typecheck`: run TypeScript without emitting files.
- `pnpm validate-locales`: verify locale data consistency.

From `nestjs`:

- `pnpm start:dev`: start NestJS in watch mode.
- `pnpm start:debug`: start NestJS in watch mode with the Node debugger on port `9229`.
- `pnpm build`: compile the API to `dist/`.
- `pnpm lint`: lint `src/**/*.ts` and `test/**/*.ts`.
- `pnpm test`: run Jest unit tests.
- `pnpm test:e2e`: run API e2e tests.

For API debugging, keep `nestjs/.env` populated from `nestjs/.env.example`, including `JWT_SECRET`, then run `pnpm start:debug` from `nestjs`. The API listens on `http://127.0.0.1:3000/api`, and a debugger can attach to `127.0.0.1:9229`.

When exposing the local API for mobile testing, use the reserved ngrok domain:

- Start the API from `nestjs` with `pnpm start:dev`, or `pnpm start:debug` when debugger attachment is needed.
- Expose it with `ngrok http --url=wiseland.ngrok.pro 3000`.
- The public API base URL is `https://wiseland.ngrok.pro/api`.
- Start Expo with `EXPO_PUBLIC_APP_ENV=local EXPO_PUBLIC_API_URL=https://wiseland.ngrok.pro/api pnpm start` unless the mobile environment file has already been configured. If creating or changing a mobile env file is needed, stop and ask the user to do it.

## Package Manager

Use `pnpm` for all JavaScript and TypeScript workspace commands. Do not use `npm` or `yarn` for installs, scripts, or one-off package execution unless the user explicitly asks for it.

## Coding Style & Naming Conventions

Use TypeScript throughout. Keep React Native components and Zustand stores focused, typed, and colocated with the app layer they support. Use PascalCase for components (`SessionCard.tsx`), camelCase for functions and variables, and existing Expo Router route naming.

The API uses ESLint plus Prettier and rejects `any`, floating promises, and unsafe assignments. Prefer DTOs, injectable services, and module boundaries matching existing NestJS patterns.

## Testing Guidelines

For the API, place unit tests as `*.spec.ts` near the implementation and e2e tests as `*.e2e-spec.ts` in `nestjs/test/`. Run `pnpm test` before API changes and `pnpm test:e2e` for route/auth behavior. The Expo app currently relies on linting, typechecking, locale validation, and manual Expo verification.

## Commit & Pull Request Guidelines

Recent commits use concise Conventional Commit-style subjects, for example `feat: add Exercises tab...`, `chore: restructure repo...`, and `i18n: add ... strings`. Keep subjects imperative and scoped to one change.

Pull requests should describe the user-facing change, list verification commands run, link related issues, and include screenshots or recordings for mobile UI changes. Note data/schema changes because `sync-data` affects generated app assets.

## Security & Configuration Tips

Do not commit secrets. Use `nestjs/.env.example` as the template for local `nestjs/.env`. Keep JWT, OAuth, and LLM provider keys in environment variables.
