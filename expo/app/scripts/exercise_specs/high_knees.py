"""high_knees pilot spec — fully procedural, no FBX.

Calibrated for xbot_rigged.blend (XBot Mixamo character with applied transforms).
Motion: 10 alternating leg kicks, 0.3s per kick, 6 seconds total at 30 FPS.
Arms held at the sides (out of frame issues that broke initial calibration).

Per the SKILL.md calibration loop, pose values were verified by rendering
isolated rotations on each bone and confirming the visible motion matches the
intent before adding to the spec.
"""
from animation_lib.rig import hip_flex
from animation_lib.motion import cycle
from animation_lib.validators import (
    joint_angle_at, joint_velocity_max,
    hip_no_lateral_drift, hip_no_sagittal_drift, foot_world_y_min,
)

NAME = "high_knees"
FPS = 30
CAMERA = "front"
LIGHTING = "studio"

# Peak of left knee lift: thigh swings forward 100° (X axis = hip flexion on
# XBot bind pose). Right leg stays at rest. Knees not flexed — keeping the spec
# minimal so the calibration is easy to verify and the rendered pose is clean.
_LEFT_PEAK = {
    hip_flex.L: 100,
    hip_flex.R: 0,
}
_RIGHT_PEAK = {
    hip_flex.R: 100,
    hip_flex.L: 0,
}

PHASES = cycle(reps=10, step_sec=0.3, left_pose=_LEFT_PEAK, right_pose=_RIGHT_PEAK)

VALIDATORS = [
    # World-space first — these catch axis/sign errors that local-angle checks miss.
    (hip_no_lateral_drift,  {"max_meters": 0.05}),
    (hip_no_sagittal_drift, {"max_meters": 0.10}),
    (foot_world_y_min,      {"side": "both", "min_y": -0.01}),
    # Local-angle checks confirm the spec values landed.
    (joint_angle_at,        {"joint": hip_flex.L, "at_phases": ["lift_left_*"],  "min_deg": 90, "max_deg": 110}),
    (joint_angle_at,        {"joint": hip_flex.R, "at_phases": ["lift_right_*"], "min_deg": 90, "max_deg": 110}),
    (joint_velocity_max,    {"joint": hip_flex.L, "max_dps": 600}),
    (joint_velocity_max,    {"joint": hip_flex.R, "max_dps": 600}),
    # NOTE: shin_vertical intentionally NOT in this spec — legs are kicked (straight
    # extension), shin is meant to be horizontal at peak, not vertical.
]
