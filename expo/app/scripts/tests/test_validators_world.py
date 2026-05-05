import pytest
from animation_lib.pose_data import PoseHistory, PoseFrame, BonePose
from animation_lib.validators import (
    world_position_drift_max,
    hip_no_lateral_drift,
    hip_no_sagittal_drift,
    foot_world_y_min,
)



def _bone_at(pos):
    return BonePose(world_pos=pos, world_quat=(1,0,0,0), local_euler_deg=(0,0,0))


def test_world_position_drift_max_passes_when_in_bounds():
    history = PoseHistory(
        frames=[
            PoseFrame(frame=0, bones={"hip": _bone_at((0.0, 0.0, 1.0))}),
            PoseFrame(frame=180, bones={"hip": _bone_at((0.02, 0.0, 1.0))}),
        ],
        phase_to_frame={},
    )
    [r] = world_position_drift_max(history, bone="hip", axis="X", max_meters=0.05)
    assert r.passed is True


def test_world_position_drift_max_fails_when_drifting():
    history = PoseHistory(
        frames=[
            PoseFrame(frame=0, bones={"hip": _bone_at((0.0, 0.0, 1.0))}),
            PoseFrame(frame=180, bones={"hip": _bone_at((0.087, 0.0, 1.0))}),
        ],
        phase_to_frame={},
    )
    [r] = world_position_drift_max(history, bone="hip", axis="X", max_meters=0.05)
    assert r.passed is False
    assert "0.087" in r.message


def test_hip_no_lateral_drift_wraps_with_default_bone():
    history = PoseHistory(
        frames=[
            PoseFrame(frame=0, bones={"mixamorig:Hips": _bone_at((0.0, 0.0, 1.0))}),
            PoseFrame(frame=10, bones={"mixamorig:Hips": _bone_at((0.01, 0.0, 1.0))}),
        ],
        phase_to_frame={},
    )
    [r] = hip_no_lateral_drift(history, max_meters=0.05)
    assert r.passed is True


def test_foot_world_y_min_flags_clipping():
    history = PoseHistory(
        frames=[
            PoseFrame(frame=0, bones={"mixamorig:LeftFoot": _bone_at((0.0, 0.0, 0.0))}),
            PoseFrame(frame=10, bones={"mixamorig:LeftFoot": _bone_at((0.0, 0.0, -0.05))}),
        ],
        phase_to_frame={},
    )
    failures = [r for r in foot_world_y_min(history, side="left", min_y=0.0) if not r.passed]
    assert len(failures) == 1
    assert failures[0].frame == 10


def test_world_position_drift_max_fails_when_bone_missing():
    history = PoseHistory(
        frames=[
            PoseFrame(frame=0, bones={}),
            PoseFrame(frame=10, bones={}),
        ],
        phase_to_frame={},
    )
    [r] = world_position_drift_max(history, bone="mixamorig:Hips", axis="X", max_meters=0.05)
    assert r.passed is False
    assert "not captured" in r.message


def test_foot_world_y_min_uses_blender_z_axis():
    # If the function read world_pos[1] (Blender Y = forward), this test would
    # fail because forward position is 0.0 (above min). The fact that it reads
    # world_pos[2] (Blender Z = up) is what makes -0.05 register as "below floor".
    history = PoseHistory(
        frames=[
            PoseFrame(frame=10, bones={"mixamorig:LeftFoot": BonePose(
                world_pos=(0.0, 0.0, -0.05),
                world_quat=(1, 0, 0, 0),
                local_euler_deg=(0, 0, 0),
            )}),
        ],
        phase_to_frame={},
    )
    failures = [r for r in foot_world_y_min(history, side="left", min_y=0.0) if not r.passed]
    assert len(failures) == 1
    assert failures[0].observed == pytest.approx(-0.05)
