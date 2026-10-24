# Method

## Task

The controller chooses a release speed for a box on a horizontal surface. It waits for the box to stop, reads a new position, and plans again.

| Setting | Value |
|---|---|
| Box mass | 1 kg |
| Gravity | 9.81 m/s² |
| Default starting position | 0.38 m |
| Default target center | 1.65 m |
| Success tolerance | Box center within 0.06 m of the target |
| Allowed box-center range | 0.08 to 2.32 m |
| Move limit | 6, including probes |
| Maximum release speed | 2.3 m/s |

Crossing the boundary ends the run in failure. The simulator does not model falling off a table.

Speed is a calibrated, instantaneous release command. The task does not include an arm, pushing contact, camera input, or actuator delay. Only friction is unknown. The same identification assumptions may fail if mass, release speed, and actuator gain are also unknown.

## Two independent worlds

The controller predicts signed stopping distance with:

    Δx = v₀ |v₀| / (2 μ g)

The numerical world does not call this stopping-distance function. It integrates velocity and position with a 0.002 s time step.

The MuJoCo world uses a plane, a 1 kg box, gravity, sliding joints along x and z, and frictional contact. Its time step is 0.001 s. Rotation is locked. Setting the initial velocity represents the calibrated release.

Optional test changes:

- Friction changes after a specified move, without a warning to the controller.
- Extra drag adds acceleration -βv|v|, with β = 0.7 m⁻¹. The controller does not model this drag.

## A belief over friction

The model keeps probabilities over 81 friction values from 0.08 to 0.80, spaced by 0.009. The default starting belief is a truncated Gaussian with mean 0.44 and standard deviation 0.16.

After each move, it compares the observed displacement with each friction hypothesis:

    p(μ | D) ∝ p(D | μ) p(μ)

The likelihood uses:

    σ² = 2 σ_position² + 0.003² + (0.025 |Δx_predicted|)²

This noise allowance is an engineering choice. It is not a learned or validated error model.

- Updates use log likelihoods to avoid numerical underflow.
- Each update mixes in 1% of the starting belief so the model can recover after a change.
- A standardized prediction error above 4 resets the belief to its starting range before that update.
- The displayed 95% friction interval describes the model belief. The stopping band propagates parameter uncertainty only. Neither is a full 95% safety guarantee.
- With extra drag, the friction estimate may absorb an effect that the model is missing. Task success does not mean the estimated friction is correct.

## Task planning

The planner samples 64 speeds toward the target. It predicts one full glide, executes that move, then plans again.

| Strategy | Planning rule |
|---|---|
| Fixed | Minimize stopping error under one fixed friction value. |
| Passive | Minimize expected squared error under the current belief. Learn after every move. |
| Active | Use the Passive task planner, with an additional option to probe. |
| Robust | Minimize the worst stopping error over the full friction range. Never update the belief. |

The loss adds 0.0008v² for speed and 25 for a predicted boundary crossing.

This is one-step, sampling-based receding-horizon control. It does not solve a multi-step optimal MPC problem. The fixed model knows the motion equation but keeps a fixed friction estimate. It is not a comparison against every possible high-fidelity fixed model.

## Choosing a probe

If the belief standard deviation is above 0.055, Active tests six candidate speeds:

    [0.30, 0.45, 0.60, 0.75, 0.90, 1.05] m/s

It scores each candidate with:

    score(a) = I(μ; Δx | a, D) - 3 E[|Δx|] - 0.03 v₀²

Information gain means the expected reduction in uncertainty about friction. It is approximated on a 96-point observation grid, in nats.

The controller rejects a probe if:

- Its estimated boundary-crossing probability is above 0.001.
- Its expected displacement exceeds 55% of the remaining distance.

It probes only if the best score is above 0.25. Otherwise it takes a task move. This rule is a clear, testable heuristic. It does not solve optimal dual control.

## Keeping the answer hidden

The experiment runner owns the full scenario and world. The controller receives a separate ControllerConfig and noisy position observations.

- Python rejects a full Scenario passed directly to Controller.
- Scenario.public() builds an allowlisted controller configuration.
- The browser runner also builds an allowlisted configuration.
- Only observation data goes into the learning update.
- True parameters, trajectories, and evaluation data are kept for scoring and display.
- MuJoCo model and data objects are not passed to the controller.

These boundaries are tested. They are not protection against a developer who changes the program.

## References

- [MuJoCo Python API](https://mujoco.readthedocs.io/en/stable/python.html)
- [MuJoCo computation and contact model](https://mujoco.readthedocs.io/en/stable/computation/)
- [MuJoCo contact-pair settings](https://mujoco.readthedocs.io/en/stable/XMLreference.html#contact-pair)
