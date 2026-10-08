import IntMProof.RationalOrbit
import Mathlib.Analysis.Complex.Norm
import Mathlib.Tactic.Linarith

/-!
# Checkable rational boxes for finite complex orbits

Each bound below is calculated by exact rational operations from its input
box. The step deliberately uses broad square and product bounds, which remain
sound for every complex parameter and seed in the input rectangles. A finite
iteration supplies a kernel-checkable outward enclosure without a numerical
reference orbit or a floating-point backend.
-/

namespace IntMProof

/-- A nonempty rational interval, interpreted over real numbers. -/
structure RationalInterval where
  /-- Inclusive lower endpoint. -/
  lo : ℚ
  /-- Inclusive upper endpoint. -/
  hi : ℚ
  /-- The interval is nonempty. -/
  valid : lo ≤ hi

/-- Real membership in a rational interval. -/
def RationalInterval.contains (I : RationalInterval) (x : ℝ) : Prop :=
  (I.lo : ℝ) ≤ x ∧ x ≤ (I.hi : ℝ)

/-- A rational upper bound on the absolute value of every interval member. -/
def RationalInterval.absUpper (I : RationalInterval) : ℚ :=
  max |I.lo| |I.hi|

/-- A rational lower bound on absolute value, positive when the interval
lies entirely on one side of zero. -/
def RationalInterval.absLower (I : RationalInterval) : ℚ :=
  max 0 (max I.lo (-I.hi))

theorem RationalInterval.absLower_nonneg (I : RationalInterval) :
    0 ≤ I.absLower := by
  exact le_max_left _ _

theorem RationalInterval.absLower_le_abs (I : RationalInterval) (x : ℝ)
    (hx : I.contains x) : (I.absLower : ℝ) ≤ |x| := by
  have hlo : (I.lo : ℝ) ≤ |x| := hx.1.trans (le_abs_self x)
  have hhi : (-(I.hi : ℝ)) ≤ |x| := by
    calc
      -(I.hi : ℝ) ≤ -x := neg_le_neg hx.2
      _ ≤ |x| := neg_le_abs x
  have hmax : max (0 : ℝ) (max (I.lo : ℝ) (-(I.hi : ℝ))) ≤ |x| := by
    exact max_le (abs_nonneg _) (max_le hlo hhi)
  simpa only [RationalInterval.absLower, Rat.cast_max, Rat.cast_zero,
    Rat.cast_neg] using hmax

theorem RationalInterval.absUpper_nonneg (I : RationalInterval) :
    0 ≤ I.absUpper := by
  unfold absUpper
  exact (abs_nonneg _).trans (le_max_left _ _)

theorem RationalInterval.abs_le_absUpper (I : RationalInterval) (x : ℝ)
    (hx : I.contains x) : |x| ≤ (I.absUpper : ℝ) := by
  have hlo : -((I.absUpper : ℚ) : ℝ) ≤ (I.lo : ℝ) := by
    have h : -I.absUpper ≤ I.lo := by
      have hleft : |I.lo| ≤ I.absUpper := le_max_left _ _
      have hneg := (neg_le_abs I.lo).trans hleft
      linarith
    exact_mod_cast h
  have hhi : (I.hi : ℝ) ≤ (I.absUpper : ℝ) := by
    have h : I.hi ≤ I.absUpper :=
      (le_abs_self I.hi).trans (le_max_right _ _)
    exact_mod_cast h
  exact abs_le.mpr ⟨hx.1.trans' hlo, hx.2.trans hhi⟩

theorem RationalInterval.absLower_le_absUpper (I : RationalInterval) :
    I.absLower ≤ I.absUpper := by
  have hmem : I.contains (I.lo : ℝ) := by
    constructor
    · exact le_refl _
    · exact_mod_cast I.valid
  have hlo := I.absLower_le_abs (I.lo : ℝ) hmem
  have hhi := I.abs_le_absUpper (I.lo : ℝ) hmem
  exact_mod_cast hlo.trans hhi

/-- Exact outward subtraction of rational intervals. -/
def rationalIntervalSub (A B : RationalInterval) : RationalInterval :=
  { lo := A.lo - B.hi
    hi := A.hi - B.lo
    valid := by linarith [A.valid, B.valid] }

