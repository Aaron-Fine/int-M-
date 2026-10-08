# Parameter jets (P4)

This batch advances the P4 node in the [proof DAG](LEAN-PROOF-DAG.md).
It now covers all-order, fixed-seed coefficients of a finite quadratic orbit,
exact finite truncation, and a conditional finite-support norm bound. The
second-order slice also has a recursive finite-disk error budget. Practical
general-order cap generation, arithmetic refinement, and renderer integration
remain open. No supported zoom or classifier policy changes.

## Second-order algebraic contract

For a fixed seed `z`, reference parameter `c`, and offset `δ`, write

- `Zₙ = orbit c n z`;
- `Bₙ = parameterJetLinear c z n`, the existing formal parameter derivative;
- `Cₙ = parameterJetQuadratic c z n`;
- `aₙ = Zₙ + Bₙ δ + Cₙ δ²`.

[ParameterJet.lean](../../proof/IntMProof/ParameterJet.lean) proves
`B₀=C₀=0`, `Bₙ₊₁=2ZₙBₙ+1`, and `Cₙ₊₁=2ZₙCₙ+Bₙ²` over any commutative
ring. `parameterJetQuadratic_twice_eq_second_derivative` identifies twice C
with the second formal derivative. No inverse of two is used; this equality
alone does not recover C in characteristic two.

The exact one-step residual is

`aₙ₊₁ − quadratic (c+δ) aₙ = −(2BₙCₙδ³ + Cₙ²δ⁴)`.

`secondOrderError_succ` propagates the exact error `eₙ = orbit (c+δ) n z − aₙ`:

`eₙ₊₁ = 2aₙeₙ + eₙ² + 2BₙCₙδ³ + Cₙ²δ⁴`.

The residual sign and error sign are opposite because their subtraction order
is opposite. `secondOrderError_eq_perturbation_sub_jet` connects this remainder
to P1's same-seed perturbation. The generically nonzero expression
`secondOrderError_zero_reference_three` gives `e₃ = 2δ³+δ⁴` when `c=z=0`;
the quadratic approximation is therefore not silently treated as exact.

## Finite-disk norm contract

[ParameterJetBound.lean](../../proof/IntMProof/ParameterJetBound.lean) takes
reference radii `‖Zₖ‖ ≤ radius k` for `k<n` and an offset bound `‖δ‖ ≤ Δ`.
The existing `parameterDerivativeBudget` bounds B. A new nonnegative
`parameterJetQuadraticBudget` bounds C by the matching recurrence

`Q₀=0`, `Qₖ₊₁=2 radius(k) Qₖ + parameterDerivativeBudget(radius,k)²`.

These supply the uniform local residual budget

`Fₖ = 2 parameterDerivativeBudget(radius,k) Qₖ Δ³ + Qₖ² Δ⁴`.

`secondOrderApproximation_error_le_budget` uses P3's existing comparison with
initial error zero, forcing F, and target radii

`Rₖ = radius(k) + errorBudget 0 radius (fun _ => Δ) k`.

The target radii are justified by the exact parameter-shift enclosure; they
are not assumed to equal the reference radii. The result holds for each
complex offset in the closed disk `‖δ‖≤Δ` with the same supplied reference
prefix. It needs no radius at index n or beyond that finite prefix.
A large bound remains valid but may be unusable; no attracting verdict follows
from this theorem alone.

## All-order coefficient and truncation contracts

[ParameterJetTaylor.lean](../../proof/IntMProof/ParameterJetTaylor.lean) defines
`Tₙ = (parameterPolynomial (C z) n).taylor c` and `Aₖ,ₙ = Tₙ.coeff k`.
The seed stays constant while the polynomial variable is the parameter offset.
`parameterTaylorPolynomial_eval` proves `Tₙ.eval δ = orbit (c+δ) n z`.
Over any commutative ring, including characteristic two:

- `A₀,ₙ = Zₙ`, `A₁,ₙ = Bₙ`, and `A₂,ₙ = Cₙ`;
- `Aₖ,₀ = if k=0 then z else 0`;
- `Aₖ,ₙ₊₁ = ∑ⱼ₌₀ᵏ Aⱼ,ₙ Aₖ₋ⱼ,ₙ + [k=1] + c[k=0]`;
- for `k≥2`, `Aₖ,ₙ₊₁ = 2 Zₙ Aₖ,ₙ + ∑₁≤ⱼ<ₖ Aⱼ,ₙ Aₖ₋ⱼ,ₙ`.

`parameterJetCoefficient_eq_hasseDeriv` identifies each coefficient with
`(hasseDeriv k (parameterPolynomial (C z) n)).eval c`.
`parameterJetQuadratic_eq_hasseDeriv` supplies the previously open named
quadratic identification. Neither statement divides by a factorial.

