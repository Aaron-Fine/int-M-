import IntMProof.CertifiedRationalTile

/-!
# A bounded numerical-verifier correctness bridge

The executable pilot decodes its finite binary64 inputs, squared residuals,
and thresholds into exact rationals. Its trusted checker supplies the two
absolute residual-error inequalities below. These theorems show that those
checks suffice for both verifier models to accept period two, including the
complete caller-owned output record. They do not formalize JavaScript or
assert exact critical periodicity; the independent tile trap theorem supplies
the primitive attracting cycle.
-/

namespace IntMProof

/-- A deliberately broad strict separation of the proper divisor from the
small machine exclusion cutoff. -/
theorem periodTwoVerifierPilot_divisor_lower :
    (1 / 2 : ℚ) ≤
      (rationalBoxClosure periodTwoRationalTile rationalCriticalBox 1).normSqLower := by
  norm_num [periodTwoRationalTile, rationalCriticalBox, rationalBoxClosure,
    rationalBoxOrbit, rationalBoxStep, rationalBoxSub, rationalIntervalSub,
    rationalPointBox, RationalBox.normSqLower, RationalInterval.absLower,
    RationalInterval.absUpper]

/-- The exact closure square is far below the decoded machine acceptance
cutoff, leaving room for the explicitly audited residual-square error. -/
theorem periodTwoVerifierPilot_closure_upper :
    (rationalBoxClosure periodTwoRationalTile rationalCriticalBox 2).normSqUpper ≤
      (1 / 1000000000000000000 : ℚ) := by
  norm_num [periodTwoRationalTile, rationalCriticalBox, rationalBoxClosure,
    rationalBoxOrbit, rationalBoxStep, rationalBoxSub, rationalIntervalSub,
    rationalPointBox, RationalBox.normSqUpper, RationalInterval.absUpper,
    RationalInterval.absLower]

/-- Strong margins for the exact rational critical frames. -/
theorem periodTwoVerifierPilot_residual_margins (c : RationalComplex)
    (hc : periodTwoRationalTile.contains (rationalComplexEmbed c)) :
    (1 / 2 : ℚ) ≤ rationalCriticalResidualSq c 1 ∧
      rationalCriticalResidualSq c 2 ≤ (1 / 1000000000000000000 : ℚ) := by
  have hz := rationalPointBox_contains (0, 0)
  have hlo := rationalBoxClosure_normSq_ge periodTwoRationalTile
    rationalCriticalBox (rationalComplexEmbed c) (rationalComplexEmbed (0, 0))
    hc hz 1
  have hhi := rationalBoxClosure_normSq_le periodTwoRationalTile
    rationalCriticalBox (rationalComplexEmbed c) (rationalComplexEmbed (0, 0))
    hc hz 2
  rw [← rationalOrbit_residualSq_embed] at hlo hhi
  simp only [sub_zero, rationalCriticalResidualSq] at hlo hhi ⊢
  constructor
  · have hbox : ((1 / 2 : ℚ) : ℝ) ≤
        ((rationalBoxClosure periodTwoRationalTile rationalCriticalBox 1).normSqLower : ℝ) :=
      by exact_mod_cast periodTwoVerifierPilot_divisor_lower
    exact_mod_cast hbox.trans hlo
  · have hbox :
        ((rationalBoxClosure periodTwoRationalTile rationalCriticalBox 2).normSqUpper : ℝ) ≤
          ((1 / 1000000000000000000 : ℚ) : ℝ) :=
      by exact_mod_cast periodTwoVerifierPilot_closure_upper
    exact_mod_cast hhi.trans hbox

/-- Direct finite-frame transfer. The acceptance record retains exactly the
frame payload and provenance supplied by the caller. No accuracy claim is
made about opaque payload fields. -/
theorem periodTwoVerifierPilot_inline_of_margins {P : Type*}
    (t : Verifier.Thresholds) (frames : ℕ → Verifier.Frame P)
    (iterations evidence : ℕ) (old : Verifier.Record P)
    (hdiv : t.excludeSquared ≤ (frames 1).residualSquared)
    (hclosure : (frames 2).residualSquared ≤ t.acceptSquared)
    (hattract : (frames 2).multiplierMagnitude < t.attractUpper) :
    Verifier.inline t frames 2 iterations evidence old =
      (.accepted, ⟨2, iterations, evidence, 2, (frames 2).fields⟩) := by
  have hproper : Verifier.properDivisors 2 = [1] := by decide
  have hnotdiv := not_lt.mpr hdiv
  have hnotacceptdiv : ¬ (frames 1).residualSquared ≤ t.acceptSquared :=
    not_le.mpr (lt_of_lt_of_le t.accept_lt_exclude hdiv)
  have hnotclose := not_lt.mpr hclosure
  have hnotexclude := not_lt.mpr (hclosure.trans t.accept_lt_exclude.le)
  simp [Verifier.inline, Verifier.decide, hproper, Verifier.inlineReduction,
    hnotdiv, hnotacceptdiv, hnotclose, hnotexclude, Verifier.finish, hattract]

/-- Auditing the two squared residual errors and the decoded cutoff margins
closes the numerical-to-verdict bridge on the stated tile. -/
theorem periodTwoVerifierPilot_audited_accepts {P : Type*}
    (c : RationalComplex)
    (hc : periodTwoRationalTile.contains (rationalComplexEmbed c))
    (t : Verifier.Thresholds) (frames : ℕ → Verifier.Frame P)
    (iterations evidence : ℕ) (old : Verifier.Record P)
    (haccept : (1 / 100000000000000000 : ℚ) ≤ t.acceptSquared)
    (hexclude : t.excludeSquared ≤ (1 / 100000000000 : ℚ))
    (hattract : 0 < t.attractUpper)
    (herrorDiv : |(frames 1).residualSquared - rationalCriticalResidualSq c 1| ≤
      (1 / 1000000000000 : ℚ))
    (herrorClosure : |(frames 2).residualSquared - rationalCriticalResidualSq c 2| ≤
      (1 / 1000000000000000000 : ℚ))
    (hmultiplier : (frames 2).multiplierMagnitude = 0) :
    Verifier.inline t frames 2 iterations evidence old =
      (.accepted, ⟨2, iterations, evidence, 2, (frames 2).fields⟩) ∧
    Verifier.reference t frames 2 iterations evidence old =
      (.accepted, ⟨2, iterations, evidence, 2, (frames 2).fields⟩) := by
  obtain ⟨hdiv, hclosure⟩ := periodTwoVerifierPilot_residual_margins c hc
  obtain ⟨herrorDivLo, _⟩ := abs_le.mp herrorDiv
  obtain ⟨_, herrorClosureHi⟩ := abs_le.mp herrorClosure
  have hdivMachine : t.excludeSquared ≤ (frames 1).residualSquared := by linarith
  have hclosureMachine : (frames 2).residualSquared ≤ t.acceptSquared := by linarith
  have hm : (frames 2).multiplierMagnitude < t.attractUpper := by
    simpa only [hmultiplier] using hattract
  have hin := periodTwoVerifierPilot_inline_of_margins t frames iterations evidence old
    hdivMachine hclosureMachine hm
  exact ⟨hin, (Verifier.inline_eq_reference t frames 2 iterations evidence old).symm.trans hin⟩

end IntMProof
