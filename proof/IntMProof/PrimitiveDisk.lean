import IntMProof.DiskEnclosure
import IntMProof.CriticalEntry

/-!
# Primitive-period disk certificates (E2, L1)

Strict separation at the reference center excludes a return throughout the
parameter/seed region. Excluding every positive proper divisor of a closing
return proves primitive period. These inequalities and all disk-enclosure
constants are exact; their machine evaluation remains a separate obligation.
-/

namespace IntMProof

open Function Metric Polynomial

/-- A strict reference-center separation excludes the `d`th return at every
parameter and seed inside the stated disks. -/
theorem orbit_ne_of_disk_separation (cRef c z₀ z : ℂ) (r Δ : ℝ) (d : ℕ)
    (hseed : ‖z - z₀‖ ≤ r) (hparam : ‖c - cRef‖ ≤ Δ)
    (hsep : diskOrbitError cRef z₀ r Δ d + r < ‖orbit cRef d z₀ - z₀‖) :
    orbit c d z ≠ z := by
  intro hreturn
  have herror := orbit_sub_reference_le_diskOrbitError cRef c z₀ z r Δ d hseed hparam
  have hsplit : orbit cRef d z₀ - z₀ = (orbit cRef d z₀ - z) + (z - z₀) := by ring
  have href : ‖orbit cRef d z₀ - z₀‖ ≤ diskOrbitError cRef z₀ r Δ d + r := by
    calc
      _ ≤ ‖orbit cRef d z₀ - z‖ + ‖z - z₀‖ := by
        rw [hsplit]
        exact norm_add_le _ _
      _ ≤ diskOrbitError cRef z₀ r Δ d + r := by
        apply add_le_add _ hseed
        rwa [hreturn, norm_sub_rev] at herror
  exact (not_lt_of_ge href) hsep

/-- A closing return in the seed disk has exact period `n` when the center
separation inequalities exclude every positive proper divisor uniformly. -/
theorem minimalPeriod_eq_of_disk_separation (cRef c z₀ z : ℂ) (r Δ : ℝ)
    (n : ℕ) (hn : 0 < n) (hseed : ‖z - z₀‖ ≤ r) (hparam : ‖c - cRef‖ ≤ Δ)
    (hclose : orbit c n z = z)
    (hsep : ∀ d : ℕ, 0 < d → d ∣ n → d < n →
      diskOrbitError cRef z₀ r Δ d + r < ‖orbit cRef d z₀ - z₀‖) :
    minimalPeriod (quadratic c) z = n := by
  apply (exactPeriod_iff_proper_divisors (quadratic c) z n hn hclose).mpr
  intro d hd hdn hlt
  exact orbit_ne_of_disk_separation cRef c z₀ z r Δ d hseed hparam (hsep d hd hdn hlt)

/-- The center inequalities imply the prime-quotient exclusions too, so an
implementation may use E2's smaller equivalent set of tests under closure. -/
theorem prime_quotient_returns_ne_of_disk_separation (cRef c z₀ z : ℂ) (r Δ : ℝ)
    (n : ℕ) (hn : 0 < n) (hseed : ‖z - z₀‖ ≤ r) (hparam : ‖c - cRef‖ ≤ Δ)
    (hclose : orbit c n z = z)
    (hsep : ∀ d : ℕ, 0 < d → d ∣ n → d < n →
      diskOrbitError cRef z₀ r Δ d + r < ‖orbit cRef d z₀ - z₀‖) :
    ∀ p : ℕ, p.Prime → p ∣ n → orbit c (n / p) z ≠ z := by
  exact (exactPeriod_iff_prime_quotient (quadratic c) z n hn hclose).mp
    (minimalPeriod_eq_of_disk_separation cRef c z₀ z r Δ n hn hseed hparam hclose hsep)

