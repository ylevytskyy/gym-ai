import math
import pytest
from animation_lib.pose_data import PoseHistory, PoseFrame, BonePose
from animation_lib.validators import (
    ValidationResult,
    run_validators,
    joint_angle_at,
    joint_angle_range,
    joint_velocity_max,
)


def _frame(idx, **bones):
    return PoseFrame(frame=idx, bones={
        name: BonePose(world_pos=(0,0,0), world_quat=(1,0,0,0), local_euler_deg=euler)
        for name, euler in bones.items()
    })


def test_joint_angle_at_passes_in_range():
    history = PoseHistory(
        frames=[_frame(9, **{"mixamorig:LeftUpLeg": (100.0, 0.0, 0.0)})],
        phase_to_frame={"lift_left_0": 9},
    )
    results = joint_angle_at(history, joint=("mixamorig:LeftUpLeg", "X"),
                             at_phases=["lift_left_*"], min_deg=90, max_deg=110)
    assert len(results) == 1
    assert results[0].passed is True
    assert results[0].observed == pytest.approx(100.0)


def test_joint_angle_at_fails_below_min():
    history = PoseHistory(
        frames=[_frame(9, **{"mixamorig:LeftUpLeg": (45.0, 0.0, 0.0)})],
        phase_to_frame={"lift_left_0": 9},
    )
    results = joint_angle_at(history, joint=("mixamorig:LeftUpLeg", "X"),
                             at_phases=["lift_left_*"], min_deg=90, max_deg=110)
    assert results[0].passed is False
    assert "45" in results[0].message


def test_joint_velocity_max_flags_pop():
    # Frame 0: 0°, Frame 1: 50° → velocity = 50 * fps. At fps=30, 1500 dps → fails 600 cap.
    history = PoseHistory(
        frames=[
            _frame(0, **{"mixamorig:LeftUpLeg": (0.0, 0.0, 0.0)}),
            _frame(1, **{"mixamorig:LeftUpLeg": (50.0, 0.0, 0.0)}),
        ],
        phase_to_frame={},
    )
    results = joint_velocity_max(history, joint=("mixamorig:LeftUpLeg", "X"),
                                 max_dps=600, fps=30)
    failures = [r for r in results if not r.passed]
    assert len(failures) >= 1


def test_run_validators_aggregates():
    history = PoseHistory(
        frames=[_frame(9, **{"mixamorig:LeftUpLeg": (100.0, 0.0, 0.0)})],
        phase_to_frame={"lift_left_0": 9},
    )
    spec = [
        (joint_angle_at, {"joint": ("mixamorig:LeftUpLeg", "X"),
                          "at_phases": ["lift_left_*"], "min_deg": 90, "max_deg": 110}),
    ]
    summary = run_validators(history, spec, fps=30)
    assert summary.all_passed is True
    assert len(summary.results) == 1


def test_joint_angle_at_fails_when_no_phases_match():
    history = PoseHistory(
        frames=[_frame(9, **{"mixamorig:LeftUpLeg": (100.0, 0.0, 0.0)})],
        phase_to_frame={"lift_left_0": 9},
    )
    results = joint_angle_at(history, joint=("mixamorig:LeftUpLeg", "X"),
                             at_phases=["typo_*"], min_deg=90, max_deg=110)
    assert len(results) == 1
    assert results[0].passed is False
    assert "no phases matched" in results[0].message


def test_joint_angle_at_fails_when_bone_missing():
    history = PoseHistory(
        frames=[_frame(9, **{"mixamorig:OtherBone": (100.0, 0.0, 0.0)})],
        phase_to_frame={"lift_left_0": 9},
    )
    results = joint_angle_at(history, joint=("mixamorig:LeftUpLeg", "X"),
                             at_phases=["lift_left_*"], min_deg=90, max_deg=110)
    assert len(results) == 1
    assert results[0].passed is False
    assert "not captured" in results[0].message


def test_joint_angle_range_fails_when_out_of_range():
    history = PoseHistory(
        frames=[
            _frame(0, **{"mixamorig:Hips": (0.0, 0.0, 0.0)}),
            _frame(10, **{"mixamorig:Hips": (45.0, 0.0, 0.0)}),  # outside [-10, 10]
        ],
        phase_to_frame={},
    )
    results = joint_angle_range(history, joint=("mixamorig:Hips", "X"), min_deg=-10, max_deg=10)
    failures = [r for r in results if not r.passed]
    assert len(failures) == 1
    assert failures[0].frame == 10


def test_run_validators_injects_fps_into_velocity():
    # Velocity at fps=30: 0→50° in 1 frame = 1500 dps, fails 600 cap.
    history = PoseHistory(
        frames=[
            _frame(0, **{"mixamorig:LeftUpLeg": (0.0, 0.0, 0.0)}),
            _frame(1, **{"mixamorig:LeftUpLeg": (50.0, 0.0, 0.0)}),
        ],
        phase_to_frame={},
    )
    spec = [
        (joint_velocity_max, {"joint": ("mixamorig:LeftUpLeg", "X"), "max_dps": 600}),
    ]
    summary = run_validators(history, spec, fps=30)
    # Note: spec did NOT pass `fps`; run_validators must inject it.
    failures = [r for r in summary.results if not r.passed]
    assert len(failures) >= 1
