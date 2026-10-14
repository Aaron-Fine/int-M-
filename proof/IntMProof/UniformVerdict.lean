import IntMProof.VerifierModel

/-!
# Uniform exact-verifier verdicts (J1)

An interval certificate is useful only when every comparison made by the
verifier has a fixed result.  These theorems isolate the required margins and
show that payload fields may vary while the verdict and accepted period do not.
The rational bounds are inputs; producing them from outward complex arithmetic
is the remaining J0 obligation.
-/

namespace IntMProof.Verifier

/-- The divisor scan is unchanged when all its ordered threshold decisions agree. -/
theorem inlineReduction_congr_comparisons {P Q : Type*} (t : Thresholds)
    (a : ℕ → Frame P) (b : ℕ → Frame Q) (ds : List ℕ)
    (haccept : ∀ d ∈ ds,
      ((a d).residualSquared ≤ t.acceptSquared) ↔
        ((b d).residualSquared ≤ t.acceptSquared))
    (hexclude : ∀ d ∈ ds,
      ((a d).residualSquared < t.excludeSquared) ↔
        ((b d).residualSquared < t.excludeSquared)) :
    inlineReduction t a ds = inlineReduction t b ds := by
  induction ds with
  | nil => rfl
  | cons d rest ih =>
    have ha := haccept d List.mem_cons_self
    have he := hexclude d List.mem_cons_self
    have hr := ih
      (fun e h => haccept e (List.mem_cons_of_mem d h))
      (fun e h => hexclude e (List.mem_cons_of_mem d h))
    simp only [inlineReduction]
    split_ifs with h₁ h₂ h₃ h₄ <;> simp_all

/-- The finite verifier's verdict and accepted period depend only on the
threshold comparisons, not on the remaining frame payload. -/
theorem inline_uniform_verdict_and_period {P Q : Type*} (t : Thresholds)
    (a : ℕ → Frame P) (b : ℕ → Frame Q)
    (period iterations evidence : ℕ) (oldA : Record P) (oldB : Record Q)
    (hclosureExclude :
      ((a period).residualSquared > t.excludeSquared) ↔
        ((b period).residualSquared > t.excludeSquared))
    (hclosureAccept :
      ((a period).residualSquared > t.acceptSquared) ↔
        ((b period).residualSquared > t.acceptSquared))
    (hdivAccept : ∀ d ∈ properDivisors period,
      ((a d).residualSquared ≤ t.acceptSquared) ↔
        ((b d).residualSquared ≤ t.acceptSquared))
    (hdivExclude : ∀ d ∈ properDivisors period,
      ((a d).residualSquared < t.excludeSquared) ↔
        ((b d).residualSquared < t.excludeSquared))
    (hattract : ∀ d ∈ period :: properDivisors period,
      ((a d).multiplierMagnitude < t.attractUpper) ↔
        ((b d).multiplierMagnitude < t.attractUpper)) :
    (inline t a period iterations evidence oldA).1 =
      (inline t b period iterations evidence oldB).1 ∧
      ((inline t a period iterations evidence oldA).1 = .accepted →
        (inline t a period iterations evidence oldA).2.period =
          (inline t b period iterations evidence oldB).2.period) := by
  have hred := inlineReduction_congr_comparisons t a b (properDivisors period)
    hdivAccept hdivExclude
  unfold inline decide
  by_cases hp : period = 0
  · simp [hp]
  · simp only [if_neg hp]
    by_cases hx : (a period).residualSquared > t.excludeSquared
    · have hxb := hclosureExclude.mp hx
      simp [hx, hxb]
    · have hxb := (not_iff_not.mpr hclosureExclude).mp hx
      simp only [if_neg hx, if_neg hxb]
      by_cases ha : (a period).residualSquared > t.acceptSquared
      · have hab := hclosureAccept.mp ha
        simp [ha, hab]
      · have hab := (not_iff_not.mpr hclosureAccept).mp ha
        simp only [if_neg ha, if_neg hab]
        rw [hred]
        cases hr : inlineReduction t b (properDivisors period) with
        | ambiguous => simp
        | keep =>
          unfold finish
          by_cases hm : (a period).multiplierMagnitude < t.attractUpper
          · have hmb := (hattract period List.mem_cons_self).mp hm
            simp [hm, hmb]
          · have hmb := (not_iff_not.mpr
              (hattract period List.mem_cons_self)).mp hm
            simp [hm, hmb]
        | reduced d =>
          have hd : d ∈ properDivisors period := by
            have ⟨pre, post, hsplit, _, _⟩ :=
              (inlineReduction_eq_reduced_iff t b (properDivisors period) d).mp hr
            rw [hsplit]
            exact List.mem_append_cons_self
          unfold finish
          by_cases hm : (a d).multiplierMagnitude < t.attractUpper
          · have hmb := (hattract d (List.mem_cons_of_mem period hd)).mp hm
            simp [hm, hmb]
          · have hmb := (not_iff_not.mpr
              (hattract d (List.mem_cons_of_mem period hd))).mp hm
            simp [hm, hmb]

