# Phase 3 numerical proof program

**State:** Prepared; the existing product gate remains unmet. Phase 3 starts
after a demonstrated product gap and the perturbation reconsideration
gate in [ADR 0002](../decisions/0002-phase-0-renderer-zoom-and-gpu-gate.md).
The [product plan](../PLAN.md#phase-3--measured-numerical-extension) calls for
the smallest justified high-precision CPU or WebAssembly component, bounded
zoom, explicit unresolved results, and a value/cost comparison. The D0, X0,
S0, R0, N0, F0, and M1 mathematics in the [Lean DAG](LEAN-PROOF-DAG.md) are
independent research extensions, not launch requirements.

## Decision record before implementation

| Gate                    | Required record                                                                                                                                            | Current state                                                                                  |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Product need            | A reproducible user task that fails within the `6,000,000×` CPU bound, target view and hardware, and value of deeper navigation                            | Open; Phase 0 ceiling remains in force                                                         |
| Release baseline        | Stable branded Chrome and Firefox on target hardware, frozen corpus, at least 21 paired repetitions and BCa intervals, including cache/replay/cancel paths | Open; the committed nine-pair screening run is directional ([Stage A](../PERFORMANCE-PLAN.md)) |
| Semantic specification  | Candidate period, primitive-period reduction, multiplier, escape, nonfinite and unresolved behavior, with a single acceptance authority                    | V0/V1 exact-rational model checked; TypeScript refinement open                                 |
| Numerical specification | Operation order and outward error bounds for reference orbit, delta orbit, offset, rebase, derivative, and verifier comparisons                            | P3 propagation checked conditional on local bounds; backend bounds open                        |
| Resource contract       | Tile subdivision, glitch repair, bounded memory, cancellation/quiescence, and CPU fallback                                                                 | Design and measurement open                                                                    |
| Release decision        | Oracle/differential agreement and paired latency/accuracy results against the CPU baseline, followed by reviewed zoom-bound change                         | Open                                                                                           |

## Work packets and exit criteria

1. **Choose one arithmetic backend and a finite domain.** Record its exact
   operation order, representable input domain, overflow and underflow rules,
   and an independent higher-precision oracle. Start with a small finite
   prefix and one tile; do not generalize from a sampled deep pixel. The
   existing [perturbation fixture generator](../../tools/generate_perturbation_fixture.py)
   is an experimental input, not a certificate.
2. **Discharge P3's local-error inputs.** Produce outward bounds for every
   reference, delta, parameter-offset, derivative, and rebase operation.
   Check the arithmetic used to evaluate the bounds as well. Instantiate
   `reconstruction_error_le_budget` and `rebase_error_norm_le` over the
   chosen finite domain. A nonfinite or unbounded estimate must become
   unresolved or trigger an authoritative CPU repair.
3. **Connect candidate frames to V0/V1.** Prove that the backend's finite
   orbit prefix, selected period, proper-divisor frames, and multiplier
   comparisons refine the exact-rational decision when certified margins
   separate them from all thresholds. Include `Math.hypot`/square-root
   behavior and the actual TypeScript evaluation order. Preserve refusal
   when a margin cannot be certified.
4. **Integrate the error-aware gate.** Wire glitch detection, repair,
   subdivision, and rebasing to a single verifier. Prove that an unresolved
   raw path cannot emit an attracting classification. Test cancellation and
   memory bounds for split tiles and high-precision repair.
5. **Run the decision evidence.** Compare with the independent oracle on
   stratified boundaries, weak attraction, exterior escape, and deep tiles.
   Run the release-comparable browser protocol and record both accuracy and
   latency. Only then review a larger supported zoom bound and the cost of
   maintaining the backend.

The existing [error-budget notes](LEAN-ERROR-BUDGETS.md) give the exact P3
premises and the next constructive arithmetic tasks. The [DAG](LEAN-PROOF-DAG.md)
tracks theorem status. Each work packet should link a Lean declaration, the
consumer code, the oracle fixture, and the measured evidence before its gate
is marked complete.

### First executable proof slice

Use the existing period-two tile near `c = -1` as the pilot. Specify the
binary64 evaluation order of the critical two-step orbit and period-two
verifier frames in [`verifier.ts`](../../src/domain/verifier.ts) and the
[`orbit.ts`](../../src/domain/orbit.ts) inline path, including the one-step
proper-divisor frame. Enclose each operation and
comparison for finite representable parameters in the tile, then connect
those enclosures to `periodTwoRationalTile_residual_margins` and the V0/V1
decision. The exit artifact is a checked theorem or executable certificate
that either proves the same period-two verdict for a stated representable
subregion or explicitly refuses parameters whose rounded margin is not
certified. This pilot does not alter the supported zoom bound.

## Optional performance math packets

The [prospective DAG nodes](LEAN-PROOF-DAG.md#prospective-performance-mathematics)
can be investigated before or during Phase 3, but they do not replace the
product-need gate, P3's machine-error budget, V0/V1 refinement, or the release
comparison. Prioritize them with a profile of the actual renderer, including
candidate frequency, tile sizes, and time spent in verification and rebasing.

1. **J2: certify shared tile decisions.** Extend J0/J1 from exact rational
   intervals to outward machine enclosures for a finite tile. Prove the
   candidate, every proper divisor, and the multiplier lie strictly within
   their respective decision margins for all pixels; otherwise subdivide or
   use the per-pixel verifier. Record certificate cost and split frequency.
   A shared status and period do not determine each pixel's multiplier,
   rotation angle, or κ; preserve those fields through individual evaluation
   or separately certified approximations.
2. **P4: reuse higher-order parameter series.** For
   `z_n(c₀+δ) = Z_n + B_n δ + C_n δ² + …`, prove
   `C₀ = 0` and `Cₙ₊₁ = 2Zₙ Cₙ + Bₙ²` for a fixed seed, then bound the
   finite-order remainder on a stated disk. Combine coefficient, evaluation,
   rebase, and verifier error bounds with P3; a glitch or exhausted bound
   must trigger repair or unresolved. Benchmark total reference setup,
   coefficient storage, rebasing, and pixel time against the lower-order path.
3. **V2: reuse verifier orbit prefixes.** Specify a frame cache that preserves
   ascending divisor order, the current operation sequence, nonfinite
   handling, and every output field. Prove its V0/V1 verdict equivalence and
   check TypeScript behavior in both verifier paths. Measure only after
   profiling how often candidates reach the verifier; caching may cost more
   than repeated walks on easy pixels.

The alternate coordinates already proved in M0/M1, N0, and F0 can be evaluated
for specific hot loops. A proposal needs its parameter domain, inverse
conversion, certified error budget, canonical output-field recovery, and
browser cost comparison. Period-one and period-two analytic fast paths already
cover the obvious low-period closed forms. New algebraic cases must identify
a measured cost center before adding another dispatch path.

## Independent research packets

These may proceed without opening the product Phase 3 gate. Each needs an
explicit parameter domain and a statement that distinguishes a local chart
from a global Mandelbrot-set claim.

| Track              | Next checkable theorem                                                                  | Boundary to preserve                                              |
| ------------------ | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| D0 interior field  | A lower distance bound to the **unit-multiplier curve** on a specified chart region     | Identification with the Mandelbrot boundary is separate           |
| X0 exterior view   | A branch and validity domain for an external angle, plus certified critical-orbit entry | The escape-rate limit alone supplies no angle                     |
| S0 cycle loci      | Low-period cycle equations and discriminant/root enclosures                             | A center equation alone is not a component boundary               |
| R0 real order      | Additional finite real windows with exact period and multiplier inequalities            | A general forcing theorem is separate                             |
| N0 renormalization | A proper polynomial-like restriction of the explicit two-step quartic                   | An invariant disk alone does not give straightening               |
| F0 parabolic       | A complex petal and Abel coordinate with `Φ ∘ f = Φ + 1`                                | The checked real reciprocal orbit is only a one-dimensional chart |
| M1 symmetry        | A named chart with parameter and multiplier transport                                   | Chart transport does not classify unrelated parameters            |

Record canonical `c`, domain, orientation, branch, and numerical validity
metadata for any overlay, as required by the [research rules](../RESEARCH.md).
