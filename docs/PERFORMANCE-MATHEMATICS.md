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

| Label                             | Plan §10 examples                                                     | In this repository                                                                                                                                                                                                                                                   |
| --------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mathematical identity/theorem     | Center counts, derivative recurrences                                 | The §1 formulas; the exact-period center-count recurrence of plan §6 (relevant to the deferred F generator, ADR 0004)                                                                                                                                                |
| Closed form evaluated in binary64 | Main cardioid and period-2 bulb tests                                 | The analytic fast paths in src/domain/orbit.ts (previously mirrored in the checkpoint module, removed 2026-10-16, ADR 0007); verifier-gated since PR 3 (attraction margin, fall-through to the orbit walk)                                                           |
| Symbolically exact object         | Integer center factors and low-period relations                       | Not built. Specified for the F generator (exact integer-polynomial division of center factors), deferred per ADR 0004                                                                                                                                                |
| Certified numerical result        | Disjoint interval/ball root enclosures                                | None in the implementation. The double-double oracle is a higher-precision floating reference, not a certified enclosure                                                                                                                                             |
| Floating validated result         | Closure, primitive-period reduction, `\|λ\|` margin                   | The common verifier, src/domain/verifier.ts (`src-verifier-1.0.0`) — the only path that emits attracting status                                                                                                                                                      |
| Heuristic candidate               | Checkpoint lag, catalog proximity, local chart predictor              | Watched-lag and full-scan proposals (src/domain/orbit-triggered.ts, the default; checkpoint proposals were removed 2026-10-16, ADR 0007); PoC de-guess/neighbor kernels; catalog proximity deferred with F (ADR 0004). All propose only; explicitly not proof status |
| Experimental                      | p3/p4 acceleration, Koenigs/Böttcher coordinates, rigorous block fill | Workstream H (not started); workstream J (not started); trap-radius early accept (poc/performance/src/kernels/trap.ts — research-only, oracle-gated on the PoC corpus)                                                                                               |
| Rejected unsafe shortcut          | Stable fill from matching corners/edges                               | Rejected per plan §6 spatial subdivision analysis; subdivision may drive only the coarse preview, and J's kill condition forbids corner/edge agreement as stable proof                                                                                               |

## 9. What is not claimed

- Candidate generation is not proof (plan invariant 1): checkpoints, catalogs,
  charts, algebra, and Newton only propose; the verifier decides.
- The tolerance values of §3 are engineering policy with recorded provenance,
  not mathematical facts; "certified" is reserved for interval/ball or
  equivalent proof and does not describe any current acceptance path.
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

The existing period-one and period-two analytic tests are the current
closed-form hot paths. M0/M1, N0, and F0 offer exact chart identities, but an
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
would find, and the larger root belongs to the other, repelling 3-cycle. As for
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
acceptance. At acceptance |t| = |a − λ| ≤ |a| + 1, so E ≤ 9.24u + 7.24u|a|,
and |a| = 4|c + 2| ≤ 4L with L = |Re c + 2| + |Im c|. Hence
E ≤ 9.24u + 28.96u·L. The code's allowance A = 128u·(L + 1) is at least four
times this for every L ≥ 0, which also covers the second-order terms, the
rounding of L itself, and the rounding of the final sum and comparison
(≤ 2u). Therefore:

> **Acceptance implies |λ| < 1 − 10⁻¹² for the exact closed-form root at the
> binary64 parameter c.**

Sizes: in the rabbit box L ≤ 2.81 and A ≤ 4.9·10⁻¹⁴; in the airplane box
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
in terms of c alone, and is about 2.3 times smaller in the rabbit box
(4.9·10⁻¹⁴ against 1.1·10⁻¹³).

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
