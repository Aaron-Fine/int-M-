import IntMProof.ErrorBudget
import IntMProof.ReturnDisk

/-!
# Reference-centered disk enclosures (J0, L0)

One exact reference orbit supplies enclosures for every parameter and seed in
the stated disks. Its error recurrence bounds intermediate iterates, and the
product of their factor bounds encloses the formal multiplier. The resulting
return certificate is a sufficient condition; all real comparisons still
require certified evaluation before use by a machine-arithmetic consumer.
-/

namespace IntMProof

open Metric Polynomial

/-- The error radius around an exact reference orbit, with seed radius `r`
and parameter radius `Δ`. -/
noncomputable def diskOrbitError (cRef z₀ : ℂ) (r Δ : ℝ) (n : ℕ) : ℝ :=
  errorBudget r (fun k => ‖orbit cRef k z₀‖) (fun _ => Δ) n

/-- Absolute radius of the enclosed `n`th orbit values. -/
noncomputable def diskOrbitRadius (cRef z₀ : ℂ) (r Δ : ℝ) (n : ℕ) : ℝ :=
  ‖orbit cRef n z₀‖ + diskOrbitError cRef z₀ r Δ n

/-- The initial reference-centered error radius is the seed radius. -/
theorem diskOrbitError_zero (cRef z₀ : ℂ) (r Δ : ℝ) :
    diskOrbitError cRef z₀ r Δ 0 = r := rfl

/-- The error radius propagates using the exact reference orbit. -/
theorem diskOrbitError_succ (cRef z₀ : ℂ) (r Δ : ℝ) (n : ℕ) :
    diskOrbitError cRef z₀ r Δ (n + 1) =
      2 * ‖orbit cRef n z₀‖ * diskOrbitError cRef z₀ r Δ n
        + diskOrbitError cRef z₀ r Δ n ^ 2 + Δ := rfl

/-- Nonnegative region radii give nonnegative orbit-error radii. -/
theorem diskOrbitError_nonneg (cRef z₀ : ℂ) (r Δ : ℝ) (n : ℕ)
    (hr : 0 ≤ r) (hΔ : 0 ≤ Δ) : 0 ≤ diskOrbitError cRef z₀ r Δ n := by
  exact errorBudget_nonneg r (fun k => ‖orbit cRef k z₀‖) (fun _ => Δ) n hr
    (fun k _ => norm_nonneg _) (fun _ _ => hΔ)

/-- The absolute enclosed orbit radius is nonnegative. -/
theorem diskOrbitRadius_nonneg (cRef z₀ : ℂ) (r Δ : ℝ) (n : ℕ)
    (hr : 0 ≤ r) (hΔ : 0 ≤ Δ) : 0 ≤ diskOrbitRadius cRef z₀ r Δ n := by
  exact add_nonneg (norm_nonneg _) (diskOrbitError_nonneg cRef z₀ r Δ n hr hΔ)

/-- Every admissible parameter and seed is enclosed at every iterate.
The same reference sequence works for the entire region. -/
theorem orbit_sub_reference_le_diskOrbitError (cRef c z₀ z : ℂ) (r Δ : ℝ)
    (n : ℕ) (hseed : ‖z - z₀‖ ≤ r) (hparam : ‖c - cRef‖ ≤ Δ) :
    ‖orbit c n z - orbit cRef n z₀‖ ≤ diskOrbitError cRef z₀ r Δ n := by
  exact orbit_norm_sub_le_budget cRef c z₀ z r Δ (fun k => ‖orbit cRef k z₀‖) n
    hseed hparam (fun _ _ => le_rfl)

