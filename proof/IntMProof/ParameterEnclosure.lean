import IntMProof.DiskEnclosure
import IntMProof.Branch

/-!
# Uniform parameter-derivative enclosures (J0, G2)

The recurrence `T₀ = 0`, `Tₙ₊₁ = 2 Rₙ Tₙ + 1` bounds the parameter
derivative with a fixed seed. Reference-centered orbit radii supply `Rₙ`
uniformly over both disks. Convexity of the parameter disk then gives a
finite Lipschitz estimate, not just a derivative at its center.
-/

namespace IntMProof

open Metric Polynomial

/-- Comparison sequence for the parameter derivative of a fixed-seed orbit. -/
noncomputable def parameterDerivativeBound (radius : ℕ → ℝ) : ℕ → ℝ
  | 0 => 0
  | n + 1 => 2 * radius n * parameterDerivativeBound radius n + 1

/-- A constant seed contributes no initial parameter derivative. -/
theorem parameterDerivativeBound_zero (radius : ℕ → ℝ) :
    parameterDerivativeBound radius 0 = 0 := rfl

/-- Each step adds the direct parameter contribution `1`. -/
theorem parameterDerivativeBound_succ (radius : ℕ → ℝ) (n : ℕ) :
    parameterDerivativeBound radius (n + 1) =
      2 * radius n * parameterDerivativeBound radius n + 1 := rfl

/-- Nonnegative orbit radii give a nonnegative derivative bound. -/
theorem parameterDerivativeBound_nonneg (radius : ℕ → ℝ) (n : ℕ)
    (hr : ∀ k < n, 0 ≤ radius k) : 0 ≤ parameterDerivativeBound radius n := by
  induction n with
  | zero => exact le_rfl
  | succ n ih =>
    rw [parameterDerivativeBound_succ]
    exact add_nonneg
      (mul_nonneg (mul_nonneg zero_le_two (hr n (Nat.lt_succ_self n)))
        (ih (fun k hk => hr k (Nat.lt_succ_of_lt hk)))) zero_le_one

/-- Enlarging nonnegative orbit radii preserves the upper-bound direction. -/
theorem parameterDerivativeBound_mono (radius₀ radius₁ : ℕ → ℝ) (n : ℕ)
    (hr₀ : ∀ k < n, 0 ≤ radius₀ k) (hr : ∀ k < n, radius₀ k ≤ radius₁ k) :
    parameterDerivativeBound radius₀ n ≤ parameterDerivativeBound radius₁ n := by
  induction n with
  | zero => exact le_rfl
  | succ n ih =>
    rw [parameterDerivativeBound_succ, parameterDerivativeBound_succ]
    refine add_le_add ?_ le_rfl
    exact mul_le_mul (mul_le_mul_of_nonneg_left (hr n (Nat.lt_succ_self n)) zero_le_two)
      (ih (fun k hk => hr₀ k (Nat.lt_succ_of_lt hk))
        (fun k hk => hr k (Nat.lt_succ_of_lt hk)))
      (parameterDerivativeBound_nonneg radius₀ n
        (fun k hk => hr₀ k (Nat.lt_succ_of_lt hk)))
      (mul_nonneg zero_le_two ((hr₀ n (Nat.lt_succ_self n)).trans
        (hr n (Nat.lt_succ_self n))))

/-- Absolute orbit bounds enclose the fixed-seed parameter partial. -/
theorem parameterDerivative_norm_le_bound (c z : ℂ) (radius : ℕ → ℝ) (n : ℕ)
    (horbit : ∀ k < n, ‖orbit c k z‖ ≤ radius k) :
    ‖(derivative (parameterPolynomial (C z) n)).eval c‖ ≤
      parameterDerivativeBound radius n := by
  induction n with
  | zero =>
    simp only [fixedSeed_parameter_derivative_zero, norm_zero,
      parameterDerivativeBound_zero, le_refl]
  | succ n ih =>
    rw [parameterPolynomial_derivative_succ, eval_C, parameterDerivativeBound_succ]
    refine (norm_add_le _ _).trans ?_
    rw [Complex.norm_mul, Complex.norm_mul, Complex.norm_two, norm_one]
    exact add_le_add
      (mul_le_mul (mul_le_mul_of_nonneg_left (horbit n (Nat.lt_succ_self n)) zero_le_two)
        (ih (fun k hk => horbit k (Nat.lt_succ_of_lt hk))) (norm_nonneg _)
        (mul_nonneg zero_le_two ((norm_nonneg _).trans (horbit n (Nat.lt_succ_self n)))))
      le_rfl

/-- One comparison sequence works for every seed and parameter in the disks. -/
theorem parameterDerivative_norm_le_disk_bound (cRef c z₀ z : ℂ) (r Δ : ℝ)
    (n : ℕ) (hseed : ‖z - z₀‖ ≤ r) (hparam : ‖c - cRef‖ ≤ Δ) :
    ‖(derivative (parameterPolynomial (C z) n)).eval c‖ ≤
      parameterDerivativeBound (diskOrbitRadius cRef z₀ r Δ) n := by
  exact parameterDerivative_norm_le_bound c z (diskOrbitRadius cRef z₀ r Δ) n
    (fun k _ => orbit_norm_le_diskOrbitRadius cRef c z₀ z r Δ k hseed hparam)

/-- Uniform parameter partials give a finite Lipschitz bound on the entire
parameter disk for each seed in the seed disk. -/
theorem lipschitzOnWith_parameter_orbit_of_disk_enclosure (cRef z₀ z : ℂ) (r Δ : ℝ)
    (n : ℕ) (hr : 0 ≤ r) (hΔ : 0 ≤ Δ) (hseed : ‖z - z₀‖ ≤ r) :
    LipschitzOnWith
      ⟨parameterDerivativeBound (diskOrbitRadius cRef z₀ r Δ) n,
        parameterDerivativeBound_nonneg _ n
          (fun k _ => diskOrbitRadius_nonneg cRef z₀ r Δ k hr hΔ)⟩
      (fun c => orbit c n z) (closedBall cRef Δ) := by
  apply lipschitzOnWith_closedBall_of_deriv_le (fun c => orbit c n z) cRef Δ
    (parameterDerivativeBound (diskOrbitRadius cRef z₀ r Δ) n)
    (parameterDerivativeBound_nonneg _ n
      (fun k _ => diskOrbitRadius_nonneg cRef z₀ r Δ k hr hΔ))
  · intro c _
    exact (hasDerivAt_orbit_fixedSeed z c n).differentiableAt
  · intro c hc
    rw [(hasDerivAt_orbit_fixedSeed z c n).deriv]
    exact parameterDerivative_norm_le_disk_bound cRef c z₀ z r Δ n hseed
      (by simpa only [mem_closedBall, dist_eq_norm] using hc)

end IntMProof
