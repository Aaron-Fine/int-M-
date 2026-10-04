import IntMProof.Derivatives
import IntMProof.ExactPeriod
import Mathlib.Data.Complex.Basic
import Mathlib.Analysis.Complex.Norm
import Mathlib.Tactic.FieldSimp
import Mathlib.Tactic.Linarith
import Mathlib.Tactic.LinearCombination
import Mathlib.Tactic.NormNum
import Mathlib.Tactic.Positivity
import Mathlib.Tactic.Ring

/-!
# Exact fast-path identities

Exact identities for the period-1 branch, the period-2 cycle, and the open
period-2 bulb. The cardioid form is an exact identity as well. None of them
certifies binary64 `Math.hypot`, `Math.sqrt`, or an attraction margin.
-/

namespace IntMProof

open Function Polynomial Complex

/-- Exact identity: if `s * s = 1 - 4 * c`, then `z = (1 - s) / 2` is a fixed
point of `quadratic c`. This is the branch written `1 - sqrt(1 - 4c)`. -/
theorem period1_fixedPoint (c s : ℂ) (hs : s * s = 1 - 4 * c) :
    quadratic c ((1 - s) / 2) = (1 - s) / 2 := by
  unfold quadratic
  field_simp
  linear_combination hs

/-- Exact identity: on that branch the one-step seed derivative equals `1 - s`,
and that value is also `2 * z`. -/
theorem period1_seedDerivative (c s : ℂ) :
    (derivative (seedPolynomial c 1)).eval ((1 - s) / 2) = 1 - s ∧
      (derivative (seedPolynomial c 1)).eval ((1 - s) / 2) =
        2 * ((1 - s) / 2) := by
  have htwo :
      (derivative (seedPolynomial c 1)).eval ((1 - s) / 2) =
        2 * ((1 - s) / 2) := by
    rw [seedPolynomial_derivative_succ, orbit_zero, seedPolynomial_derivative_zero]
    ring
  refine ⟨?_, htwo⟩
  rw [htwo]
  field_simp

/-- Exact identity: `z₁² + z₁ + (c + 1) = 0` makes `z₂ = z₁² + c` return to
`z₁`, so the orbit period divides 2. -/
theorem period2_return (c z₁ : ℂ) (h : z₁ * z₁ + z₁ + (c + 1) = 0) :
    quadratic c (quadratic c z₁) = z₁ := by
  unfold quadratic
  have hz2 : z₁ * z₁ + c = -z₁ - 1 := by linear_combination h
  rw [hz2]
  linear_combination h

/-- Exact identity: the two-step orbit closes, so the period divides 2. -/
theorem period2_orbit (c z₁ : ℂ) (h : z₁ * z₁ + z₁ + (c + 1) = 0) :
    orbit c 2 z₁ = z₁ := by
  rw [orbit_succ, orbit_succ, orbit_zero]
  exact period2_return c z₁ h

/-- Exact identity: the two cycle points multiply to `c + 1`. -/
theorem period2_product (c z₁ : ℂ) (h : z₁ * z₁ + z₁ + (c + 1) = 0) :
    z₁ * quadratic c z₁ = c + 1 := by
  unfold quadratic
  have hz2 : z₁ * z₁ + c = -z₁ - 1 := by linear_combination h
  rw [hz2]
  linear_combination -h

/-- Exact identity: the two-step seed derivative at `z₁` equals `4 * (c + 1)`.
The recurrence gives `D₂ = 4 * z₁ * z₂`. -/
theorem period2_seedDerivative (c z₁ : ℂ) (h : z₁ * z₁ + z₁ + (c + 1) = 0) :
    (derivative (seedPolynomial c 2)).eval z₁ = 4 * (c + 1) := by
  have h1 : (derivative (seedPolynomial c 1)).eval z₁ = 2 * z₁ := by
    rw [seedPolynomial_derivative_succ, orbit_zero, seedPolynomial_derivative_zero]
    ring
  rw [seedPolynomial_derivative_succ, h1, orbit_succ, orbit_zero]
  calc
    2 * quadratic c z₁ * (2 * z₁) = 4 * (z₁ * quadratic c z₁) := by ring
    _ = 4 * (c + 1) := by rw [period2_product c z₁ h]

