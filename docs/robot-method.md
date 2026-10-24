# Robot Physics Lab

## Question

Can a robot improve a task-specific physics model from contact motion, and when is an information-seeking move worth its cost?

The current model learns friction and object mass. It is a small parameter estimator with a known equation of motion. It does not learn arbitrary physics from video or train a general-purpose foundation model.

## Physical task

A round object starts at an XY position on a flat table. An XY pusher applies a radial force pulse, then retracts. The object coasts and settles. The task is to finish within 0.055 m of the target in at most seven moves while remaining within the declared center-position limits.

The object translates in two dimensions. Its orientation is locked. The pusher is repositioned to the centerline before each push. Pusher travel, collision-free repositioning, grasping, deformation, and off-center torque are outside this version.

Every move costs its push and settling time plus a fixed 0.6-second setup allowance. The allowance is an assumption. It is not a measured robot cycle time. Computation, real actuator travel, sensing latency, and integration cost are not counted.

## Predictive model

Units are meters, seconds, kilograms, and newtons. Gravity g = 9.81 m/s². The pusher mass m_p = 0.06 kg is known. The commanded force F is ideal and calibrated. The object mass m and isotropic friction coefficient mu are unknown. Static and sliding friction share one coefficient.

While in radial contact:

~~~text
a = max(0, (F - mu*m*g) / (m + m_p))
d_push = 0.5 * a * T²
v_release = a * T
d_coast = v_release² / (2*mu*g)
~~~

The model predicts the position at force release and the final position. A known force is needed to distinguish mass from friction. The earlier free-glide study could estimate friction but did not identify object mass from a known release speed alone.

## Independent contact world

The browser's numerical plant independently integrates the same ideal contact assumptions with small timesteps. That agreement is a numerical check within a shared model family.

The Python world uses MuJoCo. The object has x/y/z slide joints and gravity-supported table contact. A separate spherical pusher has two force-driven slide joints. The object moves through solved pusher/object contact. The harness never sets a launch velocity or applies a direct horizontal force to the object. It records normal contact impulse and contact steps.

After the pulse, the pusher is moved away, with zero pusher velocity and force. The object is allowed to settle. Pusher repositioning is an abstraction with a charged setup allowance. A large plane supports the contact simulation; crossing the declared table limits is an evaluation failure, rather than a simulated fall.

MuJoCo models compliant contact and numerical constraints. Its output is an independent simulation reference, not ground truth about physical equipment. The two engines share a simplified task, geometry, and friction family.

## Observation boundary

The harness owns the true friction, mass, change timing, and simulator state. A controller receives an explicit public configuration, commanded force pulse, and three noisy XY positions: start, force release, and settled end.

It never receives true parameters, contact impulse, or simulator objects during planning or updating. Evaluation records keep those values separately for audit and replay. This is an API boundary in the code, not an adversarial security sandbox.

All strategies receive the same noise draws for the same case and action index. The numerical and MuJoCo noise generators differ, so sensor samples are paired within an engine. Cross-engine results are not a point-for-point noise comparison.

## Joint belief and model update

The discrete grid contains 19 friction values (0.08 to 0.62, step 0.03) and 13 mass values (0.35 to 1.55 kg, step 0.1 kg): 247 pairs.

The starting prior is a product of two Gaussian-shaped grid distributions with 1.5% uniform support. It uses the same settings for all strategies in a case. The close-model suite gives each strategy a deliberately accurate prior; this is a controlled favorable condition.

The update projects measured displacement onto the push direction. It uses both release displacement and total displacement. Shared start-position noise gives the two measurements positive covariance. The likelihood also includes an explicit model-error allowance that increases with predicted distance.

The update is performed in log space. A residual above four model standard deviations reopens support by mixing 70% uniform belief with 30% current belief before the update. This is a heuristic change response. Model structure errors, unobserved disturbances, and smaller changes can still go undetected.

The displayed 90% ranges are marginal grid quantiles. They are model-based credible ranges, not validated real-world coverage or safety bounds. The heatmap and its mean marker summarize a distribution that may have multiple peaks.

