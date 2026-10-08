import IntMProof.StoredDisk
import Mathlib.Tactic.NormNum

/-!
# A certificate using a genuinely inexact stored reference

At `cRef = -1`, the stored values are `η`, `-1 + η`, `η`, with `η = 1/1024`.
The initial seed error and both step residuals are nonzero. Supplied radius
and residual bounds nevertheless certify a positive parameter disk.
-/

namespace IntMProof

open Function Metric Polynomial

/-- A deliberately biased reference prefix; only indices zero through two
are used by the certificate. -/
noncomputable def storedPeriodTwoReference (k : ℕ) : ℂ :=
  if k = 1 then -1 + 1 / 1024 else 1 / 1024

/-- Upper radii for the biased stored values. -/
noncomputable def storedPeriodTwoRadius (k : ℕ) : ℝ := if k = 1 then 1 else 1 / 1024

/-- The stored prefix has a positive initial-center error allowance. -/
theorem storedPeriodTwo_initial_bound :
    ‖(0 : ℂ) - storedPeriodTwoReference 0‖ ≤ 1 / 1024 := by
  norm_num [storedPeriodTwoReference]

/-- Each stored value in the used prefix has the stated radius bound. -/
theorem storedPeriodTwo_radius_bound (k : ℕ) :
    ‖storedPeriodTwoReference k‖ ≤ storedPeriodTwoRadius k := by
  by_cases hk : k = 1 <;> norm_num [storedPeriodTwoReference, storedPeriodTwoRadius, hk]

/-- The two nonzero reference-step residuals fit the supplied allowance. -/
theorem storedPeriodTwo_residual_bound (k : ℕ) (hk : k < 2) :
    ‖storedPeriodTwoReference (k + 1) - quadratic (-1) (storedPeriodTwoReference k)‖ ≤
      1 / 256 := by
  rcases Nat.eq_zero_or_pos k with hzero | hpos
  · subst k
    norm_num [storedPeriodTwoReference, quadratic]
  · have hk1 : k = 1 := le_antisymm (Nat.le_of_lt_succ hk) hpos
    subst k
    norm_num [storedPeriodTwoReference, quadratic]

/-- The biased-reference multiplier enclosure is strictly below one third. -/
theorem storedPeriodTwo_multiplier_bound :
    multiplierBound (storedOrbitRadius (1 / 16 + 1 / 1024) (1 / 512)
      storedPeriodTwoRadius (fun _ => 1 / 256)) 2 ≤ 1 / 3 := by
  norm_num [multiplierBound, Finset.prod_range_succ, storedOrbitRadius,
    storedOrbitError, errorBudget, storedPeriodTwoRadius]

/-- The biased-reference center displacement fits a positive disk margin. -/
theorem storedPeriodTwo_center_bound :
    storedCenterReturnBound storedPeriodTwoReference 0 (1 / 1024) (1 / 512)
      storedPeriodTwoRadius (fun _ => 1 / 256) 2 ≤ 1 / 32 := by
  norm_num [storedCenterReturnBound, storedPeriodTwoReference, storedOrbitError,
    errorBudget, storedPeriodTwoRadius]

/-- The stored endpoint separates the only proper divisor despite both
initial and local reference errors. -/
theorem storedPeriodTwo_divisor_separation (d : ℕ) (hd : 0 < d) (hlt : d < 2) :
    storedOrbitError (1 / 16 + 1 / 1024) (1 / 512) storedPeriodTwoRadius
      (fun _ => 1 / 256) d + 1 / 16 < ‖storedPeriodTwoReference d - 0‖ := by
  have hd1 : d = 1 := le_antisymm (Nat.le_of_lt_succ hlt) hd
  subst d
  norm_num [storedOrbitError, errorBudget, storedPeriodTwoRadius, storedPeriodTwoReference]

/-- A positive parameter disk has a unique primitive period-two return point
certified from the biased reference, with multiplier at most one third. -/
theorem uniform_storedPeriodTwo_disk_certificate :
    ∀ c ∈ closedBall (-1 : ℂ) (1 / 512),
      ∃! ζ : ℂ, ζ ∈ closedBall 0 (1 / 16) ∧ orbit c 2 ζ = ζ ∧
        minimalPeriod (quadratic c) ζ = 2 ∧
        ‖(derivative (seedPolynomial c 2)).eval ζ‖ ≤ 1 / 3 := by
  intro c hc
  have hparam : ‖c - (-1 : ℂ)‖ ≤ 1 / 512 := by
    simpa only [mem_closedBall, dist_eq_norm] using hc
  have hmult : ∀ z ∈ closedBall (0 : ℂ) (1 / 16),
      ‖(derivative (seedPolynomial c 2)).eval z‖ ≤
        multiplierBound (storedOrbitRadius (1 / 16 + 1 / 1024) (1 / 512)
          storedPeriodTwoRadius (fun _ => 1 / 256)) 2 := by
    intro z hz
    exact seedDerivative_norm_le_stored_bound (-1) c 0 z storedPeriodTwoReference
      (1 / 16) (1 / 1024) (1 / 512) storedPeriodTwoRadius (fun _ => 1 / 256) 2
      (by simpa only [mem_closedBall, dist_eq_norm] using hz) storedPeriodTwo_initial_bound
      hparam (fun k _ => storedPeriodTwo_radius_bound k) storedPeriodTwo_residual_bound
  obtain ⟨ζ, hζ, honly⟩ := existsUnique_primitivePoint_of_stored_enclosure (-1) c 0
    storedPeriodTwoReference (1 / 16) (1 / 1024) (1 / 512) storedPeriodTwoRadius
    (fun _ => 1 / 256) 2 (by norm_num) (by norm_num) storedPeriodTwo_initial_bound hparam
    (fun k _ => storedPeriodTwo_radius_bound k) storedPeriodTwo_residual_bound
    (lt_of_le_of_lt storedPeriodTwo_multiplier_bound (by norm_num))
    (by
      have hmul := mul_le_mul_of_nonneg_right storedPeriodTwo_multiplier_bound
        (by norm_num : (0 : ℝ) ≤ 1 / 16)
      exact (add_le_add storedPeriodTwo_center_bound hmul).trans (by norm_num))
    (fun d hd _ hlt => storedPeriodTwo_divisor_separation d hd hlt)
  refine ExistsUnique.intro ζ
    ⟨hζ.1, hζ.2.1, hζ.2.2.1, hζ.2.2.2.trans storedPeriodTwo_multiplier_bound⟩ ?_
  intro y hy
  exact honly y ⟨hy.1, hy.2.1, hy.2.2.1, hmult y hy.1⟩

end IntMProof
