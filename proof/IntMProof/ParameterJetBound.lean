import IntMProof.ParameterJet
import IntMProof.DerivativeBudget

/-!
# Finite-disk second-order parameter remainder (P4)

Exact complex norms bound coefficient growth and the local residual of the
quadratic parameter approximation. The existing P3 comparison then propagates
that residual over a finite prefix, uniformly for `‖δ‖ ≤ Δ`. Reference radii
remain inputs. This does not certify rounded coefficient generation or series
evaluation, and it does not assert a uniform bound over an infinite orbit.
-/

namespace IntMProof

/-- Radius recurrence for the quadratic parameter coefficient, with a fixed seed. -/
def parameterJetQuadraticBudget (radius : ℕ → ℝ) : ℕ → ℝ
  | 0 => 0
  | n + 1 => 2 * radius n * parameterJetQuadraticBudget radius n
      + parameterDerivativeBudget radius n ^ 2

/-- Nonnegative reference radii give a nonnegative quadratic coefficient budget. -/
theorem parameterJetQuadraticBudget_nonneg (radius : ℕ → ℝ) (n : ℕ)
    (hr : ∀ k < n, 0 ≤ radius k) : 0 ≤ parameterJetQuadraticBudget radius n := by
  induction n with
  | zero => simp [parameterJetQuadraticBudget]
  | succ n ih =>
    rw [parameterJetQuadraticBudget]
    exact add_nonneg
      (mul_nonneg (mul_nonneg zero_le_two (hr n (Nat.lt_succ_self n)))
        (ih (fun k hk => hr k (Nat.lt_succ_of_lt hk)))) (sq_nonneg _)

/-- A finite reference-radius prefix bounds the quadratic parameter coefficient. -/
theorem parameterJetQuadratic_norm_le_budget (c z : ℂ) (radius : ℕ → ℝ) (n : ℕ)
    (hr : ∀ k < n, ‖orbit c k z‖ ≤ radius k) :
    ‖parameterJetQuadratic c z n‖ ≤ parameterJetQuadraticBudget radius n := by
  induction n with
  | zero => simp [parameterJetQuadratic, parameterJetQuadraticBudget]
  | succ n ih =>
    have hn := hr n (Nat.lt_succ_self n)
    have hb := ih (fun k hk => hr k (Nat.lt_succ_of_lt hk))
    have hlinear := parameterDerivative_norm_le_budget c z radius n
      (fun k hk => hr k (Nat.lt_succ_of_lt hk))
    change ‖parameterJetLinear c z n‖ ≤ parameterDerivativeBudget radius n at hlinear
    rw [parameterJetQuadratic, parameterJetQuadraticBudget]
    calc
      _ ≤ ‖2 * orbit c n z * parameterJetQuadratic c z n‖
          + ‖parameterJetLinear c z n ^ 2‖ := norm_add_le _ _
      _ ≤ 2 * radius n * parameterJetQuadraticBudget radius n
          + parameterDerivativeBudget radius n ^ 2 := by
        rw [Complex.norm_mul, Complex.norm_mul, Complex.norm_two, Complex.norm_pow]
        refine add_le_add
          (mul_le_mul (mul_le_mul_of_nonneg_left hn zero_le_two) hb
            (norm_nonneg _) (mul_nonneg zero_le_two ((norm_nonneg _).trans hn))) ?_
        exact pow_le_pow_left₀ (norm_nonneg _) hlinear 2

/-- Triangle inequality for the cubic and quartic local truncation residual. -/
theorem secondOrderApproximation_residual_norm_le (c z δ : ℂ) (n : ℕ) :
    ‖secondOrderApproximation c z δ (n + 1)
        - quadratic (c + δ) (secondOrderApproximation c z δ n)‖ ≤
      2 * ‖parameterJetLinear c z n‖ * ‖parameterJetQuadratic c z n‖ * ‖δ‖ ^ 3
        + ‖parameterJetQuadratic c z n‖ ^ 2 * ‖δ‖ ^ 4 := by
  rw [secondOrderApproximation_step_residual, norm_neg]
  calc
    _ ≤ ‖2 * parameterJetLinear c z n * parameterJetQuadratic c z n * δ ^ 3‖
        + ‖parameterJetQuadratic c z n ^ 2 * δ ^ 4‖ := norm_add_le _ _
    _ = _ := by
      simp only [Complex.norm_mul, Complex.norm_pow, Complex.norm_two]

