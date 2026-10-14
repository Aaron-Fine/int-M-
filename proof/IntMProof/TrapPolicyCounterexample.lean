import IntMProof.PeriodTwoNeighborhood
import Mathlib.Tactic.NormNum

/-!
# The frozen factor-four radius is not a return-disk certificate

The PoC trap kernel uses `4 * (1 - ‖λ‖) * max 1 (max |re z| |im z|)` as an
attempt radius.
Even at an attracting fixed point with multiplier `4/5`, this radius need
not make the disk invariant. It can guide a proposal, but L0 needs a
separate uniform derivative and center-image certificate.
-/

namespace IntMProof

open Metric

/-- At the real fixed point `z = 2/5` for `c = 6/25`, the frozen radius is
`4/5`. The point `6/5` lies in that disk, yet one quadratic step leaves it.
This disproves a universal trapping-disk interpretation of `diskFactor = 4`.
The PoC's analytic period-one fast path may preempt this particular input;
the theorem concerns the mathematical radius rule. -/
theorem factorFourRadius_not_invariant :
    let c : ℂ := 6 / 25
    let center : ℂ := 2 / 5
    let lam : ℂ := 4 / 5
    let radius : ℝ :=
      4 * (1 - ‖lam‖) * max 1 (max |center.re| |center.im|)
    orbit c 1 center = center ∧
      ‖(Polynomial.derivative (seedPolynomial c 1)).eval center‖ = 4 / 5 ∧
      (6 / 5 : ℂ) ∈ closedBall center radius ∧
      quadratic c (6 / 5 : ℂ) ∉ closedBall center radius := by
  norm_num [orbit_succ, orbit_zero, quadratic, periodOne_multiplier_formula,
    mem_closedBall, dist_eq_norm]

end IntMProof
