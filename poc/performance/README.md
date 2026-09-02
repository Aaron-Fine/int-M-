# PoC performance harness

Directional, oracle-checked evidence harness for the classifier work in
`docs/plans/int-m-performance-plan.html`. This is delivery **Step 0** (plan
§11): a self-contained harness that A/B-tests alternative detection schedules
and candidate sources against the legacy classifier and a double-double
oracle, so that PR 1's corpus and gate choices rest on data instead of
intuition. It is a prerequisite for PR 1 and feeds the workstream C ship
gates defined in §5. All evidence produced here is **directional (Node/V8
approximates Chrome)**; it does not replace Stage A browser evidence.

## Layout

```
poc/performance/src/
  oracle/dd.ts           double-double arithmetic (two-product based)
  oracle/classify-dd.ts  dd oracle: proximity scan + Newton polish + certification
  verifier.ts            common verifier: scale-aware closure, three-way
                         proper-divisor policy, attraction margin
  corpus.ts              deterministic seeded corpus (10 strata, ~225 points)
  grids.ts               deterministic 16x16 raster grids (neighbor evidence)
  kernels/shared.ts      metrics contract, proposal budget, full lag scan
  kernels/control.ts     control kernel (faithful port of src/domain/orbit.ts)
  kernels/checkpoint.ts  power-of-two approximate checkpoint schedule
  kernels/trigger.ts     convergence-triggered single scan
  kernels/staggered.ts   staggered harmonic lag testing
  kernels/de-guess.ts    DE period guessing (B-recurrence arming gate)
  kernels/neighbor.ts    neighbor-informed lag ordering
  kernels/seed-common.ts shared raster-seed machinery (transplant + trap)
  kernels/transplant.ts  adjacent-pixel transplantation with attempt guard
  kernels/trap.ts        trap-radius early accept (research, oracle-gated)
  kernels/packed.ts      packed status+period Uint32 encoding
  pr2-bench.ts           pr2 microbench: scalar kernel vs allocating pipeline
  run.ts                 differential runner (CLI)
  results/               runner output (committed); results/pr2/ microbench
```

## Running

- Differential runner (writes `src/results/`, ~4 s, no dependencies):

  ```
  npm run poc:perf
  ```

  Requires Node >= 24 (TypeScript is executed natively). Exit code is
  non-zero when the correctness gate fails (see below).

- Tests (also part of `npm run check`):

  ```
  npx vitest run poc
  ```

- Typecheck: `tsc --noEmit -p tsconfig.poc.json` (included in
  `npm run typecheck`).

## PR 3 note: src verifier and the frozen control baseline

Since PR 3, `src/domain/verifier.ts` is the production common verifier
(frozen policy revision `src-verifier-1.0.0`: scale-aware closure, three-way
proper-divisor reduction, attraction margin; the classifyInto lag scan
mirrors its body inline for the V8 reason documented there, and the
analytic fast paths pass the same margin policy). Production acceptance is
now honest and versioned. The PoC verifier above and the src verifier are
separately frozen policies whose threshold values currently agree.

The **control kernel stays frozen** as the legacy baseline: it does not gain
divisor reduction or the margin, because its value is being the faithful
pre-PR-3 differential comparator. Its parity contract with the production
classifier (`control.test.ts`) is therefore status/iterations/evidence
always, period except documented non-primitive legacy multiples, and every
divergence is adjudicated against the dd oracle
(`tests/unit/domain/orbit-oracle-adjudication.test.ts`). The control's
wrong-primitive-period results versus the oracle (2-3 per profile, see the
findings below) are exactly the legacy flaw the src verifier fixes.

## PR 5 note: where the opportunistic ceiling decision lives

