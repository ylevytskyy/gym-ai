# Health integration — plan for milestone 5 (sitting nudges)

Goal: with nudges turned on, the phone offers a two-minute desk break after an hour with few
steps, inside the user's active hours, also while the app is closed. The same background wake
also syncs health days.

Spec: [spec.md](spec.md). Written 2026-11-13.

## How a nudge reaches a closed app

A local notification cannot run code when it fires, and neither platform wakes an app because
nothing happened. So the app does not wait for a sedentary hour and then notify. Each time it
runs (foreground, a HealthKit step delivery, the periodic background task) it works out **when
the last hour will have had too few steps if the user does not move again**, and schedules the
notification for that moment. New steps wake the app, and the schedule is moved.

Consequences, accepted and stated to the user:

- iOS delivers step changes to a background app at most hourly, and the periodic task runs
  when the system decides (Android: no sooner than every 15 minutes; Android has no step
  delivery at all). A nudge can therefore arrive although the user walked in the minutes
  before it. It can not arrive outside active hours, more than the daily limit, or closer
  together than the gap, because those are fixed when it is scheduled.
- Nudges are planned for the rest of the current day only.
- No step reading in the last 24 hours means "unknown", never "sitting": no nudge is planned.
  This also covers a user who denied step access on iOS, where a denied read looks empty.

## Global constraints

- The decision stays deterministic and in `packages/health-core`; every planned time must
  satisfy the existing `nudgeDue` rule (property test).
- Nudges are off until the user turns them on; turning them on asks for notification
  permission then, not earlier.
- Local notifications only. Nudge settings and history stay on the phone.
- Background work never throws and never syncs a read in which something failed.
- New permissions (flagged for the user's approval): notifications on both platforms,
  HealthKit background delivery, Health Connect background read, background task modes.

## Seam

- Rule: `packages/health-core` tested directly.
- App: `createNudgeController` and `backgroundRefresh` with a fake health store, a fake
  notifier and in-memory preferences; adapters with a fake library; screens through the harness.
- Device: iOS Simulator (steps entered in the Health app) and Android emulator (notification
  delivery and the break; the emulator has no way to enter steps).

## Slices

### Slice 1 — Planning rule

- **Files:** `packages/health-core/src/nudge.ts`, `tests/nudge-plan.test.ts`, `src/index.ts`.
- **Produces:** `planNudges({ now, tz, settings, recentSteps, sent, notBefore? }): Date[]`
  where `recentSteps` is `{ end: Date; steps: number }[] | null` (null = unknown).
- **Acceptance:**
  - Given 400 steps 40 minutes ago and none since, then the first nudge is 20 minutes from now.
  - Given unknown steps, nudges off, the weekend, or the daily limit reached, then nothing.
  - Given a time before active hours, then the first nudge is at their start; none at or after
    their end.
  - Property: every planned time passes `nudgeDue` with the steps then in the last hour and
    the nudges before it as sent.
- **Verify:** `cd packages/health-core && npx vitest run`

### Slice 2 — Recent steps and background delivery in the health store

- **Files:** `apps/mobile/src/health/types.ts`, `healthkit-store.ts`, `health-connect-store.ts`,
  `fake-store.ts`, `store.ts`, `controller.ts` and their tests.
- **Produces:** `HealthStore.readRecentSteps(now)` → five-minute step totals of the last hour,
  or null when unknown; `setBackground(on)`; `watchSteps(handler)`.
- **Acceptance:** steps in the last hour come back as totals with their end times; no steps in
  24 hours, a failed read or a missing permission gives null; iOS turns hourly step delivery on
  and off; Android asks for background read; not connected gives null.
- **Verify:** `cd apps/mobile && npx jest src/health`

### Slice 3 — Nudge controller, settings and notifications

- **Files:** `apps/mobile/src/nudges/controller.ts`, `notifier.ts`, `expo-notifier.ts`,
  `desk-break.ts`, tests; `services.tsx`, `real-services.ts`, `testing/harness.tsx`.
- **Produces:** `createNudgeController(...)` with `settings()`, `save()`, `turnOn()`,
  `turnOff()`, `refresh()`, `hold()`, `moved()`; `deskBreak(injuries, seed)`.
- **Acceptance:** turning on asks for notification permission and schedules; a refusal leaves
  nudges off; a refresh replaces what was scheduled and counts passed ones as sent; turning
  off or disconnecting Health cancels everything; a break has only quiet, level-1 warm-up
  exercises that are safe for the user's injuries.
- **Verify:** `cd apps/mobile && npx jest src/nudges`

### Slice 4 — Screens

- **Files:** `src/screens/HealthSettingsScreen.tsx` (+ test), `src/screens/PlayerScreen.tsx`
  (+ test), `src/app/break.tsx`, `src/app/_layout.tsx`, `src/nudges/NudgeProvider.tsx`.
- **Acceptance:** the Health screen shows a break-reminder card when connected, with on/off,
  active hours, weekdays only and the next reminder time; tapping a nudge opens the break; the
  break plays and ends without saving a log; a workout in the player holds nudges and counts
  as moving.
- **Verify:** `cd apps/mobile && npx jest src/screens`

### Slice 5 — Background refresh

- **Files:** `src/background/refresh.ts` (+ test), `src/background/task.ts`, `app.config.ts`.
- **Produces:** `backgroundRefresh(services)`: replans nudges, then syncs health days when a
  session exists and the read was complete.
- **Acceptance:** signed out → nudges replanned, nothing synced; incomplete read → nothing
  synced; any failure → resolves, never throws.
- **Verify:** `cd apps/mobile && npx jest src/background`

## Order

1 → 2 → 3 → 4 and 5, then full checks, simulator runs, independent review.

## Not provable here

Definition-of-done item 7 (a nudge arriving on a physical iPhone with the app in the
background) needs the phone; the iOS Simulator does not run background tasks.

## Outcome (2026-11-13)

Built as planned, with these additions from the independent review:

- A workout or break holds nudges until it ends (at most two hours), so nothing is planned in
  the middle of one; a session that was opened but not started changes nothing.
- A nudge whose time has passed may still be on its way (phones show them late). It counts as
  sent and is no longer cancelled when the plan changes.
- A step delivery only refreshes in the background when the app is not open, and deliveries
  that arrive during a refresh are folded into it.
- Changing the hours drops what was planned under the old ones, also when steps cannot be read.
- The start of active hours is right on the days the clocks change.
- Steps are read on a fixed five-minute grid, so the planned time does not drift between reads.

Left as it is: the periodic task and step delivery are untested by automated tests
(`src/background/task.ts` is native wiring) and unproven on a device.
