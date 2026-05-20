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


# Bones whose world position and local Euler validators read.
TRACKED_BONES = (
    Bones.HIPS,
    Bones.SPINE, Bones.SPINE_1, Bones.SPINE_2, Bones.NECK, Bones.HEAD,
    Bones.LEFT_UP_LEG, Bones.LEFT_LEG, Bones.LEFT_FOOT,
    Bones.RIGHT_UP_LEG, Bones.RIGHT_LEG, Bones.RIGHT_FOOT,
    Bones.LEFT_ARM, Bones.LEFT_FORE_ARM, Bones.LEFT_HAND,
    Bones.RIGHT_ARM, Bones.RIGHT_FORE_ARM, Bones.RIGHT_HAND,
)
