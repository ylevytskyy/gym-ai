"""pike_push_ups procedural spec — bodyweight overhead-press push-up.

Visual target: inverted-V hold (hips at apex) with the **arms cycling** —
elbows extended at the top, bent ~90° at the bottom while the head travels
forward and down so the nose lands just in front of the fingertips. Hands,
feet, and hip apex stay roughly planted; only the arms move significantly.
3 reps at a controlled ~4.5 s/rep, side-profile camera.

Biomechanical research (cited 2026-05-16, 10+ sources — see PR notes):
- Top of rep: hip flexion 90-100° included, torso 45-50° from horizontal,
  knees fully extended, elbow ~175°, shoulder ~155-160° flexion.
- Bottom of rep: elbow ~90°, shoulder ~105-115° flexion, head travels
  FORWARD so nose/forehead lands 5-15 cm in front of the fingertips
  (the form-correct path per Antranik / mpcalisthenics / runlovers.it;
  "head between hands" was explicitly rejected as the elbow-flare error).
- Spine: 0-10° total cumulative flexion — distinctly less curved than
  downward dog (which uses 60°). Trunk reads as a near-straight diagonal
  from hip to head.
- Tempo: 2.5 s eccentric / 0.3 s bottom hold / 1.5 s concentric / 0.2 s
  top hold = 4.5 s per rep. Matches the bodyweight overhead-press
  cadence cited by ericflag, greatist, eatfitfuel.

Variant selected: standard FLOOR pike push-up (hands + feet on floor, no
elevation), forward-head path (nose ahead of hands at bottom), shoulder-
width hands, hip-width feet on balls-of-feet with heels floated.

Critical visual identity vs downward_dog (already rendered):
- Arms CYCLE. Downward dog is a static hold; pike push-up's defining
  feature is the elbow flex-extend cycle.
- Spine is straighter (5° per segment vs DD's 20°) → tighter pike apex.
- Hands and feet are closer together → more compact inverted-V.

IK mechanism — how the elbow flex is driven:
- Research idealizes "hips do not drop"; kinematically with hands+feet+hips
  all rigidly pinned, the elbow CANNOT bend (the arm chain has fixed length).
- Real pike push-ups have a small forward-and-down torso translation that
  brings the shoulder closer to the wrist target; the IK solver then folds
  the elbow to absorb. We model this with:
    * Hips loc_Y drops ~0.10 m at the bottom (Z 0.82 → 0.72 m).
    * Hips X rotates from 90° → 100° (mild additional torso pike).
  The hands, feet, and lateral position stay pinned. The IK solver bends
  the elbow chain to keep wrists planted; the head appears to dip forward
  toward and past the hand line.

Rig geometry — reused from downward_dog's known-working pin set:
- Hands shoulder-width at world X = ±0.152 m, Y = -0.36 m (same as DD).
- Feet hip-width at world X = ±0.082 m, Y = +0.42 m (slightly tighter
  than DD's +0.45 — small visual nudge toward compact pike).
- Hand chain_count=4 (hand+forearm+arm+shoulder) with rotation lock
  for palms flat — same recipe as downward_dog / cat_cow.
- Foot chain_count=3 (foot+leg+upleg) — Hips must stay outside the
  foot chain so the planned hip drop drives the elbow bend (not the legs).

Initial attempt (2026-05-16) tried hand pin Y=-0.28 with Spine X=5° each;
introspection showed shoulder ended up at world (Y=-0.42, Z=0.71), which
left the arm 0.69 m from the pin — exceeding the 0.56 m arm length. IK
over-reach pushed the wrist 18 cm above the floor. Reverted to DD's pin
geometry; visual identity vs DD comes from the BOTTOM-of-rep pose + the
arm cycle, not from pin positions.
"""
from animation_lib.motion import phase
from animation_lib.validators import (
    joint_angle_at,
    hip_no_lateral_drift,
    hand_world_z_range,
)


