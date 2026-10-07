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

/-- Express a delta relative to a new reference value. -/
def rebaseDelta (oldRef newRef delta : R) : R :=
  delta - (newRef - oldRef)

/-- A rebase preserves the reconstructed state. -/
theorem rebaseDelta_reconstruct (oldRef newRef delta : R) :
    newRef + rebaseDelta oldRef newRef delta = oldRef + delta := by
  simp only [rebaseDelta]
  ring

/-- Returning to the old reference recovers the original delta. -/
theorem rebaseDelta_reverse (oldRef newRef delta : R) :
    rebaseDelta newRef oldRef (rebaseDelta oldRef newRef delta) = delta := by
  simp only [rebaseDelta]
  ring

/-- Two successive rebases equal the direct rebase. -/
theorem rebaseDelta_comp (r₀ r₁ r₂ delta : R) :
    rebaseDelta r₁ r₂ (rebaseDelta r₀ r₁ delta) = rebaseDelta r₀ r₂ delta := by
  simp only [rebaseDelta]
  ring

/-- The new parameter offset represents the same target parameter. -/
theorem rebase_parameter (c c₀ c₁ : R) :
    rebaseDelta c₀ c₁ (c - c₀) = c - c₁ := by
  simp only [rebaseDelta]
  ring

/-- At the same iterate and shared seed, an orbit delta rebases to the
difference from the new reference orbit. -/
theorem rebase_perturbation (c c₀ c₁ z : R) (n : ℕ) :
    rebaseDelta (orbit c₀ n z) (orbit c₁ n z) (perturbation c₀ (c - c₀) z n) =
      perturbation c₁ (c - c₁) z n := by
  simpa only [rebaseDelta] using (rebase_delta c₀ c₁ c z n).symm

/-- Quadratic updates of the reference and delta reconstruct exactly one
target step. This applies at any shared index. -/
theorem quadratic_reconstruct (c cRef ref delta : R) :
    quadratic cRef ref + (2 * ref * delta + delta ^ 2 + (c - cRef)) =
      quadratic c (ref + delta) := by
  simp only [quadratic]
  ring

/-- Resuming after iterate `n` retains the original orbit index `n + k`. -/
theorem rebase_resume_orbit (c cRef z : R) (n k : ℕ) :
    orbit c k (orbit cRef n z + perturbation cRef (c - cRef) z n) =
      orbit c (n + k) z := by
  rw [← rebase_reconstruct, orbit_add]

end IntMProof
