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

QC pass on the 32 wired renders (2026-05-06): **14 OK / 18 broken** (11 wrong-position, 4 wrong-motion, 1 static, 2 unclear). Fix in Blender, re-render, replace in place.

The dominant failure mode (11/18) is **wrong starting pose** — supine/prone/quadruped exercises rendered as standing-upright. These specs need a setup phase that translates the character into the right starting orientation (rotate hips, set ankles to floor contact, place hands/elbows on ground) before any per-cycle keyframes — not an axis-discovery problem.

The 4 wrong-motion entries are the kind for which the "Diagnosing a wrong-axis problem" recipe in the Blender skill applies: small range or wrong-joint-angle, fixable by introspecting the joint and verifying axis/sign.

### ⚠️ wrong-position (11)

| Exercise | Observation |
|---|---|
| `cat-cow` | Kneeling/sitting upright; should be on all-fours arching/rounding spine |
| `dead-bug` | Quadruped crawl (looks like bird-dog); should be supine with limbs in tabletop |
| `diamond-push-ups` | Standing with arms bent at chest; should be prone push-up with diamond hands |
| `downward-dog` | Standing upright with arm motion; never reaches inverted-V |
| `flutter-kicks` | Prone (face down), nearly static; should be supine with alternating kicks |
| `glute-bridges` | Standing upright; should be supine with hips lifting |
| `knee-push-ups` | Identical to standard push-up; knees should be on floor |
| `pike-push-ups` | Standing arms overhead; should be inverted-V lowering head to floor |
| `plank-jacks` | Standing/jogging with arms at chest; should be plank with jumping feet |
| `scissor-kicks` | Prone, nearly static; should be supine with legs crossing |
| `side-plank` | Standing upright, static; should be lateral ground position |

### ⚠️ wrong-motion (4)

| Exercise | Observation |
|---|---|
| `calf-raises` | Flat-footed throughout; no plantar flexion / heel-rise |
| `hollow-hold` | Bent-knee crunch motion; should be straight-leg banana hold (arms overhead, legs extended/elevated) |
| `lunge-jumps` | Legs stay close, shallow knee bend; no split-stance lunge or jump |
| `quad-stretch` | Standing without ankle grab; foot never pulled toward buttock |

### ⚠️ static (1)

| Exercise | Observation |
|---|---|
| `hamstring-stretch` | Stands nearly motionless across the cycle; no forward fold or reach toward foot |

### ❓ unclear — needs human eyes (2)

| Exercise | Observation |
|---|---|
| `leg-raises` | Frame-to-frame pose is incoherent (standing → crouched → sitting → supine); supine frame looks right but loop is broken — phase boundaries probably snap rather than interpolate |
| `side-lunges` | Lateral motion present but depth too shallow to confirm proper side lunge vs. walking |

### ✅ OK (14)

`bicycle-crunches`, `bird-dog`, `bodyweight-squats`, `burpees`, `butt-kicks`, `forearm-plank`, `high-knees`, `inchworms`, `jumping-jacks`, `mountain-climbers`, `plank-shoulder-taps`, `reverse-lunges`, `shadow-boxing`, `standard-push-ups`

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
