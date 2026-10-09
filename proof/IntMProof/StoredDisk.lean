import IntMProof.StoredReference
import IntMProof.DiskGuard
import IntMProof.PrimitiveDisk

/-!
# Disk certificates from a stored reference (J0, G2, L0, L1)

Stored-value radii and local residual bounds supply the orbit enclosures.
The seed disk begins with error `r + ε`; its center begins with error `ε`.
Derivative bounds, invariant return disks, and strict divisor exclusions
therefore require no exact reference-orbit values as numerical inputs.
-/

namespace IntMProof

open Function Metric Polynomial

/-- Exact reference values and zero residual recover the preceding error
enclosure without an additional penalty. -/
theorem storedOrbitError_exact_reference (cRef z₀ : ℂ) (r Δ : ℝ) (n : ℕ) :
    storedOrbitError r Δ (fun k => ‖orbit cRef k z₀‖) (fun _ => 0) n =
      diskOrbitError cRef z₀ r Δ n := by
  simp only [storedOrbitError, diskOrbitError, add_zero]

/-- The absolute radius specializes to the exact-reference disk radius. -/
theorem storedOrbitRadius_exact_reference (cRef z₀ : ℂ) (r Δ : ℝ) (n : ℕ) :
    storedOrbitRadius r Δ (fun k => ‖orbit cRef k z₀‖) (fun _ => 0) n =
      diskOrbitRadius cRef z₀ r Δ n := by
  rw [storedOrbitRadius, storedOrbitError_exact_reference, diskOrbitRadius]

/-- A stored reference supplies a uniform formal seed-derivative bound. -/
theorem seedDerivative_norm_le_stored_bound (cRef c z₀ z : ℂ) (reference : ℕ → ℂ)
    (r ε Δ : ℝ) (radius residual : ℕ → ℝ) (n : ℕ)
    (hseed : ‖z - z₀‖ ≤ r) (hinit : ‖z₀ - reference 0‖ ≤ ε)
    (hparam : ‖c - cRef‖ ≤ Δ) (hr : ∀ k ≤ n, ‖reference k‖ ≤ radius k)
    (hρ : ∀ k < n, ‖reference (k + 1) - quadratic cRef (reference k)‖ ≤ residual k) :
    ‖(derivative (seedPolynomial c n)).eval z‖ ≤
      multiplierBound (storedOrbitRadius (r + ε) Δ radius residual) n := by
  apply seedDerivative_norm_le_multiplierBound
  intro k hk
  exact orbit_norm_le_storedOrbitRadius cRef c z reference (r + ε) Δ radius residual k
    (seed_sub_storedReference_zero_le z₀ z reference r ε hseed hinit) hparam
    (fun j hj => hr j (hj.trans (Nat.le_of_lt hk)))
    (fun j hj => hρ j (hj.trans hk))

/-- The same stored-reference radius sequence encloses the parameter partial
with the seed held fixed. -/
theorem parameterDerivative_norm_le_stored_bound (cRef c z₀ z : ℂ) (reference : ℕ → ℂ)
    (r ε Δ : ℝ) (radius residual : ℕ → ℝ) (n : ℕ)
    (hseed : ‖z - z₀‖ ≤ r) (hinit : ‖z₀ - reference 0‖ ≤ ε)
    (hparam : ‖c - cRef‖ ≤ Δ) (hr : ∀ k ≤ n, ‖reference k‖ ≤ radius k)
    (hρ : ∀ k < n, ‖reference (k + 1) - quadratic cRef (reference k)‖ ≤ residual k) :
    ‖(derivative (parameterPolynomial (C z) n)).eval c‖ ≤
      parameterDerivativeBound (storedOrbitRadius (r + ε) Δ radius residual) n := by
  apply parameterDerivative_norm_le_bound
  intro k hk
  exact orbit_norm_le_storedOrbitRadius cRef c z reference (r + ε) Δ radius residual k
    (seed_sub_storedReference_zero_le z₀ z reference r ε hseed hinit) hparam
    (fun j hj => hr j (hj.trans (Nat.le_of_lt hk)))
    (fun j hj => hρ j (hj.trans hk))

/-- Center-return displacement: the center has initial error `ε`, not `r + ε`. -/
noncomputable def storedCenterReturnBound (reference : ℕ → ℂ) (z₀ : ℂ) (ε Δ : ℝ)
    (radius residual : ℕ → ℝ) (n : ℕ) : ℝ :=
  ‖reference n - z₀‖ + storedOrbitError ε Δ radius residual n

