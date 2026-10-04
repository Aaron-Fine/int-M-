import IntMProof.Perturbation
import Mathlib.Analysis.Complex.Norm
import Mathlib.Tactic.Ring
import Mathlib.Tactic.Set

/-!
# Complex-norm bound for a parameter perturbation

`perturbationBound` compares the modulus of a seed shift with a real
recurrence. The comparison is exact for the complex norm `‖·‖`. It does not
model binary64 rounding, and it does not certify `guardDisplacement = 0.01`.
-/

namespace IntMProof

private theorem norm_quadraticStep (w e δ : ℂ) :
    ‖2 * w * e + e ^ 2 + δ‖ ≤ 2 * ‖w‖ * ‖e‖ + ‖e‖ ^ 2 + ‖δ‖ := by
  refine le_trans (norm_add_le _ _) ?_
  refine le_trans (add_le_add_left (norm_add_le _ _) _) ?_
  refine add_le_add_left (add_le_add ?_ ?_) _
  · apply le_of_eq
    rw [Complex.norm_mul, Complex.norm_mul, Complex.norm_two]
  · apply le_of_eq
    rw [Complex.norm_pow]

/-- Triangle inequality for one step of a same-seed perturbation.
No smallness hypothesis is used. This compares complex moduli and does not
model binary64 rounding. -/
theorem perturbation_norm_succ (c δ z : ℂ) (n : ℕ) :
    ‖perturbation c δ z (n + 1)‖ ≤
      2 * ‖orbit c n z‖ * ‖perturbation c δ z n‖
        + ‖perturbation c δ z n‖ ^ 2
        + ‖δ‖ := by
  rw [perturbation_succ]
  exact norm_quadraticStep (orbit c n z) (perturbation c δ z n) δ

section

variable {R : Type*} [CommRing R]

/-- Difference of orbits that may start at different seeds. The seed `z₁` is
iterated at parameter `c + δ`, and the reference seed `z₀` at parameter `c`.
This is an equality in any commutative ring. -/
def seedShift (c δ z₀ z₁ : R) (n : ℕ) : R :=
  orbit (c + δ) n z₁ - orbit c n z₀

/-- At step zero the seed shift is the difference of the two seeds. -/
theorem seedShift_zero (c δ z₀ z₁ : R) : seedShift c δ z₀ z₁ 0 = z₁ - z₀ := by
  simp only [seedShift, orbit_zero]

/-- The seed shift obeys `eₙ₊₁ = 2 zₙ eₙ + eₙ² + δ`, where `zₙ` is the
reference orbit of `z₀`. This is an equality in any commutative ring. -/
theorem seedShift_succ (c δ z₀ z₁ : R) (n : ℕ) :
    seedShift c δ z₀ z₁ (n + 1) =
      2 * orbit c n z₀ * seedShift c δ z₀ z₁ n
        + seedShift c δ z₀ z₁ n ^ 2
        + δ := by
  simp only [seedShift]
  rw [orbit_succ, orbit_succ]
  simp only [quadratic]
  ring

/-- A same-seed perturbation is the seed shift of two equal seeds. -/
theorem seedShift_eq_perturbation (c δ z : R) (n : ℕ) :
    seedShift c δ z z n = perturbation c δ z n :=
  rfl

end

/-- Triangle inequality for one step of a seed shift. No smallness hypothesis
is used. This compares complex moduli and does not model binary64 rounding. -/
theorem seedShift_norm_succ (c δ z₀ z₁ : ℂ) (n : ℕ) :
    ‖seedShift c δ z₀ z₁ (n + 1)‖ ≤
      2 * ‖orbit c n z₀‖ * ‖seedShift c δ z₀ z₁ n‖
        + ‖seedShift c δ z₀ z₁ n‖ ^ 2
        + ‖δ‖ := by
  rw [seedShift_succ]
  exact norm_quadraticStep (orbit c n z₀) (seedShift c δ z₀ z₁ n) δ

/-- Real comparison sequence for a complex-norm perturbation. The value at `0`
is `ε`. The value at `n + 1` is `2 M bₙ + bₙ² + Δ`. Neither `ε` nor `Δ` is
assumed small. -/
def perturbationBound (ε M Δ : ℝ) : ℕ → ℝ
  | 0 => ε
  | n + 1 =>
      2 * M * perturbationBound ε M Δ n
        + perturbationBound ε M Δ n ^ 2
        + Δ

/-- The comparison sequence equals its initial value at step zero. -/
theorem perturbationBound_zero (ε M Δ : ℝ) : perturbationBound ε M Δ 0 = ε :=
  rfl

/-- One step of the comparison sequence. -/
theorem perturbationBound_succ (ε M Δ : ℝ) (n : ℕ) :
    perturbationBound ε M Δ (n + 1) =
      2 * M * perturbationBound ε M Δ n
        + perturbationBound ε M Δ n ^ 2
        + Δ :=
  rfl

/-- The comparison sequence stays nonnegative when `ε`, `M`, and `Δ` do. -/
theorem perturbationBound_nonneg (ε M Δ : ℝ) (n : ℕ) (hε : 0 ≤ ε) (hM : 0 ≤ M)
    (hΔ : 0 ≤ Δ) : 0 ≤ perturbationBound ε M Δ n := by
  induction n with
  | zero =>
    rw [perturbationBound_zero]
    exact hε
  | succ n ih =>
    rw [perturbationBound_succ]
    exact add_nonneg
      (add_nonneg (mul_nonneg (mul_nonneg zero_le_two hM) ih) (sq_nonneg _)) hΔ

