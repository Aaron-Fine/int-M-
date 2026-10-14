import IntMProof.RationalBoxOrbit
import Mathlib.Data.Rat.Floor

/-!
# Directed rational-grid endpoint rounding

The backend uses exact rational intermediates and projects lower endpoints
down and upper endpoints up to the grid `ℤ / scale`. It has no fixed word
size or binary64 overflow semantics. Signed floor and ceiling, rather than
truncation, keep negative endpoints outward as well.
-/

namespace IntMProof

/-- Round a rational down to an integer multiple of `1 / scale`. -/
def gridFloor (scale : ℕ) (x : ℚ) : ℚ := (⌊x * scale⌋ : ℚ) / scale

/-- Round a rational up to an integer multiple of `1 / scale`. -/
def gridCeil (scale : ℕ) (x : ℚ) : ℚ := (⌈x * scale⌉ : ℚ) / scale

/-- Directed lower rounding never exceeds the exact input. -/
theorem gridFloor_le (scale : ℕ) (hscale : 0 < scale) (x : ℚ) :
    gridFloor scale x ≤ x := by
  have hs : (0 : ℚ) < scale := by exact_mod_cast hscale
  exact (div_le_iff₀ hs).mpr (Int.floor_le (x * scale))

/-- Directed upper rounding never falls below the exact input. -/
theorem le_gridCeil (scale : ℕ) (hscale : 0 < scale) (x : ℚ) :
    x ≤ gridCeil scale x := by
  have hs : (0 : ℚ) < scale := by exact_mod_cast hscale
  exact (le_div_iff₀ hs).mpr (Int.le_ceil (x * scale))

/-- The downward quantization error is less than one grid spacing. -/
theorem gridFloor_error_lt (scale : ℕ) (hscale : 0 < scale) (x : ℚ) :
    x - gridFloor scale x < 1 / scale := by
  have hs : (0 : ℚ) < scale := by exact_mod_cast hscale
  have h := Int.lt_floor_add_one (x * (scale : ℚ))
  have hbound : x < ((⌊x * (scale : ℚ)⌋ : ℚ) + 1) / scale :=
    (lt_div_iff₀ hs).mpr h
  rw [add_div] at hbound
  change x - (⌊x * (scale : ℚ)⌋ : ℚ) / scale < 1 / scale
  linarith

/-- The upward quantization error is less than one grid spacing. -/
theorem gridCeil_error_lt (scale : ℕ) (hscale : 0 < scale) (x : ℚ) :
    gridCeil scale x - x < 1 / scale := by
  have hs : (0 : ℚ) < scale := by exact_mod_cast hscale
  have h := Int.ceil_lt_add_one (x * (scale : ℚ))
  have hbound : gridCeil scale x < x + 1 / scale := by
    apply (div_lt_iff₀ hs).mpr
    calc
      (⌈x * (scale : ℚ)⌉ : ℚ) < x * scale + 1 := h
      _ = (x + 1 / scale) * scale := by
        rw [add_mul, div_mul_cancel₀ _ (ne_of_gt hs)]
  linarith

/-- Outward rounding of both interval endpoints. -/
def roundIntervalOutward (scale : ℕ) (hscale : 0 < scale)
    (I : RationalInterval) : RationalInterval :=
  ⟨gridFloor scale I.lo, gridCeil scale I.hi,
    (gridFloor_le scale hscale I.lo).trans (I.valid.trans (le_gridCeil scale hscale I.hi))⟩

/-- Every member of the exact interval remains in its rounded enclosure. -/
theorem roundIntervalOutward_sound (scale : ℕ) (hscale : 0 < scale)
    (I : RationalInterval) (x : ℝ) (hx : I.contains x) :
    (roundIntervalOutward scale hscale I).contains x := by
  have hlo : (gridFloor scale I.lo : ℝ) ≤ (I.lo : ℝ) := by
    exact_mod_cast gridFloor_le scale hscale I.lo
  have hhi : (I.hi : ℝ) ≤ (gridCeil scale I.hi : ℝ) := by
    exact_mod_cast le_gridCeil scale hscale I.hi
  exact ⟨hlo.trans hx.1, hx.2.trans hhi⟩

/-- Endpoint rounding enlarges interval width by less than two grid spacings. -/
theorem roundIntervalOutward_width_lt (scale : ℕ) (hscale : 0 < scale)
    (I : RationalInterval) :
    (roundIntervalOutward scale hscale I).hi -
      (roundIntervalOutward scale hscale I).lo < I.hi - I.lo + 2 / scale := by
  have hlo := gridFloor_error_lt scale hscale I.lo
  have hhi := gridCeil_error_lt scale hscale I.hi
  change gridCeil scale I.hi - gridFloor scale I.lo < I.hi - I.lo + 2 / scale
  have htwo : (2 : ℚ) / scale = 1 / scale + 1 / scale := by ring
  rw [htwo]
  linarith

/-- Outward rounding of both coordinate intervals of a complex box. -/
def roundBoxOutward (scale : ℕ) (hscale : 0 < scale) (B : RationalBox) : RationalBox :=
  ⟨roundIntervalOutward scale hscale B.re, roundIntervalOutward scale hscale B.im⟩

/-- Grid quantization preserves complex-box containment. -/
theorem roundBoxOutward_sound (scale : ℕ) (hscale : 0 < scale)
    (B : RationalBox) (z : ℂ) (hz : B.contains z) :
    (roundBoxOutward scale hscale B).contains z := by
  exact ⟨roundIntervalOutward_sound scale hscale B.re z.re hz.1,
    roundIntervalOutward_sound scale hscale B.im z.im hz.2⟩

/-- Directed rounding must handle negative fractions away from zero. -/
theorem grid_round_negative_witness :
    gridFloor 10 (-1 / 3) = -2 / 5 ∧ gridCeil 10 (-1 / 3) = -3 / 10 := by
  norm_num [gridFloor, gridCeil]

end IntMProof