/-- Stored endpoint displacement plus its error budget encloses the exact
center return throughout the parameter disk. -/
theorem center_return_norm_le_stored_bound (cRef c z₀ : ℂ) (reference : ℕ → ℂ)
    (ε Δ : ℝ) (radius residual : ℕ → ℝ) (n : ℕ)
    (hinit : ‖z₀ - reference 0‖ ≤ ε) (hparam : ‖c - cRef‖ ≤ Δ)
    (hr : ∀ k < n, ‖reference k‖ ≤ radius k)
    (hρ : ∀ k < n, ‖reference (k + 1) - quadratic cRef (reference k)‖ ≤ residual k) :
    ‖orbit c n z₀ - z₀‖ ≤ storedCenterReturnBound reference z₀ ε Δ radius residual n := by
  have herr := orbit_sub_storedReference_le_budget cRef c z₀ reference ε Δ radius residual n
    hinit hparam hr hρ
  have hsplit : orbit c n z₀ - z₀ =
      (reference n - z₀) + (orbit c n z₀ - reference n) := by ring
  rw [hsplit]
  exact (norm_add_le _ _).trans (add_le_add le_rfl herr)

/-- The stored-reference multiplier bound gives the branch denominator margin. -/
theorem stored_branch_denominator_lower (cRef c z₀ z : ℂ) (reference : ℕ → ℂ)
    (r ε Δ : ℝ) (radius residual : ℕ → ℝ) (n : ℕ)
    (hseed : ‖z - z₀‖ ≤ r) (hinit : ‖z₀ - reference 0‖ ≤ ε)
    (hparam : ‖c - cRef‖ ≤ Δ) (hr : ∀ k ≤ n, ‖reference k‖ ≤ radius k)
    (hρ : ∀ k < n, ‖reference (k + 1) - quadratic cRef (reference k)‖ ≤ residual k) :
    1 - multiplierBound (storedOrbitRadius (r + ε) Δ radius residual) n ≤
      ‖1 - (derivative (seedPolynomial c n)).eval z‖ := by
  exact one_sub_multiplier_norm_lower _ _
    (seedDerivative_norm_le_stored_bound cRef c z₀ z reference r ε Δ radius residual n
      hseed hinit hparam hr hρ)

/-- Both stored-reference derivative enclosures bound the slope expression
when the multiplier enclosure is strictly contracting. -/
theorem stored_branchSlope_norm_le (cRef c z₀ z : ℂ) (reference : ℕ → ℂ)
    (r ε Δ : ℝ) (radius residual : ℕ → ℝ) (n : ℕ)
    (hseed : ‖z - z₀‖ ≤ r) (hinit : ‖z₀ - reference 0‖ ≤ ε)
    (hparam : ‖c - cRef‖ ≤ Δ) (hr : ∀ k ≤ n, ‖reference k‖ ≤ radius k)
    (hρ : ∀ k < n, ‖reference (k + 1) - quadratic cRef (reference k)‖ ≤ residual k)
    (hcontract : multiplierBound (storedOrbitRadius (r + ε) Δ radius residual) n < 1) :
    ‖(derivative (parameterPolynomial (C z) n)).eval c /
        (1 - (derivative (seedPolynomial c n)).eval z)‖ ≤
      parameterDerivativeBound (storedOrbitRadius (r + ε) Δ radius residual) n /
        (1 - multiplierBound (storedOrbitRadius (r + ε) Δ radius residual) n) := by
  exact branchSlope_norm_le_of_bounds _ _ _ _
    (parameterDerivative_norm_le_stored_bound cRef c z₀ z reference r ε Δ radius residual n
      hseed hinit hparam hr hρ)
    (seedDerivative_norm_le_stored_bound cRef c z₀ z reference r ε Δ radius residual n
      hseed hinit hparam hr hρ) hcontract

