import IntMProof.PrimitiveEntry
import Mathlib.Tactic.GCongr
import Mathlib.Tactic.IntervalCases
import Mathlib.Tactic.NormNum
import Mathlib.Tactic.Ring

/-!
# A concrete primitive critical trap at `c = -1`

The critical point is a period-two point at this parameter. A positive
radius `1/16` disk has return multiplier at most `1/2`; its center is fixed
by the two-step return, and its one-step image is separated from the disk.
These exact rational bounds instantiate the generic L1 certificate.
-/

namespace IntMProof

open Function Metric Polynomial Set

/-- The two-step formal multiplier at `c = -1` is `4z(z²-1)`. -/
theorem periodTwo_minusOne_multiplier (z : ℂ) :
    (derivative (seedPolynomial (-1 : ℂ) 2)).eval z =
      4 * z * (z ^ 2 - 1) := by
  rw [seedPolynomial_derivative_succ (-1) z 1,
    seedPolynomial_derivative_succ (-1) z 0,
    seedPolynomial_derivative_zero]
  simp only [orbit_zero, orbit_succ, quadratic]
  ring

/-- The one-step multiplier is `2z`. -/
theorem periodOne_minusOne_multiplier (z : ℂ) :
    (derivative (seedPolynomial (-1 : ℂ) 1)).eval z = 2 * z := by
  rw [seedPolynomial_derivative_succ (-1) z 0,
    seedPolynomial_derivative_zero]
  simp

/-- A rational uniform multiplier bound on the positive-radius return disk. -/
theorem periodTwo_minusOne_multiplier_le_half
    (z : ℂ) (hz : z ∈ closedBall (0 : ℂ) (1 / 16 : ℝ)) :
    ‖(derivative (seedPolynomial (-1 : ℂ) 2)).eval z‖ ≤ 1 / 2 := by
  have hzr : ‖z‖ ≤ 1 / 16 := by simpa only [mem_closedBall, dist_zero_right] using hz
  have hfactor : ‖z ^ 2 - 1‖ ≤ ‖z‖ ^ 2 + 1 := by
    calc
      ‖z ^ 2 - 1‖ ≤ ‖z ^ 2‖ + ‖(1 : ℂ)‖ := norm_sub_le _ _
      _ = ‖z‖ ^ 2 + 1 := by rw [norm_pow, norm_one]
  rw [periodTwo_minusOne_multiplier]
  calc
    ‖4 * z * (z ^ 2 - 1)‖ = 4 * ‖z‖ * ‖z ^ 2 - 1‖ := by
      rw [norm_mul, norm_mul, Complex.norm_ofNat]
    _ ≤ 4 * ‖z‖ * (‖z‖ ^ 2 + 1) := by gcongr
    _ ≤ 4 * (1 / 16 : ℝ) * ((1 / 16 : ℝ) ^ 2 + 1) := by gcongr
    _ ≤ 1 / 2 := by norm_num

/-- The only positive proper divisor of `2` is `1`, whose derivative is
bounded by `1/8` on the disk. -/
theorem periodOne_minusOne_multiplier_le_eighth
    (z : ℂ) (hz : z ∈ closedBall (0 : ℂ) (1 / 16 : ℝ)) :
    ‖(derivative (seedPolynomial (-1 : ℂ) 1)).eval z‖ ≤ 1 / 8 := by
  have hzr : ‖z‖ ≤ 1 / 16 := by simpa only [mem_closedBall, dist_zero_right] using hz
  rw [periodOne_minusOne_multiplier, norm_mul, Complex.norm_ofNat]
  nlinarith

/-- The generic primitive L1 certificate is fully instantiated at `c=-1`,
`k=0`, `n=2`, `r=1/16`, and `q=1/2`. -/
theorem periodTwo_minusOne_primitive_trap :
    ∃! ζ : ℂ, ζ ∈ closedBall (0 : ℂ) (1 / 16 : ℝ) ∧
      minimalPeriod (quadratic (-1 : ℂ)) ζ = 2 ∧
      ‖(derivative (seedPolynomial (-1 : ℂ) 2)).eval ζ‖ ≤ 1 / 2 ∧
      ∀ m : ℕ, orbit (-1 : ℂ) (0 + m * 2) 0 ∈
          closedBall (0 : ℂ) (1 / 16 : ℝ) ∧
        dist (orbit (-1 : ℂ) (0 + m * 2) 0) ζ ≤
          (1 / 2 : ℝ) ^ m * dist (orbit (-1 : ℂ) 0 0) ζ := by
  apply existsUnique_primitive_critical_return_of_entry (L := fun _ => (1 / 8 : ℝ))
    (-1) 0 2 0 (1 / 16) (1 / 2) (by norm_num) (by norm_num)
    (by norm_num) (by norm_num)
    (fun z hz => periodTwo_minusOne_multiplier_le_half z hz)
  · norm_num [orbit_succ, orbit_zero, quadratic]
  · simp [orbit_zero]
  · intro d hd hdvd hdlt
    norm_num
  · intro d hd hdvd hdlt z hz
    have hd1 : d = 1 := by omega
    subst d
    exact periodOne_minusOne_multiplier_le_eighth z hz
  · intro d hd hdvd hdlt
    have hd1 : d = 1 := by omega
    subst d
    norm_num [orbit_succ, orbit_zero, quadratic]

end IntMProof
