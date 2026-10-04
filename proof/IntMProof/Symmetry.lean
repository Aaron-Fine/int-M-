import IntMProof.ExactPeriod
import IntMProof.Derivatives
import Mathlib.Data.Complex.Basic

/-! # Ring-map symmetries and invertible changes of coordinates. -/
namespace IntMProof
open Function
open Polynomial
variable {R S : Type*} [CommRing R] [CommRing S]

theorem orbit_map (φ : R →+* S) (c z : R) (n : ℕ) :
    φ (orbit c n z) = orbit (φ c) n (φ z) := by
  induction n with
  | zero => rfl
  | succ n ih =>
    rw [orbit_succ, orbit_succ]
    simp [quadratic, ih]

/-- Injectivity prevents distinct orbit states from merging. -/
theorem minimalPeriod_map (φ : R →+* S) (hφ : Injective φ) (c z : R) :
    minimalPeriod (quadratic (φ c)) (φ z) = minimalPeriod (quadratic c) z := by
  apply (minimalPeriod_eq_minimalPeriod_iff).2
  intro n
  change orbit (φ c) n (φ z) = φ z ↔ orbit c n z = z
  rw [← orbit_map φ c z n]
  exact hφ.eq_iff

/-- Conjugate a self-map through an invertible coordinate chart. -/
def transport {α β : Type*} (h : α ≃ β) (f : α → α) (y : β) : β :=
  h (f (h.symm y))

theorem transport_orbit {α β : Type*} (h : α ≃ β) (f : α → α)
    (x : α) (n : ℕ) :
    (transport h f)^[n] (h x) = h (f^[n] x) := by
  induction n with
  | zero => rfl
  | succ n ih =>
    rw [iterate_succ_apply', ih]
    simp only [transport, Equiv.symm_apply_apply, iterate_succ_apply']

/-- A bijective coordinate chart preserves exact periods of the transported map. -/
theorem transport_minimalPeriod {α β : Type*} (h : α ≃ β) (f : α → α)
    (x : α) :
    minimalPeriod (transport h f) (h x) = minimalPeriod f x := by
  apply (minimalPeriod_eq_minimalPeriod_iff).2
  intro n
  change (transport h f)^[n] (h x) = h x ↔ f^[n] x = x
  rw [transport_orbit h f x n]
  exact h.injective.eq_iff

/-- The sign chart turns the quadratic map into a negative quadratic map. -/
def negChart (R : Type*) [AddGroup R] : R ≃ R where
  toFun := fun z => -z
  invFun := fun z => -z
  left_inv := by intro z; simp
  right_inv := by intro z; simp

theorem negChart_quadratic (c w : R) :
    transport (negChart R) (quadratic c) w = -(w * w) - c := by
  simp [transport, negChart, quadratic, neg_add_rev, sub_eq_add_neg, add_comm]

theorem negChart_minimalPeriod (c z : R) :
    minimalPeriod (fun w => -(w * w) - c) (-z) =
      minimalPeriod (quadratic c) z := by
  have h : transport (negChart R) (quadratic c) = (fun w => -(w * w) - c) :=
    funext (negChart_quadratic c)
  rw [← h]
  exact transport_minimalPeriod (negChart R) (quadratic c) z

theorem conjugate_orbit (c z : ℂ) (n : ℕ) :
    (starRingEnd ℂ) (orbit c n z) =
      orbit ((starRingEnd ℂ) c) n ((starRingEnd ℂ) z) := by
  exact orbit_map (starRingEnd ℂ) c z n

theorem conjugate_minimalPeriod (c z : ℂ) :
    minimalPeriod (quadratic ((starRingEnd ℂ) c)) ((starRingEnd ℂ) z) =
      minimalPeriod (quadratic c) z := by
  exact minimalPeriod_map (starRingEnd ℂ)
    (starRingAut.injective) c z

/-- Conjugation also transports the seed derivative of every return iterate. -/
theorem conjugate_seedDerivative (c z : ℂ) (n : ℕ) :
    (starRingEnd ℂ) ((derivative (seedPolynomial c n)).eval z) =
      (derivative (seedPolynomial ((starRingEnd ℂ) c) n)).eval ((starRingEnd ℂ) z) := by
  induction n with
  | zero => simp [seedPolynomial_derivative_zero]
  | succ n ih =>
    simp only [seedPolynomial_derivative_succ, map_mul, map_ofNat,
      conjugate_orbit, ih]

theorem conjugate_seedDerivative_normSq (c z : ℂ) (n : ℕ) :
    Complex.normSq ((derivative (seedPolynomial ((starRingEnd ℂ) c) n)).eval
      ((starRingEnd ℂ) z)) =
      Complex.normSq ((derivative (seedPolynomial c n)).eval z) := by
  rw [← conjugate_seedDerivative, Complex.normSq_conj]
end IntMProof
