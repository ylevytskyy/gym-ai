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
