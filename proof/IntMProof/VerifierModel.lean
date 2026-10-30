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

/-! ## V0 depends only on the comparisons it reaches

The verdict of `reference` is a function of the truth values of the
comparisons its control flow reaches, in order. A checker that resolves each
reached comparison for an enclosure, rather than evaluating it on exact
frames, therefore returns V0's verdict on those exact frames. -/

/-- One comparison V0 can reach, named by the frame index it reads. -/
inductive Comparison where
  /-- `residualSquared > excludeSquared` at the proposed period (no closure). -/
  | residualAboveExclude (j : ℕ)
  /-- `residualSquared > acceptSquared` at the proposed period (closure ambiguous). -/
  | residualAboveAccept (j : ℕ)
  /-- `residualSquared < excludeSquared` at a proper divisor (not separated). -/
  | residualBelowExclude (j : ℕ)
  /-- `residualSquared ≤ acceptSquared` at the first unseparated divisor. -/
  | residualAtMostAccept (j : ℕ)
  /-- `multiplierMagnitude < attractUpper` at the resolved period. -/
  | multiplierBelowAttract (j : ℕ)
  deriving DecidableEq, Repr

/-- Truth value of one comparison on exact thresholds and frames. -/
def Comparison.test {P : Type*} (t : Thresholds) (frames : ℕ → Frame P) :
    Comparison → Bool
  | .residualAboveExclude j => Decidable.decide ((frames j).residualSquared > t.excludeSquared)
  | .residualAboveAccept j => Decidable.decide ((frames j).residualSquared > t.acceptSquared)
  | .residualBelowExclude j => Decidable.decide ((frames j).residualSquared < t.excludeSquared)
  | .residualAtMostAccept j => Decidable.decide ((frames j).residualSquared ≤ t.acceptSquared)
  | .multiplierBelowAttract j =>
      Decidable.decide ((frames j).multiplierMagnitude < t.attractUpper)

/-- V0's ascending divisor scan, driven only by comparison answers. -/
def answerReduction (answer : Comparison → Bool) : List ℕ → Reduction
  | [] => .keep
  | d :: ds =>
    if answer (.residualBelowExclude d) then
      if answer (.residualAtMostAccept d) then .reduced d else .ambiguous
    else answerReduction answer ds

/-- Comparisons the divisor scan reaches, in order. -/
def reductionReached (answer : Comparison → Bool) : List ℕ → List Comparison
  | [] => []
  | d :: ds =>
    if answer (.residualBelowExclude d) then
      [.residualBelowExclude d, .residualAtMostAccept d]
    else .residualBelowExclude d :: reductionReached answer ds

/-- V0's attraction test at the resolved period, driven by its answer. -/
def answerFinish (answer : Comparison → Bool) (period : ℕ) : Verdict :=
  if answer (.multiplierBelowAttract period) then .accepted else .notAttracting

/-- The attraction comparison reached after a divisor scan result. -/
def finishReached (reduction : Reduction) (period : ℕ) : List Comparison :=
  match reduction with
  | .ambiguous => []
  | .reduced d => [.multiplierBelowAttract d]
  | .keep => [.multiplierBelowAttract period]

/-- V0's verdict computed from comparison answers alone. -/
def answerVerdict (answer : Comparison → Bool) (period : ℕ) : Verdict :=
  if period = 0 then .noClosure
  else if answer (.residualAboveExclude period) then .noClosure
  else if answer (.residualAboveAccept period) then .closureAmbiguous
  else match answerReduction answer (properDivisors period) with
    | .ambiguous => .divisorAmbiguous
    | .reduced d => answerFinish answer d
    | .keep => answerFinish answer period

/-- The comparisons V0 reaches for the given answers, in evaluation order. -/
def answerReached (answer : Comparison → Bool) (period : ℕ) : List Comparison :=
  if period = 0 then []
  else if answer (.residualAboveExclude period) then [.residualAboveExclude period]
  else if answer (.residualAboveAccept period) then
    [.residualAboveExclude period, .residualAboveAccept period]
  else [.residualAboveExclude period, .residualAboveAccept period]
    ++ reductionReached answer (properDivisors period)
    ++ finishReached (answerReduction answer (properDivisors period)) period

