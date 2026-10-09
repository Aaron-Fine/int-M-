import IntMProof.ParameterJetEvaluation

-- Guard the decoded Horner contracts and conditional arithmetic allowance.

/-- info: 'IntMProof.parameterJetHorner_eq_sum' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.parameterJetHorner_eq_sum

/-- info: 'IntMProof.parameterJetHorner_eq_approximation' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.parameterJetHorner_eq_approximation

/-- info: 'IntMProof.parameterJetInexactHorner_zero' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.parameterJetInexactHorner_zero

/-- info: 'IntMProof.parameterJetInexactHorner_error_le' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.parameterJetInexactHorner_error_le

/-- info: 'IntMProof.parameterJetHorner_coefficient_error_le' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.parameterJetHorner_coefficient_error_le

/-- info: 'IntMProof.parameterJetInexactHorner_error_le_orbit' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.parameterJetInexactHorner_error_le_orbit

/-- info: 'IntMProof.parameterJetInexactHorner_error_le_orbit_with_offset' depends on axioms: [propext,
 Classical.choice,
 Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.parameterJetInexactHorner_error_le_orbit_with_offset

/-- info: 'IntMProof.minusOneJet_horner_arithmetic_budget' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.minusOneJet_horner_arithmetic_budget

/-- info: 'IntMProof.minusOneJet_inexactHorner_error_le' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.minusOneJet_inexactHorner_error_le
