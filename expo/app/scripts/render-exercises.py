"""Combine the Mixamo exercise FBXes into one master .blend and render demos.

Run inside Blender (e.g., via the Blender MCP execute_blender_code, or
`blender --background --python scripts/render-exercises.py`).

Inputs:  app/assets/blender/animations/{squat,pushup,plank,jumping_jacks,high_knees}.fbx
Outputs:
  app/assets/blender/xbot_exercises.blend         (master file, all 5 actions)
  app/assets/exercise-renders/<exercise>.mp4      (MP4 per exercise; default)
  app/assets/exercise-renders/<exercise>/frame-NN.png  (only if RENDER_PNG_FRAMES)
"""

import os
from math import acos, atan2, cos, degrees, radians, sin

import bpy
import mathutils

ROOT = "/media/lion/Data/Projects/GymAI/expo/app"
ANIMATIONS_DIR = f"{ROOT}/assets/blender/animations"
MASTER_BLEND = f"{ROOT}/assets/blender/xbot_exercises.blend"
RENDER_OUT_DIR = f"{ROOT}/assets/exercise-renders"

EXERCISES = [
    ("squat", "squat.fbx"),
    ("pushup", "pushup.fbx"),
    ("plank", "plank.fbx"),
    ("jumping_jacks", "jumping_jacks.fbx"),
    ("high_knees", "high_knees.fbx"),
]

RENDER_VIDEO = True
RENDER_PNG_FRAMES = False
NUM_FRAMES = 6  # only used when RENDER_PNG_FRAMES
RES_X = 800
RES_Y = 800
FPS = 30

HIGH_KNEES_TARGET_PEAK_DEG = 100.0
HIGH_KNEES_FRAME_END = 100  # the FBX bake speeds up dramatically past this; clip to keep cadence consistent
HIGH_KNEES_RENDER_FPS = 15  # render high_knees at this FPS (others use FPS=30) — halves playback speed cleanly
HIGH_KNEES_LEG_BONES = [
    ("mixamorig:LeftUpLeg", "mixamorig:LeftLeg"),
    ("mixamorig:RightUpLeg", "mixamorig:RightLeg"),
]
HIGH_KNEES_TORSO_BONES_TO_FREEZE = [
    "mixamorig:Hips",
    "mixamorig:Spine",
    "mixamorig:Spine1",
    "mixamorig:Spine2",
]  # rotation FCurves on these are dropped — kills body sway + forward lean while leaving Hips translation alone


def wipe_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for col_name in ("meshes", "armatures", "materials", "images", "actions", "cameras", "lights"):
        col = getattr(bpy.data, col_name)
        for block in list(col):
            if block.users == 0:
                col.remove(block)


def import_fbx_collect_action(fbx_path, target_action_name):
    """Import an FBX, return (new_objects, new_action). The action is renamed."""
    pre_objs = {o.name for o in bpy.data.objects}
    pre_acts = {a.name for a in bpy.data.actions}
    bpy.ops.import_scene.fbx(filepath=fbx_path, automatic_bone_orientation=True)
    new_objs = [o for o in bpy.data.objects if o.name not in pre_objs]
    new_acts = [a for a in bpy.data.actions if a.name not in pre_acts]
    action = new_acts[0] if new_acts else None
    if action is not None:
        action.name = target_action_name
        action.use_fake_user = True
    return new_objs, action


def setup_lighting_and_camera():
    def add_light(name, kind, loc, energy, rot=(0, 0, 0), size=2.0):
        ld = bpy.data.lights.new(name=name, type=kind)
        ld.energy = energy
        if kind == "AREA":
            ld.size = size
        o = bpy.data.objects.new(name, ld)
        o.location = loc
        o.rotation_euler = rot
        bpy.context.collection.objects.link(o)

    add_light("Key", "AREA", (3.0, -3.5, 2.5), 800, rot=(radians(60), 0, radians(40)), size=2.5)
    add_light("Fill", "AREA", (-2.5, -2.5, 1.8), 250, rot=(radians(70), 0, radians(-35)), size=3.0)
    add_light("Rim", "AREA", (0.0, 3.5, 2.8), 400, rot=(radians(110), 0, radians(180)), size=2.0)

    cam_data = bpy.data.cameras.new("HumanCam")
    cam_data.lens = 50
    cam = bpy.data.objects.new("HumanCam", cam_data)
    cam.location = (3.2, -3.2, 1.05)
    cam.rotation_euler = (radians(80), 0, radians(45))
    bpy.context.collection.objects.link(cam)
    bpy.context.scene.camera = cam

    focus = bpy.data.objects.new("HumanFocus", None)
    focus.location = (0.0, 0.0, 0.95)
    bpy.context.collection.objects.link(focus)
    con = cam.constraints.new(type="TRACK_TO")
    con.target = focus
    con.track_axis = "TRACK_NEGATIVE_Z"
    con.up_axis = "UP_Y"


