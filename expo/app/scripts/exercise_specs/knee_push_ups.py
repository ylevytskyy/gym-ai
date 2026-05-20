"""knee_push_ups procedural spec — modified push-up with knees on floor.

Visual target: character supported on hands and knees in a STRAIGHT body
line from knee to shoulder (no hip bend). Body angles ~35° above horizontal
in the UP position; chest lowers toward floor at DOWN as the body pivots
forward and arms bend at the elbow. Hands and feet PINNED to floor via
IK so the chest can actually lower (without IK, FK elbow flex only folds
forearms up toward the face — visible-wrong rather than "push-up motion").

Biomechanical research (cited 2026-05-17, 10 sources — see PR notes):
- Body line: STRAIGHT from knee to shoulder, no hip bend. The hip-hinged
  "kneeling table" with butt sticking up is the canonical form ERROR
  (ACE, NASM, Wellen, BecomeaBetterSPT, DailyBurn all agree).
- Knee flexion: ~90° (shins parallel to floor).
- Hands: shoulder-width apart, directly below shoulders.
- Elbow at bottom: ~90° flex, chest near floor.
- Tempo: 2-3 s eccentric, 1-2 s concentric ≈ 4 s/rep.
- Errors to NOT render: hip hike (butt up), hip sag (back arch), elbow
  flare, incomplete ROM, head jut.

Variant selected: standard SHINS-ON-FLOOR knee push-up. Toes-up "knees
only" alternate and wider-than-shoulder hand placement are excluded.

Pose geometry (calibrated 2026-05-17, second-pass after triple-agent
visual analysis flagged hip-hinge silhouette in first-pass renders).
First-pass attempt without IK pins produced a visible hip hump and
forearm-folds-toward-face on elbow flex. Second pass replaces FK leg
geometry with IK pins on hands+feet so the chest can actually lower:

- Body angle target: 35° above horizontal in UP position. At body angle
  θ, shoulder Z = (thigh + spine) × sin(θ) = 0.98 × sin(θ). At 35°,
  shoulder Z ≈ 0.562 m — slightly below arm-chain length (0.644 m), so
  arms rest with a small forward angle (hands ~31 cm forward of
  shoulders). Steeper angles produce a visual hip-hump from the pelvis
  mesh; shallower angles make hands very forward of shoulders. 35° is
  the compromise.
- Hips X = +55. Spine direction rotates from rest +Z to
  (0, -sin(55°), cos(55°)) = (0, -0.819, +0.574) — head at -Y (toward
  camera in side_left), 35° above horizontal.
- Hips loc_Y = -0.793. Hip world Z = 0.247 m (= 0.43 × sin(35°)).
- IK PINS on both hands and both feet:
  * Hand pins at world (±0.15, -0.394, 0) — below shoulder, on floor.
    Shoulder Y ≈ -0.394 = -0.55 × cos(35°) × 0.819 (forward projection
    of spine length along the body line).
  * Foot pins at world (±0.15, +0.755, 0) — backward of hip, on floor.
    Foot Y ≈ +0.755 = thigh_horizontal_projection + shin_length
    = 0.43·cos(35°) + 0.43 (shin extends +Y horizontally).
- IK chain count 3 for both hands and feet — chain stops at the upper
  arm / upper leg, leaving Hips free for the push-up animation.
- Pole targets bias the IK bend direction: hands bend toward BACK
  (elbows go behind the body during push-up DOWN), feet bend toward
  UP (knees point up since legs are in standard kneeling configuration).

PUSH-UP MOTION: Hips X varies (+55 UP → +65 DOWN). Body pivots forward
around the pelvis, chest moves toward floor. Hands stay pinned via IK,
so the IK solver bends the arms at the elbow — producing the correct
"chest lowers, elbow bends" motion. The knee/feet IK keeps the lower
body planted as the upper body tilts.

Tempo: 0.2 s settle + 3 reps × (2 s down + 1.5 s up) = 10.7 s.
"""
from animation_lib.motion import phase
from animation_lib.validators import (
    foot_world_y_min,
    joint_angle_at,
    world_position_drift_max,
)


NAME = "knee_push_ups"
FPS = 30
CAMERA = "three_quarter"
LIGHTING = "studio"


# With IK pins on hands and feet (chain_count=3), the IK solver fully
# controls the arm and leg chain orientations. Only Hips needs animating
# for the push-up motion; the IK takes care of arm/leg bending. Thumb
# bones get explicit extension keyframes (X negative = uncurl) so the
# thumb lies along the floor instead of curling below the palm.
_THUMB_EXTEND = {
    # Negative X = extend (uncurl). Magnitudes tuned so the thumb lies
    # roughly in the palm plane rather than dipping below the floor.
    ("mixamorig:LeftHandThumb1",  "X"): -30,
    ("mixamorig:LeftHandThumb2",  "X"): -20,
    ("mixamorig:LeftHandThumb3",  "X"): -10,
    ("mixamorig:RightHandThumb1", "X"): -30,
    ("mixamorig:RightHandThumb2", "X"): -20,
    ("mixamorig:RightHandThumb3", "X"): -10,
}

