# scissor_kicks v3 — Vertical Scissor in V, Held-Height Cross

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure `scissor_kicks.py` so the visible "scissor" motion is the vertical height swap WHILE legs are spread in V, and the lateral cross to X happens with heights held constant.

**Architecture:** Drop the equal-heights OPEN_V pose. Keep four differentiated poses (V_R_HIGH, V_L_HIGH, X_R_OVER, X_L_OVER). Cycle phases: long V-swap (heights cross vertically while legs stay spread laterally), then brief lateral cross-in / cross-out (heights held). Each cycle has two such swap+cross half-cycles (one each for L-over and R-over). All clipping risk is geometrically eliminated: during swap, lateral gap is 60 cm so vertical crossing is harmless; during lateral cross, vertical gap is 31 cm so lateral overlap is harmless.

**Tech Stack:** Python 3 (Blender background mode), `bpy`, existing `animation_lib.{motion,validators}`. No JS/TS code.

**Reference spec:** `docs/superpowers/specs/2026-05-18-scissor-kicks-z-separation-design.md` — see the "Iteration 3" section at the bottom.

---

## File Structure

**Files modified:**
- `scripts/exercise_specs/scissor_kicks.py` — full restructure of pose dicts, PHASES, VALIDATORS, and docstring. ~120 lines of changes.

**Files regenerated (build artifacts):**
- `assets/exercise-renders/scissor-kicks.mp4` — re-rendered output.
- `assets/blender/casual_man_scissor_kicks.blend` — gitignored, regenerated.

**No new files. No files deleted.**

---

## Task 1: Apply the v3 restructure to scissor_kicks.py

**Files:**
- Modify: `scripts/exercise_specs/scissor_kicks.py` (full file sections — docstring tail, constants comment, pose dicts, PHASES, VALIDATORS).

The current (post-v2) file has `_OPEN_V`, `_CROSS_R_OVER`, `_CROSS_L_OVER`, `_LIFT_R`, `_LIFT_L` pose dicts, an 8-subphase-per-cycle PHASES block, and ~25 validators. The v3 restructure renames LIFT poses to V_HIGH, deletes OPEN_V, restructures PHASES to 6 sub-phases per cycle, and updates validators.

- [ ] **Step 1: Read the file to understand the current state.**

```bash
wc -l scripts/exercise_specs/scissor_kicks.py
```

Then Read the whole file. The implementer must understand:
- Lines ~66-78: docstring "Over differentiation" + "Cross-transition routing" paragraphs (need rewrite).
- Lines ~84-88: docstring "Phase structure" paragraph (need rewrite).
- Lines ~113-118: section-header comment above constants (need rewrite).
- Lines ~119-121: `_HIP_HIGH`, `_HIP_BASE`, `_HIP_LOW` constants (unchanged in v3 — keep 60, 45, 30).
- Lines ~142-150: `_OPEN_V` pose dict (DELETE in v3).
- Lines ~152-198 area: `_CROSS_R_OVER`, `_CROSS_L_OVER`, `_LIFT_R`, `_LIFT_L` pose dicts (RENAME and REORDER).
- Lines ~218-238 area: PHASES block (FULL REPLACE).
- Lines ~240-end: VALIDATORS block (FULL REPLACE).

- [ ] **Step 2: Rewrite the "Over differentiation" + "Cross-transition routing" docstring block.**

The two paragraphs (currently lines 66-78 in the post-v2 file) should be replaced as a single Edit. Find the exact text:

```
- "Over" differentiation: at each cross, the elevated leg's hip flex is
  +60 (heel ≈ 0.84 m), the under leg's hip flex is +30 (heel ≈ 0.52 m).
  The 30° hip-flex differential produces a ~31 cm heel-Z gap at the
  cross moment.
- Cross-transition routing: the 0.6 s "open V → cross" move is split
  into two 0.3 s sub-phases through an intermediate LIFT pose where
  heights have already diverged but legs are still laterally spread.
  (lift_R_in: only X changes, heights diverge while legs stay at
  Z=±15° abduction. cross_R: only Z changes, lateral cross happens
  while heights stay at HIGH/LOW). This guarantees that at the moment
  legs cross the body midline laterally (Z passing through 0), the
  full 31 cm vertical gap is already established — no single-axis
  Bezier midpoint can put both legs at midline and same height.
```

