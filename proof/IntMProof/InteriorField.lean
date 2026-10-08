import IntMProof.Guard
import IntMProof.FastPath
import Mathlib.Topology.MetricSpace.HausdorffDistance

/-!
# A scoped interior distance proxy for the period-one chart

The period-one multiplier chart is `χ(lam) = lam/2 - lam²/4`. For a unit
multiplier `μ` and radial coordinate `ρ ∈ [0,1]`, the radial endpoint
`χ(μ)` lies on the unit-multiplier curve. The first-order radial term has
an exact quadratic remainder. This bounds Euclidean distance to that curve
from above; no lower bound on distance to the curve is claimed.
-/

namespace IntMProof

open Metric Polynomial

/-- Parameter of the period-one fixed point with multiplier `lam`. -/
noncomputable def periodOneChart (lam : ℂ) : ℂ := lam / 2 - lam ^ 2 / 4

/-- The image of unit multipliers under the period-one chart. -/
def periodOneUnitCurve : Set ℂ :=
  periodOneChart '' {μ : ℂ | ‖μ‖ = 1}

/-- The open unit multiplier disk is the domain of the attracting
period-one chart. -/
def periodOneMultiplierDisk : Set ℂ := {lam : ℂ | ‖lam‖ < 1}

/-- The chart seed is a fixed point and has multiplier `lam`. -/
theorem periodOneChart_fixedPoint (lam : ℂ) :
    quadratic (periodOneChart lam) (lam / 2) = lam / 2 ∧
      (derivative (seedPolynomial (periodOneChart lam) 1)).eval (lam / 2) = lam := by
  have hsq : (1 - lam) * (1 - lam) = 1 - 4 * periodOneChart lam := by
    unfold periodOneChart
    ring
  have hfixed := period1_fixedPoint (periodOneChart lam) (1 - lam) hsq
  have hderiv := (period1_seedDerivative (periodOneChart lam) (1 - lam)).1
  constructor
  · convert hfixed using 1 <;> ring_nf
  · convert hderiv using 1 <;> ring_nf

/-- Every multiplier in the open chart disk gives an attracting fixed point.
Here attracting means that the formal one-step seed derivative has norm
strictly below one. -/
theorem periodOneChart_attracting (lam : ℂ)
    (hlam : lam ∈ periodOneMultiplierDisk) :
    quadratic (periodOneChart lam) (lam / 2) = lam / 2 ∧
      ‖(derivative (seedPolynomial (periodOneChart lam) 1)).eval (lam / 2)‖ < 1 := by
  obtain ⟨hfixed, hderiv⟩ := periodOneChart_fixedPoint lam
  exact ⟨hfixed, hderiv.symm ▸ hlam⟩

/-- Exact radial Taylor identity in the period-one chart. The linear term
is based at the unit-multiplier endpoint `μ`; the remainder is quadratic in
`1 - ρ`. -/
theorem periodOneChart_radial_remainder (μ : ℂ) (ρ : ℝ) :
    periodOneChart μ - periodOneChart ((ρ : ℂ) * μ) -
        (((1 - ρ : ℝ) : ℂ) * μ * (1 - μ) / 2) =
      (((1 - ρ : ℝ) : ℂ) ^ 2 * μ ^ 2) / 4 := by
  unfold periodOneChart
  push_cast
  ring

/-- On a unit-multiplier ray, the norm of the exact remainder is
`(1 - ρ)²/4`. -/
theorem periodOneChart_radial_remainder_norm (μ : ℂ) (ρ : ℝ)
    (hμ : ‖μ‖ = 1) :
    ‖periodOneChart μ - periodOneChart ((ρ : ℂ) * μ) -
        (((1 - ρ : ℝ) : ℂ) * μ * (1 - μ) / 2)‖ =
      (1 - ρ) ^ 2 / 4 := by
  rw [periodOneChart_radial_remainder]
  simp only [norm_div, norm_mul, norm_pow, hμ, one_pow, mul_one]
  rw [Complex.norm_real, Real.norm_eq_abs, sq_abs]
  norm_num

/-- The first-order radial expression, with its explicit quadratic
remainder, bounds Euclidean distance to the unit-multiplier curve on the
specified radial chart. The curve is the image of unit multipliers; this
statement does not identify it with a particular fractal boundary. -/
theorem periodOneChart_infDist_unitCurve_le (μ : ℂ) (ρ : ℝ)
    (hμ : ‖μ‖ = 1) (hρ : 0 ≤ ρ ∧ ρ ≤ 1) :
    infDist (periodOneChart ((ρ : ℂ) * μ)) periodOneUnitCurve ≤
      (1 - ρ) * ‖1 - μ‖ / 2 + (1 - ρ) ^ 2 / 4 := by
  have hmem : periodOneChart μ ∈ periodOneUnitCurve := ⟨μ, hμ, rfl⟩
  have hdist : infDist (periodOneChart ((ρ : ℂ) * μ)) periodOneUnitCurve ≤
      dist (periodOneChart ((ρ : ℂ) * μ)) (periodOneChart μ) :=
    infDist_le_dist_of_mem hmem
  have htriangle := norm_add_le
    (((1 - ρ : ℝ) : ℂ) * μ * (1 - μ) / 2)
    (periodOneChart μ - periodOneChart ((ρ : ℂ) * μ) -
      (((1 - ρ : ℝ) : ℂ) * μ * (1 - μ) / 2))
  have hlinear :
      ‖(((1 - ρ : ℝ) : ℂ) * μ * (1 - μ) / 2)‖ =
        (1 - ρ) * ‖1 - μ‖ / 2 := by
    simp only [norm_div, norm_mul, Complex.norm_real, Real.norm_eq_abs,
      hμ, mul_one]
    rw [abs_of_nonneg (sub_nonneg.mpr hρ.2)]
    norm_num
  calc
    infDist (periodOneChart ((ρ : ℂ) * μ)) periodOneUnitCurve
        ≤ dist (periodOneChart ((ρ : ℂ) * μ)) (periodOneChart μ) := hdist
    _ = ‖periodOneChart μ - periodOneChart ((ρ : ℂ) * μ)‖ := by
      rw [dist_eq_norm, norm_sub_rev]
    _ ≤ ‖(((1 - ρ : ℝ) : ℂ) * μ * (1 - μ) / 2)‖ +
        ‖periodOneChart μ - periodOneChart ((ρ : ℂ) * μ) -
          (((1 - ρ : ℝ) : ℂ) * μ * (1 - μ) / 2)‖ := by
      convert htriangle using 1
      ring_nf
    _ = _ := by rw [hlinear, periodOneChart_radial_remainder_norm μ ρ hμ]

end IntMProof