/-- A contracting stored-reference enclosure and center margin certify an
invariant return disk with a unique attracting return point. -/
theorem existsUnique_fixedPoint_of_stored_enclosure (cRef c z₀ : ℂ) (reference : ℕ → ℂ)
    (r ε Δ : ℝ) (radius residual : ℕ → ℝ) (n : ℕ) (hradius : 0 ≤ r)
    (hinit : ‖z₀ - reference 0‖ ≤ ε) (hparam : ‖c - cRef‖ ≤ Δ)
    (hr : ∀ k ≤ n, ‖reference k‖ ≤ radius k)
    (hρ : ∀ k < n, ‖reference (k + 1) - quadratic cRef (reference k)‖ ≤ residual k)
    (hcontract : multiplierBound (storedOrbitRadius (r + ε) Δ radius residual) n < 1)
    (hcenter : storedCenterReturnBound reference z₀ ε Δ radius residual n +
      multiplierBound (storedOrbitRadius (r + ε) Δ radius residual) n * r ≤ r) :
    ∃! ζ : ℂ, ζ ∈ closedBall z₀ r ∧ orbit c n ζ = ζ ∧
      ‖(derivative (seedPolynomial c n)).eval ζ‖ ≤
        multiplierBound (storedOrbitRadius (r + ε) Δ radius residual) n := by
  have hmult : ∀ z ∈ closedBall z₀ r,
      ‖(derivative (seedPolynomial c n)).eval z‖ ≤
        multiplierBound (storedOrbitRadius (r + ε) Δ radius residual) n := by
    intro z hz
    exact seedDerivative_norm_le_stored_bound cRef c z₀ z reference r ε Δ radius residual n
      (by simpa only [mem_closedBall, dist_eq_norm] using hz) hinit hparam hr hρ
  apply existsUnique_fixedPoint_orbit_of_multiplier_le c n z₀ r
    (multiplierBound (storedOrbitRadius (r + ε) Δ radius residual) n) hradius
    ((norm_nonneg _).trans (hmult z₀ (mem_closedBall_self hradius))) hcontract hmult
  exact (add_le_add
    (center_return_norm_le_stored_bound cRef c z₀ reference ε Δ radius residual n
      hinit hparam (fun k hk => hr k (Nat.le_of_lt hk)) hρ) le_rfl).trans hcenter

/-- Strict separation from the stored endpoint excludes a divisor return;
both the propagated budget and the seed radius enter the margin. -/
theorem orbit_ne_of_stored_separation (cRef c z₀ z : ℂ) (reference : ℕ → ℂ)
    (r ε Δ : ℝ) (radius residual : ℕ → ℝ) (d : ℕ)
    (hseed : ‖z - z₀‖ ≤ r) (hinit : ‖z₀ - reference 0‖ ≤ ε)
    (hparam : ‖c - cRef‖ ≤ Δ) (hr : ∀ k < d, ‖reference k‖ ≤ radius k)
    (hρ : ∀ k < d, ‖reference (k + 1) - quadratic cRef (reference k)‖ ≤ residual k)
    (hsep : storedOrbitError (r + ε) Δ radius residual d + r < ‖reference d - z₀‖) :
    orbit c d z ≠ z := by
  intro hreturn
  have herr := orbit_sub_storedReference_le_budget cRef c z reference (r + ε) Δ
    radius residual d (seed_sub_storedReference_zero_le z₀ z reference r ε hseed hinit)
    hparam hr hρ
  have hsplit : reference d - z₀ = (reference d - z) + (z - z₀) := by ring
  have hbound : ‖reference d - z₀‖ ≤ storedOrbitError (r + ε) Δ radius residual d + r := by
    rw [hsplit]
    apply (norm_add_le _ _).trans (add_le_add _ hseed)
    rwa [hreturn, norm_sub_rev] at herr
  exact (not_lt_of_ge hbound) hsep

/-- Exact closure and stored-reference strict divisor margins imply primitive
period. Numerical near-closure is not used as exact closure. -/
theorem minimalPeriod_eq_of_stored_separation (cRef c z₀ z : ℂ) (reference : ℕ → ℂ)
    (r ε Δ : ℝ) (radius residual : ℕ → ℝ) (n : ℕ) (hn : 0 < n)
    (hseed : ‖z - z₀‖ ≤ r) (hinit : ‖z₀ - reference 0‖ ≤ ε)
    (hparam : ‖c - cRef‖ ≤ Δ) (hr : ∀ k < n, ‖reference k‖ ≤ radius k)
    (hρ : ∀ k < n, ‖reference (k + 1) - quadratic cRef (reference k)‖ ≤ residual k)
    (hclose : orbit c n z = z)
    (hsep : ∀ d : ℕ, 0 < d → d ∣ n → d < n →
      storedOrbitError (r + ε) Δ radius residual d + r < ‖reference d - z₀‖) :
    minimalPeriod (quadratic c) z = n := by
  apply (exactPeriod_iff_proper_divisors (quadratic c) z n hn hclose).mpr
  intro d hd hdn hlt
  exact orbit_ne_of_stored_separation cRef c z₀ z reference r ε Δ radius residual d
    hseed hinit hparam (fun k hk => hr k (hk.trans hlt))
    (fun k hk => hρ k (hk.trans hlt)) (hsep d hd hdn hlt)

