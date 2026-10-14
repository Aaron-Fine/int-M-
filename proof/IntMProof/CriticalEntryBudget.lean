import IntMProof.CriticalEntry
import IntMProof.ErrorBudget

/-!
# Error-budget certificate for critical entry (L1)

The approximate iterate's disk margin includes a certified error budget.
This supplies entry for the existing return-disk contraction theorem. The
local error bounds, radius bounds, and contraction constants remain inputs.
-/

namespace IntMProof

open Metric Polynomial

/-- An error-budget disk-entry certificate yields the unique attracting
return point and the subsequent critical-return contraction. This does not
establish primitive period or certify machine arithmetic. -/
theorem existsUnique_critical_return_of_error_budget
    (c : ℂ) (k n : ℕ) (z₀ : ℂ) (r q ε : ℝ)
    (approx : ℕ → ℂ) (radius forcing : ℕ → ℝ)
    (hr : 0 ≤ r) (hq : 0 ≤ q) (hq1 : q < 1)
    (hmult : ∀ z ∈ closedBall z₀ r,
      ‖(derivative (seedPolynomial c n)).eval z‖ ≤ q)
    (hcenter : ‖orbit c n z₀ - z₀‖ + q * r ≤ r)
    (hε : ‖approx 0‖ ≤ ε)
    (horbit : ∀ j < k, ‖orbit c j 0‖ ≤ radius j)
    (hlocal : ∀ j < k,
      ‖approx (j + 1) - quadratic c (approx j)‖ ≤ forcing j)
    (hentry : ‖approx k - z₀‖ + errorBudget ε radius forcing k ≤ r) :
    ∃! ζ : ℂ, ζ ∈ closedBall z₀ r ∧ orbit c n ζ = ζ ∧
      ‖(derivative (seedPolynomial c n)).eval ζ‖ ≤ q ∧
      ∀ m : ℕ, orbit c (k + m * n) 0 ∈ closedBall z₀ r ∧
        dist (orbit c (k + m * n) 0) ζ ≤ q ^ m * dist (orbit c k 0) ζ := by
  exact existsUnique_critical_return_of_entry c k n z₀ r q hr hq hq1 hmult hcenter
    (critical_mem_closedBall_of_error_budget c z₀ approx ε r radius forcing k
      hε horbit hlocal hentry)

end IntMProof
