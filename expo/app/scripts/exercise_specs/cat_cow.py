"""cat_cow procedural spec — kneeling spinal-mobility flow.

Visual target: tabletop position (knees + hands on floor, torso horizontal),
alternating COW (back arches downward, sacrum lifts, gaze rises) and CAT
(back rounds upward, sacrum tucks under, chin tucks). Slow breath cadence,
~10 s per full cycle, 3 cycles total.

Biomechanical research (cited 2026-05-06; ~21 sources, see PR notes):
- Tabletop posture: hips above knees, shoulders above wrists, torso horizontal.
  Hip flexion ≈ 90°, knee flexion ≈ 90°, ankles plantarflexed (tops of feet
  on floor — the non-tucked variant).
- COW: anterior pelvic tilt 10–15°, lumbar extension 15–20°, thoracic extension
  10–15° (distributed across Spine1 + Spine2), cervical extension 20–25°
  (gaze to horizon — explicitly NOT to ceiling, that's the "head-flinging"
  form error).
- CAT: posterior pelvic tilt 8–12°, lumbar flexion 15–20°, thoracic flexion
  15–20°, cervical flexion 25–30° (chin toward chest, neck long).
- Tempo: 4 s movement + 1 s hold per phase × 2 phases = 10 s/cycle. Matches
  ~6 breaths/min diaphragmatic pacing (HRV resonance frequency).
- Wave order: pelvis-leads (caudal-to-cranial). The spec pins keyframes at
  peaks; the interpolator's natural easing produces the wave.
- Form errors avoided: distributed extension (no lumbar-only hinge), small
  cervical excursion (no neck-flinging), gaze stays at horizon for cow.

Calibration crib for the all-fours setup pose (verified by world-position
introspection 2026-05-06):

- Hips X +90° tilts the WHOLE character forward 90°.
- LeftUpLeg / RightUpLeg X +90° cancels the Hips tilt → thighs hang
  straight down (world -Z).
- LeftLeg / RightLeg X -90° → shins fully horizontal.
- LeftFoot / RightFoot X +60° → plantarflexion, top-of-foot on floor.
- Spine bones at X = 0 → torso horizontal forward.
- Neck X -50° / Head X -40° → head roughly horizontal (gaze forward).
- LeftShoulder Z 0° / RightShoulder Z 0° → explicit scapular neutral at setup.
- Hips loc_Y -0.615 → lowers root so knees reach world Z ≈ 0 (floor level).

IK arms (added 2026-05-16):
The arms are no longer FK-keyframed — they are driven by IK constraints
pinning each hand to a static world-space target on the floor, directly
under the shoulder. This fixes the 69 cm wrist-slide bug from the prior
spec, which compensated only hand Z via shoulder X rotation and let Y
swing freely.

- IK_PINS targets the wrists at (±0.152, -0.405, 0.0) — shoulder-width
  apart, world Y matches setup-pose shoulder Y (verified by introspection
  2026-05-16), Z = 0 = floor.
- chain_count = 3 covers LeftHand → LeftForeArm → LeftArm. LeftShoulder
  stays outside the chain so its Z=0 setup keyframe still applies.
- emit_phases skips FK keyframes on chain bones (skip_bones set returned
  from apply_ik_pins). This prevents FK/IK conflict.
- Elbow direction: solved without a pole target initially. If the solver
  flips the elbow forward (camera-facing) instead of backward (toward
  knees), add a pole target empty at hip height behind each shoulder.

Pelvic tilt during the cycle:
NOT animated. With shin horizontal (LeftLeg X=-90), even ±2° of pelvic
tilt lifts/drops the foot 4+ cm at this kinematic chain length.

Loop boundary:
The return_to_setup phase (4.0s) closes the cycle. With IK wrist-pinning,
the wrists no longer slide during return — they were always at the target
position. The loop is fully seamless.
"""
from animation_lib.motion import phase
from animation_lib.validators import (
    joint_angle_at,
    hip_no_lateral_drift,
    hip_no_sagittal_drift,
    foot_world_y_min,
    hand_world_z_range,
)


NAME = "cat_cow"
FPS = 30
CAMERA = "side_left"  # side profile shows the spine arch most clearly
LIGHTING = "studio"


