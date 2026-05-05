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
) -> list[Phase]:
    """Emit `reps * 2` alternating phases named lift_left_<i> and lift_right_<i>."""
    out: list[Phase] = []
    for i in range(reps):
        out.append(phase(step_sec, left_pose, name=f"lift_left_{i}"))
        out.append(phase(step_sec, right_pose, name=f"lift_right_{i}"))
    return out
