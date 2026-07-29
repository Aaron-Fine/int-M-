# Verification evidence

This directory contains reviewable results that are expensive, environment
dependent, or unsuitable as pass/fail CI assertions. Every result must record:

- the commit or branch baseline;
- the generating command;
- the date and execution environment;
- the number of samples;
- the measured cases and numerical budgets; and
- limitations that prevent the result from being generalized.

Deterministic evidence remains in tests and generated-data checks. Do not treat
a committed measurement as a permanent performance guarantee; rerun the
documented harness on the intended hardware when a phase criterion names a
hardware or interaction budget.

Numerical fixture and measurement data in this directory is dedicated to
CC0-1.0. Harness source and explanatory documentation remain GPL-3.0-only.
