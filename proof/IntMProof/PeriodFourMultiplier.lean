import IntMProof.FastPath
import IntMProof.PeriodThreeMultiplier

/-!
# Exact period-four multiplier identities (H4)

Exact identities behind the analytic period-four fast path
(`src/domain/analytic-period-four.ts`). The period-four dynatomic factor
`Φ₄(z, c)` is the fourth return minus the identity with the period-two
factor divided out. At every root of `Φ₄` the cycle product
`z · f(z) · f²(z) · f³(z)` is a root of the monic cubic
`μ³ + (c² − 3)μ² − (c⁴ + c³ − c² − 3)μ − G₄(c)`, and the four-step multiplier
is sixteen times that product. A root of `Φ₄` that has period one or two has
four-step multiplier exactly `1`, so a root whose four-step multiplier has
modulus below `1` has exact period four.

None of this certifies the binary64 cubic solve, its root-error certificate,
or the attraction margin. That every root of the cubic is realized by a
period-four cycle (the resultant identity) is not proved here.
-/

namespace IntMProof

open Function Polynomial Complex

/-- The period-four Gleason factor `G₄(c)`, whose six roots are the centres of
the period-four hyperbolic components. -/
def periodFourFactor (c : ℂ) : ℂ :=
  c ^ 6 + 3 * c ^ 5 + 3 * c ^ 4 + 3 * c ^ 3 + 2 * c ^ 2 + 1

/-- The period-four dynatomic factor `Φ₄(z, c)`. -/
def periodFourDynatomic (c z : ℂ) : ℂ :=
  z ^ 12 + 6 * c * z ^ 10 + z ^ 9 + (15 * c ^ 2 + 3 * c) * z ^ 8 + 4 * c * z ^ 7 +
    (20 * c ^ 3 + 12 * c ^ 2 + 1) * z ^ 6 + (6 * c ^ 2 + 2 * c) * z ^ 5 +
    (15 * c ^ 4 + 18 * c ^ 3 + 3 * c ^ 2 + 4 * c) * z ^ 4 + (4 * c ^ 3 + 4 * c ^ 2 + 1) * z ^ 3 +
    (6 * c ^ 5 + 12 * c ^ 4 + 6 * c ^ 3 + 5 * c ^ 2 + c) * z ^ 2 +
    (c ^ 4 + 2 * c ^ 3 + c ^ 2 + 2 * c) * z + periodFourFactor c

/-- The cycle-product cubic `M₄(μ, c)`; the four-step multiplier is `16 μ`. -/
def periodFourProductPolynomial (c m : ℂ) : ℂ :=
  m ^ 3 + (c ^ 2 - 3) * m ^ 2 - (c ^ 4 + c ^ 3 - c ^ 2 - 3) * m - periodFourFactor c

/-- Exact identity: the fourth return minus the identity factors through the
second return and `Φ₄`. -/
theorem orbit_four_sub_self (c z : ℂ) :
    orbit c 4 z - z = (orbit c 2 z - z) * periodFourDynatomic c z := by
  simp only [orbit_succ, orbit_zero, quadratic, periodFourDynatomic, periodFourFactor]
  ring

/-- A four-step return that is not a two-step return is a root of `Φ₄`. -/
theorem periodFourDynatomic_eq_zero {c z : ℂ} (hclose : orbit c 4 z = z)
    (htwo : orbit c 2 z ≠ z) : periodFourDynatomic c z = 0 := by
  have h := orbit_four_sub_self c z
  rw [hclose, sub_self] at h
  exact (mul_eq_zero.mp h.symm).resolve_left (sub_ne_zero.mpr htwo)

/-- Exact identity: the four-step seed derivative is `16 z₀ z₁ z₂ z₃`. -/
theorem period4_seedDerivative (c z : ℂ) :
    (derivative (seedPolynomial c 4)).eval z =
      16 * (z * orbit c 1 z * orbit c 2 z * orbit c 3 z) := by
  rw [seedPolynomial_derivative_eval_prod]
  simp only [Finset.prod_range_succ, Finset.prod_range_zero, orbit_zero]
  ring

