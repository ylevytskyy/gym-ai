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

---

## Iteration 2 — endpoint fix was insufficient

Visual review of the v1 render (commit `ace5d27`) confirmed that the cross **endpoints** (frames 24, 60, 168, 276) had clean ~21 cm separation as designed — but the **transitions between them** still clip. The user provided a screenshot showing legs stacked near the body midline. Frame 15 (midpoint of `cross_R_0` phase, t≈0.5s) reproduces the clip exactly.

### Root cause

The 0.6 s cross phase animates **both** axes simultaneously:
- Hip-flex X: 45° → 55° (over) and 45° → 35° (under) — heights diverge gradually
- Hip-Z: ±15° → ∓10° — passes through 0 (legs aligned at body midline) at transition midpoint

At t ≈ 0.5 of the cross phase:
- Heights are only halfway differentiated: HIGH ≈ 50°, LOW ≈ 40° → heel gap ≈ 11 cm
- Lateral Z is near 0 → both feet at the body midline laterally
- Thigh midpoints are ~5.6 cm apart → less than thigh diameter → **mesh intersection**

The endpoints clear because the full 21 cm gap is established before any lateral overlap occurs at the extreme cross positions. The endpoints' validators caught nothing because they only sample phase boundaries, not interior frames where Bezier interpolation produces the in-betweens.

### Decision

Apply **both** of the user-approved fixes simultaneously:

1. **Widen the differential further** to `HIGH = +60°` / `LOW = +30°` (was +55° / +35°). New endpoint heel gap ≈ 31 cm. Transition midpoint heel gap (if the old single-phase structure were kept) would rise from 11 cm to ~16 cm — borderline, but the next fix removes the problem entirely.
2. **Route the cross through an intermediate `LIFT` pose** that has heights already differentiated but legs still laterally spread. Each 0.6 s cross phase splits into two 0.3 s sub-phases:
   - `lift_R_in`  (0.3 s): `OPEN_V → LIFT_R`. Only X (height) changes; legs stay at Z=±15° abduction.
   - `cross_R`    (0.3 s): `LIFT_R → CROSS_R_OVER`. Only Z (lateral) changes; heights stay at 60°/30°.
   - `lift_R_out` (0.3 s): `CROSS_R_OVER → LIFT_R`. Mirror of cross_R — legs un-cross laterally.
   - `open_R`     (0.3 s): `LIFT_R → OPEN_V`. Heights return to base.

With this routing, whenever the legs are laterally close (Z near 0), the full 31 cm vertical gap is already established. No Bezier midpoint can co-locate both legs.

### New constants and poses

```python
_HIP_HIGH = +60    # over leg at each cross (heel ≈ 0.84 m)
_HIP_BASE = +45    # open-V both-equal elevation (heel ≈ 0.70 m)
_HIP_LOW  = +30    # under leg at each cross (heel ≈ 0.52 m)

_LIFT_R = {  # heights diverged, legs still laterally spread
    **_SUPINE,
    LeftUpLeg X = _HIP_LOW,   LeftUpLeg Z = -_Z_OPEN,
    RightUpLeg X = _HIP_HIGH, RightUpLeg Z = +_Z_OPEN,
    knees straight,
}
_LIFT_L = mirror of _LIFT_R (Left=HIGH, Right=LOW; Z values same as OPEN_V)
```

### New phase structure

`0.2 s settle + 4 × [lift_R_in, cross_R, lift_R_out, open_R, lift_L_in, cross_L, lift_L_out, open_L] × 0.3 s` = **9.8 s total** (unchanged).

### Validator updates

- `joint_angle_range` on `LeftUpLeg/RightUpLeg X`: widen from `[32, 58]` to `[27, 63]` (covers 30°/45°/60° + 3° Bezier overshoot).
- Add new `joint_angle_at` validators for `lift_R_*` and `lift_L_*` phases checking each leg's X and Z at the LIFT pose.
- Existing per-phase validators on `cross_R_*`, `cross_L_*`, `open_*` keep working unchanged (the wildcards match the new `open_R_*` and `open_L_*` phase names).

### Geometry sanity (v2)

| Pose      | LeftUpLeg X | RightUpLeg X | Heel L (m) | Heel R (m) | Gap (m) |
|-----------|-------------|--------------|------------|------------|---------|
| OPEN_V    | 45          | 45           | 0.70       | 0.70       | 0       |
| LIFT_R    | 30 (low)    | 60 (high)    | 0.52       | 0.84       | 0.32    |
| CROSS_R   | 30 (low)    | 60 (high)    | 0.52       | 0.84       | 0.32    |
| LIFT_L    | 60 (high)   | 30 (low)     | 0.84       | 0.52       | 0.32    |
| CROSS_L   | 60 (high)   | 30 (low)     | 0.84       | 0.52       | 0.32    |

Between `lift_*` and `cross_*` only Z changes — vertical 0.32 m gap is constant during the lateral cross.

---

## Iteration 3 — vertical scissor IN the V phase

