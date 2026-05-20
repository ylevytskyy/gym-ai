# Video-first exercise detail screen

**Date:** 2026-05-06
**Branch:** `feat/exercise-video-detail-screen`
**Status:** Design approved, ready for implementation plan.

## Goal

The exercise detail screen (`app/exercises/[id].tsx`) shows a Blender-rendered MP4 when one exists for the exercise; otherwise a body-part-bucketed icon placeholder occupying the same 220×220 footprint. The legacy step-PNG slideshow (`ExerciseImagePlayer`) is removed entirely.

## Context

- Catalog has 75 exercises (`assets/data/exercises.json`).
- New Blender renders live in `assets/exercise-renders/*.mp4`. Currently 32 are on disk, 12 are wired into the hand-edited `src/lib/exerciseVideoMap.ts`.
- Older step-PNG sets exist for ~9 exercises in `assets/images/exercises/<slug>/step-*.png`, played by `src/components/ExerciseImagePlayer.tsx`.
- The detail screen branches today: `if (videoSource) <ExerciseVideoPlayer/> else <ExerciseImagePlayer/>` (`app/exercises/[id].tsx:75-81`).
- The runner (`app/workout/[sessionId].tsx:421`) also calls `getExerciseVideo`; widening the map benefits it for free, but the runner has no placeholder branch and we're not adding one here.

## Decisions (from brainstorming)

1. **Replace step-PNGs with videos for every exercise.** No retain of the slideshow.
2. **Coverage gap = placeholder.** Exercises without a rendered MP4 show a neutral, layout-stable placeholder. No "block on 75/75 renders" gate.
3. **Auto-discover videos** from `assets/exercise-renders/`. The map becomes generated, not hand-edited. Bad renders don't go in the folder; presence on disk = trusted.
4. **Placeholder = body-part bucket icon** in the same 220×220 card as the video player.

## Architecture

### Files added

- `scripts/sync-exercise-videos.mjs` — Node script that scans `assets/exercise-renders/`, validates slugs against the catalog, and emits `src/lib/exerciseVideoMap.generated.ts`.
- `src/lib/exerciseVideoMap.generated.ts` — auto-generated `Record<string, number>` of `require()` calls and a `getExerciseVideoSource(id)` accessor. Same shape as today's hand-written file. Committed to git (matches the convention used by `src/lib/prompt-template.generated.ts`).
- `src/components/ExercisePlaceholder.tsx` — new component, 220×220 square, body-part-bucket icon centered on `theme.colors.surfaceAlt` with `theme.radius.lg`.

### Files modified

- `package.json` — add `"sync-videos": "node scripts/sync-exercise-videos.mjs"`. Chain into `prestart` between `sync-data` and `validate-locales`.
- `src/lib/exerciseVideos.ts` — change the import from `./exerciseVideoMap` to `./exerciseVideoMap.generated`. Public API unchanged.
- `app/exercises/[id].tsx` — drop `ExerciseImagePlayer` import; swap the else branch from `<ExerciseImagePlayer exerciseId={exercise.id} />` to `<ExercisePlaceholder bodyParts={exercise.body_parts} />`.

### Files deleted

- `src/components/ExerciseImagePlayer.tsx` — no other callers (verified via grep).
- `src/lib/exerciseVideoMap.ts` — replaced by the generated file.
- `assets/images/exercises/` (entire directory tree, ~9 exercises × step-PNGs).
- `scripts/exercise-images/` (`pose-details.json`, `layouts.json` — input data for the deleted player).

## Component contracts

### `ExercisePlaceholder`

```ts
interface ExercisePlaceholderProps {
  bodyParts: string[];   // pass exercise.body_parts directly
  size?: number;         // default 220
}
```

- Background: `theme.colors.surfaceAlt`, `theme.radius.lg`, `overflow: hidden`.
- Centered Ionicon, ~64px, `theme.colors.textMuted`.
- Bucket selection: `body_parts[0]` → bucket → icon. Unknown body part → `fitness-outline`.

### Body-part → bucket → icon map

