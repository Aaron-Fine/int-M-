import IntMProof.ParameterJetEvaluation

/-!
# Finite retained coefficient generation contracts (P4)

The decoded complex sequence accumulates convolution terms in ascending order,
starting at zero, then performs both forcing and constant adds, including zero
operands. Constants `c` and `z` are copied exactly. Primitive residuals refer to
actual operands. IEEE validity, decoding discrepancies, and rebasing remain
separate obligations.
-/
namespace IntMProof

/-- Ascending convolution accumulator after `count` terms. -/
def parameterJetConvolution (a : ℕ → ℂ) (mul add : ℂ → ℂ → ℂ) (k : ℕ) : ℕ → ℂ
  | 0 => 0
  | count + 1 => add (parameterJetConvolution a mul add k count)
      (mul (a count) (a (k - count)))

/-- One coefficient update, including both constant adds. -/
def parameterJetCoefficientUpdate (c : ℂ) (a : ℕ → ℂ)
    (mul add : ℂ → ℂ → ℂ) (k : ℕ) : ℂ :=
  add (add (parameterJetConvolution a mul add k (k + 1))
    (if k = 1 then 1 else 0)) (if k = 0 then c else 0)

/-- Inclusive retained generator; later rows reset omitted orders to zero. -/
def parameterJetGeneratedCoefficient (c z : ℂ) (mul add : ℂ → ℂ → ℂ)
    (order : ℕ) : ℕ → ℕ → ℂ
  | 0, k => if k = 0 then z else 0
  | n + 1, k => if k ≤ order then
      parameterJetCoefficientUpdate c (parameterJetGeneratedCoefficient c z mul add order n)
        mul add k else 0

/-- Exact operations recover the sum in the chosen ascending order. -/
theorem parameterJetConvolution_exact (a : ℕ → ℂ) (k count : ℕ) :
    parameterJetConvolution a (· * ·) (· + ·) k count =
      ∑ j ∈ Finset.range count, a j * a (k - j) := by
  induction count with
  | zero => simp [parameterJetConvolution]
  | succ count ih => simp [parameterJetConvolution, ih, Finset.sum_range_succ]

/-- Omitted higher orders do not affect any retained coefficient. -/
theorem parameterJetGeneratedCoefficient_exact (c z : ℂ) (order n k : ℕ)
    (hk : k ≤ order) :
    parameterJetGeneratedCoefficient c z (· * ·) (· + ·) order n k =
      parameterJetCoefficient c z n k := by
  induction n generalizing k with
  | zero => simp [parameterJetGeneratedCoefficient]
  | succ n ih =>
    rw [parameterJetGeneratedCoefficient, if_pos hk, parameterJetCoefficientUpdate,
      parameterJetConvolution_exact, parameterJetCoefficient_succ_range]
    congr 2
    apply Finset.sum_congr rfl
    intro j hj
    have hjk : j ≤ k := by simpa using (Finset.mem_range.mp hj)
    rw [ih j (hjk.trans hk), ih (k - j) ((Nat.sub_le k j).trans hk)]

/-- Caps at the actual products and accumulator additions. -/
def parameterJetConvolutionLocalErrors (a : ℕ → ℂ) (mul add : ℂ → ℂ → ℂ)
    (μ α : ℝ) (k : ℕ) : ℕ → Prop
  | 0 => True
  | count + 1 =>
      parameterJetConvolutionLocalErrors a mul add μ α k count ∧
      ‖mul (a count) (a (k - count)) - a count * a (k - count)‖ ≤ μ ∧
      ‖add (parameterJetConvolution a mul add k count) (mul (a count) (a (k - count))) -
        (parameterJetConvolution a mul add k count + mul (a count) (a (k - count)))‖ ≤ α

/-- Residual obligations include both final additions. -/
def parameterJetCoefficientUpdateLocalErrors (c : ℂ) (a : ℕ → ℂ)
    (mul add : ℂ → ℂ → ℂ) (μ α : ℝ) (k : ℕ) : Prop :=
  let s := parameterJetConvolution a mul add k (k + 1)
  let f : ℂ := if k = 1 then 1 else 0
  let g : ℂ := if k = 0 then c else 0
  parameterJetConvolutionLocalErrors a mul add μ α k (k + 1) ∧
    ‖add s f - (s + f)‖ ≤ α ∧ ‖add (add s f) g - (add s f + g)‖ ≤ α

