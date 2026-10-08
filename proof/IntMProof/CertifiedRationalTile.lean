import IntMProof.RationalBoxOrbit
import IntMProof.UniformVerdict
import IntMProof.ExactPeriod
import IntMProof.PeriodTwoNeighborhood
import Mathlib.Tactic.NormNum

/-!
# A fully rational finite verifier tile

This is an exact-arithmetic witness for J0/J1: a small rational parameter
rectangle around `-1`, with the critical seed, has a uniformly accepted
period-two *verifier verdict* under the exact rational values of the verifier’s unit-scale thresholds. It
is not an exact-period claim for every parameter and is not a binary64 proof.
-/

namespace IntMProof

/-- Exact rational parameter rectangle about `-1`. -/
def periodTwoRationalTile : RationalBox :=
  { re := ⟨-1 - 1 / 4294967296, -1 + 1 / 4294967296, by norm_num⟩
    im := ⟨-1 / 4294967296, 1 / 4294967296, by norm_num⟩ }

/-- The critical seed as a singleton box. -/
def rationalCriticalBox : RationalBox := rationalPointBox (0, 0)

/-- The squared one-step residual is separated from zero throughout the tile. -/
theorem periodTwoRationalTile_divisor_lower :
    (1 / 1000000000000 : ℚ) ≤
      (rationalBoxClosure periodTwoRationalTile rationalCriticalBox 1).normSqLower := by
  norm_num [periodTwoRationalTile, rationalCriticalBox, rationalBoxClosure,
    rationalBoxOrbit, rationalBoxStep, rationalBoxSub, rationalIntervalSub,
    rationalPointBox, RationalBox.normSqLower, RationalInterval.absLower,
    RationalInterval.absUpper]

/-- The squared two-step residual is accepted throughout the tile. -/
theorem periodTwoRationalTile_closure_upper :
    (rationalBoxClosure periodTwoRationalTile rationalCriticalBox 2).normSqUpper ≤
      (1 / 10000000000000000 : ℚ) := by
  norm_num [periodTwoRationalTile, rationalCriticalBox, rationalBoxClosure,
    rationalBoxOrbit, rationalBoxStep, rationalBoxSub, rationalIntervalSub,
    rationalPointBox, RationalBox.normSqUpper, RationalInterval.absUpper,
    RationalInterval.absLower]

/-- Exact rational critical-orbit residual square. -/
def rationalCriticalResidualSq (c : RationalComplex) (n : ℕ) : ℚ :=
  let u := rationalOrbit c n (0, 0)
  rationalNormSq u

/-- Exact rational critical multiplier square vanishes for every positive
iterate because the first seed-derivative factor is zero. -/
theorem rationalCriticalMultiplierSq_zero (c : RationalComplex) (n : ℕ)
    (hn : 0 < n) : rationalNormSq (rationalMultiplier c (0, 0) n) = 0 := by
  cases n with
  | zero => omega
  | succ n =>
    have hzero : rationalMultiplier c (0, 0) (n + 1) = (0, 0) := by
      induction n with
      | zero =>
        simp [rationalMultiplier, rationalComplexMul,
          rationalComplexDouble, rationalOrbit]
      | succ n ih =>
        change rationalComplexMul
          (rationalComplexDouble (rationalOrbit c (n + 1) (0, 0)))
          (rationalMultiplier c (0, 0) (n + 1)) = (0, 0)
        rw [ih (Nat.zero_lt_succ n)]
        simp [rationalComplexMul]
    simp [hzero, rationalNormSq]

/-- The exact rational residual square of a tile point is bounded at both
relevant verifier frames. -/
theorem periodTwoRationalTile_residual_margins (c : RationalComplex)
    (hc : periodTwoRationalTile.contains (rationalComplexEmbed c)) :
    (1 / 1000000000000 : ℚ) ≤ rationalCriticalResidualSq c 1 ∧
      rationalCriticalResidualSq c 2 ≤ (1 / 10000000000000000 : ℚ) := by
  have hz := rationalPointBox_contains (0, 0)
  have hlo := rationalBoxClosure_normSq_ge periodTwoRationalTile
    rationalCriticalBox (rationalComplexEmbed c) (rationalComplexEmbed (0, 0))
    hc hz 1
  have hhi := rationalBoxClosure_normSq_le periodTwoRationalTile
    rationalCriticalBox (rationalComplexEmbed c) (rationalComplexEmbed (0, 0))
    hc hz 2
  rw [← rationalOrbit_residualSq_embed] at hlo hhi
  simp only [sub_zero, rationalCriticalResidualSq] at hlo hhi ⊢
  constructor
  · have hbox : ((1 / 1000000000000 : ℚ) : ℝ) ≤
        ((rationalBoxClosure periodTwoRationalTile rationalCriticalBox 1).normSqLower : ℝ) :=
      by exact_mod_cast periodTwoRationalTile_divisor_lower
    exact_mod_cast hbox.trans hlo
  · have hbox :
        ((rationalBoxClosure periodTwoRationalTile rationalCriticalBox 2).normSqUpper : ℝ) ≤
          ((1 / 10000000000000000 : ℚ) : ℝ) :=
      by exact_mod_cast periodTwoRationalTile_closure_upper
    exact_mod_cast hhi.trans hbox

