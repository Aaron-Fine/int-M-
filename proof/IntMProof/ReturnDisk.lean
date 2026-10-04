import IntMProof.Derivatives
import Mathlib.Algebra.Order.Ring.Unbundled.Basic
import Mathlib.Analysis.Calculus.Deriv.Polynomial
import Mathlib.Analysis.Calculus.MeanValue
import Mathlib.Analysis.Complex.Basic
import Mathlib.Analysis.Normed.Module.Convex
import Mathlib.Logic.ExistsUnique
import Mathlib.Tactic.Ring
import Mathlib.Topology.MetricSpace.Contracting
import Mathlib.Topology.UniformSpace.Cauchy

/-!
# Contraction on a closed disk

An exact criterion for a self-map of a closed disk in `ℂ`. A Lipschitz
constant `q < 1`, together with the displacement bound
`‖g z₀ - z₀‖ + q * r ≤ r`, gives a unique fixed point in the disk. The same
conclusion follows from a uniform bound on the complex derivative, and in
particular from a bound on the formal multiplier of a quadratic return.

This file does not certify the trap constants `minLambda = 0.8` or
`diskFactor = 4`. A fixed point of a return map is not a statement that the
critical orbit enters the disk.
-/

namespace IntMProof

open Metric Polynomial Set

/-- A `q`-Lipschitz map sends the closed disk into itself when the center
moves by at most the slack in `‖g z₀ - z₀‖ + q * r ≤ r`. -/
theorem mapsTo_closedBall_of_lipschitzOnWith
    (g : ℂ → ℂ) (z₀ : ℂ) (r q : ℝ) (hr : 0 ≤ r) (hq : 0 ≤ q)
    (hL : LipschitzOnWith ⟨q, hq⟩ g (closedBall z₀ r))
    (hcenter : ‖g z₀ - z₀‖ + q * r ≤ r) :
    MapsTo g (closedBall z₀ r) (closedBall z₀ r) := by
  intro z hz
  rw [mem_closedBall]
  have hz₀ : z₀ ∈ closedBall z₀ r := mem_closedBall_self hr
  have hdz : dist z z₀ ≤ r := by rwa [mem_closedBall] at hz
  have hlip : dist (g z) (g z₀) ≤ q * dist z z₀ :=
    hL.dist_le_mul z hz z₀ hz₀
  have hgoal : dist (g z) z₀ ≤ ‖g z₀ - z₀‖ + q * r := by
    calc
      dist (g z) z₀ ≤ dist (g z) (g z₀) + dist (g z₀) z₀ :=
        dist_triangle _ _ _
      _ ≤ q * dist z z₀ + dist (g z₀) z₀ := add_le_add hlip le_rfl
      _ ≤ q * r + dist (g z₀) z₀ :=
        add_le_add (mul_le_mul_of_nonneg_left hdz hq) le_rfl
      _ = ‖g z₀ - z₀‖ + q * r := by rw [dist_eq_norm, add_comm]
  exact hgoal.trans hcenter

/-- A map with Lipschitz constant `q < 1` has at most one fixed point in the
closed disk. -/
theorem fixedPoint_unique_closedBall
    (g : ℂ → ℂ) (z₀ : ℂ) (r q : ℝ) (hq : 0 ≤ q) (hq1 : q < 1)
    (hL : LipschitzOnWith ⟨q, hq⟩ g (closedBall z₀ r))
    {x y : ℂ} (hx : x ∈ closedBall z₀ r) (hy : y ∈ closedBall z₀ r)
    (hfx : g x = x) (hfy : g y = y) : x = y := by
  have hle : dist x y ≤ q * dist x y := by
    have hdist := hL.dist_le_mul x hx y hy
    rw [hfx, hfy] at hdist
    exact hdist
  have hrw : (1 - q) * dist x y = dist x y - q * dist x y := by ring
  have hfac : (1 - q) * dist x y ≤ 0 := by
    rw [hrw]
    exact sub_nonpos.mpr hle
  exact dist_le_zero.mp
    (nonpos_of_mul_nonpos_right hfac (sub_pos.mpr hq1))

