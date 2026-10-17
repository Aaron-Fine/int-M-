import IntMProof.FastPath
import IntMProof.PeriodThreeLocus

/-!
# Exact period-three multiplier identities (H3)

Exact identities behind the analytic period-three fast path
(`src/domain/analytic-period-three.ts`). The period-three dynatomic factor
`Φ₃(z, c)` is the third return minus the identity with the fixed-point factor
divided out. Every root of `Φ₃` has a three-step multiplier that is a root of
`λ² − 8(c + 2)λ + 64(c³ + 2c² + c + 1)`, whose roots are the closed form
`4(c + 2) ± 4 i c s` with `s² = 4c + 7`. A fixed point can be a root of `Φ₃`
only when its multiplier is a primitive cube root of unity, so its three-step
multiplier is `1`.

None of this certifies binary64 `Math.sqrt`, the rounding allowance, or the
attraction margin. That every root of the multiplier quadratic is realized by
a period-three cycle (the resultant identity) is not proved here.
-/

namespace IntMProof

open Function Polynomial Complex

/-- The period-three dynatomic factor `Φ₃(z, c)`. -/
def periodThreeDynatomic (c z : ℂ) : ℂ :=
  z ^ 6 + z ^ 5 + (3 * c + 1) * z ^ 4 + (2 * c + 1) * z ^ 3 +
    (3 * c ^ 2 + 3 * c + 1) * z ^ 2 + (c + 1) ^ 2 * z + periodThreeFactor c

/-- The period-three multiplier quadratic `M₃(λ, c)`. -/
def periodThreeMultiplierPolynomial (c l : ℂ) : ℂ :=
  l ^ 2 - 8 * (c + 2) * l + 64 * periodThreeFactor c

/-- Exact identity: the third return minus the identity factors through the
fixed-point equation and `Φ₃`. -/
theorem orbit_three_sub_self (c z : ℂ) :
    orbit c 3 z - z = (quadratic c z - z) * periodThreeDynatomic c z := by
  simp only [orbit_succ, orbit_zero, quadratic, periodThreeDynatomic, periodThreeFactor]
  ring

/-- A three-step return that is not a fixed point is a root of `Φ₃`. -/
theorem periodThreeDynatomic_eq_zero {c z : ℂ} (hclose : orbit c 3 z = z)
    (hfix : quadratic c z ≠ z) : periodThreeDynatomic c z = 0 := by
  have h := orbit_three_sub_self c z
  rw [hclose, sub_self] at h
  exact (mul_eq_zero.mp h.symm).resolve_left (sub_ne_zero.mpr hfix)

/-- Exact identity: the three-step seed derivative is `8 z₀ z₁ z₂`. -/
theorem period3_seedDerivative (c z : ℂ) :
    (derivative (seedPolynomial c 3)).eval z =
      8 * (z * orbit c 1 z * orbit c 2 z) := by
  rw [seedPolynomial_derivative_eval_prod]
  simp only [Finset.prod_range_succ, Finset.prod_range_zero, orbit_zero]
  ring

/-- Exact identity: at every root of `Φ₃` the three-step multiplier is a root
of `M₃`. -/
theorem period3_multiplier_root {c z : ℂ} (hΦ : periodThreeDynatomic c z = 0) :
    periodThreeMultiplierPolynomial c ((derivative (seedPolynomial c 3)).eval z) = 0 := by
  rw [period3_seedDerivative]
  unfold periodThreeDynatomic periodThreeFactor at hΦ
  simp only [orbit_succ, orbit_zero, quadratic, periodThreeMultiplierPolynomial,
    periodThreeFactor]
  linear_combination
    (64 * (c ^ 3 * z ^ 2 + 3 * c ^ 2 * z ^ 4 - c ^ 2 * z ^ 3 + 3 * c * z ^ 6 -
      2 * c * z ^ 5 + z ^ 8 - z ^ 7 - (c + 1) * z + 1)) * hΦ

/-- Exact identity: with `s² = 4c + 7` the roots of `M₃` are
`4(c + 2) ± 4 i c s`. -/
theorem period3_closedForm_roots (c s l : ℂ) (hs : s * s = 4 * c + 7) :
    periodThreeMultiplierPolynomial c l = 0 ↔
      l = 4 * (c + 2) + 4 * I * c * s ∨ l = 4 * (c + 2) - 4 * I * c * s := by
  have hfac : periodThreeMultiplierPolynomial c l =
      (l - (4 * (c + 2) + 4 * I * c * s)) * (l - (4 * (c + 2) - 4 * I * c * s)) := by
    unfold periodThreeMultiplierPolynomial periodThreeFactor
    linear_combination (-16 * c ^ 2) * hs + (16 * c ^ 2 * s ^ 2) * I_sq
  rw [hfac, mul_eq_zero, sub_eq_zero, sub_eq_zero]

/-- Superattracting identity: at a primitive period-three centre `0` is a
root of `M₃`. -/
theorem period3_multiplier_zero_of_center {c : ℂ} (hc : periodThreeFactor c = 0) :
    periodThreeMultiplierPolynomial c 0 = 0 := by
  simp [periodThreeMultiplierPolynomial, hc]

/-- The airplane cusp `c = −7/4`: `M₃` is `(λ − 1)²`. -/
theorem period3_cusp (l : ℂ) :
    periodThreeMultiplierPolynomial (-7 / 4) l = (l - 1) ^ 2 := by
  unfold periodThreeMultiplierPolynomial periodThreeFactor
  ring

/-- A fixed point that is also a root of `Φ₃` has a fixed-point multiplier
`2z` with `(2z)² + 2z + 1 = 0`. -/
theorem periodThreeDynatomic_fixedPoint {c z : ℂ} (hfix : quadratic c z = z)
    (hΦ : periodThreeDynatomic c z = 0) : (2 * z) ^ 2 + 2 * z + 1 = 0 := by
  unfold quadratic at hfix
  unfold periodThreeDynatomic periodThreeFactor at hΦ
  linear_combination hΦ -
    (c ^ 2 + c * (2 * z ^ 2 + 2 * z + 2) + z ^ 4 + 2 * z ^ 3 + 3 * z ^ 2 + 4 * z + 1) * hfix

/-- Such a point's three-step multiplier is exactly `1`, so any root of `M₃`
with modulus below `1` belongs to a cycle of exact period three. -/
theorem periodThreeDynatomic_fixedPoint_multiplier {c z : ℂ} (hfix : quadratic c z = z)
    (hΦ : periodThreeDynatomic c z = 0) :
    (derivative (seedPolynomial c 3)).eval z = 1 := by
  have h := periodThreeDynatomic_fixedPoint hfix hΦ
  have h1 : orbit c 1 z = z := by simpa [orbit] using hfix
  have h2 : orbit c 2 z = z := by
    rw [orbit_succ, h1]
    exact hfix
  rw [period3_seedDerivative, h1, h2]
  linear_combination (2 * z - 1) * h

end IntMProof
