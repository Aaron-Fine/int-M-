import IntMProof.OutwardGrid
import IntMProof.StoredReference

/-!
# Executable rational certificates for stored-reference inputs

Rounded rational boxes certify stored-value and step-residual norm bounds.
The error recurrence is then evaluated exactly over arbitrary-size rationals,
and its cast agrees with the real recurrence from PR #19. Fixed-word machine
arithmetic and operation-error estimates are separate refinements.
-/

namespace IntMProof

/-- A rounded box of the local residual of a rational stored reference step. -/
def referenceStepResidualBox (scale : ℕ) (hscale : 0 < scale)
    (cRef current next : RationalComplex) : RationalBox :=
  roundBoxOutward scale hscale (rationalBoxSub (rationalPointBox next)
    (rationalBoxStep (rationalPointBox cRef) (rationalPointBox current)))

/-- The computed residual box contains the exact residual of the stored step. -/
theorem referenceStepResidualBox_sound (scale : ℕ) (hscale : 0 < scale)
    (cRef current next : RationalComplex) :
    (referenceStepResidualBox scale hscale cRef current next).contains
      (rationalComplexEmbed next - quadratic (rationalComplexEmbed cRef)
        (rationalComplexEmbed current)) := by
  exact roundBoxOutward_sound scale hscale _ _
    (rationalBoxSub_sound _ _ _ _ (rationalPointBox_contains next)
      (rationalBoxStep_sound _ _ _ _ (rationalPointBox_contains cRef)
        (rationalPointBox_contains current)))

/-- A nonnegative rational radius whose square exceeds the box upper bound
encloses the norm of every contained complex number. -/
theorem rationalBox_norm_le_of_upper (B : RationalBox) (z : ℂ) (R : ℚ)
    (hz : B.contains z) (hR : 0 ≤ R) (hupper : B.normSqUpper ≤ R ^ 2) :
    ‖z‖ ≤ (R : ℝ) := by
  have h := RationalBox.normSq_le_upper B z hz
  have hR' : (0 : ℝ) ≤ R := by exact_mod_cast hR
  have hu : (B.normSqUpper : ℝ) ≤ (R : ℝ) ^ 2 := by exact_mod_cast hupper
  rw [Complex.normSq_eq_norm_sq] at h
  nlinarith [norm_nonneg z]

/-- Squared rational comparisons certify the stored-step residual allowance. -/
theorem referenceStepResidual_norm_le (scale : ℕ) (hscale : 0 < scale)
    (cRef current next : RationalComplex) (ρ : ℚ) (hρ : 0 ≤ ρ)
    (hupper : (referenceStepResidualBox scale hscale cRef current next).normSqUpper ≤ ρ ^ 2) :
    ‖rationalComplexEmbed next - quadratic (rationalComplexEmbed cRef)
      (rationalComplexEmbed current)‖ ≤ (ρ : ℝ) := by
  exact rationalBox_norm_le_of_upper _ _ ρ
    (referenceStepResidualBox_sound scale hscale cRef current next) hρ hupper

/-- Exact rational evaluation of PR #19's stored-reference error recurrence. -/
def rationalStoredError (ε Δ : ℚ) (radius residual : ℕ → ℚ) : ℕ → ℚ
  | 0 => ε
  | n + 1 => 2 * radius n * rationalStoredError ε Δ radius residual n +
      rationalStoredError ε Δ radius residual n ^ 2 + (Δ + residual n)

/-- Casting the executable rational recurrence gives the real error bound. -/
theorem rationalStoredError_cast (ε Δ : ℚ) (radius residual : ℕ → ℚ) (n : ℕ) :
    (rationalStoredError ε Δ radius residual n : ℝ) =
      storedOrbitError ε Δ (fun k => (radius k : ℝ)) (fun k => (residual k : ℝ)) n := by
  induction n with
  | zero => rfl
  | succ n ih =>
    rw [rationalStoredError, storedOrbitError_succ]
    push_cast
    rw [ih]

/-- Computed stored-value and residual boxes discharge the local inputs of
the stored-reference budget theorem. Initial and parameter gaps are explicit. -/
theorem orbit_error_le_rationalStoredError (scale : ℕ) (hscale : 0 < scale)
    (cRef : RationalComplex) (c z : ℂ) (reference : ℕ → RationalComplex)
    (ε Δ : ℚ) (radius residual : ℕ → ℚ) (n : ℕ)
    (hinit : ‖z - rationalComplexEmbed (reference 0)‖ ≤ (ε : ℝ))
    (hparam : ‖c - rationalComplexEmbed cRef‖ ≤ (Δ : ℝ))
    (hr : ∀ k < n, 0 ≤ radius k ∧
      (roundBoxOutward scale hscale (rationalPointBox (reference k))).normSqUpper ≤ radius k ^ 2)
    (hρ : ∀ k < n, 0 ≤ residual k ∧
      (referenceStepResidualBox scale hscale cRef (reference k) (reference (k + 1))).normSqUpper ≤
        residual k ^ 2) :
    ‖orbit c n z - rationalComplexEmbed (reference n)‖ ≤
      (rationalStoredError ε Δ radius residual n : ℝ) := by
  rw [rationalStoredError_cast]
  apply orbit_sub_storedReference_le_budget
    (rationalComplexEmbed cRef) c z (fun k => rationalComplexEmbed (reference k))
    (ε : ℝ) (Δ : ℝ) (fun k => (radius k : ℝ)) (fun k => (residual k : ℝ)) n hinit hparam
  · intro k hk
    exact rationalBox_norm_le_of_upper _ _ (radius k)
      (roundBoxOutward_sound scale hscale _ _ (rationalPointBox_contains (reference k)))
      (hr k hk).1 (hr k hk).2
  · intro k hk
    exact referenceStepResidual_norm_le scale hscale cRef (reference k) (reference (k + 1))
      (residual k) (hρ k hk).1 (hρ k hk).2

/-- A biased reference step from PR #19 has a checkable outward residual
allowance on a finite grid, rather than an assumed backend residual bound. -/
theorem biased_reference_residual_grid_witness :
    (referenceStepResidualBox 4096 (by decide) (-1, 0)
      (1 / 1024, 0) (-1 + 1 / 1024, 0)).normSqUpper ≤ (1 / 256 : ℚ) ^ 2 ∧
    (referenceStepResidualBox 4096 (by decide) (-1, 0)
      (-1 + 1 / 1024, 0) (1 / 1024, 0)).normSqUpper ≤ (1 / 256 : ℚ) ^ 2 := by
  norm_num [referenceStepResidualBox, roundBoxOutward, roundIntervalOutward,
    gridFloor, gridCeil, rationalBoxSub, rationalIntervalSub, rationalBoxStep,
    rationalPointBox, RationalInterval.absLower, RationalInterval.absUpper, RationalBox.normSqUpper]

end IntMProof
