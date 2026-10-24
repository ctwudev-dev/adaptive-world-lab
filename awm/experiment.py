"""Matched scenarios and honest all-episode metrics, including exploration cost."""
from dataclasses import asdict
import math
import numpy as np
from .core import Scenario, Controller, stats, Random, METHODS
from .plants import NumericalPlant, MujocoPlant


def run_episode(method, scenario=None, engine="numerical"):
    c = scenario or Scenario()
    c.validate()
    if engine not in ("numerical", "mujoco"):
        raise ValueError(f"Unknown engine {engine}")
    plant = (MujocoPlant if engine == "mujoco" else NumericalPlant)(c)
    controller = Controller(method, c.public())
    events, boundary, elapsed, energy, path = [], False, 0., 0., 0.
    for index in range(c.maxActions):
        measured = plant.observe()
        if abs(measured-c.target) <= c.tolerance:
            break
        action = controller.decide(measured)
        result = plant.execute(action["velocity"])
        learning = controller.learn(result["observation"])
        actual = result["evaluation"]
        elapsed += result["observation"]["duration"]+.35
        energy += .5*action["velocity"]**2
        path += abs(actual["trace"][-1]["x"]-actual["trace"][0]["x"])
        events.append(dict(index=index+1, **action, observation=result["observation"], **learning,
                           posterior=controller.w.tolist(), actual=actual))
        if actual["boundary"]:
            boundary = True
            break
    error = abs(plant.x-c.target)
    metrics = dict(success=bool(not boundary and error<=c.tolerance), boundary=boundary,
                   actions=len(events), probes=sum(e["kind"]=="probe" for e in events), error=error,
                   time=elapsed, energy=energy, path=path,
                   muError=abs(stats(controller.w)["mean"]-plant.true_mu),
                   predictionRmse=math.sqrt(np.mean([(e["prediction"]["mean"]-e["actual"]["x"])**2 for e in events])) if events else 0.)
    return dict(schema="awm-episode-v1", engine=plant.engine, method=method, config=asdict(c),
                events=events, metrics=metrics, posterior=controller.w.tolist())


def make_scenarios(n=100, seed=2026, suite="uniform"):
    if n < 1 or suite not in ("uniform", "mismatch", "shift"):
        raise ValueError("Invalid benchmark")
    r = Random(seed)
    cases = []
    for i in range(n):
        mu, start, target, noise = .1+.65*r.uniform(), .26+.24*r.uniform(), 1.55+.25*r.uniform(), .002+.004*r.uniform()
        cases.append(Scenario(mu=mu, start=start, target=target, noise=noise,
                              seed=(seed+i*7919)&0xffffffff, drag=.7 if suite=="mismatch" else 0.,
                              shiftMu=.1+.65*r.uniform() if suite=="shift" else None, shiftAfter=1))
    return cases


def wilson(k, n):
    p, z = k/n, 1.96
    a = 1+z*z/n
    m = (p+z*z/(2*n))/a
    h = z*math.sqrt(p*(1-p)/n+z*z/(4*n*n))/a
    return [max(0., m-h), min(1., m+h)]


def aggregate(episodes):
    n = len(episodes)
    if not n:
        raise ValueError("Empty result set")
    k = sum(r["metrics"]["success"] for r in episodes)
    out = dict(n=n, successes=k, successRate=k/n, successCI=wilson(k,n),
               boundaryRate=sum(r["metrics"]["boundary"] for r in episodes)/n)
    for key in ("actions", "probes", "error", "time", "energy", "path", "muError", "predictionRmse"):
        out[key] = float(np.mean([r["metrics"][key] for r in episodes]))
    return out


def benchmark(n=100, seed=2026, suite="uniform", engine="numerical"):
    cases = make_scenarios(n,seed,suite)
    rows = {m: [run_episode(m,c,engine) for c in cases] for m in METHODS}
    return dict(schema="awm-benchmark-v1", engine=engine, n=n, seed=seed, suite=suite,
                scenarios=[asdict(c) for c in cases], summary={m:aggregate(r) for m,r in rows.items()},
                # Keep paired outcomes for independent re-analysis, without bulky traces.
                episodes={m:[dict(config=r["config"], metrics=r["metrics"]) for r in rs] for m,rs in rows.items()})