/-- The exact unit-scale rational values of the frozen closure and attraction
cutoffs. The implementation's floating-point evaluation is a separate issue. -/
def periodTwoTileThresholds : Verifier.Thresholds where
  acceptSquared := 1 / 10000000000000000
  excludeSquared := 1 / 1000000000000
  attractUpper := 999999999999 / 1000000000000
  accept_lt_exclude := by norm_num

/-- The rational verifier frame of the critical orbit. Its formal multiplier
is zero at every positive iterate. -/
def rationalCriticalFrame (c : RationalComplex) (n : ℕ) : Verifier.Frame Unit where
  residualSquared := rationalCriticalResidualSq c n
  multiplierMagnitude := 0
  fields := ()

theorem rationalCriticalFrame_multiplier_exact (c : RationalComplex) (n : ℕ)
    (hn : 0 < n) :
    ((rationalCriticalFrame c n).multiplierMagnitude : ℝ) =
      ‖(Polynomial.derivative
        (seedPolynomial (rationalComplexEmbed c) n)).eval
        (rationalComplexEmbed (0, 0))‖ := by
  have hs := rationalCriticalMultiplierSq_zero c n hn
  have hemb := rationalMultiplier_normSq_embed c (0, 0) n
  rw [hs] at hemb
  simp only [Rat.cast_zero] at hemb
  have hz : (Polynomial.derivative
        (seedPolynomial (rationalComplexEmbed c) n)).eval
        (rationalComplexEmbed (0, 0)) = 0 := by
    exact Complex.normSq_eq_zero.mp hemb.symm
  simp [rationalCriticalFrame, hz]

/-- The exact rational V1 verifier accepts period two at every rational
parameter in the certified box. This is a verifier verdict, not exact
critical periodicity for every point of the box. -/
theorem periodTwoRationalTile_inline_accepts (c : RationalComplex)
    (hc : periodTwoRationalTile.contains (rationalComplexEmbed c))
    (iterations evidence : ℕ) (old : Verifier.Record Unit) :
    (Verifier.inline periodTwoTileThresholds (rationalCriticalFrame c)
      2 iterations evidence old).1 = .accepted ∧
    (Verifier.inline periodTwoTileThresholds (rationalCriticalFrame c)
      2 iterations evidence old).2.period = 2 := by
  obtain ⟨hdiv, hclose⟩ := periodTwoRationalTile_residual_margins c hc
  have hproper : Verifier.properDivisors 2 = [1] := by decide
  have hnotdiv : ¬ rationalCriticalResidualSq c 1 <
      periodTwoTileThresholds.excludeSquared := not_lt.mpr hdiv
  have hnotclose : ¬ rationalCriticalResidualSq c 2 >
      periodTwoTileThresholds.acceptSquared := not_lt.mpr hclose
  have hnotexclude : ¬ rationalCriticalResidualSq c 2 >
      periodTwoTileThresholds.excludeSquared := by
    exact not_lt.mpr (hclose.trans periodTwoTileThresholds.accept_lt_exclude.le)
  have hnotacceptdiv : ¬ rationalCriticalResidualSq c 1 ≤
      periodTwoTileThresholds.acceptSquared := by
    exact not_le.mpr (lt_of_lt_of_le
      periodTwoTileThresholds.accept_lt_exclude hdiv)
  simp only [Verifier.inline, Verifier.decide, if_neg (by decide : (2 : ℕ) ≠ 0),
    rationalCriticalFrame, hnotexclude, hnotclose, hproper,
    Verifier.inlineReduction, hnotacceptdiv, hnotdiv, Verifier.finish]
  norm_num [periodTwoTileThresholds]

