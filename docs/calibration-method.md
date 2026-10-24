# Calibration workbench

## Purpose and evidence level

Fit a task-specific physics model to recorded motion, then evaluate it on separate whole trials. The workbench accepts external CSV files and includes three reproducible MuJoCo examples.

All built-in data is simulated. No real object or physical robot has been measured for this release. Imported data is marked external and unverified by default. A user can declare that it was collected on physical equipment; the software does not independently verify that claim. Every report keeps realWorldVerified and deploymentApproved false.

The tool tests prediction quality for the supplied conditions. Closed-loop robot policy transfer, real-world savings, and hardware reliability are separate questions.

## Supported physics

The object starts at rest on a flat surface. A centered radial push applies a constant, calibrated motor force for a known duration. Pusher mass is known at 0.06 kg. The object translates in XY with locked orientation. Coulomb friction has one coefficient shared between static and sliding behavior.

The model learns friction between 0.08 and 0.62 and object mass between 0.35 and 1.55 kg. It uses the same ideal radial-contact equations as the Experiment view. During the push, motor force accelerates both the pusher and object. After release, the object coasts under friction.

The force field means calibrated motor force delivered to that moving assembly. A contact-force sensor measures a different quantity: the force transmitted to the object. Such data needs a corresponding force model. Unknown motor scale, unknown pusher inertia, compliance, starting velocity, off-center contact, or time-varying force can bias the fitted parameters. Do not substitute a constant nominal force when it does not describe the recording.

## CSV format

Download the header-only template from the interface. It contains no placeholder measurements. Use a comma-separated UTF-8 file, with these nine columns:

| Column | Meaning |
|---|---|
| trial_id | A label shared by every sample from one complete push. Use a different label for each trial. Original labels are replaced on import. |
| split | calibration or validation; fixed for the whole trial. |
| time_s | Seconds from force onset. First sample is zero. Times must strictly increase. |
| x_m | Observed object-center X coordinate, in meters. |
| y_m | Observed object-center Y coordinate, in meters. |
| force_n | Constant calibrated motor-force magnitude, in newtons; 1–8 N. |
| dir_x | X component of the unit push direction. |
| dir_y | Y component of the unit push direction. |
| pulse_s | Force-pulse duration; 0.025–0.34 seconds. |

For example, direction (1, 0) pushes along X. Direction (0.6, 0.8) is also a unit vector. Coordinates may have any common origin within the supported ±5 m recording range. The prediction is anchored to the first measured position of each trial.

Use 8–400 samples per trial and at least two complete trials in each split. Record at least two nonzero-time samples during the pulse and three after release. Record useful coasting motion, rather than only a long static tail. Recordings are limited to 10 seconds per trial, 40 trials, 8,000 rows, and 2 MB.

Quoted labels and CRLF files are supported. Missing fields, extra columns, non-finite values, changing commands within a trial, and invalid units or directions are rejected. The same trial label cannot appear in both splits. An exact copied track across the two splits is also rejected. The tool cannot prove that differently labeled or partially overlapping recordings are independent; that remains a data-collection responsibility.

Use one object and surface condition for a calibration. If the condition changes, give that change a separate evaluation purpose. A fit from one object is not a universal model of every object.

## Fit and held-out check

Only calibration trials select the parameters. The search first evaluates the 247 friction/mass pairs used by the Experiment model. Four bounded local refinement stages follow, for 571 evaluations in total. This is a deterministic search with a restricted parameter range, not a guarantee of the global optimum for arbitrary data.

Each trial's loss is its mean squared two-dimensional position error over all samples after the starting sample. Each complete trial has equal weight in the objective, even if recordings have different numbers of samples. The first sample anchors predictions and is excluded from the error sum. Within a trial, recorded samples have equal weight.

After fitting, the parameters are frozen and evaluated on validation trials. Changing validation positions cannot change fitted parameters, the calibration error surface, or calibration-only identification diagnostics. Changing the starting model changes the before comparison, rather than steering the fit.

The reported RMSE is the square root of the mean trial MSE. End error is the mean distance at the final recorded sample. The last sample need not be a fully settled stop; predictions are evaluated at its recorded time. Worst-trial RMSE and lateral error help expose failures hidden by a mean. The graph projects travel onto the push direction; all metrics still count full XY error.

Starting-position noise is shared by later residuals, and time samples are correlated. The report provides descriptive losses. It does not treat every frame as an independent experiment or report a statistical confidence interval.

If validation feedback is used to change the model or choose collection settings, retain a separate final test dataset. Repeatedly tuning against validation does not create new independent evidence.

## Diagnostics

These are declared engineering heuristics:

- Low motion: calibration endpoint motion RMS below 1 cm.
- Weak identification: scaled local sensitivity condition exceeds 100, or is undefined. Finite differences use a 0.0001 parameter step, scaled by each search range.
- Parameter limit: a fit within 0.005 friction or 0.02 kg of a search edge.
- No validation gain: held-out RMSE fails to fall by more than both 0.5 mm and 1% of baseline error.
- Validation gap: held-out RMSE exceeds both 10 mm and three times calibration RMSE.
- Lateral motion: held-out lateral RMSE exceeds 10 mm.

The gain rule is not a significance test, hardware acceptance gate, or safety certificate. A local sensitivity check does not establish that the physical parameters are globally unique or correctly calibrated. In particular, an incorrect force scale can produce misleading parameter values even when trajectory predictions look good.

Poor identification is shown as Unclear in the interface. Failed validation, weak identification, and large off-axis residuals block the one-click prior handoff.

## Trying the fitted prior in Experiment

The optional handoff changes the prior mean friction and mass in the selected virtual Experiment case. Its selected uncertainty widths remain unchanged. It creates no hardware command, changes no saved benchmark, and does not claim that fitted parameters describe that different virtual case. A world-condition or seed change clears the applied prior.

The handoff is available only when diagnostics support identification and held-out improvement. It is a simulation exploration tool, rather than evidence of real robot policy transfer.

## Privacy and exports

Files are processed in a browser worker. There is no upload endpoint, analytics, cloud fitting, or persistent browser storage. Original trial labels are discarded by the parser and replaced with trial-001, trial-002, and so on. File names are not added to the dataset or report.

Report exports include the source declaration, model assumptions, candidate parameters, errors, diagnostics, counts, and trial summaries with new labels. They omit raw positions and input names. Track export is separate and retains numeric motion data with new labels. Replacing labels does not remove any sensitive information inherent in the motion data itself.

Imported files never become part of the hosted example data, repository, or source download. Only the explicit export buttons create files for the user.

## Reproducible examples

Run python -m scripts.calibration_samples, then node scripts/calibration_report.mjs. Each of the three predefined fixtures has eight calibration and eight validation pushes: 48 new MuJoCo contact trials in total. Position noise has 1.5 mm standard deviation, with seed 20261024.

- Matched: one object and surface across different force pulses in both splits.
- Drift: the validation surface has lower friction; calibration cannot learn a condition absent from its data.
- Quiet: motor force is below the useful-motion threshold, leaving parameters poorly identified.

Capture provenance includes source hashes and evaluator-only true parameters. The fitting worker receives only normalized commands and tracks. The examples deliberately exercise favorable, shifted, and uninformative data. They are workflow tests, not a broad robotics benchmark.

See [generated results](calibration-results.md), [robot model](robot-method.md), and [validation notes](verification.md).
