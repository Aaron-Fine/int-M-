import IntMProof.Derivatives
import IntMProof.MultiplierPhase
import Mathlib.Analysis.Calculus.Deriv.Add
import Mathlib.Analysis.Calculus.Deriv.Mul
import Mathlib.Analysis.Calculus.FDeriv.Mul
import Mathlib.Analysis.Calculus.Implicit
import Mathlib.Analysis.Calculus.InverseFunctionTheorem.FDeriv
import Mathlib.Analysis.Complex.Basic
import Mathlib.Analysis.Normed.Module.FiniteDimension
import Mathlib.Tactic.LinearCombination
import Mathlib.Tactic.Ring

/-!
# Derivative of a local periodic branch

Exact derivative identities for the quadratic orbit over `ℂ`. When `λ ≠ 1`,
the period equation has a local graph `t ↦ φ t` over the parameter with
`φ' = B / (1 - λ)`. These identities do not certify binary64,
`guardDisplacement = 0.01`, or the Newton floor `1e-12`.
-/

namespace IntMProof

open Polynomial Filter ContinuousLinearMap

open scoped Topology

/-- Derivative of `t ↦ f t * f t + t`. The extra `1` is the parameter step. -/
private theorem hasDerivAt_square_add_id {f : ℂ → ℂ} {f' x : ℂ}
    (hf : HasDerivAt f f' x) :
    HasDerivAt (fun t => f t * f t + t) (2 * f x * f' + 1) x := by
  have hsq : HasDerivAt (fun t => f t * f t) (f' * f x + f x * f') x :=
    hf.mul hf
  have hstep := hsq.add (hasDerivAt_id' x)
  have hderiv : f' * f x + f x * f' + 1 = 2 * f x * f' + 1 := by
    ring
  exact hstep.congr_deriv hderiv

/-- Derivative of `t ↦ f t * f t + a` for a constant parameter `a`. -/
private theorem hasDerivAt_square_add_const {f : ℂ → ℂ} {f' x a : ℂ}
    (hf : HasDerivAt f f' x) :
    HasDerivAt (fun t => f t * f t + a) (2 * f x * f') x := by
  have hsq : HasDerivAt (fun t => f t * f t) (f' * f x + f x * f') x :=
    hf.mul hf
  have hstep := hsq.add (hasDerivAt_const x a)
  have hderiv : f' * f x + f x * f' + 0 = 2 * f x * f' := by
    ring
  exact hstep.congr_deriv hderiv

/-- Exact derivative identity over `ℂ`: with the seed fixed, the orbit is
differentiable in the parameter, and that derivative is the formal derivative
of `parameterPolynomial (C z)`. This does not certify binary64,
`guardDisplacement = 0.01`, or the Newton floor `1e-12`. -/
theorem hasDerivAt_orbit_fixedSeed (z c : ℂ) (n : ℕ) :
    HasDerivAt (fun t => orbit t n z)
      ((derivative (parameterPolynomial (C z) n)).eval c) c := by
  induction n with
  | zero =>
    simp only [orbit_zero, fixedSeed_parameter_derivative_zero]
    exact hasDerivAt_const c z
  | succ n ih =>
    rw [parameterPolynomial_derivative_succ, eval_C]
    have hfun : (fun t => orbit t (n + 1) z) =
        fun t => orbit t n z * orbit t n z + t := by
      funext t
      rw [orbit_succ, quadratic]
    rw [hfun]
    exact hasDerivAt_square_add_id ih

/-- Exact derivative identity over `ℂ`: with the parameter fixed, the orbit is
differentiable in the seed, and that derivative is the formal derivative of
`seedPolynomial c n`, the multiplier of the `n`-step return. At `n = 0` both
sides are the identity, with derivative `1`. This does not certify binary64,
`guardDisplacement = 0.01`, or the Newton floor `1e-12`. -/
theorem hasDerivAt_orbit_fixedParameter (c z : ℂ) (n : ℕ) :
    HasDerivAt (fun w => orbit c n w)
      ((derivative (seedPolynomial c n)).eval z) z := by
  induction n with
  | zero =>
    simp only [orbit_zero, seedPolynomial_derivative_zero]
    exact hasDerivAt_id' z
  | succ n ih =>
    rw [seedPolynomial_derivative_succ]
    have hfun : (fun w => orbit c (n + 1) w) =
        fun w => orbit c n w * orbit c n w + c := by
      funext w
      rw [orbit_succ, quadratic]
    rw [hfun]
    exact hasDerivAt_square_add_const ih

/-- Exact derivative identity over `ℂ`: if the seed moves differentiably with
the parameter, the total derivative is `λ φ' + B`. Here `λ` is the seed
derivative at `φ c` and `B` is the parameter derivative of
`parameterPolynomial (C (φ c))`. That polynomial is frozen at the single seed
value `φ c`; it is the partial in the parameter, not a derivative in a seed
that still depends on `t`. This does not certify binary64,
`guardDisplacement = 0.01`, or the Newton floor `1e-12`. -/
theorem hasDerivAt_orbit_total {φ : ℂ → ℂ} {φ' c : ℂ} (n : ℕ)
    (hφ : HasDerivAt φ φ' c) :
    HasDerivAt (fun t => orbit t n (φ t))
      ((derivative (seedPolynomial c n)).eval (φ c) * φ' +
        (derivative (parameterPolynomial (C (φ c)) n)).eval c) c := by
  induction n with
  | zero =>
    simp only [orbit_zero, seedPolynomial_derivative_zero,
      fixedSeed_parameter_derivative_zero, one_mul, add_zero]
    exact hφ
  | succ n ih =>
    rw [seedPolynomial_derivative_succ, parameterPolynomial_derivative_succ,
      eval_C]
    have hfun : (fun t => orbit t (n + 1) (φ t)) =
        fun t => orbit t n (φ t) * orbit t n (φ t) + t := by
      funext t
      rw [orbit_succ, quadratic]
    rw [hfun]
    exact (hasDerivAt_square_add_id ih).congr_deriv (by ring)

/-- Exact derivative identity over `ℂ`: a differentiable local branch of an
`n`-periodic point has slope `φ' = B / (1 - λ)` when `λ ≠ 1`. The hypothesis
`hbranch` assumes the branch; this theorem does not construct it. This does
not certify binary64, `guardDisplacement = 0.01`, or the Newton floor
`1e-12`. -/
theorem branch_slope {φ : ℂ → ℂ} {φ' c : ℂ} {n : ℕ}
    (hbranch : ∀ᶠ t in 𝓝 c, orbit t n (φ t) = φ t)
    (hφ : HasDerivAt φ φ' c)
    (hlam : (derivative (seedPolynomial c n)).eval (φ c) ≠ 1) :
    φ' =
      (derivative (parameterPolynomial (C (φ c)) n)).eval c /
        (1 - (derivative (seedPolynomial c n)).eval (φ c)) := by
  have horbit := hasDerivAt_orbit_total n hφ
  have hsame := hφ.congr_of_eventuallyEq hbranch
  have heq := horbit.unique hsame
  have hden : 1 - (derivative (seedPolynomial c n)).eval (φ c) ≠ 0 := by
    rw [sub_ne_zero]
    exact hlam.symm
  apply eq_div_of_mul_eq hden
  linear_combination -heq

/-- Exact derivative identity over `ℂ`: on a closed orbit the denominator
`1 - λ` is the same at every cycle point, by `seedDerivative_periodic_phase`.
The numerator `B` still depends on the chosen cycle point: it is the parameter
derivative of the orbit that starts at that point, and this identity does not
make `B` phase-invariant. This does not certify binary64,
`guardDisplacement = 0.01`, or the Newton floor `1e-12`. -/
theorem branch_denominator_phase (c z : ℂ) (n k : ℕ)
    (hclose : orbit c n z = z) :
    1 - (derivative (seedPolynomial c n)).eval (orbit c k z) =
      1 - (derivative (seedPolynomial c n)).eval z := by
  rw [seedDerivative_periodic_phase c z n k hclose]

/-- Joint derivative `λ dz + B dc` of an orbit in the seed and the parameter. -/
private noncomputable def partialDeriv (seedDeriv paramDeriv : ℂ) :
    ℂ × ℂ →L[ℂ] ℂ :=
  seedDeriv • fst ℂ ℂ ℂ + paramDeriv • snd ℂ ℂ ℂ

private def orbitJoint (n : ℕ) : ℂ × ℂ → ℂ :=
  fun p => orbit p.2 n p.1

private theorem partialDeriv_square_succ (seedDeriv paramDeriv w : ℂ) :
    w • partialDeriv seedDeriv paramDeriv +
        w • partialDeriv seedDeriv paramDeriv + snd ℂ ℂ ℂ =
      partialDeriv (2 * w * seedDeriv) (2 * w * paramDeriv + 1) := by
  apply ContinuousLinearMap.ext
  intro p
  simp only [partialDeriv, smul_apply, add_apply, coe_fst', coe_snd',
    smul_eq_mul]
  ring

private theorem partialDeriv_sub_fst (seedDeriv paramDeriv : ℂ) :
    partialDeriv seedDeriv paramDeriv - fst ℂ ℂ ℂ =
      partialDeriv (seedDeriv - 1) paramDeriv := by
  apply ContinuousLinearMap.ext
  intro p
  simp only [partialDeriv, sub_apply, smul_apply, add_apply, coe_fst',
    coe_snd', smul_eq_mul]
  ring

private theorem partialDeriv_at_zero :
    fst ℂ ℂ ℂ = partialDeriv 1 0 := by
  apply ContinuousLinearMap.ext
  intro p
  simp only [partialDeriv, smul_apply, add_apply, coe_fst', coe_snd',
    smul_eq_mul, one_mul, zero_mul, add_zero]

private theorem partialDeriv_range_top {seedDeriv paramDeriv : ℂ}
    (hseed : seedDeriv ≠ 0) :
    (partialDeriv seedDeriv paramDeriv).range = ⊤ := by
  rw [LinearMap.range_eq_top]
  intro v
  refine ⟨(v / seedDeriv, 0), ?_⟩
  have hpt :
      partialDeriv seedDeriv paramDeriv (v / seedDeriv, 0) = v := by
    simp only [partialDeriv, smul_apply, add_apply, coe_fst', coe_snd',
      smul_eq_mul]
    rw [mul_comm, div_mul_cancel₀ v hseed, mul_zero, add_zero]
  simpa using hpt

/-- Strict derivative of the joint orbit. The seed partial is `λ` and the
parameter partial is `B`. -/
private theorem hasStrictFDerivAt_orbitJoint (z c : ℂ) (n : ℕ) :
    HasStrictFDerivAt (orbitJoint n)
      (partialDeriv ((derivative (seedPolynomial c n)).eval z)
        ((derivative (parameterPolynomial (C z) n)).eval c)) (z, c) := by
  induction n with
  | zero =>
    have hfst :=
      hasStrictFDerivAt_fst (𝕜 := ℂ) (E := ℂ) (F := ℂ) (p := (z, c))
    have hfun : (Prod.fst : ℂ × ℂ → ℂ) = orbitJoint 0 := by
      funext p
      simp only [orbitJoint, orbit_zero]
    have hstrict :=
      (hfst.congr_fderiv partialDeriv_at_zero).congr_of_eventuallyEq
        (EventuallyEq.of_eq hfun)
    simpa only [seedPolynomial_derivative_zero,
      fixedSeed_parameter_derivative_zero] using hstrict
  | succ n ih =>
    have hsq := ih.mul ih
    have hstep := hsq.add
      (hasStrictFDerivAt_snd (𝕜 := ℂ) (E := ℂ) (F := ℂ) (p := (z, c)))
    have hderiv := partialDeriv_square_succ
      ((derivative (seedPolynomial c n)).eval z)
      ((derivative (parameterPolynomial (C z) n)).eval c)
      (orbitJoint n (z, c))
    have hfun :
        orbitJoint n * orbitJoint n + Prod.snd = orbitJoint (n + 1) := by
      funext p
      simp only [orbitJoint, orbit_succ, quadratic, Pi.add_apply, Pi.mul_apply]
    have hstrict :=
      (hstep.congr_fderiv hderiv).congr_of_eventuallyEq (EventuallyEq.of_eq hfun)
    rw [seedPolynomial_derivative_succ, parameterPolynomial_derivative_succ,
      eval_C]
    simpa only [orbitJoint] using hstrict

private def returnResidual (n : ℕ) : ℂ × ℂ → ℂ :=
  orbitJoint n - Prod.fst

private theorem hasStrictFDerivAt_returnResidual (z c : ℂ) (n : ℕ) :
    HasStrictFDerivAt (returnResidual n)
      (partialDeriv ((derivative (seedPolynomial c n)).eval z - 1)
        ((derivative (parameterPolynomial (C z) n)).eval c)) (z, c) := by
  have hsub := (hasStrictFDerivAt_orbitJoint z c n).sub
    (hasStrictFDerivAt_fst (𝕜 := ℂ) (p := (z, c)))
  simpa only [returnResidual] using hsub.congr_fderiv (partialDeriv_sub_fst _ _)

/-- Exact derivative identity over `ℂ`: at an exact period with seed
derivative `λ ≠ 1`, the residual `F(w, t) = orbit t n w - w` is strictly
differentiable and its partial in the seed is multiplication by `λ - 1`.
That partial is invertible, so `implicitFunctionOfComplemented` gives a local
kernel section of exact periodic points through `(z, c)`.
`exists_branch_slope` reparameterizes that section as a graph over `c`.
This does not certify binary64, `guardDisplacement = 0.01`, or the Newton
floor `1e-12`. -/
theorem exists_periodic_implicitSection (c z : ℂ) (n : ℕ)
    (hclose : orbit c n z = z)
    (hlam : (derivative (seedPolynomial c n)).eval z ≠ 1) :
    ∃ f' : ℂ × ℂ →L[ℂ] ℂ, ∃ φ : f'.ker → ℂ × ℂ,
      HasStrictFDerivAt (fun p => orbit p.2 n p.1 - p.1) f' (z, c) ∧
      φ 0 = (z, c) ∧
      (∀ v, f' v =
        ((derivative (seedPolynomial c n)).eval z - 1) * v.1 +
          (derivative (parameterPolynomial (C z) n)).eval c * v.2) ∧
      ∀ᶠ k in 𝓝 (0 : f'.ker),
        orbit (φ k).2 n (φ k).1 = (φ k).1 := by
  let f' := partialDeriv ((derivative (seedPolynomial c n)).eval z - 1)
    ((derivative (parameterPolynomial (C z) n)).eval c)
  have hf : HasStrictFDerivAt (returnResidual n) f' (z, c) :=
    hasStrictFDerivAt_returnResidual z c n
  have hden : (derivative (seedPolynomial c n)).eval z - 1 ≠ 0 := by
    rw [sub_ne_zero]
    exact hlam
  have hrange : f'.range = ⊤ := partialDeriv_range_top hden
  have hker : f'.ker.ClosedComplemented :=
    f'.ker_closedComplemented_of_finiteDimensional_range
  have hzero : returnResidual n (z, c) = 0 := by
    simp only [returnResidual, Pi.sub_apply, orbitJoint, hclose, sub_self]
  let φk := hf.implicitFunctionOfComplemented (returnResidual n) f' hrange hker
  have happly := hf.implicitFunctionOfComplemented_apply_image hrange hker
  rw [hzero] at happly
  have hmap := hf.map_implicitFunctionOfComplemented_eq hrange hker
  have hnear := hmap.curry_nhds.self_of_nhds
  rw [hzero] at hnear
  have hfun : returnResidual n = fun p => orbit p.2 n p.1 - p.1 := by
    funext p
    simp only [returnResidual, Pi.sub_apply, orbitJoint]
  refine ⟨f', φk 0,
    hf.congr_of_eventuallyEq (EventuallyEq.of_eq hfun), happly, ?_, ?_⟩
  · intro v
    simp only [f', partialDeriv, smul_apply, add_apply, coe_fst', coe_snd',
      smul_eq_mul]
  · filter_upwards [hnear] with k hk
    simp only [returnResidual, Pi.sub_apply, orbitJoint, sub_eq_zero] at hk
    exact hk

private theorem partialDeriv_apply (seedDeriv paramDeriv a b : ℂ) :
    partialDeriv seedDeriv paramDeriv (a, b) = seedDeriv * a + paramDeriv * b := by
  simp only [partialDeriv, smul_apply, add_apply, coe_fst', coe_snd', smul_eq_mul]

/-- The vector `(B / (1 - λ) * t, t)` lies in the kernel of `(λ - 1) dz + B dc`. -/
private theorem kernel_param_mem {lam B t : ℂ} (hlam : lam ≠ 1) :
    (B / (1 - lam) * t, t) ∈ (partialDeriv (lam - 1) B).ker := by
  rw [LinearMap.mem_ker]
  change (partialDeriv (lam - 1) B) (B / (1 - lam) * t, t) = 0
  rw [partialDeriv_apply]
  have hden : lam - 1 ≠ 0 := sub_ne_zero.mpr hlam
  have hr : (lam - 1) / (1 - lam) = -1 := by
    have hneg : (1 : ℂ) - lam = -(lam - 1) := by ring
    rw [hneg, div_neg, div_self hden]
  calc
    (lam - 1) * (B / (1 - lam) * t) + B * t
        = ((lam - 1) / (1 - lam)) * B * t + B * t := by ring
    _ = (-1) * B * t + B * t := by rw [hr]
    _ = 0 := by ring

/-- Lift of the parameter coordinate into the kernel, with slope `B / (1 - λ)`. -/
private noncomputable def kernelLift (lam B : ℂ) (hlam : lam ≠ 1) :
    ℂ →L[ℂ] (partialDeriv (lam - 1) B).ker :=
  ((B / (1 - lam)) • inl ℂ ℂ ℂ + inr ℂ ℂ ℂ).codRestrict _
    (fun t => by simpa using kernel_param_mem (lam := lam) (B := B) (t := t) hlam)

private theorem kernelLift_apply (lam B : ℂ) (hlam : lam ≠ 1) (t : ℂ) :
    (kernelLift lam B hlam t : ℂ × ℂ) = (B / (1 - lam) * t, t) := by
  simp only [kernelLift, coe_codRestrict_apply, add_apply, smul_apply, inl_apply,
    inr_apply]
  ext <;> simp [mul_comm]

/-- Projection from the kernel onto the parameter coordinate. -/
private noncomputable def kernelParam (lam B : ℂ) :
    (partialDeriv (lam - 1) B).ker →L[ℂ] ℂ :=
  (snd ℂ ℂ ℂ).comp (partialDeriv (lam - 1) B).ker.subtypeL

private theorem kernelParam_apply (lam B : ℂ)
    (v : (partialDeriv (lam - 1) B).ker) :
    kernelParam lam B v = (v : ℂ × ℂ).2 := by
  simp [kernelParam, Submodule.subtypeL_apply, coe_snd']

private theorem kernelParam_ker (lam B : ℂ) (hlam : lam ≠ 1) :
    (kernelParam lam B).ker = ⊥ := by
  rw [LinearMap.ker_eq_bot']
  intro v hv
  apply Subtype.ext
  have h2 : (v : ℂ × ℂ).2 = 0 := by simpa [kernelParam_apply] using hv
  have hmem : partialDeriv (lam - 1) B (v : ℂ × ℂ) = 0 :=
    (LinearMap.mem_ker).mp v.property
  rw [partialDeriv_apply, h2, mul_zero, add_zero] at hmem
  have h1 : (v : ℂ × ℂ).1 = 0 :=
    (mul_eq_zero.mp hmem).resolve_left (sub_ne_zero.mpr hlam)
  ext <;> simp [h1, h2]

private theorem kernelParam_rightInv (lam B : ℂ) (hlam : lam ≠ 1) (t : ℂ) :
    kernelParam lam B (kernelLift lam B hlam t) = t := by
  rw [kernelParam_apply, kernelLift_apply]

private theorem kernelParam_range (lam B : ℂ) (hlam : lam ≠ 1) :
    (kernelParam lam B).range = ⊤ := by
  rw [LinearMap.range_eq_top]
  intro t
  exact ⟨kernelLift lam B hlam t, kernelParam_rightInv lam B hlam t⟩

/-- When `λ ≠ 1`, the parameter coordinate is a linear isomorphism of the kernel. -/
private noncomputable def kernelParamEquiv (lam B : ℂ) (hlam : lam ≠ 1) :
    (partialDeriv (lam - 1) B).ker ≃L[ℂ] ℂ := by
  haveI : FiniteDimensional ℂ (partialDeriv (lam - 1) B).ker := inferInstance
  haveI : CompleteSpace (partialDeriv (lam - 1) B).ker :=
    FiniteDimensional.complete ℂ _
  exact ContinuousLinearEquiv.ofBijective (kernelParam lam B)
    (kernelParam_ker lam B hlam) (kernelParam_range lam B hlam)

private theorem kernelParamEquiv_apply (lam B : ℂ) (hlam : lam ≠ 1)
    (v : (partialDeriv (lam - 1) B).ker) :
    kernelParamEquiv lam B hlam v = (v : ℂ × ℂ).2 := by
  unfold kernelParamEquiv
  simp only [ContinuousLinearEquiv.coeFn_ofBijective, kernelParam_apply]

private theorem kernelParamEquiv_symm_apply (lam B : ℂ) (hlam : lam ≠ 1) (t : ℂ) :
    ((kernelParamEquiv lam B hlam).symm t : ℂ × ℂ) = (B / (1 - lam) * t, t) := by
  have hsec : (kernelParamEquiv lam B hlam) (kernelLift lam B hlam t) = t :=
    kernelParam_rightInv lam B hlam t
  have hinv : (kernelParamEquiv lam B hlam).symm t = kernelLift lam B hlam t := by
    apply (kernelParamEquiv lam B hlam).injective
    rw [(kernelParamEquiv lam B hlam).apply_symm_apply, hsec]
  rw [hinv, kernelLift_apply]

/-- Exact derivative identity over `ℂ`: if `orbit c n z = z` and the multiplier
`λ` is not `1`, the period equation has a local graph `t ↦ φ t` through
`(c, z)` whose derivative is `B / (1 - λ)`. Here `B` is the parameter
derivative at this cycle point. The section is obtained by inverting the
parameter coordinate on the kernel of `(λ - 1) dz + B dc`. This does not
certify binary64, `guardDisplacement = 0.01`, or the Newton floor `1e-12`. -/
theorem exists_branch_slope (c z : ℂ) (n : ℕ) (hclose : orbit c n z = z)
    (hlam : (derivative (seedPolynomial c n)).eval z ≠ 1) :
    ∃ φ : ℂ → ℂ, φ c = z ∧
      (∀ᶠ t in 𝓝 c, orbit t n (φ t) = φ t) ∧
      HasDerivAt φ
        ((derivative (parameterPolynomial (C z) n)).eval c /
          (1 - (derivative (seedPolynomial c n)).eval z)) c := by
  let lamv : ℂ := (derivative (seedPolynomial c n)).eval z
  let Bv : ℂ := (derivative (parameterPolynomial (C z) n)).eval c
  let f' := partialDeriv (lamv - 1) Bv
  have hf : HasStrictFDerivAt (returnResidual n) f' (z, c) := by
    simpa [lamv, Bv, f'] using hasStrictFDerivAt_returnResidual z c n
  have hden : lamv - 1 ≠ 0 := sub_ne_zero.mpr hlam
  have hrange : f'.range = ⊤ := partialDeriv_range_top hden
  have hker : f'.ker.ClosedComplemented :=
    f'.ker_closedComplemented_of_finiteDimensional_range
  have hzero : returnResidual n (z, c) = 0 := by
    simp only [returnResidual, Pi.sub_apply, orbitJoint, hclose, sub_self]
  let ψ : f'.ker → ℂ × ℂ :=
    hf.implicitFunctionOfComplemented (returnResidual n) f' hrange hker 0
  have hψ0 : ψ 0 = (z, c) := by
    simpa [ψ, hzero] using hf.implicitFunctionOfComplemented_apply_image hrange hker
  have hψ : HasStrictFDerivAt ψ f'.ker.subtypeL 0 := by
    simpa [ψ, hzero] using hf.to_implicitFunctionOfComplemented hrange hker
  have : CompleteSpace f'.ker := FiniteDimensional.complete ℂ f'.ker
  let e : f'.ker ≃L[ℂ] ℂ := kernelParamEquiv lamv Bv hlam
  have hparam : HasStrictFDerivAt (fun k => (ψ k).2) (e : f'.ker →L[ℂ] ℂ) 0 := by
    have hsnd := hψ.snd
    have hderiv :
        (snd ℂ ℂ ℂ).comp f'.ker.subtypeL = (e : f'.ker →L[ℂ] ℂ) := by
      ext v
      simp only [e, ContinuousLinearMap.comp_apply, Submodule.subtypeL_apply,
        coe_snd', ContinuousLinearEquiv.coe_coe]
      rw [kernelParamEquiv_apply lamv Bv hlam v]
    exact hsnd.congr_fderiv hderiv
  have hcpt : (ψ 0).2 = c := by rw [hψ0]
  let τ : ℂ → f'.ker := hparam.localInverse (fun k => (ψ k).2) e 0
  have hτc : τ c = 0 := by
    rw [← hcpt]
    exact hparam.localInverse_apply_image
  have hτ : HasStrictFDerivAt τ (e.symm : ℂ →L[ℂ] f'.ker) c := by
    rw [← hcpt]
    exact hparam.to_localInverse
  let φ : ℂ → ℂ := fun t => (ψ (τ t)).1
  have hφval : φ c = z := by simp [φ, hτc, hψ0]
  have hright : ∀ᶠ t in 𝓝 c, (ψ (τ t)).2 = t := by
    rw [← hcpt]
    simpa [τ] using hparam.eventually_right_inverse
  have htend : Tendsto τ (𝓝 c) (𝓝 (0 : f'.ker)) := by
    rw [← hcpt]
    exact hparam.localInverse_tendsto
  have hseed : HasStrictFDerivAt (fun k => (ψ k).1)
      ((fst ℂ ℂ ℂ).comp f'.ker.subtypeL) (τ c) := by
    have hseed0 := hψ.fst
    rwa [← hτc] at hseed0
  have hφF : HasStrictFDerivAt φ
      (((fst ℂ ℂ ℂ).comp f'.ker.subtypeL).comp
        (e.symm : ℂ →L[ℂ] f'.ker)) c :=
    hseed.comp c hτ
  have hslope :
      (((fst ℂ ℂ ℂ).comp f'.ker.subtypeL).comp
          (e.symm : ℂ →L[ℂ] f'.ker)) 1 =
        Bv / (1 - lamv) := by
    rw [ContinuousLinearMap.comp_apply, ContinuousLinearMap.comp_apply,
      Submodule.subtypeL_apply, coe_fst', ContinuousLinearEquiv.coe_coe]
    have hpair : ((e.symm 1 : f'.ker) : ℂ × ℂ) =
        (Bv / (1 - lamv) * 1, 1) := by
      simpa [e, f', lamv, Bv] using kernelParamEquiv_symm_apply lamv Bv hlam 1
    rw [hpair]
    simp
  refine ⟨φ, hφval, ?_, ?_⟩
  · have hmap :=
      (hf.map_implicitFunctionOfComplemented_eq hrange hker).curry_nhds.self_of_nhds
    rw [hzero] at hmap
    filter_upwards [hright, htend.eventually hmap] with t ht hres
    have hresψ : returnResidual n (ψ (τ t)) = 0 := hres
    have hpt : ψ (τ t) = (φ t, t) := by
      apply Prod.ext
      · rfl
      · exact ht
    rw [hpt] at hresψ
    simp only [returnResidual, Pi.sub_apply, orbitJoint, sub_eq_zero] at hresψ
    exact hresψ
  · have hstrict : HasStrictDerivAt φ (Bv / (1 - lamv)) c := by
      rw [← hslope]
      exact hφF.hasStrictDerivAt
    simpa [lamv, Bv] using hstrict.hasDerivAt

end IntMProof
