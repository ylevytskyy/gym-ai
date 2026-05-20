# scissor_kicks Z-Separation Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the `scissor_kicks` Blender animation so the legs visibly pass above/below each other at the cross moment instead of clipping through each other.

**Architecture:** Single-file change to the procedural pose spec at `scripts/exercise_specs/scissor_kicks.py`. The motion structure (supine lateral crisscross — open V → cross past midline) is preserved; only the hip-flexion differential between "over" and "under" leg at the cross moment is widened, and two validator ranges are widened to match. The output MP4 lives at `assets/exercise-renders/scissor-kicks.mp4` and is auto-discovered by the app.

**Tech Stack:** Python 3 (Blender background mode), bpy, existing `animation_lib.validators`. No JS/TS code involved.

**Reference spec:** `docs/superpowers/specs/2026-05-18-scissor-kicks-z-separation-design.md`

---

## File Structure

**Files modified:**
- `scripts/exercise_specs/scissor_kicks.py` — change two constants, update one docstring paragraph, widen two validator ranges. ~10 lines touched.

**Files regenerated (build artifacts, not source):**
- `assets/exercise-renders/scissor-kicks.mp4` — re-rendered output. Committed alongside source.
- `assets/blender/casual_man_scissor_kicks.blend` — saved as render byproduct.

**No new files. No files deleted.**

---

## Task 1: Edit constants and docstring in scissor_kicks.py

**Files:**
- Modify: `scripts/exercise_specs/scissor_kicks.py:66-71` (docstring "Over differentiation" paragraph)
- Modify: `scripts/exercise_specs/scissor_kicks.py:108-110` (HIGH/BASE/LOW constants)
- Modify: `scripts/exercise_specs/scissor_kicks.py:206-209` (two `joint_angle_range` validators)

- [ ] **Step 1: Update the "Over differentiation" docstring paragraph**

Replace the paragraph at `scripts/exercise_specs/scissor_kicks.py:66-71` (the one starting `- "Over" differentiation: at each cross, the elevated leg's hip flex is +47`) with this new text:

```
- "Over" differentiation: at each cross, the elevated leg's hip flex is
  +55 (heel ≈ 0.79 m), the under leg's hip flex is +35 (heel ≈ 0.58 m).
  The 20° hip-flex differential produces a ~21 cm heel-Z gap at the
  cross moment — large enough that the leg meshes cleanly pass above/
  below each other with no clipping. The under leg's heel stays at
  0.58 m, well above any floor-contact threshold.
```

