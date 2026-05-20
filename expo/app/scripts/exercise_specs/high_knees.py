"""high_knees pilot spec — fully procedural, no FBX.

Calibrated for xbot_rigged.blend (XBot Mixamo character, applied transforms).
Visual target: classic high-knees fitness exercise — knee comes up to chest
height with shin folded straight down, arms swinging counter-rhythmically with
hand reaching chin level at forward peak, alternating left and right at running
tempo.

Calibration crib (verified by isolated-rotation tests):
- LeftUpLeg X +100° → thigh swings forward to horizontal (hip flexion)
- LeftLeg X -90°    → shin folds straight down from lifted knee (knee flexion)
- LeftArm X +90°    → arm rotates down from T-pose to hang at side
- LeftArm Y / RightArm Y → SAGITTAL SHOULDER SWING. Sign convention DIFFERS
                      between left and right because RightArm bone points -X
                      (opposite to LeftArm +X):
                        LeftArm  Y-  → arm swings FORWARD
                        LeftArm  Y+  → arm swings BACKWARD
                        RightArm Y+  → arm swings FORWARD  (OPPOSITE of Left)
                        RightArm Y-  → arm swings BACKWARD (OPPOSITE of Left)
                      Earlier work used Z for LeftArm, which is a TWIST.
- LeftForeArm Z / RightForeArm Z → SAGITTAL ELBOW FLEX in working pose (arm
                      at side with parent X+90° offset). Local Y is TWIST axis
                      at all shoulder positions; local Z is the flex axis.
                      Sign convention also differs left vs right:
                        LeftForeArm  Z+  → forearm folds toward face (forward)
                        LeftForeArm  Z-  → forearm folds away from face
                        RightForeArm Z-  → forearm folds toward face (forward)
                        RightForeArm Z+  → forearm folds away from face
                      Critical insight: at the BACK peak, the elbow still folds
                      in the same toward-face direction (Z+ left / Z- right),
                      but the upper arm is tilted backward by the shoulder swing,
                      so the hand ends up at hip level BEHIND the body —
                      NOT up-behind-head. The elbow Z sign is identical at both
                      forward and back peaks.
                      World hand positions (full-pose introspection 2026-05-06):
                        Left  fwd peak  Z=+120°  shldr=Y-45°: Y=-0.249 Z=+1.537 (chin)
                        Left  back peak Z= +55°  shldr=Y+20°: Y=+0.006 Z=+1.009 (hip)
                        Right fwd peak  Z=-120°  shldr=Y+45°: Y=-0.249 Z=+1.537 (chin)
                        Right back peak Z= -55°  shldr=Y-20°: Y=+0.006 Z=+1.009 (hip)
                      Neutral hanging (shoulder Y=0°): Z=+90° left / Z=-90° right
- LeftFoot X        → ANKLE FLEX (X- = dorsiflex/toes up, X+ = plantarflex).
- Hips loc_Y        → VERTICAL BOUNCE in WORLD UP. The Hips bone's local Y
                      maps to world Z (up). Earlier work used loc_Z, which is
                      world forward/back — that's why bounce was invisible.
- Spine Z           → AXIAL TWIST (torso rotates around vertical axis). Spine X
                      is forward lean; Spine Y is lateral side-bend.
- Hand{Finger}{1,2,3} X+ → finger curl toward palm (relaxed soft-fist pose).
"""
from animation_lib.motion import phase, cycle
from animation_lib.validators import (
    joint_angle_at, joint_velocity_max,
    hip_no_lateral_drift, hip_no_sagittal_drift, foot_world_y_min,
    hand_forward_of_shoulder, hand_world_z_range,
)

NAME = "high_knees"
FPS = 30
CAMERA = "front_top_left"
LIGHTING = "studio"

