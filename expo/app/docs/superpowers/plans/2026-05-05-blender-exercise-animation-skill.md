# Blender Exercise Animation Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a project-level skill that produces validated, deterministic Blender animations for exercise demos targeting `casual_man_rigged.blend`, with `high_knees` rendered through the new pipeline as the proof of concept.

**Architecture:** Spec-driven. Each exercise is a Python module declaring phases + validators + camera. A CLI driver (`animate.py`) opens `casual_man_rigged.blend` (read-only), emits keyframes from the spec, captures pose data per frame, runs geometric validators against the captured data, gates the render on validators passing, then writes an MP4 + per-exercise `.blend`. Validators are pure functions over captured pose data so they're trivially testable.

**Tech Stack:** Python 3, Blender Python API (`bpy`, runs inside Blender background), `pytest` (new test runner for the `scripts/` workspace; pure-Python parts only).

**Working directory for all paths and commands:** `expo/app/`

**Reference spec:** `docs/superpowers/specs/2026-05-05-blender-exercise-animation-skill-design.md`

---

### Task 1: Bootstrap — directories, gitignore, pytest config

**Files:**
- Create: `scripts/animation_lib/__init__.py`
- Create: `scripts/exercise_specs/__init__.py`
- Create: `scripts/tests/__init__.py`
- Create: `scripts/pyproject.toml`
- Modify: `.gitignore`
- Force-add: `assets/blender/casual_man_rigged.blend` (currently gitignored)

- [ ] **Step 1: Create empty package files**

```bash
mkdir -p scripts/animation_lib scripts/exercise_specs scripts/tests
touch scripts/animation_lib/__init__.py scripts/exercise_specs/__init__.py scripts/tests/__init__.py
```

- [ ] **Step 2: Add `pyproject.toml` for pytest config**

Create `scripts/pyproject.toml`:

```toml
[tool.pytest.ini_options]
testpaths = ["tests"]
python_files = ["test_*.py"]
addopts = "-v --tb=short"
```

- [ ] **Step 3: Update `.gitignore` to track the pristine rig and exclude debug artifacts**

The current `.gitignore` line `assets/blender/*.blend` excludes everything. Replace it with:

```gitignore
# Blender working files (regenerable from FBX or from spec modules)
assets/blender/*.blend
assets/blender/*.blend1
# But keep the pristine rig source — it's the input, not a build artifact
!assets/blender/casual_man_rigged.blend
```

- [ ] **Step 4: Force-add the pristine rig file**

```bash
git add -f assets/blender/casual_man_rigged.blend
```

Verify it's staged:

```bash
git diff --cached --stat | grep casual_man_rigged
```

Expected: `assets/blender/casual_man_rigged.blend | Bin 0 -> 3175224 bytes`

- [ ] **Step 5: Install pytest**

```bash
pip3 install pytest
```

Verify:

```bash
cd scripts && python3 -m pytest --version
```

Expected: `pytest 7.x` or newer.

- [ ] **Step 6: Add a smoke test to verify discovery**

Create `scripts/tests/test_smoke.py`:

```python
def test_pytest_discovery_works():
    assert True
```

Run:

```bash
cd scripts && python3 -m pytest tests/test_smoke.py -v
```

Expected: `1 passed`.

- [ ] **Step 7: Commit**

```bash
git add scripts/animation_lib scripts/exercise_specs scripts/tests scripts/pyproject.toml .gitignore assets/blender/casual_man_rigged.blend
git commit -m "chore(blender): bootstrap animation_lib + pytest + commit pristine rig"
```

---

### Task 2: `cameras.py` — preset registry

**Files:**
- Create: `scripts/animation_lib/cameras.py`
- Create: `scripts/tests/test_cameras.py`

- [ ] **Step 1: Write failing test**

Create `scripts/tests/test_cameras.py`:

```python
import pytest
from animation_lib.cameras import get_camera_preset, get_lighting_preset, DEFAULT_RESOLUTION


def test_front_preset_has_required_fields():
    p = get_camera_preset("front")
    assert p.position == (0.0, -3.0, 1.0)
    assert p.target == (0.0, 0.0, 1.0)
    assert p.fov_deg == 35


def test_side_left_preset_exists_for_future_use():
    p = get_camera_preset("side_left")
    assert p is not None


def test_unknown_camera_preset_raises():
    with pytest.raises(KeyError, match="unknown camera preset"):
        get_camera_preset("nope")


def test_studio_lighting_preset_exists():
    p = get_lighting_preset("studio")
    assert len(p.lights) >= 3  # 3-point lighting minimum


def test_default_resolution():
    assert DEFAULT_RESOLUTION == (800, 800)
```

Need to make tests find `animation_lib`:

Add to `scripts/conftest.py`:

```python
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
```

- [ ] **Step 2: Run test to verify failure**

```bash
cd scripts && python3 -m pytest tests/test_cameras.py -v
```

Expected: `ImportError: animation_lib.cameras`.

- [ ] **Step 3: Implement `cameras.py`**

Create `scripts/animation_lib/cameras.py`:

```python
"""Named camera and lighting presets. Specs reference these by name."""
from dataclasses import dataclass, field


@dataclass(frozen=True)
class CameraPreset:
    position: tuple[float, float, float]
    target: tuple[float, float, float]
    fov_deg: float


@dataclass(frozen=True)
class LightSpec:
    kind: str  # "sun", "area", "point"
    position: tuple[float, float, float]
    energy: float
    color: tuple[float, float, float] = (1.0, 1.0, 1.0)


@dataclass(frozen=True)
class LightingPreset:
    lights: tuple[LightSpec, ...] = field(default_factory=tuple)


_CAMERAS = {
    "front": CameraPreset(position=(0.0, -3.0, 1.0), target=(0.0, 0.0, 1.0), fov_deg=35),
    "side_left": CameraPreset(position=(3.0, 0.0, 1.0), target=(0.0, 0.0, 1.0), fov_deg=35),
    "three_quarter": CameraPreset(position=(2.1, -2.1, 1.2), target=(0.0, 0.0, 1.0), fov_deg=35),
}

_LIGHTING = {
    "studio": LightingPreset(lights=(
        LightSpec(kind="area", position=(-2.0, -2.0, 3.0), energy=500),  # key
        LightSpec(kind="area", position=(2.0, -1.0, 2.5), energy=250),   # fill
        LightSpec(kind="area", position=(0.0, 2.0, 3.0), energy=300),    # back
    )),
}

DEFAULT_RESOLUTION = (800, 800)


def get_camera_preset(name: str) -> CameraPreset:
    if name not in _CAMERAS:
        raise KeyError(f"unknown camera preset: {name!r}. Known: {list(_CAMERAS)}")
    return _CAMERAS[name]


def get_lighting_preset(name: str) -> LightingPreset:
    if name not in _LIGHTING:
        raise KeyError(f"unknown lighting preset: {name!r}. Known: {list(_LIGHTING)}")
    return _LIGHTING[name]
```

- [ ] **Step 4: Run tests to verify pass**

```bash
cd scripts && python3 -m pytest tests/test_cameras.py -v
```

Expected: `5 passed`.

- [ ] **Step 5: Commit**

```bash
git add scripts/animation_lib/cameras.py scripts/tests/test_cameras.py scripts/conftest.py
git commit -m "feat(blender): camera + lighting preset registry"
```

---

### Task 3: `motion.py` — Phase, phase(), hold(), cycle()

**Files:**
- Create: `scripts/animation_lib/motion.py`
- Create: `scripts/tests/test_motion.py`

- [ ] **Step 1: Write failing tests**

Create `scripts/tests/test_motion.py`:

```python
from animation_lib.motion import Phase, phase, hold, cycle


def test_phase_basic():
    p = phase(0.3, {"hip.L": 100}, name="lift_left")
    assert p.duration_sec == 0.3
    assert p.name == "lift_left"
    assert p.pose == {"hip.L": 100}


def test_phase_auto_names_when_missing():
    p = phase(0.3, {})
    assert p.name.startswith("phase_")


def test_phase_auto_names_are_unique():
    a = phase(0.3, {})
    b = phase(0.3, {})
    assert a.name != b.name


def test_hold_emits_empty_pose():
    h = hold(1.0, name="bottom")
    assert h.duration_sec == 1.0
    assert h.pose == {}
    assert h.name == "bottom"


def test_cycle_alternates_left_right():
    phases = cycle(reps=2, step_sec=0.3, left_pose={"a": 1}, right_pose={"b": 2})
    assert len(phases) == 4
    assert phases[0].name == "lift_left_0"
    assert phases[0].pose == {"a": 1}
    assert phases[1].name == "lift_right_0"
    assert phases[1].pose == {"b": 2}
    assert phases[2].name == "lift_left_1"
    assert phases[3].name == "lift_right_1"


def test_cycle_zero_reps_returns_empty():
    assert cycle(reps=0, step_sec=0.3, left_pose={}, right_pose={}) == []


def test_cycle_step_sec_propagates():
    [p] = cycle(reps=1, step_sec=0.5, left_pose={"a": 1}, right_pose={"b": 2})[0:1]
    assert p.duration_sec == 0.5
```

