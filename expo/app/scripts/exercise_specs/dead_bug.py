"""dead_bug procedural spec — supine core anti-extension exercise.

Visual target: character lies supine (on back) with limbs in tabletop start
position (hips 90° flex, knees 90° flex, arms vertical perpendicular to
floor). Performs alternating diagonal extensions — right arm + left leg
extend toward floor and overhead respectively, return to tabletop, then
left arm + right leg do the same. Side-profile camera (the diagonal-
extension motion reads most clearly from the side).

Biomechanical research (cited 2026-05-16, 11 sources — see PR notes):
- Tabletop start: hip 90° flexion both sides, knee 90° flexion both sides,
  shoulder 90° flexion (arms vertical), elbow 0° (straight), ankle ~10°
  dorsiflexion, lumbar pressed gently to floor, head neutral on floor.
  [ACE, Harvard, Hinge Health, Yorkville PT, Onnit]
- Peak extension (one diagonal): extending leg drops to hip ~10° flexion
  (hovering 5-10 cm above floor), knee straightens to 0°. Extending arm
  reaches shoulder ~170-180° flexion (overhead toward floor behind head),
  elbow stays 0°. Stationary opposite limbs hold tabletop.
  [Harvard, Healthline, BodySpec, Hinge Health, Endomondo]
- Lumbar contact with floor must be maintained throughout (the entire
  point of the exercise; the most common form error is lumbar lifting).
  [Nick-E / Barbell Medicine, ACE]
- Tempo: 3 s eccentric (lower) / 1 s peak hold / 3 s concentric (return)
  per side; body returns to full tabletop between sides (does NOT sweep
  continuously between diagonals). [NSCA, ACE, runlovers.it]
- Right arm + left leg goes first by teaching convention; biomechanically
  symmetric, choice arbitrary.

Variant selected: standard alternating-diagonal hover dead-bug — limbs
hover ~5-10 cm above floor at peak (no floor contact). The toe-tap variant
(foot touches floor) and stability-ball variants are excluded.

Pose geometry derived from xbot_rig_axes.md and propagation analysis:
- Supine flip: Hips X=-90° rotates the standing-rest body backward around
  the world +X (lateral) axis. Chest direction (-Y at rest, "forward")
  rotates to +Z (up). Back on floor. Head at world +Y (away from camera),
  feet at -Y (toward camera, side-left view).
- Hips loc_Y=-0.95 m drops the pelvis from standing rest Z=1.043 m to
  Z≈0.09 m, putting the back surface (~7-8 cm thick below the pelvic
  center) on the floor.
- Leg axes (LeftUpLeg / RightUpLeg local X = world -X) are invariant to
  the Hips X-rotation (rotation axis is parallel). So the ledger's
  standing-pose convention still holds:
    * LeftUpLeg/RightUpLeg X=+90 → hip flexion 90° (thigh perpendicular
      to body = vertical up world +Z after the supine flip).
    * LeftLeg/RightLeg X=-90 → knee flexion 90° (shin perpendicular to
      thigh = horizontal along world -Y after the supine flip, pointing
      toward the foot-end of the body).
- Arm axes — verified by introspection after a first-pass failure:
    * For arm bones, local Y is parallel to the bone (twist axis); local
      X and local Z are the sweep axes.
    * LeftArm Z=+90° / RightArm Z=-90° brings the arms from T-pose
      lateral orientation to vertical-up (perpendicular to supine body).
      Verified by introspection: tabletop hand world position (±0.152,
      +0.395, +0.584) — arms truly perpendicular to the floor.
    * LeftArm X=-90° / RightArm X=-90° (with Y=0, Z=0) puts the bone
      in the "overhead" position (bone direction = world +Y, parallel
      to floor behind the head). Initial-attempt bug: I used Y=±90
      instead of X=-90, but Y is the bone-length axis (twist), so the
      bone just span in place and stayed at world -X (lateral). The
      working axis is local X.
- Elbow stays at 0° throughout (no forearm rotation).
- Head/neck stay at rest orientation; after Hips X=-90 propagation, head
  faces +Z (gaze up toward ceiling) which matches supine neutral.

Interpolation note: arm transition from up-position (Z=+90) to overhead
(Y=-90, Z=0) traverses both Euler axes in XYZ order, so the arm sweeps
through some intermediate non-planar arc rather than a clean great-
circle from +Z to +Y. Acceptable for a 3 s sweep at this scale; the
audience reads the motion as "arm reaches overhead behind head" because
the start and end poses are correct.
"""
from animation_lib.motion import phase
from animation_lib.validators import (
    joint_angle_at,
    hip_no_lateral_drift,
    hip_no_sagittal_drift,
    world_position_drift_max,
)


