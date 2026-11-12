"""Render an exercise loop with a procedural mannequin.

Usage:
  blender -b -P pipelines/blender/render.py -- <exercise> [--view front|side|three_quarter]
          [--frames 1,61] [--out ./out] [--check]

--frames renders only those frames as PNG (for review); without it the whole loop is rendered.
--check prints joint positions at each key pose instead of rendering.
A full render also rebuilds <out>/index.html, the page that plays every loop (see gallery.py).
"""

import argparse
import math
import os
import subprocess
import sys

import bmesh
import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Euler, Matrix, Vector

# Character faces -Y. Units are metres.
STANCE_X = 0.17  # ankle half-width, about shoulder width
ANKLE_TO_HIP, HIP_TO_SHOULDER = 0.87, 0.45  # rest lengths along the body
FOOT_REST_DEG = math.degrees(math.atan2(0.06, 0.17 * math.cos(math.radians(15))))  # foot slope below horizontal


def build_bones(ex):
    """Bone layout: name -> (head, tail, parent). Legs and arms are IK or FK per exercise."""
    bones = {
        "root": ((0, 0, 0), (0, 0.2, 0), None),
        "pelvis": ((0, 0, 0.95), (0, 0, 1.05), "root"),
        "spine": ((0, 0, 1.05), (0, 0, 1.42), "pelvis"),
        "neck": ((0, 0, 1.42), (0, 0, 1.52), "spine"),
        "head": ((0, 0, 1.52), (0, 0, 1.76), "neck"),
    }
    for side, s in (("L", 1), ("R", -1)):
        bones[f"thigh.{side}"] = ((s * 0.10, 0, 0.95), (s * 0.135, -0.02, 0.515), "pelvis")
        bones[f"shin.{side}"] = ((s * 0.135, -0.02, 0.515), (s * STANCE_X, 0, 0.08), f"thigh.{side}")
        toe_out = math.radians(ex.get("toe_out", 15))
        toe = Vector((s * STANCE_X, 0, 0.02)) + 0.17 * Vector((s * math.sin(toe_out), -math.cos(toe_out), 0))
        if ex["legs"] == "ik":  # feet planted on the floor, knees solved
            # The foot and knee pole ride on the IK target, so keying its location moves the whole foot.
            bones[f"foot_ik.{side}"] = ((s * STANCE_X, 0, 0.08), (s * STANCE_X, 0.1, 0.08), "root")
            bones[f"foot.{side}"] = ((s * STANCE_X, 0, 0.08), tuple(toe), f"foot_ik.{side}")
            pole = Vector((s * STANCE_X, 0, 0.5)) + 0.6 * Vector((s * math.sin(toe_out), -math.cos(toe_out), 0))
            bones[f"knee_pole.{side}"] = (tuple(pole), tuple(pole + Vector((0, -0.1, 0))), f"foot_ik.{side}")
        else:  # straight legs carried by the pelvis, foot keyed
            bones[f"foot.{side}"] = ((s * STANCE_X, 0, 0.08), tuple(toe), f"shin.{side}")
        bones[f"upper_arm.{side}"] = ((s * 0.20, 0, 1.40), (s * 0.22, 0, 1.11), "spine")
        bones[f"forearm.{side}"] = ((s * 0.22, 0, 1.11), (s * 0.23, 0, 0.86), f"upper_arm.{side}")
        if ex["arms"] == "ik":  # hands planted, elbows solved
            wrist = Vector(ex["wrist"](s))
            hand = Vector(ex.get("hand", lambda s: (0, -0.09, -0.01))(s))
            # The hand rides on the IK target, so keying the target's location moves the whole hand.
            bones[f"hand_ik.{side}"] = (tuple(wrist), tuple(wrist + Vector((0, 0.1, 0))), "root")
            bones[f"hand.{side}"] = (tuple(wrist), tuple(wrist + hand), f"hand_ik.{side}")
            pole = Vector(ex["elbow_pole"](s))
            bones[f"elbow_pole.{side}"] = (tuple(pole), tuple(pole + Vector((0, 0.1, 0))), "root")
        else:
            bones[f"hand.{side}"] = ((s * 0.23, 0, 0.86), (s * 0.23, 0, 0.77), f"forearm.{side}")
    return bones


def is_control(name):
    return name == "root" or name.startswith(("foot_ik", "knee_pole", "hand_ik", "elbow_pole"))


# Body shapes: bone -> (half-width, half-depth, extra length at each end, centre along bone 0..1)
SHAPES = {
    "pelvis": (0.16, 0.11, 0.06, 0.4),
    "spine": (0.17, 0.11, 0.03, 0.55),
    "neck": (0.05, 0.05, 0.02, 0.5),
    "head": (0.095, 0.11, -0.01, 0.5),
}
for side in "LR":
    SHAPES.update({
        f"thigh.{side}": (0.075, 0.075, 0.02, 0.5),
        f"shin.{side}": (0.055, 0.055, 0.0, 0.5),
        f"foot.{side}": (0.05, 0.04, 0.05, 0.4),
        f"upper_arm.{side}": (0.05, 0.05, 0.0, 0.5),
        f"forearm.{side}": (0.042, 0.042, 0.0, 0.5),
        f"hand.{side}": (0.035, 0.02, 0.02, 0.5),
    })
JOINTS = {f"{b}.{side}": r for side in "LR" for b, r in (
    ("shin", 0.06), ("thigh", 0.075), ("forearm", 0.045), ("upper_arm", 0.055))}


def prone(shoulder_z, ankle=(0.65, 0.17), toe_deg=55, spine=0):
    """Straight body from planted toes to shoulders at the given height.

    Returns the pose plus the shoulder's forward position, used to place the hands.
    """
    ankle_y, ankle_z = ankle
    lift = math.asin((shoulder_z - ankle_z) / (ANKLE_TO_HIP + HIP_TO_SHOULDER))
    tilt = 90 - math.degrees(lift)  # forward lean from standing
    hip_y = ankle_y - ANKLE_TO_HIP * math.sin(math.radians(tilt))
    hip_z = ankle_z + ANKLE_TO_HIP * math.cos(math.radians(tilt))
    pose = dict(hip=(0, hip_y, hip_z - 0.95), pelvis=tilt, spine=spine, neck=0, head=0,
                foot=toe_deg - FOOT_REST_DEG - tilt)
    return pose, hip_y - HIP_TO_SHOULDER * math.sin(math.radians(tilt))


# Exercise = list of (frame, pose); frame_end + 1 repeats frame 1, so the clip loops.
# Pose angles are degrees in the parent's frame: positive tilt leans the bone's top forward,
# positive arm flex raises the arm forward, positive foot points the toes down.
STAND = dict(hip=(0, 0, 0), pelvis=0, spine=0, neck=0, head=0, arm=0, elbow=0)
SQUAT_BOTTOM = dict(hip=(0, 0.17, -0.48), pelvis=28, spine=12, neck=-18, head=-10, arm=125, elbow=0)

PUSH_UP_TOP, PUSH_UP_SHOULDER_Y = prone(0.55)  # arms almost straight
PUSH_UP_BOTTOM, _ = prone(0.18)  # chest about 7 cm above the floor
PUSH_UP_HAND_Y = PUSH_UP_SHOULDER_Y + 0.10  # hands at lower chest: forearms near vertical at the bottom

PLANK_Y = prone(0.34)[1]  # forearm plank: shoulders over elbows
PLANK, _ = prone(0.34)
PLANK_INHALE, _ = prone(0.346, spine=-1.0)



def pose(base=STAND, **kw):
    return {**base, **kw}


def neck_tilt(x, y):
    """Head tilt split over neck and head: x chin down, y toward the left shoulder."""
    return dict(neck=(0.6 * x, 0.6 * y, 0), head=(0.4 * x, 0.4 * y, 0))


