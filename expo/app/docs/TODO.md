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
- [x] `flutter-kicks` — should render supine with alternating leg kicks. Currently prone (face down), nearly static. **Fixed 2026-05-17:** procedural spec at `scripts/exercise_specs/flutter_kicks.py`; reuses dead_bug/glute_bridges supine setup (Hips X=-90°, loc_Y=-0.95). Sinusoidal alternation between hip flex 8° (trough, heel ~21 cm above floor) and 28° (peak, heel ~49 cm), knees locked straight (LeftLeg/RightLeg X=0), 8 bilateral cycles at 1 s/cycle = 8.2 s @ 30 fps. Hands by sides via IK pins (same as glute_bridges). Feet left at rest orientation; documented mismatch with canonical plantarflexion is visually minor from side profile. 57/57 validators pass; `flutter_kicks.mp4` (424 KB) shipped. Pattern still reusable for `scissor-kicks` (swap up-down alternation for lateral cross — same supine+leg-straight geometry).
- [x] `glute-bridges` — should render supine with knees bent and hips lifting. Currently standing upright. **Fixed 2026-05-16:** procedural spec at `scripts/exercise_specs/glute_bridges.py`; reuses dead-bug's supine setup (Hips X=-90°, loc_Y=-0.95). 3 reps @ 3-1-3 tempo (3 s lift / 1 s hold / 3 s lower) = 21.2 s @ 30 fps. Hip lift via combined `Hips loc_Y` (+0.12 m) and `Hips X` (-20° more tilt) so the spine angles down toward the shoulder/floor contact as the pelvis rises; head ends ~floor at peak. Feet pinned via IK at world Y=-0.46 (geometric: hip Y + thigh Y-offset + foot bone length = -0.07 - 0.249 - 0.137) so shins are near-vertical at start. Hands pinned at Y=-0.25 (= shoulder Y - arm chain length 0.644) for naturally-straight arms by sides. Pole targets + foot rotation lock required: knees would bend through floor without pole targets; feet would curl ballet-pointe-style without rotation lock. Final config: foot rotation lock `(0, 0, 180)` (foot points -Y world with top-of-foot facing +Z up), pole at (X_foot, Y_foot, +1.5) with `pole_angle=+90` puts knee directly above foot with shin vertical at start. Elbow pole at lateral +X (LeftArm) / -X (RightArm) biases any small arm bend away from body centerline. 9/9 validators pass; `glute_bridges.mp4` (915 KB) shipped.
- [x] `knee-push-ups` — should render with knees on floor (the differentiator from standard push-up). Currently identical to `standard-push-ups`. **Fixed 2026-05-18 (v3 IK + pole_angle):** procedural spec at `scripts/exercise_specs/knee_push_ups.py`; **first PRONE-pose spec in this codebase**. Took 3 iterations: v1 (FK only) produced hip-hinge silhouette; v2 (IK pins, no pole_angle) produced visible elbow-Z-fold pathology where the IK solver bent elbows toward the face; v3 added `IK_POLE_ANGLES = {LeftHand: +90, RightHand: +90}` which the triple-agent diagnosis (confidence 62/75/72) identified as the missing fix. Default pole_angle=0 makes Blender IK pick a bend-reference axis unrelated to the pole target direction; +90° rotates the reference so the pole at +Y actually pulls the elbow toward the body posterior (the correct push-up direction). Spec uses IK pins on both hands and feet (same pattern as `glute_bridges.py`), with Hips X rotation alone driving the push-up motion: UP at +55° (body 35° above horizontal), DOWN at +65° (body 25°). IK solver bends arms at the elbow to keep hand pins planted as the body lowers — produces correct "chest lowers, elbow bends backward" motion. Camera is `three_quarter` (side_left compressed the lateral arm motion). 3 reps @ 3.5 s/rep = 10.7 s @ 30 fps. Replaces broken legacy `knee-push-ups.mp4` (28 KB kebab-case) with `knee_push_ups.mp4` (519 KB). **Lesson for future prone specs:** when using IK pins on hands with a chain_count of 3 and the chain needs to produce a substantial bend in a specific direction, the pole target alone is not enough — pole_angle must be set (typically +90 on this Mixamo rig).
- [x] `pike-push-ups` — should render inverted-V lowering head toward floor. Currently standing with arms overhead. **Fixed 2026-05-16:** procedural spec at `scripts/exercise_specs/pike_push_ups.py`; inverted-V pike with rhythmic elbow flex lowering head toward floor, 3 reps @ 30 fps, 13.7 s. Builds on the `downward_dog` setup (Hips X=+90°, spine bend, 4 IK pins with per-bone `chain_count`). Final elbow flex is ~130° rather than textbook 90° — deeper hip drop forced an unsolvable IK on bent legs (every config broke something different). Reverted to a ~5 cm hip drop with DD's known-working pin geometry; `pike_push_ups.mp4` (637 KB) shipped. Library extension landed: `apply_ik_pins` now accepts optional `pole_targets`/`pole_angles` for future bent-limb specs. See feedback memories `feedback_blender_ik_pole_targets.md` and `feedback_blender_pose_constraints_first.md`.
- [ ] `plank-jacks` — should render plank with feet jumping wide/close. Currently standing/jogging with arms at chest.
- [x] `scissor-kicks` — should render supine with legs crossing alternately. Currently prone, nearly static. **Fixed 2026-05-17:** procedural spec at `scripts/exercise_specs/scissor_kicks.py`; reuses supine setup (Hips X=-90°, loc_Y=-0.95). Variant resolved to **horizontal crisscross** (7+ sources distinguish this from flutter_kicks' vertical alternating). Both legs held at ~45° hip flexion throughout; lateral cross-motion via LeftUpLeg/RightUpLeg Z axis (open V at Z=∓15° → ~60 cm ankle separation; crossed at Z=±10° → ankles ~7 cm past midline). "Over" differentiation via ±2° hip-flex differential between the two legs at each cross. 4 cycles at 2.4 s/cycle = 9.8 s @ 30 fps, front_top_left camera. **Wrong-sign trap caught here:** theoretical axis analysis predicted Z=+ for LeftUpLeg abduction-to-character-left; renders showed the opposite. Don't re-derive — spec notes the verified empirical convention. 85/85 validators pass; `scissor_kicks.mp4` (470 KB) shipped.
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
