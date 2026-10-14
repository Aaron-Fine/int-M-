import IntMProof.ScalarComplexArithmetic
import Mathlib.Algebra.Order.Floor.Ring

/-!
# An integer dyadic reference arithmetic model for P4

Coordinates are unbounded integers divided by `2^precision`. Each scalar
product is rounded down to the grid by Euclidean integer division; scalar
addition and subtraction are exact. This executable reference model has a
proved decoded complex residual bound. It is not binary64 or a renderer path.
-/

namespace IntMProof

/-- Fixed dyadic scale, shared by both coordinates and all operands. -/
def dyadicScale (precision : ℕ) : ℤ := 2 ^ precision

/-- Unbounded integer coordinates on one common dyadic grid. -/
structure DyadicComplex where
  /-- Stored real coordinate in units of the common dyadic grid. -/
  re : ℤ
  /-- Stored imaginary coordinate in units of the common dyadic grid. -/
  im : ℤ
  deriving DecidableEq, Repr

/-- Mathematical decoding of the integer grid. -/
noncomputable def dyadicDecode (precision : ℕ) (x : DyadicComplex) : ℂ :=
  ⟨(x.re : ℝ) / (2 : ℝ) ^ precision, (x.im : ℝ) / (2 : ℝ) ^ precision⟩

/-- Exact addition on the common grid. -/
def dyadicAdd (x y : DyadicComplex) : DyadicComplex :=
  ⟨x.re + y.re, x.im + y.im⟩

/-- Four separately rounded products, then exact subtraction and addition.
This follows the expression topology of `complexMultiply`, with integer grid
arithmetic rather than JavaScript numbers. -/
def dyadicMultiply (precision : ℕ) (x y : DyadicComplex) : DyadicComplex :=
  let scale := dyadicScale precision
  ⟨x.re * y.re / scale - x.im * y.im / scale,
    x.re * y.im / scale + x.im * y.re / scale⟩

/-- Decoded scalar product with downward rounding to the same grid. -/
noncomputable def dyadicScalarMultiply (precision : ℕ) (x y : ℝ) : ℝ :=
  (⌊x * y * (2 : ℝ) ^ precision⌋ : ℝ) / (2 : ℝ) ^ precision

/-- The decoded complex model with exact scalar addition and subtraction. -/
noncomputable def dyadicComplexMultiply (precision : ℕ) : ℂ → ℂ → ℂ :=
  scalarComplexMultiply (dyadicScalarMultiply precision) (· - ·) (· + ·)

/-- Downward scalar rounding has a uniform absolute grid error, including
negative products. -/
theorem dyadicScalarMultiply_error_le (precision : ℕ) (x y : ℝ) :
    |dyadicScalarMultiply precision x y - x * y| ≤ 1 / (2 : ℝ) ^ precision := by
  have hs : 0 < (2 : ℝ) ^ precision := pow_pos (by norm_num) _
  have hlo := Int.floor_le (x * y * (2 : ℝ) ^ precision)
  have hhi := Int.lt_floor_add_one (x * y * (2 : ℝ) ^ precision)
  have hround : dyadicScalarMultiply precision x y ≤ x * y := by
    unfold dyadicScalarMultiply
    exact (div_le_iff₀ hs).2 hlo
  rw [abs_of_nonpos (sub_nonpos.mpr hround)]
  unfold dyadicScalarMultiply
  apply (le_div_iff₀ hs).2
  field_simp
  nlinarith [hhi]

/-- Componentwise addition decodes exactly. -/
theorem dyadicDecode_add (precision : ℕ) (x y : DyadicComplex) :
    dyadicDecode precision (dyadicAdd x y) =
      dyadicDecode precision x + dyadicDecode precision y := by
  apply Complex.ext <;> simp [dyadicDecode, dyadicAdd, add_div]

/-- Scalar floor rounding agrees with executable Euclidean integer division. -/
theorem dyadicScalarMultiply_decode (precision : ℕ) (x y : ℤ) :
    dyadicScalarMultiply precision ((x : ℝ) / (2 : ℝ) ^ precision)
      ((y : ℝ) / (2 : ℝ) ^ precision) =
      ((x * y / dyadicScale precision : ℤ) : ℝ) / (2 : ℝ) ^ precision := by
  have hs : (2 : ℝ) ^ precision ≠ 0 := ne_of_gt (pow_pos (by norm_num) _)
  have harg : (x : ℝ) / (2 : ℝ) ^ precision *
      ((y : ℝ) / (2 : ℝ) ^ precision) * (2 : ℝ) ^ precision =
      ((x * y : ℤ) : ℝ) / (2 : ℝ) ^ precision := by
    push_cast
    field_simp
  unfold dyadicScalarMultiply
  rw [harg]
  have hfloor : ⌊((x * y : ℤ) : ℝ) / (2 : ℝ) ^ precision⌋ =
      x * y / dyadicScale precision := by
    have hscale : ((dyadicScale precision : ℤ) : ℝ) = (2 : ℝ) ^ precision := by
      simp [dyadicScale]
    rw [← hscale, Int.floor_div_cast_of_nonneg (by dsimp [dyadicScale]; positivity),
      Int.floor_intCast]
  rw [hfloor]