_HIP_L          = ("mixamorig:LeftUpLeg",  "X")
_HIP_R          = ("mixamorig:RightUpLeg", "X")
_KNEE_L         = ("mixamorig:LeftLeg",    "X")
_KNEE_R         = ("mixamorig:RightLeg",   "X")
_SHOULDER_L_DN  = ("mixamorig:LeftArm",    "X")  # arm-down channel (90 = at side)
_SHOULDER_R_DN  = ("mixamorig:RightArm",   "X")
_SHOULDER_L_SW  = ("mixamorig:LeftArm",    "Y")  # sagittal swing: Y- fwd, Y+ back (Left bone points +X)
_SHOULDER_R_SW  = ("mixamorig:RightArm",   "Y")  # sagittal swing: Y+ fwd, Y- back (Right bone points -X, OPPOSITE)
_ELBOW_L        = ("mixamorig:LeftForeArm",  "Z")  # sagittal flex: Z+ toward face (fwd fold), Z- away from face
_ELBOW_R        = ("mixamorig:RightForeArm", "Z")  # sagittal flex: Z- toward face (fwd fold), Z+ away from face (OPPOSITE)
_FOOT_L         = ("mixamorig:LeftFoot",   "X")
_FOOT_R         = ("mixamorig:RightFoot",  "X")
_SPINE          = ("mixamorig:Spine",      "X")  # forward lean (waist hinge)
_TWIST          = ("mixamorig:Spine",      "Z")  # axial twist (counter-rotation)
_HIPS_UP        = ("mixamorig:Hips",       "loc_Y")  # vertical bounce, world up


def _relaxed_fist() -> dict:
    """Soft-fist finger curl. Proximal knuckle 30°, middle/distal 45°. Thumb
    lighter (15/25/20°). Tip bones (*4) are non-rendering markers, skipped."""
    pose = {}
    for side in ("Left", "Right"):
        for finger in ("Index", "Middle", "Ring", "Pinky"):
            pose[(f"mixamorig:{side}Hand{finger}1", "X")] = 30
            pose[(f"mixamorig:{side}Hand{finger}2", "X")] = 45
            pose[(f"mixamorig:{side}Hand{finger}3", "X")] = 45
        pose[(f"mixamorig:{side}HandThumb1", "X")] = 15
        pose[(f"mixamorig:{side}HandThumb2", "X")] = 25
        pose[(f"mixamorig:{side}HandThumb3", "X")] = 20
    return pose


_FIST = _relaxed_fist()

# Runner's neutral stance: arms hang at sides with elbows at canonical 90°
# anatomical flex; soft-fist hand pose; feet flat; body at base height.
# Elbow Z convention: Z+90 left / Z-90 right both fold the forearm forward
# (toward face direction) when arm hangs at side. This is the same sign used
# at the forward peak (120°) and the backward peak (55°) — the sign never
# flips; only the magnitude changes and the shoulder angle determines whether
# the hand ends up at chin (shoulder fwd) or hip (shoulder back).
_ARMS_DOWN = {
    **_FIST,
    _SHOULDER_L_DN: 90,  _SHOULDER_R_DN: 90,
    _SHOULDER_L_SW:  0,  _SHOULDER_R_SW:  0,
    _ELBOW_L:       90,  _ELBOW_R:       -90,  # neutral: +90L/-90R folds fwd
    _FOOT_L:         0,  _FOOT_R:          0,
    _HIPS_UP:      0.0,
}

# Counter-rhythm cardio/HIIT high-knees variant.
#   Shoulder forward swing: L=-45° (Y- left) / R=+45° (Y+ right)
#     Both reach chin at Z≈1.537m (introspection-verified full pose)
#   Shoulder back swing:    L=+20° (Y+ left) / R=-20° (Y- right)
#     Both reach hip at Z≈1.009m (introspection-verified full pose)
#   Elbow forward peak:  L=+120° (Z+) / R=-120° (Z-)  — toward-face direction
#   Elbow back peak:     L= +55° (Z+) / R= -55° (Z-)  — same fold direction
#     Key: elbow always folds toward face-side (Z+ left / Z- right), never flips.
#     The shoulder angle determines whether the hand ends up at chin or hip.
#   Foot dorsiflex on swing leg: -45° (toes up, exaggerated for visibility)
#   Spine X forward lean:   +5°
#   Spine Z counter-twist:  ±4° (right shoulder fwd at LEFT_PEAK matches contra-
#                                 lateral arm-leg pairing; flip for RIGHT_PEAK)
#   Hips loc_Y vertical lift: +0.05 m at peaks; 0 at midstride (bounce trough)
_LEFT_PEAK = {
    **_ARMS_DOWN,
    _HIP_L: 125, _KNEE_L: -130, _FOOT_L: -45,   # left swing leg, dorsiflexed
    _HIP_R: 0,   _KNEE_R: 0,    _FOOT_R: 0,      # right stance
    # Right arm forward (RightArm Y+ = forward; Z-120 folds toward face)
    _SHOULDER_R_SW:  45, _ELBOW_R: -120,
    # Left arm back (LeftArm Y+ = backward; Z+55 folds toward face → hip height)
    _SHOULDER_L_SW:  20, _ELBOW_L:   55,
    _SPINE: 5,
    _TWIST: 4,           # right shoulder forward (matches right-arm forward)
    _HIPS_UP: 0.05,
}
_RIGHT_PEAK = {
    **_ARMS_DOWN,
    _HIP_R: 125, _KNEE_R: -130, _FOOT_R: -45,
    _HIP_L: 0,   _KNEE_L: 0,    _FOOT_L: 0,
    # Left arm forward (LeftArm Y- = forward; Z+120 folds toward face)
    _SHOULDER_L_SW: -45, _ELBOW_L:  120,
    # Right arm back (RightArm Y- = backward; Z-55 folds toward face → hip height)
    _SHOULDER_R_SW: -20, _ELBOW_R:  -55,
    _SPINE: 5,
    _TWIST: -4,
    _HIPS_UP: 0.05,
}

