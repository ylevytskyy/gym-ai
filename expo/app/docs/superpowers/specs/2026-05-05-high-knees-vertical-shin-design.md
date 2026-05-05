# High-Knees: Vertical Shin Lock — Design Spec

**Date:** 2026-05-05
**Branch:** `feat/exercise-images`
**Status:** Approved (design)
**Owner:** Yuriy

## Problem

Current `high_knees` render (`assets/exercise-renders/high_knees.mp4`, generated from `assets/blender/xbot_exercises.blend`'s `high_knees` action) shows the shin (lower leg below the knee) swinging forward/back through the cycle — a running-gait arc, not the desired stylized "piston" lift. The user wants the shin's world-space orientation locked to vertical at every keyframe so the foot tracks straight up and down directly under the knee.

Prior iteration v8 was logged as having a "vertical calf piston," but the latest render (timestamped after v8) regressed or never actually achieved frame-by-frame vertical. The latest `high_knees.fbx` is dated 2026-05-05 13:28 and the latest `high_knees.mp4` is 13:32 — the user is reacting to that render.

## Goal

For every keyframe of the `high_knees` action, the shin (calf bone) world-space rotation about the swing axis (X — forward/back) is `0 ± 2°`. Result: the foot moves on a near-vertical world-space line under the knee throughout the cycle. Only legs are touched — arms remain whatever they currently are.

## Mechanism

1. Identify the calf bone names on the Mixamo-rigged X Bot armature (typical: `mixamorig:LeftLeg`, `mixamorig:RightLeg` — Discovery confirms).
2. For each keyframe in the `high_knees` action:
   - Read thigh (`mixamorig:LeftUpLeg` / `RightUpLeg`) local Euler X (forward/back swing about the hip).
   - Set the calf bone's local Euler X = `-(thigh_local_X + accumulated_parent_X_above_thigh)` so the calf cancels the thigh's world-space swing exactly.
   - Leave Y (twist) and Z (splay) alone.
3. Apply the edit only to existing keyframed frames; let Blender's interpolation handle the in-betweens. With both endpoints corrected, the in-between arc is near-linear-vertical.
4. Idempotent: re-running the script on an already-corrected action is a no-op (delta below epsilon).

## Out of scope

- Arms (separate open issue per memory; user will revisit if needed).
- Hip/pelvis vertical bounce — keep as-is.
- Foot/toe roll — keep dorsiflexion from prior iteration.
- The non-`high_knees` exercises.

## Validation

After the edit, sample 10 evenly spaced frames across the action range. For each frame, compute the world-space Euler X (degrees) of both `LeftLeg` and `RightLeg` pose bones. Pass criterion: every value within `±2°` of `0`.

Then re-render `high_knees.mp4` at 800×800 30fps h264 via the existing `scripts/render-exercises.py` (or its Blender-side equivalent). Eyeball check: shin reads as vertical at every frame; foot path is a vertical line.

Fallback if validation fails: bake every frame (not just keyframes) of the calf bone's local-X channel — guarantees correction at the cost of FCurve cleanliness.

## Execution shape

Per CLAUDE.md (orchestrator-with-Sonnet-subagents) and the global `blender` skill (3-stage Discovery → Planning → Implementation chain), the work is:

- **Discovery** — inspect `xbot_exercises.blend`; list calf/thigh bone names, the `high_knees` action's FCurve channel inventory, the keyframe count and frame range, and a baseline of shin world-X across 10 sampled frames so we have a "before" number.
- **Planning** — write two Python scripts: (a) the FCurve edit, (b) the validation/sampler. Hand both back as text so the main thread can review before invoking.
- **Implementation** — run the edit in `blender --background`, run validation, re-render, return the validation numbers + ffprobe of the new mp4.

Each subagent is one verifiable outcome and reports under 200 words. Main thread verifies the diff and the validation numbers before declaring done.

## Files touched

- `assets/blender/xbot_exercises.blend` — edited (FCurve overwrite on `high_knees` action's calf-X channels).
- `assets/exercise-renders/high_knees.mp4` — re-rendered.
- No app code or other exercise files.

## Risks

- The thigh isn't the only ancestor with X rotation (pelvis, root); accumulated parent rotation must be summed correctly. Discovery gathers the full ancestor chain so Planning can write the right sum.
- Mixamo rigs sometimes use rest-pose offsets that make local Euler ≠ world delta from rest. If the simple negation fails validation, switch to: read thigh's pose-bone world quat, derive its X-axis rotation, set calf to compensate via `mathutils.Quaternion`. Planning notes this as the fallback.
- "Strictly vertical" at keyframes does not guarantee strictly vertical at every interpolated frame; if the in-between bow is visible, fall back to per-frame bake (documented above).