Replace with:

```
- "Over" differentiation: heights are ALWAYS differentiated — the
  elevated leg's hip flex is +60 (heel ≈ 0.84 m) and the under leg's
  is +30 (heel ≈ 0.52 m), for a ~31 cm heel-Z gap at every moment
  EXCEPT the instantaneous midpoint of a vertical swap.
- Motion routing: the visible "scissor" is the vertical height swap
  in the V (spread) phase — both legs change X simultaneously while
  Z stays at OPEN abduction (±15°). At the swap midpoint, both legs
  are momentarily at HIP_BASE=45° but laterally 60 cm apart in world
  coords (the spread keeps them clear of each other). The lateral
  cross to X happens with heights held constant at HIGH/LOW, so the
  31 cm vertical gap is maintained throughout the lateral motion.
  There is no moment where both legs are at the same height AND the
  same lateral position — mesh intersection is geometrically impossible.
```

- [ ] **Step 3: Rewrite the "Phase structure" docstring paragraph.**

Find (lines ~84-88):

```
Phase structure: 0.2 s settle (OPEN V) then 4 full crisscross cycles
at 2.4 s/cycle (8 sub-phases × 0.3 s each: lift_R_in → cross_R →
lift_R_out → open_R → lift_L_in → cross_L → lift_L_out → open_L).
Total: 0.2 + 4×2.4 = 9.8 s. Final phase = OPEN matches frame 0
(settle = OPEN) for a seamless loop.
```

Replace with:

```
Phase structure: 0.2 s settle (V with R high) then 4 full crisscross
cycles at 2.4 s/cycle. Each cycle = 6 sub-phases:
  swap_to_L (0.9 s)   — vertical scissor: heights cross while spread
  cross_in_L (0.15 s) — quick lateral cross to X with L on top
  cross_out_L (0.15 s)— quick lateral uncross back to V
  swap_to_R (0.9 s)   — vertical scissor back
  cross_in_R (0.15 s)
  cross_out_R (0.15 s)
The slow V-swap (75% of cycle time) reads as the dominant scissor;
the lateral cross is a quick punctuation between swaps. Final phase
ends at _V_R_HIGH (matches settle) for seamless loop.
Total: 0.2 + 4×2.4 = 9.8 s.
```

- [ ] **Step 4: Rewrite the section-header comment above the constants block.**

Find (lines 113-118):

```python
# Hip-flexion levels — both legs held high throughout. ±15° around the
# canonical 45° working angle differentiates which leg is "on top" at
# each cross by ~31 cm of heel-Z separation. The cross is routed
# through an intermediate LIFT pose (see _LIFT_R / _LIFT_L) so the
# height differential is fully established BEFORE the lateral cross
# happens — guarantees no mid-transition mesh intersection.
```

Replace with:

```python
# Hip-flexion levels — heights ALWAYS differentiated (no equal-height
# pose exists in v3). HIGH (+60°) and LOW (+30°) are the "over" and
# "under" leg at each moment; HIP_BASE (+45°) is the instantaneous
# value at the midpoint of a vertical swap (legs momentarily equal in
# Z but laterally 60 cm apart, so no clipping). The visible scissor
# is the swap of which leg is on top, happening WHILE legs are spread
# in V; the lateral X-cross happens with heights held at HIGH/LOW.
```

(The three constant definitions on the following lines stay unchanged: `_HIP_HIGH = +60`, `_HIP_BASE = +45`, `_HIP_LOW  = +30`.)

- [ ] **Step 5: Delete the `_OPEN_V` pose dict and its preceding comment block.**

Find the block:

