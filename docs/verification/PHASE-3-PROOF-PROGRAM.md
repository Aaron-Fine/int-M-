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

### Checked rational-grid precursor

The [outward-grid continuation](LEAN-OUTWARD-GRID.md) provides a specified
arbitrary-size rational backend: endpoints round down/up on a positive grid,
finite orbit/multiplier boxes remain sound, and a period-two tile checker
certifies exact-model acceptance or explicitly refuses an inconclusive box.
Computed residual boxes also discharge stored-reference local allowances,
and the rational error recurrence casts to the real budget. This precursor
does not discharge the binary64/TypeScript slice below or authorize a product
Phase 3 launch.

### First executable proof slice

The [bounded P4 numerical-kernel pilot](NUMERICAL-KERNEL-PILOT.md) now provides
a separate research-only consumer of the existing minus-one jet certificate:
three binary64 Horner steps with per-call exact BigInt disk/residual checks.
Its frozen coefficient packet is Lean checked; JavaScript decoder/checker
correspondence remains trusted/tested. It makes no verifier, classification,
performance, or Phase 3 release claim and does not close the pilot below.

The [period-two correctness pilot](PERIOD-TWO-VERIFIER-PILOT.md) now closes
this bounded slice through an executable certificate and a checked Lean
conditional bridge. For finite decoded parameters in the existing rectangle
`|Re(c)+1|, |Im(c)| <= 2^-32`, with critical seed zero and proposed period two,
exact BigInt checks audit the two-step candidate, the one-step proper divisor,
zero derivative products, rounded residual squares, and actual policy cutoffs.
`periodTwoVerifierPilot_audited_accepts` proves V0/V1 acceptance and the full
supplied record from these margins. The production verifier must agree before
the pilot returns `audited`; any uncertified arithmetic or disagreement refuses.

The actual `orbit.ts` inline block is executed at the same seed in a source
extraction test, bypassing analytic/proposal paths only in the test harness.
JavaScript decoding/checking and source correspondence remain trusted/tested;
this is not a formal TypeScript or engine refinement. The critical-seed zero
multiplier is not the multiplier of the true nearby attracting cycle. The
existing independent trap certificate supplies that cycle claim. No renderer
integration, tile fill, performance claim, product gate, or zoom change follows.
General finite-prefix correspondence, arbitrary candidates and periods,
nonzero multiplier/`hypot` bounds, and output accuracy remain open.

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
2. **P4: reuse higher-order parameter series.** The [parameter-jet batches](PARAMETER-JETS.md) prove Taylor/Hasse coefficient convolution, exact truncation, recursive finite-order coefficient caps, and P3 disk error propagation from retained-product residuals. This avoids caps on the full discarded polynomial; first/second-order budgets agree with prior APIs. Finite outward coefficient, shift, and error table checks now compose into the exact disk bound. Concrete third-order certificates cover iterate four at parameter/seed zero and every iterate through sixteen on `‖δ‖≤1/256` about parameter minus one with critical seed zero. A separate multiply-then-add Horner sequence is now specified and its local operation, inclusive coefficient, and truncation error budgets compose; offset mismatch is charged separately through P3 using decoded-orbit comparison radii. Order-three evaluation retains the minus-one `1/1000000` cap when each coefficient and local operation discrepancy is at most `2⁻⁴⁰`. Scalar primitive contracts now specify four separate products and component subtraction/addition. The ascending retained generator propagates inclusive errors with product cross terms. An executable unbounded-integer dyadic reference has proved generator/Horner decoding correspondence, complex multiplication residual at most `4·2⁻ᵖ`, and exact addition. Copied real integer anchors and seeds have exact retained generation; the 42-bit fractional-grid minus-one generator/evaluator closes total error at `1/1000000` through iterate sixteen on the decoded radius-1/256 disk. This remains an integer reference model. Refine this sequence to actual binary64/TypeScript decoding and primitive/coefficient bounds, then test representative deep-tile references. Fused, square-specific, and symmetry-based alternatives require their own contracts. Combine coefficient, evaluation,
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