The systematic/opportunistic period split this document's PR 4 design
inputs point to has landed as vocabulary in `src/domain/period-policy.ts`
(revision `period-policy-1.0.0`, plan §4 workstream D): per-profile
`systematicMaxPeriod`/`opportunisticMaxPeriod`/`maxIterations` policies,
the §4 `evidenceSource` vocabulary stamped on rich attracting results
(the lag scan maps honestly to `fallback`, the closed forms to `analytic`,
and checkpoint/catalog/chart/algebraic are reserved for PR 4+ sources),
and the policy-driven product language in `src/ui/`. The PoC harness
remains the evidence base for the ceiling decision itself: the
opportunistic bucket (DE-guess mode, ceiling 96, see the findings below)
recovered zero detections above the systematic caps at ~1.03x cost on this
corpus, so the initial derivation keeps the opportunistic ceiling equal to
the systematic one, and the policy is test-pinned so raising it cannot
alter classification outcomes, `maxIterations`, or the acceptance
thresholds (invariant 8). PR 4's checkpoint candidate source is expected
to be the first consumer that raises it under a new policy revision.

## PR 2 microbench (`pr2-bench.ts`)

Benchmarks the production allocation-free scalar classification pipeline
(`classifyInto` into a preallocated `OrbitSample`, plan §5 workstream B)
against the pre-PR2 pipeline shape: the control kernel driven through an
allocating `pixelToComplex` boundary and per-pixel result records. Two fixed
1024×1024 raster slices cut from the corpus hard-view anchors (the deep
real-axis anchor 2 and a full-set view) are classified 15 timed passes per
variant; medians and MADs of wall time, raw samples, and a dedicated
GC-observed allocation pass (scavenge counts converted to a conservative
per-pixel churn bound with the observed young-generation capacity, plus
per-pixel object counts by construction) are written to
`results/pr2/pr2-microbench.json`.

Before timing, each case runs a full-raster **parity gate**: status, raw
escape iteration, smooth escape iteration (the control kernel omits it, so
the bench wrapper recomputes it the way the pre-PR2 production classifier
did), period, and multiplier magnitude/angle must be bit-identical on every
pixel between the variants. Any divergence aborts the run with a non-zero
exit code and no results.

Run with `npm run poc:bench:pr2` (requires `--expose-gc`, which the script
supplies). Current committed verdict: the scalar pipeline churns no garbage
(0–1 scavenges per pass versus 4–8 for the allocating shape) and its
classify-time spread tightens on interior-heavy slices, while wall-clock
medians sit at parity to somewhat behind the allocating comparator in
Node/V8 — the workstream B speed gate stays open for Stage A browser
evidence. Writing the bench exposed a real M1 kernel defect (a non-inlined
verify helper inside the orbit loop forced tagged Float64 phis, allocating
per iteration), fixed in `src/domain/orbit.ts` and documented there.

## Schedules, candidate sources, and frozen policies

All kernels share the analytic fast paths (main cardioid, period-2 bulb),
the common verifier for acceptance, and the closed-form helpers in
`kernels/shared.ts`. Proposal threshold is the permissive `tauCandidate`
(1e-8, scale-aware); acceptance is the verifier's strict `tauAccept` policy
(1e-10 with the legacy 100x forward-closure relaxation). `tauCandidate` vs
`tauAccept` is deliberate: proposals may fire early, only verifier acceptance
classifies. **No variant classifies on its own** — every attracting result in
this harness is a common-verifier acceptance.

- **Control** (`kernels/control.ts`): faithful port of the legacy all-lag
  scan (`src/domain/orbit.ts`), including its lack of primitive-period
  reduction. It is the differential baseline.
- **Checkpoint** (`kernels/checkpoint.ts`, revision `poc-checkpoint-1.0.1`):
  Brent-inspired power-of-two checkpoints. One lag comparison per step
  against the retained checkpoint; a proximity hit proposes lag `q = n - k`;
  on interval exhaustion the current state becomes the next checkpoint and
  the interval doubles (capped at `maxPeriod`). Rejection-retry is frozen:
  a failed proposal freezes comparisons and checkpoint updates for a
  doubling re-arm gap (1, 2, 4, ...) and then retests against the SAME
  retained state. Proposals are capped at the systematic `maxPeriod`.
