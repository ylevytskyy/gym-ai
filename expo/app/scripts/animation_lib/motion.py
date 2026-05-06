"""Phase definitions and motion-shape factory helpers used by exercise specs."""
from dataclasses import dataclass
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
    midstride_pose: dict | None = None,
    midstride_sec: float | None = None,
) -> list[Phase]:
    """Emit `reps * 2` alternating phases named lift_left_<i> and lift_right_<i>.

    If `midstride_pose` is given, insert a `mid_*_<i>` phase between each peak.
    The midstride phase represents the body's mid-step position (e.g., feet near
    ground, hips at lowest point) — useful for adding a vertical bounce by
    setting Hips loc_Z=0 in midstride and a positive value at peaks.
    Default midstride duration is half a step.
    """
    if midstride_sec is None:
        midstride_sec = step_sec / 2
    out: list[Phase] = []
    for i in range(reps):
        out.append(phase(step_sec, left_pose, name=f"lift_left_{i}"))
        if midstride_pose is not None:
            out.append(phase(midstride_sec, midstride_pose, name=f"mid_l_{i}"))
        out.append(phase(step_sec, right_pose, name=f"lift_right_{i}"))
        if midstride_pose is not None:
            out.append(phase(midstride_sec, midstride_pose, name=f"mid_r_{i}"))
    return out
