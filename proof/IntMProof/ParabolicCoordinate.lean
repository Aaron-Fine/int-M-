import IntMProof.Quadratic
import Mathlib.Data.Complex.Basic
import Mathlib.Analysis.SpecificLimits.Basic
import Mathlib.Topology.Algebra.Order.Field
import Mathlib.Tactic

/-!
# A concrete parabolic coordinate at `c = 1/4` (F0)

At the double fixed point `z = 1/2`, the translated return is exactly
`w ↦ w + w²`.  The reciprocal coordinate `u = -1/w` changes this to
`u ↦ u + 1 + 1/(u - 1)` wherever both charts are defined.  On the real
half-line `u > 1`, the new coordinate remains in that half-line and advances
by more than one. This is a finite exact coordinate calculation, not a global
Fatou coordinate or a complex petal theorem.
-/

namespace IntMProof

open Filter

/-- The distinguished parabolic parameter. -/
noncomputable def parabolicParameter : ℂ := 1 / 4

/-- The double fixed point at the parabolic parameter. -/
noncomputable def parabolicFixedPoint : ℂ := 1 / 2

/-- Translation from the double fixed point. -/
noncomputable def parabolicShift (z : ℂ) : ℂ := z - parabolicFixedPoint

theorem parabolic_fixed :
    quadratic parabolicParameter parabolicFixedPoint = parabolicFixedPoint := by
  norm_num [quadratic, parabolicParameter, parabolicFixedPoint]

/-- The exact local return germ in translated coordinates. -/
theorem parabolic_shift_step (z : ℂ) :
    parabolicShift (quadratic parabolicParameter z) =
      parabolicShift z + (parabolicShift z) ^ 2 := by
  unfold parabolicShift parabolicFixedPoint parabolicParameter quadratic
  ring

/-- Reciprocal chart away from the double fixed point. -/
noncomputable def parabolicReciprocal (w : ℂ) : ℂ := -1 / w

/-- The exact rational return in the reciprocal chart. `w = -1` is excluded
because the next translated iterate would be zero. -/
theorem parabolic_reciprocal_step (w : ℂ)
    (hw : w ≠ 0) (hm : w ≠ -1) :
    parabolicReciprocal (w + w ^ 2) =
      parabolicReciprocal w + 1 + 1 / (parabolicReciprocal w - 1) := by
  have hw1 : w + 1 ≠ 0 := by
    intro h
    apply hm
    linear_combination h
  have hnext : w + w ^ 2 ≠ 0 := by
    intro h
    have hprod : w * (w + 1) = 0 := by
      calc
        w * (w + 1) = w + w ^ 2 := by ring
        _ = 0 := h
    rcases mul_eq_zero.mp hprod with hzero | hone
    · exact hw hzero
    · exact hw1 hone
  have hden : parabolicReciprocal w - 1 ≠ 0 := by
    unfold parabolicReciprocal
    intro h
    have h' : (-1 : ℂ) / w = 1 := sub_eq_zero.mp h
    have h'' : (-1 : ℂ) = w := by simpa using (div_eq_iff hw).mp h'
    exact hm h''.symm
  unfold parabolicReciprocal
  field_simp [hw, hw1, hnext, parabolicReciprocal]
  · field_simp [hw1, add_comm]
    ring

