"""Render an exercise loop with a procedural mannequin.

Usage:
  blender -b -P pipelines/blender/render.py -- <squat|push_up|plank> [--view front|side|three_quarter]
          [--frames 1,61] [--out ./out] [--check]

--frames renders only those frames as PNG (for review); without it the whole loop is rendered.
--check prints joint positions at each key pose instead of rendering.
"""

import argparse
import math
import os
import subprocess
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

# Character faces -Y. Units are metres.
STANCE_X = 0.17  # ankle half-width, about shoulder width
TOE_OUT = math.radians(15)
ANKLE_TO_HIP, HIP_TO_SHOULDER = 0.87, 0.45  # rest lengths along the body
FOOT_REST_DEG = math.degrees(math.atan2(0.06, 0.17 * math.cos(TOE_OUT)))  # foot slope below horizontal


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
        toe = Vector((s * STANCE_X, 0, 0.02)) + 0.17 * Vector((s * math.sin(TOE_OUT), -math.cos(TOE_OUT), 0))
        if ex["legs"] == "ik":  # feet planted on the floor, knees solved
            bones[f"foot.{side}"] = ((s * STANCE_X, 0, 0.08), tuple(toe), "root")
            bones[f"foot_ik.{side}"] = ((s * STANCE_X, 0, 0.08), (s * STANCE_X, 0.1, 0.08), "root")
            pole = Vector((s * STANCE_X, 0, 0.5)) + 0.6 * Vector((s * math.sin(TOE_OUT), -math.cos(TOE_OUT), 0))
            bones[f"knee_pole.{side}"] = (tuple(pole), tuple(pole + Vector((0, -0.1, 0))), "root")
        else:  # straight legs carried by the pelvis, foot keyed
            bones[f"foot.{side}"] = ((s * STANCE_X, 0, 0.08), tuple(toe), f"shin.{side}")
        bones[f"upper_arm.{side}"] = ((s * 0.20, 0, 1.40), (s * 0.22, 0, 1.11), "spine")
        bones[f"forearm.{side}"] = ((s * 0.22, 0, 1.11), (s * 0.23, 0, 0.86), f"upper_arm.{side}")
        if ex["arms"] == "ik":  # hands planted, elbows solved
            wrist = Vector(ex["wrist"](s))
            bones[f"hand.{side}"] = (tuple(wrist), tuple(wrist + Vector((0, -0.09, -0.01))), "root")
            bones[f"hand_ik.{side}"] = (tuple(wrist), tuple(wrist + Vector((0, 0.1, 0))), "root")
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

EXERCISES = {
    "squat": {
        "legs": "ik", "arms": "fk", "look": (0, 0, 0.85), "zoom": 1.0,
        "frame_end": 135,  # 2 s down, 0.5 s hold, 1.5 s up, 0.5 s pause
        "keys": [(1, STAND), (61, SQUAT_BOTTOM), (76, SQUAT_BOTTOM), (121, STAND), (136, STAND)],
    },
    "push_up": {
        "legs": "fk", "arms": "ik", "look": (0, -0.25, 0.25), "zoom": 0.85, "raise": 0.6,
        "wrist": lambda s: (s * 0.30, PUSH_UP_HAND_Y, 0.035),
        "elbow_pole": lambda s: (s * 0.6, PUSH_UP_HAND_Y + 0.5, 0.6),  # elbows back, about 45 deg out
        "frame_end": 99,  # 1.5 s down, 0.3 s hold, 1 s up, 0.5 s pause
        "keys": [(1, PUSH_UP_TOP), (46, PUSH_UP_BOTTOM), (55, PUSH_UP_BOTTOM),
                 (85, PUSH_UP_TOP), (100, PUSH_UP_TOP)],
    },
    "plank": {
        "legs": "fk", "arms": "ik", "look": (0, -0.25, 0.2), "zoom": 0.85, "raise": 0.6,
        "wrist": lambda s: (s * 0.13, PLANK_Y - 0.24, 0.045),
        "elbow_pole": lambda s: (s * 0.2, PLANK_Y + 0.02, -1.0),  # elbows straight down under shoulders
        "frame_end": 120,  # hold; one slow breath per 4 s loop
        "keys": [(1, PLANK), (61, PLANK_INHALE), (121, PLANK)],
    },
}

# Camera offset from the exercise's look-at point, scaled by its zoom, then raised by its "raise".
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


def key_pose(arm, frame, pose):
    pb = arm.pose.bones
    rx = lambda deg: Matrix.Rotation(math.radians(deg), 3, "X")
    pb["pelvis"].location = rest_rot(arm, "pelvis").inverted() @ Vector(pose["hip"])
    pb["pelvis"].keyframe_insert("location", frame=frame)
    for name in ("pelvis", "spine", "neck", "head"):
        pb[name].rotation_quaternion = local_rot(arm, name, rx(pose[name]))
        pb[name].keyframe_insert("rotation_quaternion", frame=frame)
    for side in "LR":
        if "foot" in pose:
            pb[f"foot.{side}"].rotation_quaternion = local_rot(arm, f"foot.{side}", rx(pose["foot"]))
            pb[f"foot.{side}"].keyframe_insert("rotation_quaternion", frame=frame)
        if "arm" not in pose:
            continue
        pb[f"upper_arm.{side}"].rotation_quaternion = local_rot(arm, f"upper_arm.{side}", rx(-pose["arm"]))
        pb[f"forearm.{side}"].rotation_quaternion = local_rot(arm, f"forearm.{side}", rx(-pose["elbow"]))
        for name in (f"upper_arm.{side}", f"forearm.{side}"):
            pb[name].keyframe_insert("rotation_quaternion", frame=frame)


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
    loc = target + VIEWS[view] * ex["zoom"] + Vector((0, 0, ex.get("raise", 0)))
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
                           if o.type == "MESH" and o.name != "floor"
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
        key_pose(arm, frame, pose)
    build_stage(args.view, ex)
    scene = bpy.context.scene
    scene.frame_start, scene.frame_end = 1, ex["frame_end"]

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