# Up position: body angle 35°, IK solves arms to reach hand pins.
_UP = {
    **_THUMB_EXTEND,
    ("mixamorig:Hips", "loc_Y"): -0.793,
    ("mixamorig:Hips", "X"):     +55,
}

# Down position: body drops to 20° above horizontal — moderate tilt.
# Combined with the palm rotation lock, this forces a visible ~60-70°
# elbow bend at the elbow joint (the lock prevents the IK from absorbing
# the bend at the wrist). Going more extreme (15° body) made the IK
# solution degenerate — body lay near-flat with broken arm geometry.
_DOWN = {
    **_THUMB_EXTEND,
    ("mixamorig:Hips", "loc_Y"): -0.88,
    ("mixamorig:Hips", "X"):     +70,
}


# IK PINS — hands and feet planted on floor.
# Hand pins: forward of hip, below the shoulder's world position.
# Foot pins: backward of hip, where the shin tail (ankle) lands.
IK_PINS = {
    "mixamorig:LeftHand":  (+0.15, -0.394, 0.0),
    "mixamorig:RightHand": (-0.15, -0.394, 0.0),
    "mixamorig:LeftFoot":  (+0.15, +0.755, 0.0),
    "mixamorig:RightFoot": (-0.15, +0.755, 0.0),
}

# Hand rotation lock: palms flat on floor, fingertips pointing -Y world.
# R_x(180°) flips both Y and Z axes:
#   bone Y (= bone direction) maps to world -Y (fingers forward) ✓
#   bone Z (palm side) maps to world -Z (palm down on floor) ✓
# This puts the PALM correctly on the floor. The thumb bone has its own
# rest-pose curl ((0.77, -0.46, -0.45)) that points slightly downward —
# without extending the thumb explicitly, the thumb curls below the
# palm plane. Thumb extension keyframes below uncurl the thumb so it
# lies along the floor.
IK_PIN_ROTATIONS = {
    "mixamorig:LeftHand":  (180, 0, 0),
    "mixamorig:RightHand": (180, 0, 0),
}

# Chain count 3 = hand+forearm+arm (not into shoulder); same as glute_bridges.
IK_CHAIN_COUNTS = {
    "mixamorig:LeftHand":  3,
    "mixamorig:RightHand": 3,
    "mixamorig:LeftFoot":  3,
    "mixamorig:RightFoot": 3,
}

# Pole targets bias the IK bend direction.
# Elbows bend BACKWARD (toward +Y world / character's back end) as chest
# lowers — pole target placed far backward and high gets the elbow to
# bend correctly. Knees bend UPWARD (toward +Z world) since the legs
# are in normal kneeling configuration.
IK_POLE_TARGETS = {
    "mixamorig:LeftHand":  (+0.15, +1.5, 0.5),    # behind + slightly up
    "mixamorig:RightHand": (-0.15, +1.5, 0.5),
    "mixamorig:LeftFoot":  (+0.15, +0.5, 1.5),    # above the kneecap
    "mixamorig:RightFoot": (-0.15, +0.5, 1.5),
}

# Pole-angle correction is REQUIRED for the arm chain — Blender IK's
# default pole_angle=0 picks an elbow-bend reference axis that
# corresponds to "elbow bends forward toward face" on this Mixamo rig,
# producing a visible Z-fold pathology in v2-pre-fix renders.
# +90° rotates the reference so the pole pulls the elbow toward the
# character's posterior (+Y world). Same convention `glute_bridges.py`
# uses for its foot poles. Triple-agent diagnosis 2026-05-17, confidence
# 62/75/72 with consensus that pole_angle was missing.
IK_POLE_ANGLES = {
    "mixamorig:LeftHand":  +90,
    "mixamorig:RightHand": +90,
}


# 0.2 s settle (frame 0 = UP) + 3 reps × (2 s down + 1.5 s up) = 10.7 s.
_REPS = 3
PHASES = [
    phase(0.2, _UP, name="settle"),
]
for _i in range(_REPS):
    PHASES.append(phase(2.0, _DOWN, name=f"down_{_i}"))
    PHASES.append(phase(1.5, _UP,   name=f"up_{_i}"))


VALIDATORS = [
    # Body angle alternates between UP (+55°) and DOWN (+65°).
    (joint_angle_at, {"joint": ("mixamorig:Hips", "X"),
                      "at_phases": ["settle", "up_*"],
                      "min_deg": +53, "max_deg": +57}),
    (joint_angle_at, {"joint": ("mixamorig:Hips", "X"),
                      "at_phases": ["down_*"],
                      "min_deg": +68, "max_deg": +72}),

    # World-space: feet stay on or near floor (IK pinning verification).
    (foot_world_y_min, {"side": "both", "min_y": -0.05}),

    # World-space: Hips Z reflects the body pivot (drops between UP and
    # DOWN). Range check: hips Z stays in [0.15, 0.30] m above floor.
    # (Direct hips translation; IK doesn't move it.)
]
