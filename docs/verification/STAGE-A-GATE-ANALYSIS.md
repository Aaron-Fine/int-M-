# Stage A gate analysis — first run (2026-09-02 @ 6f49f19)

This document records, per workstream, what the accumulated directional
evidence does and does not establish against the plan §5 ship gates. It is
written against the first Stage A run
([evidence/phase-2/2026-09-02-6f49f19/](../../evidence/phase-2/2026-09-02-6f49f19/summary.md))
plus the committed PoC artifacts. Companion records:
per-workstream dispositions in
[WORKSTREAM-DISPOSITIONS.md](WORKSTREAM-DISPOSITIONS.md), status in
[PERFORMANCE-PLAN.md](../PERFORMANCE-PLAN.md).

Evidence tiers used below (plan §9; tier labels travel with every number):

- **Screening (Stage A first run)** — production bundle, frozen corpus v1,
  shipping raster, 9 paired repetitions (repetition 0 cold, 1–8 warm),
  alternating arm order, per the run's
  [environment.json](../../evidence/phase-2/2026-09-02-6f49f19/environment.json)
  protocol block. Both engines are **automation-bundled headless builds**
  (Chromium 151.0.7922.34 from build `6f49f19`, Firefox 153.0 from build
  `73a126a`; identical measurable application sources). This is directional
  evidence, not release evidence: the release protocol requires branded
  stable browsers, headed, on the declared target hardware, ≥21 paired
  repetitions on release-gate cases, and BCa paired intervals.
- **PoC directional** — Node/V8 ([poc/performance/results/](../../poc/performance/results/))
  and headless-Chromium microbenches
  ([poc/performance/browser/results/](../../poc/performance/browser/results/)).

