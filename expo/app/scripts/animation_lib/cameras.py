"""Named camera and lighting presets. Specs reference these by name."""
from dataclasses import dataclass


@dataclass(frozen=True)
class CameraPreset:
    position: tuple[float, float, float]
    target: tuple[float, float, float]
    fov_deg: float


@dataclass(frozen=True)
class LightSpec:
    kind: str  # "sun", "area", "point"
    position: tuple[float, float, float]
    energy: float
    color: tuple[float, float, float] = (1.0, 1.0, 1.0)


@dataclass(frozen=True)
class LightingPreset:
    lights: tuple[LightSpec, ...] = ()


_CAMERAS = {
    # All presets target torso center (z=0.9) for a ~1.76m character. Camera
    # distance is tuned so head-to-toe fits at 35° FOV with margin for limb extension.
    "front":          CameraPreset(position=( 0.0, -3.5, 0.9), target=(0.0, 0.0, 0.9), fov_deg=35),
    "side_left":      CameraPreset(position=( 3.5,  0.0, 0.9), target=(0.0, 0.0, 0.9), fov_deg=35),
    "three_quarter":  CameraPreset(position=( 2.5, -2.5, 1.0), target=(0.0, 0.0, 0.9), fov_deg=35),
    # Front-top-left: 45° azimuth between front and the character's left side,
    # elevated ~25° (looking slightly down). Cinematic "hero" angle that shows
    # face/torso + side profile + has a sense of vertical movement.
    "front_top_left": CameraPreset(position=( 2.24, -2.24, 2.38), target=(0.0, 0.0, 0.9), fov_deg=35),
}

_LIGHTING = {
    "studio": LightingPreset(lights=(
        LightSpec(kind="area", position=(-2.0, -2.0, 3.0), energy=500),  # key
        LightSpec(kind="area", position=(2.0, -1.0, 2.5), energy=250),   # fill
        LightSpec(kind="area", position=(0.0, 2.0, 3.0), energy=300),    # back
    )),
}

DEFAULT_RESOLUTION = (800, 800)


def get_camera_preset(name: str) -> CameraPreset:
    if name not in _CAMERAS:
        raise KeyError(f"unknown camera preset: {name!r}. Known: {list(_CAMERAS)}")
    return _CAMERAS[name]


def get_lighting_preset(name: str) -> LightingPreset:
    if name not in _LIGHTING:
        raise KeyError(f"unknown lighting preset: {name!r}. Known: {list(_LIGHTING)}")
    return _LIGHTING[name]
