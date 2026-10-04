import Mathlib.Algebra.Ring.Defs
import Mathlib.Logic.Function.Iterate

/-! # E0: elementary iterate algebra for the quadratic map -/

namespace IntMProof

variable {R : Type*} [CommRing R]

/-- The quadratic map in canonical parameter coordinates. -/
def quadratic (c z : R) : R := z * z + c

/-- The forward orbit from an arbitrary seed. The critical orbit uses `z = 0`. -/
def orbit (c : R) (n : ℕ) (z : R) : R := (quadratic c)^[n] z

@[simp] theorem orbit_zero (c z : R) : orbit c 0 z = z := rfl

theorem orbit_succ (c z : R) (n : ℕ) :
    orbit c (n + 1) z = quadratic c (orbit c n z) := by
  simp only [orbit, Function.iterate_succ_apply']

theorem orbit_add (c z : R) (m n : ℕ) :
    orbit c (m + n) z = orbit c n (orbit c m z) := by
  simp only [orbit, Nat.add_comm m n, Function.iterate_add_apply]

end IntMProof
