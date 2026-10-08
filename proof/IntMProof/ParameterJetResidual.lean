import IntMProof.ParameterJetTruncation

/-!
# Local residual from retained parameter coefficients (P4)

Squaring an inclusive order-`order` jet produces only pairs of retained
coefficients. The local residual discards pairs whose total order exceeds the
retained order. Order zero additionally omits the parameter offset itself.
-/

namespace IntMProof

open Polynomial

/-- Retained coefficient pairs discarded after squaring an inclusive jet. -/
def parameterJetDiscardedPairs (order : ℕ) : Finset (ℕ × ℕ) :=
  ((Finset.range (order + 1)).product (Finset.range (order + 1))).filter
    (fun ij => order < ij.1 + ij.2)

@[simp] theorem mem_parameterJetDiscardedPairs (order : ℕ) (ij : ℕ × ℕ) :
    ij ∈ parameterJetDiscardedPairs order ↔
      ij.1 ≤ order ∧ ij.2 ≤ order ∧ order < ij.1 + ij.2 := by
  simp [parameterJetDiscardedPairs, and_assoc]

/-- Both factors of a discarded pair have positive order. -/
theorem parameterJetDiscardedPairs_positive (order : ℕ) (ij : ℕ × ℕ)
    (hij : ij ∈ parameterJetDiscardedPairs order) : 0 < ij.1 ∧ 0 < ij.2 := by
  simp only [mem_parameterJetDiscardedPairs] at hij
  omega

variable {R : Type*} [CommRing R]

/-- Polynomial containing the high-order terms created by squaring the retained jet. -/
noncomputable def parameterJetDiscardedProductPolynomial
    (c z : R) (n order : ℕ) : R[X] :=
  ∑ ij ∈ parameterJetDiscardedPairs order,
    monomial (ij.1 + ij.2)
      (parameterJetCoefficient c z n ij.1 * parameterJetCoefficient c z n ij.2)

private theorem parameterJetPrefixPolynomial_square (c z : R) (n order : ℕ) :
    parameterJetPrefixPolynomial c z n order * parameterJetPrefixPolynomial c z n order =
      ∑ ij ∈ (Finset.range (order + 1)).product (Finset.range (order + 1)),
        monomial (ij.1 + ij.2)
          (parameterJetCoefficient c z n ij.1 * parameterJetCoefficient c z n ij.2) := by
  simp [parameterJetPrefixPolynomial, Finset.sum_product,
    Finset.mul_sum, monomial_mul_monomial, mul_comm]

/-- Discarding pairs keeps precisely the coefficients above the retained order. -/
theorem parameterJetDiscardedProductPolynomial_coeff
    (c z : R) (n order k : ℕ) :
    (parameterJetDiscardedProductPolynomial c z n order).coeff k =
      if order < k then
        (parameterJetPrefixPolynomial c z n order *
          parameterJetPrefixPolynomial c z n order).coeff k else 0 := by
  rw [parameterJetPrefixPolynomial_square]
  simp only [parameterJetDiscardedProductPolynomial, parameterJetDiscardedPairs,
    finsetSum_coeff, Finset.sum_filter, coeff_monomial]
  split_ifs with hk
  · apply Finset.sum_congr rfl
    intro ij _
    by_cases heq : ij.1 + ij.2 = k
    · simp [heq, hk]
    · split_ifs <;> simp_all [coeff_monomial]
  · apply Finset.sum_eq_zero
    intro ij _
    by_cases heq : ij.1 + ij.2 = k
    · simp [heq, hk]
    · split_ifs <;> simp_all [coeff_monomial]