/-- The region's intermediate orbit values have bounded absolute norm. -/
theorem orbit_norm_le_diskOrbitRadius (cRef c z₀ z : ℂ) (r Δ : ℝ)
    (n : ℕ) (hseed : ‖z - z₀‖ ≤ r) (hparam : ‖c - cRef‖ ≤ Δ) :
    ‖orbit c n z‖ ≤ diskOrbitRadius cRef z₀ r Δ n := by
  have herror := orbit_sub_reference_le_diskOrbitError cRef c z₀ z r Δ n hseed hparam
  have hsplit : orbit c n z =
      orbit cRef n z₀ + (orbit c n z - orbit cRef n z₀) := by ring
  calc
    ‖orbit c n z‖ ≤ ‖orbit cRef n z₀‖ + ‖orbit c n z - orbit cRef n z₀‖ := by
      conv_lhs => rw [hsplit]
      exact norm_add_le _ _
    _ ≤ diskOrbitRadius cRef z₀ r Δ n := add_le_add le_rfl herror

/-- Product bound for a multiplier from per-iterate absolute radii. -/
noncomputable def multiplierBound (radius : ℕ → ℝ) (n : ℕ) : ℝ :=
  ∏ k ∈ Finset.range n, (2 * radius k)

/-- The zero-step multiplier bound is one, so a zero-step return cannot
satisfy the strict contraction condition. -/
theorem multiplierBound_zero (radius : ℕ → ℝ) : multiplierBound radius 0 = 1 := by
  simp only [multiplierBound, Finset.prod_range_zero]

/-- One extra iterate adds its factor bound to the multiplier product. -/
theorem multiplierBound_succ (radius : ℕ → ℝ) (n : ℕ) :
    multiplierBound radius (n + 1) = multiplierBound radius n * (2 * radius n) := by
  exact Finset.prod_range_succ (fun k => 2 * radius k) n

/-- Nonnegative radii give a nonnegative multiplier product. -/
theorem multiplierBound_nonneg (radius : ℕ → ℝ) (n : ℕ)
    (hr : ∀ k < n, 0 ≤ radius k) : 0 ≤ multiplierBound radius n := by
  induction n with
  | zero => rw [multiplierBound_zero]; exact zero_le_one
  | succ n ih =>
    rw [multiplierBound_succ]
    exact mul_nonneg (ih (fun k hk => hr k (Nat.lt_succ_of_lt hk)))
      (mul_nonneg zero_le_two (hr n (Nat.lt_succ_self n)))

/-- Bounds on each orbit factor enclose the formal seed derivative. -/
theorem seedDerivative_norm_le_multiplierBound (c z : ℂ) (radius : ℕ → ℝ)
    (n : ℕ) (horbit : ∀ k < n, ‖orbit c k z‖ ≤ radius k) :
    ‖(derivative (seedPolynomial c n)).eval z‖ ≤ multiplierBound radius n := by
  induction n with
  | zero =>
    simp only [seedPolynomial_derivative_zero, norm_one, multiplierBound_zero, le_refl]
  | succ n ih =>
    have hbound := ih (fun k hk => horbit k (Nat.lt_succ_of_lt hk))
    have hrad := horbit n (Nat.lt_succ_self n)
    rw [seedPolynomial_derivative_succ, Complex.norm_mul, Complex.norm_mul,
      Complex.norm_two, multiplierBound_succ, mul_comm (multiplierBound radius n)]
    exact mul_le_mul (mul_le_mul_of_nonneg_left hrad zero_le_two) hbound
      (norm_nonneg _) (mul_nonneg zero_le_two ((norm_nonneg _).trans hrad))

/-- Uniform multiplier bound on both the parameter and seed disks. -/
theorem seedDerivative_norm_le_disk_multiplier (cRef c z₀ z : ℂ) (r Δ : ℝ)
    (n : ℕ) (hseed : ‖z - z₀‖ ≤ r) (hparam : ‖c - cRef‖ ≤ Δ) :
    ‖(derivative (seedPolynomial c n)).eval z‖ ≤
      multiplierBound (diskOrbitRadius cRef z₀ r Δ) n := by
  exact seedDerivative_norm_le_multiplierBound c z (diskOrbitRadius cRef z₀ r Δ) n
    (fun k _ => orbit_norm_le_diskOrbitRadius cRef c z₀ z r Δ k hseed hparam)

/-- Bound for the return displacement of the seed-disk center across a
parameter region. The center's initial seed error is zero. -/
noncomputable def diskCenterReturnBound (cRef z₀ : ℂ) (Δ : ℝ) (n : ℕ) : ℝ :=
  ‖orbit cRef n z₀ - z₀‖ + diskOrbitError cRef z₀ 0 Δ n

