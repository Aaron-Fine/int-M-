import Mathlib.Dynamics.PeriodicPts.Defs
import Mathlib.Data.Nat.Prime.Defs

/-!
# Exact-period pilot (E2)

These criteria characterize exact equality for a generic self-map. They do not
certify that a floating-point residual represents an exact periodic point.
-/

namespace IntMProof

open Function

variable {α : Type*} (f : α → α) (x : α)

/-- A proper divisor of a positive multiple leaves a prime quotient. -/
private theorem prime_quotient_of_proper_divisor {m p : ℕ}
    (hmp : m ∣ p) (hne : m ≠ p) :
    ∃ q : ℕ, q.Prime ∧ q ∣ p ∧ m ∣ p / q := by
  have hquot_ne : p / m ≠ 1 := fun h => hne (Nat.eq_of_dvd_of_div_eq_one hmp h)
  obtain ⟨q, hq, hqquot⟩ := Nat.exists_prime_and_dvd hquot_ne
  have hmul : q * m ∣ p := by
    have h : m * q ∣ m * (p / m) := mul_dvd_mul_left m hqquot
    rw [Nat.mul_div_cancel' hmp] at h
    simpa [mul_comm] using h
  have hqp : q ∣ p := (dvd_mul_right q m).trans hmul
  exact ⟨q, hq, hqp, (Nat.dvd_div_iff_mul_dvd hqp).mpr hmul⟩

/-- Exact period can be tested by excluding the prime-quotient returns, provided
the proposed period is positive and closes exactly. -/
theorem exactPeriod_iff_prime_quotient (p : ℕ) (hp : 0 < p)
    (hclose : f^[p] x = x) :
    minimalPeriod f x = p ↔
      ∀ q : ℕ, q.Prime → q ∣ p → f^[p / q] x ≠ x := by
  have hperiod : IsPeriodicPt f p x := hclose
  constructor
  · intro heq q hq hqp hreturn
    have hpos : 0 < p / q := Nat.div_pos (Nat.le_of_dvd hp hqp) hq.pos
    have hlt : p / q < minimalPeriod f x := by
      simpa [heq] using Nat.div_lt_self hp hq.one_lt
    exact not_isPeriodicPt_of_pos_of_lt_minimalPeriod hpos.ne' hlt hreturn
  · intro hprime
    by_contra hne
    obtain ⟨q, hq, hqp, hmq⟩ :=
      prime_quotient_of_proper_divisor hperiod.minimalPeriod_dvd hne
    exact hprime q hq hqp ((isPeriodicPt_iff_minimalPeriod_dvd).mpr hmq)

/-- An unconditional test for exact period `n`: closure and prime-quotient
exclusions must both hold. In particular, `n = 0` is excluded. -/
theorem exactPeriod_iff_closure_and_prime_quotients (n : ℕ) (hn : 0 < n) :
    minimalPeriod f x = n ↔
      f^[n] x = x ∧
        ∀ q : ℕ, q.Prime → q ∣ n → f^[n / q] x ≠ x := by
  constructor
  · intro h
    have hclose : f^[n] x = x := h ▸ iterate_minimalPeriod
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
  constructor
  · intro h d hd _ hlt hreturn
    exact not_isPeriodicPt_of_pos_of_lt_minimalPeriod hd.ne' (h.symm ▸ hlt) hreturn
  · intro hnone
    rcases lt_or_eq_of_le (hperiod.minimalPeriod_le hn) with hlt | heq
    · exact (hnone _ (hperiod.minimalPeriod_pos hn) hperiod.minimalPeriod_dvd hlt
        iterate_minimalPeriod).elim
    · exact heq

/-- Closure together with every positive proper-divisor exclusion characterizes
exact period `n`. This is the catalog's divisor condition in exact arithmetic. -/
theorem exactPeriod_iff_closure_and_proper_divisors (n : ℕ) (hn : 0 < n) :
    minimalPeriod f x = n ↔
      f^[n] x = x ∧
        ∀ d : ℕ, 0 < d → d ∣ n → d < n → f^[d] x ≠ x := by
  constructor
  · intro h
    have hclose : f^[n] x = x := h ▸ iterate_minimalPeriod
    exact ⟨hclose, (exactPeriod_iff_proper_divisors f x n hn hclose).mp h⟩
  · rintro ⟨hclose, hnone⟩
    exact (exactPeriod_iff_proper_divisors f x n hn hclose).mpr hnone

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
    refine ⟨h ▸ iterate_minimalPeriod, fun k hk hlt hreturn =>
      not_isPeriodicPt_of_pos_of_lt_minimalPeriod hk.ne' (h.symm ▸ hlt) hreturn⟩
  · rintro ⟨hclose, hnone⟩
    exact (exactPeriod_iff_proper_divisors f x n hn hclose).mpr
      (fun d hd _ hlt => hnone d hd hlt)

end IntMProof
