import IntMProof.ParameterJetEvaluation

namespace IntMProof

-- Nonzero start and inclusive leading coefficient: 3 + 2 * (4 + 2 * 5).
example : parameterJetHorner (fun k => (k : ℤ)) 2 3 2 = 31 := by decide

-- Order zero copies the coefficient even when all abstract operations are poisoned.
example : parameterJetInexactHorner (fun k => (k : ℂ)) 7
    (fun _ _ => 999) (fun _ _ => 888) 4 0 = 4 := by rfl

-- A copied leading coefficient needs no local residual cap.
example : parameterJetHornerLocalErrors (fun k => (k : ℂ)) 7
    (fun _ _ => 999) (fun _ _ => 888) (fun _ => -99) (fun _ => -99) 4 0 := by
  trivial

-- Bounds at the copied coefficient and all future indices may be negative.
example : parameterJetHornerLocalErrors (fun k => (k : ℂ)) 1
    (fun x y => x * y) (fun x y => x + y)
    (fun k => if k < 4 then 0 else -99) (fun k => if k < 4 then 0 else -99) 2 2 := by
  norm_num [parameterJetHornerLocalErrors, parameterJetInexactHorner]

-- Deliberate add/multiply residuals reproduce the linear (not squared) amplification.
example : parameterJetInexactHorner (fun _ => 0) 2
    (fun x y => x * y + 1) (fun x y => x + y + 2) 0 2 = 9 := by
  norm_num [parameterJetInexactHorner]

example : parameterJetHornerRoundBudget 2 (fun _ => 1) (fun _ => 2) 0 2 = 9 := by
  norm_num [parameterJetHornerRoundBudget]

-- Inclusive coefficient error includes the copied leading coefficient.
example : parameterJetCoefficientErrorBudget (fun k => if k = 2 then 1 else 0) 2 2 = 4 := by
  norm_num [parameterJetCoefficientErrorBudget, Finset.sum_range_succ]

-- Order-zero coefficient error is charged even though no operation is executed.
example : parameterJetCoefficientErrorBudget (fun _ => 3) 2 0 = 3 := by
  norm_num [parameterJetCoefficientErrorBudget]

-- Offset discrepancy uses only the decoded-orbit prefix; later radii may be negative.
example : ‖parameterJetInexactHorner (fun _ => 0) 0
    (fun x y => x * y) (fun x y => x + y) 0 0 - orbit (1 / 4) 1 0‖ ≤
    errorBudget 0 (fun j => if j = 0 then 0 else -99) (fun _ => 1 / 4) 1 := by
  have h := parameterJetInexactHorner_error_le_orbit_with_offset 0 0 0 (1 / 4)
    (fun _ => 0) (fun x y => x * y) (fun x y => x + y) 0 (1 / 4)
    (fun _ => 0) (fun _ => 0) (fun _ => 0)
    (fun j => if j = 0 then 0 else -99) 0 1 0 (by simp) (by trivial)
    (by
      intro k hk
      have hzero : k = 0 := by omega
      subst k
      simp [orbit_succ, quadratic])
    (by simp [parameterJetApproximation_eq_sum, parameterJetCoefficient_zero,
        orbit_succ, quadratic])
    (by
      simp only [sub_zero]
      have hcast : (1 / 4 : ℂ) = ((1 / 4 : ℝ) : ℂ) := by norm_num
      rw [hcast, Complex.norm_real]
      norm_num)
    (by
      intro j hj
      have hzero : j = 0 := by omega
      subst j
      simp)
  simpa [parameterJetHornerRoundBudget, parameterJetCoefficientErrorBudget] using h

end IntMProof