- [ ] **Step 2: Run test to verify failure**

```bash
cd scripts && python3 -m pytest tests/test_motion.py -v
```

Expected: `ImportError: animation_lib.motion`.

- [ ] **Step 3: Implement `motion.py`**

Create `scripts/animation_lib/motion.py`:

```python
"""Phase definitions and motion-shape factory helpers used by exercise specs."""
from dataclasses import dataclass, field
from itertools import count

_auto_phase_counter = count()


@dataclass(frozen=True)
class Phase:
    duration_sec: float
    pose: dict   # {joint_constant_or_str: angle_deg or (axis_overrides)}
    name: str


def phase(duration_sec: float, pose: dict, name: str | None = None) -> Phase:
    if name is None:
        name = f"phase_{next(_auto_phase_counter)}"
    return Phase(duration_sec=duration_sec, pose=dict(pose), name=name)


def hold(duration_sec: float, name: str | None = None) -> Phase:
    return phase(duration_sec, {}, name=name)


def cycle(
    reps: int,
    step_sec: float,
    left_pose: dict,
    right_pose: dict,
) -> list[Phase]:
    """Emit `reps * 2` alternating phases named lift_left_<i> and lift_right_<i>."""
    out: list[Phase] = []
    for i in range(reps):
        out.append(phase(step_sec, left_pose, name=f"lift_left_{i}"))
        out.append(phase(step_sec, right_pose, name=f"lift_right_{i}"))
    return out
```

- [ ] **Step 4: Run tests to verify pass**

```bash
cd scripts && python3 -m pytest tests/test_motion.py -v
```

Expected: `7 passed`.

- [ ] **Step 5: Commit**

```bash
git add scripts/animation_lib/motion.py scripts/tests/test_motion.py
git commit -m "feat(blender): motion phase factory + cycle helper"
```

---

### Task 4: `pose_data.py` — pose history dataclass + extraction protocol

This is the type the validators consume. We separate "extracting pose data from bpy" (Task 8) from "interpreting pose data" (validators) so validators are pure-Python testable.

**Files:**
- Create: `scripts/animation_lib/pose_data.py`
- Create: `scripts/tests/test_pose_data.py`

- [ ] **Step 1: Write failing tests**

Create `scripts/tests/test_pose_data.py`:

```python
import pytest
from animation_lib.pose_data import PoseHistory, PoseFrame, BonePose


def test_bone_pose_holds_world_position_and_rotation():
    bp = BonePose(world_pos=(0.0, 0.0, 1.0), world_quat=(1.0, 0.0, 0.0, 0.0), local_euler_deg=(0.0, 0.0, 0.0))
    assert bp.world_pos == (0.0, 0.0, 1.0)


def test_pose_frame_indexed_by_bone_name():
    bp = BonePose(world_pos=(0,0,0), world_quat=(1,0,0,0), local_euler_deg=(0,0,0))
    pf = PoseFrame(frame=10, bones={"mixamorig:LeftLeg": bp})
    assert pf.bones["mixamorig:LeftLeg"] is bp


def test_pose_history_lookup_by_frame():
    bp = BonePose(world_pos=(0,0,0), world_quat=(1,0,0,0), local_euler_deg=(0,0,0))
    history = PoseHistory(
        frames=[PoseFrame(frame=0, bones={}), PoseFrame(frame=10, bones={"x": bp})],
        phase_to_frame={"start": 0, "lift_left_0": 10},
    )
    assert history.frame(10).bones["x"] is bp


def test_pose_history_phase_to_frame_lookup():
    history = PoseHistory(frames=[], phase_to_frame={"lift_left_0": 9, "lift_right_0": 18})
    assert history.frame_for_phase("lift_left_0") == 9


def test_pose_history_frames_matching_wildcard():
    history = PoseHistory(
        frames=[],
        phase_to_frame={"lift_left_0": 9, "lift_left_1": 27, "lift_right_0": 18},
    )
    matches = history.frames_matching("lift_left_*")
    assert sorted(matches) == [9, 27]
```

- [ ] **Step 2: Run test to verify failure**

```bash
cd scripts && python3 -m pytest tests/test_pose_data.py -v
```

Expected: `ImportError`.

- [ ] **Step 3: Implement `pose_data.py`**

Create `scripts/animation_lib/pose_data.py`:

```python
"""Captured pose data — what validators consume. Decoupled from bpy for testability."""
from dataclasses import dataclass
from fnmatch import fnmatch


Vec3 = tuple[float, float, float]
Quat = tuple[float, float, float, float]  # (w, x, y, z)


@dataclass(frozen=True)
class BonePose:
    world_pos: Vec3
    world_quat: Quat
    local_euler_deg: Vec3


@dataclass(frozen=True)
class PoseFrame:
    frame: int
    bones: dict[str, BonePose]


@dataclass(frozen=True)
class PoseHistory:
    frames: list[PoseFrame]
    phase_to_frame: dict[str, int]   # phase name -> end frame index

    def frame(self, idx: int) -> PoseFrame:
        for f in self.frames:
            if f.frame == idx:
                return f
        raise KeyError(f"no captured pose at frame {idx}")

    def frame_for_phase(self, name: str) -> int:
        return self.phase_to_frame[name]

    def frames_matching(self, pattern: str) -> list[int]:
        """Resolve a wildcard pattern (e.g. 'lift_left_*') to a list of end-frame indices."""
        return [
            frame for name, frame in self.phase_to_frame.items()
            if fnmatch(name, pattern)
        ]
```

- [ ] **Step 4: Run tests to verify pass**

```bash
cd scripts && python3 -m pytest tests/test_pose_data.py -v
```

Expected: `5 passed`.

- [ ] **Step 5: Commit**

```bash
git add scripts/animation_lib/pose_data.py scripts/tests/test_pose_data.py
git commit -m "feat(blender): pose history data types"
```

---

### Task 5: `validators.py` — driver + ValidationResult + first 3 angle primitives

**Files:**
- Create: `scripts/animation_lib/validators.py`
- Create: `scripts/tests/test_validators_angle.py`

- [ ] **Step 1: Write failing tests**

Create `scripts/tests/test_validators_angle.py`:

```python
import math
import pytest
from animation_lib.pose_data import PoseHistory, PoseFrame, BonePose
from animation_lib.validators import (
    ValidationResult,
    run_validators,
    joint_angle_at,
    joint_angle_range,
    joint_velocity_max,
)


def _frame(idx, **bones):
    return PoseFrame(frame=idx, bones={
        name: BonePose(world_pos=(0,0,0), world_quat=(1,0,0,0), local_euler_deg=euler)
        for name, euler in bones.items()
    })


def test_joint_angle_at_passes_in_range():
    history = PoseHistory(
        frames=[_frame(9, **{"mixamorig:LeftUpLeg": (100.0, 0.0, 0.0)})],
        phase_to_frame={"lift_left_0": 9},
    )
    results = joint_angle_at(history, joint=("mixamorig:LeftUpLeg", "X"),
                             at_phases=["lift_left_*"], min_deg=90, max_deg=110)
    assert len(results) == 1
    assert results[0].passed is True
    assert results[0].observed == pytest.approx(100.0)


def test_joint_angle_at_fails_below_min():
    history = PoseHistory(
        frames=[_frame(9, **{"mixamorig:LeftUpLeg": (45.0, 0.0, 0.0)})],
        phase_to_frame={"lift_left_0": 9},
    )
    results = joint_angle_at(history, joint=("mixamorig:LeftUpLeg", "X"),
                             at_phases=["lift_left_*"], min_deg=90, max_deg=110)
    assert results[0].passed is False
    assert "45" in results[0].message


def test_joint_velocity_max_flags_pop():
    # Frame 0: 0°, Frame 1: 50° → velocity = 50 * fps. At fps=30, 1500 dps → fails 600 cap.
    history = PoseHistory(
        frames=[
            _frame(0, **{"mixamorig:LeftUpLeg": (0.0, 0.0, 0.0)}),
            _frame(1, **{"mixamorig:LeftUpLeg": (50.0, 0.0, 0.0)}),
        ],
        phase_to_frame={},
    )
    results = joint_velocity_max(history, joint=("mixamorig:LeftUpLeg", "X"),
                                 max_dps=600, fps=30)
    failures = [r for r in results if not r.passed]
    assert len(failures) >= 1


def test_run_validators_aggregates():
    history = PoseHistory(
        frames=[_frame(9, **{"mixamorig:LeftUpLeg": (100.0, 0.0, 0.0)})],
        phase_to_frame={"lift_left_0": 9},
    )
    spec = [
        (joint_angle_at, {"joint": ("mixamorig:LeftUpLeg", "X"),
                          "at_phases": ["lift_left_*"], "min_deg": 90, "max_deg": 110}),
    ]
    summary = run_validators(history, spec, fps=30)
    assert summary.all_passed is True
    assert len(summary.results) == 1
```

