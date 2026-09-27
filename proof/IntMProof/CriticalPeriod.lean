import IntMProof.ExactPeriod
import IntMProof.Quadratic

/-! # Exact periods of the quadratic critical orbit -/

namespace IntMProof

variable {R : Type*} [CommRing R]

/-- The critical point has exact period `n` precisely when its `n`th orbit
value is zero and every prime-quotient orbit value is nonzero. -/
theorem criticalPeriod_iff_prime_quotients (c : R) (n : ℕ) (hn : 0 < n) :
    Function.minimalPeriod (quadratic c) (0 : R) = n ↔
      orbit c n 0 = 0 ∧
        ∀ q : ℕ, q.Prime → q ∣ n → orbit c (n / q) 0 ≠ 0 := by
  exact exactPeriod_iff_closure_and_prime_quotients (quadratic c) 0 n hn

/-- The generator's all-proper-divisor condition in exact arithmetic. -/
theorem criticalPeriod_iff_proper_divisors (c : R) (n : ℕ) (hn : 0 < n) :
    Function.minimalPeriod (quadratic c) (0 : R) = n ↔
      orbit c n 0 = 0 ∧
        ∀ d : ℕ, 0 < d → d ∣ n → d < n → orbit c d 0 ≠ 0 := by
  constructor
  · intro h
    have hclose : orbit c n 0 = 0 := by
      rw [← h]
      exact Function.iterate_minimalPeriod
    exact ⟨hclose, (exactPeriod_iff_proper_divisors (quadratic c) 0 n hn hclose).mp h⟩
  · rintro ⟨hclose, hnone⟩
    exact (exactPeriod_iff_proper_divisors (quadratic c) 0 n hn hclose).mpr hnone

end IntMProof
