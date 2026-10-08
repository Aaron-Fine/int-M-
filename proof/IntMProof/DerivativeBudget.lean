import IntMProof.ErrorBudget
import IntMProof.Derivatives

/-!
# Uniform derivative budgets (J0)

A finite prefix of orbit radii bounds both the seed and constant-seed
parameter derivatives. Combining the orbit error budget with reference radii
makes the same derivative bounds valid throughout a norm-bounded region.
-/

namespace IntMProof

open Polynomial

/-- Recurrence bounding the seed derivative (the return multiplier). -/
def seedDerivativeBudget (radius : ℕ → ℝ) : ℕ → ℝ
  | 0 => 1
  | n + 1 => 2 * radius n * seedDerivativeBudget radius n

/-- Recurrence bounding the constant-seed parameter derivative. -/
def parameterDerivativeBudget (radius : ℕ → ℝ) : ℕ → ℝ
  | 0 => 0
  | n + 1 => 2 * radius n * parameterDerivativeBudget radius n + 1

/-- The seed derivative budget is nonnegative on a nonnegative radius prefix. -/
theorem seedDerivativeBudget_nonneg (radius : ℕ → ℝ) (n : ℕ)
    (hr : ∀ k < n, 0 ≤ radius k) : 0 ≤ seedDerivativeBudget radius n := by
  induction n with
  | zero => norm_num [seedDerivativeBudget]
  | succ n ih =>
    rw [seedDerivativeBudget]
    exact mul_nonneg (mul_nonneg zero_le_two (hr n (Nat.lt_succ_self n)))
      (ih (fun k hk => hr k (Nat.lt_succ_of_lt hk)))

/-- The parameter derivative budget is nonnegative on a nonnegative radius prefix. -/
theorem parameterDerivativeBudget_nonneg (radius : ℕ → ℝ) (n : ℕ)
    (hr : ∀ k < n, 0 ≤ radius k) : 0 ≤ parameterDerivativeBudget radius n := by
  induction n with
  | zero => simp [parameterDerivativeBudget]
  | succ n ih =>
    rw [parameterDerivativeBudget]
    exact add_nonneg
      (mul_nonneg (mul_nonneg zero_le_two (hr n (Nat.lt_succ_self n)))
        (ih (fun k hk => hr k (Nat.lt_succ_of_lt hk)))) zero_le_one

/-- A radius enclosure at every earlier iterate bounds the formal multiplier. -/
theorem seedDerivative_norm_le_budget (c z : ℂ) (radius : ℕ → ℝ) (n : ℕ)
    (hr : ∀ k < n, ‖orbit c k z‖ ≤ radius k) :
    ‖(derivative (seedPolynomial c n)).eval z‖ ≤ seedDerivativeBudget radius n := by
  induction n with
  | zero =>
    rw [seedPolynomial_derivative_zero, seedDerivativeBudget, Complex.norm_def,
      Complex.normSq_one]
    norm_num
  | succ n ih =>
    rw [seedPolynomial_derivative_succ, seedDerivativeBudget,
      Complex.norm_mul, Complex.norm_mul, Complex.norm_two]
    have hn := hr n (Nat.lt_succ_self n)
    have hb := ih (fun k hk => hr k (Nat.lt_succ_of_lt hk))
    exact mul_le_mul (mul_le_mul_of_nonneg_left hn zero_le_two) hb
      (norm_nonneg _) (mul_nonneg zero_le_two ((norm_nonneg _).trans hn))

/-- A radius enclosure at every earlier iterate bounds the constant-seed
parameter derivative. -/
theorem parameterDerivative_norm_le_budget (c z : ℂ) (radius : ℕ → ℝ) (n : ℕ)
    (hr : ∀ k < n, ‖orbit c k z‖ ≤ radius k) :
    ‖(derivative (parameterPolynomial (C z) n)).eval c‖ ≤
      parameterDerivativeBudget radius n := by
  induction n with
  | zero => simp [fixedSeed_parameter_derivative_zero, parameterDerivativeBudget]
  | succ n ih =>
    rw [parameterPolynomial_derivative_succ, eval_C, parameterDerivativeBudget]
    have hn := hr n (Nat.lt_succ_self n)
    have hb := ih (fun k hk => hr k (Nat.lt_succ_of_lt hk))
    calc
      ‖2 * orbit c n z * (derivative (parameterPolynomial (C z) n)).eval c + 1‖
          ≤ ‖2 * orbit c n z * (derivative (parameterPolynomial (C z) n)).eval c‖ + ‖(1 : ℂ)‖ :=
            norm_add_le _ _
      _ ≤ 2 * radius n * parameterDerivativeBudget radius n + 1 := by
        have hone : ‖(1 : ℂ)‖ = 1 := by
          rw [Complex.norm_def, Complex.normSq_one]
          norm_num
        rw [Complex.norm_mul, Complex.norm_mul, Complex.norm_two, hone]
        exact add_le_add
          (mul_le_mul (mul_le_mul_of_nonneg_left hn zero_le_two) hb
            (norm_nonneg _) (mul_nonneg zero_le_two ((norm_nonneg _).trans hn))) le_rfl

/-- Every orbit in the stated parameter/seed region has the same finite-prefix
orbit-radius and derivative bounds. The caller must enclose the reference orbit
and the parameter/seed differences, including any outward rounding. -/
theorem region_derivatives_le_budget (c₀ c₁ z₀ z₁ : ℂ) (ε Δ : ℝ)
    (radius : ℕ → ℝ) (n : ℕ)
    (hseed : ‖z₁ - z₀‖ ≤ ε) (hparam : ‖c₁ - c₀‖ ≤ Δ)
    (hr : ∀ k < n, ‖orbit c₀ k z₀‖ ≤ radius k) :
    let targetRadius := fun k => radius k + errorBudget ε radius (fun _ => Δ) k
    (∀ k < n, ‖orbit c₁ k z₁‖ ≤ targetRadius k) ∧
      ‖(derivative (seedPolynomial c₁ n)).eval z₁‖ ≤ seedDerivativeBudget targetRadius n ∧
      ‖(derivative (parameterPolynomial (C z₁) n)).eval c₁‖ ≤
        parameterDerivativeBudget targetRadius n := by
  dsimp
  have htarget : ∀ k < n,
      ‖orbit c₁ k z₁‖ ≤ radius k + errorBudget ε radius (fun _ => Δ) k := by
    intro k hk
    have hdiff := orbit_norm_sub_le_budget c₀ c₁ z₀ z₁ ε Δ radius k
      hseed hparam (fun j hj => hr j (lt_trans hj hk))
    have htri : ‖orbit c₁ k z₁‖ ≤
        ‖orbit c₀ k z₀‖ + ‖orbit c₁ k z₁ - orbit c₀ k z₀‖ := by
      have hsum : orbit c₀ k z₀ + (orbit c₁ k z₁ - orbit c₀ k z₀) =
          orbit c₁ k z₁ := by abel
      calc
        ‖orbit c₁ k z₁‖ =
            ‖orbit c₀ k z₀ + (orbit c₁ k z₁ - orbit c₀ k z₀)‖ :=
          congrArg norm hsum.symm
        _ ≤ _ := norm_add_le _ _
    exact htri.trans (add_le_add (hr k hk) hdiff)
  exact ⟨htarget,
    seedDerivative_norm_le_budget c₁ z₁ _ n htarget,
    parameterDerivative_norm_le_budget c₁ z₁ _ n htarget⟩

end IntMProof
