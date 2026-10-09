import IntMProof.DyadicArithmetic
import IntMProof.ParameterJetGeneration

/-!
# Executable dyadic coefficient generation and evaluation (P4)

An integer implementation follows the ascending convolution and both constant
adds of the decoded generator. All constants share one grid, and integer storage
is unbounded. Decoding correspondence and primitive residuals are proved;
binary64 and renderer refinement are separate obligations.
-/

namespace IntMProof

/-- Exact integer representation of zero on every grid. -/
def dyadicZero : DyadicComplex := ⟨0, 0⟩

/-- Exact integer representation of one on the selected grid. -/
def dyadicOne (precision : ℕ) : DyadicComplex := ⟨dyadicScale precision, 0⟩

@[simp] theorem dyadicDecode_zero (precision : ℕ) :
    dyadicDecode precision dyadicZero = 0 := by
  apply Complex.ext <;> simp [dyadicDecode, dyadicZero]

@[simp] theorem dyadicDecode_one (precision : ℕ) :
    dyadicDecode precision (dyadicOne precision) = 1 := by
  apply Complex.ext <;> simp [dyadicDecode, dyadicOne, dyadicScale]

/-- Ascending integer convolution, starting from an exact zero accumulator. -/
def dyadicConvolution (precision : ℕ) (a : ℕ → DyadicComplex) (k : ℕ) :
    ℕ → DyadicComplex
  | 0 => dyadicZero
  | count + 1 => dyadicAdd (dyadicConvolution precision a k count)
      (dyadicMultiply precision (a count) (a (k - count)))

/-- Both final constant adds run, including additions by zero. -/
def dyadicCoefficientUpdate (precision : ℕ) (c : DyadicComplex)
    (a : ℕ → DyadicComplex) (k : ℕ) : DyadicComplex :=
  dyadicAdd (dyadicAdd (dyadicConvolution precision a k (k + 1))
    (if k = 1 then dyadicOne precision else dyadicZero))
    (if k = 0 then c else dyadicZero)

/-- Executable inclusive coefficient table, resetting omitted orders after each step. -/
def dyadicGeneratedCoefficient (precision : ℕ) (c z : DyadicComplex)
    (order : ℕ) : ℕ → ℕ → DyadicComplex
  | 0, k => if k = 0 then z else dyadicZero
  | n + 1, k => if k ≤ order then
      dyadicCoefficientUpdate precision c (dyadicGeneratedCoefficient precision c z order n) k
      else dyadicZero

/-- The integer accumulator decodes to the specified complex loop. -/
theorem dyadicDecode_convolution (precision : ℕ) (a : ℕ → DyadicComplex) (k count : ℕ) :
    dyadicDecode precision (dyadicConvolution precision a k count) =
      parameterJetConvolution (fun j => dyadicDecode precision (a j))
        (dyadicComplexMultiply precision) (· + ·) k count := by
  induction count with
  | zero => simp [dyadicConvolution, parameterJetConvolution]
  | succ count ih =>
    simp only [dyadicConvolution, parameterJetConvolution, dyadicDecode_add,
      dyadicDecode_multiply, ih]

/-- Integer updates copy both forcing constants exactly on the common grid. -/
theorem dyadicDecode_coefficientUpdate (precision : ℕ) (c : DyadicComplex)
    (a : ℕ → DyadicComplex) (k : ℕ) :
    dyadicDecode precision (dyadicCoefficientUpdate precision c a k) =
      parameterJetCoefficientUpdate (dyadicDecode precision c)
        (fun j => dyadicDecode precision (a j)) (dyadicComplexMultiply precision) (· + ·) k := by
  simp only [dyadicCoefficientUpdate, parameterJetCoefficientUpdate, dyadicDecode_add,
    dyadicDecode_convolution]
  split_ifs <;> simp

/-- The whole executable table refines the decoded finite generator. -/
theorem dyadicDecode_generatedCoefficient (precision : ℕ) (c z : DyadicComplex)
    (order n k : ℕ) :
    dyadicDecode precision (dyadicGeneratedCoefficient precision c z order n k) =
      parameterJetGeneratedCoefficient (dyadicDecode precision c) (dyadicDecode precision z)
        (dyadicComplexMultiply precision) (· + ·) order n k := by
  induction n generalizing k with
  | zero =>
    simp only [dyadicGeneratedCoefficient, parameterJetGeneratedCoefficient]
    split_ifs <;> simp
  | succ n ih =>
    simp only [dyadicGeneratedCoefficient, parameterJetGeneratedCoefficient]
    split_ifs
    · rw [dyadicDecode_coefficientUpdate]
      simp only [ih]
    · simp