/-- One product and accumulator-add residual are counted per term. -/
theorem parameterJetConvolution_error_le (a : ℕ → ℂ) (mul add : ℂ → ℂ → ℂ)
    (μ α : ℝ) (k count : ℕ)
    (hlocal : parameterJetConvolutionLocalErrors a mul add μ α k count) :
    ‖parameterJetConvolution a mul add k count -
      ∑ j ∈ Finset.range count, a j * a (k - j)‖ ≤ (count : ℝ) * (μ + α) := by
  induction count with
  | zero => simp [parameterJetConvolution]
  | succ count ih =>
    obtain ⟨hprev, hmul, hadd⟩ := hlocal
    let s := parameterJetConvolution a mul add k count
    let p := mul (a count) (a (k - count))
    let t := ∑ j ∈ Finset.range count, a j * a (k - j)
    have heq : add s p - (t + a count * a (k - count)) =
        (add s p - (s + p)) + (s - t) + (p - a count * a (k - count)) := by ring
    rw [parameterJetConvolution, Finset.sum_range_succ]
    change ‖add s p - (t + a count * a (k - count))‖ ≤ _
    rw [heq]
    calc
      _ ≤ (‖add s p - (s + p)‖ + ‖s - t‖) + ‖p - a count * a (k - count)‖ :=
        (norm_add_le _ _).trans (add_le_add (norm_add_le _ _) le_rfl)
      _ ≤ (α + (count : ℝ) * (μ + α)) + μ :=
        add_le_add (add_le_add hadd (ih hprev)) hmul
      _ = ((count + 1 : ℕ) : ℝ) * (μ + α) := by push_cast; ring

/-- The local defect includes two constant adds even when their operands vanish. -/
theorem parameterJetCoefficientUpdate_error_le (c : ℂ) (a : ℕ → ℂ)
    (mul add : ℂ → ℂ → ℂ) (μ α : ℝ) (k : ℕ)
    (hlocal : parameterJetCoefficientUpdateLocalErrors c a mul add μ α k) :
    ‖parameterJetCoefficientUpdate c a mul add k -
      ((∑ j ∈ Finset.range (k + 1), a j * a (k - j)) +
        (if k = 1 then 1 else 0) + (if k = 0 then c else 0))‖ ≤
      (k + 1 : ℕ) * (μ + α) + 2 * α := by
  obtain ⟨hconv, hf, hg⟩ := hlocal
  let s := parameterJetConvolution a mul add k (k + 1)
  let f : ℂ := if k = 1 then 1 else 0
  let g : ℂ := if k = 0 then c else 0
  let t := ∑ j ∈ Finset.range (k + 1), a j * a (k - j)
  have heq : add (add s f) g - (t + f + g) =
      (add (add s f) g - (add s f + g)) + (add s f - (s + f)) + (s - t) := by ring
  change ‖add (add s f) g - (t + f + g)‖ ≤ _
  rw [heq]
  calc
    _ ≤ (‖add (add s f) g - (add s f + g)‖ + ‖add s f - (s + f)‖) + ‖s - t‖ :=
      (norm_add_le _ _).trans (add_le_add (norm_add_le _ _) le_rfl)
    _ ≤ (α + α) + (k + 1 : ℕ) * (μ + α) :=
      add_le_add (add_le_add hg hf) (parameterJetConvolution_error_le a mul add μ α k _ hconv)
    _ = (k + 1 : ℕ) * (μ + α) + 2 * α := by ring

/-- Inclusive generation discrepancy budget using exact reference caps `B`. -/
def parameterJetGenerationBudget (B ρ : ℕ → ℕ → ℝ) : ℕ → ℕ → ℝ
  | 0, _ => 0
  | n + 1, k => (∑ j ∈ Finset.range (k + 1),
      ((B n j + parameterJetGenerationBudget B ρ n j) *
        parameterJetGenerationBudget B ρ n (k - j) +
      parameterJetGenerationBudget B ρ n j * B n (k - j))) + ρ n k

