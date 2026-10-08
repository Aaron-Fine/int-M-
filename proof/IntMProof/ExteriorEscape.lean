import IntMProof.Quadratic
import Mathlib.Analysis.Complex.Basic
import Mathlib.Analysis.SpecialFunctions.Log.Basic
import Mathlib.Analysis.SpecificLimits.Basic
import Mathlib.Tactic.Linarith
import Mathlib.Topology.Algebra.InfiniteSum.Real
import Mathlib.Order.Filter.AtTopBot.Basic

/-!
# Explicit exterior escape bound

The radius `‖c‖ + 2` is a conservative exterior region for the quadratic
map. Once an orbit reaches this radius, its norm doubles on every step.
The two-sided square-growth bound yields a summable normalized-log increment,
so the escape-rate limit exists after finite exterior entry. External angles
and numerical entry certificates remain separate.
-/

namespace IntMProof

/-- Outside radius `‖c‖ + 2`, one quadratic step at least doubles the norm. -/
theorem quadratic_norm_ge_two_mul
    (c z : ℂ) (h : ‖c‖ + 2 ≤ ‖z‖) : 2 * ‖z‖ ≤ ‖quadratic c z‖ := by
  have hlower : ‖z‖ ^ 2 ≤ ‖quadratic c z‖ + ‖c‖ := by
    have hnorm := norm_sub_le (quadratic c z) c
    simpa only [quadratic, add_sub_cancel_right, norm_mul, pow_two] using hnorm
  have hnonneg : 0 ≤ ‖c‖ := norm_nonneg _
  have hprod : 0 ≤ (‖z‖ - 1) * (‖z‖ - 2) := by
    apply mul_nonneg <;> linarith
  nlinarith

/-- On the same exterior region, the next norm lies between half and twice
the square of the current norm. -/
theorem quadratic_norm_square_bounds
    (c z : ℂ) (h : ‖c‖ + 2 ≤ ‖z‖) :
    ‖z‖ ^ 2 / 2 ≤ ‖quadratic c z‖ ∧
      ‖quadratic c z‖ ≤ 2 * ‖z‖ ^ 2 := by
  have hlower : ‖z‖ ^ 2 ≤ ‖quadratic c z‖ + ‖c‖ := by
    have hnorm := norm_sub_le (quadratic c z) c
    simpa only [quadratic, add_sub_cancel_right, norm_mul, pow_two] using hnorm
  have hupper : ‖quadratic c z‖ ≤ ‖z‖ ^ 2 + ‖c‖ := by
    simpa only [quadratic, norm_mul, pow_two] using norm_add_le (z * z) c
  have hnonneg : 0 ≤ ‖c‖ := norm_nonneg _
  have hprod₂ : 0 ≤ ‖z‖ * (‖z‖ - 2) := by
    apply mul_nonneg (norm_nonneg _)
    linarith
  have hprod₁ : 0 ≤ ‖z‖ * (‖z‖ - 1) := by
    apply mul_nonneg (norm_nonneg _)
    linarith
  constructor <;> nlinarith

/-- An orbit that reaches the exterior region stays there. -/
theorem orbit_norm_ge_escape_radius
    (c z : ℂ) (n : ℕ) (h : ‖c‖ + 2 ≤ ‖z‖) :
    ‖c‖ + 2 ≤ ‖orbit c n z‖ := by
  induction n with
  | zero => simpa only [orbit_zero] using h
  | succ n ih =>
    rw [orbit_succ]
    have hdouble := quadratic_norm_ge_two_mul c (orbit c n z) ih
    nlinarith [norm_nonneg c]