/-- Under the disk-invariance hypotheses, the closed disk contains a unique
fixed point of `g`. Completeness is the closed-ball instance of
`IsClosed.isComplete`. -/
theorem existsUnique_fixedPoint_closedBall
    (g : ℂ → ℂ) (z₀ : ℂ) (r q : ℝ) (hr : 0 ≤ r) (hq : 0 ≤ q) (hq1 : q < 1)
    (hL : LipschitzOnWith ⟨q, hq⟩ g (closedBall z₀ r))
    (hcenter : ‖g z₀ - z₀‖ + q * r ≤ r) :
    ∃! ζ : ℂ, ζ ∈ closedBall z₀ r ∧ g ζ = ζ := by
  let s := closedBall z₀ r
  have hmap : MapsTo g s s :=
    mapsTo_closedBall_of_lipschitzOnWith g z₀ r q hr hq hL hcenter
  have hsc : IsComplete s := isClosed_closedBall.isComplete
  have hK : (⟨q, hq⟩ : NNReal) < 1 := hq1
  have hLip : LipschitzWith ⟨q, hq⟩ (hmap.restrict g s s) :=
    (hmap.lipschitzOnWith_iff_restrict).mp hL
  have hC : ContractingWith ⟨q, hq⟩ (hmap.restrict g s s) := ⟨hK, hLip⟩
  have hz₀ : z₀ ∈ s := mem_closedBall_self hr
  rcases hC.exists_fixedPoint' hsc hmap hz₀ (edist_ne_top _ _) with
    ⟨ζ, hζs, hζfix, _, _⟩
  have hfix : g ζ = ζ := hζfix
  refine existsUnique_of_exists_of_unique ⟨ζ, hζs, hfix⟩ ?_
  intro x y hx hy
  exact fixedPoint_unique_closedBall g z₀ r q hq hq1 hL hx.1 hy.1 hx.2 hy.2

/-- A complex derivative bounded by `q` on a closed disk makes `g` Lipschitz
with constant `q`, by `lipschitzOnWith_of_nnnorm_deriv_le`. -/
theorem lipschitzOnWith_closedBall_of_deriv_le
    (g : ℂ → ℂ) (z₀ : ℂ) (r q : ℝ) (hq : 0 ≤ q)
    (hdiff : ∀ z ∈ closedBall z₀ r, DifferentiableAt ℂ g z)
    (hderiv : ∀ z ∈ closedBall z₀ r, ‖deriv g z‖ ≤ q) :
    LipschitzOnWith ⟨q, hq⟩ g (closedBall z₀ r) := by
  refine Convex.lipschitzOnWith_of_nnnorm_deriv_le hdiff ?_
    (convex_closedBall z₀ r)
  intro z hz
  refine NNReal.coe_le_coe.mp ?_
  rw [coe_nnnorm]
  exact hderiv z hz

/-- The derivative bound supplies the Lipschitz hypothesis, so the disk has a
unique fixed point `ζ`, and `‖deriv g ζ‖ ≤ q`. -/
theorem existsUnique_fixedPoint_closedBall_of_deriv_le
    (g : ℂ → ℂ) (z₀ : ℂ) (r q : ℝ) (hr : 0 ≤ r) (hq : 0 ≤ q) (hq1 : q < 1)
    (hdiff : ∀ z ∈ closedBall z₀ r, DifferentiableAt ℂ g z)
    (hderiv : ∀ z ∈ closedBall z₀ r, ‖deriv g z‖ ≤ q)
    (hcenter : ‖g z₀ - z₀‖ + q * r ≤ r) :
    ∃! ζ : ℂ, ζ ∈ closedBall z₀ r ∧ g ζ = ζ ∧ ‖deriv g ζ‖ ≤ q := by
  have hL :=
    lipschitzOnWith_closedBall_of_deriv_le g z₀ r q hq hdiff hderiv
  have huniq :=
    existsUnique_fixedPoint_closedBall g z₀ r q hr hq hq1 hL hcenter
  obtain ⟨ζ, hζ, honly⟩ := huniq
  refine ExistsUnique.intro ζ ⟨hζ.1, hζ.2, hderiv ζ hζ.1⟩ ?_
  intro y hy
  exact honly y ⟨hy.1, hy.2.1⟩

