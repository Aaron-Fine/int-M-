import IntMProof.Derivatives
import Mathlib.Analysis.Complex.Basic

/-!
# Exact rational complex orbit model

Pairs of rationals give exact complex orbit frames. The embedding theorem links
these exact values to the quadratic dynamics over `ℂ`; it makes no claim about
binary64 evaluation or outward interval enclosures.
-/

namespace IntMProof

/-- A complex number represented by exact rational coordinates. -/
abbrev RationalComplex := ℚ × ℚ

/-- Embed rational coordinates into the complex plane. -/
noncomputable def rationalComplexEmbed (z : RationalComplex) : ℂ :=
  ⟨(z.1 : ℝ), (z.2 : ℝ)⟩

/-- Exact quadratic step in rational coordinates. -/
def rationalQuadratic (c z : RationalComplex) : RationalComplex :=
  (z.1 * z.1 - z.2 * z.2 + c.1, 2 * z.1 * z.2 + c.2)

/-- Exact rational orbit from a supplied seed. -/
def rationalOrbit (c : RationalComplex) (n : ℕ) (z : RationalComplex) :
    RationalComplex := (rationalQuadratic c)^[n] z

/-- Squared magnitude as a rational, avoiding a square root. -/
def rationalNormSq (z : RationalComplex) : ℚ := z.1 * z.1 + z.2 * z.2

/-- Exact multiplication of rational-coordinate complex values. -/
def rationalComplexMul (x y : RationalComplex) : RationalComplex :=
  (x.1 * y.1 - x.2 * y.2, x.1 * y.2 + x.2 * y.1)

/-- Exact doubling of rational-coordinate complex values. -/
def rationalComplexDouble (z : RationalComplex) : RationalComplex :=
  (2 * z.1, 2 * z.2)

/-- Exact seed multiplier along a rational orbit. -/
def rationalMultiplier (c z : RationalComplex) : ℕ → RationalComplex
  | 0 => (1, 0)
  | n + 1 => rationalComplexMul
      (rationalComplexDouble (rationalOrbit c n z)) (rationalMultiplier c z n)

/-- Rational-coordinate multiplication agrees with complex multiplication. -/
theorem rationalComplexMul_embed (x y : RationalComplex) :
    rationalComplexEmbed (rationalComplexMul x y) =
      rationalComplexEmbed x * rationalComplexEmbed y := by
  apply Complex.ext
  · simp only [rationalComplexEmbed, rationalComplexMul, Complex.mul_re]
    norm_cast
  · simp only [rationalComplexEmbed, rationalComplexMul, Complex.mul_im]
    norm_cast

/-- Doubling in rational coordinates agrees with complex doubling. -/
theorem rationalComplexDouble_embed (z : RationalComplex) :
    rationalComplexEmbed (rationalComplexDouble z) =
      2 * rationalComplexEmbed z := by
  apply Complex.ext
  · simp only [rationalComplexEmbed, rationalComplexDouble, Complex.mul_re]
    norm_cast
    ring
  · simp only [rationalComplexEmbed, rationalComplexDouble, Complex.mul_im]
    norm_cast
    ring

/-- One exact rational step embeds as one complex quadratic step. -/
theorem rationalQuadratic_embed (c z : RationalComplex) :
    rationalComplexEmbed (rationalQuadratic c z) =
      quadratic (rationalComplexEmbed c) (rationalComplexEmbed z) := by
  apply Complex.ext
  · simp only [rationalComplexEmbed, rationalQuadratic, quadratic,
      Complex.add_re, Complex.mul_re]
    norm_cast
  · simp only [rationalComplexEmbed, rationalQuadratic, quadratic,
      Complex.add_im, Complex.mul_im]
    norm_cast
    ring

/-- Every exact rational orbit embeds as its complex counterpart. -/
theorem rationalOrbit_embed (c z : RationalComplex) (n : ℕ) :
    rationalComplexEmbed (rationalOrbit c n z) =
      orbit (rationalComplexEmbed c) n (rationalComplexEmbed z) := by
  induction n with
  | zero => rfl
  | succ n ih =>
    have hstep : rationalOrbit c (n + 1) z =
        rationalQuadratic c (rationalOrbit c n z) := by
      simp only [rationalOrbit, Function.iterate_succ_apply']
    rw [hstep, rationalQuadratic_embed, ih, orbit_succ]

/-- The exact rational multiplier embeds as the formal complex seed derivative. -/
theorem rationalMultiplier_embed (c z : RationalComplex) (n : ℕ) :
    rationalComplexEmbed (rationalMultiplier c z n) =
      (Polynomial.derivative
        (seedPolynomial (rationalComplexEmbed c) n)).eval
        (rationalComplexEmbed z) := by
  induction n with
  | zero =>
    rw [seedPolynomial_derivative_zero]
    apply Complex.ext <;> simp [rationalMultiplier, rationalComplexEmbed]
  | succ n ih =>
    rw [rationalMultiplier, rationalComplexMul_embed,
      rationalComplexDouble_embed, rationalOrbit_embed, ih,
      seedPolynomial_derivative_succ]

/-- The rational square magnitude equals the squared complex modulus. -/
theorem rationalNormSq_embed (z : RationalComplex) :
    (rationalNormSq z : ℝ) = Complex.normSq (rationalComplexEmbed z) := by
  simp only [rationalNormSq, rationalComplexEmbed, Complex.normSq_apply]
  norm_cast

/-- Exact rational residual squares evaluate the complex closure residual. -/
theorem rationalOrbit_residualSq_embed (c z : RationalComplex) (n : ℕ) :
    (rationalNormSq
      ((rationalOrbit c n z).1 - z.1, (rationalOrbit c n z).2 - z.2) : ℝ) =
      Complex.normSq (orbit (rationalComplexEmbed c) n (rationalComplexEmbed z) -
        rationalComplexEmbed z) := by
  rw [← rationalOrbit_embed]
  have hsub : rationalComplexEmbed
      ((rationalOrbit c n z).1 - z.1, (rationalOrbit c n z).2 - z.2) =
        rationalComplexEmbed (rationalOrbit c n z) - rationalComplexEmbed z := by
    apply Complex.ext <;> simp [rationalComplexEmbed]
  rw [← hsub]
  exact rationalNormSq_embed _

/-- The exact rational multiplier square is the squared complex multiplier norm. -/
theorem rationalMultiplier_normSq_embed (c z : RationalComplex) (n : ℕ) :
    (rationalNormSq (rationalMultiplier c z n) : ℝ) =
      Complex.normSq
        ((Polynomial.derivative
          (seedPolynomial (rationalComplexEmbed c) n)).eval
          (rationalComplexEmbed z)) := by
  rw [← rationalMultiplier_embed]
  exact rationalNormSq_embed _

/-- A rational squared-multiplier comparison decides attraction against any
positive real cutoff, without requiring the multiplier norm to be rational. -/
theorem rationalMultiplier_attract_iff (c z : RationalComplex) (n : ℕ)
    (q : ℝ) (hq : 0 < q) :
    (rationalNormSq (rationalMultiplier c z n) : ℝ) < q ^ 2 ↔
      ‖(Polynomial.derivative
        (seedPolynomial (rationalComplexEmbed c) n)).eval
        (rationalComplexEmbed z)‖ < q := by
  rw [rationalMultiplier_normSq_embed, Complex.normSq_eq_norm_sq]
  constructor <;> intro h <;> nlinarith [norm_nonneg
    ((Polynomial.derivative
      (seedPolynomial (rationalComplexEmbed c) n)).eval
      (rationalComplexEmbed z))]

end IntMProof
