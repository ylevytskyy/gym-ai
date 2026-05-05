"""Rig-specific bone constants and joint mappings for casual_man_rigged.blend.

The rig uses "Base Human" naming (not Mixamo). Bone names were verified by
inspecting the actual armature: blender --background casual_man_rigged.blend
--python list_bones.py.
"""
from dataclasses import dataclass


class Bones:
    HIPS = "Base HumanPelvis_01"
    SPINE = "Base HumanSpine1_011"
    SPINE_1 = "Base HumanSpine2_012"
    SPINE_2 = "Base HumanSpine3_013"
    NECK = "Base HumanNeck1_054"
    HEAD = "Base HumanHead_056"

    LEFT_UP_LEG = "Base HumanLThigh_02"
    LEFT_LEG = "Base HumanLCalf_00"
    LEFT_FOOT = "Base HumanLFoot_03"
    LEFT_TOE_BASE = "Base HumanLDigit11_04"

    RIGHT_UP_LEG = "Base HumanRThigh_06"
    RIGHT_LEG = "Base HumanRCalf_07"
    RIGHT_FOOT = "Base HumanRFoot_08"
    RIGHT_TOE_BASE = "Base HumanRDigit11_09"

    LEFT_SHOULDER = "Base HumanLCollarbone_016"
    LEFT_ARM = "Base HumanLUpperarm_017"
    LEFT_FORE_ARM = "Base HumanLForearm_018"
    LEFT_HAND = "Base HumanLPalm_019"

    RIGHT_SHOULDER = "Base HumanRCollarbone_035"
    RIGHT_ARM = "Base HumanRUpperarm_036"
    RIGHT_FORE_ARM = "Base HumanRForearm_037"
    RIGHT_HAND = "Base HumanRPalm_038"


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


# Bones whose world position validators read.
TRACKED_BONES = (
    Bones.HIPS,
    Bones.LEFT_UP_LEG, Bones.LEFT_LEG, Bones.LEFT_FOOT,
    Bones.RIGHT_UP_LEG, Bones.RIGHT_LEG, Bones.RIGHT_FOOT,
    Bones.LEFT_ARM, Bones.LEFT_FORE_ARM,
    Bones.RIGHT_ARM, Bones.RIGHT_FORE_ARM,
)
