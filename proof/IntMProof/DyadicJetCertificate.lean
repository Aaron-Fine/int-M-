import IntMProof.DyadicIntegerJets

/-!
# Executable dyadic jet certificate about parameter minus one (P4)

The copied integer reference and seed give exact retained coefficients. A
42-bit fractional grid bounds each complex multiplication residual by `2⁻⁴⁰`;
addition is exact. The existing finite disk truncation certificate then closes
the total error through iterate sixteen. This is an unbounded-integer reference
algorithm, not binary64 or renderer refinement. The offset is the decoded grid
input, so a distinct intended parameter still needs an offset discrepancy bound.
-/

namespace IntMProof

/-- Generate four coefficients and evaluate them on the fixed 42-bit grid. -/
def minusOneDyadicJetEvaluate (δ : DyadicComplex) (n : ℕ) : DyadicComplex :=
  dyadicHorner 42 (dyadicGeneratedCoefficient 42 (dyadicMinusOne 42) dyadicZero 3 n) δ 0 3

/-- The proved multiplication allowance fits within every stored truncation row. -/
theorem minusOneDyadicJet_arithmetic_budget (n : ℕ) (hn : n ≤ 16) :
    parameterJetHornerRoundBudget (1 / 256) (fun _ => (4 / (2 : ℝ) ^ 42)) (fun _ => 0) 0 3 +
      minusOneJetError n ≤ (1 / 1000000 : ℝ) := by
  interval_cases n <;>
    norm_num [parameterJetHornerRoundBudget, minusOneJetError]

/-- Executable integer coefficient generation and evaluation retain the disk
cap without external coefficient or primitive-error hypotheses. -/
theorem minusOneDyadicJetEvaluate_error_le (δ : DyadicComplex) (n : ℕ)
    (hn : n ≤ 16) (hδ : ‖dyadicDecode 42 δ‖ ≤ (1 / 256 : ℝ)) :
    ‖dyadicDecode 42 (minusOneDyadicJetEvaluate δ n) -
      orbit (-1 + dyadicDecode 42 δ) n 0‖ ≤ (1 / 1000000 : ℝ) := by
  unfold minusOneDyadicJetEvaluate
  rw [dyadicDecode_horner]
  have hcoeff (k : ℕ) (hk : k ≤ 3) :
      ‖dyadicDecode 42 (dyadicGeneratedCoefficient 42 (dyadicMinusOne 42) dyadicZero 3 n k) -
        parameterJetCoefficient (-1) 0 n k‖ ≤ (0 : ℝ) := by
    rw [dyadicGeneratedCoefficient_minusOne_exact 42 3 n k hk]
    simp
  have h := parameterJetInexactHorner_error_le_orbit (-1) 0 (dyadicDecode 42 δ)
    (fun k => dyadicDecode 42
      (dyadicGeneratedCoefficient 42 (dyadicMinusOne 42) dyadicZero 3 n k))
    (dyadicComplexMultiply 42) (· + ·) (1 / 256)
    (fun _ => 4 / (2 : ℝ) ^ 42) (fun _ => 0) (fun _ => 0) (minusOneJetError n) n 3 hδ
    (dyadicHorner_local_errors 42 _ _ 0 3) hcoeff
    (minusOneJet_thirdOrder_error_le_enclosure _ n hn hδ)
  have htotal : parameterJetHornerRoundBudget (1 / 256) (fun _ => 4 / (2 : ℝ) ^ 42)
      (fun _ => 0) 0 3 +
      parameterJetCoefficientErrorBudget (fun _ => 0) (1 / 256) 3 + minusOneJetError n ≤
      (1 / 1000000 : ℝ) := by
    simpa [parameterJetCoefficientErrorBudget] using minusOneDyadicJet_arithmetic_budget n hn
  exact h.trans htotal

end IntMProof
