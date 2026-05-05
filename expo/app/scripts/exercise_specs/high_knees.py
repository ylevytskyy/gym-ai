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
_HIP_L          = ("mixamorig:LeftUpLeg",  "X")
_HIP_R          = ("mixamorig:RightUpLeg", "X")
_KNEE_L         = ("mixamorig:LeftLeg",    "X")
_KNEE_R         = ("mixamorig:RightLeg",   "X")
# Shoulder X axis = arm down/up (90° = arm hanging at side).
# Shoulder Z axis = forward/back swing (+ forward, − backward, 0 = hanging).
_SHOULDER_L_DN  = ("mixamorig:LeftArm",    "X")  # base "arm down" channel
_SHOULDER_R_DN  = ("mixamorig:RightArm",   "X")
_SHOULDER_L_SW  = ("mixamorig:LeftArm",    "Z")  # forward/back swing channel
_SHOULDER_R_SW  = ("mixamorig:RightArm",   "Z")
_ELBOW_L        = ("mixamorig:LeftForeArm",  "X")
_ELBOW_R        = ("mixamorig:RightForeArm", "X")
_SPINE          = ("mixamorig:Spine",      "X")

# Runner's stance: arms down at sides + forearms bent ~90° at the elbow.
_ARMS_DOWN = {
    _SHOULDER_L_DN: 90,  _SHOULDER_R_DN: 90,
    _ELBOW_L:       90,  _ELBOW_R:       90,
}

# Counter-rhythm arm swing: opposite-side arm to the lifted leg swings forward
# (hand reaches forward, in front of chest), same-side arm swings back (hand
# behind hip). Swing happens on Z axis: +60° = arm forward, −60° = arm behind.
# Spine X +10° = slight forward lean (running posture).
_LEFT_PEAK = {
    **_ARMS_DOWN,
    _HIP_L: 125, _KNEE_L: -130,
    _HIP_R: 0,   _KNEE_R: 0,
    _SHOULDER_R_SW:  60,   # right arm SWINGS FORWARD (hand near chest)
    _SHOULDER_L_SW: -60,   # left arm SWINGS BACK (hand behind hip)
    _SPINE: 10,
}
_RIGHT_PEAK = {
    **_ARMS_DOWN,
    _HIP_R: 125, _KNEE_R: -130,
    _HIP_L: 0,   _KNEE_L: 0,
    _SHOULDER_L_SW:  60,
    _SHOULDER_R_SW: -60,
    _SPINE: 10,
}

# Brief setup phase to get arms out of T-pose before the leg cycle starts.
# 3 frames (~0.1s) is short enough that viewers see arms-already-down by the
# time the legs begin moving.
PHASES = [phase(0.1, _ARMS_DOWN, name="setup")] + cycle(
    reps=6, step_sec=0.5, left_pose=_LEFT_PEAK, right_pose=_RIGHT_PEAK,
)

VALIDATORS = [
    (hip_no_lateral_drift,  {"max_meters": 0.05}),
    (hip_no_sagittal_drift, {"max_meters": 0.10}),
    (foot_world_y_min,      {"side": "both", "min_y": -0.01}),
    (joint_angle_at,        {"joint": _HIP_L, "at_phases": ["lift_left_*"],  "min_deg": 115, "max_deg": 135}),
    (joint_angle_at,        {"joint": _HIP_R, "at_phases": ["lift_right_*"], "min_deg": 115, "max_deg": 135}),
    (joint_angle_at,        {"joint": _KNEE_L, "at_phases": ["lift_left_*"],  "min_deg": -140, "max_deg": -120}),
    (joint_angle_at,        {"joint": _KNEE_R, "at_phases": ["lift_right_*"], "min_deg": -140, "max_deg": -120}),
    (joint_velocity_max,    {"joint": _HIP_L, "max_dps": 800}),
    (joint_velocity_max,    {"joint": _HIP_R, "max_dps": 800}),
]
