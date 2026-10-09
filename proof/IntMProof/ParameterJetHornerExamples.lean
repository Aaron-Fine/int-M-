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

end IntMProof
