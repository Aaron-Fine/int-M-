import IntMProof.CriticalPeriod
import Mathlib.Data.Complex.Basic
import Mathlib.Algebra.Polynomial.Derivative
import Mathlib.Tactic

/-!
# Exact period-three critical locus (S0)

The third critical return factors into a period-one branch and a cubic.  The
cubic roots all have exact period three, and its derivative cannot vanish at
any root. This identifies the spurious branch in the raw closure equation.
-/

namespace IntMProof

open Polynomial

/-- The primitive critical period-three factor. -/
def periodThreeFactor (c : ℂ) : ℂ := c ^ 3 + 2 * c ^ 2 + c + 1

/-- Formal derivative of the cubic factor, written as a scalar polynomial. -/
def periodThreeSlope (c : ℂ) : ℂ := 3 * c ^ 2 + 4 * c + 1

/-- The cubic as a polynomial in the parameter. -/
noncomputable def periodThreePolynomial : ℂ[X] :=
  X ^ 3 + C 2 * X ^ 2 + X + C 1

theorem periodThreePolynomial_eval (c : ℂ) :
    periodThreePolynomial.eval c = periodThreeFactor c := by
  simp [periodThreePolynomial, periodThreeFactor]

theorem periodThreePolynomial_derivative_eval (c : ℂ) :
    (derivative periodThreePolynomial).eval c = periodThreeSlope c := by
  simp [periodThreePolynomial, periodThreeSlope, derivative_add, derivative_mul,
    derivative_pow, derivative_C, derivative_X]
  ring

/-- The raw third critical return has the period-one factor `c`. -/
theorem critical_orbit_three_factor (c : ℂ) :
    orbit c 3 0 = c * periodThreeFactor c := by
  simp only [orbit_succ, orbit_zero, quadratic, periodThreeFactor]
  ring

/-- The cubic factor does not contain the period-one center. -/
theorem periodThreeFactor_zero : periodThreeFactor 0 = 1 := by
  norm_num [periodThreeFactor]

theorem periodThreeFactor_root_ne_zero {c : ℂ} (h : periodThreeFactor c = 0) :
    c ≠ 0 := by
  intro hc
  subst c
  norm_num [periodThreeFactor] at h

/-- Critical period-three closure splits into the period-one center and the
primitive cubic locus. -/
theorem critical_orbit_three_eq_zero_iff (c : ℂ) :
    orbit c 3 0 = 0 ↔ c = 0 ∨ periodThreeFactor c = 0 := by
  rw [critical_orbit_three_factor]
  exact mul_eq_zero

/-- The primitive cubic locus is precisely the exact period-three critical
locus, with the spurious `c = 0` closure branch removed. -/
theorem critical_minimalPeriod_three_iff (c : ℂ) :
    Function.minimalPeriod (quadratic c) (0 : ℂ) = 3 ↔
      periodThreeFactor c = 0 := by
  rw [exactPeriod_iff_first_return (quadratic c) (0 : ℂ) 3 (by decide)]
  constructor
  · rintro ⟨hclose, hfirst⟩
    have hc : c ≠ 0 := by
      have h1 := hfirst 1 (by decide) (by decide)
      simpa [orbit, quadratic] using h1
    rcases (critical_orbit_three_eq_zero_iff c).mp hclose with hz | hp
    · exact (hc hz).elim
    · exact hp
  · intro hp
    have hc : c ≠ 0 := periodThreeFactor_root_ne_zero hp
    have hclose : orbit c 3 0 = 0 :=
      (critical_orbit_three_eq_zero_iff c).mpr (Or.inr hp)
    refine ⟨hclose, ?_⟩
    intro k hk hlt
    interval_cases k
    · simpa [orbit, quadratic] using hc
    · intro htwo
      change orbit c 2 0 = 0 at htwo
      have hthree : orbit c 3 0 = c := by
        rw [orbit_succ, htwo]
        simp [quadratic]
      exact hc (hthree.symm.trans hclose)

/-- The cubic and its formal derivative have no common root. In particular,
the primitive critical period-three centers are simple roots. -/
theorem periodThreeFactor_slope_ne_zero {c : ℂ}
    (hp : periodThreeFactor c = 0) : periodThreeSlope c ≠ 0 := by
  intro hd
  have hlin : 7 - 2 * c = 0 := by
    have hident : 9 * periodThreeFactor c -
        (3 * c + 2) * periodThreeSlope c = 7 - 2 * c := by
      unfold periodThreeFactor periodThreeSlope
      ring
    rw [hp, hd] at hident
    simpa using hident.symm
  have hc : c = 7 / 2 := by
    linear_combination (-1 / 2 : ℂ) * hlin
  subst c
  norm_num [periodThreeSlope] at hd

end IntMProof
