import IntMProof.StoredDisk
import IntMProof.CertifiedRationalTile
import IntMProof.PeriodTwoVerifierPilot

/-!
# Certified acceptance: from a verifier verdict to an attracting primitive cycle

This file connects the exact rational verifier models V0 (`Verifier.reference`)
and V1 (`Verifier.inline`) to the return-disk theorems L0/L1, for every
period `P`, parameter `c : ℂ` and disk center `z₀ : ℂ`.

What is proved:

* `Verifier.reference_accepted_spec` / `Verifier.inline_accepted_spec`: an
  accepted verdict has an output period `P = record.period` with `0 < P`,
  `P ∣ n`, the closure square at `P` at most `acceptSquared`, every proper
  divisor of `P` at or above `excludeSquared`, frame multiplier below
  `attractUpper`, and record exactly `⟨2, iterations, evidence, P, fields⟩`.
  Both the `.keep` and `.reduced d` reductions are covered.
* Primary bridges, with **frame-value windows**
  (`existsUnique_primitive_of_reference_accepted` and its inline, critical,
  `_disk` and `_stored` forms): if the frames' residual squares track the
  center residuals within `η` (upper side at `P`, lower side at each proper
  divisor of `P`), the multiplier of `orbit c P` is at most `q < 1` on
  `closedBall z₀ r`, `residual(P) + η ≤ (r (1 - q)) ^ 2`, and each proper
  divisor `e` satisfies a disk separation against `residual(e) - η`, then the
  disk contains a fixed point `ζ` of the `P`-step return with minimal period
  exactly `P` and multiplier modulus at most `q`, and every fixed point of the
  `P`-step return in the disk equals `ζ`. Acceptance supplies `P > 0`.
* `_thresholds` corollaries replace the frame values by `acceptSquared` and
  `excludeSquared` (`frame_windows_of_threshold_windows`). For `P ≥ 2` these
  inherit the ceiling `(1 + L) / (1 - q) < 100` at the frozen ratio
  (`thresholdWindow_ratio`); the frame-value forms do not.
* The stored forms (frames track the *stored* residuals
  `‖reference d - z₀‖ ^ 2`, all other hypotheses are StoredDisk inequalities
  over `storedOrbitError`, `storedOrbitRadius`, `multiplierBound`), including
  a critical-entry form via `critical_entry_of_storedReference`, are the forms
  intended for a reflected integer checker.
* Proved instances: `c = -1`, `P = 2` on the `.keep` path (`n = 2`) and the
  `.reduced` path (`n = 4`); `c = 0`, `P = 1`; the threshold corollaries at
  `c = -1`, `r = 1e-7`; and `c = -0.75125`, `P = 2`, multiplier about `0.995`,
  through frame-value windows at `r = 1e-4`, where the threshold windows
  provably fail.

What is NOT proved:

* Uniqueness is uniqueness of the `P`-step return fixed point *inside the
  stated disk*. It is not global uniqueness of the attracting cycle; no Fatou
  theorem is used or claimed.
* The frame field `multiplierMagnitude` is never certified and never used as
  the true multiplier. The multiplier bound `q` comes only from the disk
  enclosure, and numerically `q = |λ| + O(r)`.
* Binary64 frames are covered only through a residual-tracking discrepancy
  `η` that must be proved separately. All instances here use exact rational
  frames (`η = 0`). No floating-point semantics is formalized.
* Refinement from the TypeScript verifier to these exact rational models is
  not proved.
-/

namespace IntMProof.Verifier

/-- Everything an accepted verdict guarantees about its output record `R`,
for a verifier call on candidate period `n` with the given provenance. The
frame multiplier inequality is recorded, but it is a statement about the
supplied rational frame only, not about the true multiplier. -/
structure AcceptedOutput {Payload : Type*} (t : Thresholds) (frames : ℕ → Frame Payload)
    (n iterations evidence : ℕ) (R : Record Payload) : Prop where
  /-- The output period is positive. -/
  period_pos : 0 < R.period
  /-- The output period divides the candidate period. -/
  period_dvd : R.period ∣ n
  /-- The closure residual square at the output period is accepted. -/
  closure : (frames R.period).residualSquared ≤ t.acceptSquared
  /-- Every positive proper divisor of the output period is excluded. -/
  divisors : ∀ e ∈ properDivisors R.period, t.excludeSquared ≤ (frames e).residualSquared
  /-- The supplied frame multiplier passed the attraction cutoff. -/
  attract : (frames R.period).multiplierMagnitude < t.attractUpper
  /-- The complete accepted record. -/
  record_eq : R = ⟨2, iterations, evidence, R.period, (frames R.period).fields⟩

/-- A `.keep` reduction means every listed divisor was excluded. -/
theorem referenceReduction_keep {Payload : Type*} (t : Thresholds)
    (frames : ℕ → Frame Payload) (divisors : List ℕ)
    (hkeep : referenceReduction t frames divisors = .keep) :
    ∀ e ∈ divisors, t.excludeSquared ≤ (frames e).residualSquared := by
  unfold referenceReduction at hkeep
  split at hkeep
  · rename_i hnone
    intro e he
    have hnot := List.find?_eq_none.mp hnone e he
    simpa only [decide_eq_true_eq, not_lt] using hnot
  · split_ifs at hkeep

/-- An accepted `finish` passed the frame attraction test and wrote the
complete record. -/
theorem finish_accepted {Payload : Type*} (t : Thresholds) (frames : ℕ → Frame Payload)
    (period iterations evidence : ℕ) (old : Record Payload)
    (hacc : (finish t frames period iterations evidence old).1 = .accepted) :
    (frames period).multiplierMagnitude < t.attractUpper ∧
      (finish t frames period iterations evidence old).2 =
        ⟨2, iterations, evidence, period, (frames period).fields⟩ := by
  unfold finish at hacc ⊢
  split_ifs at hacc ⊢ with hatt
  exact ⟨hatt, rfl⟩

/-- A proper divisor of a proper divisor of `n` is a smaller proper divisor
of `n`. -/
theorem mem_properDivisors_of_mem_properDivisors {n d e : ℕ}
    (hd : d ∈ properDivisors n) (he : e ∈ properDivisors d) :
    e ∈ properDivisors n ∧ e < d := by
  obtain ⟨_, hdn, hdlt⟩ := mem_properDivisors.mp hd
  obtain ⟨hepos, hed, helt⟩ := mem_properDivisors.mp he
  exact ⟨mem_properDivisors.mpr ⟨hepos, hed.trans hdn, helt.trans hdlt⟩, helt⟩

/-- Specification of V0 acceptance. On `.keep` the output period is the
candidate `n`; on `.reduced d` it is the least accepted proper divisor `d`,
whose own proper divisors were all excluded earlier in the ascending scan. -/
theorem reference_accepted_spec {Payload : Type*} (t : Thresholds)
    (frames : ℕ → Frame Payload) (n iterations evidence : ℕ) (old : Record Payload)
    (hacc : (reference t frames n iterations evidence old).1 = .accepted) :
    AcceptedOutput t frames n iterations evidence
      (reference t frames n iterations evidence old).2 := by
  unfold reference decide at hacc ⊢
  split_ifs at hacc ⊢ with h0 hexclude haccept
  rcases hred : referenceReduction t frames (properDivisors n) with _ | d | _
  · simp only [hred] at hacc ⊢
    obtain ⟨hatt, hrec⟩ := finish_accepted t frames n iterations evidence old hacc
    rw [hrec]
    exact
      { period_pos := Nat.pos_of_ne_zero h0
        period_dvd := dvd_refl n
        closure := not_lt.mp haccept
        divisors := referenceReduction_keep t frames _ hred
        attract := hatt
        record_eq := rfl }
  · simp only [hred] at hacc ⊢
    obtain ⟨hatt, hrec⟩ := finish_accepted t frames d iterations evidence old hacc
    obtain ⟨hd, hdacc, hless⟩ := referenceReduction_reduced_least t frames n d hred
    obtain ⟨hdpos, hdn, _⟩ := mem_properDivisors.mp hd
    rw [hrec]
    exact
      { period_pos := hdpos
        period_dvd := hdn
        closure := hdacc
        divisors := fun e he =>
          let ⟨hen, helt⟩ := mem_properDivisors_of_mem_properDivisors hd he
          hless e hen helt
        attract := hatt
        record_eq := rfl }
  · simp only [hred] at hacc
    exact absurd hacc (by decide)

/-- Specification of V1 acceptance; V1 agrees with V0 on the same frames. -/
theorem inline_accepted_spec {Payload : Type*} (t : Thresholds)
    (frames : ℕ → Frame Payload) (n iterations evidence : ℕ) (old : Record Payload)
    (hacc : (inline t frames n iterations evidence old).1 = .accepted) :
    AcceptedOutput t frames n iterations evidence
      (inline t frames n iterations evidence old).2 := by
  rw [inline_eq_reference] at hacc ⊢
  exact reference_accepted_spec t frames n iterations evidence old hacc

end IntMProof.Verifier

namespace IntMProof

open Function Metric Polynomial

/-! ## The return-disk core, with no verifier -/

/-- A squared center displacement inside the window `(r (1 - q)) ^ 2` gives the
return-disk center margin `‖x‖ + q r ≤ r`. -/
theorem center_margin_of_sq_le (x : ℂ) (r q : ℝ) (hr : 0 ≤ r) (hq1 : q < 1)
    (hsq : ‖x‖ ^ 2 ≤ (r * (1 - q)) ^ 2) : ‖x‖ + q * r ≤ r := by
  have hbase : 0 ≤ r * (1 - q) := mul_nonneg hr (by linarith)
  have hle := le_of_pow_le_pow_left₀ two_ne_zero hbase hsq
  have hexpand : r * (1 - q) = r - q * r := by ring
  linarith

/-- A tracked residual square `res` inside a window `res + η ≤ s ^ 2` bounds the
tracked displacement: `‖x‖ ≤ s`. -/
theorem norm_le_of_window (x : ℂ) (res s η : ℝ) (hs : 0 ≤ s)
    (htrack : ‖x‖ ^ 2 ≤ res + η) (hwindow : res + η ≤ s ^ 2) : ‖x‖ ≤ s :=
  le_of_pow_le_pow_left₀ two_ne_zero hs (htrack.trans hwindow)

/-- A tracked residual square `res` with margin `a ^ 2 < res - η` separates the
tracked displacement: `a < ‖x‖`. -/
theorem lt_norm_of_window (x : ℂ) (res a η : ℝ)
    (htrack : res ≤ ‖x‖ ^ 2 + η) (hsep : a ^ 2 < res - η) : a < ‖x‖ :=
  lt_of_pow_lt_pow_left₀ 2 (norm_nonneg _) (by linarith)

/-- If the `e`-step derivative is at most `L` on `closedBall z₀ r` and the center
moves by more than `(1 + L) r` under `e` steps (stated with squares), then no
point of the disk returns after `e` steps. -/
theorem orbit_ne_of_sq_separation (c z₀ : ℂ) (r L : ℝ) (e : ℕ) (hr : 0 ≤ r)
    (hderiv : ∀ z ∈ closedBall z₀ r, ‖(derivative (seedPolynomial c e)).eval z‖ ≤ L)
    (hsep : (1 + L) ^ 2 * r ^ 2 < ‖orbit c e z₀ - z₀‖ ^ 2)
    {z : ℂ} (hz : z ∈ closedBall z₀ r) : orbit c e z ≠ z := by
  intro hret
  have hz₀ : z₀ ∈ closedBall z₀ r := mem_closedBall_self hr
  have hL : 0 ≤ L := (norm_nonneg _).trans (hderiv z₀ hz₀)
  have hlip := lipschitzOnWith_closedBall_of_deriv_le (fun w => orbit c e w) z₀ r L hL
    (fun w _ => differentiableAt_orbit c e w)
    (fun w hw => by rw [deriv_orbit]; exact hderiv w hw)
  have hd : dist (orbit c e z₀) (orbit c e z) ≤ L * dist z₀ z :=
    hlip.dist_le_mul z₀ hz₀ z hz
  have hzr : dist z z₀ ≤ r := mem_closedBall.mp hz
  have hlin : (1 + L) * r < ‖orbit c e z₀ - z₀‖ :=
    lt_of_pow_lt_pow_left₀ 2 (norm_nonneg _) (by rwa [mul_pow])
  have hupper : ‖orbit c e z₀ - z₀‖ ≤ (1 + L) * r := by
    calc
      ‖orbit c e z₀ - z₀‖ = dist (orbit c e z₀) z₀ := (dist_eq_norm _ _).symm
      _ ≤ dist (orbit c e z₀) (orbit c e z) + dist (orbit c e z) z₀ := dist_triangle _ _ _
      _ ≤ L * dist z₀ z + dist z z₀ := add_le_add hd (by rw [hret])
      _ ≤ L * r + r := by
        rw [dist_comm z₀ z]
        exact add_le_add (mul_le_mul_of_nonneg_left hzr hL) hzr
      _ = (1 + L) * r := by ring
  exact (not_lt_of_ge hupper) hlin

/-- Return-disk core. A multiplier bound `q < 1` for `orbit c P` on
`closedBall z₀ r`, the center margin, and exclusion of every proper-divisor
return in the disk give a fixed point `ζ` of the `P`-step return in the disk,
of minimal period `P` and multiplier modulus at most `q`, and every fixed
point of the `P`-step return in the disk equals `ζ`. Nothing is claimed
outside the disk. -/
theorem existsUnique_primitive_of_return_disk (c z₀ : ℂ) (P : ℕ) (hP : 0 < P) (r q : ℝ)
    (hr : 0 ≤ r) (hq1 : q < 1)
    (hmult : ∀ z ∈ closedBall z₀ r, ‖(derivative (seedPolynomial c P)).eval z‖ ≤ q)
    (hcenter : ‖orbit c P z₀ - z₀‖ + q * r ≤ r)
    (hnoret : ∀ e, 0 < e → e ∣ P → e < P → ∀ z ∈ closedBall z₀ r, orbit c e z ≠ z) :
    ∃! ζ : ℂ, ζ ∈ closedBall z₀ r ∧ orbit c P ζ = ζ ∧
      minimalPeriod (quadratic c) ζ = P ∧
      ‖(derivative (seedPolynomial c P)).eval ζ‖ ≤ q ∧
      ∀ y ∈ closedBall z₀ r, orbit c P y = y → y = ζ := by
  have hq : 0 ≤ q := (norm_nonneg _).trans (hmult z₀ (mem_closedBall_self hr))
  obtain ⟨ζ, hζ, honly⟩ := existsUnique_fixedPoint_orbit_of_multiplier_le c P z₀ r q
    hr hq hq1 hmult hcenter
  have hall : ∀ y ∈ closedBall z₀ r, orbit c P y = y → y = ζ :=
    fun y hy hfix => honly y ⟨hy, hfix, hmult y hy⟩
  have hperiod : minimalPeriod (quadratic c) ζ = P := by
    apply (exactPeriod_iff_proper_divisors (quadratic c) ζ P hP hζ.2.1).mpr
    intro e he hdvd hlt
    exact hnoret e he hdvd hlt ζ hζ.1
  exact ⟨ζ, ⟨hζ.1, hζ.2.1, hperiod, hζ.2.2, hall⟩, fun y hy => hall y hy.1 hy.2.1⟩