/-- The center's return displacement is enclosed uniformly over parameters. -/
theorem center_return_norm_le_diskCenterReturnBound (cRef c z₀ : ℂ) (Δ : ℝ)
    (n : ℕ) (hparam : ‖c - cRef‖ ≤ Δ) :
    ‖orbit c n z₀ - z₀‖ ≤ diskCenterReturnBound cRef z₀ Δ n := by
  have herror := orbit_sub_reference_le_diskOrbitError cRef c z₀ z₀ 0 Δ n
    (by simp only [sub_self, norm_zero, le_refl]) hparam
  have hsplit : orbit c n z₀ - z₀ =
      (orbit cRef n z₀ - z₀) + (orbit c n z₀ - orbit cRef n z₀) := by ring
  rw [hsplit]
  exact (norm_add_le _ _).trans (add_le_add le_rfl herror)

/-- The disk multiplier enclosure supplies a uniform Lipschitz constant for
the return map on the seed disk. -/
theorem lipschitzOnWith_orbit_of_disk_enclosure (cRef c z₀ : ℂ) (r Δ : ℝ)
    (n : ℕ) (hr : 0 ≤ r) (hΔ : 0 ≤ Δ) (hparam : ‖c - cRef‖ ≤ Δ) :
    LipschitzOnWith
      ⟨multiplierBound (diskOrbitRadius cRef z₀ r Δ) n,
        multiplierBound_nonneg _ n (fun k _ => diskOrbitRadius_nonneg cRef z₀ r Δ k hr hΔ)⟩
      (fun z => orbit c n z) (closedBall z₀ r) := by
  apply lipschitzOnWith_closedBall_of_deriv_le (fun z => orbit c n z) z₀ r
    (multiplierBound (diskOrbitRadius cRef z₀ r Δ) n)
    (multiplierBound_nonneg _ n (fun k _ => diskOrbitRadius_nonneg cRef z₀ r Δ k hr hΔ))
  · intro z _
    exact differentiableAt_orbit c n z
  · intro z hz
    rw [deriv_orbit]
    apply seedDerivative_norm_le_disk_multiplier cRef c z₀ z r Δ n
    · simpa only [mem_closedBall, dist_eq_norm] using hz
    · exact hparam

/-- The enclosed multiplier and center displacement give an explicit return
disk certificate for every parameter in the stated region. -/
theorem existsUnique_fixedPoint_orbit_of_disk_enclosure (cRef c z₀ : ℂ) (r Δ : ℝ)
    (n : ℕ) (hr : 0 ≤ r) (hΔ : 0 ≤ Δ) (hparam : ‖c - cRef‖ ≤ Δ)
    (hcontract : multiplierBound (diskOrbitRadius cRef z₀ r Δ) n < 1)
    (hcenter : diskCenterReturnBound cRef z₀ Δ n +
      multiplierBound (diskOrbitRadius cRef z₀ r Δ) n * r ≤ r) :
    ∃! ζ : ℂ, ζ ∈ closedBall z₀ r ∧ orbit c n ζ = ζ ∧
      ‖(derivative (seedPolynomial c n)).eval ζ‖ ≤
        multiplierBound (diskOrbitRadius cRef z₀ r Δ) n := by
  apply existsUnique_fixedPoint_orbit_of_multiplier_le c n z₀ r
    (multiplierBound (diskOrbitRadius cRef z₀ r Δ) n) hr
    (multiplierBound_nonneg _ n (fun k _ => diskOrbitRadius_nonneg cRef z₀ r Δ k hr hΔ))
    hcontract
  · intro z hz
    exact seedDerivative_norm_le_disk_multiplier cRef c z₀ z r Δ n
      (by simpa only [mem_closedBall, dist_eq_norm] using hz) hparam
  · exact (add_le_add (center_return_norm_le_diskCenterReturnBound cRef c z₀ Δ n hparam)
      le_rfl).trans hcenter

end IntMProof
