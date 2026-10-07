# Lean batch: disk enclosures and primitive-period certificates

Selected on 2026-10-07 from the [proof DAG](LEAN-PROOF-DAG.md), following
[PR #16](https://github.com/Aaron-Fine/int-M-/pull/16). The parent branch is
`proof/rebase-error-budgets` at `1baad55`; this batch is on
`proof/disk-enclosures-primitive-period`. The parent PR was open at selection; this batch targets its branch without
merging it.

Validation completed with pinned Lean v4.33.1 and the unchanged Mathlib
manifest (`0df444a360eaa60ab8c11dca51a86af692955474`). All 25 new theorems
compile, including the uniform rational witness. The full build, declaration
lint, source style, and all existing and 25 new exact axiom guards pass. A
namespace audit checked 383 `IntMProof` declarations and found only
`propext`, `Classical.choice`, and `Quot.sound`; no additional postulates or
admitted proofs were introduced. The source-style checker reports the optional
missing `nolints` file as a warning and treats it as empty.

## What this batch adds

The preceding batch propagated supplied orbit radii and local arithmetic
errors. This batch constructs reference-centered orbit radii and uses them to
enclose the multiplier on an entire parameter/seed region. That supplies a
sufficient multiplier bound to the return-disk theorem. Strict separations of
proper-divisor returns then certify the return point's primitive period.

| DAG obligation                  | Main declarations                                                                                                                                                     | What they supply                                                                                                              |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| J0 intermediate orbit enclosure | `diskOrbitError`, `diskOrbitRadius`, `orbit_sub_reference_le_diskOrbitError`, `orbit_norm_le_diskOrbitRadius`                                                         | Explicit finite recurrences enclosing every seed/parameter pair in the region at every intermediate index.                    |
| J0/L0 multiplier enclosure      | `multiplierBound`, `seedDerivative_norm_le_multiplierBound`, `seedDerivative_norm_le_disk_multiplier`                                                                 | Product bounds for the formal seed derivative throughout the region.                                                          |
| L0 return disk                  | `diskCenterReturnBound`, `center_return_norm_le_diskCenterReturnBound`, `lipschitzOnWith_orbit_of_disk_enclosure`, `existsUnique_fixedPoint_orbit_of_disk_enclosure`  | Center-displacement and multiplier inequalities sufficient for a unique attracting return fixed point.                        |
| E2/L1 primitive period          | `orbit_ne_of_disk_separation`, `minimalPeriod_eq_of_disk_separation`, `prime_quotient_returns_ne_of_disk_separation`, `existsUnique_primitivePoint_of_disk_enclosure` | Uniform exclusions of positive proper-divisor returns, giving primitive period under exact closure.                           |
| Uniform parameter certificate   | `uniform_primitivePoint_of_disk_enclosure`                                                                                                                            | A separate unique return point of the same primitive period for every parameter in the closed parameter disk.                 |
| L1 critical attraction          | `critical_entry_of_reference_enclosure`, `existsUnique_primitive_critical_return_of_disk_enclosure`                                                                   | A reference critical-entry margin plus the disk certificate gives primitive period and contraction of later critical returns. |
| Exact witness                   | `uniform_periodTwo_critical_disk_certificate`                                                                                                                         | A positive-radius period-two parameter region, with exact rational margins and contraction constant.                          |

The source files are [DiskEnclosure.lean](../../proof/IntMProof/DiskEnclosure.lean),
[PrimitiveDisk.lean](../../proof/IntMProof/PrimitiveDisk.lean), and
[DiskCertificateExamples.lean](../../proof/IntMProof/DiskCertificateExamples.lean).
They reuse the existing error-budget, exact-period, return-disk, and critical
entry proofs and Mathlib's norms, products, derivatives, and iteration APIs.

## Exact enclosure interface

Fix reference parameter `cRef`, seed-disk center `z₀`, seed radius `r ≥ 0`,
parameter radius `Δ ≥ 0`, and reference orbit `Zₖ = orbit cRef k z₀`. Define

\[
e_0=r,\qquad e_{k+1}=2\lVert Z_k\rVert e_k+e_k^2+\Delta,
\qquad R_k=\lVert Z_k\rVert+e_k.
\]

For **every** `c` with `‖c − cRef‖ ≤ Δ` and **every** `z` with
`‖z − z₀‖ ≤ r`, the orbit is within `eₖ` of `Zₖ`, and its norm is at most
`Rₖ`. No corner sampling is involved. A parameter rectangle may use the same
certificate if it is enclosed by the parameter disk; computing that geometric
enclosure remains the caller's responsibility.

The formal seed derivative is bounded by

\[
Q_n=\prod_{k<n} 2R_k.
\]

Use a separate error recurrence with initial value zero to bound the center's
parameter displacement. The center-return bound is
`Dₙ = ‖orbit cRef n z₀ − z₀‖ + diskOrbitError cRef z₀ 0 Δ n`.
If `Qₙ < 1` and `Dₙ + Qₙ r ≤ r`, every admissible parameter has a unique
fixed point of the `n`-step return in the seed disk. A zero-step return has
`Q₀ = 1`, so it cannot pass the strict contraction test.

For each positive proper divisor `d` of `n`, require

\[
e_d+r < \lVert Z_d-z_0\rVert.
\]

The triangle inequality then rules out `orbit c d z = z` everywhere in the
region. Exact closure plus these exclusions is E2's primitive-period
criterion. Prime-quotient exclusions follow as well. Equality at the margin
does not certify exclusion; failed inequalities require refinement or an
unresolved result rather than acceptance.

## Critical-entry interface

The return fixed point's existence and primitive period do not select the
critical orbit's basin. For a critical entry index `k`, use a second reference
orbit starting from zero. Its seed error is zero, and require
`‖orbit cRef k 0 − z₀‖ + diskOrbitError cRef 0 0 Δ k ≤ r`.
This gives actual critical entry for every admitted parameter. Subsequent
`n`-step returns stay in the disk and contract toward its primitive return
point at rate `Qₙ^m`. It does not give the critical point itself period `n`.

## A concrete uniform witness

The period-two center at `cRef = −1` has reference orbit `0, −1, 0`.
Choose seed center `0`, seed radius `r = 1/16`, parameter radius `Δ = 1/256`,
and return length `n = 2`. The exact bounds are

| Quantity                             | Value       |
| ------------------------------------ | ----------- |
| First-step seed error `e₁ = r² + Δ`  | `1/128`     |
| Uniform multiplier bound `Q₂`        | `129/512`   |
| Center-return bound `D₂ = 3Δ + Δ²`   | `769/65536` |
| Period-one exclusion margin `e₁ + r` | `9/128 < 1` |

`Q₂ < 1` and `D₂ + Q₂r ≤ r`. The critical seed already lies at the disk
center, so entry is immediate. The resulting theorem covers all parameters
in the closed disk `‖c + 1‖ ≤ 1/256` and proves primitive period two for the
return point plus attraction of the critical return subsequence. The witness
uses exact rational arithmetic in Lean; it is not a numerical benchmark.

## Remaining work

These formulas use exact reference values and exact real norms. They may be
conservative at longer periods, and they do not guarantee that a useful disk
exists for every parameter. A rigorous implementation must enclose the
reference orbit and round all upper/lower bounds outward. Binary64/GPU local
error bounds, finite-prefix verifier refinement, and renderer repair policy
remain open. This batch encloses the seed derivative, not the parameter
derivative or a second-order predictor remainder. It does not certify the
existing trap constants or change performance defaults.

Next useful obligations are parameter-derivative enclosures and an explicit
`1 − Qₙ` denominator margin for G2, enclosing an inexact stored reference
with the preceding batch's residual budgets, and one specified arithmetic
backend's outward evaluation. A practical certificate
consumer then needs error-aware acceptance/refusal and subdivision tests.
