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

/-- An unconditional test for exact period `n`: closure and prime-quotient
exclusions must both hold. In particular, `n = 0` is excluded. -/
theorem exactPeriod_iff_closure_and_prime_quotients (n : ℕ) (hn : 0 < n) :
    minimalPeriod f x = n ↔
      f^[n] x = x ∧
        ∀ q : ℕ, q.Prime → q ∣ n → f^[n / q] x ≠ x := by
  constructor
  · intro h
    have hclose : f^[n] x = x := by
      rw [← h]
      exact iterate_minimalPeriod
    exact ⟨hclose, (exactPeriod_iff_prime_quotient f x n hn hclose).mp h⟩
  · rintro ⟨hclose, hprime⟩
    exact (exactPeriod_iff_prime_quotient f x n hn hclose).mpr hprime

/-- Under exact closure, testing all positive proper divisors of `n` is
equivalent to exact period `n`. -/
theorem exactPeriod_iff_proper_divisors (n : ℕ) (hn : 0 < n)
    (hclose : f^[n] x = x) :
    minimalPeriod f x = n ↔
      ∀ d : ℕ, 0 < d → d ∣ n → d < n → f^[d] x ≠ x := by
  have hperiod : IsPeriodicPt f n x := hclose
  have hmdvd : minimalPeriod f x ∣ n := hperiod.minimalPeriod_dvd
  have hmpos : 0 < minimalPeriod f x := hperiod.minimalPeriod_pos hn
  constructor
  · intro h d hd _ hlt hreturn
    have hdiv : n ∣ d := by
      simpa only [h] using
        (show IsPeriodicPt f d x from hreturn).minimalPeriod_dvd
    exact (Nat.not_le_of_gt hlt) (Nat.le_of_dvd hd hdiv)
  · intro hnone
    have hle : minimalPeriod f x ≤ n := Nat.le_of_dvd hn hmdvd
    rcases lt_or_eq_of_le hle with hlt | heq
    · exact False.elim (hnone (minimalPeriod f x) hmpos hmdvd hlt iterate_minimalPeriod)
    · exact heq

/-- For a closing period, the prime-quotient tests and all-proper-divisor
tests are equivalent. -/
theorem prime_quotients_iff_proper_divisors (n : ℕ) (hn : 0 < n)
    (hclose : f^[n] x = x) :
    (∀ q : ℕ, q.Prime → q ∣ n → f^[n / q] x ≠ x) ↔
      ∀ d : ℕ, 0 < d → d ∣ n → d < n → f^[d] x ≠ x :=
  (exactPeriod_iff_prime_quotient f x n hn hclose).symm.trans
    (exactPeriod_iff_proper_divisors f x n hn hclose)

/-- The first positive return criterion: closure at `n` and no return at any
earlier positive iterate. -/
theorem exactPeriod_iff_first_return (n : ℕ) (hn : 0 < n) :
    minimalPeriod f x = n ↔
      f^[n] x = x ∧
        ∀ k : ℕ, 0 < k → k < n → f^[k] x ≠ x := by
  constructor
  · intro h
    have hclose : f^[n] x = x := by
      rw [← h]
      exact iterate_minimalPeriod
    refine ⟨hclose, ?_⟩
    intro k hk hlt hreturn
    have hdiv : n ∣ k := by
      simpa only [h] using
        (show IsPeriodicPt f k x from hreturn).minimalPeriod_dvd
    exact (Nat.not_le_of_gt hlt) (Nat.le_of_dvd hk hdiv)
  · rintro ⟨hclose, hnone⟩
    exact (exactPeriod_iff_proper_divisors f x n hn hclose).mpr
      (fun d hd _ hlt => hnone d hd hlt)

end IntMProof
