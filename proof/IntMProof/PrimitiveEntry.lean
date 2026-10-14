import IntMProof.CriticalEntryBudget

/-!
# Primitive period certificate after critical entry

A separated return disk excludes shorter divisor returns.  The separation is
expressed using the center's finite orbit and a derivative bound on the disk,
so outward arithmetic can eventually discharge the hypotheses.  The critical
point need not itself be periodic.
-/

namespace IntMProof

open Function Metric Polynomial Set

/-- A computed center image certifies disk separation when its outward
error allowance fits inside the observed distance margin. -/
theorem center_separation_of_error_bound
    (c z₀ approx : ℂ) (d : ℕ) (r L ε : ℝ)
    (herror : ‖approx - orbit c d z₀‖ ≤ ε)
    (hsep : (L + 1) * r + ε < ‖approx - z₀‖) :
    (L + 1) * r < ‖orbit c d z₀ - z₀‖ := by
  have htriangle : ‖approx - z₀‖ ≤
      ‖approx - orbit c d z₀‖ + ‖orbit c d z₀ - z₀‖ := by
    convert norm_add_le (approx - orbit c d z₀) (orbit c d z₀ - z₀) using 1
    · congr 1
      abel
  linarith

/-- If the `d`-step image of a disk center is farther than `(L + 1) r`
from that center, and the `d`-step map has derivative norm at most `L` on
the disk, no point in the disk returns after `d` steps. -/
theorem no_return_in_closedBall_of_center_separation
    (c z₀ : ℂ) (d : ℕ) (r L : ℝ) (hL : 0 ≤ L)
    (hderiv : ∀ z ∈ closedBall z₀ r,
      ‖(derivative (seedPolynomial c d)).eval z‖ ≤ L)
    (hsep : (L + 1) * r < ‖orbit c d z₀ - z₀‖)
    (ζ : ℂ) (hζ : ζ ∈ closedBall z₀ r) : orbit c d ζ ≠ ζ := by
  intro hfix
  have hdiff : ∀ z ∈ closedBall z₀ r,
      DifferentiableAt ℂ (fun w => orbit c d w) z :=
    fun z _ => differentiableAt_orbit c d z
  have hbound : ∀ z ∈ closedBall z₀ r,
      ‖deriv (fun w => orbit c d w) z‖ ≤ L := by
    intro z hz
    rw [deriv_orbit]
    exact hderiv z hz
  have hlip := lipschitzOnWith_closedBall_of_deriv_le
    (fun w => orbit c d w) z₀ r L hL hdiff hbound
  have hr : 0 ≤ r := (Metric.nonempty_closedBall.mp ⟨ζ, hζ⟩)
  have hz₀ : z₀ ∈ closedBall z₀ r := mem_closedBall_self hr
  have hdist := hlip.dist_le_mul z₀ hz₀ ζ hζ
  have hζr : dist ζ z₀ ≤ r := hζ
  have hmain : ‖orbit c d z₀ - z₀‖ ≤ (L + 1) * r := by
    calc
      ‖orbit c d z₀ - z₀‖ = dist (orbit c d z₀) z₀ := (dist_eq_norm ..).symm
      _ ≤ dist (orbit c d z₀) ζ + dist ζ z₀ := dist_triangle _ _ _
      _ ≤ L * dist z₀ ζ + dist ζ z₀ := by
        rw [hfix] at hdist
        exact add_le_add hdist le_rfl
      _ ≤ L * r + r := by
        rw [dist_comm z₀ ζ]
        exact add_le_add (mul_le_mul_of_nonneg_left hζr hL) hζr
      _ = (L + 1) * r := by ring
  exact (not_le_of_gt hsep) hmain

