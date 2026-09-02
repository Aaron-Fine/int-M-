# PoC performance harness

Directional, oracle-checked evidence harness for the classifier work in
`docs/plans/int-m-performance-plan.html`. This is delivery **Step 0** (plan
§11): a self-contained harness that A/B-tests alternative detection schedules
against the legacy classifier and a double-double oracle, so that PR 1's
corpus and gate choices rest on data instead of intuition. It is a
prerequisite for PR 1 and feeds the workstream C ship gates defined in §5.
All evidence produced here is **directional (Node/V8 approximates Chrome)**;
it does not replace Stage A browser evidence.

## Layout

```
poc/performance/src/
  oracle/dd.ts           double-double arithmetic (two-product based)
  oracle/classify-dd.ts  dd oracle: proximity scan + Newton polish + certification
  verifier.ts            common verifier: scale-aware closure, three-way
                         proper-divisor policy, attraction margin
  corpus.ts              deterministic seeded corpus (9+1 strata, ~225 points)
  kernels/shared.ts      metrics contract, proposal budget, full lag scan
   kernels/control.ts     control kernel (faithful port of src/domain/orbit.ts)
   kernels/checkpoint.ts  power-of-two approximate checkpoint schedule
   kernels/trigger.ts     convergence-triggered single scan
   kernels/staggered.ts   staggered harmonic lag testing
   pr2-bench.ts           pr2 microbench: scalar kernel vs allocating pipeline
   run.ts                 differential runner (CLI)
   results/               runner output (committed); results/pr2/ microbench
```

## Running

- Differential runner (writes `src/results/`, ~1 s, no dependencies):

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

## Schedules and frozen policies

All kernels share the analytic fast paths (main cardioid, period-2 bulb),
the common verifier for acceptance, and the closed-form helpers in
`kernels/shared.ts`. Proposal threshold is the permissive `tauCandidate`
(1e-8, scale-aware); acceptance is the verifier's strict `tauAccept` policy
(1e-10 with the legacy 100x forward-closure relaxation). `tauCandidate` vs
`tauAccept` is deliberate: proposals may fire early, only verifier acceptance
classifies.

- **Control** (`kernels/control.ts`): faithful port of the legacy all-lag
  scan (`src/domain/orbit.ts`), including its lack of primitive-period
  reduction. It is the differential baseline.
- **Checkpoint** (`kernels/checkpoint.ts`, revision `poc-checkpoint-1.0.0`):
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
  systematic mode. Measured verdict vs checkpoint (detailed profile,
  `summary.json`): cost parity (0.995× with exhaustion on, 0.951× off),
  identical detections, unresolved delta 0, zero gate; the corpus contains
  no period above the systematic caps, so the opportunistic bucket adds
  cost (~1.03×) but recovers no extra detections at PoC scale — directional
  evidence for PR 5's period-policy split.

Shared rejection budget: `CANDIDATE_REJECTION_BUDGET = 64` per pixel
(`kernels/shared.ts`), matching the dd oracle's `candidateVerifyBudget`.
Every non-accepted verdict consumes budget; when it is exhausted a kernel
stops proposing (and stops paying for proposal-only comparisons), including
the exhaustion scan. The orbit walk always continues so escape
classification is unaffected.

**Exhaustion scan** (plan §4): when a schedule ends its orbit budget
unresolved, one final full lag scan from the final state can recover missed
detections. Default on for all schedules; the runner measures each schedule
with the scan on and off, and `kernels/shared.ts:fullLagScan` is the single
implementation.

## Metrics

- `lagComparisons` — primary deterministic cost metric: candidate lag
  distance evaluations. Trigger step gates and checkpoint interval
  bookkeeping are _not_ lag comparisons.
- `totalIterations` — orbit work; `iterations` per point is the detection
  iteration (budget end for unresolved/escaped).
- `verifierCalls` — candidate proposals reaching the verifier; rejections
  are counted by reason (`rejectedNonFinite`, `rejectedNoClosure`,
  `rejectedNotAttracting`) plus `verifierAmbiguous` for the unresolved
  verdicts of the three-way divisor policy.
- `kappa` — `-log|lambda| / period`; JSON `null` encodes the `+Infinity`
  superattracting identity (never do arithmetic on it).
- Statuses: `attracting`, `escaped`, `unresolved`.

## Results format (`src/results/`)

