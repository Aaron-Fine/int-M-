import IntMProof

-- Run `lake env lean IntMProof/Axioms.lean`; each guard fails if the axiom set changes.
/-- info: 'IntMProof.orbit_zero' does not depend on any axioms -/
#guard_msgs in
#print axioms IntMProof.orbit_zero

/-- info: 'IntMProof.orbit_succ' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.orbit_succ

/-- info: 'IntMProof.orbit_add' depends on axioms: [propext] -/
#guard_msgs in
#print axioms IntMProof.orbit_add

/-- info: 'IntMProof.exactPeriod_iff_prime_quotient' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.exactPeriod_iff_prime_quotient

/-- info: 'IntMProof.exactPeriod_iff_closure_and_prime_quotients' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.exactPeriod_iff_closure_and_prime_quotients

/-- info: 'IntMProof.exactPeriod_iff_proper_divisors' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.exactPeriod_iff_proper_divisors

/-- info: 'IntMProof.exactPeriod_iff_closure_and_proper_divisors' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.exactPeriod_iff_closure_and_proper_divisors

/-- info: 'IntMProof.prime_quotients_iff_proper_divisors' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.prime_quotients_iff_proper_divisors

/-- info: 'IntMProof.exactPeriod_iff_first_return' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.exactPeriod_iff_first_return

/-- info: 'IntMProof.criticalPeriod_iff_prime_quotients' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.criticalPeriod_iff_prime_quotients

/-- info: 'IntMProof.criticalPeriod_iff_proper_divisors' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.criticalPeriod_iff_proper_divisors

/-- info: 'IntMProof.seedPolynomial_derivative_succ' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.seedPolynomial_derivative_succ

/-- info: 'IntMProof.seedPolynomial_derivative_eval_prod' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.seedPolynomial_derivative_eval_prod

/-- info: 'IntMProof.parameterPolynomial_derivative_succ' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.parameterPolynomial_derivative_succ

/-- info: 'IntMProof.minimalPeriod_map' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.minimalPeriod_map

/-- info: 'IntMProof.transport_minimalPeriod' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.transport_minimalPeriod

/-- info: 'IntMProof.negChart_minimalPeriod' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.negChart_minimalPeriod

/-- info: 'IntMProof.conjugate_minimalPeriod' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.conjugate_minimalPeriod

/-- info: 'IntMProof.Verifier.mem_properDivisors' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.Verifier.mem_properDivisors

/-- info: 'IntMProof.Verifier.inlineReduction_eq_reference' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.Verifier.inlineReduction_eq_reference

/-- info: 'IntMProof.Verifier.inline_eq_reference' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.Verifier.inline_eq_reference

/-- info: 'IntMProof.Verifier.reference_refusal_preserves' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.Verifier.reference_refusal_preserves

/-- info: 'IntMProof.Verifier.inline_refusal_preserves' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.Verifier.inline_refusal_preserves

/-- info: 'IntMProof.conjugate_seedDerivative' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.conjugate_seedDerivative

/-- info: 'IntMProof.conjugate_seedDerivative_normSq' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.conjugate_seedDerivative_normSq

/-- info: 'IntMProof.fixedSeed_parameter_derivative_eval_sum' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.fixedSeed_parameter_derivative_eval_sum

/-- info: 'IntMProof.conjugate_fixedSeed_parameterDerivative' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.conjugate_fixedSeed_parameterDerivative

/-- info: 'IntMProof.conjugate_fixedSeed_parameterDerivative_normSq' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.conjugate_fixedSeed_parameterDerivative_normSq

/-- info: 'IntMProof.seedDerivative_periodic_phase' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.seedDerivative_periodic_phase

/-- info: 'IntMProof.perturbation_zero' depends on axioms: [propext] -/
#guard_msgs in
#print axioms IntMProof.perturbation_zero

/-- info: 'IntMProof.perturbation_succ' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.perturbation_succ

/-- info: 'IntMProof.Verifier.properDivisors_pairwise' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.Verifier.properDivisors_pairwise

/-- info: 'IntMProof.Verifier.inlineReduction_eq_reduced_iff' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.Verifier.inlineReduction_eq_reduced_iff

/-- info: 'IntMProof.Verifier.referenceReduction_eq_reduced_iff' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.Verifier.referenceReduction_eq_reduced_iff

/-- info: 'IntMProof.Verifier.referenceReduction_reduced_least' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.Verifier.referenceReduction_reduced_least

/-- info: 'IntMProof.period1_fixedPoint' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.period1_fixedPoint

/-- info: 'IntMProof.period1_seedDerivative' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.period1_seedDerivative

/-- info: 'IntMProof.period2_return' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.period2_return

/-- info: 'IntMProof.period2_orbit' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.period2_orbit

/-- info: 'IntMProof.period2_product' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.period2_product

/-- info: 'IntMProof.period2_seedDerivative' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.period2_seedDerivative

/-- info: 'IntMProof.period2_ne_of_discriminant' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.period2_ne_of_discriminant

/-- info: 'IntMProof.period2_not_fixedPoint' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.period2_not_fixedPoint

/-- info: 'IntMProof.period2_minimalPeriod' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.period2_minimalPeriod

/-- info: 'IntMProof.period2_bulb_abs' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.period2_bulb_abs