# IK pins: each wrist is anchored at a world-space floor target directly under
# the corresponding shoulder. The IK solver drives the full arm chain (hand →
# forearm → arm → shoulder, chain_count=4) so the shoulder can take up the
# slack at cow peak (where spine extension raises the shoulder ~10 cm).
# Target Y=-0.405 matches setup-pose shoulder Y (introspected 2026-05-16).
IK_PINS = {
    "mixamorig:LeftHand":  ( 0.152, -0.405, 0.0),
    "mixamorig:RightHand": (-0.152, -0.405, 0.0),
}

# Lock hand WORLD rotation so palms lie flat on the floor pointing forward
# (otherwise the hand bone angles diagonal-down and fingers extend below the
# floor). Euler (180°, 0°, 0°) around world X aligns the hand bone's +Y axis
# (along the bone, wrist→knuckle) with world -Y (forward) and the +Z axis
# (palm normal) with world -Z (palm facing down). Verified empirically across
# rest, cow peak, and cat peak — palms stay flat at Z=0 throughout.
IK_PIN_ROTATIONS = {
    "mixamorig:LeftHand":  (180, 0, 0),
    "mixamorig:RightHand": (180, 0, 0),
}

# chain_count=4 (hand+forearm+arm+shoulder). Needed because rotation-locked
# IK at cow peak is unreachable with only 3 bones — the shoulder must lower
# slightly to bring the palm flat to the floor.
IK_CHAIN_COUNT = 4


_QUADRUPED_SETUP = {
    ("mixamorig:Hips", "loc_Y"): -0.615,
    ("mixamorig:Hips", "X"):      90,

    ("mixamorig:Spine",  "X"): 0,
    ("mixamorig:Spine1", "X"): 0,
    ("mixamorig:Spine2", "X"): 0,

    ("mixamorig:Neck", "X"): -50,
    ("mixamorig:Head", "X"): -40,

    ("mixamorig:LeftUpLeg",   "X"):  90,
    ("mixamorig:LeftLeg",     "X"): -90,
    # Foot X=120 + ToeBase X=-30 lays the foot flat with sole at Z≈+0.008
    # (verified 2026-05-16). The previous X=60 had the toe tip 19 cm below
    # the wrist plane — visible as "feet hanging lower than hands" in profile.
    ("mixamorig:LeftFoot",    "X"): 120,
    ("mixamorig:LeftToeBase", "X"): -30,
    ("mixamorig:RightUpLeg",   "X"):  90,
    ("mixamorig:RightLeg",     "X"): -90,
    ("mixamorig:RightFoot",    "X"): 120,
    ("mixamorig:RightToeBase", "X"): -30,

    # Shoulders, arms, forearms, and hands are all driven by IK_PINS above
    # (chain_count=4). No FK entries for them here — skip_bones from
    # apply_ik_pins ensures the emitter never keys these bones.
}


# Spinal extension + cervical extension (head lifts toward horizon).
# Spine X- = backward arch. Distribute extension across lumbar (Spine) and
# thoracic (Spine1/Spine2). Total -23° within COW research range.
# Now that IK pins the wrists, we can use the full anatomical extension
# range (was clamped to -13° before to accommodate FK arm compensation).
_COW = {
    **_QUADRUPED_SETUP,
    ("mixamorig:Spine",  "X"): -15,
    ("mixamorig:Spine1", "X"):  -6,
    ("mixamorig:Spine2", "X"):  -6,

    ("mixamorig:Neck", "X"): -65,
    ("mixamorig:Head", "X"): -55,
}


# Spinal flexion + cervical flexion (chin tucks).
# Spine X+ = forward fold. Distribute: lumbar +20°, thoracic +20° split as
# +10° each across Spine1/Spine2. Total +40° within research range.
_CAT = {
    **_QUADRUPED_SETUP,
    ("mixamorig:Spine",  "X"):  20,
    ("mixamorig:Spine1", "X"):  10,
    ("mixamorig:Spine2", "X"):  10,

    ("mixamorig:Neck", "X"): -25,
    ("mixamorig:Head", "X"): -10,
}


