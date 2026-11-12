# Health integration — plan for milestone 4 (sync and adaptation)

Goal: while Health is connected, the server holds the user's recent health days, and today's
session on the phone is adjusted to last night's sleep and to workouts already done today,
with the reason shown.

Spec: [spec.md](spec.md). Earlier: [plan.md](plan.md), [plan-milestone-2.md](plan-milestone-2.md),
[plan-milestone-3.md](plan-milestone-3.md).

## Decisions

- One read feeds both: `HealthProvider` reads today and the 14 days before it when connected.
  Those days are what readiness is computed from on the phone and what is synced.
- Sync replaces the row of each day and writes NULL for a measurement that is no longer there.
  It runs when the app starts, comes to the foreground, or the user connects; it is never
  awaited and never throws. Identical days are not sent twice in one app run.
- Nothing is synced or adjusted when Health is off, after disconnect, or after sign-out.
- The adjustment is computed on the phone with `packages/health-core` (`readiness`,
  `adjustDay`); the stored plan is not changed and the log keeps the planned day number.
  The player runs the same adjusted session Today showed.
- The reason is one sentence about training ("you slept less than 6 hours"), followed by a
  line saying it is a suggestion, not medical advice.
- Not in this milestone: sync while the app is closed (it comes with background delivery in
  milestone 5), deleting synced health data (milestone 6).

## Slices

| Slice | Files | Verify |
|---|---|---|
| Sync | `src/health/sync.ts`, `HealthProvider.tsx` | `npx jest src/health/sync`; rows in `health_days` on both platforms |
| Adjusted session | `src/plan/adjusted-today.ts` | `npx jest src/plan/adjusted-today` |
| Today and player | `src/screens/{TodayScreen,PlayerScreen}.tsx` | `npx jest src/screens/PlayerScreen` |

Device tiers: sync runs on the iOS Simulator and Android emulator. An adjusted session needs
sleep or other apps' workouts in the health store, which the simulators do not have; that part
is covered by tests only until it can be checked on the physical iPhone.