## Action selection

Every strategy searches the same action space: forces of 2, 3.5, 5, 6.5, and 8 N; a mix of fixed and target-scaled pulse lengths between 0.025 and 0.34 seconds; radial direction toward the measured target vector.

Task score:

~~~text
expected squared target error
+ 1.8 * probability of crossing the table limit
+ 0.0015 * (expected motion time + setup allowance)
~~~

Active subtracts `0.006 * information_score` when at least one future move remains. Information score is a Gaussian moment approximation: half the log determinant ratio between predicted measurement covariance with parameter uncertainty and measurement covariance alone. It is not exact expected posterior entropy reduction or a validated economic benefit.

The coefficients are declared design choices. No hyperparameter search was used to claim a win on the saved evaluation cases. More coefficient sensitivity and independent evaluation seeds remain useful follow-up work.

| Strategy | Belief update | Information bonus |
|---|---|---|
| Fixed | Keeps the full starting belief | None |
| Passive | Updates after each task move | None |
| Active | Updates after each move | Uses the declared bonus |

A learning move, called a probe in the data, is an Active action that differs from its own task-only best candidate. Such a move may also make task progress. It consumes a full action and its full simulated time. An exact numerical tie uses the task-only choice. Active with zero information weight is tested against Passive as an ablation.

Planning looks ahead one move. The candidate set is restricted. The policies are engineering baselines, not optimal controllers. The table-limit penalty can still permit a boundary failure; it is not a physical safety system.

## Paired evaluation

Three suites use 60 shared cases per strategy, with seed 2048:

- Unseen: friction sampled uniformly from 0.12 to 0.52, mass from 0.45 to 1.35 kg, with varied targets.
- Shift: the same initial distribution, followed by a new friction value after one move.
- Close: the initial distribution with an accurate, narrow starting prior.

The same case generator supplies both engines. Each suite has 180 episodes. There are 540 new MuJoCo episodes and 540 browser-model episodes. The earlier 1,200 free-glide runs remain a separate study.

Raw cases and per-episode outcomes are retained, including failures. Success is judged from the evaluator's actual object position, not a noisy observation or the controller's confidence. Final error, boundary crossings, moves, learning moves, and time include unsuccessful episodes.

Prediction error is evaluated against actual settled endpoints. An RMSE is computed for each episode; the reported value is the mean of those episode RMSEs. Success intervals use Wilson's 95% interval. Paired outcome counts and mean differences are also exported. There is no claimed significance test or universal advantage for Active.

See [results](robot-results.md). Real-world measurements, independent task families, geometry changes, unmodeled force error, and multi-seed policy tuning remain unvalidated.

## Product hypothesis

A robot team might use an adaptation module to reduce retuning when object properties change. The current deliverable tests the learning mechanism and its costs. Commercial savings, customer demand, integration effort, and hardware reliability have not been measured.

The next evidence step is measured force and object motion on a controlled physical fixture, with separate calibration and held-out evaluation data. A simulator-to-simulator result alone cannot establish transfer to real hardware.

## Related work and primary sources

- [Phys2Real, ICRA 2026](https://phys2real.github.io/): physical parameter priors and interactive online adaptation for planar manipulation. This establishes that related adaptation approaches already exist.
- [SIMPLER](https://proceedings.mlr.press/v270/li25c.html): paired simulated and real manipulation evaluation, including control and visual gaps.
- [MuJoCo computation](https://mujoco.readthedocs.io/en/stable/computation/index.html): contact and friction modeling assumptions.
- [MuJoCo XML reference](https://mujoco.readthedocs.io/en/stable/XMLreference.html): slide joints, contact pairs, and force motors.
- [NVIDIA Cosmos model reference](https://github.com/NVIDIA/cosmos/blob/main/docs/reference/models.md): world generation capabilities and documented physical-consistency limits.

This project studies a small, interpretable piece of physical adaptation. It does not reproduce or claim access to any company's private robot stack.
