# Outward-grid continuation of PR #19

PR #19's stored-reference contracts were merged into a separate proof branch.
This continuation integrates them with the current performance branch, keeps
its newer verifier and policy proofs, and adds a specified executable
arithmetic backend. It uses arbitrary-size rational intermediates and
directed rounding of box endpoints on a rational grid. This backend is
distinct from the TypeScript binary64 operation sequence.

## Arithmetic specification

Choose a positive integer scale `S`. Endpoints are projected onto `ℤ / S`:

\[
\operatorname{down}_S(x)=\frac{\lfloor Sx\rfloor}{S},\qquad
\operatorname{up}_S(x)=\frac{\lceil Sx\rceil}{S}.
\]

Lean proves `down_S(x) ≤ x ≤ up_S(x)` and a rounding error strictly smaller
than `1/S` in each direction. Interval width increases by less than `2/S`.
Signed floor and ceiling matter: at scale ten, `-1/3` rounds down to `-2/5`
and up to `-3/10`. Truncation toward zero would fail the lower-bound contract.
The certificate APIs require `0 < S`; scale zero has no soundness claim.

| Operation                     | Specified evaluation                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------ |
| Input boxes                   | Round both coordinate intervals outward                                              |
| Orbit step                    | Use the existing exact rational box step, then round each resulting endpoint outward |
| Multiplier step               | Exact rational doubling and box multiplication, then outward endpoint rounding       |
| Closure residual              | Exact box subtraction from the original seed box, then outward rounding              |
| Norm squares and thresholds   | Exact rational operations and comparisons; no rounded square root                    |
| Stored-reference error budget | Exact rational recurrence, with a checked cast to the real recurrence                |

There is no fixed integer word size, overflow, underflow, signed zero, NaN,
or infinity in this arithmetic model. Integer numerator size and work can
grow; this batch makes no bounded-memory or browser-performance claim.
Endpoint quantization controls grid spacing, not the magnitude of the values.

## Checked contracts

| Source                                                                           | Main declarations                                                                                                                                                  | Result                                                                                                                        |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| [OutwardGrid.lean](../../proof/IntMProof/OutwardGrid.lean)                       | `gridFloor_le`, `le_gridCeil`, `gridFloor_error_lt`, `gridCeil_error_lt`, `roundIntervalOutward_sound`, `roundBoxOutward_sound`                                    | Directed rounding preserves every contained real or complex value                                                             |
| [RoundedBoxOrbit.lean](../../proof/IntMProof/RoundedBoxOrbit.lean)               | `roundedBoxOrbit_sound`, `roundedBoxMultiplier_sound`, `roundedBoxClosure_normSq_interval`, `roundedBoxMultiplier_normSq_interval`                                 | Every finite rounded recurrence encloses the exact orbit, multiplier, and squared closure residual                            |
| [RationalStoredBudget.lean](../../proof/IntMProof/RationalStoredBudget.lean)     | `referenceStepResidual_norm_le`, `rationalStoredError_cast`, `orbit_error_le_rationalStoredError`                                                                  | Computed rational boxes certify stored radii/residual allowances; exact rational budget evaluation gives PR #19's real bound  |
| [RoundedTileCertificate.lean](../../proof/IntMProof/RoundedTileCertificate.lean) | `certifyRoundedCriticalPeriodTwo_iff`, `roundedCriticalPeriodTwo_margins`, `roundedCriticalPeriodTwo_inline_accepts`, `roundedCriticalPeriodTwo_reference_accepts` | A true rounded certificate supplies the exact V0/V1 model's accepted period-two verdict throughout the rational parameter box |

The stored-reference bridge computes a box for
`next - quadratic cRef current` from rational-coordinate stored values.
Its squared-norm upper bound is compared to a nonnegative rational residual
allowance squared. Rounded singleton boxes similarly certify stored-value
radius allowances. The initial seed discrepancy and parameter gap remain
explicit hypotheses. These certificates do not assume that a stored prefix
is an exact reference orbit.

`rationalStoredError` evaluates

\[
E_0=\varepsilon,\qquad
E_{k+1}=2A_kE_k+E_k^2+(\Delta+\rho_k)
\]