- `raw.<profile>.<variant>.json` — one record per point: id, stratum,
  kernel, exhaustion flag, status, iterations, evidence, period and
  multiplier fields when attracting, and the metric counters. No timestamps.
- `summary.json` — per-profile, per-variant, per-stratum aggregates:
  total lag comparisons (primary), total iterations, unresolved rate and
  its delta vs control, false-attracting and wrong-primitive-period counts
  (gate), unadjudicated-attracting and missed-detection counts,
  candidate-budget-exhausted counts, and the matched-budget detection-delay
  distribution: per-point `periodDelta` and `iterationDelay` versus control
  at equal iteration budgets (a distribution, not an aggregate).
- `run-manifest.json` — node version, verifier/kernel revisions and frozen
  thresholds, corpus seed and size, harness revision, dd oracle options, and
  directional wall-time medians (recording pass + one discarded warmup pass,
  then the median of 5 timed passes), explicitly labeled
  **directional — Node/V8 evidence, not release evidence**.

### Adjudication rules

- `falseAttracting` — variant claims attracting where the dd oracle proves
  escape. Must be zero for every schedule variant (non-zero exit code).
- `wrongPrimitivePeriod` — both variant and oracle find an attracting cycle
  but the primitive periods differ. Must be zero for schedule variants
  (non-zero exit code).
- Oracle-unresolved points cannot adjudicate attracting claims (the oracle
  deliberately lacks the analytic fast paths and cannot reach closure inside
  its budget near-parabolic attraction); those are counted as
  `unadjudicatedAttracting`, never as false.
- `control` is the legacy classifier under differential test: the plan kill
  gate for workstream C applies to the schedule variants. Control's
  wrong-primitive-period results are reported (manifest
  `gate.legacyBaselineWrongPrimitivePeriod`) instead of failing the run.

## Findings captured so far (Step 0 scope)

- Lag-comparison reductions at the Detailed profile: checkpoint ~0.016x
  control, trigger ~0.001x, staggered ~0.075x, at equal or better
  unresolved rates. See `summary.json` for all profiles and strata.
- The plan-literal trigger step gate `|z_n - z_{n-1}|` does not fire on
  settled period >= 2 cycles (consecutive states stay O(1) apart even after
  binary64 collapse), so the trigger detects p >= 2 cycles only via the
  exhaustion scan (45-48 corpus points per profile). This is visible in the
  exhaustion-off variants: unresolved rate jumps by ~19-21 percentage points.
- **Schedule-design finding for PR 4 (plan section 4 A/B decision):** the
  trigger's p >= 2 blindness above is a property of the §4 gate definition
  itself, not of the PoC implementation: on a settled p-cycle the step
  `|z_n - z_{n-1}|` converges to the (O(1)) distance between consecutive
  cycle points, so the gate cannot fire and every p >= 2 detection waits for
  the exhaustion scan (see the trigger detection-delay distributions in
  `summary.json`: maxLate 232/488/1000 = budget end). PR 4 must resolve this
  before freezing a schedule choice - either redefine the gate (e.g. a
  cycle-aware or relative step criterion), accept the exhaustion-scan
  dependency as the trigger's operating mode, or drop the trigger from the
  A/B. Choosing with only the aggregate unresolved-rate numbers would hide
  the effect; the per-point delay distributions are the deciding evidence.
- On this corpus the exhaustion scan recovers nothing for checkpoint or
  staggered at PoC profiles: their per-step/per-multiple cadence already
  covers the final state. The measured value of the exhaustion scan is
  schedule-dependent, exactly what the A/B is for.
- The legacy control classifier produces 2-3 wrong-primitive-period results
  per profile versus the oracle (period 8/12 reported where the primitive
  period is 4) on hard-view-anchor points: with binary64 rounding, a
  multiple-of-p lag can cross the 1e-10 threshold before p. The common
  verifier's three-way divisor policy fixes this class, which is why the
  schedule variants have zero such results.

## Known limits

- The dd oracle shares no code with the kernels but cannot adjudicate
  near-parabolic attraction that needs more than its 4096-iteration budget
  (weak-attraction strata stay unresolved for oracle and kernels alike).
- Wall-time numbers are Node/V8 directional medians; the deterministic
  lag-comparison counters are the release-comparable metric.
- The corpus is ~225 points across 10 strata (hundreds, not thousands, per
  plan §9 holdout discipline at PoC scale).

