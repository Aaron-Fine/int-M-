# Phase 2 performance mathematics

This document specifies the mathematical objects, tolerance policy, and claim
discipline behind the Phase 2 classifier work. It accompanies
[PERFORMANCE-PLAN.md](PERFORMANCE-PLAN.md) and implements the plan's §3
(correctness invariants and the common verifier), §4 (checkpoint schedules and
the period policy), §6 (Newton and representations), and §10 (claim taxonomy).
The source of truth for implemented behavior is the code cited in each section;
where this document and code disagree, the code wins and this document must be
fixed.

## 1. Core quantities

For the quadratic family and an orbit starting at the critical point:

```text
f_c(z) = z² + c,          z_{j+1} = f_c(z_j),          z_0 = 0
```

A point with an attracting cycle of (proposed) period `p` closes on itself:
`f_c^p(z) − z ≈ 0`. The cycle multiplier is the derivative of the return map,

```text
λ = (f_c^p)'(z) = ∏_{j=0..p−1} 2 z_j,
```

and carries the two per-cycle semantics the atlas renders: `|λ|` (contraction)
and `arg λ` (rotation). The per-iterate stability exponent is

```text
κ = −log|λ| / p.
```

The parameter derivative along the orbit obeys the inexpensive recurrence

```text
B_{j+1} = 2 z_j B_j + 1,     B_0 = 0,     B_j = dz_j/dc,
```

so a verified cycle at `c` predicts its own displacement under a small
parameter change:

```text
dz*/dc = B / (1 − λ).
```

The same recurrence bounds exterior and interior distance estimates and drives
the conditioning guard of §7. These formulas are mathematical statements;
they are independent of any implementation and carry no tolerance.

## 2. The common verifier

Plan invariant 2: one verifier decides. Every attracting result — regardless
of candidate source or backend — passes the same checks, implemented in
[src/domain/verifier.ts](../src/domain/verifier.ts) (`verifyCycleInto`,
revision `src-verifier-1.0.0`) and mirrored body-for-body at the lag scan's
single inlined call site in [src/domain/orbit.ts](../src/domain/orbit.ts)
(differential tests pin them together):

1. reject non-finite state, residual, or derivative values (never attracting);
2. check `f_c^p(z) − z` against the scale-aware acceptance bound of §3, with
   `scale = max(1, |Re z|, |Im z|)` of the proposed cycle start;
3. test every proper divisor `d` of `p` and reduce to the smallest closing one
   (three-way policy, §4);
4. compute `λ` on the primitive period and require `|λ| < 1 − attractMargin`;
5. return unresolved, never a confident class, when a bound falls in the
   ambiguous gap;
6. emit period, `|λ|`, `arg λ`, `κ`, evidence code, and the verifier revision.

Acceptance writes the record; every other verdict leaves it untouched and the
caller continues, falls back, or stays unresolved.

## 3. Versioned tolerance policy

The thresholds are versioned policy, not tuning knobs. Values below are
committed in `VERIFIER_THRESHOLDS` in
[src/domain/verifier.ts](../src/domain/verifier.ts); the PoC harness freezes
the same values under its own revision
([poc/performance/src/verifier.ts](../../poc/performance/src/verifier.ts)).

