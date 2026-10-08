import IntMProof.OutwardGrid

/-!
# Finite orbits with outward grid-rounded boxes

Input boxes and every completed step are rounded outward on a specified
rational grid. Intermediate box algebra and squared-norm comparisons use
exact rational arithmetic. This specifies an executable arbitrary-integer
backend, not the operation order of the TypeScript floating-point kernel.
-/

namespace IntMProof

/-- Orbit boxes with rounded inputs and rounded endpoints after each step. -/
def roundedBoxOrbit (scale : ℕ) (hscale : 0 < scale) (C Z : RationalBox) :
    ℕ → RationalBox
  | 0 => roundBoxOutward scale hscale Z
  | n + 1 => roundBoxOutward scale hscale
      (rationalBoxStep (roundBoxOutward scale hscale C) (roundedBoxOrbit scale hscale C Z n))

/-- Outward endpoint rounding at each step encloses every exact complex orbit
from the original parameter and seed boxes. -/
theorem roundedBoxOrbit_sound (scale : ℕ) (hscale : 0 < scale)
    (C Z : RationalBox) (c z : ℂ) (hc : C.contains c) (hz : Z.contains z) (n : ℕ) :
    (roundedBoxOrbit scale hscale C Z n).contains (orbit c n z) := by
  induction n with
  | zero => exact roundBoxOutward_sound scale hscale Z z hz
  | succ n ih =>
    rw [roundedBoxOrbit, orbit_succ]
    exact roundBoxOutward_sound scale hscale _ _
      (rationalBoxStep_sound _ _ c (orbit c n z)
        (roundBoxOutward_sound scale hscale C c hc) ih)

/-- Multiplier boxes with outward rounding after each complete derivative step. -/
def roundedBoxMultiplier (scale : ℕ) (hscale : 0 < scale) (C Z : RationalBox) :
    ℕ → RationalBox
  | 0 => roundBoxOutward scale hscale (rationalPointBox (1, 0))
  | n + 1 => roundBoxOutward scale hscale
      (rationalBoxMul (rationalBoxDouble (roundedBoxOrbit scale hscale C Z n))
        (roundedBoxMultiplier scale hscale C Z n))

/-- Rounded derivative boxes enclose the formal complex seed multiplier. -/
theorem roundedBoxMultiplier_sound (scale : ℕ) (hscale : 0 < scale)
    (C Z : RationalBox) (c z : ℂ) (hc : C.contains c) (hz : Z.contains z) (n : ℕ) :
    (roundedBoxMultiplier scale hscale C Z n).contains
      ((Polynomial.derivative (seedPolynomial c n)).eval z) := by
  induction n with
  | zero =>
    rw [seedPolynomial_derivative_zero, roundedBoxMultiplier]
    apply roundBoxOutward_sound
    norm_num [rationalPointBox, RationalBox.contains, RationalInterval.contains]
  | succ n ih =>
    rw [seedPolynomial_derivative_succ, roundedBoxMultiplier]
    exact roundBoxOutward_sound scale hscale _ _
      (rationalBoxMul_sound _ _ _ _ (rationalBoxDouble_sound _ _
        (roundedBoxOrbit_sound scale hscale C Z c z hc hz n)) ih)

/-- The return residual box is rounded outward after subtracting the seed box. -/
def roundedBoxClosure (scale : ℕ) (hscale : 0 < scale) (C Z : RationalBox)
    (n : ℕ) : RationalBox :=
  roundBoxOutward scale hscale (rationalBoxSub (roundedBoxOrbit scale hscale C Z n) Z)

/-- The rounded return residual box contains every exact closure residual. -/
theorem roundedBoxClosure_sound (scale : ℕ) (hscale : 0 < scale)
    (C Z : RationalBox) (c z : ℂ) (hc : C.contains c) (hz : Z.contains z) (n : ℕ) :
    (roundedBoxClosure scale hscale C Z n).contains (orbit c n z - z) := by
  exact roundBoxOutward_sound scale hscale _ _
    (rationalBoxSub_sound _ _ _ _ (roundedBoxOrbit_sound scale hscale C Z c z hc hz n) hz)

/-- Rounded closure boxes give exact rational lower and upper squared norms. -/
theorem roundedBoxClosure_normSq_interval (scale : ℕ) (hscale : 0 < scale)
    (C Z : RationalBox) (c z : ℂ) (hc : C.contains c) (hz : Z.contains z) (n : ℕ) :
    ((roundedBoxClosure scale hscale C Z n).normSqLower : ℝ) ≤
        Complex.normSq (orbit c n z - z) ∧
      Complex.normSq (orbit c n z - z) ≤
        ((roundedBoxClosure scale hscale C Z n).normSqUpper : ℝ) := by
  have h := roundedBoxClosure_sound scale hscale C Z c z hc hz n
  exact ⟨RationalBox.normSq_lower_le _ _ h, RationalBox.normSq_le_upper _ _ h⟩

/-- Rounded multiplier boxes give exact rational squared-norm bounds. -/
theorem roundedBoxMultiplier_normSq_interval (scale : ℕ) (hscale : 0 < scale)
    (C Z : RationalBox) (c z : ℂ) (hc : C.contains c) (hz : Z.contains z) (n : ℕ) :
    ((roundedBoxMultiplier scale hscale C Z n).normSqLower : ℝ) ≤
        Complex.normSq ((Polynomial.derivative (seedPolynomial c n)).eval z) ∧
      Complex.normSq ((Polynomial.derivative (seedPolynomial c n)).eval z) ≤
        ((roundedBoxMultiplier scale hscale C Z n).normSqUpper : ℝ) := by
  have h := roundedBoxMultiplier_sound scale hscale C Z c z hc hz n
  exact ⟨RationalBox.normSq_lower_le _ _ h, RationalBox.normSq_le_upper _ _ h⟩

/-- A strict rounded-box upper margin certifies attraction for every seed and
parameter in the original boxes. -/
theorem roundedBoxMultiplier_attract_of_upper (scale : ℕ) (hscale : 0 < scale)
    (C Z : RationalBox) (c z : ℂ) (hc : C.contains c) (hz : Z.contains z)
    (n : ℕ) (q : ℝ) (hq : 0 < q)
    (hupper : ((roundedBoxMultiplier scale hscale C Z n).normSqUpper : ℝ) < q ^ 2) :
    ‖(Polynomial.derivative (seedPolynomial c n)).eval z‖ < q := by
  have h := (roundedBoxMultiplier_normSq_interval scale hscale C Z c z hc hz n).2
  rw [Complex.normSq_eq_norm_sq] at h
  nlinarith [norm_nonneg ((Polynomial.derivative (seedPolynomial c n)).eval z)]

end IntMProof