```python
# Both legs spread to an open V at the canonical 45° elevation.
# Z sign convention (empirically verified by render iteration on
# 2026-05-17): with X=+45 already applied, LeftUpLeg Z=NEGATIVE swings
# the left leg toward character-LEFT (world +X) = lateral abduction.
# Positive Z swings the leg toward character-RIGHT = adduction/cross
# past midline. RightUpLeg axes are identical (per the ledger: both leg
# bones share local-X = world -X), so for the right leg to abduct
# laterally toward character-RIGHT (world -X), use Z=POSITIVE. This
# inverted-from-naive convention bit the first author of this spec; the
# theoretical analysis predicted the opposite signs from what renders
# show. Don't try to re-derive it — the working values below are the
# verified ground truth.
_OPEN_V = {
    **_SUPINE,
    ("mixamorig:LeftUpLeg",  "X"): _HIP_BASE,
    ("mixamorig:RightUpLeg", "X"): _HIP_BASE,
    ("mixamorig:LeftUpLeg",  "Z"): -_Z_OPEN,    # negative = left leg abducts to char-LEFT
    ("mixamorig:RightUpLeg", "Z"): +_Z_OPEN,    # positive = right leg abducts to char-RIGHT
    ("mixamorig:LeftLeg",    "X"): _KNEE_STRAIGHT,
    ("mixamorig:RightLeg",   "X"): _KNEE_STRAIGHT,
}
```

Replace the entire block (comment + pose dict) with a new comment block introducing the Z-sign convention but no _OPEN_V pose:

```python
# Z sign convention (empirically verified by render iteration on
# 2026-05-17): with X already applied, LeftUpLeg Z=NEGATIVE swings
# the left leg toward character-LEFT (world +X) = lateral abduction.
# Positive Z swings the leg toward character-RIGHT = adduction/cross
# past midline. RightUpLeg axes are identical (per the ledger: both leg
# bones share local-X = world -X), so for the right leg to abduct
# laterally toward character-RIGHT (world -X), use Z=POSITIVE. This
# inverted-from-naive convention bit the first author of this spec; the
# theoretical analysis predicted the opposite signs from what renders
# show. Don't try to re-derive it — the working values below are the
# verified ground truth.
```

(No pose dict here. The four poses follow.)

- [ ] **Step 6: Replace the existing CROSS / LIFT pose dicts with the four v3 poses (renamed).**

Find the existing pose dicts. In the current file these are `_CROSS_R_OVER`, `_CROSS_L_OVER`, `_LIFT_R`, `_LIFT_L`, with surrounding comment blocks. The replacement is the four pose dicts below, in this order, with the V poses preceding the X poses:

```python
# V_R_HIGH — legs spread laterally (Z=±_Z_OPEN), right leg elevated to
# HIGH, left dropped to LOW. This is the "V with R on top" pose.
_V_R_HIGH = {
    **_SUPINE,
    ("mixamorig:LeftUpLeg",  "X"): _HIP_LOW,    # left = under (heel ≈ 0.52 m)
    ("mixamorig:RightUpLeg", "X"): _HIP_HIGH,   # right = over (heel ≈ 0.84 m)
    ("mixamorig:LeftUpLeg",  "Z"): -_Z_OPEN,    # spread to char-LEFT
    ("mixamorig:RightUpLeg", "Z"): +_Z_OPEN,    # spread to char-RIGHT
    ("mixamorig:LeftLeg",    "X"): _KNEE_STRAIGHT,
    ("mixamorig:RightLeg",   "X"): _KNEE_STRAIGHT,
}

# V_L_HIGH — mirror of V_R_HIGH: left leg elevated, right dropped.
_V_L_HIGH = {
    **_SUPINE,
    ("mixamorig:LeftUpLeg",  "X"): _HIP_HIGH,   # left = over
    ("mixamorig:RightUpLeg", "X"): _HIP_LOW,    # right = under
    ("mixamorig:LeftUpLeg",  "Z"): -_Z_OPEN,    # still spread to char-LEFT
    ("mixamorig:RightUpLeg", "Z"): +_Z_OPEN,    # still spread to char-RIGHT
    ("mixamorig:LeftLeg",    "X"): _KNEE_STRAIGHT,
    ("mixamorig:RightLeg",   "X"): _KNEE_STRAIGHT,
}

# X_R_OVER — legs crossed past midline (Z=∓_Z_CROSS), right elevated.
# Reached from V_R_HIGH by changing only Z (heights held at HIGH/LOW).
_X_R_OVER = {
    **_SUPINE,
    ("mixamorig:LeftUpLeg",  "X"): _HIP_LOW,    # left = under
    ("mixamorig:RightUpLeg", "X"): _HIP_HIGH,   # right = over
    ("mixamorig:LeftUpLeg",  "Z"): +_Z_CROSS,   # left ankle crosses to char-RIGHT
    ("mixamorig:RightUpLeg", "Z"): -_Z_CROSS,   # right ankle crosses to char-LEFT
    ("mixamorig:LeftLeg",    "X"): _KNEE_STRAIGHT,
    ("mixamorig:RightLeg",   "X"): _KNEE_STRAIGHT,
}

# X_L_OVER — mirror of X_R_OVER: left over, right under, same lateral cross.
_X_L_OVER = {
    **_SUPINE,
    ("mixamorig:LeftUpLeg",  "X"): _HIP_HIGH,   # left = over
    ("mixamorig:RightUpLeg", "X"): _HIP_LOW,    # right = under
    ("mixamorig:LeftUpLeg",  "Z"): +_Z_CROSS,
    ("mixamorig:RightUpLeg", "Z"): -_Z_CROSS,
    ("mixamorig:LeftLeg",    "X"): _KNEE_STRAIGHT,
    ("mixamorig:RightLeg",   "X"): _KNEE_STRAIGHT,
}
```