def arm_circles(circles=2, frames_per=30, steps=6, size=18):
    """Arms out at shoulder height tracing small forward circles."""
    keys = []
    for i in range(circles * steps + 1):
        a = 2 * math.pi * i / steps
        keys.append((1 + i * frames_per // steps,
                     pose(abduct=90 + size * math.cos(a), arm=size * math.sin(a))))
    return keys


LUNGE_STAND = pose(abduct=40, arm=-8, elbow_in=100)  # hands on hips, clear of the front thigh


def lunge(back):
    """Reverse lunge stepping back with `back` ("L" or "R"); returns keys from frame 0."""
    lift = {back: dict(feet=(0, 0.42, 0.06), foot=15)}
    down = {back: dict(feet=(0, 0.88, 0.095), foot=40, pole=(0, -0.2, -0.65))}  # on its toes, knee down
    mid = pose(LUNGE_STAND, hip=(0, 0.14, -0.08), **lift)
    bottom = pose(LUNGE_STAND, hip=(0, 0.42, -0.42), spine=4, **down)
    return [(0, LUNGE_STAND), (12, mid), (30, bottom), (40, bottom), (58, mid), (70, LUNGE_STAND)]


def supine(a):
    """On the back, shoulders on the floor, hips raised so the torso rises `a` degrees."""
    r = math.radians(a)
    hip_y, hip_z = 0.50 - HIP_TO_SHOULDER * math.cos(r), 0.12 + HIP_TO_SHOULDER * math.sin(r)
    return pose(hip=(0, hip_y, hip_z - 0.95), pelvis=-(90 + a), neck=a, feet=(0, -0.30, 0))


def dip(shoulder_y, shoulder_z, lean=13):
    """Upright torso, leaning back `lean` degrees, shoulders at the given point."""
    r = math.radians(lean)
    return pose(hip=(0, shoulder_y - HIP_TO_SHOULDER * math.sin(r), shoulder_z - HIP_TO_SHOULDER * math.cos(r) - 0.95),
                pelvis=-lean, neck=8, feet=(0, -0.42, 0))


JACK_AIR = pose(hip=(0, 0, 0.09), abduct=90, feet=(0.14, 0, 0.09), foot=25)
JACK_OPEN = pose(hip=(0, 0, -0.06), abduct=165, feet=(0.27, 0, 0))
JACK_LAND = pose(hip=(0, 0, -0.03))

KNEE_UP = dict(thigh=85, knee=95, foot=20)
def high_knee(up, down):
    return pose(hip=(0, 0, 0.03), elbow=90, **{up: dict(KNEE_UP, arm=-35), down: dict(arm=35)})
KNEES_PASS = pose(elbow=90, arm=0, thigh=20, knee=40)


HIP_HINGE = pose(LUNGE_STAND, hip=(0, 0.17, -0.05), pelvis=62, neck=-12)  # flat back, soft knees


def calf_raise(deg):
    """Heels up `deg` degrees onto the balls of the feet; the toe tips stay where they were."""
    r, t = math.radians(FOOT_REST_DEG), math.radians(FOOT_REST_DEG + deg)
    up, fwd = 0.18 * (math.sin(t) - math.sin(r)), 0.18 * (math.cos(r) - math.cos(t))
    return pose(LUNGE_STAND, hip=(0, -fwd, up), feet=(0, -fwd, up), foot=deg)


def fold(pelvis, spine, hip_back=0.2):
    """Standing forward fold on straight legs; the arms hang straight down toward the shins."""
    drop = ANKLE_TO_HIP - math.sqrt(ANKLE_TO_HIP ** 2 - hip_back ** 2) + 0.01
    return pose(hip=(0, hip_back, -drop), pelvis=pelvis, spine=spine, neck=-10, arm=pelvis + spine - 8)


# Face down, flat on the floor, head toward -Y.
PRONE_Z = 0.115  # torso half-depth: the front of the body rests on the floor
PRONE_FLAT = pose(hip=(0, 0.3, PRONE_Z - 0.95), pelvis=90, foot=62)


def superman(lift):
    """Face down, arms overhead; arms, chest and legs rise together by `lift` (0..1)."""
    return pose(PRONE_FLAT, spine=-12 * lift, neck=6 * lift, arm=171 + 12 * lift, thigh=-11 * lift)


def snow_angel(abduct):
    """Face down, chest a little up, straight arms swept `abduct` degrees out from the sides."""
    return pose(PRONE_FLAT, spine=-6, neck=6, arm=-12, abduct=abduct)


# On the back, flat, head toward +Y.
SUPINE_FLAT = pose(hip=(0, -0.3, PRONE_Z - 0.95), pelvis=-90, neck=-4)
DEAD_BUG_TOP = pose(SUPINE_FLAT, arm=90, thigh=90, knee=90)  # arms to the ceiling, legs in tabletop


def dead_bug(arm_side, leg_side):
    return pose(DEAD_BUG_TOP, **{arm_side: dict(arm=170), leg_side: dict(thigh=8, knee=4)})


# Hands and knees: knees under hips, hands under shoulders, shins and the tops of the feet on the floor.
QUAD_HIP = (0.25, 0.50)  # hip y, z
QUAD_SHOULDER = (QUAD_HIP[0] - math.sqrt(HIP_TO_SHOULDER ** 2 - 0.065 ** 2), QUAD_HIP[1] + 0.065)
QUAD_KNEE_POLE = (0, -0.04, -0.98)  # the pole rides on the foot; this puts it below the knee
QUAD = pose(hip=(0, QUAD_HIP[0], QUAD_HIP[1] - 0.95), pelvis=90 - math.degrees(math.asin(0.065 / HIP_TO_SHOULDER)),
            neck=-14, feet=(0, QUAD_HIP[0] + 0.437, -0.025), foot=152, pole=QUAD_KNEE_POLE)


def cat_cow(x):
    """x=1 cat (back rounded up, head down), x=-1 cow (back arched, head up), 0 flat."""
    if x >= 0:
        return pose(QUAD, pelvis=QUAD["pelvis"] - 22 * x, spine=34 * x, neck=-14 + 44 * x, head=8 * x)
    x = -x
    return pose(QUAD, pelvis=QUAD["pelvis"] + 8 * x, spine=-20 * x, neck=-14 - 22 * x, head=-12 * x)


def bird_dog(arm_side, leg_side, x=1.0):
    """From hands and knees, `arm_side` reaches forward and `leg_side` back, by `x` (0..1)."""
    reach = dict(hands=(0, -0.60 * x, 0.55 * x), elbows=(0, -0.4 * x, 0.6 * x))
    kick = dict(feet=(-0.06 * x, QUAD["feet"][1] + (1.15 - QUAD["feet"][1]) * x, -0.025 + 0.465 * x),
                foot=152 + 10 * x)
    return pose(QUAD, **{arm_side: reach, leg_side: kick})


# Mountain climbers: a high plank, hands under the shoulders; each foot leaves its spot on the toes
# behind and lands again under the chest, so the knee drives in toward the chest.
CLIMB_TOP, CLIMB_SHOULDER_Y = prone(0.55)


def climb_foot(y, z, foot):
    """Foot target for mountain climbers. The knee pole normally rides on the foot; here it is held
    at one point below the floor under the chest, off the line of the leg in every frame, so each
    knee drives forward toward the chest and never swings sideways or up."""
    return dict(feet=(0, y, z), foot=foot, pole=(0, 0.1 - y, -1.0 - z))


CLIMB_BACK = climb_foot(0.665, 0.09, 36)  # on the toes, leg straight
CLIMB_IN = climb_foot(CLIMB_TOP["hip"][1] + 0.06, 0.05, 15)  # under the hips, just off the floor


def climb(side):
    other = "L" if side == "R" else "R"
    return pose(CLIMB_TOP, **{side: CLIMB_IN, other: CLIMB_BACK})