- **Trigger** (`kernels/trigger.ts`, revision `poc-trigger-1.0.0`):
  per-iteration step gate `|z_n - z_{n-1}| <= gate * max(1, |z_n|)` starting
  at `tauCandidate`; when it fires, one full lag scan from the current
  state. Failed scans consume the per-pixel scan cap (8) and re-arm the gate
  at a quarter of the previous threshold (plan §4).
- **Staggered** (`kernels/staggered.ts`, revision `poc-staggered-1.0.0`):
  lag `p` is tested only when `p` divides the iteration index; average
  comparisons per iteration fall to ~H(maxPeriod). No explicit re-arm: a
  failed lag is retried naturally at the next multiple.
- **DE period guessing** (`kernels/de-guess.ts`, revision
  `poc-de-guess-1.0.0`): candidate source layered on the checkpoint
  schedule, using the plan §6 parameter-derivative recurrence
  `B_{j+1} = 2 z_j B_j + 1` (`B_n = dz_n/dc`). Frozen design note: the
  naive "fire when B settles" criterion is period-1-only — on a period-p
  cycle the B sequence converges to a _periodic_ sequence, so consecutive B
  differences never vanish for p ≥ 2. The frozen criterion instead uses the
  p-free magnitude split the interior/exterior distance estimates are built
  from: `|B_n| > 1e8·max(1,|z_n|)` disarms proposals for the pixel
  (exterior-bound), `|B_n| ≤ 1e6·max(1,|z_n|)` re-arms them (hysteresis
  pair, `DE_GUESS_THRESHOLDS`). On a rejected checkpoint proposal one
  extension round proposes the remaining `tauCandidate`-proximity lags
  ordered by DE plausibility (ascending B-return consistency
  `|B_n − B_{n−lag}|`, ties toward the smaller lag), budget-gated and
  verifier-decided. The **opportunistic** mode caps proposals at
  `DE_OPPORTUNISTIC_CEILING = 96` (matches the dd oracle's `maxPeriod`, so
  acceptances stay oracle-adjudicable) and is reported alongside the
  systematic mode.
- **Neighbor-informed lag ordering** (`kernels/neighbor.ts`, revision
  `poc-neighbor-1.0.0`): consumes the previously classified left
  neighbor's detected primitive period as a hint. Frozen policy: one
  hinted lag comparison per step (tauCandidate proximity proposes
  `(z_n, h)` to the common verifier; checkpoint-style doubling re-arm on
  rejection), the frozen trigger step gate + hint-ordered full scan as the
  fallback when the hint cannot match, hint-ordered exhaustion scan. In the
  flat matrix the hint is the previous corpus point's period (a documented
  weak-hint control); the real raster measurement is the grid section below.
- **Adjacent-pixel transplantation** (`kernels/transplant.ts`, revision
  `poc-transplant-1.0.0`, shared seed machinery in `kernels/seed-common.ts`):
  keeps the last verified-accepting cycle (period, cycle point, multiplier,
  seed parameter) as a persistent seed; predicts the neighbor cycle point
  via the plan §6 parameter derivative (`dz-star/dc = B_cycle/(1−λ)` with
  `B_cycle` from one B-recurrence walk of the seed cycle), guarded by the
  plan's multiplier-map attempt region `|B_cycle|·|Δc|/|1−λ| ≤ 1e-2`
  (`TRANSPLANT_THRESHOLDS`, frozen), seeds ≤3 binary64 Newton corrections
  against the new parameter, and lets the common verifier decide; refusals
  and rejections fall back to the checkpoint kernel. Analytic acceptances
  never seed (documented PoC simplification).
