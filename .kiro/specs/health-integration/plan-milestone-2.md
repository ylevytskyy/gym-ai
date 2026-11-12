# Health integration — plan for milestone 2 (app foundation and connect)

Goal: an Expo app exists in `apps/mobile` where a person can sign in, fill in their profile with
weight and age range offered from the health store, and connect or disconnect Health. Reading
health days and writing workouts work through one `HealthStore` interface on both platforms.

Spec: [spec.md](spec.md). Milestone 1: [plan.md](plan.md).

## Global constraints

- Expo SDK 58 (React Native 0.88.1, React 19.3.0), TypeScript strict, expo-router, development
  builds only (the health libraries do not run in Expo Go). `npm`, like the rest of the repo.
- iOS: `@kingstinct/react-native-healthkit` 16.2.0 + `react-native-nitro-modules`.
  Android: `react-native-health-connect` 4.1.3 + `expo-build-properties` (`minSdkVersion` 26).
- Screens never import a health library. They talk to `HealthStore`; adapters translate.
- Everything an adapter returns is a health day as defined by `schemas/health-day.schema.json`.
- Nothing from Health is saved to the profile until the user confirms it.
- Secrets stay on the server: the app holds only the Supabase publishable key.
- Vocabulary follows `CONTEXT.md` (connect, health store, health day, external workout).

## API facts checked against the installed packages (2026-11-12)

- HealthKit: `requestAuthorization({ toRead, toShare })`, `getRequestStatusForAuthorization`,
  `authorizationStatusFor`, `queryStatisticsCollectionForQuantity(id, stats, anchorDate, { day: 1 }, { filter, unit })`,
  `queryCategorySamples('HKCategoryTypeIdentifierSleepAnalysis', { filter, limit })`,
  `queryWorkoutSamples({ filter, limit })`, `saveWorkoutSample(type, quantities, start, end, totals, metadata)`,
  `deleteObjects`, `getDateOfBirthAsync`, `currentAppSource()`, `isHealthDataAvailableAsync`.
  The package ships a non-iOS stub, so importing it on Android is safe.
- HealthKit never reveals whether read access was granted, only whether the request still needs
  to be shown. "Connected" is therefore the user's choice in the app plus a request that no longer
  needs showing.
- Health Connect: `getSdkStatus`, `initialize`, `requestPermission`, `getGrantedPermissions`,
  `aggregateRecord`, `readRecords`, `insertRecords`, `deleteRecordsByUuids`,
  `openHealthConnectSettings`. `revokeAllPermissions` only takes effect after an app restart, so
  disconnect is tracked in the app and the user is sent to Health Connect settings.
- Health Connect has no date of birth: on Android only weight is offered for the profile.

## Seam

- End to end: Maestro flows in `apps/mobile/e2e/` on the iOS Simulator and the Android emulator.
- Component: jest-expo + React Native Testing Library, with the fake `HealthStore` and a fake
  Supabase client injected through providers.
- Unit: the pure parts (`buildHealthDays`, profile form model, auth link parsing, secure storage
  chunking) and each adapter against a mocked health library.

Device tiers: unit and component tests run on Node; permission prompts, real reads and writes run
on the iOS Simulator and Android emulator; nothing in this milestone needs the physical iPhone.

## Slices

### Slice 1 — App skeleton
- **Files:** `apps/mobile/{package.json,app.config.ts,tsconfig.json,metro.config.js,jest.config.js,jest.resolver.js,jest.setup.ts}`,
  `src/lib/env.ts`, `src/app/_layout.tsx`.
- **Acceptance:** `npx tsc --noEmit` and `npx jest` pass; `npx expo config` shows both health
  plugins, the usage descriptions and the Health Connect permissions; missing `EXPO_PUBLIC_*`
  values fail with a message naming the variable.
- **Verify:** `cd apps/mobile && npx tsc --noEmit && npx jest && npx expo config --type public`
- **Blocked-by:** None.

### Slice 2 — Health days from raw readings
- **Files:** `src/health/types.ts`, `src/health/build-health-days.ts`, `src/health/local-day.ts`, tests.
- **Produces:** `HealthStore` interface; `buildHealthDays(raw, { from, to, tz, platform }): HealthDay[]`.
- **Acceptance:** overlapping sleep from two sources is counted once and lands on the day the
  sleep ended; the app's own workouts are not external workouts; a day with no readings has no
  measurement fields; every produced day validates against the health-day schema (property test).
- **Verify:** `npx jest src/health/build-health-days`
- **Blocked-by:** Slice 1.

### Slice 3 — Fake store and both adapters
- **Files:** `src/health/fake-store.ts`, `src/health/healthkit-store.ts`,
  `src/health/health-connect-store.ts`, `src/health/store.ts`, `src/health/store.ios.ts`,
  `src/health/store.android.ts`, tests with the libraries mocked.
- **Acceptance:** each adapter requests exactly the read and write types this build uses; reports
  `unavailable` when the health store is missing; maps a denied or failed call to a result, never
  an unhandled rejection; `writeWorkout` returns the record id and `deleteWorkout` removes it.
- **Verify:** `npx jest src/health`
- **Blocked-by:** Slice 2.

### Slice 4 — Sign-in
- **Files:** `src/lib/secure-storage.ts`, `src/lib/supabase.ts`, `src/auth/*`, `src/app/sign-in.tsx`, tests.
- **Acceptance:** entering an email sends a one-time code; entering the code signs in; a wrong
  code shows an error and stays on the screen; a signed-out user is always routed to sign-in.
- **Verify:** `npx jest src/auth src/lib` and the Maestro sign-in flow against local Supabase.
- **Blocked-by:** Slice 1.

### Slice 5 — Onboarding with profile from Health
- **Files:** `src/profile/*`, `src/app/onboarding.tsx`, tests.
- **Acceptance:** with Health connected, weight and age range found there are shown as
  suggestions and saved only after the user confirms; skipping Health leaves an ordinary form;
  invalid values (weight 0, minutes 0 or above 120) cannot be saved; the saved row matches the
  `profiles` table constraints.
- **Verify:** `npx jest src/profile` and the Maestro onboarding flow.
- **Blocked-by:** Slices 3, 4.

### Slice 6 — Health settings
- **Files:** `src/health/HealthProvider.tsx`, `src/app/(tabs)/*`, `src/app/settings/health.tsx`, tests.
- **Acceptance:** the screen shows unavailable / not connected / connected; connect asks for
  permissions once; a denied request is explained with a way to open the system settings and is
  not asked again on every launch; disconnect stops reads and says how to revoke access in the
  system; today's totals are shown when connected.
- **Verify:** `npx jest src/health/HealthProvider src/app` and Maestro flows on both platforms.
- **Blocked-by:** Slice 3.

## Order

1 → 2 → 3, 4 in either order → 5 → 6 → builds and Maestro on both platforms → independent
review → commit.
