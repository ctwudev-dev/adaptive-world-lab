from dataclasses import replace, fields
import importlib.util
import json
import math
import subprocess
from pathlib import Path
import numpy as np
import pytest
from awm.core import Scenario, ControllerConfig, Controller, GRID, Random, prior_for, stats, distance, information_gain
from awm.plants import NumericalPlant, MujocoPlant
from awm.experiment import run_episode, make_scenarios, aggregate

ROOT = Path(__file__).resolve().parents[1]

@pytest.mark.parametrize("mu", [.08,.16,.44,.8])
@pytest.mark.parametrize("velocity", [-2.3,-.7,.7,2.3])
def test_independent_integrator_matches_coulomb_law(mu,velocity):
    c = Scenario(mu=mu,noise=0,start=1.2)
    p = NumericalPlant(c)
    p.observe()
    r = p.execute(velocity)
    assert r["evaluation"]["x"] == pytest.approx(c.start+distance(velocity,mu),abs=2e-10)
    assert r["evaluation"]["trace"][-1]["v"] == 0

def test_controller_config_cannot_include_ground_truth():
    c = Scenario(mu=.1,drag=.7,shiftMu=.6)
    with pytest.raises(TypeError):
        Controller("active",c)
    public_keys = {f.name for f in fields(c.public())}
    assert not public_keys & {"mu","drag","shiftMu","shiftAfter","seed","start"}
    a = Controller("active",c.public()).decide(.38)
    b = Controller("active",replace(c,mu=.8,drag=0).public()).decide(.38)
    assert a == b

def test_bayesian_update_identifies_unknown_friction():
    c = Scenario(mu=.24,noise=0)
    world, controller = NumericalPlant(c), Controller("passive",c.public())
    world.observe()
    result = world.execute(1.1)
    before = stats(controller.w)
    controller.learn(result["observation"])
    after = stats(controller.w)
    assert abs(after["mean"]-.24)<.01
    assert after["sd"]<before["sd"]/3
    assert np.all(controller.w>=0)
    assert controller.w.sum()==pytest.approx(1.)

def test_truth_and_duration_in_observation_are_ignored():
    c = Scenario()
    obs = dict(start=.38,end=.71,velocity=1.05,duration=.5)
    a,b = Controller("passive",c.public()),Controller("passive",c.public())
    a.learn(obs)
    b.learn(dict(obs,true_mu=.8,duration=1000,evaluation={"mu":.8}))
    np.testing.assert_array_equal(a.w,b.w)

def test_extreme_residual_resets_without_nan():
    c=Scenario()
    agent=Controller("active",c.public())
    result=agent.learn(dict(start=0,end=1000,velocity=.3))
    assert result["reset"]
    assert np.isfinite(agent.w).all()
    assert agent.w.sum()==pytest.approx(1.)

def test_information_gain_is_bounded_and_rewards_informative_actions():
    c=ControllerConfig()
    w=prior_for(c)
    assert information_gain(.9,w,c)>information_gain(.3,w,c)
    for u in [.3,.6,1.05]:
        assert 0<=information_gain(u,w,c)<=stats(w)["entropy"]+.01

def test_active_probe_only_when_uncertain():
    wide = Controller("active",ControllerConfig()).decide(.38)
    narrow = Controller("active",ControllerConfig(priorSd=.01)).decide(.38)
    assert wide["kind"]=="probe"
    assert narrow["kind"]=="task"

@pytest.mark.parametrize("method", ["fixed","passive","active","robust"])
def test_seed_budget_costs_and_terminal_status(method):
    c=Scenario()
    a,b=run_episode(method,c),run_episode(method,c)
    assert a==b
    assert a["metrics"]["actions"]<=6
    assert a["metrics"]["time"]>=.35*a["metrics"]["actions"]
    assert a["metrics"]["probes"]==sum(e["kind"]=="probe" for e in a["events"])
    assert not(a["metrics"]["success"] and a["metrics"]["boundary"])
    assert a["metrics"]["energy"]==pytest.approx(sum(.5*e["velocity"]**2 for e in a["events"]))
    assert a["metrics"]["success"]==(not a["metrics"]["boundary"] and a["metrics"]["error"]<=c.tolerance)

def test_common_random_numbers_are_matched_per_action():
    rs=[run_episode(m,Scenario(mu=.16)) for m in ("fixed","passive","active","robust")]
    starts=[r["events"][0]["observation"]["start"] for r in rs]
    assert max(starts)==min(starts)
    residuals=[r["events"][0]["observation"]["end"]-r["events"][0]["actual"]["x"] for r in rs]
    assert max(residuals)-min(residuals)<1e-14

@pytest.mark.parametrize("patch", [dict(mu=0),dict(noise=-1),dict(mu=float("nan")),dict(maxActions=0),dict(shiftAfter=-1)])
def test_reject_invalid_scenario(patch):
    with pytest.raises(ValueError):
        run_episode("active",replace(Scenario(),**patch))

def test_scenario_matching_and_wilson_interval():
    cases=make_scenarios(10,2026)
    assert cases==make_scenarios(10,2026)
    runs=[run_episode("active",c) for c in cases]
    s=aggregate(runs)
    assert s["n"]==10
    assert s["successCI"][0]<=s["successRate"]<=s["successCI"][1]
    assert s["actions"]==pytest.approx(np.mean([r["metrics"]["actions"] for r in runs]))

@pytest.mark.parametrize("mu", [.1,.3,.7])
@pytest.mark.parametrize("velocity", [-2.1,.8,2.1])
def test_real_mujoco_contact_matches_stopping_law(mu,velocity):
    pytest.importorskip("mujoco")
    c=Scenario(mu=mu,noise=0,start=1.2)
    p=MujocoPlant(c)
    p.observe()
    result=p.execute(velocity)
    assert abs(result["evaluation"]["x"]-(c.start+distance(velocity,mu)))<.004
    assert abs(result["evaluation"]["trace"][-1]["v"])<.001

def test_browser_and_python_reference_have_matching_decisions():
    scenarios=[Scenario(),Scenario(mu=.44),Scenario(mu=.2,drag=.7),Scenario(mu=.16,shiftMu=.65,shiftAfter=1)]
    from dataclasses import asdict
    data=json.dumps([asdict(c) for c in scenarios])
    script='import {runEpisode,METHODS} from "./dist/engine.js";const cs='+data+';console.log(JSON.stringify(cs.map(c=>Object.keys(METHODS).map(m=>runEpisode(m,c)))));'
    js=json.loads(subprocess.check_output(["node","--input-type=module","-e",script],cwd=ROOT,text=True))
    for ci,c in enumerate(scenarios):
        for mi,m in enumerate(("fixed","passive","active","robust")):
            py=run_episode(m,c)
            assert [e["kind"] for e in py["events"]]==[e["kind"] for e in js[ci][mi]["events"]]
            for a,b in zip(py["events"],js[ci][mi]["events"]):
                assert a["velocity"]==pytest.approx(b["velocity"],abs=1e-12)
            for key in py["metrics"]:
                assert py["metrics"][key]==pytest.approx(js[ci][mi]["metrics"][key],abs=1e-9)