/-- Product discrepancy from exact operand caps and coefficient error caps. -/
theorem parameterJet_product_error_le (x y a b : ℂ) (Bx By Ex Ey : ℝ)
    (hx : ‖x‖ ≤ Bx) (hy : ‖y‖ ≤ By)
    (ha : ‖a - x‖ ≤ Ex) (hb : ‖b - y‖ ≤ Ey) :
    ‖a * b - x * y‖ ≤ (Bx + Ex) * Ey + Ex * By := by
  have hBx := (norm_nonneg x).trans hx
  have hEx := (norm_nonneg (a - x)).trans ha
  have hanorm : ‖a‖ ≤ Bx + Ex := by
    calc
      ‖a‖ = ‖x + (a - x)‖ := by congr 1; ring
      _ ≤ ‖x‖ + ‖a - x‖ := norm_add_le _ _
      _ ≤ Bx + Ex := add_le_add hx ha
  have heq : a * b - x * y = a * (b - y) + (a - x) * y := by ring
  rw [heq]
  refine (norm_add_le _ _).trans ?_
  rw [Complex.norm_mul, Complex.norm_mul]
  exact add_le_add (mul_le_mul hanorm hb (norm_nonneg _) (add_nonneg hBx hEx))
    (mul_le_mul ha hy (norm_nonneg _) hEx)

/-- Local defect caps at each earlier row of the retained generator. -/
def parameterJetGenerationLocalErrors (c z : ℂ) (mul add : ℂ → ℂ → ℂ)
    (ρ : ℕ → ℕ → ℝ) (order n : ℕ) : Prop :=
  ∀ m < n, ∀ k ≤ order,
    ‖parameterJetCoefficientUpdate c
        (parameterJetGeneratedCoefficient c z mul add order m) mul add k -
      ((∑ j ∈ Finset.range (k + 1),
        parameterJetGeneratedCoefficient c z mul add order m j *
        parameterJetGeneratedCoefficient c z mul add order m (k - j)) +
        (if k = 1 then 1 else 0) + (if k = 0 then c else 0))‖ ≤ ρ m k

/-- Earlier caps and local update defects bound every retained coefficient.
No future cap rows or omitted higher-order coefficients are required. -/
theorem parameterJetGeneratedCoefficient_error_le (c z : ℂ)
    (mul add : ℂ → ℂ → ℂ) (B ρ : ℕ → ℕ → ℝ) (order n k : ℕ)
    (hk : k ≤ order)
    (hB : ∀ m < n, ∀ j ≤ order, ‖parameterJetCoefficient c z m j‖ ≤ B m j)
    (hlocal : parameterJetGenerationLocalErrors c z mul add ρ order n) :
    ‖parameterJetGeneratedCoefficient c z mul add order n k -
      parameterJetCoefficient c z n k‖ ≤ parameterJetGenerationBudget B ρ n k := by
  induction n generalizing k with
  | zero => simp [parameterJetGeneratedCoefficient, parameterJetGenerationBudget]
  | succ n ih =>
    have hBprev : ∀ m < n, ∀ j ≤ order,
        ‖parameterJetCoefficient c z m j‖ ≤ B m j :=
      fun m hm => hB m (Nat.lt_succ_of_lt hm)
    have hlocalprev : parameterJetGenerationLocalErrors c z mul add ρ order n :=
      fun m hm => hlocal m (Nat.lt_succ_of_lt hm)
    let a := parameterJetGeneratedCoefficient c z mul add order n
    let A := parameterJetCoefficient c z n
    let s := (∑ j ∈ Finset.range (k + 1), a j * a (k - j)) +
      (if k = 1 then 1 else 0) + (if k = 0 then c else 0)
    have hs : ‖s - parameterJetCoefficient c z (n + 1) k‖ ≤
        ∑ j ∈ Finset.range (k + 1),
          ((B n j + parameterJetGenerationBudget B ρ n j) *
            parameterJetGenerationBudget B ρ n (k - j) +
          parameterJetGenerationBudget B ρ n j * B n (k - j)) := by
      rw [parameterJetCoefficient_succ_range]
      change ‖((∑ j ∈ Finset.range (k + 1), a j * a (k - j)) +
        (if k = 1 then 1 else 0) + (if k = 0 then c else 0)) -
        ((∑ j ∈ Finset.range (k + 1), A j * A (k - j)) +
        (if k = 1 then 1 else 0) + (if k = 0 then c else 0))‖ ≤ _
      simp only [add_sub_add_right_eq_sub]
      rw [← Finset.sum_sub_distrib]
      refine (norm_sum_le _ _).trans (Finset.sum_le_sum (fun j hj => ?_))
      have hjk : j ≤ k := by simpa using (Finset.mem_range.mp hj)
      have hjorder := hjk.trans hk
      have hright := (Nat.sub_le k j).trans hk
      exact parameterJet_product_error_le (A j) (A (k - j)) (a j) (a (k - j))
        _ _ _ _ (hB n (Nat.lt_succ_self n) j hjorder)
        (hB n (Nat.lt_succ_self n) (k - j) hright)
        (ih j hjorder hBprev hlocalprev) (ih (k - j) hright hBprev hlocalprev)
    rw [parameterJetGeneratedCoefficient, if_pos hk, parameterJetGenerationBudget]
    calc
      _ = ‖(parameterJetCoefficientUpdate c a mul add k - s) +
          (s - parameterJetCoefficient c z (n + 1) k)‖ := by congr 1; ring
      _ ≤ ‖parameterJetCoefficientUpdate c a mul add k - s‖ +
          ‖s - parameterJetCoefficient c z (n + 1) k‖ := norm_add_le _ _
      _ ≤ ρ n k + _ := add_le_add (hlocal n (Nat.lt_succ_self n) k hk) hs
      _ = _ := add_comm _ _

