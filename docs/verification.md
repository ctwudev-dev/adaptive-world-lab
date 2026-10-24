# Validation

Version 2.0 adds force-driven planar robot contact, joint friction/mass estimation, a new browser experiment, and paired contact tests. The earlier one-dimensional physics files and records are retained separately.

## Completed checks

| Check | Result |
|---|---|
| Python tests | 47 passed, including independent MuJoCo pusher contact |
| JavaScript physics, business, and interface tests | 42 passed |
| Total local tests | 89 passed |
| New contact experiments | 540 MuJoCo episodes, all outcomes retained |
| New numerical experiments | 540 browser-model episodes, all outcomes retained |
| Replay | Full recorded contact trajectories for all three strategies |
| Earlier free-glide data | 1,200 runs retained and source hashes checked |
| Release files and data | Linked assets, summary counts, source hashes, and source ZIP checked |
| Privacy and English | Source and archive checked for common private data and untranslated text |

Tests cover sub-threshold force, mass/friction effects, diagonal motion, coasting, actual simulated pusher contact impulse, and the absence of direct object forces. Other checks cover joint estimation, parameter isolation, zero-information ablation, changing friction, probe/time accounting, repeatability, confidence-interval endpoints, and invalid sensor or action inputs.

Interface tests use jsdom and real Node worker adapters. They cover default navigation, stepping, animation completion, model updates, invalid input, resetting, independent contact replay, switching back to the numerical model, paired result loading, background computation, cancellation, and exports becoming available. The earlier business and one-dimensional interactions remain tested.

The new full experiment commands were run for this release. Raw cases, outcomes, and hashes of the physics, controller, and case-generation code are saved with the data. The earlier full 1,200-run benchmark was not rerun for this change; its unchanged simulation/controller source hashes and data integrity were checked.

## Reproduce

~~~bash
pytest -q
npm test
node scripts/robot_benchmark.mjs 60 2048
python -m scripts.robot_contact_benchmark --n 60 --seed 2048
python scripts/robot_report.py
python scripts/package_source.py
python scripts/check_release.py
python scripts/check_public_files.py
~~~

## Verification limits

Real-browser visual layout QA could not run because the managed preview service was unavailable. Interface behavior checks do not establish how every screen size renders. Responsive rules, semantic controls, reduced-motion behavior, and canvas fallbacks are implemented, but remain subject to visual review.

No physical robot, camera, measured-force sensor, or real-table test was run. The two engines share a narrow idealized task and friction family. The results do not establish transfer to real hardware, general robot intelligence, customer demand, production savings, or deployment readiness.

The retained two-page transfer proposal was visually checked in the earlier release. Its illustrative financial assumptions remain separate from the new robot results.