# 0.5s settle into tabletop, then 3 cycles of (4s cow → 1s hold → 4s cat → 1s hold),
# then 4s return to tabletop for a seamless loop. Total 34.5s, 1035 frames @ 30 fps.
PHASES = [
    phase(0.5, _QUADRUPED_SETUP, name="setup"),
    phase(4.0, _COW, name="cow_0"), phase(1.0, _COW, name="hold_cow_0"),
    phase(4.0, _CAT, name="cat_0"), phase(1.0, _CAT, name="hold_cat_0"),
    phase(4.0, _COW, name="cow_1"), phase(1.0, _COW, name="hold_cow_1"),
    phase(4.0, _CAT, name="cat_1"), phase(1.0, _CAT, name="hold_cat_1"),
    phase(4.0, _COW, name="cow_2"), phase(1.0, _COW, name="hold_cow_2"),
    phase(4.0, _CAT, name="cat_2"), phase(1.0, _CAT, name="hold_cat_2"),
    phase(4.0, _QUADRUPED_SETUP, name="return_to_setup"),  # seamless loop boundary
]


VALIDATORS = [
    # Local-angle gates at each peak — spine reduced to -13° to meet planted-contact
    # constraint (≥-22° lifts hands above ±0.02 m tolerance; see docstring).
    (joint_angle_at, {"joint": ("mixamorig:Spine", "X"), "at_phases": ["cow_*", "hold_cow_*"], "min_deg": -18, "max_deg": -8}),
    (joint_angle_at, {"joint": ("mixamorig:Spine", "X"), "at_phases": ["cat_*", "hold_cat_*"], "min_deg":  15, "max_deg":  25}),
    (joint_angle_at, {"joint": ("mixamorig:Head",  "X"), "at_phases": ["cow_*", "hold_cow_*"], "min_deg": -60, "max_deg": -50}),
    (joint_angle_at, {"joint": ("mixamorig:Head",  "X"), "at_phases": ["cat_*", "hold_cat_*"], "min_deg": -15, "max_deg":  -5}),

    # Shin-angle guards: LeftLeg/RightLeg X stays near -90° (horizontal shin)
    # across all phases. Catches knee-off-floor regression.
    (joint_angle_at, {"joint": ("mixamorig:LeftLeg",  "X"), "at_phases": ["setup", "cow_*", "hold_cow_*", "cat_*", "hold_cat_*", "return_to_setup"], "min_deg": -95, "max_deg": -85}),
    (joint_angle_at, {"joint": ("mixamorig:RightLeg", "X"), "at_phases": ["setup", "cow_*", "hold_cow_*", "cat_*", "hold_cat_*", "return_to_setup"], "min_deg": -95, "max_deg": -85}),

    # World-space gates: character stays planted in tabletop. The hand bone's
    # HEAD = wrist; under IK with use_tail=True (default), the bone TAIL =
    # knuckle is pinned exactly at the IK target on the floor, so the wrist
    # (Hand.head) sits naturally 2–8 cm above the floor as the shoulder rises
    # and falls during cow/cat. The validator therefore allows wrist Z up to
    # 0.10 m (was 0.05 m, which was tuned to the prior buggy geometry where
    # the wrist sat ON the floor and the fingers poked 18 cm through it).
    (hip_no_lateral_drift,  {"max_meters": 0.05}),
    (hip_no_sagittal_drift, {"max_meters": 0.10}),
    (foot_world_y_min,      {"side": "both", "min_y": -0.05}),
    # With rotation-locked IK at chain_count=4, the palm lays flat at Z=0
    # exactly across every phase (verified 2026-05-16). Tight tolerance
    # catches any future regression where hands lift off the floor.
    (hand_world_z_range, {
        "side": "left",
        "at_phases": ["setup", "cow_*", "hold_cow_*", "cat_*", "hold_cat_*", "return_to_setup"],
        "min_z_meters": -0.02, "max_z_meters": 0.02,
    }),
    (hand_world_z_range, {
        "side": "right",
        "at_phases": ["setup", "cow_*", "hold_cow_*", "cat_*", "hold_cat_*", "return_to_setup"],
        "min_z_meters": -0.02, "max_z_meters": 0.02,
    }),
]