theorem rationalIntervalSub_sound (A B : RationalInterval) (x y : ℝ)
    (hx : A.contains x) (hy : B.contains y) :
    (rationalIntervalSub A B).contains (x - y) := by
  rcases hx with ⟨hxlo, hxhi⟩
  rcases hy with ⟨hylo, hyhi⟩
  change ((A.lo - B.hi : ℚ) : ℝ) ≤ x - y ∧
    x - y ≤ ((A.hi - B.lo : ℚ) : ℝ)
  push_cast
  constructor <;> linarith

/-- A box with rational real and imaginary coordinate intervals. -/
structure RationalBox where
  /-- Real-coordinate enclosure. -/
  re : RationalInterval
  /-- Imaginary-coordinate enclosure. -/
  im : RationalInterval

/-- A singleton rational-coordinate complex box. -/
def rationalPointBox (z : RationalComplex) : RationalBox :=
  { re := ⟨z.1, z.1, le_refl _⟩
    im := ⟨z.2, z.2, le_refl _⟩ }

/-- Complex membership in a rational coordinate rectangle. -/
def RationalBox.contains (B : RationalBox) (z : ℂ) : Prop :=
  B.re.contains z.re ∧ B.im.contains z.im

/-- Exact outward subtraction of rational complex boxes. -/
def rationalBoxSub (A B : RationalBox) : RationalBox :=
  { re := rationalIntervalSub A.re B.re
    im := rationalIntervalSub A.im B.im }

theorem rationalBoxSub_sound (A B : RationalBox) (x y : ℂ)
    (hx : A.contains x) (hy : B.contains y) :
    (rationalBoxSub A B).contains (x - y) := by
  exact ⟨by simpa [rationalBoxSub, RationalBox.contains, Complex.sub_re] using
      rationalIntervalSub_sound A.re B.re x.re y.re hx.1 hy.1,
    by simpa [rationalBoxSub, RationalBox.contains, Complex.sub_im] using
      rationalIntervalSub_sound A.im B.im x.im y.im hx.2 hy.2⟩

/-- A squared-magnitude upper bound computed entirely in rationals. -/
def RationalBox.normSqUpper (B : RationalBox) : ℚ :=
  B.re.absUpper ^ 2 + B.im.absUpper ^ 2

/-- A rational squared-magnitude lower bound for the whole box. -/
def RationalBox.normSqLower (B : RationalBox) : ℚ :=
  B.re.absLower ^ 2 + B.im.absLower ^ 2

theorem RationalBox.normSq_lower_le (B : RationalBox) (z : ℂ)
    (hz : B.contains z) :
    (B.normSqLower : ℝ) ≤ Complex.normSq z := by
  have hre := B.re.absLower_le_abs z.re hz.1
  have him := B.im.absLower_le_abs z.im hz.2
  have hR : 0 ≤ (B.re.absLower : ℝ) := by exact_mod_cast B.re.absLower_nonneg
  have hI : 0 ≤ (B.im.absLower : ℝ) := by exact_mod_cast B.im.absLower_nonneg
  have hR2 : (B.re.absLower : ℝ) ^ 2 ≤ z.re ^ 2 := by
    simpa only [sq_abs] using (sq_le_sq₀ hR (abs_nonneg z.re)).2 hre
  have hI2 : (B.im.absLower : ℝ) ^ 2 ≤ z.im ^ 2 := by
    simpa only [sq_abs] using (sq_le_sq₀ hI (abs_nonneg z.im)).2 him
  simp only [Complex.normSq_apply, RationalBox.normSqLower]
  push_cast
  linarith

theorem RationalBox.normSq_le_upper (B : RationalBox) (z : ℂ)
    (hz : B.contains z) :
    Complex.normSq z ≤ (B.normSqUpper : ℝ) := by
  have hre := B.re.abs_le_absUpper z.re hz.1
  have him := B.im.abs_le_absUpper z.im hz.2
  have hR : 0 ≤ (B.re.absUpper : ℝ) := by exact_mod_cast B.re.absUpper_nonneg
  have hI : 0 ≤ (B.im.absUpper : ℝ) := by exact_mod_cast B.im.absUpper_nonneg
  have hR2 : z.re ^ 2 ≤ (B.re.absUpper : ℝ) ^ 2 := by
    simpa only [sq_abs] using (sq_le_sq₀ (abs_nonneg z.re) hR).2 hre
  have hI2 : z.im ^ 2 ≤ (B.im.absUpper : ℝ) ^ 2 := by
    simpa only [sq_abs] using (sq_le_sq₀ (abs_nonneg z.im) hI).2 him
  simp only [Complex.normSq_apply, RationalBox.normSqUpper]
  push_cast
  linarith

