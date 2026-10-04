import IntMProof.Derivatives
import Mathlib.Algebra.BigOperators.Group.Finset.Basic

/-! # Closed form of the constant-seed parameter derivative. -/

namespace IntMProof

open Polynomial

variable {R : Type*} [CommRing R]

/-- For `k < n`, the product at step `n + 1` is one factor longer than at step `n`. -/
private theorem parameterSum_length (n k : ℕ) (hk : k < n) :
    (n + 1) - (k + 1) = n - (k + 1) + 1 :=
  Nat.succ_sub (Nat.succ_le_of_lt hk)

/-- The new factor is `2 zₙ`, independent of the earlier sum index `k`. -/
private theorem parameterSum_factor_index (n k : ℕ) (hk : k < n) :
    k + 1 + (n - (k + 1)) = n :=
  Nat.add_sub_of_le (Nat.succ_le_of_lt hk)

private theorem mul_sum_range (a : R) (n : ℕ) (f : ℕ → R) :
    a * ∑ k ∈ Finset.range n, f k = ∑ k ∈ Finset.range n, a * f k := by
  induction n with
  | zero => rw [Finset.sum_range_zero, Finset.sum_range_zero, mul_zero]
  | succ n ih => rw [Finset.sum_range_succ, Finset.sum_range_succ, mul_add, ih]

/-- Closed form of the constant-seed parameter derivative `B₀ = 0`,
`Bₙ₊₁ = 2 zₙ Bₙ + 1`. The `k = n - 1` summand is an empty product, hence `1`. -/
theorem fixedSeed_parameter_derivative_eval_sum (z c : R) (n : ℕ) :
    (derivative (parameterPolynomial (C z) n)).eval c =
      ∑ k ∈ Finset.range n,
        ∏ t ∈ Finset.range (n - (k + 1)), (2 * orbit c (k + 1 + t) z) := by
  induction n with
  | zero =>
    rw [fixedSeed_parameter_derivative_zero, Finset.sum_range_zero]
  | succ n ih =>
    rw [parameterPolynomial_derivative_succ, eval_C, ih, Finset.sum_range_succ,
      Nat.sub_self, Finset.prod_range_zero]
    apply congrArg (· + (1 : R))
    rw [mul_sum_range]
    refine Finset.sum_congr rfl ?_
    intro k hk
    have hklt : k < n := Finset.mem_range.mp hk
    rw [parameterSum_length n k hklt, Finset.prod_range_succ,
      parameterSum_factor_index n k hklt]
    exact mul_comm _ _

end IntMProof
