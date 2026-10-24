# Earlier transfer-station proposal

This guide describes the version 1.1 use-case study. The current project is [Robot Physics Lab](../README.md).

# Adaptive Transfer Lab

**A business pilot proposal for a material-transfer calibration assistant.**

This project asks whether a station can learn changing surface conditions well enough to reduce manual tuning and positioning exceptions - while paying for the time it spends learning.

It combines a working physics prototype with an interactive business case, a pilot plan, and clear acceptance gates.

**Start here:** [decision proposal](business-proposal.md) · [two-page brief](../dist/transfer-pilot-proposal.pdf) · [technical evidence](results.md)

## The business problem

A package or tote may stop short or overshoot after a transfer. Changing packaging or surface conditions may require a new release setting. Repeated adjustments and operator interventions can consume time and capacity.

That is the use-case hypothesis. No customer baseline or production saving has been measured for this project.

The proposed buyer is an Operations or Automation Engineering team responsible for one station. The pilot should compare this idea with mechanical guides, a stable fixed recipe, and simpler passive learning.

## The proposal

Approve baseline discovery and guarded bench tests for one station and a defined product family. Use six weeks as a planning window. Treat the sample $35k allowance as a placeholder to be re-estimated, not a quote or a request to deploy.

The intended first equipment workflow is a recommendation for operator approval. The current release is an offline simulator and decision-support tool. It does not control production equipment.

## What the working product shows

| Part | What it lets a reviewer do |
|---|---|
| Business case | Change volume, exception rates, direct cost, extra time, support, and investment. |
| Downside analysis | See when the assumed improvement misses the payback target or loses value. |
| Station model | Inspect friction estimates, candidate moves, predictions, and model updates. |
| Evidence | Compare four strategies across shared cases, including failures and probe cost. |
| Pilot plan | Review ownership, measures, stop rules, and go/no-go gates. |
| Export | Download the proposal, source, raw experiment data, and entered financial assumptions. |

The interface labels what is built, what is assumed, and what still needs a real trial. A positive financial scenario never changes the deployment status to approved.

## Try it locally

You need Python to serve the static app. The browser app itself needs no API key or GPU.

~~~bash
python -m http.server 8080 --directory dist
~~~

Open [localhost:8080](http://localhost:8080). Start on **Business case**, try the **Less improvement** and **Worse outcome** scenarios, then inspect **Station model** and **Evidence**.

All calculations and exports run in the browser. The app does not upload entered business assumptions.

## Illustrative economics

The sample case assumes 1.2 million transfers per year, a change from 12 to 8 exceptions per 1,000, $12 per avoided exception, $5k in extra time cost, $6k in annual support, and $35k upfront.

| Modeled output | Value |
|---|---:|
| Gross annual benefit | $57,600 |
| Annual net benefit after time and support | $46,600 |
| First-year net value after upfront cost | $11,600 |
| Simple value payback | About 9.0 months |

**These are scenario calculations, not achieved savings or market benchmarks.** If the rate only improves to 10 per 1,000, modeled payback rises to about 23.6 months. With no improvement, ongoing costs lose $11,000 of value per year.

Time saved is capacity, not cash, unless Finance confirms an avoided cost. The model does not turn simulation success percentages into production exception rates.

## Technical evidence

The release retains 1,200 MuJoCo runs: three test sets, 100 cases each, and four strategies.

| Successful simulated runs / 100 | Fixed | Passive | Active | Robust |
|---|---:|---:|---:|---:|
| Unknown fixed friction | 83 | 99 | 100 | 27 |
| Friction changes | 65 | 90 | 89 | 48 |
| Extra drag | 88 | 100 | 99 | 24 |

Active used 3.42 moves on average in the first set; Passive used 2.98. The extra 0.44 moves are a commercial trade-off. The pilot should establish when a separate probe is worth paying for.

No between-strategy significance test was run. Simulation success is not proof of production reliability or financial benefit. See [results and limitations](results.md).

## Run the engineering checks

Python 3.10+ and Node.js 18+:

~~~bash
python -m venv .venv
source .venv/bin/activate
pip install -e '.[mujoco,test]'
npm ci
pytest -q
npm test
python scripts/check_public_files.py
~~~

On Windows, activate with .venv\Scripts\activate. For full experiment reproduction, use requirements-repro.txt and python -m scripts.reproduce.

The business release passed 64 local tests: 43 Python and 21 JavaScript checks. The two-page brief was rendered and visually reviewed. Live-browser layout review remains incomplete; see [verification notes](verification.md).

To rebuild the brief, install the optional proposal dependencies:

~~~bash
pip install -e '.[proposal]'
npm run proposal
python scripts/package_source.py
python scripts/check_release.py
~~~

## Scope and next stage

The station model is one-dimensional free sliding with known, exact release speed. It does not include a conveyor drive, jams, a robot arm, camera tracking, PLC integration, or physical safety enforcement.

Before a live pilot, measure release speed, check model fit, and define an approved equipment envelope. Reject the idea if a simpler hardware or fixed-recipe change offers better value.

## Project map

| Path | Purpose |
|---|---|
| [docs/business-proposal.md](business-proposal.md) | Decision request, economics, buyer, pilot, risks, and open commercial questions. |
| [dist/business-case.js](../dist/business-case.js) | Validated scenario calculations and assumption export. |
| [dist/business.js](../dist/business.js) | Business interface and saved-evidence summary. |
| [awm](awm) | Independent Python controllers, simulator interfaces, and evaluation. |
| [dist/engine.js](../dist/engine.js) | Matching browser physics and control implementation. |
| [tests](tests) | Physics, isolation, interface, business arithmetic, and downside checks. |
| [docs/research-guide.md](research-guide.md) | Original research overview and reproduction commands. |
| [docs/verification.md](verification.md) | Completed checks and remaining verification limits. |

The repository name and Python package retain the original Adaptive World Lab identity. The proposal is the business-facing layer over that research core.

See [privacy notes](privacy.md). Source files exclude personal contacts, local configuration, and hosting identifiers.
