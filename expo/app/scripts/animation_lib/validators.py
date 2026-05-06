"""Geometric validation primitives. Pure functions over PoseHistory.

A 'joint' identifier is a (bone_name, axis) tuple — e.g. ("mixamorig:LeftUpLeg", "X").
"""
import math
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
    return world_position_drift_max(history, bone="mixamorig:Hips", axis="X", max_meters=max_meters)


def hip_no_sagittal_drift(history: PoseHistory, *, max_meters: float) -> list[ValidationResult]:
    return world_position_drift_max(history, bone="mixamorig:Hips", axis="Y", max_meters=max_meters)


_FOOT_BONES = {"left": "mixamorig:LeftFoot", "right": "mixamorig:RightFoot"}
_SHIN_BONES = {
    "left": ("mixamorig:LeftLeg", "mixamorig:LeftFoot"),
    "right": ("mixamorig:RightLeg", "mixamorig:RightFoot"),
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


_HAND_BONES = {
    "left": "mixamorig:LeftHand",
    "right": "mixamorig:RightHand",
}
_SHOULDER_BONES = {
    "left": "mixamorig:LeftArm",
    "right": "mixamorig:RightArm",
}


def hand_forward_of_shoulder(
    history: PoseHistory,
    *,
    side: str,
    at_phases: list[str],
    min_forward_meters: float = 0.05,
    min_z_meters: float | None = None,
    max_z_meters: float | None = None,
) -> list[ValidationResult]:
    """World-space check: hand is forward of the shoulder at specified phases.

    Uses Blender world convention: -Y = forward. Verifies that
    ``hand.world_y < shoulder.world_y - min_forward_meters`` (hand is in front
    of shoulder by at least ``min_forward_meters``). Optionally constrains the
    hand world Z height to [min_z_meters, max_z_meters] (world up = Z).

    This catches wrong-axis elbow bugs: if the elbow axis is a twist (no actual
    bend), the hand stays co-linear with the upper arm and never reaches forward
    chin height. A local-angle validator cannot catch this because it passes
    regardless of the axis being twist or flex.
    """
    target_frames: list[int] = []
    for pattern in at_phases:
        target_frames.extend(history.frames_matching(pattern))
    if not target_frames:
        return [ValidationResult(
            primitive=f"hand_forward_of_shoulder({side})",
            side=side,
            frame=-1,
            observed=0.0,
            expected=f"hand forward of shoulder at phases matching {at_phases}",
            passed=False,
            message=f"no phases matched patterns {at_phases}",
        )]
    hand_bone = _HAND_BONES[side]
    shoulder_bone = _SHOULDER_BONES[side]
    results: list[ValidationResult] = []
    for f in sorted(set(target_frames)):
        bones = history.frame(f).bones
        if hand_bone not in bones or shoulder_bone not in bones:
            results.append(ValidationResult(
                primitive=f"hand_forward_of_shoulder({side})",
                side=side, frame=f, observed=0.0,
                expected=f"hand forward of shoulder by ≥ {min_forward_meters}m",
                passed=False,
                message=f"hand or shoulder bone not captured at f{f}",
            ))
            continue
        hand_y = bones[hand_bone].world_pos[1]        # world Y (-Y = forward)
        shoulder_y = bones[shoulder_bone].world_pos[1]
        forward_margin = shoulder_y - hand_y          # positive = hand is forward
        passed_fwd = forward_margin >= min_forward_meters
        hand_z = bones[hand_bone].world_pos[2]        # world Z = up
        passed_z = True
        z_msg = ""
        if min_z_meters is not None and hand_z < min_z_meters:
            passed_z = False
            z_msg = f"; hand Z={hand_z:.3f}m below min {min_z_meters}m"
        if max_z_meters is not None and hand_z > max_z_meters:
            passed_z = False
            z_msg = f"; hand Z={hand_z:.3f}m above max {max_z_meters}m"
        passed = passed_fwd and passed_z
        results.append(ValidationResult(
            primitive=f"hand_forward_of_shoulder({side})",
            side=side, frame=f,
            observed=forward_margin,
            expected=f"≥ {min_forward_meters}m forward of shoulder" + (
                f", Z in [{min_z_meters},{max_z_meters}]" if (min_z_meters or max_z_meters) else ""
            ),
            passed=passed,
            message=("" if passed else
                     f"forward margin {forward_margin:.3f}m (need ≥ {min_forward_meters}m)"
                     + z_msg),
        ))
    if not results:
        results.append(ValidationResult(
            primitive=f"hand_forward_of_shoulder({side})",
            side=side, frame=-1, observed=0.0,
            expected=f"≥ {min_forward_meters}m forward of shoulder",
            passed=True,
        ))
    return results


def hand_world_z_range(
    history: PoseHistory,
    *,
    side: str,
    at_phases: list[str],
    min_z_meters: float,
    max_z_meters: float,
) -> list[ValidationResult]:
    """World-space height check: hand Z (world up) must be in [min_z, max_z] at phases.

    Use for the back-swing peak to ensure the hand lands at hip level (≈0.80–1.05m)
    and not at chest/head height (the up-behind-head failure mode).
    """
    target_frames: list[int] = []
    for pattern in at_phases:
        target_frames.extend(history.frames_matching(pattern))
    if not target_frames:
        return [ValidationResult(
            primitive=f"hand_world_z_range({side})",
            side=side,
            frame=-1,
            observed=0.0,
            expected=f"hand Z in [{min_z_meters}, {max_z_meters}] at phases matching {at_phases}",
            passed=False,
            message=f"no phases matched patterns {at_phases}",
        )]
    hand_bone = _HAND_BONES[side]
    results: list[ValidationResult] = []
    for f in sorted(set(target_frames)):
        bones = history.frame(f).bones
        if hand_bone not in bones:
            results.append(ValidationResult(
                primitive=f"hand_world_z_range({side})",
                side=side, frame=f, observed=0.0,
                expected=f"hand Z in [{min_z_meters}, {max_z_meters}]m",
                passed=False,
                message=f"hand bone not captured at f{f}",
            ))
            continue
        hand_z = bones[hand_bone].world_pos[2]
        passed = min_z_meters <= hand_z <= max_z_meters
        results.append(ValidationResult(
            primitive=f"hand_world_z_range({side})",
            side=side, frame=f,
            observed=hand_z,
            expected=f"Z in [{min_z_meters}, {max_z_meters}]m",
            passed=passed,
            message=("" if passed else
                     f"hand Z={hand_z:.3f}m outside [{min_z_meters}, {max_z_meters}]m"),
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
