import IntMProof.ErrorBudget

/-!
# Closure-residual bounds for a parameter and seed region (J0)

The orbit comparison budget also bounds the closure residual `orbit c n z - z`.
Squaring a certified nonnegative modulus interval yields exact bounds for the
quantity tested by the verifier. Numerical reference moduli and outward
rational conversions remain caller-supplied.
-/

namespace IntMProof

/-- A parameter/seed perturbation changes the closure residual by at most the
orbit comparison budget plus the initial seed gap. -/
theorem closureResidual_variation_le_budget
    (c₀ c₁ z₀ z₁ : ℂ) (ε Δ : ℝ) (radius : ℕ → ℝ) (n : ℕ)
    (hseed : ‖z₁ - z₀‖ ≤ ε) (hparam : ‖c₁ - c₀‖ ≤ Δ)
    (hr : ∀ k < n, ‖orbit c₀ k z₀‖ ≤ radius k) :
    ‖(orbit c₁ n z₁ - z₁) - (orbit c₀ n z₀ - z₀)‖ ≤
      errorBudget ε radius (fun _ => Δ) n + ε := by
  have hsplit : (orbit c₁ n z₁ - z₁) - (orbit c₀ n z₀ - z₀) =
      (orbit c₁ n z₁ - orbit c₀ n z₀) - (z₁ - z₀) := by ring
  rw [hsplit]
  exact (norm_sub_le _ _).trans
    (add_le_add (orbit_norm_sub_le_budget c₀ c₁ z₀ z₁ ε Δ radius n
      hseed hparam hr) hseed)

/-- Certified lower and upper reference margins become squared residual
bounds throughout the region. The lower-margin premise includes the full
perturbation budget, so it remains sound even near a closure threshold. -/
theorem closureResidual_sq_interval_of_budget
    (c₀ c₁ z₀ z₁ : ℂ) (ε Δ lower upper : ℝ)
    (radius : ℕ → ℝ) (n : ℕ)
    (hseed : ‖z₁ - z₀‖ ≤ ε) (hparam : ‖c₁ - c₀‖ ≤ Δ)
    (hr : ∀ k < n, ‖orbit c₀ k z₀‖ ≤ radius k)
    (hlower : 0 ≤ lower)
    (hlowerMargin : lower + (errorBudget ε radius (fun _ => Δ) n + ε) ≤
      ‖orbit c₀ n z₀ - z₀‖)
    (hupper : ‖orbit c₀ n z₀ - z₀‖ ≤ upper) :
    lower ^ 2 ≤ ‖orbit c₁ n z₁ - z₁‖ ^ 2 ∧
      ‖orbit c₁ n z₁ - z₁‖ ^ 2 ≤
        (upper + (errorBudget ε radius (fun _ => Δ) n + ε)) ^ 2 := by
  let budget := errorBudget ε radius (fun _ => Δ) n + ε
  have hdiff : ‖(orbit c₁ n z₁ - z₁) - (orbit c₀ n z₀ - z₀)‖ ≤ budget :=
    closureResidual_variation_le_budget c₀ c₁ z₀ z₁ ε Δ radius n
      hseed hparam hr
  have hbudget : 0 ≤ budget := (norm_nonneg _).trans hdiff
  have hlow : lower ≤ ‖orbit c₁ n z₁ - z₁‖ := by
    have htri : ‖orbit c₀ n z₀ - z₀‖ ≤
        ‖orbit c₁ n z₁ - z₁‖ +
          ‖(orbit c₁ n z₁ - z₁) - (orbit c₀ n z₀ - z₀)‖ := by
      have hsum : (orbit c₁ n z₁ - z₁) -
          ((orbit c₁ n z₁ - z₁) - (orbit c₀ n z₀ - z₀)) =
          orbit c₀ n z₀ - z₀ := by abel
      calc
        ‖orbit c₀ n z₀ - z₀‖ =
            ‖(orbit c₁ n z₁ - z₁) -
              ((orbit c₁ n z₁ - z₁) - (orbit c₀ n z₀ - z₀))‖ :=
          congrArg norm hsum.symm
        _ ≤ _ := norm_sub_le _ _
    linarith
  have hhigh : ‖orbit c₁ n z₁ - z₁‖ ≤ upper + budget := by
    have htri : ‖orbit c₁ n z₁ - z₁‖ ≤
        ‖orbit c₀ n z₀ - z₀‖ +
          ‖(orbit c₁ n z₁ - z₁) - (orbit c₀ n z₀ - z₀)‖ := by
      have hsum : (orbit c₀ n z₀ - z₀) +
          ((orbit c₁ n z₁ - z₁) - (orbit c₀ n z₀ - z₀)) =
          orbit c₁ n z₁ - z₁ := by abel
      calc
        ‖orbit c₁ n z₁ - z₁‖ =
            ‖(orbit c₀ n z₀ - z₀) +
              ((orbit c₁ n z₁ - z₁) - (orbit c₀ n z₀ - z₀))‖ :=
          congrArg norm hsum.symm
        _ ≤ _ := norm_add_le _ _
    linarith
  have hupperNonneg : 0 ≤ upper + budget :=
    (norm_nonneg _).trans hhigh
  constructor
  · nlinarith [sq_nonneg (‖orbit c₁ n z₁ - z₁‖ - lower)]
  · nlinarith [sq_nonneg (upper + budget - ‖orbit c₁ n z₁ - z₁‖)]

end IntMProof
