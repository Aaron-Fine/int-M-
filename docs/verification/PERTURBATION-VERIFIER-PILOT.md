# Certified V0 verifier on perturbation enclosures (Phase 3 work packet 3)

**Scope:** research only. This is work packet 3 of the
[Phase 3 proof program](PHASE-3-PROOF-PROGRAM.md#work-packets-and-exit-criteria):
connect the perturbation backend's candidate frames to the V0/V1 decision, and
refuse whenever a margin cannot be certified. It builds on the
[packet 1 backend pilot](PERTURBATION-BACKEND-PILOT.md). The product-need gate
stays open. No renderer imports this code, and `src/domain/verifier.ts` is
used only for its frozen constants.

## The exact decision

For a pixel bounded through `N` iterations, the cycle start is the true orbit
point `ζ = z_m`, with `m = N − maxPeriod`. The **exact frames** for a proposed
period `p` are those of the true target orbit, which the production verifier
would compute if it could iterate the exact parameter:

- residual `ρ_j = |z_{m+j} − z_m|` for `j = p` and every proper divisor `j`;
- multiplier `λ_j = ∏_{i<j} 2 z_{m+i}`, as accumulated by `verifyCycleInto`.

The **exact policy** uses the decoded binary64 constants of `verifier.ts`:
`TAU_CLOSURE_SCALED`, `tauExclude`, and `1 − attractMargin` (one binary64
subtraction, as the verifier evaluates it). These are multiplied exactly by
`s = max(1, |Re ζ|, |Im ζ|)`. Compared with the production code, the products
`τ²·s²` are exact here instead of rounded. That is the same choice the
period-two pilot made for its decoded cutoffs.

The decision is V0 `reference` (`VerifierModel.lean`), applied in that file's
order:

1. `ρ_p > exclude` gives **no closure**; otherwise `ρ_p > accept` gives
   **closure ambiguous**.
2. Proper divisors are taken in ascending order. The first `d` with
   `ρ_d < exclude` decides: `ρ_d ≤ accept` reduces the period to `d`;
   otherwise the result is **divisor ambiguous**.
3. `|λ| < attractUpper` at the resolved period gives **accepted**; otherwise
   **not attracting**.

`verifyCycleInto` makes the same comparisons in the same order; V1 proves its
inline reduction equal to V0's.

## Certification

[`perturbation-verifier.ts`](../../poc/performance/src/numerics/perturbation-verifier.ts)
evaluates that control flow on the packet 1 disks
`|z_k − (R_k + d_k)| ≤ s_k + b_k`. Each comparison V0 reaches is resolved
only when it holds for **every** point the disks admit, and every threshold
the scale enclosure admits:

- **Residuals.** `|Δa| + E ≤ θ_lo` (or `<`) certifies "below", and
  `|Δa| − E > θ_hi` (or `≥`) certifies "not below". Here `Δa` is the exact
  difference of disk centres, `E` the sum of their radii, and `θ` the threshold
  times the scale bounds.
- **Multiplier.** The centre product `Λ = ∏ 2a_i` is exact. The error bound
  `|λ − Λ| ≤ ∏(A_i + 2ε_i) − ∏ A_i` is evaluated exactly, with `A_i ≥ |2a_i|`;
  this difference increases in each `A_i`, so upper bounds stay sound.

All comparisons are exact squared comparisons on dyadic BigInts. No
`Math.hypot` or square root enters the certificate. Any unresolved comparison
returns **uncertified** (`U`), never a guess.

Per call, therefore: if the checker executes as written, every predicate V0
evaluates on the exact frames has the certified value, so the returned verdict
is V0's verdict on the exact frames. V0's `Frame.multiplierMagnitude` is
rational while `|λ|` generally is not. Any rational witness on the same side
of `attractUpper` gives the same `finish` branch, and one exists whenever the
comparison is certified. Residual squares of the exact orbit are already
rational, because the target parameter is dyadic.

Lean checks the step from certified predicates to the verdict
([VerifierModel.lean](../../proof/IntMProof/VerifierModel.lean)). Each
comparison V0 can make is a `Comparison`, and `reached t frames p` lists the
ones `reference` reaches, in order. `reference_verdict_eq_of_reached`: two
runs, with possibly different thresholds, frames, payloads and old records,
give the same verdict if every comparison the first run reaches has the same
truth value in both. `reference_accepted_period_eq_of_reached` adds that both
accepted records carry the same resolved period.
`answerVerdict_eq_reference_of_reached` is the checker's form: V0's control
flow run on any answers that equal the exact values on the reached
comparisons (`answerVerdict`) returns V0's verdict on the exact frames.
Answers to comparisons that are not reached do not matter. That the
TypeScript checker evaluates `answerVerdict`'s control flow, and that each
certified answer is the exact value, remains trusted and tested, not formally
verified.

**Candidate source.** The backend proposes the smallest `p ≤ maxPeriod`
whose binary64 closure `|a_{m+p} − a_m|²` falls below `(tauCandidate·s)²`,
using the production proposal threshold. As in production, a proposal never
accepts; V0 decides.

## Independent oracle

[`tools/perturbation_oracle.py`](../../tools/perturbation_oracle.py) iterates
each exact target parameter directly in rectangular interval arithmetic, as in
packet 1. It then evaluates the same V0 flow on interval frames: interval
residual squares, interval scale, and outward-rounded interval multiplier
products. It records the certified code for **every** proposed period
`1..maxPeriod` of every bounded pixel in
[`fixtures/perturbation-interior.v1.json`](../../fixtures/perturbation-interior.v1.json).
It shares no code with the TypeScript backend. Its own unittests cover the
superattracting two-cycle, reduction of multiples, and the C/D/X codes.

| Tile                             | Reference (minibrot nucleus)                                         | Step    | `N`  | maxPeriod | TypeScript result                                                         |
| -------------------------------- | -------------------------------------------------------------------- | ------- | ---- | --------- | ------------------------------------------------------------------------- |
| `minibrot-p25-step-2^-24`        | −0.10133043579283234 + 0.9564326741946593i                           | `2^-24` | 1024 | 64        | 3 attracting (period 25), 249 escaped                                     |
| `minibrot-p34-step-2^-33`        | −0.10111537313879465 + 0.9562964985177921i                           | `2^-33` | 1024 | 72        | 22 attracting (period 34), 198 escaped; the rest unresolved, with reasons |
| `minibrot-p61-step-2^-40`        | 0.0016437219710060931 + 0.8224676332982375i                          | `2^-40` | 1536 | 64        | 16 attracting (period 61), 232 escaped, 8 certified not attracting        |
| `minibrot-p349-step-2^-58` (8×8) | exact 128-bit dyadic near −0.7756837700816289 + 0.13646736983175894i | `2^-58` | 4096 | 360       | 13 attracting (period 349), 31 escaped, 17 certified not attracting       |

The nuclei were found by atom-domain period detection and Newton's method in
600-bit fixed point; the size estimates (`2^-23`, `2^-30.5`, `2^-38`,
`2^-56`) set each tile's step. The first three tiles' parameters are still
exact binary64 values: their references have bits down to `2^-53`, and the
offsets are multiples of the step. Only the period-349 tile is below binary64
resolution: every row's eight parameters round to one binary64 value.

**Finding: the reference needs more than binary64 below its resolution.**
Rounding the period-349 nucleus to binary64 moves it by up to about `2^-54`,
which is more than the minibrot's own size. With a binary64 reference, every
pixel became `reference-exhausted`, because the reference orbit leaves the
precision bound. The backend therefore now also accepts an exact dyadic
reference (`ExactPoint`: integers times `2^exponent`). The pixel offsets, the
delta kernel and the audit are unchanged; only the reference generator reads
the extra bits.

## Results

[`perturbation-verifier.test.ts`](../../poc/performance/src/numerics/perturbation-verifier.test.ts),
11 tests, Node 22.22.0 on 2026-10-29:

- **Oracle agreement.** For every bounded pixel and every proposed period
  `1..maxPeriod` on all four tiles, the TypeScript code equals the oracle's.
  Neither side left a reached comparison uncertified.
- **Coverage of V0's branches.** On the oracle tiles: no closure, closure
  ambiguous, divisor ambiguous (`p = 68`), reduction of a proposed multiple
  (`p = 50 → 25`, `p = 68 → 34`), not attracting, and acceptance. Acceptance
  at period 68 also appears, apparently a period-doubled satellite bulb of the
  period-34 minibrot. A synthetic test also drives the uncertified branch,
  with a closure disk that straddles the acceptance threshold.
- **Below binary64 resolution.** On the period-349 tile, 13 pixels whose
  binary64 parameters coincide row by row are certified attracting with
  period 349, matching the oracle on all 360 proposed periods.
- **Production differential.** On the step-`2^-24` tile, inside the supported
  zoom bound, the production `classifyOrbit` (`maxIterations 1024`,
  `maxPeriod 32`) agrees with every certified pixel: escape iteration, or
  attracting period.
- **Refusals.** Out-of-domain tiles and periods are refused.

The p34, p61 and p349 tiles take about 1.6 s, 2.0 s and 10 s in Node,
dominated by the exact checker. No performance claim is made.

## Browser runs

`tests/e2e/perturbation-pilots.spec.ts` (Playwright projects `pilot-chromium`
and `pilot-firefox`) runs `classifyPerturbationInteriorTile` in the page on
the 16x16 tiles `minibrot-p25-step-2^-24` and `minibrot-p34-step-2^-33`, and
compares with `fixtures/perturbation-interior.v1.json` using the check it shares with the Node test
(`perturbation-oracle-check.ts`): every escaped pixel has the oracle's
iteration, every frame code that both sides certify is identical, and no frame
is uncertified. The comparison is exact (string codes), with no tolerance.
Result: both tiles agree in Chromium and Firefox, with nothing differing from
Node. Each engine takes about 3 to 4 s. The p61 and p349 tiles, the synthetic
cycle cases and the production-classifier comparison were not repeated in the
browser.

## Production beyond the zoom bound (directional)

The supported bound is a minimum span of `2.5 / 6,000,000`, about `2^-31` per
pixel at 1,000 px height. The p34 and p61 tiles are 4× and 512× deeper, so
there production is outside its contract. Running `classifyOrbit` on their
exact binary64 parameters anyway (scratch probe, not committed evidence)
shows two different failure modes against the oracle:

- **Escape iterations shift** by 1 to 19 iterations on about a dozen pixels:
  binary64 rounding accumulates along long orbits.
- **False interior.** With `maxPeriod` 72 or 64, 3 pixels per tile are
  accepted as attracting (period 34 or 61, `|λ|` from 0.51 to 0.999) although
  the oracle shows they escape, at iterations 534 to 1279. The lag scan
  proposes an early cycle start (iteration 72 to 184) where the orbit passes
  within the absolute tolerance `1e-8` of the minibrot's cycle. This is the
  **policy**, not rounding: V0 on the exact frames at that start accepts as
  well.

Inside the bound (32×32 tiles at step `2^-31` around the same p34 and p61
minibrots, and `2^-26` around p25), the same probe found no false interior.
It found 5 shifted escape iterations among 1,024 pixels on the p61 tile.

**Consequence for Phase 3.** This pilot certifies V0's verdict on the exact
frames; it does not certify that an attracting cycle exists. V0 is a tolerance
policy whose `1e-8` closure bound is absolute, not relative to the zoom. A
deeper zoom therefore needs a semantic change before any bound increase, not
only perturbation arithmetic. That means certified acceptance through the
trap theorems (`CA` in the [DAG](LEAN-PROOF-DAG.md)). The pilot avoids early
starts by using the last window `m = N − maxPeriod` of a pixel certified
bounded through `N`, but that is a mitigation, not a proof. The owner
decision is recorded in
[ADR 0015](../decisions/0015-verifier-closure-tolerance-and-zoom-bound.md),
which considered and rejected a depth-scaled tolerance.

## What this does not establish

- No certified multiplier value, angle or κ as an output. Only the comparison
  `|λ| < attractUpper` is certified; the reported fields remain packet 5 or
  later work.
- No glitch repair, rebasing, subdivision, cancellation or memory bound
  (packet 4). Pixels whose reference runs out, or whose escape is ambiguous,
  stay unresolved.
- No dynamical claim: an accepted verdict is V0's policy verdict on the exact
  frames, not a proof that the parameter is interior (see above).
- No browser run, no general candidate policy (one cycle start per pixel),
  and no formal TypeScript refinement.
- The product-need gate, release evidence and any zoom change are untouched.
