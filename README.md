# Robot Physics Lab

**Help robots learn how objects move, test actions in simulation, and improve from feedback.**

A virtual XY robot pushes a round object toward a target. It does not know the object's mass or the surface friction. It predicts a move, watches the contact and coast, updates its physics belief, and plans again.

The engineering question is: **When does learning the physics help, and when does an extra learning move cost more than it adds?**

This is a working simulation prototype with a browser interface, an independent MuJoCo contact world, paired experiments, replay, exports, and explicit limits. Physics learning here means estimating two parameters in a known model.

## Try it

No API key or GPU is needed for the browser app.

~~~bash
python -m http.server 8080 --directory dist
~~~

Open [localhost:8080](http://localhost:8080).

1. Start with **The surface changes** and press **One move** to inspect each update.
2. Compare **Active learning**, **Learn while moving**, and **Keep the starting model**.
3. Load the **MuJoCo contact replay** to inspect a separate force-driven pusher simulation.
4. Open **Compare**, then load saved contact tests or compute a new browser batch.
5. Try **The model starts close**. More information is not always worth extra time.

The scene shows a radial force-controlled pusher, a predicted stop range, and observed motion. The heatmap shows a joint belief over friction and mass. Hidden physics is available only through the evaluator toggle and exported evaluation records.

## What is built

- Planar translation driven by bounded force pulses.
- Joint friction and mass estimation from positions before the push, at release, and after settling.
- A one-move planner with a declared information bonus for Active.
- Fixed and Passive baselines with the same action space and starting prior.
- A separate MuJoCo pusher with two force motors and solved object contact.
- Three paired test suites, retained failures, time and probe costs, and Wilson success intervals.
- A browser worker for new batches, local JSON exports, and recorded contact replay.

## Recorded contact results

Successful episodes out of 60:

| Test set | Fixed | Passive | Active |
|---|---:|---:|---:|
| Unseen mass and friction | 12 | 57 | 57 |
| Friction changes after one move | 16 | 48 | 49 |
| Starting model is close | 55 | 59 | 59 |

These are **540 new MuJoCo episodes**: three suites, 60 cases, three strategies. Another 540 episodes use the browser model. The two engines share case definitions; noise is paired within each engine.

Learning helped relative to the fixed starting belief. **Active did not consistently beat Passive.** In the unseen suite, both used 2.55 moves on average; Active took 3.222 seconds including setup, versus 3.189 for Passive. The one extra success under a friction change does not establish a reliable advantage.

Active still crossed the table limit in 9/60 changed-friction cases. The risk penalty is not a physical safety guarantee. All failures remain in the data.

See [full results and costs](docs/robot-results.md), [method and sources](docs/robot-method.md), and [validation](docs/verification.md).

## Run the checks and reproduce the work

Use Python 3.10 or later and Node.js 18 or later. The commands below use macOS or Linux activation syntax.

~~~bash
python -m venv .venv
source .venv/bin/activate
pip install -e '.[mujoco,test]'
npm ci

pytest -q
npm test

# Three numerical suites; all outcomes retained.
npm run benchmark:robot -- 60 2048

# Three independent contact suites and a complete replay.
python -m scripts.robot_contact_benchmark --n 60 --seed 2048
python scripts/robot_report.py

# Build and check the portable source release.
python scripts/package_source.py
python scripts/check_release.py
python scripts/check_public_files.py
~~~

The contact harness uses the same JavaScript controller through a JSON bridge. Only allowlisted configuration and position observations reach it. The Python world and its true physical values remain in the evaluator.

## Code map

| Path | Purpose |
|---|---|
| [dist/robot-engine.js](dist/robot-engine.js) | Physics predictor, joint belief, action planner, numerical world |
| [dist/robot-experiment.js](dist/robot-experiment.js) | Shared cases and paired summaries |
| [awm/robot_contact.py](awm/robot_contact.py) | Independent actuated MuJoCo pusher and observation boundary |
| [scripts/robot_bridge.mjs](scripts/robot_bridge.mjs) | Narrow JSON interface to the canonical controller |
| [scripts/robot_contact_benchmark.py](scripts/robot_contact_benchmark.py) | Contact experiments and replay generation |
| [dist/robot.js](dist/robot.js) | Interface, scene, belief view, replay, and worker controls |
| [results](results) | Raw cases, outcomes, source hashes, and earlier research records |
| [tests](tests) | Physics, hidden-state isolation, probe accounting, and interface checks |

## Scope and next evidence

The object is round, rotation is locked, and the pusher makes centered contact. Force calibration, friction family, geometry, and pusher mass are known. The model learns friction and mass; it does not infer arbitrary geometry or learn a foundation model from video.

A simulated pusher is implemented. A physical robot, camera tracker, grasping system, or production deployment is not included. The next evidence step is measured force and object motion, split into calibration and held-out evaluation data. Parameter confidence and model-based boundary penalties need separate real-world validation.

The product hypothesis is a physics adaptation module that could reduce robot retuning when objects or surfaces change. Customer demand, integration effort, and financial benefit remain unmeasured.

The interface uses plain English and local calculations. See [privacy notes](docs/privacy.md). The repository name and the awm Python package retain the earlier project identity.

## Earlier work

The [transfer-station proposal](docs/transfer-guide.md) and [one-dimensional research guide](docs/research-guide.md) remain available as earlier studies. Their 1,200 recorded free-glide runs and illustrative business figures are separate from the robot contact results above.
