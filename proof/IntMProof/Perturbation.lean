import IntMProof.Quadratic
import Mathlib.Tactic.Ring

/-! # Same-seed parameter perturbation

`perturbation c δ z n` is the difference of the orbits of one seed `z` at
parameters `c + δ` and `c`. The recurrence below is an equality in any
commutative ring and does not bound the size of the perturbation.
-/

namespace IntMProof

variable {R : Type*} [CommRing R]

/-- Difference of same-seed orbits at parameters `c + δ` and `c`.
This is an equality in any commutative ring and does not bound the size of
the perturbation. -/
def perturbation (c δ z : R) (n : ℕ) : R :=
  orbit (c + δ) n z - orbit c n z

/-- The perturbation vanishes at step zero. This is an equality in any
commutative ring and does not bound the size of the perturbation. -/
theorem perturbation_zero (c δ z : R) :
    perturbation c δ z 0 = 0 := by
  simp only [perturbation, orbit_zero, sub_self]

/-- Unfolding both orbits, the reference square cancels and leaves
`eₙ₊₁ = 2 zₙ eₙ + eₙ² + δ`. This is an equality in any commutative ring and
does not bound the size of the perturbation. -/
theorem perturbation_succ (c δ z : R) (n : ℕ) :
    perturbation c δ z (n + 1) =
      2 * orbit c n z * perturbation c δ z n
        + perturbation c δ z n ^ 2
        + δ := by
  simp only [perturbation]
  rw [orbit_succ, orbit_succ]
  simp only [quadratic]
  ring

end IntMProof