/-- After reaching the exterior region, the norm grows by at least a
factor of `2 ^ n` after `n` additional steps. -/
theorem orbit_norm_ge_two_pow_mul
    (c z : ℂ) (n : ℕ) (h : ‖c‖ + 2 ≤ ‖z‖) :
    2 ^ n * ‖z‖ ≤ ‖orbit c n z‖ := by
  induction n with
  | zero => simp
  | succ n ih =>
    rw [orbit_succ]
    have hr := orbit_norm_ge_escape_radius c z n h
    have hdouble := quadratic_norm_ge_two_mul c (orbit c n z) hr
    calc
      2 ^ (n + 1) * ‖z‖ = 2 * (2 ^ n * ‖z‖) := by rw [pow_succ]; ring
      _ ≤ 2 * ‖orbit c n z‖ := mul_le_mul_of_nonneg_left ih (by norm_num)
      _ ≤ ‖quadratic c (orbit c n z)‖ := hdouble

/-- Two-sided square growth holds at every finite step after exterior entry. -/
theorem orbit_norm_square_bounds_after_entry
    (c z : ℂ) (n : ℕ) (h : ‖c‖ + 2 ≤ ‖z‖) :
    ‖orbit c n z‖ ^ 2 / 2 ≤ ‖orbit c (n + 1) z‖ ∧
      ‖orbit c (n + 1) z‖ ≤ 2 * ‖orbit c n z‖ ^ 2 := by
  rw [orbit_succ]
  exact quadratic_norm_square_bounds c (orbit c n z)
    (orbit_norm_ge_escape_radius c z n h)