/-- info: 'IntMProof.period2_bulb_ne' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.period2_bulb_ne

/-- info: 'IntMProof.mainCardioid_inequality' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.mainCardioid_inequality

/-- info: 'IntMProof.hasDerivAt_orbit_fixedSeed' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.hasDerivAt_orbit_fixedSeed

/-- info: 'IntMProof.hasDerivAt_orbit_fixedParameter' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.hasDerivAt_orbit_fixedParameter

/-- info: 'IntMProof.hasDerivAt_orbit_total' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.hasDerivAt_orbit_total

/-- info: 'IntMProof.branch_slope' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.branch_slope

/-- info: 'IntMProof.branch_denominator_phase' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.branch_denominator_phase

/-- info: 'IntMProof.exists_periodic_implicitSection' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.exists_periodic_implicitSection

/-- info: 'IntMProof.exists_branch_slope' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.exists_branch_slope

/-- info: 'IntMProof.perturbation_norm_succ' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.perturbation_norm_succ

/-- info: 'IntMProof.seedShift_norm_le_perturbationBound' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.seedShift_norm_le_perturbationBound

/-- info: 'IntMProof.perturbation_norm_le_bound' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.perturbation_norm_le_bound

/-- info: 'IntMProof.mapsTo_closedBall_of_lipschitzOnWith' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.mapsTo_closedBall_of_lipschitzOnWith

/-- info: 'IntMProof.existsUnique_fixedPoint_closedBall' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.existsUnique_fixedPoint_closedBall

/-- info: 'IntMProof.existsUnique_fixedPoint_orbit_of_multiplier_le' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.existsUnique_fixedPoint_orbit_of_multiplier_le

/-- info: 'IntMProof.rebase_reconstruct' depends on axioms: [propext] -/
#guard_msgs in
#print axioms IntMProof.rebase_reconstruct

/-- info: 'IntMProof.rebase_delta' depends on axioms: [propext] -/
#guard_msgs in
#print axioms IntMProof.rebase_delta

/-- info: 'IntMProof.predictorDisplacement_eq' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.predictorDisplacement_eq

/-- info: 'IntMProof.predictorDisplacement_le' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.predictorDisplacement_le

/-- info: 'IntMProof.branch_predictor_remainder' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.branch_predictor_remainder

/-- info: 'IntMProof.existsUnique_critical_return_of_entry' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.existsUnique_critical_return_of_entry

/-- info: 'IntMProof.minimalPeriod_return_fixedPoint_iff' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.minimalPeriod_return_fixedPoint_iff

-- Rebase extensions and conditional error-budget contracts.
/-- info: 'IntMProof.rebaseDelta_reconstruct' depends on axioms: [propext] -/
#guard_msgs in
#print axioms IntMProof.rebaseDelta_reconstruct

/-- info: 'IntMProof.rebaseDelta_reverse' depends on axioms: [propext] -/
#guard_msgs in
#print axioms IntMProof.rebaseDelta_reverse

/-- info: 'IntMProof.rebaseDelta_comp' depends on axioms: [propext] -/
#guard_msgs in
#print axioms IntMProof.rebaseDelta_comp

/-- info: 'IntMProof.rebase_parameter' depends on axioms: [propext] -/
#guard_msgs in
#print axioms IntMProof.rebase_parameter

/-- info: 'IntMProof.rebase_perturbation' depends on axioms: [propext] -/
#guard_msgs in
#print axioms IntMProof.rebase_perturbation

/-- info: 'IntMProof.quadratic_reconstruct' depends on axioms: [propext] -/
#guard_msgs in
#print axioms IntMProof.quadratic_reconstruct

/-- info: 'IntMProof.rebase_resume_orbit' depends on axioms: [propext] -/
#guard_msgs in
#print axioms IntMProof.rebase_resume_orbit

/-- info: 'IntMProof.errorBudget_zero' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.errorBudget_zero

/-- info: 'IntMProof.errorBudget_succ' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.errorBudget_succ

/-- info: 'IntMProof.errorBudget_const' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.errorBudget_const

/-- info: 'IntMProof.errorBudget_nonneg' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.errorBudget_nonneg

/-- info: 'IntMProof.inexactOrbit_error_succ' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.inexactOrbit_error_succ

/-- info: 'IntMProof.inexactOrbit_error_le_budget' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.inexactOrbit_error_le_budget

/-- info: 'IntMProof.reconstruction_residual' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.reconstruction_residual

/-- info: 'IntMProof.reconstruction_residual_norm_le' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.reconstruction_residual_norm_le

/-- info: 'IntMProof.rebase_error_norm_le' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.rebase_error_norm_le

/-- info: 'IntMProof.errorBudget_mono' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.errorBudget_mono

/-- info: 'IntMProof.orbit_norm_sub_le_budget' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.orbit_norm_sub_le_budget

/-- info: 'IntMProof.reconstruction_error_le_budget' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.reconstruction_error_le_budget

/-- info: 'IntMProof.inexactOrbit_error_le_budget_from' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.inexactOrbit_error_le_budget_from

/-- info: 'IntMProof.critical_mem_closedBall_of_error_budget' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.critical_mem_closedBall_of_error_budget

/-- info: 'IntMProof.existsUnique_critical_return_of_error_budget' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.existsUnique_critical_return_of_error_budget
