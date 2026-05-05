# Blender Exercise Animation Skill — Design

**Date:** 2026-05-05
**Status:** Approved (brainstorming phase)
**Pilot exercise:** high_knees
**Target rig:** `assets/blender/casual_man_rigged.blend` (Sketchfab Casual Man, Mixamo skeleton, 76 bones)

## Problem

The current pipeline (`scripts/render-exercises.py`) imports 40 Mixamo FBX files into `assets/blender/xbot_exercises.blend` and renders MP4s. It has shipped enough usable demos to be the baseline, but the underlying approach is brittle:

- Mixamo occasionally substitutes the wrong motion (e.g., a generic-lunge clip for "side_lunge"). The pipeline has no way to detect this.
- Past iterations on `high_knees` exposed visual issues (lateral hip wobble, non-vertical shins at peak, foot sliding) that no automated check would have caught.
- Fixes accumulated as one-off post-import hooks inside `render-exercises.py` (e.g., the swing-twist correction), with no shared vocabulary or reuse path.
- Camera framing is fixed across all exercises — `plank` and `pushup` need a side view to verify spine straightness, but the pipeline only does front.

We need a disciplined authoring path where each exercise has an explicit, machine-checkable contract, a fail-fast validation step, and a procedural motion source that doesn't depend on whatever Mixamo decided to ship.

## Goals

1. **Strictly to requirements:** every exercise animation has a written spec; every spec has geometric validators; no MP4 is rendered until all validators pass.
2. **Rig-specific to `casual_man_rigged.blend`:** Mixamo bone names are deterministic, the rig stays pristine, all motion is built on a copy.
3. **Project-level skill:** lives at `expo/app/.claude/skills/blender-exercise-animation/`. Discoverable from the app workspace where all Blender artifacts already live.
4. **Migration path:** new pipeline replaces `render-exercises.py` one exercise at a time. App-consumed MP4 paths are unchanged. `render-exercises.py` is deleted only after all 40 exercises are migrated.

## Non-goals

- Replacing all 40 exercises in this spec. The pilot is `high_knees`; everything else is a follow-up PR per exercise.
- Authoring motion from a reference video (no pose-estimation tooling).
- Visual/screenshot-based validation (deferred — geometric validators first; layered visual review is a future option if geometric proves insufficient).
- Any change to the app code that consumes MP4s.

## Decisions

Each major design axis was chosen by working through alternatives during brainstorming:

| Axis | Decision | Rejected alternatives |
|---|---|---|
| Motion source | Spec is source of truth; FBX is one optional input | (raw Mixamo FBX as source — unreliable) |
| Spec format | Per-exercise Python module exposing module-level constants | (single shared YAML; YAML+sometimes-code hybrid) |
| Validation | Geometric primitive library + per-exercise validator list | (visual screenshot review; free-form Python validators; no validation) |
| Pilot exercise | `high_knees` | (squat, pushup, plank, side_lunges) |
| Camera/lighting/resolution | Named presets in central registry | (per-spec freeform; single fixed convention) |
| Pipeline relationship | Replaces `render-exercises.py` one exercise at a time, same MP4 paths | (parallel v2 paths; new folder; big-bang migration) |
| Code location | Thin skill (markdown only); Python lives in `scripts/animation_lib/` and `scripts/exercise_specs/` | (self-contained skill folder) |

## File layout

```
expo/app/
├── .claude/skills/blender-exercise-animation/
│   └── SKILL.md                          # the playbook (project-level skill)
├── scripts/
│   ├── animate.py                        # CLI: `python animate.py <exercise>`
│   ├── render-exercises.py               # legacy, untouched until exercises migrate
│   ├── animation_lib/
│   │   ├── __init__.py
│   │   ├── rig.py                        # casual_man_rigged loader, bone-name constants
│   │   ├── pose.py                       # set bone rotation/translation, pose math
│   │   ├── motion.py                     # phases → keyframes, interpolation, helpers
│   │   ├── validators.py                 # geometric primitive library
│   │   ├── cameras.py                    # named camera/lighting/resolution presets
│   │   └── render.py                     # MP4 + per-exercise .blend writer
│   └── exercise_specs/
│       ├── __init__.py
│       └── high_knees.py                 # pilot
└── assets/
    ├── blender/
    │   ├── casual_man_rigged.blend       # PRISTINE — never mutated
    │   └── casual_man_<exercise>.blend   # per-run debug artifact (gitignored)
    └── exercise-renders/
        └── <exercise>.mp4                # final MP4, same paths the app already consumes
```

## Spec module shape

Each `scripts/exercise_specs/<exercise>.py` exposes module-level constants. No `SPEC` wrapper dict.

Required attrs:

- `NAME: str` — must equal the file basename (asserted at load time)
- `FPS: int` — per-exercise; required because past iterations needed exercise-specific values (e.g., high_knees rendered at 15fps for half-speed playback)
- `CAMERA: str` — name from `cameras.py` registry
- `LIGHTING: str` — name from `cameras.py` registry
- `PHASES: list[Phase]` — each phase declares end-of-phase pose; library interpolates from previous phase (or T-pose for phase 0). Tempo is implicit in `duration_sec`.
- `VALIDATORS: list[tuple[Primitive, dict]]` — each entry is (primitive function, kwargs). Empty list rejected at load time.

Optional attrs:

- `RESOLUTION: tuple[int, int]` — per-spec override; default `(800, 800)` from the central render preset
- `FBX_PATH: str` — path to Mixamo FBX. When set, the library imports the FBX action and uses it as the baseline; phases override specific bones. The pilot does not use this.

Worked example (`high_knees.py`):

```python
from animation_lib.rig import Bones, hip_flex, knee_flex, shoulder_flex, elbow_flex
from animation_lib.motion import phase, cycle
from animation_lib.validators import (
    shin_vertical, joint_angle_at, hip_no_lateral_drift, hip_no_sagittal_drift,
    foot_world_y_min, joint_velocity_max, mirror_symmetry,
)

NAME = "high_knees"
FPS = 30
CAMERA = "front"
LIGHTING = "studio"
# RESOLUTION omitted — defaults to (800, 800) from render preset

# 10 cycles × 2 phases × 0.3s = 6.0s total = 180 frames @ 30 FPS
PHASES = cycle(
    reps=10,
    step_sec=0.3,
    left_pose={hip_flex.L: 100, knee_flex.L: 90, shoulder_flex.R: 40, elbow_flex.R: 90},
    right_pose={hip_flex.R: 100, knee_flex.R: 90, shoulder_flex.L: 40, elbow_flex.L: 90},
)

VALIDATORS = [
    (shin_vertical,         {"side": "left",  "at_phases": ["lift_left_*"],  "threshold_deg": 10}),
    (shin_vertical,         {"side": "right", "at_phases": ["lift_right_*"], "threshold_deg": 10}),
    (joint_angle_at,        {"joint": hip_flex.L, "at_phases": ["lift_left_*"],  "min_deg": 90, "max_deg": 110}),
    (joint_angle_at,        {"joint": hip_flex.R, "at_phases": ["lift_right_*"], "min_deg": 90, "max_deg": 110}),
    (hip_no_lateral_drift,  {"max_meters": 0.05}),
    (hip_no_sagittal_drift, {"max_meters": 0.10}),
    (foot_world_y_min,      {"side": "both", "min_y": 0.0}),
    (joint_velocity_max,    {"joint": hip_flex.L, "max_dps": 600}),
    (joint_velocity_max,    {"joint": hip_flex.R, "max_dps": 600}),
    (mirror_symmetry,       {"left_joint": hip_flex.L, "right_joint": hip_flex.R, "tolerance_deg": 8}),
]
```

### `Bones` namespace

`animation_lib/rig.py` wraps Mixamo bone names so specs never reference raw strings like `"mixamorig:LeftLeg"`. Joint constants like `hip_flex.L` map to `(bone_name, axis)` tuples. The library handles all rotation-mode conversion (Mixamo bones are quaternion; user-facing API is in degrees on a named axis).

Joint constants exposed: `hip_flex`, `knee_flex`, `ankle_flex`, `shoulder_flex`, `elbow_flex`, `spine_flex`, `head_yaw`, `head_pitch`, plus `.L` / `.R` accessors where relevant.

### `phase()` and `cycle()` helpers

`animation_lib/motion.py` exposes:

- `phase(duration_sec, pose, name=None) -> Phase` — single phase. Auto-names when omitted (`phase_<i>`).
- `hold(duration_sec, name=None) -> Phase` — explicit "no change" phase.
- `cycle(reps, step_sec, left_pose, right_pose) -> list[Phase]` — emits `reps * 2` alternating phases named `lift_left_<i>` and `lift_right_<i>`. Validators reference these via wildcards.

## Validator library

`scripts/animation_lib/validators.py` exposes a small set of geometric primitives. Each takes the armature plus a resolved phase→frame map; returns `list[ValidationResult]`. Build fails if any result has `passed=False`.

```python
@dataclass
class ValidationResult:
    primitive: str           # e.g. "shin_vertical"
    side: str | None
    frame: int
    observed: float
    expected: str            # human-readable ("≤ 10°", "in [90, 110]")
    passed: bool
    message: str             # populated only when failed
```

### Initial primitive set

