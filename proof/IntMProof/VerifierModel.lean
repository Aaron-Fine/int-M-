import Mathlib.Algebra.Order.Ring.Unbundled.Rat

/-!
# V0 and V1: ordered exact model of the shared verifier

An evaluated prefix supplies squared residuals and multiplier magnitudes as
exact rationals; accepted fields remain opaque. Finite-value checking and
the refinement from rounded TypeScript values are separate obligations.
-/
namespace IntMProof.Verifier

/-- Strictly separated closure and exclusion thresholds, and an attraction cutoff. -/
structure Thresholds where
  /-- A residual at or below this square is accepted as closure by the model. -/
  acceptSquared : ℚ
  /-- A residual at or above this square excludes a proper divisor. -/
  excludeSquared : ℚ
  /-- The accepted multiplier magnitude must be strictly below this number. -/
  attractUpper : ℚ
  accept_lt_exclude : acceptSquared < excludeSquared

/-- A caller-supplied finite frame with an opaque accepted payload. -/
structure Frame (Payload : Type*) where
  /-- Squared closure residual, supplied in exact rational arithmetic. -/
  residualSquared : ℚ
  /-- Magnitude of the multiplier, supplied in exact rational arithmetic. -/
  multiplierMagnitude : ℚ
  /-- All other accepted fields, including angle and logarithm outputs. -/
  fields : Payload

/-- Mutable classifier result represented as a pure record for comparison. -/
structure Record (Payload : Type*) where
  /-- Classification status; status two denotes accepted attracting. -/
  status : ℕ
  /-- Caller-owned iteration provenance. -/
  iterations : ℕ
  /-- Caller-owned evidence provenance. -/
  evidence : ℕ
  /-- Resolved primitive candidate period. -/
  period : ℕ
  /-- Complete remaining output fields. -/
  fields : Payload

/-- Ordered closure, divisor, and multiplier outcomes. -/
inductive Verdict where
  | noClosure | closureAmbiguous | divisorAmbiguous | notAttracting | accepted
  deriving DecidableEq, Repr

/-- Result of testing proper divisors in ascending order. -/
inductive Reduction where
  | keep | reduced (period : ℕ) | ambiguous
  deriving DecidableEq, Repr

/-- Enumerate positive proper divisors of `n` in ascending order. -/
def properDivisors (n : ℕ) : List ℕ :=
  (List.range n).filter (fun d => decide (0 < d ∧ d ∣ n))

theorem mem_properDivisors {n d : ℕ} :
    d ∈ properDivisors n ↔ 0 < d ∧ d ∣ n ∧ d < n := by
  simp [properDivisors, and_assoc, and_left_comm, and_comm]

/-- V0 finds the first divisor not clearly separated. -/
def referenceReduction {P : Type*} (t : Thresholds) (frames : ℕ → Frame P)
    (divisors : List ℕ) : Reduction :=
  match divisors.find? (fun d => decide ((frames d).residualSquared < t.excludeSquared)) with
  | none => .keep
  | some d =>
    if (frames d).residualSquared ≤ t.acceptSquared then .reduced d else .ambiguous

/-- V1 branches on accepted, ambiguous, and separated divisors in order. -/
def inlineReduction {P : Type*} (t : Thresholds) (frames : ℕ → Frame P) :
    List ℕ → Reduction
  | [] => .keep
  | d :: ds =>
    if (frames d).residualSquared ≤ t.acceptSquared then .reduced d
    else if (frames d).residualSquared < t.excludeSquared then .ambiguous
    else inlineReduction t frames ds

theorem inlineReduction_eq_reference {P : Type*} (t : Thresholds)
    (frames : ℕ → Frame P) (divisors : List ℕ) :
    inlineReduction t frames divisors = referenceReduction t frames divisors := by
  induction divisors with
  | nil => rfl
  | cons d ds ih =>
    by_cases ha : (frames d).residualSquared ≤ t.acceptSquared
    · have he : (frames d).residualSquared < t.excludeSquared :=
        lt_of_le_of_lt ha t.accept_lt_exclude
      simp [inlineReduction, referenceReduction, ha, he]
    · by_cases he : (frames d).residualSquared < t.excludeSquared
      · simp [inlineReduction, referenceReduction, ha, he]
      · simp [inlineReduction, referenceReduction, ha, he] at ih ⊢
        exact ih

/-- Only acceptance writes the complete result; provenance is caller supplied. -/
def finish {P : Type*} (t : Thresholds) (frames : ℕ → Frame P)
    (period iterations evidence : ℕ) (old : Record P) : Verdict × Record P :=
  if (frames period).multiplierMagnitude < t.attractUpper then
    (.accepted, ⟨2, iterations, evidence, period, (frames period).fields⟩)
  else (.notAttracting, old)

/-- Reference closure, divisor, and attraction decisions on a shared prefix. -/
def reference {P : Type*} (t : Thresholds) (frames : ℕ → Frame P)
    (period iterations evidence : ℕ) (old : Record P) : Verdict × Record P :=
  if period = 0 then (.noClosure, old)
  else if (frames period).residualSquared > t.excludeSquared then (.noClosure, old)
  else if (frames period).residualSquared > t.acceptSquared then (.closureAmbiguous, old)
  else match referenceReduction t frames (properDivisors period) with
    | .ambiguous => (.divisorAmbiguous, old)
    | .reduced d => finish t frames d iterations evidence old
    | .keep => finish t frames period iterations evidence old

/-- Inline ordered decisions on exactly the same supplied frames. -/
def inline {P : Type*} (t : Thresholds) (frames : ℕ → Frame P)
    (period iterations evidence : ℕ) (old : Record P) : Verdict × Record P :=
  if period = 0 then (.noClosure, old)
  else if (frames period).residualSquared > t.excludeSquared then (.noClosure, old)
  else if (frames period).residualSquared > t.acceptSquared then (.closureAmbiguous, old)
  else match inlineReduction t frames (properDivisors period) with
    | .ambiguous => (.divisorAmbiguous, old)
    | .reduced d => finish t frames d iterations evidence old
    | .keep => finish t frames period iterations evidence old

/-- Equal evaluated prefixes yield the same verdict and accepted fields. -/
theorem inline_eq_reference {P : Type*} (t : Thresholds) (frames : ℕ → Frame P)
    (period iterations evidence : ℕ) (old : Record P) :
    inline t frames period iterations evidence old =
      reference t frames period iterations evidence old := by
  simp only [inline, reference, inlineReduction_eq_reference]

theorem reference_refusal_preserves {P : Type*} (t : Thresholds)
    (frames : ℕ → Frame P) (period iterations evidence : ℕ) (old : Record P)
    (hrefuse : (reference t frames period iterations evidence old).1 ≠ .accepted) :
    (reference t frames period iterations evidence old).2 = old := by
  unfold reference at hrefuse ⊢
  split_ifs at hrefuse ⊢ <;> try rfl
  split <;> try rfl
  all_goals
    simp only [finish] at hrefuse ⊢
    split_ifs at hrefuse ⊢ <;> simp_all

theorem inline_refusal_preserves {P : Type*} (t : Thresholds)
    (frames : ℕ → Frame P) (period iterations evidence : ℕ) (old : Record P)
    (hrefuse : (inline t frames period iterations evidence old).1 ≠ .accepted) :
    (inline t frames period iterations evidence old).2 = old := by
  rw [inline_eq_reference] at hrefuse ⊢
  exact reference_refusal_preserves t frames period iterations evidence old hrefuse
end IntMProof.Verifier
