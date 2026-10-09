import IntMProof.DyadicArithmetic
import IntMProof.ParameterJetGeneration
import IntMProof.DyadicJetGeneration
import IntMProof.DyadicIntegerJets
import IntMProof.DyadicJetCertificate

namespace IntMProof

-- Euclidean division rounds negative nonintegral products toward minus infinity.
example : dyadicMultiply 2 ⟨-1, 0⟩ ⟨1, 0⟩ = ⟨-1, 0⟩ := by decide

-- Four products are rounded separately. Their imaginary sum would be exact
-- on this grid if multiplication were rounded only after forming the sum.
example : dyadicMultiply 2 ⟨1, 1⟩ ⟨2, 2⟩ = ⟨0, 0⟩ := by decide

example : (dyadicDecode 2 ⟨1, 1⟩ * dyadicDecode 2 ⟨2, 2⟩).im = 1 / 4 := by
  norm_num [dyadicDecode, Complex.mul_im]

-- Precision zero is the integer grid, rather than a disabled-operation case.
example : dyadicMultiply 0 ⟨-2, 3⟩ ⟨4, -5⟩ = ⟨7, 22⟩ := by decide

-- Integer addition loses no carry or sign, regardless of operand magnitude.
example : dyadicDecode 3 (dyadicAdd ⟨-17, 23⟩ ⟨10, -31⟩) =
    dyadicDecode 3 ⟨-17, 23⟩ + dyadicDecode 3 ⟨10, -31⟩ := by
  exact dyadicDecode_add 3 _ _

-- Order zero copies the stored coefficient, even at a nonzero start.
example : dyadicHorner 0 (fun k => ⟨(k : ℤ), -7⟩) ⟨99, 23⟩ 4 0 = ⟨4, -7⟩ := by
  rfl

-- The integer generator copies both coordinates of the initial seed.
example : dyadicGeneratedCoefficient 2 ⟨99, 17⟩ ⟨3, -5⟩ 0 0 0 = ⟨3, -5⟩ := by
  rfl

-- The forcing one is stored at the current scale, rather than as raw integer1.
example : dyadicGeneratedCoefficient 2 dyadicZero dyadicZero 1 1 1 = ⟨4, 0⟩ := by
  decide

-- Inclusive order two is generated exactly at the integer minus-one anchor.
example : dyadicGeneratedCoefficient 2 ⟨-4, 0⟩ dyadicZero 2 2 2 = ⟨4, 0⟩ := by
  decide

-- Omitted orders are reset to zero and cannot leak into the retained table.
example : dyadicGeneratedCoefficient 2 ⟨-4, 0⟩ dyadicZero 2 3 3 = dyadicZero := by
  decide

-- Fractional anchors need genuine generation-error budgets: c=1/4 loses the
-- second-iterate c*c contribution on the precision-two grid.
example : dyadicGeneratedCoefficient 2 ⟨1, 0⟩ dyadicZero 0 2 0 = ⟨1, 0⟩ := by
  decide

example : orbit (1 / 4 : ℂ) 2 0 = 5 / 16 := by
  norm_num [orbit_succ, quadratic]

-- Exact generation applies to nonzero integer seeds and positive anchors too.
example : dyadicGeneratedCoefficient 5 (dyadicInteger 5 2) (dyadicInteger 5 (-3))
    1 2 1 = dyadicInteger 5 23 := by decide

-- A negative integer product remains exact at every precision, unlike a
-- negative nonintegral decoded product.
example (precision : ℕ) :
    dyadicMultiply precision (dyadicInteger precision (-3)) (dyadicInteger precision 7) =
      dyadicInteger precision (-21) := by
  simpa using dyadicInteger_multiply precision (-3) 7

-- Integer-anchor exactness requires retention: order two is nonzero here,
-- whereas an order-zero generator intentionally omits it.
example (precision : ℕ) :
    dyadicDecode precision (dyadicGeneratedCoefficient precision (dyadicMinusOne precision)
      dyadicZero 0 2 2) ≠ parameterJetCoefficient (-1 : ℂ) 0 2 2 := by
  have h := parameterIntegerCoefficient_cast (-1) 0 2 2
  norm_num [parameterIntegerCoefficient, Finset.sum_range_succ] at h
  rw [parameterJetCoefficient_two, ← h]
  norm_num [dyadicGeneratedCoefficient]