/-- Critical-entry form of the return-disk core: if moreover `orbit c k 0` lies in
the disk, every later return `orbit c (k + m P) 0` stays in the disk and is
within `q ^ m * dist (orbit c k 0) ζ` of `ζ`. Entry is a hypothesis. -/
theorem existsUnique_primitive_critical_of_return_disk (c z₀ : ℂ) (k P : ℕ) (hP : 0 < P)
    (r q : ℝ) (hr : 0 ≤ r) (hq1 : q < 1)
    (hmult : ∀ z ∈ closedBall z₀ r, ‖(derivative (seedPolynomial c P)).eval z‖ ≤ q)
    (hcenter : ‖orbit c P z₀ - z₀‖ + q * r ≤ r)
    (hnoret : ∀ e, 0 < e → e ∣ P → e < P → ∀ z ∈ closedBall z₀ r, orbit c e z ≠ z)
    (hentry : orbit c k 0 ∈ closedBall z₀ r) :
    ∃! ζ : ℂ, ζ ∈ closedBall z₀ r ∧ orbit c P ζ = ζ ∧
      minimalPeriod (quadratic c) ζ = P ∧
      ‖(derivative (seedPolynomial c P)).eval ζ‖ ≤ q ∧
      (∀ y ∈ closedBall z₀ r, orbit c P y = y → y = ζ) ∧
      ∀ m : ℕ, orbit c (k + m * P) 0 ∈ closedBall z₀ r ∧
        dist (orbit c (k + m * P) 0) ζ ≤ q ^ m * dist (orbit c k 0) ζ := by
  have hq : 0 ≤ q := (norm_nonneg _).trans (hmult z₀ (mem_closedBall_self hr))
  obtain ⟨ζ, ⟨hζ, hfix, hper, hmul, hall⟩, -⟩ :=
    existsUnique_primitive_of_return_disk c z₀ P hP r q hr hq1 hmult hcenter hnoret
  obtain ⟨ζ', hζ', -⟩ :=
    existsUnique_critical_return_of_entry c k P z₀ r q hr hq hq1 hmult hcenter hentry
  have heq : ζ' = ζ := hall ζ' hζ'.1 hζ'.2.1
  rw [heq] at hζ'
  exact ⟨ζ, ⟨hζ, hfix, hper, hmul, hall, hζ'.2.2.2⟩, fun y hy => hall y hy.1 hy.2.1⟩

/-- Verifier-free core with derivative bounds `L e` for the proper divisors:
a squared center residual at most `(r (1 - q)) ^ 2` and squared separations
`(1 + L e) ^ 2 r ^ 2 < ‖orbit c e z₀ - z₀‖ ^ 2` suffice. -/
theorem existsUnique_primitive_of_center_window (c z₀ : ℂ) (P : ℕ) (hP : 0 < P)
    (r q : ℝ) (L : ℕ → ℝ) (hr : 0 ≤ r) (hq1 : q < 1)
    (hmult : ∀ z ∈ closedBall z₀ r, ‖(derivative (seedPolynomial c P)).eval z‖ ≤ q)
    (hderiv : ∀ e, 0 < e → e ∣ P → e < P →
      ∀ z ∈ closedBall z₀ r, ‖(derivative (seedPolynomial c e)).eval z‖ ≤ L e)
    (hclose : ‖orbit c P z₀ - z₀‖ ^ 2 ≤ (r * (1 - q)) ^ 2)
    (hsep : ∀ e, 0 < e → e ∣ P → e < P →
      (1 + L e) ^ 2 * r ^ 2 < ‖orbit c e z₀ - z₀‖ ^ 2) :
    ∃! ζ : ℂ, ζ ∈ closedBall z₀ r ∧ orbit c P ζ = ζ ∧
      minimalPeriod (quadratic c) ζ = P ∧
      ‖(derivative (seedPolynomial c P)).eval ζ‖ ≤ q ∧
      ∀ y ∈ closedBall z₀ r, orbit c P y = y → y = ζ :=
  existsUnique_primitive_of_return_disk c z₀ P hP r q hr hq1 hmult
    (center_margin_of_sq_le _ r q hr hq1 hclose)
    (fun e he hdvd hlt _ hz => orbit_ne_of_sq_separation c z₀ r (L e) e hr
      (hderiv e he hdvd hlt) (hsep e he hdvd hlt) hz)

/-- Critical-entry form of `existsUnique_primitive_of_center_window`. -/
theorem existsUnique_primitive_critical_of_center_window (c z₀ : ℂ) (k P : ℕ) (hP : 0 < P)
    (r q : ℝ) (L : ℕ → ℝ) (hr : 0 ≤ r) (hq1 : q < 1)
    (hmult : ∀ z ∈ closedBall z₀ r, ‖(derivative (seedPolynomial c P)).eval z‖ ≤ q)
    (hderiv : ∀ e, 0 < e → e ∣ P → e < P →
      ∀ z ∈ closedBall z₀ r, ‖(derivative (seedPolynomial c e)).eval z‖ ≤ L e)
    (hclose : ‖orbit c P z₀ - z₀‖ ^ 2 ≤ (r * (1 - q)) ^ 2)
    (hsep : ∀ e, 0 < e → e ∣ P → e < P →
      (1 + L e) ^ 2 * r ^ 2 < ‖orbit c e z₀ - z₀‖ ^ 2)
    (hentry : orbit c k 0 ∈ closedBall z₀ r) :
    ∃! ζ : ℂ, ζ ∈ closedBall z₀ r ∧ orbit c P ζ = ζ ∧
      minimalPeriod (quadratic c) ζ = P ∧
      ‖(derivative (seedPolynomial c P)).eval ζ‖ ≤ q ∧
      (∀ y ∈ closedBall z₀ r, orbit c P y = y → y = ζ) ∧
      ∀ m : ℕ, orbit c (k + m * P) 0 ∈ closedBall z₀ r ∧
        dist (orbit c (k + m * P) 0) ζ ≤ q ^ m * dist (orbit c k 0) ζ :=
  existsUnique_primitive_critical_of_return_disk c z₀ k P hP r q hr hq1 hmult
    (center_margin_of_sq_le _ r q hr hq1 hclose)
    (fun e he hdvd hlt _ hz => orbit_ne_of_sq_separation c z₀ r (L e) e hr
      (hderiv e he hdvd hlt) (hsep e he hdvd hlt) hz) hentry

/-- Exact reference enclosure, verifier-free. Tracked residual squares `resP`
and `resDiv e` of the reference orbit at `cRef`, with frame-value windows, give
the return-disk hypotheses at every target `c` with `‖c - cRef‖ ≤ Δ`. -/
theorem disk_return_hypotheses (cRef c z₀ : ℂ) (r Δ η resP : ℝ) (resDiv : ℕ → ℝ) (P : ℕ)
    (hparam : ‖c - cRef‖ ≤ Δ)
    (htrackClose : ‖orbit cRef P z₀ - z₀‖ ^ 2 ≤ resP + η)
    (htrackDiv : ∀ e ∈ Verifier.properDivisors P,
      resDiv e ≤ ‖orbit cRef e z₀ - z₀‖ ^ 2 + η)
    (hgap : diskOrbitError cRef z₀ 0 Δ P ≤
      r * (1 - multiplierBound (diskOrbitRadius cRef z₀ r Δ) P))
    (hwindow : resP + η ≤
      (r * (1 - multiplierBound (diskOrbitRadius cRef z₀ r Δ) P) -
        diskOrbitError cRef z₀ 0 Δ P) ^ 2)
    (hsep : ∀ e ∈ Verifier.properDivisors P,
      (diskOrbitError cRef z₀ r Δ e + r) ^ 2 < resDiv e - η) :
    (∀ z ∈ closedBall z₀ r, ‖(derivative (seedPolynomial c P)).eval z‖ ≤
        multiplierBound (diskOrbitRadius cRef z₀ r Δ) P) ∧
      ‖orbit c P z₀ - z₀‖ + multiplierBound (diskOrbitRadius cRef z₀ r Δ) P * r ≤ r ∧
      ∀ e, 0 < e → e ∣ P → e < P → ∀ z ∈ closedBall z₀ r, orbit c e z ≠ z := by
  refine ⟨fun z hz => seedDerivative_norm_le_disk_multiplier cRef c z₀ z r Δ P
      (by simpa only [mem_closedBall, dist_eq_norm] using hz) hparam, ?_, ?_⟩
  · have hle := norm_le_of_window _ resP _ η (sub_nonneg.mpr hgap) htrackClose hwindow
    have hc := center_return_norm_le_diskCenterReturnBound cRef c z₀ Δ P hparam
    rw [diskCenterReturnBound] at hc
    have hexpand : r * (1 - multiplierBound (diskOrbitRadius cRef z₀ r Δ) P) =
        r - multiplierBound (diskOrbitRadius cRef z₀ r Δ) P * r := by ring
    linarith
  · intro e he hdvd hlt z hz
    have hmem := Verifier.mem_properDivisors.mpr ⟨he, hdvd, hlt⟩
    exact orbit_ne_of_disk_separation cRef c z₀ z r Δ e
      (by simpa only [mem_closedBall, dist_eq_norm] using hz) hparam
      (lt_norm_of_window _ (resDiv e) _ η (htrackDiv e hmem) (hsep e hmem))

/-- Stored reference enclosure, verifier-free. Tracked residual squares `resP`
and `resDiv e` of the stored values, with StoredDisk-style windows, give the
return-disk hypotheses at every target `c` with `‖c - cRef‖ ≤ Δ`. -/
theorem stored_return_hypotheses (cRef c z₀ : ℂ) (reference : ℕ → ℂ) (r ε Δ η resP : ℝ)
    (resDiv : ℕ → ℝ) (radius residual : ℕ → ℝ) (P : ℕ)
    (hinit : ‖z₀ - reference 0‖ ≤ ε) (hparam : ‖c - cRef‖ ≤ Δ)
    (hr : ∀ k ≤ P, ‖reference k‖ ≤ radius k)
    (hρ : ∀ k < P, ‖reference (k + 1) - quadratic cRef (reference k)‖ ≤ residual k)
    (htrackClose : ‖reference P - z₀‖ ^ 2 ≤ resP + η)
    (htrackDiv : ∀ e ∈ Verifier.properDivisors P, resDiv e ≤ ‖reference e - z₀‖ ^ 2 + η)
    (hgap : storedOrbitError ε Δ radius residual P ≤
      r * (1 - multiplierBound (storedOrbitRadius (r + ε) Δ radius residual) P))
    (hwindow : resP + η ≤
      (r * (1 - multiplierBound (storedOrbitRadius (r + ε) Δ radius residual) P) -
        storedOrbitError ε Δ radius residual P) ^ 2)
    (hsep : ∀ e ∈ Verifier.properDivisors P,
      (storedOrbitError (r + ε) Δ radius residual e + r) ^ 2 < resDiv e - η) :
    (∀ z ∈ closedBall z₀ r, ‖(derivative (seedPolynomial c P)).eval z‖ ≤
        multiplierBound (storedOrbitRadius (r + ε) Δ radius residual) P) ∧
      ‖orbit c P z₀ - z₀‖ +
          multiplierBound (storedOrbitRadius (r + ε) Δ radius residual) P * r ≤ r ∧
      ∀ e, 0 < e → e ∣ P → e < P → ∀ z ∈ closedBall z₀ r, orbit c e z ≠ z := by
  refine ⟨fun z hz => seedDerivative_norm_le_stored_bound cRef c z₀ z reference r ε Δ
      radius residual P (by simpa only [mem_closedBall, dist_eq_norm] using hz) hinit
      hparam hr hρ, ?_, ?_⟩
  · have hle := norm_le_of_window _ resP _ η (sub_nonneg.mpr hgap) htrackClose hwindow
    have hc := center_return_norm_le_stored_bound cRef c z₀ reference ε Δ radius residual P
      hinit hparam (fun k hk => hr k hk.le) hρ
    rw [storedCenterReturnBound] at hc
    have hexpand :
        r * (1 - multiplierBound (storedOrbitRadius (r + ε) Δ radius residual) P) =
          r - multiplierBound (storedOrbitRadius (r + ε) Δ radius residual) P * r := by
      ring
    linarith
  · intro e he hdvd hlt z hz
    have hmem := Verifier.mem_properDivisors.mpr ⟨he, hdvd, hlt⟩
    exact orbit_ne_of_stored_separation cRef c z₀ z reference r ε Δ radius residual e
      (by simpa only [mem_closedBall, dist_eq_norm] using hz) hinit hparam
      (fun k hk => hr k (hk.trans hlt).le) (fun k hk => hρ k (hk.trans hlt))
      (lt_norm_of_window _ (resDiv e) _ η (htrackDiv e hmem) (hsep e hmem))

/-! ## What acceptance contributes -/

/-- The accepted output period is positive, its closure square is at most
`acceptSquared`, and its proper divisors are at or above `excludeSquared`. -/
theorem accepted_period_facts {Payload : Type*}
    (t : Verifier.Thresholds) (frames : ℕ → Verifier.Frame Payload)
    (n iterations evidence : ℕ) (old : Verifier.Record Payload)
    (hacc : (Verifier.reference t frames n iterations evidence old).1 = .accepted)
    (P : ℕ) (hperiod : (Verifier.reference t frames n iterations evidence old).2.period = P) :
    0 < P ∧ (frames P).residualSquared ≤ t.acceptSquared ∧
      ∀ e ∈ Verifier.properDivisors P, t.excludeSquared ≤ (frames e).residualSquared := by
  have hspec := Verifier.reference_accepted_spec t frames n iterations evidence old hacc
  subst hperiod
  exact ⟨hspec.period_pos, hspec.closure, hspec.divisors⟩

