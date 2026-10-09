import IntMProof.DyadicJetGeneration

/-!
# Exact integer parameter jets on the dyadic reference grid (P4)

Every real integer is represented exactly at every dyadic precision. Integer
reference parameters and seeds preserve integer coefficients under the finite
convolution recurrence. Thus this executable generator has zero coefficient
error at all retained orders and horizons; offset evaluation may still round.
-/
namespace IntMProof

/-- Exact representation of a real integer on the common dyadic grid. -/
def dyadicInteger (precision : ℕ) (x : ℤ) : DyadicComplex :=
  ⟨x * dyadicScale precision, 0⟩

/-- Copied reference parameter minus one. -/
def dyadicMinusOne (precision : ℕ) : DyadicComplex := dyadicInteger precision (-1)

@[simp] theorem dyadicDecode_integer (precision : ℕ) (x : ℤ) :
    dyadicDecode precision (dyadicInteger precision x) = (x : ℂ) := by
  apply Complex.ext <;> simp [dyadicDecode, dyadicInteger, dyadicScale]

@[simp] theorem dyadicInteger_zero (precision : ℕ) :
    dyadicInteger precision 0 = dyadicZero := by
  simp [dyadicInteger, dyadicZero]

@[simp] theorem dyadicInteger_one (precision : ℕ) :
    dyadicInteger precision 1 = dyadicOne precision := by
  simp [dyadicInteger, dyadicOne]

@[simp] theorem dyadicDecode_minusOne (precision : ℕ) :
    dyadicDecode precision (dyadicMinusOne precision) = -1 := by
  simp [dyadicMinusOne]

/-- Exact grid addition preserves represented integers. -/
theorem dyadicInteger_add (precision : ℕ) (x y : ℤ) :
    dyadicAdd (dyadicInteger precision x) (dyadicInteger precision y) =
      dyadicInteger precision (x + y) := by
  simp [dyadicAdd, dyadicInteger, add_mul]

/-- Grid division has zero remainder on the product of represented integers. -/
theorem dyadicInteger_multiply (precision : ℕ) (x y : ℤ) :
    dyadicMultiply precision (dyadicInteger precision x) (dyadicInteger precision y) =
      dyadicInteger precision (x * y) := by
  have hs : dyadicScale precision ≠ 0 := by simp [dyadicScale]
  have heq : x * dyadicScale precision * (y * dyadicScale precision) =
      (x * y * dyadicScale precision) * dyadicScale precision := by ring
  simp [dyadicMultiply, dyadicInteger, heq, Int.mul_ediv_cancel _ hs]

/-- Scalar floor rounding preserves a product of real integers. -/
theorem dyadicScalarMultiply_integer (precision : ℕ) (x y : ℤ) :
    dyadicScalarMultiply precision (x : ℝ) (y : ℝ) = ((x * y : ℤ) : ℝ) := by
  have heq : (x : ℝ) * (y : ℝ) * (2 : ℝ) ^ precision =
      ((x * y * dyadicScale precision : ℤ) : ℝ) := by simp [dyadicScale]
  unfold dyadicScalarMultiply
  rw [heq, Int.floor_intCast]
  simp [dyadicScale]

/-- All complex scalar products are exact on copied real integers. -/
theorem dyadicComplexMultiply_integer (precision : ℕ) (x y : ℤ) :
    dyadicComplexMultiply precision (x : ℂ) (y : ℂ) = ((x * y : ℤ) : ℂ) := by
  have h := dyadicDecode_multiply precision (dyadicInteger precision x)
    (dyadicInteger precision y)
  simpa [dyadicInteger_multiply] using h.symm

/-- Computable integer coefficient recurrence with exact copied constants. -/
def parameterIntegerCoefficient (c z : ℤ) : ℕ → ℕ → ℤ
  | 0, k => if k = 0 then z else 0
  | n + 1, k => (∑ j ∈ Finset.range (k + 1),
      parameterIntegerCoefficient c z n j * parameterIntegerCoefficient c z n (k - j)) +
      (if k = 1 then 1 else 0) + (if k = 0 then c else 0)

