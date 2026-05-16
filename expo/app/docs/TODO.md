# Follow-ups

Outstanding items from the `feat/exercise-video-detail-screen` work and adjacent. Tick boxes as items complete; move stale items down rather than deleting them so we keep an audit trail.

## Fix broken exercise renders (18 of 32)

QC pass 2026-05-06: 14 OK, 18 broken. Fix in Blender, re-render, drop the MP4 into `assets/exercise-renders/` (`pnpm sync-videos` picks it up; the auto-discovery script fails loud on slug mismatches).

### Wrong starting pose (11)

The dominant failure mode. Specs need a setup phase that translates the character into the correct starting orientation (rotate hips, set ankles to floor contact, place hands/elbows on ground) before any per-cycle keyframes. **Not an axis-discovery problem** — don't reach for `inspect_rig.py` first.

- [x] `cat-cow` — should render kneeling on all-fours, arching and rounding the spine. Currently renders kneeling/sitting upright. **Fixed 2026-05-06 (v3):** procedural spec at `scripts/exercise_specs/cat_cow.py`; 3 cycles + return-to-tabletop = 34.5 s, side-profile camera, 83 validators including a planted-points contract (hands & knees Z ∈ [-0.02, +0.05] m). Hands stay on the floor across the whole cycle (cow Z = 0.049 m, cat Z = 0.000 m). Loop is seamless: framework patch in `keyframe_emitter.py` makes frame 0 hold the first phase's pose instead of T-pose, so the MP4 starts in tabletop. A `return_to_setup` phase at the end closes the loop in the same pose. Cow lumbar arch was reduced from −22° to −13° (still inside the research range): the FK three-bone arm chain (Shoulder + Arm + ForeArm) cannot keep wrists planted at deeper extension; deeper arch would require an IK wrist target.
- [x] `dead-bug` — should render supine with limbs in tabletop, alternating opposite arm + leg extensions. Currently renders as a quadruped crawl (looks like bird-dog). **Fixed 2026-05-16:** procedural spec at `scripts/exercise_specs/dead_bug.py`; supine setup via `Hips X=-90° + loc_Y=-0.95 m` (chest faces up, back on floor at Z≈0.09 m), tabletop limbs (hip/knee 90/90, arms vertical via LeftArm Z=+90 / RightArm Z=-90). One full cycle = 15.2 s @ 30 fps, side-profile camera: 0.2 s settle → 3 s eccentric → 1 s peak hold → 3 s concentric → 0.5 s reset, both sides. Right arm + left leg first (teaching convention). Extension axes: legs use UpLeg X=+10°/Leg X=0 (hip near-extension, knee straight); arms use X=-90 (around local X = ±Y world for L/R) — initial Y=±90 attempt was wrong because Y is the bone-length twist axis for arm bones. 36/36 validators pass; `dead_bug.mp4` (760 KB) shipped. Pattern reusable for the rest of the supine cluster (glute-bridges, flutter-kicks, scissor-kicks).
- [ ] `diamond-push-ups` — should render prone push-up with diamond hand position. Currently standing with arms bent at chest.
- [x] `downward-dog` — should reach inverted-V floor position. Currently standing upright with arm motion only. **Fixed 2026-05-16:** procedural spec at `scripts/exercise_specs/downward_dog.py`; inverted-V hold @ 7 s, 30 fps, side-profile camera. Hips X=+90° folds the torso forward; spine adds 3×20° = 60° forward bend to deepen the arch. 4 IK pins (both hands + both feet) with per-bone `chain_count` keep hands and feet planted. 13/13 validators pass; `downward_dog.mp4` (200 KB) shipped.
- [ ] `flutter-kicks` — should render supine with alternating leg kicks. Currently prone (face down), nearly static.
- [ ] `glute-bridges` — should render supine with knees bent and hips lifting. Currently standing upright.
- [ ] `knee-push-ups` — should render with knees on floor (the differentiator from standard push-up). Currently identical to `standard-push-ups`.
- [x] `pike-push-ups` — should render inverted-V lowering head toward floor. Currently standing with arms overhead. **Fixed 2026-05-16:** procedural spec at `scripts/exercise_specs/pike_push_ups.py`; inverted-V pike with rhythmic elbow flex lowering head toward floor, 3 reps @ 30 fps, 13.7 s. Builds on the `downward_dog` setup (Hips X=+90°, spine bend, 4 IK pins with per-bone `chain_count`). Final elbow flex is ~130° rather than textbook 90° — deeper hip drop forced an unsolvable IK on bent legs (every config broke something different). Reverted to a ~5 cm hip drop with DD's known-working pin geometry; `pike_push_ups.mp4` (637 KB) shipped. Library extension landed: `apply_ik_pins` now accepts optional `pole_targets`/`pole_angles` for future bent-limb specs. See feedback memories `feedback_blender_ik_pole_targets.md` and `feedback_blender_pose_constraints_first.md`.
- [ ] `plank-jacks` — should render plank with feet jumping wide/close. Currently standing/jogging with arms at chest.
- [ ] `scissor-kicks` — should render supine with legs crossing alternately. Currently prone, nearly static.
- [ ] `side-plank` — should render lateral ground position propped on one forearm. Currently standing upright, static.