/-- Threshold windows imply frame-value windows on an accepted verdict, since the
accepted closure square is at most `acceptSquared` and each excluded divisor
square is at least `excludeSquared`. Every `_thresholds` corollary is this
lemma followed by the frame-value theorem. -/
theorem frame_windows_of_threshold_windows {Payload : Type*}
    (t : Verifier.Thresholds) (frames : ℕ → Verifier.Frame Payload)
    (n iterations evidence : ℕ) (old : Verifier.Record Payload)
    (hacc : (Verifier.reference t frames n iterations evidence old).1 = .accepted)
    (P : ℕ) (hperiod : (Verifier.reference t frames n iterations evidence old).2.period = P)
    (η s : ℝ) (a : ℕ → ℝ)
    (hwindow : (t.acceptSquared : ℝ) + η ≤ s)
    (hsep : ∀ e ∈ Verifier.properDivisors P, a e < (t.excludeSquared : ℝ) - η) :
    ((frames P).residualSquared : ℝ) + η ≤ s ∧
      ∀ e ∈ Verifier.properDivisors P, a e < ((frames e).residualSquared : ℝ) - η := by
  obtain ⟨-, hclosure, hdivisors⟩ :=
    accepted_period_facts t frames n iterations evidence old hacc P hperiod
  refine ⟨?_, fun e he => ?_⟩
  · have hcast : ((frames P).residualSquared : ℝ) ≤ t.acceptSquared := by
      exact_mod_cast hclosure
    linarith
  · have hcast : (t.excludeSquared : ℝ) ≤ (frames e).residualSquared := by
      exact_mod_cast hdivisors e he
    linarith [hsep e he]

/-! ## Primary bridges: frame-value windows -/

/-- **Certified acceptance (V0), generic period, frame-value windows.** Suppose
the reference verifier accepts candidate `n` with output period `P`. Suppose
the frames track the true center residuals at `(c, z₀)` to within `η` on the
side that matters (`η = 0` for exact frames; a machine frame needs a
separately proved `η`). Suppose the formal multiplier of `orbit c P` is at most
`q < 1` on `closedBall z₀ r` with `residual(P) + η ≤ (r (1 - q)) ^ 2`, and each
proper divisor `e` has an `e`-step derivative bound `L e` there with
`(1 + L e) ^ 2 r ^ 2 < residual(e) - η`. Then `closedBall z₀ r` contains a
fixed point `ζ` of the `P`-step return with minimal period exactly `P` and
multiplier modulus at most `q`, and every fixed point of the `P`-step return in
the disk equals `ζ`.

Acceptance supplies the output period `P > 0`; the windows use the frame
values themselves, so there is no threshold-ratio ceiling here. Uniqueness is
inside the disk only (no Fatou theorem). The frames' multiplier field is not
used and is not certified. -/
theorem existsUnique_primitive_of_reference_accepted {Payload : Type*}
    (t : Verifier.Thresholds) (frames : ℕ → Verifier.Frame Payload)
    (n iterations evidence : ℕ) (old : Verifier.Record Payload)
    (hacc : (Verifier.reference t frames n iterations evidence old).1 = .accepted)
    (P : ℕ) (hperiod : (Verifier.reference t frames n iterations evidence old).2.period = P)
    (c z₀ : ℂ) (r q η : ℝ) (L : ℕ → ℝ) (hr : 0 ≤ r) (hq1 : q < 1)
    (hmult : ∀ z ∈ closedBall z₀ r, ‖(derivative (seedPolynomial c P)).eval z‖ ≤ q)
    (hderiv : ∀ e ∈ Verifier.properDivisors P,
      ∀ z ∈ closedBall z₀ r, ‖(derivative (seedPolynomial c e)).eval z‖ ≤ L e)
    (htrackClose : ‖orbit c P z₀ - z₀‖ ^ 2 ≤ ((frames P).residualSquared : ℝ) + η)
    (htrackDiv : ∀ e ∈ Verifier.properDivisors P,
      ((frames e).residualSquared : ℝ) ≤ ‖orbit c e z₀ - z₀‖ ^ 2 + η)
    (hwindow : ((frames P).residualSquared : ℝ) + η ≤ (r * (1 - q)) ^ 2)
    (hsep : ∀ e ∈ Verifier.properDivisors P,
      (1 + L e) ^ 2 * r ^ 2 < ((frames e).residualSquared : ℝ) - η) :
    ∃! ζ : ℂ, ζ ∈ closedBall z₀ r ∧ orbit c P ζ = ζ ∧
      minimalPeriod (quadratic c) ζ = P ∧
      ‖(derivative (seedPolynomial c P)).eval ζ‖ ≤ q ∧
      ∀ y ∈ closedBall z₀ r, orbit c P y = y → y = ζ := by
  obtain ⟨hpos, -, -⟩ := accepted_period_facts t frames n iterations evidence old hacc P hperiod
  refine existsUnique_primitive_of_center_window c z₀ P hpos r q L hr hq1 hmult
    (fun e he hdvd hlt => hderiv e (Verifier.mem_properDivisors.mpr ⟨he, hdvd, hlt⟩))
    (htrackClose.trans hwindow) ?_
  intro e he hdvd hlt
  have hmem := Verifier.mem_properDivisors.mpr ⟨he, hdvd, hlt⟩
  linarith [htrackDiv e hmem, hsep e hmem]

/-- **Certified acceptance (V1), generic period, frame-value windows.** The
inline verifier agrees with V0 on the same frames. -/
theorem existsUnique_primitive_of_inline_accepted {Payload : Type*}
    (t : Verifier.Thresholds) (frames : ℕ → Verifier.Frame Payload)
    (n iterations evidence : ℕ) (old : Verifier.Record Payload)
    (hacc : (Verifier.inline t frames n iterations evidence old).1 = .accepted)
    (P : ℕ) (hperiod : (Verifier.inline t frames n iterations evidence old).2.period = P)
    (c z₀ : ℂ) (r q η : ℝ) (L : ℕ → ℝ) (hr : 0 ≤ r) (hq1 : q < 1)
    (hmult : ∀ z ∈ closedBall z₀ r, ‖(derivative (seedPolynomial c P)).eval z‖ ≤ q)
    (hderiv : ∀ e ∈ Verifier.properDivisors P,
      ∀ z ∈ closedBall z₀ r, ‖(derivative (seedPolynomial c e)).eval z‖ ≤ L e)
    (htrackClose : ‖orbit c P z₀ - z₀‖ ^ 2 ≤ ((frames P).residualSquared : ℝ) + η)
    (htrackDiv : ∀ e ∈ Verifier.properDivisors P,
      ((frames e).residualSquared : ℝ) ≤ ‖orbit c e z₀ - z₀‖ ^ 2 + η)
    (hwindow : ((frames P).residualSquared : ℝ) + η ≤ (r * (1 - q)) ^ 2)
    (hsep : ∀ e ∈ Verifier.properDivisors P,
      (1 + L e) ^ 2 * r ^ 2 < ((frames e).residualSquared : ℝ) - η) :
    ∃! ζ : ℂ, ζ ∈ closedBall z₀ r ∧ orbit c P ζ = ζ ∧
      minimalPeriod (quadratic c) ζ = P ∧
      ‖(derivative (seedPolynomial c P)).eval ζ‖ ≤ q ∧
      ∀ y ∈ closedBall z₀ r, orbit c P y = y → y = ζ := by
  rw [Verifier.inline_eq_reference] at hacc hperiod
  exact existsUnique_primitive_of_reference_accepted t frames n iterations evidence old hacc
    P hperiod c z₀ r q η L hr hq1 hmult hderiv htrackClose htrackDiv hwindow hsep

/-- **Critical-entry corollary (V0), frame-value windows.** Under the hypotheses
of `existsUnique_primitive_of_reference_accepted`, if some critical iterate
`orbit c k 0` lies in `closedBall z₀ r`, every later return
`orbit c (k + m P) 0` stays in the disk and is within
`q ^ m * dist (orbit c k 0) ζ` of `ζ`. Entry is a hypothesis, and the critical
point itself need not be periodic. -/
theorem existsUnique_primitive_critical_of_reference_accepted {Payload : Type*}
    (t : Verifier.Thresholds) (frames : ℕ → Verifier.Frame Payload)
    (n iterations evidence : ℕ) (old : Verifier.Record Payload)
    (hacc : (Verifier.reference t frames n iterations evidence old).1 = .accepted)
    (P : ℕ) (hperiod : (Verifier.reference t frames n iterations evidence old).2.period = P)
    (c z₀ : ℂ) (k : ℕ) (r q η : ℝ) (L : ℕ → ℝ) (hr : 0 ≤ r) (hq1 : q < 1)
    (hmult : ∀ z ∈ closedBall z₀ r, ‖(derivative (seedPolynomial c P)).eval z‖ ≤ q)
    (hderiv : ∀ e ∈ Verifier.properDivisors P,
      ∀ z ∈ closedBall z₀ r, ‖(derivative (seedPolynomial c e)).eval z‖ ≤ L e)
    (htrackClose : ‖orbit c P z₀ - z₀‖ ^ 2 ≤ ((frames P).residualSquared : ℝ) + η)
    (htrackDiv : ∀ e ∈ Verifier.properDivisors P,
      ((frames e).residualSquared : ℝ) ≤ ‖orbit c e z₀ - z₀‖ ^ 2 + η)
    (hwindow : ((frames P).residualSquared : ℝ) + η ≤ (r * (1 - q)) ^ 2)
    (hsep : ∀ e ∈ Verifier.properDivisors P,
      (1 + L e) ^ 2 * r ^ 2 < ((frames e).residualSquared : ℝ) - η)
    (hentry : orbit c k 0 ∈ closedBall z₀ r) :
    ∃! ζ : ℂ, ζ ∈ closedBall z₀ r ∧ orbit c P ζ = ζ ∧
      minimalPeriod (quadratic c) ζ = P ∧
      ‖(derivative (seedPolynomial c P)).eval ζ‖ ≤ q ∧
      (∀ y ∈ closedBall z₀ r, orbit c P y = y → y = ζ) ∧
      ∀ m : ℕ, orbit c (k + m * P) 0 ∈ closedBall z₀ r ∧
        dist (orbit c (k + m * P) 0) ζ ≤ q ^ m * dist (orbit c k 0) ζ := by
  obtain ⟨hpos, -, -⟩ := accepted_period_facts t frames n iterations evidence old hacc P hperiod
  refine existsUnique_primitive_critical_of_center_window c z₀ k P hpos r q L hr hq1 hmult
    (fun e he hdvd hlt => hderiv e (Verifier.mem_properDivisors.mpr ⟨he, hdvd, hlt⟩))
    (htrackClose.trans hwindow) ?_ hentry
  intro e he hdvd hlt
  have hmem := Verifier.mem_properDivisors.mpr ⟨he, hdvd, hlt⟩
  linarith [htrackDiv e hmem, hsep e hmem]

/-- **Critical-entry corollary (V1), frame-value windows.** -/
theorem existsUnique_primitive_critical_of_inline_accepted {Payload : Type*}
    (t : Verifier.Thresholds) (frames : ℕ → Verifier.Frame Payload)
    (n iterations evidence : ℕ) (old : Verifier.Record Payload)
    (hacc : (Verifier.inline t frames n iterations evidence old).1 = .accepted)
    (P : ℕ) (hperiod : (Verifier.inline t frames n iterations evidence old).2.period = P)
    (c z₀ : ℂ) (k : ℕ) (r q η : ℝ) (L : ℕ → ℝ) (hr : 0 ≤ r) (hq1 : q < 1)
    (hmult : ∀ z ∈ closedBall z₀ r, ‖(derivative (seedPolynomial c P)).eval z‖ ≤ q)
    (hderiv : ∀ e ∈ Verifier.properDivisors P,
      ∀ z ∈ closedBall z₀ r, ‖(derivative (seedPolynomial c e)).eval z‖ ≤ L e)
    (htrackClose : ‖orbit c P z₀ - z₀‖ ^ 2 ≤ ((frames P).residualSquared : ℝ) + η)
    (htrackDiv : ∀ e ∈ Verifier.properDivisors P,
      ((frames e).residualSquared : ℝ) ≤ ‖orbit c e z₀ - z₀‖ ^ 2 + η)
    (hwindow : ((frames P).residualSquared : ℝ) + η ≤ (r * (1 - q)) ^ 2)
    (hsep : ∀ e ∈ Verifier.properDivisors P,
      (1 + L e) ^ 2 * r ^ 2 < ((frames e).residualSquared : ℝ) - η)
    (hentry : orbit c k 0 ∈ closedBall z₀ r) :
    ∃! ζ : ℂ, ζ ∈ closedBall z₀ r ∧ orbit c P ζ = ζ ∧
      minimalPeriod (quadratic c) ζ = P ∧
      ‖(derivative (seedPolynomial c P)).eval ζ‖ ≤ q ∧
      (∀ y ∈ closedBall z₀ r, orbit c P y = y → y = ζ) ∧
      ∀ m : ℕ, orbit c (k + m * P) 0 ∈ closedBall z₀ r ∧
        dist (orbit c (k + m * P) 0) ζ ≤ q ^ m * dist (orbit c k 0) ζ := by
  rw [Verifier.inline_eq_reference] at hacc hperiod
  exact existsUnique_primitive_critical_of_reference_accepted t frames n iterations evidence
    old hacc P hperiod c z₀ k r q η L hr hq1 hmult hderiv htrackClose htrackDiv hwindow hsep
    hentry

