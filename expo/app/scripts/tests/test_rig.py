from animation_lib.rig import (
    Bones, hip_flex, knee_flex, ankle_flex, shoulder_flex, elbow_flex,
)


def test_bones_namespace_has_mixamo_prefix():
    assert Bones.HIPS == "mixamorig:Hips"
    assert Bones.LEFT_UP_LEG == "mixamorig:LeftUpLeg"
    assert Bones.RIGHT_FOOT == "mixamorig:RightFoot"


def test_hip_flex_left_resolves():
    assert hip_flex.L == ("mixamorig:LeftUpLeg", "X")


def test_hip_flex_right_resolves():
    assert hip_flex.R == ("mixamorig:RightUpLeg", "X")


def test_knee_flex_resolves():
    assert knee_flex.L == ("mixamorig:LeftLeg", "X")
    assert knee_flex.R == ("mixamorig:RightLeg", "X")


def test_shoulder_flex_resolves():
    assert shoulder_flex.L == ("mixamorig:LeftArm", "X")
    assert shoulder_flex.R == ("mixamorig:RightArm", "X")


def test_elbow_flex_resolves():
    assert elbow_flex.L == ("mixamorig:LeftForeArm", "X")
    assert elbow_flex.R == ("mixamorig:RightForeArm", "X")


def test_ankle_flex_resolves():
    assert ankle_flex.L == ("mixamorig:LeftFoot", "X")
    assert ankle_flex.R == ("mixamorig:RightFoot", "X")
