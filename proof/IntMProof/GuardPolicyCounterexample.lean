import IntMProof.PeriodTwoNeighborhood
import Mathlib.Tactic.NormNum

/-!
# A frozen displacement guard is an attempt filter

The PoC accepts a first-order predictor displacement below `0.01` as a
reason to try transplanting a cycle. This exact example shows that the
filter alone cannot certify continuation of an attracting fixed point.
-/

namespace IntMProof

/-- An exact attracting period-one seed passes the `0.01` predictor guard
for a parameter step that crosses the parabolic parameter `c = 1/4`.
The example is about the attempt guard, not the downstream verifier. -/
theorem displacementGuard_crosses_parabolic_parameter :
    let c : ℂ := 999999 / 4000000
    let z : ℂ := 999 / 2000
    let lam : ℂ := 999 / 1000
    let δ : ℂ := 1 / 200000
    orbit c 1 z = z ∧
      (Polynomial.derivative (seedPolynomial c 1)).eval z = lam ∧
      (Polynomial.derivative
        (parameterPolynomial (Polynomial.C z) 1)).eval c = 1 ∧
      ‖lam‖ < 1 ∧
      ‖((1 : ℂ) / (1 - lam)) * δ‖ < 1 / 100 ∧
      (1 / 4 : ℝ) < (c + δ).re := by
  norm_num [orbit_succ, orbit_zero, quadratic, periodOne_multiplier_formula,
    parameterPolynomial_derivative_succ, fixedSeed_parameter_derivative_zero]

/-- Above the real parabolic parameter, every complex fixed point has
multiplier magnitude greater than one. Thus the guard counterexample really
crosses out of the attracting period-one component. -/
theorem real_above_quarter_fixedPoint_repelling (c : ℝ)
    (hc : 1 / 4 < c) (z : ℂ) (hz : quadratic (c : ℂ) z = z) :
    1 < ‖(Polynomial.derivative (seedPolynomial (c : ℂ) 1)).eval z‖ := by
  have hre := congrArg Complex.re hz
  have him := congrArg Complex.im hz
  simp only [quadratic, Complex.add_re, Complex.add_im, Complex.mul_re,
    Complex.mul_im, Complex.ofReal_re, Complex.ofReal_im] at hre him
  have hy : z.im ≠ 0 := by
    intro hzero
    rw [hzero] at hre
    nlinarith [sq_nonneg (z.re - 1 / 2)]
  have hx : z.re = 1 / 2 := by
    have hprod : z.im * (2 * z.re - 1) = 0 := by nlinarith [him]
    rcases mul_eq_zero.mp hprod with hzero | hzero
    · exact (hy hzero).elim
    · linarith
  rw [periodOne_multiplier_formula]
  have hnormsq : 1 < Complex.normSq (2 * z) := by
    norm_num [Complex.normSq_apply, Complex.mul_re, Complex.mul_im]
    nlinarith [sq_pos_of_ne_zero hy]
  rw [← Complex.sq_norm] at hnormsq
  nlinarith [norm_nonneg (2 * z)]

end IntMProof
