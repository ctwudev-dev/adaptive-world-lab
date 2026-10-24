# Validation

Release 1.1 adds a business proposal, scenario economics, and a pilot-review interface over the original research core. The physics and controller source files used by the saved experiments are unchanged.

## Completed checks

| Check | Result |
|---|---|
| Python tests | 43 passed |
| JavaScript core, business-case, and interface tests | 21 passed |
| Total local tests | 64 passed |
| Saved MuJoCo data | 1,200 recorded runs retained from the research release |
| Saved experiment source hashes | Verified against the unchanged physics/controller files |
| Two-page decision brief | Both pages rendered and visually reviewed |
| Python and JavaScript agreement | Covered by the Python test suite |
| Source and archive review | Checked for common private data and untranslated text |

Commands:

~~~bash
pytest -q
npm test
python -m scripts.reproduce
node scripts/business_case_sample.mjs
python scripts/build_proposal.py
python scripts/package_source.py
python scripts/check_release.py
python scripts/check_public_files.py
~~~

The contact tests cover three friction values and three release speeds, including reverse motion. Other tests check hidden-value isolation, belief updates, action costs, repeatability, confidence intervals, and invalid input.

Interface tests use jsdom and a real background worker adapter. They cover the business entry view, navigation, invalid input, downside cases, starting, stepping, resetting, replaying MuJoCo data, running comparisons, loading saved results, and cancelling a comparison.

Business-case tests check all cost terms, losses, zero-cost edge cases, payback thresholds, input validation, sensitivity, and exports. A positive financial result never sets deployment approval. The PDF reads the shared sample calculations and saved simulation summaries rather than inventing commercial outcomes.

The full experiment reproduction command above rebuilds the research data. It was not repeated for the business presentation change; source hashes and data integrity were checked instead.

## Not completed

The web layout still needs a real-browser visual review. Interface tests do not establish that every screen size looks correct. The PDF visual review does not substitute for a browser layout review.

No physical robot, camera, actuator, or real-table test was run.

No customer baseline, equipment pilot, production saving, willingness to pay, or deployment readiness has been validated. The financial examples are assumptions.