/-- Uniform local residual budget on a parameter disk of radius `Δ`. -/
def secondOrderForcing (radius : ℕ → ℝ) (Δ : ℝ) (n : ℕ) : ℝ :=
  2 * parameterDerivativeBudget radius n * parameterJetQuadraticBudget radius n * Δ ^ 3
    + parameterJetQuadraticBudget radius n ^ 2 * Δ ^ 4

/-- The local truncation residual obeys the supplied disk and radius budgets. -/
theorem secondOrderApproximation_residual_le_forcing
    (c z δ : ℂ) (radius : ℕ → ℝ) (Δ : ℝ) (n : ℕ)
    (hδ : ‖δ‖ ≤ Δ) (hr : ∀ k < n, ‖orbit c k z‖ ≤ radius k) :
    ‖secondOrderApproximation c z δ (n + 1)
        - quadratic (c + δ) (secondOrderApproximation c z δ n)‖ ≤
      secondOrderForcing radius Δ n := by
  have hB := parameterDerivative_norm_le_budget c z radius n hr
  change ‖parameterJetLinear c z n‖ ≤ parameterDerivativeBudget radius n at hB
  have hC := parameterJetQuadratic_norm_le_budget c z radius n hr
  have hC0 : 0 ≤ parameterJetQuadraticBudget radius n := (norm_nonneg _).trans hC
  refine (secondOrderApproximation_residual_norm_le c z δ n).trans ?_
  unfold secondOrderForcing
  apply add_le_add
  · exact mul_le_mul
      (mul_le_mul (mul_le_mul_of_nonneg_left hB zero_le_two) hC
        (norm_nonneg _) (mul_nonneg zero_le_two ((norm_nonneg _).trans hB)))
      (pow_le_pow_left₀ (norm_nonneg _) hδ 3) (pow_nonneg (norm_nonneg _) 3)
      (mul_nonneg (mul_nonneg zero_le_two ((norm_nonneg _).trans hB)) hC0)
  · exact mul_le_mul (pow_le_pow_left₀ (norm_nonneg _) hC 2)
      (pow_le_pow_left₀ (norm_nonneg _) hδ 4) (pow_nonneg (norm_nonneg _) 4)
      (sq_nonneg _)

/-- A uniform finite-disk error bound for the quadratic parameter approximation.
The radius prefix encloses the exact reference orbit. The target radii include
its parameter-shift budget; P3 propagates only the cubic/quartic residual.
Neither reference radii nor machine-operation errors are inferred. -/
theorem secondOrderApproximation_error_le_budget
    (c z δ : ℂ) (radius : ℕ → ℝ) (Δ : ℝ) (n : ℕ)
    (hδ : ‖δ‖ ≤ Δ) (hr : ∀ k < n, ‖orbit c k z‖ ≤ radius k) :
    ‖secondOrderApproximation c z δ n - orbit (c + δ) n z‖ ≤
      errorBudget 0 (fun k => radius k + errorBudget 0 radius (fun _ => Δ) k)
        (secondOrderForcing radius Δ) n := by
  apply inexactOrbit_error_le_budget (c + δ) z (secondOrderApproximation c z δ)
  · simp [secondOrderApproximation_zero]
  · intro k hk
    have hshift := orbit_norm_sub_le_budget c (c + δ) z z 0 Δ radius k
      (by simp) (by simpa using hδ) (fun j hj => hr j (hj.trans hk))
    calc
      ‖orbit (c + δ) k z‖ ≤ ‖orbit c k z‖ + ‖orbit (c + δ) k z - orbit c k z‖ :=
        norm_le_insert' _ _
      _ ≤ radius k + errorBudget 0 radius (fun _ => Δ) k := add_le_add (hr k hk) hshift
  · intro k hk
    exact secondOrderApproximation_residual_le_forcing c z δ radius Δ k hδ
      (fun j hj => hr j (hj.trans hk))

end IntMProof
