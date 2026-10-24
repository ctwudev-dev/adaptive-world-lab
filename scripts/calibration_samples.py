"""Synthetic capture fixtures from the independent contact world; no real data."""
from pathlib import Path
import hashlib
import json
import math

import mujoco
import numpy as np
from awm.robot_contact import ContactPlant

ROOT = Path(__file__).resolve().parents[1]
SEED = 20261024


def make_capture(kind):
    random = np.random.default_rng(SEED)
    trials = []
    for i in range(16):
        split = "calibration" if i < 8 else "validation"
        friction = .15 if kind == "drift" and split == "validation" else .37
        mass = 1.05
        force = 2. if kind == "quiet" else ([4.5, 5.2, 6., 7.3][i % 4] if i < 8 else [4.8, 5.7, 6.8, 7.8][i % 4])
        duration = [.12, .18, .24, .28][(i * 3 + i // 4) % 4]
        theta = i * .63
        command = dict(force=force, duration=duration, ux=math.cos(theta), uy=math.sin(theta))
        plant = ContactPlant(dict(mu=friction, mass=mass, start=[-.35 + .03 * (i % 3), -.1]))
        actual = plant.execute(command)
        samples = []
        for p in actual["trace"]:
            if samples and p["t"] <= samples[-1]["t"] + 1e-10:
                continue
            xy = np.array([p["x"], p["y"]]) + random.normal(0, .0015, 2)
            samples.append(dict(t=round(p["t"], 9), x=float(xy[0]), y=float(xy[1])))
        trials.append(dict(id=f"trial-{i+1:03}", split=split, command=command, samples=samples))
    hashes = {p: hashlib.sha256((ROOT / p).read_bytes()).hexdigest() for p in (
        "awm/robot_contact.py", "dist/robot-engine.js", "dist/calibration-engine.js", "scripts/calibration_samples.py")}
    descriptions = {
        "matched": "One object and surface across calibration and held-out force pulses.",
        "drift": "The validation surface has lower friction. Calibration cannot repair a condition it has not observed.",
        "quiet": "Motor force is too low to generate useful motion. Parameter identification should be flagged.",
    }
    return dict(schema="robot-physics-capture-v1", source="synthetic-mujoco", kind=kind,
        description=descriptions[kind], dataset=dict(schema="robot-physics-tracks-v1", source="synthetic-mujoco", trials=trials),
        provenance=dict(seed=SEED, mujoco=mujoco.__version__, positionNoiseSdMeters=.0015, codeHashes=hashes,
            physicalMeasurements=False),
        evaluationOnly=dict(calibration=dict(mu=.37, mass=1.05),
            validation=dict(mu=.15 if kind == "drift" else .37, mass=1.05)))


def main():
    for kind in ("matched", "drift", "quiet"):
        capture = make_capture(kind)
        (ROOT / f"dist/calibration-{kind}.json").write_text(json.dumps(capture, indent=2) + "\n")
        print(f"Built synthetic {kind} capture: 8 calibration + 8 validation trials.")


if __name__ == "__main__":
    main()
