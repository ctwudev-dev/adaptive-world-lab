# Decision proposal: Adaptive Transfer Calibration

**Decision requested:** approve baseline discovery and a guarded, one-station pilot. Use a six-week planning window and an illustrative $35,000 allowance. Confirm the scope, budget, and trial design with the station owner before spending.

**Current status:** working simulation and decision-support prototype. No customer validation, production savings, or physical equipment integration has been demonstrated.

## 1. The problem worth investigating

Some transfer steps need a package or tote to stop within a target area. If surface or packaging conditions change, a fixed release recipe may need retuning. The business hypothesis is that repeated adjustments and handling exceptions can consume technician time and station capacity.

This is a proposed use case, not a measured customer pain point. Discovery must confirm its size and cause. Do not assume every conveyor transfer behaves like this model.

The intended sponsor is an Operations or Automation Engineering manager. A station owner, controls engineer, Quality representative, and Finance partner should own the pilot measures and decision.

## 2. Proposed product and fit

Build a calibration assistant that estimates changing friction from motion observations, shows its uncertainty, and recommends a release setting. Evaluate passive adaptation first. Use a separate probe only when its information is worth its cost.

The first equipment trial should recommend settings for operator approval. The current implementation is an offline model and proposal tool. It does not write to a PLC, operate a conveyor, or enforce physical safety limits.

Good fit: a guarded transfer in which post-release sliding and a measurable release speed materially affect stopping position.

Poor fit: a driven belt, unstable load, jam, deformable item, or contact geometry that dominates motion and is not described by the 1D model.

**Compare simpler alternatives first:** mechanical guides or stops, improved sensing, a stable fixed recipe, and a conventional passive estimator. Reject the software proposal if a simpler option solves the problem at lower total cost.

## 3. What already exists

| Implemented | Purpose |
|---|---|
| Numerical and MuJoCo station models | Test the same learning idea in two simulated worlds. |
| Friction belief and model updates | Track possible friction values rather than one unchanging guess. |
| Fixed, Passive, Active, and Robust strategies | Compare learning with simpler baselines and count probe cost. |
| Shared cases, source hashes, and raw exports | Make experiment results inspectable and repeatable. |
| Business-case calculator | Vary commercial assumptions, extra time cost, support, and investment. |
| Downside scenarios and JSON export | Show a failed financial case and preserve the entered assumptions. |

The box is a stand-in for one transferred item. The simulator is a 1D free glide with known release speed. It does not reproduce a complete industrial transfer station.

## 4. Technical evidence

Successful simulated runs out of 100:

| Test set | Fixed | Passive | Active | Robust |
|---|---:|---:|---:|---:|
| Unknown fixed friction | 83 | 99 | 100 | 27 |
| Friction changes after one move | 65 | 90 | 89 | 48 |
| Extra unmodeled drag | 88 | 100 | 99 | 24 |

These 1,200 MuJoCo runs show that adaptation can help this controlled task. They do not establish production exception rates or commercial savings.

In the fixed-friction set, Active used 3.42 moves on average; Passive used 2.98. Active gained one success while adding 0.44 moves. This is a reason to test whether a probe pays for itself, rather than to default to the most complex policy.

No significance test of differences between strategies was run. A run may contain up to six glides. A simulated run is not a production transfer, and its success percentage must not be inserted into the financial model.

## 5. Illustrative economics

All values below are placeholders for planning, not market benchmarks, quotes, or measured results. Currency is USD.

| Input | Sample value |
|---|---:|
| Transfers per year | 1,200,000 |
| Current exceptions per 1,000 | 12 |
| Target exceptions per 1,000 | 8 |
| Incremental value per avoided exception | $12 |
| Extra calibration and station-time cost per year | $5,000 |
| Support and upkeep per year | $6,000 |
| One-time pilot and integration | $35,000 |
| Simple payback target | 12 months |

    avoided cases = annual volume * (before rate - after rate) / 1,000
    gross annual benefit = avoided cases * incremental value per case
    annual net benefit = gross benefit - extra time cost - support cost
    first-year net value = annual net benefit - upfront cost
    simple payback months = 12 * upfront cost / annual net benefit

With these assumptions, avoided cases are 4,800 per year, gross benefit is $57,600, and annual net benefit is $46,600. First-year net value is $11,600 and simple value payback is about 9.0 months.

