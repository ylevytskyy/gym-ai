---
name: blender-exercise-animation
description: Use when authoring or updating an exercise demo animation for the GymAI app. Triggers — "create/update animation for <exercise>", "fix the <exercise> demo", any work in scripts/exercise_specs/, scripts/animation_lib/, or assets/blender/xbot_rigged.blend / casual_man_rigged.blend. Targets a Mixamo-rigged character; pose values use Mixamo bone naming.
---

# Blender Exercise Animation

Spec-driven animation authoring for the GymAI app's exercise demos. Each exercise is a Python module declaring phases + validators + camera. A CLI driver opens the rig, emits keyframes from the spec, runs geometric validators, gates the render on validators passing, then writes MP4 + per-exercise `.blend`.

**Output paths the app already consumes:** `assets/exercise-renders/<exercise>.mp4` (overwrite-in-place when migrating).

## Biomechanical research (mandatory prerequisite)

**Do this BEFORE writing a new spec or making non-trivial changes to an existing animation.** Pose values must derive from a sourced kinematic description, not from intuition or "what looks right." A single wrong axis or wrong magnitude can take hours to debug; a wrong description bakes that error in from the start.

### Why this is non-negotiable

The skill has a long history of doing it wrong way around: pose first, debug visually, iterate. Each iteration costs a render + visual inspection + speculation about what's off. A canonical kinematic description up front turns "is the arm wrong?" from a guess into a numerical comparison: "Source says forward-peak hand at chin level (~45–60° shoulder flexion); current render shows hand at chest level — deepen the elbow flex."

### Process

1. **Delegate research to a Sonnet subagent** with `ultrathink` in the prompt. Don't burn main-thread context on web reading. Instruct the subagent to:
   - Pull from authoritative sources: ACE, NSCA, ACSM, sports-biomechanics papers (PMC, Journal of Experimental Biology), credentialed coaching outlets, reputable fitness sites (Healthline, Verywell Fit). Aim for 6–10 distinct sources.
   - **Quote sources** — every numerical claim cites the source and URL.
   - Self-review and iterate the description before returning.