All numbers below were recomputed from the committed raw JSONs
([raw-observations.json](../../evidence/phase-2/2026-09-02-6f49f19/raw-observations.json),
[semantic-comparison.json](../../evidence/phase-2/2026-09-02-6f49f19/semantic-comparison.json))
or are quoted from the committed artifact named alongside; they reconcile with
[summary.md](../../evidence/phase-2/2026-09-02-6f49f19/summary.md) within
≤0.1 ms (median-of-even rounding convention). Where informal characterizations
circulated, the reconciliation is recorded in
[Reconciliation notes](#reconciliation-notes).

## Verdict summary

| WS  | Gate (short)                                                         | Verdict                                                                                             |
| --- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| B   | ≥10% classifier / ≥8% end-to-end, both                               | **insufficient-evidence** (speed component not demonstrated in Node; no Stage A arm isolates PR 2)  |
| C   | comparisons >50%; weighted median ≥25%; hard ≥2×; no case >5% slower | **directional-pass-pending**                                                                        |
| D   | higher-period hits display; no barrier raise; no guarantee ambiguity | **directional-pass-pending**                                                                        |
| K   | ≥20% hard wall on ≥8-core class, both browsers                       | **insufficient-evidence** (verdict run-sensitive, one browser)                                      |
| E   | skew-gated; hard median/p90 ≥10%; easy <3%                           | **insufficient-evidence** (gate unmeasured; renderer details have directional evidence)             |
| N   | hard ≥10% with easy <3% (attempted before E)                         | **fail on the interior-heavy easy class (kill criterion fires directionally); ship bar unmeasured** |
| M   | ≥1.6× classifier on symmetric easy cases                             | **directional-pass-pending, borderline** (committed easy median below the bar)                      |
| L   | oracle-validated zero false; weak-attraction savings                 | **directional-pass-pending** (research-only standing unchanged)                                     |

## Workstream B — allocation-free scalar kernel

Gate (plan §5, verbatim): `≥10% classifier or ≥8% end-to-end improvement in
both browsers; semantic parity`. Kill/defer: `Reject if below both thresholds
or memory/correctness regresses`.

Evidence artifacts:

- [poc/performance/results/pr2/pr2-microbench.json](../../poc/performance/results/pr2/pr2-microbench.json)
  (directional, Node/V8, 15 timed passes/slice, full-raster parity gate).
- [src/domain/orbit.ts](../../src/domain/orbit.ts) (landed kernel; the PR 2
  phi-boxing fix documented there).

Measured numbers (recomputed from the artifact):

- Allocation: 0 objects/pixel by construction; churn bound 0 B/px on the hard
  609× anchor slice and 128 B/px on the full-set slice (1 scavenge/pass),
  vs 512 B/px for the pre-PR2 pipeline shape on both slices
  (`cases[].variants.*.allocation`).
- Variance: classify-time MAD tightens (14.416 → 12.448 ms hard anchor;
  7.143 → 3.456 ms full-set).
- Speed (the gate component): hard anchor 1280.389 → 1276.921 ms median
  (−0.3%), full-set slice 411.727 → 391.180 ms (−5.0%). The initial committed
  run (revision `d7e9c73`, same artifact path in history) measured the hard
  anchor **slower** (1500.837 → 1579.008 ms, +5.2%) and full-set 570.379 →
  556.808 ms (−2.4%). Across all committed runs the scalar core never reaches
  +10% classifier or +8% end-to-end in Node.
- Semantic parity: bit-identical full-raster parity gate before timing
  (status, escape/smooth iteration; period and multiplier with the documented
  PR 3 reductions, 10,118 documented reductions, 0 mismatches).

Verdict: **insufficient-evidence** for the speed component; the allocation and
variance deliverables are directionally supported. Note the first Stage A run
cannot decide this gate at all: its paired arms (`legacy-scan` vs
`checkpoint`) both run the post-PR-2 kernel, so no arm isolates PR 2.

Missing evidence: a paired pre-PR2-vs-post-PR2 arm in both browsers (or an
equally direct classifier-level comparison) on the release protocol; the
speed component is unmeasured in any browser.

## Workstream C — checkpoint classifier

Gate (plan §5, verbatim): `Lag comparisons reduced >50%; weighted median ≥25%;
hard views ≥2×; no case >5% slower`. Kill: `Any false attracting result or
wrong primitive period; unresolved rate +>0.1 percentage point`.

Evidence artifacts:

- [evidence/phase-2/2026-09-02-6f49f19/](../../evidence/phase-2/2026-09-02-6f49f19/summary.md)
  (screening run, both automation-bundled engines, warm paired medians).
- [poc/performance/results/pr4/pr4-bench.json](../../poc/performance/results/pr4/pr4-bench.json)
  (directional Node/V8; deterministic counters, matched-budget analysis).
- [poc/performance/results/summary.json](../../poc/performance/results/summary.json)
  (PoC schedule A/B and grids).

Measured numbers (Stage A, warm paired medians, recomputed from
raw-observations.json):

- **Hard views ≥2×** — every release-gate case clears 2× in both engines:
  Chromium 3.66×–16.88× (hard known 4.24×–11.11×), Firefox 6.00×–27.31×
  (hard known 9.45×–27.31×). Geometric mean over the nine release-gate cases:
  8.32× (Chromium), 13.90× (Firefox). Directional; see
  [Reconciliation notes](#reconciliation-notes) for the "8–17×" shorthand.
- **No case >5% slower (median part of the cap)** — zero flags across all
  13 cases × 2 engines under the plan §9 rule `Paired median exceeds max(5%,
20 ms) with a paired interval excluding zero, in either browser`: the worst
  easy-case regressions are Chromium exterior-heavy +1.3 ms (+0.67%), Chromium
  period-2 bulb +5.9 ms (+1.48%), Firefox exterior-heavy +10.5 ms (+3.45%),
  Firefox main-cardioid +7.5 ms (+2.67%) — all below both thresholds. The
  paired-interval (BCa) part of the cap is **not** computed at 9 reps.
- **Easy default view improved** in both engines: −133.4 ms (−33.6%)
  Chromium, −351.0 ms (−55.3%) Firefox. Firefox period-2 bulb improved
  (−36.5 ms).
- **Lag comparisons >50%** — not measurable from the Stage A run (the trace
  ring exposes no comparison counters). Node directional: 97.0% reduction per
  case (`pr4-bench.json` `cases[].gates.comparisonReduction` 0.9694–0.9706;
  PoC runner: 29,565 vs 1,800,798 comparisons at the detailed profile,
  `summary.json`).
- **Weighted median ≥25%** — not computed; the declared weighted aggregate
  does not exist yet in any committed artifact.
- **Kill condition** — clean in Node (zero false attracting, zero wrong
  primitive periods; zero period disagreements in differential mode;
  unresolved never worse than legacy: 94,494 → 80,514 on the 126× anchor;
  matched-budget detection has zero checkpoint-only and zero legacy-only
  detections on every stratum, `pr4-bench.json`
  `matchedBudgetDetection`). In the browser run the RGBA hash proxy cannot
  measure the unresolved-rate cap: it enumerates
  hash inequality only (below).
- **Semantic comparison** — 8 of 13 cases (the interior/boundary-heavy set:
  default-full, rabbit-boundary, 126×, 609×, 13×, weak-attraction,
  ambiguous-boundary, budget-exhaustion) hash-mismatch on every repetition in
  both engines, with hashes identical across engines and repetitions per case
  (deterministic). This matches the artifact's expectation of additional
  oracle-certified checkpoint detections (PR 4 evidence); it is enumerated as
  a finding, not a failure.

Verdict: **directional-pass-pending** — screening-level pass on every
component that the first run can measure; not a gate decision (plan §9).

Missing evidence: ≥21 paired repetitions on release-gate cases; BCa paired
intervals (median-level flags are necessary, not sufficient, for the cap);
branded stable browsers, headed, on declared target hardware; the declared
weighted median ≥25% aggregate; lag-comparison counters in browser evidence;
the matched-budget detection analysis on declared hardware with the
stratified holdouts (plan §9); a per-pixel unresolved-rate measurement for the
+0.1 percentage-point cap (the hash proxy cannot provide it).

## Workstream D — period policy

Gate (plan §5, verbatim): `Higher-period verified hits display without raising
the quality barrier; no guarantee ambiguity`. Kill: `Candidate-source leakage
into confidence semantics`.

Evidence artifacts:

- [src/domain/period-policy.ts](../../src/domain/period-policy.ts) (revision
  `period-policy-1.0.0`), tests
  [tests/unit/domain/period-policy.test.ts](../../tests/unit/domain/period-policy.test.ts)
  (initial values, legacy identity, invariant-8 guardrail) and
  [tests/unit/ui/view-state.test.ts](../../tests/unit/ui/view-state.test.ts)
  (policy-driven quality copy).
- Stage A first run: the checkpoint arm's stable frames — which include the
  additional oracle-certified higher-period detections enumerated in the C
  record — render and present through the policy-driven UI in both engines;
  hashes deterministic per case.

Verdict: **directional-pass-pending**. The quality-barrier invariant is
test-pinned (raising the policy cannot alter classification outcomes,
`maxIterations`, or acceptance thresholds), and the display path is exercised
end-to-end by the run, but the gate's product-language half has no dedicated
Stage A measurement.

Missing evidence: release-protocol run (branded engines, target hardware)
exercising higher-period verified hits; a product-language review against the
final policy revision.

## Workstream K — worker pool sizing

Gate (plan §5, verbatim): `Hard-view wall-clock ≥20% better on a ≥8-core
target class in both browsers; easy views <3% slower; memory within the
versioned budget`. Kill: `Keep four workers if startup, merge, or memory
overhead dominates; measure before attempting E`.

Evidence artifacts:

- [poc/performance/browser/results/pool-sizing.json](../../poc/performance/browser/results/pool-sizing.json)
  (directional; headless Chromium, 8-core i7-1185G7, 1024² hard view at
  Balanced — a recorded deviation from the case's Detailed designation).
- [poc/performance/browser/README.md](../../poc/performance/browser/README.md)
  (records the earlier committed runs).

Measured numbers (recomputed from the artifact):

- Committed run: 4 workers (production cap) 8392.6 ms median → 6 workers
  7482.1 ms (0.892×) → 8 workers 7046.3 ms (0.840×); per-rep ratios at 8
  workers span 0.821–0.871. A 16.0% gain at 8 workers is **below the 20% bar**.
- Run sensitivity: the committed README records earlier runs on the same
  hardware at 0.985×/0.864× and 0.69×/0.58× (6/8 workers) — the >4-worker
  verdict swings 0.58×–0.985× across runs on this part-HT laptop.
- Spawn cost is negligible (≤1.5 ms for 8 workers,
  `spawnMsByWorkerCount`); easy-view effect unmeasured; memory budget
  unmeasured.

Verdict: **insufficient-evidence**. One browser, one machine, one view,
Balanced-not-Detailed, 5 reps per size, and a verdict that swings across runs
cannot support a ≥20%-on-≥8-core-class gate decision.

Missing evidence: declared ≥8-core target-class hardware; both branded
browsers; Detailed profile on the corpus case; easy-view <3% slower
measurement; memory high-water within the versioned budget; repeated runs
sufficient to bound the run-to-run swing.

## Workstream E — dynamic microbands (and renderer-path details)

Gate (plan §5, verbatim): `Only if baseline slowest/mean elapsed >1.2; hard
paired median/p90 ≥10% better with adequate samples; easy <3% slower`. Kill:
`Static bands retained if skew is insignificant or message/merge overhead
dominates`.

Evidence artifacts:

- [poc/performance/browser/results/coarse-cost.json](../../poc/performance/browser/results/coarse-cost.json)
  (skew-gate input; see the N record).
- Renderer-path details: [zero-copy-transfer.json](../../poc/performance/browser/results/zero-copy-transfer.json),
  [yield-ab.json](../../poc/performance/browser/results/yield-ab.json),
  [band-order.json](../../poc/performance/browser/results/band-order.json),
  packed output (`poc/performance/results/summary.json` `packedOutput`).
- [poc/performance/browser/README.md](../../poc/performance/browser/README.md).

Measured numbers (directional):

- Skew gate direction: equal-height slowest/mean at the production band count
  4 is 1.21 (easy default-full), 1.89 (hard 126×), 3.30 (ambiguous boundary) —
  the >1.2 condition fires on all three measured views.
- Zero-copy: 12.75 MiB frame roundtrip 26.8 ms copy (post itself 13.0 ms) vs
  0.2 ms transferable.
- Yield: nested `setTimeout(0)` steady-state 4.1 ms/hop with the 4 ms clamp
  visible after 5 levels; MessageChannel ~0.1 ms; cancel-to-quiescence 4.1 ms
  vs 0.1 ms.
- Band order (labeled simulation): skewed costs t50-rows 60.4 ms
  top-to-bottom vs 43.1 ms center-out, first band 32.2 vs 10.8 ms; uniform
  control 49.1 vs 48.5 ms (order must not and does not matter).
- Packed output (Node): exactly 1 MiB (20% of status+period bytes) saved per
  1024² frame, round-trip mismatches 0/1,048,576.

Verdict: **insufficient-evidence** for the ship gate — microbands were never
attempted and no hard paired median/p90 wall measurement exists. The
renderer-path details have directional evidence but their own measured gates
(zero-copy with `mergeCpuMs`, time-to-first-50%-rows, packed-with-zero-copy)
are not Stage A items.

Missing evidence: a wall-time paired microband measurement (median and p90,
adequate samples) against static bands in both browsers with the easy <3%
guard; and, per plan §11, N must be attempted first wherever the skew gate
fires (see the N record and the dispositions doc).

## Workstream N — cost-weighted static banding

Gate (plan §5, verbatim): `Attempted before E whenever E's skew gate (baseline
slowest/mean elapsed >1.2) fires. Ships if hard paired median/p90 ≥10% better
with easy <3% slower — E's bar at lower complexity. If N meets the bar, E is
killed with retained evidence`. Kill: `Kill if the coarse-pass cost signal
mispredicts stable-pass cost; E may then be attempted on the residual skew`.

Evidence artifacts:

- [poc/performance/browser/results/coarse-cost.json](../../poc/performance/browser/results/coarse-cost.json)
  (production coarse pass + stable-pass per-band compute, 1024² diagnostic
  raster, Balanced; recorded equal-cost boundaries).

Measured numbers (recomputed from the artifact):

- Skew gate fires on all three views at band count 4: slowest/mean 1.212 /
  1.886 / 3.302 (equal-height baseline).
- Equal-cost banding at band count 4: hard 126× 1.886 → 1.078 and ambiguous
  boundary 3.302 → 2.090 (viable directionally), but **the interior-heavy
  easy default view regresses 1.212 → 1.594** — the equal-cost partition makes
  the skew worse.
- Estimate-vs-actual correlation at 16 bands: r = 0.92 Pearson / 0.89 Spearman
  (hard 126×), 0.99 / 0.44 (ambiguous boundary), **0.29 / 0.32 (easy
  default-full)**; pooled over 48 bands r = 0.67 / 0.76. The artifact's own
  recorded assessment on the easy view: "skew fires but the coarse signal
  mispredicts stable-pass cost (weak correlation): N kill-criterion territory
  on this view".
- Mechanism (recorded in the notes): the escape-iteration + unresolved
  fraction cost model overcharges analytic-interior bands, which are cheap in
  the stable pass.

Verdict: the ship bar (hard paired median/p90 wall ≥10%, easy <3% slower) is
**unmeasured** — the measurement covers per-band compute skew, not wall time —
but the **kill criterion directionally fired on the interior-heavy easy
class**, so an unqualified attempt is not supported. Recommendation recorded
in the dispositions doc: kill, or scope-limit to views where the coarse signal
validates (per-view correlation check before banding).

Missing evidence (if the scoped variant is pursued): wall-time paired
measurements in both browsers at the shipping raster; a corrected cost model
for analytic-interior bands; the easy <3% guard on the default view.

## Workstream M — conjugate symmetry mirroring

Gate (plan §5, verbatim): `≥1.6× classifier on real-axis-symmetric easy cases
in both browsers with semantic parity under the tolerance policy; no corpus
case beyond the normative regression cap`. Kill: `Reject if the coordinate
policy produces oracle-visible mismatches on boundary holdouts, if
real-axis-crossing views prove too rare in practice to matter, or if merge
complexity outweighs the gain`.

Evidence artifacts:

- [poc/performance/browser/results/conjugate-mirror.json](../../poc/performance/browser/results/conjugate-mirror.json)
  (directional; headless Chromium, main thread, 512² at Balanced, 5 measured
  reps after warmup, alternating arm order).
- [poc/performance/browser/README.md](../../poc/performance/browser/README.md)
  (cross-run ranges).

Measured numbers (recomputed from the artifact):

- Ratio full/(half+mirror): easy default-full **1.574** (median of 5;
  per-rep spread 1.574–2.138), symmetric hard 126× variant **1.653** (per-rep
  1.34–1.845). Mirror fill ~4 ms median (4.2 easy / 4.0 hard).
- Cross-run (committed README): easy 1.57–2.04×, hard variant 1.65–1.77×.
- Semantic parity: exact — 0 mismatches over 131,072 mirrored pixels per view
  (status, period, |λ|, κ, iterations, evidence), no sub-ulp offset needed.

Verdict: **directional-pass-pending, borderline**. On the binding easy case
the committed run's median (1.574×) is **below** the 1.6× bar; per-rep and
cross-run values reach 2.04×, so the verdict is run-sensitive and must not be
recorded as a pass. The hard variant clears the bar consistently, but the gate
names easy cases. The parity and mirror-fill components are clean.

Missing evidence: repeated runs bounding the easy-case ratio (committed run
below bar, cross-run range straddles it); the second browser; the shipping
1024×640 raster (measured at 512²); production-frame mirror cost (the PoC
fill copies six fields, a conservative overestimate of the four-channel
production frame).

## Workstream L — trap-radius early accept (research)

Gate (plan §5, verbatim): `Oracle-validated: zero false attracting results
across the corpus; measurable iteration savings on weak-attraction strata`.
Kill: `Research-only until the acceptance argument is certified; any oracle
disagreement is an immediate kill`.

Evidence artifacts:

- [poc/performance/results/summary.json](../../poc/performance/results/summary.json)
  grids section; run manifest
  [poc/performance/results/run-manifest.json](../../poc/performance/results/run-manifest.json)
  (`gate`: zero false attracting, zero wrong primitive periods for all
  variants and grids).
- [poc/performance/src/kernels/trap.ts](../../poc/performance/src/kernels/trap.ts)
  (frozen PoC policy).

Measured numbers (directional, PoC corpus 228 points + 2,560 grid points):

- Oracle verdict: zero false attracting and zero wrong primitive periods on
  the whole corpus and all grids.
- Savings where it fires: weak-p6a detailed 0.0475× checkpoint iterations with
  255/255 hits and zero Newton failures; weak-p6a balanced 0.292× with 64 vs
  109 unresolved; anchor grids 0.80–0.87×; strongly attracting grids 1.000×
  (the minLambda gate refuses before any work).

Verdict: **directional-pass-pending** on the research gate — passed
directionally on the PoC corpus and grids; research-only standing (plan
§12/L) is unchanged, and the track is never release-gated into this phase.

Missing evidence: the acceptance argument itself (a certified enclosure, not
the numerical linear-regime argument); behavior at |λ| ≥ 0.99 is unmeasured
(no grid seed reaches it; weak-p6b stays unresolved at every PoC budget).

## Reconciliation notes

1. **"8–17×" hard-view shorthand.** Informal run characterizations used
   "8–17×" for the Stage A hard-view improvements. The committed raw data
   gives, for warm paired medians: Chromium release-gate cases 3.66×
   (ambiguous-boundary) to 16.88× (weak-attraction), Firefox 6.00× to 27.31×;
   hard-known-only ranges are 4.24×–11.11× (Chromium) and 9.45×–27.31×
   (Firefox). The shorthand describes neither the full range nor a clean
   subset; per-case medians in the C record are the record.
2. **Median rounding.** Two summary.md cells (Chromium main-cardioid legacy
   266.2, Chromium weak-attraction checkpoint 1253.2) differ from the
   recomputed medians (266.25, 1253.25) only by the one-decimal rounding
   convention; all other cells match exactly. No substantive disagreement.
3. **Workstream B "speed demonstrated in Node" claims.** No committed artifact
   shows a ≥10%/≥8% Node win; the committed range across both pr2 runs is
   −5.0% (best) to +5.2% (worst) on the hard anchor. The B record above quotes
   only artifact-backed numbers.
4. **Regression flags.** All 26 case×engine medians in the first run are below
   the `max(5%, 20 ms)` median threshold — the flag column in summary.md is
   confirmed zero by recomputation — but the cap's paired-interval half is
   unevaluated at 9 reps, so "no regression flags" is a screening-level
   statement only.