/-- A trapped critical orbit converges to a return fixed point of primitive
period `n` when every positive proper divisor has a separated disk image. -/
theorem existsUnique_primitive_critical_return_of_entry
    (c : ℂ) (k n : ℕ) (z₀ : ℂ) (r q : ℝ)
    (hn : 0 < n) (hr : 0 ≤ r) (hq : 0 ≤ q) (hq1 : q < 1)
    (hmult : ∀ z ∈ closedBall z₀ r,
      ‖(derivative (seedPolynomial c n)).eval z‖ ≤ q)
    (hcenter : ‖orbit c n z₀ - z₀‖ + q * r ≤ r)
    (hentry : orbit c k 0 ∈ closedBall z₀ r)
    (L : ℕ → ℝ)
    (hL : ∀ d, 0 < d → d ∣ n → d < n → 0 ≤ L d)
    (hderiv : ∀ d, 0 < d → d ∣ n → d < n →
      ∀ z ∈ closedBall z₀ r,
        ‖(derivative (seedPolynomial c d)).eval z‖ ≤ L d)
    (hsep : ∀ d, 0 < d → d ∣ n → d < n →
      (L d + 1) * r < ‖orbit c d z₀ - z₀‖) :
    ∃! ζ : ℂ, ζ ∈ closedBall z₀ r ∧
      minimalPeriod (quadratic c) ζ = n ∧
      ‖(derivative (seedPolynomial c n)).eval ζ‖ ≤ q ∧
      ∀ m : ℕ, orbit c (k + m * n) 0 ∈ closedBall z₀ r ∧
        dist (orbit c (k + m * n) 0) ζ ≤ q ^ m * dist (orbit c k 0) ζ := by
  obtain ⟨ζ, hζ, honly⟩ :=
    existsUnique_critical_return_of_entry c k n z₀ r q hr hq hq1 hmult hcenter hentry
  have hperiod : minimalPeriod (quadratic c) ζ = n := by
    apply (minimalPeriod_return_fixedPoint_iff c ζ n hn).2
    refine ⟨hζ.2.1, ?_⟩
    intro d hd hdvd hdlt
    exact no_return_in_closedBall_of_center_separation c z₀ d r (L d)
      (hL d hd hdvd hdlt) (hderiv d hd hdvd hdlt)
      (hsep d hd hdvd hdlt) ζ hζ.1
  refine ExistsUnique.intro ζ ⟨hζ.1, hperiod, hζ.2.2.1, hζ.2.2.2⟩ ?_
  intro y hy
  have hfix : orbit c n y = y :=
    ((minimalPeriod_return_fixedPoint_iff c y n hn).1 hy.2.1).1
  exact honly y ⟨hy.1, hfix, hy.2.2.1, hy.2.2.2⟩

/-- An approximate critical iterate with a certified error margin gives a
primitive attracting return when the proper-divisor disks are separated. -/
theorem existsUnique_primitive_critical_return_of_error_budget
    (c : ℂ) (k n : ℕ) (z₀ : ℂ) (r q ε : ℝ)
    (approx : ℕ → ℂ) (radius forcing : ℕ → ℝ)
    (hn : 0 < n) (hr : 0 ≤ r) (hq : 0 ≤ q) (hq1 : q < 1)
    (hmult : ∀ z ∈ closedBall z₀ r,
      ‖(derivative (seedPolynomial c n)).eval z‖ ≤ q)
    (hcenter : ‖orbit c n z₀ - z₀‖ + q * r ≤ r)
    (hε : ‖approx 0‖ ≤ ε)
    (horbit : ∀ j < k, ‖orbit c j 0‖ ≤ radius j)
    (hlocal : ∀ j < k,
      ‖approx (j + 1) - quadratic c (approx j)‖ ≤ forcing j)
    (hentry : ‖approx k - z₀‖ + errorBudget ε radius forcing k ≤ r)
    (L : ℕ → ℝ)
    (hL : ∀ d, 0 < d → d ∣ n → d < n → 0 ≤ L d)
    (hderiv : ∀ d, 0 < d → d ∣ n → d < n →
      ∀ z ∈ closedBall z₀ r,
        ‖(derivative (seedPolynomial c d)).eval z‖ ≤ L d)
    (hsep : ∀ d, 0 < d → d ∣ n → d < n →
      (L d + 1) * r < ‖orbit c d z₀ - z₀‖) :
    ∃! ζ : ℂ, ζ ∈ closedBall z₀ r ∧
      minimalPeriod (quadratic c) ζ = n ∧
      ‖(derivative (seedPolynomial c n)).eval ζ‖ ≤ q ∧
      ∀ m : ℕ, orbit c (k + m * n) 0 ∈ closedBall z₀ r ∧
        dist (orbit c (k + m * n) 0) ζ ≤ q ^ m * dist (orbit c k 0) ζ := by
  apply existsUnique_primitive_critical_return_of_entry c k n z₀ r q hn hr hq hq1
    hmult hcenter
    (critical_mem_closedBall_of_error_budget c z₀ approx ε r radius forcing k
      hε horbit hlocal hentry) L hL hderiv hsep

end IntMProof
