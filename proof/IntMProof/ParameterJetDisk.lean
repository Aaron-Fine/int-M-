import IntMProof.ParameterJetRecursiveBound

/-!
# A concrete finite-disk jet certificate (P4)

At reference parameter and critical seed zero, all reference radii are exactly
zero. Retaining orders through three for four iterates gives a recursive
truncation error at most `1 / 10000` on the offset disk of radius `1 / 16`.
Only retained coefficient caps are used; machine arithmetic remains outside
this exact complex-norm certificate.
-/

namespace IntMProof

/-- Exact rational value of the recursive third-order budget on this disk. -/
theorem zeroReference_thirdOrder_recursive_budget_value :
    errorBudget 0
      (fun k => (0 : ℝ) + errorBudget 0 (fun _ => 0) (fun _ => (1 / 16 : ℝ)) k)
      (fun k => parameterJetRecursiveForcing (fun _ => 0) (1 / 16) k 3) 4 =
      (353859 / 4294967296 : ℝ) := by
  norm_num [errorBudget, parameterJetRecursiveForcing, parameterJetDiscardedPairs,
    Finset.sum_filter, Finset.sum_product, Finset.sum_range_succ,
    parameterJetCoefficientBudget, Finset.Nat.antidiagonal_succ,
    Finset.Nat.antidiagonal_zero, Finset.sum_map,
    parameterJetQuadraticBudget, parameterDerivativeBudget]

/-- The exact-real third-order budget is small on a concrete finite disk. -/
theorem zeroReference_thirdOrder_recursive_budget :
    errorBudget 0
      (fun k => (0 : ℝ) + errorBudget 0 (fun _ => 0) (fun _ => (1 / 16 : ℝ)) k)
      (fun k => parameterJetRecursiveForcing (fun _ => 0) (1 / 16) k 3) 4 ≤
      (1 / 10000 : ℝ) := by
  rw [zeroReference_thirdOrder_recursive_budget_value]
  norm_num

/-- Uniform third-order truncation error after four critical iterates
on the complex disk `‖δ‖ ≤ 1 / 16` about reference parameter zero. -/
theorem zeroReference_thirdOrder_error_le (δ : ℂ) (hδ : ‖δ‖ ≤ (1 / 16 : ℝ)) :
    ‖parameterJetApproximation 0 0 δ 4 3 - orbit δ 4 0‖ ≤ (1 / 10000 : ℝ) := by
  have href : ∀ k, orbit (0 : ℂ) k 0 = 0 := by
    intro k
    induction k with
    | zero => rfl
    | succ k ih => simp [orbit_succ, quadratic, ih]
  have hbound := parameterJetApproximation_error_le_recursive_budget
    0 0 δ (fun _ => 0) (1 / 16) 4 3 hδ (by simp [href])
  simpa using hbound.trans zeroReference_thirdOrder_recursive_budget

end IntMProof
