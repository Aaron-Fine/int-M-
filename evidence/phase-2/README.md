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

## Memory high-water (`MI-PERF-006`)

`tools/benchmark/run-release.ts` records one memory figure set per engine, in
`summary.md` (section `<engine> — memory (MI-PERF-006)`), in
`environment.json` and in `raw-observations.json` (key `memory`). The figures
are informational: they are not gates. Each is the maximum over one fresh page
per corpus case, and each carries the label of what it measures. A figure is
reported only when every case run produced a valid reading; if any case threw,
timed out, returned an error or read NaN, the figure is "not measured" (a
maximum over only some cases would pass for a complete one). The summary's
`Cases` column counts the cases that contributed, not polls.

| Engine   | Figure     | What it is                                                                                                                                                                                                                                       |
| -------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Chromium | `jsHeap`   | Main-thread V8 JS heap used (CDP `Performance.getMetrics`, `JSHeapUsedSize`), polled every 50 ms from navigation to the stable frame. Excludes worker heaps and ArrayBuffer backing stores. A lower bound on the true peak.                      |
| Chromium | `retained` | `performance.measureUserAgentSpecificMemory()` after the stable frame, on a cross-origin-isolated copy of the same build served only for this pass (the timing passes are never isolated). Includes workers and buffers. A snapshot, not a peak. |
| Firefox  | both       | **Not measured.** Under Playwright (WebDriver BiDi) Firefox has no CDP, no `performance.memory` and no `measureUserAgentSpecificMemory`, and `about:memory` is unreachable. No proxy (such as process RSS) is substituted.                       |

The headless smoke run (`npm run evidence:smoke`) observed
`measureUserAgentSpecificMemory` unavailable in the headless bundled Chromium
even on a cross-origin-isolated page, so `retained` read "not measured" there.
Whether branded headed Chrome supports it is unverified until the next release
session. A failure while measuring (a navigation timeout, say) also degrades
that figure to "not measured" with the error, and does not discard the engine
run. Each `retained` call is bounded at 30 s (Chrome may defer the result to
a garbage collection it forces after about 20 s); past that the figure reads
"not measured (timed out)".

The pass opens two fresh pages per case (32 for the full corpus). Expected
added duration: roughly a minute or two headless, from page loads and the
~50 ms polling. In branded Chrome, if `measureUserAgentSpecificMemory`
works, each `retained` call may wait for a garbage collection, up to the 30 s
bound, which is up to about 16 minutes more per session across 32 cases
(unverified; time one pass before the confirming session). `--skip-memory`
omits the pass for directional runs; the summary lists `memory` under skipped
passes and the section reads "Skipped (--skip-memory)". `--release` allows it
but a session that skips memory records no figure.

When Chromium's `retained` figure is "not measured", the reason is recorded
(for example, the page was not cross-origin isolated). A resumed engine's
evidence is kept as written; an engine recorded before this pass existed has
no memory section. A real peak across workers needs per-worker heap sampling
or an engine-level memory report; neither is available in both engines.

**What recording these figures does not establish.** The `jsHeap` figure
alone does not evidence `MI-PERF-006`: it is main thread only and excludes the
worker heaps and ArrayBuffer backing stores where the semantic frames live.
`MI-PERF-006` stays Partial until (b) a measured `retained` figure is recorded
from branded Chrome, and (c) the owner accepts the permanent Firefox gap
("not measured") as a documented limitation. A release session that records
only `jsHeap` does not change its status.

## Release sessions (`tools/benchmark/run-release.ts`)

Every browser evidence run since 2026-10-16 is one release session, started
with `npm run evidence:release` (or `node tools/benchmark/run-release.ts`
with the same flags). The per-purpose runners that preceded it
(`run-stage-a.mjs`, `run-operational.mjs`, `run-overhead.mjs`,
`run-renderer-path.mjs`, `run-b-gate.mjs`, and `release-browser.mjs`) were
retired on 2026-10-16. Run directories produced by them still carry their
original names and summaries; they are reproducible from the commits recorded
in their directory names and `environment.json`.

Usage:

```
node tools/benchmark/run-release.ts [--engines chromium,firefox] [--release]
  [--reps N] [--cases id,...] [--compare name=<query>|name=dist:<dir>]...
  [--skip-interactions] [--skip-memory] [--resume] [--out-dir DIR] [--interactions N]
```

`npm run evidence:release` is `--release`; `npm run evidence:smoke` is a
two-repetition screening run with one `--compare` arm, written to
`test-results/evidence-smoke/` (git-ignored) and labelled directional.
`--release` refuses `--cases` subsets and `--skip-interactions`, so a release
directory always covers the whole corpus and both passes.

**Engines.** One session per engine (default: Chromium and Firefox). Each
session builds the production bundle once, serves it with `vite preview` (on port 4185;
each `dist:` compare arm gets its own preview on 4186, 4187, …), and launches
the browser. A `--release` run refuses to start when the desktop session is
locked (logind `LockedHint`).

**Arms.** Every case runs two arms. Repetition 0 (cold) uses the declared
order; warm repetitions rotate it on the warm index, so each arm leads equally
often when the warm count is a multiple of the arm count:

- `hook`: the query `?perf=1`, with the render-trace hook present.
- `plain`: no hook. The per-sample RGBA hash must match `hook`.

Each `--compare` arm adds a third comparison. `name=<query>` runs on the
current build; `name=dist:<dir>` runs a separately built `dist`. Compare arms
are paired against `hook` and are hash-checked the same way.

