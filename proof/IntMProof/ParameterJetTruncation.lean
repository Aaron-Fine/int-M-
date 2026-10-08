import IntMProof.ParameterJetTaylor
import Mathlib.Algebra.Polynomial.Div
import Mathlib.Analysis.Complex.Norm

/-!
# Finite truncations of the exact parameter polynomial (P4)

A truncation keeps orders zero through `order`. The discarded polynomial has
no coefficient at those orders, so it is divisible by `X ^ (order + 1)` in
any commutative ring. Complex norm bounds use the finite tail support and
caller-supplied coefficient caps. These are exact polynomial contracts, not
an efficient certificate generator or a floating-point refinement.
-/

namespace IntMProof

open Polynomial

section Algebra

variable {R : Type*} [CommRing R]

/-- Polynomial keeping offset coefficients through the stated inclusive order. -/
noncomputable def parameterJetPrefixPolynomial (c z : R) (n order : ℕ) : R[X] :=
  ∑ k ∈ Finset.range (order + 1), monomial k (parameterJetCoefficient c z n k)

/-- Evaluation of the retained finite parameter jet. -/
noncomputable def parameterJetApproximation (c z δ : R) (n order : ℕ) : R :=
  (parameterJetPrefixPolynomial c z n order).eval δ

/-- Exact discarded polynomial after retaining orders zero through `order`. -/
noncomputable def parameterJetTailPolynomial (c z : R) (n order : ℕ) : R[X] :=
  parameterTaylorPolynomial c z n - parameterJetPrefixPolynomial c z n order

/-- The retained jet is a finite sum in the offset. -/
theorem parameterJetApproximation_eq_sum (c z δ : R) (n order : ℕ) :
    parameterJetApproximation c z δ n order =
      ∑ k ∈ Finset.range (order + 1), parameterJetCoefficient c z n k * δ ^ k := by
  simp only [parameterJetApproximation, parameterJetPrefixPolynomial, eval_finsetSum,
    eval_monomial]

/-- Coefficients inside the retained range are copied; later ones are zero. -/
theorem parameterJetPrefixPolynomial_coeff (c z : R) (n order k : ℕ) :
    (parameterJetPrefixPolynomial c z n order).coeff k =
      if k ≤ order then parameterJetCoefficient c z n k else 0 := by
  simp [parameterJetPrefixPolynomial, finsetSum_coeff, coeff_monomial,
    Finset.mem_range]

/-- The discarded polynomial has no terms through the retained inclusive order. -/
theorem parameterJetTailPolynomial_coeff_zero (c z : R) (n order k : ℕ)
    (hk : k ≤ order) : (parameterJetTailPolynomial c z n order).coeff k = 0 := by
  simp [parameterJetTailPolynomial, parameterJetPrefixPolynomial_coeff,
    parameterJetCoefficient, hk]

/-- Truncation error is exactly the evaluation of the discarded polynomial. -/
theorem parameterJetTailPolynomial_eval (c z δ : R) (n order : ℕ) :
    (parameterJetTailPolynomial c z n order).eval δ =
      orbit (c + δ) n z - parameterJetApproximation c z δ n order := by
  simp only [parameterJetTailPolynomial, eval_sub, parameterTaylorPolynomial_eval,
    parameterJetApproximation]

/-- The first possible discarded order is `order + 1`, over any commutative ring. -/
theorem parameterJetTailPolynomial_dvd (c z : R) (n order : ℕ) :
    (X : R[X]) ^ (order + 1) ∣ parameterJetTailPolynomial c z n order := by
  apply X_pow_dvd_iff.mpr
  intro k hk
  exact parameterJetTailPolynomial_coeff_zero c z n order k (Nat.lt_succ_iff.mp hk)

/-- One polynomial quotient factors the remainder for every offset simultaneously.
The quotient may depend on the parameter, seed, iterate, and truncation order. -/
theorem parameterJetApproximation_remainder_factor (c z : R) (n order : ℕ) :
    ∃ q : R[X], ∀ δ : R,
      orbit (c + δ) n z - parameterJetApproximation c z δ n order =
        δ ^ (order + 1) * q.eval δ := by
  obtain ⟨q, hq⟩ := parameterJetTailPolynomial_dvd c z n order
  refine ⟨q, fun δ => ?_⟩
  rw [← parameterJetTailPolynomial_eval, hq, eval_mul, eval_pow, eval_X]

/-- The all-order API agrees with the existing second-order approximation. -/
theorem parameterJetApproximation_two (c z δ : R) (n : ℕ) :
    parameterJetApproximation c z δ n 2 = secondOrderApproximation c z δ n := by
  rw [parameterJetApproximation_eq_sum]
  simp [Finset.sum_range_succ, secondOrderApproximation]

/-- Keeping every coefficient makes the finite approximation exact. -/
theorem parameterJetApproximation_eq_orbit_of_natDegree_le
    (c z δ : R) (n order : ℕ) (hdegree : (parameterTaylorPolynomial c z n).natDegree ≤ order) :
    parameterJetApproximation c z δ n order = orbit (c + δ) n z := by
  unfold parameterJetApproximation
  rw [← parameterTaylorPolynomial_eval]
  apply congrArg (fun p : R[X] => p.eval δ)
  exact (as_sum_range' _ (order + 1) (Nat.lt_succ_iff.mpr hdegree)).symm

end Algebra

/-- A uniform finite-disk bound on truncation error from caps on discarded coefficients.
Every tail coefficient must be bounded; this does not derive the caps or bound
rounded coefficient generation and evaluation. -/
theorem parameterJetApproximation_error_le_tail_budget
    (c z δ : ℂ) (n order : ℕ) (Δ : ℝ) (budget : ℕ → ℝ)
    (hδ : ‖δ‖ ≤ Δ)
    (hbudget : ∀ k ∈ (parameterJetTailPolynomial c z n order).support,
      ‖(parameterJetTailPolynomial c z n order).coeff k‖ ≤ budget k) :
    ‖orbit (c + δ) n z - parameterJetApproximation c z δ n order‖ ≤
      ∑ k ∈ (parameterJetTailPolynomial c z n order).support, budget k * Δ ^ k := by
  rw [← parameterJetTailPolynomial_eval, eval_eq_sum, Polynomial.sum_def]
  refine (norm_sum_le _ _).trans ?_
  apply Finset.sum_le_sum
  intro k hk
  rw [Complex.norm_mul, Complex.norm_pow]
  exact mul_le_mul (hbudget k hk) (pow_le_pow_left₀ (norm_nonneg _) hδ k)
    (pow_nonneg (norm_nonneg _) k) ((norm_nonneg _).trans (hbudget k hk))

end IntMProof
