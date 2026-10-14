# Conditional workstream dispositions — Phase 2 performance

Recorded dispositions for every conditional workstream of plan §5, as
required by the final Phase 2 exit criteria ("every conditional experiment
has a recorded accept/reject disposition"). Dispositions cite committed
evidence at each path; the gate quotes are verbatim from plan §5. Gate-level
evidence analysis for the workstreams the first Stage A run can measure lives
in [STAGE-A-GATE-ANALYSIS.md](STAGE-A-GATE-ANALYSIS.md); status is maintained
in [PERFORMANCE-PLAN.md](../PERFORMANCE-PLAN.md).

Dispositions as of the first Stage A run
([evidence/phase-2/2026-09-02-6f49f19/](../../evidence/phase-2/2026-09-02-6f49f19/summary.md),
screening protocol, automation-bundled Chromium + Firefox). These are working
dispositions, not closeout dispositions: the release-protocol Stage A runs can
still change B/C/D gate outcomes and any disposition they touch.

Required workstreams B, C, D are **implemented-and-pending-gate** (PRs 2–5
landed; first-run evidence is screening-level and directional):
B's speed gate is unmeasured in any browser, C is
directional-pass-pending, D is directional-pass-pending — records in
[STAGE-A-GATE-ANALYSIS.md](STAGE-A-GATE-ANALYSIS.md).

| WS  | Deliverable (short)              | Disposition                                                                    |
| --- | -------------------------------- | ------------------------------------------------------------------------------ |
| E   | Dynamic microbands               | **Not started**; renderer-path details have directional evidence; N precedes E |
| F   | Period-12 core + shards          | **Deferred by default; evidence gate does NOT fire on current evidence**       |
| G   | Catalog/session/adjacent Newton  | **Not started**; directionally strong PoC evidence, ship shape known           |
| H   | p3/p4 algebraic experiment       | **Not started**; no PoC measurement                                            |
| I   | Wasm SIMD backend                | **Not started**; direction accepted under ADR 0005 conditions                  |
| J   | Rigorous subdivision (research)  | **Not started** (research track; gate quoted below)                            |
| K   | Worker pool sizing               | **Hold** for the declared ≥8-core target class before any PR                   |
| L   | Trap-radius early accept         | **Research-only**; PoC oracle gate passed directionally                        |
| M   | Conjugate symmetry mirroring     | **Borderline — do not implement yet**; repeated runs + release engines first   |
| N   | Cost-weighted static banding     | **Recommend kill-or-scope-limit**; kill criterion fired on the easy class      |
| O   | Cross-profile semantic carryover | **Not started**; no PoC measurement                                            |

## Workstream E — dynamic microbands (+ renderer-path details)

Disposition: **not started** (microbands never attempted). The gate's
trigger condition directionally fires (equal-height slowest/mean at the
production band count is 1.21 / 1.89 / 3.30 on the three PoC views,
[coarse-cost.json](../../poc/performance/browser/results/coarse-cost.json)),
so E remains a live conditional, but its ship gate
(`hard paired median/p90 ≥10% better with adequate samples; easy <3%
slower`) has no wall-time evidence at all. The plan §11 ordering stands: N is
attempted before E wherever the skew gate fires, and N's easy-view kill
criterion must be resolved first (below).

Renderer-path details have directional browser evidence and keep their
measured, individually-gated standing (plan §5 "Renderer-path efficiency
details"): zero-copy transfer 0.2 ms vs 26.8 ms copy roundtrip at 1024×640
([zero-copy-transfer.json](../../poc/performance/browser/results/zero-copy-transfer.json));
MessageChannel yields remove the ~4 ms nested-timer clamp
([yield-ab.json](../../poc/performance/browser/results/yield-ab.json));
center-out band order improves t50-rows under skew (60.4 → 43.1 ms) with the
uniform control unchanged (49.1 vs 48.5 ms)
([band-order.json](../../poc/performance/browser/results/band-order.json));
packed status+period output saves exactly 1 MiB per 1024² frame with zero
round-trip mismatches ([summary.json](../../poc/performance/results/summary.json)
`packedOutput`) and is adopted only together with zero-copy.

What would start E: a residual-skew demonstration after N's disposition, plus
a wall-time paired microband measurement per the gate. Evidence:
[STAGE-A-GATE-ANALYSIS.md](STAGE-A-GATE-ANALYSIS.md) workstream E record.

## Workstream F — reproducible period-12 core and runtime shards

Disposition: **deferred by default per plan rev 3/4 and
[ADR 0004](../decisions/0004-catalog-disposition.md); on current committed
evidence the reopening gate does NOT fire.**

F's evidence gate (plan §5, verbatim): `Evidence gate first: C and the Newton
PoC must quantify seed value that checkpoint detection alone cannot provide.
If attempted: counts, residuals, divisor exclusions and conjugate closure
verified independently`. Checked against the committed evidence:

- C's matched-budget detection analysis
  ([pr4-bench.json](../../poc/performance/results/pr4/pr4-bench.json)
  `matchedBudgetDetection`) reports zero checkpoint-only and zero legacy-only
  detections on every corpus stratum — the checkpoint schedule alone leaves no
  detection shortfall on this corpus that seeds could fill.
- The measured seeding gains (transplantation: weak-p6a balanced 64 vs 109
  unresolved,
  [summary.json](../../poc/performance/results/summary.json) grids; 255/255
  hit chains at 0.004× comparisons on coherent grids) come from
  adjacent-pixel/session seeds — workstream G's independent seed sources — not
  from a generated catalog core.
- The corpus detects no period above the systematic caps anywhere
  ([README](../../poc/performance/README.md): the opportunistic bucket
  recovered zero detections), and the plan §9 Catalog class is intentionally
  absent from corpus v1
  ([PERFORMANCE-CORPUS.md](PERFORMANCE-CORPUS.md#catalog-class-reserved)).

State that plainly: **no committed artifact quantifies catalog-core seed value
that checkpoint detection alone cannot provide, so F's gate is not fired and
the deferral stands.** Reopening requires new evidence of exactly that shape,
on the frozen corpus with the catalog class added per the corpus policy.

## Workstream G — catalog/session/adjacent-pixel Newton candidates

Disposition: **not started as a PR**; directionally strong PoC evidence with
a known ship shape. Gate (plan §5, verbatim): `≥90% eligible attempts converge
in ≤3 corrections; failures <3% overhead; targeted ≥20%, weighted ≥10%;
transplant hit rate and wasted-attempt overhead reported per view`.

Evidence: [summary.json](../../poc/performance/results/summary.json) grids —
transplantation chains 255/255 hits at 0.004× checkpoint comparisons on
coherent grids (rabbit detailed: hits 255/255, ratio 0.0039), improves
weak-attraction detection (weak-p6a balanced 64 vs 109 unresolved), and the
multiplier-map guard refuses 100% of attempts on the coarse anchor-2 grid
(221/221) with zero wrong results and exact fallback cost — graceful by
construction. Directional only (Node/V8, 16×16 grids, left-neighbor-only
hints; the production dispatcher has two-dimensional neighborhood context the
PoC does not measure).

What would start it: a release-protocol hard-view budget shortfall that the
checkpoint path cannot close (the Stage A absolute-latency budget decision,
plan §9 program-level success), plus a PR implementing the session
atlas/transplantation seed source behind the frozen guard + ≤3-Newton policy
and the common verifier.

## Workstream H — p3/p4 algebraic experiment

Disposition: **not started**; no PoC measurement exists. Gate (plan §5,
verbatim): `Targeted ≥15% or weighted ≥5%; fallback ≤5%; zero incorrect
results`. Kill: `Keep research-only if inversion/branch selection costs exceed
orbit/Newton path`. What would start it: a feasibility measurement showing
robust low-period candidate generation whose acceptance path repays its cost
on the corpus — none has been proposed or recorded. No change to its standing
from the first Stage A run.

## Workstream I — Wasm SIMD backend

Disposition: **not started**; conditions and the scalar-Wasm stepping-stone
gate are recorded in [ADR 0005](../decisions/0005-conditional-wasm-simd-backend.md);
direction accepted, work not begun. Gate (plan §5, verbatim): `Classifier
≥1.5× and end-to-end ≥1.25× in both browsers; no hard case >10% slower`. Kill:
`Do not ship merely because SIMD is available; reject on insufficient
end-to-end gain`. What would start it: the release-protocol C-gate decision
(the stable algorithm must be fixed first, plan §11 sequencing rationale), a
scalar-Wasm capability measurement, and a declared target-hardware run.
Nothing in the first Stage A run changes this ordering.

## Workstream J — rigorous subdivision (research)

Disposition: **not started** (research track). Gate (plan §5, verbatim):
`Only certified enclosures may skip stable per-pixel work`; kill:
`Never ship corner/edge agreement as stable proof`. Open-ended; not
release-gated into this phase (plan §11/§12). No committed measurement.

## Workstream K — worker pool sizing

Disposition: **hold** — no PR until the gate's declared hardware class exists.
The committed PoC run
([pool-sizing.json](../../poc/performance/browser/results/pool-sizing.json))
measures 0.892×/0.840× (6/8 workers vs the 4-worker cap) on the 8-core
i7-1185G7 — below the `≥20%` bar — while the committed README records earlier
runs at 0.985×/0.864× and 0.69×/0.58×: the >4-worker verdict swings 0.58×–0.985×
across runs on this part-HT laptop, one browser, Balanced-not-Detailed
([README](../../poc/performance/browser/README.md)). Record both facts; do not
resolve the verdict from either alone.

What would start it: declared ≥8-core target-class hardware, both branded
browsers, Detailed profile, easy-view <3% guard, memory high-water within the
versioned budget, and repeated runs bounding the swing
([STAGE-A-GATE-ANALYSIS.md](STAGE-A-GATE-ANALYSIS.md) workstream K record).
Startup/merge overhead is measured directionally and is not the blocker
(spawn ≤1.5 ms for 8 workers).

## Workstream L — trap-radius early accept

Disposition: **research-only, standing unchanged** (plan §12/L). The PoC
oracle kill gate passed directionally — zero false attracting, zero wrong
primitive periods on the corpus and all grids
([run-manifest.json](../../poc/performance/results/run-manifest.json) `gate`,
[summary.json](../../poc/performance/results/summary.json) grids) — with
large savings where it fires (weak-p6a detailed 0.0475× checkpoint
iterations, 255/255 hits, zero Newton failures) and zero overhead where it
does not (1.000× on strongly attracting grids). The acceptance argument is
numerical (linear-regime disk plus the unchanged verifier), not a certified
enclosure, so the track remains open-ended research and is never
release-gated into this phase. Gate (plan §5, verbatim): `Oracle-validated:
zero false attracting results across the corpus; measurable iteration savings
on weak-attraction strata`. The |λ| ≥ 0.99 regime is unmeasured (no grid seed
reaches it).

## Workstream M — conjugate symmetry mirroring

Disposition: **borderline — do not implement dispatch dedup yet**. The
committed PoC run
([conjugate-mirror.json](../../poc/performance/browser/results/conjugate-mirror.json))
measures 1.574× on the binding real-axis-symmetric easy case — **below** the
`≥1.6×` bar — with per-rep 1.574–2.138× and cross-run 1.57–2.04×
([README](../../poc/performance/browser/README.md)); the symmetric hard
variant clears the bar consistently (1.653×; cross-run 1.65–1.77×). Semantic
parity is exact (0 mismatches over 131,072 mirrored pixels per view) and
mirror fill is ~4 ms. Verdict is run-sensitive and single-browser.

What would change it: repeated runs bounding the easy-case ratio, the second
browser, and the shipping 1024×640 raster (measured at 512²). If the easy-case
ratio stays below the bar in repeated runs, record the reject per the gate's
kill conditions with this evidence retained
([STAGE-A-GATE-ANALYSIS.md](STAGE-A-GATE-ANALYSIS.md) workstream M record).

## Workstream N — cost-weighted static banding

Disposition: **recommend kill-or-scope-limit**. The skew gate fires on all
three measured views (1.21 / 1.89 / 3.30 > 1.2), and equal-cost banding works
where the coarse signal tracks stable-pass cost — hard 126× 1.886 → 1.078,
ambiguous boundary 3.302 → 2.090 — but on the interior-heavy easy default
view the signal mispredicts (estimate-vs-actual r = 0.29) and equal-cost
banding **worsens the skew 1.212 → 1.594**: the plan's kill criterion
(`Kill if the coarse-pass cost signal mispredicts stable-pass cost`)
directionally fired on that view class
([coarse-cost.json](../../poc/performance/browser/results/coarse-cost.json),
including the artifact's own recorded assessment).

Bounded recommendation: do not implement N as an unconditional static
banding. Either (a) record the kill with this evidence — hard views would
still be addressed by E on the residual skew per the gate's kill clause — or
(b) scope-limit: gate per-view on a coarse-signal validation (correlation
threshold on the already-computed coarse frame) and never band a view class
the model mispredicts; the easy <3% wall guard remains unmeasured either way.
The ship bar itself (hard paired median/p90 wall ≥10%, easy <3% slower) has no
wall-time evidence; if (b) is pursued, measure it first
([STAGE-A-GATE-ANALYSIS.md](STAGE-A-GATE-ANALYSIS.md) workstream N record).

## Workstream O — cross-profile semantic carryover

Disposition: **not started**; no PoC measurement. Gate (plan §5, verbatim):
`Paired profile-upgrade stable time ≤1.25× the unresolved-pixel share of a
full recompute on corpus cases; carried pixels preserved exactly; any revision
mismatch forces a full recompute`. Kill: `Kill if merge/provenance complexity
or unresolved-heavy views erase the savings`. What would start it: a
paired profile-upgrade measurement over corpus cases (quick→balanced and
balanced→detailed transitions at fixed viewports) quantifying the
unresolved-pixel share N/O could carry; none exists yet. Note the
unresolved-heavy Scale/Fallback cases are exactly where the carry would help
most and where the kill risk also lives; no committed artifact measures the
share.
