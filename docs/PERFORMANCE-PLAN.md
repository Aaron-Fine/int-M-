# Phase 2 performance implementation status

This is the implementation roadmap for the
[performance improvement plan](plans/int-m-performance-plan.html) (the governing
document; sections below refer to its numbered sections). It mirrors the plan's
delivery sequence (§11) and records the **current status of every item** with
evidence links. It is a status document, not a marketing document:

- Nothing is "shipped". The legacy all-lag scan remains the reported
  classifier everywhere; the default can flip only on Stage A evidence
  (plan §9).
- Evidence lives in two tiers. **Release-comparable** evidence is the frozen
  corpus protocol of [PERFORMANCE-CORPUS.md](verification/PERFORMANCE-CORPUS.md)
  run on target hardware in stable branded Chrome and Firefox.
  **Directional** evidence is the PoC harness under `poc/performance/`
  (Node/V8) and `poc/performance/browser/` (headless Chromium via Playwright);
  every PoC artifact is labeled directional in the artifact itself.
- Ship gates are quoted verbatim from plan §5. Paraphrases are mistakes.

## Status at a glance

| Sequence item (plan §11)                                       | Workstream        | Status                                                                                                                                                                                   | Evidence                                                                                                                     |
| -------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Step 0 — PoC harness                                           | —                 | **Landed**                                                                                                                                                                               | [poc/performance/](../../poc/performance/README.md)                                                                          |
| PR 1 — Corpus, timing, bounded observability                   | A                 | **Landed** (Stage A runs pending)                                                                                                                                                        | tools/benchmark/, PERFORMANCE-CORPUS.md, render trace ring                                                                   |
| PR 2 — Allocation-free scalar kernel                           | B                 | **Landed**; speed gate open (not measurable from the current Stage A paired arms; see [gate analysis](verification/STAGE-A-GATE-ANALYSIS.md))                                            | pr2 microbench (directional)                                                                                                 |
| PR 3 — Common verifier and semantic oracle                     | C (part)          | **Landed**                                                                                                                                                                               | src/domain/verifier.ts, verifier/adjudication tests                                                                          |
| PR 4 — Checkpoint candidates                                   | C                 | **Landed** behind the `legacy-scan` default; directional-pass-pending on the first Stage A run ([gate analysis](verification/STAGE-A-GATE-ANALYSIS.md))                                  | src/domain/checkpoint.ts, pr4 bench (directional), [first Stage A run](../../evidence/phase-2/2026-09-02-6f49f19/summary.md) |
| PR 5 — Period policy buckets and product language              | D                 | **Landed**; directional-pass-pending ([gate analysis](verification/STAGE-A-GATE-ANALYSIS.md))                                                                                            | src/domain/period-policy.ts, policy tests                                                                                    |
| Stage A — target-hardware baseline and gate runs               | A/B/C/D           | **First run complete** (screening protocol; automation-bundled Chromium + Firefox — directional); release-protocol runs pending ([gate analysis](verification/STAGE-A-GATE-ANALYSIS.md)) | [evidence/phase-2/2026-09-02-6f49f19/](../../evidence/phase-2/2026-09-02-6f49f19/summary.md)                                 |
| Conditional PRs M, O, N, E, G, F, H, I, K (+ renderer details) | M/O/N/E/G/F/H/I/K | Not started as PRs; dispositions recorded ([WORKSTREAM-DISPOSITIONS.md](verification/WORKSTREAM-DISPOSITIONS.md))                                                                        | poc/performance/results/, poc/performance/browser/results/                                                                   |
| Research tracks — rigorous subdivision (J), trap-radius (L)    | J/L               | Open-ended; L has PoC oracle-gate evidence (below)                                                                                                                                       | poc/performance/src/kernels/trap.ts and results                                                                              |

