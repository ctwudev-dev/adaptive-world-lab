# Validation

Version 2.1 adds a calibration workbench with local CSV import, calibration-only fitting, whole-trial held-out validation, source labels, diagnostics, and clean exports. Version 2.0's robot experiments and the earlier one-dimensional study remain separate.

## Completed checks

| Check | Result |
|---|---|
| Python tests | 47 passed, including independent MuJoCo pusher contact |
| JavaScript physics, business, calibration, and interface tests | 64 passed |
| Total local tests | 111 passed |
| Calibration captures | 48 new MuJoCo trials across matched, drift, and low-motion fixtures |
| Retained robot contact experiments | 540 MuJoCo episodes, all outcomes retained |
| Retained robot numerical experiments | 540 browser-model episodes, all outcomes retained |
| Replay | Full recorded contact trajectories for all three strategies |
| Earlier free-glide data | 1,200 runs retained and source hashes checked |
| Release files and data | Linked assets, summary counts, source hashes, and source ZIP checked |
| Privacy and English | Source and archive checked for common private data and untranslated text |

Tests cover sub-threshold force, mass/friction effects, diagonal motion, coasting, actual simulated pusher contact impulse, and the absence of direct object forces. Other checks cover joint estimation, parameter isolation, zero-information ablation, changing friction, probe/time accounting, repeatability, confidence-interval endpoints, and invalid sensor or action inputs.

Interface tests use jsdom and real Node worker adapters. They cover default navigation, stepping, animation completion, model updates, invalid input, resetting, independent contact replay, switching back to the numerical model, paired result loading, background computation, cancellation, and exports becoming available. The earlier business and one-dimensional interactions remain tested.

Calibration checks cover strict CSV input, label replacement, whole-trial splits, exact copied tracks across splits, invalid phase coverage, baseline-independent fitting, unchanged fit under altered validation positions, equal trial weighting, lateral errors, drift failures, weak identification, and exports that cannot claim physical verification or deployment approval.

The calibration interface is checked with real worker execution, source-label changes, explicit assumption confirmation, report invalidation, malformed imports, cancellation, report downloads, and the fitted-prior handoff to Experiment.

The 48 calibration capture trials and reports were rebuilt for version 2.1. The 540 contact and 540 numerical robot episodes were run for version 2.0; their unchanged dynamics/controller source hashes and data integrity were checked for this release. The earlier 1,200-run free-glide benchmark was also retained with source-hash checks. Those two full older benchmarks were not rerun for the calibration-interface change.

## Reproduce

~~~bash
pytest -q
npm test
node scripts/robot_benchmark.mjs 60 2048
python -m scripts.robot_contact_benchmark --n 60 --seed 2048
python scripts/robot_report.py
python -m scripts.calibration_samples
node scripts/calibration_report.mjs
python scripts/package_source.py
python scripts/check_release.py
python scripts/check_public_files.py
~~~

## Verification limits

Real-browser visual layout QA could not run because the managed preview service was unavailable. Interface behavior checks do not establish how every screen size renders. Responsive rules, semantic controls, reduced-motion behavior, and canvas fallbacks are implemented, but remain subject to visual review.

No physical robot, camera, measured-force sensor, or real-table test was run. All included calibration examples are synthetic. The two engines share a narrow idealized task and friction family. The results do not establish transfer to real hardware, general robot intelligence, customer demand, production savings, or deployment readiness.

The retained two-page transfer proposal was visually checked in the earlier release. Its illustrative financial assumptions remain separate from the new robot results.