def climb_swap(hip_z=0.54, shoulder=(CLIMB_SHOULDER_Y, 0.55)):
    """Mid-swap: both feet pass each other while the hips hop up, so the knees clear the floor.
    The shoulders stay over the hands."""
    lift = math.degrees(math.asin((shoulder[1] - hip_z) / HIP_TO_SHOULDER))
    hip_y = shoulder[0] + HIP_TO_SHOULDER * math.cos(math.radians(lift))
    mid = climb_foot((CLIMB_BACK["feet"][1] + CLIMB_IN["feet"][1]) / 2, 0.08, 25)
    return pose(CLIMB_TOP, hip=(0, hip_y, hip_z - 0.95), pelvis=90 - lift, **mid)


def side_plank(lift=0.0, tilt=72):
    """On the right forearm and the side of the right foot, the body faces +X, head toward -Y."""
    return pose(hip=(0, 0.3, 0.405 + lift - 0.95), pelvis=Matrix.Rotation(math.radians(tilt), 3, "X") @ Matrix.Rotation(math.radians(90), 3, "Z"),
                spread=-8.5, neck=-4)  # feet stacked


SIDE_PLANK_SHOULDER_Y = 0.3 - 0.20 * math.cos(math.radians(72)) - 0.45 * math.sin(math.radians(72))
SIDE_PLANK_TOP = (0.3 + 0.20 * math.cos(math.radians(72)) - 0.45 * math.sin(math.radians(72)),
                  0.405 + 0.20 * math.sin(math.radians(72)) + 0.45 * math.cos(math.radians(72)))


def kneeling_stretch(push):
    """Right knee down behind the hip, left foot forward; the hips push forward by `push` metres."""
    reach = 0.22 + push  # hip ahead of the back knee
    hip_z = 0.06 + math.sqrt(0.437 ** 2 - reach ** 2)  # knee joint resting on the floor
    return pose(LUNGE_STAND, hip=(0, -push, hip_z - 0.95), spine=-4,
                L=dict(feet=(0, -0.56, 0)),
                R=dict(feet=(0, 0.657, -0.025), foot=150, pole=(0, 0.05, -0.92)))


# --- Standing mobility ---------------------------------------------------------------------------
TWIST_ARMS = dict(arm=82, abduct=-6, elbow=8)  # arms straight ahead at chest height, palms together


def torso_twist(deg):
    """Hips face forward, the chest turns `deg` degrees to the left (+) or right (-)."""
    return pose(**TWIST_ARMS, pelvis=(0, 0, 0.15 * deg), spine=(0, 0, 0.65 * deg), neck=(0, 0, 0.2 * deg))


def side_bend(deg):
    """Lean `deg` degrees to the left (+) or right (-); the arm on the far side reaches overhead."""
    far, near = ("R", "L") if deg > 0 else ("L", "R")
    a = abs(deg) / 30
    return pose(hip=(-0.04 * deg / 30, 0, -0.01 * a), pelvis=(0, 0.2 * deg, 0), spine=(0, 0.8 * deg, 0),
                neck=(0, 0.3 * deg, 0), **{far: dict(abduct=20 + 145 * a, elbow_in=-25 * a),
                                           near: dict(abduct=6 * a)})


def hip_circle(a, r=0.07, tilt=7):
    """Hands on hips; the hips trace a horizontal circle while the shoulders stay over the feet."""
    c, s = math.cos(math.radians(a)), math.sin(math.radians(a))
    return pose(LUNGE_STAND, hip=(r * c, r * s, -0.02), pelvis=(tilt * s, -tilt * c, 0),
                spine=(-1.6 * tilt * s, 1.6 * tilt * c, 0))


# --- Floor stretches -----------------------------------------------------------------------------
def childs_pose(sink=0.0):
    """Kneeling, sitting back toward the heels, chest down, arms long on the floor ahead."""
    return pose(QUAD, hip=(0, 0.62, 0.26 - sink - 0.95), pelvis=108, spine=-4, neck=-14,
                feet=(-0.06, QUAD["feet"][1], QUAD["feet"][2]), foot=152, pole=(0.45, -0.04, -0.9),  # knees apart
                hands=(0, -0.13, 0), elbows=(0, -0.5, 0.6))


def knees_to_chest(x):
    """On the back, both knees hugged toward the chest by `x` (0..1)."""
    return pose(SUPINE_FLAT, thigh=118 + 12 * x, knee=140, foot=15, hands=(0, 0.07 * x, -0.04 * x))  # hands ride on the shins


# --- Legs ----------------------------------------------------------------------------------------
WALL_Y = 0.48  # wall face behind the mannequin for the wall sit
WALL_SIT = pose(hip=(0, 0.33, -0.43), feet=(0, -0.10, 0))
WALL_SIT_INHALE = pose(WALL_SIT, hip=(0, 0.33, -0.425), spine=-1)

SUMO_OUT = 0.15  # feet this much wider than hip width
SUMO_ARMS = dict(arm=30, elbow=80, elbow_in=25, abduct=10)  # hands together in front of the chest
SUMO_STAND = pose(feet=(SUMO_OUT, 0, 0), **SUMO_ARMS)
SUMO_BOTTOM = pose(SUMO_STAND, hip=(0, 0.06, -0.40), pelvis=14, spine=4, neck=-8)

STEP_RISE, STEP_RUN, STAIR_EDGE = 0.17, 0.28, -0.26
STEP_FOOT = (0, STAIR_EDGE - 0.17, STEP_RISE)  # foot on the first step, toes short of the second


def step_up(lead):
    """Step up onto the first stair with `lead`, bring the other foot up, then step down lead first.
    Returns keys from frame 0 over 80 frames."""
    trail = "L" if lead == "R" else "R"
    ly, lz = STEP_FOOT[1], STEP_FOOT[2]
    lift = {lead: dict(feet=(0, -0.20, 0.30), foot=-5, arm=-20), trail: dict(arm=20)}
    plant = {lead: dict(feet=STEP_FOOT, arm=-15), trail: dict(arm=15)}
    on_top = dict(feet=STEP_FOOT)
    keys = [
        (0, STAND),
        (10, pose(hip=(0, -0.03, -0.01), spine=4, **lift)),
        (20, pose(hip=(0, -0.10, -0.03), spine=10, **plant)),
        (34, pose(hip=(0, ly + 0.02, lz - 0.02), spine=8,
                  **{lead: dict(on_top, arm=15), trail: dict(feet=(0, -0.12, 0.14), foot=30, arm=-15)})),
        (42, pose(hip=(0, ly, lz), **{lead: on_top, trail: on_top})),
        (52, pose(hip=(0, ly + 0.08, lz - 0.04), **{lead: dict(feet=(0, ly + 0.25, lz + 0.08), foot=15), trail: on_top})),
        (62, pose(hip=(0, -0.10, -0.06), spine=6, **{lead: dict(feet=(0, 0, 0)), trail: on_top})),
        (72, pose(hip=(0, -0.02, -0.01), **{trail: dict(feet=(0, -0.20, 0.24), foot=10)})),
        (80, STAND),
    ]
    return keys


SIDE_LUNGE_ARMS = dict(arm=40, elbow=70, elbow_in=20, abduct=10)


def side_lunge(side):
    """Step `side` foot out wide and sit back into that hip; the other leg stays straight.
    Returns keys from frame 0 over 70 frames."""
    sx = 1 if side == "L" else -1
    stand = pose(**SIDE_LUNGE_ARMS)
    mid = pose(stand, hip=(sx * 0.18, 0.02, -0.05), **{side: dict(feet=(0.32, 0, 0.10), foot=10)})
    low = pose(stand, hip=(sx * 0.42, 0.14, -0.38), pelvis=32, spine=6, neck=-14, arm=60,
               **{side: dict(feet=(0.62, 0, 0))})
    return [(0, stand), (12, mid), (28, low), (38, low), (56, mid), (70, stand)]


