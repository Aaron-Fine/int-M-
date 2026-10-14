import IntMProof.ParameterJetEnclosure
import Mathlib.Tactic.IntervalCases

/-!
# Third-order disk certificate about parameter minus one (P4)

The critical reference orbit alternates exactly between zero and minus one.
Finite rational enclosure tables retain three positive coefficient orders and
round the shift and error bounds upward to multiples of `2⁻⁴⁰`. Lean checks
all local inequalities through iterate sixteen. These tables certify exact
complex truncation, not any particular machine coefficient/evaluation path.
-/

namespace IntMProof

/-- Exact alternating radii for the critical orbit at parameter minus one. -/
def minusOneJetRadius (n : ℕ) : ℝ := if n % 2 = 0 then 0 else 1

/-- The reference critical orbit alternates exactly between zero and minus one. -/
theorem minusOneJet_orbit (n : ℕ) :
    orbit (-1 : ℂ) n 0 = if n % 2 = 0 then 0 else -1 := by
  induction n with
  | zero => simp [orbit_zero]
  | succ n ih =>
    rw [orbit_succ, ih]
    have hn : n % 2 < 2 := Nat.mod_lt n (by omega)
    by_cases heven : n % 2 = 0
    · have hnext : (n + 1) % 2 ≠ 0 := by omega
      simp [heven, hnext, quadratic]
    · have hnext : (n + 1) % 2 = 0 := by omega
      simp [heven, hnext, quadratic]

/-- Alternating reference radii enclose the orbit at every iterate. -/
theorem minusOneJet_reference_radius (n : ℕ) :
    ‖orbit (-1 : ℂ) n 0‖ ≤ minusOneJetRadius n := by
  rw [minusOneJet_orbit]
  by_cases heven : n % 2 = 0 <;>
    simp [minusOneJetRadius, heven, Complex.norm_def, Complex.normSq_one]

/-- Exact integer caps for the three retained positive orders, through iterate sixteen. -/
def minusOneJetCap (n k : ℕ) : ℝ :=
  match k with
  | 0 => (([0, 1, 3, 1, 3, 1, 3, 1, 3, 1, 3, 1, 3, 1, 3, 1, 3] : List ℕ)[n]?.getD 0 : ℕ)
  | 1 => (([0, 0, 1, 9, 19, 9, 19, 9, 19, 9, 19, 9, 19, 9, 19, 9, 19] : List ℕ)[n]?.getD 0 : ℕ)
  | 2 => (([0, 0, 0, 6, 30, 114, 246, 114, 246, 114, 246, 114, 246, 114, 246,
      114, 246] : List ℕ)[n]?.getD 0 : ℕ)
  | _ + 3 => 0

/-- Shift upper bounds in units of `2⁻⁴⁰`, with zero outside the stored finite table. -/
noncomputable def minusOneJetShift (n : ℕ) : ℝ :=
  ((([0, 4294967296, 12901679104, 4446355712, 13205659503, 4453573571,
    13220153645, 4453921925, 13220853175, 4453938747, 13220886956, 4453939560,
    13220888588, 4453939599, 13220888667, 4453939601, 13220888671] : List ℕ)[n]?.getD 0 : ℕ) : ℝ)
    / 1099511627776

/-- Truncation upper bounds in units of `2⁻⁴⁰`, with zero outside the finite table. -/
noncomputable def minusOneJetError (n : ℕ) : ℝ :=
  ((([0, 0, 0, 256, 24431, 140227, 362797, 488581, 1062328, 505405, 1096112,
    506218, 1097745, 506257, 1097823, 506259, 1097827] : List ℕ)[n]?.getD 0 : ℕ) : ℝ)
    / 1099511627776

/-- All retained cap entries are nonnegative, including unused defaults. -/
theorem minusOneJetCap_nonneg (n k : ℕ) : 0 ≤ minusOneJetCap n k := by
  unfold minusOneJetCap
  split <;> positivity

/-- Every linear-cap row satisfies the outward recurrence before horizon sixteen. -/
theorem minusOneJetCap_linear_step (j : ℕ) (hj : j < 16) :
    2 * minusOneJetRadius j * minusOneJetCap j 0 + 1 ≤ minusOneJetCap (j + 1) 0 := by
  interval_cases j <;> norm_num [minusOneJetRadius, minusOneJetCap]