/-- The comparisons `reference` reaches on exact thresholds and frames. -/
def reached {P : Type*} (t : Thresholds) (frames : ℕ → Frame P) (period : ℕ) :
    List Comparison :=
  answerReached (Comparison.test t frames) period

/-- V0's divisor scan is the answer-driven scan on exact comparison values. -/
theorem referenceReduction_eq_answerReduction {P : Type*} (t : Thresholds)
    (frames : ℕ → Frame P) (divisors : List ℕ) :
    referenceReduction t frames divisors =
      answerReduction (Comparison.test t frames) divisors := by
  induction divisors with
  | nil => rfl
  | cons d ds ih =>
    by_cases he : (frames d).residualSquared < t.excludeSquared
    · by_cases ha : (frames d).residualSquared ≤ t.acceptSquared <;>
        simp [referenceReduction, answerReduction, Comparison.test, he, ha]
    · simp only [referenceReduction] at ih
      simp [referenceReduction, answerReduction, Comparison.test, he, ih]

/-- V0's verdict is the answer-driven verdict on exact comparison values. -/
theorem reference_verdict_eq_answerVerdict {P : Type*} (t : Thresholds)
    (frames : ℕ → Frame P) (period iterations evidence : ℕ) (old : Record P) :
    (reference t frames period iterations evidence old).1 =
      answerVerdict (Comparison.test t frames) period := by
  unfold reference decide answerVerdict
  rw [← referenceReduction_eq_answerReduction]
  by_cases hp : period = 0
  · simp [hp]
  by_cases hx : (frames period).residualSquared > t.excludeSquared
  · simp [hp, hx, Comparison.test]
  by_cases hy : (frames period).residualSquared > t.acceptSquared
  · simp [hp, hx, hy, Comparison.test]
  have hx' : Comparison.test t frames (.residualAboveExclude period) = false := by
    simp [Comparison.test, hx]
  have hy' : Comparison.test t frames (.residualAboveAccept period) = false := by
    simp [Comparison.test, hy]
  rw [if_neg hp, if_neg hx, if_neg hy, if_neg hp, hx', hy']
  simp only [Bool.false_eq_true, if_false]
  split
  · rfl
  all_goals
    simp only [finish, answerFinish, Comparison.test, decide_eq_true_eq]
    split_ifs <;> rfl

/-- Answers that agree on every comparison the divisor scan reaches give the
same scan result and reach the same comparisons. -/
theorem answerReduction_congr (a b : Comparison → Bool) (divisors : List ℕ)
    (h : ∀ q ∈ reductionReached a divisors, a q = b q) :
    answerReduction a divisors = answerReduction b divisors ∧
      reductionReached a divisors = reductionReached b divisors := by
  induction divisors with
  | nil => exact ⟨rfl, rfl⟩
  | cons d ds ih =>
    have h1 := h (.residualBelowExclude d) (by
      unfold reductionReached
      split <;> simp)
    cases ha : a (.residualBelowExclude d) with
    | true =>
      have hb : b (.residualBelowExclude d) = true := h1 ▸ ha
      have h2 := h (.residualAtMostAccept d) (by simp [reductionReached, ha])
      simp [answerReduction, reductionReached, ha, hb, h2]
    | false =>
      have hb : b (.residualBelowExclude d) = false := h1 ▸ ha
      have ⟨hred, hreach⟩ := ih (fun q hq => h q (by simp [reductionReached, ha, hq]))
      simp [answerReduction, reductionReached, ha, hb, hred, hreach]

