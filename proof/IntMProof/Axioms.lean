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