/-- The logarithmic growth per step differs from exact squaring by at most
`log 2`. This is the finite-iterate estimate behind convergence of the
normalized escape-rate sequence. -/
theorem orbit_log_square_error_le
    (c z : ℂ) (n : ℕ) (h : ‖c‖ + 2 ≤ ‖z‖) :
    |Real.log ‖orbit c (n + 1) z‖ -
      2 * Real.log ‖orbit c n z‖| ≤ Real.log 2 := by
  obtain ⟨hlo, hhi⟩ := orbit_norm_square_bounds_after_entry c z n h
  have hr := orbit_norm_ge_escape_radius c z n h
  have hpos : 0 < ‖orbit c n z‖ := by
    have hc : 0 ≤ ‖c‖ := norm_nonneg _
    linarith
  have hnextpos : 0 < ‖orbit c (n + 1) z‖ := by
    have hsq : 0 < ‖orbit c n z‖ ^ 2 := sq_pos_of_pos hpos
    linarith
  have hlog_upper : Real.log ‖orbit c (n + 1) z‖ ≤
      Real.log 2 + 2 * Real.log ‖orbit c n z‖ := by
    calc
      Real.log ‖orbit c (n + 1) z‖ ≤
          Real.log (2 * ‖orbit c n z‖ ^ 2) :=
        Real.log_le_log hnextpos hhi
      _ = Real.log 2 + 2 * Real.log ‖orbit c n z‖ := by
        rw [Real.log_mul (by norm_num : (2 : ℝ) ≠ 0) (pow_ne_zero 2 hpos.ne'),
          Real.log_pow]
        norm_num
  have hlog_lower : 2 * Real.log ‖orbit c n z‖ ≤
      Real.log 2 + Real.log ‖orbit c (n + 1) z‖ := by
    have hsq_le : ‖orbit c n z‖ ^ 2 ≤ 2 * ‖orbit c (n + 1) z‖ := by
      linarith
    have hlog := Real.log_le_log (sq_pos_of_pos hpos) hsq_le
    rw [Real.log_pow,
      Real.log_mul (by norm_num : (2 : ℝ) ≠ 0) hnextpos.ne'] at hlog
    exact hlog
  rw [abs_le]
  constructor <;> linarith

/-- The normalized finite escape-rate approximants have geometrically
decreasing successive changes once the orbit is exterior. -/
theorem orbit_normalized_log_increment_le
    (c z : ℂ) (n : ℕ) (h : ‖c‖ + 2 ≤ ‖z‖) :
    |Real.log ‖orbit c (n + 1) z‖ / (2 : ℝ) ^ (n + 1) -
      Real.log ‖orbit c n z‖ / (2 : ℝ) ^ n| ≤
      Real.log 2 / (2 : ℝ) ^ (n + 1) := by
  have hpow : 0 < (2 : ℝ) ^ (n + 1) := pow_pos (by norm_num) _
  have hpow0 : (2 : ℝ) ^ n ≠ 0 := pow_ne_zero _ (by norm_num)
  have heq : Real.log ‖orbit c (n + 1) z‖ / (2 : ℝ) ^ (n + 1) -
      Real.log ‖orbit c n z‖ / (2 : ℝ) ^ n =
      (Real.log ‖orbit c (n + 1) z‖ -
        2 * Real.log ‖orbit c n z‖) / (2 : ℝ) ^ (n + 1) := by
    rw [pow_succ]
    field_simp
  rw [heq, abs_div, abs_of_pos hpow]
  exact div_le_div_of_nonneg_right (orbit_log_square_error_le c z n h) hpow.le

/-- The normalized logarithmic orbit norm converges for every exterior seed.
This constructs the escape-rate value on the explicit exterior region. -/
theorem exists_escapeRate_of_escape_radius
    (c z : ℂ) (h : ‖c‖ + 2 ≤ ‖z‖) :
    ∃ g : ℝ, Filter.Tendsto
      (fun n : ℕ => Real.log ‖orbit c n z‖ / (2 : ℝ) ^ n)
      Filter.atTop (nhds g) := by
  have hgeom : Summable (fun n : ℕ => (1 / 2 : ℝ) ^ n) :=
    summable_geometric_of_lt_one (by norm_num) (by norm_num)
  have hshift : Summable (fun n : ℕ => (1 / 2 : ℝ) ^ (n + 1)) := by
    simpa only [Nat.add_comm] using (summable_nat_add_iff 1).2 hgeom
  have hsummable : Summable (fun n : ℕ =>
      Real.log 2 / (2 : ℝ) ^ (n + 1)) := by
    have heq : (fun n : ℕ => Real.log 2 / (2 : ℝ) ^ (n + 1)) =
        (fun n : ℕ => Real.log 2 * (1 / 2 : ℝ) ^ (n + 1)) := by
      funext n
      simp [div_eq_mul_inv, inv_pow]
    rw [heq]
    exact hshift.mul_left (Real.log 2)
  have hcauchy : CauchySeq (fun n : ℕ =>
      Real.log ‖orbit c n z‖ / (2 : ℝ) ^ n) := by
    apply cauchySeq_of_dist_le_of_summable
      (fun n : ℕ => Real.log 2 / (2 : ℝ) ^ (n + 1))
    · intro n
      rw [Real.dist_eq, abs_sub_comm]
      exact orbit_normalized_log_increment_le c z n h
    · exact hsummable
  exact cauchySeq_tendsto_of_complete hcauchy

/-- Entry may occur after an arbitrary finite critical-orbit prefix. -/
theorem critical_orbit_norm_ge_after_entry
    (c : ℂ) (k m : ℕ) (h : ‖c‖ + 2 ≤ ‖orbit c k 0‖) :
    2 ^ m * ‖orbit c k 0‖ ≤ ‖orbit c (k + m) 0‖ := by
  rw [orbit_add]
  exact orbit_norm_ge_two_pow_mul c (orbit c k 0) m h

/-- A critical orbit which reaches the exterior region has a convergent
normalized logarithmic escape rate, including its finite prefix. -/
theorem exists_critical_escapeRate_of_entry
    (c : ℂ) (k : ℕ) (h : ‖c‖ + 2 ≤ ‖orbit c k 0‖) :
    ∃ g : ℝ, Filter.Tendsto
      (fun n : ℕ => Real.log ‖orbit c n 0‖ / (2 : ℝ) ^ n)
      Filter.atTop (nhds g) := by
  obtain ⟨g, hg⟩ := exists_escapeRate_of_escape_radius c (orbit c k 0) h
  refine ⟨g / (2 : ℝ) ^ k, ?_⟩
  apply (Filter.tendsto_add_atTop_iff_nat k).1
  have hscaled := hg.div_const ((2 : ℝ) ^ k)
  convert hscaled using 1
  funext n
  simp only [Nat.add_comm n k, orbit_add, pow_add]
  field_simp

end IntMProof
