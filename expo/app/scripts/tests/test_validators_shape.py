import math
import pytest
from animation_lib.pose_data import PoseHistory, PoseFrame, BonePose
from animation_lib.validators import shin_vertical, mirror_symmetry


def _bone(pos=(0,0,0), euler=(0,0,0)):
    return BonePose(world_pos=pos, world_quat=(1,0,0,0), local_euler_deg=euler)


def test_shin_vertical_passes_when_shin_points_down():
    # LeftLeg at hip-knee (z=0.5), LeftFoot at z=0.05 → shin points (0,0,-0.45) which is "down".
    history = PoseHistory(
        frames=[PoseFrame(frame=9, bones={
            "mixamorig:LeftLeg": _bone(pos=(0.1, 0.0, 0.5)),
            "mixamorig:LeftFoot": _bone(pos=(0.1, 0.0, 0.05)),
        })],
        phase_to_frame={"lift_left_0": 9},
    )
    [r] = shin_vertical(history, side="left", at_phases=["lift_left_*"], threshold_deg=10)
    assert r.passed is True
    assert r.observed < 10


def test_shin_vertical_fails_when_tilted_forward():
    # LeftLeg at z=0.5, LeftFoot far forward at y=0.4, z=0.2 → big forward tilt.
    history = PoseHistory(
        frames=[PoseFrame(frame=9, bones={
            "mixamorig:LeftLeg": _bone(pos=(0.0, 0.0, 0.5)),
            "mixamorig:LeftFoot": _bone(pos=(0.0, 0.4, 0.2)),
        })],
        phase_to_frame={"lift_left_0": 9},
    )
    [r] = shin_vertical(history, side="left", at_phases=["lift_left_*"], threshold_deg=10)
    assert r.passed is False
    assert r.observed > 10


def test_shin_vertical_fails_when_no_phases_match():
    history = PoseHistory(
        frames=[PoseFrame(frame=9, bones={
            "mixamorig:LeftLeg": _bone(pos=(0.0, 0.0, 0.5)),
            "mixamorig:LeftFoot": _bone(pos=(0.0, 0.0, 0.05)),
        })],
        phase_to_frame={"lift_left_0": 9},
    )
    [r] = shin_vertical(history, side="left", at_phases=["typo_*"], threshold_deg=10)
    assert r.passed is False
    assert "no phases matched" in r.message


def test_mirror_symmetry_passes_when_equal():
    history = PoseHistory(
        frames=[PoseFrame(frame=9, bones={
            "mixamorig:LeftUpLeg": _bone(euler=(100.0, 0.0, 0.0)),
            "mixamorig:RightUpLeg": _bone(euler=(105.0, 0.0, 0.0)),
        })],
        phase_to_frame={"peak": 9},
    )
    [r] = mirror_symmetry(
        history,
        left_joint=("mixamorig:LeftUpLeg", "X"),
        right_joint=("mixamorig:RightUpLeg", "X"),
        tolerance_deg=8,
        at_phases=["peak"],
    )
    assert r.passed is True


def test_mirror_symmetry_fails_when_asymmetric():
    history = PoseHistory(
        frames=[PoseFrame(frame=9, bones={
            "mixamorig:LeftUpLeg": _bone(euler=(100.0, 0.0, 0.0)),
            "mixamorig:RightUpLeg": _bone(euler=(80.0, 0.0, 0.0)),
        })],
        phase_to_frame={"peak": 9},
    )
    [r] = mirror_symmetry(
        history,
        left_joint=("mixamorig:LeftUpLeg", "X"),
        right_joint=("mixamorig:RightUpLeg", "X"),
        tolerance_deg=8,
        at_phases=["peak"],
    )
    assert r.passed is False