/-- Exact identity: at every root of `Φ₄` the cycle product is a root of `M₄`. -/
theorem period4_product_root {c z : ℂ} (hΦ : periodFourDynatomic c z = 0) :
    periodFourProductPolynomial c (z * orbit c 1 z * orbit c 2 z * orbit c 3 z) = 0 := by
  unfold periodFourDynatomic periodFourFactor at hΦ
  simp only [orbit_succ, orbit_zero, quadratic, periodFourProductPolynomial, periodFourFactor]
  linear_combination
    (
      15 * c * z ^ 31 - 13 * c * z ^ 28 + z ^ 33 - z ^ 30 + z ^ 29 * (105 * c ^ 2 + 6 * c)
      + z ^ 27 * (455 * c ^ 3 + 78 * c ^ 2) + z ^ 26 * (-78 * c ^ 2 - 5 * c)
      + z ^ 25 * (1365 * c ^ 4 + 468 * c ^ 3 + 15 * c ^ 2 + c) + z ^ 24 * (-286 * c ^ 3
      - 55 * c ^ 2) + z ^ 23 * (3003 * c ^ 5 + 1716 * c ^ 4 + 165 * c ^ 3 + 11 * c ^ 2)
      + z ^ 22 * (-715 * c ^ 4 - 275 * c ^ 3 - 10 * c ^ 2 - c) + z ^ 21 * (5005 * c ^ 6
      + 4290 * c ^ 5 + 825 * c ^ 4 + 75 * c ^ 3 + 4 * c ^ 2) + z ^ 20 * (-1287 * c ^ 5
      - 825 * c ^ 4 - 90 * c ^ 3 - 9 * c ^ 2) + z ^ 19 * (6435 * c ^ 7 + 7722 * c ^ 6
      + 2475 * c ^ 5 + 345 * c ^ 4 + 36 * c ^ 3) + z ^ 18 * (-1716 * c ^ 6 - 1650 * c ^ 5
      - 360 * c ^ 4 - 46 * c ^ 3 - 2 * c ^ 2 - 2) + z ^ 17 * (6435 * c ^ 8 + 10296 * c ^ 7
      + 4950 * c ^ 6 + 1050 * c ^ 5 + 159 * c ^ 4 + 6 * c ^ 3 - c) + z ^ 16 * (-1716 * c ^ 7
      - 2310 * c ^ 6 - 840 * c ^ 5 - 154 * c ^ 4 - 13 * c ^ 3 - 17 * c) + z ^ 15 * (5005 * c ^ 9
      + 10296 * c ^ 8 + 6930 * c ^ 7 + 2142 * c ^ 6 + 441 * c ^ 5 + 42 * c ^ 4 - 8 * c ^ 2 + 2)
      + z ^ 14 * (-1287 * c ^ 8 - 2310 * c ^ 7 - 1260 * c ^ 6 - 336 * c ^ 5 - 40 * c ^ 4
      - 63 * c ^ 2 - 6 * c) + z ^ 13 * (3003 * c ^ 10 + 7722 * c ^ 9 + 6930 * c ^ 8 + 2982 * c ^ 7
      + 819 * c ^ 6 + 132 * c ^ 5 + 4 * c ^ 4 - 27 * c ^ 3 - 2 * c ^ 2 + 13 * c)
      + z ^ 12 * (-715 * c ^ 9 - 1650 * c ^ 8 - 1260 * c ^ 7 - 476 * c ^ 6 - 74 * c ^ 5 + 3 * c ^ 4
      - 133 * c ^ 3 - 39 * c ^ 2) + z ^ 11 * (1365 * c ^ 11 + 4290 * c ^ 10 + 4950 * c ^ 9
      + 2850 * c ^ 8 + 1029 * c ^ 7 + 240 * c ^ 6 + 20 * c ^ 5 - 50 * c ^ 4 - 12 * c ^ 3
      + 35 * c ^ 2 + 5 * c) + z ^ 10 * (-286 * c ^ 10 - 825 * c ^ 9 - 840 * c ^ 8 - 434 * c ^ 7
      - 85 * c ^ 6 + 14 * c ^ 5 - 173 * c ^ 4 - 105 * c ^ 3 - 7 * c ^ 2 - c)
      + z ^ 9 * (455 * c ^ 12 + 1716 * c ^ 11 + 2475 * c ^ 10 + 1845 * c ^ 9 + 861 * c ^ 8
      + 270 * c ^ 7 + 41 * c ^ 6 - 54 * c ^ 5 - 28 * c ^ 4 + 49 * c ^ 3 + 22 * c ^ 2)
      + z ^ 8 * (-78 * c ^ 11 - 275 * c ^ 10 - 360 * c ^ 9 - 246 * c ^ 8 - 57 * c ^ 7 + 27 * c ^ 6
      - 138 * c ^ 5 - 150 * c ^ 4 - 30 * c ^ 3 - 3 * c ^ 2) + z ^ 7 * (105 * c ^ 13 + 468 * c ^ 12
      + 825 * c ^ 11 + 775 * c ^ 10 + 459 * c ^ 9 + 186 * c ^ 8 + 43 * c ^ 7 - 33 * c ^ 6
      - 32 * c ^ 5 + 36 * c ^ 4 + 36 * c ^ 3 + 3 * c ^ 2 + c) + z ^ 6 * (-13 * c ^ 12 - 55 * c ^ 11
      - 90 * c ^ 10 - 79 * c ^ 9 - 18 * c ^ 8 + 27 * c ^ 7 - 62 * c ^ 6 - 119 * c ^ 5 - 48 * c ^ 4
      - 6 * c ^ 3 - c ^ 2) + z ^ 5 * (15 * c ^ 14 + 78 * c ^ 13 + 165 * c ^ 12 + 191 * c ^ 11
      + 141 * c ^ 10 + 72 * c ^ 9 + 23 * c ^ 8 - 10 * c ^ 7 - 18 * c ^ 6 + 12 * c ^ 5 + 26 * c ^ 4
      + 6 * c ^ 3 + c ^ 2) + z ^ 4 * (-c ^ 13 - 5 * c ^ 12 - 10 * c ^ 11 - 11 * c ^ 10 + 14 * c ^ 8
      - 12 * c ^ 7 - 49 * c ^ 6 - 34 * c ^ 5 - 7 * c ^ 4 - c ^ 3) + z ^ 3 * (c ^ 15 + 6 * c ^ 14
      + 15 * c ^ 13 + 21 * c ^ 12 + 19 * c ^ 11 + 12 * c ^ 10 + 5 * c ^ 9 - c ^ 8 - 4 * c ^ 7
      + c ^ 6 + 7 * c ^ 5 + 2 * c ^ 4 - c ^ 3 + c ^ 2 + 1) + z ^ 2 * (c ^ 10 + 3 * c ^ 9
      - 8 * c ^ 7 - 9 * c ^ 6 - 3 * c ^ 5 + c ^ 2 + c) + z * (-c ^ 5 - c ^ 4 + c ^ 3 + c ^ 2
      + 2 * c) - 1) * hΦ

