"""Recompute all committed MuJoCo experiments and record exact code/runtime provenance."""
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
import csv
import hashlib
import json
import platform
import sys
import numpy as np
import mujoco
from awm.core import Scenario, METHODS
from awm.experiment import benchmark, run_episode

ROOT=Path(__file__).resolve().parents[1]
HASH_FILES=("awm/core.py","awm/plants.py","awm/experiment.py","dist/engine.js")
provenance=dict(createdAt=datetime.now(timezone.utc).date().isoformat(),python=platform.python_version(),
                numpy=np.__version__,mujoco=mujoco.__version__,platform=f"{platform.system()} {platform.machine()}",
                codeHashes={f:hashlib.sha256((ROOT/f).read_bytes()).hexdigest() for f in HASH_FILES},
                seed=2026,scenariosPerSuite=100,paired=True,
                note="Actual simulated outcomes. No physical robot validation.")
def write(path,data):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(data,ensure_ascii=False,indent=2,allow_nan=False)+"\n")
def paired(path,data):
    keys=list(data["episodes"]["active"][0]["metrics"])
    with path.open("w",newline="") as f:
        writer=csv.DictWriter(f,fieldnames=["scenario","method","engine","suite","seed","mu","start","target","noise",*keys])
        writer.writeheader()
        for method,rows in data["episodes"].items():
            for i,row in enumerate(rows):
                writer.writerow(dict(scenario=i,method=method,engine=data["engine"],suite=data["suite"],
                                     **{k:row["config"][k] for k in ("seed","mu","start","target","noise")},**row["metrics"]))
for suite in ("uniform","shift","mismatch"):
    data=benchmark(n=100,seed=2026,suite=suite,engine="mujoco")
    data["provenance"]=provenance
    filename={"uniform":"verified-benchmark.json","shift":"verified-shift.json","mismatch":"verified-mismatch.json"}[suite]
    write(ROOT/"dist"/filename,data)
    write(ROOT/"results"/f"mujoco-{suite}.json",data)
    paired(ROOT/"results"/f"mujoco-{suite}.paired.csv",data)
    print(suite,{m:f'{s["successes"]}/100, {s["actions"]:.2f} actions' for m,s in data["summary"].items()},flush=True)
episodes={m:run_episode(m,Scenario(),"mujoco") for m in METHODS}
write(ROOT/"dist"/"mujoco-demo.json",dict(schema="awm-session-v1",engine="mujoco",episodes=episodes,provenance=provenance))
write(ROOT/"results"/"run-manifest.json",provenance)