/-- Exact identity: a nonzero discriminant `1 - 4 * (c + 1)` keeps the two
cycle points apart. -/
theorem period2_ne_of_discriminant (c z₁ : ℂ)
    (h : z₁ * z₁ + z₁ + (c + 1) = 0) (hd : 1 - 4 * (c + 1) ≠ 0) :
    z₁ ≠ quadratic c z₁ := by
  intro hz
  have hz' : quadratic c z₁ = z₁ := hz.symm
  unfold quadratic at hz'
  have hfix : z₁ * z₁ + c - z₁ = 0 := sub_eq_zero.mpr hz'
  have h2 : (2 : ℂ) * z₁ + 1 = 0 := by linear_combination h - hfix
  have hz1 : z₁ = -1 / 2 := by linear_combination h2 / 2
  rw [hz1] at h
  have hc : c = -3 / 4 := by linear_combination h
  apply hd
  rw [hc]
  norm_num

/-- Exact identity: if `c ≠ -3 / 4`, a root of `z₁² + z₁ + (c + 1) = 0` is
not a fixed point of `quadratic c`. -/
theorem period2_not_fixedPoint (c z₁ : ℂ)
    (h : z₁ * z₁ + z₁ + (c + 1) = 0) (hc : c ≠ -3 / 4) :
    quadratic c z₁ ≠ z₁ := by
  intro hz
  have hd : 1 - 4 * (c + 1) ≠ 0 := by
    intro hzero
    apply hc
    have hlin : (1 : ℂ) - 4 * (c + 1) = -4 * (c + 3 / 4) := by ring
    rw [hlin] at hzero
    have h4 : (-4 : ℂ) ≠ 0 := by norm_num
    have hsum : c + 3 / 4 = 0 := (mul_eq_zero.mp hzero).resolve_left h4
    linear_combination hsum
  exact period2_ne_of_discriminant c z₁ h hd hz.symm

/-- A root of `z₁² + z₁ + (c + 1) = 0` that is not fixed has minimal period 2.
`c ≠ -3 / 4` keeps the two cycle points apart. -/
theorem period2_minimalPeriod (c z₁ : ℂ)
    (h : z₁ * z₁ + z₁ + (c + 1) = 0) (hc : c ≠ -3 / 4) :
    minimalPeriod (quadratic c) z₁ = 2 := by
  refine (exactPeriod_iff_first_return (quadratic c) z₁ 2 (by decide)).mpr
    ⟨period2_orbit c z₁ h, ?_⟩
  intro k hk hlt
  cases k with
  | zero => exact absurd hk (Nat.not_lt_zero 0)
  | succ k =>
    cases k with
    | zero =>
      simpa [iterate_one] using period2_not_fixedPoint c z₁ h hc
    | succ k =>
      exact absurd hlt (not_lt_of_ge (Nat.le_add_left 2 k))

/-- Exact identity for the open period-2 bulb. Mathlib's complex modulus is
`‖·‖`. `‖4 * (c + 1)‖ < 1` if and only if `‖c + 1‖ < 1 / 4`. -/
theorem period2_bulb_abs (c : ℂ) :
    ‖4 * (c + 1)‖ < 1 ↔ ‖c + 1‖ < 1 / 4 := by
  rw [Complex.norm_mul, Complex.norm_ofNat, mul_comm]
  exact (lt_div_iff₀ (by norm_num : (0 : ℝ) < 4)).symm

