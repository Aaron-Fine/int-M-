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

Phase 1 uses a dated automation-baseline record for exact CI provenance, the
[home-test procedure](../docs/verification/PHASE1-HOME-TEST.md), and a
[prefilled final-candidate closeout form](phase-1/manual-closeout-2026-08-29.md).
The generic [manual evidence template](phase-1/manual-template.md) remains for
later runs. Committed production
observations belong under `deployment/`; target-device browser results belong
under `phase-1/`. The current merged candidate is recorded in
[automation-2026-08-18.md](phase-1/automation-2026-08-18.md) and
[final-candidate automation record](phase-1/automation-2026-08-29.md), including
an exact-commit target-device UI-path replay.

Numerical fixture and measurement data in this directory is dedicated to
CC0-1.0. Harness source and explanatory documentation remain GPL-3.0-only.
