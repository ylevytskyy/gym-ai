"""scissor_kicks procedural spec — supine vertical alternating scissor.

Visual target: character lies supine, both legs raised, alternating one
leg up high while the other dips low (heel near floor but not touching).
Big-amplitude vertical scissor — visually dramatic up/down alternation
similar to flutter_kicks but with much larger swing.

Reference: XFit Daily "Scissor Kicks" demo (YouTube 0vDI5aU402c) shows
a side view of supine alternating leg raises with one leg high (~45-60°
hip flexion) and the other near the floor. Hands are by the sides.

Distinction from flutter_kicks (also supine alternating): flutter_kicks
uses a SMALL amplitude (HIGH=+28°, LOW=+8°, ~28 cm heel-Z separation),
suited to a controlled core hold. scissor_kicks uses a LARGE amplitude
(HIGH=+50°, LOW=+5°, ~58 cm separation), reading as a more dynamic
cardio-style scissor. Both share the supine setup and alternating
structure but the amplitude (and the visible motion character) differ.

Pose geometry derived from xbot_rig_axes.md plus calibration:
- Supine flip: Hips X=-90° + loc_Y=-0.95 m. Body on floor, hip joint
  at world Z ≈ 0.09 m, feet end at world -Y.
- Hip flexion uses LeftUpLeg/RightUpLeg local X. At X=+50, heel at
  world Z ≈ 0.09 + 0.86·sin(50°) = 0.749 m (high). At X=+5, heel at
  world Z ≈ 0.09 + 0.86·sin(5°) = 0.165 m (low, ~16 cm above floor —
  visibly hovering, not touching).
- Small lateral abduction Z=±10° keeps the legs laterally separated by
  ~30 cm even at the swap midpoint when both legs cross through equal
  heights. Without this, the legs would clip into each other at the
  midpoint of every alternation. With it, mesh intersection is
  geometrically impossible at any frame.
- Feet left at rest orientation (no foot-pose authoring).

Camera: front_top_left (3/4 elevated). Same camera as the lateral
crisscross variants attempted in earlier iterations; the vertical
motion reads clearly from this angle because the world-Z axis (up)
projects to screen-Y.

Phase structure: 0.2 s settle (frame 0 holds _PEAK_LEFT_UP) + 8
bilateral cycles at 1.2 s/cycle (0.6 s per leg swap). Total: 0.2 +
8×1.2 = 9.8 s. Final phase pose matches frame 0 for seamless loop.
"""
from animation_lib.motion import phase
from animation_lib.validators import (
    foot_world_y_min,
    hip_no_lateral_drift,
    hip_no_sagittal_drift,
    joint_angle_at,
    joint_angle_range,
    world_position_drift_max,
)


NAME = "scissor_kicks"
FPS = 30
CAMERA = "front_top_left"  # 3/4 elevated — vertical alternation reads as up/down
LIGHTING = "studio"


# Supine setup — same as flutter_kicks / dead_bug / glute_bridges.
_SUPINE = {
    ("mixamorig:Hips", "loc_Y"): -0.95,
    ("mixamorig:Hips", "X"):     -90,
}

# Hip-flexion endpoints. Big amplitude — heel travels from ~17 cm above
# floor (low) to ~75 cm above floor (high), 58 cm vertical sweep per leg.
_HIP_HIGH   = +50    # heel ≈ 0.75 m above floor
_HIP_LOW    = +5     # heel ≈ 0.17 m above floor (never touches)

# Small lateral abduction so the legs don't pass through each other at
# the swap midpoint (when both legs momentarily share a heel height).
# Z=±10° puts ankles ~15 cm from body midline on each side; ~30 cm
# total lateral separation — wider than any thigh cross-section.
_Z_SPREAD = 10

_KNEE_STRAIGHT = 0


# Peak A: left leg high, right leg low. Legs slightly spread laterally.
_PEAK_LEFT_UP = {
    **_SUPINE,
    ("mixamorig:LeftUpLeg",  "X"): _HIP_HIGH,
    ("mixamorig:RightUpLeg", "X"): _HIP_LOW,
    ("mixamorig:LeftUpLeg",  "Z"): -_Z_SPREAD,   # left ankle to char-LEFT
    ("mixamorig:RightUpLeg", "Z"): +_Z_SPREAD,   # right ankle to char-RIGHT
    ("mixamorig:LeftLeg",    "X"): _KNEE_STRAIGHT,
    ("mixamorig:RightLeg",   "X"): _KNEE_STRAIGHT,
}

# Peak B: right leg high, left leg low. Mirror of Peak A.
_PEAK_RIGHT_UP = {
    **_SUPINE,
    ("mixamorig:LeftUpLeg",  "X"): _HIP_LOW,
    ("mixamorig:RightUpLeg", "X"): _HIP_HIGH,
    ("mixamorig:LeftUpLeg",  "Z"): -_Z_SPREAD,
    ("mixamorig:RightUpLeg", "Z"): +_Z_SPREAD,
    ("mixamorig:LeftLeg",    "X"): _KNEE_STRAIGHT,
    ("mixamorig:RightLeg",   "X"): _KNEE_STRAIGHT,
}