User feedback after v2 visual review: the height *change* (one leg going up, the other going down) should be a visible motion **inside the V (spread) phase**, not jammed into the V→X or X→V transitions. In v2 the V phases were held at equal heights (HIP_BASE for both) and the height differential only appeared at the LIFT/CROSS poses. From the user's perspective the visible "scissor" should be the vertical swap of which leg is on top, happening while the legs are spread laterally.

A side-finding during the v2 review: the OPEN_V pose (both legs at HIP_BASE with Z=±15°) does not render as a visible "V" from the `front_top_left` camera — the lateral abduction projects mostly into screen-depth, so the legs appear stacked even though they're 60 cm apart in world coords. Only when heights are differentiated does the V become visually unambiguous.

### Decision (v3)

- **Drop the OPEN_V (equal-heights) pose entirely.** Heights are always differentiated.
- **Rename LIFT_R / LIFT_L → V_R_HIGH / V_L_HIGH** to reflect that these are the V positions (legs spread + heights differentiated).
- **The "scissor" motion is the height swap during a V phase.** Phase `swap_to_L` morphs `V_R_HIGH → V_L_HIGH` — both X values change simultaneously while Z stays at ±15° (legs remain laterally spread). At the swap midpoint, both legs are momentarily at HIP_BASE=45° but laterally 60 cm apart → they pass each other vertically with full clearance, no clipping geometrically possible.
- **Lateral cross to X happens with heights held constant.** Phase `cross_in_L` morphs `V_L_HIGH → X_L_OVER` (only Z changes; heights stay at 60°/30°). Phase `cross_out_L` mirrors back.

### Timing (user-selected)

Each cycle = 2.4 s, distributed:
- `swap_to_L` 0.9 s (slow, deliberate vertical scissor)
- `cross_in_L` 0.15 s + `cross_out_L` 0.15 s (fast lateral cross + return)
- `swap_to_R` 0.9 s (slow scissor back)
- `cross_in_R` 0.15 s + `cross_out_R` 0.15 s

V scissor consumes 75% of each cycle (1.8 s of 2.4 s); the lateral cross is a quick punctuation.

4 cycles × 2.4 s + 0.2 s settle = **9.8 s** (unchanged).

### Phase structure

```
settle (0.2 s)               hold _V_R_HIGH
for i in 4 cycles:
    swap_to_L_i  (0.9 s)     _V_R_HIGH → _V_L_HIGH  (X swap; Z held at ±15°)
    cross_in_L_i (0.15 s)    _V_L_HIGH → _X_L_OVER  (Z only; X held)
    cross_out_L_i (0.15 s)   _X_L_OVER → _V_L_HIGH  (Z back; X held)
    swap_to_R_i  (0.9 s)     _V_L_HIGH → _V_R_HIGH  (X swap; Z held at ±15°)
    cross_in_R_i (0.15 s)    _V_R_HIGH → _X_R_OVER
    cross_out_R_i (0.15 s)   _X_R_OVER → _V_R_HIGH
```

Final phase ends at `_V_R_HIGH` (matches settle) for seamless loop.

### Pose dictionaries (v3)

| Pose       | LeftUpLeg X | RightUpLeg X | LeftUpLeg Z | RightUpLeg Z |
|------------|-------------|--------------|-------------|--------------|
| `_V_R_HIGH`| 30 (LOW)    | 60 (HIGH)    | −15 (spread)| +15 (spread) |
| `_V_L_HIGH`| 60 (HIGH)   | 30 (LOW)     | −15 (spread)| +15 (spread) |
| `_X_R_OVER`| 30 (LOW)    | 60 (HIGH)    | +10 (cross) | −10 (cross)  |
| `_X_L_OVER`| 60 (HIGH)   | 30 (LOW)     | +10 (cross) | −10 (cross)  |

Note: `_V_R_HIGH == _LIFT_R` from v2 (same numerical values, renamed for clarity). Same for `_V_L_HIGH == _LIFT_L`. The `_OPEN_V` from v1/v2 is removed.

### Validator updates

- Drop the `settle, open_*` validators (no more OPEN_V pose).
- Replace `lift_R_*` / `lift_L_*` validators with `V_R_*` / `V_L_*` (matching the new phase names — they validate the SAME pose values, just under new wildcard).
- Wildcards for new phase names: `swap_to_L_*`, `swap_to_R_*`, `cross_in_L_*`, `cross_out_L_*`, `cross_in_R_*`, `cross_out_R_*`.
- Hips X validator's `at_phases` list: include `settle` and all the new phase wildcards.
- `joint_angle_range` on `LeftUpLeg/RightUpLeg X` keeps `[27, 63]` (covers 30°/45°/60° including swap-midpoint baseline + 3° Bezier overshoot).

### What disappears from the v2 implementation

- `_OPEN_V` pose dict.
- Validators referencing `at_phases: ["settle", "open_*"]` for OPEN_V.
- The `lift_R_in / lift_R_out / open_R / lift_L_in / lift_L_out / open_L` phase names are replaced by `swap_to_L / cross_in_L / cross_out_L / swap_to_R / cross_in_R / cross_out_R`.