Geometry double-check (don't write into the file, just verify before editing): `sin(55°) ≈ 0.819 → 0.09 + 0.86×0.819 ≈ 0.794 m`; `sin(35°) ≈ 0.574 → 0.09 + 0.86×0.574 ≈ 0.583 m`; gap ≈ 0.211 m.

- [ ] **Step 2: Change the three hip-flex constants**

At `scripts/exercise_specs/scissor_kicks.py:108-110`, replace:

```python
_HIP_HIGH = +47    # the "over" leg at each cross
_HIP_BASE = +45    # the open-V both-equal elevation
_HIP_LOW  = +43    # the "under" leg at each cross
```

with:

```python
_HIP_HIGH = +55    # the "over" leg at each cross (heel ≈ 0.79 m)
_HIP_BASE = +45    # the open-V both-equal elevation (heel ≈ 0.70 m)
_HIP_LOW  = +35    # the "under" leg at each cross (heel ≈ 0.58 m)
```

`_HIP_BASE` is unchanged; only the comment is enriched for symmetry with the others. The two pose dicts `_CROSS_R_OVER` and `_CROSS_L_OVER` already reference these constants symbolically (lines 145-146 and 157-158), so they pick up the new values automatically. The per-phase `joint_angle_at` validators (lines 226-245) also reference them symbolically and update automatically.

- [ ] **Step 3: Widen the two `joint_angle_range` validators**

At `scripts/exercise_specs/scissor_kicks.py:206-209`, replace:

```python
    # Hip flexion stays in the elevated working range across the whole
    # animation (no heel drop). The four discrete pose values are 43,
    # 45, 47; range gate [40, 50] covers all three + tolerance for
    # Bezier overshoot during transitions.
    (joint_angle_range, {"joint": ("mixamorig:LeftUpLeg", "X"),
                         "min_deg": 40, "max_deg": 50}),
    (joint_angle_range, {"joint": ("mixamorig:RightUpLeg", "X"),
                         "min_deg": 40, "max_deg": 50}),
```

with:

```python
    # Hip flexion stays in the elevated working range across the whole
    # animation (no heel drop). The three discrete pose values are 35,
    # 45, 55; range gate [32, 58] covers all three + 3° tolerance for
    # Bezier overshoot during transitions.
    (joint_angle_range, {"joint": ("mixamorig:LeftUpLeg", "X"),
                         "min_deg": 32, "max_deg": 58}),
    (joint_angle_range, {"joint": ("mixamorig:RightUpLeg", "X"),
                         "min_deg": 32, "max_deg": 58}),
```

- [ ] **Step 4: Sanity-check the diff**

Run:

```bash
git diff scripts/exercise_specs/scissor_kicks.py
```

Expected: exactly three logical changes — (a) docstring paragraph rewrite for "Over differentiation", (b) the three constants block updated, (c) the two `joint_angle_range` blocks widened. No other lines touched. No accidental whitespace churn elsewhere in the file.

---

## Task 2: Re-render and confirm validators pass

**Files:**
- No source files modified in this task.
- Output: `assets/exercise-renders/scissor-kicks.mp4` (overwritten)
- Output: `assets/blender/casual_man_scissor_kicks.blend` (overwritten)

- [ ] **Step 1: Re-render via `animate.py`**

From `/media/lion/Data/Projects/GymAI/expo/app`, run:

```bash
python3 scripts/animate.py scissor_kicks 2>&1 | tee /tmp/scissor_kicks_render.log
```

This re-execs Blender in background mode, opens the rig, applies the spec, runs validators, and (if they pass) writes MP4 + .blend.

Expected to take ~30-90 seconds depending on system. Use `run_in_background: true` if dispatched as a subagent; foreground if in interactive shell.

- [ ] **Step 2: Verify all validators passed**

Inspect the tail of `/tmp/scissor_kicks_render.log`. Expected pattern:

```
  ✓ PASS  joint_angle_at(...)                                ...
  ✓ PASS  joint_angle_range(...)                             ...
  [...]
  ────────────────────────────────────────────────────────────────────────────────
  0 failed, N passed
```

with `0 failed` and the final lines:

```
WROTE /media/lion/Data/Projects/GymAI/expo/app/assets/exercise-renders/scissor-kicks.mp4
WROTE /media/lion/Data/Projects/GymAI/expo/app/assets/blender/casual_man_scissor_kicks.blend
```

If validators FAIL: do NOT proceed. Read the failed validator messages. Most likely failure modes and fixes:
- `joint_angle_range` on `LeftUpLeg/RightUpLeg X` fails with `observed=XX.X` outside `[32, 58]` → the Bezier overshoot is larger than ±3°; widen the range to `[30, 60]` and re-render. Update the comment to match.
- `joint_angle_at` on `cross_*` phases fails with `observed=XX.X` outside `_HIP_LOW ± 2` or `_HIP_HIGH ± 2` → unexpected; suggests a Python error in the constant edit. Re-read the file at the edit site to confirm the value matches the spec.
- `foot_world_y_min` fails (heel below 0.40 m) → arithmetic error; `_HIP_LOW = +35` should give heel-Z ≈ 0.58 m, well above 0.40. Reconfirm constant.

Fix and re-render until all validators pass.

- [ ] **Step 3: Confirm MP4 was written and has expected duration**

```bash
ls -la assets/exercise-renders/scissor-kicks.mp4
ffprobe -v error -show_entries format=duration -of csv=p=0 assets/exercise-renders/scissor-kicks.mp4
```

Expected:
- File exists, mtime within the last minute.
- Duration ≈ **9.8 s** (matches the spec's `0.2 + 4 × 2.4 = 9.8 s` phase total). Anything off by more than 0.2 s suggests the phase structure was disturbed — investigate.

---

## Task 3: Visual verification of cross-moment separation

**Files:**
- No source files modified.
- Reads: `assets/exercise-renders/scissor-kicks.mp4`
- Temporary: `/tmp/scissor_*.png` (frame extracts; deleted at end)

- [ ] **Step 1: Extract frames at each of the 8 cross moments**

The phase structure is `settle (0.2s) + 4 cycles × [cross_R, open, cross_L, open] × 0.6s each`. Cross moments are at the END of `cross_R_i` and `cross_L_i` phases:
- `cross_R_0` end: t ≈ 0.2 + 0.6 = 0.8 s
- `cross_L_0` end: t ≈ 0.2 + 1.8 = 2.0 s
- `cross_R_1` end: t ≈ 0.2 + 3.0 = 3.2 s
- `cross_L_1` end: t ≈ 0.2 + 4.2 = 4.4 s
- `cross_R_2` end: t ≈ 0.2 + 5.4 = 5.6 s
- `cross_L_2` end: t ≈ 0.2 + 6.6 = 6.8 s
- `cross_R_3` end: t ≈ 0.2 + 7.8 = 8.0 s
- `cross_L_3` end: t ≈ 0.2 + 9.0 = 9.2 s

Pull four representative frames (one R-over and one L-over from early and late cycles, to confirm no drift):

```bash
ffmpeg -y -loglevel error -i assets/exercise-renders/scissor-kicks.mp4 -vf "select='eq(n,24)+eq(n,60)+eq(n,168)+eq(n,276)'" -vsync vfr /tmp/scissor_%02d.png
```

Frame indices: `24` (≈0.8s, cross_R_0 end), `60` (≈2.0s, cross_L_0 end), `168` (≈5.6s, cross_R_2 end), `276` (≈9.2s, cross_L_3 end). FPS = 30.

Expected: four PNG files written.

- [ ] **Step 2: Visually inspect each frame**

Read each PNG and confirm at each cross moment:
1. **One foot/leg is clearly above the other in screen-Z** — no mesh intersection.
2. **The over leg alternates** — `cross_R_*` frames show the right leg higher, `cross_L_*` frames show the left leg higher.
3. **Both heels are still above the floor** — neither foot is touching ground level.
4. **The lateral crisscross is preserved** — feet have crossed past midline (left foot on character-right side, right foot on character-left side).

If any frame still shows clipping/intersection: increase the differential further (e.g., HIGH=+60, LOW=+30) and return to Task 2 Step 1.

- [ ] **Step 3: Clean up temp files**

```bash
rm -f /tmp/scissor_*.png /tmp/scissor_kicks_render.log
```

---

## Task 4: Commit the change

**Files staged:**
- `scripts/exercise_specs/scissor_kicks.py`
- `assets/exercise-renders/scissor-kicks.mp4`
- `assets/blender/casual_man_scissor_kicks.blend` (if tracked — check `git status` first)
- `docs/superpowers/specs/2026-05-18-scissor-kicks-z-separation-design.md`
- `docs/superpowers/plans/2026-05-18-scissor-kicks-z-separation.md`

- [ ] **Step 1: Inspect status to confirm only intended files changed**

```bash
git status
git diff --stat
```

Expected: the five files listed above. If `scissor_kicks.fbx` shows as untracked, ignore it (the FBX is a Mixamo-source asset, not regenerated by `animate.py` — the procedural spec replaces it conceptually but doesn't delete it).

If unexpected files appear (e.g., other exercises' MP4s touched), investigate before staging. The blend file under `assets/blender/casual_man_*.blend` may not be tracked in git — check `git ls-files` to confirm before staging.

- [ ] **Step 2: Stage and commit**

```bash
git add scripts/exercise_specs/scissor_kicks.py \
        assets/exercise-renders/scissor-kicks.mp4 \
        docs/superpowers/specs/2026-05-18-scissor-kicks-z-separation-design.md \
        docs/superpowers/plans/2026-05-18-scissor-kicks-z-separation.md

# Conditionally stage the blend file only if it's tracked
git ls-files --error-unmatch assets/blender/casual_man_scissor_kicks.blend 2>/dev/null \
  && git add assets/blender/casual_man_scissor_kicks.blend

git commit -m "$(cat <<'EOF'
fix(blender): scissor_kicks legs pass above/below at cross instead of clipping

Widen the hip-flex differential at the cross moment from ±2° to ±10°
(_HIP_HIGH +47→+55, _HIP_LOW +43→+35) so the over and under legs are
separated by ~21 cm in world-Z, eliminating mesh intersection. The
lateral crisscross motion (open V → cross past midline) is unchanged;
only the over/under vertical readability improves.

Validator ranges on LeftUpLeg/RightUpLeg X widened to [32, 58] to cover
the new endpoints plus Bezier overshoot tolerance.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: Verify commit landed cleanly**

```bash
git status
git log -1 --stat
```

Expected: clean working tree, latest commit shows the staged files.

**Do not push.** The user pushes when they're ready.

---

## Out of scope (do NOT touch in this plan)

- Other exercise specs (flutter_kicks, dead_bug, etc.).
- The animation_lib library (motion, validators, rig, etc.).
- The catalog entry `exercises.json:scissor-kicks` — body_parts/MET/etc. stay as-is.
- Locale strings.
- App-side rendering or playback code.
- The Mixamo FBX `assets/blender/animations/scissor_kicks.fbx` — leave it. The procedural spec is now the source.
