import IntMProof.ExactPeriod
import IntMProof.ReturnDisk

/-!
# Critical-orbit entry into a return disk

If a critical iterate `orbit c k 0` lies in a closed disk which the quadratic
return sends into itself, then `orbit c (k + m * n) 0` stays in that disk.
When the return is `q`-Lipschitz for `q < 1`, those iterates approach the
unique fixed point of the return at rate `q ^ m`.

Entry of the critical orbit is a hypothesis, not a conclusion. A point outside
the disk is not forced into the basin. This file does not derive the trap
constants `minLambda = 0.8` or `diskFactor = 4`. The return fixed point has
exact period `n` only when it closes and no positive proper divisor returns.
Disk entry does not give the critical point itself period `n`.
-/

namespace IntMProof

open Function Metric Polynomial Set

variable {R : Type*} [CommRing R]

/-- `m` applications of the `n`-step return are one orbit segment of length
`m * n`. -/
theorem orbit_mul_eq_iterate (c : R) (m n : ℕ) (z : R) :
    orbit c (m * n) z = (fun w => orbit c n w)^[m] z := by
  induction m generalizing z with
  | zero =>
    rw [Nat.zero_mul, orbit_zero, iterate_zero_apply]
  | succ m ih =>
    rw [Nat.succ_mul, Nat.add_comm, orbit_add, ih, iterate_succ_apply]

/-- A block of `m` returns, starting after `k` steps, is the orbit at time
`k + m * n`. -/
theorem orbit_add_mul_eq_iterate (c : R) (k m n : ℕ) (z : R) :
    orbit c (k + m * n) z =
      (fun w => orbit c n w)^[m] (orbit c k z) := by
  rw [orbit_add, orbit_mul_eq_iterate]

/-- If a critical iterate has entered the closed disk and the return maps the
disk into itself, every later block of `n` steps stays in the disk. Entry is
a hypothesis. -/
theorem mem_closedBall_critical_return
    (c z₀ : ℂ) (r : ℝ) (k n : ℕ)
    (hentry : orbit c k 0 ∈ closedBall z₀ r)
    (hmap : MapsTo (fun w => orbit c n w) (closedBall z₀ r) (closedBall z₀ r))
    (m : ℕ) :
    orbit c (k + m * n) 0 ∈ closedBall z₀ r := by
  rw [orbit_add_mul_eq_iterate]
  exact MapsTo.iterate hmap m hentry