| Sensitivity | Post-pilot rate per 1,000 | Annual net benefit | Simple payback |
|---|---:|---:|---:|
| No improvement | 12 | -$11,000 | None |
| Half the assumed improvement | 10 | $17,800 | 23.6 months |
| Entered target | 8 | $46,600 | 9.0 months |
| Worse outcome | 13 | -$25,400 | None |

Under the same costs, a 12-month payback needs an after rate no higher than about 8.8 per 1,000. A 20% operational improvement alone would not necessarily meet this financial target. Both gates must pass.

Use incremental, non-overlapping cost. Time saved is capacity rather than cash unless Finance confirms that a real cost is avoided. Do not count the same downtime in both exception cost and extra time cost. Value lost capacity only where a genuine bottleneck makes it relevant.

This simple model excludes discounting, taxes, financing, and benefits outside the defined station. It is a screening tool, not a deployment decision.

## 6. Pilot plan and ownership

| Phase | Work | Output and owner |
|---|---|---|
| Week 1: baseline | Confirm the problem and compare mechanical or fixed-recipe alternatives. Define interventions, cost, cycle time, product groups, and stop events. | Operations + Finance: baseline and minimum worthwhile effect. |
| Week 2: guarded bench | Measure actual release speed and stopping position. Check model fit across a limited product family. | Controls Engineering: error report, safe test envelope, and fallback. |
| Weeks 3-4: controlled trial | Start with recommendations. Use approved windows and matched or randomized product/shift blocks. Include fixed, passive, and probe-enabled policies where appropriate. | Station owner + Quality: complete event logs and deviations. |
| Weeks 5-6: decision | Compare intervention rate, throughput, quality, added time, and all costs. Include failures and overrides. | Sponsor: stop, extend testing, or authorize a separately reviewed next stage. |

Six weeks is a planning window. Required sample size depends on baseline rarity, the minimum worthwhile effect, and clustering by product and shift. Calculate it from the measured baseline; 100 simulation cases are not a valid production sample-size argument.

Suggested event fields: anonymous transfer reference, product group, policy, measured release speed, start/end position, manual intervention, exception type, cycle time, calibration time, override, stop event, and model version. Use the minimum data needed; do not collect operator names.

## 7. Proposed acceptance and stop gates

Agree on these before collecting outcomes. They are proposed targets, not standards or achieved results.

- At least 20% lower operator-intervention rate in matched product groups, with a pre-agreed uncertainty analysis.
- No more than 2% throughput loss; no worsening of damage, jam, or stop events.
- Measured costs support the agreed payback target, including calibration time and support.
- A named equipment owner approves the safe envelope, setting changes, rollback, and incident handling.

Stop or redesign if the model cannot explain observed motion, release speed is unreliable, the lower-cost alternative wins, or added time removes the business benefit. No automatic production rollout follows from a positive calculator result.

## 8. Planning allowance

An illustrative $35,000 allowance can be split into $20,000 for engineering, $8,000 for sensing and guarded integration, $4,000 for evaluation, and $3,000 contingency. These are unquoted placeholders. Re-estimate after discovery and avoid counting existing staff time as new cash spend unless appropriate.

Do not commit the full allowance before the baseline and fit checks. The first funded milestone should be discovery and bench validation; later work should depend on evidence.

## 9. Commercial path and open questions

If the pilot works, the next product would be a repeatable commissioning and calibration package for a narrow class of transfer stations. Compare a per-station license plus support with internal tooling. Pricing, buyer willingness to pay, sales cycle, integration burden, and support liability remain unvalidated.

Before calling this a business, confirm: how often retuning occurs, what each exception truly costs, which party owns controls changes, whether the simple model fits, and whether the result beats mechanical improvements and passive learning.

## 10. Industry context and references

- [Dorner: six product-transfer methods](https://www.dornerconveyors.com/asia/blog/which-product-transfer-is-best-pros-and-cons-of-6-transfer-methods) describes transfer choices for handling and positioning products and their application trade-offs. It supports the problem domain, not this project's performance.
- [Siemens: virtual commissioning for material handling](https://blogs.sw.siemens.com/tecnomatix/virtual-commissioning-for-material-handling-in-just-minutes-for-free/) describes testing automation logic in a virtual material-handling system before work on the production floor. It supports the validation workflow, not this prototype's readiness.
- The project's raw simulation data and detailed methods are in results and docs/method.md.