def setup_render_settings():
    scene = bpy.context.scene
    # Prefer Eevee Next (Blender 4.2+); fall back to classic Eevee then Workbench
    for engine in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE", "BLENDER_WORKBENCH"):
        try:
            scene.render.engine = engine
            break
        except TypeError:
            continue

    scene.render.resolution_x = RES_X
    scene.render.resolution_y = RES_Y
    scene.render.fps = FPS

    # Soft mid-gray BG so the figure reads against the app's dark and light themes.
    # Videos compress better with a solid background than transparent.
    scene.render.film_transparent = False
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.94, 0.94, 0.95, 1.0)
    bg.inputs["Strength"].default_value = 1.0


def configure_png_output():
    s = bpy.context.scene
    s.render.image_settings.file_format = "PNG"
    s.render.image_settings.color_mode = "RGBA"


def configure_mp4_output():
    s = bpy.context.scene
    s.render.image_settings.file_format = "FFMPEG"
    s.render.image_settings.color_mode = "RGB"
    s.render.ffmpeg.format = "MPEG4"
    s.render.ffmpeg.codec = "H264"
    s.render.ffmpeg.constant_rate_factor = "MEDIUM"  # decent quality, modest size
    s.render.ffmpeg.ffmpeg_preset = "GOOD"
    s.render.ffmpeg.audio_codec = "NONE"


def apply_high_knees_vertical_fix(master_arm, action):
    """Amplify thigh swing and lock calves to vertical for the high_knees action.

    Mixamo "treadmill running" gives shallow knees (~50° peak) with gait-swinging
    shins. The stylized high-knees demo wants knees at hip level with shins as
    vertical pistons; this re-keyframes both legs across the full action range
    to do that. Per-side amp factor corrects the L/R asymmetry in the original bake.
    """
    if not master_arm.animation_data:
        master_arm.animation_data_create()
    master_arm.animation_data.action = action

    for fc in action.fcurves:
        while len(fc.keyframe_points) > 0 and fc.keyframe_points[-1].co.x > HIGH_KNEES_FRAME_END:
            fc.keyframe_points.remove(fc.keyframe_points[-1])
        fc.update()

    torso_dp_prefixes = tuple(
        f'pose.bones["{b}"].rotation_quaternion' for b in HIGH_KNEES_TORSO_BONES_TO_FREEZE
    )
    for fc in list(action.fcurves):
        if fc.data_path.startswith(torso_dp_prefixes):
            action.fcurves.remove(fc)

    f_start = int(action.frame_range[0])
    f_end = int(action.frame_range[1])
    frames = range(f_start, f_end + 1)

    M_arm = master_arm.matrix_world
    DOWN = mathutils.Vector((0, 0, -1))

    peak = {}
    for thigh_name, _ in HIGH_KNEES_LEG_BONES:
        max_deg = 0.0
        for f in frames:
            bpy.context.scene.frame_set(f)
            bpy.context.view_layer.update()
            arm_e = master_arm.evaluated_get(bpy.context.evaluated_depsgraph_get())
            pb = arm_e.pose.bones[thigh_name]
            d = (M_arm @ pb.tail - M_arm @ pb.head).normalized()
            cos_a = max(-1.0, min(1.0, d.dot(DOWN)))
            ang = degrees(acos(cos_a))
            if ang > max_deg:
                max_deg = ang
        peak[thigh_name] = max_deg

    amp = {}
    for thigh_name, _ in HIGH_KNEES_LEG_BONES:
        a = HIGH_KNEES_TARGET_PEAK_DEG / peak[thigh_name] if peak[thigh_name] > 1e-6 else 1.0
        amp[thigh_name] = max(1.0, min(4.0, a))

    print(f"[hk_fix] peak_before_deg: {peak}")
    print(f"[hk_fix] amp: {amp}")

    for thigh_name, _ in HIGH_KNEES_LEG_BONES:
        pb_thigh = master_arm.pose.bones[thigh_name]
        scale = amp[thigh_name]
        for f in frames:
            bpy.context.scene.frame_set(f)
            bpy.context.view_layer.update()
            q = pb_thigh.rotation_quaternion.copy()
            if q.w < 0:
                q = -q
            twist_norm = (q.w * q.w + q.x * q.x) ** 0.5
            if twist_norm < 1e-9:
                continue
            tw_w = q.w / twist_norm
            tw_x = q.x / twist_norm
            half_theta = atan2(tw_x, tw_w)
            new_half = half_theta * scale
            q_new = mathutils.Quaternion((cos(new_half), sin(new_half), 0.0, 0.0))
            q_new.normalize()
            pb_thigh.rotation_quaternion = q_new
            pb_thigh.keyframe_insert("rotation_quaternion", frame=f)

    for thigh_name, calf_name in HIGH_KNEES_LEG_BONES:
        thigh_bone = master_arm.data.bones[thigh_name]
        calf_bone = master_arm.data.bones[calf_name]
        R_thigh_rest_arm = thigh_bone.matrix_local.to_3x3()
        R_calf_rest_arm = calf_bone.matrix_local.to_3x3()
        R_rest_relative = R_thigh_rest_arm.inverted() @ R_calf_rest_arm
        pb_calf = master_arm.pose.bones[calf_name]
        for f in frames:
            bpy.context.scene.frame_set(f)
            bpy.context.view_layer.update()
            arm_e = master_arm.evaluated_get(bpy.context.evaluated_depsgraph_get())
            R_thigh_pose_arm = arm_e.pose.bones[thigh_name].matrix.to_3x3()
            R_basis_calf = (R_thigh_pose_arm @ R_rest_relative).inverted() @ R_calf_rest_arm
            q = R_basis_calf.to_quaternion()
            q.normalize()
            pb_calf.rotation_quaternion = q
            pb_calf.keyframe_insert("rotation_quaternion", frame=f)

    print(f"[hk_fix] applied across frames {f_start}..{f_end}")


