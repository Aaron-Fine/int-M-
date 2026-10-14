import IntMProof.RoundedBoxOrbit
import IntMProof.CertifiedRationalTile

/-!
# An executable rounded period-two tile certificate (J2 pilot)

Acceptance requires outward closure, divisor, and multiplier margins. A false
result means that this box is not certified; it is not an escape or repulsion
verdict. The exact-rational V0/V1 model consumes the resulting margins.
-/

namespace IntMProof

/-- The conjunction checked before reusing a critical period-two verdict. -/
abbrev roundedCriticalPeriodTwoChecks (scale : ℕ) (hscale : 0 < scale)
    (C : RationalBox) (t : Verifier.Thresholds) : Prop :=
  0 < t.attractUpper ∧
    (roundedBoxClosure scale hscale C rationalCriticalBox 2).normSqUpper ≤ t.acceptSquared ∧
    t.excludeSquared ≤ (roundedBoxClosure scale hscale C rationalCriticalBox 1).normSqLower ∧
    (roundedBoxMultiplier scale hscale C rationalCriticalBox 2).normSqUpper < t.attractUpper ^ 2

/-- A computable yes/no certificate using exact rational margin comparisons.
Failure requires subdivision or individual verification, not classification. -/
def certifyRoundedCriticalPeriodTwo (scale : ℕ) (hscale : 0 < scale)
    (C : RationalBox) (t : Verifier.Thresholds) : Bool :=
  decide (roundedCriticalPeriodTwoChecks scale hscale C t)

/-- The executable checker accepts exactly when all required margins hold. -/
theorem certifyRoundedCriticalPeriodTwo_iff (scale : ℕ) (hscale : 0 < scale)
    (C : RationalBox) (t : Verifier.Thresholds) :
    certifyRoundedCriticalPeriodTwo scale hscale C t = true ↔
      roundedCriticalPeriodTwoChecks scale hscale C t := by
  simp only [certifyRoundedCriticalPeriodTwo, decide_eq_true_eq]

/-- Any failed margin makes the certificate explicitly refuse the box. -/
theorem certifyRoundedCriticalPeriodTwo_refuses (scale : ℕ) (hscale : 0 < scale)
    (C : RationalBox) (t : Verifier.Thresholds)
    (hfail : ¬ roundedCriticalPeriodTwoChecks scale hscale C t) :
    certifyRoundedCriticalPeriodTwo scale hscale C t = false := by
  simp [certifyRoundedCriticalPeriodTwo, hfail]

/-- Rounded closure boxes enclose the exact-rational critical residual square. -/
theorem roundedCriticalResidual_interval (scale : ℕ) (hscale : 0 < scale)
    (C : RationalBox) (c : RationalComplex) (hc : C.contains (rationalComplexEmbed c)) (n : ℕ) :
    (roundedBoxClosure scale hscale C rationalCriticalBox n).normSqLower ≤
        rationalCriticalResidualSq c n ∧
      rationalCriticalResidualSq c n ≤
        (roundedBoxClosure scale hscale C rationalCriticalBox n).normSqUpper := by
  obtain ⟨hlo, hhi⟩ := roundedBoxClosure_normSq_interval scale hscale C rationalCriticalBox
    (rationalComplexEmbed c) (rationalComplexEmbed (0, 0)) hc (rationalPointBox_contains (0, 0)) n
  rw [← rationalOrbit_residualSq_embed] at hlo hhi
  simp only [sub_zero, rationalCriticalResidualSq] at hlo hhi ⊢
  exact ⟨by exact_mod_cast hlo, by exact_mod_cast hhi⟩

/-- A true certificate supplies the exact verifier's closure and proper-divisor
comparisons at every rational parameter in the original box. -/
theorem roundedCriticalPeriodTwo_margins (scale : ℕ) (hscale : 0 < scale)
    (C : RationalBox) (t : Verifier.Thresholds)
    (hcert : certifyRoundedCriticalPeriodTwo scale hscale C t = true)
    (c : RationalComplex) (hc : C.contains (rationalComplexEmbed c)) :
    t.excludeSquared ≤ rationalCriticalResidualSq c 1 ∧
      rationalCriticalResidualSq c 2 ≤ t.acceptSquared := by
  have h := (certifyRoundedCriticalPeriodTwo_iff scale hscale C t).mp hcert
  exact ⟨h.2.2.1.trans (roundedCriticalResidual_interval scale hscale C c hc 1).1,
    (roundedCriticalResidual_interval scale hscale C c hc 2).2.trans h.2.1⟩

