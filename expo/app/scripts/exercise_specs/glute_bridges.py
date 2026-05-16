"""glute_bridges procedural spec — bodyweight floor glute bridge.

Visual target: supine (back on floor), knees flexed ~90° with feet planted
hip-width near the glutes. Hips lift off the floor on a 3-1-3 tempo
(eccentric-hold-concentric, well, concentric first: rise-hold-lower) so
the body forms a straight line from knees to shoulders at the top. 3 reps
side-profile camera.

Biomechanical research (cited 2026-05-16, 8 sources — see PR notes):
- Start: supine, knees ~90° flex (shins ~vertical), feet ~15-20 cm from
  glutes, hip-width apart, full foot on floor (heel-pressure emphasis).
  Arms by sides on floor, palms down. Head neutral on floor. [NASM, ACE,
  Bret Contreras, PMC narrative review]
- Peak: hips lifted ~15 cm (range 10-20 cm per UCAM biomech study); body
  forms straight line knees→hips→shoulders. Knee stays ~90° flex (shins
  remain ~vertical, feet planted). Lumbar neutral — NOT hyperextended
  (the canonical form error). [Contreras, UCAM study, Brookbush]
- Tempo: 3 s concentric (lift) / 1 s peak hold / 3 s eccentric (lower)
  = 7 s/rep. Standard demo convention: 3 reps. [NASM, Peloton]
- Common errors visualized: lumbar hyperextension (bridge-arch instead
  of flat-plane), knees splaying/collapsing, heels lifting, head push.
  Animation must avoid all of these.

Variant selected: standard BODYWEIGHT FLOOR glute bridge — two-leg,
arms-by-sides default position. Hip thrust on bench (~35 cm lift),
single-leg, banded, weighted variants explicitly excluded.

Pose geometry derived from xbot_rig_axes.md + dead_bug introspection:
- Supine setup reuses dead_bug's body flip: Hips X=-90° + loc_Y=-0.95 m
  puts back surface on the floor with Hips bone HEAD at world Z ≈ 0.09 m.
  Spine extends in +Y world; head at Y ≈ +0.55 m; feet end at -Y.
- Hip lift at peak: Hips loc_Y rises by +0.12 m to -0.83 (Hips Z ≈ 0.21 m,
  ~12 cm above starting position — middle of the research range).
  Simultaneously Hips X tilts an extra -20° to -110° so the spine slopes
  down from the elevated hip toward the shoulder/floor contact. Spine
  direction at peak: world (0, 0.94, -0.462); spine end (head) lands at
  Z ≈ 0.02 m (within 2 cm of floor — head essentially stays planted).
- Feet pinned to floor near the glutes: world (±0.082, -0.30, 0). The IK
  chain (chain_count=3, foot+leg+upleg) solves the leg pose; Hips stays
  outside the chain so the keyframed hip lift drives the motion.
- Hands pinned to floor at the sides: world (±0.152, -0.165, 0). With
  shoulder at Y ≈ +0.395 at start, arm length 0.56 m, hands land at
  Y = 0.395 - 0.56 = -0.165. As the body tilts at peak, shoulder shifts
  to Y ≈ +0.372, Z ≈ +0.08; the hand-to-shoulder distance shrinks to
  ~0.54 m, so the elbow flexes ~8° at peak — barely visible from side
  profile, and avoids the alternative (FK arms tilting into the floor
  by ~11 cm).
- No FK on legs or arms — both chains are IK-controlled, so the
  framework correctly skips FK keyframes on them.

IK pole biasing not needed in initial pass: the knee should bend "up"
(toward +Z) which is the anatomical anterior of the femur in supine; the
solver should pick this naturally because the foot is well anterior of
the hip. If a frame render shows knees bending backward, add a pole
target high overhead per feedback-blender-ik-pole-targets.md.
"""
from animation_lib.motion import phase
from animation_lib.validators import (
    joint_angle_at,
    hip_no_lateral_drift,
    foot_world_y_min,
)


NAME = "glute_bridges"
FPS = 30
CAMERA = "side_left"
LIGHTING = "studio"


# Floor pins: feet near glutes, hands by sides at full arm-length so
# the arm chain stays naturally straight.
# Hand pin at Y=-0.25: shoulder Y≈+0.40 minus arm chain length 0.644 m
# = -0.244, rounded to -0.25 → arm is straight at start, slightly
# elbow-bent at peak as body tilts.
IK_PINS = {
    # Foot Y=-0.46: derived geometrically — with hip joint Z=0.09 m and
    # shin length 0.44 m, this puts the knee directly above the foot at
    # Z=0.44 m with thigh length exactly 0.44 m (shins vertical at start).
    "mixamorig:LeftFoot":  (+0.082, -0.46,  0.0),
    "mixamorig:RightFoot": (-0.082, -0.46,  0.0),
    "mixamorig:LeftHand":  (+0.152, -0.25,  0.0),
    "mixamorig:RightHand": (-0.152, -0.25,  0.0),
}