Requirements trace for all of the above is
[MI-PERF-001…008](verification/REQUIREMENTS.md#phase-2-performance-requirements).

## Delivered: Steps 0–5 of the delivery sequence

### Step 0 — Proof-of-concept harness (landed)

The self-contained harness at [poc/performance/](../../poc/performance/README.md)
implements the plan §5 PoC scope: the control kernel (faithful legacy port),
the checkpoint/trigger/staggered schedules, DE period guessing,
neighbor-informed lag ordering, bounded exhaustion extension,
adjacent-pixel transplantation, trap-radius early accept, packed
status+period output, and deterministic 16×16 raster grids — all adjudicated
by a double-double oracle with a zero false-attracting / zero
wrong-primitive-period gate. The browser companion
([poc/performance/browser/](../../poc/performance/browser/README.md)) measures
pool sizing, zero-copy transfer, the yield mechanism, band order,
conjugate-mirroring savings, and coarse-pass cost-estimate quality.

Key committed directional results (see the PoC README for the full verdicts and
caveats; artifact of record is
[poc/performance/results/summary.json](../../poc/performance/results/summary.json)
plus `run-manifest.json`, harness revision `poc-harness-1.0.0`, corpus seed
5065040, 228 points):

- The checkpoint schedule is the only A/B schedule member with no detection
  blind spot at PoC profiles (unresolved-rate delta 0 or better vs control at
  every profile, exhaustion on and off) while cutting lag comparisons ~61× vs
  control at the detailed profile (29,565 vs 1,800,798 comparisons; unresolved
  rate 8.77% both).
- The trigger's §4 step gate structurally cannot fire on settled p ≥ 2 cycles:
  with the exhaustion scan off it detects nothing there (unresolved +21.05
  percentage points vs control), which is why PR 4 built on the checkpoint
  schedule.
- Transplantation and trap pass the oracle gate with large savings where they
  fire; both keep their conditional/research standing (below).

### PR 1 — Corpus, timing, and bounded observability (workstream A; landed)

- Frozen corpus v1: [tools/benchmark/corpus.v1.json](../../tools/benchmark/corpus.v1.json)
  with validator (`validate-corpus.ts`, CI-run), environment capture
  (`capture-environment.mjs`), and SHA-256 manifest tooling (`manifest.mjs`).
  Case IDs, viewports, classes, and stratum coverage are specified in
  [PERFORMANCE-CORPUS.md](verification/PERFORMANCE-CORPUS.md).
- Bounded always-on render trace ring:
  [src/ui/worker-timing-marks.ts](../../src/ui/worker-timing-marks.ts)
  (capacity 32 request summaries; corrected timing semantics — compute fields
  absent, never zero or copied, on cached/replayed/recolored frames).
- Evidence contract: [evidence/phase-2/README.md](../../evidence/phase-2/README.md)
  defines the normative run directory layout.

Workstream A gate (plan §5, quoted): `Reproducible runs in stable Chrome and Firefox; cache/replay/cancel sources distinguishable`. The tooling for this
gate is landed; the first Stage A run exists
([2026-09-02-6f49f19](../../evidence/phase-2/2026-09-02-6f49f19/summary.md),
screening protocol, automation-bundled engines — directional), and the
release-protocol runs on stable branded browsers (including the
cache/replay/cancel suite, out of scope for the first pass) remain.

### PR 2 — Allocation-free scalar kernel (workstream B; landed, speed gate open)

`src/domain/orbit.ts` classifies into preallocated records with no per-pixel
heap objects (scalar core, preallocated band channels); the PR exposed and
fixed a real V8 phi-boxing allocation defect in the kernel (documented in
orbit.ts and the PoC README). Committed directional evidence
([poc/performance/results/pr2/pr2-microbench.json](../../poc/performance/results/pr2/pr2-microbench.json),
labeled directional):

- Allocation: 0 objects per pixel by construction and a measured churn bound
  of 0 bytes/pixel on the hard 609× anchor slice (vs 512 B/px for the
  pre-PR2 pipeline shape; 0–1 scavenges per pass vs 4–8).
- Variance: classify-time MAD tightens on both measured slices (e.g. 14.416 →
  12.448 ms on the hard anchor; 7.143 → 3.456 ms on the full-set slice),
  directionally supporting the plan's claim that allocation removal
  strengthens the paired-interval gates.
- Wall-clock medians sit at parity to somewhat behind the allocating
  comparator in Node/V8 (1280.389 → 1276.921 ms hard anchor; 411.727 →
  391.180 ms full-set).

Workstream B gate (plan §5, quoted): `≥10% classifier or ≥8% end-to-end improvement in both browsers; semantic parity`. The allocation and variance
parts of the B deliverable are directionally supported; the **speed gate is
open**: no committed artifact reaches either threshold in Node (best case
−5.0% on the full-set slice; the initial run measured the hard anchor +5.2%
behind), and the current Stage A paired arms both run the post-PR-2 kernel,
so the gate needs dedicated browser evidence ([gate
analysis](verification/STAGE-A-GATE-ANALYSIS.md)).

### PR 3 — Common verifier and semantic oracle (landed)

[src/domain/verifier.ts](../../src/domain/verifier.ts) freezes acceptance as
versioned policy (revision `src-verifier-1.0.0`): finite-value refusal,
scale-aware closure, three-way proper-divisor reduction, attraction margin.
Verdict codes, thresholds, and the mathematics are specified in
[PERFORMANCE-MATHEMATICS.md](PERFORMANCE-MATHEMATICS.md). The lag scan and the
analytic fast paths migrated to verifier-gated acceptance; every
legacy-vs-verifier divergence is adjudicated by the double-double oracle
(`tests/unit/domain/orbit-oracle-adjudication.test.ts`).

### PR 4 — Checkpoint candidates (workstream C; landed behind the legacy-scan default)

[src/domain/checkpoint.ts](../../src/domain/checkpoint.ts) (revision
`src-checkpoint-1.0.0`) ports the PoC's `poc-checkpoint-1.0.1` schedule:
power-of-two interval doubling capped at the systematic ceiling, doubling
rejection re-arm against the same retained state, the oracle-matched
rejected-candidate budget (64), interval-exhaustion rolls evaluated
independently of the proposal branch, and the default-on verifier-gated
exhaustion scan. It is reachable through the versioned
`OrbitOptions.classifierMode` (`'legacy-scan'` default | `'checkpoint'` |
`'differential'`); differential mode runs both kernels per pixel, reports the
legacy answer, and counts disagreements into a preallocated record.

Committed directional evidence
([poc/performance/results/pr4/pr4-bench.json](../../poc/performance/results/pr4/pr4-bench.json),
labeled directional; balanced profile, 1024² raster slices, 15 timed passes):

- Lag comparisons reduced 97.0% per case (workstream C gate direction: >50%).
- Hard-view wall speedups 14.83× (126× anchor: 9852.78 → 664.389 ms median)
  and 11.60× (609× anchor: 3244.231 → 279.606 ms); full-set slice 7.02×.
  No case is slower.
- Differential counts: zero period disagreements on every slice; unresolved
  never worse than legacy (e.g. 94,494 → 80,514 unresolved pixels on the 126×
  anchor); |λ|-bit disagreements counted honestly (different proposal phases
  legitimately round differently; the dd-oracle test adjudicates the class).
- Matched-budget detection on the seeded corpus shows no checkpoint-only or
  legacy-only detections and negative median delay on the hard-anchor stratum
  (the schedule detects earlier), with `gateSummary.allDirectionalGatesPass: true`.

Workstream C gate (plan §5, quoted): `Lag comparisons reduced >50%; weighted median ≥25%; hard views ≥2×; no case >5% slower`. Kill condition: `Any false attracting result or wrong primitive period; unresolved rate +>0.1 percentage point`. The first Stage A run
([gate analysis](verification/STAGE-A-GATE-ANALYSIS.md)) measures every
release-gate case ≥2× in both automation-bundled engines (3.66×–16.88×
Chromium, 6.00×–27.31× Firefox) with zero median-level regression flags —
directional-pass-pending, not a gate decision; the comparison-reduction and
weighted-median percentages remain Node-only, and **the release-comparable
gate decision waits on the release-protocol Stage A runs**. Until then the
legacy scan stays the reported default.

### PR 5 — Period policy buckets and product language (workstream D; landed)

[src/domain/period-policy.ts](../../src/domain/period-policy.ts) (revision
`period-policy-1.0.0`) separates `systematicMaxPeriod` (Quick 16 / Balanced 32
/ Detailed 64 within 256/512/1024 iterations) from `opportunisticMaxPeriod`,
stamps the §4 `evidenceSource` vocabulary on rich results (the lag scan maps
honestly to `fallback`; `checkpoint`/`catalog`/`chart`/`algebraic` are
reserved for PR 4+ sources), and drives the user-facing quality copy. The
initial derivation keeps the opportunistic ceiling equal to the systematic
one — the PoC opportunistic bucket (DE-guess mode, ceiling 96) recovered zero
detections above the systematic caps at ~1.03× cost on this corpus — and the
policy is test-pinned so raising it cannot alter classification outcomes,
`maxIterations`, or acceptance thresholds (plan invariant 8).

Workstream D gate (plan §5, quoted): `Higher-period verified hits display without raising the quality barrier; no guarantee ambiguity`.

## Stage A — target-hardware baseline and gate runs (first run complete; release protocol pending)

Stage A is the benchmark-contract execution of plan §9 on the declared target
laptop class: production bundle, stable branded Chrome and Firefox, frozen
corpus v1, repetition counts and BCa paired intervals per the protocol,
artifacts under `evidence/phase-2/<date>-<commit>/` per the
[evidence contract](../../evidence/phase-2/README.md). The **first run is
complete and committed**
([evidence/phase-2/2026-09-02-6f49f19/](../../evidence/phase-2/2026-09-02-6f49f19/summary.md)):
screening protocol (9 paired repetitions), automation-bundled headless
Chromium and Firefox, production bundle, full frozen corpus at the shipping
raster, with the paired semantic comparison. It is the directional baseline
record for the absolute latency budgets, and the per-gate evidence analysis
lives in [STAGE-A-GATE-ANALYSIS.md](verification/STAGE-A-GATE-ANALYSIS.md).
**No gate that depends on Stage A is decided**: release-gate cases still need
≥21 paired repetitions with BCa intervals, branded stable browsers, headed, on
the declared target hardware (plan §9).

Stage A decisions that nothing else may preempt:

1. The workstream B speed gate (≥10% classifier or ≥8% end-to-end, both
   browsers).
2. The workstream C gate percentages above, at release-comparable repetition
   counts, plus the matched-budget detection analysis on the stratified
   holdouts (plan §4).
3. Whether the `classifierMode` default may flip away from `legacy-scan`
   (plan §9 semantic-change rules; unresolved-rate increase ≤0.1 percentage
   point unless oracle-supported).
4. The frozen absolute coarse/stable latency budgets and the declared
   user-facing hard-view budget (plan §9, program-level success).

## Conditional workstreams — current evidence state

Each conditional needs a recorded accept/reject disposition (with retained
evidence) before Phase 2 closes; none blocks closure. Gates are quoted
verbatim from plan §5. "PoC evidence" is directional by definition. The
per-workstream disposition records — disposition, cited evidence, and the
exact next evidence need — live in
[WORKSTREAM-DISPOSITIONS.md](verification/WORKSTREAM-DISPOSITIONS.md), with
the per-gate evidence analysis (workstreams B, C, D, K, E, N, M, L) in
[STAGE-A-GATE-ANALYSIS.md](verification/STAGE-A-GATE-ANALYSIS.md).

| WS  | Deliverable (short)                                  | Current status and evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M   | Conjugate symmetry mirroring                         | **Borderline — do not implement dispatch dedup yet** (see [WORKSTREAM-DISPOSITIONS.md](verification/WORKSTREAM-DISPOSITIONS.md)). Browser PoC directional ([conjugate-mirror.json](../../poc/performance/browser/results/conjugate-mirror.json)): full-over-half+mirror wall ratio 1.574 (easy default) and 1.653 (symmetric hard view), mirror fill ~4 ms median; cross-run 1.57–2.04× easy / 1.65–1.77× hard ([PoC browser README](../../poc/performance/browser/README.md)) — the committed easy median is **below** the ≥1.6× bar, run-sensitive, one browser, headless. Semantic parity exact (0/131,072 per view). The harness parity variant is specified but not implemented (PoC README roadmap). |
| O   | Cross-profile semantic carryover                     | Not started; no PoC measurement. Disposition in [WORKSTREAM-DISPOSITIONS.md](verification/WORKSTREAM-DISPOSITIONS.md).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| N   | Cost-weighted static banding                         | **Recommend kill-or-scope-limit** (see [WORKSTREAM-DISPOSITIONS.md](verification/WORKSTREAM-DISPOSITIONS.md)). Browser PoC directional ([coarse-cost.json](../../poc/performance/browser/results/coarse-cost.json)): the skew gate fires on all three measured views (1.21/1.89/3.30), equal-cost banding helps the hard views (1.89→1.08, 3.30→2.09) but **worsens the interior-heavy easy view 1.21→1.59** with weak estimate-vs-actual correlation (r = 0.29) — the plan's kill criterion directionally fired on that view class.                                                                                                                                                                       |
| E   | Dynamic microbands (+ zero-copy, yields, band order) | Microbands not attempted. Renderer-path details have directional browser measurements: zero-copy transfer 0.2 ms vs 26.8 ms copy roundtrip at 1024×640 ([zero-copy-transfer.json](../../poc/performance/browser/results/zero-copy-transfer.json)); MessageChannel yields remove the ~4 ms nested-timer clamp ([yield-ab.json](../../poc/performance/browser/results/yield-ab.json)); band-order control behaves as specified ([band-order.json](../../poc/performance/browser/results/band-order.json)). N is attempted before E whenever E's skew gate fires.                                                                                                                                             |
| G   | Catalog/session/adjacent-pixel Newton candidates     | Not started as a PR. PoC directional evidence is strong on raster-coherent content ([summary.json](../../poc/performance/results/summary.json) grids; PoC README "PR 4 design inputs"): transplantation chains 255/255 hits at 0.004× checkpoint comparisons on coherent grids and improves weak-attraction detection; the multiplier-map guard refused 100% of attempts on the coarse anchor-2 grid with zero wrong results.                                                                                                                                                                                                                                                                              |
| F   | Reproducible period-12 core and runtime shards       | **Deferred by default** per plan rev 3/4 (workstream F disposition) and [ADR 0004](decisions/0004-catalog-disposition.md). The reopening gate does **not** fire on current evidence: matched-budget detection shows zero checkpoint-only and zero legacy-only detections on every stratum ([pr4-bench.json](../../poc/performance/results/pr4/pr4-bench.json)), and the measured seeding gains come from adjacent-pixel/session seeds (G's independent sources), not from a generated catalog ([WORKSTREAM-DISPOSITIONS.md](verification/WORKSTREAM-DISPOSITIONS.md)).                                                                                                                                     |
| H   | p3/p4 algebraic experiment                           | Not started; no PoC measurement.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| I   | Wasm SIMD backend                                    | Not started. Conditions and the scalar-Wasm stepping-stone gate are recorded in [ADR 0005](decisions/0005-conditional-wasm-simd-backend.md); direction accepted, work not begun.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| K   | Worker pool sizing                                   | **Hold for the declared ≥8-core target class** (see [WORKSTREAM-DISPOSITIONS.md](verification/WORKSTREAM-DISPOSITIONS.md)). Browser PoC directional ([pool-sizing.json](../../poc/performance/browser/results/pool-sizing.json)): on the 8-core test machine the 126× hard case improves from the 4-worker cap to 0.840× median wall at 8 workers (0.892× at 6) — below the ≥20% bar — and earlier committed runs measured 0.985×/0.864× and 0.69×/0.58× ([PoC browser README](../../poc/performance/browser/README.md)): the >4-worker verdict is run-sensitive, one browser. Gate needs ≥20% on a ≥8-core class in both browsers, plus the easy <3% and memory checks (unmeasured).                      |

Ship gates, quoted from plan §5: M — `≥1.6× classifier on real-axis-symmetric easy cases in both browsers with semantic parity under the tolerance policy; no corpus case beyond the normative regression cap`. O — `Paired profile-upgrade stable time ≤1.25× the unresolved-pixel share of a full recompute on corpus cases; carried pixels preserved exactly; any revision mismatch forces a full recompute`. N — `Attempted before E whenever E's skew gate (baseline slowest/mean elapsed >1.2) fires. Ships if hard paired median/p90 ≥10% better with easy <3% slower — E's bar at lower complexity. If N meets the bar, E is killed with retained evidence`. E — `Only if baseline slowest/mean elapsed >1.2; hard paired median/p90 ≥10% better with adequate samples; easy <3% slower`. G — `≥90% eligible attempts converge in ≤3 corrections; failures <3% overhead; targeted ≥20%, weighted ≥10%; transplant hit rate and wasted-attempt overhead reported per view`. F — `Evidence gate first: C and the Newton PoC must quantify seed value that checkpoint detection alone cannot provide. If attempted: counts, residuals, divisor exclusions and conjugate closure verified independently`. H — `Targeted ≥15% or weighted ≥5%; fallback ≤5%; zero incorrect results`. I — `Classifier ≥1.5× and end-to-end ≥1.25× in both browsers; no hard case >10% slower`. K —
`Hard-view wall-clock ≥20% better on a ≥8-core target class in both browsers; easy views <3% slower; memory within the versioned budget`.

## Research tracks (never release-gated into this phase)

- **J — Rigorous subdivision.** Not started. Gate (quoted): `Only certified enclosures may skip stable per-pixel work`; kill condition: `Never ship corner/edge agreement as stable proof`.
- **L — Trap-radius early accept.** Research-only standing unchanged (plan
  §12/L). The PoC kernel passed the oracle kill gate on the PoC corpus and
  grids — zero false attracting, zero wrong primitive periods — with large
  savings where it fires (0.047× checkpoint iterations on the weak-attraction
  grid at the detailed profile; `summary.json` grids) and zero overhead where
  it does not. The acceptance argument is numerical (linear-regime disk plus
  the unchanged verifier), not a certified enclosure, so the track remains
  open-ended research. Gate (quoted): `Oracle-validated: zero false attracting results across the corpus; measurable iteration savings on weak-attraction strata`.

## Honesty rules for this document

1. Directional numbers are never promoted to release evidence by rephrasing;
   the tier labels above travel with the numbers.
2. A workstream is "landed" when its code, tests, and frozen revisions are in
   the repository — not when its ship gate is met. Gate decisions are Stage A
   decisions.
3. Every number above is quoted from a committed artifact at the linked path;
   if the artifact changes, this document changes with it.