- [ ] **Step 2: Run test to verify failure**

```bash
cd scripts && python3 -m pytest tests/test_validators_angle.py -v
```

Expected: `ImportError`.

- [ ] **Step 3: Implement `validators.py`** (driver + first 3 primitives)

Create `scripts/animation_lib/validators.py`:

```python
"""Geometric validation primitives. Pure functions over PoseHistory.

A 'joint' identifier is a (bone_name, axis) tuple — e.g. ("mixamorig:LeftUpLeg", "X").
"""
from dataclasses import dataclass, field

from .pose_data import PoseHistory


_AXIS_INDEX = {"X": 0, "Y": 1, "Z": 2}


@dataclass(frozen=True)
class ValidationResult:
    primitive: str
    side: str | None
    frame: int
    observed: float
    expected: str
    passed: bool
    message: str = ""


@dataclass
class ValidationSummary:
    results: list[ValidationResult]

    @property
    def all_passed(self) -> bool:
        return all(r.passed for r in self.results)

    @property
    def failed_count(self) -> int:
        return sum(1 for r in self.results if not r.passed)


def run_validators(history: PoseHistory, spec: list[tuple], fps: int) -> ValidationSummary:
    """Run every (primitive, kwargs) entry. Pass `fps` to primitives that need it."""
    all_results: list[ValidationResult] = []
    for primitive, kwargs in spec:
        # Velocity primitives need fps; pass it if not already in kwargs.
        if primitive is joint_velocity_max and "fps" not in kwargs:
            kwargs = {**kwargs, "fps": fps}
        all_results.extend(primitive(history, **kwargs))
    return ValidationSummary(results=all_results)


def _axis_value(euler_deg, axis: str) -> float:
    return euler_deg[_AXIS_INDEX[axis]]


def joint_angle_at(
    history: PoseHistory,
    *,
    joint: tuple[str, str],
    at_phases: list[str],
    min_deg: float,
    max_deg: float,
) -> list[ValidationResult]:
    bone, axis = joint
    target_frames: list[int] = []
    for pattern in at_phases:
        target_frames.extend(history.frames_matching(pattern))
    results: list[ValidationResult] = []
    for f in sorted(set(target_frames)):
        bp = history.frame(f).bones[bone]
        observed = _axis_value(bp.local_euler_deg, axis)
        passed = min_deg <= observed <= max_deg
        results.append(ValidationResult(
            primitive=f"joint_angle_at({bone},{axis})",
            side=None,
            frame=f,
            observed=observed,
            expected=f"in [{min_deg}, {max_deg}]",
            passed=passed,
            message=("" if passed else f"observed {observed:.1f}° outside [{min_deg}, {max_deg}]"),
        ))
    return results


def joint_angle_range(
    history: PoseHistory,
    *,
    joint: tuple[str, str],
    min_deg: float,
    max_deg: float,
) -> list[ValidationResult]:
    bone, axis = joint
    results: list[ValidationResult] = []
    for pf in history.frames:
        if bone not in pf.bones:
            continue
        observed = _axis_value(pf.bones[bone].local_euler_deg, axis)
        passed = min_deg <= observed <= max_deg
        if not passed:
            results.append(ValidationResult(
                primitive=f"joint_angle_range({bone},{axis})",
                side=None,
                frame=pf.frame,
                observed=observed,
                expected=f"in [{min_deg}, {max_deg}]",
                passed=False,
                message=f"observed {observed:.1f}° outside [{min_deg}, {max_deg}]",
            ))
    if not results:
        results.append(ValidationResult(
            primitive=f"joint_angle_range({bone},{axis})",
            side=None, frame=-1, observed=0.0,
            expected=f"in [{min_deg}, {max_deg}] for all frames",
            passed=True,
        ))
    return results


def joint_velocity_max(
    history: PoseHistory,
    *,
    joint: tuple[str, str],
    max_dps: float,
    fps: int,
) -> list[ValidationResult]:
    bone, axis = joint
    results: list[ValidationResult] = []
    sorted_frames = sorted(history.frames, key=lambda f: f.frame)
    prev_val: float | None = None
    prev_frame: int | None = None
    for pf in sorted_frames:
        if bone not in pf.bones:
            continue
        val = _axis_value(pf.bones[bone].local_euler_deg, axis)
        if prev_val is not None:
            dt = (pf.frame - prev_frame) / fps
            if dt > 0:
                dps = abs(val - prev_val) / dt
                if dps > max_dps:
                    results.append(ValidationResult(
                        primitive=f"joint_velocity_max({bone},{axis})",
                        side=None, frame=pf.frame, observed=dps,
                        expected=f"≤ {max_dps} dps",
                        passed=False,
                        message=f"{dps:.0f} dps between f{prev_frame} and f{pf.frame}",
                    ))
        prev_val = val
        prev_frame = pf.frame
    if not results:
        results.append(ValidationResult(
            primitive=f"joint_velocity_max({bone},{axis})",
            side=None, frame=-1, observed=0.0,
            expected=f"≤ {max_dps} dps for all transitions",
            passed=True,
        ))
    return results
```

- [ ] **Step 4: Run tests to verify pass**

```bash
cd scripts && python3 -m pytest tests/test_validators_angle.py -v
```

Expected: `4 passed`.

- [ ] **Step 5: Commit**

```bash
git add scripts/animation_lib/validators.py scripts/tests/test_validators_angle.py
git commit -m "feat(blender): validator driver + angle primitives"
```

---

### Task 6: `validators.py` — world-position primitives

**Files:**
- Modify: `scripts/animation_lib/validators.py`
- Create: `scripts/tests/test_validators_world.py`

- [ ] **Step 1: Write failing tests**

Create `scripts/tests/test_validators_world.py`:

```python
import pytest
from animation_lib.pose_data import PoseHistory, PoseFrame, BonePose
from animation_lib.validators import (
    world_position_drift_max,
    hip_no_lateral_drift,
    hip_no_sagittal_drift,
    foot_world_y_min,
)


def _bone_at(pos):
    return BonePose(world_pos=pos, world_quat=(1,0,0,0), local_euler_deg=(0,0,0))


def test_world_position_drift_max_passes_when_in_bounds():
    history = PoseHistory(
        frames=[
            PoseFrame(frame=0, bones={"hip": _bone_at((0.0, 0.0, 1.0))}),
            PoseFrame(frame=180, bones={"hip": _bone_at((0.02, 0.0, 1.0))}),
        ],
        phase_to_frame={},
    )
    [r] = world_position_drift_max(history, bone="hip", axis="X", max_meters=0.05)
    assert r.passed is True


def test_world_position_drift_max_fails_when_drifting():
    history = PoseHistory(
        frames=[
            PoseFrame(frame=0, bones={"hip": _bone_at((0.0, 0.0, 1.0))}),
            PoseFrame(frame=180, bones={"hip": _bone_at((0.087, 0.0, 1.0))}),
        ],
        phase_to_frame={},
    )
    [r] = world_position_drift_max(history, bone="hip", axis="X", max_meters=0.05)
    assert r.passed is False
    assert "0.087" in r.message


def test_hip_no_lateral_drift_wraps_with_default_bone():
    history = PoseHistory(
        frames=[
            PoseFrame(frame=0, bones={"mixamorig:Hips": _bone_at((0.0, 0.0, 1.0))}),
            PoseFrame(frame=10, bones={"mixamorig:Hips": _bone_at((0.01, 0.0, 1.0))}),
        ],
        phase_to_frame={},
    )
    [r] = hip_no_lateral_drift(history, max_meters=0.05)
    assert r.passed is True


def test_foot_world_y_min_flags_clipping():
    history = PoseHistory(
        frames=[
            PoseFrame(frame=0, bones={"mixamorig:LeftFoot": _bone_at((0.0, 0.0, 0.0))}),
            PoseFrame(frame=10, bones={"mixamorig:LeftFoot": _bone_at((0.0, 0.0, -0.05))}),
        ],
        phase_to_frame={},
    )
    failures = [r for r in foot_world_y_min(history, side="left", min_y=0.0) if not r.passed]
    assert len(failures) == 1
    assert failures[0].frame == 10
```

- [ ] **Step 2: Run test to verify failure**

