import IntMProof.ParameterEnclosure
import IntMProof.Guard
import Mathlib.Tactic.Linarith

/-!
# Enclosed continuation and predictor bounds (G2, J1)

The enclosed multiplier `Q < 1` gives a positive denominator margin `1 - Q`.
The parameter enclosure `T` then bounds slopes and linear proposals by
`T / (1 - Q)`. The same constant bounds finite movement between exact return
points in the common disks. This finite root estimate is distinct from a
second-order error bound for the linear predictor.
-/

namespace IntMProof

open Filter Metric Polynomial

open scoped Topology

/-- Reverse triangle inequality supplies a computable denominator margin. -/
theorem one_sub_multiplier_norm_lower (lam : ℂ) (Q : ℝ) (hbound : ‖lam‖ ≤ Q) :
    1 - Q ≤ ‖1 - lam‖ := by
  have htri := norm_add_le (1 - lam) lam
  rw [sub_add_cancel, norm_one] at htri
  linarith

/-- A strict contraction bound rules out the singular branch denominator. -/
theorem multiplier_ne_one_of_norm_bound (lam : ℂ) (Q : ℝ)
    (hbound : ‖lam‖ ≤ Q) (hcontract : Q < 1) : lam ≠ 1 := by
  intro heq
  rw [heq, norm_one] at hbound
  exact (not_le_of_gt hcontract) hbound

/-- A numerator enclosure and contraction margin bound the branch slope. -/
theorem branchSlope_norm_le_of_bounds (B lam : ℂ) (T Q : ℝ)
    (hB : ‖B‖ ≤ T) (hlam : ‖lam‖ ≤ Q) (hcontract : Q < 1) :
    ‖B / (1 - lam)‖ ≤ T / (1 - Q) := by
  have hpos : 0 < 1 - Q := sub_pos.mpr hcontract
  rw [norm_div]
  calc
    ‖B‖ / ‖1 - lam‖ ≤ ‖B‖ / (1 - Q) :=
      div_le_div_of_nonneg_left (norm_nonneg B) hpos
        (one_sub_multiplier_norm_lower lam Q hlam)
    _ ≤ T / (1 - Q) := div_le_div_of_nonneg_right hB (le_of_lt hpos)

/-- The disk multiplier product bounds the Newton/branch denominator away
from zero at every enclosed parameter and seed. -/
theorem disk_branch_denominator_lower (cRef c z₀ z : ℂ) (r Δ : ℝ) (n : ℕ)
    (hseed : ‖z - z₀‖ ≤ r) (hparam : ‖c - cRef‖ ≤ Δ) :
    1 - multiplierBound (diskOrbitRadius cRef z₀ r Δ) n ≤
      ‖1 - (derivative (seedPolynomial c n)).eval z‖ := by
  exact one_sub_multiplier_norm_lower _ _
    (seedDerivative_norm_le_disk_multiplier cRef c z₀ z r Δ n hseed hparam)

/-- Uniform slope estimate from the two derivative enclosures. -/
theorem disk_branchSlope_norm_le (cRef c z₀ z : ℂ) (r Δ : ℝ) (n : ℕ)
    (hseed : ‖z - z₀‖ ≤ r) (hparam : ‖c - cRef‖ ≤ Δ)
    (hcontract : multiplierBound (diskOrbitRadius cRef z₀ r Δ) n < 1) :
    ‖(derivative (parameterPolynomial (C z) n)).eval c /
        (1 - (derivative (seedPolynomial c n)).eval z)‖ ≤
      parameterDerivativeBound (diskOrbitRadius cRef z₀ r Δ) n /
        (1 - multiplierBound (diskOrbitRadius cRef z₀ r Δ) n) := by
  exact branchSlope_norm_le_of_bounds _ _ _ _
    (parameterDerivative_norm_le_disk_bound cRef c z₀ z r Δ n hseed hparam)
    (seedDerivative_norm_le_disk_multiplier cRef c z₀ z r Δ n hseed hparam) hcontract

/-- The enclosed constant gives a uniform linear-predictor displacement
bound. The proposed seed still requires an independent return certificate. -/
theorem disk_predictorDisplacement_le (cRef c z₀ z δ : ℂ) (r Δ : ℝ) (n : ℕ)
    (hseed : ‖z - z₀‖ ≤ r) (hparam : ‖c - cRef‖ ≤ Δ)
    (hcontract : multiplierBound (diskOrbitRadius cRef z₀ r Δ) n < 1) :
    ‖((derivative (parameterPolynomial (C z) n)).eval c /
        (1 - (derivative (seedPolynomial c n)).eval z)) * δ‖ ≤
      (parameterDerivativeBound (diskOrbitRadius cRef z₀ r Δ) n /
        (1 - multiplierBound (diskOrbitRadius cRef z₀ r Δ) n)) * ‖δ‖ := by
  rw [Complex.norm_mul]
  exact mul_le_mul_of_nonneg_right
    (disk_branchSlope_norm_le cRef c z₀ z r Δ n hseed hparam hcontract) (norm_nonneg δ)