| Bucket | Body parts | Ionicon |
|---|---|---|
| `legs` | `calves`, `glutes`, `hamstrings`, `hip_flexors`, `hips`, `inner_thighs`, `quads`, `ankles` | `walk-outline` |
| `core` | `abs`, `core`, `obliques`, `lower_back` | `body-outline` |
| `upper` | `chest`, `shoulders`, `triceps`, `upper_back`, `forearms`, `wrists` | `barbell-outline` |
| `full_body` | `full_body` | `fitness-outline` |
| `mobility` | `neck`, `eyes` | `accessibility-outline` |

The 21 catalog body-part values are bucketed; default fallback is `fitness-outline`.

### `sync-exercise-videos.mjs`

1. Read all `.mp4` filenames from `assets/exercise-renders/`.
2. For each filename, derive `slug = basename.replace(/\.mp4$/, '').replace(/_/g, '-')`. Example: `bicycle_crunches.mp4` → `bicycle-crunches`.
3. Load `assets/data/exercises.json`, build a `Set` of valid IDs.
4. For each derived slug not in the set: log the unmatched filename and exit non-zero. (A bad slug = a typo or a stale render; we want to catch it before it ships.)
5. Emit `src/lib/exerciseVideoMap.generated.ts` with:
   - A header banner indicating it's generated and naming the script.
   - A `Record<string, number>` of `require('../../assets/exercise-renders/<filename>.mp4')` entries, keyed by slug, sorted alphabetically by slug for stable diffs.
   - The same `getExerciseVideoSource(id: string): number | undefined` export currently in `exerciseVideoMap.ts`.

The script runs as part of `prestart` so any new MP4 dropped in the folder is wired by the next `pnpm start`.

## Data flow

```
assets/exercise-renders/*.mp4
        │
        ▼  (prestart → sync-exercise-videos.mjs)
src/lib/exerciseVideoMap.generated.ts
        │
        ▼  (re-exported)
src/lib/exerciseVideos.ts → getExerciseVideo(id)
        │
        ├──► app/exercises/[id].tsx (detail screen)
        │       ├─ video found  → <ExerciseVideoPlayer source={...} />
        │       └─ no video     → <ExercisePlaceholder bodyParts={...} />
        │
        └──► app/workout/[sessionId].tsx (runner; unchanged behavior)
```

## Verification (manual; no test runner in this workspace)

1. `pnpm sync-videos` → file exists at `src/lib/exerciseVideoMap.generated.ts`, has ~32 entries, every slug matches a catalog ID.
2. `pnpm typecheck` passes (no dangling `ExerciseImagePlayer` import).
3. `pnpm lint` passes.
4. `pnpm start`, then on iOS sim, open the Exercises tab and verify:
   - **Video path:** *Bodyweight squats* → animation loops in 220×220 card.
   - **Placeholder path:** *Ankle circles* → `walk-outline` icon centered on 220×220 card; layout matches the video card exactly.
   - **Bucket coverage:** *Diamond pushups* → `barbell-outline`; *Hollow hold* → `body-outline`; *Burpees* → `fitness-outline`.
5. **Runner sanity:** start a session containing a freshly-wired exercise (e.g. *Burpees*) → its video plays during the work step. Confirms the runner picked up the auto-generated map without code changes.

## Out of scope

- Rendering the missing ~43 exercises (render-pipeline task, tracked separately).
- Re-evaluating QC issues on existing renders (wrong-motion / wrong-position) — same. The script trusts whatever is on disk.
- Workout-runner placeholder polish — the runner currently renders nothing if `getExerciseVideo` returns `undefined`. We are not changing that here; it can be a follow-up if visual gaps in the runner become an issue.
- Localized icon labels / accessibility text on the placeholder — the surrounding screen already shows the exercise name and body-part chips, so the placeholder itself is decorative.

## Risks

- **Stale unwired MP4s:** if a render is on disk but you don't trust it yet, you must remove it from `assets/exercise-renders/` (or it ships). No opt-out list in code by design.
- **Slug mismatches:** the sync script fails loudly. This is a feature — silent skip would let renamed exercises silently lose their video.
- **Catalog drift:** if `exercises.json` adds a new body-part value, the placeholder falls back to `fitness-outline`. Acceptable; bucket map can be updated in the same PR that adds the value.