/-- Every retained higher-order row satisfies its convolution inequality. -/
theorem minusOneJetCap_higher_step (j k : ℕ) (hj : j < 16) (hk : k + 1 < 3) :
    2 * minusOneJetRadius j * minusOneJetCap j (k + 1) +
      ∑ ij ∈ Finset.antidiagonal k, minusOneJetCap j ij.1 * minusOneJetCap j ij.2 ≤
        minusOneJetCap (j + 1) (k + 1) := by
  have hkbound : k ≤ 1 := by omega
  interval_cases j <;> interval_cases k <;>
    norm_num [minusOneJetRadius, minusOneJetCap,
      Finset.Nat.antidiagonal_succ, Finset.Nat.antidiagonal_zero]

/-- Every rounded shift row is an upper bound for the previous quadratic step. -/
theorem minusOneJetShift_step (j : ℕ) (hj : j < 16) :
    2 * minusOneJetRadius j * minusOneJetShift j + minusOneJetShift j ^ 2 +
      (1 / 256 : ℝ) ≤ minusOneJetShift (j + 1) := by
  interval_cases j <;> norm_num [minusOneJetRadius, minusOneJetShift]

/-- Every rounded error row encloses the retained-product forcing and amplification. -/
theorem minusOneJetError_step (j : ℕ) (hj : j < 16) :
    2 * (minusOneJetRadius j + minusOneJetShift j) * minusOneJetError j +
      minusOneJetError j ^ 2 + parameterJetEnclosureForcing minusOneJetCap (1 / 256) j 3 ≤
        minusOneJetError (j + 1) := by
  interval_cases j <;>
    norm_num [minusOneJetRadius, minusOneJetShift, minusOneJetError,
      minusOneJetCap, parameterJetEnclosureForcing, parameterJetDiscardedPairs,
      Finset.sum_filter, Finset.sum_product, Finset.sum_range_succ]

/-- Checked finite tables enclose the third-order error at every stored iterate. -/
theorem minusOneJet_thirdOrder_error_le_enclosure
    (δ : ℂ) (n : ℕ) (hn : n ≤ 16) (hδ : ‖δ‖ ≤ (1 / 256 : ℝ)) :
    ‖parameterJetApproximation (-1) 0 δ n 3 - orbit (-1 + δ) n 0‖ ≤ minusOneJetError n := by
  apply parameterJetApproximation_error_le_enclosure
    (-1) 0 δ minusOneJetRadius minusOneJetCap minusOneJetShift minusOneJetError
    (1 / 256) n 3 hδ
  · exact fun j _ => minusOneJet_reference_radius j
  · exact fun j _ k _ => minusOneJetCap_nonneg j k
  · exact fun j hj _ => minusOneJetCap_linear_step j (by omega)
  · exact fun j hj k hk => minusOneJetCap_higher_step j k (by omega) hk
  · norm_num [minusOneJetShift]
  · exact fun j hj => minusOneJetShift_step j (by omega)
  · norm_num [minusOneJetError]
  · exact fun j hj => minusOneJetError_step j (by omega)

/-- Every stored error row is below the stated uniform finite-prefix cap. -/
theorem minusOneJetError_le (n : ℕ) (hn : n ≤ 16) :
    minusOneJetError n ≤ (1 / 1000000 : ℝ) := by
  interval_cases n <;> norm_num [minusOneJetError]

/-- Third-order exact truncation stays within `1 / 1000000` through iterate sixteen
on the closed complex parameter disk of radius `1 / 256` about minus one. -/
theorem minusOneJet_thirdOrder_error_le
    (δ : ℂ) (n : ℕ) (hn : n ≤ 16) (hδ : ‖δ‖ ≤ (1 / 256 : ℝ)) :
    ‖parameterJetApproximation (-1) 0 δ n 3 - orbit (-1 + δ) n 0‖ ≤ (1 / 1000000 : ℝ) :=
  (minusOneJet_thirdOrder_error_le_enclosure δ n hn hδ).trans (minusOneJetError_le n hn)

/-- The final outward table entry is a checked dyadic rational. -/
theorem minusOneJetError_sixteen :
    minusOneJetError 16 = (1097827 / 1099511627776 : ℝ) := by
  norm_num [minusOneJetError]

end IntMProof