/-- Answers that agree on every comparison V0 reaches give the same verdict
and reach the same comparisons. -/
theorem answerVerdict_congr (a b : Comparison → Bool) (period : ℕ)
    (h : ∀ q ∈ answerReached a period, a q = b q) :
    answerVerdict a period = answerVerdict b period ∧
      answerReached a period = answerReached b period := by
  by_cases hp : period = 0
  · simp [answerVerdict, answerReached, hp]
  have h1 := h (.residualAboveExclude period) (by
    unfold answerReached
    split_ifs <;> simp)
  cases hx : a (.residualAboveExclude period) with
  | true =>
    have hx' : b (.residualAboveExclude period) = true := h1 ▸ hx
    simp [answerVerdict, answerReached, hp, hx, hx']
  | false =>
    have hx' : b (.residualAboveExclude period) = false := h1 ▸ hx
    have h2 := h (.residualAboveAccept period) (by
      simp only [answerReached, hp, hx, if_false, Bool.false_eq_true]
      split_ifs <;> simp)
    cases hy : a (.residualAboveAccept period) with
    | true =>
      have hy' : b (.residualAboveAccept period) = true := h2 ▸ hy
      simp [answerVerdict, answerReached, hp, hx, hx', hy, hy']
    | false =>
      have hy' : b (.residualAboveAccept period) = false := h2 ▸ hy
      have hrest : ∀ q ∈ reductionReached a (properDivisors period)
          ++ finishReached (answerReduction a (properDivisors period)) period,
          a q = b q := fun q hq => h q (by
        simp only [answerReached, hp, hx, hy, if_false, Bool.false_eq_true]
        simp only [List.mem_append] at hq ⊢
        tauto)
      have ⟨hred, hreach⟩ := answerReduction_congr a b (properDivisors period)
        (fun q hq => hrest q (List.mem_append_left _ hq))
      have hfin : ∀ q ∈ finishReached (answerReduction a (properDivisors period)) period,
          a q = b q := fun q hq => hrest q (List.mem_append_right _ hq)
      simp only [answerVerdict, answerReached, hp, hx, hx', hy, hy', if_false,
        Bool.false_eq_true, ← hred, ← hreach]
      refine ⟨?_, trivial⟩
      cases hr : answerReduction a (properDivisors period) with
      | ambiguous => rfl
      | reduced d =>
        have hd := hfin (.multiplierBelowAttract d) (by simp [finishReached, hr])
        simp [answerFinish, hd]
      | keep =>
        have hd := hfin (.multiplierBelowAttract period) (by simp [finishReached, hr])
        simp [answerFinish, hd]

/-- **V0 depends only on its reached comparisons.** Two runs, possibly with
different thresholds, frames, payloads, provenance and old records, return the
same verdict when every comparison the first run reaches has the same truth
value in both. -/
theorem reference_verdict_eq_of_reached {P Q : Type*} (t t' : Thresholds)
    (frames : ℕ → Frame P) (frames' : ℕ → Frame Q)
    (period iterations evidence iterations' evidence' : ℕ)
    (old : Record P) (old' : Record Q)
    (h : ∀ q ∈ reached t frames period,
      Comparison.test t frames q = Comparison.test t' frames' q) :
    (reference t frames period iterations evidence old).1 =
      (reference t' frames' period iterations' evidence' old').1 := by
  rw [reference_verdict_eq_answerVerdict, reference_verdict_eq_answerVerdict]
  exact (answerVerdict_congr _ _ period h).1

/-- Under the same hypothesis, the second run reaches the same comparisons. -/
theorem reached_eq_of_reached {P Q : Type*} (t t' : Thresholds)
    (frames : ℕ → Frame P) (frames' : ℕ → Frame Q) (period : ℕ)
    (h : ∀ q ∈ reached t frames period,
      Comparison.test t frames q = Comparison.test t' frames' q) :
    reached t frames period = reached t' frames' period :=
  (answerVerdict_congr _ _ period h).2

/-- A checker that answers every comparison V0 reaches with its exact truth
value, and runs V0's control flow on those answers, returns V0's verdict on
the exact frames. Answers to unreached comparisons are irrelevant. -/
theorem answerVerdict_eq_reference_of_reached {P : Type*} (answer : Comparison → Bool)
    (t : Thresholds) (frames : ℕ → Frame P) (period iterations evidence : ℕ)
    (old : Record P)
    (h : ∀ q ∈ reached t frames period, Comparison.test t frames q = answer q) :
    answerVerdict answer period = (reference t frames period iterations evidence old).1 := by
  rw [reference_verdict_eq_answerVerdict]
  exact (answerVerdict_congr _ _ period h).1.symm

/-- The period V0 resolves to, computed from comparison answers alone. -/
def answerPeriod (answer : Comparison → Bool) (period : ℕ) : ℕ :=
  match answerReduction answer (properDivisors period) with
  | .reduced d => d
  | _ => period

/-- An accepted V0 record carries the answer-driven resolved period. -/
theorem reference_accepted_period {P : Type*} (t : Thresholds)
    (frames : ℕ → Frame P) (period iterations evidence : ℕ) (old : Record P)
    (hacc : (reference t frames period iterations evidence old).1 = .accepted) :
    (reference t frames period iterations evidence old).2.period =
      answerPeriod (Comparison.test t frames) period := by
  unfold reference decide at hacc ⊢
  unfold answerPeriod
  rw [← referenceReduction_eq_answerReduction]
  by_cases hp : period = 0
  · simp [hp] at hacc
  by_cases hx : (frames period).residualSquared > t.excludeSquared
  · simp [hp, hx] at hacc
  by_cases hy : (frames period).residualSquared > t.acceptSquared
  · simp [hp, hx, hy] at hacc
  rw [if_neg hp, if_neg hx, if_neg hy] at hacc ⊢
  cases hr : referenceReduction t frames (properDivisors period) with
  | ambiguous => simp [hr] at hacc
  | reduced d =>
    simp only [hr, finish] at hacc ⊢
    split_ifs at hacc ⊢
    rfl
  | keep =>
    simp only [hr, finish] at hacc ⊢
    split_ifs at hacc ⊢
    rfl

/-- Answers that agree on every reached comparison and accept resolve to the
same period. -/
theorem answerPeriod_congr (a b : Comparison → Bool) (period : ℕ)
    (h : ∀ q ∈ answerReached a period, a q = b q)
    (hacc : answerVerdict a period = .accepted) :
    answerPeriod a period = answerPeriod b period := by
  by_cases hp : period = 0
  · simp [answerVerdict, hp] at hacc
  cases hx : a (.residualAboveExclude period)
  swap
  · simp [answerVerdict, hp, hx] at hacc
  cases hy : a (.residualAboveAccept period)
  swap
  · simp [answerVerdict, hp, hx, hy] at hacc
  have hred := (answerReduction_congr a b (properDivisors period)
    (fun q hq => h q (by simp [answerReached, hp, hx, hy, hq]))).1
  simp only [answerPeriod, hred]

/-- When the first run accepts, a run whose reached comparisons agree also
accepts, and both accepted records carry the same resolved period. -/
theorem reference_accepted_period_eq_of_reached {P Q : Type*} (t t' : Thresholds)
    (frames : ℕ → Frame P) (frames' : ℕ → Frame Q)
    (period iterations evidence iterations' evidence' : ℕ)
    (old : Record P) (old' : Record Q)
    (h : ∀ q ∈ reached t frames period,
      Comparison.test t frames q = Comparison.test t' frames' q)
    (hacc : (reference t frames period iterations evidence old).1 = .accepted) :
    (reference t' frames' period iterations' evidence' old').1 = .accepted ∧
      (reference t' frames' period iterations' evidence' old').2.period =
        (reference t frames period iterations evidence old).2.period := by
  have hv := reference_verdict_eq_of_reached t t' frames frames' period
    iterations evidence iterations' evidence' old old' h
  have hacc' := hv ▸ hacc
  refine ⟨hacc', ?_⟩
  rw [reference_accepted_period t frames period iterations evidence old hacc,
    reference_accepted_period t' frames' period iterations' evidence' old' hacc']
  exact (answerPeriod_congr _ _ period h
    ((reference_verdict_eq_answerVerdict t frames period iterations evidence old) ▸ hacc)).symm

end IntMProof.Verifier
