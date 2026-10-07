# Parameter enclosures and finite continuation

This batch extends the [disk certificates](LEAN-DISK-CERTIFICATES.md) with
J0 parameter-derivative bounds and G2 denominator/slope bounds. It also
provides a finite J1 movement estimate between exact return points in the
common seed and parameter disks. Source modules are
[`ParameterEnclosure.lean`](../../proof/IntMProof/ParameterEnclosure.lean),
[`DiskGuard.lean`](../../proof/IntMProof/DiskGuard.lean), and
[`DiskGuardExamples.lean`](../../proof/IntMProof/DiskGuardExamples.lean).

## Shared enclosures

For the exact reference orbit, let

\[
R_k=\operatorname{diskOrbitRadius}(c__,z__,r,\Delta,k),\qquad
Q_n=\prod_{k<n}2R_k.
\]

The preceding batch proves that these enclose every orbit and seed derivative
for `‖c - c_*‖ ≤ Δ` and `‖z - z_*‖ ≤ r`. Define

\[
T_0=0,\qquad T_{k+1}=2R_kT_k+1.
\]

`parameterDerivative_norm_le_disk_bound` proves
`‖B_n(c,z)‖ ≤ T_n`, where `B_n` is the parameter partial with the seed
held fixed. A seed that moves with the parameter requires the existing total
derivative identity; its initial derivative is not silently set to zero.
Nonnegative radii give nonnegative bounds, and enlarging the radii can only
enlarge this comparison sequence.

| Consumer                     | Declaration                                                                   | Contract                                                                                                |
| ---------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| J0 parameter enclosure       | `parameterDerivative_norm_le_bound`, `parameterDerivative_norm_le_disk_bound` | Bounds the fixed-seed partial from intermediate orbit radii                                             |
| Finite parameter changes     | `lipschitzOnWith_parameter_orbit_of_disk_enclosure`                           | Orbit return is `T_n`-Lipschitz on the convex parameter disk for each enclosed seed                     |
| G2 denominator               | `disk_branch_denominator_lower`                                               | `‖1 - λ_n‖ ≥ 1 - Q_n`                                                                                   |
| G2 slope                     | `disk_branchSlope_norm_le`, `exists_branch_of_disk_enclosure`                 | Slope modulus at most `T_n / (1 - Q_n)`; exact closure constructs a local periodic graph                |
| G2 linear proposal           | `disk_predictorDisplacement_le`                                               | Predictor displacement at most `T_n ‖δ‖ / (1 - Q_n)`                                                    |
| J1 finite exact-root changes | `periodicPoint_dist_le_disk_bound`                                            | Two exact return points in the common disks differ by at most `T_n / (1 - Q_n)` times the parameter gap |

## Denominator and proposal

The reverse triangle inequality gives `1 - Q_n ≤ ‖1 - λ_n‖`. Under
`Q_n < 1`, this is a positive denominator margin and rules out `λ_n = 1`.
Combining numerator and denominator enclosures yields

\[
\left\|\frac{B_n}{1-\lambda_n}\right\|
\le \frac{T_n}{1-Q_n},\qquad
\left\|\frac{B_n}{1-\lambda_n}\delta\right\|
\le \frac{T_n}{1-Q_n}\|\delta\|.
\]

These algebraic estimates hold at all enclosed seeds. Interpreting the ratio
as the derivative of a periodic branch requires exact closure, as supplied
by `exists_branch_of_disk_enclosure`. Its graph is local and its slope bound
is at the starting parameter. The theorem does not claim that this local
graph stays inside the seed disk for an unspecified neighborhood.

## Finite movement of exact roots

For two parameters and two seeds in the common disks, splitting the change
into seed and parameter segments gives

\[
|f_{c_0}^{n}(z_1)-f_{c_1}^{n}(z_2)|
\le Q_n|z_1-z_2|+T_n|c_0-c_1|.
\]

If both seeds are exact return points, their left-hand side is `|z_1-z_2|`.
Rearrangement, using `Q_n < 1`, gives the finite bound

\[
|z_1-z_2|\le\frac{T_n}{1-Q_n}|c_0-c_1|.
\]

This theorem assumes neither a differentiable branch nor uniqueness. The
preceding disk certificates supply existence and uniqueness where their
center/self-mapping conditions hold. Primitive period still uses divisor
separation. For parameters in such a certified region, this movement
estimate controls its uniquely selected return points, including endpoints
on the closed parameter disk boundary.

## Period-two witness

Use the already certified region `c_* = -1`, `z_* = 0`, `r = 1/16`,
`Δ = 1/256`, and `n = 2`. Lean checks the following exact constants:

| Quantity                                | Bound      |
| --------------------------------------- | ---------- |
| Seed derivative `Q_2`                   | `129/512`  |
| Parameter derivative `T_2`              | `193/64`   |
| Denominator margin `1 - Q_2`            | `383/512`  |
| Slope and finite root movement constant | `1544/383` |

The denominator and slope estimates hold for every seed/parameter pair in
the disks. `periodTwo_periodicPoint_dist_bound` applies to exact two-step
return points; the previous `uniform_periodTwo_critical_disk_certificate`
supplies their existence, primitive period, uniqueness, and critical
attraction throughout the region.

## Validation and remaining obligations

Validation passed with Lean v4.33.1 and the committed Mathlib revision
`0df444a360eaa60ab8c11dca51a86af692955474`:

- Full `lake build`, including all three new modules and the project root.
- `lake lint` over the project root and `lake exe lint-style` over tracked
  Lean sources. The style checker treats the absent optional
  `scripts/nolints-style.txt` file as empty.
- All existing axiom guards and 21 new exact axiom-set guards.
- Namespace audit of 417 `IntMProof` declarations, permitting only
  `propext`, `Classical.choice`, and `Quot.sound`; no additional postulates
  or admitted proofs.
- Markdown formatting and whitespace checks.

This is a proof/documentation change. It does not change renderer defaults
or supply browser accuracy/latency evidence.

The finite root movement bound is not a second-order bound for the error of
the linear predictor. The little-o remainder remains the existing local
asymptotic result. A quantified predictor remainder on a fixed disk,
`guardDisplacement = 0.01`, and the frozen Newton floor `1e-12` remain
uncertified. Exact real comparisons here still require outward machine
evaluation, and the reference orbit must be enclosed if it is stored
inexactly. The TypeScript verifier refinement and error-aware acceptance,
refusal, subdivision, and renderer repair policy remain open.

The [stored-reference batch](LEAN-STORED-REFERENCES.md) now encloses an
inexact reference from stored radii and local residual allowances, including
both derivative and denominator/slope consumers. A specified arithmetic
backend's outward evaluation remains the next boundary. A quantitative predictor remainder would additionally
need second derivatives and a domain on which the branch remains enclosed.
