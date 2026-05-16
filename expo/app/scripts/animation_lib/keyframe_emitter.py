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


def apply_ik_pins(
    armature_obj,
    pins: dict[str, tuple[float, float, float]],
    rotations: dict[str, tuple[float, float, float]] | None = None,
    chain_count: int = 3,
    chain_counts: dict[str, int] | None = None,
) -> set[str]:
    """Install IK constraints on each bone in `pins`, targeting a static Empty at world XYZ.

    `rotations`: optional `{bone_name: (rx_deg, ry_deg, rz_deg)}` — when provided
    for a bone, the IK constraint also locks the bone's WORLD orientation to
    match the target Empty's rotation (use_rotation=True). Use this when the
    bone's orientation matters (e.g. palm flat on floor for cat_cow tabletop).

    `chain_count`: default solver chain length for every pin.
    `chain_counts`: optional `{bone_name: int}` overriding `chain_count` per
    bone. Use this when hands and feet need different chain depths (e.g.,
    hands need chain=4 to include the shoulder, but feet need chain=3 so the
    IK never rotates Hips).

    Returns the set of bone names inside each IK chain; callers pass it to
    `emit_phases(skip_bones=...)` so the chain isn't FK-keyed (FK keyframes on
    IK-driven bones cause solver jitter and conflicting interpolation).
    """
    import bpy
    import math
    import mathutils

    rotations = rotations or {}
    chain_counts = chain_counts or {}
    skip: set[str] = set()
    scene_collection = bpy.context.scene.collection
    for bone_name, target_pos in pins.items():
        safe = bone_name.replace(":", "_")
        target = bpy.data.objects.new(f"IK_target_{safe}", None)
        target.location = mathutils.Vector(target_pos)
        target.empty_display_type = "PLAIN_AXES"
        target.empty_display_size = 0.05
        if bone_name in rotations:
            rx, ry, rz = rotations[bone_name]
            target.rotation_euler = mathutils.Euler(
                (math.radians(rx), math.radians(ry), math.radians(rz)),
                "XYZ",
            )
        scene_collection.objects.link(target)

        cc = chain_counts.get(bone_name, chain_count)
        pbone = armature_obj.pose.bones[bone_name]
        ik = pbone.constraints.new("IK")
        ik.target = target
        ik.chain_count = cc
        ik.use_rotation = bone_name in rotations

        cur = pbone
        for _ in range(cc):
            if cur is None:
                break
            skip.add(cur.name)
            cur = cur.parent
    return skip


def emit_phases(
    armature_obj,
    phases: list[Phase],
    fps: int,
    skip_bones: set[str] | None = None,
) -> dict[str, int]:
    """Set keyframes for each phase's end frame; returns {phase_name: end_frame_idx}.

    Phase 0 emits from the rest pose; subsequent phases linearly interpolate
    from the previous phase's end. Bones not mentioned in a phase's pose dict
    keep their value from the previous phase.
    """
    import bpy
    import math

    skip_bones = skip_bones or set()
    phase_to_frame: dict[str, int] = {}
    current_pose: dict[tuple[str, str], float] = {}
    accum_sec = 0.0

    # Apply the first phase's pose values to the armature so frame 0
    # holds the exercise's starting pose rather than the T-pose rest state.
    # This eliminates the T-pose→tabletop interpolation glitch that appears
    # when the MP4 loops (last frame → frame 0 = jarring jump otherwise).
    # Bones NOT mentioned in the first phase keep their reset_to_t_pose()
    # identity values at frame 0, which is correct (they never move).
    if phases:
        for joint, value_deg in phases[0].pose.items():
            if not (isinstance(joint, tuple) and len(joint) == 2):
                continue
            bone_name, axis = joint
            if bone_name in skip_bones:
                continue
            pbone = armature_obj.pose.bones.get(bone_name)
            if pbone is None:
                continue
            if axis.startswith("loc_"):
                idx = {"loc_X": 0, "loc_Y": 1, "loc_Z": 2}[axis]
                loc = list(pbone.location)
                loc[idx] = value_deg
                pbone.location = loc
            else:
                idx = {"X": 0, "Y": 1, "Z": 2}[axis]
                euler = list(pbone.rotation_euler)
                euler[idx] = math.radians(value_deg)
                pbone.rotation_euler = euler

    # Insert keyframe at frame 0 — exercise bones now have first-phase values;
    # background bones keep rest-pose (rotation 0, location 0). IK-chain bones
    # are skipped: FK keyframes on them would conflict with the IK solver.
    bpy.context.scene.frame_set(0)
    for pbone in armature_obj.pose.bones:
        if pbone.name in skip_bones:
            continue
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
        for (bone_name, axis), value in current_pose.items():
            if bone_name in skip_bones:
                continue
            pbone = armature_obj.pose.bones.get(bone_name)
            if pbone is None:
                raise KeyError(f"bone {bone_name!r} not found on armature")
            if axis.startswith("loc_"):
                # Translation keyframe; value is in METERS along the bone's local axis.
                idx = {"loc_X": 0, "loc_Y": 1, "loc_Z": 2}[axis]
                loc = list(pbone.location)
                loc[idx] = value
                pbone.location = loc
                pbone.keyframe_insert(data_path="location", frame=end_frame)
            else:
                # Rotation keyframe; value is in DEGREES around the bone's local axis.
                idx = {"X": 0, "Y": 1, "Z": 2}[axis]
                euler = list(pbone.rotation_euler)
                euler[idx] = math.radians(value)
                pbone.rotation_euler = euler
                pbone.keyframe_insert(data_path="rotation_euler", frame=end_frame)

    # Set scene end frame.
    bpy.context.scene.frame_end = phase_to_frame[phases[-1].name] if phases else 0
    bpy.context.scene.frame_start = 0
    return phase_to_frame
