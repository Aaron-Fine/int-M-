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

## Remaining obligations and next batch

The budgets are exact real inequalities supplied by the caller. No theorem
here derives them for binary64, GPU arithmetic, overflow, nonfinite input,
signed zero, or a specific sequence of machine operations. Evaluating the
budget itself also needs outward rounding. L0's uniform multiplier bound and
trap constants remain hypotheses. The TypeScript verifier still needs its
finite-prefix refinement and arithmetic model.

The next useful batch is to make these inputs constructive:

1. Enclose intermediate reference iterates and multipliers over disks and
   parameter regions, supplying J0 and L0 with usable radius bounds.
2. Prove proper-divisor exclusions throughout a return disk so a certified
   return fixed point has primitive period.
3. Specify one arithmetic backend and derive local residual bounds for its
   actual evaluation order; then connect error-aware acceptance and repair to
   V0/V1. A heuristic glitch threshold alone is insufficient.

Update the DAG and this document when a checked obligation changes. Mark
conditional contracts separately from arithmetic refinements and consumers.

The follow-on [disk-certificate batch](LEAN-DISK-CERTIFICATES.md) implements
reference-centered orbit/multiplier enclosures and proper-divisor separations.
Its validation status is recorded separately in the DAG; the arithmetic backend
and outward evaluation obligations above remain open.
