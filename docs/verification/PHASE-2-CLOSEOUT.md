# Phase 2 performance closeout

- Assessment date: 2026-10-15
- Production baseline: `main` after PR #23 (`93a701f`) plus the
  `phase-2/closeout` branch (observability integration, evidence runners,
  and this record).
- Declared target hardware: the i7-1185G7 laptop (4 cores / 8 threads,
  16 GB, Fedora 44, AC power, balanced platform profile). Every
  release-protocol run below ran there in branded stable Chrome 155 and
  Firefox 157, headed, with the session kept awake by
  `kde-inhibit --screenSaver --power`.
- Status: **Proposed.** Gate results are measured. The latency budgets and
  the conditional-workstream dispositions are proposals for the project
  owner; they become final when the approval at the end of this record is
  filled in.

Status vocabulary follows the [Phase 0/1 closeout](PHASE-0-1-CLOSEOUT.md):
**Pass**, **Partial**, **Not met**, plus **Proposed** for a drafted decision
awaiting approval.

## Exit criteria (plan §12, final Phase 2 exit criteria)

| Criterion                                                                                                                               | State                                                                           | Evidence and disposition                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Required workstreams meet their gates in both stable browsers; every conditional experiment has a recorded accept/reject disposition    | **Partial**                                                                     | A, C, D pass in both browsers. **B is not met in Firefox** and is superseded for users by C (owner decision 2026-10-16; see B). Dispositions are decided below (H spike pending). [Required workstreams](#required-workstreams); [conditional dispositions](#conditional-workstream-dispositions).                                                            |
| The required path achieves ≥2× on declared worst hard cases and the frozen absolute latency budgets                                     | **Pass** (budgets approved 2026-10-16; Easy on the mirror-free build projected) | Hard-known cases 4.02×–11.05× (Chrome) and 10.97×–23.55× (Firefox) faster than the previous default, every BCa lower bound above 3.7×. Proposed budgets below are met in both browsers.                                                                                                                                                                       |
| Categorical results satisfy the high-precision oracle/holdout contract; reviewed conservative changes from legacy output are documented | **Pass**                                                                        | The default kernel is bit-identical to the reference lag scan on every frozen-corpus pixel at the shipping raster, so no stratum's holdout disagreement can change; all 572 release stable-canvas hash pairs match. Conservative changes from pre-Phase-2 output are the PR 3 verifier reductions, oracle-adjudicated in `orbit-oracle-adjudication.test.ts`. |
| If F ships, the dynamic catalog UI passes accessibility validation; otherwise the curated layer's Phase 1 validation stands             | **Pass**                                                                        | F did not ship; the curated layer's Phase 1 accessibility evidence stands, and the browser accessibility scenarios pass on this branch.                                                                                                                                                                                                                       |
| Mathematics, requirements, ADRs, implementation, generator, evidence, and SysML views agree                                             | **Pass**                                                                        | [Document agreement](#document-agreement).                                                                                                                                                                                                                                                                                                                    |
| Every experiment that did not ship is recorded with its measurements and kill rationale                                                 | **Met** (H spike pending)                                                       | [Conditional dispositions](#conditional-workstream-dispositions) with the evidence in [WORKSTREAM-DISPOSITIONS.md](WORKSTREAM-DISPOSITIONS.md) and [STAGE-A-GATE-ANALYSIS.md](STAGE-A-GATE-ANALYSIS.md).                                                                                                                                                      |

## Required workstreams

### A — corpus, timing, bounded observability

Gate (plan §5): `Reproducible runs in stable Chrome and Firefox;
cache/replay/cancel sources distinguishable`. **Pass.**

- Reproducible runs: the release-protocol Stage A run completed in both
  branded browsers against one build
  ([evidence](../../evidence/phase-2/2026-10-11-59926c5-watched-lag-release/summary.md)).
- Sources distinguishable: the observability integration (frame provenance,
  compute identity, worker and band timing, acknowledgment and quiescence)
  landed on this branch, and the operational suite
  ([evidence](../../evidence/phase-2/2026-10-15-9e70551-operational/summary.md))
  drove 50 interactions per distribution through the real UI in both
  browsers with **zero provenance violations**:

| Distribution (per browser, n = 50)   | Chrome median (p95) | Firefox median (p95) |
| ------------------------------------ | ------------------- | -------------------- |
| Cancel acknowledgment                | 8.6 ms (16.4 ms)    | 1.0 ms (2.0 ms)      |
| Cancel to child quiescence           | 8.6 ms (16.4 ms)    | 5.0 ms (7.0 ms)      |
| In-flight replay, request to present | 45.6 ms (100.4 ms)  | 53.0 ms (94.0 ms)    |
| Recolor, request to present          | 41.3 ms (61.2 ms)   | 40.5 ms (54.0 ms)    |
| Semantic cache, request to present   | 24.1 ms (32.7 ms)   | 36.0 ms (46.0 ms)    |

Firefox coarsens timers to 1 ms. In Chrome the acknowledgment waits for the
worker's next row yield, so it lands with quiescence.

Overhead (plan §8: opt-in diagnostics ≤5%; the always-on recorder ≤0.2 ms
per frame and ≤64 KiB retained), paired BCa on the pooled median log-ratio:

| Opt-in mode                                                                                                                                          | Chrome pooled Δ [95% BCa]                                                                                                     | Firefox pooled Δ [95% BCa]                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `?perf=1` hook on the production kernel, 88 pairs per case ([Chrome](../../evidence/phase-2/2026-10-15-9e70551-overhead-hook88-chromium/summary.md)) | −0.71% [−4.83%, +4.32%]: **within 5%**                                                                                        | 21 pairs per case, 273 pooled ([release session](../../evidence/phase-2/2026-10-16-8b9d091-release/summary.md)): plain/hook 0.987 [0.961, 1.000], so the hook costs at most 4.1%: **within 5%** |
| `?perf=1&perfCounters=1` (instrumented legacy-scan kernel in both arms)                                                                              | −6.00% [−7.92%, −4.71%] ([evidence](../../evidence/phase-2/2026-10-15-9e70551-overhead-counters-chromium/summary.md)): within | +9.45% [+3.02%, +13.18%] ([evidence](../../evidence/phase-2/2026-10-15-9e70551-overhead-counters-firefox/summary.md)): **exceeds 5%**                                                           |

The hook shows no measurable cost in either browser. The Firefox interval
comes from the 2026-10-16 release session's 273 pooled pairs, which replace
the 88-pair run that was refused on a locked session. The release session's
Chrome pooled result agrees: plain/hook 0.996 [0.981, 1.007]. The counters mode cost about 10% in Firefox, so under plan
§8 ("If a metric exceeds the budget, move it to an offline experiment") it
is now **offline only** (owner decision, 2026-10-16): the browser has no
`perfCounters` parameter and no counters on the worker protocol, and the
counts came from `npm run bench:lag-comparisons` (removed 2026-10-16, ADR 0007) and the tournament judge
(a counted `CpuRenderer` render classifies in process). Retention and recorder cost are in each overhead summary.

### B — allocation-free scalar kernel

Gate (plan §5): `≥10% classifier or ≥8% end-to-end improvement in both
browsers; semantic parity`. **Not met in Firefox** (pass in Chrome).

Release whole-build comparison
([evidence](../../evidence/phase-2/2026-10-15-9e70551-b-gate/summary.md)): the
pre-PR-2 build `a6e1838` against the current build, both arms on the
`legacy-scan` reference kernel with mirroring off, reached through the real
pointer UI, 21 warm pairs per case.

- **Chrome:** every case improves; paired classifier improvement 25.9%–46.5%
  on hard-known views and 9.9%–76.3% elsewhere; no regression flag.
- **Firefox:** easy views improve (classifier 49%–78%), but six release-gate
  cases are **27%–51% slower** on the current build (BCa-flagged), e.g. 126×
  7.8 s → 10.9 s classifier.

The comparison mixes PR 2 with every later change to the legacy-scan path
(verifier, renderer-path bundle), so it bounds rather than isolates PR 2,
and the regression sits in the reference mode, not in what users run: the
production default is 4.7×–26× faster than this same legacy mode in Firefox
(Stage A above). **Disposition (owner decision, 2026-10-16): B is not met in
Firefox and is superseded for users by C** (the watched-lag kernel keeps PR
2's allocation-free structure). The cause of the SpiderMonkey legacy lag-scan
slowdown was not isolated: it may be PR 2 itself or shared code (verifier,
renderer path). The follow-up is dormant: reopen only if a Firefox view misses
its frozen budget, and then bisect `a6e1838`..`872f613` (the last tree with
`legacy-scan`) in headed Firefox. `legacy-scan` has since been removed (ADR 0007),
and the judge baseline is now the production renderer.

### C — reduce the lag-scan cost (realized as the watched-lag kernel)

Gate (plan §5): `Lag comparisons reduced >50%; weighted median ≥25%; hard
views ≥2×; no case >5% slower`. Kill: `Any false attracting result or wrong
primitive period; unresolved rate +>0.1 percentage point`.

The plan's PR 4 shipped the checkpoint schedule behind a flag. The default
that closes C is the watched-lag triggered scan of
[ADR 0006](../decisions/0006-watched-lag-default-classifier.md), accepted
2026-10-15. Paired against the previous default (legacy scan, conjugate
mirroring off):

- **Hard views ≥2×: pass.** Every release-gate case clears 2× in both
  browsers: Chrome 1.67×–16.45× (the only case under 2× is
  `mi-fallback-ambiguous-boundary`, a fallback case, not a declared hard
  view; hard-known 4.02×–11.05×), Firefox 4.68×–26.06×.
- **No case >5% slower: pass.** Zero regression flags under the plan §9 rule
  (paired median > max(5%, 20 ms) with a BCa interval excluding zero) across
  13 cases × 2 browsers.
- **Weighted median ≥25%: pass.** No weighted aggregate was declared before
  the release data, so this record uses equal case weights and says so. The
  median per-case reduction in stable time (1 − candidate/legacy) is 88.1%
  (Chrome) and 93.3% (Firefox) over the nine release-gate cases, and 79.2% /
  90.9% over all thirteen cases. Over the release-gate cases the result does
  not depend on the weights: the smallest reduction there is 40.1%
  (ambiguous boundary, Chrome), so every weighted median is at least that.
- **Lag comparisons >50%: pass.** 94.5%–97.0% fewer on every case that scans,
  95.6% over the corpus, counted at the shipping raster against a replica
  checked pixel for pixel against the production kernel
  ([evidence](../../evidence/phase-2/2026-10-16-5bbc3da-lag-comparisons/summary.md)).
- **Kill condition: clean.** The kernel is bit-identical to the reference
  scan on the frozen corpus (status, period, multiplier), so it adds no false
  attracting result, no wrong period, and no unresolved pixel.

### D — period policy and product language

Gate (plan §5): `Higher-period verified hits display without raising the
quality barrier; no guarantee ambiguity`. **Pass.** The policy is
test-pinned (`period-policy.test.ts`: raising it cannot change outcomes,
`maxIterations`, or thresholds), the quality copy is driven by it
(`view-state.test.ts`, browser scenario `explains evidence terms and exposes
bounded quality profiles`), and the release runs present those frames in both
browsers. The product-language review of the final copy is part of the owner
approval below.

## Latency budgets (approved 2026-10-16)

Plan §9 freezes the coarse and stable budgets after the clean target-hardware
baseline. Proposed from the release Stage A warm medians of the default
kernel (21 per case per browser), with roughly 1.3× headroom over the worst
browser:

| Budget (warm median, both browsers)                                              | Proposed   | Worst measured (case, browser)      |
| -------------------------------------------------------------------------------- | ---------- | ----------------------------------- |
| Coarse frame, every corpus case                                                  | ≤ 100 ms   | 67 ms (period-2 bulb, Chrome)       |
| Stable frame, Easy                                                               | ≤ 250 ms   | 177 ms (default full set, Chrome)   |
| Stable frame, Hard known (user-facing hard-view budget, Detailed where declared) | ≤ 600 ms   | 470 ms (rabbit boundary, Chrome)    |
| Stable frame, Fallback and Scale                                                 | ≤ 1,500 ms | 1,010 ms (weak attraction, Firefox) |

The budgets were measured with conjugate mirroring on. On the mirror-free
build, the paired run's mirror-off arm puts the default view at 238.4 ms
(Chrome) and 173 ms (Firefox) against 250 ms. The owner has deferred the
confirming headed release session, so the Easy budget on the shipping build is
projected, not yet measured.

Single samples exceed the medians (weak attraction peaks at 1.63 s in
Firefox); the budgets are on medians, as the plan's paired evidence is.

## Conditional workstream dispositions

Each conditional workstream gets an accept/reject disposition here, as the
exit criteria require. "Not adopted in Phase 2" is a reject for this phase
with a stated reopening condition; the evidence and gate quotes are in
[WORKSTREAM-DISPOSITIONS.md](WORKSTREAM-DISPOSITIONS.md) and
[STAGE-A-GATE-ANALYSIS.md](STAGE-A-GATE-ANALYSIS.md). The frozen budgets above
are met without any of them, which removes the shortfall that several were
waiting for.

| WS                                  | Proposed disposition                                                                          | Rationale and reopening condition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E — dynamic microbands              | **Not adopted in Phase 2**                                                                    | Never attempted. The skew gate fires, but N comes first and is killed below; hard views now finish in 0.2–1.0 s, so a ≥10% band-balance gain is tens of milliseconds. Reopen if a declared view misses its frozen budget and its band imbalance explains the miss.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| F — period-12 core and shards       | **Not adopted as performance work; product feature candidate** (owner, 2026-10-16)            | The reopening gate did not fire: matched-budget detection showed no checkpoint-only or legacy-only detection on any stratum, and the measured seeding gains came from adjacent-pixel and session seeds (G), not a generated catalog. Belongs to a product (atlas) phase. The owner considers the generated catalog worth building as a product feature if its interior components are displayed the way the existing catalog markers are (labelled, selectable centres with period and address); that is product scope, not a Phase 2 performance gate.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| G — catalog/session/adjacent Newton | **Not adopted in Phase 2**                                                                    | Strong directional PoC evidence, but its start condition was a hard-view budget shortfall, which no longer exists. Reopen on a budget miss the current kernel cannot close.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| H — p3/p4 algebraic                 | **Not adopted in Phase 2**; exploratory feasibility spike requested by the owner (2026-10-16) | No feasibility measurement existed. The owner asked for an exploratory spike (outcome to be recorded here); it does not gate Phase 2.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| I — Wasm SIMD                       | **Not adopted in Phase 2** (ADR 0005 conditions stand)                                        | The stable algorithm is now fixed (ADR 0006), which satisfies ADR 0005's ordering, but no budget shortfall motivates it. Reopen with a scalar-Wasm capability measurement against a budget miss.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| J — rigorous subdivision            | **Research track, not release-gated**                                                         | Unchanged (plan §11/§12).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| K — worker pool sizing              | **Reject: keep the 4-worker cap**                                                             | The declared target has 4 physical cores; >4-worker gains measured 0.58×–0.985× wall across runs, below the ≥20% bar and run-sensitive, with no easy-view or memory evidence. Reopen only if a ≥8-physical-core target class is declared.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| L — trap-radius early accept        | **Research track, not release-gated**                                                         | Unchanged (plan §12/L); acceptance argument is numerical, not certified.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| M — conjugate mirroring             | **Removed (owner decision, 2026-10-16; ADR 0008)**                                            | Release run ([evidence](../../evidence/phase-2/2026-10-15-9e70551-conjugate-mirror/summary.md), 21 warm pairs per case, production kernel): on the one real-axis-symmetric easy case (`mi-easy-default-full`) the classifier ratio is **1.39×** [1.33×, 1.50×] in Chrome and **1.24×** [1.02×, 1.25×] in Firefox, below the gate's ≥1.6× (wall 1.26× / 1.08×). Symmetric hard views reach 1.61×–2.12× classifier. Parity is exact (0 hash mismatches), and no case trips the regression cap; the one interval below 1 (13×, Firefox, 0.89×) is on a view mirroring does not touch, within the ~1.3 chance exclusions expected over 26 intervals. None of the plan's reject conditions fired (no oracle-visible mismatches, the default view crosses the axis, small merge surface). The measured time includes the four-worker tiled pass, so the 2.0× single-thread ceiling (1.99× in Node) is not reached. The owner decided removal on 2026-10-16: "Considering its limited scope of applicability I do not think that the added complexity is worth it." See [ADR 0008](../decisions/0008-remove-conjugate-mirroring.md). |
| N — cost-weighted static banding    | **Kill**                                                                                      | Its kill criterion fired: the coarse-pass cost signal mispredicts stable cost on the interior-heavy easy class (r = 0.29), and equal-cost banding worsened that view's skew 1.21 → 1.59. Evidence retained in `poc/performance/browser/results/coarse-cost.json`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| O — cross-profile carryover         | **Not adopted in Phase 2**                                                                    | No measurement exists. Reopen with a paired profile-upgrade measurement of the carriable pixel share.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

## Document agreement

| View           | Where it now agrees                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Mathematics    | [PERFORMANCE-MATHEMATICS.md](../PERFORMANCE-MATHEMATICS.md) and [ADR 0006](../decisions/0006-watched-lag-default-classifier.md) describe the default kernel's acceptance argument (same-or-later acceptance than the reference scan, one verifier).                                                                                                                                                                            |
| Requirements   | [REQUIREMENTS.md](REQUIREMENTS.md) Phase 2 matrix carries the closeout states below.                                                                                                                                                                                                                                                                                                                                           |
| ADRs           | ADR 0006 accepted (2026-10-15); ADR 0004 (catalog) and ADR 0005 (Wasm SIMD) conditions unchanged and cited by the dispositions.                                                                                                                                                                                                                                                                                                |
| Implementation | [PERFORMANCE-PLAN.md](../PERFORMANCE-PLAN.md) status table and Stage A section; [UNIFIED-KERNEL-2026-10-11.md](UNIFIED-KERNEL-2026-10-11.md).                                                                                                                                                                                                                                                                                  |
| Generator      | No generator change: workstream F did not ship; the curated catalog and fixture generators are unchanged and `npm run check` regenerates and verifies them.                                                                                                                                                                                                                                                                    |
| Evidence       | Every run cited here has `environment.json`, raw observations, a summary, and a verified `manifest.sha256` under `evidence/phase-2/`.                                                                                                                                                                                                                                                                                          |
| SysML          | [MandelbrotInteriority.sysml](../../model/MandelbrotInteriority.sysml) now carries `MI-PERF-001`…`008`, their satisfaction allocations (trace recorder, cycle verifier, tile pool, evidence harness), and `MI-VER-PERF-001`…`005`; the UI–worker port carries the acknowledgment and quiescence items. No SysML v2 parser is pinned in this repository, so parser conformance is not claimed (model README validation step 4). |

## Findings from the release runs

- **Fixed: quiescence could reset the next job.** A cancelled render's
  `quiesce()` waited on the pool's current drain, which could already belong
  to the next render; past the 250 ms drain deadline it reset the pool under
  that job, which then never completed. Fixed with a regression test
  (`25035db`). It could only trigger on a cancel racing a new stable pass;
  completed samples in the runs above are unaffected.
- **Headed-browser stalls.** Headed Firefox occasionally produced no stable
  frame for minutes, in both the old and the new build; a locked or
  occluded session stops frame callbacks. The runners now refuse to start on
  a locked session and retry a stalled sample once in a fresh context,
  recorded per sample.
- **Harness bias, corrected.** A first build-to-build check ran the new build
  first in every repetition and flagged it 3–13% slower in headed Chrome;
  with the order alternated the builds are indistinguishable (0.98×–1.10×,
  no flags; [evidence](../../evidence/phase-2/2026-10-16-9e70551-build-check-alternating/summary.md)).
  The biased record is kept and marked superseded.
- **Deep-view first frame (product follow-up).** On deep views near parabolic
  points (for example the 6,000,000× basilica rim) the coarse frame's reduced
  budget (≤256 iterations) leaves much of the image unresolved, so the screen
  shows mostly the unresolved texture until the stable frame. With the
  production kernel that lasts about 0.3–0.6 s; under the legacy reference
  mode it lasted the whole multi-second pass. Progressive stable bands or a
  depth-aware coarse budget would address it; neither is in Phase 2 scope.

- **Release session harness.** One command, `npm run evidence:release`,
  now produces the release evidence: budgets, hook overhead, hook/plain
  parity, and the interaction distributions, from one render of each corpus
  view per arm. Its acceptance session (headed branded Chrome and Firefox,
  21 warm pairs per case,
  [evidence](../../evidence/phase-2/2026-10-16-8b9d091-release/summary.md))
  took 18 minutes and passed every gate. Every budget passed in both
  browsers. There were 0 hash mismatches and 0 provenance violations, and the
  hook overhead was within 5% in both browsers. One Firefox stall recovered on
  retry. 25 of the 26 stable medians are within ±20% of the 2026-10-15
  Stage A candidate medians. The exception is Firefox
  `mi-fallback-budget-exhaustion`, at 398 ms against 616 ms (0.65×). That
  difference, 218 ms, exceeds the earlier sample's 161 ms MAD. The earlier
  Firefox half ran with Steam in the background (its run note), and this case
  was the one sample in this session that stalled and was retried, so the gap
  is recorded rather than explained. The interaction medians are within the
  MADs of the 2026-10-15 operational run.

  The session rotated arm order over an odd number of warm repetitions, which
  favors the hook arm slightly; recomputed on position-balanced pairs the
  pooled plain/hook ratios are 0.994 [0.979, 1.007] (Chrome) and 0.984
  [0.958, 1.003] (Firefox), still within 5%. The harness now balances arm
  positions.

## What this record does not establish

- Memory high-water (MI-PERF-006) is bounded by design (a single-entry
  semantic store and per-band buffers sized by the raster) but was not
  measured in the release browsers.
- The plan's 2% always-on budget needs an instrumented build against a
  recorder-free build; both overhead arms here contain the always-on ring.
  The ring's direct cost is measured instead (recorder microbenchmark and
  retention), as the overhead summaries record.
- Equality of the default kernel with the reference scan was established on
  the frozen corpus and in targeted adversarial runs, not proved (ADR 0006).
  The reference scan was removed 2026-10-16 (ADR 0007); bit-level equality is
  now guarded by the golden kernel fixture (`fixtures/kernel-golden.v1.json`),
  generated while the reference still existed.

## Approval

| Decision                                                                | Owner response                                                                                                                                                   |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Latency budgets as proposed                                             | Approved 2026-10-16 ("Latency is met with the changes that have been made")                                                                                      |
| Conditional dispositions as proposed (M decided separately)             | Approved 2026-10-16 for E, G, I, J, K, L, N, O ("approve the other eight dispositions"); F recast as a product feature candidate; H pending an exploratory spike |
| Workstream M: conjugate mirroring                                       | Decided 2026-10-16: remove ("Considering its limited scope of applicability I do not think that the added complexity is worth it"); ADR 0008                     |
| Opt-in diagnostics: counters mode moved out of the ≤5% budget (A above) | Approved 2026-10-16: counters offline only, implemented                                                                                                          |
| Workstream B recorded as not met in Firefox, superseded for users by C  | Approved 2026-10-16 ("Go with option 1 and record it"); follow-up dormant unless a Firefox budget is missed                                                      |
| Phase 2 performance closed                                              |                                                                                                                                                                  |