/-- A supplied outward error table can replace the exact recursive budget.
Only initial retained caps and earlier update inequalities are checked. -/
theorem parameterJetGeneratedCoefficient_error_le_enclosure (c z : ℂ)
    (mul add : ℂ → ℂ → ℂ) (B ρ E : ℕ → ℕ → ℝ) (order n k : ℕ)
    (hk : k ≤ order)
    (hB : ∀ m < n, ∀ j ≤ order, ‖parameterJetCoefficient c z m j‖ ≤ B m j)
    (hlocal : parameterJetGenerationLocalErrors c z mul add ρ order n)
    (hinit : ∀ j ≤ order, 0 ≤ E 0 j)
    (hstep : ∀ m < n, ∀ j ≤ order,
      (∑ i ∈ Finset.range (j + 1),
        ((B m i + E m i) * E m (j - i) + E m i * B m (j - i))) + ρ m j ≤
          E (m + 1) j) :
    ‖parameterJetGeneratedCoefficient c z mul add order n k -
      parameterJetCoefficient c z n k‖ ≤ E n k := by
  induction n generalizing k with
  | zero => simpa [parameterJetGeneratedCoefficient] using hinit k hk
  | succ n ih =>
    have hBprev : ∀ m < n, ∀ j ≤ order,
        ‖parameterJetCoefficient c z m j‖ ≤ B m j :=
      fun m hm => hB m (Nat.lt_succ_of_lt hm)
    have hlocalprev : parameterJetGenerationLocalErrors c z mul add ρ order n :=
      fun m hm => hlocal m (Nat.lt_succ_of_lt hm)
    have hstepprev : ∀ m < n, ∀ j ≤ order,
        (∑ i ∈ Finset.range (j + 1),
          ((B m i + E m i) * E m (j - i) + E m i * B m (j - i))) + ρ m j ≤
            E (m + 1) j := fun m hm => hstep m (Nat.lt_succ_of_lt hm)
    let a := parameterJetGeneratedCoefficient c z mul add order n
    let A := parameterJetCoefficient c z n
    let s := (∑ j ∈ Finset.range (k + 1), a j * a (k - j)) +
      (if k = 1 then 1 else 0) + (if k = 0 then c else 0)
    have hs : ‖s - parameterJetCoefficient c z (n + 1) k‖ ≤
        ∑ j ∈ Finset.range (k + 1),
          ((B n j + E n j) *
            E n (k - j) +
          E n j * B n (k - j)) := by
      rw [parameterJetCoefficient_succ_range]
      change ‖((∑ j ∈ Finset.range (k + 1), a j * a (k - j)) +
        (if k = 1 then 1 else 0) + (if k = 0 then c else 0)) -
        ((∑ j ∈ Finset.range (k + 1), A j * A (k - j)) +
        (if k = 1 then 1 else 0) + (if k = 0 then c else 0))‖ ≤ _
      simp only [add_sub_add_right_eq_sub]
      rw [← Finset.sum_sub_distrib]
      refine (norm_sum_le _ _).trans (Finset.sum_le_sum (fun j hj => ?_))
      have hjk : j ≤ k := by simpa using (Finset.mem_range.mp hj)
      have hjorder := hjk.trans hk
      have hright := (Nat.sub_le k j).trans hk
      exact parameterJet_product_error_le (A j) (A (k - j)) (a j) (a (k - j))
        _ _ _ _ (hB n (Nat.lt_succ_self n) j hjorder)
        (hB n (Nat.lt_succ_self n) (k - j) hright)
        (ih j hjorder hBprev hlocalprev hstepprev)
        (ih (k - j) hright hBprev hlocalprev hstepprev)
    rw [parameterJetGeneratedCoefficient, if_pos hk]
    calc
      _ = ‖(parameterJetCoefficientUpdate c a mul add k - s) +
          (s - parameterJetCoefficient c z (n + 1) k)‖ := by congr 1; ring
      _ ≤ ‖parameterJetCoefficientUpdate c a mul add k - s‖ +
          ‖s - parameterJetCoefficient c z (n + 1) k‖ := norm_add_le _ _
      _ ≤ ρ n k + _ := add_le_add (hlocal n (Nat.lt_succ_self n) k hk) hs
      _ = _ + ρ n k := add_comm _ _
      _ ≤ E (n + 1) k := hstep n (Nat.lt_succ_self n) k hk