```bash
cd scripts && python3 -m pytest tests/test_validators_world.py -v
```

Expected: `ImportError` for the new symbols.

- [ ] **Step 3: Append world-position primitives to `validators.py`**

Append to `scripts/animation_lib/validators.py`:

```python
def world_position_drift_max(
    history: PoseHistory,
    *,
    bone: str,
    axis: str,  # "X", "Y", or "Z"
    max_meters: float,
) -> list[ValidationResult]:
    sorted_frames = sorted(history.frames, key=lambda f: f.frame)
    if not sorted_frames:
        return []
    first = sorted_frames[0].bones[bone]
    last = sorted_frames[-1].bones[bone]
    idx = _AXIS_INDEX[axis]
    drift = abs(last.world_pos[idx] - first.world_pos[idx])
    passed = drift <= max_meters
    return [ValidationResult(
        primitive=f"world_position_drift_max({bone},{axis})",
        side=None,
        frame=sorted_frames[-1].frame,
        observed=drift,
        expected=f"≤ {max_meters} m",
        passed=passed,
        message=("" if passed else f"drift {drift:.3f}m between f{sorted_frames[0].frame} and f{sorted_frames[-1].frame}"),
    )]


def hip_no_lateral_drift(history: PoseHistory, *, max_meters: float) -> list[ValidationResult]:
    return world_position_drift_max(history, bone="mixamorig:Hips", axis="X", max_meters=max_meters)


def hip_no_sagittal_drift(history: PoseHistory, *, max_meters: float) -> list[ValidationResult]:
    return world_position_drift_max(history, bone="mixamorig:Hips", axis="Y", max_meters=max_meters)


_FOOT_BONES = {"left": "mixamorig:LeftFoot", "right": "mixamorig:RightFoot"}


def foot_world_y_min(history: PoseHistory, *, side: str, min_y: float) -> list[ValidationResult]:
    sides = ["left", "right"] if side == "both" else [side]
    results: list[ValidationResult] = []
    any_failure = False
    for s in sides:
        bone = _FOOT_BONES[s]
        for pf in history.frames:
            if bone not in pf.bones:
                continue
            y = pf.bones[bone].world_pos[2]
            if y < min_y:
                any_failure = True
                results.append(ValidationResult(
                    primitive="foot_world_y_min",
                    side=s,
                    frame=pf.frame,
                    observed=y,
                    expected=f"≥ {min_y} m",
                    passed=False,
                    message=f"{s} foot y={y:.3f}m below {min_y}",
                ))
    if not any_failure:
        results.append(ValidationResult(
            primitive="foot_world_y_min",
            side=side, frame=-1, observed=0.0,
            expected=f"≥ {min_y} m for all frames",
            passed=True,
        ))
    return results
```

- [ ] **Step 4: Run tests to verify pass**

```bash
cd scripts && python3 -m pytest tests/test_validators_world.py -v
```

Expected: `4 passed`.

- [ ] **Step 5: Commit**

```bash
git add scripts/animation_lib/validators.py scripts/tests/test_validators_world.py
git commit -m "feat(blender): world-position validator primitives"
```

---

### Task 7: `validators.py` — shin_vertical + mirror_symmetry

**Files:**
- Modify: `scripts/animation_lib/validators.py`
- Create: `scripts/tests/test_validators_shape.py`

- [ ] **Step 1: Write failing tests**

Create `scripts/tests/test_validators_shape.py`:

```python
import math
import pytest
from animation_lib.pose_data import PoseHistory, PoseFrame, BonePose
from animation_lib.validators import shin_vertical, mirror_symmetry


def _bone(pos=(0,0,0), euler=(0,0,0)):
    return BonePose(world_pos=pos, world_quat=(1,0,0,0), local_euler_deg=euler)


def test_shin_vertical_passes_when_shin_points_down():
    # LeftLeg at hip-knee (z=1), LeftFoot at z=0 → shin points (0,0,-1) which is "down".
    history = PoseHistory(
        frames=[PoseFrame(frame=9, bones={
            "mixamorig:LeftLeg": _bone(pos=(0.1, 0.0, 0.5)),
            "mixamorig:LeftFoot": _bone(pos=(0.1, 0.0, 0.05)),
        })],
        phase_to_frame={"lift_left_0": 9},
    )
    [r] = shin_vertical(history, side="left", at_phases=["lift_left_*"], threshold_deg=10)
    assert r.passed is True
    assert r.observed < 10


def test_shin_vertical_fails_when_tilted_forward():
    # LeftLeg at z=0.5, LeftFoot far forward at y=0.4, z=0.2 → big forward tilt.
    history = PoseHistory(
        frames=[PoseFrame(frame=9, bones={
            "mixamorig:LeftLeg": _bone(pos=(0.0, 0.0, 0.5)),
            "mixamorig:LeftFoot": _bone(pos=(0.0, 0.4, 0.2)),
        })],
        phase_to_frame={"lift_left_0": 9},
    )
    [r] = shin_vertical(history, side="left", at_phases=["lift_left_*"], threshold_deg=10)
    assert r.passed is False
    assert r.observed > 10


def test_mirror_symmetry_passes_when_equal():
    history = PoseHistory(
        frames=[PoseFrame(frame=9, bones={
            "mixamorig:LeftUpLeg": _bone(euler=(100.0, 0.0, 0.0)),
            "mixamorig:RightUpLeg": _bone(euler=(105.0, 0.0, 0.0)),
        })],
        phase_to_frame={"peak": 9},
    )
    [r] = mirror_symmetry(
        history,
        left_joint=("mixamorig:LeftUpLeg", "X"),
        right_joint=("mixamorig:RightUpLeg", "X"),
        tolerance_deg=8,
        at_phases=["peak"],
    )
    assert r.passed is True


def test_mirror_symmetry_fails_when_asymmetric():
    history = PoseHistory(
        frames=[PoseFrame(frame=9, bones={
            "mixamorig:LeftUpLeg": _bone(euler=(100.0, 0.0, 0.0)),
            "mixamorig:RightUpLeg": _bone(euler=(80.0, 0.0, 0.0)),
        })],
        phase_to_frame={"peak": 9},
    )
    [r] = mirror_symmetry(
        history,
        left_joint=("mixamorig:LeftUpLeg", "X"),
        right_joint=("mixamorig:RightUpLeg", "X"),
        tolerance_deg=8,
        at_phases=["peak"],
    )
    assert r.passed is False
```

- [ ] **Step 2: Run test to verify failure**

```bash
cd scripts && python3 -m pytest tests/test_validators_shape.py -v
```

Expected: `ImportError` for new symbols.

- [ ] **Step 3: Append `shin_vertical` and `mirror_symmetry` to `validators.py`**

Append to `scripts/animation_lib/validators.py`:

```python
import math

_SHIN_BONES = {
    "left": ("mixamorig:LeftLeg", "mixamorig:LeftFoot"),
    "right": ("mixamorig:RightLeg", "mixamorig:RightFoot"),
}


def shin_vertical(
    history: PoseHistory,
    *,
    side: str,
    at_phases: list[str],
    threshold_deg: float,
) -> list[ValidationResult]:
    knee_bone, foot_bone = _SHIN_BONES[side]
    target_frames: list[int] = []
    for pattern in at_phases:
        target_frames.extend(history.frames_matching(pattern))
    results: list[ValidationResult] = []
    for f in sorted(set(target_frames)):
        bones = history.frame(f).bones
        knee = bones[knee_bone].world_pos
        foot = bones[foot_bone].world_pos
        # Shin direction: foot - knee, normalized.
        dx = foot[0] - knee[0]
        dy = foot[1] - knee[1]
        dz = foot[2] - knee[2]
        length = math.sqrt(dx*dx + dy*dy + dz*dz) or 1e-9
        # Angle to (0,0,-1): cos(angle) = -dz / length (since "down" is z=-1).
        cos_angle = max(-1.0, min(1.0, -dz / length))
        angle_deg = math.degrees(math.acos(cos_angle))
        passed = angle_deg <= threshold_deg
        results.append(ValidationResult(
            primitive=f"shin_vertical(side={side})",
            side=side, frame=f, observed=angle_deg,
            expected=f"≤ {threshold_deg}°",
            passed=passed,
            message=("" if passed else f"shin off-vertical by {angle_deg:.1f}°"),
        ))
    return results


def mirror_symmetry(
    history: PoseHistory,
    *,
    left_joint: tuple[str, str],
    right_joint: tuple[str, str],
    tolerance_deg: float,
    at_phases: list[str] | None = None,
) -> list[ValidationResult]:
    l_bone, l_axis = left_joint
    r_bone, r_axis = right_joint
    if at_phases is None:
        target_frames = [pf.frame for pf in history.frames]
    else:
        target_frames = []
        for pattern in at_phases:
            target_frames.extend(history.frames_matching(pattern))
    results: list[ValidationResult] = []
    for f in sorted(set(target_frames)):
        bones = history.frame(f).bones
        if l_bone not in bones or r_bone not in bones:
            continue
        l_val = _axis_value(bones[l_bone].local_euler_deg, l_axis)
        r_val = _axis_value(bones[r_bone].local_euler_deg, r_axis)
        diff = abs(l_val - r_val)
        passed = diff <= tolerance_deg
        results.append(ValidationResult(
            primitive=f"mirror_symmetry({l_bone}/{r_bone})",
            side=None, frame=f, observed=diff,
            expected=f"|L−R| ≤ {tolerance_deg}°",
            passed=passed,
            message=("" if passed else f"asymmetry {diff:.1f}° at f{f}"),
        ))
    return results
```

