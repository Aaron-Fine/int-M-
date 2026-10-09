import IntMProof.ParameterJetHorner
import IntMProof.ParameterJetNonzeroDisk

/-!
# Composing decoded coefficient, Horner, and truncation errors (P4)

Coefficient discrepancies include the reference value at order zero. Operation
residuals concern the actual decoded Horner operands. The first composition
uses the same offset for evaluation and the target orbit; a separate theorem
charges offset mismatch through P3. These conditional contracts do not prove
IEEE754 operations, backend validity, or coefficient-generation accuracy.
-/

namespace IntMProof

/-- Disk amplification of errors in the inclusive retained coefficient range. -/
def parameterJetCoefficientErrorBudget (coefficientError : ℕ → ℝ)
    (Δ : ℝ) (order : ℕ) : ℝ :=
  ∑ k ∈ Finset.range (order + 1), coefficientError k * Δ ^ k

/-- Decoded coefficient errors amplify by powers of the offset radius.
Order zero includes reference-orbit error. -/
theorem parameterJetHorner_coefficient_error_le
    (c z δ : ℂ) (a : ℕ → ℂ) (coefficientError : ℕ → ℝ)
    (Δ : ℝ) (n order : ℕ) (hδ : ‖δ‖ ≤ Δ)
    (hcoeff : ∀ k ≤ order,
      ‖a k - parameterJetCoefficient c z n k‖ ≤ coefficientError k) :
    ‖parameterJetHorner a δ 0 order - parameterJetApproximation c z δ n order‖ ≤
      parameterJetCoefficientErrorBudget coefficientError Δ order := by
  rw [parameterJetHorner_eq_sum, parameterJetApproximation_eq_sum]
  simp only [Nat.zero_add]
  rw [← Finset.sum_sub_distrib]
  refine (norm_sum_le _ _).trans ?_
  unfold parameterJetCoefficientErrorBudget
  apply Finset.sum_le_sum
  intro k hk
  have hc := hcoeff k (Nat.lt_succ_iff.mp (Finset.mem_range.mp hk))
  rw [← sub_mul, Complex.norm_mul, Complex.norm_pow]
  exact mul_le_mul hc (pow_le_pow_left₀ (norm_nonneg _) hδ k)
    (pow_nonneg (norm_nonneg _) k) ((norm_nonneg _).trans hc)

/-- Local operation, coefficient, and exact truncation errors add.
The evaluated offset is exactly the offset defining the target parameter. -/
theorem parameterJetInexactHorner_error_le_orbit
    (c z δ : ℂ) (a : ℕ → ℂ) (mul add : ℂ → ℂ → ℂ)
    (Δ : ℝ) (ρMul ρAdd coefficientError : ℕ → ℝ) (truncation : ℝ)
    (n order : ℕ) (hδ : ‖δ‖ ≤ Δ)
    (hlocal : parameterJetHornerLocalErrors a δ mul add ρMul ρAdd 0 order)
    (hcoeff : ∀ k ≤ order,
      ‖a k - parameterJetCoefficient c z n k‖ ≤ coefficientError k)
    (htrunc : ‖parameterJetApproximation c z δ n order - orbit (c + δ) n z‖ ≤
      truncation) :
    ‖parameterJetInexactHorner a δ mul add 0 order - orbit (c + δ) n z‖ ≤
      parameterJetHornerRoundBudget Δ ρMul ρAdd 0 order +
        parameterJetCoefficientErrorBudget coefficientError Δ order + truncation := by
  have heq : parameterJetInexactHorner a δ mul add 0 order - orbit (c + δ) n z =
      (parameterJetInexactHorner a δ mul add 0 order - parameterJetHorner a δ 0 order) +
      (parameterJetHorner a δ 0 order - parameterJetApproximation c z δ n order) +
      (parameterJetApproximation c z δ n order - orbit (c + δ) n z) := by ring
  rw [heq]
  refine ((norm_add_le _ _).trans (add_le_add (norm_add_le _ _) le_rfl)).trans ?_
  exact add_le_add (add_le_add
    (parameterJetInexactHorner_error_le a δ mul add Δ ρMul ρAdd 0 order hδ hlocal)
    (parameterJetHorner_coefficient_error_le c z δ a coefficientError Δ n order hδ hcoeff))
    htrunc

