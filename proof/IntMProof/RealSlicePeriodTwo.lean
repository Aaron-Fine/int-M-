import IntMProof.FastPath
import Mathlib.Analysis.Real.Sqrt
import Mathlib.Tactic.Linarith

/-!
# A selected period-two window on the real quadratic slice

For the real map `x ↦ x² + c`, the interval `-5/4 < c < -3/4`
has a genuine real two-cycle. Its two-step multiplier is `4(c+1)`, with
absolute value below one throughout this interval. This is a selected
window result, not a Sharkovsky ordering for complex parameters.
-/

namespace IntMProof

open Function

/-- The real quadratic family on the invariant real slice. -/
def realQuadratic (c x : ℝ) : ℝ := x * x + c

/-- A real root of the period-two factor, when `-3 - 4c ≥ 0`. -/
noncomputable def realPeriodTwoPoint (c : ℝ) : ℝ :=
  (-1 + Real.sqrt (-3 - 4 * c)) / 2

/-- The real fixed-point branch selected by the positive square root. -/
noncomputable def realFixedPoint (c : ℝ) : ℝ :=
  (1 - Real.sqrt (1 - 4 * c)) / 2

/-- The adjacent open interval has an attracting real fixed point. -/
theorem realFixedPoint_attracting_window (c : ℝ)
    (hc : -3 / 4 < c ∧ c < 1 / 4) :
    realQuadratic c (realFixedPoint c) = realFixedPoint c ∧
      |2 * realFixedPoint c| < 1 := by
  have harg : 0 < 1 - 4 * c := by linarith [hc.2]
  have hsqr := Real.sq_sqrt (le_of_lt harg)
  have hspos : 0 < Real.sqrt (1 - 4 * c) := Real.sqrt_pos.2 harg
  have hslt : Real.sqrt (1 - 4 * c) < 2 := by nlinarith [hc.1]
  constructor
  · unfold realQuadratic realFixedPoint
    nlinarith
  · unfold realFixedPoint
    rw [abs_lt]
    constructor <;> nlinarith

/-- The selected root satisfies the factor of the two-cycle equation. -/
theorem realPeriodTwoPoint_factor (c : ℝ) (hc : c ≤ -3 / 4) :
    realPeriodTwoPoint c * realPeriodTwoPoint c +
      realPeriodTwoPoint c + (c + 1) = 0 := by
  have hnonneg : 0 ≤ -3 - 4 * c := by linarith
  have hsqr := Real.sq_sqrt hnonneg
  unfold realPeriodTwoPoint
  nlinarith

/-- The selected root and its image form a closed two-cycle. -/
theorem realPeriodTwoPoint_return (c : ℝ) (hc : c ≤ -3 / 4) :
    realQuadratic c (realQuadratic c (realPeriodTwoPoint c)) =
      realPeriodTwoPoint c := by
  have hfactor := realPeriodTwoPoint_factor c hc
  unfold realQuadratic
  have himage : realPeriodTwoPoint c * realPeriodTwoPoint c + c =
      -realPeriodTwoPoint c - 1 := by linarith
  rw [himage]
  nlinarith

/-- Below the bifurcation parameter, the two real cycle points are distinct. -/
theorem realPeriodTwoPoint_ne_image (c : ℝ) (hc : c < -3 / 4) :
    realPeriodTwoPoint c ≠ realQuadratic c (realPeriodTwoPoint c) := by
  have harg : 0 < -3 - 4 * c := by linarith
  have hsqrt : 0 < Real.sqrt (-3 - 4 * c) := Real.sqrt_pos.2 harg
  have hfactor := realPeriodTwoPoint_factor c (le_of_lt hc)
  have himage : realQuadratic c (realPeriodTwoPoint c) =
      -realPeriodTwoPoint c - 1 := by
    unfold realQuadratic
    linarith
  rw [himage]
  unfold realPeriodTwoPoint
  intro heq
  linarith

/-- The selected real point has minimal period exactly two below the
bifurcation parameter. -/
theorem realPeriodTwoPoint_minimalPeriod (c : ℝ) (hc : c < -3 / 4) :
    minimalPeriod (realQuadratic c) (realPeriodTwoPoint c) = 2 := by
  refine (exactPeriod_iff_first_return (realQuadratic c) (realPeriodTwoPoint c)
    2 (by decide)).mpr ⟨?_, ?_⟩
  · simpa [Function.iterate_succ_apply, Function.iterate_zero] using
      realPeriodTwoPoint_return c (le_of_lt hc)
  · intro k hk hlt
    cases k with
    | zero => exact absurd hk (Nat.not_lt_zero 0)
    | succ k =>
      cases k with
      | zero =>
        simpa [Function.iterate_one] using
          (realPeriodTwoPoint_ne_image c hc).symm
      | succ k =>
        exact absurd hlt (not_lt_of_ge (Nat.le_add_left 2 k))

/-- The real cycle product gives the exact two-step multiplier. -/
theorem realPeriodTwoPoint_multiplier (c : ℝ) (hc : c ≤ -3 / 4) :
    4 * realPeriodTwoPoint c *
        realQuadratic c (realPeriodTwoPoint c) = 4 * (c + 1) := by
  have hfactor := realPeriodTwoPoint_factor c hc
  have himage : realQuadratic c (realPeriodTwoPoint c) =
      -realPeriodTwoPoint c - 1 := by
    unfold realQuadratic
    linarith
  rw [himage]
  nlinarith

/-- The real attraction inequality is exactly the open interval
`-5/4 < c < -3/4`. -/
theorem realPeriodTwo_window_iff (c : ℝ) :
    |4 * (c + 1)| < 1 ↔ -5 / 4 < c ∧ c < -3 / 4 := by
  rw [abs_lt]
  constructor <;> intro h <;> constructor <;> linarith [h.1, h.2]

/-- Every parameter in the selected open interval has a genuine, attracting
real two-cycle. Attraction here is the exact two-step multiplier test. -/
theorem realPeriodTwo_attracting_window (c : ℝ)
    (hc : -5 / 4 < c ∧ c < -3 / 4) :
    minimalPeriod (realQuadratic c) (realPeriodTwoPoint c) = 2 ∧
      |4 * realPeriodTwoPoint c *
        realQuadratic c (realPeriodTwoPoint c)| < 1 := by
  refine ⟨realPeriodTwoPoint_minimalPeriod c hc.2, ?_⟩
  rw [realPeriodTwoPoint_multiplier c (le_of_lt hc.2)]
  exact (realPeriodTwo_window_iff c).2 hc

end IntMProof