theorem rationalPointBox_contains (z : RationalComplex) :
    (rationalPointBox z).contains (rationalComplexEmbed z) := by
  simp [RationalBox.contains, RationalInterval.contains, rationalPointBox,
    rationalComplexEmbed]

/-- Exact rational interval step for `z²+c`. The real part uses lower and
upper square bounds for both coordinates, retaining separation when a real
interval stays away from zero. The imaginary part uses `|2xy| ≤ 2XY`. -/
def rationalBoxStep (C Z : RationalBox) : RationalBox :=
  let X := Z.re.absUpper
  let Y := Z.im.absUpper
  let xL := Z.re.absLower
  let yL := Z.im.absLower
  { re := {
      lo := C.re.lo + xL ^ 2 - Y ^ 2
      hi := C.re.hi + X ^ 2 - yL ^ 2
      valid := by
        have hC := C.re.valid
        have hX := Z.re.absLower_le_absUpper
        have hY := Z.im.absLower_le_absUpper
        have hX0 := Z.re.absLower_nonneg
        have hY0 := Z.im.absLower_nonneg
        have hX2 : xL ^ 2 ≤ X ^ 2 := by nlinarith
        have hY2 : yL ^ 2 ≤ Y ^ 2 := by nlinarith
        linarith }
    im := {
      lo := C.im.lo - 2 * X * Y
      hi := C.im.hi + 2 * X * Y
      valid := by
        have hC := C.im.valid
        have hX := Z.re.absUpper_nonneg
        have hY := Z.im.absUpper_nonneg
        nlinarith } }

/-- One rational-box step encloses the exact quadratic image of every point
in the parameter and seed rectangles. -/
theorem rationalBoxStep_sound (C Z : RationalBox) (c z : ℂ)
    (hc : C.contains c) (hz : Z.contains z) :
    (rationalBoxStep C Z).contains (quadratic c z) := by
  let X := Z.re.absUpper
  let Y := Z.im.absUpper
  have hX : 0 ≤ (X : ℝ) := by exact_mod_cast Z.re.absUpper_nonneg
  have hY : 0 ≤ (Y : ℝ) := by exact_mod_cast Z.im.absUpper_nonneg
  have hx := Z.re.abs_le_absUpper z.re hz.1
  have hy := Z.im.abs_le_absUpper z.im hz.2
  have hxl := Z.re.absLower_le_abs z.re hz.1
  have hyl := Z.im.absLower_le_abs z.im hz.2
  have hxL0 : 0 ≤ (Z.re.absLower : ℝ) := by
    exact_mod_cast Z.re.absLower_nonneg
  have hyL0 : 0 ≤ (Z.im.absLower : ℝ) := by
    exact_mod_cast Z.im.absLower_nonneg
  have hxL2 : (Z.re.absLower : ℝ) ^ 2 ≤ z.re ^ 2 := by
    simpa only [sq_abs] using (sq_le_sq₀ hxL0 (abs_nonneg z.re)).2 hxl
  have hyL2 : (Z.im.absLower : ℝ) ^ 2 ≤ z.im ^ 2 := by
    simpa only [sq_abs] using (sq_le_sq₀ hyL0 (abs_nonneg z.im)).2 hyl
  have hx2 : z.re ^ 2 ≤ (X : ℝ) ^ 2 := by
    simpa only [sq_abs] using (sq_le_sq₀ (abs_nonneg z.re) hX).2 hx
  have hy2 : z.im ^ 2 ≤ (Y : ℝ) ^ 2 := by
    simpa only [sq_abs] using (sq_le_sq₀ (abs_nonneg z.im) hY).2 hy
  have hxy : |z.re * z.im| ≤ (X : ℝ) * (Y : ℝ) := by
    rw [abs_mul]
    exact mul_le_mul hx hy (abs_nonneg _) hX
  have hxylo : -(X : ℝ) * (Y : ℝ) ≤ z.re * z.im := by
    have h := (abs_le.mp hxy).1
    nlinarith
  have hxyhi : z.re * z.im ≤ (X : ℝ) * (Y : ℝ) := (abs_le.mp hxy).2
  rcases hc with ⟨hcre, hcim⟩
  rcases hcre with ⟨hcrelo, hcrehi⟩
  rcases hcim with ⟨hcimlo, hcimhi⟩
  constructor
  · constructor
    · change ((C.re.lo + Z.re.absLower ^ 2 - Y ^ 2 : ℚ) : ℝ) ≤
        (quadratic c z).re
      simp only [quadratic, Complex.add_re, Complex.mul_re]
      push_cast
      nlinarith [sq_nonneg z.re]
    · change (quadratic c z).re ≤
        ((C.re.hi + X ^ 2 - Z.im.absLower ^ 2 : ℚ) : ℝ)
      simp only [quadratic, Complex.add_re, Complex.mul_re]
      push_cast
      nlinarith [sq_nonneg z.im]
  · constructor
    · change ((C.im.lo - 2 * X * Y : ℚ) : ℝ) ≤ (quadratic c z).im
      simp only [quadratic, Complex.add_im, Complex.mul_im]
      push_cast
      nlinarith
    · change (quadratic c z).im ≤ ((C.im.hi + 2 * X * Y : ℚ) : ℝ)
      simp only [quadratic, Complex.add_im, Complex.mul_im]
      push_cast
      nlinarith