/-- The reference scan has the same uniformity statement as the inline scan. -/
theorem reference_uniform_verdict_and_period {P Q : Type*} (t : Thresholds)
    (a : ℕ → Frame P) (b : ℕ → Frame Q)
    (period iterations evidence : ℕ) (oldA : Record P) (oldB : Record Q)
    (hclosureExclude :
      ((a period).residualSquared > t.excludeSquared) ↔
        ((b period).residualSquared > t.excludeSquared))
    (hclosureAccept :
      ((a period).residualSquared > t.acceptSquared) ↔
        ((b period).residualSquared > t.acceptSquared))
    (hdivAccept : ∀ d ∈ properDivisors period,
      ((a d).residualSquared ≤ t.acceptSquared) ↔
        ((b d).residualSquared ≤ t.acceptSquared))
    (hdivExclude : ∀ d ∈ properDivisors period,
      ((a d).residualSquared < t.excludeSquared) ↔
        ((b d).residualSquared < t.excludeSquared))
    (hattract : ∀ d ∈ period :: properDivisors period,
      ((a d).multiplierMagnitude < t.attractUpper) ↔
        ((b d).multiplierMagnitude < t.attractUpper)) :
    (reference t a period iterations evidence oldA).1 =
      (reference t b period iterations evidence oldB).1 ∧
      ((reference t a period iterations evidence oldA).1 = .accepted →
        (reference t a period iterations evidence oldA).2.period =
          (reference t b period iterations evidence oldB).2.period) := by
  rw [← inline_eq_reference, ← inline_eq_reference]
  exact inline_uniform_verdict_and_period t a b period iterations evidence
    oldA oldB hclosureExclude hclosureAccept hdivAccept hdivExclude hattract

/-- A rational residual interval locks both ordered divisor comparisons when
it lies wholly in acceptance, ambiguity, or exclusion. -/
theorem divisor_comparisons_of_margin (t : Thresholds) {lo hi x y : ℚ}
    (hx : lo ≤ x ∧ x ≤ hi) (hy : lo ≤ y ∧ y ≤ hi)
    (hmargin : hi ≤ t.acceptSquared ∨
      (t.acceptSquared < lo ∧ hi < t.excludeSquared) ∨
      t.excludeSquared ≤ lo) :
    (x ≤ t.acceptSquared ↔ y ≤ t.acceptSquared) ∧
      (x < t.excludeSquared ↔ y < t.excludeSquared) := by
  rcases hmargin with hacc | hamb | hex
  · have hxa : x ≤ t.acceptSquared := hx.2.trans hacc
    have hya : y ≤ t.acceptSquared := hy.2.trans hacc
    have hxe : x < t.excludeSquared := lt_of_le_of_lt hxa t.accept_lt_exclude
    have hye : y < t.excludeSquared := lt_of_le_of_lt hya t.accept_lt_exclude
    simp [hxa, hya, hxe, hye]
  · have hax : ¬ x ≤ t.acceptSquared := not_le.mpr (lt_of_lt_of_le hamb.1 hx.1)
    have hay : ¬ y ≤ t.acceptSquared := not_le.mpr (lt_of_lt_of_le hamb.1 hy.1)
    have hex' : x < t.excludeSquared := lt_of_le_of_lt hx.2 hamb.2
    have hey' : y < t.excludeSquared := lt_of_le_of_lt hy.2 hamb.2
    simp [hax, hay, hex', hey']
  · have hax : ¬ x ≤ t.acceptSquared :=
      not_le.mpr (lt_of_lt_of_le t.accept_lt_exclude (hex.trans hx.1))
    have hay : ¬ y ≤ t.acceptSquared :=
      not_le.mpr (lt_of_lt_of_le t.accept_lt_exclude (hex.trans hy.1))
    have hex' : ¬ x < t.excludeSquared := not_lt.mpr (hex.trans hx.1)
    have hey' : ¬ y < t.excludeSquared := not_lt.mpr (hex.trans hy.1)
    simp [hax, hay, hex', hey']