- [ ] **Step 4: Run tests to verify pass**

```bash
cd scripts && python3 -m pytest tests/test_validators_shape.py -v
```

Expected: `4 passed`.

- [ ] **Step 5: Commit**

```bash
git add scripts/animation_lib/validators.py scripts/tests/test_validators_shape.py
git commit -m "feat(blender): shin_vertical + mirror_symmetry validators"
```

---

### Task 8: `rig.py` — Mixamo bone constants + Bones namespace

This task is bpy-coupled but the Bones namespace itself is a pure-data lookup table; we can unit-test the joint→(bone, axis) mapping without bpy. Loader functions go in Task 9.

**Files:**
- Create: `scripts/animation_lib/rig.py`
- Create: `scripts/tests/test_rig.py`

- [ ] **Step 1: Write failing tests**

Create `scripts/tests/test_rig.py`:

```python
from animation_lib.rig import (
    Bones, hip_flex, knee_flex, ankle_flex, shoulder_flex, elbow_flex,
)


def test_bones_namespace_has_mixamo_prefix():
    assert Bones.HIPS == "mixamorig:Hips"
    assert Bones.LEFT_UP_LEG == "mixamorig:LeftUpLeg"
    assert Bones.RIGHT_FOOT == "mixamorig:RightFoot"


def test_hip_flex_left_resolves():
    assert hip_flex.L == ("mixamorig:LeftUpLeg", "X")


def test_hip_flex_right_resolves():
    assert hip_flex.R == ("mixamorig:RightUpLeg", "X")


def test_knee_flex_resolves():
    assert knee_flex.L == ("mixamorig:LeftLeg", "X")
    assert knee_flex.R == ("mixamorig:RightLeg", "X")


def test_shoulder_flex_resolves():
    assert shoulder_flex.L == ("mixamorig:LeftArm", "X")
    assert shoulder_flex.R == ("mixamorig:RightArm", "X")


def test_elbow_flex_resolves():
    assert elbow_flex.L == ("mixamorig:LeftForeArm", "X")
    assert elbow_flex.R == ("mixamorig:RightForeArm", "X")


def test_ankle_flex_resolves():
    assert ankle_flex.L == ("mixamorig:LeftFoot", "X")
    assert ankle_flex.R == ("mixamorig:RightFoot", "X")
```

- [ ] **Step 2: Run test to verify failure**

```bash
cd scripts && python3 -m pytest tests/test_rig.py -v
```

Expected: `ImportError`.

- [ ] **Step 3: Implement `rig.py`**

Create `scripts/animation_lib/rig.py`:

```python
"""Rig-specific bone constants and joint mappings for casual_man_rigged.blend (Mixamo)."""
from dataclasses import dataclass


class Bones:
    HIPS = "mixamorig:Hips"
    SPINE = "mixamorig:Spine"
    SPINE_1 = "mixamorig:Spine1"
    SPINE_2 = "mixamorig:Spine2"
    NECK = "mixamorig:Neck"
    HEAD = "mixamorig:Head"

    LEFT_UP_LEG = "mixamorig:LeftUpLeg"
    LEFT_LEG = "mixamorig:LeftLeg"
    LEFT_FOOT = "mixamorig:LeftFoot"
    LEFT_TOE_BASE = "mixamorig:LeftToeBase"

    RIGHT_UP_LEG = "mixamorig:RightUpLeg"
    RIGHT_LEG = "mixamorig:RightLeg"
    RIGHT_FOOT = "mixamorig:RightFoot"
    RIGHT_TOE_BASE = "mixamorig:RightToeBase"

    LEFT_SHOULDER = "mixamorig:LeftShoulder"
    LEFT_ARM = "mixamorig:LeftArm"
    LEFT_FORE_ARM = "mixamorig:LeftForeArm"
    LEFT_HAND = "mixamorig:LeftHand"

    RIGHT_SHOULDER = "mixamorig:RightShoulder"
    RIGHT_ARM = "mixamorig:RightArm"
    RIGHT_FORE_ARM = "mixamorig:RightForeArm"
    RIGHT_HAND = "mixamorig:RightHand"


@dataclass(frozen=True)
class _SidedJoint:
    """A joint that has a Left and Right pair. .L and .R return (bone_name, axis) tuples."""
    L: tuple[str, str]
    R: tuple[str, str]


hip_flex      = _SidedJoint(L=(Bones.LEFT_UP_LEG,    "X"), R=(Bones.RIGHT_UP_LEG,    "X"))
knee_flex     = _SidedJoint(L=(Bones.LEFT_LEG,       "X"), R=(Bones.RIGHT_LEG,       "X"))
ankle_flex    = _SidedJoint(L=(Bones.LEFT_FOOT,      "X"), R=(Bones.RIGHT_FOOT,      "X"))
shoulder_flex = _SidedJoint(L=(Bones.LEFT_ARM,       "X"), R=(Bones.RIGHT_ARM,       "X"))
elbow_flex    = _SidedJoint(L=(Bones.LEFT_FORE_ARM,  "X"), R=(Bones.RIGHT_FORE_ARM,  "X"))
spine_flex    = (Bones.SPINE, "X")
head_pitch    = (Bones.HEAD, "X")
head_yaw      = (Bones.HEAD, "Z")


# Bones whose world position validators read.
TRACKED_BONES = (
    Bones.HIPS,
    Bones.LEFT_UP_LEG, Bones.LEFT_LEG, Bones.LEFT_FOOT,
    Bones.RIGHT_UP_LEG, Bones.RIGHT_LEG, Bones.RIGHT_FOOT,
    Bones.LEFT_ARM, Bones.LEFT_FORE_ARM,
    Bones.RIGHT_ARM, Bones.RIGHT_FORE_ARM,
)
```

- [ ] **Step 4: Run tests to verify pass**

```bash
cd scripts && python3 -m pytest tests/test_rig.py -v
```

Expected: `7 passed`.

- [ ] **Step 5: Commit**

```bash
git add scripts/animation_lib/rig.py scripts/tests/test_rig.py
git commit -m "feat(blender): Mixamo bone constants + sided joint accessors"
```

---

### Task 9: `pose_capture.py` + `keyframe_emitter.py` — bpy-coupled motion authoring

These two modules wrap bpy. They run inside Blender (via `animate.py --background --python`); they have no pytest unit tests because bpy isn't importable outside Blender. Verification is via the smoke run in Task 11.

**Files:**
- Create: `scripts/animation_lib/keyframe_emitter.py`
- Create: `scripts/animation_lib/pose_capture.py`

- [ ] **Step 1: Implement `keyframe_emitter.py`**

Create `scripts/animation_lib/keyframe_emitter.py`:

```python
"""Convert a list of Phase objects into bpy keyframes on the armature.

Run inside Blender. Imports bpy lazily so unit tests of upstream modules don't fail.
"""
from .motion import Phase

# Bones must be in Euler XYZ rotation mode for our axis-by-name keying to work.
# Mixamo armatures default to Quaternion; we convert per-bone here.


def reset_to_t_pose(armature_obj):
    """Clear animation data and reset all pose bones to identity rotation/zero translation."""
    armature_obj.animation_data_clear()
    for pbone in armature_obj.pose.bones:
        pbone.rotation_mode = "XYZ"
        pbone.rotation_euler = (0.0, 0.0, 0.0)
        pbone.location = (0.0, 0.0, 0.0)


def emit_phases(armature_obj, phases: list[Phase], fps: int) -> dict[str, int]:
    """Set keyframes for each phase's end frame; returns {phase_name: end_frame_idx}.

    Phase 0 emits from the rest pose; subsequent phases linearly interpolate
    from the previous phase's end. Bones not mentioned in a phase's pose dict
    keep their value from the previous phase.
    """
    import bpy
    import math

    phase_to_frame: dict[str, int] = {}
    current_pose: dict[tuple[str, str], float] = {}
    accum_sec = 0.0

    # Insert keyframe at frame 0 for the rest pose.
    bpy.context.scene.frame_set(0)
    for pbone in armature_obj.pose.bones:
        pbone.keyframe_insert(data_path="rotation_euler", frame=0)
        pbone.keyframe_insert(data_path="location", frame=0)

    for ph in phases:
        accum_sec += ph.duration_sec
        end_frame = int(round(accum_sec * fps))
        phase_to_frame[ph.name] = end_frame

        # Update target pose for this phase.
        for joint, value_deg in ph.pose.items():
            if isinstance(joint, tuple) and len(joint) == 2:
                bone_name, axis = joint
                current_pose[(bone_name, axis)] = value_deg
            else:
                raise ValueError(f"unsupported pose key {joint!r} in phase {ph.name}")

        # Apply current_pose to the armature and key.
        bpy.context.scene.frame_set(end_frame)
        for (bone_name, axis), value_deg in current_pose.items():
            pbone = armature_obj.pose.bones.get(bone_name)
            if pbone is None:
                raise KeyError(f"bone {bone_name!r} not found on armature")
            idx = {"X": 0, "Y": 1, "Z": 2}[axis]
            euler = list(pbone.rotation_euler)
            euler[idx] = math.radians(value_deg)
            pbone.rotation_euler = euler
            pbone.keyframe_insert(data_path="rotation_euler", frame=end_frame)

    # Set scene end frame.
    bpy.context.scene.frame_end = phase_to_frame[phases[-1].name] if phases else 0
    bpy.context.scene.frame_start = 0
    return phase_to_frame
```

- [ ] **Step 2: Implement `pose_capture.py`**

Create `scripts/animation_lib/pose_capture.py`:

```python
"""Read armature pose at every frame and produce a PoseHistory."""
import math

from .pose_data import BonePose, PoseFrame, PoseHistory
from .rig import TRACKED_BONES


def capture_history(armature_obj, phase_to_frame: dict[str, int]) -> PoseHistory:
    import bpy

    scene = bpy.context.scene
    start, end = scene.frame_start, scene.frame_end
    frames: list[PoseFrame] = []

    for frame_idx in range(start, end + 1):
        scene.frame_set(frame_idx)
        bones: dict[str, BonePose] = {}
        for bone_name in TRACKED_BONES:
            pbone = armature_obj.pose.bones.get(bone_name)
            if pbone is None:
                continue
            world_mat = armature_obj.matrix_world @ pbone.matrix
            world_pos = tuple(world_mat.to_translation())
            world_quat = tuple(world_mat.to_quaternion())  # (w, x, y, z)
            local_euler_deg = tuple(math.degrees(a) for a in pbone.rotation_euler)
            bones[bone_name] = BonePose(
                world_pos=world_pos,
                world_quat=world_quat,
                local_euler_deg=local_euler_deg,
            )
        frames.append(PoseFrame(frame=frame_idx, bones=bones))

    return PoseHistory(frames=frames, phase_to_frame=dict(phase_to_frame))
```

- [ ] **Step 3: Commit (no test gate; verified in Task 11 smoke run)**

```bash
git add scripts/animation_lib/keyframe_emitter.py scripts/animation_lib/pose_capture.py
git commit -m "feat(blender): keyframe emitter + pose capture (bpy-coupled)"
```

---

### Task 10: `render.py` + `animate.py` — CLI driver

**Files:**
- Create: `scripts/animation_lib/render.py`
- Create: `scripts/animate.py`

- [ ] **Step 1: Implement `render.py`**

Create `scripts/animation_lib/render.py`:

```python
"""Camera/lighting setup, MP4 encoding, .blend save."""
from .cameras import CameraPreset, LightingPreset, get_camera_preset, get_lighting_preset, DEFAULT_RESOLUTION


def apply_scene_config(camera_name: str, lighting_name: str, resolution: tuple[int, int], fps: int):
    """Apply camera, lighting, resolution, and fps to the current bpy scene."""
    import bpy
    import math

    scene = bpy.context.scene
    scene.render.fps = fps
    scene.render.resolution_x = resolution[0]
    scene.render.resolution_y = resolution[1]
    scene.render.resolution_percentage = 100

    cam_preset = get_camera_preset(camera_name)
    cam = bpy.data.objects.get("AnimateCamera")
    if cam is None:
        cam_data = bpy.data.cameras.new("AnimateCamera")
        cam = bpy.data.objects.new("AnimateCamera", cam_data)
        scene.collection.objects.link(cam)
    cam.location = cam_preset.position
    direction = (
        cam_preset.target[0] - cam_preset.position[0],
        cam_preset.target[1] - cam_preset.position[1],
        cam_preset.target[2] - cam_preset.position[2],
    )
    cam.rotation_mode = "XYZ"
    cam.rotation_euler = _look_at_euler(direction)
    cam.data.lens = _fov_to_lens_mm(cam_preset.fov_deg, resolution[0])
    scene.camera = cam

    # Clear pre-existing skill-managed lights, then create from preset.
    for obj in list(bpy.data.objects):
        if obj.name.startswith("AnimateLight_"):
            bpy.data.objects.remove(obj, do_unlink=True)
    light_preset = get_lighting_preset(lighting_name)
    for i, ls in enumerate(light_preset.lights):
        light_data = bpy.data.lights.new(f"AnimateLight_{i}_data", type=ls.kind.upper())
        light_data.energy = ls.energy
        light_data.color = ls.color
        light_obj = bpy.data.objects.new(f"AnimateLight_{i}", light_data)
        light_obj.location = ls.position
        scene.collection.objects.link(light_obj)


def _look_at_euler(direction):
    import math
    dx, dy, dz = direction
    yaw = math.atan2(dx, -dy)
    horiz = math.sqrt(dx*dx + dy*dy)
    pitch = math.atan2(dz, horiz)
    return (math.pi/2 - pitch, 0.0, yaw)


def _fov_to_lens_mm(fov_deg, sensor_width_px, sensor_width_mm=36.0):
    import math
    return sensor_width_mm / (2 * math.tan(math.radians(fov_deg) / 2))


def render_mp4(output_path: str):
    import bpy
    scene = bpy.context.scene
    scene.render.image_settings.file_format = "FFMPEG"
    scene.render.ffmpeg.format = "MPEG4"
    scene.render.ffmpeg.codec = "H264"
    scene.render.ffmpeg.constant_rate_factor = "MEDIUM"
    scene.render.filepath = output_path
    bpy.ops.render.render(animation=True)


def render_single_frame_png(output_path: str, frame: int):
    import bpy
    scene = bpy.context.scene
    scene.frame_set(frame)
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = output_path
    bpy.ops.render.render(write_still=True)


def save_blend(output_path: str):
    import bpy
    bpy.ops.wm.save_as_mainfile(filepath=output_path, check_existing=False, copy=True)
```

- [ ] **Step 2: Implement `animate.py`**

Create `scripts/animate.py`:

