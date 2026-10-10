import IntMProof.StoredDisk
import IntMProof.CriticalEntry
import IntMProof.DyadicArithmetic
import IntMProof.VerifierModel

/-!
# A reflected, generic stored-reference tile checker (J2)

`checkTile` is one executable Boolean checker, generic over the period `p`,
critical-entry index `k`, parameter disk, seed disk, and dyadic precision. It
only *verifies* supplied integer witnesses: every test is an `Int`/`Nat`
inequality built from `+`, `-`, `*` and comparisons, with no division, square
root, floor, or rational arithmetic. An untrusted program may emit the
witnesses; a witness violating a checked inequality makes the checker return
`false`.

All witnesses share one dyadic grid with scale `S = 2^precision`; a natural
number `n` decodes to `n / S` and a `DyadicComplex` decodes by `dyadicDecode`.
The certificate stores

* a stored period-`p` reference prefix `ref₀ = z₀, …, ref_p` with radius
  witnesses `R_j² ≥ |ref_j|²` and step-residual witnesses
  `ρ_j² ≥ |ref_{j+1} - (ref_j² + cRef)|²` (checked exactly at scale `S²`);
* two stored-error tables: seed disk (initial `r`) and center (initial `0`),
  each satisfying `e_{j+1} S ≥ 2 R_j e_j + e_j² + (Δ + ρ_j) S`;
* a multiplier chain `m₀ ≥ S`, `m_{j+1} S ≥ m_j · 2 (R_j + e_j)`;
* a stored critical prefix from `0` of length `k` with its own radius,
  residual, and error (initial `0`) witnesses.

`checkTile_sound` proves once, from the stored-reference theorems, that a
`true` result gives, for every complex parameter in the closed decoded
parameter disk, a point `ζ` of the decoded seed disk which is fixed by the
`p`-step return, equals every other fixed point of that return in the seed
disk, has exact minimal period `p` and return multiplier at most the decoded
`q < 1`, and to which the critical orbit returns at iterates `k + m·p`,
contracting at rate `q^m`. Instances are discharged by kernel reduction
(`decide +kernel`).

The optional separate checker `checkTileMultiplierLower` verifies lower radius
witnesses `ℓ_j² ≤ |ref_j|²` and a lower chain `n₀ ≤ S`,
`n_{j+1} S ≤ n_j · 2 · max(ℓ_j - e_j, 0)` against the seed-disk error table;
`checkTileMultiplierLower_sound` then bounds the multiplier from below on the
whole seed disk, and `checkTile_sound_multiplier_bounds` states the two-sided
enclosure `n/S ≤ ‖λ(ζ)‖ ≤ q`.

All uniqueness is uniqueness *inside the seed disk*. It is not a global
statement about all attracting cycles. The checker says nothing when it returns
`false`: refusal is not escape or repulsion. Nothing here models binary64 or the
TypeScript renderer; the emitter that produces witnesses is untrusted and does
not enter the conclusion.
-/

namespace IntMProof

open Function Metric Polynomial

/-- A natural-number witness decoded on the dyadic grid `2^-precision`. -/
noncomputable def dyadicNatDecode (precision n : ℕ) : ℝ := (n : ℝ) / (2 : ℝ) ^ precision

/-- Grid scale `S = 2^precision` as a natural number. -/
def tileScale (precision : ℕ) : ℕ := 2 ^ precision

/-- One step of the stored period reference with its witnesses. -/
structure TileCycleStep where
  /-- Stored reference value `ref_j` on the grid. -/
  point : DyadicComplex
  /-- Radius witness `R_j`, with `R_j² ≥ |ref_j|²` at scale `S²`. -/
  radius : ℕ
  /-- Residual witness `ρ_j` for the step `ref_j ↦ ref_{j+1}`. -/
  residual : ℕ
  /-- Seed-disk error witness (initial value at least `r`). -/
  seedError : ℕ
  /-- Disk-center error witness (initial value zero allowed). -/
  centerError : ℕ
  /-- Multiplier-product witness (initial value at least `S`). -/
  multiplier : ℕ
  deriving Repr

/-- One step of the stored critical reference with its witnesses. -/
structure TileCriticalStep where
  /-- Stored critical reference value on the grid. -/
  point : DyadicComplex
  /-- Radius witness for the stored value. -/
  radius : ℕ
  /-- Residual witness for the next stored step. -/
  residual : ℕ
  /-- Error witness with initial error zero. -/
  error : ℕ
  deriving Repr

/-- A complete integer tile certificate. Natural fields are grid numerators. -/
structure TileCertificate where
  /-- Grid exponent `s`; the scale is `S = 2^s`. -/
  precision : ℕ
  /-- Parameter-disk center `cRef`. -/
  parameter : DyadicComplex
  /-- Parameter-disk radius numerator `Δ`. -/
  parameterRadius : ℕ
  /-- Seed-disk center `z₀`. -/
  center : DyadicComplex
  /-- Seed-disk radius numerator `r`. -/
  seedRadius : ℕ
  /-- Contraction numerator `q`; the checker requires `q < S`. -/
  contraction : ℕ
  /-- Candidate period `p`. -/
  period : ℕ
  /-- Critical-entry index `k`. -/
  entry : ℕ
  /-- Stored period reference, indices `0 … p`. -/
  cycle : List TileCycleStep
  /-- Stored critical reference, indices `0 … k`. -/
  critical : List TileCriticalStep
  deriving Repr

/-- Placeholder used for out-of-range list lookups in proofs and checks. -/
def TileCycleStep.zero : TileCycleStep := ⟨⟨0, 0⟩, 0, 0, 0, 0, 0⟩

/-- Placeholder used for out-of-range list lookups in proofs and checks. -/
def TileCriticalStep.zero : TileCriticalStep := ⟨⟨0, 0⟩, 0, 0, 0⟩

/-- Integer squared norm. -/
def intNormSq (re im : ℤ) : ℤ := re * re + im * im

/-- Radius witness check `|x|² ≤ R²` at scale `S²`. -/
def tileRadiusOK (x : DyadicComplex) (R : ℕ) : Bool :=
  decide (intNormSq x.re x.im ≤ (R : ℤ) * R)

/-- Real part of `S² (y - (x² + cRef))` for grid values. -/
def tileResidualRe (S : ℕ) (cRef x y : DyadicComplex) : ℤ :=
  y.re * S - (x.re * x.re - x.im * x.im) - cRef.re * S

/-- Imaginary part of `S² (y - (x² + cRef))` for grid values. -/
def tileResidualIm (S : ℕ) (cRef x y : DyadicComplex) : ℤ :=
  y.im * S - 2 * x.re * x.im - cRef.im * S

/-- Residual witness check `|y - (x² + cRef)| ≤ ρ`, exactly at scale `S²`. -/
def tileResidualOK (S : ℕ) (cRef x y : DyadicComplex) (ρ : ℕ) : Bool :=
  decide (intNormSq (tileResidualRe S cRef x y) (tileResidualIm S cRef x y) ≤
    ((ρ * S : ℕ) : ℤ) * ((ρ * S : ℕ) : ℤ))

