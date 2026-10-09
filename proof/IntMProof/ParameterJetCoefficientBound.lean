import IntMProof.ParameterJetTaylor
import IntMProof.ParameterJetBound

/-!
# Recursive finite-order parameter coefficient budgets (P4)

The budget indexed by `k` bounds the positive-order coefficient `A_(k+1)`.
Its recurrence uses only the same and lower orders at the preceding iterate,
so a finite prefix can be computed without constructing the full orbit
polynomial. Supplied reference radii need enclose only the earlier iterates.
These exact-real bounds do not certify rounded coefficient generation.
-/

namespace IntMProof

/-- Recursive cap for coefficient order `k + 1`, with a fixed initial seed. -/
def parameterJetCoefficientBudget (radius : ℕ → ℝ) : ℕ → ℕ → ℝ
  | 0, _ => 0
  | n + 1, 0 => 2 * radius n * parameterJetCoefficientBudget radius n 0 + 1
  | n + 1, k + 1 => 2 * radius n * parameterJetCoefficientBudget radius n (k + 1)
      + ∑ ij ∈ Finset.antidiagonal k,
        parameterJetCoefficientBudget radius n ij.1 *
          parameterJetCoefficientBudget radius n ij.2

/-- Every positive-order coefficient starts at zero for a fixed seed. -/
@[simp] theorem parameterJetCoefficientBudget_initial (radius : ℕ → ℝ) (k : ℕ) :
    parameterJetCoefficientBudget radius 0 k = 0 := rfl

/-- The order-one budget has the sole parameter forcing term. -/
theorem parameterJetCoefficientBudget_linear_succ (radius : ℕ → ℝ) (n : ℕ) :
    parameterJetCoefficientBudget radius (n + 1) 0 =
      2 * radius n * parameterJetCoefficientBudget radius n 0 + 1 := rfl

/-- Higher-order budgets separate the reference endpoint terms from the
positive-order convolution; at index `k + 1`, only indices at most `k` occur
in that convolution. -/
theorem parameterJetCoefficientBudget_higher_succ (radius : ℕ → ℝ) (n k : ℕ) :
    parameterJetCoefficientBudget radius (n + 1) (k + 1) =
      2 * radius n * parameterJetCoefficientBudget radius n (k + 1)
        + ∑ ij ∈ Finset.antidiagonal k,
          parameterJetCoefficientBudget radius n ij.1 *
            parameterJetCoefficientBudget radius n ij.2 := rfl

/-- Nonnegative earlier radii give nonnegative caps at every positive order. -/
theorem parameterJetCoefficientBudget_nonneg (radius : ℕ → ℝ) (n k : ℕ)
    (hr : ∀ j < n, 0 ≤ radius j) :
    0 ≤ parameterJetCoefficientBudget radius n k := by
  induction n generalizing k with
  | zero => simp [parameterJetCoefficientBudget]
  | succ n ih =>
    have hn := hr n (Nat.lt_succ_self n)
    have hprefix : ∀ j < n, 0 ≤ radius j := fun j hj => hr j (Nat.lt_succ_of_lt hj)
    cases k with
    | zero =>
      exact add_nonneg
        (mul_nonneg (mul_nonneg zero_le_two hn) (ih 0 hprefix)) zero_le_one
    | succ k =>
      exact add_nonneg
        (mul_nonneg (mul_nonneg zero_le_two hn) (ih (k + 1) hprefix))
        (Finset.sum_nonneg (fun ij _ => mul_nonneg (ih ij.1 hprefix) (ih ij.2 hprefix)))

/-- Reference radii through iteration `n - 1` bound any positive-order
coefficient at iteration `n`. No future radii or higher-order caps are needed. -/
theorem parameterJetCoefficient_norm_le_budget
    (c z : ℂ) (radius : ℕ → ℝ) (n k : ℕ)
    (hr : ∀ j < n, ‖orbit c j z‖ ≤ radius j) :
    ‖parameterJetCoefficient c z n (k + 1)‖ ≤
      parameterJetCoefficientBudget radius n k := by
  induction n generalizing k with
  | zero => simp [parameterJetCoefficientBudget]
  | succ n ih =>
    have hn := hr n (Nat.lt_succ_self n)
    have hprefix : ∀ j < n, ‖orbit c j z‖ ≤ radius j :=
      fun j hj => hr j (Nat.lt_succ_of_lt hj)
    have hlinear (j : ℕ) :
        ‖2 * orbit c n z * parameterJetCoefficient c z n (j + 1)‖ ≤
          2 * radius n * parameterJetCoefficientBudget radius n j := by
      rw [Complex.norm_mul, Complex.norm_mul, Complex.norm_two]
      exact mul_le_mul (mul_le_mul_of_nonneg_left hn zero_le_two) (ih j hprefix)
        (norm_nonneg _) (mul_nonneg zero_le_two ((norm_nonneg _).trans hn))
    cases k with
    | zero =>
      have hrec : parameterJetCoefficient c z (n + 1) 1 =
          2 * orbit c n z * parameterJetCoefficient c z n 1 + 1 := by
        simp only [parameterJetCoefficient_one, parameterJetLinear_succ]
      rw [hrec, parameterJetCoefficientBudget]
      refine (norm_add_le _ _).trans ?_
      have hone : ‖(1 : ℂ)‖ = 1 := by
        rw [Complex.norm_def, Complex.normSq_one]
        norm_num
      rw [hone]
      exact add_le_add (hlinear 0) le_rfl
    | succ k =>
      rw [show k + 1 + 1 = k + 2 by omega,
        parameterJetCoefficient_succ_higher, parameterJetCoefficientBudget]
      refine (norm_add_le _ _).trans (add_le_add (hlinear (k + 1)) ?_)
      refine (norm_sum_le _ _).trans (Finset.sum_le_sum (fun ij _ => ?_))
      rw [Complex.norm_mul]
      exact mul_le_mul (ih ij.1 hprefix) (ih ij.2 hprefix) (norm_nonneg _)
        ((norm_nonneg _).trans (ih ij.1 hprefix))

/-- Order-one caps agree exactly with the established derivative budget. -/
@[simp] theorem parameterJetCoefficientBudget_zero (radius : ℕ → ℝ) (n : ℕ) :
    parameterJetCoefficientBudget radius n 0 = parameterDerivativeBudget radius n := by
  induction n with
  | zero => rfl
  | succ n ih => simp only [parameterJetCoefficientBudget, parameterDerivativeBudget, ih]

/-- Order-two caps agree exactly with the established quadratic coefficient budget. -/
@[simp] theorem parameterJetCoefficientBudget_one (radius : ℕ → ℝ) (n : ℕ) :
    parameterJetCoefficientBudget radius n 1 = parameterJetQuadraticBudget radius n := by
  induction n with
  | zero => rfl
  | succ n ih =>
    simp only [parameterJetCoefficientBudget, Finset.Nat.antidiagonal_zero,
      Finset.sum_singleton, parameterJetCoefficientBudget_zero, parameterJetQuadraticBudget, ih]
    ring

end IntMProof