# Mid-stride: legs partially down, hips at base height (bounce trough), arms
# pass through neutral on their way to the next peak, torso un-twisted.
_MIDSTRIDE = {
    **_ARMS_DOWN,
    _HIP_L: 30, _KNEE_L: -40, _FOOT_L: 0,
    _HIP_R: 30, _KNEE_R: -40, _FOOT_R: 0,
    _SPINE: 5,
    _TWIST: 0,
    _HIPS_UP: 0.0,
}

# Tempo: 0.3s per peak + 0.1s midstride = 0.4s per leg cycle = 150 spm cardio.
PHASES = [phase(0.1, _ARMS_DOWN, name="setup")] + cycle(
    reps=6, step_sec=0.3, midstride_sec=0.1,
    left_pose=_LEFT_PEAK, right_pose=_RIGHT_PEAK, midstride_pose=_MIDSTRIDE,
)

VALIDATORS = [
    (hip_no_lateral_drift,  {"max_meters": 0.05}),
    (hip_no_sagittal_drift, {"max_meters": 0.10}),
    (foot_world_y_min,      {"side": "both", "min_y": -0.01}),
    (joint_angle_at,        {"joint": _HIP_L, "at_phases": ["lift_left_*"],  "min_deg": 115, "max_deg": 135}),
    (joint_angle_at,        {"joint": _HIP_R, "at_phases": ["lift_right_*"], "min_deg": 115, "max_deg": 135}),
    (joint_angle_at,        {"joint": _KNEE_L, "at_phases": ["lift_left_*"],  "min_deg": -140, "max_deg": -120}),
    (joint_angle_at,        {"joint": _KNEE_R, "at_phases": ["lift_right_*"], "min_deg": -140, "max_deg": -120}),
    (joint_velocity_max,    {"joint": _HIP_L, "max_dps": 1500}),
    (joint_velocity_max,    {"joint": _HIP_R, "max_dps": 1500}),
    # World-space arm validators (forward peaks): catch wrong-axis elbow bugs.
    # At each forward peak, the forward-swinging hand must be in front of the
    # shoulder (world -Y forward) AND at chin-level height (Z ≥ 1.40m).
    # This fails when the elbow axis is Y (twist) — hand stays co-linear with arm.
    (hand_forward_of_shoulder, {
        "side": "right",
        "at_phases": ["lift_left_*"],   # right arm forward at left-knee peak
        "min_forward_meters": 0.05,
        "min_z_meters": 1.40,
    }),
    (hand_forward_of_shoulder, {
        "side": "left",
        "at_phases": ["lift_right_*"],  # left arm forward at right-knee peak
        "min_forward_meters": 0.05,
        "min_z_meters": 1.40,
    }),
    # World-space arm validators (back peaks): hand must be at hip level (Z ≈ 0.80–1.05m).
    # This prevents the up-behind-head regression (old Z- sign sent hand to Z≈1.18m chest).
    (hand_world_z_range, {
        "side": "left",
        "at_phases": ["lift_left_*"],   # left arm back at left-knee peak
        "min_z_meters": 0.80,
        "max_z_meters": 1.05,
    }),
    (hand_world_z_range, {
        "side": "right",
        "at_phases": ["lift_right_*"],  # right arm back at right-knee peak
        "min_z_meters": 0.80,
        "max_z_meters": 1.05,
    }),
]