-- Integer coefficient generation is exact even at precision zero; it is the
-- fractional offset evaluation, rather than reference generation, that rounds.
example : dyadicGeneratedCoefficient 0 (dyadicMinusOne 0) dyadicZero 2 2 2 = ⟨1, 0⟩ := by
  decide

-- The actual evaluator certificate includes the closed positive disk boundary
-- and the last certified iterate. This uses only integer input and disk premises.
example : ‖dyadicDecode 42 (minusOneDyadicJetEvaluate ⟨17179869184, 0⟩ 16) -
    orbit (-1 + dyadicDecode 42 ⟨17179869184, 0⟩) 16 0‖ ≤ (1 / 1000000 : ℝ) := by
  apply minusOneDyadicJetEvaluate_error_le _ _ (by omega)
  have hdecode : dyadicDecode 42 ⟨17179869184, 0⟩ = ((1 / 256 : ℝ) : ℂ) := by
    apply Complex.ext <;> norm_num [dyadicDecode]
  rw [hdecode, Complex.norm_real]
  norm_num

-- Initialization copies the seed and executes no poisoned arithmetic.
example : parameterJetGeneratedCoefficient 7 5
    (fun _ _ => 999) (fun _ _ => 888) 0 0 0 = 5 := by rfl

-- Keeping only order zero still performs successive quadratic orbit updates.
example : parameterJetGeneratedCoefficient 1 2 (· * ·) (· + ·) 0 2 0 = 26 := by
  norm_num [parameterJetGeneratedCoefficient, parameterJetCoefficientUpdate,
    parameterJetConvolution]

-- The inclusive top retained coefficient receives all convolution terms.
example : parameterJetGeneratedCoefficient (-1) 0 (· * ·) (· + ·) 2 2 2 = 1 := by
  norm_num [parameterJetGeneratedCoefficient, parameterJetCoefficientUpdate,
    parameterJetConvolution]

-- Each term incurs one product and accumulator addition, and the two final
-- forcing additions execute even when both of their operands are zero.
example : parameterJetCoefficientUpdate 0 (fun _ => 0)
    (fun x y => x * y + 1) (fun x y => x + y + 2) 2 = 13 := by
  norm_num [parameterJetCoefficientUpdate, parameterJetConvolution]

-- A nonassociative accumulator exposes ascending loop order. Poisoned higher
-- coefficients are never read by the retained order-two convolution.
example : parameterJetConvolution (fun k => if k ≤ 2 then (k : ℂ) else 999)
    (fun x y => x * y + x) (fun x y => 10 * x + y) 2 3 = 22 := by
  norm_num [parameterJetConvolution]

-- Zero horizon consumes no residual rows, including negative supplied caps.
example : parameterJetGenerationLocalErrors 1 2
    (fun _ _ => 999) (fun _ _ => 888) (fun _ _ => -99) 3 0 := by
  intro m hm
  omega

-- At the first iterate all discrepancy comes from the current operation defect.
example : parameterJetGenerationBudget (fun _ _ => -99) (fun _ k => (k : ℝ) + 7)
    1 2 = 9 := by
  norm_num [parameterJetGenerationBudget, Finset.sum_range_succ]

-- The actual error consumer needs only earlier rows and retained order zero;
-- unused later rows and higher coefficient caps can be invalid.
example : ‖parameterJetGeneratedCoefficient (-1) 0 (· * ·) (· + ·) 0 1 0 -
    parameterJetCoefficient (-1) 0 1 0‖ ≤
    parameterJetGenerationBudget
      (fun n k => if n = 0 ∧ k = 0 then 0 else -99)
      (fun n k => if n = 0 ∧ k = 0 then 0 else -99) 1 0 := by
  apply parameterJetGeneratedCoefficient_error_le
  · omega
  · intro m hm j hj
    have hm0 : m = 0 := by omega
    have hj0 : j = 0 := by omega
    subst m
    subst j
    simp
  · intro m hm j hj
    have hm0 : m = 0 := by omega
    have hj0 : j = 0 := by omega
    subst m
    subst j
    norm_num [parameterJetGeneratedCoefficient, parameterJetCoefficientUpdate,
      parameterJetConvolution, Finset.sum_range_succ]

end IntMProof
