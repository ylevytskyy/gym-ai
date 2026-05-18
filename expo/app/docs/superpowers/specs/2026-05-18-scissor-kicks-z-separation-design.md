# scissor_kicks vertical Z-separation fix

## Problem

In the current `scripts/exercise_specs/scissor_kicks.py` rendering, the two legs visibly clip through each other at the cross-over moment of each rep. The user-reported symptom: "legs go through each other but they should go under and above each other."

Visual evidence: at the cross phase, the left and right feet sit at almost identical world-Z (≈0.70 m), so the leg meshes intersect rather than passing above/below.

## Root cause

The spec uses a `±2°` hip-flexion differential at each cross to designate which leg is "over":

- `_HIP_HIGH = +47°` (over leg)
- `_HIP_LOW  = +43°` (under leg)

With a thigh length of 0.86 m, that 4° spread yields a heel-Z gap of only:

```
0.86 × (sin(47°) − sin(43°)) ≈ 0.86 × (0.7314 − 0.6820) ≈ 0.042 m  (~4 cm)
```

The leg geometry (thigh/calf cross-section) is wider than 4 cm, so the meshes overlap regardless of which leg is keyframed as "on top."

## Decision

Keep the exercise's defining motion (supine lateral crisscross — legs spread to an open V, then adduct past midline so ankles cross), per the cited research and the catalog's `inner_thighs` body-part target. **Do not** convert to a vertical scissor — that variant already exists as `flutter_kicks.py`.

Increase the hip-flexion differential at the cross moment so the over/under leg are visibly separated in world-Z, eliminating mesh intersection.

### Values (chosen: moderate separation)

| Constant         | Old | New  | Heel world-Z @ hip joint 0.09 m |
|------------------|-----|------|---------------------------------|
| `_HIP_HIGH`      | +47 | **+55** | 0.09 + 0.86·sin(55°) ≈ 0.79 m |
| `_HIP_BASE`      | +45 | +45  | 0.09 + 0.86·sin(45°) ≈ 0.70 m |
| `_HIP_LOW`       | +43 | **+35** | 0.09 + 0.86·sin(35°) ≈ 0.58 m |

Heel-Z gap at the cross: **≈ 21 cm** (was ≈ 4 cm). Comfortably larger than any leg cross-section, so no clipping is geometrically possible.

The open-V phases (`_OPEN_V`) keep both legs symmetric at `_HIP_BASE = +45°` — unchanged. Only the two cross phases (`_CROSS_R_OVER`, `_CROSS_L_OVER`) widen.

## Validators that change

Two range validators in `VALIDATORS` currently gate `LeftUpLeg/RightUpLeg X` at `min_deg=40, max_deg=50`. These must widen to cover the new endpoints + Bezier overshoot tolerance:

```python
min_deg = 32,   # was 40; covers _HIP_LOW=35 minus 3° interp overshoot
max_deg = 58,   # was 50; covers _HIP_HIGH=55 plus 3° interp overshoot
```

The per-phase `joint_angle_at` validators already reference `_HIP_HIGH`, `_HIP_LOW`, `_HIP_BASE` symbolically (`min_deg: _HIP_HIGH - 2`, etc.), so they update automatically when the constants change. No edits needed on those.

## What does NOT change

- The lateral abduction angles `_Z_OPEN = 15`, `_Z_CROSS = 10` — unchanged. The horizontal V→cross motion is preserved exactly.
- The supine baseline, hand IK pins, camera (`front_top_left`), phase structure (4 cycles × 4 phases), timing (2.4 s/cycle, 9.8 s total).
- All world-space gates (hip drift, foot-min-Y).
- The `_KNEE_STRAIGHT = 0` constant; knees stay extended.

## Docstring updates

The docstring's "Pose geometry" section currently claims:

> "Over" differentiation: at each cross, the elevated leg's hip flex is +47 (slightly higher), the under leg's hip flex is +43. The 4° hip-flex differential moves the elevated heel ~6 cm further up than the under heel — subtle but enough to read which leg is "on top" from a 3/4 camera. Heels never drop (both legs stay at ≥43° flex, well above any floor-contact threshold).

This becomes outdated. Update to reflect the new values:

> "Over" differentiation: at each cross, the elevated leg's hip flex is +55 (heel ≈ 0.79 m), the under leg's hip flex is +35 (heel ≈ 0.58 m). The 20° hip-flex differential produces a ~21 cm heel-Z gap at the cross moment — large enough that the leg meshes cleanly pass above/below each other with no clipping. The under leg's heel stays at 0.58 m, well above any floor-contact threshold.

## Verification

1. Re-render: `python3 scripts/render-exercises.py --only scissor_kicks`.
2. Confirm validators still pass (the script reports validator results in stdout).
3. Visually inspect the resulting MP4: at every cross frame, one leg should be visibly above the other in screen-Z, no mesh intersection.

## Risk / non-risk

- **No risk** to other exercises — this spec is self-contained; no shared constants or library code are touched.
- The wider hip-flex range pushes the upper leg further toward the body (55° > 45°), shortening the visual "leg held high" silhouette slightly. Acceptable trade for fixing the clip.
- The lower leg at 35° puts the heel at 0.58 m — still 58 cm above the floor, well clear of `foot_world_y_min: 0.40` gate.

## Out of scope

- No catalog / locale string changes.
- No changes to `flutter_kicks` (already correct for its variant).
- No changes to camera, timing, IK rig setup, or the `inner_thighs` targeting in `exercises.json`.
