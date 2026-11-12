# Health integration — plan for milestone 3 (today and player)

Goal: a signed-in person sees the day to do from their plan, plays it set by set with a demo
video, and saving the session creates one workout log and, when Health is connected, one
workout in the health store that the log points to.

Spec: [spec.md](spec.md). Earlier: [plan.md](plan.md), [plan-milestone-2.md](plan-milestone-2.md).

## Decisions

- The app never makes or checks plans; it asks the assistant service (`POST /api/plans/generate`)
  and reads the stored plan. It only verifies that a loaded plan can be walked.
- Days are done in order and the plan repeats. A session finished today keeps that day on
  screen as done until local midnight.
- The session is a pure state machine (`src/player/session.ts`); the screen feeds it clock
  time, so a late tick or time in the background is accounted for.
- The log is saved first and is the record; the health store gets a copy. The app chooses the
  log's id once per session, so saving twice cannot create two rows, and the health write only
  happens right after this call saved the log. If the link cannot be stored, the health record
  is removed again.
- Energy is MET × body weight × time actually spent working, per exercise; rest is not counted.
- Demo videos are the Blender loops, published to the `exercise-media` bucket by
  `pipelines/blender/publish.py` under the file names the catalog uses.
- Not in this milestone: adjusting the session to readiness (milestone 4), retrying a health
  write later, editing or deleting a saved workout.

## Slices

| Slice | Files | Verify |
|---|---|---|
| Catalog and plan model | `src/catalog/catalog.ts`, `src/plan/model.ts` | `npx jest src/plan/model` |
| Session state machine | `src/player/session.ts` | `npx jest src/player` |
| Plan storage and generation client | `src/plan/repository.ts`, `PlanProvider.tsx` | `npx jest src/plan/repository` |
| Finish: log, health write, link | `src/plan/finish-workout.ts` | `npx jest src/plan/finish-workout` |
| Today and player screens | `src/screens/{TodayScreen,PlayerScreen}.tsx`, `src/ui/VideoDemo.tsx` | `npx jest src/screens/PlayerScreen`, `maestro test e2e/workout.yaml` on both platforms |
| Publishing the demo videos | `pipelines/blender/publish.py` | run against local Supabase; `curl` a public URL |

Device tiers: everything in this milestone runs on the iOS Simulator and the Android emulator.