def build_master():
    wipe_scene()

    # Import first FBX as the canonical X Bot
    first_name, first_fbx = EXERCISES[0]
    _, _ = import_fbx_collect_action(os.path.join(ANIMATIONS_DIR, first_fbx), first_name)

    master_arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    master_arm.name = "XBot"

    # Import the rest, keep their actions, drop the duplicate armatures/meshes
    for ex_name, fbx_name in EXERCISES[1:]:
        new_objs, _ = import_fbx_collect_action(os.path.join(ANIMATIONS_DIR, fbx_name), ex_name)
        for o in new_objs:
            bpy.data.objects.remove(o, do_unlink=True)
        for col_name in ("meshes", "armatures", "materials", "images"):
            col = getattr(bpy.data, col_name)
            for block in list(col):
                if block.users == 0:
                    col.remove(block)

    hk_action = bpy.data.actions.get("high_knees")
    if hk_action is not None:
        apply_high_knees_vertical_fix(master_arm, hk_action)

    setup_lighting_and_camera()
    setup_render_settings()

    os.makedirs(os.path.dirname(MASTER_BLEND), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=MASTER_BLEND)
    print(f"[master] saved {MASTER_BLEND}")
    print(f"[master] actions: {sorted(a.name for a in bpy.data.actions)}")
    return master_arm


def assign_action(master_arm, action):
    if not master_arm.animation_data:
        master_arm.animation_data_create()
    master_arm.animation_data.action = action


def render_video(master_arm, ex_name, action):
    scene = bpy.context.scene
    assign_action(master_arm, action)
    scene.frame_start = int(action.frame_range[0])
    scene.frame_end = int(action.frame_range[1])
    scene.render.fps = HIGH_KNEES_RENDER_FPS if ex_name == "high_knees" else FPS

    configure_mp4_output()
    out_path = os.path.join(RENDER_OUT_DIR, f"{ex_name}.mp4")
    # Blender appends frame numbers if filepath has no extension. Setting
    # filepath to the full .mp4 path makes ffmpeg muxer write a single file.
    scene.render.filepath = out_path
    bpy.ops.render.render(animation=True)
    print(f"[video] {ex_name} ({scene.frame_start}-{scene.frame_end}, {scene.render.fps}fps) -> {out_path}")


def render_png_frames(master_arm, ex_name, action):
    scene = bpy.context.scene
    assign_action(master_arm, action)
    f_start = int(action.frame_range[0])
    f_end = int(action.frame_range[1])
    scene.frame_start = f_start
    scene.frame_end = f_end

    if NUM_FRAMES <= 1:
        frames = [(f_start + f_end) // 2]
    else:
        frames = [
            f_start + round((f_end - f_start) * i / (NUM_FRAMES - 1))
            for i in range(NUM_FRAMES)
        ]

    configure_png_output()
    out_dir = os.path.join(RENDER_OUT_DIR, ex_name)
    os.makedirs(out_dir, exist_ok=True)
    for i, f in enumerate(frames):
        scene.frame_set(f)
        scene.render.filepath = os.path.join(out_dir, f"frame-{i:02d}.png")
        bpy.ops.render.render(write_still=True)
        print(f"[png]   {ex_name} f{f} -> {scene.render.filepath}")


def render_all(master_arm):
    os.makedirs(RENDER_OUT_DIR, exist_ok=True)
    for ex_name, _ in EXERCISES:
        action = bpy.data.actions.get(ex_name)
        if action is None:
            print(f"[render] WARN: no action {ex_name}")
            continue
        if RENDER_VIDEO:
            render_video(master_arm, ex_name, action)
        if RENDER_PNG_FRAMES:
            render_png_frames(master_arm, ex_name, action)


if __name__ == "__main__":
    arm = build_master()
    render_all(arm)
    print("Done.")
