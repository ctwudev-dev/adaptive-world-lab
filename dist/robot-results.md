# Robot physics results

Version 2.0. Seed 2048; 60 shared cases per strategy per suite.

All outcomes are simulated. The independent contact world and the browser model use the same case definitions. Sensor noise is paired within an engine.

## Independent MuJoCo contact

| Case | Strategy | Success | Mean moves | Learning moves | Time + setup | Prediction RMSE | Boundary failures |
|---|---|---:|---:|---:|---:|---:|---:|
| unseen | Fixed | 12/60 | 6.27 | 0.00 | 5.987 s | 18.1 cm | 1/60 |
| unseen | Passive | 57/60 | 2.55 | 0.00 | 3.189 s | 16.7 cm | 1/60 |
| unseen | Active | 57/60 | 2.55 | 0.50 | 3.222 s | 16.9 cm | 1/60 |
| shift | Fixed | 16/60 | 6.35 | 0.00 | 5.943 s | 19.5 cm | 1/60 |
| shift | Passive | 48/60 | 3.13 | 0.00 | 3.855 s | 34.5 cm | 10/60 |
| shift | Active | 49/60 | 3.17 | 0.82 | 3.958 s | 35.2 cm | 9/60 |
| close | Fixed | 55/60 | 2.73 | 0.00 | 3.201 s | 1.7 cm | 0/60 |
| close | Passive | 59/60 | 2.12 | 0.00 | 2.774 s | 1.9 cm | 0/60 |
| close | Active | 59/60 | 2.12 | 0.45 | 2.812 s | 1.9 cm | 0/60 |

## Browser numerical contact

| Case | Strategy | Success | Mean moves | Learning moves | Time + setup | Prediction RMSE | Boundary failures |
|---|---|---:|---:|---:|---:|---:|---:|
| unseen | Fixed | 12/60 | 6.27 | 0.00 | 5.795 s | 18.2 cm | 1/60 |
| unseen | Passive | 57/60 | 2.55 | 0.00 | 3.107 s | 16.7 cm | 1/60 |
| unseen | Active | 57/60 | 2.55 | 0.53 | 3.142 s | 16.9 cm | 1/60 |
| shift | Fixed | 17/60 | 6.37 | 0.00 | 5.761 s | 19.6 cm | 1/60 |
| shift | Passive | 49/60 | 3.17 | 0.00 | 3.796 s | 34.7 cm | 9/60 |
| shift | Active | 49/60 | 3.17 | 0.80 | 3.861 s | 35.3 cm | 9/60 |
| close | Fixed | 55/60 | 2.72 | 0.00 | 3.107 s | 2.0 cm | 0/60 |
| close | Passive | 59/60 | 2.12 | 0.00 | 2.710 s | 2.1 cm | 0/60 |
| close | Active | 59/60 | 2.12 | 0.52 | 2.750 s | 2.1 cm | 0/60 |

## What the contact tests support

- Updating the physics belief helped relative to keeping the starting belief in the unseen and changed-surface suites.
- Active and Passive both reached 57/60 unseen targets. Both used 2.55 moves per case on average. Active took slightly longer: 3.222 s versus 3.189 s.
- With a friction change after one move, Active reached 49/60 targets and Passive reached 48/60. This one-case difference is not evidence of a reliable advantage. Active used more time and slightly more moves.
- With a close starting model, Active and Passive both reached 59/60 targets. Active again took slightly longer.
- Boundary failures remain important: Active crossed the limit in 9/60 changed-friction cases. The model-based risk penalty does not guarantee containment.

The current information bonus did not consistently earn its cost. Passive learning is a strong baseline. Better probe selection, calibrated change detection, and evaluation on more seeds are clear next questions.

## Definitions and limits

Success requires true final target error at most 5.5 cm, within the declared center-position limits, in at most seven moves. Some high-friction, high-mass cases may be difficult or infeasible within the bounded force and move budget.

Time includes motion and a declared 0.6-second setup allowance for each action. It does not include computation or measured hardware setup. Prediction RMSE is computed per episode, then averaged across episodes. All means include failures. A probe is an information-selected action; it can also make progress and always counts as one full move.

Raw JSON files include Wilson 95% success intervals, paired outcome counts, mean paired differences, each case, and every episode's metrics. Success intervals are not a between-strategy significance test. No significance, production saving, or real-hardware transfer is claimed.

The MuJoCo model has real simulated pusher/object contact but locked object rotation and ideal force motors. Its physics family is close to the predictor's assumptions. This is an independent implementation check within a narrow simulated task, rather than a broad generalization benchmark.

## Reproduce

~~~bash
npm run benchmark:robot -- 60 2048
python -m scripts.robot_contact_benchmark --n 60 --seed 2048
python scripts/robot_report.py
~~~

The contact run also writes a full replay to dist/robot-contact-demo.json. The 540 new contact runs and 540 numerical runs are separate from the earlier 1,200 one-dimensional free-glide runs.
