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
