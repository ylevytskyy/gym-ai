"""downward_dog procedural spec — Adho Mukha Svanasana (classic straight-leg variant).

Visual target: inverted-V from a side profile. Hands planted shoulder-width on
the floor at the front; feet hip-width on the floor behind; hips raised to
apex; spine in a long forward-leaning line from hands to hips; legs straight
from hips to feet. Static hold for the demo loop.

Biomechanical research (cited 2026-05-16, 9 sources):
- Hip flexion 85° (apex angle ≈ 95°). [EasyFlexibility]
- Knee 0° (fully extended, no hyperextension). [YogaUOnline]
- Ankle dorsiflexion 20° (heels ~3 cm off floor — chosen "heels-floated" variant
  for the demo; full heels-down requires 45° which most lack). [Yoga Anatomy
  Academy]
- Shoulder flexion 175° (arms fully overhead, in line with extended spine).
  [EasyFlexibility]
- Elbow 175° extension (5° micro-bend; not locked, not collapsed). [YogaUOnline]
- Wrist 80° extension (palms flat under body weight). [enhanced-body.com]
- Spine: long concave curve — neutral lumbar with slight extension, thoracic
  near-neutral, cervical neutral (ears between biceps). NOT rounded. NOT
  hyperextended. [InsideYoga.org]

Variant selected: classic STRAIGHT-leg with HEELS-floated 3 cm off floor.
- Straight legs read more clearly as the canonical inverted-V silhouette.
- Heels slightly up matches the 20° dorsiflexion most adults have. Full
  heels-down (45° dorsiflexion) is an uncommon flexibility ceiling.

Rig geometry (measured 2026-05-16 from xbot_rigged.blend rest pose):
- Arm (shoulder→wrist): 0.562 m
- Torso (hip→shoulder):  0.432 m
- Leg total (upleg→ankle): 0.888 m
- Foot (ankle→toe joint): 0.138 m
- Standing hips world Z: 1.043 m
- Shoulder lateral X offset: ±0.152 m (shoulder half-width)
- Hip joint lateral X offset: ±0.082 m

Pose geometry (derived to fit rig):
- Hips dropped to world Z ≈ 0.79 m (Hips loc_Y = -0.253) — high apex.
- Feet pinned at world Y = +0.45 (back), so vector hip→ankle has length
  ≈ leg_length, satisfying straight-leg constraint.
- Hands pinned at world Y ≈ -0.36 (front), so shoulder ends up roughly
  above the hands with arms near-vertical at full extension.
- Both limb segments form ~55° with the floor → ~90° included apex angle.

IK strategy:
- Hands: chain_count=4 (hand+forearm+arm+shoulder) with rotation lock so
  palms lay flat (Euler 180,0,0) — same approach as cat_cow.
- Feet: chain_count=3 (foot+leg+upleg). Hips MUST stay outside the chain
  so the apex stays at the keyframed height.
"""
from animation_lib.motion import phase
from animation_lib.validators import (
    joint_angle_at,
    hip_no_lateral_drift,
    hand_world_z_range,
)


NAME = "downward_dog"
FPS = 30
CAMERA = "side_left"
LIGHTING = "studio"


IK_PINS = {
    "mixamorig:LeftHand":  ( 0.152, -0.360, 0.0),
    "mixamorig:RightHand": (-0.152, -0.360, 0.0),
    "mixamorig:LeftFoot":  ( 0.082, +0.450, 0.0),
    "mixamorig:RightFoot": (-0.082, +0.450, 0.0),
}

IK_PIN_ROTATIONS = {
    # Palms flat on floor, fingers forward. Same recipe as cat_cow.
    "mixamorig:LeftHand":  (180, 0, 0),
    "mixamorig:RightHand": (180, 0, 0),
    # Feet: no rotation lock — let IK determine the foot angle naturally
    # from the leg direction. The foot bone tail (toe joint) is pinned at
    # Z=0; the ankle will sit slightly above (heel-floated effect).
}

# Per-bone chain counts: hands include shoulder, feet exclude Hips.
IK_CHAIN_COUNTS = {
    "mixamorig:LeftHand":  4,
    "mixamorig:RightHand": 4,
    "mixamorig:LeftFoot":  3,
    "mixamorig:RightFoot": 3,
}


# Inverted-V pose. Hips X+90 tilts the whole body forward (cat-cow-style
# trick) so the SPINE chain points down-forward toward the hands; mild
# Spine bends (20° per segment) add a slight concave curve along the
# torso for the "long line" look without over-flexing.
# Calibrated 2026-05-16: this combination puts wrist Z exactly at 0
# (arms fully extended) and foot target reached straight-leg style.
_POSE = {
    ("mixamorig:Hips", "loc_Y"): -0.253,
    ("mixamorig:Hips", "X"):      90,

    # Slight concave shape across the spine. Total cumulative bend = 60°
    # on top of Hips's +90° → ~150° of global "torso direction" rotation
    # from rest vertical = torso pointing down-forward.
    ("mixamorig:Spine",  "X"): 20,
    ("mixamorig:Spine1", "X"): 20,
    ("mixamorig:Spine2", "X"): 20,

    # Head neutral, ears between biceps (do NOT drop chin to chest).
    # Hips X=+90° has already rotated the head 90° forward; counter-rotate
    # at the neck so the gaze lands somewhere between the hands (forward).
    ("mixamorig:Neck", "X"): -40,
    ("mixamorig:Head", "X"): -30,
}


# Static hold. The IK pins keep the geometry from drifting; the spine/head
# FK keyframes lock the spine shape. Loop is seamless because every frame
# holds the same pose.
PHASES = [
    phase(0.5, _POSE, name="settle"),
    phase(3.0, _POSE, name="hold_0"),
    phase(0.5, _POSE, name="settle_2"),
    phase(3.0, _POSE, name="hold_1"),
]


VALIDATORS = [
    # Hips global forward tilt (the "trick" that puts the torso forward-down).
    (joint_angle_at, {"joint": ("mixamorig:Hips",   "X"), "at_phases": ["hold_*"], "min_deg": 85, "max_deg": 95}),
    # Spine bend stays in the planned range (catches future overshoot/regression).
    (joint_angle_at, {"joint": ("mixamorig:Spine",  "X"), "at_phases": ["hold_*"], "min_deg": 15, "max_deg": 25}),
    (joint_angle_at, {"joint": ("mixamorig:Spine1", "X"), "at_phases": ["hold_*"], "min_deg": 15, "max_deg": 25}),
    (joint_angle_at, {"joint": ("mixamorig:Spine2", "X"), "at_phases": ["hold_*"], "min_deg": 15, "max_deg": 25}),

    # Hips don't drift laterally (Y up to ~0.05 m of slack from interp transients).
    (hip_no_lateral_drift, {"max_meters": 0.05}),

    # Hands pinned at floor — IK should land them within 2 cm of Z=0.
    (hand_world_z_range, {
        "side": "left",
        "at_phases": ["hold_*"],
        "min_z_meters": -0.02, "max_z_meters": 0.02,
    }),
    (hand_world_z_range, {
        "side": "right",
        "at_phases": ["hold_*"],
        "min_z_meters": -0.02, "max_z_meters": 0.02,
    }),
]
