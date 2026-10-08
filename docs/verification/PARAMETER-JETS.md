# Parameter jets (P4)

This batch advances the P4 node in the [proof DAG](LEAN-PROOF-DAG.md).
It now covers all-order, fixed-seed coefficients of a finite quadratic orbit,
exact finite truncation, and recursive finite-order coefficient and error
budgets. The retained-product route avoids the full discarded polynomial and
has concrete third-order disk certificates at zero and minus one. Finite
outward budget-table inequalities are checked. Machine coefficient/evaluation arithmetic,
backend refinement, and measured renderer integration remain open. No supported zoom or classifier policy changes.

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
not itself a practical general-order certificate generator. The recursive
retained-product route below removes this full-tail requirement. The theorem also
does not bound rounded coefficient generation or evaluation.

## Recursive finite-order disk contract

[ParameterJetCoefficientBound.lean](../../proof/IntMProof/ParameterJetCoefficientBound.lean)
defines `Dₙ,ₖ = parameterJetCoefficientBudget radius n k`, bounding the positive
coefficient `Aₖ₊₁,ₙ`. Its shifted indexing avoids needing a cap for the constant
coefficient at the final iterate:

- `D₀,ₖ = 0`;
- `Dₙ₊₁,₀ = 2 radius(n) Dₙ,₀ + 1`;
- `Dₙ₊₁,ₖ₊₁ = 2 radius(n) Dₙ,ₖ₊₁ + ∑ᵢ₊ⱼ₌ₖ Dₙ,ᵢ Dₙ,ⱼ`.

`parameterJetCoefficient_norm_le_budget` assumes only
`‖orbit c j z‖≤radius j` for `j<n`. It bounds every positive order at iterate
`n`; nonnegative earlier radii also give nonnegative caps. The first two caps
are exactly the existing derivative and quadratic budgets. At a chosen finite
retained order, this recurrence uses only that order and lower orders at the
previous iterate. It permits a table construction without the full orbit
polynomial. The definitions and theorems are mathematical contracts; this
batch does not implement extraction, memoization, or a rounded backend.

[ParameterJetResidual.lean](../../proof/IntMProof/ParameterJetResidual.lean)
defines the finite discarded-pair set
`Sₘ = {(i,j) | i≤m, j≤m, m<i+j}`. Both indices of every such pair are positive.
For the inclusive order-`m` approximation `aₙ`, the exact local residual is

`aₙ₊₁ − quadratic (c+δ) aₙ = −∑(i,j)∈Sₘ Aᵢ,ₙ Aⱼ,ₙ δ^(i+j) − [m=0]δ`.

The order-zero term matters: the constant approximation omits the parameter
shift itself. For positive `m`, the residual contains only products of retained
coefficients, with offset degrees from `m+1` through `2m`.

[ParameterJetRecursiveBound.lean](../../proof/IntMProof/ParameterJetRecursiveBound.lean)
bounds this residual on `‖δ‖≤Δ` by

`Fₙ = ∑(i,j)∈Sₘ Dₙ,ᵢ₋₁ Dₙ,ⱼ₋₁ Δ^(i+j) + [m=0]Δ`.

`parameterJetApproximation_error_le_recursive_budget` applies P3 with initial
error zero, this forcing, and justified target radii
`Rₖ = radius(k) + errorBudget 0 radius (fun _ => Δ) k`. The final iterate `n`
requires reference radii only at `k<n`. No caps on full discarded-orbit
coefficients are used. `parameterJetRecursiveForcing_zero` gives `Fₙ=Δ` at
order zero; `parameterJetRecursiveForcing_two` recovers the existing
`secondOrderForcing` exactly, even for arbitrary real budget inputs.

[ParameterJetDisk.lean](../../proof/IntMProof/ParameterJetDisk.lean) instantiates
this contract at reference parameter and critical seed zero, where every
reference radius is exactly zero. At inclusive order three, after four iterates,
and for every complex offset `‖δ‖≤1/16`, the truncation error is at most
`1/10000`. The computed recursive budget is exactly `353859/4294967296`.
This small finite disk demonstrates the exact contract; it does not establish
a useful bound on deep tiles, attraction, or rounded evaluation.

## Finite outward tables and a nonzero reference disk

[ParameterJetEnclosure.lean](../../proof/IntMProof/ParameterJetEnclosure.lean)
accepts caller-supplied finite real enclosure tables. Each retained coefficient
entry must be nonnegative and dominate the corresponding recurrence applied
to the previous row. `parameterJetCoefficientBudget_le_enclosure` then bounds
the exact recursive caps. Initial coefficient rows may have nonnegative slack;
entries outside the retained orders and finite horizon are unused.

`errorBudget_le_enclosure` accepts an initial upper bound and outward step
inequalities `2 radius(j) upper(j) + upper(j)² + forcing(j) ≤ upper(j+1)`
on the stated finite prefix. With nonnegative initial error, radii, and forcing,
it bounds P3's exact recurrence. `parameterJetEnclosureForcing` uses only
retained coefficient-table entries; order zero still contributes `Δ`.

`parameterJetApproximation_error_le_enclosure` combines coefficient checks,
shift checks, and final error checks. A shift table `S` encloses the P1
parameter-shift recurrence and justifies target radii `radius(j)+S(j)`.
The final table `E` must dominate the P3 step using these target radii and the
retained-product forcing. The result bounds the exact complex jet error by
`E(n)`. Every assumption is restricted to the retained orders and horizon;
no unproved future table entries or full discarded polynomial are used.
These are checks of mathematical table values, not a proof that a floating
point implementation generates or evaluates a jet correctly.

