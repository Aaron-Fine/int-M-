import IntMProof.Quadratic
import Mathlib.Algebra.BigOperators.Group.Finset.Basic
import Mathlib.Algebra.Polynomial.Derivative

/-! # E1: formal orbit derivatives over a commutative ring. -/
namespace IntMProof
open Polynomial
variable {R : Type*} [CommRing R]

/-- Orbit polynomial in the initial seed, with fixed parameter. -/
noncomputable def seedPolynomial (c : R) : ℕ → R[X]
  | 0 => X
  | n + 1 => let p := seedPolynomial c n; p * p + C c

/-- Orbit polynomial in the parameter, from a possibly varying seed. -/
noncomputable def parameterPolynomial (seed : R[X]) : ℕ → R[X]
  | 0 => seed
  | n + 1 => let p := parameterPolynomial seed n; p * p + X

theorem seedPolynomial_eval (c z : R) (n : ℕ) :
    (seedPolynomial c n).eval z = orbit c n z := by
  induction n with
  | zero => simp [seedPolynomial, orbit]
  | succ n ih => simp [seedPolynomial, orbit_succ, quadratic, ih]

theorem parameterPolynomial_eval (seed : R[X]) (c : R) (n : ℕ) :
    (parameterPolynomial seed n).eval c = orbit c n (seed.eval c) := by
  induction n with
  | zero => simp [parameterPolynomial, orbit]
  | succ n ih => simp [parameterPolynomial, orbit_succ, quadratic, ih]

/-- Seed derivative `D₀ = 1`. -/
theorem seedPolynomial_derivative_zero (c z : R) :
    (derivative (seedPolynomial c 0)).eval z = 1 := by
  simp [seedPolynomial]

/-- Seed derivative `Dₙ₊₁ = 2 zₙ Dₙ`. -/
theorem seedPolynomial_derivative_succ (c z : R) (n : ℕ) :
    (derivative (seedPolynomial c (n + 1))).eval z =
      2 * orbit c n z * (derivative (seedPolynomial c n)).eval z := by
  simp only [seedPolynomial, derivative_add, derivative_mul, derivative_C,
    add_zero, eval_add, eval_mul, seedPolynomial_eval]
  ring

/-- The seed derivative equals the product of the per-step factors `2 zₖ`.
That product is the formal multiplier of the `n`th iterate. -/
theorem seedPolynomial_derivative_eval_prod (c z : R) (n : ℕ) :
    (derivative (seedPolynomial c n)).eval z =
      ∏ k ∈ Finset.range n, (2 * orbit c k z) := by
  symm
  refine Finset.prod_range_induction (fun k => 2 * orbit c k z)
      (fun m => (derivative (seedPolynomial c m)).eval z) ?_ n ?_
  · simp [seedPolynomial_derivative_zero]
  · intro k _
    rw [seedPolynomial_derivative_succ, mul_comm]

/-- A varying seed contributes its own parameter derivative at `n = 0`. -/
theorem parameterPolynomial_derivative_zero (seed : R[X]) (c : R) :
    (derivative (parameterPolynomial seed 0)).eval c = (derivative seed).eval c := by
  rfl

/-- Parameter derivative `Bₙ₊₁ = 2 zₙ Bₙ + 1`. -/
theorem parameterPolynomial_derivative_succ (seed : R[X]) (c : R) (n : ℕ) :
    (derivative (parameterPolynomial seed (n + 1))).eval c =
      2 * orbit c n (seed.eval c) * (derivative (parameterPolynomial seed n)).eval c + 1 := by
  simp only [parameterPolynomial, derivative_add, derivative_mul, derivative_X,
    eval_add, eval_mul, eval_one, parameterPolynomial_eval]
  ring

theorem fixedSeed_parameter_derivative_zero (z c : R) :
    (derivative (parameterPolynomial (C z) 0)).eval c = 0 := by
  simp [parameterPolynomial]
end IntMProof
