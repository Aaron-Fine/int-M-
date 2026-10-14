import IntMProof.Quadratic
import Mathlib.Analysis.Complex.Basic
import Mathlib.Tactic.GCongr
import Mathlib.Tactic.Ring
import Mathlib.Topology.MetricSpace.Basic

/-!
# An explicit period-two return chart

The affine chart `w ↦ -w/2` conjugates the two-step quadratic return near
the period-two center to a quartic map. At `c = -1` the charted return maps
the closed half-unit disk strictly inside itself. This is a concrete
restricted return, without a claim of polynomial-like properness or
straightening to another canonical quadratic family.
-/

namespace IntMProof

open Metric Set

/-- The affine seed chart for the period-two return near `c = -1`. -/
noncomputable def periodTwoChart (w : ℂ) : ℂ := -w / 2

/-- The exact charted two-step return at parameter `c`. -/
noncomputable def periodTwoChartReturn (c w : ℂ) : ℂ :=
  -(w ^ 4) / 8 - c * w ^ 2 - 2 * c * (c + 1)

/-- The charted return is exactly conjugate to two original quadratic steps. -/
theorem periodTwoChart_conjugates_return (c w : ℂ) :
    periodTwoChart (periodTwoChartReturn c w) =
      orbit c 2 (periodTwoChart w) := by
  simp only [periodTwoChart, periodTwoChartReturn, orbit_succ, orbit_zero,
    quadratic]
  ring

/-- At the period-two center the charted map is `w² - w⁴/8`. -/
theorem periodTwoChartReturn_center (w : ℂ) :
    periodTwoChartReturn (-1) w = w ^ 2 - w ^ 4 / 8 := by
  simp only [periodTwoChartReturn, neg_mul, one_mul, neg_add_cancel,
    mul_zero, sub_zero]
  ring

/-- The chart maps the half-unit disk bijectively onto the quarter-unit
disk around the critical point. -/
theorem periodTwoChart_mem_closedBall_iff (w : ℂ) :
    periodTwoChart w ∈ closedBall (0 : ℂ) (1 / 4 : ℝ) ↔
      w ∈ closedBall (0 : ℂ) (1 / 2 : ℝ) := by
  simp only [mem_closedBall, dist_zero_right, periodTwoChart, norm_div,
    norm_neg, Complex.norm_two]
  constructor <;> intro h <;> nlinarith

/-- The charted period-two return at `c = -1` maps the closed half-unit
disk strictly into itself. -/
theorem periodTwoChartReturn_center_norm_lt
    (w : ℂ) (hw : ‖w‖ ≤ 1 / 2) :
    ‖periodTwoChartReturn (-1) w‖ < 1 / 2 := by
  rw [periodTwoChartReturn_center]
  have hbound : ‖w ^ 2 - w ^ 4 / 8‖ ≤ ‖w‖ ^ 2 + ‖w‖ ^ 4 / 8 := by
    calc
      ‖w ^ 2 - w ^ 4 / 8‖ ≤ ‖w ^ 2‖ + ‖w ^ 4 / 8‖ := norm_sub_le _ _
      _ = ‖w‖ ^ 2 + ‖w‖ ^ 4 / 8 := by
        rw [norm_pow, norm_div, norm_pow, Complex.norm_ofNat]
  have hquad : ‖w‖ ^ 2 + ‖w‖ ^ 4 / 8 ≤
      (1 / 2 : ℝ) ^ 2 + (1 / 2 : ℝ) ^ 4 / 8 := by
    gcongr
  have hsmall : (1 / 2 : ℝ) ^ 2 + (1 / 2 : ℝ) ^ 4 / 8 < 1 / 2 := by
    norm_num
  exact (hbound.trans hquad).trans_lt hsmall

/-- At `c = -1`, the restricted return is a self-map of the explicit
closed chart disk. -/
theorem periodTwoChartReturn_center_mapsTo :
    MapsTo (periodTwoChartReturn (-1))
      (closedBall (0 : ℂ) (1 / 2 : ℝ))
      (closedBall (0 : ℂ) (1 / 2 : ℝ)) := by
  intro w hw
  rw [mem_closedBall, dist_zero_right] at hw ⊢
  exact (periodTwoChartReturn_center_norm_lt w hw).le

/-- The same chart disk is invariant for a small explicit parameter
neighborhood around `-1`. This is a local return family, with a quartic
term that remains present throughout the neighborhood. -/
theorem periodTwoChartReturn_near_center_norm_lt
    (c w : ℂ) (hc : ‖c + 1‖ ≤ 1 / 64) (hw : ‖w‖ ≤ 1 / 2) :
    ‖periodTwoChartReturn c w‖ < 1 / 2 := by
  have hcsize : ‖c‖ ≤ 65 / 64 := by
    have htriangle := norm_sub_le (c + 1) (1 : ℂ)
    have hone : ‖(1 : ℂ)‖ = 1 := norm_one
    simp only [add_sub_cancel_right, hone] at htriangle
    linarith
  have hbound : ‖periodTwoChartReturn c w‖ ≤
      ‖w‖ ^ 4 / 8 + ‖c‖ * ‖w‖ ^ 2 +
        2 * ‖c‖ * ‖c + 1‖ := by
    have hfirst := norm_sub_le (-(w ^ 4) / 8) (c * w ^ 2)
    have hsecond := norm_sub_le (-(w ^ 4) / 8 - c * w ^ 2)
      (2 * c * (c + 1))
    calc
      ‖periodTwoChartReturn c w‖ =
          ‖-(w ^ 4) / 8 - c * w ^ 2 - 2 * c * (c + 1)‖ := by
        rw [periodTwoChartReturn]
      _ ≤ ‖-(w ^ 4) / 8 - c * w ^ 2‖ + ‖2 * c * (c + 1)‖ :=
        hsecond
      _ ≤ ‖-(w ^ 4) / 8‖ + ‖c * w ^ 2‖ +
          ‖2 * c * (c + 1)‖ := by linarith
      _ = ‖w‖ ^ 4 / 8 + ‖c‖ * ‖w‖ ^ 2 +
          2 * ‖c‖ * ‖c + 1‖ := by
        simp only [norm_div, norm_neg, norm_pow, norm_mul,
          Complex.norm_ofNat]
  calc
    ‖periodTwoChartReturn c w‖ ≤
        ‖w‖ ^ 4 / 8 + ‖c‖ * ‖w‖ ^ 2 +
          2 * ‖c‖ * ‖c + 1‖ := hbound
    _ ≤ (1 / 2 : ℝ) ^ 4 / 8 +
        (65 / 64 : ℝ) * (1 / 2 : ℝ) ^ 2 +
          2 * (65 / 64 : ℝ) * (1 / 64 : ℝ) := by
      gcongr
    _ < 1 / 2 := by norm_num

/-- A parameter inside `‖c+1‖ ≤ 1/64` gives a self-map of the same
closed chart disk. -/
theorem periodTwoChartReturn_near_center_mapsTo
    (c : ℂ) (hc : ‖c + 1‖ ≤ 1 / 64) :
    MapsTo (periodTwoChartReturn c)
      (closedBall (0 : ℂ) (1 / 2 : ℝ))
      (closedBall (0 : ℂ) (1 / 2 : ℝ)) := by
  intro w hw
  rw [mem_closedBall, dist_zero_right] at hw ⊢
  exact (periodTwoChartReturn_near_center_norm_lt c w hc hw).le

end IntMProof