def donkey_kick(side, x=1.0):
    """From hands and knees, `side` keeps its knee bent at 90 deg and swings the thigh back and up
    by `x` (0..1), so the sole of the foot rises toward the ceiling. The foot follows the arc."""
    leg = 0.437  # thigh and shin length
    a = math.radians(90 * x)
    hip, fz = Vector(QUAD_HIP), QUAD["feet"][2]
    knee = hip + leg * Vector((math.sin(a), -math.cos(a)))
    ankle = knee + leg * Vector((math.cos(a), math.sin(a)))
    feet = (0, ankle.x, fz + ankle.y - 0.063)  # 0.063: ankle height when kneeling
    bend = (knee - (hip + ankle) / 2).normalized()  # the knee points away from the hip-ankle line
    pole = knee + 0.8 * bend
    rest_pole = Vector((-0.6, 0.5))  # knee pole beside the foot, before the foot moves
    kick = dict(feet=feet, foot=152 + 20 * x,
                pole=(0, pole.x - rest_pole.x - feet[1], pole.y - rest_pole.y - feet[2]))
    return pose(QUAD, **{side: kick})


# --- Upper body ----------------------------------------------------------------------------------
INCLINE_EDGE = -0.62  # chair seat's front edge, the seat runs on toward -Y
INCLINE_ANKLE = (0.62, 0.10)  # on the toes
INCLINE_TOP, _ = prone(0.95, INCLINE_ANKLE, toe_deg=26)
INCLINE_BOTTOM, _ = prone(0.70, INCLINE_ANKLE, toe_deg=26)
INCLINE_HAND_Y = INCLINE_EDGE - 0.10

WALL_ANGEL_Y = 0.14  # wall face, just behind the shoulder blades


def wall_angel(x):
    """Back on the wall; arms slide from goalpost (x=0) to overhead (x=1)."""
    return pose(hip=(0, 0.02, -0.02), neck=-4, abduct=88 + 72 * x, elbow_in=-92 + 72 * x, arm=-6)


# --- Core ----------------------------------------------------------------------------------------
def crunch(x):
    """On the back, knees bent, feet flat; the shoulders curl up by `x` (0..1), hands reach to the knees."""
    return pose(supine(0), spine=28 * x, neck=8 + 12 * x, head=6 * x, arm=12 + 22 * x)


HANDS_BEHIND_HEAD = dict(abduct=140, elbow_in=-130, arm=-20)


def bicycle(side):
    """`side` knee drawn in, the other leg long; the chest turns toward the bent knee."""
    other = "L" if side == "R" else "R"
    turn = -35 if side == "R" else 35
    return pose(SUPINE_FLAT, hip=(0, -0.3, PRONE_Z - 0.95 + 0.005), spine=Matrix.Rotation(math.radians(32), 3, "X") @ Matrix.Rotation(math.radians(turn), 3, "Z"),
                neck=10, **HANDS_BEHIND_HEAD, **{side: dict(thigh=105, knee=100, foot=15),
                                                 other: dict(thigh=30, knee=5, foot=25)})


BICYCLE_PASS = pose(SUPINE_FLAT, hip=(0, -0.3, PRONE_Z - 0.95 + 0.005), spine=32, neck=10, thigh=65, knee=60, foot=20,
                    **HANDS_BEHIND_HEAD)

TAP_TOP, TAP_SHOULDER_Y = prone(0.55)
TAP_TOP = pose(TAP_TOP, spread=4)


def shoulder_tap(side):
    """High plank; the `side` hand lifts and taps the opposite shoulder."""
    tap = dict(hands=(-0.37, -0.05, 0.565), elbows=(0.3, -0.1, 0.3), hand_turn=-40)
    return pose(TAP_TOP, **{side: tap})


# --- Cardio --------------------------------------------------------------------------------------
def march(up, down):
    return pose(elbow=80, **{up: dict(thigh=55, knee=65, foot=15, arm=-25), down: dict(arm=25)})


MARCH_PASS = pose(elbow=80, thigh=10, knee=15)


def cross_crunch(knee_side):
    """Hands behind the head; `knee_side` knee rises as the opposite elbow twists down to meet it."""
    turn = 35 if knee_side == "R" else -35
    return pose(**HANDS_BEHIND_HEAD, spine=Matrix.Rotation(math.radians(30), 3, "X") @ Matrix.Rotation(math.radians(turn), 3, "Z"), neck=8,
                **{knee_side: dict(thigh=90, knee=95, foot=15)})


CROSS_STAND = pose(**HANDS_BEHIND_HEAD)


def butt_kick(up, down):
    return pose(hip=(0, 0, 0.03), elbow=90, spine=5, **{up: dict(thigh=-12, knee=135, foot=30, arm=-30), down: dict(arm=30)})


BUTT_PASS = pose(elbow=90, spine=5, thigh=0, knee=40)


