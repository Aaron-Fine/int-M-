import IntMProof.Derivatives
import IntMProof.Perturbation

/-! # P4: second-order fixed-seed parameter jets

The linear coefficient is the formal parameter derivative already established
in `Derivatives`. The quadratic coefficient follows a division-free recurrence.
Its double is the evaluated second formal derivative, including in rings where
`2` is not invertible. In characteristic two, that doubled-derivative identity
alone does not identify the coefficient; the recurrence defines it. The
approximation and remainder identities below are exact algebra; they do not
give a norm bound or an acceptance criterion.
-/

namespace IntMProof

open Polynomial

variable {R : Type*} [CommRing R]

/-- Linear parameter coefficient of the orbit with seed held fixed. -/
noncomputable def parameterJetLinear (c z : R) (n : ℕ) : R :=
  (derivative (parameterPolynomial (C z) n)).eval c

/-- The initial seed does not vary with the parameter. -/
@[simp] theorem parameterJetLinear_zero (c z : R) :
    parameterJetLinear c z 0 = 0 := by
  exact fixedSeed_parameter_derivative_zero z c

/-- Linear parameter coefficient recurrence `Bₙ₊₁ = 2 zₙ Bₙ + 1`. -/
theorem parameterJetLinear_succ (c z : R) (n : ℕ) :
    parameterJetLinear c z (n + 1) =
      2 * orbit c n z * parameterJetLinear c z n + 1 := by
  simpa only [parameterJetLinear, eval_C] using
    parameterPolynomial_derivative_succ (C z) c n

/-- Quadratic parameter coefficient, defined without dividing by two. -/
noncomputable def parameterJetQuadratic (c z : R) : ℕ → R
  | 0 => 0
  | n + 1 =>
    2 * orbit c n z * parameterJetQuadratic c z n + parameterJetLinear c z n ^ 2

/-- There is no quadratic parameter contribution in the fixed initial seed. -/
@[simp] theorem parameterJetQuadratic_zero (c z : R) :
    parameterJetQuadratic c z 0 = 0 := rfl

/-- Quadratic parameter coefficient recurrence `Cₙ₊₁ = 2 zₙ Cₙ + Bₙ²`. -/
theorem parameterJetQuadratic_succ (c z : R) (n : ℕ) :
    parameterJetQuadratic c z (n + 1) =
      2 * orbit c n z * parameterJetQuadratic c z n + parameterJetLinear c z n ^ 2 :=
  rfl

/-- The second formal derivative recurrence for the fixed-seed orbit polynomial. -/
theorem fixedSeed_parameter_second_derivative_succ (c z : R) (n : ℕ) :
    (derivative (derivative (parameterPolynomial (C z) (n + 1)))).eval c =
      2 * orbit c n z *
        (derivative (derivative (parameterPolynomial (C z) n))).eval c +
      2 * parameterJetLinear c z n ^ 2 := by
  simp only [parameterPolynomial, derivative_add, derivative_mul, derivative_X,
    derivative_one, add_zero, eval_add, eval_mul, parameterPolynomial_eval,
    eval_C, parameterJetLinear]
  ring

/-- Twice the quadratic coefficient equals the second formal parameter derivative.
This statement uses no characteristic-zero assumption and no division. It does
not assert that doubling is injective; the recurrence defines the coefficient. -/
theorem parameterJetQuadratic_twice_eq_second_derivative (c z : R) (n : ℕ) :
    2 * parameterJetQuadratic c z n =
      (derivative (derivative (parameterPolynomial (C z) n))).eval c := by
  induction n with
  | zero => simp [parameterJetQuadratic, parameterPolynomial]
  | succ n ih =>
    rw [parameterJetQuadratic_succ, fixedSeed_parameter_second_derivative_succ, ← ih]
    ring

/-- The second-order approximation at parameter `c + δ`, from a fixed seed. -/
noncomputable def secondOrderApproximation (c z δ : R) (n : ℕ) : R :=
  orbit c n z + parameterJetLinear c z n * δ + parameterJetQuadratic c z n * δ ^ 2

/-- The approximation starts at the common exact seed. -/
@[simp] theorem secondOrderApproximation_zero (c z δ : R) :
    secondOrderApproximation c z δ 0 = z := by
  simp [secondOrderApproximation]

/-- Exact one-step residual of the truncated jet. Cubic and quartic terms are
the terms omitted when the quadratic map is applied to the approximation. -/
theorem secondOrderApproximation_step_residual (c z δ : R) (n : ℕ) :
    secondOrderApproximation c z δ (n + 1) -
      quadratic (c + δ) (secondOrderApproximation c z δ n) =
      -(2 * parameterJetLinear c z n * parameterJetQuadratic c z n * δ ^ 3 +
        parameterJetQuadratic c z n ^ 2 * δ ^ 4) := by
  simp only [secondOrderApproximation, orbit_succ, parameterJetLinear_succ,
    parameterJetQuadratic_succ, quadratic]
  ring

/-- Exact error of the second-order approximation, with the seed held fixed. -/
noncomputable def secondOrderError (c z δ : R) (n : ℕ) : R :=
  orbit (c + δ) n z - secondOrderApproximation c z δ n

/-- The remainder is the exact same-seed perturbation after removing the jet. -/
theorem secondOrderError_eq_perturbation_sub_jet (c z δ : R) (n : ℕ) :
    secondOrderError c z δ n = perturbation c δ z n -
      parameterJetLinear c z n * δ - parameterJetQuadratic c z n * δ ^ 2 := by
  simp only [secondOrderError, secondOrderApproximation, perturbation]
  ring

/-- Both exact and approximate orbits start at the same seed. -/
@[simp] theorem secondOrderError_zero (c z δ : R) :
    secondOrderError c z δ 0 = 0 := by
  simp [secondOrderError]

/-- Exact remainder recurrence. It separates propagation of the existing error
from the cubic and quartic terms generated by truncating the jet. A norm bound
for this recurrence requires additional hypotheses. -/
theorem secondOrderError_succ (c z δ : R) (n : ℕ) :
    secondOrderError c z δ (n + 1) =
      2 * secondOrderApproximation c z δ n * secondOrderError c z δ n +
      secondOrderError c z δ n ^ 2 +
      2 * parameterJetLinear c z n * parameterJetQuadratic c z n * δ ^ 3 +
      parameterJetQuadratic c z n ^ 2 * δ ^ 4 := by
  simp only [secondOrderError, secondOrderApproximation, orbit_succ,
    parameterJetLinear_succ, parameterJetQuadratic_succ, quadratic]
  ring

/-- A concrete third-step remainder for the critical orbit at reference parameter
zero. It witnesses the actual cubic and quartic omitted terms; second-order
truncation is not an exact perturbed orbit in general. -/
theorem secondOrderError_zero_reference_three (δ : R) :
    secondOrderError (0 : R) 0 δ 3 = 2 * δ ^ 3 + δ ^ 4 := by
  simp only [secondOrderError, secondOrderApproximation, orbit_succ, orbit_zero,
    parameterJetLinear_succ, parameterJetLinear_zero, parameterJetQuadratic_succ,
    parameterJetQuadratic_zero, quadratic]
  ring

end IntMProof
