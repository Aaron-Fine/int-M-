# Lean batch: rebasing and conditional error budgets

Selected on 2026-10-07 from the [proof DAG](LEAN-PROOF-DAG.md), based on
`feature/phase-2-performance` at `4f51c65`. That branch already contains the
basic rebase identities, first-order predictor guard, and contraction after
critical entry. This batch extends those results rather than rebuilding them.

Validation completed with Lean v4.33.1 and the committed Mathlib revision
`0df444a360eaa60ab8c11dca51a86af692955474`: full build, declaration lint,
Mathlib source-style check, and all axiom guards pass. This batch adds 22
checked theorems and 22 exact axiom-set guards. A namespace audit checked all
337 `IntMProof` declarations and found only `propext`, `Classical.choice`, and
`Quot.sound`; no additional postulates or admitted proofs were introduced.
The source-style checker reports the optional missing `nolints` file as a
warning and treats it as empty.

## Why this batch

P2 and P3 connect exact perturbation algebra to the errors an eventual
perturbation renderer must account for. A varying reference radius also makes
G1 useful for uniform parameter-region enclosures under J0. Finally, an error
margin around an approximate critical iterate supplies an explicit sufficient
condition for L1's disk entry. These are prerequisites for numerical
certification; no renderer feature or performance default changes here.

## Contracts and declarations

| Contract                | Main declarations                                                                                               | Inputs and conclusion                                                                                                                                                                               |
| ----------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reference changes       | `rebaseDelta_reconstruct`, `rebaseDelta_reverse`, `rebaseDelta_comp`, `rebase_parameter`, `rebase_perturbation` | Exact reference values and deltas reconstruct the same state; reversal and composition agree. Parameter offsets change with the reference parameter.                                                |
| Indexed continuation    | `quadratic_reconstruct`, `rebase_resume_orbit`, `inexactOrbit_error_le_budget_from`                             | Reference and delta updates reconstruct one target step. After a rebase at `start`, a segment of length `n` represents time `start + n`.                                                            |
| Error envelope          | `errorBudget`, `errorBudget_nonneg`, `errorBudget_mono`, `errorBudget_const`, `inexactOrbit_error_le_budget`    | A finite prefix of reference radii and local residual bounds gives an upper bound on accumulated error. Larger budgets give larger envelopes; constant budgets recover `perturbationBound`.         |
| Error decomposition     | `reconstruction_residual`, `reconstruction_residual_norm_le`, `reconstruction_error_le_budget`                  | Reference-step, delta-step, and parameter-offset residuals add exactly; their norm budgets add by the triangle inequality.                                                                          |
| Rounded rebase          | `rebase_error_norm_le`                                                                                          | Rebase evaluation error increases the prior state-error bound by at most its supplied norm budget.                                                                                                  |
| Uniform orbit enclosure | `orbit_norm_sub_le_budget`                                                                                      | Every target parameter and seed inside the stated norm bounds shares the same envelope around the reference orbit.                                                                                  |
| Critical entry          | `critical_mem_closedBall_of_error_budget`, `existsUnique_critical_return_of_error_budget`                       | An approximate iterate whose disk margin includes the accumulated error proves actual entry. Given L0's contraction inputs, L1 then gives the unique return fixed point and subsequent contraction. |

The implementation lives in [Rebase.lean](../../proof/IntMProof/Rebase.lean),
[ErrorBudget.lean](../../proof/IntMProof/ErrorBudget.lean), and
[CriticalEntryBudget.lean](../../proof/IntMProof/CriticalEntryBudget.lean).
Mathlib's complex norm, ordered-ring inequalities, iterate algebra, and the
existing return-disk API supply the mathematical infrastructure.

## Error-budget interface

For a target orbit `zₖ` and an approximate sequence `aₖ`, the local residual is
`ηₖ = aₖ₊₁ − (aₖ² + c)`. Supply an initial error `ε`, radii `Mₖ` with
`‖zₖ‖ ≤ Mₖ`, and forcing budgets `Fₖ` with `‖ηₖ‖ ≤ Fₖ`. Then

\[
b_0=\varepsilon,\qquad
b_{k+1}=2M_k b_k+b_k^2+F_k,\qquad
\|a_k-z_k\|\le b_k.
\]

The hypotheses cover only `k < n`; no conditions are required on later
sequence values. The theorem applies separately at every intermediate index
using the corresponding shorter prefix.

For reconstructed state `aₖ = Rₖ + dₖ`, supply bounds on

- `Rₖ₊₁ − (Rₖ² + cRef)`;
- `dₖ₊₁ − (2 Rₖ dₖ + dₖ² + offset)`;
- `offset − (c − cRef)`.

Their sum is a valid forcing budget. The second residual includes whatever
errors the actual delta evaluation creates, including multiplication by the
stored reference. Do not omit a rounding contribution because it is small.

For an exact parameter region, the local residual is just `c₁ − c₀`.
`orbit_norm_sub_le_budget` therefore uses the reference orbit's radii and a
uniform parameter-offset bound. A rectangle may be enclosed in such a norm
ball; the theorem quantifies over every admissible parameter, not just its
corners. It does not compute the rectangle-to-ball enclosure.

