import IntMProof.ErrorBudget
import IntMProof.VerifierModel

/-!
# Abstract glitch and repair gate for a verifier candidate

The verifier's rational frames and an approximate complex orbit are separate
inputs. This gate retains an accepted verifier result only when the chosen
period has an independent error-budget closure margin and the orbit state is
clean or repaired. An unresolved state cannot be accepted. The local residual
bounds remain caller obligations, including after repair. No machine arithmetic
or TypeScript refinement is asserted.
-/

namespace IntMProof

/-- State of the approximate orbit used for a candidate. A repaired orbit
must still have all local residuals enclosed by the supplied forcing bounds. -/
inductive GlitchState where
  | clean | repaired | unresolved
  deriving DecidableEq, Repr

/-- An orbit is usable only after it is clean or has been repaired. -/
def GlitchState.usable : GlitchState → Prop
  | .clean => True
  | .repaired => True
  | .unresolved => False

/-- The error-budget closure margin at the period selected by the verifier.
The budget is for the approximate orbit starting from `z`. -/
def closureMargin (z : ℂ) (approx : ℕ → ℂ) (ε τ : ℝ)
    (radius forcing : ℕ → ℝ) (period : ℕ) : Prop :=
  ‖approx period - z‖ + errorBudget ε radius forcing period ≤ τ

/-- A second gate for an accepted rational verifier decision. It checks the
orbit state and a norm-valued closure margin at the actual selected period,
which may be a proper divisor. If either check fails, the old record is
preserved. Other verifier verdicts pass through unchanged. -/
noncomputable def gatedReference {P : Type*}
    (t : Verifier.Thresholds) (frames : ℕ → Verifier.Frame P)
    (period iterations evidence : ℕ) (old : Verifier.Record P)
    (state : GlitchState) (z : ℂ) (approx : ℕ → ℂ)
    (ε τ : ℝ) (radius forcing : ℕ → ℝ) :
    Verifier.Verdict × Verifier.Record P := by
  classical
  let raw := Verifier.reference t frames period iterations evidence old
  exact if raw.1 = .accepted then
    if state.usable ∧ closureMargin z approx ε τ radius forcing raw.2.period then raw
    else (.closureAmbiguous, old)
  else raw

/-- The gate accepts only a usable state with a closure margin for the
period in the returned record. -/
theorem gatedReference_accepted_certificate {P : Type*}
    (t : Verifier.Thresholds) (frames : ℕ → Verifier.Frame P)
    (period iterations evidence : ℕ) (old : Verifier.Record P)
    (state : GlitchState) (z : ℂ) (approx : ℕ → ℂ)
    (ε τ : ℝ) (radius forcing : ℕ → ℝ)
    (hacc : (gatedReference t frames period iterations evidence old state z approx
      ε τ radius forcing).1 = .accepted) :
    state.usable ∧
      closureMargin z approx ε τ radius forcing
        (gatedReference t frames period iterations evidence old state z approx
          ε τ radius forcing).2.period := by
  classical
  let raw := Verifier.reference t frames period iterations evidence old
  change (if raw.1 = .accepted then
    if state.usable ∧ closureMargin z approx ε τ radius forcing raw.2.period then raw
    else (.closureAmbiguous, old) else raw).1 = .accepted at hacc
  change state.usable ∧ closureMargin z approx ε τ radius forcing
    (if raw.1 = .accepted then
      if state.usable ∧ closureMargin z approx ε τ radius forcing raw.2.period then raw
      else (.closureAmbiguous, old) else raw).2.period
  by_cases hraw : raw.1 = .accepted
  · by_cases hgate : state.usable ∧
        closureMargin z approx ε τ radius forcing raw.2.period
    · simp [hraw, hgate]
    · simp [hraw, hgate] at hacc
  · simp [hraw] at hacc