/-- Actual primitive residual caps supply the propagated local defect table. -/
theorem parameterJetGenerationLocalErrors_of_primitive (c z : ℂ)
    (mul add : ℂ → ℂ → ℂ) (μ α : ℕ → ℕ → ℝ) (order n : ℕ)
    (hprimitive : ∀ m < n, ∀ k ≤ order,
      parameterJetCoefficientUpdateLocalErrors c
        (parameterJetGeneratedCoefficient c z mul add order m) mul add (μ m k) (α m k) k) :
    parameterJetGenerationLocalErrors c z mul add
      (fun m k => (k + 1 : ℕ) * (μ m k + α m k) + 2 * α m k) order n := by
  intro m hm k hk
  exact parameterJetCoefficientUpdate_error_le c _ mul add _ _ k (hprimitive m hm k hk)

/-- Generated coefficients feed the existing evaluation and truncation consumer.
Generation and Horner may use different decoded operation implementations. -/
theorem parameterJetGeneratedHorner_error_le_orbit (c z δ : ℂ)
    (genMul genAdd evalMul evalAdd : ℂ → ℂ → ℂ) (B ρ : ℕ → ℕ → ℝ)
    (Δ : ℝ) (ρMul ρAdd : ℕ → ℝ) (truncation : ℝ) (order n : ℕ)
    (hB : ∀ m < n, ∀ k ≤ order, ‖parameterJetCoefficient c z m k‖ ≤ B m k)
    (hgen : parameterJetGenerationLocalErrors c z genMul genAdd ρ order n)
    (hδ : ‖δ‖ ≤ Δ)
    (heval : parameterJetHornerLocalErrors
      (parameterJetGeneratedCoefficient c z genMul genAdd order n) δ
      evalMul evalAdd ρMul ρAdd 0 order)
    (htrunc : ‖parameterJetApproximation c z δ n order - orbit (c + δ) n z‖ ≤ truncation) :
    ‖parameterJetInexactHorner (parameterJetGeneratedCoefficient c z genMul genAdd order n)
      δ evalMul evalAdd 0 order - orbit (c + δ) n z‖ ≤
      parameterJetHornerRoundBudget Δ ρMul ρAdd 0 order +
        parameterJetCoefficientErrorBudget (parameterJetGenerationBudget B ρ n) Δ order +
        truncation := by
  exact parameterJetInexactHorner_error_le_orbit c z δ _ evalMul evalAdd Δ ρMul ρAdd
    (parameterJetGenerationBudget B ρ n) truncation n order hδ heval
    (fun k hk => parameterJetGeneratedCoefficient_error_le c z genMul genAdd B ρ
      order n k hk hB hgen) htrunc

end IntMProof