- **Neighbor-informed lag ordering** (`kernels/neighbor.ts`, revision
  `poc-neighbor-1.0.0`): consumes the previously classified left
  neighbor's detected primitive period as a hint. Frozen policy: one
  hinted lag comparison per step (tauCandidate proximity proposes
  `(z_n, h)` to the common verifier; checkpoint-style doubling re-arm on
  rejection), the frozen trigger step gate + hint-ordered full scan as the
  fallback when the hint cannot match, hint-ordered exhaustion scan.
  Measured on the deterministic 16x16 grids (`src/grids.ts`, committed
  specs): coherent interior grids detect 255/256 pixels through the hint
  alone at 0.085-0.168x checkpoint comparisons (rabbit, co-rabbit,
  period-5); mixed-content anchor grids land at 0.31-0.82x. **Honest
  caveat**: hint quality depends entirely on spatial coherence - when the
  hint chain breaks at content transitions the kernel falls back to the
  p >= 2-blind step gate, and on weakly attracting mixed grids (weak-p6a at
  balanced) the neighbor misses MORE detections than the checkpoint (144 vs
  109 unresolved): the checkpoint's per-step cadence samples the
  oscillating closure residual at many states and hits acceptance dips,
  while the hint-less pixels depend on one exhaustion-scan state. Flat
  matrix rows (`neighbor.exhaustion-*`) use the previous corpus point's
  period as a documented weak-hint control. Single-neighbor (left) evidence
  only - no top-neighbor pooling in the PoC.

- **Adjacent-pixel transplantation** (`kernels/transplant.ts`, revision
  `poc-transplant-1.0.0`): keeps the last verified-accepting cycle
  (period, cycle point, multiplier, seed parameter) as a persistent seed;
  predicts the neighbor cycle point via the plan §6 parameter derivative
  (`dz-star/dc = B_cycle/(1−λ)` with `B_cycle` from one B-recurrence walk
  of the seed cycle), guarded by the plan's multiplier-map attempt region
  `|B_cycle|·|Δc|/|1−λ| ≤ 1e-2` (`TRANSPLANT_THRESHOLDS`, frozen), seeds
  ≤3 binary64 Newton corrections against the new parameter, and lets the
  common verifier decide; refusals and rejections fall back to the
  checkpoint kernel. Measured on the grids (detailed profile): coherent
  grids chain 255/255 transplant hits at **0.004× checkpoint
  comparisons** (rabbit, co-rabbit, period-5, weak-p3, weak-p6a); mixed
  anchor grids 0.58–0.66×; the coarse anchor-2 grid (pixel spacing 1.2e-2)
  refuses **every** attempt at the guard (221/221) and degrades to exact
  fallback cost (1.000×) — graceful by construction. The transplant also
  _improves_ detection on weak-p6a at balanced (64 vs 109 unresolved):
  Newton-polished seeds reach verifier acceptance before the orbit
  converges. Guard-refusal rates by seed-|λ| bucket (detailed):
  <0.5 146/1071, 0.5–0.9 125/486, 0.9–0.99 32/321 — refusals track the
  |Δc| factor (coarse/transition grids), and the 0.99+ bucket is
  unmeasured because no grid seed reaches |λ| ≥ 0.99 (weak-p6b stays
  unresolved at every PoC budget). Flat matrix rows (seed walks the point
  list): 0.976×/0.933× checkpoint, zero unresolved delta, zero gate.

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
  convergence, never weakens acceptance. Measured (detailed profile):
  weak-p6a grid **0.047× checkpoint iterations with 255/255 trap hits and
  zero Newton failures**; weak-p6a at balanced 0.292× with 64 vs 109
  unresolved (the trap improves detection); anchor grids 0.80–0.87×;
  strongly attracting grids pay zero overhead (1.000×, gate refuses before
  any work); weak-p6b cannot seed (all pixels unresolved at every PoC
  budget) and stays 1.000×. **Oracle verdict: zero false attracting and
  zero wrong primitive periods on the whole corpus and all grids — the
  workstream L kill gate passes on this corpus.** Honest scope: the trap
  argument is numerical (linear-regime disk + verifier), not a certified
  enclosure; plan §12/L keeps it research-only.

## Roadmap: specified but not yet implemented variants

These are plan §5/§11 Step 0 candidates not implemented in this harness yet,
with the code points where they plug in:

- **Packed status+period output** — pack status and primitive period into a
  single Uint32 at the result boundary (`kernels/shared.ts:KernelResult`
  consumers, `run.ts:recordOf`); measurable only with the production
  zero-copy tile pipeline.
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