/-- Superattracting identity: at a period-four centre (a root of
`periodFourFactor`) `0` is a root of `M₄`. -/
theorem period4_product_zero_of_center {c : ℂ} (hc : periodFourFactor c = 0) :
    periodFourProductPolynomial c 0 = 0 := by
  simp [periodFourProductPolynomial, hc]

/-- The root of the period-two bulb's `1/2` satellite, `c = −5/4`: the four-step
multiplier `1` (product `1/16`) is a root of `M₄`. -/
theorem period4_product_root_satellite :
    periodFourProductPolynomial (-5 / 4) (1 / 16) = 0 := by
  unfold periodFourProductPolynomial periodFourFactor
  norm_num

/-- A fixed point that is also a root of `Φ₄` has `(2z)² + 1 = 0`: its
fixed-point multiplier is `±i`. -/
theorem periodFourDynatomic_fixedPoint {c z : ℂ} (hfix : quadratic c z = z)
    (hΦ : periodFourDynatomic c z = 0) : (2 * z) ^ 2 + 1 = 0 := by
  unfold quadratic at hfix
  unfold periodFourDynatomic periodFourFactor at hΦ
  linear_combination hΦ -
    (
      c ^ 5 + 5 * c ^ 4 * z ^ 2 + c ^ 4 * z + 3 * c ^ 4 + 10 * c ^ 3 * z ^ 4 + 4 * c ^ 3 * z ^ 3
      + 10 * c ^ 3 * z ^ 2 + 4 * c ^ 3 * z + 3 * c ^ 3 + 10 * c ^ 2 * z ^ 6 + 6 * c ^ 2 * z ^ 5
      + 12 * c ^ 2 * z ^ 4 + 10 * c ^ 2 * z ^ 3 + 7 * c ^ 2 * z ^ 2 + 5 * c ^ 2 * z + 3 * c ^ 2
      + 5 * c * z ^ 8 + 4 * c * z ^ 7 + 6 * c * z ^ 6 + 8 * c * z ^ 5 + 6 * c * z ^ 4
      + 6 * c * z ^ 3 + 7 * c * z ^ 2 + 4 * c * z + 2 * c + z ^ 10 + z ^ 9 + z ^ 8 + 2 * z ^ 7
      + 2 * z ^ 6 + 2 * z ^ 5 + 3 * z ^ 4 + 3 * z ^ 3 + 3 * z ^ 2 + 4 * z) * hfix