/-- The reference exact-rational verifier makes the same decision on the tile. -/
theorem periodTwoRationalTile_reference_accepts (c : RationalComplex)
    (hc : periodTwoRationalTile.contains (rationalComplexEmbed c))
    (iterations evidence : ℕ) (old : Verifier.Record Unit) :
    (Verifier.reference periodTwoTileThresholds (rationalCriticalFrame c)
      2 iterations evidence old).1 = .accepted ∧
    (Verifier.reference periodTwoTileThresholds (rationalCriticalFrame c)
      2 iterations evidence old).2.period = 2 := by
  rw [← Verifier.inline_eq_reference]
  exact periodTwoRationalTile_inline_accepts c hc iterations evidence old

/-- A rational point in the accepted tile whose critical orbit is not exactly
periodic. This records the boundary between a tolerance verdict and E2. -/
theorem periodTwoRationalTile_contains_nonperiodic :
    ∃ c : RationalComplex,
      periodTwoRationalTile.contains (rationalComplexEmbed c) ∧
      Function.minimalPeriod (quadratic (rationalComplexEmbed c)) (0 : ℂ) ≠ 2 := by
  refine ⟨(-1 + 1 / 4294967296, 0), ?_, ?_⟩
  · norm_num [periodTwoRationalTile, RationalBox.contains,
      RationalInterval.contains, rationalComplexEmbed]
  · intro hperiod
    have hclose := (exactPeriod_iff_first_return
      (quadratic (rationalComplexEmbed (-1 + 1 / 4294967296, 0)))
      (0 : ℂ) 2 (by decide)).1 hperiod |>.1
    have hnot : orbit (rationalComplexEmbed (-1 + 1 / 4294967296, 0))
        2 (0 : ℂ) ≠ 0 := by
      intro h
      have hre := congrArg Complex.re h
      norm_num [orbit_succ, orbit_zero, quadratic, rationalComplexEmbed,
        Complex.mul_re, Complex.add_re] at hre
    exact hnot hclose

/-- The rational verifier tile lies inside the independently certified
complex parameter disk for the primitive period-two trap. -/
theorem periodTwoRationalTile_near_minusOne (c : ℂ)
    (hc : periodTwoRationalTile.contains c) :
    ‖c + 1‖ ≤ 1 / 1024 := by
  rcases hc with ⟨⟨hrelo, hrehi⟩, ⟨himlo, himhi⟩⟩
  have hrelo' : -(1 / 4294967296 : ℝ) ≤ c.re + 1 := by
    norm_num [periodTwoRationalTile, RationalInterval.contains] at hrelo
    linarith
  have hrehi' : c.re + 1 ≤ (1 / 4294967296 : ℝ) := by
    norm_num [periodTwoRationalTile, RationalInterval.contains] at hrehi
    linarith
  have himlo' : -(1 / 4294967296 : ℝ) ≤ c.im := by
    norm_num [periodTwoRationalTile, RationalInterval.contains] at himlo
    exact himlo
  have himhi' : c.im ≤ (1 / 4294967296 : ℝ) := by
    norm_num [periodTwoRationalTile, RationalInterval.contains] at himhi
    exact himhi
  have hsq : Complex.normSq (c + 1) ≤
      2 * (1 / 4294967296 : ℝ) ^ 2 := by
    simp only [Complex.normSq_apply, Complex.add_re, Complex.add_im,
      Complex.one_re, Complex.one_im, add_zero]
    nlinarith [sq_nonneg (c.re + 1 / 4294967296),
      sq_nonneg (c.re - 1 / 4294967296),
      sq_nonneg (c.im + 1 / 4294967296),
      sq_nonneg (c.im - 1 / 4294967296)]
  rw [← Complex.sq_norm] at hsq
  nlinarith [norm_nonneg (c + 1)]

/-- Every complex parameter in the rational rectangle has the certified
primitive attracting period-two trap, even when its coordinates are irrational. -/
theorem periodTwoRationalTile_complex_trap (c : ℂ)
    (hc : periodTwoRationalTile.contains c) :
    ∃! ζ : ℂ, ζ ∈ Metric.closedBall (0 : ℂ) (1 / 16 : ℝ) ∧
      Function.minimalPeriod (quadratic c) ζ = 2 ∧
      ‖(Polynomial.derivative (seedPolynomial c 2)).eval ζ‖ ≤ 1 / 2 ∧
      ∀ m : ℕ, orbit c (2 + m * 2) 0 ∈
          Metric.closedBall (0 : ℂ) (1 / 16 : ℝ) ∧
        dist (orbit c (2 + m * 2) 0) ζ ≤
          (1 / 2 : ℝ) ^ m * dist (orbit c 2 0) ζ := by
  exact periodTwo_near_minusOne_primitive_trap c
    (periodTwoRationalTile_near_minusOne c hc)

end IntMProof
