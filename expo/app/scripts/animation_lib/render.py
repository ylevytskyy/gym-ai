"""Camera/lighting setup, MP4 encoding, .blend save."""
from .cameras import CameraPreset, LightingPreset, get_camera_preset, get_lighting_preset, DEFAULT_RESOLUTION


def apply_scene_config(camera_name: str, lighting_name: str, resolution: tuple[int, int], fps: int):
    """Apply camera, lighting, resolution, and fps to the current bpy scene."""
    import bpy
    import math

    scene = bpy.context.scene
    scene.render.fps = fps
    scene.render.resolution_x = resolution[0]
    scene.render.resolution_y = resolution[1]
    scene.render.resolution_percentage = 100

    cam_preset = get_camera_preset(camera_name)
    cam = bpy.data.objects.get("AnimateCamera")
    if cam is None:
        cam_data = bpy.data.cameras.new("AnimateCamera")
        cam = bpy.data.objects.new("AnimateCamera", cam_data)
        scene.collection.objects.link(cam)
    cam.location = cam_preset.position
    cam.rotation_mode = "XYZ"
    cam.rotation_euler = (0.0, 0.0, 0.0)
    cam.data.lens = _fov_to_lens_mm(cam_preset.fov_deg, resolution[0])
    scene.camera = cam

    # Use a TRACK_TO constraint pointing at an empty at the preset target. Computing
    # the look-at Euler angles by hand is error-prone (intrinsic rotation order quirks);
    # Blender's Track To handles it correctly.
    target = bpy.data.objects.get("AnimateCameraTarget")
    if target is None:
        target = bpy.data.objects.new("AnimateCameraTarget", None)
        scene.collection.objects.link(target)
    target.location = cam_preset.target
    for c in list(cam.constraints):
        if c.name.startswith("AnimateTrack"):
            cam.constraints.remove(c)
    track = cam.constraints.new("TRACK_TO")
    track.name = "AnimateTrackTo"
    track.target = target
    track.track_axis = "TRACK_NEGATIVE_Z"
    track.up_axis = "UP_Y"

    # Clear pre-existing skill-managed lights, then create from preset.
    for obj in list(bpy.data.objects):
        if obj.name.startswith("AnimateLight_"):
            bpy.data.objects.remove(obj, do_unlink=True)
    light_preset = get_lighting_preset(lighting_name)
    for i, ls in enumerate(light_preset.lights):
        light_data = bpy.data.lights.new(f"AnimateLight_{i}_data", type=ls.kind.upper())
        light_data.energy = ls.energy
        light_data.color = ls.color
        light_obj = bpy.data.objects.new(f"AnimateLight_{i}", light_data)
        light_obj.location = ls.position
        scene.collection.objects.link(light_obj)


def _fov_to_lens_mm(fov_deg, sensor_width_px, sensor_width_mm=36.0):
    import math
    return sensor_width_mm / (2 * math.tan(math.radians(fov_deg) / 2))


def render_mp4(output_path: str):
    import bpy
    scene = bpy.context.scene
    scene.render.image_settings.file_format = "FFMPEG"
    scene.render.ffmpeg.format = "MPEG4"
    scene.render.ffmpeg.codec = "H264"
    scene.render.ffmpeg.constant_rate_factor = "MEDIUM"
    scene.render.filepath = output_path
    bpy.ops.render.render(animation=True)


def render_single_frame_png(output_path: str, frame: int):
    import bpy
    scene = bpy.context.scene
    scene.frame_set(frame)
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = output_path
    bpy.ops.render.render(write_still=True)


def save_blend(output_path: str):
    import bpy
    bpy.ops.wm.save_as_mainfile(filepath=output_path, check_existing=False, copy=True)