/-- The quadratic return `orbit c n` is holomorphic, and its complex
derivative is the formal multiplier `(derivative (seedPolynomial c n)).eval`.
-/
theorem hasDerivAt_orbit (c : ℂ) (n : ℕ) (z : ℂ) :
    HasDerivAt (fun w => orbit c n w)
      ((derivative (seedPolynomial c n)).eval z) z := by
  have hfun :
      (fun w => (seedPolynomial c n).eval w) = fun w => orbit c n w := by
    funext w
    exact seedPolynomial_eval c w n
  have hpoly := (seedPolynomial c n).hasDerivAt z
  rw [hfun] at hpoly
  exact hpoly

/-- The complex derivative of the quadratic return equals its formal
multiplier. -/
theorem deriv_orbit (c : ℂ) (n : ℕ) (z : ℂ) :
    deriv (fun w => orbit c n w) z =
      (derivative (seedPolynomial c n)).eval z :=
  (hasDerivAt_orbit c n z).deriv

/-- The quadratic return is complex-differentiable at every seed. -/
theorem differentiableAt_orbit (c : ℂ) (n : ℕ) (z : ℂ) :
    DifferentiableAt ℂ (fun w => orbit c n w) z :=
  (hasDerivAt_orbit c n z).differentiableAt

/-- If the formal multiplier of `orbit c n` is bounded by `q < 1` on a closed
disk and the center satisfies the displacement bound, then the disk contains
a unique fixed point `ζ` of the return and
`‖(derivative (seedPolynomial c n)).eval ζ‖ ≤ q`. A fixed point of the return
is not a statement that the critical orbit enters the disk, and this theorem
does not certify `minLambda = 0.8` or `diskFactor = 4`. -/
theorem existsUnique_fixedPoint_orbit_of_multiplier_le
    (c : ℂ) (n : ℕ) (z₀ : ℂ) (r q : ℝ)
    (hr : 0 ≤ r) (hq : 0 ≤ q) (hq1 : q < 1)
    (hmult : ∀ z ∈ closedBall z₀ r,
      ‖(derivative (seedPolynomial c n)).eval z‖ ≤ q)
    (hcenter : ‖orbit c n z₀ - z₀‖ + q * r ≤ r) :
    ∃! ζ : ℂ, ζ ∈ closedBall z₀ r ∧ orbit c n ζ = ζ ∧
      ‖(derivative (seedPolynomial c n)).eval ζ‖ ≤ q := by
  have hdiff : ∀ z ∈ closedBall z₀ r,
      DifferentiableAt ℂ (fun w => orbit c n w) z :=
    fun z _ => differentiableAt_orbit c n z
  have hderiv : ∀ z ∈ closedBall z₀ r,
      ‖deriv (fun w => orbit c n w) z‖ ≤ q := by
    intro z hz
    rw [deriv_orbit]
    exact hmult z hz
  have hbase := existsUnique_fixedPoint_closedBall_of_deriv_le
    (fun w => orbit c n w) z₀ r q hr hq hq1 hdiff hderiv hcenter
  refine (existsUnique_congr ?_).mp hbase
  intro ζ
  constructor
  · rintro ⟨hζs, hfix, hder⟩
    refine ⟨hζs, hfix, ?_⟩
    rwa [deriv_orbit] at hder
  · rintro ⟨hζs, hfix, hmul⟩
    refine ⟨hζs, hfix, ?_⟩
    rwa [deriv_orbit]

end IntMProof