[ParameterJetTruncation.lean](../../proof/IntMProof/ParameterJetTruncation.lean)
keeps orders zero through the inclusive `order` in a prefix polynomial. The
exact tail has zero coefficients through that order and is divisible by
`X^(order+1)`. `parameterJetApproximation_remainder_factor` proves

`∃ q, ∀ δ, orbit (c+δ) n z − approximation(c,z,δ,n,order) = δ^(order+1) q.eval δ`.

The same quotient works for every offset; it may depend on `c,z,n,order`.
Order two agrees with `secondOrderApproximation`. Retaining at least the
translated polynomial's `natDegree` gives the exact orbit, including the zero
polynomial and trivial-ring cases.

For complex parameters, `parameterJetApproximation_error_le_tail_budget`
assumes `‖δ‖≤Δ` and caps `‖tail.coeff k‖≤budget k` for every `k` in the tail's
finite support. It bounds the error by `∑ k∈tail.support, budget k * Δ^k`.
Nonnegativity of those caps follows on the support from the norm premise; no
cap is required outside it. This is a conditional exact-polynomial bound.
The full orbit polynomial can have exponentially growing degree in the
iteration count. Constructing its tail and supplying every discarded cap is
not yet a practical general-order certificate generator. The theorem also
does not bound rounded coefficient generation or evaluation.

## Adversarial review and update loop

The second-order reviewer checked seed dependence, residual signs, exponent
order, budget nonnegativity, and finite-prefix indices. Its findings led to
the explicit third-step remainder witness and P4/E1/P3 boundaries.

An independent all-order reviewer checked the convolution forcing at orders
zero and one, endpoint separation in characteristic two, inclusive truncation,
and the quotient's quantifier order. Its documentation finding was incorporated:
the finite-support bound requires caps on the full discarded tail, so practical
cap generation stays open. The named quadratic Hasse bridge was added and
rereviewed. Independent Lean witnesses compiled for zero iteration, order zero,
zero offset, the trivial ring, and an empty tail with negative unused caps.
A characteristic-two witness has `A₂,₂=1` at `c=z=0` while the ordinary second
derivative is zero, confirming why division-free identification matters.

## Next obligations

1. Derive usable general-order coefficient caps and an error recurrence without
   materializing the full exact orbit polynomial. Supply outward reference and
   coefficient bounds for one concrete finite disk. P4 remains partial until
   this numerical certificate-generation obligation is discharged.
2. Derive coefficient-generation and series-evaluation machine residuals in
   the chosen backend and combine them with P3. The formal truncation bound
   does not certify rounded arithmetic, rebase conversion, or verifier frames.
3. Profile the existing renderer before adding a series path. Measure reference
   setup, coefficient storage, rebase frequency, repair rate, and total render
   time. Preserve the [Phase 3 product and numerical gates](PHASE-3-PROOF-PROGRAM.md).

## Validation

Initial second-order batch checked on 2026-10-08 with Lean v4.33.1 and the unchanged pinned manifest:

- `lake build +IntMProof.ParameterJet` and `+IntMProof.ParameterJetBound` passed.
- A bare `lake build` passed after moving aside the project build directory;
  imported project modules and all aggregate axiom guards rebuilt successfully.
- Seven new selected axiom guards passed. A namespace-wide audit inspected 790
  declarations and allowed only `propext`, `Classical.choice`, and `Quot.sound`;
  no `sorryAx` or custom axiom appeared.
- `lake lint` passed and reported exactly `[IntMProof.Axioms]` as its selected
  module. `lake exe lint-style` passed (the optional upstream style-exemption
  file is absent in this downstream project, so the tool treats it as empty).
- Changed Markdown passed Prettier; `git diff --check` passed.

Fresh-checkout validation also exposed an existing Lake configuration defect:
selecting only `.one IntMProof.Axioms` excluded theorem dependencies from Lake's
buildable modules. Selecting both the theorem root and audit restores recursive
builds. `lintDriverArgs := #["IntMProof.Axioms"]` keeps declaration lint on one
aggregate environment. An adversarial review checked these choices against the
pinned Lake and Batteries sources. No dependency or runtime classifier changed.

The all-order continuation on 2026-10-08 passed:

- A bare `lake build` (3161 jobs), including both new theorem modules and the
  aggregate audit imports.
- Nine new selected axiom guards; the namespace-wide audit inspected 825
  declarations and found only `propext`, `Classical.choice`, and `Quot.sound`.
- `lake lint`, selecting `[IntMProof.Axioms]`, and `lake exe lint-style` (with
  the same optional upstream style-exemption warning).
- The independent edge-case Lean witnesses described above, changed Markdown
  formatting, and `git diff --check`. The pinned manifest remains unchanged.