### Wrong motion (4)

These are the kind of failure the "Diagnosing a wrong-axis problem" recipe in the Blender skill is for: small range or wrong joint angle, fixable by introspecting the joint and verifying the axis/sign.

- [ ] `calf-raises` — add plantar flexion (heel-rise) on the cycle. Currently flat-footed throughout.
- [ ] `hollow-hold` — switch to a straight-leg banana hold (arms overhead, legs extended and elevated). Currently a bent-knee crunch motion.
- [ ] `lunge-jumps` — deepen knee bend and add split-stance jump. Currently legs stay close with shallow knee bend.
- [ ] `quad-stretch` — pull foot up toward buttock with hand grab. Currently standing without an ankle grab.

### Static (1)

- [ ] `hamstring-stretch` — add forward fold reaching toward foot. Currently nearly motionless across the cycle.

### Unclear — needs human eyes (2)

- [ ] `leg-raises` — investigate. Frame-to-frame pose is incoherent (standing → crouched → sitting → supine); supine frame looks right but loop is broken. Phase boundaries probably snap rather than interpolate.
- [ ] `side-lunges` — confirm or deepen. Lateral motion is present but depth is too shallow to distinguish from walking.

### ✅ OK — no action (14)

`bicycle-crunches`, `bird-dog`, `bodyweight-squats`, `burpees`, `butt-kicks`, `forearm-plank`, `high-knees`, `inchworms`, `jumping-jacks`, `mountain-climbers`, `plank-shoulder-taps`, `reverse-lunges`, `shadow-boxing`, `standard-push-ups`.

## Render the remaining ~43 exercises

`assets/exercise-renders/` has 32 MP4s for 75 catalog exercises. Find the unrendered list with `comm -23 <(jq -r '.exercises[].id' assets/data/exercises.json | sort) <(ls assets/exercise-renders/*.mp4 | xargs -n1 basename | sed 's/\.mp4$//' | tr '_' '-' | sort)`.

- [ ] Triage the 43 unrendered exercises into priority order (cardio + most-used first; rare stretches last).
- [ ] Render each one. Drop into `assets/exercise-renders/`; filename = catalog id (snake_case or kebab-case both work).

## Migrate remaining surfaces off the step-PNG pipeline

The exercise detail screen now uses Blender video renders + a body-part-bucket placeholder. Four other surfaces still consume the legacy step-PNG pipeline:

- `src/components/ExerciseImageThumbnail.tsx` — exercise list (`app/(tabs)/exercises.tsx`) and runner (`app/workout/[sessionId].tsx`).
- `src/components/ExerciseImageCarousel.tsx` — runner during the work step.
- `src/components/SessionCard.tsx` and `src/components/UpNextCard.tsx` — dashboard cards (each gates a thumbnail with `getExerciseImages(...).hasImages`).

Needs its own brainstorm — the visual answer is different at thumbnail size (~48–80px) than at the detail-screen 220×220 card.

- [ ] Brainstorm the thumbnail/carousel visual answer (tiny video preview vs poster frame vs placeholder icon at small size).
- [ ] Migrate `ExerciseImageThumbnail` (list + runner).
- [ ] Migrate `ExerciseImageCarousel` (runner work step).
- [ ] Migrate `SessionCard` and `UpNextCard` (dashboard).
- [ ] Once all four are migrated, delete the dead pipeline:
  - [ ] `src/lib/exerciseImages.ts`
  - [ ] `src/lib/exerciseImageMap.ts`
  - [ ] `assets/data/exercise-images.json`
  - [ ] `assets/images/exercises/` (entire tree)
  - [ ] `scripts/exercise-images/`
  - [ ] `scripts/split-exercise-images.py`
  - [ ] `scripts/generate-image-prompts.ts`

## Smaller follow-ups

- [ ] **`ExercisePlaceholder` accessibility** — add `accessible={false}` and `importantForAccessibility="no-hide-descendants"` on the root `<View>` in `src/components/ExercisePlaceholder.tsx`. Currently screen readers announce the Ionicon's internal name. Spec marked the placeholder as decorative (the surrounding screen already shows the exercise name and body-part chips).
- [ ] **Spec drift** — `docs/superpowers/specs/2026-05-06-video-first-exercise-detail-design.md` names the sync script `sync-exercise-videos.mjs`; the implementation uses `sync-exercise-videos.ts` via `npx tsx` (matches the `validate-locales.ts` convention). Either update the spec text on that line or treat it as historical record.
