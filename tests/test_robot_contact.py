"""Independent contact and controller-boundary regression checks."""
import math
import shutil

import pytest

pytest.importorskip("mujoco")
from awm.robot_contact import ContactPlant, PolicyBridge, run_contact_episode


def test_force_driven_pusher_has_real_contact_impulse():
    p = ContactPlant(dict(mu=.25, mass=.8))
    initial = p.position
    result = p.execute(dict(force=6., duration=.15, ux=1., uy=0.))
    assert p.model.nu == 2
    assert p.model.nq == 5
    assert result["position"][0] > initial[0] + .02
    assert result["normalImpulse"] > .2
    assert result["contactSteps"] > 100
    assert abs(result["position"][1] - initial[1]) < 1e-8
    # Motion comes from the pusher motors, never a horizontal object wrench.
    assert not p.data.xfrc_applied.any()
    assert not p.data.qfrc_applied.any()


def test_subthreshold_force_and_heavier_object():
    action = dict(force=2., duration=.2, ux=1., uy=0.)
    p = ContactPlant(dict(mu=.5, mass=1.))
    start = p.position
    result = p.execute(action)
    assert math.dist(start, result["position"]) < .002
    lengths = []
    for mass in (.6, 1.2):
        p = ContactPlant(dict(mu=.2, mass=mass))
        start = p.position
        r = p.execute(dict(force=6., duration=.15, ux=.6, uy=.8))
        lengths.append(math.dist(start, r["position"]))
        assert abs((r["position"][0]-start[0])/(r["position"][1]-start[1])-.75) < .002
    assert lengths[0] > lengths[1]


def test_invalid_commands_do_not_mutate_the_world():
    p = ContactPlant(dict(mu=.3, mass=.8))
    start = p.position
    with pytest.raises(ValueError):
        p.execute(dict(force=9., duration=.1, ux=1., uy=0.))
    assert p.position == start


@pytest.mark.skipif(not shutil.which("node"), reason="The canonical controller needs Node.js")
def test_independent_contact_episode_learns_without_hidden_parameters():
    with PolicyBridge() as bridge:
        e = run_contact_episode(dict(mu=.38, mass=1.15), "passive", bridge)
        fixed = run_contact_episode(dict(mu=.38, mass=1.15), "fixed", bridge)
    assert e["metrics"]["success"]
    assert not fixed["metrics"]["success"]
    assert e["metrics"]["actions"] < fixed["metrics"]["actions"]
    assert all(x["actual"]["normalImpulse"] > 0 for x in e["events"])
    assert not {"mu", "mass", "shiftMu", "shiftAfter"} & e["config"].keys()
    assert all("actual" not in x["observation"] for x in e["events"])