NAME = "dead_bug"
FPS = 30
CAMERA = "side_left"  # diagonal-extension motion reads most clearly from the side
LIGHTING = "studio"


# Supine setup — applied to every phase. Hips X=-90 flips the body so
# back faces floor; loc_Y=-0.95 drops the pelvis to floor level.
_SUPINE = {
    ("mixamorig:Hips", "loc_Y"): -0.95,
    ("mixamorig:Hips", "X"):     -90,
}

# Tabletop limbs — hip 90/90, knee 90/90, arms vertical perpendicular
# to body. The starting pose and the "stationary" pose for non-extending
# limbs at every peak.
_TABLETOP_LIMBS = {
    # Legs: thighs vertical (hip flex 90°), shins horizontal toward
    # feet-end of body (knee flex 90°).
    ("mixamorig:LeftUpLeg",  "X"): +90,
    ("mixamorig:RightUpLeg", "X"): +90,
    ("mixamorig:LeftLeg",    "X"): -90,
    ("mixamorig:RightLeg",   "X"): -90,
    # Arms: vertical up (perpendicular to supine body). Explicit X=0 so
    # the reset phases clear any extension-pose X rotation from the
    # previous side.
    ("mixamorig:LeftArm",  "X"):   0,
    ("mixamorig:LeftArm",  "Z"): +90,
    ("mixamorig:RightArm", "X"):   0,
    ("mixamorig:RightArm", "Z"): -90,
}

_TABLETOP = {**_SUPINE, **_TABLETOP_LIMBS}


# Peak A: right arm + left leg extended. Left arm and right leg hold
# tabletop pose.
_PEAK_A = {
    **_SUPINE,
    # Stationary limbs: left arm up, right leg tabletop.
    ("mixamorig:LeftArm",    "X"):   0,
    ("mixamorig:LeftArm",    "Z"): +90,
    ("mixamorig:RightUpLeg", "X"): +90,
    ("mixamorig:RightLeg",   "X"): -90,

    # Extending left leg: hip ~10° flexion (leg hovering above floor),
    # knee straight.
    ("mixamorig:LeftUpLeg", "X"): +10,
    ("mixamorig:LeftLeg",   "X"):   0,

    # Extending right arm: overhead behind head (world +Y direction).
    # RightArm X=-90° around local X (= world -Y) takes the bone from
    # rest -X to +Z; Hips X=-90 propagation then takes +Z → +Y. Must
    # also zero Z (override the tabletop's Z=-90).
    ("mixamorig:RightArm", "X"): -90,
    ("mixamorig:RightArm", "Z"):   0,
}


# Peak B: left arm + right leg extended. Mirror of Peak A.
_PEAK_B = {
    **_SUPINE,
    # Stationary limbs: right arm up, left leg tabletop.
    ("mixamorig:RightArm",  "X"):   0,
    ("mixamorig:RightArm",  "Z"): -90,
    ("mixamorig:LeftUpLeg", "X"): +90,
    ("mixamorig:LeftLeg",   "X"): -90,

    # Extending right leg: hip ~10° flexion, knee straight.
    ("mixamorig:RightUpLeg", "X"): +10,
    ("mixamorig:RightLeg",   "X"):   0,

    # Extending left arm: overhead behind head. LeftArm X=-90° around
    # local X (= world +Y) takes the bone from rest +X to +Z; Hips
    # propagation then to +Y.
    ("mixamorig:LeftArm", "X"): -90,
    ("mixamorig:LeftArm", "Z"):   0,
}


