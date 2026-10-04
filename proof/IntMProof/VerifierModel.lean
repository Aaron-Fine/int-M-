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
  simp only [properDivisors, List.mem_filter, List.mem_range, decide_eq_true_iff]
  exact ⟨fun ⟨hlt, hpos, hdvd⟩ => ⟨hpos, hdvd, hlt⟩,
    fun ⟨hpos, hdvd, hlt⟩ => ⟨hlt, hpos, hdvd⟩⟩

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

/-- Shared closure, divisor, and attraction decisions. The reference and inline
procedures differ only by the reduction they supply. -/
def decide {P : Type*}
    (reduce : Thresholds → (ℕ → Frame P) → List ℕ → Reduction)
    (t : Thresholds) (frames : ℕ → Frame P)
    (period iterations evidence : ℕ) (old : Record P) : Verdict × Record P :=
  if period = 0 then (.noClosure, old)
  else if (frames period).residualSquared > t.excludeSquared then (.noClosure, old)
  else if (frames period).residualSquared > t.acceptSquared then (.closureAmbiguous, old)
  else match reduce t frames (properDivisors period) with
    | .ambiguous => (.divisorAmbiguous, old)
    | .reduced d => finish t frames d iterations evidence old
    | .keep => finish t frames period iterations evidence old

/-- Reference closure, divisor, and attraction decisions on a shared prefix. -/
def reference {P : Type*} (t : Thresholds) (frames : ℕ → Frame P)
    (period iterations evidence : ℕ) (old : Record P) : Verdict × Record P :=
  decide referenceReduction t frames period iterations evidence old

/-- Inline ordered decisions on exactly the same supplied frames. -/
def inline {P : Type*} (t : Thresholds) (frames : ℕ → Frame P)
    (period iterations evidence : ℕ) (old : Record P) : Verdict × Record P :=
  decide inlineReduction t frames period iterations evidence old

/-- Equal evaluated prefixes yield the same verdict and accepted fields. -/
theorem inline_eq_reference {P : Type*} (t : Thresholds) (frames : ℕ → Frame P)
    (period iterations evidence : ℕ) (old : Record P) :
    inline t frames period iterations evidence old =
      reference t frames period iterations evidence old := by
  simp only [inline, reference, decide, inlineReduction_eq_reference]

theorem reference_refusal_preserves {P : Type*} (t : Thresholds)
    (frames : ℕ → Frame P) (period iterations evidence : ℕ) (old : Record P)
    (hrefuse : (reference t frames period iterations evidence old).1 ≠ .accepted) :
    (reference t frames period iterations evidence old).2 = old := by
  unfold reference decide at hrefuse ⊢
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

/-- Proper divisors are a strictly increasing sublist of `List.range`. -/
theorem properDivisors_pairwise (n : ℕ) : (properDivisors n).Pairwise (· < ·) := by
  unfold properDivisors
  exact List.Pairwise.filter _ List.pairwise_lt_range