- [ ] **Step 7: Replace the PHASES block.**

Find the existing PHASES block (the comment + `_CYCLES = 4` + PHASES list + for-loop with 8 appends). Replace with:

```python
# 0.2 s settle (frame 0 holds _V_R_HIGH) + 4 full scissor cycles at
# 2.4 s/cycle. Each cycle = 6 sub-phases: long V-swap (0.9 s, the
# visible vertical scissor while legs are spread) + brief lateral
# cross_in + cross_out (0.15 s each), twice per cycle (one for L
# over, one for R over). Final phase ends at _V_R_HIGH (matches
# settle) for seamless loop.
_CYCLES = 4
PHASES = [
    phase(0.2, _V_R_HIGH, name="settle"),
]
for _i in range(_CYCLES):
    # L-over half-cycle: vertical scissor to L, brief lateral cross to X_L
    PHASES.append(phase(0.9,  _V_L_HIGH, name=f"swap_to_L_{_i}"))
    PHASES.append(phase(0.15, _X_L_OVER, name=f"cross_in_L_{_i}"))
    PHASES.append(phase(0.15, _V_L_HIGH, name=f"cross_out_L_{_i}"))
    # R-over half-cycle: vertical scissor back to R, brief lateral cross to X_R
    PHASES.append(phase(0.9,  _V_R_HIGH, name=f"swap_to_R_{_i}"))
    PHASES.append(phase(0.15, _X_R_OVER, name=f"cross_in_R_{_i}"))
    PHASES.append(phase(0.15, _V_R_HIGH, name=f"cross_out_R_{_i}"))
```

- [ ] **Step 8: Replace the VALIDATORS block.**

Find the existing `VALIDATORS = [` ... closing `]` block. Replace with:

