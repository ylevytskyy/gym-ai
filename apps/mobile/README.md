# Aura Fit mobile app (apps/mobile)

Expo SDK 58 (React Native 0.88), TypeScript, expo-router. The app needs a development build:
HealthKit and Health Connect are native modules and do not run in Expo Go.

## What exists

- Sign-in with a one-time code sent by email (Supabase Auth).
- Onboarding: the profile form, with weight and age range offered from the health store.
- Health tab: connect, disconnect, today's totals.
- `src/health/`: one `HealthStore` interface with a HealthKit adapter (iOS), a Health Connect
  adapter (Android) and a fake for tests.

The plan, the workout player, sync of health days to the server, chat and history are not built
yet (see `.kiro/specs/health-integration/spec.md`, milestones 3 to 6).

## Run it

```bash
# 1. the shared health rules are a local dependency and must be built first
(cd ../../packages/health-core && npm install && npm run build)

# 2. install
npm install

# 3. configure: copy and fill in the Supabase URL and publishable key
cp .env.example .env

# 4. build and install a development build (first run takes several minutes)
npm run ios        # iOS Simulator
npm run android    # Android emulator, API 34 or newer has Health Connect built in

# 5. later runs only need the dev server
npm start
```

Sign-in sends a code by email. The Supabase project's "Magic Link" and "Confirm signup" email
templates must contain `{{ .Token }}`, otherwise the email holds only a link and there is no
code to type.

## Checks

```bash
npm test            # jest: unit and component tests
npm run typecheck
npx eslint .
```

Tests read `packages/health-core` from source (`jest.resolver.js`). The running app loads its
built `dist/`, so rebuild it after changing the rules.

## End-to-end flows

Maestro flows in `e2e/` drive a development build that is already connected to Metro, against a
local Supabase (`supabase start`). They work on the iOS Simulator and the Android emulator.

```bash
maestro test -e EMAIL=someone@example.com e2e/sign-in.yaml   # from the sign-in screen
maestro test e2e/onboarding.yaml                             # from the onboarding screen
```

`e2e/latest-code.js` reads the sign-in code from the local mailbox (Mailpit, port 54324). The
system permission screens of Apple Health and Health Connect are not scripted: their text is
localised and their layout changes between OS versions.

`aurafit://dev-health` opens a developer screen that reads the last two health days and writes
and deletes a test workout. It only works when `EXPO_PUBLIC_APP_ENV=local`; an unset value means
production.

## Verified, and not

Run on 2026-11-12 on an iPhone 18 Pro simulator (iOS 27) and an Android 16 emulator, against a
local Supabase:

- Sign-in with a code, session kept across restarts, sign-out.
- Onboarding saves the profile row; weight and date of birth entered in Apple Health are offered
  and applied only when accepted.
- The system permission request appears with the expected data types on both platforms.
- A workout written to the health store shows up in the day's active energy, is not counted as
  an external workout, and is gone (with its energy) after deletion.
- Signing out turns Health off for the next person on the phone.

Not verified: reading steps, sleep, resting heart rate and other apps' workouts from real data
(the simulators hold none), anything on a physical phone, and the hosted Supabase project.

## Health data

| | iOS (HealthKit) | Android (Health Connect) |
|---|---|---|
| Reads | steps, active energy, resting heart rate, sleep, weight, workouts, date of birth | steps, active energy, resting heart rate, sleep, weight, exercise sessions |
| Writes | workouts, active energy | exercise sessions, active energy |
| Declared in | `app.config.ts` usage descriptions | `app.config.ts` `android.permissions` |
| Requested in | `src/health/healthkit-store.ts` | `src/health/health-connect-store.ts` |

Change those places together. Rules the code keeps:

- Screens use `useHealth()` / `HealthController`; they never import a health library.
- Nothing is read or written until the user connects in the app, and nothing after they
  disconnect or sign out. The one exception is deleting a workout the app wrote earlier.
- A missing measurement is "no data", never zero.
- Values from Health are offered in the profile form; they are saved only when the user accepts
  them and submits.
- HealthKit never tells an app which reads were allowed. A denied type reads as no data.
- Health Connect permissions cannot be given back by the app without a restart, so disconnect is
  the app's own setting and the user is pointed to Health Connect to revoke access.