/-- **Exact reference enclosure (V0), frame-value windows.** The PrimitiveDisk
analogue of `existsUnique_primitive_of_reference_accepted_stored`: the frames
track the exact reference residuals `‖orbit cRef d z₀ - z₀‖ ^ 2`, the windows are
the `diskOrbitError` / `diskOrbitRadius` / `multiplierBound` inequalities, and
the conclusion holds at every target `c` with `‖c - cRef‖ ≤ Δ` (with `Δ = 0`
and `cRef = c` it is the exact disk enclosure at `c`). Uniqueness is inside
the disk only. -/
theorem existsUnique_primitive_of_reference_accepted_disk {Payload : Type*}
    (t : Verifier.Thresholds) (frames : ℕ → Verifier.Frame Payload)
    (n iterations evidence : ℕ) (old : Verifier.Record Payload)
    (hacc : (Verifier.reference t frames n iterations evidence old).1 = .accepted)
    (P : ℕ) (hperiod : (Verifier.reference t frames n iterations evidence old).2.period = P)
    (cRef c z₀ : ℂ) (r Δ η : ℝ) (hr : 0 ≤ r) (hparam : ‖c - cRef‖ ≤ Δ)
    (htrackClose : ‖orbit cRef P z₀ - z₀‖ ^ 2 ≤ ((frames P).residualSquared : ℝ) + η)
    (htrackDiv : ∀ e ∈ Verifier.properDivisors P,
      ((frames e).residualSquared : ℝ) ≤ ‖orbit cRef e z₀ - z₀‖ ^ 2 + η)
    (hcontract : multiplierBound (diskOrbitRadius cRef z₀ r Δ) P < 1)
    (hgap : diskOrbitError cRef z₀ 0 Δ P ≤
      r * (1 - multiplierBound (diskOrbitRadius cRef z₀ r Δ) P))
    (hwindow : ((frames P).residualSquared : ℝ) + η ≤
      (r * (1 - multiplierBound (diskOrbitRadius cRef z₀ r Δ) P) -
        diskOrbitError cRef z₀ 0 Δ P) ^ 2)
    (hsep : ∀ e ∈ Verifier.properDivisors P,
      (diskOrbitError cRef z₀ r Δ e + r) ^ 2 < ((frames e).residualSquared : ℝ) - η) :
    ∃! ζ : ℂ, ζ ∈ closedBall z₀ r ∧ orbit c P ζ = ζ ∧
      minimalPeriod (quadratic c) ζ = P ∧
      ‖(derivative (seedPolynomial c P)).eval ζ‖ ≤
        multiplierBound (diskOrbitRadius cRef z₀ r Δ) P ∧
      ∀ y ∈ closedBall z₀ r, orbit c P y = y → y = ζ := by
  obtain ⟨hpos, -, -⟩ := accepted_period_facts t frames n iterations evidence old hacc P hperiod
  obtain ⟨hmult, hcenter, hnoret⟩ := disk_return_hypotheses cRef c z₀ r Δ η _
    (fun e => ((frames e).residualSquared : ℝ)) P hparam htrackClose htrackDiv hgap hwindow hsep
  exact existsUnique_primitive_of_return_disk c z₀ P hpos r _ hr hcontract hmult hcenter hnoret

/-- **Exact reference enclosure (V1), frame-value windows.** -/
theorem existsUnique_primitive_of_inline_accepted_disk {Payload : Type*}
    (t : Verifier.Thresholds) (frames : ℕ → Verifier.Frame Payload)
    (n iterations evidence : ℕ) (old : Verifier.Record Payload)
    (hacc : (Verifier.inline t frames n iterations evidence old).1 = .accepted)
    (P : ℕ) (hperiod : (Verifier.inline t frames n iterations evidence old).2.period = P)
    (cRef c z₀ : ℂ) (r Δ η : ℝ) (hr : 0 ≤ r) (hparam : ‖c - cRef‖ ≤ Δ)
    (htrackClose : ‖orbit cRef P z₀ - z₀‖ ^ 2 ≤ ((frames P).residualSquared : ℝ) + η)
    (htrackDiv : ∀ e ∈ Verifier.properDivisors P,
      ((frames e).residualSquared : ℝ) ≤ ‖orbit cRef e z₀ - z₀‖ ^ 2 + η)
    (hcontract : multiplierBound (diskOrbitRadius cRef z₀ r Δ) P < 1)
    (hgap : diskOrbitError cRef z₀ 0 Δ P ≤
      r * (1 - multiplierBound (diskOrbitRadius cRef z₀ r Δ) P))
    (hwindow : ((frames P).residualSquared : ℝ) + η ≤
      (r * (1 - multiplierBound (diskOrbitRadius cRef z₀ r Δ) P) -
        diskOrbitError cRef z₀ 0 Δ P) ^ 2)
    (hsep : ∀ e ∈ Verifier.properDivisors P,
      (diskOrbitError cRef z₀ r Δ e + r) ^ 2 < ((frames e).residualSquared : ℝ) - η) :
    ∃! ζ : ℂ, ζ ∈ closedBall z₀ r ∧ orbit c P ζ = ζ ∧
      minimalPeriod (quadratic c) ζ = P ∧
      ‖(derivative (seedPolynomial c P)).eval ζ‖ ≤
        multiplierBound (diskOrbitRadius cRef z₀ r Δ) P ∧
      ∀ y ∈ closedBall z₀ r, orbit c P y = y → y = ζ := by
  rw [Verifier.inline_eq_reference] at hacc hperiod
  exact existsUnique_primitive_of_reference_accepted_disk t frames n iterations evidence old
    hacc P hperiod cRef c z₀ r Δ η hr hparam htrackClose htrackDiv hcontract hgap hwindow hsep

/-- **Stored reference enclosure (V0), frame-value windows.** This is the form
meant for a reflected checker. The frames track the *stored* center residuals
`‖reference d - z₀‖ ^ 2` within `η` (machine frames are computed from the stored
orbit). Every other hypothesis is a StoredDisk inequality over
`storedOrbitError`, `storedOrbitRadius` and `multiplierBound`: stored radii
`hr`, local residuals `hρ`, contraction `hcontract`, a closure window
`residual(P) + η ≤ (r (1 - q) - storedOrbitError ε Δ … P) ^ 2` with nonnegative
base `hgap`, and divisor windows
`(storedOrbitError (r + ε) Δ … e + r) ^ 2 < residual(e) - η`. The conclusion
holds at every target `c` with `‖c - cRef‖ ≤ Δ`. Uniqueness is inside the disk
only; the frames' multiplier field is not used. -/
theorem existsUnique_primitive_of_reference_accepted_stored {Payload : Type*}
    (t : Verifier.Thresholds) (frames : ℕ → Verifier.Frame Payload)
    (n iterations evidence : ℕ) (old : Verifier.Record Payload)
    (hacc : (Verifier.reference t frames n iterations evidence old).1 = .accepted)
    (P : ℕ) (hperiod : (Verifier.reference t frames n iterations evidence old).2.period = P)
    (cRef c z₀ : ℂ) (reference : ℕ → ℂ) (r ε Δ η : ℝ) (radius residual : ℕ → ℝ)
    (hradius : 0 ≤ r) (hinit : ‖z₀ - reference 0‖ ≤ ε) (hparam : ‖c - cRef‖ ≤ Δ)
    (hr : ∀ k ≤ P, ‖reference k‖ ≤ radius k)
    (hρ : ∀ k < P, ‖reference (k + 1) - quadratic cRef (reference k)‖ ≤ residual k)
    (htrackClose : ‖reference P - z₀‖ ^ 2 ≤ ((frames P).residualSquared : ℝ) + η)
    (htrackDiv : ∀ e ∈ Verifier.properDivisors P,
      ((frames e).residualSquared : ℝ) ≤ ‖reference e - z₀‖ ^ 2 + η)
    (hcontract : multiplierBound (storedOrbitRadius (r + ε) Δ radius residual) P < 1)
    (hgap : storedOrbitError ε Δ radius residual P ≤
      r * (1 - multiplierBound (storedOrbitRadius (r + ε) Δ radius residual) P))
    (hwindow : ((frames P).residualSquared : ℝ) + η ≤
      (r * (1 - multiplierBound (storedOrbitRadius (r + ε) Δ radius residual) P) -
        storedOrbitError ε Δ radius residual P) ^ 2)
    (hsep : ∀ e ∈ Verifier.properDivisors P,
      (storedOrbitError (r + ε) Δ radius residual e + r) ^ 2 <
        ((frames e).residualSquared : ℝ) - η) :
    ∃! ζ : ℂ, ζ ∈ closedBall z₀ r ∧ orbit c P ζ = ζ ∧
      minimalPeriod (quadratic c) ζ = P ∧
      ‖(derivative (seedPolynomial c P)).eval ζ‖ ≤
        multiplierBound (storedOrbitRadius (r + ε) Δ radius residual) P ∧
      ∀ y ∈ closedBall z₀ r, orbit c P y = y → y = ζ := by
  obtain ⟨hpos, -, -⟩ := accepted_period_facts t frames n iterations evidence old hacc P hperiod
  obtain ⟨hmult, hcenter, hnoret⟩ := stored_return_hypotheses cRef c z₀ reference r ε Δ η _
    (fun e => ((frames e).residualSquared : ℝ)) radius residual P hinit hparam hr hρ
    htrackClose htrackDiv hgap hwindow hsep
  exact existsUnique_primitive_of_return_disk c z₀ P hpos r _ hradius hcontract hmult hcenter
    hnoret

/-- **Stored reference enclosure (V1), frame-value windows.** -/
theorem existsUnique_primitive_of_inline_accepted_stored {Payload : Type*}
    (t : Verifier.Thresholds) (frames : ℕ → Verifier.Frame Payload)
    (n iterations evidence : ℕ) (old : Verifier.Record Payload)
    (hacc : (Verifier.inline t frames n iterations evidence old).1 = .accepted)
    (P : ℕ) (hperiod : (Verifier.inline t frames n iterations evidence old).2.period = P)
    (cRef c z₀ : ℂ) (reference : ℕ → ℂ) (r ε Δ η : ℝ) (radius residual : ℕ → ℝ)
    (hradius : 0 ≤ r) (hinit : ‖z₀ - reference 0‖ ≤ ε) (hparam : ‖c - cRef‖ ≤ Δ)
    (hr : ∀ k ≤ P, ‖reference k‖ ≤ radius k)
    (hρ : ∀ k < P, ‖reference (k + 1) - quadratic cRef (reference k)‖ ≤ residual k)
    (htrackClose : ‖reference P - z₀‖ ^ 2 ≤ ((frames P).residualSquared : ℝ) + η)
    (htrackDiv : ∀ e ∈ Verifier.properDivisors P,
      ((frames e).residualSquared : ℝ) ≤ ‖reference e - z₀‖ ^ 2 + η)
    (hcontract : multiplierBound (storedOrbitRadius (r + ε) Δ radius residual) P < 1)
    (hgap : storedOrbitError ε Δ radius residual P ≤
      r * (1 - multiplierBound (storedOrbitRadius (r + ε) Δ radius residual) P))
    (hwindow : ((frames P).residualSquared : ℝ) + η ≤
      (r * (1 - multiplierBound (storedOrbitRadius (r + ε) Δ radius residual) P) -
        storedOrbitError ε Δ radius residual P) ^ 2)
    (hsep : ∀ e ∈ Verifier.properDivisors P,
      (storedOrbitError (r + ε) Δ radius residual e + r) ^ 2 <
        ((frames e).residualSquared : ℝ) - η) :
    ∃! ζ : ℂ, ζ ∈ closedBall z₀ r ∧ orbit c P ζ = ζ ∧
      minimalPeriod (quadratic c) ζ = P ∧
      ‖(derivative (seedPolynomial c P)).eval ζ‖ ≤
        multiplierBound (storedOrbitRadius (r + ε) Δ radius residual) P ∧
      ∀ y ∈ closedBall z₀ r, orbit c P y = y → y = ζ := by
  rw [Verifier.inline_eq_reference] at hacc hperiod
  exact existsUnique_primitive_of_reference_accepted_stored t frames n iterations evidence old
    hacc P hperiod cRef c z₀ reference r ε Δ η radius residual hradius hinit hparam hr hρ
    htrackClose htrackDiv hcontract hgap hwindow hsep

/-- **Stored reference with critical entry (V0), frame-value windows.** The
hypotheses of `existsUnique_primitive_of_reference_accepted_stored`, plus a
stored critical-orbit prefix `critical` (from the critical seed `0`, at the
same `cRef` and `Δ`) with initial allowance `εc`, radii `critRadius`, local
residuals `critResidual`, and the StoredDisk entry inequality
`‖critical k - z₀‖ + storedOrbitError εc Δ critRadius critResidual k ≤ r`.
Then every later return `orbit c (k + m P) 0` stays in the disk and is within
`q ^ m * dist (orbit c k 0) ζ` of `ζ`, where
`q = multiplierBound (storedOrbitRadius (r + ε) Δ radius residual) P`. All
numerical hypotheses are plain StoredDisk-style inequalities. -/
theorem existsUnique_primitive_critical_of_reference_accepted_stored {Payload : Type*}
    (t : Verifier.Thresholds) (frames : ℕ → Verifier.Frame Payload)
    (n iterations evidence : ℕ) (old : Verifier.Record Payload)
    (hacc : (Verifier.reference t frames n iterations evidence old).1 = .accepted)
    (P : ℕ) (hperiod : (Verifier.reference t frames n iterations evidence old).2.period = P)
    (cRef c z₀ : ℂ) (reference : ℕ → ℂ) (r ε Δ η : ℝ) (radius residual : ℕ → ℝ)
    (hradius : 0 ≤ r) (hinit : ‖z₀ - reference 0‖ ≤ ε) (hparam : ‖c - cRef‖ ≤ Δ)
    (hr : ∀ k ≤ P, ‖reference k‖ ≤ radius k)
    (hρ : ∀ k < P, ‖reference (k + 1) - quadratic cRef (reference k)‖ ≤ residual k)
    (htrackClose : ‖reference P - z₀‖ ^ 2 ≤ ((frames P).residualSquared : ℝ) + η)
    (htrackDiv : ∀ e ∈ Verifier.properDivisors P,
      ((frames e).residualSquared : ℝ) ≤ ‖reference e - z₀‖ ^ 2 + η)
    (hcontract : multiplierBound (storedOrbitRadius (r + ε) Δ radius residual) P < 1)
    (hgap : storedOrbitError ε Δ radius residual P ≤
      r * (1 - multiplierBound (storedOrbitRadius (r + ε) Δ radius residual) P))
    (hwindow : ((frames P).residualSquared : ℝ) + η ≤
      (r * (1 - multiplierBound (storedOrbitRadius (r + ε) Δ radius residual) P) -
        storedOrbitError ε Δ radius residual P) ^ 2)
    (hsep : ∀ e ∈ Verifier.properDivisors P,
      (storedOrbitError (r + ε) Δ radius residual e + r) ^ 2 <
        ((frames e).residualSquared : ℝ) - η)
    (k : ℕ) (critical : ℕ → ℂ) (εc : ℝ) (critRadius critResidual : ℕ → ℝ)
    (hcinit : ‖critical 0‖ ≤ εc)
    (hcr : ∀ j < k, ‖critical j‖ ≤ critRadius j)
    (hcρ : ∀ j < k, ‖critical (j + 1) - quadratic cRef (critical j)‖ ≤ critResidual j)
    (hentry : ‖critical k - z₀‖ + storedOrbitError εc Δ critRadius critResidual k ≤ r) :
    ∃! ζ : ℂ, ζ ∈ closedBall z₀ r ∧ orbit c P ζ = ζ ∧
      minimalPeriod (quadratic c) ζ = P ∧
      ‖(derivative (seedPolynomial c P)).eval ζ‖ ≤
        multiplierBound (storedOrbitRadius (r + ε) Δ radius residual) P ∧
      (∀ y ∈ closedBall z₀ r, orbit c P y = y → y = ζ) ∧
      ∀ m : ℕ, orbit c (k + m * P) 0 ∈ closedBall z₀ r ∧
        dist (orbit c (k + m * P) 0) ζ ≤
          multiplierBound (storedOrbitRadius (r + ε) Δ radius residual) P ^ m *
            dist (orbit c k 0) ζ := by
  obtain ⟨hpos, -, -⟩ := accepted_period_facts t frames n iterations evidence old hacc P hperiod
  obtain ⟨hmult, hcenter, hnoret⟩ := stored_return_hypotheses cRef c z₀ reference r ε Δ η _
    (fun e => ((frames e).residualSquared : ℝ)) radius residual P hinit hparam hr hρ
    htrackClose htrackDiv hgap hwindow hsep
  exact existsUnique_primitive_critical_of_return_disk c z₀ k P hpos r _ hradius hcontract
    hmult hcenter hnoret
    (critical_entry_of_storedReference cRef c z₀ critical εc Δ r critRadius critResidual k
      hcinit hparam hcr hcρ hentry)