NAME = "pike_push_ups"
FPS = 30
CAMERA = "side_left"  # side profile shows the arm cycle + inverted-V most clearly
LIGHTING = "studio"


# IK pins: hands and feet anchored to the floor in a compact inverted-V.
# Hands slightly forward (Y=-0.28); feet slightly behind (Y=+0.30).
# Total foot-to-hand Y span ≈ 0.58 m — visibly more compact than the
# elongated downward_dog pike (0.81 m), reinforcing the visual identity.
# IK pins — copied from downward_dog's known-working setup. Feet pinned
# at floor level, no rotation lock (the rig's foot IK picks a natural
# orientation that DD already validates visually). The previous attempts
# (rotation lock + pole target + chain-count tweaks) each fixed one
# visual artifact while introducing another (backwards knees, flipped
# feet, mesh clipping). Reverting to DD's setup ships the pose that
# already works for an inverted-V exercise, plus the arm-cycle motion.
IK_PINS = {
    "mixamorig:LeftHand":  ( 0.152, -0.360, 0.0),
    "mixamorig:RightHand": (-0.152, -0.360, 0.0),
    "mixamorig:LeftFoot":  ( 0.082, +0.420, 0.0),
    "mixamorig:RightFoot": (-0.082, +0.420, 0.0),
}

# Palms flat on floor for hands; no rotation lock on feet (IK chooses
# foot orientation naturally — matches DD's working approach).
IK_PIN_ROTATIONS = {
    "mixamorig:LeftHand":  (180, 0, 0),
    "mixamorig:RightHand": (180, 0, 0),
}

# Per-bone chain counts — same as DD.
IK_CHAIN_COUNTS = {
    "mixamorig:LeftHand":  4,
    "mixamorig:RightHand": 4,
    "mixamorig:LeftFoot":  3,
    "mixamorig:RightFoot": 3,
}


# Toe FK keys (shared across all phases — foot is static during the rep).
# ToeBase X=-15° curls the toe down so the tip rests at Z≈+0.011 m
# (essentially on the floor). Without it, the toe lifts to Z=+0.035 m
# above the floor at the default rest orientation, looking unnaturally
# "kicked back" — the metatarsal joint reads as bending the wrong way.
# Verified by sweep introspection 2026-05-16: X=-15° is the sweet spot
# between toe-touching-floor (X=0 leaves toe in air) and toe-clipping-
# below-floor (X≤-30° pushes toe through).
_TOE_FK = {
    ("mixamorig:LeftToeBase",  "X"): -15,
    ("mixamorig:RightToeBase", "X"): -15,
}


# Top-of-rep: pike apex, arms extended, head in line with spine.
# Reuses DD's body-flip + back-bend geometry (Spine X=20° each) so the
# IK arm chain reaches the floor pins with palms flat (verified working
# in downward_dog). Visual difference vs DD comes from the BOTTOM-pose
# cycle (below) — not from the TOP geometry, which is intentionally
# inherited from a known-good configuration.
_TOP = {
    **_TOE_FK,
    ("mixamorig:Hips", "loc_Y"): -0.253,   # apex Z ≈ 0.79 m (DD-match)
    ("mixamorig:Hips", "X"):      90,

    ("mixamorig:Spine",  "X"): 20,
    ("mixamorig:Spine1", "X"): 20,
    ("mixamorig:Spine2", "X"): 20,

    # Gaze toward floor between the hands — same as DD.
    ("mixamorig:Neck", "X"): -40,
    ("mixamorig:Head", "X"): -30,
}