A rounded rebase at `start` changes the initial budget to at most `ε + ρ`,
where `ρ` bounds the delta conversion error. Continue with the absolute index
`start + n` and the new segment's radii and residual budgets. The comparison
does not assume that rebasing automatically reduces the error.

## Critical-entry consumer

If `‖aₖ − center‖ + bₖ ≤ r`, the exact critical iterate is in the closed disk.
`existsUnique_critical_return_of_error_budget` combines that certificate with
the existing uniform multiplier bound `q < 1` and center-displacement bound.
It gives contraction of subsequent `n`-step returns to the unique disk fixed
point. It does not claim that the critical point itself is periodic, or that
the return fixed point has primitive period `n`.

## Parameter-series consumers (P4)

`secondOrderApproximation_error_le_budget` applies this comparison to the
exact second-order parameter approximation. Its local residual budget contains
only cubic and quartic offset terms; its target radii include the existing
parameter-shift enclosure. Reference radii and coefficient/evaluation machine
errors remain external obligations. See [the P4 batch notes](PARAMETER-JETS.md).

`parameterJetApproximation_error_le_tail_budget` separately supplies an
all-order exact-polynomial bound from caps on every coefficient in the finite
discarded tail and an offset radius. It does not derive those caps or avoid the
full polynomial's potentially exponential degree. This conditional tail bound
does not change the premises of P3's comparison theorem.

`parameterJetApproximation_error_le_recursive_budget` now uses that comparison
at any retained order. Recursive positive-order caps bound only retained-product
pairs whose total degree exceeds the truncation order; order zero separately
supplies the parameter-offset forcing. Reference radii are needed only before
the final iterate; target radii include the justified parameter-shift enclosure.
The order-two forcing is exactly `secondOrderForcing`. The concrete order-three,
parameter/seed-zero disk `‖δ‖≤1/16` has error at most `1/10000` at iterate four.
Outward cap evaluation and machine residuals remain external obligations.

`errorBudget_le_enclosure` now bounds the exact recurrence by a caller's
finite outward table when the initial and step inequalities hold.
`parameterJetApproximation_error_le_enclosure` composes this with retained cap
rows and a checked parameter-shift table. Target radii include that shift;
reference radii alone are not silently reused for the target orbit. A third-order
certificate at parameter minus one and critical seed zero checks dyadic tables
and gives truncation error at most `1/1000000` through iterate sixteen on
`‖δ‖≤1/256`. Table checking does not prove machine operations generate the
coefficients or evaluate the jet within a particular rounding budget.

`parameterJetInexactHorner_error_le_orbit` now adds three separate contributions:
local operation residuals propagated by the recursive Horner budget, inclusive
coefficient errors weighted by `Δ^k`, and the exact truncation cap. The chosen
sequence multiplies the decoded offset by the accumulator, then adds the
coefficient to the product. Order zero performs no operations; its coefficient
error still counts. The copied leading coefficient is also included. The
operation model requires separate multiplication and addition error caps at
the actual operands, without deriving backend primitive or decoding accuracy.

`parameterJetInexactHorner_error_le_orbit_with_offset` additionally charges a
target/decoded offset discrepancy `χ` through `errorBudget 0 radius (fun _ => χ) n`.
Its comparison radii enclose the decoded-offset orbit through `j<n`. They are
separate from the reference radii used to certify truncation. On the minus-one
disk, order-three evaluation retains the `1/1000000` cap through iterate sixteen
if every decoded coefficient and local multiply/add error is at most `2⁻⁴⁰`.
That concrete result uses the same decoded offset for the target orbit; a
different offset needs the additional P3 budget.

## Remaining obligations and next batch

The budgets are exact real inequalities supplied by the caller. No theorem
here derives them for binary64, GPU arithmetic, overflow, nonfinite input, or
signed zero, or proves that a backend executes the mathematical Horner sequence.
Fused multiply-add and complex scalar-operation order need their own
correspondence and error bounds. Evaluating the budget itself also needs outward
rounding. L0's uniform multiplier bound and
trap constants remain hypotheses. The TypeScript verifier still needs its
finite-prefix refinement and arithmetic model.

The rational-box J0/J1 tile and primitive period-two trap already supply scoped
exact enclosures and divisor exclusions. The numerical frontier is to refine
those certificates to the [finite binary64 pilot](PHASE-3-PROOF-PROGRAM.md#first-executable-proof-slice):

1. Extend exact reference-radius and multiplier certificates to other stated
   disks when a consumer needs them; retain explicit finite-prefix domains.
2. Extend primitive-return certificates beyond the existing period-two
   neighborhood, including every relevant proper-divisor exclusion.
3. Specify one arithmetic backend and derive local residual bounds for its
   actual evaluation order; then connect error-aware acceptance and repair to
   V0/V1. A heuristic glitch threshold alone is insufficient.

Update the DAG and this document when a checked obligation changes. Mark
conditional contracts separately from arithmetic refinements and consumers.