**Repetitions.** The screening default is 9 paired repetitions. `--release`
runs branded headed browsers (Chrome through flatpak over CDP, Firefox over
WebDriver BiDi). Its default is 1 cold plus the smallest multiple of the arm
count that is at least 21 warm (23 repetitions for two arms, 22 for three). An
explicit `--reps` under `--release` must leave a warm count that is at least 21
and a multiple of the arm count; anything else exits with an error. A first-in-
context penalty of about 3% makes an unbalanced count bias the paired ratio.

**Passes.** Each engine runs a corpus pass, then an interaction pass (`cancel`,
`inflight-replay`, `recolor`, `semantic-cache`, `--interactions N` each, default
50, and at least 50 under `--release`). Provenance violations are counted, and
raced samples are reported rather than dropped. `--skip-interactions` omits the
second pass.

**Checkpoints and resume.** Each completed case is checkpointed to
`<outDir>/.partial-<engine>.json`. Without `--resume`, an existing partial file
stops the run, so an interrupted session is never silently overwritten. The
partial file starts with a protocol header (release flag, repetitions, arm
names, commit, case ids); `--resume` refuses a partial file whose header
differs from the current flags. With `--resume`, the run continues from the
checkpoint, and an engine whose `raw-observations.json` entry already matches
the repetitions, release flag, commit, cases and arms (and has no incomplete
case) is not measured again; its gates are re-evaluated from the stored
samples. The partial file is removed once that engine's evidence is written.

**Stalls.** A stalled render is retried once on a fresh context and marked
`retriedAfterStall`. A second stall abandons that case: it is recorded as
incomplete (stall count and reason), its remaining repetitions are skipped, the
run continues, and the case fails the gate. If the session is locked at that
point, the run stops with the resumable `session locked ... resume with
--resume` error instead. Gate failures already collected are printed before
an error ends the run.

**Outputs.** The default directory is `evidence/phase-2/<date>-<commit>-release/`
under `--release` and `evidence/phase-2/<date>-<commit>-directional/` otherwise;
`--out-dir` overrides it. The writer (`tools/benchmark/harness/evidence.ts`) emits:

- `environment.json`: the `capture-environment.mjs` skeleton plus a
  `browsers.<engine>` entry per engine. Each entry records the label
  (`release` or `directional`), the run scope (engines, cases, reps, arms,
  skipped passes), the BCa `seed` and `resamples`, `powerMode` (sysfs AC and
  platform profile), the calibrated `viewport`, and the `lockedHint` seen at
  session start.
- `raw-observations.json` (`schemaVersion: 1`, `byEngine`): per engine, the same
  protocol facts plus `release`, `reps`, `commit`, `caseIds`, `arms`, every
  sample individually (hook samples keep the stable computed frame of the render
  trace; plain samples have none), any `incomplete` cases, the interaction
  results and `ringBytes`. About 1 KB per hook sample as formatted (measured on a smoke run), so a
  release session stays well under the 5 MiB threshold.
- `summary.md`: the first lines state the label and the run scope, then one
  section per engine; re-running one engine replaces only that engine's
  section and the header.
- `manifest.sha256`: emitted last by `tools/benchmark/manifest.mjs`.

Paired intervals are 95% BCa intervals (`tools/benchmark/harness/stats.ts`,
seed recorded in `environment.json` and `raw-observations.json`). The speed ratio is the median paired
log-ratio, and the regression cap is the median paired difference.

**Gates.** Any failed gate makes the run exit non-zero, with one message per
failure:

- ring retention: ring bytes above 65,536;
- incomplete case: a case that stalled twice;
- budget: coarse or stable frame budget failures;
- hash mismatch between `hook` and `plain`. Compare-arm mismatches are
  reported per arm in the summary, not gated;
- hook overhead (release only): the pooled plain/hook lower bound must be at
  least 1/1.05, that is, hook overhead of at most 5%. Non-release runs print
  this as "not gated";
- provenance violations in the interaction pass.

**Headed release runs.** A `--release` session needs an unlocked desktop and
should run under a screensaver and power inhibitor, for example
`kde-inhibit --screenSaver --power npm run evidence:release`.

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

## Palette acceptance (`MI-UX-021`)

Palette evidence is computed, not measured in a browser.
`npm run evidence:palette -- <directory>` (`tools/palette_metrics.ts`) writes:

- `palette-metrics.json`: the method (CIEDE2000; Machado, Oliveira and
  Fernandes 2009 simulation at severity 1.0; the sampling grid), the floors
  (`tests/unit/palette/palette-floors.ts`), and for each palette every
  metric's value under normal, protan, deutan and tritan vision with its
  minimum and pass flag; once the palette ships, also the worst contrast of
  each text overlay over the raster and of an isolated period against the
  dimmed field around it.
- `summary.md`: the same as tables.

Directories are named `<date>-<commit>-palette-selection` (the candidate
comparison that chose the period palette) and `<date>-<commit>-palette` (the
shipped palette, with a browser record of the axe and end-to-end run). Format
both files with `npx prettier --write <directory>`, then emit
`manifest.sha256` with `node tools/benchmark/manifest.mjs <directory>`. No
screenshots are committed: the numeric matrix replaces the Phase 1 screenshot
matrix (tier 1 above), and browser screenshots are advisory (owner decision
Q6).
