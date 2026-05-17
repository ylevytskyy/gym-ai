"""flutter_kicks procedural spec — supine alternating-leg core hold.

Visual target: character lies supine (on back), hands by sides on the floor,
legs near-straight and hovering above the floor. Alternates small-amplitude
vertical kicks — left heel up while right heel is down, then swap. Both
heels stay above the floor throughout (this is the hallmark of the hold;
floor contact resets the abdominal tension). Side-profile camera reads the
sinusoidal alternation most clearly.

Biomechanical research (cited 2026-05-17, 10 sources — see PR notes):
- Posture: lumbar in near-neutral light contact with floor (not pressed
  forcefully flat, not arched), head and shoulders on the floor, hands
  by sides palms-down (the hands-under-glutes variant is more protective
  but visually indistinguishable from side-profile; we render arms-by-
  sides). [Greatist, Cora Health, Julie Lohre, Squatwolf, Fit Father]
- Knees: near-straight throughout (175-180°). A small soft bend is
  acceptable but no active flex/extend. [Cora Health, Squatwolf]
- Ankles: plantarflexed (toes pointed) throughout — static, not an
  articulating joint during the kick. [Squatwolf, Greatist, Julie Lohre,
  Fitnessvolt, universal across sources]
- Hip flexion alternates: trough leg ~10-15° (heel 5-10 cm above floor),
  peak leg ~30-35° (heel 25-35 cm above floor). 180° out of phase, smooth
  sinusoidal, no holds. [Cora Health, Squatwolf, CoachWeb, PMC 4395661 —
  rectus abdominis dominance below 45° flexion]
- Cadence: ~1 Hz per leg (60 leg-beats/min); slower than swimming flutter
  kicks. [Cora Health]
- Common errors to NOT render: lumbar arching off floor, feet touching
  floor at trough, bent knees, jerky tempo, head/shoulders lifted,
  kicking too high (above 45° = exercise becomes hip-flexor dominant).

Variant selected: standard SUPINE FLAT-BACK fitness-app version. Hollow-
hold variant (shoulders lifted), prone "swimmers", and swimming flutter
kick are explicitly excluded.

Pose geometry derived from xbot_rig_axes.md and reusing the supine setup
calibrated in dead_bug.py and glute_bridges.py:
- Supine flip: Hips X=-90° + loc_Y=-0.95 m puts back on floor with Hips
  bone HEAD at world Z ≈ 0.09 m. Head end at world +Y, feet end at -Y.
- Leg axes invariant to Hips X (rotation axis is parallel to leg local X):
    * LeftUpLeg/RightUpLeg X=0 → thigh in line with body axis (lying flat
      on floor in supine, at Z near hip joint).
    * LeftUpLeg/RightUpLeg X=+90 → thigh perpendicular to body = vertical
      up.
    * Intermediate values: heel height above floor =
      hip_Z + leg_length × sin(X°) = 0.09 + 0.86 × sin(X°) m.
- Trough X=+8°: heel ≈ 0.09 + 0.86×0.139 = 0.21 m above floor — visibly
  hovering, clearly NOT touching. Research target is 5-10 cm but the
  geometry of the rig (long legs, fixed amplitude readability) calls for
  a higher hover so the trough is distinguishable from the peak at
  thumbnail resolutions.
- Peak X=+28°: heel ≈ 0.09 + 0.86×0.469 = 0.49 m above floor. Within
  research's safe range (peak hip flexion below 45° keeps the exercise
  ab-dominant; we're at 28° with 17° of headroom). Vertical heel
  separation between high and low leg ≈ 28 cm — clearly readable.
- Knees stay at LeftLeg/RightLeg X=0 (anatomically straight; X=-90 would
  bend the knee fully so 0 = full extension here, not the standing-pose
  hyperextension you'd see from the same value in a vertical posture).
- Arms by sides pinned via IK at world (±0.152, -0.25, 0): same pattern
  as glute_bridges. Hand at Y=-0.25 m corresponds to shoulder_Y (≈+0.395)
  minus arm chain length (≈0.644). Pole targets at lateral extremes
  bias any IK bend away from the body centerline.
- Feet left at rest orientation. After Hips X=-90 propagation, foot bone
  direction rotates from rest (0, -0.78, -0.63) to roughly (0, -0.63,
  +0.78) — mostly +Z with slight -Y. Visually reads as "dorsiflexed
  pointing up" rather than the canonical plantarflexed "toes pointed
  away from body". Documented mismatch with research; deferred to
  follow-up because the leg kicking motion is the primary visual target
  and the foot pose is subtle from a side profile at demo resolution.

Phase structure: 0.2 s settle holding the first peak pose (so frame 0
is L-up not T-pose), then 8 bilateral cycles at 1 s/cycle (0.5 s per
leg swap). Final phase pose matches frame 0 for a seamless loop.
Total: 0.2 + 8×1.0 = 8.2 s.
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


NAME = "flutter_kicks"
FPS = 30
CAMERA = "side_left"  # alternating up-down legs read most clearly from the side
LIGHTING = "studio"


# Supine setup — applied to every phase. Hips X=-90 flips the body so back
# faces floor; loc_Y=-0.95 drops the pelvis to floor level.
_SUPINE = {
    ("mixamorig:Hips", "loc_Y"): -0.95,
    ("mixamorig:Hips", "X"):     -90,
}

# Hip flexion endpoints — see docstring for the geometry.
_HIP_TROUGH = +8     # heel ≈ 21 cm above floor
_HIP_PEAK   = +28    # heel ≈ 49 cm above floor

# Knees near-straight throughout; X=0 = full extension in this rig (not
# hyperextension — the standing-pose convention where X=-90 = full flex
# means X=0 is the neutral straight knee).
_KNEE_STRAIGHT = 0


# Peak A: left leg up, right leg down (trough).
_PEAK_LEFT_UP = {
    **_SUPINE,
    ("mixamorig:LeftUpLeg",  "X"): _HIP_PEAK,
    ("mixamorig:RightUpLeg", "X"): _HIP_TROUGH,
    ("mixamorig:LeftLeg",    "X"): _KNEE_STRAIGHT,
    ("mixamorig:RightLeg",   "X"): _KNEE_STRAIGHT,
}

# Peak B: right leg up, left leg down (trough). Mirror of Peak A.
_PEAK_RIGHT_UP = {
    **_SUPINE,
    ("mixamorig:LeftUpLeg",  "X"): _HIP_TROUGH,
    ("mixamorig:RightUpLeg", "X"): _HIP_PEAK,
    ("mixamorig:LeftLeg",    "X"): _KNEE_STRAIGHT,
    ("mixamorig:RightLeg",   "X"): _KNEE_STRAIGHT,
}


# Hands pinned by sides on the floor — same pattern as glute_bridges.
# Y=-0.25 m: shoulder Y≈+0.40 minus arm chain length 0.644 m ≈ -0.25 so
# the arm hangs naturally straight from the lateral side.
IK_PINS = {
    "mixamorig:LeftHand":  (+0.152, -0.25, 0.0),
    "mixamorig:RightHand": (-0.152, -0.25, 0.0),
}

# Chain only through hand+forearm+arm (3 bones); shoulder stays at rest so
# the IK solver doesn't flip the shoulder orientation.
IK_CHAIN_COUNTS = {
    "mixamorig:LeftHand":  3,
    "mixamorig:RightHand": 3,
}

# Pole targets bias any small arm bend to fall to the lateral side rather
# than across the body's centerline.
IK_POLE_TARGETS = {
    "mixamorig:LeftHand":  (+1.5, 0.0, 0.0),
    "mixamorig:RightHand": (-1.5, 0.0, 0.0),
}


# 0.2 s settle (frame 0 holds _PEAK_LEFT_UP) + 8 bilateral cycles at
# 1 s/cycle (0.5 s per leg swap). Final phase pose matches frame 0 so
# the loop is seamless.
_BILATERAL_REPS = 8

PHASES = [
    phase(0.2, _PEAK_LEFT_UP, name="settle"),
]
for _i in range(_BILATERAL_REPS):
    PHASES.append(phase(0.5, _PEAK_RIGHT_UP, name=f"peak_R_{_i}"))
    PHASES.append(phase(0.5, _PEAK_LEFT_UP,  name=f"peak_L_{_i}"))


VALIDATORS = [
    # Supine baseline holds throughout — Hips X stays near -90°.
    (joint_angle_at, {"joint": ("mixamorig:Hips", "X"),
                      "at_phases": ["settle", "peak_*"],
                      "min_deg": -93, "max_deg": -87}),

    # Hip flexion at each peak — verify the alternation is actually keyed.
    # Settle phase = _PEAK_LEFT_UP, so settle should read peak on left and
    # trough on right.
    (joint_angle_at, {"joint": ("mixamorig:LeftUpLeg", "X"),
                      "at_phases": ["settle"],
                      "min_deg": _HIP_PEAK - 3, "max_deg": _HIP_PEAK + 3}),
    (joint_angle_at, {"joint": ("mixamorig:RightUpLeg", "X"),
                      "at_phases": ["settle"],
                      "min_deg": _HIP_TROUGH - 3, "max_deg": _HIP_TROUGH + 3}),

    # peak_L_* = left leg up, right leg down.
    (joint_angle_at, {"joint": ("mixamorig:LeftUpLeg", "X"),
                      "at_phases": ["peak_L_*"],
                      "min_deg": _HIP_PEAK - 3, "max_deg": _HIP_PEAK + 3}),
    (joint_angle_at, {"joint": ("mixamorig:RightUpLeg", "X"),
                      "at_phases": ["peak_L_*"],
                      "min_deg": _HIP_TROUGH - 3, "max_deg": _HIP_TROUGH + 3}),

    # peak_R_* = right leg up, left leg down.
    (joint_angle_at, {"joint": ("mixamorig:LeftUpLeg", "X"),
                      "at_phases": ["peak_R_*"],
                      "min_deg": _HIP_TROUGH - 3, "max_deg": _HIP_TROUGH + 3}),
    (joint_angle_at, {"joint": ("mixamorig:RightUpLeg", "X"),
                      "at_phases": ["peak_R_*"],
                      "min_deg": _HIP_PEAK - 3, "max_deg": _HIP_PEAK + 3}),

    # Knees stay near-straight throughout (no active knee flex/extend).
    # Tolerance ±3° for Bezier interpolation overshoot at fast alternation.
    (joint_angle_range, {"joint": ("mixamorig:LeftLeg", "X"),
                         "min_deg": -3, "max_deg": +3}),
    (joint_angle_range, {"joint": ("mixamorig:RightLeg", "X"),
                         "min_deg": -3, "max_deg": +3}),

    # World-space gates — body stays planted, no drift.
    (hip_no_lateral_drift,    {"max_meters": 0.02}),
    (hip_no_sagittal_drift,   {"max_meters": 0.02}),
    (world_position_drift_max, {"bone": "mixamorig:Hips", "axis": "Z",
                                "max_meters": 0.02}),

    # Feet (ankle bone HEAD) always above floor — never touch. min_y is
    # the ankle Z; the visible heel mesh sits ~5 cm below the ankle, so
    # an ankle Z floor of 0.10 m keeps the heel mesh above floor.
    (foot_world_y_min, {"side": "both", "min_y": 0.10}),
]