/-- **Stored reference with critical entry (V1), frame-value windows.** -/
theorem existsUnique_primitive_critical_of_inline_accepted_stored {Payload : Type*}
    (t : Verifier.Thresholds) (frames : ℕ → Verifier.Frame Payload)
    (n iterations evidence : ℕ) (old : Verifier.Record Payload)
    (hacc : (Verifier.inline t frames n iterations evidence old).1 = .accepted)
    (P : ℕ) (hperiod : (Verifier.inline t frames n iterations evidence old).2.period = P)
    (cRef c z₀ : ℂ) (reference : ℕ → ℂ) (r ε Δ η : ℝ) (radius residual : ℕ → ℝ)
    (hradius : 0 ≤ r) (hinit : ‖z₀ - reference 0‖ ≤ ε) (hparam : ‖c - cRef‖ ≤ Δ)
    (hr : ∀ k ≤ P, ‖reference k‖ ≤ radius k)
    (hρ : ∀ k < P, ‖reference (k + 1) - quadratic cRef (reference k)‖ ≤ residual k)
    (htrackClose : ‖reference P - z₀‖ ^ 2 ≤ ((frames P).residualSquared : ℝ) + η)
    (htrackDiv : ∀ e ∈ Verifier.properDivisors P,
      ((frames e).residualSquared : ℝ) ≤ ‖reference e - z₀‖ ^ 2 + η)
    (hcontract : multiplierBound (storedOrbitRadius (r + ε) Δ radius residual) P < 1)
    (hgap : storedOrbitError ε Δ radius residual P ≤
      r * (1 - multiplierBound (storedOrbitRadius (r + ε) Δ radius residual) P))
    (hwindow : ((frames P).residualSquared : ℝ) + η ≤
      (r * (1 - multiplierBound (storedOrbitRadius (r + ε) Δ radius residual) P) -
        storedOrbitError ε Δ radius residual P) ^ 2)
    (hsep : ∀ e ∈ Verifier.properDivisors P,
      (storedOrbitError (r + ε) Δ radius residual e + r) ^ 2 <
        ((frames e).residualSquared : ℝ) - η)
    (k : ℕ) (critical : ℕ → ℂ) (εc : ℝ) (critRadius critResidual : ℕ → ℝ)
    (hcinit : ‖critical 0‖ ≤ εc)
    (hcr : ∀ j < k, ‖critical j‖ ≤ critRadius j)
    (hcρ : ∀ j < k, ‖critical (j + 1) - quadratic cRef (critical j)‖ ≤ critResidual j)
    (hentry : ‖critical k - z₀‖ + storedOrbitError εc Δ critRadius critResidual k ≤ r) :
    ∃! ζ : ℂ, ζ ∈ closedBall z₀ r ∧ orbit c P ζ = ζ ∧
      minimalPeriod (quadratic c) ζ = P ∧
      ‖(derivative (seedPolynomial c P)).eval ζ‖ ≤
        multiplierBound (storedOrbitRadius (r + ε) Δ radius residual) P ∧
      (∀ y ∈ closedBall z₀ r, orbit c P y = y → y = ζ) ∧
      ∀ m : ℕ, orbit c (k + m * P) 0 ∈ closedBall z₀ r ∧
        dist (orbit c (k + m * P) 0) ζ ≤
          multiplierBound (storedOrbitRadius (r + ε) Δ radius residual) P ^ m *
            dist (orbit c k 0) ζ := by
  rw [Verifier.inline_eq_reference] at hacc hperiod
  exact existsUnique_primitive_critical_of_reference_accepted_stored t frames n iterations
    evidence old hacc P hperiod cRef c z₀ reference r ε Δ η radius residual hradius hinit hparam
    hr hρ htrackClose htrackDiv hcontract hgap hwindow hsep k critical εc critRadius
    critResidual hcinit hcr hcρ hentry

/-! ## Threshold-window corollaries

Each replaces a frame-value window by the corresponding policy threshold
(`acceptSquared` for closure, `excludeSquared` for divisors), using
`frame_windows_of_threshold_windows`. These are strictly weaker than the
frame-value forms; for `P ≥ 2` they inherit the threshold-ratio ceiling of
`certifiedWindow_necessary`. -/

/-- **Threshold form (V0), generic period.** As
`existsUnique_primitive_of_reference_accepted`, with
`acceptSquared + η ≤ (r (1 - q)) ^ 2` and `(1 + L e) ^ 2 r ^ 2 < excludeSquared - η`. -/
theorem existsUnique_primitive_of_reference_accepted_thresholds {Payload : Type*}
    (t : Verifier.Thresholds) (frames : ℕ → Verifier.Frame Payload)
    (n iterations evidence : ℕ) (old : Verifier.Record Payload)
    (hacc : (Verifier.reference t frames n iterations evidence old).1 = .accepted)
    (P : ℕ) (hperiod : (Verifier.reference t frames n iterations evidence old).2.period = P)
    (c z₀ : ℂ) (r q η : ℝ) (L : ℕ → ℝ) (hr : 0 ≤ r) (hq1 : q < 1)
    (hmult : ∀ z ∈ closedBall z₀ r, ‖(derivative (seedPolynomial c P)).eval z‖ ≤ q)
    (hderiv : ∀ e ∈ Verifier.properDivisors P,
      ∀ z ∈ closedBall z₀ r, ‖(derivative (seedPolynomial c e)).eval z‖ ≤ L e)
    (htrackClose : ‖orbit c P z₀ - z₀‖ ^ 2 ≤ ((frames P).residualSquared : ℝ) + η)
    (htrackDiv : ∀ e ∈ Verifier.properDivisors P,
      ((frames e).residualSquared : ℝ) ≤ ‖orbit c e z₀ - z₀‖ ^ 2 + η)
    (hwindow : (t.acceptSquared : ℝ) + η ≤ (r * (1 - q)) ^ 2)
    (hsep : ∀ e ∈ Verifier.properDivisors P,
      (1 + L e) ^ 2 * r ^ 2 < (t.excludeSquared : ℝ) - η) :
    ∃! ζ : ℂ, ζ ∈ closedBall z₀ r ∧ orbit c P ζ = ζ ∧
      minimalPeriod (quadratic c) ζ = P ∧
      ‖(derivative (seedPolynomial c P)).eval ζ‖ ≤ q ∧
      ∀ y ∈ closedBall z₀ r, orbit c P y = y → y = ζ := by
  obtain ⟨hw, hs⟩ := frame_windows_of_threshold_windows t frames n iterations evidence old
    hacc P hperiod η _ (fun e => (1 + L e) ^ 2 * r ^ 2) hwindow hsep
  exact existsUnique_primitive_of_reference_accepted t frames n iterations evidence old hacc
    P hperiod c z₀ r q η L hr hq1 hmult hderiv htrackClose htrackDiv hw hs

/-- **Threshold form (V1), generic period.** -/
theorem existsUnique_primitive_of_inline_accepted_thresholds {Payload : Type*}
    (t : Verifier.Thresholds) (frames : ℕ → Verifier.Frame Payload)
    (n iterations evidence : ℕ) (old : Verifier.Record Payload)
    (hacc : (Verifier.inline t frames n iterations evidence old).1 = .accepted)
    (P : ℕ) (hperiod : (Verifier.inline t frames n iterations evidence old).2.period = P)
    (c z₀ : ℂ) (r q η : ℝ) (L : ℕ → ℝ) (hr : 0 ≤ r) (hq1 : q < 1)
    (hmult : ∀ z ∈ closedBall z₀ r, ‖(derivative (seedPolynomial c P)).eval z‖ ≤ q)
    (hderiv : ∀ e ∈ Verifier.properDivisors P,
      ∀ z ∈ closedBall z₀ r, ‖(derivative (seedPolynomial c e)).eval z‖ ≤ L e)
    (htrackClose : ‖orbit c P z₀ - z₀‖ ^ 2 ≤ ((frames P).residualSquared : ℝ) + η)
    (htrackDiv : ∀ e ∈ Verifier.properDivisors P,
      ((frames e).residualSquared : ℝ) ≤ ‖orbit c e z₀ - z₀‖ ^ 2 + η)
    (hwindow : (t.acceptSquared : ℝ) + η ≤ (r * (1 - q)) ^ 2)
    (hsep : ∀ e ∈ Verifier.properDivisors P,
      (1 + L e) ^ 2 * r ^ 2 < (t.excludeSquared : ℝ) - η) :
    ∃! ζ : ℂ, ζ ∈ closedBall z₀ r ∧ orbit c P ζ = ζ ∧
      minimalPeriod (quadratic c) ζ = P ∧
      ‖(derivative (seedPolynomial c P)).eval ζ‖ ≤ q ∧
      ∀ y ∈ closedBall z₀ r, orbit c P y = y → y = ζ := by
  rw [Verifier.inline_eq_reference] at hacc hperiod
  exact existsUnique_primitive_of_reference_accepted_thresholds t frames n iterations evidence
    old hacc P hperiod c z₀ r q η L hr hq1 hmult hderiv htrackClose htrackDiv hwindow hsep

/-- **Threshold form (V0), critical entry.** -/
theorem existsUnique_primitive_critical_of_reference_accepted_thresholds {Payload : Type*}
    (t : Verifier.Thresholds) (frames : ℕ → Verifier.Frame Payload)
    (n iterations evidence : ℕ) (old : Verifier.Record Payload)
    (hacc : (Verifier.reference t frames n iterations evidence old).1 = .accepted)
    (P : ℕ) (hperiod : (Verifier.reference t frames n iterations evidence old).2.period = P)
    (c z₀ : ℂ) (k : ℕ) (r q η : ℝ) (L : ℕ → ℝ) (hr : 0 ≤ r) (hq1 : q < 1)
    (hmult : ∀ z ∈ closedBall z₀ r, ‖(derivative (seedPolynomial c P)).eval z‖ ≤ q)
    (hderiv : ∀ e ∈ Verifier.properDivisors P,
      ∀ z ∈ closedBall z₀ r, ‖(derivative (seedPolynomial c e)).eval z‖ ≤ L e)
    (htrackClose : ‖orbit c P z₀ - z₀‖ ^ 2 ≤ ((frames P).residualSquared : ℝ) + η)
    (htrackDiv : ∀ e ∈ Verifier.properDivisors P,
      ((frames e).residualSquared : ℝ) ≤ ‖orbit c e z₀ - z₀‖ ^ 2 + η)
    (hwindow : (t.acceptSquared : ℝ) + η ≤ (r * (1 - q)) ^ 2)
    (hsep : ∀ e ∈ Verifier.properDivisors P,
      (1 + L e) ^ 2 * r ^ 2 < (t.excludeSquared : ℝ) - η)
    (hentry : orbit c k 0 ∈ closedBall z₀ r) :
    ∃! ζ : ℂ, ζ ∈ closedBall z₀ r ∧ orbit c P ζ = ζ ∧
      minimalPeriod (quadratic c) ζ = P ∧
      ‖(derivative (seedPolynomial c P)).eval ζ‖ ≤ q ∧
      (∀ y ∈ closedBall z₀ r, orbit c P y = y → y = ζ) ∧
      ∀ m : ℕ, orbit c (k + m * P) 0 ∈ closedBall z₀ r ∧
        dist (orbit c (k + m * P) 0) ζ ≤ q ^ m * dist (orbit c k 0) ζ := by
  obtain ⟨hw, hs⟩ := frame_windows_of_threshold_windows t frames n iterations evidence old
    hacc P hperiod η _ (fun e => (1 + L e) ^ 2 * r ^ 2) hwindow hsep
  exact existsUnique_primitive_critical_of_reference_accepted t frames n iterations evidence
    old hacc P hperiod c z₀ k r q η L hr hq1 hmult hderiv htrackClose htrackDiv hw hs hentry