EXERCISES = {
    "squat": {
        "legs": "ik", "arms": "fk", "look": (0, 0, 0.85),
        "frame_end": 135,  # 2 s down, 0.5 s hold, 1.5 s up, 0.5 s pause
        "keys": [(1, STAND), (61, SQUAT_BOTTOM), (76, SQUAT_BOTTOM), (121, STAND), (136, STAND)],
    },
    "push_up": {
        "legs": "fk", "arms": "ik", "look": (0, -0.25, 0.25), "raise": 0.7,
        "wrist": lambda s: (s * 0.30, PUSH_UP_HAND_Y, 0.035),
        "elbow_pole": lambda s: (s * 0.6, PUSH_UP_HAND_Y + 0.5, 0.6),  # elbows back, about 45 deg out
        "frame_end": 99,  # 1.5 s down, 0.3 s hold, 1 s up, 0.5 s pause
        "keys": [(1, PUSH_UP_TOP), (46, PUSH_UP_BOTTOM), (55, PUSH_UP_BOTTOM),
                 (85, PUSH_UP_TOP), (100, PUSH_UP_TOP)],
    },
    "plank": {
        "legs": "fk", "arms": "ik", "look": (0, -0.25, 0.2), "raise": 0.7,
        "wrist": lambda s: (s * 0.13, PLANK_Y - 0.24, 0.045),
        "elbow_pole": lambda s: (s * 0.2, PLANK_Y + 0.02, -1.0),  # elbows straight down under shoulders
        "frame_end": 120,  # hold; one slow breath per 4 s loop
        "keys": [(1, PLANK), (61, PLANK_INHALE), (121, PLANK)],
    },
    "neck_rolls": {
        "legs": "ik", "arms": "fk", "look": (0, 0, 1.2), "frame_above": 0.95,  # waist up
        "frame_end": 120,  # ear to shoulder, chin down, other ear, chin down: 1 s each
        "keys": [(1, pose(**neck_tilt(0, -35))), (31, pose(**neck_tilt(35, 0))),
                 (61, pose(**neck_tilt(0, 35))), (91, pose(**neck_tilt(35, 0))),
                 (121, pose(**neck_tilt(0, -35)))],
    },
    "arm_circles": {
        "legs": "ik", "arms": "fk", "look": (0, 0, 1.0),
        "frame_end": 60,  # two small forward circles, one per second
        "keys": arm_circles(),
    },
    "reverse_lunge": {
        "legs": "ik", "arms": "fk", "look": (0, 0.3, 0.8), "toe_out": 5,
        "frame_end": 140,  # right leg back, return, left leg back, return
        "keys": [(1 + f, k) for f, k in lunge("R")] + [(71 + f, k) for f, k in lunge("L")[1:]],
    },
    "chair_dip": {
        "legs": "ik", "arms": "ik", "look": (0, 0.1, 0.5), "chair": True,
        "wrist": lambda s: (s * 0.20, 0.34, 0.49),
        "elbow_pole": lambda s: (s * 0.25, 0.9, 0.8),  # elbows point straight back
        "frame_end": 99,  # 1.5 s down, 0.3 s hold, 1 s up, 0.5 s pause
        "keys": [(1, dip(0.24, 1.01)), (46, dip(0.14, 0.82)), (55, dip(0.14, 0.82)),
                 (85, dip(0.24, 1.01)), (100, dip(0.24, 1.01))],
    },
    "glute_bridge": {
        "legs": "ik", "arms": "ik", "look": (0, 0.1, 0.2), "raise": 0.7,
        # From the feet the bent legs hide the body, so these views look in from the head end.
        "views": {"front": Vector((-2.6, 2.0, 1.4)), "three_quarter": Vector((2.6, 2.0, 1.0))},
        # Straight arms on the floor, 25 deg out from the body: the wrist sits a hair beyond full reach.
        "wrist": lambda s: (s * 0.427, 0.012, 0.035),
        "hand": lambda s: (s * 0.038, -0.082, -0.005),  # palm flat, in line with the forearm
        "elbow_pole": lambda s: (s * 0.8, 0.25, 0.05),
        "frame_end": 105,  # 1 s up, 1 s hold, 1 s down, 0.5 s rest
        "keys": [(1, supine(0)), (31, supine(26)), (61, supine(26)), (91, supine(0)), (106, supine(0))],
    },
    "cat_cow": {
        "legs": "ik", "arms": "ik", "look": (0, 0, 0.4), "raise": 0.4, "toe_out": 0,
        "wrist": lambda s: (s * 0.22, QUAD_SHOULDER[0], 0.035),
        "elbow_pole": lambda s: (s * 0.25, QUAD_SHOULDER[0] + 0.5, 0.35),  # elbows point back
        "frame_end": 150,  # flat, round up (cat), flat, arch (cow): about 5 s per breath
        "keys": [(1, cat_cow(0)), (36, cat_cow(1)), (56, cat_cow(1)), (76, cat_cow(0)),
                 (111, cat_cow(-1)), (131, cat_cow(-1)), (151, cat_cow(0))],
    },
    "hip_flexor_stretch": {
        "legs": "ik", "arms": "fk", "look": (0, 0, 0.6), "toe_out": 5,
        "frame_end": 120,  # hold; ease the hips forward and back once per 4 s breath
        "keys": [(1, kneeling_stretch(0.0)), (61, kneeling_stretch(0.06)), (121, kneeling_stretch(0.0))],
    },
    "hamstring_stretch": {
        "legs": "ik", "arms": "fk", "look": (0, 0, 0.7),
        "frame_end": 120,  # hold; sink a little deeper on each 4 s breath
        "keys": [(1, fold(72, 14)), (61, fold(80, 18)), (121, fold(72, 14))],
    },
    "hip_hinge": {
        "legs": "ik", "arms": "fk", "look": (0, 0, 0.85), "toe_out": 5,
        "frame_end": 105,  # 1.5 s hips back, 0.3 s hold, 1.2 s up, 0.5 s pause
        "keys": [(1, LUNGE_STAND), (46, HIP_HINGE), (55, HIP_HINGE), (91, LUNGE_STAND), (106, LUNGE_STAND)],
    },
    "calf_raise": {
        "legs": "ik", "arms": "fk", "look": (0, 0, 0.85), "toe_out": 5,
        "frame_end": 90,  # 1 s up, 0.5 s hold, 1 s down, 0.5 s pause
        "keys": [(1, calf_raise(0)), (31, calf_raise(32)), (46, calf_raise(32)), (76, calf_raise(0)),
                 (91, calf_raise(0))],
    },
    "reverse_snow_angel": {
        "legs": "fk", "arms": "fk", "look": (0, 0, 0.15), "raise": 1.8,  # high: the arms sweep along the floor
        "frame_end": 120,  # 2 s sweep overhead, 2 s back to the sides
        "keys": [(1, snow_angel(0)), (31, snow_angel(80)), (61, snow_angel(165)), (91, snow_angel(80)),
                 (121, snow_angel(0))],
    },
    "superman": {
        "legs": "fk", "arms": "fk", "look": (0, 0, 0.15), "raise": 0.4,
        "frame_end": 105,  # 1 s up, 1 s hold, 1 s down, 0.5 s rest
        "keys": [(1, superman(0)), (31, superman(1)), (61, superman(1)), (91, superman(0)), (106, superman(0))],
    },
    "bird_dog": {
        "legs": "ik", "arms": "ik", "look": (0, 0, 0.45), "raise": 0.3, "toe_out": 0,
        "wrist": lambda s: (s * 0.22, QUAD_SHOULDER[0], 0.035),
        "elbow_pole": lambda s: (s * 0.25, QUAD_SHOULDER[0] + 0.5, 0.35),
        "frame_end": 160,  # reach right arm and left leg, hold, return; then the other pair
        "keys": [(1, QUAD), (31, bird_dog("R", "L")), (51, bird_dog("R", "L")), (81, QUAD),
                 (111, bird_dog("L", "R")), (131, bird_dog("L", "R")), (161, QUAD)],
    },
    "dead_bug": {
        "legs": "fk", "arms": "fk", "look": (0, 0, 0.3), "raise": 0.6,
        "frame_end": 120,  # lower right arm and left leg, return; then the other pair: 1 s each way
        "keys": [(1, DEAD_BUG_TOP), (31, dead_bug("R", "L")), (61, DEAD_BUG_TOP),
                 (91, dead_bug("L", "R")), (121, DEAD_BUG_TOP)],
    },
    "side_plank": {
        "legs": "fk", "arms": "ik", "look": (0, 0, 0.4), "raise": 0.3,
        # Right forearm flat on the floor, pointing at the camera; left arm straight up.
        "wrist": lambda s: (0, SIDE_PLANK_TOP[0], SIDE_PLANK_TOP[1] + 0.6) if s > 0 else (0.27, SIDE_PLANK_SHOULDER_Y, 0.04),
        "hand": lambda s: (0, 0, 0.09) if s > 0 else (0.09, 0, -0.01),
        "elbow_pole": lambda s: (0.4, SIDE_PLANK_TOP[0], 1.0) if s > 0 else (-0.6, SIDE_PLANK_SHOULDER_Y, 0.05),
        "frame_end": 120,  # hold; one slow breath per 4 s loop
        "keys": [(1, side_plank()), (61, side_plank(0.012)), (121, side_plank())],
    },
    "jumping_jacks": {
        "legs": "ik", "arms": "fk", "look": (0, 0, 0.9),
        "frame_end": 56,  # two jacks per loop, about one per second
        "keys": [(1 + f, k) for rep in (0, 28) for f, k in
                 ((rep, JACK_LAND), (rep + 7, JACK_AIR), (rep + 14, JACK_OPEN), (rep + 21, JACK_AIR))]
                + [(57, JACK_LAND)],
    },
    "high_knees": {
        "legs": "fk", "arms": "fk", "look": (0, 0, 0.9),
        "frame_end": 40,  # one step per 1/3 s
        "keys": [(1, high_knee("L", "R")), (11, KNEES_PASS), (21, high_knee("R", "L")),
                 (31, KNEES_PASS), (41, high_knee("L", "R"))],
    },
    "mountain_climbers": {
        "legs": "ik", "arms": "ik", "toe_out": 0, "look": (0, -0.25, 0.3), "raise": 0.6,
        "wrist": lambda s: (s * 0.22, CLIMB_SHOULDER_Y, 0.035),  # hands under the shoulders
        "elbow_pole": lambda s: (s * 0.3, CLIMB_SHOULDER_Y + 0.5, 0.6),
        "frame_end": 30,  # one knee drive per 0.5 s
        "keys": [(1, climb("R")), (8, climb_swap()), (16, climb("L")), (23, climb_swap()), (31, climb("R"))],
    },
    "torso_twist": {
        "legs": "ik", "arms": "fk", "look": (0, 0, 1.0),
        "frame_end": 90,  # turn left, through centre, turn right: 1.5 s each way
        "keys": [(1, torso_twist(0)), (23, torso_twist(45)), (46, torso_twist(0)), (68, torso_twist(-45)),
                 (91, torso_twist(0))],
    },
    "side_bend": {
        "legs": "ik", "arms": "fk", "look": (0, 0, 1.0),
        "frame_end": 120,  # lean left, hold, back; then right: 1 s each
        "keys": [(1, side_bend(0)), (31, side_bend(28)), (46, side_bend(28)), (61, side_bend(0)),
                 (91, side_bend(-28)), (106, side_bend(-28)), (121, side_bend(0))],
    },
    "hip_circles": {
        "legs": "ik", "arms": "fk", "look": (0, 0, 0.9), "toe_out": 5,
        "frame_end": 90,  # one slow circle per 3 s
        "keys": [(1 + 15 * i, hip_circle(60 * i)) for i in range(7)],
    },
    "childs_pose": {
        "legs": "ik", "arms": "ik", "look": (0, 0, 0.3), "raise": 0.5, "toe_out": 0,
        "wrist": lambda s: (s * 0.20, QUAD_SHOULDER[0], 0.035),
        "elbow_pole": lambda s: (s * 0.25, QUAD_SHOULDER[0] + 0.5, 0.35),
        "frame_end": 120,  # hold; sink a little on each 4 s breath
        "keys": [(1, childs_pose()), (61, childs_pose(0.02)), (121, childs_pose())],
    },
    "knee_to_chest": {
        "legs": "fk", "arms": "ik", "look": (0, 0, 0.3), "raise": 0.6,
        "wrist": lambda s: (s * 0.17, -0.19, 0.44),  # hands hold the shins just below the knees
        "elbow_pole": lambda s: (s * 0.7, 0.1, 0.3),  # elbows out to the sides
        "views": {"front": Vector((-2.6, 2.0, 1.4)), "three_quarter": Vector((2.6, 2.0, 1.0))},  # from the head end
        "frame_end": 120,  # hold; draw the knees in a little on each 4 s breath
        "keys": [(1, knees_to_chest(0)), (61, knees_to_chest(1)), (121, knees_to_chest(0))],
    },
    "wall_sit": {
        "legs": "ik", "arms": "fk", "look": (0, 0, 0.6), "wall": WALL_Y,
        "frame_end": 120,  # hold; one slow breath per 4 s loop
        "keys": [(1, WALL_SIT), (61, WALL_SIT_INHALE), (121, WALL_SIT)],
    },
    "sumo_squat": {
        "legs": "ik", "arms": "fk", "look": (0, 0, 0.85), "toe_out": 40,
        "frame_end": 120,  # 1.5 s down, 0.5 s hold, 1.5 s up, 0.5 s pause
        "keys": [(1, SUMO_STAND), (46, SUMO_BOTTOM), (61, SUMO_BOTTOM), (106, SUMO_STAND), (121, SUMO_STAND)],
    },
    "step_up": {
        "legs": "ik", "arms": "fk", "look": (0, -0.2, 0.9), "toe_out": 5, "stairs": STAIR_EDGE,
        "frame_end": 160,  # right foot leads, then left: 80 frames each
        "keys": [(1 + f, k) for f, k in step_up("R")] + [(81 + f, k) for f, k in step_up("L")[1:]],
    },
    "side_lunge": {
        "legs": "ik", "arms": "fk", "look": (0, 0, 0.7), "toe_out": 10,
        "frame_end": 140,  # right side, return, left side, return
        "keys": [(1 + f, k) for f, k in side_lunge("R")] + [(71 + f, k) for f, k in side_lunge("L")[1:]],
    },
    "donkey_kick": {
        "legs": "ik", "arms": "ik", "look": (0, 0, 0.45), "raise": 0.3, "toe_out": 0,
        "wrist": lambda s: (s * 0.22, QUAD_SHOULDER[0], 0.035),
        "elbow_pole": lambda s: (s * 0.25, QUAD_SHOULDER[0] + 0.5, 0.35),
        "frame_end": 120,  # right leg up and down, then left: 1 s up, 0.3 s hold, 0.7 s down
        "keys": [(1, QUAD), (16, donkey_kick("R", 0.5)), (31, donkey_kick("R")), (40, donkey_kick("R")),
                 (51, donkey_kick("R", 0.5)), (61, QUAD), (76, donkey_kick("L", 0.5)), (91, donkey_kick("L")),
                 (100, donkey_kick("L")), (111, donkey_kick("L", 0.5)), (121, QUAD)],
    },
    "incline_push_up": {
        "legs": "fk", "arms": "ik", "look": (0, -0.2, 0.5), "chair": {"edge": INCLINE_EDGE, "facing": -1},
        "frame_props": True,  # keep the whole chair in shot
        "wrist": lambda s: (s * 0.27, INCLINE_HAND_Y, 0.505),
        "elbow_pole": lambda s: (s * 0.6, INCLINE_HAND_Y + 0.5, 1.2),  # elbows back, about 45 deg out
        "frame_end": 90,  # 1.3 s down, 0.3 s hold, 1 s up, 0.4 s pause
        "keys": [(1, INCLINE_TOP), (40, INCLINE_BOTTOM), (49, INCLINE_BOTTOM), (79, INCLINE_TOP),
                 (91, INCLINE_TOP)],
    },
    "wall_angel": {
        "legs": "ik", "arms": "fk", "look": (0, 0, 1.1), "wall": WALL_ANGEL_Y,
        "views": {"front": Vector((0, -3.9, 0.15)), "three_quarter": Vector((2.4, -3.1, 0.35))},
        "frame_end": 120,  # 2 s up, 2 s down
        "keys": [(1, wall_angel(0)), (61, wall_angel(1)), (121, wall_angel(0))],
    },
    "crunch": {
        "legs": "ik", "arms": "fk", "look": (0, 0.1, 0.2), "raise": 0.7,
        "views": {"front": Vector((-2.6, 2.0, 1.4)), "three_quarter": Vector((2.6, 2.0, 1.0))},
        "frame_end": 75,  # 1 s up, 0.3 s hold, 1 s down, 0.2 s rest
        "keys": [(1, crunch(0)), (31, crunch(1)), (40, crunch(1)), (70, crunch(0)), (76, crunch(0))],
    },
    "bicycle_crunch": {
        "legs": "fk", "arms": "fk", "look": (0, 0, 0.3), "raise": 0.7,
        "frame_end": 60,  # one elbow-to-knee per second
        "keys": [(1, bicycle("R")), (16, BICYCLE_PASS), (31, bicycle("L")), (46, BICYCLE_PASS), (61, bicycle("R"))],
    },
    "plank_shoulder_tap": {
        "legs": "fk", "arms": "ik", "look": (0, -0.25, 0.3), "raise": 0.6,
        "wrist": lambda s: (s * 0.22, TAP_SHOULDER_Y, 0.035),
        "elbow_pole": lambda s: (s * 0.3, TAP_SHOULDER_Y + 0.5, 0.6),
        "frame_end": 60,  # right hand taps, back down, left hand taps: 1 s each
        "keys": [(1, TAP_TOP), (11, shoulder_tap("R")), (21, TAP_TOP), (31, TAP_TOP), (41, shoulder_tap("L")),
                 (51, TAP_TOP), (61, TAP_TOP)],
    },
    "march_in_place": {
        "legs": "fk", "arms": "fk", "look": (0, 0, 0.9),
        "frame_end": 30,  # two steps per second
        "keys": [(1, march("L", "R")), (8, MARCH_PASS), (16, march("R", "L")), (23, MARCH_PASS),
                 (31, march("L", "R"))],
    },
    "standing_cross_crunch": {
        "legs": "fk", "arms": "fk", "look": (0, 0, 1.0),
        "frame_end": 60,  # right knee to left elbow, back, then the other side: 0.5 s each
        "keys": [(1, CROSS_STAND), (16, cross_crunch("R")), (31, CROSS_STAND), (46, cross_crunch("L")),
                 (61, CROSS_STAND)],
    },
    "butt_kicks": {
        "legs": "fk", "arms": "fk", "look": (0, 0, 0.9),
        "frame_end": 40,  # one kick per 1/3 s
        "keys": [(1, butt_kick("L", "R")), (11, BUTT_PASS), (21, butt_kick("R", "L")), (31, BUTT_PASS),
                 (41, butt_kick("L", "R"))],
    },
}

