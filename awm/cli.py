import argparse
import csv
import json
from pathlib import Path
from .core import Scenario, METHODS
from .experiment import run_episode, benchmark


def main():
    p = argparse.ArgumentParser(description="Adaptive World Lab — reproducible sliding experiments")
    sub = p.add_subparsers(dest="command", required=True)
    demo = sub.add_parser("demo")
    demo.add_argument("--engine", choices=("numerical","mujoco"), default="numerical")
    demo.add_argument("--method", choices=(*METHODS,"all"), default="all")
    demo.add_argument("--mu", type=float, default=.10)
    demo.add_argument("--seed", type=int, default=42)
    demo.add_argument("--noise", type=float, default=.003)
    demo.add_argument("--drag", type=float, default=0.)
    demo.add_argument("--shift-mu", type=float)
    demo.add_argument("--output", type=Path, default=Path("results/demo.json"))
    bench = sub.add_parser("benchmark")
    bench.add_argument("--engine", choices=("numerical","mujoco"), default="numerical")
    bench.add_argument("--n", type=int, default=100)
    bench.add_argument("--seed", type=int, default=2026)
    bench.add_argument("--suite", choices=("uniform","mismatch","shift"), default="uniform")
    bench.add_argument("--output", type=Path, default=Path("results/benchmark.json"))
    a = p.parse_args()
    if a.command == "demo":
        c = Scenario(mu=a.mu,seed=a.seed,noise=a.noise,drag=a.drag,shiftMu=a.shift_mu)
        methods = METHODS if a.method=="all" else (a.method,)
        episodes = {m:run_episode(m,c,a.engine) for m in methods}
        result = dict(schema="awm-session-v1",engine=a.engine,episodes=episodes)
        summary = {m:r["metrics"] for m,r in episodes.items()}
    else:
        result = benchmark(a.n,a.seed,a.suite,a.engine)
        summary = result["summary"]
    a.output.parent.mkdir(parents=True,exist_ok=True)
    a.output.write_text(json.dumps(result,ensure_ascii=False,indent=2,allow_nan=False)+"\n")
    with a.output.with_suffix(".csv").open("w",newline="") as f:
        keys = list(next(iter(summary.values())))
        writer = csv.DictWriter(f, fieldnames=["method",*keys])
        writer.writeheader()
        for method, row in summary.items():
            writer.writerow(dict(method=method,**row))
    if a.command == "benchmark":
        paired_path = a.output.with_suffix(".paired.csv")
        metric_keys = list(next(iter(result["episodes"].values()))[0]["metrics"])
        with paired_path.open("w",newline="") as f:
            writer = csv.DictWriter(f,fieldnames=["scenario","method","engine","suite","seed","mu","start","target","noise",*metric_keys])
            writer.writeheader()
            for method,rows in result["episodes"].items():
                for i,row in enumerate(rows):
                    writer.writerow(dict(scenario=i,method=method,engine=a.engine,suite=a.suite,
                                         **{k:row["config"][k] for k in ("seed","mu","start","target","noise")},
                                         **row["metrics"]))
    print(json.dumps(summary,ensure_ascii=False,indent=2))
    print(f"Saved {a.output} and {a.output.with_suffix('.csv')}")


if __name__ == "__main__":
    main()