/-- Doubling a rational complex box, with exact rational endpoints. -/
def rationalBoxDouble (B : RationalBox) : RationalBox :=
  { re := ⟨2 * B.re.lo, 2 * B.re.hi, by linarith [B.re.valid]⟩
    im := ⟨2 * B.im.lo, 2 * B.im.hi, by linarith [B.im.valid]⟩ }

theorem rationalBoxDouble_sound (B : RationalBox) (z : ℂ)
    (hz : B.contains z) :
    (rationalBoxDouble B).contains (2 * z) := by
  rcases hz with ⟨⟨hrelo, hrehi⟩, ⟨himlo, himhi⟩⟩
  simp only [RationalBox.contains, RationalInterval.contains, rationalBoxDouble,
    Complex.mul_re, Complex.mul_im]
  push_cast
  have htwoRe : (2 : ℂ).re = 2 := by norm_num
  have htwoIm : (2 : ℂ).im = 0 := by norm_num
  rw [htwoRe, htwoIm]
  constructor <;> constructor <;> nlinarith

/-- A symmetric rational box for the product of two input boxes. -/
def rationalBoxMul (A B : RationalBox) : RationalBox :=
  let reBound := A.re.absUpper * B.re.absUpper + A.im.absUpper * B.im.absUpper
  let imBound := A.re.absUpper * B.im.absUpper + A.im.absUpper * B.re.absUpper
  { re := ⟨-reBound, reBound, by
      have hA := A.re.absUpper_nonneg
      have hB := B.re.absUpper_nonneg
      have hC := A.im.absUpper_nonneg
      have hD := B.im.absUpper_nonneg
      nlinarith⟩
    im := ⟨-imBound, imBound, by
      have hA := A.re.absUpper_nonneg
      have hB := B.re.absUpper_nonneg
      have hC := A.im.absUpper_nonneg
      have hD := B.im.absUpper_nonneg
      nlinarith⟩ }