/-- A certified accepted result bounds the exact orbit's closure residual.
The caller supplies each reference radius and each local residual bound up to
the selected period. This theorem works for both clean and repaired states. -/
theorem gatedReference_accepted_exact_closure {P : Type*}
    (t : Verifier.Thresholds) (frames : ℕ → Verifier.Frame P)
    (period iterations evidence : ℕ) (old : Verifier.Record P)
    (state : GlitchState) (z : ℂ) (approx : ℕ → ℂ)
    (ε τ : ℝ) (radius forcing : ℕ → ℝ) (c : ℂ)
    (hε : ‖approx 0 - z‖ ≤ ε)
    (hr : ∀ k < (gatedReference t frames period iterations evidence old state z approx
      ε τ radius forcing).2.period, ‖orbit c k z‖ ≤ radius k)
    (hf : ∀ k < (gatedReference t frames period iterations evidence old state z approx
      ε τ radius forcing).2.period,
      ‖approx (k + 1) - quadratic c (approx k)‖ ≤ forcing k)
    (hacc : (gatedReference t frames period iterations evidence old state z approx
      ε τ radius forcing).1 = .accepted) :
    state.usable ∧
      ‖orbit c ((gatedReference t frames period iterations evidence old state z approx
        ε τ radius forcing).2.period) z - z‖ ≤ τ := by
  obtain ⟨husable, hmargin⟩ := gatedReference_accepted_certificate
    t frames period iterations evidence old state z approx ε τ radius forcing hacc
  let d := (gatedReference t frames period iterations evidence old state z approx
    ε τ radius forcing).2.period
  have hbudget := inexactOrbit_error_le_budget c z approx ε radius forcing d hε hr hf
  refine ⟨husable, ?_⟩
  have hsplit : orbit c d z - z = (orbit c d z - approx d) + (approx d - z) := by ring
  rw [hsplit]
  calc
    ‖(orbit c d z - approx d) + (approx d - z)‖
        ≤ ‖orbit c d z - approx d‖ + ‖approx d - z‖ := norm_add_le _ _
    _ ≤ errorBudget ε radius forcing d + ‖approx d - z‖ := by
      rw [norm_sub_rev]
      simpa [add_comm] using (add_le_add_right hbudget ‖approx d - z‖)
    _ ≤ τ := by simpa [closureMargin, d, add_comm] using hmargin

/-- The unresolved state always preserves the old record when the raw
verifier would have accepted. -/
theorem gatedReference_unresolved_refuses {P : Type*}
    (t : Verifier.Thresholds) (frames : ℕ → Verifier.Frame P)
    (period iterations evidence : ℕ) (old : Verifier.Record P)
    (z : ℂ) (approx : ℕ → ℂ) (ε τ : ℝ)
    (radius forcing : ℕ → ℝ)
    (hraw : (Verifier.reference t frames period iterations evidence old).1 = .accepted) :
    gatedReference t frames period iterations evidence old .unresolved z approx
      ε τ radius forcing = (.closureAmbiguous, old) := by
  simp [gatedReference, hraw, GlitchState.usable]

/-- A repaired candidate with an independently certified closure margin
retains the accepted verifier output. Repair does not bypass any numerical
premise: the caller must still supply the margin and local error bounds used
by `gatedReference_accepted_exact_closure`. -/
theorem gatedReference_repaired_passes {P : Type*}
    (t : Verifier.Thresholds) (frames : ℕ → Verifier.Frame P)
    (period iterations evidence : ℕ) (old : Verifier.Record P)
    (z : ℂ) (approx : ℕ → ℂ) (ε τ : ℝ)
    (radius forcing : ℕ → ℝ)
    (hraw : (Verifier.reference t frames period iterations evidence old).1 = .accepted)
    (hmargin : closureMargin z approx ε τ radius forcing
      (Verifier.reference t frames period iterations evidence old).2.period) :
    gatedReference t frames period iterations evidence old .repaired z approx
      ε τ radius forcing = Verifier.reference t frames period iterations evidence old := by
  simp [gatedReference, hraw, GlitchState.usable, hmargin]

end IntMProof