- **Trap-radius early accept** (`kernels/trap.ts`, revision `poc-trap-1.0.0`,
  **research, oracle-gated**): with a verified neighbor seed in the
  weak-attraction regime (seed |λ| ≥ 0.8, `TRAP_THRESHOLDS`, frozen) and
  the plan §6 guard passed, the kernel estimates a trapping disk around the
  predicted neighboring cycle point (radius `4·|1−λ|·max(1,|z_pred|)`,
  inside the linear regime of `f_c^p`), and when the orbit enters the disk
  it computes the **per-pixel** multiplier `λ_n = (f^p)'(z_n)`, requires
  `|λ_n| < 1 − attractMargin`, Newton-polishes (≤ 4 steps, residual below
  the verifier's divisor scale), and proposes to the **unchanged common
  verifier** — the early accept only skips waiting for tighter orbit
  convergence, never weakens acceptance.
- **Packed status+period output** (`kernels/packed.ts`, revision
  `poc-packed-1.0.0`): frozen encoding — status code in bits 24–31
  (0 reserved, 1 escaped, 2 attracting, 3 unresolved), primitive period ≤
  2²⁴−1 in bits 0–23 (non-attracting statuses pack period 0; a period that
  does not fit throws). Every corpus classification carries its packed word
  in the runner records with the decode asserted on write.

Shared rejection budget: `CANDIDATE_REJECTION_BUDGET = 64` per pixel
(`kernels/shared.ts`), matching the dd oracle's `candidateVerifyBudget`.
Every non-accepted verdict consumes budget; when it is exhausted a kernel
stops proposing (and stops paying for proposal-only comparisons), including
the exhaustion scan. The orbit walk always continues so escape
classification is unaffected. The transplant/trap attempts spend at most one
verifier call from their own budget instance before the fallback kernel's
separate per-pixel budget starts.

**Exhaustion scan** (plan §4): when a schedule ends its orbit budget
unresolved, one final full lag scan from the final state can recover missed
detections. Default on for all schedules; the runner measures each schedule
and each new variant with the scan on and off (for the fallback-based
variants the flag applies to the fallback kernel), and
`kernels/shared.ts:fullLagScan` is the single implementation.

## Metrics

- `lagComparisons` — primary deterministic cost metric: candidate lag
  distance evaluations. Trigger step gates, checkpoint interval
  bookkeeping, DE arming-gate checks, and Newton/transplant walks are _not_
  lag comparisons (orbit work shows up in `iterations` and the per-variant
  counters instead).
- `totalIterations` — orbit work; `iterations` per point is the detection
  iteration (budget end for unresolved/escaped).
- `verifierCalls` — candidate proposals reaching the verifier; rejections
  are counted by reason (`rejectedNonFinite`, `rejectedNoClosure`,
  `rejectedNotAttracting`) plus `verifierAmbiguous` for the unresolved
  verdicts of the three-way divisor policy.
- Variant counters: `deGuessRounds`, `transplantAttempts`,
  `transplantGuardRefusals`, `transplantSeedLambda`, `trapProposals`,
  `trapNewtonFailures`, `trapOrbitWork`.
- `kappa` — `-log|lambda| / period`; JSON `null` encodes the `+Infinity`
  superattracting identity (never do arithmetic on it).
- Statuses: `attracting`, `escaped`, `unresolved`; every record also
  carries the packed status+period word (`packed`).

## Results format (`src/results/`)

- `raw.<profile>.<variant>.json` — one record per point: id, stratum,
  kernel, exhaustion flag, status, iterations, evidence, the packed
  status+period word, period and multiplier fields when attracting, and the
  metric counters. No timestamps.
- `summary.json` — per-profile, per-variant, per-stratum aggregates:
  total lag comparisons (primary) with ratios vs control AND vs the
  checkpoint schedule, unresolved rate with deltas vs both baselines,
  false-attracting and wrong-primitive-period counts (gate),
  unadjudicated-attracting and missed-detection counts,
  candidate-budget-exhausted counts, opportunistic-period counts, and the
  matched-budget detection-delay distributions versus control and versus
  checkpoint (per-point `periodDelta` and `iterationDelay`, distributions
  not aggregates). Plus the two sections below.
- `summary.json` → `grids` — the deterministic 16×16 raster grids
  (`src/grids.ts`, ten frozen specs: three hard anchors, rabbit/co-rabbit,
  period-5, an analytic weak-cardioid witness, and three near-boundary
  weak grids on the rabbit component's period-6 satellite found by a
  frozen multiplier probe), measured at the balanced and detailed
  profiles: per grid, checkpoint vs neighbor (left-neighbor hint) vs
  transplant (persistent seed) vs trap, oracle-adjudicated with the same
  zero gate; per-grid comparison ratios, hint/transplant hit shares,
  per-point iteration deltas, trap proposal/Newton counters, and
  guard-refusal rates by seed-|λ| bucket.
- `summary.json` → `packedOutput` — the 1024² raster-slice measurement of
  the packed encoding: byte counts of both layouts (allocated
  `byteLength`s), bytes saved, round-trip mismatch count (must be 0), and
  the slice's status histogram.
- `run-manifest.json` — node version, verifier/kernel revisions and frozen
  thresholds, corpus seed and size, harness revision, dd oracle options, and
  directional wall-time medians (recording pass + one discarded warmup pass,
  then the median of 5 timed passes), explicitly labeled
  **directional — Node/V8 evidence, not release evidence**.

### Adjudication rules

- `falseAttracting` — variant claims attracting where the dd oracle proves
  escape. Must be zero for every schedule variant AND every grid-section
  kernel row (non-zero exit code).
- `wrongPrimitivePeriod` — both variant and oracle find an attracting cycle
  but the primitive periods differ. Must be zero for schedule variants and
  grid rows (non-zero exit code).
- Oracle-unresolved points cannot adjudicate attracting claims (the oracle
  deliberately lacks the analytic fast paths and cannot reach closure inside
  its budget near-parabolic attraction); those are counted as
  `unadjudicatedAttracting`, never as false.
- `control` is the legacy classifier under differential test: the plan kill
  gate for workstream C applies to the schedule variants. Control's
  wrong-primitive-period results are reported (manifest
  `gate.legacyBaselineWrongPrimitivePeriod`) instead of failing the run.

## Measured verdicts vs the checkpoint baseline (directional)

Numbers below are the committed `summary.json` at the detailed profile
unless stated; comparisons ratios are vs `checkpoint.exhaustion-on`.

- Schedules: checkpoint 29,565 comparisons at 8.77% unresolved; control
  1,800,798 (61×); trigger 1,503 (0.051×) with exhaustion on but 0 with
  exhaustion off and a +21pp unresolved jump (the p ≥ 2 blindness below);
  staggered 134,699 (4.6×). Zero false/wrong everywhere except control's
  known legacy flaw (2–3 wrong primitive periods per profile, reported).
- **DE period guessing**: cost parity with its checkpoint host (0.995× on /
  0.951× off), identical detections, unresolved delta 0. The B-based
  exterior short-circuit fires on genuinely exterior-bound orbits (the
  exact float64 repelling cycle costs one exhaustion scan instead of
  burning the budget) but not on the corpus's near-zero-Lyapunov late
  strata within PoC budgets. The opportunistic bucket costs ~1.03× and
  recovers no extra detections here — the corpus has no period above the
  systematic caps — with 6 small (32–64 iteration) detection delays on
  hard-anchor points from the wider interval ceiling.
- **Neighbor-informed ordering** (grids): coherent interior grids detect
  255/256 pixels through the hint alone at 0.085–0.168× checkpoint
  comparisons; mixed-content anchor grids 0.31–0.82×. Honest caveat: hint
  quality depends entirely on spatial coherence — broken hint chains fall
  back to the p ≥ 2-blind step gate, and on weak-p6a at balanced the
  neighbor misses MORE detections than the checkpoint (144 vs 109
  unresolved) because the checkpoint's per-step cadence samples the
  oscillating closure residual at many states while hint-less pixels depend
  on one exhaustion-scan state.
- **Transplantation** (grids): coherent grids chain 255/255 hits at
  **0.004×** checkpoint comparisons (rabbit, co-rabbit, period-5, weak-p3,
  weak-p6a); mixed anchor grids 0.58–0.66×; the coarse anchor-2 grid
  (pixel spacing 1.2e-2) refuses **every** attempt at the guard (221/221)
  and degrades to exact fallback cost (1.000×) — graceful by construction.
  Transplant Newton hits also _improve_ detection on weak-p6a at balanced
  (64 vs 109 unresolved): polished seeds reach verifier acceptance before
  the orbit converges. Guard refusals by seed-|λ| bucket (detailed):
  <0.5 146/1071, 0.5–0.9 125/486, 0.9–0.99 32/321; the 0.99+ bucket is
  unmeasured because no grid seed reaches |λ| ≥ 0.99 (weak-p6b stays
  unresolved at every PoC budget).
- **Trap** (grids, research): weak-p6a **0.047× checkpoint iterations with
  255/255 hits and zero Newton failures** (detailed); weak-p6a at balanced
  0.292× with 64 vs 109 unresolved; anchor grids 0.80–0.87×; strongly
  attracting grids pay zero overhead (1.000× — the minLambda gate refuses
  before any work); weak-p6b cannot seed and stays 1.000×. **Oracle
  verdict: zero false attracting and zero wrong primitive periods on the
  whole corpus and all grids — the workstream L kill gate passes on this
  corpus.** The acceptance argument is numerical (linear-regime disk +
  verifier), not a certified enclosure; plan §12/L keeps it research-only.
- **Packed output**: packed 4,194,304 B vs two-field 5,242,880 B on the
  1024² slice = exactly 1 MiB (20% of the status+period bytes) saved per
  frame, round-trip mismatches 0/1,048,576 pixels; adoption stays gated on
  the zero-copy tile pipeline (plan §5).

## PR 4 design inputs

Which committed evidence supports which PR 4 (checkpoint candidates)
decision:

- **Schedule choice.** The checkpoint schedule is the only A/B member with
  no detection blind spot at PoC profiles (unresolved delta 0 vs control
  with exhaustion on AND off) while cutting comparisons ~64× vs control;
  the trigger is cheaper still (0.05×) but its §4 step gate structurally
  cannot fire on settled p ≥ 2 cycles (the delay distributions show
  detections at budget end only), and staggered costs 4.6× checkpoint.
  Evidence: `summary.json` per-profile totals plus the matched detection
  delay distributions vs control and vs checkpoint. PR 4 should build the
  candidate queue on the checkpoint schedule and treat trigger-style gates
  as at most an add-on after a cycle-aware redefinition.
- **Exhaustion-scan default.** For checkpoint and staggered the scan
  recovers nothing on this corpus (their cadence already covers the final
  state) and costs ~4–5% extra comparisons — but for trigger-shaped
  machinery and for the neighbor variant's hint-less pixels it is the only
  p ≥ 2 detection path (unresolved +19–21pp without it). PR 4 can ship the
  scan default-on and budget it; the per-variant exhaustion-on/off rows are
  the per-stratum evidence.
- **Rejection-retry semantics.** The doubling re-arm (frozen in checkpoint)
  is what keeps weak-attraction detections alive without burning the
  shared budget; the neighbor variant's eager hint path shows that
  proposal cadence without re-arm discipline loses detection coverage on
  weak grids. Keep the frozen re-arm semantics for any new candidate
  source.
- **Transplant viability (workstream G).** Strong yes on raster-coherent
  content: 0.004× comparisons with 100% hit rates on coherent grids, and
  the pipeline _improves_ detection on weakly attracting grids. The guard
  is the load-bearing safety element: it refused 100% of attempts on the
  coarse anchor-2 grid (1.2e-2 pixel spacing) with zero wrong results, and
  refusals concentrate exactly where first-order prediction is
  unreliable. Ship shape: transplant as a seed source feeding the SAME
  verifier path, with the guard and the ≤3-Newton bound as frozen policy.
- **Trap viability (workstream L).** The oracle gate passed on this corpus
  (zero false attracting, zero wrong periods, corpus + grids) and the
  savings are large where it fires (0.047× iterations on the weak grid).
  But it is a numerical argument, not a certified enclosure, and it never
  fires outside the |λ| ≥ 0.8 weak-attraction regime; research-only
  standing (plan §12/L) is unchanged. PR 4 should NOT fold the trap into
  the schedule; it remains a separately gated experiment.
- **DE period guessing.** Cost parity with checkpoint and no detection
  loss, but no measured win on this corpus; its demonstrated value is the
  exterior-bound short-circuit and the opportunistic bucket (which cost
  ~3% and found nothing here — the corpus has no period above the caps).
  PR 4 does not need it for the schedule; PR 5's period-policy split is
  where the opportunistic ceiling decision lives.
- **Packed output.** 20% of status+period frame bytes with zero round-trip
  mismatches; adopt together with zero-copy tiles (plan §5), not inside
  PR 4.

## PR 4 status: production checkpoint schedule behind the legacy differential flag

The production classifier now has the checkpoint schedule this harness
benchmarked: `src/domain/checkpoint.ts` (revision `src-checkpoint-1.0.0`,
PR 4) ports the frozen `poc-checkpoint-1.0.1` semantics exactly —
power-of-two interval doubling capped at the systematic maxPeriod, doubling
rejection re-arm against the SAME retained state, the oracle-matched
rejected-candidate budget (64), the interval-exhaustion update evaluated
independently of the proposal branch (over-ceiling near-returns roll), and
the default-on, verifier-gated exhaustion scan. It is reachable through the
versioned `OrbitOptions.classifierMode` option (`'legacy-scan'` default |
`'checkpoint'` | `'differential'`); the legacy scan remains the reported
answer everywhere until Stage A browser evidence says otherwise (plan §9).

- Parity pin: `poc/performance/src/checkpoint-parity.test.ts` classifies the
  whole corpus with BOTH this kernel and the production port and requires
  identical status/iterations/period/angle plus identical deterministic
  comparison and verifier-call counters under every profile and exhaustion
  setting. The one documented rounding difference is the |lambda| magnitude
  definition (the PoC verifier uses sqrt(re^2+im^2); src keeps the legacy
  Math.hypot form).
- Differential discipline: `'differential'` mode runs both kernels per
  pixel, reports the legacy answer, and counts status/period/|lambda|-bit
  disagreements into a preallocated record (`src/domain/checkpoint.ts`,
  `DifferentialStats`); `poc/performance/src/pr4-bench.ts` reports the
  per-raster counts alongside the directional gate numbers.
- Directional evidence: `poc/performance/results/pr4/` (pr4-bench; Node/V8,
  labeled directional). The release-comparable workstream C percentages
  remain Stage A browser runs (plan §9).
- This harness's checkpoint kernel is unchanged and remains the frozen
  reference implementation the production port is pinned against.

## Known limits

- The dd oracle shares no code with the kernels but cannot adjudicate
  near-parabolic attraction that needs more than its 4096-iteration budget
  (the weak-attraction corpus strata are period-1/2 and analytic; the
  grid's weak-p6b stratum stays unresolved for oracle and kernels alike).
- Wall-time numbers are Node/V8 directional medians; the deterministic
  lag-comparison counters are the release-comparable metric.
- The corpus is ~225 points across 10 strata (hundreds, not thousands, per
  plan §9 holdout discipline at PoC scale); the grid layer adds 2,560
  oracle-adjudicated raster points.
- Raster-neighbor evidence is simulated with left-neighbor-only hints on
  16×16 grids; the production dispatcher has two-dimensional neighborhood
  context (top neighbors, seed pooling) that can only improve hint
  quality, but the PoC numbers do not measure that.
- The transplant/trap attempt guard constants (1e-2 displacement,
  0.8 minLambda, disk factor 4) are frozen PoC policy with documented
  provenance, not certified bounds.

## Roadmap: specified but not yet implemented variants

These are plan §5/§11 Step 0 candidates not implemented in this harness yet,
with the code points where they plug in:

- **Distance-estimated preview** — a cheap preview classifier consuming
  `multiplierMagnitude`/`kappa` fields of `KernelResult` to render
  smooth interior color early; a separate preview kernel beside
  `kernels/control.ts`.
- **Conjugate-mirror parity** (plan workstream M) — dispatch-level row
  dedup: classify the canonical half of a viewport and mirror results with
  `arg lambda` negated; the runner would gain a mirror variant that
  classifies half the corpus, reconstructs the other half by exact
  conjugation, and diffs against the direct classification (status, period,
  |lambda|, kappa, escape iteration must be identical).