# Tempo: 3 s eccentric, 1 s peak hold, 3 s concentric, 0.5 s tabletop
# reset between sides. Plus 0.2 s opening settle so frame 0 = tabletop.
# Total: 0.2 + (3 + 1 + 3 + 0.5) + (3 + 1 + 3 + 0.5) = 15.2 s.
PHASES = [
    phase(0.2, _TABLETOP, name="settle"),
    # Side A: right arm + left leg
    phase(3.0, _PEAK_A,   name="down_A"),
    phase(1.0, _PEAK_A,   name="hold_A"),
    phase(3.0, _TABLETOP, name="up_A"),
    phase(0.5, _TABLETOP, name="reset_A"),
    # Side B: left arm + right leg
    phase(3.0, _PEAK_B,   name="down_B"),
    phase(1.0, _PEAK_B,   name="hold_B"),
    phase(3.0, _TABLETOP, name="up_B"),
    phase(0.5, _TABLETOP, name="reset_B"),
]


VALIDATORS = [
    # Supine setup — Hips X stays near -90° throughout the cycle.
    (joint_angle_at, {"joint": ("mixamorig:Hips", "X"), "at_phases": ["settle", "hold_*", "reset_*"], "min_deg": -93, "max_deg": -87}),

    # Tabletop limb angles at start/reset phases.
    (joint_angle_at, {"joint": ("mixamorig:LeftUpLeg",  "X"), "at_phases": ["settle", "reset_*"], "min_deg":  87, "max_deg":  93}),
    (joint_angle_at, {"joint": ("mixamorig:RightUpLeg", "X"), "at_phases": ["settle", "reset_*"], "min_deg":  87, "max_deg":  93}),
    (joint_angle_at, {"joint": ("mixamorig:LeftLeg",    "X"), "at_phases": ["settle", "reset_*"], "min_deg": -93, "max_deg": -87}),
    (joint_angle_at, {"joint": ("mixamorig:RightLeg",   "X"), "at_phases": ["settle", "reset_*"], "min_deg": -93, "max_deg": -87}),
    (joint_angle_at, {"joint": ("mixamorig:LeftArm",    "Z"), "at_phases": ["settle", "reset_*"], "min_deg":  87, "max_deg":  93}),
    (joint_angle_at, {"joint": ("mixamorig:RightArm",   "Z"), "at_phases": ["settle", "reset_*"], "min_deg": -93, "max_deg": -87}),

    # Peak A extension angles — extending limbs reach near-zero flexion.
    (joint_angle_at, {"joint": ("mixamorig:LeftUpLeg", "X"), "at_phases": ["hold_A"], "min_deg":   7, "max_deg":  13}),
    (joint_angle_at, {"joint": ("mixamorig:LeftLeg",   "X"), "at_phases": ["hold_A"], "min_deg":  -3, "max_deg":   3}),
    (joint_angle_at, {"joint": ("mixamorig:RightArm",  "X"), "at_phases": ["hold_A"], "min_deg": -93, "max_deg": -87}),
    # Peak A stationary — opposite limbs still in tabletop.
    (joint_angle_at, {"joint": ("mixamorig:RightUpLeg", "X"), "at_phases": ["hold_A"], "min_deg":  87, "max_deg":  93}),
    (joint_angle_at, {"joint": ("mixamorig:LeftArm",    "Z"), "at_phases": ["hold_A"], "min_deg":  87, "max_deg":  93}),

    # Peak B extension angles — mirror of Peak A.
    (joint_angle_at, {"joint": ("mixamorig:RightUpLeg", "X"), "at_phases": ["hold_B"], "min_deg":   7, "max_deg":  13}),
    (joint_angle_at, {"joint": ("mixamorig:RightLeg",   "X"), "at_phases": ["hold_B"], "min_deg":  -3, "max_deg":   3}),
    (joint_angle_at, {"joint": ("mixamorig:LeftArm",    "X"), "at_phases": ["hold_B"], "min_deg": -93, "max_deg": -87}),
    # Peak B stationary.
    (joint_angle_at, {"joint": ("mixamorig:LeftUpLeg", "X"), "at_phases": ["hold_B"], "min_deg":  87, "max_deg":  93}),
    (joint_angle_at, {"joint": ("mixamorig:RightArm",  "Z"), "at_phases": ["hold_B"], "min_deg": -93, "max_deg": -87}),

    # World-space gates: body stays planted on floor (no lateral or
    # sagittal Hips drift, no vertical hip drift either).
    (hip_no_lateral_drift,    {"max_meters": 0.02}),
    (hip_no_sagittal_drift,   {"max_meters": 0.02}),
    (world_position_drift_max, {"bone": "mixamorig:Hips", "axis": "Z", "max_meters": 0.02}),
]
