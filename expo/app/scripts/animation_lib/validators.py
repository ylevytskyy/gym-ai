"""Geometric validation primitives. Pure functions over PoseHistory.

A 'joint' identifier is a (bone_name, axis) tuple — e.g. (Bones.LEFT_UP_LEG, "X").
"""
import math
from dataclasses import dataclass

from .pose_data import PoseHistory
from .rig import Bones as _Bones


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
    first_pf = sorted_frames[0]
    last_pf = sorted_frames[-1]
    if bone not in first_pf.bones or bone not in last_pf.bones:
        return [ValidationResult(
            primitive=f"world_position_drift_max({bone},{axis})",
            side=None,
            frame=last_pf.frame,
            observed=0.0,
            expected=f"≤ {max_meters} m",
            passed=False,
            message=f"bone {bone!r} not captured at first/last frame",
        )]
    first = first_pf.bones[bone]
    last = last_pf.bones[bone]
    idx = _AXIS_INDEX[axis]
    drift = abs(last.world_pos[idx] - first.world_pos[idx])
    passed = drift <= max_meters
    return [ValidationResult(
        primitive=f"world_position_drift_max({bone},{axis})",
        side=None,
        frame=last_pf.frame,
        observed=drift,
        expected=f"≤ {max_meters} m",
        passed=passed,
        message=("" if passed else f"drift {drift:.3f}m between f{first_pf.frame} and f{last_pf.frame}"),
    )]


def hip_no_lateral_drift(history: PoseHistory, *, max_meters: float) -> list[ValidationResult]:
    return world_position_drift_max(history, bone=_Bones.HIPS, axis="X", max_meters=max_meters)


def hip_no_sagittal_drift(history: PoseHistory, *, max_meters: float) -> list[ValidationResult]:
    return world_position_drift_max(history, bone=_Bones.HIPS, axis="Y", max_meters=max_meters)


_FOOT_BONES = {"left": _Bones.LEFT_FOOT, "right": _Bones.RIGHT_FOOT}
_SHIN_BONES = {
    "left": (_Bones.LEFT_LEG, _Bones.LEFT_FOOT),
    "right": (_Bones.RIGHT_LEG, _Bones.RIGHT_FOOT),
}

# Blender world-coordinate Z is "up". The function exposes "y" in its public API
# because that's the screen-vertical convention exercise authors think in,
# but internally we read the Z index.
_VERTICAL_AXIS = 2  # Blender world Z = up


def foot_world_y_min(history: PoseHistory, *, side: str, min_y: float) -> list[ValidationResult]:
    """Verify foot world-vertical position stays at or above ``min_y``.

    The "y" in the name is the screen-vertical (up) convention used by exercise
    spec authors. Internally this reads the Blender world Z axis (index 2),
    which is the actual "up" direction in this rig's world coordinates.
    """
    sides = ["left", "right"] if side == "both" else [side]
    results: list[ValidationResult] = []
    any_failure = False
    for s in sides:
        bone = _FOOT_BONES[s]
        for pf in history.frames:
            if bone not in pf.bones:
                continue
            y = pf.bones[bone].world_pos[_VERTICAL_AXIS]
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


def shin_vertical(
    history: PoseHistory,
    *,
    side: str,
    at_phases: list[str],
    threshold_deg: float,
) -> list[ValidationResult]:
    """Check angle between shin (knee→foot) world-vector and (0,0,-1) is within threshold.

    Catches forward/backward shin tilt at peak frames in cyclic exercises like
    high_knees. Uses Blender world Z = up convention.
    """
    knee_bone, foot_bone = _SHIN_BONES[side]
    target_frames: list[int] = []
    for pattern in at_phases:
        target_frames.extend(history.frames_matching(pattern))
    if not target_frames:
        return [ValidationResult(
            primitive=f"shin_vertical(side={side})",
            side=side,
            frame=-1,
            observed=0.0,
            expected=f"≤ {threshold_deg}° at phases matching {at_phases}",
            passed=False,
            message=f"no phases matched patterns {at_phases} — typo or unbuilt phase?",
        )]
    results: list[ValidationResult] = []
    for f in sorted(set(target_frames)):
        bones = history.frame(f).bones
        if knee_bone not in bones or foot_bone not in bones:
            results.append(ValidationResult(
                primitive=f"shin_vertical(side={side})",
                side=side, frame=f, observed=0.0,
                expected=f"≤ {threshold_deg}°",
                passed=False,
                message=f"shin bones not captured at frame {f} ({knee_bone!r}, {foot_bone!r})",
            ))
            continue
        knee = bones[knee_bone].world_pos
        foot = bones[foot_bone].world_pos
        # Shin direction: foot - knee.
        dx = foot[0] - knee[0]
        dy = foot[1] - knee[1]
        dz = foot[2] - knee[2]
        length = math.sqrt(dx*dx + dy*dy + dz*dz) or 1e-9
        # Angle to (0,0,-1): cos(angle) = -dz / length.
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
    """Verify left/right symmetric joints stay symmetric within tolerance.

    If ``at_phases`` is None, checks every captured frame; otherwise only frames
    matching the given phase wildcards.
    """
    l_bone, l_axis = left_joint
    r_bone, r_axis = right_joint
    if at_phases is None:
        target_frames = [pf.frame for pf in history.frames]
    else:
        target_frames = []
        for pattern in at_phases:
            target_frames.extend(history.frames_matching(pattern))
        if not target_frames:
            return [ValidationResult(
                primitive=f"mirror_symmetry({l_bone}/{r_bone})",
                side=None,
                frame=-1,
                observed=0.0,
                expected=f"|L−R| ≤ {tolerance_deg}° at phases matching {at_phases}",
                passed=False,
                message=f"no phases matched patterns {at_phases} — typo or unbuilt phase?",
            )]
    results: list[ValidationResult] = []
    for f in sorted(set(target_frames)):
        bones = history.frame(f).bones
        if l_bone not in bones or r_bone not in bones:
            continue  # silently skip — the all-passed sentinel below covers this case if all skipped
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
    if not results:
        results.append(ValidationResult(
            primitive=f"mirror_symmetry({l_bone}/{r_bone})",
            side=None, frame=-1, observed=0.0,
            expected=f"|L−R| ≤ {tolerance_deg}°",
            passed=False,
            message=f"no frames had both {l_bone!r} and {r_bone!r} — bones not captured?",
        ))
    return results