/-- The open bulb excludes the parameter where the two cycle points coincide. -/
theorem period2_bulb_ne (c : ℂ) (h : ‖c + 1‖ < 1 / 4) : c ≠ -3 / 4 := by
  intro hc
  have hmul : ‖4 * (c + 1)‖ < 1 := (period2_bulb_abs c).mpr h
  have hone : 4 * ((-3 / 4 : ℂ) + 1) = 1 := by ring
  rw [hc, hone] at hmul
  have hnorm : ‖(1 : ℂ)‖ = 1 := by simp [Complex.norm_def, normSq_one]
  rw [hnorm] at hmul
  exact lt_irrefl (1 : ℝ) hmul

/-- Exact identity: `|1 - s| < 1` if and only if `|s|² < 2 * s.re`. -/
private lemma modulus_lt_one_iff (s : ℂ) :
    ‖1 - s‖ < 1 ↔ s.re ^ 2 + s.im ^ 2 < 2 * s.re := by
  calc
    ‖1 - s‖ < 1 ↔ ‖1 - s‖ ^ 2 < 1 ^ 2 := by
      rw [sq_lt_sq, abs_of_nonneg (norm_nonneg _), abs_of_nonneg (zero_le_one' ℝ)]
    _ ↔ normSq (1 - s) < 1 := by
      rw [Complex.sq_norm, one_pow]
    _ ↔ normSq s < 2 * s.re := by
      have hns : normSq (1 - s) = normSq s + 1 - 2 * s.re := by
        rw [normSq_sub, normSq_one]
        simp
        ring
      rw [hns]
      constructor <;> intro h <;> linarith
    _ ↔ s.re ^ 2 + s.im ^ 2 < 2 * s.re := by
      rw [normSq_apply]
      have hsq : s.re * s.re + s.im * s.im = s.re ^ 2 + s.im ^ 2 := by ring
      rw [hsq]

/-- Exact identity over `ℝ`: the cleared cardioid polynomial is the half-plane
inequality `u² + v² < 2u` when `0 ≤ u`. -/
private lemma cardioid_real_iff (u v : ℝ) (hu : 0 ≤ u) :
    ((u ^ 2 + v ^ 2) ^ 2 / 16) *
        ((u ^ 2 + v ^ 2) ^ 2 / 16 + (v ^ 2 - u ^ 2) / 4) <
      u ^ 2 * v ^ 2 / 16 ↔ u ^ 2 + v ^ 2 < 2 * u := by
  set A : ℝ := u ^ 2
  set B : ℝ := v ^ 2
  set ρ : ℝ := A + B
  have hid :
      (ρ ^ 2 / 16) * (ρ ^ 2 / 16 + (B - A) / 4) - A * B / 16 =
        -((4 * A - ρ ^ 2) * (ρ ^ 2 + 4 * B)) / 256 := by
    ring
  have h256 : (0 : ℝ) < 256 := by norm_num
  have hρ0 : 0 ≤ ρ := by positivity
  have h2u : 0 ≤ 2 * u := mul_nonneg (by norm_num) hu
  have hsq4 : (2 * u) ^ 2 = 4 * u ^ 2 := by ring
  have hsub :
      (ρ ^ 2 / 16) * (ρ ^ 2 / 16 + (B - A) / 4) < A * B / 16 ↔
        (ρ ^ 2 / 16) * (ρ ^ 2 / 16 + (B - A) / 4) - A * B / 16 < 0 := by
    constructor <;> intro h <;> linarith
  have hfactor :
      0 < (4 * A - ρ ^ 2) * (ρ ^ 2 + 4 * B) ↔ u ^ 2 + v ^ 2 < 2 * u := by
    constructor
    · intro hprod
      have hD1 : 0 < 4 * A - ρ ^ 2 := by
        by_contra hle
        have hle' : 4 * A - ρ ^ 2 ≤ 0 := le_of_not_gt hle
        have hD2 : 0 ≤ ρ ^ 2 + 4 * B := by positivity
        exact not_lt_of_ge (mul_nonpos_of_nonpos_of_nonneg hle' hD2) hprod
      have hlt2 : ρ ^ 2 < (2 * u) ^ 2 := by rw [hsq4]; linarith
      rw [sq_lt_sq, abs_of_nonneg hρ0, abs_of_nonneg h2u] at hlt2
      simpa [ρ, A, B] using hlt2
    · intro hlt
      have hsqρ : ρ ^ 2 < (2 * u) ^ 2 := by
        rw [sq_lt_sq, abs_of_nonneg hρ0, abs_of_nonneg h2u]
        simpa [ρ, A, B] using hlt
      have hD1 : 0 < 4 * A - ρ ^ 2 := by rw [← hsq4]; linarith
      have hu0 : 0 < u := by
        apply lt_of_le_of_ne hu
        intro hzero
        have hu_zero : u = 0 := hzero.symm
        have hρlt : ρ < 0 := by simpa [hu_zero, ρ, A, B] using hlt
        exact not_lt_of_ge hρ0 hρlt
      have hD2 : 0 < ρ ^ 2 + 4 * B := by
        have hA : 0 < A := by simpa [A] using sq_pos_of_pos hu0
        have hAle : A ≤ ρ := by
          have hB : 0 ≤ B := sq_nonneg v
          linarith
        have hρpos : 0 < ρ := lt_of_lt_of_le hA hAle
        have hsqρ' : 0 < ρ ^ 2 := sq_pos_of_pos hρpos
        have hB4 : 0 ≤ 4 * B := by positivity
        linarith
      exact mul_pos hD1 hD2
  rw [hsub, hid, neg_div, neg_lt_zero, lt_div_iff₀ h256, zero_mul]
  exact hfactor

/-- Exact identity for the open main cardioid. If `s * s = 1 - 4 * c`,
`c = x + y * I`, and `0 ≤ s.re`, then the modulus `|1 - s| < 1` if and only
if `q * (q + (x - 1/4)) < (1/4) * y²` for `q = (x - 1/4)² + y²`. -/
theorem mainCardioid_inequality (c : ℂ) (x y : ℝ) (s : ℂ)
    (hc : c = (x : ℂ) + (y : ℂ) * I) (hs : s * s = 1 - 4 * c)
    (hre : 0 ≤ s.re) :
    ‖1 - s‖ < 1 ↔
      ((x - 1 / 4) ^ 2 + y ^ 2) *
          (((x - 1 / 4) ^ 2 + y ^ 2) + (x - 1 / 4)) <
        (1 / 4) * y ^ 2 := by
  rw [modulus_lt_one_iff]
  have hx : x = c.re := by
    rw [hc]
    simp [add_re, ofReal_re, ofReal_im]
  have hy : y = c.im := by
    rw [hc]
    simp [add_im, ofReal_re, ofReal_im]
  have h4 : 4 * c = 1 - s * s := by linear_combination hs
  have hc4 : c = (1 - s * s) / 4 := by
    calc
      c = 4 * c / 4 := by field_simp
      _ = (1 - s * s) / 4 := by rw [h4]
  have hre_c : c.re = (1 - (s.re ^ 2 - s.im ^ 2)) / 4 := by
    rw [hc4, div_ofNat_re, sub_re, one_re, mul_re]
    ring
  have him_c : c.im = -(s.re * s.im) / 2 := by
    rw [hc4, div_ofNat_im, sub_im, one_im, mul_im]
    ring
  have hdx : x - 1 / 4 = (s.im ^ 2 - s.re ^ 2) / 4 := by
    rw [hx, hre_c]
    ring
  have hy2 : y ^ 2 = s.re ^ 2 * s.im ^ 2 / 4 := by
    rw [hy, him_c]
    ring
  have hq :
      (x - 1 / 4) ^ 2 + y ^ 2 = (s.re ^ 2 + s.im ^ 2) ^ 2 / 16 := by
    rw [hdx, hy2]
    ring
  rw [hq, hdx, hy2]
  have hscale :
      (1 / 4) * (s.re ^ 2 * s.im ^ 2 / 4) = s.re ^ 2 * s.im ^ 2 / 16 := by
    ring
  rw [hscale]
  exact (cardioid_real_iff s.re s.im hre).symm

end IntMProof