```python
VALIDATORS = [
    # Supine baseline holds throughout — Hips X stays near -90°.
    (joint_angle_at, {"joint": ("mixamorig:Hips", "X"),
                      "at_phases": ["settle", "swap_*", "cross_in_*", "cross_out_*"],
                      "min_deg": -93, "max_deg": -87}),

    # Hip flexion stays in the elevated working range across the whole
    # animation (no heel drop). Three discrete pose values are 30, 45,
    # 60 (45 only at swap midpoint); range gate [27, 63] covers all
    # three + 3° tolerance for Bezier overshoot during transitions.
    (joint_angle_range, {"joint": ("mixamorig:LeftUpLeg", "X"),
                         "min_deg": 27, "max_deg": 63}),
    (joint_angle_range, {"joint": ("mixamorig:RightUpLeg", "X"),
                         "min_deg": 27, "max_deg": 63}),

    # V_R_HIGH — settle + swap_to_R end + cross_out_R end all hold this pose.
    # Left = LOW (30), Right = HIGH (60), both spread (Z=±_Z_OPEN).
    (joint_angle_at, {"joint": ("mixamorig:LeftUpLeg", "X"),
                      "at_phases": ["settle", "swap_to_R_*", "cross_out_R_*"],
                      "min_deg": _HIP_LOW - 2, "max_deg": _HIP_LOW + 2}),
    (joint_angle_at, {"joint": ("mixamorig:RightUpLeg", "X"),
                      "at_phases": ["settle", "swap_to_R_*", "cross_out_R_*"],
                      "min_deg": _HIP_HIGH - 2, "max_deg": _HIP_HIGH + 2}),
    (joint_angle_at, {"joint": ("mixamorig:LeftUpLeg", "Z"),
                      "at_phases": ["settle", "swap_to_R_*", "cross_out_R_*"],
                      "min_deg": -_Z_OPEN - 2, "max_deg": -_Z_OPEN + 2}),
    (joint_angle_at, {"joint": ("mixamorig:RightUpLeg", "Z"),
                      "at_phases": ["settle", "swap_to_R_*", "cross_out_R_*"],
                      "min_deg": +_Z_OPEN - 2, "max_deg": +_Z_OPEN + 2}),

    # V_L_HIGH — swap_to_L end + cross_out_L end. Mirror of V_R_HIGH heights.
    (joint_angle_at, {"joint": ("mixamorig:LeftUpLeg", "X"),
                      "at_phases": ["swap_to_L_*", "cross_out_L_*"],
                      "min_deg": _HIP_HIGH - 2, "max_deg": _HIP_HIGH + 2}),
    (joint_angle_at, {"joint": ("mixamorig:RightUpLeg", "X"),
                      "at_phases": ["swap_to_L_*", "cross_out_L_*"],
                      "min_deg": _HIP_LOW - 2, "max_deg": _HIP_LOW + 2}),
    (joint_angle_at, {"joint": ("mixamorig:LeftUpLeg", "Z"),
                      "at_phases": ["swap_to_L_*", "cross_out_L_*"],
                      "min_deg": -_Z_OPEN - 2, "max_deg": -_Z_OPEN + 2}),
    (joint_angle_at, {"joint": ("mixamorig:RightUpLeg", "Z"),
                      "at_phases": ["swap_to_L_*", "cross_out_L_*"],
                      "min_deg": +_Z_OPEN - 2, "max_deg": +_Z_OPEN + 2}),

    # X_R_OVER — cross_in_R end. Right over, lateral cross past midline.
    (joint_angle_at, {"joint": ("mixamorig:LeftUpLeg", "X"),
                      "at_phases": ["cross_in_R_*"],
                      "min_deg": _HIP_LOW - 2, "max_deg": _HIP_LOW + 2}),
    (joint_angle_at, {"joint": ("mixamorig:RightUpLeg", "X"),
                      "at_phases": ["cross_in_R_*"],
                      "min_deg": _HIP_HIGH - 2, "max_deg": _HIP_HIGH + 2}),
    (joint_angle_at, {"joint": ("mixamorig:LeftUpLeg", "Z"),
                      "at_phases": ["cross_in_R_*"],
                      "min_deg": +_Z_CROSS - 2, "max_deg": +_Z_CROSS + 2}),
    (joint_angle_at, {"joint": ("mixamorig:RightUpLeg", "Z"),
                      "at_phases": ["cross_in_R_*"],
                      "min_deg": -_Z_CROSS - 2, "max_deg": -_Z_CROSS + 2}),

    # X_L_OVER — cross_in_L end. Left over, same lateral cross positions.
    (joint_angle_at, {"joint": ("mixamorig:LeftUpLeg", "X"),
                      "at_phases": ["cross_in_L_*"],
                      "min_deg": _HIP_HIGH - 2, "max_deg": _HIP_HIGH + 2}),
    (joint_angle_at, {"joint": ("mixamorig:RightUpLeg", "X"),
                      "at_phases": ["cross_in_L_*"],
                      "min_deg": _HIP_LOW - 2, "max_deg": _HIP_LOW + 2}),
    (joint_angle_at, {"joint": ("mixamorig:LeftUpLeg", "Z"),
                      "at_phases": ["cross_in_L_*"],
                      "min_deg": +_Z_CROSS - 2, "max_deg": +_Z_CROSS + 2}),
    (joint_angle_at, {"joint": ("mixamorig:RightUpLeg", "Z"),
                      "at_phases": ["cross_in_L_*"],
                      "min_deg": -_Z_CROSS - 2, "max_deg": -_Z_CROSS + 2}),

    # Knees stay near-straight throughout.
    (joint_angle_range, {"joint": ("mixamorig:LeftLeg", "X"),
                         "min_deg": -3, "max_deg": +3}),
    (joint_angle_range, {"joint": ("mixamorig:RightLeg", "X"),
                         "min_deg": -3, "max_deg": +3}),

    # World-space gates — body stays planted on floor, no drift.
    (hip_no_lateral_drift,    {"max_meters": 0.02}),
    (hip_no_sagittal_drift,   {"max_meters": 0.02}),
    (world_position_drift_max, {"bone": "mixamorig:Hips", "axis": "Z",
                                "max_meters": 0.02}),

    # Feet (ankle bone HEAD) well above floor throughout. LOW elevation
    # X=+30 → ankle Z ≈ 0.52 m; threshold 0.40 m gives headroom while
    # catching any catastrophic floor drop.
    (foot_world_y_min, {"side": "both", "min_y": 0.40}),
]
```

