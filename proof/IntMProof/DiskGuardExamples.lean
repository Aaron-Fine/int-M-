import IntMProof.DiskGuard
import IntMProof.DiskCertificateExamples

/-!
# Exact continuation bounds on the period-two example

The existing certified region has `Q = 129/512`. Its parameter partial is
bounded by `T = 193/64`, giving denominator margin `383/512` and finite root
movement constant `1544/383`. All witnesses use exact real arithmetic.
-/

namespace IntMProof

open Metric Polynomial

/-- The two-step parameter-derivative enclosure is an exact rational. -/
theorem periodTwo_disk_parameter_bound :
    parameterDerivativeBound (diskOrbitRadius (-1) 0 (1 / 16) (1 / 256)) 2 =
      193 / 64 := by
  norm_num [parameterDerivativeBound, diskOrbitRadius, diskOrbitError,
    errorBudget, orbit_succ, quadratic]

/-- A positive explicit denominator margin holds at every seed and parameter
in the example disks, whether or not the seed is periodic. -/
theorem periodTwo_disk_denominator_lower (c z : ℂ)
    (hc : c ∈ closedBall (-1 : ℂ) (1 / 256)) (hz : z ∈ closedBall 0 (1 / 16)) :
    383 / 512 ≤ ‖1 - (derivative (seedPolynomial c 2)).eval z‖ := by
  have hden := disk_branch_denominator_lower (-1) c 0 z (1 / 16) (1 / 256) 2
    (by simpa only [mem_closedBall, dist_eq_norm] using hz)
    (by simpa only [mem_closedBall, dist_eq_norm] using hc)
  rw [periodTwo_disk_multiplier_bound] at hden
  norm_num at hden ⊢
  exact hden

/-- The example's branch-slope expression is bounded throughout the disks. -/
theorem periodTwo_disk_slope_bound (c z : ℂ)
    (hc : c ∈ closedBall (-1 : ℂ) (1 / 256)) (hz : z ∈ closedBall 0 (1 / 16)) :
    ‖(derivative (parameterPolynomial (C z) 2)).eval c /
      (1 - (derivative (seedPolynomial c 2)).eval z)‖ ≤ 1544 / 383 := by
  have hbound := disk_branchSlope_norm_le (-1) c 0 z (1 / 16) (1 / 256) 2
    (by simpa only [mem_closedBall, dist_eq_norm] using hz)
    (by simpa only [mem_closedBall, dist_eq_norm] using hc)
    (by rw [periodTwo_disk_multiplier_bound]; norm_num)
  rw [periodTwo_disk_parameter_bound, periodTwo_disk_multiplier_bound] at hbound
  norm_num at hbound ⊢
  exact hbound

/-- The linear proposal has an explicit displacement bound for every step.
This inequality does not assert that the proposal is an exact return point. -/
theorem periodTwo_disk_predictor_bound (c z δ : ℂ)
    (hc : c ∈ closedBall (-1 : ℂ) (1 / 256)) (hz : z ∈ closedBall 0 (1 / 16)) :
    ‖((derivative (parameterPolynomial (C z) 2)).eval c /
      (1 - (derivative (seedPolynomial c 2)).eval z)) * δ‖ ≤ (1544 / 383) * ‖δ‖ := by
  rw [Complex.norm_mul]
  exact mul_le_mul_of_nonneg_right (periodTwo_disk_slope_bound c z hc hz) (norm_nonneg δ)

/-- Any two certified return points in the example region obey a finite
parameter movement bound. Existence at every parameter is supplied by
`uniform_periodTwo_critical_disk_certificate`. -/
theorem periodTwo_periodicPoint_dist_bound (c₀ c₁ z₁ z₂ : ℂ)
    (hc₀ : c₀ ∈ closedBall (-1 : ℂ) (1 / 256))
    (hc₁ : c₁ ∈ closedBall (-1 : ℂ) (1 / 256))
    (hz₁ : z₁ ∈ closedBall 0 (1 / 16)) (hz₂ : z₂ ∈ closedBall 0 (1 / 16))
    (hclose₁ : orbit c₀ 2 z₁ = z₁) (hclose₂ : orbit c₁ 2 z₂ = z₂) :
    dist z₁ z₂ ≤ (1544 / 383) * dist c₀ c₁ := by
  have hbound := periodicPoint_dist_le_disk_bound (-1) c₀ c₁ 0 z₁ z₂
    (1 / 16) (1 / 256) 2 (by norm_num) (by norm_num) hc₀ hc₁ hz₁ hz₂
    (by rw [periodTwo_disk_multiplier_bound]; norm_num) hclose₁ hclose₂
  rw [periodTwo_disk_parameter_bound, periodTwo_disk_multiplier_bound] at hbound
  norm_num at hbound ⊢
  exact hbound

end IntMProof