# Hands pinned by sides on the floor — same pattern as flutter_kicks.
IK_PINS = {
    "mixamorig:LeftHand":  (+0.152, -0.25, 0.0),
    "mixamorig:RightHand": (-0.152, -0.25, 0.0),
}

IK_CHAIN_COUNTS = {
    "mixamorig:LeftHand":  3,
    "mixamorig:RightHand": 3,
}

IK_POLE_TARGETS = {
    "mixamorig:LeftHand":  (+1.5, 0.0, 0.0),
    "mixamorig:RightHand": (-1.5, 0.0, 0.0),
}


# 0.2 s settle (frame 0 holds _PEAK_LEFT_UP) + 8 bilateral cycles at
# 1.2 s/cycle (0.6 s per leg swap). Final phase pose matches frame 0
# so the loop is seamless.
_BILATERAL_REPS = 8

PHASES = [
    phase(0.2, _PEAK_LEFT_UP, name="settle"),
]
for _i in range(_BILATERAL_REPS):
    PHASES.append(phase(0.6, _PEAK_RIGHT_UP, name=f"peak_R_{_i}"))
    PHASES.append(phase(0.6, _PEAK_LEFT_UP,  name=f"peak_L_{_i}"))


VALIDATORS = [
    # Supine baseline holds throughout — Hips X stays near -90°.
    (joint_angle_at, {"joint": ("mixamorig:Hips", "X"),
                      "at_phases": ["settle", "peak_*"],
                      "min_deg": -93, "max_deg": -87}),

    # Hip flexion stays in the working range across the whole animation.
    # The two discrete pose values are 5 and 50; range gate [2, 53]
    # covers both + 3° tolerance for Bezier overshoot.
    (joint_angle_range, {"joint": ("mixamorig:LeftUpLeg", "X"),
                         "min_deg": 2, "max_deg": 53}),
    (joint_angle_range, {"joint": ("mixamorig:RightUpLeg", "X"),
                         "min_deg": 2, "max_deg": 53}),

    # Settle phase = _PEAK_LEFT_UP, so left=HIGH, right=LOW.
    (joint_angle_at, {"joint": ("mixamorig:LeftUpLeg", "X"),
                      "at_phases": ["settle"],
                      "min_deg": _HIP_HIGH - 3, "max_deg": _HIP_HIGH + 3}),
    (joint_angle_at, {"joint": ("mixamorig:RightUpLeg", "X"),
                      "at_phases": ["settle"],
                      "min_deg": _HIP_LOW - 3, "max_deg": _HIP_LOW + 3}),

    # peak_L_* = left leg up high, right leg down low.
    (joint_angle_at, {"joint": ("mixamorig:LeftUpLeg", "X"),
                      "at_phases": ["peak_L_*"],
                      "min_deg": _HIP_HIGH - 3, "max_deg": _HIP_HIGH + 3}),
    (joint_angle_at, {"joint": ("mixamorig:RightUpLeg", "X"),
                      "at_phases": ["peak_L_*"],
                      "min_deg": _HIP_LOW - 3, "max_deg": _HIP_LOW + 3}),

    # peak_R_* = right leg up high, left leg down low.
    (joint_angle_at, {"joint": ("mixamorig:LeftUpLeg", "X"),
                      "at_phases": ["peak_R_*"],
                      "min_deg": _HIP_LOW - 3, "max_deg": _HIP_LOW + 3}),
    (joint_angle_at, {"joint": ("mixamorig:RightUpLeg", "X"),
                      "at_phases": ["peak_R_*"],
                      "min_deg": _HIP_HIGH - 3, "max_deg": _HIP_HIGH + 3}),

    # Lateral abduction is constant throughout — both legs slightly spread.
    (joint_angle_range, {"joint": ("mixamorig:LeftUpLeg", "Z"),
                         "min_deg": -_Z_SPREAD - 2, "max_deg": -_Z_SPREAD + 2}),
    (joint_angle_range, {"joint": ("mixamorig:RightUpLeg", "Z"),
                         "min_deg": +_Z_SPREAD - 2, "max_deg": +_Z_SPREAD + 2}),

    # Knees stay near-straight throughout.
    (joint_angle_range, {"joint": ("mixamorig:LeftLeg", "X"),
                         "min_deg": -3, "max_deg": +3}),
    (joint_angle_range, {"joint": ("mixamorig:RightLeg", "X"),
                         "min_deg": -3, "max_deg": +3}),

    # World-space gates — body stays planted on floor, no drift.
    (hip_no_lateral_drift,    {"max_meters": 0.02}),
    (hip_no_sagittal_drift,   {"max_meters": 0.02}),
    (world_position_drift_max, {"bone": "mixamorig:Hips", "axis": "Z",
                                "max_meters": 0.02}),

    # Feet (ankle bone HEAD) above floor throughout. LOW elevation X=+5
    # gives ankle Z ≈ 0.17 m; threshold of 0.10 m keeps even the heel
    # mesh (which sits ~5 cm below the ankle bone) above floor.
    (foot_world_y_min, {"side": "both", "min_y": 0.10}),
]