/-- Decoding the executable complex product gives the scalar-operation model. -/
theorem dyadicDecode_multiply (precision : ℕ) (x y : DyadicComplex) :
    dyadicDecode precision (dyadicMultiply precision x y) =
      dyadicComplexMultiply precision (dyadicDecode precision x) (dyadicDecode precision y) := by
  apply Complex.ext <;>
    simp [dyadicDecode, dyadicMultiply, dyadicComplexMultiply, scalarComplexMultiply,
      dyadicScalarMultiply_decode, sub_div, add_div]

/-- Four rounded scalar products account for the whole complex residual. -/
theorem dyadicComplexMultiply_error_le (precision : ℕ) (x y : ℂ) :
    ‖dyadicComplexMultiply precision x y - x * y‖ ≤ 4 / (2 : ℝ) ^ precision := by
  have h := scalarComplexMultiply_error_le_uniform (dyadicScalarMultiply precision)
    (· - ·) (· + ·) (1 / (2 : ℝ) ^ precision) 0 0
    (dyadicScalarMultiply_error_le precision) (by intros; simp) (by intros; simp) x y
  simpa [dyadicComplexMultiply, div_eq_mul_inv] using h

/-- Residual bound for the decoded executable integer product. -/
theorem dyadicMultiply_error_le (precision : ℕ) (x y : DyadicComplex) :
    ‖dyadicDecode precision (dyadicMultiply precision x y) -
      dyadicDecode precision x * dyadicDecode precision y‖ ≤
      4 / (2 : ℝ) ^ precision := by
  rw [dyadicDecode_multiply]
  exact dyadicComplexMultiply_error_le precision _ _

/-- Executable Horner evaluation on stored integer grid coefficients. -/
def dyadicHorner (precision : ℕ) (a : ℕ → DyadicComplex) (δ : DyadicComplex) :
    ℕ → ℕ → DyadicComplex
  | start, 0 => a start
  | start, order + 1 =>
      dyadicAdd (a start) (dyadicMultiply precision δ
        (dyadicHorner precision a δ (start + 1) order))

/-- Every integer Horner call follows the proved decoded operation sequence. -/
theorem dyadicDecode_horner (precision : ℕ) (a : ℕ → DyadicComplex)
    (δ : DyadicComplex) (start order : ℕ) :
    dyadicDecode precision (dyadicHorner precision a δ start order) =
      parameterJetInexactHorner (fun k => dyadicDecode precision (a k))
        (dyadicDecode precision δ) (dyadicComplexMultiply precision) (· + ·) start order := by
  induction order generalizing start with
  | zero => rfl
  | succ order ih =>
    simp only [dyadicHorner, parameterJetInexactHorner, dyadicDecode_add,
      dyadicDecode_multiply, ih]

/-- Uniform primitive bounds discharge all actually executed Horner residuals. -/
theorem dyadicHorner_local_errors (precision : ℕ) (a : ℕ → ℂ) (δ : ℂ)
    (start order : ℕ) :
    parameterJetHornerLocalErrors a δ (dyadicComplexMultiply precision) (· + ·)
      (fun _ => 4 / (2 : ℝ) ^ precision) (fun _ => 0) start order := by
  induction order generalizing start with
  | zero => trivial
  | succ order ih =>
    exact ⟨dyadicComplexMultiply_error_le precision _ _, by simp, ih (start + 1)⟩

/-- Decoded executable Horner error, apart from coefficient discrepancies. -/
theorem dyadicHorner_error_le (precision : ℕ) (a : ℕ → DyadicComplex)
    (δ : DyadicComplex) (Δ : ℝ) (start order : ℕ)
    (hδ : ‖dyadicDecode precision δ‖ ≤ Δ) :
    ‖dyadicDecode precision (dyadicHorner precision a δ start order) -
      parameterJetHorner (fun k => dyadicDecode precision (a k))
        (dyadicDecode precision δ) start order‖ ≤
      parameterJetHornerRoundBudget Δ (fun _ => 4 / (2 : ℝ) ^ precision)
        (fun _ => 0) start order := by
  rw [dyadicDecode_horner]
  exact parameterJetInexactHorner_error_le _ _ _ _ _ _ _ _ _ hδ
    (dyadicHorner_local_errors precision _ _ start order)

end IntMProof
