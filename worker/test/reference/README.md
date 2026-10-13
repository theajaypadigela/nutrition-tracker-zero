# Reference implementations

`engine_ref.py` and `report_ref.py` are the independent second implementations of the targets engine and the
weekly report, reproduced verbatim from Appendices E and F of `WEEKLY_BREAKDOWN_PLAN.md`. They are Python,
standard library only, and are **not** production code: they exist so that two implementations, written
separately, can be made to agree (plan 11.1).

`generate_golden.py` runs them and writes the JSON fixtures in `../fixtures/golden/`, which the TypeScript
tests read. Regenerate after changing a reference value on purpose:

    python3 -I test/reference/generate_golden.py test/fixtures/golden

One deliberate difference from the plan's copy: the generator replaces Python's `round()` (banker's rounding,
exact halves go to the even neighbour) with round-half-up, which is what `Math.round` does in the Worker. None
of the sixteen personas sits on a half, so their numbers are unchanged; random inputs can.
