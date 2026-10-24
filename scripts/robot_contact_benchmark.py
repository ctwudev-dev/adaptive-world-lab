"""Reproduce paired independent contact tests and a replayable demonstration."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys

from awm.robot_contact import ENGINE, PolicyBridge, run_contact_episode

ROOT = Path(__file__).resolve().parents[1]
METHODS = ("fixed", "passive", "active")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--n", type=int, default=60)
    parser.add_argument("--seed", type=int, default=2048)
    args = parser.parse_args()
    if not 1 <= args.n <= 500:
        parser.error("Use 1 to 500 paired cases.")
    with PolicyBridge() as bridge:
        demo = {m: run_contact_episode(dict(mu=.38, mass=1.15), m, bridge) for m in METHODS}
        hashes = {p: hashlib.sha256((ROOT / p).read_bytes()).hexdigest()
                  for p in ("dist/robot-engine.js", "dist/robot-experiment.js", "awm/robot_contact.py",
                            "scripts/robot_bridge.mjs", "scripts/robot_contact_benchmark.py")}
        session = dict(schema="robot-physics-session-v1", engine=ENGINE,
                       provenance=dict(codeHashes=hashes), episodes=demo)
        (ROOT / "dist/robot-contact-demo.json").write_text(json.dumps(session, indent=2) + "\n")
        for suite in ("unseen", "shift", "close"):
            script = ('import {makeCases} from "./scripts/robot_benchmark.mjs"; '
                      f'console.log(JSON.stringify(makeCases({args.n},{args.seed},"{suite}")));')
            cases = json.loads(subprocess.check_output(["node", "--input-type=module", "-e", script], cwd=ROOT, text=True))
            episodes = {m: [] for m in METHODS}
            for i, c in enumerate(cases):
                for method in METHODS:
                    run = run_contact_episode(c, method, bridge)
                    # Retain every outcome; full traces are in the separate replay.
                    contact = dict(normalImpulse=sum(e["actual"]["normalImpulse"] for e in run["events"]),
                                   contactSteps=sum(e["actual"]["contactSteps"] for e in run["events"]))
                    episodes[method].append(dict(config=run["config"], metrics=run["metrics"], contact=contact))
                if (i + 1) % 10 == 0:
                    print(f"{suite}: {i+1}/{len(cases)} paired cases", flush=True)
            # Use the same published summary definitions for both engines.
            js = ('import {pairedSummary} from "./scripts/robot_benchmark.mjs"; '
                  'let s=""; for await (const p of process.stdin)s+=p; '
                  'console.log(JSON.stringify(pairedSummary(JSON.parse(s))));')
            summary = json.loads(subprocess.run(["node", "--input-type=module", "-e", js],
                input=json.dumps(episodes), capture_output=True, check=True, cwd=ROOT, text=True).stdout)
            result = dict(schema="robot-physics-benchmark-v1", engine=ENGINE, suite=suite,
                n=args.n, seed=args.seed, cases=cases, episodes=episodes, **summary,
                provenance=dict(codeHashes=hashes, mujoco=sys.modules["mujoco"].__version__,
                    description="Independent actuated pusher contact. All failures retained. No physical robot."))
            name = f"robot-contact-{suite}.json"
            encoded = json.dumps(result, indent=2) + "\n"
            (ROOT / "results" / name).write_text(encoded)
            (ROOT / "dist" / name).write_text(encoded)
            print(suite, json.dumps(summary["summary"]), flush=True)


if __name__ == "__main__":
    main()