theorem rationalBoxMul_sound (A B : RationalBox) (x y : ℂ)
    (hx : A.contains x) (hy : B.contains y) :
    (rationalBoxMul A B).contains (x * y) := by
  let X := A.re.absUpper
  let Y := A.im.absUpper
  let U := B.re.absUpper
  let V := B.im.absUpper
  have hX : 0 ≤ (X : ℝ) := by exact_mod_cast A.re.absUpper_nonneg
  have hY : 0 ≤ (Y : ℝ) := by exact_mod_cast A.im.absUpper_nonneg
  have hU : 0 ≤ (U : ℝ) := by exact_mod_cast B.re.absUpper_nonneg
  have hV : 0 ≤ (V : ℝ) := by exact_mod_cast B.im.absUpper_nonneg
  have hxr := A.re.abs_le_absUpper x.re hx.1
  have hxi := A.im.abs_le_absUpper x.im hx.2
  have hyr := B.re.abs_le_absUpper y.re hy.1
  have hyi := B.im.abs_le_absUpper y.im hy.2
  have hrr : |x.re * y.re| ≤ (X : ℝ) * U := by
    rw [abs_mul]
    exact mul_le_mul hxr hyr (abs_nonneg _) hX
  have hii : |x.im * y.im| ≤ (Y : ℝ) * V := by
    rw [abs_mul]
    exact mul_le_mul hxi hyi (abs_nonneg _) hY
  have hri : |x.re * y.im| ≤ (X : ℝ) * V := by
    rw [abs_mul]
    exact mul_le_mul hxr hyi (abs_nonneg _) hX
  have hir : |x.im * y.re| ≤ (Y : ℝ) * U := by
    rw [abs_mul]
    exact mul_le_mul hxi hyr (abs_nonneg _) hY
  have hre : |(x * y).re| ≤ ((X * U + Y * V : ℚ) : ℝ) := by
    rw [Complex.mul_re]
    push_cast
    exact (abs_sub _ _).trans (add_le_add hrr hii)
  have him : |(x * y).im| ≤ ((X * V + Y * U : ℚ) : ℝ) := by
    rw [Complex.mul_im]
    push_cast
    exact (abs_add_le _ _).trans (add_le_add hri hir)
  push_cast at hre him
  exact ⟨by
      change ((-(X * U + Y * V) : ℚ) : ℝ) ≤ (x * y).re ∧
        (x * y).re ≤ ((X * U + Y * V : ℚ) : ℝ)
      push_cast
      exact abs_le.mp hre,
    by
      change ((-(X * V + Y * U) : ℚ) : ℝ) ≤ (x * y).im ∧
        (x * y).im ≤ ((X * V + Y * U : ℚ) : ℝ)
      push_cast
      exact abs_le.mp him⟩

/-- Rational boxes at every finite iterate, computed by exact recursion. -/
def rationalBoxOrbit (C Z : RationalBox) : ℕ → RationalBox
  | 0 => Z
  | n + 1 => rationalBoxStep C (rationalBoxOrbit C Z n)

/-- Exact rational boxes for the formal seed derivative along every orbit
in the parameter/seed rectangles. -/
def rationalBoxMultiplier (C Z : RationalBox) : ℕ → RationalBox
  | 0 => rationalPointBox (1, 0)
  | n + 1 => rationalBoxMul
      (rationalBoxDouble (rationalBoxOrbit C Z n))
      (rationalBoxMultiplier C Z n)

/-- Computed box for `orbit c n z - z` over both input rectangles. -/
def rationalBoxClosure (C Z : RationalBox) (n : ℕ) : RationalBox :=
  rationalBoxSub (rationalBoxOrbit C Z n) Z

/-- A single rational box computation encloses every exact complex orbit
started from the supplied parameter and seed rectangles. -/
theorem rationalBoxOrbit_sound (C Z : RationalBox) (c z : ℂ)
    (hc : C.contains c) (hz : Z.contains z) (n : ℕ) :
    (rationalBoxOrbit C Z n).contains (orbit c n z) := by
  induction n with
  | zero => simpa [rationalBoxOrbit, orbit_zero] using hz
  | succ n ih =>
    simpa [rationalBoxOrbit, orbit_succ] using rationalBoxStep_sound C
      (rationalBoxOrbit C Z n) c (orbit c n z) hc ih

/-- The computed multiplier box encloses the formal complex seed derivative
for every parameter and seed in the input rectangles. -/
theorem rationalBoxMultiplier_sound (C Z : RationalBox) (c z : ℂ)
    (hc : C.contains c) (hz : Z.contains z) (n : ℕ) :
    (rationalBoxMultiplier C Z n).contains
      ((Polynomial.derivative (seedPolynomial c n)).eval z) := by
  induction n with
  | zero =>
    rw [seedPolynomial_derivative_zero]
    norm_num [rationalBoxMultiplier, rationalPointBox,
      RationalBox.contains, RationalInterval.contains]
  | succ n ih =>
    rw [seedPolynomial_derivative_succ]
    exact rationalBoxMul_sound _ _ _ _
      (rationalBoxDouble_sound _ _ (rationalBoxOrbit_sound C Z c z hc hz n)) ih

