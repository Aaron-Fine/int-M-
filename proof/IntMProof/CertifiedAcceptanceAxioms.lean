import IntMProof.CertifiedAcceptance

-- The verifier specification, the frame-value and threshold bridges, the threshold window,
-- and the non-vacuity instances are kernel checked.

/-- info: 'IntMProof.Verifier.reference_accepted_spec' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.Verifier.reference_accepted_spec

/-- info: 'IntMProof.Verifier.inline_accepted_spec' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.Verifier.inline_accepted_spec

/-- info: 'IntMProof.existsUnique_primitive_of_return_disk' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.existsUnique_primitive_of_return_disk

/-- info: 'IntMProof.existsUnique_primitive_critical_of_return_disk' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.existsUnique_primitive_critical_of_return_disk

/-- info: 'IntMProof.existsUnique_primitive_of_center_window' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.existsUnique_primitive_of_center_window

/-- info: 'IntMProof.existsUnique_primitive_critical_of_center_window' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.existsUnique_primitive_critical_of_center_window

/-- info: 'IntMProof.disk_return_hypotheses' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.disk_return_hypotheses

/-- info: 'IntMProof.stored_return_hypotheses' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.stored_return_hypotheses

/-- info: 'IntMProof.frame_windows_of_threshold_windows' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.frame_windows_of_threshold_windows

/-- info: 'IntMProof.existsUnique_primitive_of_reference_accepted' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.existsUnique_primitive_of_reference_accepted

/-- info: 'IntMProof.existsUnique_primitive_of_inline_accepted' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.existsUnique_primitive_of_inline_accepted

/-- info: 'IntMProof.existsUnique_primitive_critical_of_reference_accepted' depends on axioms: [propext,
 Classical.choice,
 Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.existsUnique_primitive_critical_of_reference_accepted

/-- info: 'IntMProof.existsUnique_primitive_critical_of_inline_accepted' depends on axioms: [propext,
 Classical.choice,
 Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.existsUnique_primitive_critical_of_inline_accepted

/-- info: 'IntMProof.existsUnique_primitive_of_reference_accepted_disk' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.existsUnique_primitive_of_reference_accepted_disk

/-- info: 'IntMProof.existsUnique_primitive_of_inline_accepted_disk' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.existsUnique_primitive_of_inline_accepted_disk

/-- info: 'IntMProof.existsUnique_primitive_of_reference_accepted_stored' depends on axioms: [propext,
 Classical.choice,
 Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.existsUnique_primitive_of_reference_accepted_stored

/-- info: 'IntMProof.existsUnique_primitive_of_inline_accepted_stored' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.existsUnique_primitive_of_inline_accepted_stored

/-- info: 'IntMProof.existsUnique_primitive_critical_of_reference_accepted_stored' depends on axioms: [propext,
 Classical.choice,
 Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.existsUnique_primitive_critical_of_reference_accepted_stored

/-- info: 'IntMProof.existsUnique_primitive_critical_of_inline_accepted_stored' depends on axioms: [propext,
 Classical.choice,
 Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.existsUnique_primitive_critical_of_inline_accepted_stored

/-- info: 'IntMProof.existsUnique_primitive_of_reference_accepted_thresholds' depends on axioms: [propext,
 Classical.choice,
 Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.existsUnique_primitive_of_reference_accepted_thresholds

/-- info: 'IntMProof.existsUnique_primitive_of_inline_accepted_thresholds' depends on axioms: [propext,
 Classical.choice,
 Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.existsUnique_primitive_of_inline_accepted_thresholds

/-- info: 'IntMProof.existsUnique_primitive_critical_of_reference_accepted_thresholds' depends on axioms: [propext,
 Classical.choice,
 Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.existsUnique_primitive_critical_of_reference_accepted_thresholds

/-- info: 'IntMProof.existsUnique_primitive_of_reference_accepted_stored_thresholds' depends on axioms: [propext,
 Classical.choice,
 Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.existsUnique_primitive_of_reference_accepted_stored_thresholds

/-- info: 'IntMProof.existsUnique_primitive_of_inline_accepted_stored_thresholds' depends on axioms: [propext,
 Classical.choice,
 Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.existsUnique_primitive_of_inline_accepted_stored_thresholds

/-- info: 'IntMProof.existsUnique_primitive_critical_of_reference_accepted_stored_thresholds' depends on axioms: [propext,
 Classical.choice,
 Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.existsUnique_primitive_critical_of_reference_accepted_stored_thresholds

/-- info: 'IntMProof.certifiedWindow_necessary' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.certifiedWindow_necessary

/-- info: 'IntMProof.thresholdWindow_ratio' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.thresholdWindow_ratio

/-- info: 'IntMProof.periodTwoTileThresholds_ratio' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.periodTwoTileThresholds_ratio

/-- info: 'IntMProof.thresholdWindow_rejects_weak_contraction' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.thresholdWindow_rejects_weak_contraction

/-- info: 'IntMProof.thresholdWindow_admits_moderate_contraction' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.thresholdWindow_admits_moderate_contraction

/-- info: 'IntMProof.frameWindow_admits_weak_contraction' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.frameWindow_admits_weak_contraction

/-- info: 'IntMProof.minusOne_certifiedAcceptance' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.minusOne_certifiedAcceptance

/-- info: 'IntMProof.minusOne_reduced_certifiedAcceptance' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.minusOne_reduced_certifiedAcceptance

/-- info: 'IntMProof.zero_certifiedAcceptance' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.zero_certifiedAcceptance

/-- info: 'IntMProof.minusOne_threshold_certifiedAcceptance' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.minusOne_threshold_certifiedAcceptance

/-- info: 'IntMProof.weakPeriodTwo_certifiedAcceptance' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.weakPeriodTwo_certifiedAcceptance

/-- info: 'IntMProof.weakPeriodTwo_threshold_divisor_window_fails' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.weakPeriodTwo_threshold_divisor_window_fails