/-- Accepted rounded margins imply the exact-rational V1 verdict and period
throughout the box. This is a tolerance verdict on the critical seed. -/
theorem roundedCriticalPeriodTwo_inline_accepts (scale : ℕ) (hscale : 0 < scale)
    (C : RationalBox) (t : Verifier.Thresholds)
    (hcert : certifyRoundedCriticalPeriodTwo scale hscale C t = true)
    (c : RationalComplex) (hc : C.contains (rationalComplexEmbed c))
    (iterations evidence : ℕ) (old : Verifier.Record Unit) :
    (Verifier.inline t (rationalCriticalFrame c) 2 iterations evidence old).1 = .accepted ∧
      (Verifier.inline t (rationalCriticalFrame c) 2 iterations evidence old).2.period = 2 := by
  obtain ⟨hdiv, hclose⟩ := roundedCriticalPeriodTwo_margins scale hscale C t hcert c hc
  have hpositive := ((certifyRoundedCriticalPeriodTwo_iff scale hscale C t).mp hcert).1
  have hproper : Verifier.properDivisors 2 = [1] := by decide
  have hnotdiv := not_lt.mpr hdiv
  have hnotclose := not_lt.mpr hclose
  have hnotexclude := not_lt.mpr (hclose.trans t.accept_lt_exclude.le)
  have hnotacceptdiv := not_le.mpr (lt_of_lt_of_le t.accept_lt_exclude hdiv)
  simp only [Verifier.inline, Verifier.decide, if_neg (by decide : (2 : ℕ) ≠ 0),
    rationalCriticalFrame, hnotexclude, hnotclose, hproper,
    Verifier.inlineReduction, hnotacceptdiv, hnotdiv, Verifier.finish]
  simp [hpositive]

/-- The reference exact-rational verifier has the same accepted output period. -/
theorem roundedCriticalPeriodTwo_reference_accepts (scale : ℕ) (hscale : 0 < scale)
    (C : RationalBox) (t : Verifier.Thresholds)
    (hcert : certifyRoundedCriticalPeriodTwo scale hscale C t = true)
    (c : RationalComplex) (hc : C.contains (rationalComplexEmbed c))
    (iterations evidence : ℕ) (old : Verifier.Record Unit) :
    (Verifier.reference t (rationalCriticalFrame c) 2 iterations evidence old).1 = .accepted ∧
      (Verifier.reference t (rationalCriticalFrame c) 2 iterations evidence old).2.period = 2 := by
  rw [← Verifier.inline_eq_reference]
  exact roundedCriticalPeriodTwo_inline_accepts scale hscale C t hcert c hc iterations evidence old

/-- The existing tile is certified after every endpoint is rounded on a
`2^64` grid. This exponent specifies grid spacing, not a binary64 format. -/
theorem rounded_periodTwo_tile_certified :
    certifyRoundedCriticalPeriodTwo 18446744073709551616 (by decide)
      periodTwoRationalTile periodTwoTileThresholds = true := by
  norm_num [certifyRoundedCriticalPeriodTwo, roundedCriticalPeriodTwoChecks,
    roundedBoxClosure, roundedBoxOrbit, roundedBoxMultiplier, roundBoxOutward,
    roundIntervalOutward, gridFloor, gridCeil, rationalBoxSub, rationalIntervalSub,
    rationalBoxStep, rationalBoxMul, rationalBoxDouble, rationalPointBox,
    RationalInterval.absLower, RationalInterval.absUpper, RationalBox.normSqUpper,
    RationalBox.normSqLower, rationalCriticalBox, periodTwoRationalTile, periodTwoTileThresholds]

/-- A coarse grid explicitly refuses the same tile when rounding loses its
separation margins, despite the finer certificate above. -/
theorem rounded_periodTwo_tile_coarse_refuses :
    certifyRoundedCriticalPeriodTwo 1 (by decide)
      periodTwoRationalTile periodTwoTileThresholds = false := by
  norm_num [certifyRoundedCriticalPeriodTwo, roundedCriticalPeriodTwoChecks,
    roundedBoxClosure, roundedBoxOrbit, roundedBoxMultiplier, roundBoxOutward,
    roundIntervalOutward, gridFloor, gridCeil, rationalBoxSub, rationalIntervalSub,
    rationalBoxStep, rationalBoxMul, rationalBoxDouble, rationalPointBox,
    RationalInterval.absLower, RationalInterval.absUpper, RationalBox.normSqUpper,
    RationalBox.normSqLower, rationalCriticalBox, periodTwoRationalTile, periodTwoTileThresholds]

/-- The computed fine-grid certificate certifies the exact-rational verifier
verdict for every rational parameter in the original tile. -/
theorem rounded_periodTwo_tile_inline_accepts (c : RationalComplex)
    (hc : periodTwoRationalTile.contains (rationalComplexEmbed c))
    (iterations evidence : ℕ) (old : Verifier.Record Unit) :
    (Verifier.inline periodTwoTileThresholds (rationalCriticalFrame c)
      2 iterations evidence old).1 = .accepted ∧
      (Verifier.inline periodTwoTileThresholds (rationalCriticalFrame c)
        2 iterations evidence old).2.period = 2 := by
  exact roundedCriticalPeriodTwo_inline_accepts 18446744073709551616 (by decide)
    periodTwoRationalTile periodTwoTileThresholds rounded_periodTwo_tile_certified
    c hc iterations evidence old

end IntMProof
