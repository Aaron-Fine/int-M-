import IntMProof.ParameterJet
import Mathlib.Algebra.Polynomial.Taylor

/-! # P4: all-order fixed-seed parameter coefficients

Mathlib's polynomial Taylor translation gives the exact finite expansion at
`c + δ`. Its coefficients are Hasse derivatives evaluated at `c`, so their
meaning and recurrence remain valid over every commutative ring, including
positive characteristic. In particular the quadratic coefficient is identified
without dividing by two. These identities do not certify floating-point
implementations or authorize a truncated jet to classify a pixel.
-/

namespace IntMProof

open Polynomial

variable {R : Type*} [CommRing R]

/-- The exact parameter orbit polynomial translated to reference parameter `c`,
with the initial seed `z` held fixed. Its variable denotes the offset `δ`. -/
noncomputable def parameterTaylorPolynomial (c z : R) (n : ℕ) : R[X] :=
  (parameterPolynomial (C z) n).taylor c

/-- Coefficient of order `k` in the exact fixed-seed parameter expansion. -/
noncomputable def parameterJetCoefficient (c z : R) (n k : ℕ) : R :=
  (parameterTaylorPolynomial c z n).coeff k

/-- Evaluating the translated polynomial recovers the exact perturbed orbit. -/
theorem parameterTaylorPolynomial_eval (c z δ : R) (n : ℕ) :
    (parameterTaylorPolynomial c z n).eval δ = orbit (c + δ) n z := by
  simp [parameterTaylorPolynomial, taylor_eval, parameterPolynomial_eval, add_comm]

/-- Translation leaves the fixed initial seed constant. -/
@[simp] theorem parameterTaylorPolynomial_zero (c z : R) :
    parameterTaylorPolynomial c z 0 = C z := by
  simp [parameterTaylorPolynomial, parameterPolynomial]

/-- Exact polynomial recurrence in the offset variable. -/
theorem parameterTaylorPolynomial_succ (c z : R) (n : ℕ) :
    parameterTaylorPolynomial c z (n + 1) =
      parameterTaylorPolynomial c z n * parameterTaylorPolynomial c z n + X + C c := by
  simp [parameterTaylorPolynomial, parameterPolynomial, add_assoc]

/-- Every order is the corresponding Hasse derivative evaluated at `c`.
No factorial division or characteristic restriction is required. -/
theorem parameterJetCoefficient_eq_hasseDeriv (c z : R) (n k : ℕ) :
    parameterJetCoefficient c z n k =
      (hasseDeriv k (parameterPolynomial (C z) n)).eval c := by
  exact taylor_coeff c (parameterPolynomial (C z) n) k

/-- At iteration zero only the constant coefficient is present. -/
@[simp] theorem parameterJetCoefficient_initial (c z : R) (k : ℕ) :
    parameterJetCoefficient c z 0 k = if k = 0 then z else 0 := by
  simp [parameterJetCoefficient, coeff_C]

/-- Order zero is the exact reference orbit. -/
@[simp] theorem parameterJetCoefficient_zero (c z : R) (n : ℕ) :
    parameterJetCoefficient c z n 0 = orbit c n z := by
  simp [parameterJetCoefficient, parameterTaylorPolynomial, parameterPolynomial_eval]

/-- Order one agrees with the established formal parameter derivative. -/
@[simp] theorem parameterJetCoefficient_one (c z : R) (n : ℕ) :
    parameterJetCoefficient c z n 1 = parameterJetLinear c z n := by
  exact taylor_coeff_one c (parameterPolynomial (C z) n)

/-- All-order coefficient convolution. The shifted parameter contributes only
at orders zero and one; higher orders arise solely from squaring the orbit. -/
theorem parameterJetCoefficient_succ (c z : R) (n k : ℕ) :
    parameterJetCoefficient c z (n + 1) k =
      (∑ ij ∈ Finset.antidiagonal k,
        parameterJetCoefficient c z n ij.1 * parameterJetCoefficient c z n ij.2) +
      (if k = 1 then 1 else 0) + (if k = 0 then c else 0) := by
  simp [parameterJetCoefficient, parameterTaylorPolynomial_succ, coeff_mul, coeff_X,
    coeff_C, eq_comm]

/-- Range-indexed version of the exact convolution recurrence. -/
theorem parameterJetCoefficient_succ_range (c z : R) (n k : ℕ) :
    parameterJetCoefficient c z (n + 1) k =
      (∑ j ∈ Finset.range (k + 1),
        parameterJetCoefficient c z n j * parameterJetCoefficient c z n (k - j)) +
      (if k = 1 then 1 else 0) + (if k = 0 then c else 0) := by
  rw [parameterJetCoefficient_succ, Finset.Nat.sum_antidiagonal_eq_sum_range_succ_mk]

/-- For every order at least two, separate the two endpoint terms `2 Z Aₖ`
from the convolution of the positive lower-order coefficients. -/
theorem parameterJetCoefficient_succ_higher (c z : R) (n k : ℕ) :
    parameterJetCoefficient c z (n + 1) (k + 2) =
      2 * orbit c n z * parameterJetCoefficient c z n (k + 2) +
      ∑ ij ∈ Finset.antidiagonal k,
        parameterJetCoefficient c z n (ij.1 + 1) *
          parameterJetCoefficient c z n (ij.2 + 1) := by
  have h1 : k + 2 ≠ 1 := by omega
  have h0 : k + 2 ≠ 0 := by omega
  rw [parameterJetCoefficient_succ, Finset.Nat.antidiagonal_succ_succ']
  simp only [Finset.sum_cons, Finset.sum_map, Function.Embedding.prodMap, Prod.map,
    Function.Embedding.coeFn_mk, Nat.succ_eq_add_one,
    parameterJetCoefficient_zero, if_neg h1, if_neg h0, add_zero]
  ring

/-- Order two agrees with the previously defined division-free quadratic jet. -/
@[simp] theorem parameterJetCoefficient_two (c z : R) (n : ℕ) :
    parameterJetCoefficient c z n 2 = parameterJetQuadratic c z n := by
  induction n with
  | zero => simp
  | succ n ih =>
    rw [show 2 = 0 + 2 from rfl, parameterJetCoefficient_succ_higher]
    simp only [Finset.Nat.antidiagonal_zero, Finset.sum_singleton,
      parameterJetCoefficient_one, zero_add, ih, parameterJetQuadratic_succ]
    ring

/-- The existing division-free quadratic jet is exactly the second Hasse
derivative of the fixed-seed parameter polynomial, including in characteristic
two where the ordinary second derivative need not identify this coefficient. -/
theorem parameterJetQuadratic_eq_hasseDeriv (c z : R) (n : ℕ) :
    parameterJetQuadratic c z n =
      (hasseDeriv 2 (parameterPolynomial (C z) n)).eval c := by
  rw [← parameterJetCoefficient_two, parameterJetCoefficient_eq_hasseDeriv]

end IntMProof