# Per-bone chain counts: hands chain through 3 bones (hand+forearm+arm
# only, shoulder stays at rest orientation so the arm hangs naturally
# from the lateral side instead of the IK solver flipping the shoulder).
# Feet chain through 3 (foot+leg+upleg), Hips stays outside so the
# keyframed hip lift drives the motion.
IK_CHAIN_COUNTS = {
    "mixamorig:LeftHand":  3,
    "mixamorig:RightHand": 3,
    "mixamorig:LeftFoot":  3,
    "mixamorig:RightFoot": 3,
}

# Pole targets bias the IK chain bend direction. Without these, the
# solver picks knee-down (below floor) and elbow-lateral-forward — both
# anatomically wrong. Pole targets:
#  - Knees: high overhead (anterior of femur faces +Z in supine, so knee
#    bend points +Z).
#  - Elbows: extreme lateral at floor height — arm should be roughly
#    straight, pole only matters if the IK introduces a small bend, and
#    we want any bend to fall to the lateral side (not across the body).
IK_POLE_TARGETS = {
    # Above each foot pin: knee should be directly above the foot (shins
    # vertical at start), so the pole sits at the same X/Y as the foot
    # but high in +Z. Pole angle 90° aligns the chain's bend reference
    # to the pole direction in supine pose.
    "mixamorig:LeftFoot":  (+0.082, -0.46, +1.5),
    "mixamorig:RightFoot": (-0.082, -0.46, +1.5),
    # Elbows lateral at floor — biases any small arm bend away from the
    # body's centerline.
    "mixamorig:LeftHand":  (+1.5,    0.0,   0.0),
    "mixamorig:RightHand": (-1.5,    0.0,   0.0),
}

IK_POLE_ANGLES = {
    "mixamorig:LeftFoot":  -90,
    "mixamorig:RightFoot": -90,
}


# Start: hips on floor (supine, no extra tilt).
_DOWN = {
    ("mixamorig:Hips", "loc_Y"): -0.95,
    ("mixamorig:Hips", "X"):     -90,
}

# Peak: hips lifted with spine angled down toward shoulders on floor.
# Hips Z ≈ 0.21 m (lift ~12 cm), Hips X=-110 (additional -20° backward
# tilt that drops spine end Z by ~0.19 m so the head/shoulders stay
# near the floor as the pelvis rises).
_UP = {
    ("mixamorig:Hips", "loc_Y"): -0.83,
    ("mixamorig:Hips", "X"):     -110,
}


# 3 reps at 7 s/rep + 0.2 s opening settle = 21.2 s total.
# Per rep: 3 s concentric (lift) / 1 s peak hold / 3 s eccentric (lower).
PHASES = [
    phase(0.2, _DOWN, name="settle"),
    phase(3.0, _UP,   name="up_0"),    phase(1.0, _UP,   name="hold_0"),
    phase(3.0, _DOWN, name="down_0"),
    phase(3.0, _UP,   name="up_1"),    phase(1.0, _UP,   name="hold_1"),
    phase(3.0, _DOWN, name="down_1"),
    phase(3.0, _UP,   name="up_2"),    phase(1.0, _UP,   name="hold_2"),
    phase(3.0, _DOWN, name="down_2"),
]


VALIDATORS = [
    # Supine baseline holds at start/reset phases.
    (joint_angle_at, {"joint": ("mixamorig:Hips", "X"), "at_phases": ["settle", "down_*"], "min_deg": -93, "max_deg": -87}),
    # Peak tilt: Hips X reaches -110 ±3°.
    (joint_angle_at, {"joint": ("mixamorig:Hips", "X"), "at_phases": ["hold_*"], "min_deg": -113, "max_deg": -107}),

    # Hips loc_Y is keyframed; angle validators don't catch it. Verify
    # via world-position drift: at the DOWN extremes Hips bone Z should
    # be near 0.09 m (start), at HOLD it should be near 0.21 m. We can't
    # express absolute Z directly with existing primitives — instead
    # enforce no lateral drift (the body shouldn't wobble sideways).
    (hip_no_lateral_drift, {"max_meters": 0.02}),

    # Feet stay near floor — loose threshold accommodates the foot
    # bone HEAD dipping while the TAIL stays at the pin during IK
    # solver iterations.
    (foot_world_y_min, {"side": "both", "min_y": -0.15}),
]