/-- The stored-reference return and separation margins supply a unique
primitive attracting return point for the target parameter. -/
theorem existsUnique_primitivePoint_of_stored_enclosure
    (cRef c z₀ : ℂ) (reference : ℕ → ℂ) (r ε Δ : ℝ) (radius residual : ℕ → ℝ)
    (n : ℕ) (hn : 0 < n) (hradius : 0 ≤ r)
    (hinit : ‖z₀ - reference 0‖ ≤ ε) (hparam : ‖c - cRef‖ ≤ Δ)
    (hr : ∀ k ≤ n, ‖reference k‖ ≤ radius k)
    (hρ : ∀ k < n, ‖reference (k + 1) - quadratic cRef (reference k)‖ ≤ residual k)
    (hcontract : multiplierBound (storedOrbitRadius (r + ε) Δ radius residual) n < 1)
    (hcenter : storedCenterReturnBound reference z₀ ε Δ radius residual n +
      multiplierBound (storedOrbitRadius (r + ε) Δ radius residual) n * r ≤ r)
    (hsep : ∀ d : ℕ, 0 < d → d ∣ n → d < n →
      storedOrbitError (r + ε) Δ radius residual d + r < ‖reference d - z₀‖) :
    ∃! ζ : ℂ, ζ ∈ closedBall z₀ r ∧ orbit c n ζ = ζ ∧
      minimalPeriod (quadratic c) ζ = n ∧
      ‖(derivative (seedPolynomial c n)).eval ζ‖ ≤
        multiplierBound (storedOrbitRadius (r + ε) Δ radius residual) n := by
  obtain ⟨ζ, hζ, honly⟩ := existsUnique_fixedPoint_of_stored_enclosure cRef c z₀ reference
    r ε Δ radius residual n hradius hinit hparam hr hρ hcontract hcenter
  have hperiod := minimalPeriod_eq_of_stored_separation cRef c z₀ ζ reference r ε Δ
    radius residual n hn (by simpa only [mem_closedBall, dist_eq_norm] using hζ.1)
    hinit hparam (fun k hk => hr k (Nat.le_of_lt hk)) hρ hζ.2.1 hsep
  refine ExistsUnique.intro ζ ⟨hζ.1, hζ.2.1, hperiod, hζ.2.2⟩ ?_
  intro y hy
  exact honly y ⟨hy.1, hy.2.1, hy.2.2.2⟩

/-- A stored critical-orbit prefix certifies entry using its full propagated
error, with radii only for the stored sequence. -/
theorem critical_entry_of_storedReference (cRef c z₀ : ℂ) (reference : ℕ → ℂ)
    (ε Δ r : ℝ) (radius residual : ℕ → ℝ) (k : ℕ)
    (hinit : ‖reference 0‖ ≤ ε) (hparam : ‖c - cRef‖ ≤ Δ)
    (hr : ∀ j < k, ‖reference j‖ ≤ radius j)
    (hρ : ∀ j < k, ‖reference (j + 1) - quadratic cRef (reference j)‖ ≤ residual j)
    (hentry : ‖reference k - z₀‖ + storedOrbitError ε Δ radius residual k ≤ r) :
    orbit c k 0 ∈ closedBall z₀ r := by
  have herr := orbit_sub_storedReference_le_budget cRef c 0 reference ε Δ radius residual k
    (by simpa only [zero_sub, norm_neg] using hinit) hparam hr hρ
  rw [mem_closedBall, dist_eq_norm]
  have hsplit : orbit c k 0 - z₀ = (reference k - z₀) + (orbit c k 0 - reference k) := by
    ring
  rw [hsplit]
  exact ((norm_add_le _ _).trans (add_le_add le_rfl herr)).trans hentry

end IntMProof
