import IntMProof.VerifierPrefixCache

-- V2 frame-cache equivalence, shared cross-candidate reuse, the V0/V1 connection, and the
-- concrete evaluations.

/-- info: 'IntMProof.VerifierCache.cachedVerify_eq_recomputeVerify' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.VerifierCache.cachedVerify_eq_recomputeVerify

/-- info: 'IntMProof.VerifierCache.walk_divisor_eq_iterate' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.VerifierCache.walk_divisor_eq_iterate

/-- info: 'IntMProof.VerifierCache.cachedVerify_refusal_preserves' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.VerifierCache.cachedVerify_refusal_preserves

/-- info: 'IntMProof.VerifierCache.recomputeVerify_eq_reference' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.VerifierCache.recomputeVerify_eq_reference

/-- info: 'IntMProof.VerifierCache.cachedVerify_eq_reference' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.VerifierCache.cachedVerify_eq_reference

/-- info: 'IntMProof.VerifierCache.cachedVerify_eq_inline' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.VerifierCache.cachedVerify_eq_inline

/-- info: 'IntMProof.VerifierCache.cachedVerify_ne_nonFinite_of_finiteChecks' depends on axioms: [propext,
 Classical.choice,
 Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.VerifierCache.cachedVerify_ne_nonFinite_of_finiteChecks

/-- info: 'IntMProof.VerifierCache.cachedVerify_accepted_record' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.VerifierCache.cachedVerify_accepted_record

/-- info: 'IntMProof.VerifierCache.endCheckVerify_eq_recomputeVerify' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.VerifierCache.endCheckVerify_eq_recomputeVerify

/-- info: 'IntMProof.VerifierCache.realSlice_periodFour_reduces' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.VerifierCache.realSlice_periodFour_reduces

/-- info: 'IntMProof.VerifierCache.realSlice_periodFour_eq_reference' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.VerifierCache.realSlice_periodFour_eq_reference

/-- info: 'IntMProof.VerifierCache.recomputeVerify_eq_inline' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.VerifierCache.recomputeVerify_eq_inline

/-- info: 'IntMProof.VerifierCache.recomputeVerify_refusal_preserves' depends on axioms: [propext] -/
#guard_msgs in
#print axioms IntMProof.VerifierCache.recomputeVerify_refusal_preserves

/-- info: 'IntMProof.VerifierCache.recomputeVerify_ne_nonFinite_of_finiteChecks' depends on axioms: [propext,
 Classical.choice,
 Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.VerifierCache.recomputeVerify_ne_nonFinite_of_finiteChecks

/-- info: 'IntMProof.VerifierCache.sharedCachedVerify_eq_cachedVerify' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.VerifierCache.sharedCachedVerify_eq_cachedVerify

/-- info: 'IntMProof.VerifierCache.sharedCachedVerify_eq_recomputeVerify' depends on axioms: [propext,
 Classical.choice,
 Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.VerifierCache.sharedCachedVerify_eq_recomputeVerify

/-- info: 'IntMProof.VerifierCache.realSlice_periodFour_finiteChecks' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.VerifierCache.realSlice_periodFour_finiteChecks

/-- info: 'IntMProof.VerifierCache.realSlice_endCheck_eq_recompute' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.VerifierCache.realSlice_endCheck_eq_recompute

/-- info: 'IntMProof.VerifierCache.counter_nonFinite_branches' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.VerifierCache.counter_nonFinite_branches

/-- info: 'IntMProof.VerifierCache.counter_shared_truncation' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.VerifierCache.counter_shared_truncation

/-- info: 'IntMProof.VerifierCache.finiteRecord_prefix' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.VerifierCache.finiteRecord_prefix

/-- info: 'IntMProof.VerifierCache.lt_length_finiteRecord_iff_last' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.VerifierCache.lt_length_finiteRecord_iff_last

/-- info: 'IntMProof.VerifierCache.sharedEndCheckVerify_eq_endCheckVerify' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.VerifierCache.sharedEndCheckVerify_eq_endCheckVerify

/-- info: 'IntMProof.VerifierCache.sharedEndCheckVerify_eq_recomputeVerify' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.VerifierCache.sharedEndCheckVerify_eq_recomputeVerify
