import IntMProof.PrimitiveDisk
import Mathlib.Tactic.NormNum

/-!
# A nontrivial uniform disk certificate

At reference parameter `-1`, a seed disk of radius `1/16` around `0` and a
parameter disk of radius `1/256` satisfy the primitive period-two certificate.
These exact rational witnesses demonstrate that the general inequalities can
certify a positive-area parameter region; they do not verify binary64.
-/

namespace IntMProof

open Function Metric Polynomial

/-- The uniform two-step multiplier enclosure on the example region. -/
theorem periodTwo_disk_multiplier_bound :
    multiplierBound (diskOrbitRadius (-1) 0 (1 / 16) (1 / 256)) 2 = 129 / 512 := by
  norm_num [multiplierBound, Finset.prod_range_succ, diskOrbitRadius, diskOrbitError,
    errorBudget, orbit_succ, quadratic]

/-- The example's center-displacement enclosure is an exact rational. -/
theorem periodTwo_disk_center_return_bound :
    diskCenterReturnBound (-1) 0 (1 / 256) 2 = 769 / 65536 := by
  norm_num [diskCenterReturnBound, diskOrbitError, errorBudget, orbit_succ, quadratic]

/-- The only proper divisor of two is uniformly separated throughout the
example region. This is a strict inequality, not a residual tolerance. -/
theorem periodTwo_disk_divisor_separation (d : ℕ) (hd : 0 < d) (hlt : d < 2) :
    diskOrbitError (-1) 0 (1 / 16) (1 / 256) d + 1 / 16 < ‖orbit (-1 : ℂ) d 0 - 0‖ := by
  have hd1 : d = 1 := le_antisymm (Nat.le_of_lt_succ hlt) hd
  subst d
  norm_num [diskOrbitError, errorBudget, orbit_succ, quadratic]

/-- Every parameter in a positive-radius disk around `-1` has a unique
primitive period-two return point in the stated seed disk. The critical orbit
starts inside the invariant return disk and contracts at rate `(129/512)^m`.
The critical point itself need not be periodic at the perturbed parameter. -/
theorem uniform_periodTwo_critical_disk_certificate :
    ∀ c ∈ closedBall (-1 : ℂ) (1 / 256),
      ∃! ζ : ℂ, ζ ∈ closedBall 0 (1 / 16) ∧ orbit c 2 ζ = ζ ∧
        minimalPeriod (quadratic c) ζ = 2 ∧
        ‖(derivative (seedPolynomial c 2)).eval ζ‖ ≤ 129 / 512 ∧
        ∀ m : ℕ, orbit c (0 + m * 2) 0 ∈ closedBall 0 (1 / 16) ∧
          dist (orbit c (0 + m * 2) 0) ζ ≤ (129 / 512 : ℝ) ^ m * dist (orbit c 0 0) ζ := by
  intro c hc
  have hcert := existsUnique_primitive_critical_return_of_disk_enclosure (-1) c 0
    (1 / 16) (1 / 256) 0 2 (by norm_num) (by norm_num) (by norm_num)
    (by simpa only [mem_closedBall, dist_eq_norm] using hc)
    (by rw [periodTwo_disk_multiplier_bound]; norm_num)
    (by rw [periodTwo_disk_center_return_bound, periodTwo_disk_multiplier_bound]; norm_num)
    (fun d hd _ hlt => periodTwo_disk_divisor_separation d hd hlt)
    (by norm_num [diskOrbitError, errorBudget])
  rwa [periodTwo_disk_multiplier_bound] at hcert

end IntMProof
