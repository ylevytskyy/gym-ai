from animation_lib.motion import Phase, phase, hold, cycle


def test_phase_basic():
    p = phase(0.3, {"hip.L": 100}, name="lift_left")
    assert p.duration_sec == 0.3
    assert p.name == "lift_left"
    assert p.pose == {"hip.L": 100}


def test_phase_auto_names_when_missing():
    p = phase(0.3, {})
    assert p.name.startswith("phase_")


def test_phase_auto_names_are_unique():
    a = phase(0.3, {})
    b = phase(0.3, {})
    assert a.name != b.name


def test_hold_emits_empty_pose():
    h = hold(1.0, name="bottom")
    assert h.duration_sec == 1.0
    assert h.pose == {}
    assert h.name == "bottom"


def test_cycle_alternates_left_right():
    phases = cycle(reps=2, step_sec=0.3, left_pose={"a": 1}, right_pose={"b": 2})
    assert len(phases) == 4
    assert phases[0].name == "lift_left_0"
    assert phases[0].pose == {"a": 1}
    assert phases[1].name == "lift_right_0"
    assert phases[1].pose == {"b": 2}
    assert phases[2].name == "lift_left_1"
    assert phases[3].name == "lift_right_1"


def test_cycle_zero_reps_returns_empty():
    assert cycle(reps=0, step_sec=0.3, left_pose={}, right_pose={}) == []


def test_cycle_step_sec_propagates():
    phases = cycle(reps=1, step_sec=0.5, left_pose={"a": 1}, right_pose={"b": 2})
    assert phases[0].duration_sec == 0.5
    assert phases[1].duration_sec == 0.5