/-- `.reduced d` means `d` is accepted and every earlier residual is excluded. -/
theorem inlineReduction_eq_reduced_iff {P : Type*} (t : Thresholds)
    (frames : ℕ → Frame P) (divisors : List ℕ) (d : ℕ) :
    inlineReduction t frames divisors = .reduced d ↔
      ∃ pre post, divisors = pre ++ d :: post ∧
        (frames d).residualSquared ≤ t.acceptSquared ∧
        ∀ e ∈ pre, t.excludeSquared ≤ (frames e).residualSquared := by
  induction divisors with
  | nil =>
    constructor
    · intro h
      simp only [inlineReduction] at h
      injection h
    · intro hpack
      have ⟨_pre, _post, hsplit, _, _⟩ := hpack
      cases _pre <;> cases hsplit
  | cons head ds ih =>
    by_cases ha : (frames head).residualSquared ≤ t.acceptSquared
    · constructor
      · intro hr
        simp only [inlineReduction, if_pos ha] at hr
        injection hr with hd
        subst hd
        exact ⟨[], ds, rfl, ha, fun _e he => nomatch he⟩
      · intro hpack
        have ⟨pre, _post, hsplit, _hacc, hpre⟩ := hpack
        cases pre with
        | nil =>
          simp only [List.nil_append] at hsplit
          cases hsplit
          simp only [inlineReduction, if_pos ha]
        | cons _e pre =>
          simp only [List.cons_append] at hsplit
          cases hsplit
          exact absurd (hpre head List.mem_cons_self)
            (not_le_of_gt (lt_of_le_of_lt ha t.accept_lt_exclude))
    · by_cases hex : (frames head).residualSquared < t.excludeSquared
      · constructor
        · intro hr
          simp only [inlineReduction, if_neg ha, if_pos hex] at hr
          injection hr
        · intro hpack
          have ⟨pre, _post, hsplit, hacc, hpre⟩ := hpack
          cases pre with
          | nil =>
            simp only [List.nil_append] at hsplit
            cases hsplit
            exact absurd hacc ha
          | cons _e pre =>
            simp only [List.cons_append] at hsplit
            cases hsplit
            exact absurd (hpre head List.mem_cons_self) (not_le_of_gt hex)
      · have hsep : t.excludeSquared ≤ (frames head).residualSquared := le_of_not_gt hex
        constructor
        · intro hr
          simp only [inlineReduction, if_neg ha, if_neg hex] at hr
          have ⟨pre, post, hsplit, hacc, hpre⟩ := ih.mp hr
          refine ⟨head :: pre, post, ?_, hacc, ?_⟩
          · simp [hsplit]
          · intro e he
            simp only [List.mem_cons] at he
            cases he with
            | inl heq =>
              cases heq
              exact hsep
            | inr hepre =>
              exact hpre e hepre
        · intro hpack
          have ⟨pre, post, hsplit, hacc, hpre⟩ := hpack
          simp only [inlineReduction, if_neg ha, if_neg hex]
          cases pre with
          | nil =>
            simp only [List.nil_append] at hsplit
            cases hsplit
            exact absurd hacc ha
          | cons _e pre =>
            simp only [List.cons_append] at hsplit
            cases hsplit
            exact ih.mpr ⟨pre, post, rfl, hacc,
              fun x hx => hpre x (List.mem_cons_of_mem _ hx)⟩

/-- Reference reduction agrees with the inline characterization of `.reduced`. -/
theorem referenceReduction_eq_reduced_iff {P : Type*} (t : Thresholds)
    (frames : ℕ → Frame P) (divisors : List ℕ) (d : ℕ) :
    referenceReduction t frames divisors = .reduced d ↔
      ∃ pre post, divisors = pre ++ d :: post ∧
        (frames d).residualSquared ≤ t.acceptSquared ∧
        ∀ e ∈ pre, t.excludeSquared ≤ (frames e).residualSquared := by
  rw [← inlineReduction_eq_reference]
  exact inlineReduction_eq_reduced_iff t frames divisors d

/-- The reduced proper divisor is accepted and every smaller proper divisor is excluded. -/
theorem referenceReduction_reduced_least {P : Type*} (t : Thresholds)
    (frames : ℕ → Frame P) (period d : ℕ)
    (hred : referenceReduction t frames (properDivisors period) = .reduced d) :
    d ∈ properDivisors period ∧
      (frames d).residualSquared ≤ t.acceptSquared ∧
      ∀ e ∈ properDivisors period, e < d →
        t.excludeSquared ≤ (frames e).residualSquared := by
  have ⟨pre, post, hsplit, hacc, hpre⟩ :=
    (referenceReduction_eq_reduced_iff t frames (properDivisors period) d).mp hred
  have hpw := properDivisors_pairwise period
  rw [hsplit] at hpw
  have hparts := List.pairwise_append.mp hpw
  have hpre_lt : ∀ e ∈ pre, e < d :=
    fun e he => hparts.2.2 e he d List.mem_cons_self
  have hpost_gt : ∀ e ∈ post, d < e :=
    (List.pairwise_cons.mp hparts.2.1).1
  have hpre_excl : ∀ e ∈ pre, e < d ∧ t.excludeSquared ≤ (frames e).residualSquared :=
    fun e he => ⟨hpre_lt e he, hpre e he⟩
  refine ⟨?_, hacc, ?_⟩
  · rw [hsplit]
    exact List.mem_append_cons_self
  · intro e he hlt
    rw [hsplit] at he
    simp only [List.mem_append, List.mem_cons] at he
    cases he with
    | inl hepre =>
      exact (hpre_excl e hepre).2
    | inr he =>
      cases he with
      | inl heq =>
        cases heq
        exact absurd hlt (lt_irrefl d)
      | inr hepost =>
        exact absurd hlt (not_lt_of_ge (le_of_lt (hpost_gt e hepost)))

end IntMProof.Verifier