/-- A root of the period-two factor that is also a root of `Φ₄` has
`4c + 5 = 0`: its two-step multiplier `4(c + 1)` is `−1`. -/
theorem periodFourDynatomic_twoCycle {c z : ℂ} (htwo : z * z + z + (c + 1) = 0)
    (hΦ : periodFourDynatomic c z = 0) : 4 * c + 5 = 0 := by
  unfold periodFourDynatomic periodFourFactor at hΦ
  linear_combination hΦ -
    (
      c ^ 5 + 5 * c ^ 4 * z ^ 2 - c ^ 4 * z + 2 * c ^ 4 + 10 * c ^ 3 * z ^ 4 - 4 * c ^ 3 * z ^ 3
      + 6 * c ^ 3 * z ^ 2 + c ^ 3 + 10 * c ^ 2 * z ^ 6 - 6 * c ^ 2 * z ^ 5 + 6 * c ^ 2 * z ^ 4
      + 2 * c ^ 2 * z ^ 3 - c ^ 2 * z ^ 2 + c ^ 2 * z + 2 * c ^ 2 + 5 * c * z ^ 8 - 4 * c * z ^ 7
      + 2 * c * z ^ 6 + 4 * c * z ^ 5 - 4 * c * z ^ 4 + 2 * c * z ^ 3 + 3 * c * z ^ 2 - 2 * c * z
      + z ^ 10 - z ^ 9 + 2 * z ^ 7 - 2 * z ^ 6 + 3 * z ^ 4 - 3 * z ^ 3 + 4 * z - 4) * htwo

/-- A root of `Φ₄` that returns in two steps has four-step multiplier exactly `1`. -/
theorem periodFourDynatomic_period_two_multiplier {c z : ℂ} (hclose : orbit c 2 z = z)
    (hΦ : periodFourDynatomic c z = 0) :
    (derivative (seedPolynomial c 4)).eval z = 1 := by
  have h1 : orbit c 1 z = z * z + c := by simp [orbit_succ, quadratic]
  have h3 : orbit c 3 z = orbit c 1 z := by
    rw [show (3 : ℕ) = 2 + 1 from rfl, orbit_add, hclose]
  rw [period4_seedDerivative, h3, hclose, h1]
  by_cases hfix : quadratic c z = z
  · have h := periodFourDynatomic_fixedPoint hfix hΦ
    unfold quadratic at hfix
    rw [hfix]
    linear_combination ((2 * z) ^ 2 - 1) * h
  · have hclose' := hclose
    simp only [orbit_succ, orbit_zero, quadratic] at hclose'
    have hfactor : (z * z + c - z) * (z * z + z + (c + 1)) = 0 := by
      linear_combination hclose'
    have htwo : z * z + z + (c + 1) = 0 :=
      (mul_eq_zero.mp hfactor).resolve_left (sub_ne_zero.mpr (by simpa [quadratic] using hfix))
    have h5 := periodFourDynatomic_twoCycle htwo hΦ
    linear_combination
      (16 * (z - 1) * (2 * (c + 1) + (z - 1) * (z * z + z + (c + 1)))) * htwo +
        (4 * c + 3) * h5

/-- A root of `Φ₄` whose four-step multiplier has modulus below `1` does not
return in two steps (nor, therefore, in one): it has exact period four. -/
theorem period4_not_period_two_of_attracting {c z : ℂ} (hΦ : periodFourDynatomic c z = 0)
    (hatt : ‖(derivative (seedPolynomial c 4)).eval z‖ < 1) : orbit c 2 z ≠ z := by
  intro hclose
  rw [periodFourDynatomic_period_two_multiplier hclose hΦ, norm_one] at hatt
  exact lt_irrefl _ hatt

/-- In particular such a root is not a fixed point. -/
theorem period4_not_fixed_of_attracting {c z : ℂ} (hΦ : periodFourDynatomic c z = 0)
    (hatt : ‖(derivative (seedPolynomial c 4)).eval z‖ < 1) : quadratic c z ≠ z := by
  intro hfix
  apply period4_not_period_two_of_attracting hΦ hatt
  simp only [orbit_succ, orbit_zero, hfix]

end IntMProof