- [ ] **Step 9: Verify the file parses and the diff is contained.**

Run:

```bash
python3 -m py_compile scripts/exercise_specs/scissor_kicks.py
git diff scripts/exercise_specs/scissor_kicks.py | wc -l
git diff --stat scripts/exercise_specs/scissor_kicks.py
```

Expected: py_compile exits 0; the diff is contained to the regions described in Steps 2-8 (no unrelated changes to imports, NAME/FPS/CAMERA/LIGHTING, _SUPINE, the constants block themselves, _Z_OPEN/_Z_CROSS/_KNEE_STRAIGHT, IK_PINS, IK_CHAIN_COUNTS, IK_POLE_TARGETS).

If the diff touches unrelated regions, revert and re-apply just the intended edits. If py_compile fails, fix the syntax error before reporting back.

---

## Task 2: Re-render and confirm validators pass

**Files:**
- No source files modified.
- Output overwritten: `assets/exercise-renders/scissor-kicks.mp4`, `assets/blender/casual_man_scissor_kicks.blend`.

- [ ] **Step 1: Run `animate.py`.**

From `/media/lion/Data/Projects/GymAI/expo/app`:

```bash
python3 scripts/animate.py scissor_kicks 2>&1 | tee /tmp/scissor_v3_render.log | tail -50
```

Expected runtime: ~60-90 seconds. The script re-execs into Blender background mode.

- [ ] **Step 2: Confirm all validators passed.**

Inspect the tail of `/tmp/scissor_v3_render.log`. The last lines should match:

```
  ✓ PASS  joint_angle_at(...)
  [...many lines...]
────────────────────────────────────────────────────────────────────────────────
  0 failed, N passed

Info: Saved "casual_man_scissor_kicks.blend"
WROTE /media/lion/Data/Projects/GymAI/expo/app/assets/exercise-renders/scissor-kicks.mp4
WROTE /media/lion/Data/Projects/GymAI/expo/app/assets/blender/casual_man_scissor_kicks.blend
```

