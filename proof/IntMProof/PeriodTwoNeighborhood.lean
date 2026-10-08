import IntMProof.PeriodTwoTrap
import Mathlib.Tactic.GCongr
import Mathlib.Tactic.NormNum
import Mathlib.Tactic.Ring

/-!
# A certified period-two parameter neighborhood

Every parameter satisfying `‖c + 1‖ ≤ 1/1024` has a primitive attracting
period-two return point in the seed disk `‖z‖ ≤ 1/16`. The critical orbit
enters that disk after two steps. All constants are exact rationals.
-/

namespace IntMProof

open Function Metric Polynomial Set

/-- The two-step multiplier for an arbitrary parameter. -/
theorem periodTwo_multiplier_formula (c z : ℂ) :
    (derivative (seedPolynomial c 2)).eval z = 4 * z * (z ^ 2 + c) := by
  rw [seedPolynomial_derivative_succ c z 1,
    seedPolynomial_derivative_succ c z 0,
    seedPolynomial_derivative_zero]
  simp only [orbit_zero, orbit_succ, quadratic]
  ring

/-- The one-step multiplier for an arbitrary parameter. -/
theorem periodOne_multiplier_formula (c z : ℂ) :
    (derivative (seedPolynomial c 1)).eval z = 2 * z := by
  rw [seedPolynomial_derivative_succ c z 0,
    seedPolynomial_derivative_zero]
  simp

/-- Parameters in the selected neighborhood have a convenient upper norm. -/
theorem norm_parameter_le_of_near_minusOne
    (c : ℂ) (hc : ‖c + 1‖ ≤ 1 / 1024) : ‖c‖ ≤ 1025 / 1024 := by
  have htriangle := norm_sub_le (c + 1) (1 : ℂ)
  simp only [add_sub_cancel_right, norm_one] at htriangle
  linarith

/-- The same neighborhood has a lower parameter norm, needed to separate
the one-step disk image. -/
theorem norm_parameter_ge_of_near_minusOne
    (c : ℂ) (hc : ‖c + 1‖ ≤ 1 / 1024) : 1023 / 1024 ≤ ‖c‖ := by
  have htriangle := norm_sub_le (c + 1) c
  simp only [add_sub_cancel_left, norm_one] at htriangle
  linarith

/-- The return multiplier stays below `1/2` on the whole seed disk. -/
theorem periodTwo_near_minusOne_multiplier_le_half
    (c z : ℂ) (hc : ‖c + 1‖ ≤ 1 / 1024)
    (hz : z ∈ closedBall (0 : ℂ) (1 / 16 : ℝ)) :
    ‖(derivative (seedPolynomial c 2)).eval z‖ ≤ 1 / 2 := by
  have hzr : ‖z‖ ≤ 1 / 16 := by simpa only [mem_closedBall, dist_zero_right] using hz
  have hcsize := norm_parameter_le_of_near_minusOne c hc
  have hfactor : ‖z ^ 2 + c‖ ≤ ‖z‖ ^ 2 + ‖c‖ := by
    calc
      ‖z ^ 2 + c‖ ≤ ‖z ^ 2‖ + ‖c‖ := norm_add_le _ _
      _ = ‖z‖ ^ 2 + ‖c‖ := by rw [norm_pow]
  rw [periodTwo_multiplier_formula]
  calc
    ‖4 * z * (z ^ 2 + c)‖ = 4 * ‖z‖ * ‖z ^ 2 + c‖ := by
      rw [norm_mul, norm_mul, Complex.norm_ofNat]
    _ ≤ 4 * ‖z‖ * (‖z‖ ^ 2 + ‖c‖) := by gcongr
    _ ≤ 4 * (1 / 16 : ℝ) * ((1 / 16 : ℝ) ^ 2 + (1025 / 1024 : ℝ)) := by
      gcongr
    _ ≤ 1 / 2 := by norm_num

/-- The first critical return to the seed disk is explicitly bounded. -/
theorem periodTwo_near_minusOne_critical_entry
    (c : ℂ) (hc : ‖c + 1‖ ≤ 1 / 1024) :
    orbit c 2 0 ∈ closedBall (0 : ℂ) (1 / 16 : ℝ) := by
  have hcsize := norm_parameter_le_of_near_minusOne c hc
  have hform : orbit c 2 0 = c * (c + 1) := by
    simp only [orbit_succ, orbit_zero, quadratic]
    ring
  rw [mem_closedBall, dist_zero_right, hform, norm_mul]
  calc
    ‖c‖ * ‖c + 1‖ ≤ (1025 / 1024 : ℝ) * (1 / 1024 : ℝ) := by gcongr
    _ ≤ 1 / 16 := by norm_num

/-- A whole rational parameter disk around `-1` satisfies the primitive
L1 trap with critical entry at time `2`. -/
theorem periodTwo_near_minusOne_primitive_trap
    (c : ℂ) (hc : ‖c + 1‖ ≤ 1 / 1024) :
    ∃! ζ : ℂ, ζ ∈ closedBall (0 : ℂ) (1 / 16 : ℝ) ∧
      minimalPeriod (quadratic c) ζ = 2 ∧
      ‖(derivative (seedPolynomial c 2)).eval ζ‖ ≤ 1 / 2 ∧
      ∀ m : ℕ, orbit c (2 + m * 2) 0 ∈
          closedBall (0 : ℂ) (1 / 16 : ℝ) ∧
        dist (orbit c (2 + m * 2) 0) ζ ≤
          (1 / 2 : ℝ) ^ m * dist (orbit c 2 0) ζ := by
  have hcsize := norm_parameter_le_of_near_minusOne c hc
  have hclower := norm_parameter_ge_of_near_minusOne c hc
  apply existsUnique_primitive_critical_return_of_entry (L := fun _ => (1 / 8 : ℝ))
    c 2 2 0 (1 / 16) (1 / 2) (by norm_num) (by norm_num)
    (by norm_num) (by norm_num)
    (fun z hz => periodTwo_near_minusOne_multiplier_le_half c z hc hz)
  · have hform : orbit c 2 0 = c * (c + 1) := by
      simp only [orbit_succ, orbit_zero, quadratic]
      ring
    simp only [hform, sub_zero, norm_mul]
    nlinarith [mul_le_mul hcsize hc (norm_nonneg (c + 1))
      (by norm_num : (0 : ℝ) ≤ 1025 / 1024)]
  · exact periodTwo_near_minusOne_critical_entry c hc
  · intro d hd hdvd hdlt
    norm_num
  · intro d hd hdvd hdlt z hz
    have hd1 : d = 1 := by omega
    subst d
    have hzr : ‖z‖ ≤ 1 / 16 := by
      simpa only [mem_closedBall, dist_zero_right] using hz
    rw [periodOne_multiplier_formula, norm_mul, Complex.norm_ofNat]
    nlinarith
  · intro d hd hdvd hdlt
    have hd1 : d = 1 := by omega
    subst d
    have hform : orbit c 1 0 = c := by
      simp [orbit_succ, orbit_zero, quadratic]
    rw [hform]
    norm_num at hclower ⊢
    linarith

end IntMProof
