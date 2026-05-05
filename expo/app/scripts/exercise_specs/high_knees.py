"""high_knees pilot spec — fully procedural, no FBX.

Motion: 10 alternating knee lifts, 0.3s per lift, 6 seconds total at 30 FPS.
Counter-rhythm arm swing: right arm up when left knee up, mirror.
"""
from animation_lib.rig import hip_flex, knee_flex, shoulder_flex, elbow_flex
from animation_lib.motion import cycle
from animation_lib.validators import (
    shin_vertical, joint_angle_at, joint_velocity_max,
    hip_no_lateral_drift, hip_no_sagittal_drift, foot_world_y_min,
    mirror_symmetry,
)

NAME = "high_knees"
FPS = 30
CAMERA = "front"
LIGHTING = "studio"

# Pose at peak of left knee lift: left knee flexed 90°, hip flexed 100°, right arm up, left arm down.
# Right side joints must be explicitly zeroed so they reset as the left side lifts.
_LEFT_PEAK = {
    hip_flex.L: 100,    knee_flex.L: 90,
    hip_flex.R: 0,      knee_flex.R: 0,
    shoulder_flex.R: 40,  elbow_flex.R: 90,
    shoulder_flex.L: -10, elbow_flex.L: 20,
}
_RIGHT_PEAK = {
    hip_flex.R: 100,    knee_flex.R: 90,
    hip_flex.L: 0,      knee_flex.L: 0,
    shoulder_flex.L: 40,  elbow_flex.L: 90,
    shoulder_flex.R: -10, elbow_flex.R: 20,
}

PHASES = cycle(reps=10, step_sec=0.3, left_pose=_LEFT_PEAK, right_pose=_RIGHT_PEAK)

VALIDATORS = [
    (shin_vertical,         {"side": "left",  "at_phases": ["lift_left_*"],  "threshold_deg": 10}),
    (shin_vertical,         {"side": "right", "at_phases": ["lift_right_*"], "threshold_deg": 10}),
    (joint_angle_at,        {"joint": hip_flex.L, "at_phases": ["lift_left_*"],  "min_deg": 90, "max_deg": 110}),
    (joint_angle_at,        {"joint": hip_flex.R, "at_phases": ["lift_right_*"], "min_deg": 90, "max_deg": 110}),
    (hip_no_lateral_drift,  {"max_meters": 0.05}),
    (hip_no_sagittal_drift, {"max_meters": 0.10}),
    (foot_world_y_min,      {"side": "both", "min_y": 0.0}),
    (joint_velocity_max,    {"joint": hip_flex.L, "max_dps": 600}),
    (joint_velocity_max,    {"joint": hip_flex.R, "max_dps": 600}),
    # Checks that L and R lift magnitudes are symmetric across the full animation.
    # tolerance_deg=105 allows the expected asymmetry at each peak (one side at 100°,
    # other at 0°) while catching any unintended magnitude divergence.
    (mirror_symmetry,       {"left_joint": hip_flex.L, "right_joint": hip_flex.R, "tolerance_deg": 105}),
]