`N` should be in the 100-180 range (the validator set is similar to v2's count, with `lift_*` renamed to `swap_to_*` / `cross_out_*`).

**Failure modes and fixes:**
- `joint_angle_range` on `LeftUpLeg/RightUpLeg X` fails with observed outside `[27, 63]` → Bezier overshoot exceeds ±3°; widen to `[25, 65]` in the spec (Step 8) and re-render. Update the comment to match.
- `joint_angle_at` on `swap_to_*` phases fails with the observed not matching `_HIP_HIGH ± 2` or `_HIP_LOW ± 2` → the swap_to phase end pose is being interpreted incorrectly; re-read the swap_to_L/swap_to_R entries in the PHASES block and confirm they reference `_V_L_HIGH` / `_V_R_HIGH` (not swapped).
- `foot_world_y_min` fails (heel below 0.40 m) → unexpected; LOW=30° gives heel 0.52 m. Check if any Bezier interior frame dips lower. If true, lower threshold to 0.35.

Fix and re-render until 0 failed.

- [ ] **Step 3: Confirm MP4 metadata.**

```bash
ls -la assets/exercise-renders/scissor-kicks.mp4
ffprobe -v error -show_entries format=duration -of csv=p=0 assets/exercise-renders/scissor-kicks.mp4
```

Expected:
- mtime within the last few minutes.
- Duration = `9.833` s (= 9.8 s rounded to 30 fps boundaries: 295 frames / 30 fps).

If duration differs by more than 0.2 s, the phase totals don't sum to 9.8 s — recompute and fix.

---

## Task 3: Visually verify the v3 motion

**Files:**
- Reads: `assets/exercise-renders/scissor-kicks.mp4`.
- Temporary: `/tmp/v3_check_*.png`.

The v3 motion has these key moments to inspect. With FPS=30 and the phase timings, each sub-phase has the following end-frame:

| Sub-phase            | Duration | End frame (cycle 0) |
|----------------------|----------|---------------------|
| settle               | 0.2 s    | 6                   |
| swap_to_L_0          | 0.9 s    | 33                  |
| cross_in_L_0         | 0.15 s   | 37                  |
| cross_out_L_0        | 0.15 s   | 42                  |
| swap_to_R_0          | 0.9 s    | 69                  |
| cross_in_R_0         | 0.15 s   | 73                  |
| cross_out_R_0        | 0.15 s   | 78                  |

(Frame end values are `round(time_seconds × 30)`; the renderer may use exact bake or rounding, so accept ±1 frame slack.)

Cycle 1 starts at frame 78 with `swap_to_L_1`.

Critical frames to verify:
- **Frame 6**: settle endpoint = V_R_HIGH. Legs spread, right high, left low.
- **Frame 19**: swap_to_L_0 midpoint (between frame 6 and frame 33). Both legs momentarily near HIP_BASE=45° but spread to Z=±15°. They are crossing vertically past each other with full lateral clearance. **No clipping geometrically possible** but verify visually.
- **Frame 33**: swap_to_L_0 endpoint = V_L_HIGH. Legs spread, left high, right low.
- **Frame 37**: cross_in_L_0 endpoint = X_L_OVER. Lateral cross with L over.
- **Frame 42**: cross_out_L_0 endpoint = back to V_L_HIGH.
- **Frame 55**: swap_to_R_0 midpoint. Mirror of frame 19.
- **Frame 69**: swap_to_R_0 endpoint = back to V_R_HIGH.
- **Frame 73**: cross_in_R_0 endpoint = X_R_OVER. Lateral cross with R over.

Across cycles, the endpoint values repeat. One late-cycle endpoint frame is sufficient to confirm no drift.

- [ ] **Step 1: Extract the critical frames.**

```bash
ffmpeg -y -loglevel error -i assets/exercise-renders/scissor-kicks.mp4 \
  -vf "select='eq(n,6)+eq(n,19)+eq(n,33)+eq(n,37)+eq(n,42)+eq(n,55)+eq(n,69)+eq(n,73)'" \
  -vsync vfr /tmp/v3_check_%02d.png
ls -la /tmp/v3_check_*.png
```

Eight files: `/tmp/v3_check_01.png` through `_08.png` corresponding to frames 6, 19, 33, 37, 42, 55, 69, 73 in order. These cover the full first cycle. Cycle-consistency is verified by the validators, not by this visual check.

- [ ] **Step 2: Read each PNG and verify.**

For each frame, check:
1. **Legs separated** — no leg-mesh intersection anywhere (thighs, calves, feet).
2. **Pose matches expected**:
   - Frame 6 (V_R_HIGH): right leg up, left leg down, legs visibly spread laterally (not stacked).
   - Frame 19 (swap midpoint): both legs near same height (45°) but spread laterally; legs are passing each other vertically.
   - Frame 33 (V_L_HIGH): left leg up, right leg down, legs spread.
   - Frame 37 (X_L_OVER): left leg up, right leg down, legs crossed past midline.
   - Frame 42 (back to V_L_HIGH): legs spread again, L still up.
   - Frame 55 (swap_to_R midpoint): mirror of frame 19.
   - Frame 69 (V_R_HIGH): R back on top.
   - Frame 73 (X_R_OVER): R on top, legs crossed.

3. **Swap midpoint risk** (frames 19 and 55): both legs at HIP_BASE=45° with Z=±15°. In world coords the lateral gap should be ~60 cm; from the camera angle, the legs might LOOK close together on screen but in 3D they should NOT collide. Look specifically for mesh intersection — overlapping silhouette polygons, merged limb geometry. If they're visually close but show distinct edges with a visible gap (even if narrow), that's fine.

- [ ] **Step 3: Clean up.**

If PASS:
```bash
rm -f /tmp/v3_check_*.png /tmp/scissor_v3_render.log
```

If FAIL: keep the files and report which frame(s) clip with specific descriptions.

---

## Task 4: Commit the v3 fix

**Files staged:**
- `scripts/exercise_specs/scissor_kicks.py`
- `assets/exercise-renders/scissor-kicks.mp4`
- `docs/superpowers/specs/2026-05-18-scissor-kicks-z-separation-design.md` (the v3 Iteration addendum)
- `docs/superpowers/plans/2026-05-18-scissor-kicks-v3-vertical-scissor-in-V.md` (this plan file)

- [ ] **Step 1: Status check.**

```bash
git status --short
```

Confirm:
- The four files above are listed as modified or new.
- The pre-existing modifications (`ios/AuraFit.xcodeproj/project.pbxproj`, `scripts/animation_lib/rig.py`, `scripts/render-exercises.py`) are still present but UNSTAGED — they must NOT be included in this commit.

- [ ] **Step 2: Stage and commit.**

```bash
git add scripts/exercise_specs/scissor_kicks.py \
        assets/exercise-renders/scissor-kicks.mp4\
        docs/superpowers/specs/2026-05-18-scissor-kicks-z-separation-design.md \
        docs/superpowers/plans/2026-05-18-scissor-kicks-v3-vertical-scissor-in-V.md

git status --short  # verify only the intended files are staged

git commit -m "$(cat <<'EOF'
fix(blender): scissor_kicks v3 — vertical scissor IN V, lateral cross with held heights

User feedback after v2: the visible "scissor" motion (the swap of
which leg is on top) should happen WHILE legs are spread in V, not
during the V→X transition. Also: the OPEN_V pose (equal heights)
doesn't read as a "V" from the front_top_left camera — the lateral
abduction projects mostly into screen depth.

v3 restructure:
- Drop OPEN_V entirely. Heights are ALWAYS differentiated (HIGH=60,
  LOW=30 — no equal-height held pose).
- Rename LIFT_R/LIFT_L → V_R_HIGH/V_L_HIGH (these ARE the V poses
  in v3; the LIFT naming was misleading).
- New cycle: 6 sub-phases × 2.4 s/cycle:
    swap_to_L (0.9 s)    — vertical scissor: heights cross while spread
    cross_in_L (0.15 s)  — quick lateral cross to X_L_OVER
    cross_out_L (0.15 s) — quick lateral uncross back to V_L_HIGH
    swap_to_R (0.9 s)    — vertical scissor back
    cross_in_R (0.15 s)
    cross_out_R (0.15 s)
- The slow V-swap consumes 75% of each cycle; the lateral cross is
  a quick punctuation between swaps.

Clipping is geometrically impossible: heights stay differentiated
during all lateral motion (31 cm world gap), and the legs only
equalize heights at the instantaneous midpoint of a vertical swap,
where they are 60 cm apart laterally.

Total length 9.8 s unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: Verify commit landed.**

```bash
git log -1 --stat
```

Expected: four files in the commit (one binary, three text), clean working tree (except pre-existing unstaged changes).

**Do not push.** The user pushes when ready.

---

## Out of scope

- No changes to other exercise specs (flutter_kicks, dead_bug, etc.).
- No changes to the animation_lib library.
- No changes to `exercises.json` catalog or locale strings.
- No changes to camera/lighting setup or IK rig.
- The MP4 in `assets/exercise-renders/` is the only build artifact this commit regenerates; `casual_man_scissor_kicks.blend` is gitignored and not committed.
