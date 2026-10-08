import IntMProof.ParameterJetCoefficientBound
import IntMProof.ParameterJetResidual

/-!
# Recursive finite-order parameter truncation budgets (P4)

The local residual of a retained jet involves only the square of that finite
prefix. Its coefficient caps and a disk radius supply a local forcing budget;
P3 then propagates the error. No coefficient of the full discarded orbit tail
is needed. These are exact-real contracts, not rounded arithmetic certificates.
-/

namespace IntMProof

/-- Uniform local residual cap from the retained positive coefficients alone.
Order zero additionally discards the offset term in the parameter itself. -/
def parameterJetRecursiveForcing (radius : ℕ → ℝ) (Δ : ℝ) (n order : ℕ) : ℝ :=
  (∑ ij ∈ parameterJetDiscardedPairs order,
    parameterJetCoefficientBudget radius n (ij.1 - 1) *
      parameterJetCoefficientBudget radius n (ij.2 - 1) * Δ ^ (ij.1 + ij.2)) +
    if order = 0 then Δ else 0

/-- Retaining just order zero omits exactly the parameter offset at each step. -/
@[simp] theorem parameterJetRecursiveForcing_zero
    (radius : ℕ → ℝ) (Δ : ℝ) (n : ℕ) :
    parameterJetRecursiveForcing radius Δ n 0 = Δ := by
  have hp : parameterJetDiscardedPairs 0 = ∅ := by decide
  simp [parameterJetRecursiveForcing, hp]

/-- At order two, the new forcing agrees with the earlier cubic/quartic budget. -/
theorem parameterJetRecursiveForcing_two
    (radius : ℕ → ℝ) (Δ : ℝ) (n : ℕ) :
    parameterJetRecursiveForcing radius Δ n 2 = secondOrderForcing radius Δ n := by
  have hp : parameterJetDiscardedPairs 2 = {(1, 2), (2, 1), (2, 2)} := by decide
  simp [parameterJetRecursiveForcing, hp, secondOrderForcing]
  ring

/-- The retained jet's local residual is bounded without inspecting any
coefficient of the full discarded orbit polynomial. -/
theorem parameterJetApproximation_residual_le_recursive_forcing
    (c z δ : ℂ) (radius : ℕ → ℝ) (Δ : ℝ) (n order : ℕ)
    (hδ : ‖δ‖ ≤ Δ) (hr : ∀ j < n, ‖orbit c j z‖ ≤ radius j) :
    ‖parameterJetApproximation c z δ (n + 1) order -
      quadratic (c + δ) (parameterJetApproximation c z δ n order)‖ ≤
      parameterJetRecursiveForcing radius Δ n order := by
  rw [parameterJetApproximation_local_residual]
  refine (norm_sub_le _ _).trans ?_
  rw [norm_neg]
  unfold parameterJetRecursiveForcing
  apply add_le_add
  · refine (norm_sum_le _ _).trans (Finset.sum_le_sum (fun ij hij => ?_))
    obtain ⟨hi, hj⟩ := parameterJetDiscardedPairs_positive order ij hij
    have hb₁ := parameterJetCoefficient_norm_le_budget c z radius n (ij.1 - 1) hr
    have hb₂ := parameterJetCoefficient_norm_le_budget c z radius n (ij.2 - 1) hr
    rw [Nat.sub_add_cancel hi] at hb₁
    rw [Nat.sub_add_cancel hj] at hb₂
    rw [Complex.norm_mul, Complex.norm_mul, Complex.norm_pow]
    exact mul_le_mul
      (mul_le_mul hb₁ hb₂ (norm_nonneg _) ((norm_nonneg _).trans hb₁))
      (pow_le_pow_left₀ (norm_nonneg _) hδ _) (pow_nonneg (norm_nonneg _) _)
      (mul_nonneg ((norm_nonneg _).trans hb₁) ((norm_nonneg _).trans hb₂))
  · split_ifs
    · exact hδ
    · simp

/-- P3 propagates retained-product residuals across any finite parameter disk.
The exact target radii include a justified parameter-shift enclosure. -/
theorem parameterJetApproximation_error_le_recursive_budget
    (c z δ : ℂ) (radius : ℕ → ℝ) (Δ : ℝ) (n order : ℕ)
    (hδ : ‖δ‖ ≤ Δ) (hr : ∀ k < n, ‖orbit c k z‖ ≤ radius k) :
    ‖parameterJetApproximation c z δ n order - orbit (c + δ) n z‖ ≤
      errorBudget 0 (fun k => radius k + errorBudget 0 radius (fun _ => Δ) k)
        (fun k => parameterJetRecursiveForcing radius Δ k order) n := by
  apply inexactOrbit_error_le_budget (c + δ) z
    (fun k => parameterJetApproximation c z δ k order)
  · simp [parameterJetApproximation_eq_sum, parameterJetCoefficient_initial]
  · intro k hk
    have hshift := orbit_norm_sub_le_budget c (c + δ) z z 0 Δ radius k
      (by simp) (by simpa using hδ) (fun j hj => hr j (hj.trans hk))
    calc
      ‖orbit (c + δ) k z‖ ≤ ‖orbit c k z‖ + ‖orbit (c + δ) k z - orbit c k z‖ :=
        norm_le_insert' _ _
      _ ≤ radius k + errorBudget 0 radius (fun _ => Δ) k := add_le_add (hr k hk) hshift
  · intro k hk
    exact parameterJetApproximation_residual_le_recursive_forcing c z δ radius Δ k order hδ
      (fun j hj => hr j (hj.trans hk))

end IntMProof