```python
"""CLI: python animate.py <exercise> [--no-render | --keep-blend | --frame N]

Runs inside Blender background mode. Resolves the exercise spec, opens the
pristine rig, emits keyframes per the spec, captures pose, runs validators,
gates the render on validators passing, then writes MP4 + per-exercise .blend.
"""
import argparse
import importlib
import os
import sys
from pathlib import Path

# When invoked directly outside Blender we re-exec via blender --background.
def _running_in_blender() -> bool:
    try:
        import bpy  # noqa
        return True
    except ImportError:
        return False


SCRIPTS_DIR = Path(__file__).parent
APP_DIR = SCRIPTS_DIR.parent
RIG_PATH = APP_DIR / "assets" / "blender" / "casual_man_rigged.blend"
RENDER_DIR = APP_DIR / "assets" / "exercise-renders"
BLEND_DEBUG_DIR = APP_DIR / "assets" / "blender"


def _parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("exercise")
    p.add_argument("--no-render", action="store_true")
    p.add_argument("--keep-blend", action="store_true")
    p.add_argument("--frame", type=int, default=None)
    return p.parse_args(argv)


def _print_results(summary):
    print(f"\n{'─' * 80}")
    for r in summary.results:
        mark = "✓ PASS" if r.passed else "✗ FAIL"
        frame_str = f"f{r.frame}" if r.frame >= 0 else "—"
        print(f"  {mark}  {r.primitive:<48s} {frame_str:<6s} observed={r.observed:.3f}  expected {r.expected}")
        if r.message:
            print(f"           {r.message}")
    print(f"{'─' * 80}")
    print(f"  {summary.failed_count} failed, {len(summary.results) - summary.failed_count} passed")
    print()


def main_in_blender(args: argparse.Namespace) -> int:
    import bpy
    sys.path.insert(0, str(SCRIPTS_DIR))
    from animation_lib.cameras import DEFAULT_RESOLUTION
    from animation_lib.keyframe_emitter import emit_phases, reset_to_t_pose
    from animation_lib.pose_capture import capture_history
    from animation_lib.render import apply_scene_config, render_mp4, render_single_frame_png, save_blend
    from animation_lib.validators import run_validators

    # --- 1. Resolve spec module ---
    try:
        spec_module = importlib.import_module(f"exercise_specs.{args.exercise}")
    except ImportError as e:
        print(f"ERROR: failed to import spec exercise_specs.{args.exercise}: {e}", file=sys.stderr)
        return 1

    required = ["NAME", "FPS", "CAMERA", "LIGHTING", "PHASES", "VALIDATORS"]
    missing = [a for a in required if not hasattr(spec_module, a)]
    if missing:
        print(f"ERROR: spec missing required attrs: {missing}", file=sys.stderr)
        return 1
    if spec_module.NAME != args.exercise:
        print(f"ERROR: spec NAME={spec_module.NAME!r} != filename {args.exercise!r}", file=sys.stderr)
        return 1
    if not spec_module.VALIDATORS:
        print("ERROR: spec VALIDATORS is empty. Validators are mandatory.", file=sys.stderr)
        return 1

    resolution = getattr(spec_module, "RESOLUTION", DEFAULT_RESOLUTION)

    # --- 2. Open rig (read-only; mutations on in-memory copy) ---
    bpy.ops.wm.open_mainfile(filepath=str(RIG_PATH))
    armature = next((o for o in bpy.data.objects if o.type == "ARMATURE"), None)
    if armature is None:
        print(f"ERROR: no armature in {RIG_PATH}", file=sys.stderr)
        return 1

    # --- 3. Reset to T-pose ---
    reset_to_t_pose(armature)

    # --- 4-5. Emit keyframes ---
    phase_to_frame = emit_phases(armature, spec_module.PHASES, fps=spec_module.FPS)

    # --- 6. Capture + run validators ---
    history = capture_history(armature, phase_to_frame)
    summary = run_validators(history, spec_module.VALIDATORS, fps=spec_module.FPS)
    _print_results(summary)

    if not summary.all_passed:
        if args.keep_blend:
            BLEND_DEBUG_DIR.mkdir(parents=True, exist_ok=True)
            save_blend(str(BLEND_DEBUG_DIR / f"casual_man_{args.exercise}.blend"))
        return 2

    # --- 8. Apply scene config ---
    apply_scene_config(
        camera_name=spec_module.CAMERA,
        lighting_name=spec_module.LIGHTING,
        resolution=resolution,
        fps=spec_module.FPS,
    )

    # --- 9-10. Render + save ---
    if args.no_render:
        return 0

    if args.frame is not None:
        out = APP_DIR / f"frame_{args.exercise}_{args.frame:04d}.png"
        render_single_frame_png(str(out), args.frame)
        print(f"WROTE {out}")
        return 0

    RENDER_DIR.mkdir(parents=True, exist_ok=True)
    BLEND_DEBUG_DIR.mkdir(parents=True, exist_ok=True)
    mp4_path = RENDER_DIR / f"{args.exercise}.mp4"
    blend_path = BLEND_DEBUG_DIR / f"casual_man_{args.exercise}.blend"
    try:
        render_mp4(str(mp4_path))
    except Exception as e:
        print(f"ERROR: render failed: {e}", file=sys.stderr)
        return 3
    save_blend(str(blend_path))
    print(f"WROTE {mp4_path}")
    print(f"WROTE {blend_path}")
    return 0


def main_outside_blender(argv: list[str]) -> int:
    """Re-exec via `blender --background --python this_file -- <argv>`."""
    import subprocess
    blender = os.environ.get("BLENDER_BIN", "blender")
    cmd = [blender, "--background", "--python", str(__file__), "--"] + argv
    return subprocess.call(cmd)


if __name__ == "__main__":
    if _running_in_blender():
        # Args after `--` from blender's invocation.
        if "--" in sys.argv:
            argv = sys.argv[sys.argv.index("--") + 1:]
        else:
            argv = sys.argv[1:]
        sys.exit(main_in_blender(_parse_args(argv)))
    else:
        sys.exit(main_outside_blender(sys.argv[1:]))
```

- [ ] **Step 3: Smoke test the harness without a spec**

```bash
cd scripts && python3 animate.py nonexistent
```

Expected: exit code 1, stderr `ERROR: failed to import spec exercise_specs.nonexistent`.

- [ ] **Step 4: Commit**

```bash
git add scripts/animation_lib/render.py scripts/animate.py
git commit -m "feat(blender): render module + animate.py CLI"
```

---

### Task 11: Pilot spec — `exercise_specs/high_knees.py` first iteration

**Files:**
- Create: `scripts/exercise_specs/high_knees.py`

- [ ] **Step 1: Author the spec**

Create `scripts/exercise_specs/high_knees.py`:

```python
"""high_knees pilot spec — fully procedural, no FBX.

Motion: 10 alternating knee lifts, 0.3s per lift, 6 seconds total at 30 FPS.
Counter-rhythm arm swing: right arm up when left knee up, mirror.
"""
from animation_lib.rig import hip_flex, knee_flex, shoulder_flex, elbow_flex
from animation_lib.motion import cycle
from animation_lib.validators import (
    shin_vertical, joint_angle_at, joint_velocity_max,
    hip_no_lateral_drift, hip_no_sagittal_drift, foot_world_y_min,
    mirror_symmetry,
)

NAME = "high_knees"
FPS = 30
CAMERA = "front"
LIGHTING = "studio"

# Pose at peak of left knee lift: left knee flexed 90°, hip flexed 100°, right arm up, left arm down.
_LEFT_PEAK = {
    hip_flex.L: 100,    knee_flex.L: 90,
    hip_flex.R: 0,      knee_flex.R: 0,
    shoulder_flex.R: 40,  elbow_flex.R: 90,
    shoulder_flex.L: -10, elbow_flex.L: 20,
}
_RIGHT_PEAK = {
    hip_flex.R: 100,    knee_flex.R: 90,
    hip_flex.L: 0,      knee_flex.L: 0,
    shoulder_flex.L: 40,  elbow_flex.L: 90,
    shoulder_flex.R: -10, elbow_flex.R: 20,
}

PHASES = cycle(reps=10, step_sec=0.3, left_pose=_LEFT_PEAK, right_pose=_RIGHT_PEAK)

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

Verify line count is < 80 (excluding imports):

```bash
sed -n '/^NAME/,/^]$/p' scripts/exercise_specs/high_knees.py | wc -l
```

Expected: < 80.

- [ ] **Step 2: Smoke run with `--no-render`**

```bash
cd scripts && BLENDER_BIN=blender python3 animate.py high_knees --no-render
```

Expected (initial run, will likely show validator failures requiring iteration):
- Exit 2 if validators fail (read the table, iterate the spec)
- Exit 0 if all 10 validators pass

If validators fail, iterate on the pose values in `_LEFT_PEAK`/`_RIGHT_PEAK` based on the diagnostic table. Common iterations:
- `shin_vertical` failing → the knee-flex magnitude needs to compensate for the hip-flex magnitude so the shin ends up pointing down in world space. Adjust `knee_flex.L` / `knee_flex.R` upward in 5° increments until the validator's `observed` reading drops below the threshold. (The exact relationship depends on the bind-pose orientation of the shin bone, which is why we iterate against the validator rather than computing it analytically.)
- `mirror_symmetry` failing → verify left and right poses use identical magnitudes for symmetric joints (e.g., `hip_flex.L: 100` matches `hip_flex.R: 100`).
- `joint_velocity_max` failing → arm-swing or knee values may be too aggressive for the 0.3s step. Reduce magnitudes or lengthen `step_sec`.
- `hip_no_*_drift` failing → root motion is leaking from somewhere; verify `reset_to_t_pose` is clearing root translations and the Hips bone isn't being keyed.

Iterate until exit 0.

- [ ] **Step 3: Commit (with iteration history if applicable)**

```bash
git add scripts/exercise_specs/high_knees.py
git commit -m "feat(blender): high_knees pilot spec — all validators passing"
```

---

### Task 12: Pilot render + acceptance

**Files:**
- Modify: `assets/exercise-renders/high_knees.mp4` (overwritten by the new pipeline)

- [ ] **Step 1: Run full render**

```bash
cd scripts && BLENDER_BIN=blender python3 animate.py high_knees
```

Expected:
- Exit 0
- All 10 validators pass with numeric readouts shown
- `WROTE .../assets/exercise-renders/high_knees.mp4`
- `WROTE .../assets/blender/casual_man_high_knees.blend` (gitignored)

- [ ] **Step 2: Inspect MP4 visually**

Open `assets/exercise-renders/high_knees.mp4` in a video player. Verify:
1. Vertical shins at peak of each knee lift
2. No lateral hip wobble
3. Counter-rhythm arm swing (right arm up when left knee up)
4. No foot clipping below ground plane
5. Cadence feels like a real high-knees drill (not too slow / not robotic)

- [ ] **Step 3: Side-by-side regression check vs current high_knees.mp4**

The current MP4 already has changes staged (per `git status`). To compare against the previous committed version:

```bash
git show HEAD:assets/exercise-renders/high_knees.mp4 > /tmp/high_knees_old.mp4
ffprobe -v error -show_entries stream=width,height,r_frame_rate,duration /tmp/high_knees_old.mp4
ffprobe -v error -show_entries stream=width,height,r_frame_rate,duration assets/exercise-renders/high_knees.mp4
```

Open both side by side. Acceptance: new MP4 is at least equal quality to old, ideally cleaner cadence and pose. If clearly worse, revert: `git checkout assets/exercise-renders/high_knees.mp4` and iterate the spec further before commit.

- [ ] **Step 4: Commit MP4**

```bash
git add assets/exercise-renders/high_knees.mp4
git commit -m "feat(blender): re-render high_knees via spec-driven pipeline"
```

---

### Task 13: `SKILL.md` — the playbook

**Files:**
- Create: `.claude/skills/blender-exercise-animation/SKILL.md`

- [ ] **Step 1: Write the skill body**

Create `.claude/skills/blender-exercise-animation/SKILL.md`:

```markdown
---
name: blender-exercise-animation
description: Use when authoring or updating an exercise demo animation for the GymAI app. Triggers — "create/update animation for <exercise>", "fix the <exercise> demo", any work in scripts/exercise_specs/, scripts/animation_lib/, or assets/blender/casual_man_*. Rig-specific to casual_man_rigged.blend (Mixamo bone names).
---