/-- The reference arithmetic discharges every local convolution residual. -/
theorem dyadicConvolution_local_errors (precision : ℕ) (a : ℕ → ℂ) (k count : ℕ) :
    parameterJetConvolutionLocalErrors a (dyadicComplexMultiply precision) (· + ·)
      (4 / (2 : ℝ) ^ precision) 0 k count := by
  induction count with
  | zero => trivial
  | succ count ih => exact ⟨ih, dyadicComplexMultiply_error_le precision _ _, by simp⟩

/-- Exact grid addition leaves only four scalar-product errors per term. -/
theorem dyadicCoefficientUpdate_local_errors (precision : ℕ) (c : ℂ)
    (a : ℕ → ℂ) (k : ℕ) :
    parameterJetCoefficientUpdateLocalErrors c a (dyadicComplexMultiply precision) (· + ·)
      (4 / (2 : ℝ) ^ precision) 0 k := by
  exact ⟨dyadicConvolution_local_errors precision a k (k + 1), by simp, by simp⟩

/-- Proved local defect table for every dyadic coefficient row. -/
theorem dyadicGeneration_local_errors (precision : ℕ) (c z : ℂ) (order n : ℕ) :
    parameterJetGenerationLocalErrors c z (dyadicComplexMultiply precision) (· + ·)
      (fun _ k => (k + 1 : ℕ) * (4 / (2 : ℝ) ^ precision)) order n := by
  have h := parameterJetGenerationLocalErrors_of_primitive c z (dyadicComplexMultiply precision)
    (· + ·) (fun _ _ => 4 / (2 : ℝ) ^ precision) (fun _ _ => 0) order n
    (fun _ _ k _ => dyadicCoefficientUpdate_local_errors precision c _ k)
  simpa using h

/-- Generated integer coefficients satisfy the inclusive discrepancy recurrence. -/
theorem dyadicGeneratedCoefficient_error_le (precision : ℕ) (c z : DyadicComplex)
    (B : ℕ → ℕ → ℝ) (order n k : ℕ) (hk : k ≤ order)
    (hB : ∀ m < n, ∀ j ≤ order,
      ‖parameterJetCoefficient (dyadicDecode precision c) (dyadicDecode precision z) m j‖ ≤ B m j) :
    ‖dyadicDecode precision (dyadicGeneratedCoefficient precision c z order n k) -
      parameterJetCoefficient (dyadicDecode precision c) (dyadicDecode precision z) n k‖ ≤
      parameterJetGenerationBudget B
        (fun _ k => (k + 1 : ℕ) * (4 / (2 : ℝ) ^ precision)) n k := by
  rw [dyadicDecode_generatedCoefficient]
  exact parameterJetGeneratedCoefficient_error_le _ _ _ _ B _ order n k hk hB
    (dyadicGeneration_local_errors precision _ _ order n)

/-- Executable generated coefficients and Horner evaluation compose with any
certified exact truncation cap. The target uses the same decoded constants and offset. -/
theorem dyadicGeneratedHorner_error_le_orbit (precision : ℕ) (c z δ : DyadicComplex)
    (B : ℕ → ℕ → ℝ) (Δ truncation : ℝ) (order n : ℕ)
    (hB : ∀ m < n, ∀ k ≤ order,
      ‖parameterJetCoefficient (dyadicDecode precision c) (dyadicDecode precision z) m k‖ ≤ B m k)
    (hδ : ‖dyadicDecode precision δ‖ ≤ Δ)
    (htrunc : ‖parameterJetApproximation (dyadicDecode precision c)
      (dyadicDecode precision z) (dyadicDecode precision δ) n order -
      orbit (dyadicDecode precision c + dyadicDecode precision δ) n
        (dyadicDecode precision z)‖ ≤ truncation) :
    ‖dyadicDecode precision (dyadicHorner precision
      (dyadicGeneratedCoefficient precision c z order n) δ 0 order) -
      orbit (dyadicDecode precision c + dyadicDecode precision δ) n
        (dyadicDecode precision z)‖ ≤
      parameterJetHornerRoundBudget Δ (fun _ => 4 / (2 : ℝ) ^ precision) (fun _ => 0) 0 order +
      parameterJetCoefficientErrorBudget
        (parameterJetGenerationBudget B
          (fun _ k => (k + 1 : ℕ) * (4 / (2 : ℝ) ^ precision)) n) Δ order + truncation := by
  rw [dyadicDecode_horner]
  exact parameterJetInexactHorner_error_le_orbit _ _ _ _ _ _ Δ _ _ _ truncation n order hδ
    (dyadicHorner_local_errors precision _ _ 0 order)
    (fun k hk => dyadicGeneratedCoefficient_error_le precision c z B order n k hk hB) htrunc

end IntMProof
