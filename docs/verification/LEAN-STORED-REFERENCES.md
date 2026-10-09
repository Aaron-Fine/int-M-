# Stored-reference enclosures

This batch closes the exact-reference input boundary in the
[disk certificates](LEAN-DISK-CERTIFICATES.md) and
[parameter enclosures](LEAN-PARAMETER-ENCLOSURES.md). It accepts a stored
complex sequence, radius upper bounds for those stored values, an initial
seed discrepancy, and a local residual allowance for each step. The proofs
enclose the exact target orbit without assuming bounds on an unknown exact
reference orbit.

Source modules are
[`StoredReference.lean`](../../proof/IntMProof/StoredReference.lean),
[`StoredDisk.lean`](../../proof/IntMProof/StoredDisk.lean), and
[`StoredReferenceExamples.lean`](../../proof/IntMProof/StoredReferenceExamples.lean).
This batch builds on PR #18; it changes proofs and documentation.

## Inputs and recurrence

Let `w_k` be the stored values at reference parameter `c_*`. A consumer
supplies exact inequalities

\[
|w_k|\le A_k,\qquad
|w_{k+1}-(w_k^2+c__)|\le\rho_k,\qquad
|c-c__|\le\Delta,\qquad |z-w_0|\le\varepsilon.
\]

These stored values need not form an exact orbit. Define

\[
E_0=\varepsilon,\qquad
E_{k+1}=2A_kE_k+E_k^2+(\Delta+\rho_k),\qquad
R_k=A_k+E_k.
\]

`orbit_sub_storedReference_le_budget` proves
`|orbit c n z - w_n| ≤ E_n`. Its radius and residual inputs are required only
for `k < n`. `orbit_norm_le_storedOrbitRadius` additionally needs `A_n` to
bound the endpoint norm by `R_n`. The radius input concerns the stored
sequence, so the recurrence can be evaluated from a supplied reference
prefix without first finding the exact reference orbit.

Nonnegative budgets give nonnegative error/radius bounds. Increasing the
initial allowance, parameter radius, stored radii, or residual allowances
can only enlarge the error enclosure. With an exact reference and zero
residuals, `storedOrbitError_exact_reference` and
`storedOrbitRadius_exact_reference` recover the earlier disk enclosures.

## Seed disks and certificate consumers

If the seed disk has center `z_*`, radius `r`, and initial reference error
`|z_* - w_0| ≤ ε`, every enclosed seed starts with error at most `r + ε`.
Use this error for the uniform derivative bounds:

\[
Q_n=\prod_{k<n}2R_k,\qquad T_0=0,\qquad T_{k+1}=2R_kT_k+1.
\]

The seed-disk center itself starts with error `ε`. Its return displacement
therefore has the smaller enclosure

\[
D_n=|w_n-z_*|+E_n(\varepsilon).
\]

| Consumer                 | Declaration                                                              | Contract                                                                                |
| ------------------------ | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| J0 seed derivative       | `seedDerivative_norm_le_stored_bound`                                    | Formal multiplier norm at most `Q_n`                                                    |
| J0 parameter derivative  | `parameterDerivative_norm_le_stored_bound`                               | Fixed-seed parameter partial norm at most `T_n`                                         |
| G2 denominator and slope | `stored_branch_denominator_lower`, `stored_branchSlope_norm_le`          | Denominator margin `1 - Q_n`; slope expression at most `T_n / (1 - Q_n)` when `Q_n < 1` |
| L0 invariant return disk | `existsUnique_fixedPoint_of_stored_enclosure`                            | `Q_n < 1` and `D_n + Q_n r ≤ r` give a unique attracting return point in the disk       |
| E2/L1 divisor exclusion  | `orbit_ne_of_stored_separation`, `minimalPeriod_eq_of_stored_separation` | Strict stored-endpoint separations exclude positive proper divisors under exact closure |
| L1 primitive return disk | `existsUnique_primitivePoint_of_stored_enclosure`                        | Combines the invariant disk and all proper-divisor separations                          |
| L1 critical entry        | `critical_entry_of_storedReference`                                      | A stored critical prefix plus its full budget proves actual disk entry                  |

