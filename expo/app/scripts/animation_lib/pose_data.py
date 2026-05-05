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