# Camera direction from the exercise's look-at point, raised by its "raise"; fit_camera sets the distance.
VIEWS = {
    "front": Vector((0, -3.9, 0.15)),
    "side": Vector((3.9, 0, 0.15)),
    "three_quarter": Vector((2.8, -2.8, 0.35)),
}


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("exercise", choices=sorted(EXERCISES))
    p.add_argument("--view", default="side", choices=sorted(VIEWS))
    p.add_argument("--frames", default="")
    p.add_argument("--out", default=os.environ.get("OUTPUT_DIR", "./out"))
    p.add_argument("--check", action="store_true")
    return p.parse_args(argv)


def build_armature(ex):
    arm_data = bpy.data.armatures.new("rig")
    arm = bpy.data.objects.new("rig", arm_data)
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    for name, (head, tail, parent) in build_bones(ex).items():
        eb = arm_data.edit_bones.new(name)
        eb.head, eb.tail = head, tail
        eb.roll = 0
        if parent:
            eb.parent = arm_data.edit_bones[parent]
            eb.use_connect = False
        eb.use_deform = not is_control(name)
    bpy.ops.object.mode_set(mode="POSE")
    chains = []
    if ex["legs"] == "ik":
        chains.append(("shin", "foot_ik", "knee_pole", -90))
    if ex["arms"] == "ik":
        chains.append(("forearm", "hand_ik", "elbow_pole", None))
    for side in "LR":
        for bone, target, pole, pole_angle in chains:
            ik = arm.pose.bones[f"{bone}.{side}"].constraints.new("IK")
            ik.target, ik.subtarget = arm, f"{target}.{side}"
            ik.pole_target, ik.pole_subtarget = arm, f"{pole}.{side}"
            if pole_angle is None:  # mirrored arms get opposite bone roll
                pole_angle = 0 if side == "L" else 180
            ik.pole_angle = math.radians(pole_angle)
            ik.chain_count = 2
    for pb in arm.pose.bones:
        pb.rotation_mode = "QUATERNION"
    bpy.ops.object.mode_set(mode="OBJECT")
    return arm