/-- The reciprocal formula expressed as a conjugacy of the quadratic return.
The exclusions `u = 0` and `u = 1` are precisely the chart pole and the
preimage that lands on the parabolic fixed point. -/
theorem parabolic_chart_return (u : ℂ) (hu0 : u ≠ 0) (hu1 : u ≠ 1) :
    parabolicReciprocal
      (parabolicShift (quadratic parabolicParameter
        (parabolicFixedPoint - 1 / u))) =
      u + 1 + 1 / (u - 1) := by
  have hshift : parabolicShift (parabolicFixedPoint - 1 / u) = -1 / u := by
    unfold parabolicShift
    ring
  have hwnz : (-1 : ℂ) / u ≠ 0 := div_ne_zero (by norm_num) hu0
  have hwm : (-1 : ℂ) / u ≠ -1 := by
    intro h
    have h' : (-1 : ℂ) = -1 * u := (div_eq_iff hu0).mp h
    have h'' : u = 1 := by
      have hneg : (1 : ℂ) = u := neg_inj.mp (by simpa using h')
      exact hneg.symm
    exact hu1 h''
  have hcoord : parabolicReciprocal ((-1 : ℂ) / u) = u := by
    unfold parabolicReciprocal
    field_simp [hu0]
  rw [parabolic_shift_step, hshift,
    parabolic_reciprocal_step ((-1 : ℂ) / u) hwnz hwm, hcoord]

/-- Real reciprocal return, retaining the exact correction to translation. -/
noncomputable def parabolicRealReturn (u : ℝ) : ℝ := u + 1 + 1 / (u - 1)

theorem parabolic_real_chart_return (u : ℝ) (hu : 1 < u) :
    parabolicReciprocal
      (parabolicShift (quadratic parabolicParameter
        (parabolicFixedPoint - 1 / (u : ℂ)))) =
      (parabolicRealReturn u : ℂ) := by
  have hu0 : (u : ℂ) ≠ 0 := by
    exact_mod_cast (ne_of_gt (lt_trans zero_lt_one hu))
  have hu1 : (u : ℂ) ≠ 1 := by
    exact_mod_cast hu.ne'
  rw [parabolic_chart_return (u : ℂ) hu0 hu1]
  simp [parabolicRealReturn]

/-- The outgoing real half-line is forward invariant and advances by more
than one in the reciprocal coordinate. -/
theorem parabolic_real_return_gt (u : ℝ) (hu : 1 < u) :
    u + 1 < parabolicRealReturn u := by
  unfold parabolicRealReturn
  have hpos : 0 < u - 1 := by linarith
  have hrec : 0 < 1 / (u - 1) := one_div_pos.mpr hpos
  linarith

theorem parabolic_real_return_invariant (u : ℝ) (hu : 1 < u) :
    1 < parabolicRealReturn u := by
  have hstep := parabolic_real_return_gt u hu
  linarith

/-- The real outgoing petal written in the original complex coordinate. -/
noncomputable def parabolicRealPoint (u : ℝ) : ℂ :=
  parabolicFixedPoint - 1 / (u : ℂ)

theorem parabolic_real_point_step (u : ℝ) (hu : 1 < u) :
    quadratic parabolicParameter (parabolicRealPoint u) =
      parabolicRealPoint (parabolicRealReturn u) := by
  have hu0 : u ≠ 0 := ne_of_gt (lt_trans zero_lt_one hu)
  have hu1 : u - 1 ≠ 0 := ne_of_gt (by linarith : 0 < u - 1)
  have hret : parabolicRealReturn u = u ^ 2 / (u - 1) := by
    unfold parabolicRealReturn
    field_simp [hu1]
    ring
  have hu0c : (u : ℂ) ≠ 0 := by exact_mod_cast hu0
  have hu1c : (u : ℂ) - 1 ≠ 0 := by exact_mod_cast hu1
  unfold parabolicRealPoint parabolicFixedPoint parabolicParameter quadratic
  rw [hret]
  push_cast
  field_simp [hu0c, hu1c]
  ring

theorem parabolic_real_iterate_invariant (u : ℝ) (hu : 1 < u) (n : ℕ) :
    1 < (parabolicRealReturn^[n]) u := by
  induction n with
  | zero => simpa using hu
  | succ n ih =>
    rw [Function.iterate_succ_apply']
    exact parabolic_real_return_invariant _ ih

theorem parabolic_real_point_orbit (u : ℝ) (hu : 1 < u) (n : ℕ) :
    orbit parabolicParameter n (parabolicRealPoint u) =
      parabolicRealPoint ((parabolicRealReturn^[n]) u) := by
  induction n with
  | zero => rfl
  | succ n ih =>
    rw [orbit_succ, ih, Function.iterate_succ_apply']
    exact parabolic_real_point_step _
      (parabolic_real_iterate_invariant u hu n)

/-- Each real reciprocal iterate gains at least one. -/
theorem parabolic_real_iterate_growth (u : ℝ) (hu : 1 < u) (n : ℕ) :
    u + n ≤ (parabolicRealReturn^[n]) u := by
  induction n with
  | zero => simp
  | succ n ih =>
    have hinv := parabolic_real_iterate_invariant u hu n
    rw [Function.iterate_succ_apply']
    have hstep := (parabolic_real_return_gt _ hinv).le
    have hcalc : u + (n : ℝ) + 1 ≤
        parabolicRealReturn ((parabolicRealReturn^[n]) u) := by linarith
    simpa [Nat.cast_add, add_assoc] using hcalc

/-- Along the real outgoing petal, the distance to the parabolic fixed point
is bounded by the reciprocal of the initial chart coordinate plus time. -/
theorem parabolic_real_orbit_distance_le (u : ℝ) (hu : 1 < u) (n : ℕ) :
    ‖orbit parabolicParameter n (parabolicRealPoint u) -
        parabolicFixedPoint‖ ≤ 1 / (u + n) := by
  rw [parabolic_real_point_orbit u hu n]
  unfold parabolicRealPoint
  have hv : 0 < (parabolicRealReturn^[n]) u :=
    lt_trans zero_lt_one (parabolic_real_iterate_invariant u hu n)
  have hbase : 0 < u + (n : ℝ) := by positivity
  have hbound := parabolic_real_iterate_growth u hu n
  have hnorm : ‖parabolicFixedPoint -
      1 / ((parabolicRealReturn^[n]) u : ℂ) - parabolicFixedPoint‖ =
      1 / ((parabolicRealReturn^[n]) u) := by
    simp [abs_of_pos hv]
  rw [hnorm]
  exact one_div_le_one_div_of_le hbase hbound

/-- Every point on the stated real outgoing petal converges to the parabolic
fixed point, with the preceding theorem giving an explicit `O(1/n)` bound. -/
theorem parabolic_real_orbit_tendsto (u : ℝ) (hu : 1 < u) :
    Filter.Tendsto (fun n : ℕ =>
      orbit parabolicParameter n (parabolicRealPoint u))
      Filter.atTop (nhds parabolicFixedPoint) := by
  rw [tendsto_iff_norm_sub_tendsto_zero]
  have hden : Filter.Tendsto (fun n : ℕ => u + (n : ℝ))
      Filter.atTop Filter.atTop :=
    tendsto_atTop_add_const_left Filter.atTop u tendsto_natCast_atTop_atTop
  have hcap : Filter.Tendsto (fun n : ℕ => 1 / (u + (n : ℝ)))
      Filter.atTop (nhds 0) := by
    simpa [one_div, Function.comp_def] using tendsto_inv_atTop_zero.comp hden
  exact squeeze_zero (fun n => norm_nonneg _)
    (fun n => parabolic_real_orbit_distance_le u hu n) hcap

end IntMProof