| Field               | Value   | Role                                                                     | Provenance                                                                                                                                   |
| ------------------- | ------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `tauAccept`         | `1e-10` | Closure residual bound (pre-scaling) for acceptance                      | The legacy candidate tolerance: `DEFAULT_ORBIT_OPTIONS.cycleTolerance = 1e-10` in src/domain/orbit.ts                                        |
| `closureRelaxation` | `100`   | Multiplier forming the scale-aware acceptance bound `tauAccept · 100`    | The legacy forward-closure allowance of 100× linear error (provenance comment in src/domain/verifier.ts)                                     |
| `tauCandidate`      | `1e-8`  | Permissive scale-aware proposal threshold; proposals only, never accepts | The PR 4 checkpoint proposal gate (plan §4); PoC policy value kept (poc/performance/src/verifier.ts)                                         |
| `tauExclude`        | `1e-6`  | Separation bound above which closure (own or a divisor's) is refused     | PoC policy choice (poc/performance/src/verifier.ts); distinct periodic points in the corpus strata separate far more than 1e-6 at unit scale |
| `attractMargin`     | `1e-12` | Attraction requirement `\|λ\| < 1 − margin`                              | PoC policy choice; tightens the legacy strict `\|λ\| < 1` so near-parabolic cycles stay unresolved                                           |

Scaling note: with the default options the scaled acceptance bound
`tauAccept · closureRelaxation = 1e-8` (then multiplied by `scale²`) equals
the legacy absolute forward-closure bound at unit scale; `TAU_CLOSURE_SCALED`
exposes the linear pre-scaling value. The ordering `tauCandidate > tauAccept`
is a policy requirement: a permissive proposal can still fail the stricter
acceptance, so adding candidate sources never weakens acceptance.

### Policy revisions

| Revision                | File                                      | Governs                                                                                      |
| ----------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------- |
| `src-verifier-1.0.0`    | src/domain/verifier.ts                    | Acceptance. Every accepted attracting result carries it                                      |
| `poc-verifier-1.0.0`    | poc/performance/src/verifier.ts           | PoC harness acceptance (frozen separately; values currently agree with src)                  |
| `src-checkpoint-1.0.0`  | src/domain/checkpoint.ts (removed)        | Production checkpoint schedule (PR 4); removed 2026-10-16 (ADR 0007)                         |
| `poc-checkpoint-1.0.1`  | poc/performance/src/kernels/checkpoint.ts | PoC reference schedule the production port is pinned against                                 |
| `period-policy-1.0.0`   | src/domain/period-policy.ts               | Systematic/opportunistic ceilings, `maxIterations`, and the `evidenceSource` vocabulary      |
| `src-analytic-p3-1.0.0` | src/domain/analytic-period-three.ts       | The period-3 closed-form acceptance: smallest-modulus root, rounding allowance, margin (§11) |
| `src-analytic-p4-1.0.0` | src/domain/analytic-period-four.ts        | The period-4 acceptance: cubic candidate, Rouché certificate, allowance, margin (§12)        |

Revisions are deliberately independent: the period policy is search-budget
vocabulary, the verifier revision is acceptance. Candidate plumbing must never
leak into acceptance semantics (workstream D kill condition). Changing a value
above is a revision bump with evidence, not an edit.

## 4. Three-way divisor policy

Closure and primitivity are decided against two scaled bounds,
`accept² = (tauAccept · closureRelaxation)² · scale²` and
`exclude² = tauExclude² · scale²`:

- residual ≤ accept bound: the candidate closes (or a divisor closes, and the
  smallest such proper divisor becomes the reported primitive period);
- residual > exclude bound: no closure — the candidate is rejected;
- between the bounds: **ambiguous** — the verifier returns
  `closure-ambiguous` (own residual) or `divisor-ambiguous` (a divisor's
  residual), and the point stays unresolved.

A multiple of a smaller cycle is therefore never emitted as primitive (plan
invariant 3), and numerical ambiguity produces unresolved/fallback rather
than a confident class (plan invariant 4). The ambiguity gap is a feature:
at tolerance boundaries the honest answer is "undecidable in binary64".

## 5. Superattracting identity rule

At superattracting centers `|λ| = 0`. The verifier then assigns `arg λ = 0`
and `κ = +∞` **by identity** (`Number.POSITIVE_INFINITY`), never by
arithmetic on infinities, and comparisons treat such points by identity — both
sides `|λ| = 0` — rather than by derived quantities (plan §3 semantic
compatibility contract). PoC artifacts encode the same rule:
`summary.json` `metricNotes` states that JSON `null` encodes `+Infinity` for
κ. This rule is versioned with the tolerance policy.

## 6. Brent-inspired approximate checkpointing (removed 2026-10-16, ADR 0007)

> History. The checkpoint kernel was removed on 2026-10-16
> ([ADR 0007](decisions/0007-remove-reference-kernels.md)); the production
> classifier is the watched-lag scan in §6a. The text below records the design
> as it was evaluated.

The plan (§4 callout) defines the boundary precisely, and it is worth restating
because the name invites overclaiming. In Brent's 1980 cycle-detection
algorithm, a sequence `x_{n+1} = f(x_n)` is searched for an **exact
repetition** using O(1) stored states: one state advances every step while a
stationary checkpoint is retained; after 1, 2, 4, 8, … advances without
equality the current state becomes the new checkpoint. Exact equality yields a
cycle-length candidate with O(μ + L) evaluations.

This project borrows only that exponentially spaced checkpoint schedule. For
the complex orbit, an attracting cycle converges asymptotically and normally
does **not** repeat exactly in binary64. So the kernel
(`src/domain/checkpoint.ts`, revision `src-checkpoint-1.0.0`, removed
2026-10-16) compares the current `z_n` with the retained
checkpoint `z_k` at the permissive `tauCandidate`; when proximity fires with
lag `q = n − k` inside the systematic ceiling, `(z_n, q)` is **proposed** to
the common verifier. A hit may be the primitive period `p`, a multiple `k·p`
(the verifier's divisor reduction returns the primitive), or an accidental
near-return. It never classifies a pixel.

This is why the method is "Brent-inspired approximate checkpointing", not
Brent cycle detection: approximate proximity destroys Brent's exact
finite-state guarantee. The frozen schedule elements are: checkpoint starts at
`z_0` with interval 1; comparisons and updates gated on the cycle warmup;
rejection re-arm doubles the gap (1, 2, 4, …) and retests the **same**
retained state instead of dropping it through a full interval; outside a
proposal, interval exhaustion rolls the checkpoint and doubles the interval
(capped at the systematic ceiling), including over-ceiling near-returns; a
shared rejected-candidate budget (`CHECKPOINT_CANDIDATE_BUDGET = 64`,
matching the dd oracle's `candidateVerifyBudget`) stops proposals per pixel;
on unresolved budget end a default-on exhaustion scan runs one full lag scan,
still verifier-gated.

Budget consequence (plan §4): near weak attraction the required work behaves
roughly as `n ≈ n_transient + p · log(τ/e_0) / log|λ|`, which grows without
bound as `|λ| → 1`. A maximum period therefore does not guarantee detection
without an adequate iteration and verification budget — which is exactly what
the unresolved state is for.

### 6a. Watched-lag triggered scan (the only classifier since ADR 0006)

The production default ([src/domain/orbit-triggered.ts](../src/domain/orbit-triggered.ts),
[ADR 0006](decisions/0006-watched-lag-default-classifier.md)) reaches the same
goal as §6 without approximate checkpoints. The reference lag scan tests every
lag `1 ≤ q ≤ min(maxPeriod, n − 1)` at every iteration `n` after warmup with
the proposal test `|z_n − z_{n−q}|² ≤ τ_scan²` and sends each hit to the
common verifier. The watched-lag kernel runs that **same full scan** only at
selected iterations: on the first scanning iteration, then after gaps of
16, 32, 64, 128, 128, … iterations, on the last budgeted iteration, and
whenever the watched lag fires. A full scan also records the argmin lag
`w = argmin_q |z_n − z_{n−q}|` (the distances are computed anyway); on every
other iteration the kernel evaluates only `|z_n − z_{n−w}|`, the reference
proposal test at the single lag `w`.

Argument (empirical equality, not a proof): each full scan is the reference
scan of its iteration (same history ring, same ascending lags, same
verifier), and the reference kernel returns at its first accepting iteration,
so the watched-lag kernel accepts at the same iteration as the reference or
later, never earlier and never with a result the reference would not give at
that iteration. A later acceptance needs a proposal at a non-watched lag on
an iteration with no scheduled scan. The watched lag is the nearest return
of the previous full scan, so once an orbit settles its period (or a
multiple) is the lag being watched; an adversarial search near deep component
centers found no divergence at the shipping profiles (135,720 runs).
Measured: zero status, period, or multiplier differences on every
frozen-corpus pixel at the shipping raster, and all 572
release-protocol stable-canvas hash pairs equal. Fires are uncapped; a cap
was found to lose acceptances and removed (ADR 0006).

## 7. Conditioning guard for Newton and transplantation

With `F_p(z, c) = f_c^p(z) − z` and `∂F_p/∂z = λ − 1`, a cycle verified at one
parameter predicts the cycle point at a nearby parameter through
`dz*/dc = B_cycle / (1 − λ)` (§1). The predictor is ill-conditioned as
`λ → 1`, especially near parabolic boundaries where `|B|` blows up. Plan §6
therefore makes conservative attempt regions mandatory, derived from the
multiplier map rather than tuned constants: a seed is eligible when its
first-order displacement estimate stays inside the versioned guard,

```text
|B_cycle| · |Δc| / |1 − λ|  ≤  guard.
```

In the PoC ([poc/performance/src/kernels/transplant.ts](../../poc/performance/src/kernels/transplant.ts))
the guard is frozen at `guardDisplacement = 0.01` with ≤3 Newton corrections
and denominator floor `1e-12` (`run-manifest.json`, `schedulePolicies.transplant`);
the PoC README records these as frozen PoC policy with documented provenance,
not certified bounds. Measured directional behavior matches the theory: the
guard refused 100% of attempts on the coarse anchor-2 grid (pixel spacing
1.2e-2) with zero wrong results, while coherent grids chained 255/255 hits at
0.004× checkpoint comparisons (`summary.json` grids). Two further rules: the
seed must retain a defined cycle phase (the multiplier is phase-invariant, the
Newton seed is not), and Newton may converge to a lower-period or repelling
root — the verifier remains separate and decides.

## 8. Claim taxonomy

Copied from plan §10 and mapped to this repository. The label column is
normative wording discipline: anything not in the first rows must not be
described as proven or certified.

| Label                             | Plan §10 examples                                                     | In this repository                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mathematical identity/theorem     | Center counts, derivative recurrences                                 | The §1 formulas; the exact-period center-count recurrence of plan §6 (relevant to the deferred F generator, ADR 0004)                                                                                                                                                                                                                                                                                                                                                                   |
| Closed form evaluated in binary64 | Main cardioid and period-2 bulb tests                                 | The analytic fast paths in src/domain/orbit.ts (previously mirrored in the checkpoint module, removed 2026-10-16, ADR 0007); verifier-gated since PR 3 (attraction margin, fall-through to the orbit walk). The period-3 closed form (§11, src/domain/analytic-period-three.ts, ADR 0010) adds a derived binary64 rounding allowance to the same margin; the period-4 cubic (§12, ADR 0013) has an untrusted candidate and accepts only through the certified enclosure of the next row |
| Symbolically exact object         | Integer center factors and low-period relations                       | Not built. Specified for the F generator (exact integer-polynomial division of center factors), deferred per ADR 0004                                                                                                                                                                                                                                                                                                                                                                   |
| Certified numerical result        | Disjoint interval/ball root enclosures                                | The period-4 Rouché disk (§12.4): a ball root enclosure whose binary64 bounds are argued on paper (§12.5) and audited in exact arithmetic on samples, not machine-checked. The double-double oracle is a higher-precision floating reference, not a certified enclosure                                                                                                                                                                                                                 |
| Floating validated result         | Closure, primitive-period reduction, `\|λ\|` margin                   | The common verifier, src/domain/verifier.ts (`src-verifier-1.0.0`) — the only orbit-path acceptance; closed forms per the row above                                                                                                                                                                                                                                                                                                                                                     |
| Heuristic candidate               | Checkpoint lag, catalog proximity, local chart predictor              | Watched-lag and full-scan proposals (src/domain/orbit-triggered.ts, the default; checkpoint proposals were removed 2026-10-16, ADR 0007); PoC de-guess/neighbor kernels; catalog proximity deferred with F (ADR 0004). All propose only; explicitly not proof status                                                                                                                                                                                                                    |
| Experimental                      | p3/p4 acceleration, Koenigs/Böttcher coordinates, rigorous block fill | Workstream J (not started; workstream H shipped period 3, §11, and period 4, §12); trap-radius early accept (poc/performance/src/kernels/trap.ts — research-only, oracle-gated on the PoC corpus)                                                                                                                                                                                                                                                                                       |
| Rejected unsafe shortcut          | Stable fill from matching corners/edges                               | Rejected per plan §6 spatial subdivision analysis; subdivision may drive only the coarse preview, and J's kill condition forbids corner/edge agreement as stable proof                                                                                                                                                                                                                                                                                                                  |

## 9. What is not claimed

- Candidate generation is not proof (plan invariant 1): checkpoints, catalogs,
  charts, algebra, and Newton only propose; the verifier decides. The closed
  forms for periods 1, 2 and 3 are the plan's bucket 1–2 exception: they
  accept directly under the same attraction margin, with a derived binary64
  allowance for period 3 (§11, ADR 0010). The period-4 path (§12, ADR 0013)
  is the same exception: its cubic candidate only proposes, and it accepts
  through a ball root enclosure whose binary64 bounds are proved on paper.
- The tolerance values of §3 are engineering policy with recorded provenance,
  not mathematical facts; "certified" is reserved for interval/ball or
  equivalent proof. It describes only the period-4 enclosure of §12, whose
  binary64 bounds are argued on paper and audited exactly on samples, not
  machine-checked.
- PoC constants (proposal budget 64, transplant guard 1e-2, trap `minLambda`
  0.8 and disk factor 4) are frozen PoC policy at directional evidence tier
  ([poc/performance/README.md](../../poc/performance/README.md), "Known
  limits"); they become product policy only through the gates of
  [PERFORMANCE-PLAN.md](PERFORMANCE-PLAN.md).

## 10. Next performance math questions

The [proof DAG](verification/LEAN-PROOF-DAG.md#prospective-performance-mathematics)
tracks three optimization contracts with remaining numerical and evidence gates:

| Direction                | Potential saving                                                  | Missing proof and evidence                                                                                                                                                       |
| ------------------------ | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| J2 certified tile reuse  | Share verifier decisions across a parameter rectangle             | Outward binary64 enclosures and TypeScript refinement; per-pixel output fields still need correct values; tile certificate and subdivision cost must beat per-pixel work.        |
| P4 parameter series      | Amortize deep-tile reference work using coefficients beyond `B_n` | Binary64/TypeScript refinement of the scalar products, retained generator, and Horner sequence; useful deep-reference horizons and glitch/rebase handling; benchmark total cost. |
| V2 verifier prefix reuse | Avoid repeated proper-divisor orbit prefixes after a candidate    | Exact decision and payload equivalence in divisor order, TypeScript operation-order parity, and a profile showing enough candidates to repay cache cost.                         |

For a fixed seed, the first new series coefficient obeys
`Cₙ₊₁ = 2ZₙCₙ + Bₙ²`, with `C₀ = 0`, when
`zₙ(c₀+δ) = Zₙ + Bₙδ + Cₙδ² + O(δ³)`. The [P4 proofs](verification/PARAMETER-JETS.md) now check this recurrence, all-order Taylor/Hasse convolution, exact finite truncation, and recursive finite-order coefficient/error budgets using only retained-product residuals. Finite outward budget tables are checked; a third-order certificate about parameter minus one with critical seed zero bounds error by `1/1000000` through iterate sixteen on the radius-1/256 offset disk. Conditional Horner operation, inclusive coefficient, and truncation budgets now compose for separate multiply/add operations. At order three the minus-one cap is preserved if each coefficient and local operation error is at most `2⁻⁴⁰`; offset mismatch needs its own P3 allowance. Scalar primitive contracts and finite retained generation error propagation now connect to an executable unbounded-integer dyadic reference with proved generation/Horner decoding correspondence, multiplication error at most `4·2⁻ᵖ`, and exact grid addition. Real integer anchors and seeds give exact retained generation; the concrete 42-bit fractional-grid minus-one generator/evaluator has total error at most `1/1000000` through iterate sixteen on the decoded radius-1/256 disk. Binary64/TypeScript refinement and measured integration remain open; no production series accelerator is implemented. The
[Phase 3 program](verification/PHASE-3-PROOF-PROGRAM.md#optional-performance-math-packets)
sets the numerical and measurement gates.

The period-one, period-two, period-three (§11) and period-four (§12) analytic tests are the
current closed-form hot paths. M0/M1, N0, and F0 offer exact chart identities, but an
alternate coordinate system earns a runtime path only after its domain,
conversion errors, canonical output fields, and net browser cost are established.

## 11. Period-3 closed form (workstream H, ADR 0010)

Code: [src/domain/analytic-period-three.ts](../src/domain/analytic-period-three.ts)
(`classifyPeriodThreeInto`, revision `src-analytic-p3-1.0.0`). Exact
identities: [proof/IntMProof/PeriodThreeMultiplier.lean](../proof/IntMProof/PeriodThreeMultiplier.lean).
The spike that motivated it: [WORKSTREAM-H-SPIKE-2026-10-16.md](verification/WORKSTREAM-H-SPIKE-2026-10-16.md).
Labels as in §8: **[Lean]** checked in Lean, **[derived]** algebra checked
with sympy, **[literature]** standard and not re-derived.

### 11.1 The multipliers

The period-3 dynatomic factor is

```text
Φ₃(z, c) = (f³(z) − z) / (f(z) − z)
         = z⁶ + z⁵ + (3c+1)z⁴ + (2c+1)z³ + (3c²+3c+1)z² + (c+1)²z + G₃(c),
G₃(c)   = c³ + 2c² + c + 1.
```

At a root z of Φ₃ the three-step multiplier is λ = (f³)′(z) = 8·z·f(z)·f²(z),
and it is a root of

```text
M₃(λ, c) = λ² − 8(c+2)λ + 64·G₃(c)          [Lean: period3_multiplier_root]
```

The discriminant is 64(c+2)² − 256·G₃(c) = −64c²(4c+7), so with s² = 4c+7

```text
λ± = 4(c+2) ± 4i·c·s                         [Lean: period3_closedForm_roots]
```

Conversely, Res_z(Φ₃, λ − (f³)′) = M₃(λ, c)³ **[derived]**
([multpoly.py](../poc/performance/h-p3p4/multpoly.py)): each root of M₃ is the
multiplier of three roots of Φ₃, counted with multiplicity, that is of one
3-cycle. Landmarks: at the airplane cusp c = −7/4, M₃ = (λ − 1)²
**[Lean: period3_cusp]**; at a root of G₃, λ = 0 is a root
**[Lean: period3_multiplier_zero_of_center]**.

### 11.2 Exact period and uniqueness

Let λ\* be the root of smaller modulus and suppose |λ\*| < 1. By the resultant
identity of 11.1 **[derived]** some root z of Φ₃ has (f³)′(z) = λ\*. Such a z is
not a fixed point **[Lean: period3_not_fixed_of_attracting]**: at a fixed
root of Φ₃ the three-step multiplier is exactly 1
**[Lean: periodThreeDynatomic_fixedPoint_multiplier]**. So f³(z) = z
**[Lean: orbit_three_sub_self]** and f(z) ≠ z: the cycle through z has exact
period 3, and it is attracting. A
quadratic polynomial has at most one attracting cycle, and that cycle attracts
the critical orbit **[literature: Fatou]**, so this is the cycle the orbit path
would find, and the larger root belongs to the other, repelling 3-cycle **[literature:
Fatou–Shishikura: at most one non-repelling cycle]**. As for
the period-2 bulb, no divisor reduction is needed: the only proper divisor,
period 1, is excluded because its three-step multiplier would be exactly 1.

The period-6 satellites of the rabbit show why the margin, not a region test,
decides: at c = −0.1155037 + 0.8402561i, inside the rabbit's gate box,
both roots have |λ| > 1 (the smaller is 1.0246), the closed form refuses, and
the orbit path finds the attracting period-6 cycle (|λ₆| = 0.9015).

### 11.3 Algorithm

1. w = 4c + 7.
2. s = √w, principal branch, stable form: for Re w ≥ 0,
   Re s = √((|w| + Re w)/2) and Im s = Im w / (2 Re s) (Im s = 0 when Re s = 0);
   otherwise |Im s| = √((|w| − Re w)/2) with the sign of Im w, and
   Re s = |Im w| / (2|Im s|). |w| = √((Re w)² + (Im w)²).
3. t = 4i·c·s, a = 4(c + 2), λ± = a ± t.
4. Keep the root with the smaller squared modulus; m̂ = √(that squared modulus).
5. Accept iff m̂ + A < 1 − attractMargin, with A = 2⁻⁴⁶·(|Re c + 2| + |Im c| + 1).

The record is period 3, λ, |λ|, arg λ (0 when |λ| = 0, §5), iterations 0 and
evidence `analytic-period-3-component`.

### 11.4 Floating-point error budget

Model: IEEE binary64 with round to nearest, unit roundoff u = 2⁻⁵³. ECMAScript
evaluates each operation exactly rounded and does not contract to FMA.
`Math.sqrt` is correctly rounded; `Math.hypot` and `Math.atan2` are
implementation-approximated, so the accept decision uses neither (`atan2`
only formats arg λ after acceptance). First-order bounds; the slack in A
absorbs every O(u²) term.

1. **Inputs, and Sterbenz near the cusp.** Re â = 4·fl(Re c + 2) and
   Im â = 4·Im c (multiplying by 4 is exact), so |â − a| ≤ u|a|. In the
   airplane box Re c ∈ [−1.770, −1.747] ⊂ [−4, −1], so Re c + 2 is exact by
   Sterbenz and â = a. Re ŵ = fl(4 Re c + 7) and Im ŵ = 4 Im c, so
   |ŵ − w| ≤ u|w|; in the airplane box 4 Re c ∈ [−14, −3.5], so 4 Re c + 7 is
   exact as well. Near the cusp, where w → 0 and λ → 1, the inputs therefore
   carry no rounding at all.
2. **The complex square root.** |ŵ| has relative error ≤ 2u (two squares and a
   sum: 2u in the radicand, halved by the square root, plus its own rounding).
   The half-sum (|ŵ| + |Re ŵ|)/2 adds two non-negative numbers, so it has no
   cancellation: ≤ 3u; its square root ≤ 2.5u; the other component costs one
   division: ≤ 3.5u. So |ŝ − √ŵ| ≤ 3.5u|s|. Because Im ŵ = Im w exactly, √ŵ and
   √w lie on the same side of the branch cut, and
   |√ŵ − √w| = |ŵ − w| / |√ŵ + √w| ≤ (u/2)|s|. In total |ŝ − s| ≤ 4u|s|. Either
   sign of s gives the same pair {a + t, a − t}, so the branch cut cannot
   change which roots are compared.
3. **t = 4i·c·ŝ.** A product of two complex numbers in binary64 without FMA
   has normwise relative error ≤ √5·u **[literature: Brent, Percival and
   Zimmermann 2007]**; the factors 4 and i are exact. So
   |t̂ − t| ≤ (4 + √5)u|t| ≈ 6.24u|t|.
4. **λ̂ = â ± t̂**, one rounding per component: |λ̂ − λ| ≤ u|a| + 6.24u|t| + u|λ|.
5. **The modulus.** m̂ = |λ̂|(1 + η) with |η| ≤ 2u.

Together: |λ| ≤ m̂ + E with E ≤ u|a| + 6.24u|t| + 3u, using |λ| ≤ 1 at
acceptance. (The use of |λ| ≤ 1 is not circular: acceptance requires m̂ < 1,
so |λ̂| < 1 + 2u, and the extra O(u) in |λ| only enters terms of order u².) At acceptance |t| = |a − λ| ≤ |a| + 1, so E ≤ 9.24u + 7.24u|a|,
and |a| = 4|c + 2| ≤ 4L with L = |Re c + 2| + |Im c|. Hence
E ≤ 9.24u + 28.96u·L. The code's allowance A = 128u·(L + 1) is at least four
times this for every L ≥ 0, which also covers the second-order terms, the
rounding of L itself, and the rounding of the final sum and comparison
(≤ 2u). Therefore:

> **Acceptance implies |λ| < 1 − 10⁻¹² for the exact closed-form root at the
> binary64 parameter c.**

Sizes: in the rabbit box L ≤ 2.816 and A ≤ 5.4·10⁻¹⁴; in the airplane box
L ≤ 0.26 and A ≤ 1.8·10⁻¹⁴. The worst measured |λ̂ − λ_dd| over the 19,216
analytic pixels of the golden raster is 3.0·10⁻¹⁵ (ADR 0010).

**Root selection.** The squared-modulus comparison can pick the wrong root
only when the two moduli agree to within about 2E. Both roots cannot be
accepted (11.2: at most one attracting cycle) unless they coincide, which
happens only at c = 0 (λ = 8) and c = −7/4 (λ = 1), both refused. So a wrong
pick can only occur when nothing is accepted; it never changes an answer.

**No catastrophic cancellation.** λ = a ± t subtracts two numbers of size up
to about 8.6 to produce |λ| < 1, a loss of up to three decimal digits of
relative accuracy. It does no harm: a and t carry only O(u) relative error
(steps 1–3 have no earlier cancellation to amplify), the decision is absolute
(|λ| against 1 − 10⁻¹²), and the absolute error stays below 5·10⁻¹⁴, about
twenty times inside the margin. Relative accuracy of λ is lost only near the
centres, where |λ| ≪ 1 and arg λ carries no information; at exact 0 the
identity rule of §5 applies.

**The spike's allowance.** The prototype used 32·ε·(|a| + |t|) with
ε = 2⁻⁵² = 2u, that is 64u(|a| + |t|), on top of the margin. It is justified:
it exceeds the first-order bound u|a| + 6.24u|t| + 3u by about eight times
wherever |a| + |t| ≥ 1, which holds in every gate box. It did not name the
modulus rounding term (its slack covers it), and it needs two extra square
roots for |a| and |t|. The production allowance is the bound derived above,
in terms of c alone, and is about 2.4 times smaller in the rabbit box
(5.4·10⁻¹⁴ against 1.3·10⁻¹³).

**Non-finite and extreme input.** NaN propagates and every comparison with
NaN is false, so the test refuses. Overflow (|c| ≳ 10¹⁵⁴) gives an infinite or
NaN modulus and refuses. (Re ŵ)² + (Im ŵ)² underflows only when Re c = −7/4
exactly and |Im c| < about 4·10⁻¹⁵⁵; there both roots are 1 ± O(10⁻⁷⁷) and the
margin refuses whatever ŝ is.

**The margin.** attractMargin = 10⁻¹² is the verifier's policy (§3):
near-parabolic cycles stay unresolved. The allowance is added on top of it,
so the closed form never accepts a point the policy would refuse in exact
arithmetic. Points with 1 − 10⁻¹² − A ≤ |λ| < 1 − 10⁻¹² are refused and fall to
the orbit path, which cannot detect them within any budget (§6): they end
unresolved, as the policy intends.

### 11.5 Placement and gate

Both kernels, [orbit-triggered.ts](../src/domain/orbit-triggered.ts) and the
two-lane [triggered-rows.ts](../src/render/triggered-rows.ts), try the closed
form once per pixel at the first scanning iteration, `max(cycleWarmup, 2)` =
24, before that iteration's full scan. A pixel that escapes earlier, inside
the gate or not, never reaches it (c = −0.2 + 0.66i escapes at iteration 24
and stays escaped: the escape test comes first). The record depends on c
alone, so it is bit-identical to a test before the loop, in both kernels and
in both passes. With `maxIterations` below the first scanning iteration the
test never runs and the pixel stays unresolved, as the orbit path would leave
it; no production budget is that small.

The gate ([period-three-gate.ts](../src/domain/period-three-gate.ts)) holds
the padded bounding boxes of the three components, traced from the inverse
map in the spike. It must contain every accepted parameter, which a unit test
checks on a 1200 × 1200 grid (11,602 accepted points, all inside) and just
outside every box edge: it is measured, not proved.

Neither kernel tests the gate itself. Both call `classifyGatedAnalyticInto`
([analytic-period-three.ts](../src/domain/analytic-period-three.ts)) for every
pixel that reaches the first scanning iteration. It reads the period-3 and
period-4 gates (§12.8) as windows on Re c for the row's Im c
([analytic-gate-windows.ts](../src/domain/analytic-gate-windows.ts), exact
because the boxes' |Im c| bands are disjoint and lie inside the hull),
recomputed when Im c changes, and runs at most one solve. Its answer and
record equal testing the gates first and calling the solve
([gated-analytic.test.ts](../tests/unit/domain/gated-analytic.test.ts), box
edges ± 1 ulp, signed zeros, NaN, infinities and grids). Where the gate is
evaluated changes no bit but changes speed, through the engines' compilers
only: an inlined gate call in the row kernel cost about 10% on the
far-exterior stable pass in Node (2026-10-17, bimodal), and from 2026-10-17 to
2026-10-20 the row kernel's per-row windows and gated call blocks, first run
only when a gate row or gate pixel arrived, cost cold tile workers repeated
recompiles of the kernel in both browsers
([ADR 0010](decisions/0010-analytic-period-three.md), amendment of
2026-10-20). Rerun `tools/benchmark/fallback-overhead.ts` (stable and coarse
pass) and `tools/benchmark/cold-workers.ts` (both engines) after any change
to either kernel or to `classifyGatedAnalyticInto`, or an engine upgrade.

### 11.6 What is proved and what is not

- **Lean (S1 in the [proof DAG](verification/LEAN-PROOF-DAG.md)):** the Φ₃
  factorization, the multiplier quadratic, its closed-form roots, the cusp and
  centre landmarks, and the fixed-point case with three-step multiplier 1.
- **Not in Lean:** the resultant identity (each root of M₃ is realized by a
  cycle; sympy-checked), Fatou uniqueness (literature), the binary64 budget of
  11.4 (a written argument, checked numerically by the dd adjudicator in
  `tests/unit/domain/dd-oracle.ts` and the golden-raster test), and the gate
  containment of 11.5 (measured on a dense grid). Formalizing the resultant
  direction is a follow-up; the binary64 budget would need the refinement work
  the Phase 3 program describes.

## 12. Period-4 cubic with a certified root (workstream H, ADR 0013)

Code: [src/domain/analytic-period-four.ts](../src/domain/analytic-period-four.ts) (`classifyPeriodFourInto`, revision `src-analytic-p4-1.0.0`). Exact identities: [proof/IntMProof/PeriodFourMultiplier.lean](../proof/IntMProof/PeriodFourMultiplier.lean). Exact audit: [tests/unit/domain/period-four-certificate.test.ts](../tests/unit/domain/period-four-certificate.test.ts). The spike that motivated it: [WORKSTREAM-H-SPIKE-2026-10-16.md](verification/WORKSTREAM-H-SPIKE-2026-10-16.md). Labels as in §11: **[Lean]** checked in Lean, **[derived]** algebra checked with sympy, **[literature]** standard and not re-derived, and **[paper]** for the floating-point argument of 12.5, which is written out here and audited in exact arithmetic on samples (12.7) but not machine-checked.

The owner's bar (2026-10-16 and 2026-10-17) is a rigorous bound: whenever the code accepts, the exact parameter's cubic has a root with |λ| < 1 − attractMargin, and the cycle has exact period 4. 12.4 and 12.5 prove the enclosure for every finite binary64 c; 12.2 derives the exact period, using the sympy-checked resultant identity; 12.6 says where the proof refuses.

### 12.1 The cubic

The period-4 dynatomic factor and the Gleason centre polynomial are

```text
f⁴(z) − z = (f²(z) − z) · Φ₄(z, c)                              [Lean: orbit_four_sub_self]
Φ₄(z, c)  = z¹² + 6c z¹⁰ + z⁹ + (15c² + 3c) z⁸ + 4c z⁷ + (20c³ + 12c² + 1) z⁶
          + (6c² + 2c) z⁵ + (15c⁴ + 18c³ + 3c² + 4c) z⁴ + (4c³ + 4c² + 1) z³
          + (6c⁵ + 12c⁴ + 6c³ + 5c² + c) z² + (c⁴ + 2c³ + c² + 2c) z + G₄(c),
G₄(c)     = c⁶ + 3c⁵ + 3c⁴ + 3c³ + 2c² + 1.
```

At a root z of Φ₄ put μ = z·f(z)·f²(z)·f³(z), the cycle product. The four-step multiplier is λ = (f⁴)′(z) = 16μ **[Lean: period4_seedDerivative]**, and μ is a root of the monic cubic

```text
M(μ, c) = μ³ + a₂μ² + a₁μ + a₀                                   [Lean: period4_product_root]
a₂ = c² − 3
a₁ = −(c⁴ + c³ − c² − 3)  = 3 − c²(c² + c − 1)
a₀ = −G₄(c)               = −(c²(c²(c² + 3c + 3) + 3c + 2) + 1)
```

This is the cubic the spike solved by Cardano (its `tryP4`, in μ = λ/16). Conversely Res_z(Φ₄, λ − 16μ(z)) = (4096·M(λ/16, c))⁴ **[derived]**: over the twelve roots of Φ₄ the values 16μ(z) are the roots of the cubic in λ, each four times, so every root of M is the product of exactly one 4-cycle.

**Where the roots collide.** The discriminant of M in μ is −c⁶(c + 2)²((4c + 3)³ + 108) **[derived]**. It vanishes at c = 0 (M = (μ − 1)³, λ = 16), at c = −2 (M = (μ − 1)(μ + 1)², λ = ±16) and at the three primitive cusps, the roots of (4c + 3)³ = −108:

```text
c ≈ −1.9405507889761495,   c ≈ −0.1547246055119252 ± 1.031047227748952 i,
```

where the attracting root meets a repelling one at λ = 1. The satellite roots are not among them: at c = −5/4 (the 1/2 satellite of the period-2 bulb) and c = 1/4 ± i/2 (the 1/4 and 3/4 satellites of the cardioid) λ = 1 is a simple root (M′(1/16) = 125/32 at −5/4 **[derived]**; the root **[Lean: period4_product_root_satellite]**). So a root with |λ| < 1 is always simple, and it is badly conditioned only near the three cusps, where the two colliding roots separate like √|c − c_cusp|. At the six centres, the roots of G₄, μ = 0 is a root **[Lean: period4_product_zero_of_center]**.

### 12.2 Exact period and uniqueness

Let μ\* be a root of M with |16μ\*| < 1. By the resultant identity of 12.1 **[derived]** some root z of Φ₄ has (f⁴)′(z) = 16μ\*, and f⁴(z) = z **[Lean: orbit_four_sub_self]**. A root of Φ₄ that returns in two steps has four-step multiplier exactly 1 **[Lean: periodFourDynatomic_period_two_multiplier]**: a fixed point that is a root of Φ₄ has (2z)² = −1 **[Lean: periodFourDynatomic_fixedPoint]**, so (2z)⁴ = 1; a point of the 2-cycle that is a root of Φ₄ forces 4c + 5 = 0 **[Lean: periodFourDynatomic_twoCycle]**, and its four-step multiplier is (4(c + 1))² = 1. So z returns neither in two steps nor in one **[Lean: period4_not_period_two_of_attracting, period4_not_fixed_of_attracting]**: its cycle has exact period 4 **[Lean: period4_minimalPeriod_of_attracting]**, and it is attracting. A quadratic polynomial has at most one attracting cycle, and that cycle attracts the critical orbit **[literature: Fatou]**, so this is the cycle the orbit path would find, the other two roots of M have |λ| > 1 **[literature: Fatou–Shishikura]**, and the period-3 and period-4 paths can never both accept. As for periods 2 and 3, no divisor reduction is needed.

The margin, not the box, decides. Inside the period-4 boxes lie period-8 satellites, for example c = −1.369 and c = 0.32484 + 0.56386i, where every root of M has |λ| > 1; the path refuses and the orbit path finds period 8.

### 12.3 Algorithm

1. r = √((Re c)² + (Im c)²). Refuse unless r ≤ 4; this also refuses NaN and ±∞. All six components lie in |c| < 2.2.
2. The coefficients a₂, a₁, a₀ in binary64, in the factored forms of 12.1, in the code's evaluation order.
3. **Candidate.** Cardano on the depressed cubic y³ + py + q (μ = y − a₂/3): one complex cube root from `Math.cbrt`, `Math.atan2`, `Math.cos` and `Math.sin`, the other two by the rotations ω and ω²; two Newton steps on each root; keep the root of smallest |μ|². **Nothing below assumes anything about the candidate's accuracy**, and the functions it uses need not be correctly rounded.
4. **Certificate** at the candidate μ̃, with +, −, ×, ÷ and √ only:
   - the residual M̂ = ((μ̃ + a₂)μ̃ + a₁)μ̃ + a₀ and the slope M̂′ = (3μ̃ + 2a₂)μ̃ + a₁, by Horner;
   - ρ = |μ̃|, b₂ = r² + 3, b₁ = r²(r² + r + 1) + 3, b₀ = r²(r²(r² + 3r + 3) + 3r + 2) + 1, M̄ = ((ρ + b₂)ρ + b₁)ρ + b₀ and M̄′ = (3ρ + 2b₂)ρ + b₁;
   - F = |M̂| + E·M̄, D = |M̂′|·(1 − 2⁻⁴⁰) − 2E·M̄′, K = 3ρ + b₂, h = F/D, with E = 2⁻⁴⁷;
   - certified iff D > 0 and h·(8K + 16h) < D.
5. Accept iff certified and 16ρ + (64h + 2⁻⁵⁰) < 1 − attractMargin.

The record is period 4, λ = 16μ̃, |λ| = 16ρ, arg λ (0 when |λ| = 0, §5), iterations 0 and evidence `analytic-period-4-component`.

### 12.4 The enclosure

**Lemma (Rouché for a cubic).** Let M be a monic cubic, μ̃ ∈ ℂ, F ≥ |M(μ̃)|, 0 < D ≤ |M′(μ̃)| and K ≥ |M″(μ̃)|/2. If r > 0 and F + Kr² + r³ < Dr, then M has exactly one root in the open disk |μ − μ̃| < r.

_Proof._ Taylor's formula at μ̃ is exact for a monic cubic: M(μ̃ + w) = M(μ̃) + M′(μ̃)w + ½M″(μ̃)w² + w³. On |w| = r, |M(μ̃ + w) − M′(μ̃)w| ≤ F + Kr² + r³ < Dr ≤ |M′(μ̃)w|. By Rouché's theorem **[literature]** M(μ̃ + w) and M′(μ̃)w have the same number of zeros in |w| < r, namely one. ∎

This is the a-posteriori Newton–Kantorovich test specialised to a cubic, whose second-order remainder is exact, so no Lipschitz constant has to be estimated.

**From the computed test to the lemma.** Let F̂, D̂, K̂, ĥ be the computed values, and suppose (12.5) that F̂ ≥ |M(μ̃)|, 0 < D̂ ≤ |M′(μ̃)| and K̂(1 + 8u) ≥ |M″(μ̃)|/2 for the exact cubic at the binary64 c. Take r = 2ĥ(1 + 2⁻⁴⁰), a real number that is never computed. Since ĥ ≥ (F̂/D̂)(1 − u), F̂ ≤ D̂ĥ/(1 − u) < D̂r/2, so the lemma applies as soon as K̂(1 + 8u)r² + r³ < D̂r/2, that is

```text
4K̂(1 + 8u)ĥ(1 + 2⁻⁴⁰) + 8ĥ²(1 + 2⁻⁴⁰)² < D̂.
```

The computed test fl(ĥ·fl(8K̂ + 16ĥ)) < D̂ (8K̂ and 16ĥ are exact) gives ĥ(8K̂ + 16ĥ) < D̂/(1 − u)², and the left side above is at most ½(1 + 2⁻⁴⁰)²(1 + 8u)·ĥ(8K̂ + 16ĥ) < D̂. So **a certified candidate has exactly one exact root μ\* with |μ\* − μ̃| < 2ĥ(1 + 2⁻⁴⁰).**

**From the root to acceptance.** ρ̂ = fl(√(fl(Re μ̃²) + fl(Im μ̃²))) ≥ |μ̃|(1 − u)², and 16ρ̂ is exact, so |λ\*| = 16|μ\*| ≤ 16ρ̂(1 + 2.01u) + 32ĥ(1 + 2⁻⁴⁰). The allowance Â = fl(64ĥ + 2⁻⁵⁰) ≥ (64ĥ + 2⁻⁵⁰)(1 − u) exceeds 32ĥ(1 + 2⁻⁴⁰) by at least 2⁻⁵⁰(1 − u) ≥ 7.9u. If fl(16ρ̂ + Â) < T, where T is the binary64 value of 1 − attractMargin, then 16ρ̂ + Â < T/(1 − u) < T + 1.01u and 16ρ̂ < 1, so

```text
|λ*| ≤ 16ρ̂ + 2.01u + 32ĥ(1 + 2⁻⁴⁰) ≤ 16ρ̂ + Â − 5.8u < T.
```

T = fl(1 − attractMargin) ≤ 1 − 10⁻¹² with 4.88u to spare, so |λ\*| < 1 − 10⁻¹².

> **Acceptance implies |λ\*| < 1 − 10⁻¹² for a root of the exact cubic at the binary64 parameter c, hence (12.2) an attracting cycle of exact period 4. The reported λ̃ = 16μ̃ lies within 32ĥ(1 + 2⁻⁴⁰) of λ\*, about Â/2.**

### 12.5 Floating-point error budget [paper]

Model: IEEE binary64, round to nearest, unit roundoff u = 2⁻⁵³. ECMAScript evaluates each operation exactly rounded, left to right, and does not contract to FMA; `Math.sqrt` is correctly rounded. Multiplication by a power of two and negation are exact. Write κ = √2·γ₂ = 2√2·u/(1 − 2u) ≈ 2.83u.

1. **Elementary operations [literature: Higham, Accuracy and Stability of Numerical Algorithms, 2nd ed., Lemma 3.5].** For complex x and y, fl(x ± y) = (x ± y)(1 + δ) with |δ| ≤ u, and the conventional product, real part fl(fl(ac) − fl(bd)) and imaginary part fl(fl(ad) + fl(bc)), satisfies fl(xy) = xy(1 + δ) with |δ| ≤ κ. A real constant times a complex number (3c, 3μ̃) is two real products: |δ| ≤ u. Squaring c is a conventional product.
2. **Monomial expansion.** Expand a computed expression as the sum of the monomials of its expression tree, without combining like terms. Each rounded operation multiplies every monomial of its result by its own factor (1 + δ), so the computed value is Σₘ m·∏ₖ(1 + δₖ) and |computed − exact| ≤ ((1 + κ)^N − 1)·Σₘ|m| ≤ γ′_N·Σₘ|m|, γ′_N = Nκ/(1 − Nκ), where N is the largest number of rounded operations on one monomial.
3. **Counting.** In the code's order, N = 11 for the residual. The c⁶ monomial of a₀ meets the three squarings c² (3), the two additions in g = c² + 3c + 3 (2), the product c²·g (1), the two additions in h = c²g + 3c + 2 (2), the product c²·h (1), the addition of 1 (1) and the final Horner addition (1); the c⁵ monomial (3c in place of the innermost c²) also meets 11. The other monomials meet at most 9, and μ̃³ meets 5. For the slope N = 7: the c⁴ monomial of a₁ meets c² twice (2), the two additions in c² + c − 1 (2), the product (1), 3 − · (1) and the final Horner addition (1). So γ′₁₁ ≤ 31.2u and γ′₇ ≤ 19.8u. (A monomial tracker run during planning confirmed the counts for the code as written.) Each coefficient appears in the tree with its absolute value and no monomial is duplicated, so Σₘ|m| is exactly M̄(|c|, |μ̃|) for the residual and M̄′(|c|, |μ̃|) for the slope, the polynomials of 12.3 with |c| and |μ̃| in place of r and ρ.
4. **The bounds themselves.** r̂ ≥ |c|(1 − u)² and ρ̂ ≥ |μ̃|(1 − u)². The quantities b̂₂, b̂₁, b̂₀, M̄̂ and M̄̂′ are sums and products of non-negative numbers, so each rounding can only lower a monomial by a factor (1 − u): every monomial meets at most 11 roundings and at most six factors r̂ or three factors ρ̂, so M̄̂ ≥ M̄(|c|, |μ̃|)(1 − u)²³ ≥ M̄(|c|, |μ̃|)(1 − 35u), and likewise M̄̂′. E·M̄̂ and 2E·M̄̂′ are exact.
5. **F is an upper bound.** |M(μ̃)| ≤ |M̂| + γ′₁₁M̄ by step 2, where M̂ is the computed complex residual. Its computed modulus satisfies |M̂| ≤ fl|M̂|(1 + 2.01u), and fl|M̂| ≤ (1 + u)²|M̂| ≤ (1 + 2.01u)(1 + γ′₁₁)M̄. The sum F̂ = fl(fl|M̂| + E·M̄̂) ≥ (fl|M̂| + E·M̄̂)(1 − u). Hence F̂ ≥ |M(μ̃)| as soon as E·M̄̂(1 − u) ≥ (γ′₁₁ + 3.02u)M̄, and 64u(1 − 35u)(1 − u) ≥ 34.3u does it, with a factor 1.86 to spare.
6. **D is a lower bound.** |M′(μ̃)| ≥ |M̂′| − γ′₇M̄′, and |M̂′| ≥ fl|M̂′|(1 − 2u). The code computes a = fl(fl|M̂′|·(1 − 2⁻⁴⁰)) ≤ |M̂′|(1 − 2⁻⁴⁰)(1 + u)/(1 − 2u) and b = 2E·M̄̂′ ≥ 128u(1 − 35u)M̄′ ≥ γ′₇M̄′, then D̂ = fl(a − b). If a ≤ b, D̂ ≤ 0 and the test refuses. Otherwise D̂ ≤ (a − b)(1 + u) ≤ a(1 + u) − b ≤ |M̂′| − γ′₇M̄′ ≤ |M′(μ̃)|, because (1 − 2⁻⁴⁰)(1 + u)²/(1 − 2u) < 1. The deflation by 2⁻⁴⁰ is what lets the rounded subtraction err only downwards.
7. **K is an upper bound up to 8u.** |M″(μ̃)|/2 = |3μ̃ + a₂| ≤ 3|μ̃| + |c|² + 3 ≤ (3ρ̂ + r̂² + 3)(1 + 4.1u), and K̂ = fl(fl(3ρ̂) + fl(fl(r̂·r̂) + 3)) ≥ (3ρ̂ + r̂² + 3)(1 − u)³, so |M″(μ̃)|/2 ≤ K̂(1 + 8u). The factor 2 in 8K + 16h absorbs it (12.4).
8. **Overflow and underflow.** Step 1 of 12.3 refuses |c| > 4, so whenever the code accepts (16ρ̂ < 1) every intermediate is below about 10⁴ and nothing overflows; a candidate that overflows makes ρ̂, F̂ or D̂ infinite or NaN, and every test in the code is written so that ∞ and NaN refuse. Gradual underflow, which needs a component below 2⁻⁹⁶⁹, adds at most 2⁻¹⁰⁷⁴ absolutely per operation; that is far below E·M̄ ≥ 64u (M̄ ≥ b₀ ≥ 1), 2E·M̄′ ≥ 384u and the 7.9u tail of the allowance that absorb it.

The constants: E = 2⁻⁴⁷ = 64u, about twice γ′₁₁ + 3u; the deflation 1 − 2⁻⁴⁰; the tail 2⁻⁵⁰ = 8u; and the factors 2 in h(8K + 16h) and in 2E·M̄′. Each is a power of two, so no constant is itself rounded.

**Sizes.** On the golden raster (160×100) the allowance runs from 4.5·10⁻¹³ (the cardioid satellites) to 5.6·10⁻⁹ (next to the real primitive cusp in the 609× view); over the 6,000,000× view it is 3.6·10⁻¹². The worst |λ̃ − λ_dd| there was 3.5·10⁻¹², at most 4.5·10⁻³ of the allowance.

**The spike's allowance.** The prototype accepted when 16|μ̃| + 64(|M̂| + 128u·M̄)/|M̂′| < 1 − 10⁻¹². That is a first-order estimate: it divides by the computed |M̂′| without bounding its error and has no second-order term, so near a double root it can understate the error, and it is not a proof. It refused nothing on the corpus. 12.4 adds the second-order and cubic terms exactly and 12.5 bounds every rounding, at a similar allowance away from the cusps.

### 12.6 Where the certificate refuses

- **Near the three primitive cusps.** D ~ |c − c_cusp|^½ while F stays near E·M̄ (about 1.5·10⁻¹² at the real cusp; D = 7.5·10⁻³, 7.5·10⁻⁵ and 7.5·10⁻⁶ at distances 10⁻⁶, 10⁻¹⁰ and 10⁻¹²), so h grows like |c − c_cusp|^−½ and the Rouché test fails within about 10⁻¹² of a cusp. Measured: at −1.9405507889761495 − 10⁻¹² the cycle has 1 − |λ| = 6.3·10⁻⁵ and the test fails; at − 10⁻¹⁰ it passes with an allowance of 1.3·10⁻⁶. Those pixels fall through to the orbit path, which needs about 4·23/(1 − |λ|) ≈ 1.5·10⁶ iterations there and leaves them unresolved, as today. At the product's 6,000,000× ceiling a pixel is about 6.5·10⁻¹⁰ wide, more than the refused disk.
- **Near |λ| = 1.** Points with 1 − attractMargin − A ≤ |λ| < 1 − attractMargin are refused, as in §11.4; no iteration budget detects them either.
- **Nowhere else.** Over 132,152 sampled parameters in and around the six components, no attracting point outside these two zones was refused.

The answer is never wrong; it is only less often fast.

### 12.7 Verification

- **Exact audit** ([period-four-certificate.test.ts](../tests/unit/domain/period-four-certificate.test.ts)). For 19,664 parameters (a grid over every box and its conjugate, rings around the cusps, the satellite roots and the centres down to radius 10⁻¹⁶, and both sides of the acceptance edge on every box midline), every binary64 number is converted to an exact dyadic rational. For each parameter the code certifies, the test recomputes the exact cubic at the binary64 c and its exact value at the binary64 candidate in BigInt arithmetic, and checks F̂ ≥ |M|, D̂ ≤ |M′|, K̂ ≥ |M″|/2, the Rouché inequality for r = 2ĥ(1 + 2⁻⁴⁰) and, at acceptance, 16|μ̃| + 16r < T, with no rounding at all; for the others it checks that the code refuses. It checks the conclusions of 12.5 point by point, not the argument.
- **High-precision sweep** (planning, 2026-10-17: Python mpmath at 50 digits on a bit-exact binary64 mirror of the code; the mirror's decisions matched the TypeScript on 3,000 random box points). 132,152 parameters: grids over the boxes, rings around the cusps, satellite roots and centres down to 10⁻¹⁶, inverse-map points at |λ| = 1 − 10⁻ᵏ for k = 1…14, the 6,000,000× view, and random points over |c| < 4. No acceptance with |λ\*| ≥ 1 − 10⁻¹²; worst |λ̃ − λ\*| = 4.2·10⁻³ of the allowance.
- **Independent oracle** ([period-four-golden-oracle.test.ts](../tests/unit/render/period-four-golden-oracle.test.ts)). Every analytic period-4 pixel of the golden raster is certified period 4 by the dd period-4 cycle, which uses no cubic, with |λ̃ − λ_dd| ≤ A + 10⁻¹².

### 12.8 Placement and gate

Both kernels, [orbit-triggered.ts](../src/domain/orbit-triggered.ts) and the two-lane [triggered-rows.ts](../src/render/triggered-rows.ts), try the solve once per pixel at the first scanning iteration, `max(cycleWarmup, 2)` = 24, before that iteration's full scan, through the same call as the period-3 closed form (§11.5). The period-3 and period-4 boxes are disjoint, so the call runs at most one solve. A pixel that escapes earlier never reaches it (c = 0.239189 + 0.567903i, inside the cardioid satellites' box, escapes at iteration 24 and stays escaped: the escape test comes first). The record depends on c alone, so it is bit-identical in both kernels and both passes. With `maxIterations` below the first scanning iteration the solve never runs and the pixel stays unresolved, as the orbit path would leave it.

The gate ([period-four-gate.ts](../src/domain/period-four-gate.ts)) holds four boxes: the cardioid's 1/4 and 3/4 satellites and the complex primitive pair, each folded by conjugation, the 1/2 satellite of the period-2 bulb, and the real primitive component. It must contain every accepted parameter. A unit test checks a 1200 × 1200 grid (4,782 accepted points, all inside), finer grids around every box and points just outside every box edge: measured, not proved, although every accepted parameter does lie in one of the six components (12.2). Both kernels reach it through `classifyGatedAnalyticInto` (§11.5), which tries the solve when c is outside the period-3 window of its row and inside one of the two period-4 windows: the off-axis bands are disjoint from each other and from the axis band, and on rows with |Im c| ≤ 6.7·10⁻⁴ both real-axis boxes apply. Measured in Node for the earlier placement, in the row kernel (directional, 2026-10-17, [evidence](../evidence/phase-2/2026-10-17-cf414cc-period-four-overhead/summary.md)): the overhead on `mi-easy-exterior-heavy` and `mi-fallback-ambiguous-boundary` was 0.06% and -0.43% in the stable pass and -0.44% and -0.40% in the coarse pass, every 95% interval within ±1% (limit 5%). That form cost cold tile workers in both browsers; the current form and its measurements are in [ADR 0010](decisions/0010-analytic-period-three.md), amendment of 2026-10-20.

Cost: about 190 ns per attempt in Node (the period-3 closed form: about 50 ns), against 1.6–1.7 µs per period-4 pixel on the orbit path in the spike, and unbounded for the near-parabolic pixels the orbit path leaves unresolved.

### 12.9 What is proved and what is not

- **Lean (S2 in the [proof DAG](verification/LEAN-PROOF-DAG.md)):** the Φ₄ factorization, the cycle-product cubic at every Φ₄ root, the four-step derivative 16μ, the centre and satellite landmarks, and the two-step return case with four-step multiplier 1, hence exact minimal period 4 for an attracting Φ₄ root (period4_minimalPeriod_of_attracting).
- **On paper:** Rouché's theorem as used (literature), the binary64 budget of 12.5, audited exactly on 19,664 parameters in every test run.
- **Computer algebra (sympy), not machine-checked:** the resultant identity of 12.1, which carries the step from the Rouché root to a Φ₄ root with that multiplier.
- **Not proved:** Fatou uniqueness (literature), and the gate containment of 12.8 (measured on dense grids).
