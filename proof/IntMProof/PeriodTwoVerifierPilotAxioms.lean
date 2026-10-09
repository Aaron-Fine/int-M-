import IntMProof.PeriodTwoVerifierPilot

-- Both the rational margins and the conditional transfer are kernel checked.

/-- info: 'IntMProof.periodTwoVerifierPilot_divisor_lower' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.periodTwoVerifierPilot_divisor_lower

/-- info: 'IntMProof.periodTwoVerifierPilot_closure_upper' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.periodTwoVerifierPilot_closure_upper

/-- info: 'IntMProof.periodTwoVerifierPilot_residual_margins' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.periodTwoVerifierPilot_residual_margins

/-- info: 'IntMProof.periodTwoVerifierPilot_inline_of_margins' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.periodTwoVerifierPilot_inline_of_margins

/-- info: 'IntMProof.periodTwoVerifierPilot_audited_accepts' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.periodTwoVerifierPilot_audited_accepts
