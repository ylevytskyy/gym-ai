"""high_knees pilot spec — fully procedural, no FBX.

Calibrated for xbot_rigged.blend (XBot Mixamo character, applied transforms).
Visual target: classic high-knees fitness exercise — knee comes up to chest
height with shin folded straight down, arms at sides (no T-pose), alternating
left and right at running tempo.

Calibration done by isolated-rotation tests (see /tmp/cal_*.png artifacts):
- LeftUpLeg X +100° → thigh swings forward to horizontal (hip flexion)
- LeftLeg X -90° → shin folds straight down from lifted knee (knee flexion)
- LeftArm Z -90° / RightArm Z +90° → arms hang at sides
"""
from animation_lib.motion import phase, cycle
from animation_lib.validators import (
    joint_angle_at, joint_velocity_max,
    hip_no_lateral_drift, hip_no_sagittal_drift, foot_world_y_min,
)

NAME = "high_knees"
FPS = 30
CAMERA = "front_top_left"
LIGHTING = "studio"

# Use raw (bone, axis) tuples directly — rig.py's joint accessors map to axes
# that don't all match this rig's bind pose conventions, so the spec is explicit.
_HIP_L      = ("mixamorig:LeftUpLeg",  "X")
_HIP_R      = ("mixamorig:RightUpLeg", "X")
_KNEE_L     = ("mixamorig:LeftLeg",    "X")
_KNEE_R     = ("mixamorig:RightLeg",   "X")
_SHOULDER_L = ("mixamorig:LeftArm",    "X")
_SHOULDER_R = ("mixamorig:RightArm",   "X")
_ELBOW_L    = ("mixamorig:LeftForeArm",  "X")
_ELBOW_R    = ("mixamorig:RightForeArm", "X")
_SPINE      = ("mixamorig:Spine",      "X")

# Runner's stance: arms down at sides + forearms bent ~90° at the elbow.
# Both shoulders/elbows use the same sign (calibrated empirically — this rig's
# bind pose doesn't require L/R sign mirroring).
_RUNNER_ARMS = {
    _SHOULDER_L: 90,  _SHOULDER_R: 90,
    _ELBOW_L:    90,  _ELBOW_R:    90,
}
_ARMS_DOWN = _RUNNER_ARMS  # alias kept for backward-readability in the spec

# Counter-rhythm arm swing: opposite arm to lifted leg comes UP/FORWARD;
# same-side arm comes BACK. Achieved by adjusting shoulder X (lower vs higher
# value) — base shoulder is +90° (arm down); deviations from that swing the arm.
# Spine X +10° is a slight forward lean (runner's posture).
_LEFT_PEAK = {
    _HIP_L: 125, _KNEE_L: -90,
    _HIP_R: 0,   _KNEE_R: 0,
    # right arm forward (counter to left knee), left arm back
    _SHOULDER_R: 60,  _ELBOW_R: 90,   # arm forward from neutral 90° → 60°
    _SHOULDER_L: 120, _ELBOW_L: 90,   # arm back from neutral 90° → 120°
    _SPINE: 10,
}
_RIGHT_PEAK = {
    _HIP_R: 125, _KNEE_R: -90,
    _HIP_L: 0,   _KNEE_L: 0,
    _SHOULDER_L: 60,  _ELBOW_L: 90,
    _SHOULDER_R: 120, _ELBOW_R: 90,
    _SPINE: 10,
}

# Brief setup phase to get arms out of T-pose before the leg cycle starts.
# 3 frames (~0.1s) is short enough that viewers see arms-already-down by the
# time the legs begin moving.
PHASES = [phase(0.1, _ARMS_DOWN, name="setup")] + cycle(
    reps=10, step_sec=0.3, left_pose=_LEFT_PEAK, right_pose=_RIGHT_PEAK,
)

VALIDATORS = [
    (hip_no_lateral_drift,  {"max_meters": 0.05}),
    (hip_no_sagittal_drift, {"max_meters": 0.10}),
    (foot_world_y_min,      {"side": "both", "min_y": -0.01}),
    (joint_angle_at,        {"joint": _HIP_L, "at_phases": ["lift_left_*"],  "min_deg": 115, "max_deg": 135}),
    (joint_angle_at,        {"joint": _HIP_R, "at_phases": ["lift_right_*"], "min_deg": 115, "max_deg": 135}),
    (joint_angle_at,        {"joint": _KNEE_L, "at_phases": ["lift_left_*"],  "min_deg": -100, "max_deg": -80}),
    (joint_angle_at,        {"joint": _KNEE_R, "at_phases": ["lift_right_*"], "min_deg": -100, "max_deg": -80}),
    (joint_velocity_max,    {"joint": _HIP_L, "max_dps": 800}),
    (joint_velocity_max,    {"joint": _HIP_R, "max_dps": 800}),
]
