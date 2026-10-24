"""Build the readable report from the retained paired experiment records."""
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
METHODS = ("fixed", "passive", "active")
LABELS = dict(fixed="Fixed", passive="Passive", active="Active")
lines = ["# Robot physics results", "", "Version 2.0. Seed 2048; 60 shared cases per strategy per suite.", "",
    "All outcomes are simulated. The independent contact world and the browser model use the same case definitions. Sensor noise is paired within an engine.", ""]
for engine, title in (("contact", "Independent MuJoCo contact"), ("numerical", "Browser numerical contact")):
    lines += ["## " + title, "", "| Case | Strategy | Success | Mean moves | Learning moves | Time + setup | Prediction RMSE | Boundary failures |",
              "|---|---|---:|---:|---:|---:|---:|---:|"]
    for suite in ("unseen", "shift", "close"):
        data = json.loads((ROOT / f"results/robot-{engine}-{suite}.json").read_text())
        for m in METHODS:
            s = data["summary"][m]
            lines.append(f"| {suite} | {LABELS[m]} | {s['successes']}/{s['n']} | {s['actions']:.2f} | {s['probes']:.2f} | {s['time']:.3f} s | {s['predictionRmse']*100:.1f} cm | {round(s['boundaries']*s['n'])}/{s['n']} |")
    lines += [""]
lines += ["## What the contact tests support", "",
    "- Updating the physics belief helped relative to keeping the starting belief in the unseen and changed-surface suites.",
    "- Active and Passive both reached 57/60 unseen targets. Both used 2.55 moves per case on average. Active took slightly longer: 3.222 s versus 3.189 s.",
    "- With a friction change after one move, Active reached 49/60 targets and Passive reached 48/60. This one-case difference is not evidence of a reliable advantage. Active used more time and slightly more moves.",
    "- With a close starting model, Active and Passive both reached 59/60 targets. Active again took slightly longer.",
    "- Boundary failures remain important: Active crossed the limit in 9/60 changed-friction cases. The model-based risk penalty does not guarantee containment.",
    "", "The current information bonus did not consistently earn its cost. Passive learning is a strong baseline. Better probe selection, calibrated change detection, and evaluation on more seeds are clear next questions.", "",
    "## Definitions and limits", "",
    "Success requires true final target error at most 5.5 cm, within the declared center-position limits, in at most seven moves. Some high-friction, high-mass cases may be difficult or infeasible within the bounded force and move budget.", "",
    "Time includes motion and a declared 0.6-second setup allowance for each action. It does not include computation or measured hardware setup. Prediction RMSE is computed per episode, then averaged across episodes. All means include failures. A probe is an information-selected action; it can also make progress and always counts as one full move.", "",
    "Raw JSON files include Wilson 95% success intervals, paired outcome counts, mean paired differences, each case, and every episode's metrics. Success intervals are not a between-strategy significance test. No significance, production saving, or real-hardware transfer is claimed.", "",
    "The MuJoCo model has real simulated pusher/object contact but locked object rotation and ideal force motors. Its physics family is close to the predictor's assumptions. This is an independent implementation check within a narrow simulated task, rather than a broad generalization benchmark.", "",
    "## Reproduce", "", "~~~bash", "npm run benchmark:robot -- 60 2048", "python -m scripts.robot_contact_benchmark --n 60 --seed 2048", "python scripts/robot_report.py", "~~~", "",
    "The contact run also writes a full replay to dist/robot-contact-demo.json. The 540 new contact runs and 540 numerical runs are separate from the earlier 1,200 one-dimensional free-glide runs.", ""]
report = "\n".join(lines)
(ROOT / "docs/robot-results.md").write_text(report)
(ROOT / "dist/robot-results.md").write_text(report)
print("Built robot-results.md from six recorded result files.")
