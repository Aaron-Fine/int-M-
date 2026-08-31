# Phase 2 performance evidence

Normative Phase 2 performance evidence lives in dated, commit-stamped
directories:

```
evidence/phase-2/<date>-<commit>/
├── environment.json          # from tools/benchmark/capture-environment.mjs
├── raw-observations.json     # every stored sample; never aggregates only
├── semantic-comparison.json  # holdout/oracle comparison for the same runs
├── summary.md                # human-readable result and limitation record
├── wasm-build.json           # optional; only when the accelerated kernel ships
├── catalog-generation.json   # optional; only when workstream F ships
└── manifest.sha256           # from tools/benchmark/manifest.mjs, emitted last
```

- `<date>` is the run date (YYYY-MM-DD) and `<commit>` the short build
  revision under test. The directory name makes every artifact traceable to a
  build without trusting file contents.
- `environment.json` records the machine, browser, power, DPR, viewport, build
  and algorithm/catalog/verifier revisions, worker count, backend, and harness
  command/version per the plan §9 protocol. Browser-only fields start as null
  in the Node capture and must be filled before the run is quoted.
- `raw-observations.json` stores **every sample** of every case (per-repetition
  timings, cancellation interactions, per-sample status/period fields).
  Aggregates (median, MAD, p95, paired intervals) are derived views recorded
  alongside or in `summary.md`, never as the only record. A run that stores
  only aggregates is not admissible evidence.
- `semantic-comparison.json` records holdout and oracle comparisons for the
  same run: hashed discrete fields with documented byte order, continuous
  evidence by tolerance and distribution, and the holdout stratum of each
  disagreement (see
  [PERFORMANCE-CORPUS.md](../../docs/verification/PERFORMANCE-CORPUS.md)).
- `manifest.sha256` is produced by
  [`node tools/benchmark/manifest.mjs <directory>`](../../tools/benchmark/manifest.mjs)
  **after** all other files are final; `--check` re-verifies the directory and
  must pass before results are cited. A manifest regenerated after content
  changes must be committed together with the changed files and a note in
  `summary.md`.
- Optional artifacts: `wasm-build.json` (accelerated-kernel build and
  capability evidence) and `catalog-generation.json` (generated-catalog
  report) join the directory only if the corresponding workstream ships.

## Raw-sample discipline

1. Every repetition of every case is stored individually, including outliers
   and exclusions (exclusions recorded with reasons, never silently dropped).
2. Repetition counts follow the corpus protocol: 9–11 screening reps, 21+
   release-gate reps, ≥ 40 observations for any quoted p95, ≥ 50 cancellation
   interactions.
3. The resampling seed for BCa paired intervals is recorded in the run's
   `summary.md` or `raw-observations.json` metadata.
4. Committed measurements are not permanent performance guarantees; rerun the
   documented harness on target hardware when a criterion names a budget.

## PoC evidence

Proof-of-concept results (the `poc/performance/` harness) land in
`poc/performance/results/` with the same raw-sample discipline at reduced
repetition counts, and are explicitly labeled **directional**: Node/V8
approximates but does not replace controlled browser evidence, and PoC results
feed corpus and gate choices rather than close requirements.