over rationals. Its cast theorem identifies that computed value with
`storedOrbitError`, so the arithmetic used to evaluate this budget is exact
for the specified backend. The biased prefix from PR #19 has checked local
residual allowances on a grid with scale 4096.

## Acceptance and refusal

`certifyRoundedCriticalPeriodTwo` checks four conditions:

1. The attraction cutoff is positive.
2. The two-step rounded closure upper square is at most the acceptance threshold.
3. The one-step rounded closure lower square is at least the exclusion threshold.
4. The rounded two-step multiplier upper square is strictly below the squared attraction cutoff.

These are the period-two candidate and its only proper divisor. A true
result implies the exact-rational critical-frame verdict and accepted period
for every rational parameter in the original box. Payloads remain those of
the exact model. For arbitrary complex parameters, the rounded orbit and
norm-square enclosure theorems still hold.

A false result says that this box lacks the required certificate. It does
not prove escape, repulsion, or the absence of a periodic point. A consumer
must subdivide or perform individual verification. The checker does not
replace an unresolved result with an attracting classification.

## Concrete witnesses

The existing `periodTwoRationalTile` has real endpoints `-1 ± 2^-32` and
imaginary endpoints `±2^-32`. With grid spacing `2^-64`, Lean checks
`rounded_periodTwo_tile_certified`; the corresponding exact-rational verifier
verdict follows from `rounded_periodTwo_tile_inline_accepts`. Compiled
evaluation also returns `true`.

At grid spacing one, outward rounding loses the separation margins.
`rounded_periodTwo_tile_coarse_refuses` checks the checker returns `false`
for the same original tile; compiled evaluation agrees. The exponent 64
specifies a fixed grid spacing, not an IEEE binary64 format.

The prior `periodTwoRationalTile_contains_nonperiodic` witness remains
applicable: an accepted tolerance verdict on the critical seed is distinct
from exact critical periodicity. Its separate invariant-disk theorem proves
the primitive attracting return point and critical attraction.

## Review and validation

Validation passed using Lean v4.33.1 and the committed Mathlib revision
`0df444a360eaa60ab8c11dca51a86af692955474`:

- Full `lake build` of the theorem root and aggregate axiom target, including
  both integrated proof sets and all four new theorem modules.
- All existing exact axiom guards and 29 new guards in `OutwardGridAxioms`.
- `lake lint` on `IntMProof.Axioms` and Mathlib source-style checks; the
  absent optional style-exemption file is treated as empty.
- Namespace audit of 947 declarations, permitting only `propext`,
  `Classical.choice`, and `Quot.sound`.
- Compiled execution of the fine/coarse-grid checker and signed rounding
  examples: `true`, `false`, `-2/5`, and `-3/10`.
- Markdown formatting and whitespace checks.

The build retains all earlier guard/trap counterexamples and the new
integration adds their compatible stored-reference contracts. Batteries
lints the aggregate once; the root target keeps imported submodules
addressable for targeted builds.

The review checked signed rounding, the positive-scale requirement, inclusion
at every rounded step, the distinction between certificate refusal and a
negative mathematical verdict, and exact-model acceptance without a claim
about critical exact period. The finer/coarser witnesses exercise both
certificate outcomes. No additional postulates or admitted proofs are used.

## Remaining boundaries

J2 now has a checked rounded-rational period-two pilot. General periods need
the ordered set of divisor comparisons and bounded subdivision. The current
checker does not cover production candidate selection, nonfinite handling,
per-pixel angle or κ fields, or binary64/TypeScript refinement. Translating
the backend to fixed-word arithmetic needs explicit overflow and error bounds.

The complementary [bounded binary64 correctness pilot](PERIOD-TWO-VERIFIER-PILOT.md)
now audits a finite critical-seed evaluation and policy with exact BigInt
checks. It does not refine this arbitrary-size rational-grid backend to
binary64. Generalizing this checker to arbitrary candidates while preserving
refusal remains open and should follow a measured consumer. Production use
still needs implementation refinement, oracle agreement, and the existing
target-browser evidence gates. The supported zoom ceiling remains `6,000,000×`.

PR #22 was reconciled with merged PR #21 on 2026-10-09. Both certificate
families and their aggregate axiom imports are retained; the 947-declaration
audit above records the original outward-grid batch, before that reconciliation.
