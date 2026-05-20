import pytest
from animation_lib.pose_data import PoseHistory, PoseFrame, BonePose


def test_bone_pose_holds_world_position_and_rotation():
    bp = BonePose(world_pos=(0.0, 0.0, 1.0), world_quat=(1.0, 0.0, 0.0, 0.0), local_euler_deg=(0.0, 0.0, 0.0))
    assert bp.world_pos == (0.0, 0.0, 1.0)


def test_pose_frame_indexed_by_bone_name():
    bp = BonePose(world_pos=(0,0,0), world_quat=(1,0,0,0), local_euler_deg=(0,0,0))
    pf = PoseFrame(frame=10, bones={"mixamorig:LeftLeg": bp})
    assert pf.bones["mixamorig:LeftLeg"] is bp


def test_pose_history_lookup_by_frame():
    bp = BonePose(world_pos=(0,0,0), world_quat=(1,0,0,0), local_euler_deg=(0,0,0))
    history = PoseHistory(
        frames=[PoseFrame(frame=0, bones={}), PoseFrame(frame=10, bones={"x": bp})],
        phase_to_frame={"start": 0, "lift_left_0": 10},
    )
    assert history.frame(10).bones["x"] is bp


def test_pose_history_phase_to_frame_lookup():
    history = PoseHistory(frames=[], phase_to_frame={"lift_left_0": 9, "lift_right_0": 18})
    assert history.frame_for_phase("lift_left_0") == 9


def test_pose_history_frames_matching_wildcard():
    history = PoseHistory(
        frames=[],
        phase_to_frame={"lift_left_0": 9, "lift_left_1": 27, "lift_right_0": 18},
    )
    matches = history.frames_matching("lift_left_*")
    assert sorted(matches) == [9, 27]