/-- The candidate closure comparison uses a closed upper edge at exclusion. -/
theorem closure_comparisons_of_margin (t : Thresholds) {lo hi x y : ℚ}
    (hx : lo ≤ x ∧ x ≤ hi) (hy : lo ≤ y ∧ y ≤ hi)
    (hmargin : hi ≤ t.acceptSquared ∨
      (t.acceptSquared < lo ∧ hi ≤ t.excludeSquared) ∨
      t.excludeSquared < lo) :
    (x > t.excludeSquared ↔ y > t.excludeSquared) ∧
      (x > t.acceptSquared ↔ y > t.acceptSquared) := by
  rcases hmargin with hacc | hamb | hex
  · have hxa : x ≤ t.acceptSquared := hx.2.trans hacc
    have hya : y ≤ t.acceptSquared := hy.2.trans hacc
    have hxe : ¬ x > t.excludeSquared := not_lt.mpr (hxa.trans t.accept_lt_exclude.le)
    have hye : ¬ y > t.excludeSquared := not_lt.mpr (hya.trans t.accept_lt_exclude.le)
    have hax : ¬ x > t.acceptSquared := not_lt.mpr hxa
    have hay : ¬ y > t.acceptSquared := not_lt.mpr hya
    simp [hax, hay, hxe, hye]
  · have hax : t.acceptSquared < x := lt_of_lt_of_le hamb.1 hx.1
    have hay : t.acceptSquared < y := lt_of_lt_of_le hamb.1 hy.1
    have hex' : ¬ x > t.excludeSquared := not_lt.mpr (hx.2.trans hamb.2)
    have hey' : ¬ y > t.excludeSquared := not_lt.mpr (hy.2.trans hamb.2)
    simp [hax, hay, hex', hey']
  · have hax : t.acceptSquared < x := lt_trans t.accept_lt_exclude (lt_of_lt_of_le hex hx.1)
    have hay : t.acceptSquared < y := lt_trans t.accept_lt_exclude (lt_of_lt_of_le hex hy.1)
    have hex' : t.excludeSquared < x := lt_of_lt_of_le hex hx.1
    have hey' : t.excludeSquared < y := lt_of_lt_of_le hex hy.1
    simp [hax, hay, hex', hey']

/-- An attraction interval wholly on one side of the strict cutoff locks the
final decision. Equality with the cutoff belongs to the refusal side. -/
theorem attraction_comparison_of_margin (t : Thresholds) {lo hi x y : ℚ}
    (hx : lo ≤ x ∧ x ≤ hi) (hy : lo ≤ y ∧ y ≤ hi)
    (hmargin : hi < t.attractUpper ∨ t.attractUpper ≤ lo) :
    (x < t.attractUpper ↔ y < t.attractUpper) := by
  rcases hmargin with hacc | href
  · exact iff_of_true (lt_of_le_of_lt hx.2 hacc) (lt_of_le_of_lt hy.2 hacc)
  · exact iff_of_false (not_lt.mpr (href.trans hx.1))
      (not_lt.mpr (href.trans hy.1))

/-- A finite family of outward rational enclosures certifies a single verdict
and, on acceptance, a single accepted verifier period throughout `region`.
Only the candidate and its proper divisors require enclosures. Payload fields
and old records may depend on the region point. -/
theorem uniform_verdict_of_interval_margins {S P : Type*} (region : Set S)
    (t : Thresholds) (frames : S → ℕ → Frame P)
    (old : S → Record P) (period iterations evidence : ℕ)
    (resLo resHi magLo magHi : ℕ → ℚ)
    (hres : ∀ s ∈ region, ∀ d ∈ period :: properDivisors period,
      resLo d ≤ (frames s d).residualSquared ∧
        (frames s d).residualSquared ≤ resHi d)
    (hmag : ∀ s ∈ region, ∀ d ∈ period :: properDivisors period,
      magLo d ≤ (frames s d).multiplierMagnitude ∧
        (frames s d).multiplierMagnitude ≤ magHi d)
    (hclosure : resHi period ≤ t.acceptSquared ∨
      (t.acceptSquared < resLo period ∧
        resHi period ≤ t.excludeSquared) ∨
      t.excludeSquared < resLo period)
    (hdiv : ∀ d ∈ properDivisors period,
      resHi d ≤ t.acceptSquared ∨
        (t.acceptSquared < resLo d ∧ resHi d < t.excludeSquared) ∨
        t.excludeSquared ≤ resLo d)
    (hattract : ∀ d ∈ period :: properDivisors period,
      magHi d < t.attractUpper ∨ t.attractUpper ≤ magLo d) :
    ∀ s ∈ region, ∀ u ∈ region,
      (inline t (frames s) period iterations evidence (old s)).1 =
        (inline t (frames u) period iterations evidence (old u)).1 ∧
      ((inline t (frames s) period iterations evidence (old s)).1 = .accepted →
        (inline t (frames s) period iterations evidence (old s)).2.period =
          (inline t (frames u) period iterations evidence (old u)).2.period) := by
  intro s hs u hu
  have hc := closure_comparisons_of_margin t
    (hres s hs period List.mem_cons_self)
    (hres u hu period List.mem_cons_self) hclosure
  apply inline_uniform_verdict_and_period t (frames s) (frames u)
    period iterations evidence (old s) (old u) hc.1 hc.2
  · intro d hd
    exact (divisor_comparisons_of_margin t
      (hres s hs d (List.mem_cons_of_mem period hd))
      (hres u hu d (List.mem_cons_of_mem period hd))
      (hdiv d hd)).1
  · intro d hd
    exact (divisor_comparisons_of_margin t
      (hres s hs d (List.mem_cons_of_mem period hd))
      (hres u hu d (List.mem_cons_of_mem period hd))
      (hdiv d hd)).2
  · intro d hd
    exact attraction_comparison_of_margin t
      (hmag s hs d hd) (hmag u hu d hd) (hattract d hd)

end IntMProof.Verifier
