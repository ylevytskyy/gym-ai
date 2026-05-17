"""scissor_kicks procedural spec — supine alternating lateral crisscross.

Visual target: character lies supine with both legs lifted to ~45° hip
flexion (a held elevation, not alternating like flutter_kicks). Legs
abduct laterally to a "V" (~shoulder-width apart), then adduct past
midline so the ankles cross — alternating which leg is "over" each rep.
Heels never drop to the floor. Three-quarter elevated camera shows the
lateral motion clearly while preserving the supine body silhouette.

Biomechanical research (cited 2026-05-17, 10 sources — see PR notes):
- Variant: HORIZONTAL CRISSCROSS (lateral scissor). 7+ sources
  (Healthline, Set for Set, Fitbod, Endomondo, Sole Treadmills, Steel
  Supplements, ShapeFit) explicitly assign the lateral cross-motion to
  "scissor kicks" and the vertical up-down to "flutter kicks". Rendering
  the vertical variant would duplicate flutter_kicks.mp4.
- Posture: lumbar in slight posterior tilt with full back contact, head
  and shoulders on floor, hands by sides palms-down (the hands-under-
  glutes variant is also canonical but visually identical from a 3/4
  camera angle). [Healthline, Fitbod, Steel Supplements]
- Both legs lifted to ~45° hip flexion throughout. Beginners may work
  at 60-70° (shorter moment arm, easier on lumbar); advanced at 15-30°.
  We render the canonical 45° working angle. [Endomondo, ShapeFit,
  Fitbod, Steel Supplements]
- Lateral spread at "open" position: legs ~shoulder-width apart
  (Fitbod). Inferred ~20-30° hip abduction per leg.
- Crossover at "closed" position: ankle-over-ankle, ~6-12 in (15-30 cm)
  past midline. Alternates each rep.
- Knees fully extended. Ankles plantarflexed. [All sources]
- Cadence: no peer-reviewed measurement found; coaching consensus is
  controlled, ~2-3 s per full cycle (open→cross→open→cross). We use
  2.4 s/cycle. [Derived from Healthline, Fitbod rep counts]
- Common errors to NOT render: lumbar lifting off floor, bent knees,
  speed over control, heels dropping to floor, neck/head craning.

Variant selected: standard SUPINE FLAT-BACK fitness-app crisscross.
Vertical-alternating ("Fitness Volt" minority usage), Pilates/dance
scissors with hand assistance, and sidestroke "scissor kick" are
explicitly excluded.

Pose geometry derived from xbot_rig_axes.md plus working-pose analysis
for the leg-after-supine-flip:
- Supine flip: Hips X=-90° + loc_Y=-0.95 m (reused from dead_bug /
  glute_bridges / flutter_kicks). Body on floor, hip joint at world
  Z ≈ 0.09 m, feet end at world -Y.
- Hip flexion uses LeftUpLeg/RightUpLeg local X (calibrated: X=+90 → 90°
  flex / thigh perpendicular to body = world +Z in supine). At X=+45,
  thigh direction = (0, -0.707, +0.707) — half toward feet end, half up.
  Heel at world Z ≈ 0.09 + 0.86×0.707 = 0.70 m above floor.
- After applying X=+45 (Euler XYZ order, intrinsic), the bone's NEW
  local Z rotates from world +Z to world (0, +0.707, +0.707). This is
  perpendicular to the new bone direction, making it a SWING axis (the
  abduction axis). Local Y stays parallel to bone direction (twist;
  unusable for abduction). Local X is unchanged (= world -X) and still
  drives the flex/extend.
- Abduction: LeftUpLeg Z=+α swings the (already-elevated) leg toward
  world +X (character's left). RightUpLeg Z=+α ALSO swings toward
  world +X (the two leg bones share local axes per the ledger), so to
  abduct the right leg LATERALLY (toward world -X / character's right)
  we use RightUpLeg Z=-α. Crossing past midline reverses these signs.
- Z=+15 puts the LeftUpLeg ankle at world X ≈ +0.082 (hip joint X) +
  0.86·sin(15°) ≈ +0.082 + 0.223 = +0.30 m. Mirror for right gives
  -0.30 m. Total ankle separation = 60 cm — slightly wider than
  shoulder-width (~40 cm) for visual readability at thumbnail sizes.
- Z=∓10 at cross puts ankles at ±(0.082 - 0.149) = ∓0.067 m — both
  ankles ~7 cm past midline on opposite sides. Clear visual cross.
- "Over" differentiation: at each cross, the elevated leg's hip flex is
  +47 (slightly higher), the under leg's hip flex is +43. The 4° hip-
  flex differential moves the elevated heel ~6 cm further up than the
  under heel — subtle but enough to read which leg is "on top" from a
  3/4 camera. Heels never drop (both legs stay at ≥43° flex, well
  above any floor-contact threshold).

Camera: front_top_left. Three-quarter elevated view captures the
lateral leg motion (which side_left would compress along the camera
axis) while keeping the supine body silhouette visible.

Phase structure: 0.2 s settle (OPEN V) then 4 full crisscross cycles
at 2.4 s/cycle (4 phases × 0.6 s each: cross_R_over → open → cross_L_
over → open). Total: 0.2 + 4×2.4 = 9.8 s. Final phase = OPEN matches
frame 0 (settle = OPEN) for a seamless loop.
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
CAMERA = "front_top_left"  # 3/4 elevated — lateral cross-motion + body silhouette
LIGHTING = "studio"


# Supine setup — same as dead_bug / glute_bridges / flutter_kicks.
_SUPINE = {
    ("mixamorig:Hips", "loc_Y"): -0.95,
    ("mixamorig:Hips", "X"):     -90,
}

# Hip-flexion levels — both legs held high throughout. ±2° around the
# canonical 45° working angle differentiates which leg is "on top" at
# each cross without dropping either heel.
_HIP_HIGH = +47    # the "over" leg at each cross
_HIP_BASE = +45    # the open-V both-equal elevation
_HIP_LOW  = +43    # the "under" leg at each cross

# Lateral abduction angles.
_Z_OPEN  = 15    # open V: ~60 cm ankle separation
_Z_CROSS = 10    # crossed: ankles ~7 cm past midline on opposite sides

_KNEE_STRAIGHT = 0


# Both legs spread to an open V at the canonical 45° elevation.
# Z sign convention (empirically verified by render iteration on
# 2026-05-17): with X=+45 already applied, LeftUpLeg Z=NEGATIVE swings
# the left leg toward character-LEFT (world +X) = lateral abduction.
# Positive Z swings the leg toward character-RIGHT = adduction/cross
# past midline. RightUpLeg axes are identical (per the ledger: both leg
# bones share local-X = world -X), so for the right leg to abduct
# laterally toward character-RIGHT (world -X), use Z=POSITIVE. This
# inverted-from-naive convention bit the first author of this spec; the
# theoretical analysis predicted the opposite signs from what renders
# show. Don't try to re-derive it — the working values below are the
# verified ground truth.
_OPEN_V = {
    **_SUPINE,
    ("mixamorig:LeftUpLeg",  "X"): _HIP_BASE,
    ("mixamorig:RightUpLeg", "X"): _HIP_BASE,
    ("mixamorig:LeftUpLeg",  "Z"): -_Z_OPEN,    # negative = left leg abducts to char-LEFT
    ("mixamorig:RightUpLeg", "Z"): +_Z_OPEN,    # positive = right leg abducts to char-RIGHT
    ("mixamorig:LeftLeg",    "X"): _KNEE_STRAIGHT,
    ("mixamorig:RightLeg",   "X"): _KNEE_STRAIGHT,
}

# Right leg crossed OVER left. R is elevated slightly; both ankles past
# midline on opposite sides (L ankle → char-right, R ankle → char-left).
_CROSS_R_OVER = {
    **_SUPINE,
    ("mixamorig:LeftUpLeg",  "X"): _HIP_LOW,    # left = under
    ("mixamorig:RightUpLeg", "X"): _HIP_HIGH,   # right = over
    ("mixamorig:LeftUpLeg",  "Z"): +_Z_CROSS,   # positive = left ankle crosses to char-RIGHT
    ("mixamorig:RightUpLeg", "Z"): -_Z_CROSS,   # negative = right ankle crosses to char-LEFT
    ("mixamorig:LeftLeg",    "X"): _KNEE_STRAIGHT,
    ("mixamorig:RightLeg",   "X"): _KNEE_STRAIGHT,
}

# Left leg crossed OVER right. Same lateral positions; only the X-flex
# differential (which leg is higher) swaps.
_CROSS_L_OVER = {
    **_SUPINE,
    ("mixamorig:LeftUpLeg",  "X"): _HIP_HIGH,   # left = over
    ("mixamorig:RightUpLeg", "X"): _HIP_LOW,    # right = under
    ("mixamorig:LeftUpLeg",  "Z"): +_Z_CROSS,
    ("mixamorig:RightUpLeg", "Z"): -_Z_CROSS,
    ("mixamorig:LeftLeg",    "X"): _KNEE_STRAIGHT,
    ("mixamorig:RightLeg",   "X"): _KNEE_STRAIGHT,
}


# Hands by sides — same IK pin pattern as glute_bridges / flutter_kicks.
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


# 0.2 s settle (frame 0 holds _OPEN_V) + 4 full scissor cycles at
# 2.4 s/cycle (0.6 s per phase × 4 phases). Final = OPEN matches frame 0.
_CYCLES = 4
PHASES = [
    phase(0.2, _OPEN_V, name="settle"),
]
for _i in range(_CYCLES):
    PHASES.append(phase(0.6, _CROSS_R_OVER, name=f"cross_R_{_i}"))
    PHASES.append(phase(0.6, _OPEN_V,       name=f"open_{_i}_a"))
    PHASES.append(phase(0.6, _CROSS_L_OVER, name=f"cross_L_{_i}"))
    PHASES.append(phase(0.6, _OPEN_V,       name=f"open_{_i}_b"))


VALIDATORS = [
    # Supine baseline holds throughout — Hips X stays near -90°.
    (joint_angle_at, {"joint": ("mixamorig:Hips", "X"),
                      "at_phases": ["settle", "open_*", "cross_*"],
                      "min_deg": -93, "max_deg": -87}),

    # Hip flexion stays in the elevated working range across the whole
    # animation (no heel drop). The four discrete pose values are 43,
    # 45, 47; range gate [40, 50] covers all three + tolerance for
    # Bezier overshoot during transitions.
    (joint_angle_range, {"joint": ("mixamorig:LeftUpLeg", "X"),
                         "min_deg": 40, "max_deg": 50}),
    (joint_angle_range, {"joint": ("mixamorig:RightUpLeg", "X"),
                         "min_deg": 40, "max_deg": 50}),

    # Open V — both legs at base elevation, spread laterally.
    (joint_angle_at, {"joint": ("mixamorig:LeftUpLeg", "X"),
                      "at_phases": ["settle", "open_*"],
                      "min_deg": _HIP_BASE - 2, "max_deg": _HIP_BASE + 2}),
    (joint_angle_at, {"joint": ("mixamorig:RightUpLeg", "X"),
                      "at_phases": ["settle", "open_*"],
                      "min_deg": _HIP_BASE - 2, "max_deg": _HIP_BASE + 2}),
    (joint_angle_at, {"joint": ("mixamorig:LeftUpLeg", "Z"),
                      "at_phases": ["settle", "open_*"],
                      "min_deg": -_Z_OPEN - 2, "max_deg": -_Z_OPEN + 2}),
    (joint_angle_at, {"joint": ("mixamorig:RightUpLeg", "Z"),
                      "at_phases": ["settle", "open_*"],
                      "min_deg": +_Z_OPEN - 2, "max_deg": +_Z_OPEN + 2}),

    # Cross R over — right leg elevated higher, both crossed past midline.
    (joint_angle_at, {"joint": ("mixamorig:LeftUpLeg", "X"),
                      "at_phases": ["cross_R_*"],
                      "min_deg": _HIP_LOW - 2, "max_deg": _HIP_LOW + 2}),
    (joint_angle_at, {"joint": ("mixamorig:RightUpLeg", "X"),
                      "at_phases": ["cross_R_*"],
                      "min_deg": _HIP_HIGH - 2, "max_deg": _HIP_HIGH + 2}),
    (joint_angle_at, {"joint": ("mixamorig:LeftUpLeg", "Z"),
                      "at_phases": ["cross_R_*"],
                      "min_deg": +_Z_CROSS - 2, "max_deg": +_Z_CROSS + 2}),
    (joint_angle_at, {"joint": ("mixamorig:RightUpLeg", "Z"),
                      "at_phases": ["cross_R_*"],
                      "min_deg": -_Z_CROSS - 2, "max_deg": -_Z_CROSS + 2}),

    # Cross L over — mirror elevation; lateral positions identical.
    (joint_angle_at, {"joint": ("mixamorig:LeftUpLeg", "X"),
                      "at_phases": ["cross_L_*"],
                      "min_deg": _HIP_HIGH - 2, "max_deg": _HIP_HIGH + 2}),
    (joint_angle_at, {"joint": ("mixamorig:RightUpLeg", "X"),
                      "at_phases": ["cross_L_*"],
                      "min_deg": _HIP_LOW - 2, "max_deg": _HIP_LOW + 2}),

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

    # Feet (ankle bone HEAD) well above floor throughout. At base
    # elevation X=+45, ankle Z ≈ 0.70 m; threshold of 0.40 m gives
    # plenty of headroom while catching any catastrophic floor drop.
    (foot_world_y_min, {"side": "both", "min_y": 0.40}),
]
