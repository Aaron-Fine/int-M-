import IntMProof.ParameterJetHorner

/-!
# Scalar operation contracts for decoded complex arithmetic (P4)

The multiplication expression follows `src/domain/complex.ts`: four scalar
products followed by a real-component subtraction and imaginary-component
addition. Each residual is bounded at the actual decoded operands, including
the inexact products supplied to subtraction and addition. These are functions
on mathematical real numbers; binary64 decoding and finite validity require
separate refinement proofs. No fused multiply-add operation is modeled.
-/

namespace IntMProof

/-- Four separate products, then real subtraction and imaginary addition. -/
def scalarComplexMultiply (mul sub add : ℝ → ℝ → ℝ) (x y : ℂ) : ℂ :=
  let pRR := mul x.re y.re
  let pII := mul x.im y.im
  let pRI := mul x.re y.im
  let pIR := mul x.im y.re
  ⟨sub pRR pII, add pRI pIR⟩

/-- Componentwise addition using two separate scalar operations. -/
def scalarComplexAdd (add : ℝ → ℝ → ℝ) (x y : ℂ) : ℂ :=
  ⟨add x.re y.re, add x.im y.im⟩

/-- Local scalar residuals compose to a complex multiplication residual. -/
theorem scalarComplexMultiply_error_le (mul sub add : ℝ → ℝ → ℝ) (x y : ℂ)
    (εRR εII εRI εIR εSub εAdd : ℝ)
    (hRR : |mul x.re y.re - x.re * y.re| ≤ εRR)
    (hII : |mul x.im y.im - x.im * y.im| ≤ εII)
    (hRI : |mul x.re y.im - x.re * y.im| ≤ εRI)
    (hIR : |mul x.im y.re - x.im * y.re| ≤ εIR)
    (hSub : |sub (mul x.re y.re) (mul x.im y.im) -
      (mul x.re y.re - mul x.im y.im)| ≤ εSub)
    (hAdd : |add (mul x.re y.im) (mul x.im y.re) -
      (mul x.re y.im + mul x.im y.re)| ≤ εAdd) :
    ‖scalarComplexMultiply mul sub add x y - x * y‖ ≤
      εRR + εII + εRI + εIR + εSub + εAdd := by
  have hre : |sub (mul x.re y.re) (mul x.im y.im) -
      (x.re * y.re - x.im * y.im)| ≤ εSub + εRR + εII := by
    have heq : sub (mul x.re y.re) (mul x.im y.im) -
        (x.re * y.re - x.im * y.im) =
        (sub (mul x.re y.re) (mul x.im y.im) -
          (mul x.re y.re - mul x.im y.im)) +
        (mul x.re y.re - x.re * y.re) -
        (mul x.im y.im - x.im * y.im) := by ring
    rw [heq]
    exact (abs_sub _ _).trans
      (add_le_add ((abs_add_le _ _).trans (add_le_add hSub hRR)) hII)
  have him : |add (mul x.re y.im) (mul x.im y.re) -
      (x.re * y.im + x.im * y.re)| ≤ εAdd + εRI + εIR := by
    have heq : add (mul x.re y.im) (mul x.im y.re) -
        (x.re * y.im + x.im * y.re) =
        (add (mul x.re y.im) (mul x.im y.re) -
          (mul x.re y.im + mul x.im y.re)) +
        (mul x.re y.im - x.re * y.im) +
        (mul x.im y.re - x.im * y.re) := by ring
    rw [heq]
    exact (abs_add_le _ _).trans
      (add_le_add ((abs_add_le _ _).trans (add_le_add hAdd hRI)) hIR)
  have hnorm := Complex.norm_le_abs_re_add_abs_im
    (scalarComplexMultiply mul sub add x y - x * y)
  simp only [scalarComplexMultiply, Complex.sub_re, Complex.sub_im,
    Complex.mul_re, Complex.mul_im] at hnorm
  exact hnorm.trans ((add_le_add hre him).trans_eq (by ring))

/-- Local component addition residuals compose to a complex residual. -/
theorem scalarComplexAdd_error_le (add : ℝ → ℝ → ℝ) (x y : ℂ)
    (εRe εIm : ℝ)
    (hRe : |add x.re y.re - (x.re + y.re)| ≤ εRe)
    (hIm : |add x.im y.im - (x.im + y.im)| ≤ εIm) :
    ‖scalarComplexAdd add x y - (x + y)‖ ≤ εRe + εIm := by
  have hnorm := Complex.norm_le_abs_re_add_abs_im (scalarComplexAdd add x y - (x + y))
  simp only [scalarComplexAdd, Complex.sub_re, Complex.sub_im,
    Complex.add_re, Complex.add_im] at hnorm
  exact hnorm.trans (add_le_add hRe hIm)

/-- Uniform scalar contracts supply the six actual multiplication operands. -/
theorem scalarComplexMultiply_error_le_uniform (mul sub add : ℝ → ℝ → ℝ)
    (εMul εSub εAdd : ℝ)
    (hmul : ∀ a b, |mul a b - a * b| ≤ εMul)
    (hsub : ∀ a b, |sub a b - (a - b)| ≤ εSub)
    (hadd : ∀ a b, |add a b - (a + b)| ≤ εAdd) (x y : ℂ) :
    ‖scalarComplexMultiply mul sub add x y - x * y‖ ≤ 4 * εMul + εSub + εAdd := by
  exact (scalarComplexMultiply_error_le mul sub add x y εMul εMul εMul εMul εSub εAdd
    (hmul _ _) (hmul _ _) (hmul _ _) (hmul _ _) (hsub _ _) (hadd _ _)).trans_eq (by ring)

/-- Uniform scalar addition contracts supply both component operands. -/
theorem scalarComplexAdd_error_le_uniform (add : ℝ → ℝ → ℝ) (εAdd : ℝ)
    (hadd : ∀ a b, |add a b - (a + b)| ≤ εAdd) (x y : ℂ) :
    ‖scalarComplexAdd add x y - (x + y)‖ ≤ 2 * εAdd := by
  exact (scalarComplexAdd_error_le add x y εAdd εAdd (hadd _ _) (hadd _ _)).trans_eq
    (by ring)

end IntMProof