/-- **Threshold form (V0), stored reference.** -/
theorem existsUnique_primitive_of_reference_accepted_stored_thresholds {Payload : Type*}
    (t : Verifier.Thresholds) (frames : ℕ → Verifier.Frame Payload)
    (n iterations evidence : ℕ) (old : Verifier.Record Payload)
    (hacc : (Verifier.reference t frames n iterations evidence old).1 = .accepted)
    (P : ℕ) (hperiod : (Verifier.reference t frames n iterations evidence old).2.period = P)
    (cRef c z₀ : ℂ) (reference : ℕ → ℂ) (r ε Δ η : ℝ) (radius residual : ℕ → ℝ)
    (hradius : 0 ≤ r) (hinit : ‖z₀ - reference 0‖ ≤ ε) (hparam : ‖c - cRef‖ ≤ Δ)
    (hr : ∀ k ≤ P, ‖reference k‖ ≤ radius k)
    (hρ : ∀ k < P, ‖reference (k + 1) - quadratic cRef (reference k)‖ ≤ residual k)
    (htrackClose : ‖reference P - z₀‖ ^ 2 ≤ ((frames P).residualSquared : ℝ) + η)
    (htrackDiv : ∀ e ∈ Verifier.properDivisors P,
      ((frames e).residualSquared : ℝ) ≤ ‖reference e - z₀‖ ^ 2 + η)
    (hcontract : multiplierBound (storedOrbitRadius (r + ε) Δ radius residual) P < 1)
    (hgap : storedOrbitError ε Δ radius residual P ≤
      r * (1 - multiplierBound (storedOrbitRadius (r + ε) Δ radius residual) P))
    (hwindow : (t.acceptSquared : ℝ) + η ≤
      (r * (1 - multiplierBound (storedOrbitRadius (r + ε) Δ radius residual) P) -
        storedOrbitError ε Δ radius residual P) ^ 2)
    (hsep : ∀ e ∈ Verifier.properDivisors P,
      (storedOrbitError (r + ε) Δ radius residual e + r) ^ 2 < (t.excludeSquared : ℝ) - η) :
    ∃! ζ : ℂ, ζ ∈ closedBall z₀ r ∧ orbit c P ζ = ζ ∧
      minimalPeriod (quadratic c) ζ = P ∧
      ‖(derivative (seedPolynomial c P)).eval ζ‖ ≤
        multiplierBound (storedOrbitRadius (r + ε) Δ radius residual) P ∧
      ∀ y ∈ closedBall z₀ r, orbit c P y = y → y = ζ := by
  obtain ⟨hw, hs⟩ := frame_windows_of_threshold_windows t frames n iterations evidence old
    hacc P hperiod η _ (fun e => (storedOrbitError (r + ε) Δ radius residual e + r) ^ 2)
    hwindow hsep
  exact existsUnique_primitive_of_reference_accepted_stored t frames n iterations evidence old
    hacc P hperiod cRef c z₀ reference r ε Δ η radius residual hradius hinit hparam hr hρ
    htrackClose htrackDiv hcontract hgap hw hs

/-- **Threshold form (V1), stored reference.** -/
theorem existsUnique_primitive_of_inline_accepted_stored_thresholds {Payload : Type*}
    (t : Verifier.Thresholds) (frames : ℕ → Verifier.Frame Payload)
    (n iterations evidence : ℕ) (old : Verifier.Record Payload)
    (hacc : (Verifier.inline t frames n iterations evidence old).1 = .accepted)
    (P : ℕ) (hperiod : (Verifier.inline t frames n iterations evidence old).2.period = P)
    (cRef c z₀ : ℂ) (reference : ℕ → ℂ) (r ε Δ η : ℝ) (radius residual : ℕ → ℝ)
    (hradius : 0 ≤ r) (hinit : ‖z₀ - reference 0‖ ≤ ε) (hparam : ‖c - cRef‖ ≤ Δ)
    (hr : ∀ k ≤ P, ‖reference k‖ ≤ radius k)
    (hρ : ∀ k < P, ‖reference (k + 1) - quadratic cRef (reference k)‖ ≤ residual k)
    (htrackClose : ‖reference P - z₀‖ ^ 2 ≤ ((frames P).residualSquared : ℝ) + η)
    (htrackDiv : ∀ e ∈ Verifier.properDivisors P,
      ((frames e).residualSquared : ℝ) ≤ ‖reference e - z₀‖ ^ 2 + η)
    (hcontract : multiplierBound (storedOrbitRadius (r + ε) Δ radius residual) P < 1)
    (hgap : storedOrbitError ε Δ radius residual P ≤
      r * (1 - multiplierBound (storedOrbitRadius (r + ε) Δ radius residual) P))
    (hwindow : (t.acceptSquared : ℝ) + η ≤
      (r * (1 - multiplierBound (storedOrbitRadius (r + ε) Δ radius residual) P) -
        storedOrbitError ε Δ radius residual P) ^ 2)
    (hsep : ∀ e ∈ Verifier.properDivisors P,
      (storedOrbitError (r + ε) Δ radius residual e + r) ^ 2 < (t.excludeSquared : ℝ) - η) :
    ∃! ζ : ℂ, ζ ∈ closedBall z₀ r ∧ orbit c P ζ = ζ ∧
      minimalPeriod (quadratic c) ζ = P ∧
      ‖(derivative (seedPolynomial c P)).eval ζ‖ ≤
        multiplierBound (storedOrbitRadius (r + ε) Δ radius residual) P ∧
      ∀ y ∈ closedBall z₀ r, orbit c P y = y → y = ζ := by
  rw [Verifier.inline_eq_reference] at hacc hperiod
  exact existsUnique_primitive_of_reference_accepted_stored_thresholds t frames n iterations
    evidence old hacc P hperiod cRef c z₀ reference r ε Δ η radius residual hradius hinit
    hparam hr hρ htrackClose htrackDiv hcontract hgap hwindow hsep

/-- **Threshold form (V0), stored reference with critical entry.** -/
theorem existsUnique_primitive_critical_of_reference_accepted_stored_thresholds
    {Payload : Type*}
    (t : Verifier.Thresholds) (frames : ℕ → Verifier.Frame Payload)
    (n iterations evidence : ℕ) (old : Verifier.Record Payload)
    (hacc : (Verifier.reference t frames n iterations evidence old).1 = .accepted)
    (P : ℕ) (hperiod : (Verifier.reference t frames n iterations evidence old).2.period = P)
    (cRef c z₀ : ℂ) (reference : ℕ → ℂ) (r ε Δ η : ℝ) (radius residual : ℕ → ℝ)
    (hradius : 0 ≤ r) (hinit : ‖z₀ - reference 0‖ ≤ ε) (hparam : ‖c - cRef‖ ≤ Δ)
    (hr : ∀ k ≤ P, ‖reference k‖ ≤ radius k)
    (hρ : ∀ k < P, ‖reference (k + 1) - quadratic cRef (reference k)‖ ≤ residual k)
    (htrackClose : ‖reference P - z₀‖ ^ 2 ≤ ((frames P).residualSquared : ℝ) + η)
    (htrackDiv : ∀ e ∈ Verifier.properDivisors P,
      ((frames e).residualSquared : ℝ) ≤ ‖reference e - z₀‖ ^ 2 + η)
    (hcontract : multiplierBound (storedOrbitRadius (r + ε) Δ radius residual) P < 1)
    (hgap : storedOrbitError ε Δ radius residual P ≤
      r * (1 - multiplierBound (storedOrbitRadius (r + ε) Δ radius residual) P))
    (hwindow : (t.acceptSquared : ℝ) + η ≤
      (r * (1 - multiplierBound (storedOrbitRadius (r + ε) Δ radius residual) P) -
        storedOrbitError ε Δ radius residual P) ^ 2)
    (hsep : ∀ e ∈ Verifier.properDivisors P,
      (storedOrbitError (r + ε) Δ radius residual e + r) ^ 2 < (t.excludeSquared : ℝ) - η)
    (k : ℕ) (critical : ℕ → ℂ) (εc : ℝ) (critRadius critResidual : ℕ → ℝ)
    (hcinit : ‖critical 0‖ ≤ εc)
    (hcr : ∀ j < k, ‖critical j‖ ≤ critRadius j)
    (hcρ : ∀ j < k, ‖critical (j + 1) - quadratic cRef (critical j)‖ ≤ critResidual j)
    (hentry : ‖critical k - z₀‖ + storedOrbitError εc Δ critRadius critResidual k ≤ r) :
    ∃! ζ : ℂ, ζ ∈ closedBall z₀ r ∧ orbit c P ζ = ζ ∧
      minimalPeriod (quadratic c) ζ = P ∧
      ‖(derivative (seedPolynomial c P)).eval ζ‖ ≤
        multiplierBound (storedOrbitRadius (r + ε) Δ radius residual) P ∧
      (∀ y ∈ closedBall z₀ r, orbit c P y = y → y = ζ) ∧
      ∀ m : ℕ, orbit c (k + m * P) 0 ∈ closedBall z₀ r ∧
        dist (orbit c (k + m * P) 0) ζ ≤
          multiplierBound (storedOrbitRadius (r + ε) Δ radius residual) P ^ m *
            dist (orbit c k 0) ζ := by
  obtain ⟨hw, hs⟩ := frame_windows_of_threshold_windows t frames n iterations evidence old
    hacc P hperiod η _ (fun e => (storedOrbitError (r + ε) Δ radius residual e + r) ^ 2)
    hwindow hsep
  exact existsUnique_primitive_critical_of_reference_accepted_stored t frames n iterations
    evidence old hacc P hperiod cRef c z₀ reference r ε Δ η radius residual hradius hinit
    hparam hr hρ htrackClose htrackDiv hcontract hgap hw hs k critical εc critRadius
    critResidual hcinit hcr hcρ hentry

/-! ## The threshold window (threshold-form corollaries only) -/

/-- **Necessary threshold window.** The threshold closure window
`accept + η ≤ (r (1 - q)) ^ 2` and a threshold divisor window
`(1 + L) ^ 2 r ^ 2 < exclude - η` can hold together only if
`(accept + η) (1 + L) ^ 2 < (1 - q) ^ 2 (exclude - η)`, roughly
`(1 + L) / (1 - q) < sqrt ((exclude - η) / (accept + η))`.

This ceiling constrains only the `_thresholds` corollaries, and only for
`P ≥ 2` (for `P = 1` there is no proper divisor and no divisor window). The
frame-value theorems compare against the frames' own residual squares,
which for real divisors are typically `O(0.01–1)`, and have no such ceiling. -/
theorem certifiedWindow_necessary (accept exclude η q L r : ℝ) (hq1 : q < 1)
    (hwindow : accept + η ≤ (r * (1 - q)) ^ 2)
    (hsep : (1 + L) ^ 2 * r ^ 2 < exclude - η) :
    (accept + η) * (1 + L) ^ 2 < (1 - q) ^ 2 * (exclude - η) := by
  have h1 : (accept + η) * (1 + L) ^ 2 ≤ (r * (1 - q)) ^ 2 * (1 + L) ^ 2 :=
    mul_le_mul_of_nonneg_right hwindow (sq_nonneg _)
  have h2 : (1 - q) ^ 2 * ((1 + L) ^ 2 * r ^ 2) < (1 - q) ^ 2 * (exclude - η) :=
    mul_lt_mul_of_pos_left hsep (pow_pos (sub_pos.mpr hq1) 2)
  have h3 : (r * (1 - q)) ^ 2 * (1 + L) ^ 2 = (1 - q) ^ 2 * ((1 + L) ^ 2 * r ^ 2) := by ring
  linarith

/-- **Threshold ratio ceiling.** For any positive `acceptSquared` with
`excludeSquared ≤ 10⁴ · acceptSquared` and any `η ≥ 0`, the two threshold windows
force `1 + L < 100 (1 - q)`. This covers the frozen policy of
`src/domain/verifier.ts` at every scale: the exact rational cutoffs
`(1e-8 · s) ^ 2` and `(1e-6 · s) ^ 2` have ratio exactly `10⁴`, and (checked
numerically outside Lean, not proved here) the binary64 product `1e-8 * 1e-8`
is slightly above `1e-16` while `1e-6 * 1e-6` is slightly below `1e-12`, so the
decoded binary64 ratio is slightly below `10⁴`. It applies only to the
`_thresholds` corollaries with `P ≥ 2`. -/
theorem thresholdWindow_ratio (t : Verifier.Thresholds) (hpos : 0 < t.acceptSquared)
    (hratio : t.excludeSquared ≤ 10000 * t.acceptSquared) (η q L r : ℝ) (hη : 0 ≤ η)
    (hq1 : q < 1)
    (hwindow : (t.acceptSquared : ℝ) + η ≤ (r * (1 - q)) ^ 2)
    (hsep : (1 + L) ^ 2 * r ^ 2 < (t.excludeSquared : ℝ) - η) :
    1 + L < 100 * (1 - q) := by
  have hnec := certifiedWindow_necessary _ _ η q L r hq1 hwindow hsep
  have hA : (0 : ℝ) < t.acceptSquared := by exact_mod_cast hpos
  have hX : (t.excludeSquared : ℝ) ≤ 10000 * t.acceptSquared := by exact_mod_cast hratio
  have hXq := mul_le_mul_of_nonneg_left hX (sq_nonneg (1 - q))
  have hmul : (t.acceptSquared : ℝ) * (1 + L) ^ 2 <
      (t.acceptSquared : ℝ) * (100 * (1 - q)) ^ 2 := by
    nlinarith [mul_nonneg hη (sq_nonneg (1 + L)), mul_nonneg hη (sq_nonneg (1 - q))]
  have hsq := lt_of_mul_lt_mul_left hmul hA.le
  exact lt_of_pow_lt_pow_left₀ 2 (by linarith) hsq

/-- The unit-scale exact frozen thresholds satisfy the hypotheses of
`thresholdWindow_ratio`. -/
theorem periodTwoTileThresholds_ratio :
    0 < periodTwoTileThresholds.acceptSquared ∧
      periodTwoTileThresholds.excludeSquared ≤ 10000 * periodTwoTileThresholds.acceptSquared := by
  norm_num [periodTwoTileThresholds]

/-- Under a threshold ratio at most `10⁴`, no disk with `99/100 ≤ q < 1` and
`L ≥ 0` satisfies both *threshold* windows. This is a limit of the `_thresholds`
corollaries for `P ≥ 2`, not of the frame-value method. -/
theorem thresholdWindow_rejects_weak_contraction (t : Verifier.Thresholds)
    (hpos : 0 < t.acceptSquared) (hratio : t.excludeSquared ≤ 10000 * t.acceptSquared)
    (η q L r : ℝ) (hη : 0 ≤ η) (hL : 0 ≤ L) (hq : 99 / 100 ≤ q) (hq1 : q < 1)
    (hwindow : (t.acceptSquared : ℝ) + η ≤ (r * (1 - q)) ^ 2) :
    ¬ (1 + L) ^ 2 * r ^ 2 < (t.excludeSquared : ℝ) - η := by
  intro hsep
  have hratio' := thresholdWindow_ratio t hpos hratio η q L r hη hq1 hwindow hsep
  linarith

