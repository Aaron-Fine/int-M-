import IntMProof.Branch
import Mathlib.Analysis.Asymptotics.Lemmas
import Mathlib.Analysis.Calculus.Deriv.Basic

/-!
# First-order transplant guard

The linear predictor is `z + (B / (1 - λ)) * δ`. Its displacement has modulus
`‖B‖ * ‖δ‖ / ‖1 - λ‖` when `λ ≠ 1`. Wherever `‖1 - λ‖` is bounded below by a
positive real `α`, that displacement is at most `‖B‖ * ‖δ‖ / α`.

`exists_branch_slope` supplies the local graph of exact periodic points whose
derivative is this slope, so the predictor is the first-order expansion and
the remainder is little-o of `δ`. The prediction is a proposal, not an
acceptance. There is no uniform radius and no numerical threshold.

This file does not certify `guardDisplacement = 0.01`,
`newtonDenominatorMin = 1e-12`, or binary64. A small displacement does not
prove that the corrected seed is periodic.
-/

namespace IntMProof

open Polynomial Filter Asymptotics

open scoped Topology

/-- Modulus of the first-order predictor displacement. When `λ ≠ 1`,
`‖(B / (1 - λ)) * δ‖ = ‖B‖ * ‖δ‖ / ‖1 - λ‖`. This is the real quantity
`|B| * |δ| / |1 - λ|`. It does not certify `guardDisplacement = 0.01`,
`newtonDenominatorMin = 1e-12`, or binary64, and a small value does not
prove that the corrected seed is periodic. -/
theorem predictorDisplacement_eq (B lam δ : ℂ) (hlam : lam ≠ 1) :
    ‖(B / (1 - lam)) * δ‖ = ‖B‖ * ‖δ‖ / ‖1 - lam‖ := by
  have hden : ‖(1 : ℂ) - lam‖ ≠ 0 :=
    norm_ne_zero_iff.mpr (sub_ne_zero.mpr hlam.symm)
  rw [norm_mul, norm_div, eq_div_iff hden]
  calc
    ‖B‖ / ‖1 - lam‖ * ‖δ‖ * ‖1 - lam‖
        = ‖B‖ / ‖1 - lam‖ * ‖1 - lam‖ * ‖δ‖ := by
          rw [mul_assoc, mul_comm ‖δ‖, ← mul_assoc]
    _ = ‖B‖ * ‖δ‖ := by rw [div_mul_cancel₀ _ hden]

/-- On a region where `‖1 - λ‖` has a positive lower bound `α`, the
first-order displacement is at most `‖B‖ * ‖δ‖ / α`. The hypothesis
`0 < α ≤ ‖1 - λ‖` forces `λ ≠ 1`. This comparison does not certify
`guardDisplacement = 0.01`, `newtonDenominatorMin = 1e-12`, or binary64.
A small displacement does not prove that the corrected seed is periodic. -/
theorem predictorDisplacement_le (B lam δ : ℂ) (α : ℝ) (hα : 0 < α)
    (hden : α ≤ ‖1 - lam‖) :
    ‖(B / (1 - lam)) * δ‖ ≤ ‖B‖ * ‖δ‖ / α := by
  have hpos : 0 < ‖(1 : ℂ) - lam‖ := lt_of_lt_of_le hα hden
  have hlam : lam ≠ 1 :=
    (sub_ne_zero.mp (norm_ne_zero_iff.mp (ne_of_gt hpos))).symm
  rw [predictorDisplacement_eq B lam δ hlam]
  exact div_le_div_of_nonneg_left (mul_nonneg (norm_nonneg B) (norm_nonneg δ)) hα hden

/-- The linear predictor is the derivative of the local periodic branch.
`exists_branch_slope` returns a graph `φ` with `φ c = z`, eventual period
`n`, and slope `B / (1 - λ)`. Along that graph
`‖φ (c + δ) - z - slope * δ‖ / ‖δ‖ → 0` as `δ → 0` through `δ ≠ 0`.
The remainder is little-o of `δ`. This is not a uniform radius on a fixed
disk, and it does not certify `guardDisplacement = 0.01`,
`newtonDenominatorMin = 1e-12`, or binary64. A small displacement does not
prove that the corrected seed is periodic. -/
theorem branch_predictor_remainder (c z : ℂ) (n : ℕ) (hclose : orbit c n z = z)
    (hlam : (derivative (seedPolynomial c n)).eval z ≠ 1) :
    ∃ (φ : ℂ → ℂ) (slope : ℂ),
      φ c = z ∧
      (∀ᶠ t in 𝓝 c, orbit t n (φ t) = φ t) ∧
      HasDerivAt φ slope c ∧
      slope =
        (derivative (parameterPolynomial (C z) n)).eval c /
          (1 - (derivative (seedPolynomial c n)).eval z) ∧
      Tendsto (fun δ : ℂ => ‖φ (c + δ) - z - slope * δ‖ / ‖δ‖)
        (𝓝[≠] (0 : ℂ)) (𝓝 (0 : ℝ)) := by
  obtain ⟨φ, hφc, horbit, hderiv⟩ := exists_branch_slope c z n hclose hlam
  let slope : ℂ :=
    (derivative (parameterPolynomial (C z) n)).eval c /
      (1 - (derivative (seedPolynomial c n)).eval z)
  refine ⟨φ, slope, hφc, horbit, hderiv, rfl, ?_⟩
  have hlittle :
      (fun δ : ℂ => ‖φ (c + δ) - φ c - δ • slope‖) =o[𝓝 0] fun δ => ‖δ‖ :=
    (hasDerivAt_iff_isLittleO_nhds_zero.mp hderiv).norm_norm
  have htend :
      Tendsto (fun δ : ℂ => ‖φ (c + δ) - φ c - δ • slope‖ / ‖δ‖) (𝓝 0) (𝓝 0) :=
    hlittle.tendsto_div_nhds_zero
  refine Tendsto.mono_left (htend.congr ?_) nhdsWithin_le_nhds
  intro δ
  rw [hφc, smul_eq_mul, mul_comm δ]

end IntMProof
