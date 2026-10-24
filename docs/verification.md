# Validation

The English release keeps the original task and algorithms. It changes the presentation, removes hosting details, and starts from a clean source copy.

## Completed checks

| Check | Result |
|---|---|
| Python tests | 43 passed |
| JavaScript core and interface tests | 13 passed |
| MuJoCo reproduction | 1,200 runs completed |
| Success counts compared with the earlier release | All three test sets match |
| Python and JavaScript agreement | Covered by the Python test suite |
| Source and archive review | Checked for common private data and untranslated text |

Commands:

~~~bash
pytest -q
npm test
python -m scripts.reproduce
python scripts/package_source.py
python scripts/check_release.py
python scripts/check_public_files.py
~~~

The contact tests cover three friction values and three release speeds, including reverse motion. Other tests check hidden-value isolation, belief updates, action costs, repeatability, confidence intervals, and invalid input.

Interface tests use jsdom and a real background worker adapter. They cover starting, stepping, resetting, replaying MuJoCo data, running comparisons, loading saved results, and cancelling a comparison.

## Not completed

The local preview service was unavailable, so the release has not had a real-browser visual layout check. Interface tests do not establish that every screen size looks correct.

No physical robot, camera, actuator, or real-table test was run.