/-- Rational lower and upper bounds on every multiplier squared norm in the
rectangle, computed by the derivative-box recurrence. -/
theorem rationalBoxMultiplier_normSq_interval (C Z : RationalBox) (c z : ℂ)
    (hc : C.contains c) (hz : Z.contains z) (n : ℕ) :
    ((rationalBoxMultiplier C Z n).normSqLower : ℝ) ≤
      Complex.normSq ((Polynomial.derivative (seedPolynomial c n)).eval z) ∧
    Complex.normSq ((Polynomial.derivative (seedPolynomial c n)).eval z) ≤
      ((rationalBoxMultiplier C Z n).normSqUpper : ℝ) := by
  have hm := rationalBoxMultiplier_sound C Z c z hc hz n
  exact ⟨RationalBox.normSq_lower_le _ _ hm,
    RationalBox.normSq_le_upper _ _ hm⟩

/-- A rational multiplier-box upper margin certifies attraction below a
positive real cutoff throughout the corresponding parameter and seed box. -/
theorem rationalBoxMultiplier_attract_of_upper (C Z : RationalBox) (c z : ℂ)
    (hc : C.contains c) (hz : Z.contains z) (n : ℕ)
    (q : ℝ) (hq : 0 < q)
    (hupper : ((rationalBoxMultiplier C Z n).normSqUpper : ℝ) < q ^ 2) :
    ‖(Polynomial.derivative (seedPolynomial c n)).eval z‖ < q := by
  have h := (rationalBoxMultiplier_normSq_interval C Z c z hc hz n).2
  rw [Complex.normSq_eq_norm_sq] at h
  nlinarith [norm_nonneg ((Polynomial.derivative (seedPolynomial c n)).eval z)]

/-- A rational multiplier-box lower margin certifies failure of the strict
attraction comparison throughout the box. -/
theorem rationalBoxMultiplier_not_attract_of_lower (C Z : RationalBox) (c z : ℂ)
    (hc : C.contains c) (hz : Z.contains z) (n : ℕ)
    (q : ℝ)
    (hlower : q ^ 2 ≤
      ((rationalBoxMultiplier C Z n).normSqLower : ℝ)) :
    ¬ ‖(Polynomial.derivative (seedPolynomial c n)).eval z‖ < q := by
  have h := (rationalBoxMultiplier_normSq_interval C Z c z hc hz n).1
  rw [Complex.normSq_eq_norm_sq] at h
  intro hlt
  nlinarith [norm_nonneg ((Polynomial.derivative (seedPolynomial c n)).eval z)]


/-- A wholly calculated rational upper bound for the squared closure
residual on the entire parameter and seed rectangle. -/
theorem rationalBoxClosure_normSq_le (C Z : RationalBox) (c z : ℂ)
    (hc : C.contains c) (hz : Z.contains z) (n : ℕ) :
    Complex.normSq (orbit c n z - z) ≤
      ((rationalBoxClosure C Z n).normSqUpper : ℝ) := by
  apply RationalBox.normSq_le_upper
  exact rationalBoxSub_sound (rationalBoxOrbit C Z n) Z
    (orbit c n z) z (rationalBoxOrbit_sound C Z c z hc hz n) hz

/-- The same exact box calculation gives a lower squared-residual bound,
needed to exclude shorter divisors uniformly. -/
theorem rationalBoxClosure_normSq_ge (C Z : RationalBox) (c z : ℂ)
    (hc : C.contains c) (hz : Z.contains z) (n : ℕ) :
    ((rationalBoxClosure C Z n).normSqLower : ℝ) ≤
      Complex.normSq (orbit c n z - z) := by
  apply RationalBox.normSq_lower_le
  exact rationalBoxSub_sound (rationalBoxOrbit C Z n) Z
    (orbit c n z) z (rationalBoxOrbit_sound C Z c z hc hz n) hz

/-- The exact rational orbit is contained in boxes computed from its exact
rational parameter and seed, linking this interval calculation to the
existing rational-orbit model. -/
theorem rationalBoxOrbit_contains_rationalOrbit
    (c z : RationalComplex) (n : ℕ) :
    (rationalBoxOrbit (rationalPointBox c) (rationalPointBox z) n).contains
      (rationalComplexEmbed (rationalOrbit c n z)) := by
  rw [rationalOrbit_embed]
  exact rationalBoxOrbit_sound (rationalPointBox c) (rationalPointBox z)
    (rationalComplexEmbed c) (rationalComplexEmbed z)
    (rationalPointBox_contains c) (rationalPointBox_contains z) n

end IntMProof
