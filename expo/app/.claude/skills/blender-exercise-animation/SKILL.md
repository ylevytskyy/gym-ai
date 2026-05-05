---
name: blender-exercise-animation
description: Use when authoring or updating an exercise demo animation for the GymAI app. Triggers — "create/update animation for <exercise>", "fix the <exercise> demo", any work in scripts/exercise_specs/, scripts/animation_lib/, or assets/blender/xbot_rigged.blend / casual_man_rigged.blend. Targets a Mixamo-rigged character; pose values use Mixamo bone naming.
---

# Blender Exercise Animation

Spec-driven animation authoring for the GymAI app's exercise demos. Each exercise is a Python module declaring phases + validators + camera. A CLI driver opens the rig, emits keyframes from the spec, runs geometric validators, gates the render on validators passing, then writes MP4 + per-exercise `.blend`.

**Output paths the app already consumes:** `assets/exercise-renders/<exercise>.mp4` (overwrite-in-place when migrating).

## The rig

- **Active rig:** `assets/blender/xbot_rigged.blend` — XBot (Mixamo's reference character, 65 bones, applied transforms so armature world matrix is identity). Standard Mixamo bind pose.
- **Alternate rig:** `assets/blender/casual_man_rigged.blend` — higher-fidelity Sketchfab Casual Man with renamed bones. **Not currently wired up** — its bind pose differs from Mixamo standard, so pose values that work on XBot don't translate directly. Switching back requires either bind-pose calibration of pose values per exercise, or a Mixamo round-trip through the auto-rigger to bake a standard bind pose.
- **Bone naming:** Mixamo (`mixamorig:LeftUpLeg`, etc.). Use `animation_lib.rig.Bones` constants and joint accessors (`hip_flex.L`, `knee_flex.R`, etc.); never raw bone strings.
- **Don't mutate either rig file** — they're the read-only source. All work goes through `animate.py`, which loads a copy in memory.

## Authoring a spec

1. Copy a similar exercise's module into `scripts/exercise_specs/<new_exercise>.py`. Pilot template: `high_knees.py` for cyclic-alternating motion.
2. Required module attrs: `NAME` (must equal filename), `FPS`, `CAMERA`, `LIGHTING`, `PHASES`, `VALIDATORS`. Optional: `RESOLUTION`.
3. Phases declare end-of-phase pose. The library interpolates from the previous phase (or T-pose for phase 0). Tempo is implicit in `duration_sec`.
4. **Validators are mandatory.** A spec with empty `VALIDATORS` is rejected at load time. Prefer composing existing primitives over adding new ones — only add a primitive to `validators.py` when a class of failure isn't expressible by combinations.
5. Camera and lighting are **named presets** from `animation_lib.cameras` (`front`, `side_left`, `three_quarter`, `studio`). Add new presets to `cameras.py` (with a documented angle and use case); never inline camera math in a spec.

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

## Known limitations

- **Bind-pose calibration is per-rig, per-exercise.** See "Calibrating pose values" above.
- **`mirror_symmetry` only fits simultaneously-symmetric motion.** Cyclic-alternating exercises need a different validator (not yet built).
- **FBX overlay support not implemented.** Exercises that need to inherit motion from a Mixamo FBX (rather than authoring procedurally) require new infrastructure in `keyframe_emitter.py`.
- **Render is EEVEE only.** Cycles is not configured; specs can't request it. Sufficient for stylized exercise demos.