def ellipsoid(name, rx, rz, half_len, centre, material):
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=16, radius=1.0)
    bmesh.ops.transform(bm, verts=bm.verts, matrix=Matrix.Translation((0, centre, 0))
                        @ Matrix.Diagonal((rx, half_len, rz, 1)))
    for f in bm.faces:
        f.smooth = True
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(material)
    return bpy.data.objects.new(name, mesh)


def attach(obj, arm, bone_name):
    bpy.context.scene.collection.objects.link(obj)
    bone = arm.data.bones[bone_name]
    obj.parent = arm
    obj.parent_type = "BONE"
    obj.parent_bone = bone_name
    # Bone parenting places the child at the bone tail; shift back so mesh space == bone space.
    obj.matrix_parent_inverse = Matrix.Translation((0, -bone.length, 0))


def build_mannequin(arm):
    body = bpy.data.materials.new("mannequin")
    body.diffuse_color = (0.78, 0.74, 0.70, 1)
    bsdf = body.node_tree.nodes.get("Principled BSDF") if body.node_tree else None
    if bsdf is None:
        body.use_nodes = True
        bsdf = body.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (0.78, 0.74, 0.70, 1)
    bsdf.inputs["Roughness"].default_value = 0.45
    joint = body.copy()
    joint.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.30, 0.32, 0.36, 1)

    for bone_name, (rx, rz, extra, centre) in SHAPES.items():
        length = arm.data.bones[bone_name].length
        obj = ellipsoid(f"m_{bone_name}", rx, rz, length / 2 + extra, length * centre, body)
        attach(obj, arm, bone_name)
    for bone_name, r in JOINTS.items():
        attach(ellipsoid(f"j_{bone_name}", r, r, r, 0, joint), arm, bone_name)


def rest_rot(arm, bone_name):
    return arm.data.bones[bone_name].matrix_local.to_3x3()


def local_rot(arm, bone_name, world_rot):
    b = rest_rot(arm, bone_name)
    return (b.inverted() @ world_rot @ b).to_quaternion()


def rx(deg):
    return Matrix.Rotation(math.radians(deg), 3, "X")


def rot(value):
    """A number tilts about X; an (x, y, z) tuple is an XYZ Euler; a Matrix is used as is. Degrees, world axes."""
    if isinstance(value, (int, float)):
        return rx(value)
    if isinstance(value, Matrix):
        return value
    return Euler([math.radians(a) for a in value], "XYZ").to_matrix()


def key_pose(arm, ex, frame, pose):
    """Key every animated channel, so values never leak from a neighbouring key."""
    pb = arm.pose.bones

    def key(name, prop, value):
        setattr(pb[name], prop, value)
        pb[name].keyframe_insert(prop, frame=frame)

    def turn(name, world_rot):
        key(name, "rotation_quaternion", local_rot(arm, name, world_rot))

    key("pelvis", "location", rest_rot(arm, "pelvis").inverted() @ Vector(pose["hip"]))
    for name in ("pelvis", "spine", "neck", "head"):
        turn(name, rot(pose[name]))
    for side, s in (("L", 1), ("R", -1)):
        get = lambda k, default=0: pose.get(side, {}).get(k, pose.get(k, default))  # pose["L"] overrides
        turn(f"foot.{side}", rx(get("foot")))
        if ex["legs"] == "ik":
            out, y, z = get("feet", (0, 0, 0))  # foot offset; out is away from the midline
            key(f"foot_ik.{side}", "location",
                rest_rot(arm, f"foot_ik.{side}").inverted() @ Vector((s * out, y, z)))
            out, y, z = get("pole", (0, 0, 0))  # knee pole offset from its place beside the foot
            key(f"knee_pole.{side}", "location",
                rest_rot(arm, f"knee_pole.{side}").inverted() @ Vector((s * out, y, z)))
        else:
            spread = Matrix.Rotation(math.radians(-s * get("spread")), 3, "Y")  # leg out to the side
            turn(f"thigh.{side}", spread @ rx(-get("thigh")))
            turn(f"shin.{side}", rx(get("knee")))
        if ex["arms"] == "fk":
            abduct = Matrix.Rotation(math.radians(-s * get("abduct")), 3, "Y")  # raise out to the side
            turn(f"upper_arm.{side}", abduct @ rx(-get("arm")))
            elbow_in = Matrix.Rotation(math.radians(s * get("elbow_in")), 3, "Y")  # bend toward the body
            turn(f"forearm.{side}", elbow_in @ rx(-get("elbow")))
        else:
            out, y, z = get("hands", (0, 0, 0))  # hand offset from its "wrist" place
            key(f"hand_ik.{side}", "location",
                rest_rot(arm, f"hand_ik.{side}").inverted() @ Vector((s * out, y, z)))
            turn(f"hand_ik.{side}", rx(get("hand_turn")))  # positive tips the fingers down
            out, y, z = get("elbows", (0, 0, 0))  # elbow pole offset from its "elbow_pole" place
            key(f"elbow_pole.{side}", "location",
                rest_rot(arm, f"elbow_pole.{side}").inverted() @ Vector((s * out, y, z)))


PROPS = ("floor", "chair", "wall", "stair")  # scenery, left out of camera framing and floor checks