/-- Exact closure in a contracting enclosure constructs a local periodic
graph with a certified slope bound at the chosen parameter. -/
theorem exists_branch_of_disk_enclosure (cRef c z₀ z : ℂ) (r Δ : ℝ) (n : ℕ)
    (hseed : ‖z - z₀‖ ≤ r) (hparam : ‖c - cRef‖ ≤ Δ)
    (hcontract : multiplierBound (diskOrbitRadius cRef z₀ r Δ) n < 1)
    (hclose : orbit c n z = z) :
    ∃ (φ : ℂ → ℂ) (slope : ℂ), φ c = z ∧
      (∀ᶠ t in 𝓝 c, orbit t n (φ t) = φ t) ∧ HasDerivAt φ slope c ∧
      ‖slope‖ ≤ parameterDerivativeBound (diskOrbitRadius cRef z₀ r Δ) n /
        (1 - multiplierBound (diskOrbitRadius cRef z₀ r Δ) n) := by
  obtain ⟨φ, hφ, hreturn, hderiv⟩ := exists_branch_slope c z n hclose
    (multiplier_ne_one_of_norm_bound _ _
      (seedDerivative_norm_le_disk_multiplier cRef c z₀ z r Δ n hseed hparam) hcontract)
  exact ⟨φ, _, hφ, hreturn, hderiv,
    disk_branchSlope_norm_le cRef c z₀ z r Δ n hseed hparam hcontract⟩

/-- Orbit changes split into a seed change and a parameter change. Both
segments remain inside their convex disks. -/
theorem orbit_dist_le_disk_joint_bound (cRef c₀ c₁ z₀ z₁ z₂ : ℂ) (r Δ : ℝ)
    (n : ℕ) (hr : 0 ≤ r) (hΔ : 0 ≤ Δ)
    (hc₀ : c₀ ∈ closedBall cRef Δ) (hc₁ : c₁ ∈ closedBall cRef Δ)
    (hz₁ : z₁ ∈ closedBall z₀ r) (hz₂ : z₂ ∈ closedBall z₀ r) :
    dist (orbit c₀ n z₁) (orbit c₁ n z₂) ≤
      multiplierBound (diskOrbitRadius cRef z₀ r Δ) n * dist z₁ z₂ +
        parameterDerivativeBound (diskOrbitRadius cRef z₀ r Δ) n * dist c₀ c₁ := by
  have hseed := lipschitzOnWith_orbit_of_disk_enclosure cRef c₀ z₀ r Δ n hr hΔ
    (by simpa only [mem_closedBall, dist_eq_norm] using hc₀)
  have hparam := lipschitzOnWith_parameter_orbit_of_disk_enclosure cRef z₀ z₂ r Δ n hr hΔ
    (by simpa only [mem_closedBall, dist_eq_norm] using hz₂)
  exact (dist_triangle _ (orbit c₀ n z₂) _).trans
    (add_le_add (hseed.dist_le_mul z₁ hz₁ z₂ hz₂) (hparam.dist_le_mul c₀ hc₀ c₁ hc₁))

/-- Finite movement of two exact return points in the common disks is at
most `T / (1 - Q)` times the parameter movement. Neither a predictor nor
uniqueness is assumed; exact closure of both points is required. -/
theorem periodicPoint_dist_le_disk_bound (cRef c₀ c₁ z₀ z₁ z₂ : ℂ) (r Δ : ℝ)
    (n : ℕ) (hr : 0 ≤ r) (hΔ : 0 ≤ Δ)
    (hc₀ : c₀ ∈ closedBall cRef Δ) (hc₁ : c₁ ∈ closedBall cRef Δ)
    (hz₁ : z₁ ∈ closedBall z₀ r) (hz₂ : z₂ ∈ closedBall z₀ r)
    (hcontract : multiplierBound (diskOrbitRadius cRef z₀ r Δ) n < 1)
    (hclose₁ : orbit c₀ n z₁ = z₁) (hclose₂ : orbit c₁ n z₂ = z₂) :
    dist z₁ z₂ ≤ (parameterDerivativeBound (diskOrbitRadius cRef z₀ r Δ) n /
      (1 - multiplierBound (diskOrbitRadius cRef z₀ r Δ) n)) * dist c₀ c₁ := by
  have hdist := orbit_dist_le_disk_joint_bound cRef c₀ c₁ z₀ z₁ z₂ r Δ n hr hΔ
    hc₀ hc₁ hz₁ hz₂
  rw [hclose₁, hclose₂] at hdist
  have hpos : 0 < 1 - multiplierBound (diskOrbitRadius cRef z₀ r Δ) n :=
    sub_pos.mpr hcontract
  rw [div_mul_eq_mul_div]
  apply (le_div_iff₀ hpos).mpr
  nlinarith

end IntMProof
