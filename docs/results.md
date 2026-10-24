# Experiment results

## Test design

Each test set contains 100 shared cases. All four strategies receive the same case settings, sensor-noise samples at each move index, and six-move limit.

| Setting | Sampling rule |
|---|---|
| Friction | Uniform from 0.10 to 0.75 |
| Starting position | Uniform from 0.26 to 0.50 m |
| Target | Uniform from 1.55 to 1.80 m |
| Position-noise standard deviation | Uniform from 0.002 to 0.006 m |
| Random seed | 2026 |

The uniform set keeps friction fixed within each run. The shift set draws a new friction value after the first move. The mismatch set adds drag with β = 0.7 m⁻¹.

There are 3 × 100 × 4 = **1,200 MuJoCo runs**. Failed runs are included.

## Successful runs out of 100

| Test set | Fixed | Passive | Active | Robust |
|---|---:|---:|---:|---:|
| Unknown fixed friction | 83 | 99 | 100 | 27 |
| Sudden friction change | 65 | 90 | 89 | 48 |
| Extra drag | 88 | 100 | 99 | 24 |

## Fixed-friction costs

| Strategy | Success rate | 95% Wilson interval | Mean moves | Mean time | Out of bounds |
|---|---:|---:|---:|---:|---:|
| Fixed | 83% | 74.5–89.1% | 3.49 | 3.00 s | 8% |
| Passive | 99% | 94.6–99.8% | 2.98 | 2.48 s | 0% |
| Active | 100% | 96.3–100% | 3.42 | 2.69 s | 0% |
| Robust | 27% | 19.3–36.4% | 5.30 | 3.67 s | 0% |

Means include successes and failures. Time is sliding time plus an assumed 0.35 s per move. This is a comparison cost, not measured robot execution time. Injected kinetic energy is Σ½mv², not motor electricity use.

## What can be concluded

Updating the model improved task success in these test sets.

Active gained one success over Passive on the fixed-friction set, but used 0.44 more moves on average. Passive gained one success over Active in each of the other two sets. The data does not support a claim that a separate probe is always more efficient.

No paired significance test was run. A 95% interval for one success rate is not a significance test of the difference between strategies.

In the drag tests, the adaptive strategies often completed the task while their mean absolute friction-estimation error remained about 0.10–0.11. Completing a task and learning the correct physics are separate goals.

The Robust baseline is deliberately simple. Its scores do not set an upper bound on robust control.

## Files and reproduction

- The JSON files in results contain settings, per-run metrics, summaries, and code/runtime records.
- Files ending in .paired.csv contain one row per case and strategy.
- Matching files in dist are used by the demo.
- The live browser benchmark uses the numerical simulator, not MuJoCo. Small differences near the success threshold can change a few outcomes.

Run python -m scripts.reproduce to rebuild the three MuJoCo test sets and source hashes. Use requirements-repro.txt for the recorded package versions.

These are controlled simulation results. There is no physical robot or real-table validation.