def build_boxes(name, parts, color):
    """Axis-aligned boxes, each given as (centre, half-size)."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*color, 1)
    for i, (centre, half) in enumerate(parts):
        mesh = bpy.data.meshes.new(f"{name}{i}")
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=2.0)
        bmesh.ops.transform(bm, verts=bm.verts, matrix=Matrix.Translation(centre) @ Matrix.Diagonal((*half, 1)))
        bm.to_mesh(mesh)
        bm.free()
        mesh.materials.append(mat)
        bpy.context.scene.collection.objects.link(bpy.data.objects.new(f"{name}{i}", mesh))


def build_chair(edge=0.30, facing=1):
    """Plain chair, seat top at 0.47. The seat's front edge is at y=`edge` and the seat runs
    toward +Y (facing=1, behind a mannequin that faces -Y) or toward -Y (facing=-1, in front of it)."""
    parts = [((0, 0.50, 0.45), (0.25, 0.20, 0.02)), ((0, 0.69, 0.70), (0.25, 0.015, 0.22))]
    parts += [((x, y, 0.22), (0.02, 0.02, 0.22)) for x in (-0.23, 0.23) for y in (0.32, 0.68)]
    build_boxes("chair", [((cx, edge + facing * (cy - 0.30), cz), half) for (cx, cy, cz), half in parts],
                (0.45, 0.33, 0.22))


def build_wall(y):
    """Wall behind the mannequin; its face is at y=`y`."""
    build_boxes("wall", [((0, y + 0.05, 1.2), (1.5, 0.05, 1.2))], (0.80, 0.78, 0.74))


def build_stairs(edge, rise=STEP_RISE, run=STEP_RUN, steps=3):
    """Stairs in front of the mannequin, climbing toward -Y; the first step's nosing is at y=`edge`."""
    far = edge - steps * run - 0.2
    parts = []
    for i in range(steps):
        near = edge - i * run
        parts.append(((0, (near + far) / 2, (i + 1) * rise / 2), (0.55, (near - far) / 2, (i + 1) * rise / 2)))
    build_boxes("stair", parts, (0.62, 0.52, 0.42))


def build_stage(view, ex):
    scene = bpy.context.scene
    floor = bpy.data.meshes.new("floor")
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=100)  # edge sits at the horizon
    bm.to_mesh(floor)
    bm.free()
    floor_mat = bpy.data.materials.new("floor")
    floor_mat.use_nodes = True
    floor_mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.92, 0.92, 0.93, 1)
    floor.materials.append(floor_mat)
    scene.collection.objects.link(bpy.data.objects.new("floor", floor))

    if ex.get("chair"):
        build_chair(**(ex["chair"] if isinstance(ex["chair"], dict) else {}))
    if "wall" in ex:
        build_wall(ex["wall"])
    if "stairs" in ex:
        build_stairs(ex["stairs"])

    world = bpy.data.worlds.new("world")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.9, 0.91, 0.93, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.8
    scene.world = world

    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 3.0
    sun.data.angle = math.radians(8)
    sun.rotation_euler = (math.radians(40), 0, math.radians(30))
    scene.collection.objects.link(sun)

    target = Vector(ex["look"])
    loc = target + ex.get("views", {}).get(view, VIEWS[view]) + Vector((0, 0, ex.get("raise", 0)))
    cam = bpy.data.objects.new("camera", bpy.data.cameras.new("camera"))
    cam.data.lens = 50
    cam.location = loc
    cam.rotation_euler = (target - loc).to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(cam)
    scene.camera = cam

    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = scene.render.resolution_y = 800
    scene.render.fps = 30
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.view_transform = "Standard"


def fit_camera(cam, frame_end, fill=0.84, step=5, above=-1.0, skip=PROPS):
    """Keep the camera's view direction; move and dolly it so the body over the whole loop
    is centred and its larger projected side fills `fill` of the square frame.
    Only body points higher than `above` are framed, so a close-up can crop the legs."""
    scene = bpy.context.scene
    pts = []
    for f in range(1, frame_end + 1, step):
        scene.frame_set(f)
        depsgraph = bpy.context.evaluated_depsgraph_get()
        pts += [o.matrix_world @ v.co for o in scene.objects if o.type == "MESH" and not o.name.startswith(skip)
                for v in o.evaluated_get(depsgraph).data.vertices]
    pts = [p for p in pts if p.z > above]
    scene.frame_set(1)
    rot = cam.matrix_world.to_quaternion()
    back, right, up = rot @ Vector((0, 0, 1)), rot @ Vector((1, 0, 0)), rot @ Vector((0, 1, 0))
    target = sum(pts, Vector()) / len(pts)
    dist = (cam.location - target).length
    for _ in range(6):  # perspective makes it non-linear; a few passes converge
        cam.location = target + back * dist
        bpy.context.view_layer.update()
        ndc = [world_to_camera_view(scene, cam, p) for p in pts]
        xs, ys = [c.x for c in ndc], [c.y for c in ndc]
        width = 2 * dist * math.tan(cam.data.angle / 2)  # frame width at the target's depth
        target += right * ((min(xs) + max(xs)) / 2 - 0.5) * width + up * ((min(ys) + max(ys)) / 2 - 0.5) * width
        dist *= max(max(xs) - min(xs), max(ys) - min(ys)) / fill
    cam.location = target + back * dist


def report(arm, keys):
    """Print joint positions per key pose, plus the lowest body point (below 0 = through the floor)."""
    scene = bpy.context.scene
    depsgraph = bpy.context.evaluated_depsgraph_get()
    fmt = lambda v: "(" + ", ".join(f"{c:.3f}" for c in v) + ")"
    for frame, _ in keys:
        scene.frame_set(frame)
        pb = arm.pose.bones
        m = arm.matrix_world
        p = {n: m @ pb[n].head for n in ("thigh.L", "shin.L", "upper_arm.L", "forearm.L")}
        ankle, wrist = m @ pb["shin.L"].tail, m @ pb["forearm.L"].tail
        thigh = p["shin.L"] - p["thigh.L"]
        thigh_deg = math.degrees(math.atan2(-thigh.z, math.hypot(thigh.x, thigh.y)))
        low, low_obj = min(((o.matrix_world @ v.co).z, o.name) for o in scene.objects
                           if o.type == "MESH" and not o.name.startswith(PROPS)
                           for v in o.evaluated_get(depsgraph).data.vertices)
        print(f"CHECK f{frame:>3} hip={fmt(p['thigh.L'])} knee={fmt(p['shin.L'])} ankle={fmt(ankle)} "
              f"shoulder={fmt(p['upper_arm.L'])} elbow={fmt(p['forearm.L'])} wrist={fmt(wrist)} "
              f"thigh_below_horizontal={thigh_deg:.1f}deg lowest={low:.3f} ({low_obj})")


def main():
    args = parse_args()
    ex = EXERCISES[args.exercise]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    arm = build_armature(ex)
    build_mannequin(arm)
    for frame, pose in ex["keys"]:
        key_pose(arm, ex, frame, pose)
    build_stage(args.view, ex)
    scene = bpy.context.scene
    scene.frame_start, scene.frame_end = 1, ex["frame_end"]

    fit_camera(scene.camera, ex["frame_end"], above=ex.get("frame_above", -1.0),
               skip=("floor", "wall") if ex.get("frame_props") else PROPS)

    if args.check:
        report(arm, ex["keys"])
        return
    out = os.path.abspath(os.path.join(args.out, args.exercise, args.view))
    os.makedirs(out, exist_ok=True)
    if args.frames:
        for f in (int(x) for x in args.frames.split(",")):
            scene.frame_set(f)
            scene.render.filepath = os.path.join(out, f"still_{f:04d}.png")
            bpy.ops.render.render(write_still=True)
    else:
        scene.render.filepath = os.path.join(out, "frame_")
        bpy.ops.render.render(animation=True)
        encode(out, scene.render.fps)
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import gallery
        gallery.build(args.out)


def encode(out, fps):
    """Frames -> looping H.264 MP4 + poster (first frame)."""
    frames = os.path.join(out, "frame_%04d.png")
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-framerate", str(fps), "-i", frames,
                    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-movflags", "+faststart",
                    os.path.join(out, "loop.mp4")], check=True)
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", os.path.join(out, "frame_0001.png"),
                    "-q:v", "3", os.path.join(out, "poster.jpg")], check=True)
    print(f"ENCODED {out}/loop.mp4")


main()
