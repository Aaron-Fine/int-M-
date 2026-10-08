import IntMProof.Guard
import Mathlib.Analysis.Calculus.MeanValue
import Mathlib.Analysis.Normed.Operator.Bilinear

/-!
# Quantitative predictor remainder on a fixed disk

A bound on variation of the derivative of a periodic branch turns the
first-order predictor into a uniform remainder bound. The derivative variation
is an explicit input; it still has to be certified for a proposed numerical
disk. These statements do not certify the frozen TypeScript guard constants.
-/

namespace IntMProof

open Metric ContinuousLinearMap

/-- If a branch derivative varies by at most `L * ‖t - c‖` on a closed
parameter disk, then its first-order predictor has remainder at most
`L * r * ‖δ‖` throughout that disk. This is a fixed-disk estimate whose
constants are explicit hypotheses. -/
theorem predictor_remainder_le_on_disk (φ d : ℂ → ℂ) (c slope : ℂ)
    (r L : ℝ) (hr : 0 ≤ r) (hL : 0 ≤ L)
    (hderiv : ∀ t ∈ closedBall c r, HasDerivAt φ (d t) t)
    (hvariation : ∀ t ∈ closedBall c r, ‖d t - slope‖ ≤ L * ‖t - c‖)
    (δ : ℂ) (hδ : ‖δ‖ ≤ r) :
    ‖φ (c + δ) - φ c - slope * δ‖ ≤ L * r * ‖δ‖ := by
  let lin : ℂ →L[ℂ] ℂ := ContinuousLinearMap.toSpanSingleton ℂ slope
  let derivLin : ℂ → ℂ →L[ℂ] ℂ := fun t => ContinuousLinearMap.toSpanSingleton ℂ (d t)
  have hc : c ∈ closedBall c r := mem_closedBall_self hr
  have htarget : c + δ ∈ closedBall c r := by
    simpa [mem_closedBall, dist_eq_norm] using hδ
  have hdiffer : ∀ t ∈ closedBall c r, HasFDerivWithinAt φ (derivLin t)
      (closedBall c r) t := by
    intro t ht
    exact (hderiv t ht).hasFDerivAt.hasFDerivWithinAt
  have hbound : ∀ t ∈ closedBall c r, ‖derivLin t - lin‖ ≤ L * r := by
    intro t ht
    have hlin : derivLin t - lin =
        ContinuousLinearMap.toSpanSingleton ℂ (d t - slope) := by
      apply ContinuousLinearMap.ext
      intro x
      simp only [derivLin, lin, sub_apply,
        ContinuousLinearMap.toSpanSingleton_apply, smul_eq_mul]
      ring
    rw [hlin]
    calc
      ‖ContinuousLinearMap.toSpanSingleton ℂ (d t - slope)‖
          = ‖d t - slope‖ := ContinuousLinearMap.norm_toSpanSingleton _
      _ ≤ L * ‖t - c‖ := hvariation t ht
      _ ≤ L * r := mul_le_mul_of_nonneg_left (by simpa [mem_closedBall, dist_eq_norm] using ht) hL
  have hmean := (convex_closedBall c r).norm_image_sub_le_of_norm_hasFDerivWithin_le'
    hdiffer hbound hc htarget
  simpa [lin, ContinuousLinearMap.toSpanSingleton_apply, smul_eq_mul, mul_comm] using hmean

/-- A supplied bound on the second derivative certifies the derivative
variation premise of `predictor_remainder_le_on_disk`. The bound is over the
whole closed disk, so the resulting remainder is uniform there. -/
theorem predictor_remainder_le_of_second_derivative_bound
    (φ d dd : ℂ → ℂ) (c slope δ : ℂ) (r L : ℝ)
    (hr : 0 ≤ r) (hL : 0 ≤ L) (hdc : d c = slope)
    (hφ : ∀ t ∈ closedBall c r, HasDerivAt φ (d t) t)
    (hd : ∀ t ∈ closedBall c r, HasDerivAt d (dd t) t)
    (hdd : ∀ t ∈ closedBall c r, ‖dd t‖ ≤ L)
    (hδ : ‖δ‖ ≤ r) :
    ‖φ (c + δ) - φ c - slope * δ‖ ≤ L * r * ‖δ‖ := by
  let ddLin : ℂ → ℂ →L[ℂ] ℂ := fun t =>
    ContinuousLinearMap.toSpanSingleton ℂ (dd t)
  have hdiff : ∀ t ∈ closedBall c r,
      HasFDerivWithinAt d (ddLin t) (closedBall c r) t := by
    intro t ht
    exact (hd t ht).hasFDerivAt.hasFDerivWithinAt
  have hnorm : ∀ t ∈ closedBall c r, ‖ddLin t‖ ≤ L := by
    intro t ht
    simpa [ddLin] using hdd t ht
  have hc : c ∈ closedBall c r := mem_closedBall_self hr
  have hvariation : ∀ t ∈ closedBall c r,
      ‖d t - slope‖ ≤ L * ‖t - c‖ := by
    intro t ht
    rw [← hdc]
    exact (convex_closedBall c r).norm_image_sub_le_of_norm_hasFDerivWithin_le
      hdiff hnorm hc ht
  exact predictor_remainder_le_on_disk φ d c slope r L hr hL hφ
    hvariation δ hδ

/-- A quantitative guard for a specified periodic branch. A certified lower
bound on `‖1 - λ‖` controls the linear displacement, while a derivative
variation bound controls the fixed-disk remainder. The result bounds the
actual branch point; it does not establish a numerical value for `r`, `L`,
or the implementation's guard threshold. -/
theorem branch_displacement_le_on_disk (φ d : ℂ → ℂ) (c z B lam δ : ℂ)
    (r L α : ℝ) (hr : 0 ≤ r) (hL : 0 ≤ L) (hα : 0 < α)
    (hden : α ≤ ‖1 - lam‖) (hφc : φ c = z)
    (hderiv : ∀ t ∈ closedBall c r, HasDerivAt φ (d t) t)
    (hvariation : ∀ t ∈ closedBall c r,
      ‖d t - B / (1 - lam)‖ ≤ L * ‖t - c‖)
    (hδ : ‖δ‖ ≤ r) :
    ‖φ (c + δ) - z‖ ≤ ‖B‖ * ‖δ‖ / α + L * r * ‖δ‖ := by
  have hrem := predictor_remainder_le_on_disk φ d c (B / (1 - lam))
    r L hr hL hderiv hvariation δ hδ
  have hpred := predictorDisplacement_le B lam δ α hα hden
  rw [hφc] at hrem
  calc
    ‖φ (c + δ) - z‖
        = ‖(B / (1 - lam)) * δ +
            (φ (c + δ) - z - (B / (1 - lam)) * δ)‖ := by congr 1; ring
    _ ≤ ‖(B / (1 - lam)) * δ‖ +
          ‖φ (c + δ) - z - (B / (1 - lam)) * δ‖ := norm_add_le _ _
    _ ≤ ‖B‖ * ‖δ‖ / α + L * r * ‖δ‖ := add_le_add hpred hrem

end IntMProof