/-- Offset decoding discrepancy is charged separately by the orbit-shift budget.
Comparison radii enclose the decoded-offset orbit through its earlier prefix. -/
theorem parameterJetInexactHorner_error_le_orbit_with_offset
    (c z decodedOffset targetOffset : ℂ) (a : ℕ → ℂ) (mul add : ℂ → ℂ → ℂ)
    (Δ χ : ℝ) (ρMul ρAdd coefficientError radius : ℕ → ℝ) (truncation : ℝ)
    (n order : ℕ) (hδ : ‖decodedOffset‖ ≤ Δ)
    (hlocal : parameterJetHornerLocalErrors a decodedOffset mul add ρMul ρAdd 0 order)
    (hcoeff : ∀ k ≤ order,
      ‖a k - parameterJetCoefficient c z n k‖ ≤ coefficientError k)
    (htrunc : ‖parameterJetApproximation c z decodedOffset n order -
      orbit (c + decodedOffset) n z‖ ≤ truncation)
    (hoffset : ‖targetOffset - decodedOffset‖ ≤ χ)
    (hr : ∀ j < n, ‖orbit (c + decodedOffset) j z‖ ≤ radius j) :
    ‖parameterJetInexactHorner a decodedOffset mul add 0 order -
      orbit (c + targetOffset) n z‖ ≤
      parameterJetHornerRoundBudget Δ ρMul ρAdd 0 order +
        parameterJetCoefficientErrorBudget coefficientError Δ order + truncation +
        errorBudget 0 radius (fun _ => χ) n := by
  have hparam : ‖(c + targetOffset) - (c + decodedOffset)‖ ≤ χ := by
    have heq : (c + targetOffset) - (c + decodedOffset) =
        targetOffset - decodedOffset := by ring
    rwa [heq]
  have hshift := orbit_norm_sub_le_budget (c + decodedOffset) (c + targetOffset)
    z z 0 χ radius n (by simp) hparam hr
  have heq : parameterJetInexactHorner a decodedOffset mul add 0 order -
      orbit (c + targetOffset) n z =
      (parameterJetInexactHorner a decodedOffset mul add 0 order -
        orbit (c + decodedOffset) n z) -
      (orbit (c + targetOffset) n z - orbit (c + decodedOffset) n z) := by ring
  rw [heq]
  exact (norm_sub_le _ _).trans (add_le_add
    (parameterJetInexactHorner_error_le_orbit c z decodedOffset a mul add Δ
      ρMul ρAdd coefficientError truncation n order hδ hlocal hcoeff htrunc) hshift)

/-- An arithmetic allowance fits within the minus-one disk certificate.
The coefficient and operation discrepancies are separate hypotheses. -/
theorem minusOneJet_horner_arithmetic_budget (n : ℕ) (hn : n ≤ 16) :
    parameterJetHornerRoundBudget (1 / 256) (fun _ => (1 / 1099511627776 : ℝ))
      (fun _ => (1 / 1099511627776 : ℝ)) 0 3 +
    parameterJetCoefficientErrorBudget (fun _ => (1 / 1099511627776 : ℝ)) (1 / 256) 3 +
    minusOneJetError n ≤ (1 / 1000000 : ℝ) := by
  interval_cases n <;>
    norm_num [parameterJetHornerRoundBudget, parameterJetCoefficientErrorBudget,
      Finset.sum_range_succ, minusOneJetError]

/-- Conditional decoded Horner evaluation preserves the minus-one disk cap
when coefficient and local operation errors each fit `2⁻⁴⁰`. The same decoded
`δ` defines the target orbit; no offset discrepancy is silently included. -/
theorem minusOneJet_inexactHorner_error_le
    (δ : ℂ) (a : ℕ → ℂ) (mul add : ℂ → ℂ → ℂ) (n : ℕ)
    (hn : n ≤ 16) (hδ : ‖δ‖ ≤ (1 / 256 : ℝ))
    (hlocal : parameterJetHornerLocalErrors a δ mul add
      (fun _ => (1 / 1099511627776 : ℝ)) (fun _ => (1 / 1099511627776 : ℝ)) 0 3)
    (hcoeff : ∀ k ≤ 3,
      ‖a k - parameterJetCoefficient (-1) 0 n k‖ ≤ (1 / 1099511627776 : ℝ)) :
    ‖parameterJetInexactHorner a δ mul add 0 3 - orbit (-1 + δ) n 0‖ ≤
      (1 / 1000000 : ℝ) := by
  exact (parameterJetInexactHorner_error_le_orbit (-1) 0 δ a mul add (1 / 256)
    (fun _ => (1 / 1099511627776 : ℝ)) (fun _ => (1 / 1099511627776 : ℝ))
    (fun _ => (1 / 1099511627776 : ℝ)) (minusOneJetError n) n 3 hδ hlocal hcoeff
    (minusOneJet_thirdOrder_error_le_enclosure δ n hn hδ)).trans
      (minusOneJet_horner_arithmetic_budget n hn)

end IntMProof