/-- The unit-scale threshold windows are satisfiable at `q = 19/20`, `L = 1`,
`η = 0`, `r = 3e-7`. Numerically a disk bound is `q = |λ| + O(r)` (for
`|λ| ≈ 0.9` at `r ≈ 1.5e-7` it is about `0.9000005`), so `q = 19/20` is a loose
bound chosen only to show the windows are satisfiable. This checks only the
two real inequalities. -/
theorem thresholdWindow_admits_moderate_contraction :
    (periodTwoTileThresholds.acceptSquared : ℝ) + 0 ≤
        ((3 / 10000000 : ℝ) * (1 - 19 / 20)) ^ 2 ∧
      (1 + 1 : ℝ) ^ 2 * (3 / 10000000 : ℝ) ^ 2 <
        (periodTwoTileThresholds.excludeSquared : ℝ) - 0 := by
  norm_num [periodTwoTileThresholds]

/-- The frame-value windows admit weak contraction that the threshold windows
reject. With illustrative period-two numbers near `c = -0.75125`
(`|λ| ≈ 0.995`): closure frame square `1e-16`, divisor frame square `5e-3`,
`q = 0.996`, `L = 1`, `r = 1e-4`, `η = 0`, both frame-value windows hold, while
`thresholdWindow_rejects_weak_contraction` excludes `q = 0.996` for every `r`.
This checks only the real inequalities; it is not a dynamical instance. -/
theorem frameWindow_admits_weak_contraction :
    (1 / 10000000000000000 : ℝ) + 0 ≤ ((1 / 10000 : ℝ) * (1 - 996 / 1000)) ^ 2 ∧
      (1 + 1 : ℝ) ^ 2 * (1 / 10000 : ℝ) ^ 2 < 5 / 1000 - 0 := by
  norm_num

/-! ## Non-vacuity instances -/