2. **Required output sections** (the subagent's brief should mandate all of these):
   - **Posture** held throughout the cycle: torso lean (degrees, fulcrum joint — ankle vs waist matters), spine, head, shoulders, pelvic tilt, core engagement.
   - **Lower body kinematics**: hip flexion at peak, knee flexion at peak, ankle (dorsi/plantar at swing vs strike), foot strike pattern, stance leg state (extension, hip extension at toe-off), vertical bounce.
   - **Upper body kinematics**: shoulder flexion-extension range (degrees), abduction (does the arm stay in the sagittal plane?), elbow flex at neutral / forward peak / back peak, hand path (where exactly — chin? eye? hip? past-hip?), wrist, primary driver (shoulder pendulum vs elbow pump).
   - **Phase relationship**: counter-rhythm (ipsilateral/contralateral?), peak alignment, what happens between peaks.
   - **Tempo / cadence**: steps/min range, full-cycle duration, comparison to running cadence.
   - **Common form errors**: top 3–5 — these tell you what NOT to render.
   - **Source disagreements**: explicit, with both numbers, then resolved by picking which variant we animate.

3. **Resolve variant ambiguity explicitly.** Many exercises have multiple "correct" forms (high knees has a sprint-drill variant at 90° hip flexion / 100 spm and a cardio-HIIT variant at 110–125° hip flexion / 150 spm — visibly different animations). The spec serves one variant. For the GymAI app, default to the **fitness/cardio variant** unless the exercise is explicitly a track drill. Document the choice in the spec docstring.

4. **Iterate the description until it passes self-review.** Checklist: every numerical claim cited; nothing vague where it should be quantitative; covers every joint the rig exposes; no unresolved ambiguity; could a 3D animator implement it without further questions. Loop research → write → review until clean.

5. **Spec values trace back to the description.** Each pose value should map to a research-backed target. Where it can't (rig-specific calibration), call it out in a comment.

### Improving an existing animation uses the same process

Don't tweak pose values empirically when the user reports "still not right." Run the research, build the description, compare it to the current spec line by line. Often three or four corrections surface that wouldn't have been visible from inspecting the rendered MP4.

## The rig

- **Active rig:** `assets/blender/xbot_rigged.blend` — XBot (Mixamo's reference character, 65 bones, applied transforms so armature world matrix is identity). Standard Mixamo bind pose.
- **Alternate rig:** `assets/blender/casual_man_rigged.blend` — higher-fidelity Sketchfab Casual Man with renamed bones. **Not currently wired up** — its bind pose differs from Mixamo standard, so pose values that work on XBot don't translate directly. Switching back requires either bind-pose calibration of pose values per exercise, or a Mixamo round-trip through the auto-rigger to bake a standard bind pose.
- **Bone naming:** Mixamo (`mixamorig:LeftUpLeg`, etc.). Use `animation_lib.rig.Bones` string constants for bone names. The sided joint accessors (`hip_flex.L`, `shoulder_flex.R`, `elbow_flex.L`, etc.) are convenient but **systematically wrong** for the running-arm motion: they all hardcode the X axis, but the actual sagittal-plane axes for shoulder swing and elbow flex on this rig are **Y** (see "Calibrated rig conventions" below). Use raw `(bone, axis)` tuples — `high_knees.py` is the reference.
- **Don't mutate either rig file** — they're the read-only source. All work goes through `animate.py`, which loads a copy in memory.

## Calibrated rig conventions (XBot)

Empirical mapping from local Euler axis to visible motion, calibrated by isolated-rotation tests. Use this as the starting point for any new spec; verify with `--frame <peak>` before trusting.

| Bone | Axis | Sign | Motion |
|---|---|---|---|
| `LeftUpLeg` / `RightUpLeg` (hip) | X | + | Hip **flexion** — thigh swings forward / up |
| `LeftLeg` / `RightLeg` (knee) | X | − | Knee **flexion** — shin folds toward thigh; positive extends past straight |
| `LeftArm` / `RightArm` (shoulder) | X | + 90° | Arm **abduction down** to side (T-pose → arm-at-side); leave at 90° as the baseline |
| `LeftArm` / `RightArm` (shoulder) | **Y** | − / + | Arm sagittal **swing** — **`Y−` forward, `Y+` behind**. This is the running-arm axis. (Earlier work used Z, which is actually a TWIST around the bone's length — with elbow bent, Z swept the forearm OUTWARD to the side instead of swinging it forward/back. Z = twist, Y = swing. Don't confuse them.) |
| `LeftArm` / `RightArm` (shoulder) | Z | varies | **Twist around bone's length** (NOT swing). Visible only with elbow bent — rotates the bent forearm sideways around the upper arm. Avoid for swing motion. |
| `LeftForeArm` / `RightForeArm` (elbow) | **Z** | varies by side | Elbow sagittal **flexion** — Z is the flex axis in working pose (arm at side with parent X+90°). **Y is the TWIST axis** for forearm bones at all shoulder swing values (dot product = 1.000 empirically); setting Y to any value produces zero elbow angle change. Sign convention is **MIRRORED** between left and right: `LeftForeArm Z+` = forward/up toward face; `LeftForeArm Z−` = backward toward hip. `RightForeArm Z−` = forward/up toward face; `RightForeArm Z+` = backward. See `xbot_rig_axes.md` "LeftForeArm working-pose analysis" for verified world hand positions at each peak. |
| `Spine` | X | + | Forward lean (note: lean is at the spine joint, not from the ankle as canonical biomechanics specifies — visible as a waist hinge in profile. Keep small, ≤5°.) |
| `Spine` | Y | ± | Lateral side-bend (torso tilts left/right). Rarely used in cardio specs. |
| `Spine` | **Z** | ± | **Axial twist** — torso rotates around the vertical axis. Use for counter-rotation in running exercises. (Local Y is parallel to the bone's length +Z up, so Y = twist at rest; local Z sweeps the torso. Confirmed: `high_knees.py` uses Spine Z for counter-rotation.) |
| `LeftFoot` / `RightFoot` (ankle) | X | − | Dorsiflexion (toes up, swing position). Positive = plantarflexion (toes down, push-off / strike). Calibrated value is X=−30°; use X=−45° for better visibility on this rig — the motion is visually subtle at −30°. |
| `Hips` | `loc_Y` | + meters | **Vertical bounce** (root translation). `loc_Y` maps to world +Z (up) on this rig. Use small values (0.03–0.05m) to lift at peaks; 0 at midstride. (**Not** `loc_Z` — that channel maps to world -Y (forward), producing an invisible forward shuffle instead of a bounce. This was the original bug.) |
| `LeftHand{Finger}{1,2,3}` / `RightHand{Finger}{1,2,3}` | X | + | Finger curl toward palm. Proximal (1) at 30°, middle (2) at 45°, distal (3) at 45° gives a soft fist. Thumb lighter: 15/25/20°. Finger bones exist on this rig — use them for realistic hand poses. |

**Key rule of thumb: the sagittal-plane axes are X (legs) and Y/Z (arms).** Shoulder swing is on **Y** (upper arm). Elbow flex is on **Z** (forearm) — despite sharing the same rest-pose geometry as the upper arm, the forearm's local Y stays TWIST at all working poses (empirically confirmed: dot=1.000 at shoulder Y=-45°, 0°, +20°). Sign conventions for forearm Z are mirrored between left and right — see the table row above and `xbot_rig_axes.md` for verified hand-position targets.

L↔R mirror is **not** automatic; sign conventions for `RightArm` Y match `LeftArm` (negative forward, positive behind on each respective side), but verify per-bone by rendering both peaks before committing. Foot dorsiflexion likewise: `LeftFoot X = −45` is the recommended value for visibility; verify right foot independently.

## Authoring a spec

### Step 0: Read the rig calibration ledger

**Before writing any pose values, read `assets/blender/xbot_rig_axes.md`.** It shows the world-space direction of every bone's local X/Y/Z axes at rest pose, which local axis maps to world +Z (up) for each bone, and which axes are sweep vs twist. Every pose value you write must trace to a verified axis from that ledger — not to a guess.

If the rig has changed (new bones added, transforms re-baked, switched to a different `.blend`), regenerate the ledger before writing any spec values:

```sh
python3 scripts/inspect_rig.py assets/blender/xbot_rigged.blend > assets/blender/xbot_rig_axes.md
```

The ledger takes one Blender background invocation (~10s) and replaces hours of render-iterate debugging. See "Common gotchas — Render-iterate is a trap" for the full rationale.

1. **Run the biomechanical research first** (see section above). The pose values you write here trace back to that document; don't skip it.
2. Copy a similar exercise's module into `scripts/exercise_specs/<new_exercise>.py`. Pilot template: `high_knees.py` for cyclic-alternating motion.
3. Required module attrs: `NAME` (must equal filename), `FPS`, `CAMERA`, `LIGHTING`, `PHASES`, `VALIDATORS`. Optional: `RESOLUTION`.
4. Phases declare end-of-phase pose. The library interpolates from the previous phase (or T-pose for phase 0). Tempo is implicit in `duration_sec`.
5. Pose dict keys are `(bone_name, axis)` tuples. Axis can be `"X"`/`"Y"`/`"Z"` for rotation (degrees) or `"loc_X"`/`"loc_Y"`/`"loc_Z"` for translation (meters; useful for vertical bounce on the `Hips` bone).
6. For cyclic-alternating motion (running, kicking, etc.), `motion.cycle()` accepts an optional `midstride_pose` to insert a between-peaks phase — useful for vertical bounce (Hips `loc_Y` drops at midstride and rises at peaks) or any state that lives between the two main peaks.
7. **Validators are mandatory.** A spec with empty `VALIDATORS` is rejected at load time. Prefer composing existing primitives over adding new ones — only add a primitive to `validators.py` when a class of failure isn't expressible by combinations.
8. Camera and lighting are **named presets** from `animation_lib.cameras` (`front`, `side_left`, `three_quarter`, `studio`). Add new presets to `cameras.py` (with a documented angle and use case); never inline camera math in a spec.

### Validator design — what each primitive actually checks

The primitives split cleanly into two categories:

**Local-angle primitives** (read `pose_bone.rotation_euler[axis]`):
- `joint_angle_at`, `joint_angle_range`, `joint_velocity_max`, `mirror_symmetry`

These are useful but **leaky** — they verify that *the local Euler angle is what the spec says*, not that the resulting world-space pose is anatomically correct. A spec value of `hip_flex.L: 100` will make `joint_angle_at` pass even if the rig's bind pose makes that rotation produce hip *extension* (backward kick) rather than flexion (forward lift). Use these primitives, but don't trust them as the only check.

**World-space primitives** (read bone world matrix translations):
- `shin_vertical`, `world_position_drift_max`, `hip_no_lateral_drift`, `hip_no_sagittal_drift`, `foot_world_y_min`

These verify the actual visible animation. `shin_vertical` reads (foot.world_pos − knee.world_pos) and angles it against world `(0, 0, -1)` — this catches "the leg is pointing the wrong direction" regardless of which local axis or rig bind pose is in play. Lean on these whenever possible.

**Always include at least one world-space validator per spec.** A spec that's only local-angle validated can pass while the visual animation is wildly wrong.

## Build and iterate

```sh
cd scripts
python3 animate.py <exercise>                 # full: validate + render MP4 + save .blend
python3 animate.py <exercise> --no-render     # validate only — fast spec iteration
python3 animate.py <exercise> --frame 30      # render single PNG, spot-check pose
python3 animate.py <exercise> --keep-blend    # save .blend even on validator failure (debug)
```

Exit codes: 0 success, 1 spec error, 2 validator failure (table printed), 3 render error.

On validator failure: **fix the spec, not the validator.** Loosening a threshold or removing a validator without a documented reason is a smell.

## Calibrating pose values for a new rig (or after rig changes)

This is where the work lives. Local-angle conventions are rig-specific — even a "Mixamo" rig can have non-standard bind pose if the source FBX wasn't authored to Mixamo's conventions. Calibration loop:

1. Pick one bone (e.g., `mixamorig:LeftUpLeg`) and one rotation. Set every other bone to rest.
2. Run `python3 animate.py <test_exercise> --frame <peak_frame>` to render one frame.
3. Visually inspect the PNG: did the rotation produce the intended motion?
4. Adjust value/axis/sign until visual is correct.
5. Pin the world-space validator (e.g., `shin_vertical`) — it should now pass with that pose.
6. Move to the next bone. Repeat.

This is hours of work for a complex multi-bone exercise on a fresh rig. It's a real cost; the validator framework can't eliminate it, only constrain it.

## Diagnosing a wrong-axis problem

When the render looks wrong on a specific joint and you suspect an axis or sign in the spec — **do not iterate renders**. Renders can confirm a right axis but cannot falsify a wrong one (a 50% wrong sign just looks "weird," not "obviously inverted"). Use this recipe instead.

### The recipe

1. **Analyze the bone in its working pose, not its rest pose.** The arm chain has a baseline `LeftArm/RightArm X+90°` rotation that puts the arm at the character's side; *all* local axes rotate with the bone. What was twist at rest can become swing in the working pose, and vice versa. Legs animate near rest, so their rest-pose axes hold; arms do not.

2. **Use dot product against the bone's direction to identify twist.** Run `inspect_rig.py` (or a one-off Blender script) at the working pose and dot each local axis vector against the bone's `head→tail` direction. The axis whose dot ≈ 1.0 is parallel to the bone — rotating around it is **TWIST**. Don't use it for swing motion. The two axes with dot ≈ 0.0 are perpendicular — those are the swing/flex candidates.

   Example from `xbot_rig_axes.md`: `LeftForeArm` local Y reads dot=1.000 against the bone direction at shoulder Y=−45°, 0°, *and* +20°. Y is the twist axis at every working pose, not just at rest. Setting `LeftForeArm` Y to any value produces zero elbow angle change — it just spins the forearm in place. The actual elbow flex axis is Z.

3. **Verify sign with one isolated test peak per side.** Set the suspect bone+axis to a small magnitude, every other bone to rest, then `python3 animate.py <test> --frame <peak>`. Read world-space hand/foot position from the rendered frame and from `inspect_rig.py`. **Never trust the side view alone** — from `side_left`, shoulder X (abduction toward camera) and shoulder Y (forward swing) both project as "limb coming forward." Always cross-check from `front`. Historical evidence: shoulder Z was wrongly used for swing for months because side-view renders looked plausible.

4. **Don't assume L↔R sign symmetry.** `RightArm` points `−X (lateral left)` from rest, while `LeftArm` points `+X (lateral right)`. That inverts the sign of every rotation. The ledger spells out per-side sign conventions; read both rows, don't extrapolate from one. Same for forearms: `LeftForeArm Z+` folds toward face, `RightForeArm Z−` folds toward face.

### Common false leads

- **Two bones with identical rest-pose axes behaving differently in working pose.** `LeftArm` and `LeftForeArm` have the *same* rest-pose layout (Y parallel to bone, X lateral). In working pose, LeftArm Y becomes the sagittal swing axis but LeftForeArm Y stays the twist axis (dot=1.000 at every shoulder position). The forearm tracks its parent's rotation differently from how the parent's own axes rotate. Always verify the child bone's twist axis empirically; don't extrapolate from the parent.

- **Suspecting the sign needs to flip at the opposite peak of a cyclic motion.** It usually doesn't. The elbow Z sign on the forearm is the same at the forward peak (hand near chin) and the back peak (hand near hip): the forearm always folds toward the face. The back peak puts the hand at hip height because the *shoulder* swing tilted the whole upper-arm chain rearward — not because the elbow re-folded the other way. Verified by full-pose introspection on 2026-05-06; earlier attempts that flipped the forearm Z sign at the back peak were chasing a phantom correction.

- **A bone has a non-trivial baseline rotation but you read it from the rest-pose ledger row.** Rest-pose tables describe the bone *before* any baseline pose is applied. For arm bones with `X+90°` baseline, regenerate the ledger with that pose set, or read the explicit "working-pose analysis" notes already in `xbot_rig_axes.md` for `LeftArm` and `LeftForeArm`. New baselines need new working-pose introspections.

## Output

- MP4: `assets/exercise-renders/<exercise>.mp4` — overwrites; this is what the app consumes.
- .blend: `assets/blender/casual_man_<exercise>.blend` — gitignored debug artifact.

## What NOT to do

- Don't mutate `xbot_rigged.blend` or `casual_man_rigged.blend`. Treat them as read-only.
- Don't touch `xbot_exercises.blend` or `scripts/render-exercises.py`. Those are the legacy pipeline; they'll be deleted once all 40 exercises migrate.
- Don't render before validators pass. The CLI literally won't let you. Don't try to game it (e.g., temporarily commenting validators).
- Don't add `mirror_symmetry` to a cyclic-alternating spec (high_knees, mountain_climbers). It compares L/R at the same frame, which is meaningfully unequal by design in cyclic motion. Use it for simultaneously-symmetric exercises (squats, jumping_jacks) only.

## Adding a camera or lighting preset

Edit `scripts/animation_lib/cameras.py`. Add the entry to the `_CAMERAS` or `_LIGHTING` dict with a comment documenting the angle and intended use case. Reference it by name from specs. Keep the registry small.

## Migration path

Each exercise migrates in its own PR: spec module + MP4 + (optionally) deletion of the corresponding line from `scripts/render-exercises.py`. When the last exercise migrates:

1. Delete `scripts/render-exercises.py`
2. Stop maintaining `assets/blender/xbot_exercises.blend` (it's gitignored, just regenerable)
3. Update `app/CLAUDE.md` to remove references to the old pipeline

## Common gotchas

Recurring author mistakes, not framework limits:

- **Frame 0 is T-pose unless you say otherwise.** The interpolator blends from rest pose into your first phase, so frame 0 is rest, not your first-phase pose. For exercises that don't visually start in T-pose, prepend a short (~0.1s) setup phase that lands the character in the cycle's neutral pose. `high_knees.py` does this with an `_ARMS_DOWN`-only setup phase before the leg cycle.
- **Local-angle validators don't catch wrong-axis bugs.** `joint_angle_at` happily passes on `shoulder X = 60°` even though X is abduction, not swing. Always pair local-angle validators with a world-space validator (`shin_vertical`, `foot_world_y_min`, etc.) that reads the actual visible result. If a user says "the limb is going the wrong way" and your validators all pass — you're missing a world-space gate.
- **Velocity threshold scales with peak amplitude.** `joint_velocity_max` defaults are tuned for moderate-range motion; cyclic exercises with large per-frame deltas (high_knees at hip 125°, 0.5s/step) need `max_dps` raised to ~800. Don't lower amplitude to fit the validator — raise the validator and document why.
- **L/R mirror sign flips aren't free.** When mirroring a peak pose from one side to the other, render both peaks (`--frame <left_peak>` and `--frame <right_peak>`) before committing the spec.
- **Render the cycle, not just one peak.** A `--frame 30` PNG that looks correct doesn't prove the in-between frames look natural. After validators pass, watch the MP4 — easing, transition tempo, and counter-rhythm coordination only show up in motion.
- **Side view alone can't distinguish "forward swing" from "outward sweep."** From `side_left`, an arm swinging forward (-Y) and an arm abducting toward camera (+X) both project as "arm coming toward viewer." Always confirm sagittal-plane motion from a **front** view too. This is how the original spec ended up using Shoulder Z (a twist axis) for "swing" — it looked right from the side and was wrong from the front for months.
- **Skip biomechanical research at your own risk.** If you find yourself nudging pose values while squinting at the MP4, stop. Run the research subagent, get the numerical targets, then come back. It's faster than the alternative — measured in actual session minutes, not in pride.
- **Render-iterate is a trap. Introspect first.** If you're about to nudge a pose value because the render looks wrong, stop and check `assets/blender/xbot_rig_axes.md`. If your value implies an axis assumption not backed by the ledger, you're guessing — and renders can't falsify a wrong axis assumption, they can only confirm a right one. Every wrong-axis bug in this codebase was found the same way: 5-line Python snippet in Blender, immediate answer, no renders needed. The cure is the ledger, not more renders. Historical evidence: commit `c154eff` discovered that shoulder Z = twist (not swing) after hours of side-view renders that looked plausible; the same session that introduced `high_knees.py` discovered that `Hips loc_Y` (not `loc_Z`) is the world-up channel, that `Spine Z` is the axial-twist axis, and that finger bones exist and are animatable — all found by running `inspect_rig.py`, none by rendering.

## Known limitations

- **Bind-pose calibration is per-rig, per-exercise.** See "Calibrating pose values" above.
- **`mirror_symmetry` only fits simultaneously-symmetric motion.** Cyclic-alternating exercises need a different validator (not yet built).
- **FBX overlay support not implemented.** Exercises that need to inherit motion from a Mixamo FBX (rather than authoring procedurally) require new infrastructure in `keyframe_emitter.py`.
- **Render is EEVEE only.** Cycles is not configured; specs can't request it. Sufficient for stylized exercise demos.