/-- Combining the explicit return-disk enclosure with divisor separation
gives a unique return point of primitive period `n` in the disk. -/
theorem existsUnique_primitivePoint_of_disk_enclosure (cRef c z₀ : ℂ) (r Δ : ℝ)
    (n : ℕ) (hn : 0 < n) (hr : 0 ≤ r) (hΔ : 0 ≤ Δ) (hparam : ‖c - cRef‖ ≤ Δ)
    (hcontract : multiplierBound (diskOrbitRadius cRef z₀ r Δ) n < 1)
    (hcenter : diskCenterReturnBound cRef z₀ Δ n +
      multiplierBound (diskOrbitRadius cRef z₀ r Δ) n * r ≤ r)
    (hsep : ∀ d : ℕ, 0 < d → d ∣ n → d < n →
      diskOrbitError cRef z₀ r Δ d + r < ‖orbit cRef d z₀ - z₀‖) :
    ∃! ζ : ℂ, ζ ∈ closedBall z₀ r ∧ orbit c n ζ = ζ ∧
      minimalPeriod (quadratic c) ζ = n ∧
      ‖(derivative (seedPolynomial c n)).eval ζ‖ ≤
        multiplierBound (diskOrbitRadius cRef z₀ r Δ) n := by
  obtain ⟨ζ, hζ, honly⟩ := existsUnique_fixedPoint_orbit_of_disk_enclosure
    cRef c z₀ r Δ n hr hΔ hparam hcontract hcenter
  have hperiod := minimalPeriod_eq_of_disk_separation cRef c z₀ ζ r Δ n hn
    (by simpa only [mem_closedBall, dist_eq_norm] using hζ.1) hparam hζ.2.1 hsep
  refine ExistsUnique.intro ζ ⟨hζ.1, hζ.2.1, hperiod, hζ.2.2⟩ ?_
  intro y hy
  exact honly y ⟨hy.1, hy.2.1, hy.2.2.2⟩

/-- The same certificate proves primitive period for every parameter in the
closed parameter disk. It does not assert that the critical orbit enters. -/
theorem uniform_primitivePoint_of_disk_enclosure (cRef z₀ : ℂ) (r Δ : ℝ)
    (n : ℕ) (hn : 0 < n) (hr : 0 ≤ r) (hΔ : 0 ≤ Δ)
    (hcontract : multiplierBound (diskOrbitRadius cRef z₀ r Δ) n < 1)
    (hcenter : diskCenterReturnBound cRef z₀ Δ n +
      multiplierBound (diskOrbitRadius cRef z₀ r Δ) n * r ≤ r)
    (hsep : ∀ d : ℕ, 0 < d → d ∣ n → d < n →
      diskOrbitError cRef z₀ r Δ d + r < ‖orbit cRef d z₀ - z₀‖) :
    ∀ c ∈ closedBall cRef Δ,
      ∃! ζ : ℂ, ζ ∈ closedBall z₀ r ∧ orbit c n ζ = ζ ∧
        minimalPeriod (quadratic c) ζ = n ∧
        ‖(derivative (seedPolynomial c n)).eval ζ‖ ≤
          multiplierBound (diskOrbitRadius cRef z₀ r Δ) n := by
  intro c hc
  exact existsUnique_primitivePoint_of_disk_enclosure cRef c z₀ r Δ n hn hr hΔ
    (by simpa only [mem_closedBall, dist_eq_norm] using hc) hcontract hcenter hsep

/-- Exact reference-orbit bounds can certify critical entry uniformly over
a parameter disk. The critical seed has zero initial discrepancy. -/
theorem critical_entry_of_reference_enclosure (cRef c z₀ : ℂ) (r Δ : ℝ) (k : ℕ)
    (hparam : ‖c - cRef‖ ≤ Δ)
    (hentry : ‖orbit cRef k 0 - z₀‖ + diskOrbitError cRef 0 0 Δ k ≤ r) :
    orbit c k 0 ∈ closedBall z₀ r := by
  have herror := orbit_sub_reference_le_diskOrbitError cRef c 0 0 0 Δ k
    (by simp only [sub_self, norm_zero, le_refl]) hparam
  rw [mem_closedBall, dist_eq_norm]
  have hsplit : orbit c k 0 - z₀ =
      (orbit cRef k 0 - z₀) + (orbit c k 0 - orbit cRef k 0) := by ring
  rw [hsplit]
  exact ((norm_add_le _ _).trans (add_le_add le_rfl herror)).trans hentry

