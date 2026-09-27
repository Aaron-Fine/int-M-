import Mathlib.Dynamics.PeriodicPts.Defs
import Mathlib.Data.Nat.Prime.Defs

/-!
# Exact-period pilot (E2)

This theorem concerns exact equality in a generic self-map. It does not certify
that a floating-point residual represents an exact periodic point.
-/

namespace IntMProof

open Function

variable {α : Type*} (f : α → α) (x : α)

private theorem prime_quotient_of_proper_divisor {m p : ℕ}
    (hmp : m ∣ p) (hne : m ≠ p) :
    ∃ q : ℕ, q.Prime ∧ q ∣ p ∧ m ∣ p / q := by
  have hquot_ne : p / m ≠ 1 := by
    intro h
    exact hne (Nat.eq_of_dvd_of_div_eq_one hmp h)
  obtain ⟨q, hq, hqquot⟩ := Nat.exists_prime_and_dvd hquot_ne
  have hmul : q * m ∣ p := by
    have h : m * q ∣ m * (p / m) := mul_dvd_mul_left m hqquot
    rw [Nat.mul_div_cancel' hmp] at h
    simpa [mul_comm] using h
  have hqp : q ∣ p := (show q ∣ q * m from ⟨m, rfl⟩).trans hmul
  exact ⟨q, hq, hqp, (Nat.dvd_div_iff_mul_dvd hqp).2 hmul⟩

/-- Exact period can be tested by excluding the prime-quotient returns, provided
the proposed period is positive and closes exactly. -/
theorem exactPeriod_iff_prime_quotient (p : ℕ) (hp : 0 < p)
    (hclose : f^[p] x = x) :
    minimalPeriod f x = p ↔
      ∀ q : ℕ, q.Prime → q ∣ p → f^[p / q] x ≠ x := by
  have hperiod : IsPeriodicPt f p x := hclose
  have hmp : minimalPeriod f x ∣ p := hperiod.minimalPeriod_dvd
  have hmpos : 0 < minimalPeriod f x := hperiod.minimalPeriod_pos hp
  constructor
  · intro heq q hq hqp hreturn
    have hdiv : p ∣ p / q := by
      simpa only [heq] using
        (show IsPeriodicPt f (p / q) x from hreturn).minimalPeriod_dvd
    have hqpos : 0 < p / q := Nat.div_pos (Nat.le_of_dvd hp hqp) hq.pos
    have hlt : p / q < p := Nat.div_lt_self hp hq.one_lt
    exact (Nat.not_le_of_gt hlt) (Nat.le_of_dvd hqpos hdiv)
  · intro hprime
    by_contra hne
    obtain ⟨q, hq, hqp, hmq⟩ := prime_quotient_of_proper_divisor hmp hne
    exact hprime q hq hqp ((isPeriodicPt_iff_minimalPeriod_dvd).mpr hmq)

end IntMProof