private theorem parameterJetPrefixPolynomial_square_coeff_of_le
    (c z : R) (n order k : ℕ) (hk : k ≤ order) :
    (parameterJetPrefixPolynomial c z n order *
      parameterJetPrefixPolynomial c z n order).coeff k =
      ∑ ij ∈ Finset.antidiagonal k,
        parameterJetCoefficient c z n ij.1 * parameterJetCoefficient c z n ij.2 := by
  rw [coeff_mul]
  apply Finset.sum_congr rfl
  intro ij hij
  have hsum : ij.1 + ij.2 = k := Finset.mem_antidiagonal.mp hij
  have hi : ij.1 ≤ order := by omega
  have hj : ij.2 ≤ order := by omega
  simp [parameterJetPrefixPolynomial_coeff, hi, hj]

/-- Polynomial recurrence of the retained jet, with an explicit discarded product
and the missing offset term at order zero. -/
theorem parameterJetPrefixPolynomial_succ_residual
    (c z : R) (n order : ℕ) :
    parameterJetPrefixPolynomial c z (n + 1) order =
      parameterJetPrefixPolynomial c z n order *
        parameterJetPrefixPolynomial c z n order + X + C c -
        parameterJetDiscardedProductPolynomial c z n order -
        (if order = 0 then X else 0) := by
  ext k
  simp only [parameterJetPrefixPolynomial_coeff, coeff_sub, coeff_add,
    parameterJetDiscardedProductPolynomial_coeff, coeff_X, coeff_C]
  by_cases hk : k ≤ order
  · rw [if_pos hk, if_neg (by omega : ¬order < k),
      parameterJetPrefixPolynomial_square_coeff_of_le c z n order k hk,
      parameterJetCoefficient_succ]
    by_cases ho : order = 0
    · have hk0 : k = 0 := by omega
      simp [ho, hk0]
    · simp [ho, eq_comm]
  · rw [if_neg hk, if_pos (by omega : order < k)]
    by_cases ho : order = 0
    · simp [ho]
      have hk0 : k ≠ 0 := by omega
      simp [hk0, coeff_X]
    · have hk0 : k ≠ 0 := by omega
      have hk1 : k ≠ 1 := by omega
      simp [ho, hk0, hk1, eq_comm]

/-- Exact one-step residual uses only retained coefficients. For order zero,
the omitted parameter offset contributes the additional `-δ` term. -/
theorem parameterJetApproximation_local_residual
    (c z δ : R) (n order : ℕ) :
    parameterJetApproximation c z δ (n + 1) order -
      quadratic (c + δ) (parameterJetApproximation c z δ n order) =
      -(∑ ij ∈ parameterJetDiscardedPairs order,
        parameterJetCoefficient c z n ij.1 * parameterJetCoefficient c z n ij.2 *
          δ ^ (ij.1 + ij.2)) - (if order = 0 then δ else 0) := by
  unfold parameterJetApproximation
  rw [parameterJetPrefixPolynomial_succ_residual]
  simp only [eval_sub, eval_add, eval_mul, eval_X, eval_C,
    parameterJetDiscardedProductPolynomial, eval_finsetSum, eval_monomial]
  by_cases ho : order = 0 <;> simp [ho, quadratic] <;> ring

/-- A retained jet of every inclusive order starts at the fixed seed exactly. -/
@[simp] theorem parameterJetApproximation_initial
    (c z δ : R) (order : ℕ) : parameterJetApproximation c z δ 0 order = z := by
  rw [parameterJetApproximation_eq_sum]
  simp

/-- Once the linear order is retained, only high-order products contribute to
the one-step residual. -/
theorem parameterJetApproximation_local_residual_of_pos
    (c z δ : R) (n order : ℕ) (horder : 0 < order) :
    parameterJetApproximation c z δ (n + 1) order -
      quadratic (c + δ) (parameterJetApproximation c z δ n order) =
      -(∑ ij ∈ parameterJetDiscardedPairs order,
        parameterJetCoefficient c z n ij.1 * parameterJetCoefficient c z n ij.2 *
          δ ^ (ij.1 + ij.2)) := by
  rw [parameterJetApproximation_local_residual, if_neg (by omega : order ≠ 0), sub_zero]

end IntMProof