/-- The enclosure, divisor separations, and reference critical-entry margin
give a primitive attracting return point and subsequent critical contraction.
Every numerical input is still an exact inequality requiring certification. -/
theorem existsUnique_primitive_critical_return_of_disk_enclosure
    (cRef c z₀ : ℂ) (r Δ : ℝ) (k n : ℕ)
    (hn : 0 < n) (hr : 0 ≤ r) (hΔ : 0 ≤ Δ) (hparam : ‖c - cRef‖ ≤ Δ)
    (hcontract : multiplierBound (diskOrbitRadius cRef z₀ r Δ) n < 1)
    (hcenter : diskCenterReturnBound cRef z₀ Δ n +
      multiplierBound (diskOrbitRadius cRef z₀ r Δ) n * r ≤ r)
    (hsep : ∀ d : ℕ, 0 < d → d ∣ n → d < n →
      diskOrbitError cRef z₀ r Δ d + r < ‖orbit cRef d z₀ - z₀‖)
    (hentry : ‖orbit cRef k 0 - z₀‖ + diskOrbitError cRef 0 0 Δ k ≤ r) :
    ∃! ζ : ℂ, ζ ∈ closedBall z₀ r ∧ orbit c n ζ = ζ ∧
      minimalPeriod (quadratic c) ζ = n ∧
      ‖(derivative (seedPolynomial c n)).eval ζ‖ ≤
        multiplierBound (diskOrbitRadius cRef z₀ r Δ) n ∧
      ∀ m : ℕ, orbit c (k + m * n) 0 ∈ closedBall z₀ r ∧
        dist (orbit c (k + m * n) 0) ζ ≤
          multiplierBound (diskOrbitRadius cRef z₀ r Δ) n ^ m * dist (orbit c k 0) ζ := by
  have hnonneg := multiplierBound_nonneg (diskOrbitRadius cRef z₀ r Δ) n
    (fun j _ => diskOrbitRadius_nonneg cRef z₀ r Δ j hr hΔ)
  have hmult : ∀ z ∈ closedBall z₀ r,
      ‖(derivative (seedPolynomial c n)).eval z‖ ≤
        multiplierBound (diskOrbitRadius cRef z₀ r Δ) n := by
    intro z hz
    exact seedDerivative_norm_le_disk_multiplier cRef c z₀ z r Δ n
      (by simpa only [mem_closedBall, dist_eq_norm] using hz) hparam
  have hcenter' := (add_le_add
    (center_return_norm_le_diskCenterReturnBound cRef c z₀ Δ n hparam) le_rfl).trans hcenter
  obtain ⟨ζ, hζ, honly⟩ := existsUnique_critical_return_of_entry c k n z₀ r
    (multiplierBound (diskOrbitRadius cRef z₀ r Δ) n) hr hnonneg hcontract hmult hcenter'
    (critical_entry_of_reference_enclosure cRef c z₀ r Δ k hparam hentry)
  have hperiod := minimalPeriod_eq_of_disk_separation cRef c z₀ ζ r Δ n hn
    (by simpa only [mem_closedBall, dist_eq_norm] using hζ.1) hparam hζ.2.1 hsep
  refine ExistsUnique.intro ζ ⟨hζ.1, hζ.2.1, hperiod, hζ.2.2.1, hζ.2.2.2⟩ ?_
  intro y hy
  exact honly y ⟨hy.1, hy.2.1, hy.2.2.2.1, hy.2.2.2.2⟩

end IntMProof
