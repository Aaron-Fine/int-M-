# Phase 2 performance evidence

Normative Phase 2 performance evidence lives in dated, commit-stamped
directories:

```
evidence/phase-2/<date>-<commit>/
├── environment.json          # from tools/benchmark/capture-environment.mjs
├── raw-observations.json     # every stored sample; plain JSON for small runs
├── raw-observations.jsonl.gz # alternative record stream for large runs
├── semantic-comparison.json  # holdout/oracle comparison for the same runs
├── summary.md                # human-readable result and limitation record
├── artifact-index.json       # required for compressed or external payloads
├── wasm-build.json           # optional; only when the accelerated kernel ships
├── catalog-generation.json   # optional; only when workstream F ships
└── manifest.sha256           # from tools/benchmark/manifest.mjs, emitted last
```

Exactly one `raw-observations` form is present in a run. Existing plain-JSON
runs remain valid; producers may switch to the compressed form only after the
reader and validator support described below lands.

- `<date>` is the run date (YYYY-MM-DD) and `<commit>` the short build
  revision under test. The directory name makes every artifact traceable to a
  build without trusting file contents.
- `environment.json` records the machine, browser, power, DPR, viewport, build
  and algorithm/catalog/verifier revisions, worker count, backend, and harness
  command/version per the plan §9 protocol. Browser-only fields start as null
  in the Node capture and must be filled before the run is quoted.
- `raw-observations.json` (or its deterministic gzip form) stores **every
  sample** of every case (per-repetition
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

## Repository retention policy

Evidence has three storage tiers. This policy is prospective: existing
committed run directories remain valid and must not be rewritten merely to
change encoding.

1. **Review surface — tracked, readable text.** Always commit `summary.md`,
   `environment.json`, `semantic-comparison.json`, `manifest.sha256`, and
   small derived tables. These are the human review and source-discovery
   surface. Do not commit screenshots of data that can be represented by these
   files.
2. **Ordinary raw payload — tracked JSON.** Commit every raw sample in readable
   JSON while an individual artifact is below 5 MiB. Mark bulk generated data
   with `.gitattributes` (`linguist-generated=true -diff`) so it does not
   dominate routine code review; summaries and manifests remain diffable.
   Git's object store already compresses and delta-packs this text, so adding
   an archive or LFS pointer at the current scale would reduce accessibility
   without a material storage win.
3. **Large raw payload — tracked, compressed record stream.** At 5 MiB or
   larger, encode observations as canonical JSON Lines and store deterministic
   gzip (`mtime = 0`, no original filename) as
   `raw-observations.jsonl.gz`. A compressed payload requires
   `artifact-index.json` containing its schema revision, media type, encoding,
   record count, compressed and uncompressed byte counts, and SHA-256 of the
   uncompressed canonical bytes. The manifest continues to hash the checked-in
   compressed bytes. Harness readers and validators must accept both forms
   before a producer switches formats.
4. **External immutable payload — exceptional.** If one compressed payload
   exceeds 25 MiB or committed Phase 2 evidence is projected to exceed
   100 MiB, review whether to store the payload in a durable
   content-addressed release/object store. If moved, commit the summary,
   environment, semantic comparison,
   `artifact-index.json`, retrieval location, retention policy, and both
   compressed/uncompressed hashes. Ephemeral CI artifacts are not admissible.
   Git LFS is acceptable only if cloning, archival retention, and unauthenticated
   reviewer access are guaranteed for the project; it is not the default.

Why: the current branch's tracked JSON is only about 12 MiB, so rewriting
today's evidence or adopting Git LFS would add more operational complexity
than value. The present problem is more than 432,000 pretty-printed lines in
change statistics and review tools, which generated-file attributes address
without making the evidence harder to inspect. Deterministic JSONL gzip is the
next tier when individual artifacts become materially large; the external
tier prevents repeated experiment matrices from growing the repository
without bound.

Run directories are immutable records. A correction creates a new run or an
explicitly documented replacement; it never silently edits raw observations.
Generators should write to a temporary file, validate record counts/schema,
atomically publish the final payload, then emit `artifact-index.json`, summary,
and `manifest.sha256` last.

## Stage A runs (`tools/benchmark/run-stage-a.mjs`)

Stage A (paired legacy-scan vs checkpoint classifier evidence, plan §9) adds
these documented evolutions to the directory contract:

- `environment.json` keeps the `capture-environment.mjs` skeleton and fills
  the browser fields for the primary engine (Playwright Chromium), records
  per-engine facts under an added `browsers` map (each entry carries the
  browser build, user agent, headless state, DPR, calibrated viewport, worker
  count, and the "automation-bundled, directional only" label), and adds a
  `protocol` block (build mode, pairing and cold/warm interpretation,
  out-of-scope interactions, wall metric, hash byte order).
- `raw-observations.json` stores samples under `samplesByEngine` (one array
  per engine; every sample is timestamp-free and carries the full opt-in
  render-trace snapshot). A second engine run into the same directory extends
  the arrays rather than replacing them.
- `semantic-comparison.json` records `comparisonsByEngine`; per case ×
  repetition it stores both hashes and their equality, with the documented
  byte order (row-major RGBA via `getImageData`) and the honest scope note
  (palette-inclusive proxy; no per-pixel period histogram exists in the ring).
- `summary.md` is regenerated from the merged per-engine data on every run;
  when content changes, the manifest is re-emitted and the change is noted in
  the commit.
- Each engine run ends by re-emitting `manifest.sha256` (last, per the
  contract above); `--check` must pass before results are cited.

Stage A is a screening-protocol run (9 paired repetitions, automation-bundled
headless engines): it is the directional baseline record for the absolute
latency budgets, not release-gate evidence. Release-gate evidence still needs
the declared target hardware, branded stable Chrome and Firefox, headed runs,
and ≥ 21 paired repetitions with BCa paired intervals.

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
