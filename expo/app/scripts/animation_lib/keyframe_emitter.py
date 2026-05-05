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
