import IntMProof.Branch
import IntMProof.Symmetry
import Mathlib.Tactic.FieldSimp

/-!
# Logistic conjugacy (M1)

For nonzero `a`, the affine chart `h(w) = a(1/2-w)` conjugates the logistic
map `w ↦ a w(1-w)` to the canonical quadratic at `c = a/2-a²/4`.
-/

namespace IntMProof

open Polynomial

/-- The logistic family on the complex plane. -/
def logistic (a w : ℂ) : ℂ := a * w * (1 - w)

/-- The associated canonical quadratic parameter. -/
noncomputable def logisticParameter (a : ℂ) : ℂ := a / 2 - a ^ 2 / 4

/-- An invertible affine logistic-to-quadratic chart. -/
noncomputable def logisticChart (a : ℂ) (ha : a ≠ 0) : ℂ ≃ ℂ where
  toFun w := a * (1 / 2 - w)
  invFun z := 1 / 2 - z / a
  left_inv w := by
    dsimp
    field_simp [ha]
    ring
  right_inv z := by
    dsimp
    field_simp [ha]
    ring

/-- The chart intertwines one logistic step with one quadratic step. -/
theorem logisticChart_step (a w : ℂ) (ha : a ≠ 0) :
    logisticChart a ha (logistic a w) =
      quadratic (logisticParameter a) (logisticChart a ha w) := by
  change a * (1 / 2 - logistic a w) =
    quadratic (logisticParameter a) (a * (1 / 2 - w))
  simp only [logistic, logisticParameter, quadratic]
  ring

/-- The quadratic is exactly the transported logistic map. -/
theorem logisticChart_transport (a : ℂ) (ha : a ≠ 0) :
    transport (logisticChart a ha) (logistic a) =
      quadratic (logisticParameter a) := by
  funext z
  let w := (logisticChart a ha).symm z
  have hz : logisticChart a ha w = z := (logisticChart a ha).apply_symm_apply z
  change logisticChart a ha (logistic a w) = quadratic (logisticParameter a) z
  rw [← hz]
  exact logisticChart_step a w ha

/-- Every logistic iterate maps to the corresponding quadratic iterate. -/
theorem logisticChart_orbit (a w : ℂ) (ha : a ≠ 0) (n : ℕ) :
    logisticChart a ha ((logistic a)^[n] w) =
      orbit (logisticParameter a) n (logisticChart a ha w) := by
  rw [orbit, ← logisticChart_transport a ha]
  exact (transport_orbit (logisticChart a ha) (logistic a) w n).symm

/-- The logistic and transported quadratic orbits have the same minimal period. -/
theorem logisticChart_minimalPeriod (a w : ℂ) (ha : a ≠ 0) :
    Function.minimalPeriod (logistic a) w =
      Function.minimalPeriod (quadratic (logisticParameter a))
        (logisticChart a ha w) := by
  rw [← logisticChart_transport a ha]
  exact (transport_minimalPeriod (logisticChart a ha) (logistic a) w).symm

/-- The logistic multiplier recurrence along the seed orbit. -/
def logisticMultiplier (a w : ℂ) : ℕ → ℂ
  | 0 => 1
  | n + 1 => a * (1 - 2 * (logistic a)^[n] w) * logisticMultiplier a w n

/-- The logistic iterate as a polynomial in its seed. -/
noncomputable def logisticSeedPolynomial (a : ℂ) : ℕ → ℂ[X]
  | 0 => X
  | n + 1 =>
      let p := logisticSeedPolynomial a n
      C a * p * (1 - p)

/-- Evaluating the logistic seed polynomial gives the exact iterate. -/
theorem logisticSeedPolynomial_eval (a w : ℂ) (n : ℕ) :
    (logisticSeedPolynomial a n).eval w = (logistic a)^[n] w := by
  induction n with
  | zero => simp [logisticSeedPolynomial]
  | succ n ih =>
    simp only [logisticSeedPolynomial, eval_mul, eval_C, eval_sub, eval_one, ih]
    rw [Function.iterate_succ_apply']
    rfl

/-- The logistic multiplier recurrence is its formal seed derivative. -/
theorem logisticSeedPolynomial_derivative (a w : ℂ) (n : ℕ) :
    (derivative (logisticSeedPolynomial a n)).eval w =
      logisticMultiplier a w n := by
  induction n with
  | zero => simp [logisticSeedPolynomial, logisticMultiplier]
  | succ n ih =>
    simp only [logisticSeedPolynomial, derivative_mul, derivative_sub,
      derivative_one, derivative_C, eval_add, eval_mul,
      eval_sub, eval_zero, eval_C, eval_one, logisticSeedPolynomial_eval, ih]
    rw [logisticMultiplier]
    ring

/-- Affine conjugacy preserves the return multiplier, including its phase. -/
theorem logisticChart_multiplier (a w : ℂ) (ha : a ≠ 0) (n : ℕ) :
    (derivative (seedPolynomial (logisticParameter a) n)).eval (logisticChart a ha w) =
      logisticMultiplier a w n := by
  induction n with
  | zero => simp [seedPolynomial_derivative_zero, logisticMultiplier]
  | succ n ih =>
    rw [seedPolynomial_derivative_succ, logisticMultiplier, ih]
    rw [← logisticChart_orbit a w ha n]
    change 2 * (a * (1 / 2 - (logistic a)^[n] w)) *
        logisticMultiplier a w n =
      a * (1 - 2 * (logistic a)^[n] w) * logisticMultiplier a w n
    ring

/-- The logistic parameters `a` and `2 - a` map to the same quadratic parameter. -/
theorem logisticParameter_reflect (a : ℂ) :
    logisticParameter (2 - a) = logisticParameter a := by
  simp only [logisticParameter]
  ring

/-- The two nondegenerate logistic maps above one quadratic parameter have
corresponding exact periods under their affine charts. -/
theorem logistic_reflection_minimalPeriod (a w : ℂ)
    (ha : a ≠ 0) (hb : 2 - a ≠ 0) :
    Function.minimalPeriod (logistic a) w =
      Function.minimalPeriod (logistic (2 - a))
        ((logisticChart (2 - a) hb).symm (logisticChart a ha w)) := by
  rw [logisticChart_minimalPeriod a w ha,
    logisticChart_minimalPeriod (2 - a) _ hb,
    logisticParameter_reflect]
  simp

/-- The same correspondence preserves the full complex return multiplier. -/
theorem logistic_reflection_multiplier (a w : ℂ) (n : ℕ)
    (ha : a ≠ 0) (hb : 2 - a ≠ 0) :
    logisticMultiplier a w n =
      logisticMultiplier (2 - a)
        ((logisticChart (2 - a) hb).symm (logisticChart a ha w)) n := by
  rw [← logisticChart_multiplier a w ha n,
    ← logisticChart_multiplier (2 - a)
      ((logisticChart (2 - a) hb).symm (logisticChart a ha w)) hb n,
    logisticParameter_reflect]
  simp

end IntMProof