| Primitive | Purpose |
|---|---|
| `shin_vertical(side, at_phases, threshold_deg)` | Angle between shin world-vector and (0,0,-1) within threshold at named phases |
| `joint_angle_at(joint, at_phases, min_deg, max_deg)` | Local rotation in range at named phase ends |
| `joint_angle_range(joint, min_deg, max_deg)` | Local rotation in range across all frames |
| `joint_velocity_max(joint, max_dps)` | Per-frame angular velocity bound (catches popping / interpolation artifacts) |
| `world_position_drift_max(bone, axis, max_meters)` | Bone world-axis drift between first and last frame |
| `hip_no_lateral_drift(max_meters)` | Thin wrapper: `world_position_drift_max(hip, x, max)` |
| `hip_no_sagittal_drift(max_meters)` | Thin wrapper: `world_position_drift_max(hip, z, max)` |
| `foot_world_y_min(side, min_y)` | Foot world-y floor (no clipping below ground) |
| `mirror_symmetry(left_joint, right_joint, tolerance_deg, at_phases=None)` | Left/right symmetric joints stay symmetric |

### Failure surface

```
✗ FAIL  shin_vertical(side=left)        frame=9   observed=23.4°    expected ≤ 10°
✗ FAIL  hip_no_lateral_drift            frame=180 observed=0.087m   expected ≤ 0.050m
✓ PASS  joint_angle_at(hip_flex.L)      frame=9   observed=104.2°   expected in [90, 110]
...
2 failed, 14 passed.  No MP4 written.
```

### Adding new primitives

Adding a new primitive is intentional friction. The skill body says: prefer composing existing primitives; only add a new primitive when a class of failure is not expressible by combinations of existing ones. Keeps the library small and the spec vocabulary stable.

## Build pipeline (`animate.py`)

CLI: `python scripts/animate.py <exercise>` (run from `expo/app/`).

Internally launches Blender background mode (`blender --background --python scripts/animate.py -- <exercise>`).

### Steps

1. **Resolve spec.** Import `exercise_specs.<exercise>`. Verify required module attrs. Assert `NAME == module basename`. Empty `VALIDATORS` is rejected.
2. **Open rig.** Load `assets/blender/casual_man_rigged.blend` into a fresh `bpy` scene. The pristine file is opened read-only; all mutations happen on the in-memory copy.
3. **Reset to T-pose.** Clear any existing animation data on the armature so spec-driven motion is built from a known baseline.
4. **Resolve phase frames.** Walk `PHASES`, accumulate durations, compute integer frame numbers. Build `phase_name → frame_idx` map (for wildcard resolution in validators).
5. **Emit keyframes.** For each phase, set bone targets at end-frame; the library auto-interpolates from previous phase. Inserts position/rotation keyframes.
6. **Run validators.** Every `VALIDATORS` entry runs; collect all `ValidationResult` rows; print the formatted table.
7. **Gate.** If any validator failed: exit code 2, no render, no .blend save. Console table is the fix-it diagnostic.
8. **Apply scene config.** Camera preset, lighting preset, resolution, FPS from `cameras.py` registry.
9. **Render.** Encode MP4 via Blender's FFmpeg backend → `assets/exercise-renders/<exercise>.mp4`.
10. **Save .blend.** `assets/blender/casual_man_<exercise>.blend` (gitignored debug artifact).

### Flags

- `--no-render` — runs steps 1–7 only. Fast iteration on validators while authoring a spec.
- `--keep-blend` — explicit opt-in for saving the .blend even on validator failure (default: only save on success).
- `--frame N` — render a single frame as PNG instead of MP4. Spot-check poses without waiting for full encode.

### Exit codes

- `0` — render succeeded
- `1` — spec module error (missing attrs, import failure)
- `2` — validator failure (table printed)
- `3` — render error (Blender / FFmpeg)

The skill body and any future automation distinguishes "spec is wrong" (2) from "tooling broke" (3).

## Camera registry

`scripts/animation_lib/cameras.py` is the central registry. Specs reference presets by name. Adding a preset requires documenting the angle and intended use case.

Initial presets (defined as part of the pilot work):

| Name | Position / framing | Use case |
|---|---|---|
| `front` | Eye-level, ~3m back, full-body framed | Default. Squat, high_knees, jumping_jacks, lunge_jumps, etc. |
| `side_left` | Eye-level, ~3m to subject's right, full-body | Plank, pushup, side_plank, glute_bridges |
| `three_quarter` | 3/4 view, ~3m back-left | Reserved. Adds variety; not used by pilot |

Lighting presets (initial set: just `studio` — neutral 3-point lighting). Resolution preset on initial set: `(800, 800)` matching current pipeline.

The `front` preset is the only one exercised by the pilot. `side_left` is stubbed out in the registry to prove the lookup mechanism works without committing to its tuning.

## Skill body (`SKILL.md`)

### Frontmatter

