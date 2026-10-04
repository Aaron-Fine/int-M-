import IntMProof.Perturbation
import Mathlib.Tactic.Ring

/-! # Rebase of a same-seed perturbation

At one iterate `n` and one seed `z`, the orbit at parameter `c` is the
reference orbit at `c₁` plus the perturbation with step `c - c₁`. Changing
the reference from `c₀` to `c₁` replaces that perturbation by
`dₙ - (orbit c₁ n z - orbit c₀ n z)`. Both identities are equalities in any
commutative ring. They do not assume the orbit is periodic and do not bound
the size of the perturbation.
-/

namespace IntMProof

variable {R : Type*} [CommRing R]

/-- The orbit at `c` is the reference orbit at `c₁` plus the same-seed
perturbation with step `c - c₁`. This is an equality in any commutative ring.
It does not assume the orbit is periodic and does not bound the size of the
perturbation. -/
theorem rebase_reconstruct (c₁ c z : R) (n : ℕ) :
    orbit c n z = orbit c₁ n z + perturbation c₁ (c - c₁) z n := by
  simp only [perturbation]
  rw [show c₁ + (c - c₁) = c by ring]
  ring

/-- Changing the reference from `c₀` to `c₁` at the same iterate replaces the
perturbation by `dₙ - (Z'ₙ - Zₙ)`, where `Zₙ` and `Z'ₙ` are the reference
orbits at `c₀` and `c₁`. This is an equality in any commutative ring. It does
not assume the orbit is periodic and does not bound the size of the
perturbation. -/
theorem rebase_delta (c₀ c₁ c z : R) (n : ℕ) :
    perturbation c₁ (c - c₁) z n =
      perturbation c₀ (c - c₀) z n - (orbit c₁ n z - orbit c₀ n z) := by
  simp only [perturbation]
  rw [show c₁ + (c - c₁) = c by ring, show c₀ + (c - c₀) = c by ring]
  ring

end IntMProof
