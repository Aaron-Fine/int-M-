import IntMProof.VerifierModel
import Mathlib.Logic.Function.Iterate
import Mathlib.Tactic.NormNum
import Mathlib.Tactic.IntervalCases
import Mathlib.Tactic.Linarith
import Mathlib.Algebra.Order.Ring.Abs

/-!
# V2: verifier frame-cache equivalence

Both TypeScript verifier paths (`verifyCycleInto` in `src/domain/verifier.ts` and the mirrored
block in the `classifyInto` lag scan of `src/domain/orbit.ts`) walk the proposed period once,
accumulating the orbit value and the derivative, and then, for every proper divisor `d` in
ascending order, walk `d` steps again from the cycle start. This file models that control flow
over an *arbitrary* deterministic state type and arbitrary observation functions
(`VerifierCache.Ops`), and compares it with a frame cache that walks once, records the states
`0, …, n`, and reads every divisor frame from that record.

## What is proved

* `cachedVerify_eq_recomputeVerify`: for every `Ops` (every step function, every finiteness
  observation, every residual/multiplier/payload function, every start-dependent threshold
  choice), every start state, candidate period, provenance, and old record, the cached procedure
  returns the same verdict code *and* the same complete output record as the recompute procedure.
* `walk_divisor_eq_iterate`: in the recompute procedure every divisor walk is reached only after
  the main walk succeeded, and then it returns exactly the main-walk prefix state
  `ops.step^[d] s`; consequently its per-step finiteness checks never fire.
* `recomputeVerify_refusal_preserves` / `cachedVerify_refusal_preserves`: every non-accepted code
  leaves the record untouched.
* `recomputeVerify_eq_reference`, `cachedVerify_eq_reference`, `cachedVerify_eq_inline`: whenever
  the code is not `rejectedNonFinite`, the result is exactly V0 `Verifier.reference` (equivalently
  V1 `Verifier.inline`) on the frames
  `fun d => ⟨residualSquared s (step^[d] s), multiplierMagnitude (step^[d] s),
  payload d (step^[d] s)⟩` with thresholds `ops.thresholds s`, verdicts mapped by `ofVerdict`.
  `cachedVerify_ne_nonFinite_of_finiteChecks` gives a sufficient condition (`FiniteChecks`) under
  which no finiteness check fires; `cachedVerify_accepted_record` spells out the accepted record.
* `endCheckVerify_eq_recomputeVerify`: the inline lag-scan order, which checks state finiteness
  only once after the main walk, agrees with the canonical per-step order *provided* state
  non-finiteness is absorbing under `step` (a hypothesis, the claim made in the TypeScript
  comments; it is not proved here for binary64). The IEEE reason it is expected to hold, stated
  as a reason and not a proof: once a component is non-finite, a square gives `Inf` or `NaN`,
  `Inf - Inf` is `NaN`, and `Inf · 0` is `NaN`, so the next state is again non-finite.
