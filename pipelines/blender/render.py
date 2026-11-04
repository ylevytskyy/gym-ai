"""Render an exercise loop with a procedural mannequin.

Usage:
  blender -b -P pipelines/blender/render.py -- <exercise_id> [--view front|side|three_quarter]
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
BONES = {
    # name: (head, tail, parent)
    "root": ((0, 0, 0), (0, 0.2, 0), None),
    "pelvis": ((0, 0, 0.95), (0, 0, 1.05), "root"),
    "spine": ((0, 0, 1.05), (0, 0, 1.42), "pelvis"),
    "neck": ((0, 0, 1.42), (0, 0, 1.52), "spine"),
    "head": ((0, 0, 1.52), (0, 0, 1.76), "neck"),
}
STANCE_X = 0.17  # ankle half-width, about shoulder width
TOE_OUT = math.radians(15)
for side, s in (("L", 1), ("R", -1)):
    BONES[f"thigh.{side}"] = ((s * 0.10, 0, 0.95), (s * 0.135, -0.02, 0.515), "pelvis")
    BONES[f"shin.{side}"] = ((s * 0.135, -0.02, 0.515), (s * STANCE_X, 0, 0.08), f"thigh.{side}")
    toe = Vector((s * STANCE_X, 0, 0.02)) + 0.17 * Vector((s * math.sin(TOE_OUT), -math.cos(TOE_OUT), 0))
    BONES[f"foot.{side}"] = ((s * STANCE_X, 0, 0.08), tuple(toe), "root")
    BONES[f"foot_ik.{side}"] = ((s * STANCE_X, 0, 0.08), (s * STANCE_X, 0.1, 0.08), "root")
    pole = Vector((s * STANCE_X, 0, 0.5)) + 0.6 * Vector((s * math.sin(TOE_OUT), -math.cos(TOE_OUT), 0))
    BONES[f"knee_pole.{side}"] = (tuple(pole), tuple(pole + Vector((0, -0.1, 0))), "root")
    BONES[f"upper_arm.{side}"] = ((s * 0.20, 0, 1.40), (s * 0.22, 0, 1.11), "spine")
    BONES[f"forearm.{side}"] = ((s * 0.22, 0, 1.11), (s * 0.23, 0, 0.86), f"upper_arm.{side}")
    BONES[f"hand.{side}"] = ((s * 0.23, 0, 0.86), (s * 0.23, 0, 0.77), f"forearm.{side}")

CONTROL_BONES = {"root"} | {b for b in BONES if b.startswith(("foot_ik", "knee_pole"))}

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

# Exercise = list of (frame, pose). Pose angles are degrees in the parent's frame:
# positive tilt leans the bone's top forward; positive arm flex raises the arm forward.
EXERCISES = {
    "squat": {
        "frame_end": 135,  # frame 136 == frame 1, so the clip loops
        "keys": [
            (1, dict(hip=(0, 0, 0), pelvis=0, spine=0, neck=0, head=0, arm=0, elbow=0)),
            (61, dict(hip=(0, 0.17, -0.48), pelvis=28, spine=12, neck=-18, head=-10, arm=125, elbow=0)),
            (76, dict(hip=(0, 0.17, -0.48), pelvis=28, spine=12, neck=-18, head=-10, arm=125, elbow=0)),
            (121, dict(hip=(0, 0, 0), pelvis=0, spine=0, neck=0, head=0, arm=0, elbow=0)),
            (136, dict(hip=(0, 0, 0), pelvis=0, spine=0, neck=0, head=0, arm=0, elbow=0)),
        ],
    },
}

VIEWS = {
    "front": (Vector((0, -3.9, 1.0)), Vector((0, 0, 0.85))),
    "side": (Vector((3.9, 0, 1.0)), Vector((0, 0, 0.85))),
    "three_quarter": (Vector((2.8, -2.8, 1.2)), Vector((0, 0, 0.85))),
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


def build_armature():
    arm_data = bpy.data.armatures.new("rig")
    arm = bpy.data.objects.new("rig", arm_data)
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    for name, (head, tail, parent) in BONES.items():
        eb = arm_data.edit_bones.new(name)
        eb.head, eb.tail = head, tail
        eb.roll = 0
        if parent:
            eb.parent = arm_data.edit_bones[parent]
            eb.use_connect = False
        eb.use_deform = name not in CONTROL_BONES
    bpy.ops.object.mode_set(mode="POSE")
    for side in "LR":
        ik = arm.pose.bones[f"shin.{side}"].constraints.new("IK")
        ik.target, ik.subtarget = arm, f"foot_ik.{side}"
        ik.pole_target, ik.pole_subtarget = arm, f"knee_pole.{side}"
        ik.pole_angle = math.radians(-90)
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
        pb[f"upper_arm.{side}"].rotation_quaternion = local_rot(arm, f"upper_arm.{side}", rx(-pose["arm"]))
        pb[f"forearm.{side}"].rotation_quaternion = local_rot(arm, f"forearm.{side}", rx(-pose["elbow"]))
        for name in (f"upper_arm.{side}", f"forearm.{side}"):
            pb[name].keyframe_insert("rotation_quaternion", frame=frame)


def build_stage(view):
    scene = bpy.context.scene
    floor = bpy.data.meshes.new("floor")
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=20)
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

    loc, target = VIEWS[view]
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
    scene = bpy.context.scene
    for frame, _ in keys:
        scene.frame_set(frame)
        pb = arm.pose.bones
        m = arm.matrix_world
        hip, knee = m @ pb["thigh.L"].head, m @ pb["shin.L"].head
        ankle = m @ pb["shin.L"].tail
        shoulder = m @ pb["upper_arm.L"].head
        thigh = knee - hip
        thigh_deg = math.degrees(math.atan2(-thigh.z, math.hypot(thigh.x, thigh.y)))
        print(f"CHECK f{frame:>3} hip={tuple(round(v, 3) for v in hip)} knee={tuple(round(v, 3) for v in knee)} "
              f"ankle={tuple(round(v, 3) for v in ankle)} shoulder_y={shoulder.y:.3f} "
              f"thigh_below_horizontal={thigh_deg:.1f}deg")


def main():
    args = parse_args()
    ex = EXERCISES[args.exercise]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    arm = build_armature()
    build_mannequin(arm)
    for frame, pose in ex["keys"]:
        key_pose(arm, frame, pose)
    build_stage(args.view)
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