/-- On nonnegative reals, `x ↦ 2 M x + x²` is monotone for `0 ≤ M`. -/
private theorem perturbationStep_mono {M a b : ℝ} (hM : 0 ≤ M) (ha : 0 ≤ a)
    (hb : 0 ≤ b) (hab : a ≤ b) :
    2 * M * a + a ^ 2 ≤ 2 * M * b + b ^ 2 := by
  have hlin : 2 * M * a ≤ 2 * M * b :=
    mul_le_mul_of_nonneg_left hab (mul_nonneg zero_le_two hM)
  have hsq : a ^ 2 ≤ b ^ 2 := by
    rw [sq_le_sq, abs_of_nonneg ha, abs_of_nonneg hb]
    exact hab
  exact add_le_add hlin hsq

/-- If the reference orbit of `z₀` stays inside radius `M` for `k < n`, the
seed shift is at most the comparison sequence. `ε` and `Δ` need not be small.
This is an exact comparison of complex moduli. It does not model binary64
rounding and does not certify `guardDisplacement = 0.01`. -/
theorem seedShift_norm_le_perturbationBound (c δ z₀ z₁ : ℂ) (ε M Δ : ℝ) (n : ℕ)
    (hM : 0 ≤ M) (hΔ : 0 ≤ Δ) (hε : ‖z₁ - z₀‖ ≤ ε) (hδ : ‖δ‖ ≤ Δ)
    (horbit : ∀ k < n, ‖orbit c k z₀‖ ≤ M) :
    ‖seedShift c δ z₀ z₁ n‖ ≤ perturbationBound ε M Δ n := by
  have hε0 : 0 ≤ ε := le_trans (norm_nonneg (z₁ - z₀)) hε
  suffices ∀ n, (∀ k < n, ‖orbit c k z₀‖ ≤ M) →
      ‖seedShift c δ z₀ z₁ n‖ ≤ perturbationBound ε M Δ n by
    exact this n horbit
  intro n
  induction n with
  | zero =>
    intro _
    rw [seedShift_zero, perturbationBound_zero]
    exact hε
  | succ n ih =>
    intro horbit
    have ihn := ih (fun k hk => horbit k (Nat.lt_succ_of_lt hk))
    have hw : ‖orbit c n z₀‖ ≤ M := horbit n (Nat.lt_succ_self n)
    set e : ℝ := ‖seedShift c δ z₀ z₁ n‖
    set b : ℝ := perturbationBound ε M Δ n
    set w : ℝ := ‖orbit c n z₀‖
    have he0 : 0 ≤ e := norm_nonneg _
    have hb0 : 0 ≤ b := perturbationBound_nonneg ε M Δ n hε0 hM hΔ
    have hmono : 2 * M * e + e ^ 2 ≤ 2 * M * b + b ^ 2 :=
      perturbationStep_mono hM he0 hb0 ihn
    have hlin : 2 * w * e ≤ 2 * M * e :=
      mul_le_mul_of_nonneg_right
        (mul_le_mul_of_nonneg_left hw zero_le_two) he0
    have hrec :
        ‖seedShift c δ z₀ z₁ (n + 1)‖ ≤ 2 * w * e + e ^ 2 + ‖δ‖ :=
      seedShift_norm_succ c δ z₀ z₁ n
    calc
      ‖seedShift c δ z₀ z₁ (n + 1)‖ ≤ 2 * w * e + e ^ 2 + ‖δ‖ := hrec
      _ ≤ 2 * M * e + e ^ 2 + ‖δ‖ :=
        add_le_add_left (add_le_add_left hlin (e ^ 2)) ‖δ‖
      _ ≤ 2 * M * e + e ^ 2 + Δ :=
        add_le_add_right hδ (2 * M * e + e ^ 2)
      _ ≤ 2 * M * b + b ^ 2 + Δ := add_le_add_left hmono Δ
      _ = perturbationBound ε M Δ (n + 1) := by rw [perturbationBound_succ]

/-- Absolute bound for a same-seed perturbation. The seeds agree, so the
initial gap is `0`, and `‖eₙ‖ ≤ perturbationBound 0 M Δ n` whenever `‖δ‖ ≤ Δ`
and the reference orbit stays inside radius `M`. This comparison does not
model binary64 rounding and does not certify `guardDisplacement = 0.01`. -/
theorem perturbation_norm_le_bound (c δ z : ℂ) (M Δ : ℝ) (n : ℕ) (hM : 0 ≤ M)
    (hΔ : 0 ≤ Δ) (hδ : ‖δ‖ ≤ Δ) (horbit : ∀ k < n, ‖orbit c k z‖ ≤ M) :
    ‖perturbation c δ z n‖ ≤ perturbationBound 0 M Δ n := by
  have h0 : ‖z - z‖ ≤ (0 : ℝ) := by rw [sub_self, norm_zero]
  rw [← seedShift_eq_perturbation]
  exact
    seedShift_norm_le_perturbationBound c δ z z 0 M Δ n hM hΔ h0 hδ horbit

end IntMProof