* `sharedCachedVerify_eq_cachedVerify` / `sharedCachedVerify_eq_recomputeVerify`: in the lag
  scan every candidate period starts from the same `z`, so one record `finiteRecord ops N s` can
  serve every candidate `n ≤ N`. Reading candidate `n` and its divisors from that shared record
  equals the per-candidate cache (hence today's verifier) for every `Ops` and input, provided a
  per-step failure only *truncates* the record at the failing index. For the inline path,
  `sharedEndCheckVerify_eq_endCheckVerify` / `sharedEndCheckVerify_eq_recomputeVerify` give the
  same reuse over an unchecked record with an end check at `n`, under absorption.
* Concrete sanity examples, evaluated by `decide +kernel`: exact rationals at `c = -1`, seed `0`
  (periods `0`, `1`, `2`, a period-four candidate reduced to `2`, one shared record serving
  candidates `1–4`), a repelling fixed point at `c = 0`, a stand-in overflow at `c = 1`, a
  concrete `FiniteChecks` instance and a proved absorption instance for the end-check theorem,
  and synthetic counters reaching both ambiguity codes, every non-finite branch, and the
  truncating-versus-aborting shared record.

## Refinement constraints for a TypeScript frame cache

A TypeScript cache inherits `cachedVerify_eq_recomputeVerify` if, read through the model, it
preserves all of the following. These are sufficient conditions for the theorem to apply, not
necessary ones: a different implementation could still be equivalent for other reasons.

1. **One deterministic step.** The main walk and every divisor walk apply the same `step` to the
   pair (orbit value, derivative accumulator): today both loops compute the derivative from the
   old `z` first and then `z ↦ z² + c` with textually identical expressions. The cache must store
   the state produced by *that* main-walk operation sequence, bit for bit, both the orbit value
   and the derivative, at index `d` = number of steps taken, with index `0` the cycle start and
   derivative `1 + 0i`.
2. **Cache reads are prefix reads.** Divisor frame `d` is the stored state at index `d < n`; the
   candidate frame is index `n`. Nothing is read before the main walk has finished and passed its
   checks, and no index beyond `n` is read.
3. **Main-walk checks unchanged.** Per-step state finiteness during the main walk (canonical
   path), then end-of-walk derivative finiteness, then residual-square finiteness, then the
   three-way closure policy `> excludeSquared` (no closure) / `> acceptSquared` (ambiguous), in
   that order. The inline path may keep its end-only state check under the absorption hypothesis
   of `endCheckVerify_eq_recomputeVerify`.
4. **Divisor order and checks.** Proper divisors are visited in ascending order. For each one:
   residual-square finiteness (must be kept: finite states can still give a non-finite square),
   then `≤ acceptSquared` selects the divisor and its stored state and breaks, then
   `< excludeSquared` is divisor-ambiguous, otherwise continue. The per-step state finiteness
   checks of the divisor re-walks may be dropped; they cannot fire.
5. **Residuals.** Each residual square is computed from (cycle start, stored state) with the same
   operations as today.
6. **Acceptance.** Multiplier-magnitude finiteness, then the cutoff `< attractUpper`, both on the
   *selected* stored state; the accepted record is status `2`, caller provenance, the selected
   period, and every remaining field computed from the selected period and stored state only.
7. **Refusals.** A non-integer or `< 1` proposed period is refused as `rejectedNoClosure`; every
   non-accepted code leaves the output record untouched; thresholds depend on the cycle start
   only.
8. **Shared lag-scan record (cross-candidate reuse).** One record from the common start may
   serve every candidate `n ≤ N` (`sharedCachedVerify_eq_cachedVerify`). A per-step state failure
   at index `j` must only mark the record as valid for indices `< j`: candidate `n` is
   `rejectedNonFinite` exactly when `j ≤ n`, and candidates `n < j` are unaffected. Aborting the
   whole scan, or rejecting every candidate, on a failure beyond `n` is *not* faithful
   (`counter_shared_truncation`). Stored values at or beyond the first failure are never read.
   An incrementally grown TypeScript record must equal `finiteRecord ops N s` for some `N ≥ n`
   whenever candidate `n` reads it (shorter records are prefixes of longer ones,
   `finiteRecord_prefix`). The record must be rebuilt at every lag-scan iteration: the start `z`
   changes and the derivative accumulator restarts at `1 + 0i`, so reusing the previous record
   shifted by one index is *not* covered. For the inline lag scan's end-only main-walk check,
   `sharedEndCheckVerify` reads an unchecked record (`prefixStates ops N s`) gated by one state
   and derivative check at index `n`; under the absorption hypothesis it equals `endCheckVerify`
   and `recomputeVerify` (`sharedEndCheckVerify_eq_recomputeVerify`), and the truncating record
   reaches index `n` exactly when state `n` is finite (`lt_length_finiteRecord_iff_last`).

**Binary64 thresholds.** In binary64, `scale = max(1, |z|, |y|)` is `NaN` for a `NaN` start, and
the threshold products overflow to `Inf` (the exclusion square once `scale ≳ 1.34e160`, the
acceptance square once `scale ≳ 1.34e162`). The TypeScript verifiers are unaffected because a
component above about `1.34e154` already squares to `Inf`, so such starts produce a non-finite
state at the first step (every candidate takes at least one step) and `rejectedNonFinite` is
returned before any threshold is compared. A refinement proof must make that
argument explicitly and may then assign those starts an arbitrary rational `Thresholds` value,
since the model's `ops.thresholds s` must be a genuine ordered rational pair.

## What is NOT proved

* Binary64 semantics: `Ops` is abstract; nothing here says the TypeScript doubles equal the
  model's values, that `Math.hypot`, `atan2`, or `log` are accurate, or that non-finite values
  are absorbing (that is a hypothesis of `endCheckVerify_eq_recomputeVerify` only).
* That the TypeScript code implements this model (including that both loops compute the same
  `step`, the `Number.isInteger` guard, and object-mutation details); that remains a
  correspondence to be checked by review and the differential tests.
* Candidate selection in the lag scan, and anything about dynamics, exact periodicity, or
  attraction of the underlying map.
* Performance, memory, or allocation cost of a cache.
-/

namespace IntMProof.VerifierCache

open Verifier

/-- Verdict codes of `VERIFIER_VERDICT` in `src/domain/verifier.ts`, in declaration order. -/
inductive Code where
  /-- A state, derivative, residual square, or multiplier magnitude was non-finite. -/
  | rejectedNonFinite
  /-- No closure, including the refusal of a non-integer or `< 1` proposed period (the model's
  `n : ℕ` can only express the `< 1` case). -/
  | rejectedNoClosure
  /-- The selected multiplier magnitude is at or above the cutoff. -/
  | rejectedNotAttracting
  /-- The candidate residual square lies in the gap between the thresholds. -/
  | unresolvedClosureAmbiguous
  /-- A proper-divisor residual square lies in the gap between the thresholds. -/
  | unresolvedDivisorAmbiguous
  /-- Accepted attracting cycle; the record has been written. -/
  | accepted
  deriving DecidableEq, Repr

/-- The small-integer encoding used by `VERIFIER_VERDICT`. -/
def Code.toNat : Code → ℕ
  | .rejectedNonFinite => 0
  | .rejectedNoClosure => 1
  | .rejectedNotAttracting => 2
  | .unresolvedClosureAmbiguous => 3
  | .unresolvedDivisorAmbiguous => 4
  | .accepted => 5

/-- V0/V1 verdicts as TypeScript verdict codes; V0/V1 have no non-finite verdict. -/
def ofVerdict : Verdict → Code
  | .noClosure => .rejectedNoClosure
  | .closureAmbiguous => .unresolvedClosureAmbiguous
  | .divisorAmbiguous => .unresolvedDivisorAmbiguous
  | .notAttracting => .rejectedNotAttracting
  | .accepted => .accepted

/-- Map a V0/V1 result to a verdict code and the same record. -/
def mapResult {P : Type*} (r : Verdict × Record P) : Code × Record P :=
  (ofVerdict r.1, r.2)

/-- Abstract arithmetic of the verifier. A state carries the orbit value and the derivative
accumulator; every function is an arbitrary parameter of the theorems below. -/
structure Ops (S P : Type*) where
  /-- One deterministic step of orbit value and derivative accumulator. -/
  step : S → S
  /-- The per-step orbit-value finiteness check (`Number.isFinite` of both components). -/
  stateFinite : S → Bool
  /-- The end-of-main-walk derivative finiteness check. -/
  derivativeFinite : S → Bool
  /-- Finiteness of the computed residual square for (cycle start, state). -/
  residualFinite : S → S → Bool
  /-- The residual square for (cycle start, state), as an exact rational. -/
  residualSquared : S → S → ℚ
  /-- Finiteness of the multiplier magnitude of a selected state. -/
  magnitudeFinite : S → Bool
  /-- Multiplier magnitude of a selected state, as an exact rational. -/
  multiplierMagnitude : S → ℚ
  /-- Remaining accepted fields (multiplier parts, magnitude, angle, kappa, …) computed from
  the selected period and selected state. -/
  payload : ℕ → S → P
  /-- Scale-aware thresholds, computed from the cycle start. -/
  thresholds : S → Thresholds

variable {S P : Type*}

/-- Walk `k` steps from `s`, checking state finiteness after every step. -/
def walk (ops : Ops S P) : ℕ → S → Option S
  | 0, s => some s
  | k + 1, s => if ops.stateFinite (ops.step s) then walk ops k (ops.step s) else none

/-- The main walk recording every visited state `0, …, k`, with the same per-step checks. -/
def walkRecord (ops : Ops S P) : ℕ → S → Option (List S)
  | 0, s => some [s]
  | k + 1, s =>
    if ops.stateFinite (ops.step s) then (walkRecord ops k (ops.step s)).map (s :: ·)
    else none

/-- Outcome of the ascending proper-divisor scan. -/
inductive Outcome (S : Type*) where
  /-- A divisor walk state or divisor residual square was non-finite. -/
  | nonFinite
  /-- A divisor residual square lies in the gap between the thresholds. -/
  | ambiguous
  /-- Every proper divisor is excluded; keep the candidate period. -/
  | keep
  /-- The first accepted divisor and its walk state. -/
  | reduced (period : ℕ) (state : S)

/-- Today's divisor scan: re-walk `d` steps for each divisor in order, break on acceptance. -/
def recomputeReduction (ops : Ops S P) (t : Thresholds) (s : S) : List ℕ → Outcome S
  | [] => .keep
  | d :: ds =>
    match walk ops d s with
    | none => .nonFinite
    | some w =>
      if ops.residualFinite s w then
        if ops.residualSquared s w ≤ t.acceptSquared then .reduced d w
        else if ops.residualSquared s w < t.excludeSquared then .ambiguous
        else recomputeReduction ops t s ds
      else .nonFinite

/-- Cached divisor scan: divisor frame `d` is read from the recorded main walk. -/
def cachedReduction (ops : Ops S P) (t : Thresholds) (s : S) (cache : List S) :
    List ℕ → Outcome S
  | [] => .keep
  | d :: ds =>
    if ops.residualFinite s (cache.getD d s) then
      if ops.residualSquared s (cache.getD d s) ≤ t.acceptSquared then
        .reduced d (cache.getD d s)
      else if ops.residualSquared s (cache.getD d s) < t.excludeSquared then .ambiguous
      else cachedReduction ops t s cache ds
    else .nonFinite

/-- Multiplier finiteness, attraction cutoff, and the complete accepted record. -/
def finishState (ops : Ops S P) (t : Thresholds) (period : ℕ) (σ : S)
    (iterations evidence : ℕ) (old : Record P) : Code × Record P :=
  if ops.magnitudeFinite σ then
    if ops.multiplierMagnitude σ < t.attractUpper then
      (.accepted, ⟨2, iterations, evidence, period, ops.payload period σ⟩)
    else (.rejectedNotAttracting, old)
  else (.rejectedNonFinite, old)

/-- Today's canonical `verifyCycleInto`: one main walk, then independent divisor re-walks. -/
def recomputeVerify (ops : Ops S P) (s : S) (n iterations evidence : ℕ) (old : Record P) :
    Code × Record P :=
  if n < 1 then (.rejectedNoClosure, old)
  else
    match walk ops n s with
    | none => (.rejectedNonFinite, old)
    | some z =>
      if ops.derivativeFinite z then
        if ops.residualFinite s z then
          if ops.residualSquared s z > (ops.thresholds s).excludeSquared then
            (.rejectedNoClosure, old)
          else if ops.residualSquared s z > (ops.thresholds s).acceptSquared then
            (.unresolvedClosureAmbiguous, old)
          else
            match recomputeReduction ops (ops.thresholds s) s (properDivisors n) with
            | .nonFinite => (.rejectedNonFinite, old)
            | .ambiguous => (.unresolvedDivisorAmbiguous, old)
            | .reduced d w => finishState ops (ops.thresholds s) d w iterations evidence old
            | .keep => finishState ops (ops.thresholds s) n z iterations evidence old
        else (.rejectedNonFinite, old)
      else (.rejectedNonFinite, old)

/-- The frame cache: one recorded walk; the candidate and divisor frames are read from it. -/
def cachedVerify (ops : Ops S P) (s : S) (n iterations evidence : ℕ) (old : Record P) :
    Code × Record P :=
  if n < 1 then (.rejectedNoClosure, old)
  else
    match walkRecord ops n s with
    | none => (.rejectedNonFinite, old)
    | some cache =>
      if ops.derivativeFinite (cache.getD n s) then
        if ops.residualFinite s (cache.getD n s) then
          if ops.residualSquared s (cache.getD n s) > (ops.thresholds s).excludeSquared then
            (.rejectedNoClosure, old)
          else if ops.residualSquared s (cache.getD n s) > (ops.thresholds s).acceptSquared then
            (.unresolvedClosureAmbiguous, old)
          else
            match cachedReduction ops (ops.thresholds s) s cache (properDivisors n) with
            | .nonFinite => (.rejectedNonFinite, old)
            | .ambiguous => (.unresolvedDivisorAmbiguous, old)
            | .reduced d w => finishState ops (ops.thresholds s) d w iterations evidence old
            | .keep => finishState ops (ops.thresholds s) n (cache.getD n s) iterations
                evidence old
        else (.rejectedNonFinite, old)
      else (.rejectedNonFinite, old)

/-- The inline lag-scan order: no per-step check in the main walk, one combined state and
derivative check afterwards; divisor re-walks keep their per-step checks. -/
def endCheckVerify (ops : Ops S P) (s : S) (n iterations evidence : ℕ) (old : Record P) :
    Code × Record P :=
  if n < 1 then (.rejectedNoClosure, old)
  else
    if ops.stateFinite (ops.step^[n] s) && ops.derivativeFinite (ops.step^[n] s) then
      if ops.residualFinite s (ops.step^[n] s) then
        if ops.residualSquared s (ops.step^[n] s) > (ops.thresholds s).excludeSquared then
          (.rejectedNoClosure, old)
        else if ops.residualSquared s (ops.step^[n] s) > (ops.thresholds s).acceptSquared then
          (.unresolvedClosureAmbiguous, old)
        else
          match recomputeReduction ops (ops.thresholds s) s (properDivisors n) with
          | .nonFinite => (.rejectedNonFinite, old)
          | .ambiguous => (.unresolvedDivisorAmbiguous, old)
          | .reduced d w => finishState ops (ops.thresholds s) d w iterations evidence old
          | .keep => finishState ops (ops.thresholds s) n (ops.step^[n] s) iterations
              evidence old
      else (.rejectedNonFinite, old)
    else (.rejectedNonFinite, old)

/-- The shared lag-scan record: one walk of at most `N` steps from the common start, keeping
states `0, …, k` and stopping *before* the first state that fails its per-step check. A failure
at index `j` only shortens the record to length `j`; it is not a global abort. -/
def finiteRecord (ops : Ops S P) : ℕ → S → List S
  | 0, s => [s]
  | k + 1, s =>
    if ops.stateFinite (ops.step s) then s :: finiteRecord ops k (ops.step s) else [s]

/-- Cross-candidate reuse: candidate `n` and its divisors are read from a record shared by all
candidate periods (intended: `finiteRecord ops N s` with `n ≤ N`). Candidate `n` is non-finite
exactly when the record stops at or before index `n`. -/
def sharedCachedVerify (ops : Ops S P) (s : S) (cache : List S) (n iterations evidence : ℕ)
    (old : Record P) : Code × Record P :=
  if n < 1 then (.rejectedNoClosure, old)
  else if n < cache.length then
    if ops.derivativeFinite (cache.getD n s) then
      if ops.residualFinite s (cache.getD n s) then
        if ops.residualSquared s (cache.getD n s) > (ops.thresholds s).excludeSquared then
          (.rejectedNoClosure, old)
        else if ops.residualSquared s (cache.getD n s) > (ops.thresholds s).acceptSquared then
          (.unresolvedClosureAmbiguous, old)
        else
          match cachedReduction ops (ops.thresholds s) s cache (properDivisors n) with
          | .nonFinite => (.rejectedNonFinite, old)
          | .ambiguous => (.unresolvedDivisorAmbiguous, old)
          | .reduced d w => finishState ops (ops.thresholds s) d w iterations evidence old
          | .keep => finishState ops (ops.thresholds s) n (cache.getD n s) iterations
              evidence old
      else (.rejectedNonFinite, old)
    else (.rejectedNonFinite, old)
  else (.rejectedNonFinite, old)

/-! ### Walks and prefix states -/

/-- Every state reached in the first `k` steps passes the per-step finiteness check. -/
def PrefixFinite (ops : Ops S P) (k : ℕ) (s : S) : Prop :=
  ∀ i < k, ops.stateFinite (ops.step^[i + 1] s) = true

/-- Peel the first step off a finite prefix. -/
theorem prefixFinite_succ (ops : Ops S P) (k : ℕ) (s : S) :
    PrefixFinite ops (k + 1) s ↔
      ops.stateFinite (ops.step s) = true ∧ PrefixFinite ops k (ops.step s) := by
  constructor
  · intro h
    refine ⟨by simpa using h 0 (by omega), fun i hi => ?_⟩
    have := h (i + 1) (by omega)
    rwa [Function.iterate_succ_apply] at this
  · rintro ⟨h0, h⟩ i hi
    cases i with
    | zero => simpa using h0
    | succ i =>
      rw [Function.iterate_succ_apply]
      exact h i (by omega)

/-- A finite prefix stays finite when shortened. -/
theorem PrefixFinite.mono {ops : Ops S P} {d n : ℕ} {s : S} (hdn : d ≤ n)
    (hpre : PrefixFinite ops n s) : PrefixFinite ops d s :=
  fun i hi => hpre i (by omega)

/-- A walk succeeds exactly when every step is finite, and then returns `step^[k] s`. -/
theorem walk_eq_some_iff (ops : Ops S P) (k : ℕ) (s w : S) :
    walk ops k s = some w ↔ PrefixFinite ops k s ∧ w = ops.step^[k] s := by
  induction k generalizing s with
  | zero =>
    simp only [walk, Option.some.injEq, Function.iterate_zero, id_eq]
    exact ⟨fun h => ⟨fun i hi => absurd hi (Nat.not_lt_zero i), h.symm⟩,
      fun h => h.2.symm⟩
  | succ k ih =>
    rw [prefixFinite_succ, Function.iterate_succ_apply]
    by_cases h : ops.stateFinite (ops.step s) = true
    · simp only [walk, h, if_true, ih, true_and]
    · simp [walk, h]

/-- A finite prefix makes the walk return `step^[k] s`. -/
theorem walk_of_prefixFinite {ops : Ops S P} {k : ℕ} {s : S} (hpre : PrefixFinite ops k s) :
    walk ops k s = some (ops.step^[k] s) :=
  (walk_eq_some_iff ops k s _).mpr ⟨hpre, rfl⟩

/-- Any failing per-step check makes the walk fail. -/
theorem walk_eq_none_of_not {ops : Ops S P} {k : ℕ} {s : S} (hpre : ¬ PrefixFinite ops k s) :
    walk ops k s = none := by
  cases hw : walk ops k s with
  | none => rfl
  | some w => exact absurd ((walk_eq_some_iff ops k s w).mp hw).1 hpre

/-- The recorded prefix states `step^[0] s, …, step^[k] s`. -/
def prefixStates (ops : Ops S P) : ℕ → S → List S
  | 0, s => [s]
  | k + 1, s => s :: prefixStates ops k (ops.step s)

/-- The recorded walk fails exactly when the plain walk fails, and otherwise records the
prefix states. -/
theorem walkRecord_eq (ops : Ops S P) (k : ℕ) (s : S) :
    walkRecord ops k s = (walk ops k s).map (fun _ => prefixStates ops k s) := by
  induction k generalizing s with
  | zero => rfl
  | succ k ih =>
    by_cases h : ops.stateFinite (ops.step s) = true
    · simp only [walkRecord, walk, h, if_true, ih, Option.map_map, prefixStates]
      rfl
    · simp [walkRecord, walk, h]

/-- Reading index `d ≤ k` of the record gives the `d`-th prefix state. -/
theorem getD_prefixStates (ops : Ops S P) (k : ℕ) (s : S) (d : ℕ) (x : S) (hdk : d ≤ k) :
    (prefixStates ops k s).getD d x = ops.step^[d] s := by
  induction k generalizing s d with
  | zero =>
    obtain rfl : d = 0 := by omega
    rfl
  | succ k ih =>
    cases d with
    | zero => rfl
    | succ d =>
      rw [prefixStates, List.getD_cons_succ, ih (ops.step s) d (by omega),
        Function.iterate_succ_apply]

/-- **Divisor re-walks cannot fail.** Once the main walk of length `n` succeeded, the walk of
any length `d ≤ n` (in particular every proper divisor) succeeds and returns the main-walk prefix
state; its per-step finiteness checks never fire. -/
theorem walk_divisor_eq_iterate {ops : Ops S P} {n d : ℕ} {s z : S}
    (hwalk : walk ops n s = some z) (hdn : d ≤ n) :
    walk ops d s = some (ops.step^[d] s) :=
  walk_of_prefixFinite (((walk_eq_some_iff ops n s z).mp hwalk).1.mono hdn)

/-- Specialization of `walk_divisor_eq_iterate` to the divisors the verifier visits. -/
theorem walk_properDivisor_ne_none {ops : Ops S P} {n d : ℕ} {s z : S}
    (hwalk : walk ops n s = some z) (hd : d ∈ properDivisors n) :
    walk ops d s ≠ none := by
  rw [walk_divisor_eq_iterate hwalk (le_of_lt (mem_properDivisors.mp hd).2.2)]
  exact Option.some_ne_none _

/-! ### Cache equivalence -/

/-- On a finite main walk, reading divisor frames from the record gives the same divisor scan
as re-walking, for any list of divisors no longer than the walk. -/
theorem cachedReduction_eq_recomputeReduction (ops : Ops S P) (t : Thresholds) {n : ℕ}
    {s : S} (hpre : PrefixFinite ops n s) (ds : List ℕ) (hds : ∀ d ∈ ds, d ≤ n) :
    cachedReduction ops t s (prefixStates ops n s) ds = recomputeReduction ops t s ds := by
  induction ds with
  | nil => rfl
  | cons d ds ih =>
    have hdn : d ≤ n := hds d List.mem_cons_self
    have hw := walk_of_prefixFinite (hpre.mono hdn)
    have hget := getD_prefixStates ops n s d s hdn
    have hrest := ih (fun e he => hds e (List.mem_cons_of_mem _ he))
    simp only [cachedReduction, recomputeReduction, hw, hget, hrest]

/-- **V2 headline.** For all arithmetic and observation functions and all inputs, the frame cache
returns exactly the same verdict code and complete record as today's re-walking verifier. -/
theorem cachedVerify_eq_recomputeVerify (ops : Ops S P) (s : S)
    (n iterations evidence : ℕ) (old : Record P) :
    cachedVerify ops s n iterations evidence old =
      recomputeVerify ops s n iterations evidence old := by
  unfold cachedVerify recomputeVerify
  by_cases hn : n < 1
  · simp only [hn, if_true]
  · simp only [hn, if_false, walkRecord_eq]
    cases hw : walk ops n s with
    | none => rfl
    | some z =>
      have ⟨hpre, hz⟩ := (walk_eq_some_iff ops n s z).mp hw
      have hget : (prefixStates ops n s).getD n s = z := by
        rw [getD_prefixStates ops n s n s le_rfl, hz]
      have hred := cachedReduction_eq_recomputeReduction ops (ops.thresholds s) hpre
        (properDivisors n) (fun d hd => le_of_lt (mem_properDivisors.mp hd).2.2)
      simp only [Option.map_some, hget, hred]

/-! ### Cross-candidate reuse -/

/-- The shared record is never empty. -/
theorem length_finiteRecord_pos (ops : Ops S P) (N : ℕ) (s : S) :
    0 < (finiteRecord ops N s).length := by
  cases N with
  | zero => simp [finiteRecord]
  | succ N =>
    unfold finiteRecord
    split <;> simp

/-- For `n ≤ N`, the shared record reaches index `n` exactly when the main walk to `n` passes
all its per-step checks (walk prefix monotonicity: later failures do not matter). -/
theorem lt_length_finiteRecord_iff (ops : Ops S P) {N n : ℕ} (s : S) (hnN : n ≤ N) :
    n < (finiteRecord ops N s).length ↔ PrefixFinite ops n s := by
  induction N generalizing s n with
  | zero =>
    obtain rfl : n = 0 := by omega
    simp [finiteRecord, PrefixFinite]
  | succ N ih =>
    cases n with
    | zero =>
      exact ⟨fun _ i hi => absurd hi (Nat.not_lt_zero i),
        fun _ => length_finiteRecord_pos ops _ s⟩
    | succ n =>
      rw [prefixFinite_succ]
      by_cases h : ops.stateFinite (ops.step s) = true
      · simp only [finiteRecord, h, if_true, List.length_cons, true_and]
        rw [← ih (ops.step s) (by omega)]
        omega
      · simp [finiteRecord, h]

/-- Every index inside the shared record holds the corresponding prefix state. -/
theorem getD_finiteRecord (ops : Ops S P) (N : ℕ) (s : S) (d : ℕ) (x : S)
    (hd : d < (finiteRecord ops N s).length) :
    (finiteRecord ops N s).getD d x = ops.step^[d] s := by
  induction N generalizing s d with
  | zero =>
    simp only [finiteRecord, List.length_singleton, Nat.lt_one_iff] at hd
    subst hd
    rfl
  | succ N ih =>
    by_cases h : ops.stateFinite (ops.step s) = true
    · simp only [finiteRecord, h, if_true, List.length_cons] at hd ⊢
      cases d with
      | zero => rfl
      | succ d =>
        rw [List.getD_cons_succ, ih _ d (by omega), Function.iterate_succ_apply]
    · simp only [finiteRecord, h, Bool.false_eq_true, if_false, List.length_singleton,
        Nat.lt_one_iff] at hd ⊢
      subst hd
      rfl

/-- A shorter shared record is a prefix of a longer one from the same start. -/
theorem finiteRecord_prefix (ops : Ops S P) {k k' : ℕ} (s : S) (hkk' : k ≤ k') :
    finiteRecord ops k s <+: finiteRecord ops k' s := by
  induction k generalizing s k' with
  | zero =>
    cases k' with
    | zero => exact List.prefix_refl _
    | succ k' =>
      unfold finiteRecord
      split
      · exact ⟨finiteRecord ops k' (ops.step s), rfl⟩
      · exact List.prefix_refl _
  | succ k ih =>
    obtain ⟨m, rfl⟩ : ∃ m, k' = m + 1 := ⟨k' - 1, by omega⟩
    by_cases h : ops.stateFinite (ops.step s) = true
    · simp only [finiteRecord, h, if_true]
      obtain ⟨t, ht⟩ := ih (ops.step s) (show k ≤ m by omega)
      exact ⟨t, by simp [ht]⟩
    · simp only [finiteRecord, h, Bool.false_eq_true, if_false]
      exact List.prefix_refl _

/-- The cached divisor scan only depends on the record at the scanned indices. -/
theorem cachedReduction_congr (ops : Ops S P) (t : Thresholds) (s : S) {c₁ c₂ : List S}
    (ds : List ℕ) (hagree : ∀ d ∈ ds, c₁.getD d s = c₂.getD d s) :
    cachedReduction ops t s c₁ ds = cachedReduction ops t s c₂ ds := by
  induction ds with
  | nil => rfl
  | cons d ds ih =>
    have hrest := ih (fun e he => hagree e (List.mem_cons_of_mem _ he))
    simp only [cachedReduction, hagree d List.mem_cons_self, hrest]

/-- **Cross-candidate reuse.** Reading candidate `n ≤ N` and its divisors from the one shared
record of length at most `N + 1` gives exactly the per-candidate frame cache, for every `Ops`
and every input; a per-step failure at an index beyond `n` does not affect candidate `n`. -/
theorem sharedCachedVerify_eq_cachedVerify (ops : Ops S P) (s : S) {N n : ℕ} (hnN : n ≤ N)
    (iterations evidence : ℕ) (old : Record P) :
    sharedCachedVerify ops s (finiteRecord ops N s) n iterations evidence old =
      cachedVerify ops s n iterations evidence old := by
  unfold sharedCachedVerify cachedVerify
  by_cases hn : n < 1
  · simp only [hn, if_true]
  simp only [hn, if_false, walkRecord_eq]
  by_cases hpre : PrefixFinite ops n s
  · have hlen : n < (finiteRecord ops N s).length :=
      (lt_length_finiteRecord_iff ops s hnN).mpr hpre
    have hget : ∀ d ≤ n, (finiteRecord ops N s).getD d s = (prefixStates ops n s).getD d s :=
      fun d hd => by
        rw [getD_finiteRecord ops N s d s (lt_of_le_of_lt hd hlen),
          getD_prefixStates ops n s d s hd]
    have hred := cachedReduction_congr ops (ops.thresholds s) s (properDivisors n)
      (fun d hd => hget d (le_of_lt (mem_properDivisors.mp hd).2.2))
    simp only [walk_of_prefixFinite hpre, hlen, if_true, Option.map_some, hget n le_rfl, hred]
  · have hlen : ¬ n < (finiteRecord ops N s).length :=
      mt (lt_length_finiteRecord_iff ops s hnN).mp hpre
    simp only [walk_eq_none_of_not hpre, hlen, if_false, Option.map_none]

/-- Cross-candidate reuse agrees with today's re-walking verifier. -/
theorem sharedCachedVerify_eq_recomputeVerify (ops : Ops S P) (s : S) {N n : ℕ} (hnN : n ≤ N)
    (iterations evidence : ℕ) (old : Record P) :
    sharedCachedVerify ops s (finiteRecord ops N s) n iterations evidence old =
      recomputeVerify ops s n iterations evidence old := by
  rw [sharedCachedVerify_eq_cachedVerify ops s hnN, cachedVerify_eq_recomputeVerify]

/-! ### Refusals preserve the record -/

/-- The finish step writes the record only on acceptance. -/
theorem finishState_refusal_preserves (ops : Ops S P) (t : Thresholds) (period : ℕ) (σ : S)
    (iterations evidence : ℕ) (old : Record P)
    (hrefuse : (finishState ops t period σ iterations evidence old).1 ≠ .accepted) :
    (finishState ops t period σ iterations evidence old).2 = old := by
  unfold finishState at hrefuse ⊢
  split_ifs at hrefuse ⊢ <;> simp_all

/-- Every non-accepted code of the re-walking verifier leaves the record untouched. -/
theorem recomputeVerify_refusal_preserves (ops : Ops S P) (s : S)
    (n iterations evidence : ℕ) (old : Record P)
    (hrefuse : (recomputeVerify ops s n iterations evidence old).1 ≠ .accepted) :
    (recomputeVerify ops s n iterations evidence old).2 = old := by
  unfold recomputeVerify at hrefuse ⊢
  by_cases hn : n < 1
  · simp only [hn, if_true]
  simp only [hn, if_false] at hrefuse ⊢
  cases hw : walk ops n s with
  | none => rfl
  | some z =>
    simp only [hw] at hrefuse ⊢
    split_ifs at hrefuse ⊢ <;> try rfl
    cases hr : recomputeReduction ops (ops.thresholds s) s (properDivisors n) with
    | nonFinite => rfl
    | ambiguous => rfl
    | keep =>
      simp only [hr] at hrefuse ⊢
      exact finishState_refusal_preserves ops _ _ _ _ _ old hrefuse
    | reduced d w =>
      simp only [hr] at hrefuse ⊢
      exact finishState_refusal_preserves ops _ _ _ _ _ old hrefuse

/-- Every non-accepted code of the frame cache leaves the record untouched. -/
theorem cachedVerify_refusal_preserves (ops : Ops S P) (s : S)
    (n iterations evidence : ℕ) (old : Record P)
    (hrefuse : (cachedVerify ops s n iterations evidence old).1 ≠ .accepted) :
    (cachedVerify ops s n iterations evidence old).2 = old := by
  rw [cachedVerify_eq_recomputeVerify] at hrefuse ⊢
  exact recomputeVerify_refusal_preserves ops s n iterations evidence old hrefuse

/-! ### Connection to V0 / V1 -/

/-- The V0/V1 frames of the prefix states: residual square, multiplier magnitude, and payload
at `step^[d] s`. -/
def frames (ops : Ops S P) (s : S) (d : ℕ) : Frame P :=
  ⟨ops.residualSquared s (ops.step^[d] s), ops.multiplierMagnitude (ops.step^[d] s),
    ops.payload d (ops.step^[d] s)⟩

/-- Embed a V0/V1 reduction as a divisor-scan outcome carrying the selected prefix state. -/
def embedReduction (ops : Ops S P) (s : S) : Reduction → Outcome S
  | .keep => .keep
  | .ambiguous => .ambiguous
  | .reduced d => .reduced d (ops.step^[d] s)

/-- On a finite main walk the divisor scan either reports a non-finite residual or is exactly
the V1 inline reduction on the prefix frames. -/
theorem recomputeReduction_spec (ops : Ops S P) (t : Thresholds) {n : ℕ} {s : S}
    (hpre : PrefixFinite ops n s) (ds : List ℕ) (hds : ∀ d ∈ ds, d ≤ n) :
    recomputeReduction ops t s ds = .nonFinite ∨
      recomputeReduction ops t s ds =
        embedReduction ops s (inlineReduction t (frames ops s) ds) := by
  induction ds with
  | nil => exact Or.inr rfl
  | cons d ds ih =>
    have hdn : d ≤ n := hds d List.mem_cons_self
    have hw := walk_of_prefixFinite (hpre.mono hdn)
    have hrest := ih (fun e he => hds e (List.mem_cons_of_mem _ he))
    by_cases hfin : ops.residualFinite s (ops.step^[d] s) = true
    · by_cases ha : ops.residualSquared s (ops.step^[d] s) ≤ t.acceptSquared
      · right
        simp [recomputeReduction, inlineReduction, hw, hfin, ha, frames, embedReduction]
      · by_cases he : ops.residualSquared s (ops.step^[d] s) < t.excludeSquared
        · right
          simp [recomputeReduction, inlineReduction, hw, hfin, ha, he, frames, embedReduction]
        · simp only [recomputeReduction, inlineReduction, hw, hfin, ha, he, frames, if_true,
            if_false]
          exact hrest
    · left
      simp [recomputeReduction, hw, hfin]

/-- A finite selected state turns the abstract finish into V0's `finish` on the prefix frames. -/
theorem finishState_eq_finish (ops : Ops S P) (t : Thresholds) (s : S) (p : ℕ)
    (iterations evidence : ℕ) (old : Record P)
    (hfinite : (finishState ops t p (ops.step^[p] s) iterations evidence old).1 ≠
      .rejectedNonFinite) :
    finishState ops t p (ops.step^[p] s) iterations evidence old =
      mapResult (finish t (frames ops s) p iterations evidence old) := by
  unfold finishState at hfinite ⊢
  unfold finish mapResult
  by_cases hmag : ops.magnitudeFinite (ops.step^[p] s) = true
  · by_cases hlt : ops.multiplierMagnitude (ops.step^[p] s) < t.attractUpper
    · simp [hmag, hlt, frames, ofVerdict]
    · simp [hmag, hlt, frames, ofVerdict]
  · simp [hmag] at hfinite

/-- **V2 to V1.** Unless a finiteness check fires, the re-walking verifier is exactly V1
`inline` on the prefix frames, including the complete record. -/
theorem recomputeVerify_eq_inline (ops : Ops S P) (s : S) (n iterations evidence : ℕ)
    (old : Record P)
    (hfinite : (recomputeVerify ops s n iterations evidence old).1 ≠ .rejectedNonFinite) :
    recomputeVerify ops s n iterations evidence old =
      mapResult (Verifier.inline (ops.thresholds s) (frames ops s) n iterations evidence old) := by
  unfold recomputeVerify at hfinite ⊢
  unfold Verifier.inline Verifier.decide
  by_cases hn : n < 1
  · obtain rfl : n = 0 := by omega
    simp [mapResult, ofVerdict]
  have hn0 : n ≠ 0 := by omega
  simp only [hn, hn0, if_false] at hfinite ⊢
  cases hw : walk ops n s with
  | none => simp [hw] at hfinite
  | some z =>
    obtain ⟨hpre, rfl⟩ := (walk_eq_some_iff ops n s z).mp hw
    simp only [hw] at hfinite ⊢
    by_cases hder : ops.derivativeFinite (ops.step^[n] s) = true
    swap
    · simp [hder] at hfinite
    by_cases hres : ops.residualFinite s (ops.step^[n] s) = true
    swap
    · simp [hder, hres] at hfinite
    simp only [hder, hres, if_true] at hfinite ⊢
    by_cases hex : ops.residualSquared s (ops.step^[n] s) > (ops.thresholds s).excludeSquared
    · simp [hex, frames, mapResult, ofVerdict]
    by_cases hac : ops.residualSquared s (ops.step^[n] s) > (ops.thresholds s).acceptSquared
    · simp [hex, hac, frames, mapResult, ofVerdict]
    simp only [hex, hac, if_false, frames] at hfinite ⊢
    rcases recomputeReduction_spec ops (ops.thresholds s) hpre (properDivisors n)
        (fun d hd => le_of_lt (mem_properDivisors.mp hd).2.2) with h | h
    · simp [h] at hfinite
    · rw [h] at hfinite ⊢
      cases hi : inlineReduction (ops.thresholds s) (frames ops s) (properDivisors n) with
      | ambiguous => simp [embedReduction, mapResult, ofVerdict]
      | keep =>
        simp only [hi, embedReduction] at hfinite ⊢
        exact finishState_eq_finish ops _ s n iterations evidence old hfinite
      | reduced d =>
        simp only [hi, embedReduction] at hfinite ⊢
        exact finishState_eq_finish ops _ s d iterations evidence old hfinite

/-- **V2 to V0.** Unless a finiteness check fires, the re-walking verifier is exactly V0
`reference` on the prefix frames, including the complete record. -/
theorem recomputeVerify_eq_reference (ops : Ops S P) (s : S) (n iterations evidence : ℕ)
    (old : Record P)
    (hfinite : (recomputeVerify ops s n iterations evidence old).1 ≠ .rejectedNonFinite) :
    recomputeVerify ops s n iterations evidence old =
      mapResult (reference (ops.thresholds s) (frames ops s) n iterations evidence old) := by
  rw [← inline_eq_reference]
  exact recomputeVerify_eq_inline ops s n iterations evidence old hfinite

/-- **V2 cache to V1.** Unless a finiteness check fires, the frame cache is exactly V1 `inline`
on the prefix frames. -/
theorem cachedVerify_eq_inline (ops : Ops S P) (s : S) (n iterations evidence : ℕ)
    (old : Record P)
    (hfinite : (cachedVerify ops s n iterations evidence old).1 ≠ .rejectedNonFinite) :
    cachedVerify ops s n iterations evidence old =
      mapResult (Verifier.inline (ops.thresholds s) (frames ops s) n iterations evidence old) := by
  rw [cachedVerify_eq_recomputeVerify] at hfinite ⊢
  exact recomputeVerify_eq_inline ops s n iterations evidence old hfinite

/-- **V2 cache to V0.** Unless a finiteness check fires, the frame cache is exactly V0
`reference` on the prefix frames. -/
theorem cachedVerify_eq_reference (ops : Ops S P) (s : S) (n iterations evidence : ℕ)
    (old : Record P)
    (hfinite : (cachedVerify ops s n iterations evidence old).1 ≠ .rejectedNonFinite) :
    cachedVerify ops s n iterations evidence old =
      mapResult (reference (ops.thresholds s) (frames ops s) n iterations evidence old) := by
  rw [cachedVerify_eq_recomputeVerify] at hfinite ⊢
  exact recomputeVerify_eq_reference ops s n iterations evidence old hfinite

/-- A sufficient condition under which no finiteness check can fire: the main walk, the final
derivative, and the residual square and multiplier magnitude at the candidate and every
positive divisor are finite. -/
structure FiniteChecks (ops : Ops S P) (s : S) (n : ℕ) : Prop where
  /-- Every main-walk state passes the per-step check. -/
  walkFinite : PrefixFinite ops n s
  /-- The final derivative passes the end-of-walk check. -/
  derivativeFinite : ops.derivativeFinite (ops.step^[n] s) = true
  /-- The residual square is finite at the candidate and every positive divisor. -/
  residualFinite : ∀ d, 0 < d → d ∣ n → ops.residualFinite s (ops.step^[d] s) = true
  /-- The multiplier magnitude is finite at the candidate and every positive divisor. -/
  magnitudeFinite : ∀ d, 0 < d → d ∣ n → ops.magnitudeFinite (ops.step^[d] s) = true

/-- If every visited divisor residual square is finite, the divisor scan is never non-finite. -/
theorem recomputeReduction_ne_nonFinite (ops : Ops S P) (t : Thresholds) {n : ℕ} {s : S}
    (hpre : PrefixFinite ops n s) (ds : List ℕ) (hds : ∀ d ∈ ds, d ≤ n)
    (hres : ∀ d ∈ ds, ops.residualFinite s (ops.step^[d] s) = true) :
    recomputeReduction ops t s ds ≠ .nonFinite := by
  induction ds with
  | nil => simp [recomputeReduction]
  | cons d ds ih =>
    have hw := walk_of_prefixFinite (hpre.mono (hds d List.mem_cons_self))
    have hrest := ih (fun e he => hds e (List.mem_cons_of_mem _ he))
      (fun e he => hres e (List.mem_cons_of_mem _ he))
    simp only [recomputeReduction, hw, hres d List.mem_cons_self, if_true]
    split_ifs <;> simp [hrest]

/-- A V1 reduced divisor comes from the scanned list. -/
theorem mem_of_inlineReduction_eq_reduced {t : Thresholds} {f : ℕ → Frame P} {ds : List ℕ}
    {d : ℕ} (h : inlineReduction t f ds = .reduced d) : d ∈ ds := by
  obtain ⟨pre, post, hsplit, -, -⟩ := (inlineReduction_eq_reduced_iff t f ds d).mp h
  rw [hsplit]
  exact List.mem_append_cons_self

/-- Under `FiniteChecks`, the re-walking verifier never reports a non-finite value. -/
theorem recomputeVerify_ne_nonFinite_of_finiteChecks (ops : Ops S P) (s : S)
    (n iterations evidence : ℕ) (old : Record P) (hcheck : FiniteChecks ops s n) :
    (recomputeVerify ops s n iterations evidence old).1 ≠ .rejectedNonFinite := by
  unfold recomputeVerify
  by_cases hn : n < 1
  · simp [hn]
  have hnpos : 0 < n := by omega
  have hw := walk_of_prefixFinite hcheck.walkFinite
  simp only [hn, if_false, hw, hcheck.derivativeFinite,
    hcheck.residualFinite n hnpos dvd_rfl, if_true]
  split_ifs
  · simp
  · simp
  have hred : recomputeReduction ops (ops.thresholds s) s (properDivisors n) =
      embedReduction ops s (inlineReduction (ops.thresholds s) (frames ops s)
        (properDivisors n)) := by
    have hds : ∀ d ∈ properDivisors n, d ≤ n :=
      fun d hd => le_of_lt (mem_properDivisors.mp hd).2.2
    rcases recomputeReduction_spec ops (ops.thresholds s) hcheck.walkFinite
        (properDivisors n) hds with h | h
    · exact absurd h (recomputeReduction_ne_nonFinite ops _ hcheck.walkFinite _ hds
        (fun d hd => hcheck.residualFinite d (mem_properDivisors.mp hd).1
          (mem_properDivisors.mp hd).2.1))
    · exact h
  rw [hred]
  cases hi : inlineReduction (ops.thresholds s) (frames ops s) (properDivisors n) with
  | ambiguous => simp [embedReduction]
  | keep =>
    simp only [embedReduction, finishState, hcheck.magnitudeFinite n hnpos dvd_rfl, if_true]
    split_ifs <;> simp
  | reduced d =>
    have hd := mem_properDivisors.mp (mem_of_inlineReduction_eq_reduced hi)
    simp only [embedReduction, finishState, hcheck.magnitudeFinite d hd.1 hd.2.1, if_true]
    split_ifs <;> simp

/-- Under `FiniteChecks`, the frame cache never reports a non-finite value. -/
theorem cachedVerify_ne_nonFinite_of_finiteChecks (ops : Ops S P) (s : S)
    (n iterations evidence : ℕ) (old : Record P) (hcheck : FiniteChecks ops s n) :
    (cachedVerify ops s n iterations evidence old).1 ≠ .rejectedNonFinite := by
  rw [cachedVerify_eq_recomputeVerify]
  exact recomputeVerify_ne_nonFinite_of_finiteChecks ops s n iterations evidence old hcheck

/-- A V0 acceptance writes status two, the provenance, a selected period that is the candidate
or the reduced divisor, and that frame's payload; the selected frame passed the cutoff. -/
theorem reference_accepted {t : Thresholds} {f : ℕ → Frame P} {n iterations evidence : ℕ}
    {old : Record P} (hacc : (reference t f n iterations evidence old).1 = .accepted) :
    ∃ p, 0 < p ∧ p ∣ n ∧ (p = n ∨ referenceReduction t f (properDivisors n) = .reduced p) ∧
      (reference t f n iterations evidence old).2 = ⟨2, iterations, evidence, p, (f p).fields⟩ ∧
      (f p).multiplierMagnitude < t.attractUpper := by
  unfold reference Verifier.decide at hacc ⊢
  by_cases hn : n = 0
  · simp [hn] at hacc
  by_cases hex : (f n).residualSquared > t.excludeSquared
  · simp [hn, hex] at hacc
  by_cases hac : (f n).residualSquared > t.acceptSquared
  · simp [hn, hex, hac] at hacc
  simp only [hn, hex, hac, if_false] at hacc ⊢
  cases hr : referenceReduction t f (properDivisors n) with
  | ambiguous => simp [hr] at hacc
  | keep =>
    simp only [hr, finish] at hacc ⊢
    by_cases hlt : (f n).multiplierMagnitude < t.attractUpper
    · exact ⟨n, Nat.pos_of_ne_zero hn, dvd_rfl, Or.inl rfl, by simp [hlt], hlt⟩
    · simp [hlt] at hacc
  | reduced d =>
    simp only [hr, finish] at hacc ⊢
    have hd := mem_properDivisors.mp
      (referenceReduction_reduced_least t f n d hr).1
    by_cases hlt : (f d).multiplierMagnitude < t.attractUpper
    · exact ⟨d, hd.1, hd.2.1, Or.inr rfl, by simp [hlt], hlt⟩
    · simp [hlt] at hacc

/-- **Accepted cache record.** An accepted frame-cache result selects a positive divisor `p` of
the candidate (the candidate itself, or V0's least accepted proper divisor), writes exactly
`⟨2, iterations, evidence, p, payload p (step^[p] s)⟩`, and that state passed the cutoff. -/
theorem cachedVerify_accepted_record (ops : Ops S P) (s : S) (n iterations evidence : ℕ)
    (old : Record P) (hacc : (cachedVerify ops s n iterations evidence old).1 = .accepted) :
    ∃ p, 0 < p ∧ p ∣ n ∧
      (p = n ∨ referenceReduction (ops.thresholds s) (frames ops s) (properDivisors n) =
        .reduced p) ∧
      (cachedVerify ops s n iterations evidence old).2 =
        ⟨2, iterations, evidence, p, ops.payload p (ops.step^[p] s)⟩ ∧
      ops.multiplierMagnitude (ops.step^[p] s) < (ops.thresholds s).attractUpper := by
  have hne : (cachedVerify ops s n iterations evidence old).1 ≠ .rejectedNonFinite := by
    rw [hacc]
    decide
  have heq := cachedVerify_eq_reference ops s n iterations evidence old hne
  rw [heq] at hacc ⊢
  have hacc' : (reference (ops.thresholds s) (frames ops s) n iterations evidence old).1 =
      .accepted := by
    simp only [mapResult] at hacc
    cases h : (reference (ops.thresholds s) (frames ops s) n iterations evidence old).1 <;>
      simp_all [ofVerdict]
  exact reference_accepted hacc'

/-! ### The inline lag-scan check order -/

/-- Absorbing non-finiteness propagates finiteness backwards along any number of steps. -/
theorem stateFinite_of_iterate (ops : Ops S P)
    (habsorb : ∀ x, ops.stateFinite (ops.step x) = true → ops.stateFinite x = true) :
    ∀ m x, ops.stateFinite (ops.step^[m] x) = true → ops.stateFinite x = true := by
  intro m
  induction m with
  | zero => exact fun x h => h
  | succ m ih =>
    intro x h
    rw [Function.iterate_succ_apply] at h
    exact habsorb x (ih (ops.step x) h)

/-- With absorbing non-finiteness, per-step checks of a positive-length walk are equivalent to
one check of the final state. -/
theorem prefixFinite_iff_last (ops : Ops S P)
    (habsorb : ∀ x, ops.stateFinite (ops.step x) = true → ops.stateFinite x = true)
    {n : ℕ} (hn : 0 < n) (s : S) :
    PrefixFinite ops n s ↔ ops.stateFinite (ops.step^[n] s) = true := by
  constructor
  · intro h
    have := h (n - 1) (by omega)
    rwa [Nat.sub_add_cancel hn] at this
  · intro h i hi
    have hsplit : ops.step^[n] s = ops.step^[n - (i + 1)] (ops.step^[i + 1] s) := by
      rw [← Function.iterate_add_apply]
      congr 1
      omega
    rw [hsplit] at h
    exact stateFinite_of_iterate ops habsorb _ _ h

/-- **Inline check order.** If state non-finiteness is absorbing under `step` (a hypothesis
about the arithmetic, not proved here for binary64), checking the state once after the main
walk, as the inline lag-scan mirror does, gives the same result as the canonical per-step
checks; by `cachedVerify_eq_recomputeVerify` it also agrees with the frame cache. -/
theorem endCheckVerify_eq_recomputeVerify (ops : Ops S P)
    (habsorb : ∀ x, ops.stateFinite (ops.step x) = true → ops.stateFinite x = true)
    (s : S) (n iterations evidence : ℕ) (old : Record P) :
    endCheckVerify ops s n iterations evidence old =
      recomputeVerify ops s n iterations evidence old := by
  unfold endCheckVerify recomputeVerify
  by_cases hn : n < 1
  · simp only [hn, if_true]
  have hnpos : 0 < n := by omega
  simp only [hn, if_false]
  by_cases hfin : ops.stateFinite (ops.step^[n] s) = true
  · have hw := walk_of_prefixFinite ((prefixFinite_iff_last ops habsorb hnpos s).mpr hfin)
    simp only [hw, hfin, Bool.true_and]
  · have hw := walk_eq_none_of_not (mt (prefixFinite_iff_last ops habsorb hnpos s).mp hfin)
    simp [hw, hfin]

/-! ### Shared record for the inline end-check path -/

/-- With absorbing non-finiteness, the truncating shared record reaches index `n` exactly when
the state at `n` passes the check. -/
theorem lt_length_finiteRecord_iff_last (ops : Ops S P)
    (habsorb : ∀ x, ops.stateFinite (ops.step x) = true → ops.stateFinite x = true)
    {N n : ℕ} (s : S) (hn : 0 < n) (hnN : n ≤ N) :
    n < (finiteRecord ops N s).length ↔ ops.stateFinite (ops.step^[n] s) = true :=
  (lt_length_finiteRecord_iff ops s hnN).trans (prefixFinite_iff_last ops habsorb hn s)

/-- Inline-path cross-candidate reuse: a non-truncating record of unchecked states, read with one
combined state and derivative check at index `n` (intended: `prefixStates ops N s`, `n ≤ N`). -/
def sharedEndCheckVerify (ops : Ops S P) (s : S) (cache : List S) (n iterations evidence : ℕ)
    (old : Record P) : Code × Record P :=
  if n < 1 then (.rejectedNoClosure, old)
  else
    if ops.stateFinite (cache.getD n s) && ops.derivativeFinite (cache.getD n s) then
      if ops.residualFinite s (cache.getD n s) then
        if ops.residualSquared s (cache.getD n s) > (ops.thresholds s).excludeSquared then
          (.rejectedNoClosure, old)
        else if ops.residualSquared s (cache.getD n s) > (ops.thresholds s).acceptSquared then
          (.unresolvedClosureAmbiguous, old)
        else
          match cachedReduction ops (ops.thresholds s) s cache (properDivisors n) with
          | .nonFinite => (.rejectedNonFinite, old)
          | .ambiguous => (.unresolvedDivisorAmbiguous, old)
          | .reduced d w => finishState ops (ops.thresholds s) d w iterations evidence old
          | .keep => finishState ops (ops.thresholds s) n (cache.getD n s) iterations
              evidence old
      else (.rejectedNonFinite, old)
    else (.rejectedNonFinite, old)

/-- **Inline-path shared reuse.** Under absorbing non-finiteness, reading candidate `n ≤ N` from
one unchecked shared record with an end check at `n` equals the inline end-check verifier. -/
theorem sharedEndCheckVerify_eq_endCheckVerify (ops : Ops S P)
    (habsorb : ∀ x, ops.stateFinite (ops.step x) = true → ops.stateFinite x = true)
    (s : S) {N n : ℕ} (hnN : n ≤ N) (iterations evidence : ℕ) (old : Record P) :
    sharedEndCheckVerify ops s (prefixStates ops N s) n iterations evidence old =
      endCheckVerify ops s n iterations evidence old := by
  unfold sharedEndCheckVerify endCheckVerify
  by_cases hn : n < 1
  · simp only [hn, if_true]
  have hnpos : 0 < n := by omega
  simp only [hn, if_false, getD_prefixStates ops N s n s hnN]
  by_cases hfin : ops.stateFinite (ops.step^[n] s) = true
  · have hpre := (prefixFinite_iff_last ops habsorb hnpos s).mpr hfin
    have hred : cachedReduction ops (ops.thresholds s) s (prefixStates ops N s)
        (properDivisors n) = recomputeReduction ops (ops.thresholds s) s (properDivisors n) := by
      have hds : ∀ d ∈ properDivisors n, d ≤ n :=
        fun d hd => le_of_lt (mem_properDivisors.mp hd).2.2
      rw [cachedReduction_congr ops (ops.thresholds s) s (c₂ := prefixStates ops n s) _
        (fun d hd => by
          rw [getD_prefixStates ops N s d s (le_trans (hds d hd) hnN),
            getD_prefixStates ops n s d s (hds d hd)])]
      exact cachedReduction_eq_recomputeReduction ops _ hpre _ hds
    simp only [hred]
  · simp [hfin]

/-- Inline-path shared reuse agrees with today's canonical verifier under absorption. -/
theorem sharedEndCheckVerify_eq_recomputeVerify (ops : Ops S P)
    (habsorb : ∀ x, ops.stateFinite (ops.step x) = true → ops.stateFinite x = true)
    (s : S) {N n : ℕ} (hnN : n ≤ N) (iterations evidence : ℕ) (old : Record P) :
    sharedEndCheckVerify ops s (prefixStates ops N s) n iterations evidence old =
      recomputeVerify ops s n iterations evidence old := by
  rw [sharedEndCheckVerify_eq_endCheckVerify ops habsorb s hnN,
    endCheckVerify_eq_recomputeVerify ops habsorb]

/-! ### Concrete sanity examples

The examples use a real-slice state `(z, D)` over exact rationals, with the step
`(z, D) ↦ (z² + c, D · 2z)` (derivative from the old `z`, as in TypeScript). "Finiteness" is a
stand-in magnitude bound, not binary64 overflow, and the thresholds are exact rational
transcriptions of the decimal policy values (`acceptSquared = 10⁻¹⁶ · scale²`,
`excludeSquared = 10⁻¹² · scale²`, `attractUpper = 1 - 10⁻¹²`, `scale = max 1 |z₀|`), not the
binary64 constants. -/

-- `Verifier.Record` lives in VerifierModel.lean, which this task does not edit; derive its
-- decidable equality here (where it is first needed) so the examples can compare full records.
deriving instance DecidableEq for Verifier.Record

/-- Scale-aware exact rational thresholds computed from the cycle start. -/
def exampleThresholds (z : ℚ) : Thresholds where
  acceptSquared := 1 / 10000000000000000 * max 1 |z| ^ 2
  excludeSquared := 1 / 1000000000000 * max 1 |z| ^ 2
  attractUpper := 1 - 1 / 1000000000000
  accept_lt_exclude := by
    have hscale : 0 < max 1 |z| ^ 2 := pow_pos (lt_of_lt_of_le one_pos (le_max_left _ _)) 2
    exact mul_lt_mul_of_pos_right (by norm_num) hscale

/-- Real-slice exact rational verifier arithmetic for `z ↦ z² + c` with a stand-in finiteness
bound; the payload records the multiplier and the selected period. -/
def realSliceOps (c bound : ℚ) : Ops (ℚ × ℚ) (ℚ × ℕ) where
  step x := (x.1 * x.1 + c, x.2 * (2 * x.1))
  stateFinite x := decide (|x.1| ≤ bound)
  derivativeFinite x := decide (|x.2| ≤ bound)
  residualFinite s w := decide ((w.1 - s.1) * (w.1 - s.1) ≤ bound)
  residualSquared s w := (w.1 - s.1) * (w.1 - s.1)
  magnitudeFinite x := decide (|x.2| ≤ bound)
  multiplierMagnitude x := |x.2|
  payload p x := (x.2, p)
  thresholds s := exampleThresholds s.1

/-- An untouched prior record for the examples. -/
def exampleOld : Record (ℚ × ℕ) := ⟨0, 0, 0, 0, (0, 0)⟩

/-- The cache of the period-four walk at `c = -1` from the critical seed. -/
example : walkRecord (realSliceOps (-1) 1000000) 4 (0, 1) =
    some [(0, 1), (-1, 0), (0, 0), (-1, 0), (0, 0)] := by decide +kernel

/-- Period two at `c = -1` is accepted with the superattracting multiplier `0`. -/
example : (cachedVerify (realSliceOps (-1) 1000000) (0, 1) 2 7 3 exampleOld).1 = .accepted ∧
    (cachedVerify (realSliceOps (-1) 1000000) (0, 1) 2 7 3 exampleOld).2 =
      ⟨2, 7, 3, 2, (0, 2)⟩ := by
  decide +kernel

/-- A period-four candidate at `c = -1` is reduced to its divisor two (divisor one is excluded),
and the cache and the re-walking verifier agree. -/
theorem realSlice_periodFour_reduces :
    (cachedVerify (realSliceOps (-1) 1000000) (0, 1) 4 7 3 exampleOld).1 = .accepted ∧
    (cachedVerify (realSliceOps (-1) 1000000) (0, 1) 4 7 3 exampleOld).2.period = 2 ∧
    (recomputeVerify (realSliceOps (-1) 1000000) (0, 1) 4 7 3 exampleOld).2.period = 2 ∧
    (cachedVerify (realSliceOps (-1) 1000000) (0, 1) 4 7 3 exampleOld).2.fields = (0, 2) ∧
    (cachedVerify (realSliceOps (-1) 1000000) (0, 1) 4 7 3 exampleOld).1.toNat = 5 := by
  decide +kernel

/-- Period one at `c = -1` from `0` does not close. -/
example : (cachedVerify (realSliceOps (-1) 1000000) (0, 1) 1 7 3 exampleOld).1 =
    .rejectedNoClosure := by decide +kernel

/-- The `proposedPeriod < 1` refusal. -/
example : (cachedVerify (realSliceOps (-1) 1000000) (0, 1) 0 7 3 exampleOld).1 =
    .rejectedNoClosure := by decide +kernel

/-- The repelling fixed point `1` at `c = 0` closes but is not attracting. -/
example : (cachedVerify (realSliceOps 0 1000000) (1, 1) 1 7 3 exampleOld).1 =
    .rejectedNotAttracting := by decide +kernel

/-- At `c = 1` the critical orbit `0, 1, 2, 5, 26, 677` exceeds the stand-in bound `100` during
the main walk of a period-five candidate. -/
example : (cachedVerify (realSliceOps 1 100) (0, 1) 5 7 3 exampleOld).1 =
    .rejectedNonFinite := by decide +kernel

/-- The V0 correspondence applies to the concrete period-four candidate; its non-finite
hypothesis is discharged by evaluation. -/
theorem realSlice_periodFour_eq_reference :
    cachedVerify (realSliceOps (-1) 1000000) (0, 1) 4 7 3 exampleOld =
    mapResult (reference (exampleThresholds 0) (frames (realSliceOps (-1) 1000000) (0, 1))
      4 7 3 exampleOld) :=
  cachedVerify_eq_reference _ _ _ _ _ _ (by decide +kernel)

/-- A synthetic counter state whose odd-length residual squares sit in the threshold gap; it
exercises the two ambiguity codes. -/
def gapOps : Ops ℕ ℕ where
  step := Nat.succ
  stateFinite _ := true
  derivativeFinite _ := true
  residualFinite _ _ := true
  residualSquared s w := if (w - s) % 2 = 0 then 0 else 1 / 10000000000000
  magnitudeFinite _ := true
  multiplierMagnitude _ := 0
  payload p _ := p
  thresholds _ := exampleThresholds 0

/-- An odd candidate residual in the gap is closure-ambiguous. -/
example : (cachedVerify gapOps 0 1 7 3 (⟨0, 0, 0, 0, 0⟩ : Record ℕ)).1 =
    .unresolvedClosureAmbiguous := by decide +kernel

/-- An accepted candidate whose divisor one sits in the gap is divisor-ambiguous. -/
example : (cachedVerify gapOps 0 2 7 3 (⟨0, 0, 0, 0, 0⟩ : Record ℕ)).1 =
    .unresolvedDivisorAmbiguous := by decide +kernel

/-- The concrete period-four candidate satisfies `FiniteChecks`, so the V0 bridge applies
without evaluating the verifier itself. -/
theorem realSlice_periodFour_finiteChecks :
    FiniteChecks (realSliceOps (-1) 1000000) (0, 1) 4 where
  walkFinite := by
    unfold PrefixFinite
    decide +kernel
  derivativeFinite := by decide +kernel
  residualFinite d hd hdvd := by
    have hle : d ≤ 4 := Nat.le_of_dvd (by norm_num) hdvd
    interval_cases d <;> decide +kernel
  magnitudeFinite d hd hdvd := by
    have hle : d ≤ 4 := Nat.le_of_dvd (by norm_num) hdvd
    interval_cases d <;> decide +kernel

/-- The stand-in bound `10⁶` is absorbing at `c = -1`: if `|z| > 10⁶` then
`|z² - 1| > 10⁶`. -/
theorem realSliceOps_absorbing (x : ℚ × ℚ)
    (h : (realSliceOps (-1) 1000000).stateFinite ((realSliceOps (-1) 1000000).step x) = true) :
    (realSliceOps (-1) 1000000).stateFinite x = true := by
  simp only [realSliceOps, decide_eq_true_eq] at h ⊢
  by_contra hx
  have hlt : (1000000 : ℚ) < |x.1| := lt_of_not_ge hx
  have hsq : (1000000 : ℚ) * 1000000 < x.1 * x.1 := by
    rw [← abs_mul_abs_self x.1]
    nlinarith
  have hle := le_abs_self (x.1 * x.1 + -1)
  linarith

/-- The inline end-check order applies to the concrete real slice, with absorption proved. -/
theorem realSlice_endCheck_eq_recompute (s : ℚ × ℚ) (n iterations evidence : ℕ)
    (old : Record (ℚ × ℕ)) :
    endCheckVerify (realSliceOps (-1) 1000000) s n iterations evidence old =
      recomputeVerify (realSliceOps (-1) 1000000) s n iterations evidence old :=
  endCheckVerify_eq_recomputeVerify _ realSliceOps_absorbing s n iterations evidence old

/-- A synthetic counter state with a state bound and flagged non-finite derivative, residual,
and magnitude observations; odd residual squares are excluded, even ones accepted. -/
def counterOps (stateBound : ℕ) (badDerivative badResidual badMagnitude : ℕ → Bool) :
    Ops ℕ ℕ where
  step := Nat.succ
  stateFinite x := decide (x ≤ stateBound)
  derivativeFinite x := !badDerivative x
  residualFinite s w := !badResidual (w - s)
  residualSquared s w := if (w - s) % 2 = 0 then 0 else 1
  magnitudeFinite x := !badMagnitude x
  multiplierMagnitude _ := 0
  payload p _ := p
  thresholds _ := exampleThresholds 0

/-- A record for the counter examples. -/
def counterOld : Record ℕ := ⟨0, 0, 0, 0, 0⟩

/-- The remaining non-finite branches: final derivative, a divisor residual square, and the
selected multiplier magnitude in `finishState`; with no flags the same candidate is accepted. -/
theorem counter_nonFinite_branches :
    (cachedVerify (counterOps 100 (· == 2) (fun _ => false) (fun _ => false)) 0 2 7 3
      counterOld).1 = .rejectedNonFinite ∧
    (cachedVerify (counterOps 100 (fun _ => false) (· == 1) (fun _ => false)) 0 2 7 3
      counterOld).1 = .rejectedNonFinite ∧
    (cachedVerify (counterOps 100 (fun _ => false) (fun _ => false) (· == 2)) 0 2 7 3
      counterOld).1 = .rejectedNonFinite ∧
    cachedVerify (counterOps 100 (fun _ => false) (fun _ => false) (fun _ => false)) 0 2 7 3
      counterOld = (.accepted, ⟨2, 7, 3, 2, 2⟩) := by
  decide +kernel

/-- Why failures beyond `n` must only truncate the shared record: with state bound `3`, an
five-step aborting walk fails outright, yet candidate two is accepted; the truncating
shared record keeps that verdict and still rejects candidate four. -/
theorem counter_shared_truncation :
    walkRecord (counterOps 3 (fun _ => false) (fun _ => false) (fun _ => false)) 5 0 = none ∧
    finiteRecord (counterOps 3 (fun _ => false) (fun _ => false) (fun _ => false)) 5 0 =
      [0, 1, 2, 3] ∧
    (cachedVerify (counterOps 3 (fun _ => false) (fun _ => false) (fun _ => false)) 0 2 7 3
      counterOld).1 = .accepted ∧
    (sharedCachedVerify (counterOps 3 (fun _ => false) (fun _ => false) (fun _ => false)) 0
      (finiteRecord (counterOps 3 (fun _ => false) (fun _ => false) (fun _ => false)) 5 0)
      2 7 3 counterOld).1 = .accepted ∧
    (sharedCachedVerify (counterOps 3 (fun _ => false) (fun _ => false) (fun _ => false)) 0
      (finiteRecord (counterOps 3 (fun _ => false) (fun _ => false) (fun _ => false)) 5 0)
      4 7 3 counterOld).1 = .rejectedNonFinite := by
  decide +kernel

/-- One shared record of length five at `c = -1` serves candidates one through four. -/
example :
    (List.range 4).map (fun i => (sharedCachedVerify (realSliceOps (-1) 1000000) (0, 1)
      (finiteRecord (realSliceOps (-1) 1000000) 4 (0, 1)) (i + 1) 7 3 exampleOld).1) =
      [.rejectedNoClosure, .accepted, .rejectedNoClosure, .accepted] := by
  decide +kernel

end IntMProof.VerifierCache