The derivative and return certificate APIs accept stored radius bounds
through index `n` and residual bounds before `n`; the radius endpoint is a
convenient common prefix contract. No prefix beyond the stated horizon is
assumed. To exclude a proper divisor `d`, require

\[
E_d(r+\varepsilon)+r<|w_d-z_*|.
\]

Strict separation excludes exact return throughout the seed/parameter disks.
Exact closure is supplied by the invariant return-disk theorem; a small
numerical residual alone is not substituted for it.

Critical entry may use its own stored sequence and error allowance. Its
margin is `|w_k - z_*| + E_k ≤ r`, where the initial error covers the gap
from the critical seed `0`. The result supplies the entry hypothesis of
the existing `existsUnique_critical_return_of_entry`, which proves invariant
critical returns and geometric contraction. Entry need not use the same
reference prefix as the return-disk certificate.

## A genuinely inexact witness

At reference parameter `c_* = -1`, deliberately store

\[
w_0=\eta,\qquad w_1=-1+\eta,\qquad w_2=\eta,\qquad\eta=1/1024.
\]

The center is `z_* = 0`, so the initial-center error is positive. The step
residuals are `η - η²` and `3η - η²`, both nonzero. Bounds
`A_0 = A_2 = 1/1024`, `A_1 = 1`, and `ρ_0 = ρ_1 = 1/256` enclose the
used prefix. No assumption is made that its continuation is a valid orbit.

With seed radius `r = 1/16` and parameter radius `Δ = 1/512`, the checked
inequalities give `Q_2 ≤ 1/3`, `D_2 ≤ 1/32`, and strict divisor separation.
Consequently every parameter in the closed disk around `-1` of radius
`1/512` has a unique primitive period-two return point in the seed disk,
with multiplier norm at most `1/3`. These deliberately conservative
allowances demonstrate that the certificate tolerates initial and step
reference errors; they are not backend error estimates.

## Validation and remaining obligations

Validation passed with Lean v4.33.1 and the committed Mathlib revision
`0df444a360eaa60ab8c11dca51a86af692955474`:

- Full `lake build`, including all new modules and the project root.
- `lake lint` over the project root and `lake exe lint-style` over tracked
  Lean sources. The style checker treats the absent optional
  `scripts/nolints-style.txt` file as empty.
- All existing axiom guards and 29 new exact axiom-set guards.
- Namespace audit of 461 `IntMProof` declarations, permitting only
  `propext`, `Classical.choice`, and `Quot.sound`; no additional postulates
  or admitted proofs.
- Markdown formatting and whitespace checks.

The deliberately biased witness checks positive initial-error and
local-residual allowances on a nontrivial parameter region. Renderer
accuracy and browser performance gates require separate implementation
and benchmark evidence.

A finite stored binary64, Wasm, or GPU value can be interpreted as an exact complex
number in these contracts. The backend still has to certify the supplied
radius, initial-error, and residual inequalities, and evaluate the budget
recurrence and its margins outward. The proofs do not derive any backend's
operation errors or assume that floating point evaluation of `E_n` is exact.
They do not supply a quantified predictor remainder, frozen guard/trap
constants, or TypeScript verifier refinement.

The next useful batch is one specified arithmetic backend's outward
evaluation and its error-aware acceptance/refusal checks. `orbit_sub_storedReference_le_budget_from` preserves the absolute orbit
index for a resumed segment. Rebase conversions can use the existing
conversion-error contract to update that segment's initial allowance. A predictor remainder needs second derivatives and a
domain on which the branch stays enclosed.

The [outward-grid continuation](LEAN-OUTWARD-GRID.md) now certifies rational
stored-value and local residual bounds and evaluates the budget exactly over
rationals. Binary64, Wasm, and GPU operation bounds remain separate refinements.
