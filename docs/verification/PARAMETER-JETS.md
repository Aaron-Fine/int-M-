# Second-order parameter jets (P4)

This batch advances the P4 node in the [proof DAG](LEAN-PROOF-DAG.md).
It covers the second-order, fixed-seed approximation of a finite quadratic
orbit. Arbitrary-order coefficient convolution, arithmetic refinement, and
renderer integration remain open. No supported zoom or classifier policy changes.

## Algebraic contract

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
to P1's same-seed perturbation. The nonzero witness
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

## Adversarial review and update loop

An independent subagent reviewed seed dependence, characteristic two,
residual signs, exponent order, budget nonnegativity, and finite-prefix
indices. No missing mathematical hypothesis was identified. Its actionable
findings were incorporated: add the nonzero third-step witness, explicitly
preserve the characteristic-two boundary, mark P4 partial, and add E1/P3 as
direct DAG prerequisites. Compiler, axiom, and linter results are recorded
below after validation.

## Next obligations

1. Identify coefficients through Mathlib's Hasse derivatives or Taylor map,
   starting with `Cₙ = (hasseDeriv 2 (parameterPolynomial (C z) n)).eval c`.
   This identifies the coefficient even when two is not invertible. Use the
   existing product-convolution APIs to extend to arbitrary order.
2. Produce usable outward reference-radius and coefficient bounds for one
   concrete finite disk. Prove general-order truncation bounds before claiming
   completion of the full P4 node.
3. Derive coefficient-generation and series-evaluation machine residuals in
   the chosen backend and combine them with P3. The formal truncation bound
   does not certify rounded arithmetic, rebase conversion, or verifier frames.
4. Profile the existing renderer before adding a series path. Measure reference
   setup, coefficient storage, rebase frequency, repair rate, and total render
   time. Preserve the [Phase 3 product and numerical gates](PHASE-3-PROOF-PROGRAM.md).

## Validation

Checked on 2026-10-08 with Lean v4.33.1 and the unchanged pinned manifest:

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