/-- The integer recurrence transports to the exact complex Taylor coefficients. -/
theorem parameterIntegerCoefficient_cast (c z : ℤ) (n k : ℕ) :
    (parameterIntegerCoefficient c z n k : ℂ) =
      parameterJetCoefficient (c : ℂ) (z : ℂ) n k := by
  induction n generalizing k with
  | zero => simp [parameterIntegerCoefficient]
  | succ n ih =>
    rw [parameterIntegerCoefficient, parameterJetCoefficient_succ_range]
    push_cast
    simp only [ih]

/-- Integer convolution accumulates exactly, even on a partial retained prefix. -/
theorem dyadicConvolution_integer (precision : ℕ) (a : ℕ → DyadicComplex)
    (b : ℕ → ℤ) (k count : ℕ) (hcount : count ≤ k + 1)
    (ha : ∀ j ≤ k, a j = dyadicInteger precision (b j)) :
    dyadicConvolution precision a k count =
      dyadicInteger precision (∑ j ∈ Finset.range count, b j * b (k - j)) := by
  induction count with
  | zero => simp [dyadicConvolution]
  | succ count ih =>
    have hcountk : count ≤ k := by omega
    rw [dyadicConvolution, ih (by omega), ha count hcountk,
      ha (k - count) (Nat.sub_le _ _), dyadicInteger_multiply, dyadicInteger_add,
      Finset.sum_range_succ]

/-- Retained coefficients of the executable integer generator have zero error. -/
theorem dyadicGeneratedCoefficient_integer_exact (precision : ℕ) (c z : ℤ)
    (order n k : ℕ) (hk : k ≤ order) :
    dyadicGeneratedCoefficient precision (dyadicInteger precision c)
      (dyadicInteger precision z) order n k =
      dyadicInteger precision (parameterIntegerCoefficient c z n k) := by
  induction n generalizing k with
  | zero =>
    by_cases h : k = 0 <;> simp [dyadicGeneratedCoefficient, parameterIntegerCoefficient, h]
  | succ n ih =>
    rw [dyadicGeneratedCoefficient, if_pos hk, dyadicCoefficientUpdate,
      dyadicConvolution_integer precision _ (parameterIntegerCoefficient c z n) k (k + 1)
        le_rfl (fun j hj => ih j (hj.trans hk)), parameterIntegerCoefficient]
    have hf : (if k = 1 then dyadicOne precision else dyadicZero) =
        dyadicInteger precision (if k = 1 then 1 else 0) := by split_ifs <;> simp
    have hc : (if k = 0 then dyadicInteger precision c else dyadicZero) =
        dyadicInteger precision (if k = 0 then c else 0) := by split_ifs <;> simp
    rw [hf, hc, dyadicInteger_add, dyadicInteger_add]

/-- Exact decoded generator for any copied real integer reference and seed. -/
theorem dyadicGeneratedCoefficient_decode_integer_exact (precision : ℕ) (c z : ℤ)
    (order n k : ℕ) (hk : k ≤ order) :
    dyadicDecode precision (dyadicGeneratedCoefficient precision (dyadicInteger precision c)
      (dyadicInteger precision z) order n k) =
      parameterJetCoefficient (c : ℂ) (z : ℂ) n k := by
  rw [dyadicGeneratedCoefficient_integer_exact precision c z order n k hk,
    dyadicDecode_integer, parameterIntegerCoefficient_cast]

/-- The minus-one critical reference has exact generated retained coefficients.
There is no horizon or precision restriction. -/
theorem dyadicGeneratedCoefficient_minusOne_exact (precision order n k : ℕ)
    (hk : k ≤ order) :
    dyadicDecode precision (dyadicGeneratedCoefficient precision (dyadicMinusOne precision)
      dyadicZero order n k) = parameterJetCoefficient (-1 : ℂ) 0 n k := by
  simpa [dyadicMinusOne] using
    dyadicGeneratedCoefficient_decode_integer_exact precision (-1) 0 order n k hk

end IntMProof