/-- Error-table step `2 R e + e² + (Δ + ρ) S ≤ e' S`. -/
def tileErrorStepOK (S Δ R ρ e e' : ℕ) : Bool :=
  decide (2 * R * e + e * e + (Δ + ρ) * S ≤ e' * S)

/-- Multiplier-chain step `m · 2 (R + e) ≤ m' S`. -/
def tileMultiplierStepOK (S R e m m' : ℕ) : Bool :=
  decide (m * (2 * (R + e)) ≤ m' * S)

/-- All local checks between consecutive stored period-reference steps. -/
def tileCycleStepOK (S Δ : ℕ) (cRef : DyadicComplex) (a b : TileCycleStep) : Bool :=
  tileResidualOK S cRef a.point b.point a.residual &&
    tileErrorStepOK S Δ a.radius a.residual a.seedError b.seedError &&
    tileErrorStepOK S Δ a.radius a.residual a.centerError b.centerError &&
    tileMultiplierStepOK S a.radius a.seedError a.multiplier b.multiplier

/-- All local checks between consecutive stored critical-reference steps. -/
def tileCriticalStepOK (S Δ : ℕ) (cRef : DyadicComplex) (a b : TileCriticalStep) : Bool :=
  tileResidualOK S cRef a.point b.point a.residual &&
    tileErrorStepOK S Δ a.radius a.residual a.error b.error

/-- Structurally recursive check of a predicate on consecutive list entries. -/
def chainCheck {α : Type*} (f : α → α → Bool) : α → List α → Bool
  | _, [] => true
  | a, b :: l => f a b && chainCheck f b l

/-- Center-return check `|x - z₀| S + eC S + q r ≤ r S`, in squared form. -/
def tileCenterOK (S r q eC : ℕ) (x z₀ : DyadicComplex) : Bool :=
  decide (0 ≤ ((r * S : ℕ) : ℤ) - (eC * S : ℕ) - (q * r : ℕ)) &&
    decide (intNormSq ((x.re - z₀.re) * S) ((x.im - z₀.im) * S) ≤
      (((r * S : ℕ) : ℤ) - (eC * S : ℕ) - (q * r : ℕ)) *
        (((r * S : ℕ) : ℤ) - (eC * S : ℕ) - (q * r : ℕ)))

/-- Strict divisor separation `(e + r)² < |x - z₀|²`. -/
def tileSeparationOK (r e : ℕ) (x z₀ : DyadicComplex) : Bool :=
  decide (((e + r : ℕ) : ℤ) * ((e + r : ℕ) : ℤ) < intNormSq (x.re - z₀.re) (x.im - z₀.im))

/-- Critical-entry check `|x - z₀| + e ≤ r`, in squared form. -/
def tileEntryOK (r e : ℕ) (x z₀ : DyadicComplex) : Bool :=
  decide (0 ≤ (r : ℤ) - e) &&
    decide (intNormSq (x.re - z₀.re) (x.im - z₀.im) ≤ ((r : ℤ) - e) * ((r : ℤ) - e))

/-- The generic reflected tile checker. It uses only integer arithmetic,
structural list recursion, and Boolean comparisons. -/
def checkTile (cert : TileCertificate) : Bool :=
  match cert.cycle, cert.critical with
  | a :: cycle, b :: critical =>
    decide (0 < cert.period) && cycle.length == cert.period &&
      critical.length == cert.entry &&
      (a.point.re == cert.center.re && a.point.im == cert.center.im) &&
      decide (cert.seedRadius ≤ a.seedError) &&
      decide (tileScale cert.precision ≤ a.multiplier) &&
      (a :: cycle).all (fun x => tileRadiusOK x.point x.radius) &&
      chainCheck (tileCycleStepOK (tileScale cert.precision) cert.parameterRadius
        cert.parameter) a cycle &&
      decide (cert.contraction < tileScale cert.precision) &&
      decide (((a :: cycle).getD cert.period TileCycleStep.zero).multiplier ≤
        cert.contraction) &&
      tileCenterOK (tileScale cert.precision) cert.seedRadius cert.contraction
        ((a :: cycle).getD cert.period TileCycleStep.zero).centerError
        ((a :: cycle).getD cert.period TileCycleStep.zero).point cert.center &&
      (Verifier.properDivisors cert.period).all (fun d =>
        tileSeparationOK cert.seedRadius ((a :: cycle).getD d TileCycleStep.zero).seedError
          ((a :: cycle).getD d TileCycleStep.zero).point cert.center) &&
      (b.point.re == 0 && b.point.im == 0) &&
      (b :: critical).all (fun x => tileRadiusOK x.point x.radius) &&
      chainCheck (tileCriticalStepOK (tileScale cert.precision) cert.parameterRadius
        cert.parameter) b critical &&
      tileEntryOK cert.seedRadius ((b :: critical).getD cert.entry TileCriticalStep.zero).error
        ((b :: critical).getD cert.entry TileCriticalStep.zero).point cert.center
  | _, _ => false

/-- Integer test that an axis-aligned rectangle with half-widths `a, b`
lies in the parameter disk: `a² + b² ≤ Δ²`. -/
def tileRectangleOK (cert : TileCertificate) (a b : ℕ) : Bool :=
  decide (a * a + b * b ≤ cert.parameterRadius * cert.parameterRadius)

/-! ### List bookkeeping -/

/-- A passing chain check holds between every pair of consecutive entries. -/
theorem chainCheck_getD {α : Type*} (f : α → α → Bool) (d : α) :
    ∀ (a : α) (l : List α), chainCheck f a l = true →
      ∀ j < l.length, f ((a :: l).getD j d) ((a :: l).getD (j + 1) d) = true
  | _, [], _, j, hj => absurd hj (Nat.not_lt_zero j)
  | a, b :: l, h, 0, _ => by
    simp only [chainCheck, Bool.and_eq_true] at h
    simpa using h.1
  | a, b :: l, h, j + 1, hj => by
    simp only [chainCheck, Bool.and_eq_true] at h
    have := chainCheck_getD f d b l h.2 j (by simpa using hj)
    simpa using this

/-- A passing `List.all` holds at every in-range `getD` lookup. -/
theorem all_getD {α : Type*} {P : α → Bool} {l : List α} (d : α) (h : l.all P = true)
    {j : ℕ} (hj : j < l.length) : P (l.getD j d) = true := by
  rw [List.getD_eq_getElem?_getD, List.getElem?_eq_getElem hj, Option.getD_some]
  exact List.all_eq_true.mp h _ (List.getElem_mem hj)

/-- Stored period-reference step at index `j`. -/
def TileCertificate.cycleStep (cert : TileCertificate) (j : ℕ) : TileCycleStep :=
  cert.cycle.getD j TileCycleStep.zero

/-- Stored critical-reference step at index `j`. -/
def TileCertificate.criticalStep (cert : TileCertificate) (j : ℕ) : TileCriticalStep :=
  cert.critical.getD j TileCriticalStep.zero

/-- The facts extracted from a passing check, indexed by position. -/
structure TileCheckFacts (cert : TileCertificate) : Prop where
  /-- The candidate period is positive. -/
  period_pos : 0 < cert.period
  /-- The stored period reference has indices `0 … p`. -/
  cycle_length : cert.cycle.length = cert.period + 1
  /-- The stored critical reference has indices `0 … k`. -/
  critical_length : cert.critical.length = cert.entry + 1
  /-- The period reference starts at the seed-disk center. -/
  head_point : (cert.cycleStep 0).point = cert.center
  /-- The seed error table starts at least at `r`. -/
  head_seed : cert.seedRadius ≤ (cert.cycleStep 0).seedError
  /-- The multiplier chain starts at least at `S`, i.e. decoded one. -/
  head_multiplier : tileScale cert.precision ≤ (cert.cycleStep 0).multiplier
  /-- Radius witnesses pass at every period-reference index. -/
  radius : ∀ j ≤ cert.period,
    tileRadiusOK (cert.cycleStep j).point (cert.cycleStep j).radius = true
  /-- Residual, error, and multiplier steps pass between consecutive indices. -/
  step : ∀ j < cert.period,
    tileCycleStepOK (tileScale cert.precision) cert.parameterRadius cert.parameter
      (cert.cycleStep j) (cert.cycleStep (j + 1)) = true
  /-- The contraction numerator is below the scale. -/
  contraction_lt : cert.contraction < tileScale cert.precision
  /-- The final multiplier witness is at most the contraction numerator. -/
  last_multiplier : (cert.cycleStep cert.period).multiplier ≤ cert.contraction
  /-- The center-return margin passes. -/
  center : tileCenterOK (tileScale cert.precision) cert.seedRadius cert.contraction
    (cert.cycleStep cert.period).centerError (cert.cycleStep cert.period).point
    cert.center = true
  /-- Every positive proper divisor is strictly separated. -/
  separation : ∀ d : ℕ, 0 < d → d ∣ cert.period → d < cert.period →
    tileSeparationOK cert.seedRadius (cert.cycleStep d).seedError
      (cert.cycleStep d).point cert.center = true
  /-- The critical reference starts at zero. -/
  critical_head : (cert.criticalStep 0).point = ⟨0, 0⟩
  /-- Critical radius witnesses pass at every index. -/
  critical_radius : ∀ j ≤ cert.entry,
    tileRadiusOK (cert.criticalStep j).point (cert.criticalStep j).radius = true
  /-- Critical residual and error steps pass between consecutive indices. -/
  critical_step : ∀ j < cert.entry,
    tileCriticalStepOK (tileScale cert.precision) cert.parameterRadius cert.parameter
      (cert.criticalStep j) (cert.criticalStep (j + 1)) = true
  /-- The critical-entry margin passes. -/
  entry : tileEntryOK cert.seedRadius (cert.criticalStep cert.entry).error
    (cert.criticalStep cert.entry).point cert.center = true

/-- Unpack a passing Boolean check into indexed facts. -/
theorem checkTile_facts (cert : TileCertificate) (hcheck : checkTile cert = true) :
    TileCheckFacts cert := by
  obtain ⟨precision, cRef, Δ, z₀, r, q, p, k, cycle, critical⟩ := cert
  cases cycle with
  | nil => simp [checkTile] at hcheck
  | cons a cycle =>
  cases critical with
  | nil => simp [checkTile] at hcheck
  | cons b critical =>
  simp only [checkTile, Bool.and_eq_true, decide_eq_true_eq, beq_iff_eq, and_assoc] at hcheck
  obtain ⟨hp, hlen, hclen, hre, him, hseed, hmult, hrad, hchain, hq, hlast, hcenter, hsep,
    hbre, hbim, hcrad, hcchain, hentry⟩ := hcheck
  refine
    { period_pos := hp
      cycle_length := by simp [hlen]
      critical_length := by simp [hclen]
      head_point := ?_
      head_seed := hseed
      head_multiplier := hmult
      radius := fun j hj => all_getD _ hrad (by simp only at hj ⊢; simp; omega)
      step := fun j hj => chainCheck_getD _ _ a cycle hchain j (by simp only at hj; omega)
      contraction_lt := hq
      last_multiplier := hlast
      center := hcenter
      separation := fun d hd hdvd hlt =>
        List.all_eq_true.mp hsep d (Verifier.mem_properDivisors.mpr ⟨hd, hdvd, hlt⟩)
      critical_head := ?_
      critical_radius := fun j hj => all_getD _ hcrad (by simp only at hj ⊢; simp; omega)
      critical_step := fun j hj => chainCheck_getD _ _ b critical hcchain j
        (by simp only at hj; omega)
      entry := hentry }
  · cases a with
    | mk pt _ _ _ _ _ =>
      cases pt
      simp only [TileCertificate.cycleStep, List.getD_cons_zero] at hre him ⊢
      simp [hre, him]
  · cases b with
    | mk pt _ _ _ =>
      cases pt
      simp only [TileCertificate.criticalStep, List.getD_cons_zero] at hbre hbim ⊢
      simp [hbre, hbim]

/-! ### Decoding integer checks -/

/-- An integer squared-norm bound at scale `T` bounds the complex norm. -/
theorem norm_le_of_intNormSq_le {z : ℂ} {T : ℝ} (hT : 0 < T) {re im B : ℤ}
    (hz : z = ⟨re / T, im / T⟩) (hB : 0 ≤ B) (h : intNormSq re im ≤ B * B) :
    ‖z‖ ≤ B / T := by
  have hB' : (0 : ℝ) ≤ B / T := div_nonneg (by exact_mod_cast hB) hT.le
  have hcast : ((re * re + im * im : ℤ) : ℝ) ≤ ((B * B : ℤ) : ℝ) := by
    exact_mod_cast h
  push_cast at hcast
  rw [← sq_le_sq₀ (norm_nonneg _) hB', Complex.sq_norm, hz, Complex.normSq_mk]
  have hT2 : 0 < T * T := mul_pos hT hT
  calc
    (re : ℝ) / T * (re / T) + im / T * (im / T) = (re * re + im * im) / (T * T) := by
      field_simp
    _ ≤ (B * B) / (T * T) := div_le_div_of_nonneg_right hcast hT2.le
    _ = (B / T) ^ 2 := by field_simp

/-- A strict integer squared-norm lower bound at scale `T` is a strict norm
lower bound. -/
theorem lt_norm_of_lt_intNormSq {z : ℂ} {T : ℝ} (hT : 0 < T) {re im B : ℤ}
    (hz : z = ⟨re / T, im / T⟩) (hB : 0 ≤ B) (h : B * B < intNormSq re im) :
    (B : ℝ) / T < ‖z‖ := by
  have hB' : (0 : ℝ) ≤ B / T := div_nonneg (by exact_mod_cast hB) hT.le
  have hcast : ((B * B : ℤ) : ℝ) < ((re * re + im * im : ℤ) : ℝ) := by
    exact_mod_cast h
  push_cast at hcast
  rw [← sq_lt_sq₀ hB' (norm_nonneg _), Complex.sq_norm, hz, Complex.normSq_mk]
  have hT2 : 0 < T * T := mul_pos hT hT
  calc
    ((B : ℝ) / T) ^ 2 = (B * B) / (T * T) := by field_simp
    _ < (re * re + im * im) / (T * T) := div_lt_div_of_pos_right hcast hT2
    _ = (re : ℝ) / T * (re / T) + im / T * (im / T) := by field_simp

/-- The real grid scale is positive. -/
theorem tileScale_pos (precision : ℕ) : (0 : ℝ) < (2 : ℝ) ^ precision := by positivity

/-- The natural grid scale casts to the real grid scale. -/
theorem tileScale_cast (precision : ℕ) :
    ((tileScale precision : ℕ) : ℝ) = (2 : ℝ) ^ precision := by
  simp [tileScale]

/-- Decoded naturals are nonnegative. -/
theorem dyadicNatDecode_nonneg (precision n : ℕ) : 0 ≤ dyadicNatDecode precision n :=
  div_nonneg (Nat.cast_nonneg n) (tileScale_pos precision).le

/-- A passing radius witness bounds the decoded stored value. -/
theorem norm_le_of_tileRadiusOK (precision : ℕ) {x : DyadicComplex} {R : ℕ}
    (h : tileRadiusOK x R = true) :
    ‖dyadicDecode precision x‖ ≤ dyadicNatDecode precision R := by
  simp only [tileRadiusOK, decide_eq_true_eq] at h
  have := norm_le_of_intNormSq_le (tileScale_pos precision) (re := x.re) (im := x.im)
    (B := (R : ℤ)) rfl (Int.natCast_nonneg R) h
  rw [Int.cast_natCast] at this
  exact this

/-- A passing residual witness bounds the decoded stored-step residual. -/
theorem residual_le_of_tileResidualOK (precision : ℕ) {cRef x y : DyadicComplex} {ρ : ℕ}
    (h : tileResidualOK (tileScale precision) cRef x y ρ = true) :
    ‖dyadicDecode precision y -
        quadratic (dyadicDecode precision cRef) (dyadicDecode precision x)‖ ≤
      dyadicNatDecode precision ρ := by
  simp only [tileResidualOK, decide_eq_true_eq] at h
  have hS := tileScale_pos precision
  have hz : dyadicDecode precision y -
      quadratic (dyadicDecode precision cRef) (dyadicDecode precision x) =
      ⟨(tileResidualRe (tileScale precision) cRef x y : ℝ) / ((2 : ℝ) ^ precision) ^ 2,
        (tileResidualIm (tileScale precision) cRef x y : ℝ) / ((2 : ℝ) ^ precision) ^ 2⟩ := by
    apply Complex.ext <;>
      simp [dyadicDecode, quadratic, sq, tileResidualRe, tileResidualIm, tileScale] <;>
      field_simp <;> ring
  have := norm_le_of_intNormSq_le (by positivity) hz (Int.natCast_nonneg _) h
  refine this.trans (le_of_eq ?_)
  push_cast [tileScale]
  rw [dyadicNatDecode]
  field_simp

/-- A passing error-table step bounds one decoded error recurrence step. -/
theorem errorStep_le_of_tileErrorStepOK (precision : ℕ) {Δ R ρ e e' : ℕ}
    (h : tileErrorStepOK (tileScale precision) Δ R ρ e e' = true) :
    2 * dyadicNatDecode precision R * dyadicNatDecode precision e +
        dyadicNatDecode precision e ^ 2 +
        (dyadicNatDecode precision Δ + dyadicNatDecode precision ρ) ≤
      dyadicNatDecode precision e' := by
  simp only [tileErrorStepOK, decide_eq_true_eq] at h
  have hS := tileScale_pos precision
  have hcast : ((2 * R * e + e * e + (Δ + ρ) * tileScale precision : ℕ) : ℝ) ≤
      ((e' * tileScale precision : ℕ) : ℝ) := by exact_mod_cast h
  push_cast [tileScale] at hcast
  simp only [dyadicNatDecode]
  rw [← sub_nonneg]
  have hS2 : 0 < ((2 : ℝ) ^ precision) ^ 2 := by positivity
  have key : (e' : ℝ) / 2 ^ precision - (2 * (R / 2 ^ precision) * (e / 2 ^ precision) +
      (e / 2 ^ precision) ^ 2 + (Δ / 2 ^ precision + ρ / 2 ^ precision)) =
      (e' * 2 ^ precision - (2 * R * e + e * e + (Δ + ρ) * 2 ^ precision)) /
        ((2 : ℝ) ^ precision) ^ 2 := by
    field_simp
  rw [key]
  exact div_nonneg (by linarith) hS2.le

/-- A passing multiplier-chain step bounds one decoded product step. -/
theorem multiplierStep_le_of_tileMultiplierStepOK (precision : ℕ) {R e m m' : ℕ}
    (h : tileMultiplierStepOK (tileScale precision) R e m m' = true) :
    dyadicNatDecode precision m *
        (2 * (dyadicNatDecode precision R + dyadicNatDecode precision e)) ≤
      dyadicNatDecode precision m' := by
  simp only [tileMultiplierStepOK, decide_eq_true_eq] at h
  have hS := tileScale_pos precision
  have hcast : ((m * (2 * (R + e)) : ℕ) : ℝ) ≤ ((m' * tileScale precision : ℕ) : ℝ) := by
    exact_mod_cast h
  push_cast [tileScale] at hcast
  simp only [dyadicNatDecode]
  rw [← sub_nonneg]
  have hS2 : 0 < ((2 : ℝ) ^ precision) ^ 2 := by positivity
  have key : (m' : ℝ) / 2 ^ precision -
      m / 2 ^ precision * (2 * (R / 2 ^ precision + e / 2 ^ precision)) =
      (m' * 2 ^ precision - m * (2 * (R + e))) / ((2 : ℝ) ^ precision) ^ 2 := by
    field_simp
  rw [key]
  exact div_nonneg (by linarith) hS2.le

/-- A passing center check gives the decoded center-return margin. -/
theorem center_le_of_tileCenterOK (precision : ℕ) {r q eC : ℕ} {x z₀ : DyadicComplex}
    (h : tileCenterOK (tileScale precision) r q eC x z₀ = true) :
    ‖dyadicDecode precision x - dyadicDecode precision z₀‖ + dyadicNatDecode precision eC +
        dyadicNatDecode precision q * dyadicNatDecode precision r ≤
      dyadicNatDecode precision r := by
  simp only [tileCenterOK, Bool.and_eq_true, decide_eq_true_eq] at h
  obtain ⟨hA, hsq⟩ := h
  have hS := tileScale_pos precision
  have hz : dyadicDecode precision x - dyadicDecode precision z₀ =
      ⟨(((x.re - z₀.re) * (tileScale precision : ℕ) : ℤ) : ℝ) / ((2 : ℝ) ^ precision) ^ 2,
        (((x.im - z₀.im) * (tileScale precision : ℕ) : ℤ) : ℝ) /
          ((2 : ℝ) ^ precision) ^ 2⟩ := by
    apply Complex.ext <;> simp [dyadicDecode, tileScale] <;> field_simp
  have hnorm := norm_le_of_intNormSq_le (by positivity) hz hA hsq
  push_cast [tileScale] at hnorm
  simp only [dyadicNatDecode]
  have key : ((r : ℝ) * 2 ^ precision - eC * 2 ^ precision - q * r) /
      ((2 : ℝ) ^ precision) ^ 2 + eC / 2 ^ precision + q / 2 ^ precision * (r / 2 ^ precision) =
      r / 2 ^ precision := by
    field_simp
    ring
  linarith

/-- A passing separation check gives the decoded strict divisor margin. -/
theorem separation_of_tileSeparationOK (precision : ℕ) {r e : ℕ} {x z₀ : DyadicComplex}
    (h : tileSeparationOK r e x z₀ = true) :
    dyadicNatDecode precision e + dyadicNatDecode precision r <
      ‖dyadicDecode precision x - dyadicDecode precision z₀‖ := by
  simp only [tileSeparationOK, decide_eq_true_eq] at h
  have hz : dyadicDecode precision x - dyadicDecode precision z₀ =
      ⟨((x.re - z₀.re : ℤ) : ℝ) / (2 : ℝ) ^ precision,
        ((x.im - z₀.im : ℤ) : ℝ) / (2 : ℝ) ^ precision⟩ := by
    apply Complex.ext <;> simp [dyadicDecode, sub_div]
  have := lt_norm_of_lt_intNormSq (tileScale_pos precision) hz (Int.natCast_nonneg _) h
  push_cast at this
  simp only [dyadicNatDecode]
  rw [← add_div]
  exact this

/-- A passing entry check gives the decoded critical-entry margin. -/
theorem entry_le_of_tileEntryOK (precision : ℕ) {r e : ℕ} {x z₀ : DyadicComplex}
    (h : tileEntryOK r e x z₀ = true) :
    ‖dyadicDecode precision x - dyadicDecode precision z₀‖ + dyadicNatDecode precision e ≤
      dyadicNatDecode precision r := by
  simp only [tileEntryOK, Bool.and_eq_true, decide_eq_true_eq] at h
  obtain ⟨hB, hsq⟩ := h
  have hz : dyadicDecode precision x - dyadicDecode precision z₀ =
      ⟨((x.re - z₀.re : ℤ) : ℝ) / (2 : ℝ) ^ precision,
        ((x.im - z₀.im : ℤ) : ℝ) / (2 : ℝ) ^ precision⟩ := by
    apply Complex.ext <;> simp [dyadicDecode, sub_div]
  have := norm_le_of_intNormSq_le (tileScale_pos precision) hz hB hsq
  push_cast at this
  simp only [dyadicNatDecode]
  rw [sub_div] at this
  linarith

/-! ### Witness tables dominate the real recurrences -/

/-- A real table satisfying the stored error recurrence with `≥` dominates
`storedOrbitError` on the checked prefix. -/
theorem storedOrbitError_le_of_table (ε Δ : ℝ) (radius residual table : ℕ → ℝ) (n : ℕ)
    (hε : 0 ≤ ε) (hΔ : 0 ≤ Δ) (hr : ∀ j < n, 0 ≤ radius j) (hρ : ∀ j < n, 0 ≤ residual j)
    (h0 : ε ≤ table 0)
    (hstep : ∀ j < n, 2 * radius j * table j + table j ^ 2 + (Δ + residual j) ≤ table (j + 1)) :
    storedOrbitError ε Δ radius residual n ≤ table n := by
  induction n with
  | zero => simpa only [storedOrbitError_zero] using h0
  | succ n ih =>
    have hb := ih (fun j hj => hr j (Nat.lt_succ_of_lt hj))
      (fun j hj => hρ j (Nat.lt_succ_of_lt hj))
      (fun j hj => hstep j (Nat.lt_succ_of_lt hj))
    have hE := storedOrbitError_nonneg ε Δ radius residual n hε hΔ
      (fun j hj => hr j (Nat.lt_succ_of_lt hj)) (fun j hj => hρ j (Nat.lt_succ_of_lt hj))
    have hrn := hr n (Nat.lt_succ_self n)
    rw [storedOrbitError_succ]
    refine le_trans ?_ (hstep n (Nat.lt_succ_self n))
    have hlin := mul_le_mul_of_nonneg_left hb (mul_nonneg zero_le_two hrn)
    have hsq : storedOrbitError ε Δ radius residual n ^ 2 ≤ table n ^ 2 :=
      pow_le_pow_left₀ hE hb 2
    linarith

/-- A real product table with `table₀ ≥ 1` and per-step factor bounds
dominates `multiplierBound`. -/
theorem multiplierBound_le_of_table (radius factor table : ℕ → ℝ) (n : ℕ)
    (hr : ∀ j < n, 0 ≤ radius j) (hfactor : ∀ j < n, radius j ≤ factor j)
    (h0 : 1 ≤ table 0) (hstep : ∀ j < n, table j * (2 * factor j) ≤ table (j + 1)) :
    multiplierBound radius n ≤ table n := by
  induction n with
  | zero => simpa only [multiplierBound_zero] using h0
  | succ n ih =>
    have hb := ih (fun j hj => hr j (Nat.lt_succ_of_lt hj))
      (fun j hj => hfactor j (Nat.lt_succ_of_lt hj))
      (fun j hj => hstep j (Nat.lt_succ_of_lt hj))
    have hM := multiplierBound_nonneg radius n (fun j hj => hr j (Nat.lt_succ_of_lt hj))
    have hrn := hr n (Nat.lt_succ_self n)
    rw [multiplierBound_succ]
    calc
      multiplierBound radius n * (2 * radius n) ≤ table n * (2 * radius n) :=
        mul_le_mul_of_nonneg_right hb (mul_nonneg zero_le_two hrn)
      _ ≤ table n * (2 * factor n) :=
        mul_le_mul_of_nonneg_left (by linarith [hfactor n (Nat.lt_succ_self n)])
          (hM.trans hb)
      _ ≤ table (n + 1) := hstep n (Nat.lt_succ_self n)

/-! ### Decoded certificate sequences -/

/-- Decoded stored period reference `ref_j`. -/
noncomputable def TileCertificate.reference (cert : TileCertificate) (j : ℕ) : ℂ :=
  dyadicDecode cert.precision (cert.cycleStep j).point

/-- Decoded radius witnesses of the stored period reference. -/
noncomputable def TileCertificate.radiusBound (cert : TileCertificate) (j : ℕ) : ℝ :=
  dyadicNatDecode cert.precision (cert.cycleStep j).radius

/-- Decoded residual witnesses of the stored period reference. -/
noncomputable def TileCertificate.residualBound (cert : TileCertificate) (j : ℕ) : ℝ :=
  dyadicNatDecode cert.precision (cert.cycleStep j).residual

/-- Decoded stored critical reference. -/
noncomputable def TileCertificate.criticalReference (cert : TileCertificate) (j : ℕ) : ℂ :=
  dyadicDecode cert.precision (cert.criticalStep j).point

/-- Decoded radius witnesses of the stored critical reference. -/
noncomputable def TileCertificate.criticalRadiusBound (cert : TileCertificate) (j : ℕ) : ℝ :=
  dyadicNatDecode cert.precision (cert.criticalStep j).radius

/-- Decoded residual witnesses of the stored critical reference. -/
noncomputable def TileCertificate.criticalResidualBound (cert : TileCertificate) (j : ℕ) :
    ℝ :=
  dyadicNatDecode cert.precision (cert.criticalStep j).residual

section Facts

variable {cert : TileCertificate} (F : TileCheckFacts cert)
include F

/-- Every checked radius witness bounds its decoded stored value. -/
theorem TileCheckFacts.reference_norm_le :
    ∀ j ≤ cert.period, ‖cert.reference j‖ ≤ cert.radiusBound j :=
  fun j hj => norm_le_of_tileRadiusOK cert.precision (F.radius j hj)

/-- Every checked residual witness bounds its decoded stored step. -/
theorem TileCheckFacts.reference_residual_le :
    ∀ j < cert.period, ‖cert.reference (j + 1) -
      quadratic (dyadicDecode cert.precision cert.parameter) (cert.reference j)‖ ≤
        cert.residualBound j := by
  intro j hj
  have h := F.step j hj
  simp only [tileCycleStepOK, Bool.and_eq_true] at h
  exact residual_le_of_tileResidualOK cert.precision h.1.1.1

/-- The checked seed table dominates the seed-disk stored error. -/
theorem TileCheckFacts.seedError_le :
    ∀ n ≤ cert.period, storedOrbitError (dyadicNatDecode cert.precision cert.seedRadius + 0)
      (dyadicNatDecode cert.precision cert.parameterRadius) cert.radiusBound
        cert.residualBound n ≤ dyadicNatDecode cert.precision (cert.cycleStep n).seedError := by
  intro n hn
  apply storedOrbitError_le_of_table _ _ cert.radiusBound cert.residualBound
    (fun j => dyadicNatDecode cert.precision (cert.cycleStep j).seedError) n
    (by rw [add_zero]; exact dyadicNatDecode_nonneg _ _) (dyadicNatDecode_nonneg _ _)
    (fun _ _ => dyadicNatDecode_nonneg _ _) (fun _ _ => dyadicNatDecode_nonneg _ _)
  · rw [add_zero]
    exact div_le_div_of_nonneg_right (by exact_mod_cast F.head_seed)
      (tileScale_pos cert.precision).le
  · intro j hj
    have h := F.step j (by omega)
    simp only [tileCycleStepOK, Bool.and_eq_true] at h
    exact errorStep_le_of_tileErrorStepOK cert.precision h.1.1.2

/-- The checked center table dominates the zero-initial stored error. -/
theorem TileCheckFacts.centerError_le :
    ∀ n ≤ cert.period, storedOrbitError 0
      (dyadicNatDecode cert.precision cert.parameterRadius) cert.radiusBound
        cert.residualBound n ≤ dyadicNatDecode cert.precision (cert.cycleStep n).centerError := by
  intro n hn
  apply storedOrbitError_le_of_table 0 _ cert.radiusBound cert.residualBound
    (fun j => dyadicNatDecode cert.precision (cert.cycleStep j).centerError) n le_rfl
    (dyadicNatDecode_nonneg _ _) (fun _ _ => dyadicNatDecode_nonneg _ _)
    (fun _ _ => dyadicNatDecode_nonneg _ _) (dyadicNatDecode_nonneg _ _)
  intro j hj
  have h := F.step j (by omega)
  simp only [tileCycleStepOK, Bool.and_eq_true] at h
  exact errorStep_le_of_tileErrorStepOK cert.precision h.1.2

/-- The checked multiplier chain dominates `multiplierBound` of the
stored-reference seed-disk radii. -/
theorem TileCheckFacts.multiplierBound_le :
    multiplierBound (storedOrbitRadius (dyadicNatDecode cert.precision cert.seedRadius + 0)
      (dyadicNatDecode cert.precision cert.parameterRadius) cert.radiusBound
        cert.residualBound) cert.period ≤
      dyadicNatDecode cert.precision (cert.cycleStep cert.period).multiplier := by
  apply multiplierBound_le_of_table _ (fun j => dyadicNatDecode cert.precision
    (cert.cycleStep j).radius + dyadicNatDecode cert.precision (cert.cycleStep j).seedError)
    (fun j => dyadicNatDecode cert.precision (cert.cycleStep j).multiplier)
  · intro j hj
    exact storedOrbitRadius_nonneg _ _ _ _ j
      (by rw [add_zero]; exact dyadicNatDecode_nonneg _ _) (dyadicNatDecode_nonneg _ _)
      (fun _ _ => dyadicNatDecode_nonneg _ _) (fun _ _ => dyadicNatDecode_nonneg _ _)
  · intro j hj
    exact add_le_add le_rfl (F.seedError_le j hj.le)
  · rw [dyadicNatDecode, le_div_iff₀ (tileScale_pos _), one_mul, ← tileScale_cast]
    exact_mod_cast F.head_multiplier
  · intro j hj
    have h := F.step j hj
    simp only [tileCycleStepOK, Bool.and_eq_true] at h
    exact multiplierStep_le_of_tileMultiplierStepOK cert.precision h.2

/-- Every checked critical radius witness bounds its decoded stored value. -/
theorem TileCheckFacts.criticalReference_norm_le :
    ∀ j ≤ cert.entry, ‖cert.criticalReference j‖ ≤ cert.criticalRadiusBound j :=
  fun j hj => norm_le_of_tileRadiusOK cert.precision (F.critical_radius j hj)

/-- Every checked critical residual witness bounds its decoded stored step. -/
theorem TileCheckFacts.criticalReference_residual_le :
    ∀ j < cert.entry, ‖cert.criticalReference (j + 1) -
      quadratic (dyadicDecode cert.precision cert.parameter) (cert.criticalReference j)‖ ≤
        cert.criticalResidualBound j := by
  intro j hj
  have h := F.critical_step j hj
  simp only [tileCriticalStepOK, Bool.and_eq_true] at h
  exact residual_le_of_tileResidualOK cert.precision h.1

/-- The checked critical table dominates the zero-initial critical error. -/
theorem TileCheckFacts.criticalError_le :
    ∀ n ≤ cert.entry, storedOrbitError 0
      (dyadicNatDecode cert.precision cert.parameterRadius) cert.criticalRadiusBound
        cert.criticalResidualBound n ≤
          dyadicNatDecode cert.precision (cert.criticalStep n).error := by
  intro n hn
  apply storedOrbitError_le_of_table 0 _ cert.criticalRadiusBound cert.criticalResidualBound
    (fun j => dyadicNatDecode cert.precision (cert.criticalStep j).error) n le_rfl
    (dyadicNatDecode_nonneg _ _) (fun _ _ => dyadicNatDecode_nonneg _ _)
    (fun _ _ => dyadicNatDecode_nonneg _ _) (dyadicNatDecode_nonneg _ _)
  intro j hj
  have h := F.critical_step j (by omega)
  simp only [tileCriticalStepOK, Bool.and_eq_true] at h
  exact errorStep_le_of_tileErrorStepOK cert.precision h.2

/-- The decoded contraction numerator is strictly below one. -/
theorem TileCheckFacts.contraction_lt_one :
    dyadicNatDecode cert.precision cert.contraction < 1 := by
  rw [dyadicNatDecode, div_lt_one (tileScale_pos _), ← tileScale_cast]
  exact_mod_cast F.contraction_lt

end Facts

/-- A passing certificate has decoded contraction strictly below one. -/
theorem checkTile_contraction_lt_one (cert : TileCertificate) (hcheck : checkTile cert = true) :
    dyadicNatDecode cert.precision cert.contraction < 1 :=
  (checkTile_facts cert hcheck).contraction_lt_one

/-- The stored period reference starts exactly at the seed-disk center. -/
theorem TileCheckFacts.center_sub_reference_zero {cert : TileCertificate}
    (F : TileCheckFacts cert) :
    ‖dyadicDecode cert.precision cert.center - cert.reference 0‖ ≤ 0 := by
  simp [TileCertificate.reference, F.head_point]

/-- A passing certificate bounds every iterate of every seed-disk point by the
stored reference and the checked seed-error table (initial error `r`). -/
theorem checkTile_orbit_sub_reference_le (cert : TileCertificate)
    (hcheck : checkTile cert = true) (c : ℂ)
    (hc : ‖c - dyadicDecode cert.precision cert.parameter‖ ≤
      dyadicNatDecode cert.precision cert.parameterRadius)
    (z : ℂ) (hz : z ∈ closedBall (dyadicDecode cert.precision cert.center)
      (dyadicNatDecode cert.precision cert.seedRadius))
    (j : ℕ) (hj : j ≤ cert.period) :
    ‖orbit c j z - cert.reference j‖ ≤
      dyadicNatDecode cert.precision (cert.cycleStep j).seedError := by
  have F := checkTile_facts cert hcheck
  have hε := seed_sub_storedReference_zero_le _ z cert.reference _ 0
    (by simpa only [mem_closedBall, dist_eq_norm] using hz) F.center_sub_reference_zero
  exact (orbit_sub_storedReference_le_budget _ c z cert.reference _ _ cert.radiusBound
    cert.residualBound j hε hc (fun i hi => F.reference_norm_le i (by omega))
    (fun i hi => F.reference_residual_le i (by omega))).trans (F.seedError_le j hj)

/-- A passing certificate bounds the formal `p`-step multiplier by the decoded
`q` at every point of the seed disk and every parameter of the disk. -/
theorem checkTile_multiplier_le (cert : TileCertificate) (hcheck : checkTile cert = true)
    (c : ℂ) (hc : ‖c - dyadicDecode cert.precision cert.parameter‖ ≤
      dyadicNatDecode cert.precision cert.parameterRadius) :
    ∀ z ∈ closedBall (dyadicDecode cert.precision cert.center)
        (dyadicNatDecode cert.precision cert.seedRadius),
      ‖(derivative (seedPolynomial c cert.period)).eval z‖ ≤
        dyadicNatDecode cert.precision cert.contraction := by
  have F := checkTile_facts cert hcheck
  intro z hz
  have hqm : dyadicNatDecode cert.precision (cert.cycleStep cert.period).multiplier ≤
      dyadicNatDecode cert.precision cert.contraction :=
    div_le_div_of_nonneg_right (by exact_mod_cast F.last_multiplier) (tileScale_pos _).le
  exact (seedDerivative_norm_le_stored_bound _ c _ z cert.reference _ 0 _
    cert.radiusBound cert.residualBound cert.period
    (by simpa only [mem_closedBall, dist_eq_norm] using hz) F.center_sub_reference_zero hc
    F.reference_norm_le F.reference_residual_le).trans (F.multiplierBound_le.trans hqm)

/-- A passing certificate gives the center-return margin with the decoded `q`. -/
theorem checkTile_center_return_le (cert : TileCertificate) (hcheck : checkTile cert = true)
    (c : ℂ) (hc : ‖c - dyadicDecode cert.precision cert.parameter‖ ≤
      dyadicNatDecode cert.precision cert.parameterRadius) :
    ‖orbit c cert.period (dyadicDecode cert.precision cert.center) -
        dyadicDecode cert.precision cert.center‖ +
      dyadicNatDecode cert.precision cert.contraction *
        dyadicNatDecode cert.precision cert.seedRadius ≤
      dyadicNatDecode cert.precision cert.seedRadius := by
  have F := checkTile_facts cert hcheck
  have hret := center_return_norm_le_stored_bound _ c _ cert.reference 0 _
    cert.radiusBound cert.residualBound cert.period F.center_sub_reference_zero hc
    (fun j hj => F.reference_norm_le j hj.le) F.reference_residual_le
  have herr := F.centerError_le cert.period le_rfl
  have hmargin := center_le_of_tileCenterOK cert.precision F.center
  simp only [storedCenterReturnBound] at hret
  change ‖cert.reference cert.period - _‖ + _ + _ ≤ _ at hmargin
  linarith

/-- **Soundness of the reflected tile checker.** If `checkTile cert = true`, then
for every complex parameter `c` in the closed decoded parameter disk there is a
point `ζ` of the decoded seed disk such that: `ζ` is fixed by the `p`-step
return; *every* fixed point of the `p`-step return in the seed disk equals `ζ`;
`ζ` has exact minimal period `p`; its formal return multiplier is at most the
decoded `q < 1`; and the critical orbit returns to the disk at iterates
`k + m·p` and contracts to `ζ` at rate `q^m`. The point with these properties
is unique. All uniqueness is within the seed disk only. -/
theorem checkTile_sound (cert : TileCertificate) (hcheck : checkTile cert = true) (c : ℂ)
    (hc : ‖c - dyadicDecode cert.precision cert.parameter‖ ≤
      dyadicNatDecode cert.precision cert.parameterRadius) :
    ∃! ζ : ℂ, ζ ∈ closedBall (dyadicDecode cert.precision cert.center)
        (dyadicNatDecode cert.precision cert.seedRadius) ∧
      orbit c cert.period ζ = ζ ∧
      (∀ y ∈ closedBall (dyadicDecode cert.precision cert.center)
          (dyadicNatDecode cert.precision cert.seedRadius),
        orbit c cert.period y = y → y = ζ) ∧
      minimalPeriod (quadratic c) ζ = cert.period ∧
      ‖(derivative (seedPolynomial c cert.period)).eval ζ‖ ≤
        dyadicNatDecode cert.precision cert.contraction ∧
      ∀ m : ℕ, orbit c (cert.entry + m * cert.period) 0 ∈
          closedBall (dyadicDecode cert.precision cert.center)
            (dyadicNatDecode cert.precision cert.seedRadius) ∧
        dist (orbit c (cert.entry + m * cert.period) 0) ζ ≤
          dyadicNatDecode cert.precision cert.contraction ^ m *
            dist (orbit c cert.entry 0) ζ := by
  have F := checkTile_facts cert hcheck
  set z₀ := dyadicDecode cert.precision cert.center with hz₀
  set cRef := dyadicDecode cert.precision cert.parameter with hcRef
  set r := dyadicNatDecode cert.precision cert.seedRadius with hr
  set q := dyadicNatDecode cert.precision cert.contraction with hq
  set Δ := dyadicNatDecode cert.precision cert.parameterRadius with hΔ
  have hr0 : 0 ≤ r := dyadicNatDecode_nonneg _ _
  have hq0 : 0 ≤ q := dyadicNatDecode_nonneg _ _
  have hinit := F.center_sub_reference_zero
  have hcritInit : ‖cert.criticalReference 0‖ ≤ 0 := by
    simp [TileCertificate.criticalReference, F.critical_head, dyadicDecode, Complex.ext_iff]
  have hmult := checkTile_multiplier_le cert hcheck c hc
  have hcenter := checkTile_center_return_le cert hcheck c hc
  have hentry : orbit c cert.entry 0 ∈ closedBall z₀ r := by
    apply critical_entry_of_storedReference cRef c z₀ cert.criticalReference 0 Δ r
      cert.criticalRadiusBound cert.criticalResidualBound cert.entry hcritInit hc
      (fun j hj => F.criticalReference_norm_le j hj.le) F.criticalReference_residual_le
    have herr := F.criticalError_le cert.entry le_rfl
    have hmargin := entry_le_of_tileEntryOK cert.precision F.entry
    change ‖cert.criticalReference cert.entry - z₀‖ + _ ≤ r at hmargin
    linarith
  have hsep : ∀ d : ℕ, 0 < d → d ∣ cert.period → d < cert.period →
      storedOrbitError (r + 0) Δ cert.radiusBound cert.residualBound d + r <
        ‖cert.reference d - z₀‖ := by
    intro d hd hdvd hlt
    have herr := F.seedError_le d hlt.le
    have hmargin := separation_of_tileSeparationOK cert.precision
      (F.separation d hd hdvd hlt)
    change _ + r < ‖cert.reference d - z₀‖ at hmargin
    linarith
  obtain ⟨ζ, hζ, honly⟩ := existsUnique_critical_return_of_entry c cert.entry cert.period
    z₀ r q hr0 hq0 F.contraction_lt_one hmult hcenter hentry
  obtain ⟨ξ, -, hξonly⟩ := existsUnique_fixedPoint_orbit_of_multiplier_le c cert.period z₀ r q
    hr0 hq0 F.contraction_lt_one hmult hcenter
  have hstrong : ∀ y ∈ closedBall z₀ r, orbit c cert.period y = y → y = ζ := by
    intro y hy hfix
    rw [hξonly y ⟨hy, hfix, hmult y hy⟩, hξonly ζ ⟨hζ.1, hζ.2.1, hmult ζ hζ.1⟩]
  have hperiod := minimalPeriod_eq_of_stored_separation cRef c z₀ ζ cert.reference r 0 Δ
    cert.radiusBound cert.residualBound cert.period F.period_pos
    (by simpa only [mem_closedBall, dist_eq_norm] using hζ.1) hinit hc
    (fun j hj => F.reference_norm_le j hj.le) F.reference_residual_le hζ.2.1 hsep
  refine ExistsUnique.intro ζ ⟨hζ.1, hζ.2.1, hstrong, hperiod, hζ.2.2.1, hζ.2.2.2⟩ ?_
  intro y hy
  exact hstrong y hy.1 hy.2.1

/-- Rectangle corollary: if `a² + b² ≤ Δ²` (an integer check) then every
parameter whose coordinate offsets from `cRef` are at most `a/S` and `b/S`
satisfies the conclusion of `checkTile_sound`. -/
theorem checkTile_sound_rectangle (cert : TileCertificate) (hcheck : checkTile cert = true)
    (a b : ℕ) (hrect : tileRectangleOK cert a b = true) (c : ℂ)
    (hre : |c.re - (dyadicDecode cert.precision cert.parameter).re| ≤
      dyadicNatDecode cert.precision a)
    (him : |c.im - (dyadicDecode cert.precision cert.parameter).im| ≤
      dyadicNatDecode cert.precision b) :
    ∃! ζ : ℂ, ζ ∈ closedBall (dyadicDecode cert.precision cert.center)
        (dyadicNatDecode cert.precision cert.seedRadius) ∧
      orbit c cert.period ζ = ζ ∧
      (∀ y ∈ closedBall (dyadicDecode cert.precision cert.center)
          (dyadicNatDecode cert.precision cert.seedRadius),
        orbit c cert.period y = y → y = ζ) ∧
      minimalPeriod (quadratic c) ζ = cert.period ∧
      ‖(derivative (seedPolynomial c cert.period)).eval ζ‖ ≤
        dyadicNatDecode cert.precision cert.contraction ∧
      ∀ m : ℕ, orbit c (cert.entry + m * cert.period) 0 ∈
          closedBall (dyadicDecode cert.precision cert.center)
            (dyadicNatDecode cert.precision cert.seedRadius) ∧
        dist (orbit c (cert.entry + m * cert.period) 0) ζ ≤
          dyadicNatDecode cert.precision cert.contraction ^ m *
            dist (orbit c cert.entry 0) ζ := by
  apply checkTile_sound cert hcheck c
  simp only [tileRectangleOK, decide_eq_true_eq] at hrect
  have hcast : ((a * a + b * b : ℕ) : ℝ) ≤
      ((cert.parameterRadius * cert.parameterRadius : ℕ) : ℝ) := by exact_mod_cast hrect
  push_cast at hcast
  have hS := tileScale_pos cert.precision
  have hD := dyadicNatDecode_nonneg cert.precision cert.parameterRadius
  rw [← sq_le_sq₀ (norm_nonneg _) hD, Complex.sq_norm, Complex.normSq_apply]
  have hre2 := sq_le_sq' (abs_le.mp hre).1 (abs_le.mp hre).2
  have him2 := sq_le_sq' (abs_le.mp him).1 (abs_le.mp him).2
  have hsum : dyadicNatDecode cert.precision a ^ 2 + dyadicNatDecode cert.precision b ^ 2 ≤
      dyadicNatDecode cert.precision cert.parameterRadius ^ 2 := by
    simp only [dyadicNatDecode, div_pow]
    rw [← add_div]
    exact div_le_div_of_nonneg_right (by nlinarith) (by positivity)
  simp only [Complex.sub_re, Complex.sub_im] at hre2 him2 ⊢
  nlinarith

/-! ### Certified lower bound on the return multiplier (optional) -/

/-- Optional lower-bound witnesses at one period-reference index. -/
structure TileLowerStep where
  /-- Lower radius witness `ℓ_j`, with `ℓ_j² ≤ |ref_j|²` at scale `S²`. -/
  lowerRadius : ℕ
  /-- Lower multiplier-product witness `n_j` (initial value at most `S`). -/
  lowerMultiplier : ℕ
  deriving Repr

/-- Placeholder for out-of-range lookups of lower-bound witnesses. -/
def TileLowerStep.zero : TileLowerStep := ⟨0, 0⟩

/-- Lower radius witness check `ℓ² ≤ |x|²` at scale `S²`. -/
def tileLowerRadiusOK (x : DyadicComplex) (ℓ : ℕ) : Bool :=
  decide ((ℓ : ℤ) * ℓ ≤ intNormSq x.re x.im)

/-- Lower chain step `n' S ≤ n · 2 · max(ℓ - e, 0)`, with truncated natural
subtraction providing the `max`. -/
def tileLowerStepOK (S ℓ e n n' : ℕ) : Bool :=
  decide (n' * S ≤ n * (2 * (ℓ - e)))

/-- Separate checker for a certified lower multiplier bound `lowerBound / S`. The
per-iterate errors are those of the seed-disk table (initial error `r`) in
`cert`; `cert` itself must also pass `checkTile`. -/
def checkTileMultiplierLower (cert : TileCertificate) (lowerBound : ℕ)
    (lower : List TileLowerStep) : Bool :=
  decide ((lower.getD 0 TileLowerStep.zero).lowerMultiplier ≤ tileScale cert.precision) &&
    (List.range cert.period).all (fun j =>
      tileLowerRadiusOK (cert.cycle.getD j TileCycleStep.zero).point
          (lower.getD j TileLowerStep.zero).lowerRadius &&
        tileLowerStepOK (tileScale cert.precision) (lower.getD j TileLowerStep.zero).lowerRadius
          (cert.cycle.getD j TileCycleStep.zero).seedError
          (lower.getD j TileLowerStep.zero).lowerMultiplier
          (lower.getD (j + 1) TileLowerStep.zero).lowerMultiplier) &&
    decide (lowerBound ≤ (lower.getD cert.period TileLowerStep.zero).lowerMultiplier)

/-- An integer squared-norm lower bound at scale `T` is a norm lower bound. -/
theorem le_norm_of_le_intNormSq {z : ℂ} {T : ℝ} (hT : 0 < T) {re im B : ℤ}
    (hz : z = ⟨re / T, im / T⟩) (hB : 0 ≤ B) (h : B * B ≤ intNormSq re im) :
    (B : ℝ) / T ≤ ‖z‖ := by
  have hB' : (0 : ℝ) ≤ B / T := div_nonneg (by exact_mod_cast hB) hT.le
  have hcast : ((B * B : ℤ) : ℝ) ≤ ((re * re + im * im : ℤ) : ℝ) := by
    exact_mod_cast h
  push_cast at hcast
  rw [← sq_le_sq₀ hB' (norm_nonneg _), Complex.sq_norm, hz, Complex.normSq_mk]
  have hT2 : 0 < T * T := mul_pos hT hT
  calc
    ((B : ℝ) / T) ^ 2 = (B * B) / (T * T) := by field_simp
    _ ≤ (re * re + im * im) / (T * T) := div_le_div_of_nonneg_right hcast hT2.le
    _ = (re : ℝ) / T * (re / T) + im / T * (im / T) := by field_simp

/-- Lower factor bounds on each iterate bound the formal seed derivative from
below through any table with `T₀ ≤ 1` and `T_{j+1} ≤ T_j · 2 f_j`. -/
theorem table_le_seedDerivative_norm (c z : ℂ) (factor table : ℕ → ℝ) (n : ℕ)
    (hf0 : ∀ j < n, 0 ≤ factor j) (hf : ∀ j < n, factor j ≤ ‖orbit c j z‖)
    (h0 : table 0 ≤ 1) (hstep : ∀ j < n, table (j + 1) ≤ table j * (2 * factor j)) :
    table n ≤ ‖(derivative (seedPolynomial c n)).eval z‖ := by
  induction n with
  | zero => simpa only [seedPolynomial_derivative_zero, norm_one] using h0
  | succ n ih =>
    have hb := ih (fun j hj => hf0 j (Nat.lt_succ_of_lt hj))
      (fun j hj => hf j (Nat.lt_succ_of_lt hj)) (fun j hj => hstep j (Nat.lt_succ_of_lt hj))
    have hfn := hf n (Nat.lt_succ_self n)
    have hf0n := hf0 n (Nat.lt_succ_self n)
    rw [seedPolynomial_derivative_succ, Complex.norm_mul, Complex.norm_mul, Complex.norm_two]
    calc
      table (n + 1) ≤ table n * (2 * factor n) := hstep n (Nat.lt_succ_self n)
      _ ≤ ‖(derivative (seedPolynomial c n)).eval z‖ * (2 * factor n) :=
        mul_le_mul_of_nonneg_right hb (by linarith)
      _ ≤ ‖(derivative (seedPolynomial c n)).eval z‖ * (2 * ‖orbit c n z‖) :=
        mul_le_mul_of_nonneg_left (by linarith) (norm_nonneg _)
      _ = 2 * ‖orbit c n z‖ * ‖(derivative (seedPolynomial c n)).eval z‖ := by ring

/-- A passing lower chain step bounds one decoded lower product step. -/
theorem lowerStep_le_of_tileLowerStepOK (precision : ℕ) {ℓ e n n' : ℕ}
    (h : tileLowerStepOK (tileScale precision) ℓ e n n' = true) :
    dyadicNatDecode precision n' ≤
      dyadicNatDecode precision n * (2 * dyadicNatDecode precision (ℓ - e)) := by
  simp only [tileLowerStepOK, decide_eq_true_eq] at h
  have hS := tileScale_pos precision
  have hcast : ((n' * tileScale precision : ℕ) : ℝ) ≤ ((n * (2 * (ℓ - e)) : ℕ) : ℝ) := by
    exact_mod_cast h
  rw [Nat.cast_mul, Nat.cast_mul, Nat.cast_mul, tileScale_cast] at hcast
  simp only [dyadicNatDecode]
  rw [← sub_nonneg]
  have hS2 : 0 < ((2 : ℝ) ^ precision) ^ 2 := by positivity
  have key : (n : ℝ) / 2 ^ precision * (2 * (((ℓ - e : ℕ) : ℝ) / 2 ^ precision)) -
      n' / 2 ^ precision =
      (n * (2 * ((ℓ - e : ℕ) : ℝ)) - n' * 2 ^ precision) / ((2 : ℝ) ^ precision) ^ 2 := by
    field_simp
  rw [key]
  push_cast at hcast
  exact div_nonneg (by linarith) hS2.le

/-- **Certified lower multiplier bound.** If `checkTile cert = true` and
`checkTileMultiplierLower cert lowerBound lower = true`, then for every
parameter in the closed decoded parameter disk and every point of the decoded
seed disk, the formal `p`-step multiplier has modulus at least the decoded
`lowerBound`. The per-iterate errors are the checked seed-disk table. -/
theorem checkTileMultiplierLower_sound (cert : TileCertificate) (lowerBound : ℕ)
    (lower : List TileLowerStep) (hcheck : checkTile cert = true)
    (hlower : checkTileMultiplierLower cert lowerBound lower = true) (c : ℂ)
    (hc : ‖c - dyadicDecode cert.precision cert.parameter‖ ≤
      dyadicNatDecode cert.precision cert.parameterRadius) :
    ∀ z ∈ closedBall (dyadicDecode cert.precision cert.center)
        (dyadicNatDecode cert.precision cert.seedRadius),
      dyadicNatDecode cert.precision lowerBound ≤
        ‖(derivative (seedPolynomial c cert.period)).eval z‖ := by
  intro z hz
  simp only [checkTileMultiplierLower, Bool.and_eq_true, decide_eq_true_eq,
    List.all_eq_true, List.mem_range] at hlower
  obtain ⟨⟨hhead, hsteps⟩, hlast⟩ := hlower
  set s := cert.precision
  let ℓ : ℕ → ℕ := fun j => (lower.getD j TileLowerStep.zero).lowerRadius
  let e : ℕ → ℕ := fun j => (cert.cycleStep j).seedError
  have hfactor : ∀ j < cert.period,
      dyadicNatDecode s (ℓ j - e j) ≤ ‖orbit c j z‖ := by
    intro j hj
    have hstep := hsteps j hj
    have hℓ : dyadicNatDecode s (ℓ j) ≤ ‖cert.reference j‖ := by
      have := le_norm_of_le_intNormSq (tileScale_pos s) (z := cert.reference j)
        (re := (cert.cycleStep j).point.re) (im := (cert.cycleStep j).point.im)
        (B := (ℓ j : ℤ)) rfl (Int.natCast_nonneg _)
        (by
          have h1 := hstep.1
          simp only [tileLowerRadiusOK, decide_eq_true_eq] at h1
          exact h1)
      rw [Int.cast_natCast] at this
      exact this
    have herr := checkTile_orbit_sub_reference_le cert hcheck c hc z hz j hj.le
    have htri : ‖cert.reference j‖ - ‖orbit c j z - cert.reference j‖ ≤ ‖orbit c j z‖ := by
      have := norm_sub_norm_le (cert.reference j) (cert.reference j - orbit c j z)
      rw [sub_sub_cancel, norm_sub_rev] at this
      linarith
    by_cases hle : e j ≤ ℓ j
    · have hcast : dyadicNatDecode s (ℓ j - e j) =
          dyadicNatDecode s (ℓ j) - dyadicNatDecode s (e j) := by
        simp only [dyadicNatDecode, Nat.cast_sub hle, sub_div]
      rw [hcast]
      change _ ≤ dyadicNatDecode s (cert.cycleStep j).seedError at herr
      linarith
    · rw [Nat.sub_eq_zero_of_le (Nat.le_of_not_le hle)]
      simp only [dyadicNatDecode, Nat.cast_zero, zero_div, norm_nonneg]
  have htable := table_le_seedDerivative_norm c z (fun j => dyadicNatDecode s (ℓ j - e j))
    (fun j => dyadicNatDecode s (lower.getD j TileLowerStep.zero).lowerMultiplier)
    cert.period (fun _ _ => dyadicNatDecode_nonneg _ _) hfactor
    (by
      rw [dyadicNatDecode, div_le_one (tileScale_pos _), ← tileScale_cast]
      exact_mod_cast hhead)
    (fun j hj => lowerStep_le_of_tileLowerStepOK s (hsteps j hj).2)
  exact (div_le_div_of_nonneg_right (by exact_mod_cast hlast) (tileScale_pos _).le).trans htable

/-- Two-sided multiplier enclosure for the certified return point: for every
parameter in the tile, the unique return point `ζ` of `checkTile_sound` has
`lowerBound / S ≤ ‖λ(ζ)‖ ≤ q`. -/
theorem checkTile_sound_multiplier_bounds (cert : TileCertificate) (lowerBound : ℕ)
    (lower : List TileLowerStep) (hcheck : checkTile cert = true)
    (hlower : checkTileMultiplierLower cert lowerBound lower = true) (c : ℂ)
    (hc : ‖c - dyadicDecode cert.precision cert.parameter‖ ≤
      dyadicNatDecode cert.precision cert.parameterRadius) :
    ∃! ζ : ℂ, ζ ∈ closedBall (dyadicDecode cert.precision cert.center)
        (dyadicNatDecode cert.precision cert.seedRadius) ∧
      orbit c cert.period ζ = ζ ∧
      (∀ y ∈ closedBall (dyadicDecode cert.precision cert.center)
          (dyadicNatDecode cert.precision cert.seedRadius),
        orbit c cert.period y = y → y = ζ) ∧
      minimalPeriod (quadratic c) ζ = cert.period ∧
      dyadicNatDecode cert.precision lowerBound ≤
        ‖(derivative (seedPolynomial c cert.period)).eval ζ‖ ∧
      ‖(derivative (seedPolynomial c cert.period)).eval ζ‖ ≤
        dyadicNatDecode cert.precision cert.contraction := by
  obtain ⟨ζ, hζ, -⟩ := checkTile_sound cert hcheck c hc
  refine ⟨ζ, ⟨hζ.1, hζ.2.1, hζ.2.2.1, hζ.2.2.2.1,
    checkTileMultiplierLower_sound cert lowerBound lower hcheck hlower c hc ζ hζ.1,
    hζ.2.2.2.2.1⟩, ?_⟩
  intro y hy
  exact hζ.2.2.1 y hy.1 hy.2.1

end IntMProof