# Blender Exercise Animation

Spec-driven animation authoring for the GymAI app's exercise demos. The rig is `assets/blender/casual_man_rigged.blend` (Mixamo skeleton). Validators are non-negotiable: no MP4 is rendered until every validator passes. Output overwrites `assets/exercise-renders/<exercise>.mp4` (the path the app already consumes).

## The rig

- File: `assets/blender/casual_man_rigged.blend` — read-only. Never open it in Blender to mutate. All work goes through `animate.py`, which opens a copy in memory.
- Bones: Mixamo naming (`mixamorig:LeftLeg`, etc.). Use `animation_lib.rig.Bones` constants and the joint accessors (`hip_flex.L`, `knee_flex.R`, etc.) — never raw bone strings.
- Existing pilot: `scripts/exercise_specs/high_knees.py`. Use it as a template.

## Authoring a spec

1. Copy a similar exercise's module into `scripts/exercise_specs/<new_exercise>.py`.
2. Required module attrs: `NAME` (must equal filename), `FPS`, `CAMERA`, `LIGHTING`, `PHASES`, `VALIDATORS`. Optional: `RESOLUTION`, `FBX_PATH`.
3. Phases declare end-of-phase pose. The library interpolates from the previous phase (or T-pose for phase 0). Tempo is implicit in `duration_sec`.
4. **Validators are mandatory.** A spec with empty `VALIDATORS` is rejected at load time. Prefer composing existing primitives over writing new ones — only add a primitive to `validators.py` when a class of failure isn't expressible by combinations.
5. Camera and lighting are **named presets** from `animation_lib.cameras`. Add new presets to `cameras.py` (with a documented angle and use case); never inline camera math in a spec.

## Build and iterate

```bash
cd scripts
python3 animate.py <exercise>                 # full: validate + render MP4 + save .blend
python3 animate.py <exercise> --no-render     # validate only — fast spec iteration
python3 animate.py <exercise> --frame 30      # render single PNG, spot-check pose
python3 animate.py <exercise> --keep-blend    # save .blend even on validator failure (debug)
```

Exit codes: 0 success, 1 spec error, 2 validator failure (table printed), 3 render error.

On validator failure: **fix the spec, not the validator.** Loosening a threshold or removing a validator without a documented reason is a smell.

## Output

- MP4: `assets/exercise-renders/<exercise>.mp4` — overwrites; this is what the app consumes.
- .blend: `assets/blender/casual_man_<exercise>.blend` — gitignored debug artifact.

## What NOT to do

- Don't mutate `casual_man_rigged.blend`. Treat it as the read-only source.
- Don't touch `xbot_exercises.blend` or `scripts/render-exercises.py`. Those are legacy and will be deleted once all 40 exercises migrate to the new pipeline.
- Don't render before validators pass. The CLI literally won't let you. Don't try to game it (e.g., temporarily commenting validators in the spec).
- Don't use `FBX_PATH` overlay as a workaround for not writing the spec yourself. Overlay is a deliberate motion-source choice for cases where Mixamo motion is good (rare); it's not an authoring shortcut.

## Adding a camera or lighting preset

Edit `scripts/animation_lib/cameras.py`. Add the entry to the `_CAMERAS` or `_LIGHTING` dict with a comment documenting the angle and intended use case. Reference it by name from specs. Keep the registry small.

## Migration path

Each exercise migrates in its own PR: spec module + MP4 + (optionally) deletion of the corresponding line from `scripts/render-exercises.py`. When the last exercise migrates:

1. Delete `scripts/render-exercises.py`
2. Delete `assets/blender/xbot_exercises.blend` (gitignored, just stop maintaining)
3. Update `app/CLAUDE.md` to remove references to the old pipeline

## Known limitations

- FBX overlay support is not implemented yet. First exercise that genuinely needs it (likely `shadow_boxing`) introduces it.
- Validators are geometric only; visual screenshot review is deferred.
- Bones are keyed in Euler XYZ rotation mode (converted from Mixamo's quaternion mode at reset). If a spec needs to set Y- or Z-axis rotations on a bone the existing primitives only key X for, the conversion is already done — just include the (bone, "Y") key in the pose dict.
```

- [ ] **Step 2: Verify the skill loads (smoke check)**

```bash
ls -la .claude/skills/blender-exercise-animation/SKILL.md
head -3 .claude/skills/blender-exercise-animation/SKILL.md
```

Expected: file exists, frontmatter visible.

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/blender-exercise-animation/SKILL.md
git commit -m "feat(blender): project-level skill body for exercise animation"
```

---

### Task 14: Final cleanup + verification sweep

- [ ] **Step 1: Run full test suite**

```bash
cd scripts && python3 -m pytest -v
```

Expected: all tests pass (smoke, cameras, motion, pose_data, rig, all validator suites). Total: 30+ tests.

- [ ] **Step 2: Run pilot end-to-end one more time**

```bash
cd scripts && BLENDER_BIN=blender python3 animate.py high_knees
```

Expected: exit 0, all 10 validators pass, MP4 + .blend written.

- [ ] **Step 3: Run typecheck and lint to ensure no app code broke**

```bash
pnpm typecheck
pnpm lint
```

Expected: both clean. (The skill changes are in Python, but verify nothing in TS regressed.)

- [ ] **Step 4: Verify gitignore behavior**

```bash
git check-ignore -v assets/blender/casual_man_rigged.blend
git check-ignore -v assets/blender/casual_man_high_knees.blend
```

Expected:
- `casual_man_rigged.blend` — NOT ignored (the `!` exception line)
- `casual_man_high_knees.blend` — IS ignored (the `*.blend` rule)

- [ ] **Step 5: Final review and commit any cleanup**

```bash
git status
```

If anything stale (e.g., debug PNGs, leftover `frame_*.png`), remove and commit. Otherwise: done.

---

## Acceptance Summary

The plan is complete when:

1. All Tasks 1–14 are committed
2. `cd scripts && python3 -m pytest` exits 0 with 30+ passing tests
3. `cd scripts && python3 animate.py high_knees` exits 0 with all 10 validators passing and an MP4 written
4. `assets/exercise-renders/high_knees.mp4` shows: vertical shins at peak, no lateral wobble, counter-rhythm arm swing, no foot clipping, realistic cadence
5. `scripts/exercise_specs/high_knees.py` is < 80 lines excluding imports
6. The skill is loaded by Claude Code: `.claude/skills/blender-exercise-animation/SKILL.md` with frontmatter is in place

## Out of Scope (deferred to follow-up plans)

- Migration of the 39 other exercises (each one PR; the pilot is the template)
- FBX overlay support (introduce when first non-procedural-friendly exercise requires it)
- Visual screenshot review by Claude (add only if geometric validators prove insufficient)
- Deletion of `render-exercises.py` and `xbot_exercises.blend` (only after all 40 migrate)
