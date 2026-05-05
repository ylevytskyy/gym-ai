"""Geometric validation primitives. Pure functions over PoseHistory.

A 'joint' identifier is a (bone_name, axis) tuple — e.g. ("mixamorig:LeftUpLeg", "X").
"""
from dataclasses import dataclass

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
    if not target_frames:
        return [ValidationResult(
            primitive=f"joint_angle_at({bone},{axis})",
            side=None,
            frame=-1,
            observed=0.0,
            expected=f"in [{min_deg}, {max_deg}] at phases matching {at_phases}",
            passed=False,
            message=f"no phases matched patterns {at_phases} — typo or unbuilt phase?",
        )]
    results: list[ValidationResult] = []
    for f in sorted(set(target_frames)):
        bones = history.frame(f).bones
        if bone not in bones:
            results.append(ValidationResult(
                primitive=f"joint_angle_at({bone},{axis})",
                side=None,
                frame=f,
                observed=0.0,
                expected=f"in [{min_deg}, {max_deg}]",
                passed=False,
                message=f"bone {bone!r} not captured at frame {f}",
            ))
            continue
        bp = bones[bone]
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