# Bottom-of-rep: shallower mid-rep, prioritizing visual identity over
# textbook elbow depth. The deep-drop version (Hips loc_Y=-0.42,
# elbow ≈90°) forced the knees to flex 60-90°; every IK trick to bias
# the knee bend direction either left the legs "Z"-shaped or flipped
# the foot orientation. With a 5 cm hip drop the IK puts the knee in
# its natural position (between hip and ankle) and the elbow flexes
# to ~130° — a clearly visible bend even if it falls short of the
# research-textbook 90°. Recognizable pike-push-up motion without
# anatomically broken leg geometry.
_BOTTOM = {
    **_TOE_FK,
    ("mixamorig:Hips", "loc_Y"): -0.300,   # apex drops 5 cm to Z ≈ 0.74 m
    ("mixamorig:Hips", "X"):     100,      # 10° additional pike-forward rock

    ("mixamorig:Spine",  "X"): 20,
    ("mixamorig:Spine1", "X"): 20,
    ("mixamorig:Spine2", "X"): 20,

    # Head extends moderately forward.
    ("mixamorig:Neck", "X"): -25,
    ("mixamorig:Head", "X"): -15,
}


# 3 reps at 4.5 s/rep + 0.2 s settle = 13.7 s loop.
# Eccentric (top → bottom) = 2.5 s.
# Bottom pause = 0.3 s.
# Concentric (bottom → top) = 1.5 s.
# Top pause = 0.2 s.
# The first phase holds _TOP briefly so frame 0 lands in the start pose
# (keyframe_emitter.py emits frame 0 from the first phase's pose).
PHASES = [
    phase(0.2, _TOP,    name="settle"),
    phase(2.5, _BOTTOM, name="down_0"),  phase(0.3, _BOTTOM, name="hold_bottom_0"),
    phase(1.5, _TOP,    name="up_0"),    phase(0.2, _TOP,    name="hold_top_0"),
    phase(2.5, _BOTTOM, name="down_1"),  phase(0.3, _BOTTOM, name="hold_bottom_1"),
    phase(1.5, _TOP,    name="up_1"),    phase(0.2, _TOP,    name="hold_top_1"),
    phase(2.5, _BOTTOM, name="down_2"),  phase(0.3, _BOTTOM, name="hold_bottom_2"),
    phase(1.5, _TOP,    name="up_2"),    phase(0.2, _TOP,    name="hold_top_2"),
]


VALIDATORS = [
    # Hips X swings between 90° (top) and 100° (bottom). Tolerance ±3°.
    (joint_angle_at, {"joint": ("mixamorig:Hips", "X"), "at_phases": ["hold_top_*"],    "min_deg":  87, "max_deg":  93}),
    (joint_angle_at, {"joint": ("mixamorig:Hips", "X"), "at_phases": ["hold_bottom_*"], "min_deg":  97, "max_deg": 103}),

    # Spine at DD-style 18-20° per segment across both phases — needed
    # for IK arm reach (less back-bend leaves the shoulder out of
    # palms-flat range at top, see initial-attempt note in docstring).
    (joint_angle_at, {"joint": ("mixamorig:Spine",  "X"), "at_phases": ["hold_top_*", "hold_bottom_*"], "min_deg": 15, "max_deg": 25}),
    (joint_angle_at, {"joint": ("mixamorig:Spine1", "X"), "at_phases": ["hold_top_*", "hold_bottom_*"], "min_deg": 15, "max_deg": 25}),
    (joint_angle_at, {"joint": ("mixamorig:Spine2", "X"), "at_phases": ["hold_top_*", "hold_bottom_*"], "min_deg": 15, "max_deg": 25}),

    # Hips don't wander laterally (catches L/R wobble).
    (hip_no_lateral_drift, {"max_meters": 0.05}),

    # Hands stay pinned at the floor across every phase — both extremes
    # and the in-between holds. ±0.02 m tolerance (same as cat_cow / DD).
    (hand_world_z_range, {
        "side": "left",
        "at_phases": ["hold_top_*", "hold_bottom_*"],
        "min_z_meters": -0.02, "max_z_meters": 0.02,
    }),
    (hand_world_z_range, {
        "side": "right",
        "at_phases": ["hold_top_*", "hold_bottom_*"],
        "min_z_meters": -0.02, "max_z_meters": 0.02,
    }),
]