```yaml
---
name: blender-exercise-animation
description: Use when authoring or updating an exercise demo animation for the GymAI app. Triggers — "create/update animation for <exercise>", "fix the <exercise> demo", any work in scripts/exercise_specs/, scripts/animation_lib/, or assets/blender/casual_man_*. Rig-specific to casual_man_rigged.blend (Mixamo bone names).
---
```

### Body sections (terse playbook)

1. **What this skill is.** Spec-driven animation authoring. Rig is `casual_man_rigged.blend` (Mixamo bones). Validators are non-negotiable. Output overwrites `assets/exercise-renders/<exercise>.mp4`.
2. **The rig.** Mixamo bone names; reference `animation_lib/rig.py:Bones`. `casual_man_rigged.blend` is read-only. Use `animate.py`, never open in Blender to mutate.
3. **Authoring a spec.** Copy a similar exercise. Required attrs listed. Phases declare end-of-phase pose; library interpolates. Validators are mandatory. Prefer composing existing primitives over adding new ones.
4. **Build & iterate.** CLI examples for `animate.py` with each flag. Fix the spec, not the validator. Loosening a validator without a documented reason is a smell.
5. **Output.** MP4 path (overwrites; app consumes). Per-exercise .blend (gitignored, debug only).
6. **What NOT to do.** Don't mutate the rigged source. Don't use FBX overlay as a workaround. Don't touch `xbot_exercises.blend` or `render-exercises.py` (legacy). Don't render before validators pass.
7. **Adding a camera/lighting preset.** Central registry only; document angle + use case; reference by name from specs.
8. **Migration path.** One exercise per PR: spec module + MP4 + (optional) deletion of corresponding line from `render-exercises.py`. Delete `render-exercises.py` and `xbot_exercises.blend` only when all 40 are migrated.

## Pilot scope (high_knees)

### Deliverable

- `scripts/exercise_specs/high_knees.py` — fully procedural, no FBX dependency, < 80 lines excluding imports
- `scripts/animation_lib/` — full library (rig, pose, motion, validators, cameras, render)
- `scripts/animate.py` — CLI driver
- `expo/app/.claude/skills/blender-exercise-animation/SKILL.md` — skill body
- `assets/exercise-renders/high_knees.mp4` — overwrites existing
- `.gitignore` updated to exclude `assets/blender/casual_man_<*>.blend`

### Pilot motion

- 6 second clip @ 30 FPS (180 frames)
- 10 alternating leg-lift cycles (20 phases of 0.3s: 10 `lift_left_*`, 10 `lift_right_*`)
- Arms swing in counter-rhythm (right-arm-up when left-knee-up, mirror)
- Camera: `front` preset

### Required validators (all must pass)

The validator list from the worked example above is the pilot acceptance gate. Every validator must report `passed=True`.

### Acceptance criteria

1. `python scripts/animate.py high_knees` exits 0
2. All 10 validators pass with their numeric readouts shown
3. Resulting `high_knees.mp4` shows: vertical shins at peak, no hip wobble, alternating arm swing, no foot clipping below ground
4. Spec module is < 80 lines (excluding imports) — proves the format is concise
5. Side-by-side visual comparison vs the existing `high_knees.mp4` (XBot pipeline) shows no visible regression — at minimum equal quality, ideally cleaner cadence and pose

### Out of scope for the pilot (deferred to follow-up PRs)

- FBX overlay support — first non-procedural-friendly exercise (likely `shadow_boxing`) introduces it
- Migration of the other 39 exercises — each is a follow-up PR using the proven pilot as template
- Visual screenshot review — added later if geometric validators prove insufficient
- Deleting `render-exercises.py` and `xbot_exercises.blend` — only after all 40 are migrated

## Open questions for implementation phase

- Exact Blender version assumed (the local install used by `render-exercises.py`). The implementation plan should pin this and verify the rig file opens cleanly.
- How `animate.py` shells into Blender (subprocess vs `blender --python ... -- args`) — affects how the spec name is passed in. Implementation detail.
- Whether `cycle()` should be parametric on swing arm phase (left arm leads vs right arm leads). Pilot can hardcode; generalize when a second cyclic exercise needs it.
- Gitignore rule for `casual_man_<*>.blend` — confirm it doesn't accidentally exclude the pristine `casual_man_rigged.blend`.

## Risks

- **Procedural arm swing looks robotic.** Mitigation: validator for shoulder/elbow joint-velocity-max keeps the swing smooth; if the result still looks uncanny, the FBX-overlay path is the fallback (deferred).
- **Camera framing for `casual_man_rigged.blend` differs from XBot.** Mitigation: pilot includes one explicit camera preset; if framing is off, tune the preset, not per-spec.
- **Existing `high_knees.mp4` is acceptable; overwriting could regress.** Mitigation: pilot acceptance includes side-by-side visual check vs current MP4 before merge.