/-- The rational critical frames at `-1` have residual square `1` at step one
and `0` at steps two and four. -/
theorem minusOne_criticalFrame_residuals :
    (rationalCriticalFrame (-1, 0) 1).residualSquared = 1 ∧
      (rationalCriticalFrame (-1, 0) 2).residualSquared = 0 ∧
      (rationalCriticalFrame (-1, 0) 4).residualSquared = 0 := by
  refine ⟨?_, ?_, ?_⟩ <;>
    norm_num [rationalCriticalFrame, rationalCriticalResidualSq, rationalOrbit,
      rationalQuadratic, rationalNormSq, Function.iterate_succ_apply']

/-- Exact disk quantities at `c = -1`, `z₀ = 0`, `r = 1/16`, `Δ = 0`. -/
theorem minusOne_disk_quantities :
    multiplierBound (diskOrbitRadius (-1) 0 (1 / 16) 0) 2 = 257 / 1024 ∧
      diskOrbitError (-1) 0 0 0 2 = 0 ∧
      diskOrbitError (-1) 0 (1 / 16) 0 1 = 1 / 256 := by
  refine ⟨?_, ?_, ?_⟩ <;>
    norm_num [multiplierBound, Finset.prod_range_succ, diskOrbitRadius, diskOrbitError,
      errorBudget, orbit_succ, quadratic]

/-- The period-two disk certificate at `c = -1`, `z₀ = 0`, `r = 1/16` from any
accepted verdict whose output period is two and whose frames are the exact
rational critical frames. Shared by the `.keep` and `.reduced` instances. -/
theorem minusOne_certificate_of_accepted (n iterations evidence : ℕ)
    (old : Verifier.Record Unit)
    (hacc : (Verifier.reference periodTwoTileThresholds (rationalCriticalFrame (-1, 0)) n
      iterations evidence old).1 = .accepted)
    (hperiod : (Verifier.reference periodTwoTileThresholds (rationalCriticalFrame (-1, 0)) n
      iterations evidence old).2.period = 2) :
    ∃! ζ : ℂ, ζ ∈ closedBall (0 : ℂ) (1 / 16) ∧ orbit (-1) 2 ζ = ζ ∧
      minimalPeriod (quadratic (-1 : ℂ)) ζ = 2 ∧
      ‖(derivative (seedPolynomial (-1 : ℂ) 2)).eval ζ‖ ≤ 257 / 1024 ∧
      ∀ y ∈ closedBall (0 : ℂ) (1 / 16), orbit (-1) 2 y = y → y = ζ := by
  have hproper : Verifier.properDivisors 2 = [1] := by decide
  obtain ⟨hres1, hres2, -⟩ := minusOne_criticalFrame_residuals
  obtain ⟨hmb, herr0, herr1⟩ := minusOne_disk_quantities
  have hcert := existsUnique_primitive_of_reference_accepted_disk periodTwoTileThresholds
    (rationalCriticalFrame (-1, 0)) n iterations evidence old hacc 2 hperiod (-1) (-1) 0
    (1 / 16) 0 0 (by norm_num) (by simp)
    (by rw [hres2]; norm_num [orbit_succ, quadratic])
    (by
      intro e he
      rw [hproper, List.mem_singleton] at he
      subst e
      rw [hres1]
      norm_num [orbit_succ, quadratic])
    (by rw [hmb]; norm_num)
    (by rw [hmb, herr0]; norm_num)
    (by rw [hmb, herr0, hres2]; norm_num)
    (by
      intro e he
      rw [hproper, List.mem_singleton] at he
      subst e
      rw [herr1, hres1]
      norm_num)
  rwa [hmb] at hcert

/-- **Non-vacuity, `.keep` path.** At `c = -1`, `z₀ = 0`, with the exact
rational critical frames and the unit-scale frozen thresholds, the reference
verifier accepts candidate period two, and the frame-value exact-disk bridge
gives a fixed point of the two-step return in `closedBall 0 (1/16)` with
minimal period two and multiplier modulus at most `257/1024`, equal to every
two-step fixed point in that disk. A sanity instance at the period-two
center with exact frames (`η = 0`). -/
theorem minusOne_certifiedAcceptance (iterations evidence : ℕ) (old : Verifier.Record Unit) :
    (Verifier.reference periodTwoTileThresholds (rationalCriticalFrame (-1, 0)) 2
        iterations evidence old).1 = .accepted ∧
      (Verifier.reference periodTwoTileThresholds (rationalCriticalFrame (-1, 0)) 2
        iterations evidence old).2.period = 2 ∧
      ∃! ζ : ℂ, ζ ∈ closedBall (0 : ℂ) (1 / 16) ∧ orbit (-1) 2 ζ = ζ ∧
        minimalPeriod (quadratic (-1 : ℂ)) ζ = 2 ∧
        ‖(derivative (seedPolynomial (-1 : ℂ) 2)).eval ζ‖ ≤ 257 / 1024 ∧
        ∀ y ∈ closedBall (0 : ℂ) (1 / 16), orbit (-1) 2 y = y → y = ζ := by
  have hc : periodTwoRationalTile.contains (rationalComplexEmbed (-1, 0)) := by
    norm_num [periodTwoRationalTile, RationalBox.contains, RationalInterval.contains,
      rationalComplexEmbed]
  obtain ⟨hacc, hperiod⟩ :=
    periodTwoRationalTile_reference_accepts (-1, 0) hc iterations evidence old
  exact ⟨hacc, hperiod,
    minusOne_certificate_of_accepted 2 iterations evidence old hacc hperiod⟩

/-- At `c = -1` the reference verifier on candidate four reduces to period
two: four closes, divisor one is excluded, divisor two is accepted. -/
theorem minusOne_reference_reduces_four (iterations evidence : ℕ)
    (old : Verifier.Record Unit) :
    Verifier.reference periodTwoTileThresholds (rationalCriticalFrame (-1, 0)) 4
        iterations evidence old =
      (.accepted, ⟨2, iterations, evidence, 2, ()⟩) := by
  rw [← Verifier.inline_eq_reference]
  have hproper : Verifier.properDivisors 4 = [1, 2] := by decide
  obtain ⟨hres1, hres2, hres4⟩ := minusOne_criticalFrame_residuals
  have hmult : (rationalCriticalFrame (-1, 0) 2).multiplierMagnitude = 0 := rfl
  simp only [Verifier.inline, Verifier.decide, hproper, Verifier.inlineReduction, hres1,
    hres2, hres4, Verifier.finish]
  norm_num [periodTwoTileThresholds, hmult]

/-- **Non-vacuity, `.reduced` path.** The verifier on candidate `n = 4` at
`c = -1` accepts with reduced output period `P = 2`, and the same frame-value
bridge yields the primitive period-two point in `closedBall 0 (1/16)`. -/
theorem minusOne_reduced_certifiedAcceptance (iterations evidence : ℕ)
    (old : Verifier.Record Unit) :
    (Verifier.reference periodTwoTileThresholds (rationalCriticalFrame (-1, 0)) 4
        iterations evidence old).1 = .accepted ∧
      (Verifier.reference periodTwoTileThresholds (rationalCriticalFrame (-1, 0)) 4
        iterations evidence old).2.period = 2 ∧
      ∃! ζ : ℂ, ζ ∈ closedBall (0 : ℂ) (1 / 16) ∧ orbit (-1) 2 ζ = ζ ∧
        minimalPeriod (quadratic (-1 : ℂ)) ζ = 2 ∧
        ‖(derivative (seedPolynomial (-1 : ℂ) 2)).eval ζ‖ ≤ 257 / 1024 ∧
        ∀ y ∈ closedBall (0 : ℂ) (1 / 16), orbit (-1) 2 y = y → y = ζ := by
  have hrun := minusOne_reference_reduces_four iterations evidence old
  have hacc : (Verifier.reference periodTwoTileThresholds (rationalCriticalFrame (-1, 0)) 4
      iterations evidence old).1 = .accepted := by rw [hrun]
  have hperiod : (Verifier.reference periodTwoTileThresholds (rationalCriticalFrame (-1, 0)) 4
      iterations evidence old).2.period = 2 := by rw [hrun]
  exact ⟨hacc, hperiod,
    minusOne_certificate_of_accepted 4 iterations evidence old hacc hperiod⟩

/-- At `c = 0` the reference verifier accepts candidate period one on the exact
rational critical frames. -/
theorem zero_reference_accepts_one (iterations evidence : ℕ)
    (old : Verifier.Record Unit) :
    Verifier.reference periodTwoTileThresholds (rationalCriticalFrame (0, 0)) 1
        iterations evidence old =
      (.accepted, ⟨2, iterations, evidence, 1, ()⟩) := by
  rw [← Verifier.inline_eq_reference]
  have hproper : Verifier.properDivisors 1 = [] := by decide
  have hres1 : (rationalCriticalFrame (0, 0) 1).residualSquared = 0 := by
    norm_num [rationalCriticalFrame, rationalCriticalResidualSq, rationalOrbit,
      rationalQuadratic, rationalNormSq]
  have hmult : (rationalCriticalFrame (0, 0) 1).multiplierMagnitude = 0 := rfl
  simp only [Verifier.inline, Verifier.decide, hproper, Verifier.inlineReduction, hres1,
    hmult, Verifier.finish]
  norm_num [periodTwoTileThresholds]

/-- **Non-vacuity, `P = 1`.** At `c = 0`, `z₀ = 0` the verifier accepts period
one, and the frame-value exact-disk bridge gives a fixed point of `z ↦ z²` in
`closedBall 0 (1/4)` with minimal period one and multiplier modulus at most
`1/2`, equal to every fixed point in that disk. No divisor window arises. -/
theorem zero_certifiedAcceptance (iterations evidence : ℕ) (old : Verifier.Record Unit) :
    ∃! ζ : ℂ, ζ ∈ closedBall (0 : ℂ) (1 / 4) ∧ orbit 0 1 ζ = ζ ∧
      minimalPeriod (quadratic (0 : ℂ)) ζ = 1 ∧
      ‖(derivative (seedPolynomial (0 : ℂ) 1)).eval ζ‖ ≤ 1 / 2 ∧
      ∀ y ∈ closedBall (0 : ℂ) (1 / 4), orbit 0 1 y = y → y = ζ := by
  have hrun := zero_reference_accepts_one iterations evidence old
  have hacc : (Verifier.reference periodTwoTileThresholds (rationalCriticalFrame (0, 0)) 1
      iterations evidence old).1 = .accepted := by rw [hrun]
  have hperiod : (Verifier.reference periodTwoTileThresholds (rationalCriticalFrame (0, 0)) 1
      iterations evidence old).2.period = 1 := by rw [hrun]
  have hproper : Verifier.properDivisors 1 = [] := by decide
  have hres1 : (rationalCriticalFrame (0, 0) 1).residualSquared = 0 := by
    norm_num [rationalCriticalFrame, rationalCriticalResidualSq, rationalOrbit,
      rationalQuadratic, rationalNormSq]
  have hmb : multiplierBound (diskOrbitRadius 0 0 (1 / 4) 0) 1 = 1 / 2 := by
    norm_num [multiplierBound, Finset.prod_range_succ, diskOrbitRadius, diskOrbitError,
      errorBudget]
  have herr : diskOrbitError 0 0 0 0 1 = 0 := by
    norm_num [diskOrbitError, errorBudget]
  have hcert := existsUnique_primitive_of_reference_accepted_disk periodTwoTileThresholds
    (rationalCriticalFrame (0, 0)) 1 iterations evidence old hacc 1 hperiod 0 0 0
    (1 / 4) 0 0 (by norm_num) (by simp)
    (by rw [hres1]; norm_num [orbit_succ, quadratic])
    (by simp [hproper])
    (by rw [hmb]; norm_num)
    (by rw [hmb, herr]; norm_num)
    (by rw [hmb, herr, hres1]; norm_num)
    (by simp [hproper])
  rwa [hmb] at hcert

/-- Exact one- and two-step disk multiplier bounds at `c = -1`, `z₀ = 0`,
`r = 1e-7`, the radius scale the unit-scale threshold windows require. -/
theorem minusOne_threshold_multiplierBounds :
    multiplierBound (diskOrbitRadius (-1) 0 (1 / 10000000) 0) 1 = 1 / 5000000 ∧
      multiplierBound (diskOrbitRadius (-1) 0 (1 / 10000000) 0) 2 =
        400000000000004 / 1000000000000000000000 := by
  constructor <;>
    norm_num [multiplierBound, Finset.prod_range_succ, diskOrbitRadius, diskOrbitError,
      errorBudget, orbit_succ, quadratic]

/-- **Non-vacuity of the threshold corollaries.** At `c = -1`, `z₀ = 0`, with the
unit-scale frozen thresholds the threshold windows force roughly
`1e-8 ≤ r < 1e-6`; at `r = 1e-7` both the stored-reference critical threshold
corollary (stored reference and critical prefix equal to the exact critical
orbit, `ε = εc = Δ = 0`, zero local residuals, entry at `k = 0`) and the generic
critical threshold corollary apply. -/
theorem minusOne_threshold_certifiedAcceptance (iterations evidence : ℕ)
    (old : Verifier.Record Unit) :
    (∃! ζ : ℂ, ζ ∈ closedBall (0 : ℂ) (1 / 10000000) ∧ orbit (-1) 2 ζ = ζ ∧
      minimalPeriod (quadratic (-1 : ℂ)) ζ = 2 ∧
      ‖(derivative (seedPolynomial (-1 : ℂ) 2)).eval ζ‖ ≤
        multiplierBound (storedOrbitRadius (1 / 10000000 + 0) 0
          (fun k => ‖orbit (-1 : ℂ) k 0‖) (fun _ => 0)) 2 ∧
      (∀ y ∈ closedBall (0 : ℂ) (1 / 10000000), orbit (-1) 2 y = y → y = ζ) ∧
      ∀ m : ℕ, orbit (-1 : ℂ) (0 + m * 2) 0 ∈ closedBall (0 : ℂ) (1 / 10000000) ∧
        dist (orbit (-1 : ℂ) (0 + m * 2) 0) ζ ≤
          multiplierBound (storedOrbitRadius (1 / 10000000 + 0) 0
            (fun k => ‖orbit (-1 : ℂ) k 0‖) (fun _ => 0)) 2 ^ m *
            dist (orbit (-1 : ℂ) 0 0) ζ) ∧
    (∃! ζ : ℂ, ζ ∈ closedBall (0 : ℂ) (1 / 10000000) ∧ orbit (-1) 2 ζ = ζ ∧
      minimalPeriod (quadratic (-1 : ℂ)) ζ = 2 ∧
      ‖(derivative (seedPolynomial (-1 : ℂ) 2)).eval ζ‖ ≤
        400000000000004 / 1000000000000000000000 ∧
      (∀ y ∈ closedBall (0 : ℂ) (1 / 10000000), orbit (-1) 2 y = y → y = ζ) ∧
      ∀ m : ℕ, orbit (-1 : ℂ) (0 + m * 2) 0 ∈ closedBall (0 : ℂ) (1 / 10000000) ∧
        dist (orbit (-1 : ℂ) (0 + m * 2) 0) ζ ≤
          (400000000000004 / 1000000000000000000000 : ℝ) ^ m *
            dist (orbit (-1 : ℂ) 0 0) ζ) := by
  have hc : periodTwoRationalTile.contains (rationalComplexEmbed (-1, 0)) := by
    norm_num [periodTwoRationalTile, RationalBox.contains, RationalInterval.contains,
      rationalComplexEmbed]
  obtain ⟨hacc, hperiod⟩ :=
    periodTwoRationalTile_reference_accepts (-1, 0) hc iterations evidence old
  have hproper : Verifier.properDivisors 2 = [1] := by decide
  obtain ⟨hres1, hres2, -⟩ := minusOne_criticalFrame_residuals
  obtain ⟨hmb1, hmb2⟩ := minusOne_threshold_multiplierBounds
  have hstoredRadius : storedOrbitRadius (1 / 10000000 + 0) 0
      (fun k => ‖orbit (-1 : ℂ) k 0‖) (fun _ => 0) =
        diskOrbitRadius (-1) 0 (1 / 10000000) 0 := by
    funext k
    rw [add_zero, storedOrbitRadius_exact_reference]
  constructor
  · refine existsUnique_primitive_critical_of_reference_accepted_stored_thresholds
      periodTwoTileThresholds (rationalCriticalFrame (-1, 0)) 2 iterations evidence old hacc 2
      hperiod (-1) (-1) 0 (fun k => orbit (-1 : ℂ) k 0) (1 / 10000000) 0 0 0
      (fun k => ‖orbit (-1 : ℂ) k 0‖) (fun _ => 0) (by norm_num) (by simp) (by simp)
      (fun _ _ => le_rfl) (fun k _ => by simp [orbit_succ]) ?_ ?_ ?_ ?_ ?_ ?_
      0 (fun k => orbit (-1 : ℂ) k 0) 0 (fun k => ‖orbit (-1 : ℂ) k 0‖) (fun _ => 0)
      (by simp) (fun _ h => absurd h (Nat.not_lt_zero _))
      (fun _ h => absurd h (Nat.not_lt_zero _)) (by simp [storedOrbitError, errorBudget])
    · rw [hres2]; norm_num [orbit_succ, quadratic]
    · intro e he
      rw [hproper, List.mem_singleton] at he
      subst e
      rw [hres1]
      norm_num [orbit_succ, quadratic]
    · rw [hstoredRadius, hmb2]; norm_num
    · rw [hstoredRadius, hmb2]
      norm_num [storedOrbitError, errorBudget, orbit_succ, quadratic]
    · rw [hstoredRadius, hmb2]
      norm_num [storedOrbitError, errorBudget, orbit_succ, quadratic, periodTwoTileThresholds]
    · intro e he
      rw [hproper, List.mem_singleton] at he
      subst e
      norm_num [storedOrbitError, errorBudget, orbit_succ, quadratic, periodTwoTileThresholds]
  · refine existsUnique_primitive_critical_of_reference_accepted_thresholds
      periodTwoTileThresholds (rationalCriticalFrame (-1, 0)) 2 iterations evidence old hacc 2
      hperiod (-1) 0 0 (1 / 10000000) (400000000000004 / 1000000000000000000000) 0
      (fun e => multiplierBound (diskOrbitRadius (-1) 0 (1 / 10000000) 0) e)
      (by norm_num) (by norm_num) ?_ ?_ ?_ ?_ ?_ ?_ ?_
    · intro z hz
      rw [← hmb2]
      exact seedDerivative_norm_le_disk_multiplier (-1) (-1) 0 z (1 / 10000000) 0 2
        (by simpa only [mem_closedBall, dist_eq_norm] using hz) (by simp)
    · intro e _ z hz
      exact seedDerivative_norm_le_disk_multiplier (-1) (-1) 0 z (1 / 10000000) 0 e
        (by simpa only [mem_closedBall, dist_eq_norm] using hz) (by simp)
    · rw [hres2]; norm_num [orbit_succ, quadratic]
    · intro e he
      rw [hproper, List.mem_singleton] at he
      subst e
      rw [hres1]
      norm_num [orbit_succ, quadratic]
    · norm_num [periodTwoTileThresholds]
    · intro e he
      rw [hproper, List.mem_singleton] at he
      subst e
      rw [hmb1]
      norm_num [periodTwoTileThresholds]
    · simp

/-! ## A weakly attracting period-two instance near the bulb root -/

/-- Exact rational frames for the seed `z₀ = -23232233/50000000` at parameter
`c = -601/800 = -0.75125`, near the period-two root `c = -3/4`, where the
period-two multiplier is about `0.995`. The residual squares are the exact
rational center residuals. The multiplier field `995/1000` is an uncertified
label: it only has to pass the verifier's attraction cutoff and is not used by
the bridge. -/
def weakPeriodTwoFrames (d : ℕ) : Verifier.Frame Unit where
  residualSquared :=
    rationalNormSq ((rationalOrbit (-601 / 800, 0) d (-23232233 / 50000000, 0)).1 +
        23232233 / 50000000,
      (rationalOrbit (-601 / 800, 0) d (-23232233 / 50000000, 0)).2)
  multiplierMagnitude := 995 / 1000
  fields := ()

/-- The weak-attraction frames are exact (`η = 0`) at the candidate and the
divisor. -/
theorem weakPeriodTwoFrames_residuals :
    ((weakPeriodTwoFrames 2).residualSquared : ℝ) =
        ‖orbit (-601 / 800 : ℂ) 2 (-23232233 / 50000000) - (-23232233 / 50000000)‖ ^ 2 ∧
      ((weakPeriodTwoFrames 1).residualSquared : ℝ) =
        ‖orbit (-601 / 800 : ℂ) 1 (-23232233 / 50000000) - (-23232233 / 50000000)‖ ^ 2 := by
  constructor <;>
    norm_num [weakPeriodTwoFrames, rationalOrbit, rationalQuadratic, rationalNormSq,
      iterate_succ_apply', orbit_succ, quadratic]

/-- The exact disk multiplier bound at radius `1e-4` is below `0.996`. -/
theorem weakPeriodTwo_multiplierBound_le :
    multiplierBound (diskOrbitRadius (-601 / 800) (-23232233 / 50000000) (1 / 10000) 0) 2 ≤
      996 / 1000 := by
  norm_num [multiplierBound, Finset.prod_range_succ, diskOrbitRadius, diskOrbitError,
    errorBudget, orbit_succ, quadratic]

/-- **Weak contraction certified through frame-value windows.** At
`c = -0.75125`, the reference verifier with the unit-scale frozen thresholds
accepts period two on the exact rational frames, and the frame-value exact-disk
bridge with `r = 1e-4` gives a fixed point `ζ` of the two-step return in
`closedBall z₀ 1e-4` with minimal period two and multiplier modulus at most
`0.996`, equal to every two-step fixed point in that disk. The threshold divisor
window fails on this disk (`weakPeriodTwo_threshold_divisor_window_fails`, which
holds for any `r > 1e-6`); the real obstruction is
`thresholdWindow_rejects_weak_contraction`: no threshold-form certificate with
`q ≥ 0.99` exists at any radius. Exact rational frames only; no binary64 claim. -/
theorem weakPeriodTwo_certifiedAcceptance (iterations evidence : ℕ)
    (old : Verifier.Record Unit) :
    (Verifier.reference periodTwoTileThresholds weakPeriodTwoFrames 2 iterations evidence
        old).1 = .accepted ∧
      ∃! ζ : ℂ, ζ ∈ closedBall (-23232233 / 50000000 : ℂ) (1 / 10000) ∧
        orbit (-601 / 800) 2 ζ = ζ ∧
        minimalPeriod (quadratic (-601 / 800 : ℂ)) ζ = 2 ∧
        ‖(derivative (seedPolynomial (-601 / 800 : ℂ) 2)).eval ζ‖ ≤ 996 / 1000 ∧
        ∀ y ∈ closedBall (-23232233 / 50000000 : ℂ) (1 / 10000),
          orbit (-601 / 800) 2 y = y → y = ζ := by
  obtain ⟨hres2, hres1⟩ := weakPeriodTwoFrames_residuals
  have hproper : Verifier.properDivisors 2 = [1] := by decide
  have hdivQ :
      periodTwoTileThresholds.excludeSquared ≤ (weakPeriodTwoFrames 1).residualSquared := by
    have hreal : ((periodTwoTileThresholds.excludeSquared : ℚ) : ℝ) ≤
        ((weakPeriodTwoFrames 1).residualSquared : ℝ) := by
      rw [hres1]
      norm_num [periodTwoTileThresholds, orbit_succ, quadratic]
    exact_mod_cast hreal
  have hcloseQ :
      (weakPeriodTwoFrames 2).residualSquared ≤ periodTwoTileThresholds.acceptSquared := by
    have hreal : ((weakPeriodTwoFrames 2).residualSquared : ℝ) ≤
        ((periodTwoTileThresholds.acceptSquared : ℚ) : ℝ) := by
      rw [hres2]
      norm_num [periodTwoTileThresholds, orbit_succ, quadratic]
    exact_mod_cast hreal
  have hrun := periodTwoVerifierPilot_inline_of_margins periodTwoTileThresholds
    weakPeriodTwoFrames iterations evidence old hdivQ hcloseQ
    (by norm_num [weakPeriodTwoFrames, periodTwoTileThresholds])
  rw [Verifier.inline_eq_reference] at hrun
  have hacc : (Verifier.reference periodTwoTileThresholds weakPeriodTwoFrames 2 iterations
      evidence old).1 = .accepted := by rw [hrun]
  have hperiod : (Verifier.reference periodTwoTileThresholds weakPeriodTwoFrames 2 iterations
      evidence old).2.period = 2 := by rw [hrun]
  refine ⟨hacc, ?_⟩
  obtain ⟨ζ, ⟨hζ, hfix, hper, hmul, hall⟩, -⟩ :=
    existsUnique_primitive_of_reference_accepted_disk periodTwoTileThresholds
      weakPeriodTwoFrames 2 iterations evidence old hacc 2 hperiod (-601 / 800) (-601 / 800)
      (-23232233 / 50000000) (1 / 10000) 0 0 (by norm_num) (by simp)
      (by rw [hres2, add_zero])
      (by
        intro e he
        rw [hproper, List.mem_singleton] at he
        subst e
        rw [hres1, add_zero])
      (by
        norm_num [multiplierBound, Finset.prod_range_succ, diskOrbitRadius, diskOrbitError,
          errorBudget, orbit_succ, quadratic])
      (by
        norm_num [multiplierBound, Finset.prod_range_succ, diskOrbitRadius, diskOrbitError,
          errorBudget, orbit_succ, quadratic])
      (by
        rw [hres2]
        norm_num [multiplierBound, Finset.prod_range_succ, diskOrbitRadius, diskOrbitError,
          errorBudget, orbit_succ, quadratic])
      (by
        intro e he
        rw [hproper, List.mem_singleton] at he
        subst e
        rw [hres1]
        norm_num [diskOrbitError, errorBudget, orbit_succ, quadratic])
  exact ⟨ζ, ⟨hζ, hfix, hper, hmul.trans weakPeriodTwo_multiplierBound_le, hall⟩,
    fun y hy => hall y hy.1 hy.2.1⟩

/-- On the same disk the *threshold* divisor window fails: the propagated
divisor margin squared is far above `excludeSquared = 1e-12`. This is nearly
immediate (it fails for every `r > 1e-6` because `r² > 1e-12`); the general
obstruction for `q ≥ 0.99` is `thresholdWindow_rejects_weak_contraction`. -/
theorem weakPeriodTwo_threshold_divisor_window_fails :
    ¬ (diskOrbitError (-601 / 800) (-23232233 / 50000000) (1 / 10000) 0 1 + 1 / 10000) ^ 2 <
      (periodTwoTileThresholds.excludeSquared : ℝ) - 0 := by
  norm_num [diskOrbitError, errorBudget, periodTwoTileThresholds]

end IntMProof
