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

| Revision               | File                                      | Governs                                                                                 |
| ---------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------- |
| `src-verifier-1.0.0`   | src/domain/verifier.ts                    | Acceptance. Every accepted attracting result carries it                                 |
| `poc-verifier-1.0.0`   | poc/performance/src/verifier.ts           | PoC harness acceptance (frozen separately; values currently agree with src)             |
| `src-checkpoint-1.0.0` | src/domain/checkpoint.ts                  | Production checkpoint schedule (PR 4)                                                   |
| `poc-checkpoint-1.0.1` | poc/performance/src/kernels/checkpoint.ts | PoC reference schedule the production port is pinned against                            |
| `period-policy-1.0.0`  | src/domain/period-policy.ts               | Systematic/opportunistic ceilings, `maxIterations`, and the `evidenceSource` vocabulary |

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

## 6. Brent-inspired approximate checkpointing

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
([src/domain/checkpoint.ts](../src/domain/checkpoint.ts), revision
`src-checkpoint-1.0.0`) compares the current `z_n` with the retained
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

| Label                             | Plan §10 examples                                                     | In this repository                                                                                                                                                      |
| --------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mathematical identity/theorem     | Center counts, derivative recurrences                                 | The §1 formulas; the exact-period center-count recurrence of plan §6 (relevant to the deferred F generator, ADR 0004)                                                   |
| Closed form evaluated in binary64 | Main cardioid and period-2 bulb tests                                 | The analytic fast paths in src/domain/orbit.ts (mirrored in src/domain/checkpoint.ts); verifier-gated since PR 3 (attraction margin, fall-through to the orbit walk)    |
| Symbolically exact object         | Integer center factors and low-period relations                       | Not built. Specified for the F generator (exact integer-polynomial division of center factors), deferred per ADR 0004                                                   |
| Certified numerical result        | Disjoint interval/ball root enclosures                                | None in the implementation. The double-double oracle is a higher-precision floating reference, not a certified enclosure                                                |
| Floating validated result         | Closure, primitive-period reduction, `\|λ\|` margin                   | The common verifier, src/domain/verifier.ts (`src-verifier-1.0.0`) — the only path that emits attracting status                                                         |
| Heuristic candidate               | Checkpoint lag, catalog proximity, local chart predictor              | Checkpoint proposals (src/domain/checkpoint.ts; propose only); PoC de-guess/neighbor kernels; catalog proximity deferred with F (ADR 0004). Explicitly not proof status |
| Experimental                      | p3/p4 acceleration, Koenigs/Böttcher coordinates, rigorous block fill | Workstream H (not started); workstream J (not started); trap-radius early accept (poc/performance/src/kernels/trap.ts — research-only, oracle-gated on the PoC corpus)  |
| Rejected unsafe shortcut          | Stable fill from matching corners/edges                               | Rejected per plan §6 spatial subdivision analysis; subdivision may drive only the coarse preview, and J's kill condition forbids corner/edge agreement as stable proof  |

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
