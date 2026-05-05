"""CLI: python animate.py <exercise> [--no-render | --keep-blend | --frame N]

Runs inside Blender background mode. Resolves the exercise spec, opens the
pristine rig, emits keyframes per the spec, captures pose, runs validators,
gates the render on validators passing, then writes MP4 + per-exercise .blend.
"""
import argparse
import importlib
import os
import sys
from pathlib import Path

# When invoked directly outside Blender we re-exec via blender --background.
def _running_in_blender() -> bool:
    try:
        import bpy  # noqa
        return True
    except ImportError:
        return False


SCRIPTS_DIR = Path(__file__).parent
APP_DIR = SCRIPTS_DIR.parent
RIG_PATH = APP_DIR / "assets" / "blender" / "xbot_rigged.blend"
RENDER_DIR = APP_DIR / "assets" / "exercise-renders"
BLEND_DEBUG_DIR = APP_DIR / "assets" / "blender"


def _parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("exercise")
    p.add_argument("--no-render", action="store_true")
    p.add_argument("--keep-blend", action="store_true")
    p.add_argument("--frame", type=int, default=None)
    return p.parse_args(argv)


def _print_results(summary):
    print(f"\n{'─' * 80}")
    for r in summary.results:
        mark = "✓ PASS" if r.passed else "✗ FAIL"
        frame_str = f"f{r.frame}" if r.frame >= 0 else "—"
        print(f"  {mark}  {r.primitive:<48s} {frame_str:<6s} observed={r.observed:.3f}  expected {r.expected}")
        if r.message:
            print(f"           {r.message}")
    print(f"{'─' * 80}")
    print(f"  {summary.failed_count} failed, {len(summary.results) - summary.failed_count} passed")
    print()


def main_in_blender(args: argparse.Namespace) -> int:
    import bpy
    sys.path.insert(0, str(SCRIPTS_DIR))
    from animation_lib.cameras import DEFAULT_RESOLUTION
    from animation_lib.keyframe_emitter import emit_phases, reset_to_t_pose
    from animation_lib.pose_capture import capture_history
    from animation_lib.render import apply_scene_config, render_mp4, render_single_frame_png, save_blend
    from animation_lib.validators import run_validators

    # --- 1. Resolve spec module ---
    try:
        spec_module = importlib.import_module(f"exercise_specs.{args.exercise}")
    except ImportError as e:
        print(f"ERROR: failed to import spec exercise_specs.{args.exercise}: {e}", file=sys.stderr)
        return 1

    required = ["NAME", "FPS", "CAMERA", "LIGHTING", "PHASES", "VALIDATORS"]
    missing = [a for a in required if not hasattr(spec_module, a)]
    if missing:
        print(f"ERROR: spec missing required attrs: {missing}", file=sys.stderr)
        return 1
    if spec_module.NAME != args.exercise:
        print(f"ERROR: spec NAME={spec_module.NAME!r} != filename {args.exercise!r}", file=sys.stderr)
        return 1
    if not spec_module.VALIDATORS:
        print("ERROR: spec VALIDATORS is empty. Validators are mandatory.", file=sys.stderr)
        return 1

    resolution = getattr(spec_module, "RESOLUTION", DEFAULT_RESOLUTION)

    # --- 2. Open rig (read-only; mutations on in-memory copy) ---
    bpy.ops.wm.open_mainfile(filepath=str(RIG_PATH))
    armature = next((o for o in bpy.data.objects if o.type == "ARMATURE"), None)
    if armature is None:
        print(f"ERROR: no armature in {RIG_PATH}", file=sys.stderr)
        return 1

    # --- 3. Reset to T-pose ---
    reset_to_t_pose(armature)

    # --- 4-5. Emit keyframes ---
    phase_to_frame = emit_phases(armature, spec_module.PHASES, fps=spec_module.FPS)

    # --- 6. Capture + run validators ---
    history = capture_history(armature, phase_to_frame)
    summary = run_validators(history, spec_module.VALIDATORS, fps=spec_module.FPS)
    _print_results(summary)

    if not summary.all_passed:
        if args.keep_blend:
            BLEND_DEBUG_DIR.mkdir(parents=True, exist_ok=True)
            save_blend(str(BLEND_DEBUG_DIR / f"casual_man_{args.exercise}.blend"))
        return 2

    # --- 8. Apply scene config ---
    apply_scene_config(
        camera_name=spec_module.CAMERA,
        lighting_name=spec_module.LIGHTING,
        resolution=resolution,
        fps=spec_module.FPS,
    )

    # --- 9-10. Render + save ---
    if args.no_render:
        return 0

    if args.frame is not None:
        out = APP_DIR / f"frame_{args.exercise}_{args.frame:04d}.png"
        render_single_frame_png(str(out), args.frame)
        print(f"WROTE {out}")
        return 0

    RENDER_DIR.mkdir(parents=True, exist_ok=True)
    BLEND_DEBUG_DIR.mkdir(parents=True, exist_ok=True)
    mp4_path = RENDER_DIR / f"{args.exercise}.mp4"
    blend_path = BLEND_DEBUG_DIR / f"casual_man_{args.exercise}.blend"
    try:
        render_mp4(str(mp4_path))
    except Exception as e:
        print(f"ERROR: render failed: {e}", file=sys.stderr)
        return 3
    save_blend(str(blend_path))
    print(f"WROTE {mp4_path}")
    print(f"WROTE {blend_path}")
    return 0


def main_outside_blender(argv: list[str]) -> int:
    """Re-exec via `blender --background --python this_file -- <argv>`."""
    import subprocess
    blender = os.environ.get("BLENDER_BIN", "blender")
    cmd = [blender, "--background", "--python", str(__file__), "--"] + argv
    return subprocess.call(cmd)


if __name__ == "__main__":
    if _running_in_blender():
        # Args after `--` from blender's invocation.
        if "--" in sys.argv:
            argv = sys.argv[sys.argv.index("--") + 1:]
        else:
            argv = sys.argv[1:]
        sys.exit(main_in_blender(_parse_args(argv)))
    else:
        sys.exit(main_outside_blender(sys.argv[1:]))