/-- Iterating a `q`-Lipschitz self-map of a closed disk multiplies the
distance to a fixed point in the disk by `q` at each step. -/
theorem dist_iterate_fixedPoint_le
    (g : ℂ → ℂ) (z₀ : ℂ) (r q : ℝ) (hq : 0 ≤ q)
    (hL : LipschitzOnWith ⟨q, hq⟩ g (closedBall z₀ r))
    (hmap : MapsTo g (closedBall z₀ r) (closedBall z₀ r))
    {ζ w : ℂ} (hζ : ζ ∈ closedBall z₀ r) (hfix : g ζ = ζ)
    (hw : w ∈ closedBall z₀ r) (m : ℕ) :
    dist (g^[m] w) ζ ≤ q ^ m * dist w ζ := by
  induction m with
  | zero =>
    rw [iterate_zero_apply, pow_zero, one_mul]
  | succ m ih =>
    have hwm : g^[m] w ∈ closedBall z₀ r := MapsTo.iterate hmap m hw
    have hstep : dist (g (g^[m] w)) ζ ≤ q * dist (g^[m] w) ζ := by
      have hlip := hL.dist_le_mul (g^[m] w) hwm ζ hζ
      rwa [hfix] at hlip
    calc
      dist (g^[m + 1] w) ζ = dist (g (g^[m] w)) ζ := by
        rw [iterate_succ_apply']
      _ ≤ q * dist (g^[m] w) ζ := hstep
      _ ≤ q * (q ^ m * dist w ζ) := mul_le_mul_of_nonneg_left ih hq
      _ = q ^ (m + 1) * dist w ζ := by rw [← mul_assoc, ← pow_succ']

/-- Under the same Lipschitz hypothesis as
`mapsTo_closedBall_of_lipschitzOnWith`, the critical iterate's `m`-fold
return stays in the disk and its distance to the return fixed point is at
most `q ^ m * dist(w, ζ)`. -/
theorem dist_critical_return_of_entry
    (c : ℂ) (k n : ℕ) (z₀ ζ : ℂ) (r q : ℝ) (hq : 0 ≤ q)
    (hL : LipschitzOnWith ⟨q, hq⟩ (fun w => orbit c n w) (closedBall z₀ r))
    (hmap : MapsTo (fun w => orbit c n w) (closedBall z₀ r) (closedBall z₀ r))
    (hζ : ζ ∈ closedBall z₀ r) (hfix : orbit c n ζ = ζ)
    (hentry : orbit c k 0 ∈ closedBall z₀ r) (m : ℕ) :
    orbit c (k + m * n) 0 ∈ closedBall z₀ r ∧
      dist (orbit c (k + m * n) 0) ζ ≤ q ^ m * dist (orbit c k 0) ζ := by
  refine ⟨mem_closedBall_critical_return c z₀ r k n hentry hmap m, ?_⟩
  have hdist :=
    dist_iterate_fixedPoint_le (fun w => orbit c n w) z₀ r q hq hL hmap hζ hfix
      hentry m
  rwa [← orbit_add_mul_eq_iterate] at hdist

/-- If a critical iterate has entered the disk on which the formal multiplier
of `orbit c n` is at most `q < 1`, later critical returns stay in the disk and
contract to its unique fixed point at rate `q ^ m`.

Entry of the critical orbit is a hypothesis, not a conclusion. A point outside
the disk is not forced into the basin. This does not derive `minLambda = 0.8`
or `diskFactor = 4`, and it does not give the critical point period `n`. -/
theorem existsUnique_critical_return_of_entry
    (c : ℂ) (k n : ℕ) (z₀ : ℂ) (r q : ℝ)
    (hr : 0 ≤ r) (hq : 0 ≤ q) (hq1 : q < 1)
    (hmult : ∀ z ∈ closedBall z₀ r,
      ‖(derivative (seedPolynomial c n)).eval z‖ ≤ q)
    (hcenter : ‖orbit c n z₀ - z₀‖ + q * r ≤ r)
    (hentry : orbit c k 0 ∈ closedBall z₀ r) :
    ∃! ζ : ℂ, ζ ∈ closedBall z₀ r ∧ orbit c n ζ = ζ ∧
      ‖(derivative (seedPolynomial c n)).eval ζ‖ ≤ q ∧
      ∀ m : ℕ, orbit c (k + m * n) 0 ∈ closedBall z₀ r ∧
        dist (orbit c (k + m * n) 0) ζ ≤ q ^ m * dist (orbit c k 0) ζ := by
  have huniq := existsUnique_fixedPoint_orbit_of_multiplier_le
    c n z₀ r q hr hq hq1 hmult hcenter
  obtain ⟨ζ, hζ, honly⟩ := huniq
  have hdiff : ∀ z ∈ closedBall z₀ r,
      DifferentiableAt ℂ (fun w => orbit c n w) z :=
    fun z _ => differentiableAt_orbit c n z
  have hderiv : ∀ z ∈ closedBall z₀ r,
      ‖deriv (fun w => orbit c n w) z‖ ≤ q := by
    intro z hz
    rw [deriv_orbit]
    exact hmult z hz
  have hL := lipschitzOnWith_closedBall_of_deriv_le
    (fun w => orbit c n w) z₀ r q hq hdiff hderiv
  have hmap := mapsTo_closedBall_of_lipschitzOnWith
    (fun w => orbit c n w) z₀ r q hr hq hL hcenter
  have hprop : ∀ m : ℕ, orbit c (k + m * n) 0 ∈ closedBall z₀ r ∧
      dist (orbit c (k + m * n) 0) ζ ≤ q ^ m * dist (orbit c k 0) ζ :=
    fun m => dist_critical_return_of_entry c k n z₀ ζ r q hq hL hmap hζ.1
      hζ.2.1 hentry m
  refine ExistsUnique.intro ζ ⟨hζ.1, hζ.2.1, hζ.2.2, hprop⟩ ?_
  intro y hy
  exact honly y ⟨hy.1, hy.2.1, hy.2.2.1⟩

/-- A fixed point of the `n`-step return has minimal period `n` if and only if
no positive proper divisor also returns. This is
`exactPeriod_iff_closure_and_proper_divisors` for `quadratic c`. It applies to
the critical point only when that point itself equals the return fixed point.
-/
theorem minimalPeriod_return_fixedPoint_iff
    {R : Type*} [CommRing R] (c ζ : R) (n : ℕ) (hn : 0 < n) :
    minimalPeriod (quadratic c) ζ = n ↔
      orbit c n ζ = ζ ∧
        ∀ d : ℕ, 0 < d → d ∣ n → d < n → orbit c d ζ ≠ ζ := by
  simpa [orbit] using
    exactPeriod_iff_closure_and_proper_divisors (quadratic c) ζ n hn

end IntMProof