[ParameterJetNonzeroDisk.lean](../../proof/IntMProof/ParameterJetNonzeroDisk.lean)
uses reference parameter `c=−1` and critical seed zero. The reference orbit
alternates exactly between `0` and `−1`, giving exact radii `0,1,0,1,…`.
The finite cap table records the transient before its repeating rows: caps
for orders one through three are `(3,19,30)` at iterate four and `(3,19,246)`
at iterate six. All seventeen rows are stored and all sixteen transitions
are checked; no stationary-row assumption is needed.

The shift and error tables use dyadic units `2⁻⁴⁰`. Each stored row is checked
as an upper bound for the recurrence from the previous stored row, so the
externally calculated values are accepted through kernel-checked inequalities.
The final error row is exactly `1097827/1099511627776`.

| Reference parameter / seed | Retained order | Certified horizon | Offset disk | Truncation cap |
| -------------------------- | -------------- | ----------------- | ----------- | -------------- |
| `0 / 0`                    | 3              | At iterate 4      | `‖δ‖≤1/16`  | `1/10000`      |
| `−1 / 0`                   | 3              | Every `0≤n≤16`    | `‖δ‖≤1/256` | `1/1000000`    |

`minusOneJet_thirdOrder_error_le` proves the second row uniformly for every
complex offset in the closed disk. Default values outside the finite tables
are zero and carry no certificate; the shift step beyond the stored horizon
fails. This is a nonzero period-two reference witness, not a general deep-tile
result, a new attracting verdict, or a rounded-evaluation certificate.

## Adversarial review and update loop

The second-order reviewer checked seed dependence, residual signs, exponent
order, budget nonnegativity, and finite-prefix indices. Its findings led to
the explicit third-step remainder witness and P4/E1/P3 boundaries.

An independent all-order reviewer checked the convolution forcing at orders
zero and one, endpoint separation in characteristic two, inclusive truncation,
and the quotient's quantifier order. Its documentation finding was incorporated:
the finite-support bound requires caps on the full discarded tail, motivating
the retained-product route above. The named quadratic Hasse bridge was added and
rereviewed. Independent Lean witnesses compiled for zero iteration, order zero,
zero offset, the trivial ring, and an empty tail with negative unused caps.
A characteristic-two witness has `A₂,₂=1` at `c=z=0` while the ordinary second
derivative is zero, confirming why division-free identification matters.

The recursive-budget reviewer independently compiled order-zero and order-one
residuals, arbitrary-seed affine first-step exactness, characteristic-two
residuals, and a finite-prefix cap with deliberately negative future radii.
Its update findings were incorporated: persist order-zero and second-order
forcing compatibility, state the concrete certificate at iterate four, and
keep exact recurrence construction separate from rounded execution. It also
checked the concrete rational budget independently and rereviewed the updates.

The outward-table reviewer independently checked all rational rows and compiled
boundary-offset, zero-horizon/order, initial-slack, and negative-unused-future
witnesses. Its update request added persistent order-zero enclosure forcing.
The nonzero-disk review checked all retained orders, finite table indices,
ordered-product multiplicities, and the parameter-shift contribution to target
radii. Independent Lean witnesses cover the closed disk boundary, the final
rational row, table defaults after iterate sixteen, and failure of the shift
step beyond the certified horizon. Updates were rereviewed before publishing.

## Next obligations

1. Choose the coefficient-table and series-evaluation operation sequence.
   Derive backend-specific bounds for reference radii, computed coefficients,
   rounded cap generation, evaluation, and rebasing, then combine the machine
   residuals with P3. The finite outward-table checks provide a certificate
   consumer; they do not refine binary64 operations or verifier frames.
   Extend to representative deep-tile reference orbits and assess whether
   the budgets remain useful at the required horizons.
2. Profile the existing renderer before adding a series path. Measure reference
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

The recursive retained-order continuation on 2026-10-08 passed:

- A bare `lake build` (3166 jobs), including all four new theorem modules and
  the aggregate audit imports.
- Eight new selected axiom guards; a namespace-wide audit inspected 878
  declarations and found only `propext`, `Classical.choice`, and `Quot.sound`.
- `lake lint`, selecting `[IntMProof.Axioms]`, and `lake exe lint-style` (with
  the same optional upstream style-exemption warning).
- Independent boundary, characteristic-two, compatibility, and finite-prefix
  Lean witnesses against the compiled modules; the concrete rational budget
  also matched an independent arithmetic check.
- Changed Markdown formatting and `git diff --check`. Lean v4.33.1 and the
  pinned manifest remain unchanged.

The finite outward-table and nonzero-disk continuation on 2026-10-08 passed:

- A bare `lake build` (3169 jobs), including both new theorem modules and
  the aggregate audit imports.
- Eight new selected axiom guards; the namespace-wide audit inspected 932
  declarations and found only `propext`, `Classical.choice`, and `Quot.sound`.
- `lake lint`, selecting `[IntMProof.Axioms]`, and `lake exe lint-style` (with
  the same optional upstream style-exemption warning).
- Independent exact rational reproduction of all seventeen shift/error rows
  and compiled Lean boundary, zero-horizon/order, initial-slack, finite-default,
  and negative-unused-future witnesses.
- Changed Markdown formatting and `git diff --check`. Lean v4.33.1 and the
  pinned manifest remain unchanged.
