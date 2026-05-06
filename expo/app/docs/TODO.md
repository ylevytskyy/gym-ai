# Follow-ups

Outstanding items from the `feat/exercise-video-detail-screen` work and adjacent.

## Migrate remaining surfaces off the step-PNG pipeline

The exercise detail screen now uses Blender video renders + a body-part-bucket placeholder. Four other surfaces still consume the legacy step-PNG pipeline:

- `src/components/ExerciseImageThumbnail.tsx` — used by exercise list (`app/(tabs)/exercises.tsx`) and runner (`app/workout/[sessionId].tsx`).
- `src/components/ExerciseImageCarousel.tsx` — used by runner during the work step.
- `src/components/SessionCard.tsx` and `src/components/UpNextCard.tsx` — dashboard cards; each gates a thumbnail with `getExerciseImages(...).hasImages`.

Once those four surfaces are migrated to videos / video stills / placeholders, delete:

- `src/lib/exerciseImages.ts`
- `src/lib/exerciseImageMap.ts`
- `assets/data/exercise-images.json`
- `assets/images/exercises/` (entire tree)
- `scripts/exercise-images/`
- `scripts/split-exercise-images.py`
- `scripts/generate-image-prompts.ts`

Needs its own brainstorm — the visual answer is different at thumbnail size (~48–80px) than at the detail-screen 220×220 card.

## Render the remaining ~43 exercises

`assets/exercise-renders/` has 32 MP4s for 75 catalog exercises. Drop new MP4s into the directory (filename = catalog id, snake_case or kebab-case) and `pnpm sync-videos` picks them up. The auto-discovery script fails loud on slug mismatches and on duplicate slugs.

## QC pass on existing renders

Earlier sessions flagged several renders with wrong motion or wrong starting position. Identify, fix in Blender, re-render, replace the file in place.

## `ExercisePlaceholder` accessibility

Component currently has no accessibility opt-out, so screen readers will announce the Ionicon's internal name. Spec marked the placeholder as decorative (the surrounding screen already has the exercise name and body-part chips). Two-line fix on `src/components/ExercisePlaceholder.tsx`:

```tsx
<View
  accessible={false}
  importantForAccessibility="no-hide-descendants"
  ...
>
```

## Spec drift

`docs/superpowers/specs/2026-05-06-video-first-exercise-detail-design.md` names the sync script `sync-exercise-videos.mjs`; the implementation uses `sync-exercise-videos.ts` via `npx tsx` (matches the `validate-locales.ts` convention). The spec is stale on that one line. Either update the spec or treat it as historical record.
