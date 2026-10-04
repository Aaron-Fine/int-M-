import IntMProof.Derivatives
import Mathlib.Algebra.BigOperators.Intervals

/-!
# Phase invariance of the seed derivative

On a closed period-`n` orbit, the formal multiplier of the `n`th iterate is the
same at every point of the cycle. Closure is enough; minimality is not required.
-/

namespace IntMProof

open Polynomial Finset

variable {R : Type*} [CommRing R]

/-- Adding one closing period does not move a point on the orbit. -/
theorem orbit_periodic_add (c z : R) (n m : ℕ) (hclose : orbit c n z = z) :
    orbit c (m + n) z = orbit c m z := by
  rw [add_comm, orbit_add, hclose]

/-- Shifting by `q` periods leaves a period-`n` value unchanged. -/
private theorem periodic_mul_add {M : Type*} (f : ℕ → M) (n q m : ℕ)
    (hf : ∀ t, f (t + n) = f t) : f (m + q * n) = f m := by
  induction q with
  | zero => simp
  | succ q ih => rw [Nat.succ_mul, ← add_assoc, hf, ih]

/-- A one-period product is invariant under shifting a periodic sequence. -/
theorem prod_range_periodic_shift {M : Type*} [CommMonoid M] (f : ℕ → M)
    (n k : ℕ) (hf : ∀ m, f (m + n) = f m) :
    ∏ i ∈ range n, f (i + k) = ∏ i ∈ range n, f i := by
  by_cases hn : n = 0
  · simp [hn]
  · have hpos : 0 < n := Nat.pos_of_ne_zero hn
    have hr : k % n < n := Nat.mod_lt k hpos
    have hmod : ∀ i, f (i + k) = f (i + k % n) := by
      intro i
      conv_lhs => rw [← Nat.mod_add_div k n, mul_comm n (k / n), ← add_assoc]
      exact periodic_mul_add f n (k / n) (i + k % n) hf
    have hshift :
        ∏ i ∈ range n, f (i + k % n) =
          ∏ i ∈ Ico (k % n) (n + k % n), f i := by
      rw [range_eq_Ico, prod_Ico_add' f 0 n (k % n), zero_add]
    have hsplit :
        ∏ i ∈ Ico (k % n) (n + k % n), f i =
          (∏ i ∈ Ico (k % n) n, f i) *
            ∏ i ∈ Ico n (n + k % n), f i :=
      (prod_Ico_consecutive f hr.le (Nat.le_add_right n _)).symm
    have htail :
        ∏ i ∈ Ico n (n + k % n), f i = ∏ i ∈ range (k % n), f i := by
      have hshiftRight := prod_Ico_add f 0 (k % n) n
      simp only [zero_add] at hshiftRight
      rw [add_comm n (k % n), range_eq_Ico, ← hshiftRight]
      refine prod_congr rfl fun i _ => ?_
      rw [add_comm]
      exact hf i
    rw [prod_congr rfl (fun i _ => hmod i), hshift, hsplit, htail, mul_comm]
    exact prod_range_mul_prod_Ico f hr.le

/-- The `n`-step seed derivative is unchanged along a closed orbit.
`orbit c n z = z` is enough; the return need not be minimal. -/
theorem seedDerivative_periodic_phase (c z : R) (n k : ℕ)
    (hclose : orbit c n z = z) :
    (derivative (seedPolynomial c n)).eval (orbit c k z) =
      (derivative (seedPolynomial c n)).eval z := by
  rw [seedPolynomial_derivative_eval_prod, seedPolynomial_derivative_eval_prod]
  have hper : ∀ m, 2 * orbit c (m + n) z = 2 * orbit c m z :=
    fun m => by rw [orbit_periodic_add c z n m hclose]
  rw [← prod_range_periodic_shift (fun t => 2 * orbit c t z) n k hper]
  refine prod_congr rfl fun j _ => ?_
  rw [add_comm j k, orbit_add]

end IntMProof
