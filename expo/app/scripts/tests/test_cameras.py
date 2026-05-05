import pytest
from animation_lib.cameras import get_camera_preset, get_lighting_preset, DEFAULT_RESOLUTION


def test_front_preset_has_required_fields():
    p = get_camera_preset("front")
    assert p.position == (0.0, -3.5, 0.9)
    assert p.target == (0.0, 0.0, 0.9)
    assert p.fov_deg == 35


def test_side_left_preset_has_correct_position():
    p = get_camera_preset("side_left")
    assert p.position == (3.5, 0.0, 0.9)
    assert p.target == (0.0, 0.0, 0.9)
    assert p.fov_deg == 35


def test_front_top_left_preset_exists():
    p = get_camera_preset("front_top_left")
    assert p.position == (2.24, -2.24, 2.38)
    assert p.target == (0.0, 0.0, 0.9)
    assert p.fov_deg == 35


def test_unknown_camera_preset_raises():
    with pytest.raises(KeyError, match="unknown camera preset"):
        get_camera_preset("nope")


def test_studio_lighting_preset_exists():
    p = get_lighting_preset("studio")
    assert len(p.lights) >= 3  # 3-point lighting minimum


def test_default_resolution():
    assert DEFAULT_RESOLUTION == (800, 800)
