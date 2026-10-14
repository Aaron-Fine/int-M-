import IntMProof.ParameterJetRecursiveBound

/-!
# Finite outward tables for parameter jets (P4)

Caller-supplied real tables can enclose the recursive retained-coefficient and
error budgets by satisfying finitely many outward inequalities. Only indices
through the specified horizon and retained orders are needed. The contracts
do not identify any floating-point implementation with these real tables.
-/

namespace IntMProof

/-- A finite outward coefficient table encloses the exact recursive budgets.
Table index `k` bounds coefficient order `k + 1`, so retain `k < order`. -/
theorem parameterJetCoefficientBudget_le_enclosure
    (radius : ℕ → ℝ) (cap : ℕ → ℕ → ℝ) (n order : ℕ)
    (hr : ∀ j < n, 0 ≤ radius j)
    (hc : ∀ j ≤ n, ∀ k < order, 0 ≤ cap j k)
    (hlinear : ∀ j < n, 0 < order →
      2 * radius j * cap j 0 + 1 ≤ cap (j + 1) 0)
    (hhigher : ∀ j < n, ∀ k, k + 1 < order →
      2 * radius j * cap j (k + 1) +
        ∑ ij ∈ Finset.antidiagonal k, cap j ij.1 * cap j ij.2 ≤ cap (j + 1) (k + 1)) :
    ∀ k < order, parameterJetCoefficientBudget radius n k ≤ cap n k := by
  induction n with
  | zero => intro k hk; simpa using hc 0 le_rfl k hk
  | succ n ih =>
    have hprefix : ∀ j < n, 0 ≤ radius j := fun j hj => hr j (by omega)
    have hcaps : ∀ j ≤ n, ∀ k < order, 0 ≤ cap j k :=
      fun j hj k hk => hc j (by omega) k hk
    have hbudget := ih hprefix hcaps (fun j hj => hlinear j (by omega))
      (fun j hj => hhigher j (by omega))
    intro k hk
    have hmult : 0 ≤ 2 * radius n := mul_nonneg zero_le_two (hr n (by omega))
    cases k with
    | zero =>
      rw [parameterJetCoefficientBudget_linear_succ]
      exact (add_le_add (mul_le_mul_of_nonneg_left (hbudget 0 hk) hmult) le_rfl).trans
        (hlinear n (by omega) hk)
    | succ k =>
      rw [parameterJetCoefficientBudget_higher_succ]
      refine (add_le_add (mul_le_mul_of_nonneg_left (hbudget (k + 1) hk) hmult)
        (Finset.sum_le_sum (fun ij hij => ?_))).trans (hhigher n (by omega) k hk)
      have hsum : ij.1 + ij.2 = k := Finset.mem_antidiagonal.mp hij
      have hi : ij.1 < order := by omega
      have hj : ij.2 < order := by omega
      exact mul_le_mul (hbudget ij.1 hi) (hbudget ij.2 hj)
        (parameterJetCoefficientBudget_nonneg radius n ij.2 hprefix)
        (hc n (by omega) ij.1 hi)

/-- A finite outward error sequence encloses the exact P3 recurrence. -/
theorem errorBudget_le_enclosure
    (ε : ℝ) (radius forcing upper : ℕ → ℝ) (n : ℕ)
    (hε : 0 ≤ ε) (hinit : ε ≤ upper 0)
    (hr : ∀ j < n, 0 ≤ radius j) (hf : ∀ j < n, 0 ≤ forcing j)
    (hstep : ∀ j < n,
      2 * radius j * upper j + upper j ^ 2 + forcing j ≤ upper (j + 1)) :
    errorBudget ε radius forcing n ≤ upper n := by
  induction n with
  | zero => exact hinit
  | succ n ih =>
    have hprefix : ∀ j < n, 0 ≤ radius j := fun j hj => hr j (by omega)
    have hforcing : ∀ j < n, 0 ≤ forcing j := fun j hj => hf j (by omega)
    have hb := ih hprefix hforcing (fun j hj => hstep j (by omega))
    have hnonneg := errorBudget_nonneg ε radius forcing n hε hprefix hforcing
    rw [errorBudget_succ]
    refine (add_le_add (add_le_add
      (mul_le_mul_of_nonneg_left hb (mul_nonneg zero_le_two (hr n (by omega)))) ?_)
      le_rfl).trans (hstep n (by omega))
    exact pow_le_pow_left₀ hnonneg hb 2

/-- Local retained-product forcing computed from an outward coefficient table. -/
def parameterJetEnclosureForcing (cap : ℕ → ℕ → ℝ) (Δ : ℝ) (n order : ℕ) : ℝ :=
  (∑ ij ∈ parameterJetDiscardedPairs order,
    cap n (ij.1 - 1) * cap n (ij.2 - 1) * Δ ^ (ij.1 + ij.2)) +
    if order = 0 then Δ else 0

/-- An order-zero outward table still budgets the discarded parameter offset. -/
@[simp] theorem parameterJetEnclosureForcing_zero
    (cap : ℕ → ℕ → ℝ) (Δ : ℝ) (n : ℕ) :
    parameterJetEnclosureForcing cap Δ n 0 = Δ := by
  have hp : parameterJetDiscardedPairs 0 = ∅ := by decide
  simp [parameterJetEnclosureForcing, hp]

/-- Only retained positive-order entries occur in the outward forcing. -/
theorem parameterJetRecursiveForcing_le_enclosure
    (radius : ℕ → ℝ) (cap : ℕ → ℕ → ℝ) (Δ : ℝ) (n order : ℕ)
    (hr : ∀ j < n, 0 ≤ radius j) (hΔ : 0 ≤ Δ)
    (hc : ∀ k < order, parameterJetCoefficientBudget radius n k ≤ cap n k) :
    parameterJetRecursiveForcing radius Δ n order ≤
      parameterJetEnclosureForcing cap Δ n order := by
  unfold parameterJetRecursiveForcing parameterJetEnclosureForcing
  apply add_le_add _ le_rfl
  apply Finset.sum_le_sum
  intro ij hij
  obtain ⟨hip, hjp⟩ := parameterJetDiscardedPairs_positive order ij hij
  have hmem := (mem_parameterJetDiscardedPairs order ij).mp hij
  have hi : ij.1 - 1 < order := by omega
  have hj : ij.2 - 1 < order := by omega
  have hb₁ := parameterJetCoefficientBudget_nonneg radius n (ij.1 - 1) hr
  have hb₂ := parameterJetCoefficientBudget_nonneg radius n (ij.2 - 1) hr
  exact mul_le_mul_of_nonneg_right
    (mul_le_mul (hc _ hi) (hc _ hj) hb₂ (hb₁.trans (hc _ hi))) (pow_nonneg hΔ _)

/-- Nonnegative retained table entries give nonnegative local forcing. -/
theorem parameterJetEnclosureForcing_nonneg
    (cap : ℕ → ℕ → ℝ) (Δ : ℝ) (n order : ℕ)
    (hΔ : 0 ≤ Δ) (hc : ∀ k < order, 0 ≤ cap n k) :
    0 ≤ parameterJetEnclosureForcing cap Δ n order := by
  unfold parameterJetEnclosureForcing
  apply add_nonneg
  · apply Finset.sum_nonneg
    intro ij hij
    obtain ⟨hip, hjp⟩ := parameterJetDiscardedPairs_positive order ij hij
    have hmem := (mem_parameterJetDiscardedPairs order ij).mp hij
    exact mul_nonneg (mul_nonneg (hc _ (by omega)) (hc _ (by omega))) (pow_nonneg hΔ _)
  · split_ifs <;> positivity

/-- Outward coefficient, parameter-shift, and final-error tables certify a
finite disk. All checks involve retained orders and the stated finite horizon.
The certificate says nothing about rounded jet evaluation. -/
theorem parameterJetApproximation_error_le_enclosure
    (c z δ : ℂ) (radius : ℕ → ℝ) (cap : ℕ → ℕ → ℝ)
    (shift upper : ℕ → ℝ) (Δ : ℝ) (n order : ℕ)
    (hδ : ‖δ‖ ≤ Δ) (hr : ∀ j < n, ‖orbit c j z‖ ≤ radius j)
    (hc : ∀ j ≤ n, ∀ k < order, 0 ≤ cap j k)
    (hlinear : ∀ j < n, 0 < order →
      2 * radius j * cap j 0 + 1 ≤ cap (j + 1) 0)
    (hhigher : ∀ j < n, ∀ k, k + 1 < order →
      2 * radius j * cap j (k + 1) +
        ∑ ij ∈ Finset.antidiagonal k, cap j ij.1 * cap j ij.2 ≤ cap (j + 1) (k + 1))
    (hshift0 : 0 ≤ shift 0)
    (hshift : ∀ j < n,
      2 * radius j * shift j + shift j ^ 2 + Δ ≤ shift (j + 1))
    (hupper0 : 0 ≤ upper 0)
    (hupper : ∀ j < n,
      2 * (radius j + shift j) * upper j + upper j ^ 2 +
        parameterJetEnclosureForcing cap Δ j order ≤ upper (j + 1)) :
    ‖parameterJetApproximation c z δ n order - orbit (c + δ) n z‖ ≤ upper n := by
  have hΔ : 0 ≤ Δ := (norm_nonneg _).trans hδ
  have hrpos : ∀ j < n, 0 ≤ radius j := fun j hj => (norm_nonneg _).trans (hr j hj)
  have hshiftbound (j : ℕ) (hj : j ≤ n) :
      errorBudget 0 radius (fun _ => Δ) j ≤ shift j := by
    apply errorBudget_le_enclosure 0 radius (fun _ => Δ) shift j (by rfl) hshift0
    · exact fun k hk => hrpos k (by omega)
    · exact fun _ _ => hΔ
    · exact fun k hk => hshift k (by omega)
  have hshiftpos : ∀ j ≤ n, 0 ≤ shift j := by
    intro j hj
    exact (errorBudget_nonneg 0 radius (fun _ => Δ) j (by rfl)
      (fun k hk => hrpos k (by omega)) (fun _ _ => hΔ)).trans (hshiftbound j hj)
  have hforcingpos : ∀ j < n, 0 ≤ parameterJetEnclosureForcing cap Δ j order :=
    fun j hj => parameterJetEnclosureForcing_nonneg cap Δ j order hΔ (hc j (by omega))
  have herror := inexactOrbit_error_le_budget (c + δ) z
    (fun j => parameterJetApproximation c z δ j order) 0
    (fun j => radius j + shift j) (fun j => parameterJetEnclosureForcing cap Δ j order) n
  have henclosure :
      errorBudget 0 (fun j => radius j + shift j)
        (fun j => parameterJetEnclosureForcing cap Δ j order) n ≤ upper n := by
    apply errorBudget_le_enclosure 0 (fun j => radius j + shift j)
      (fun j => parameterJetEnclosureForcing cap Δ j order) upper n (by rfl) hupper0
    · exact fun j hj => add_nonneg (hrpos j hj) (hshiftpos j (by omega))
    · exact hforcingpos
    · exact hupper
  apply LE.le.trans (herror ?_ ?_ ?_) henclosure
  · simp [parameterJetApproximation_eq_sum, parameterJetCoefficient_initial]
  · intro j hj
    have hparam : ‖(c + δ) - c‖ ≤ Δ := by simpa using hδ
    have hshiftactual := orbit_norm_sub_le_budget c (c + δ) z z 0 Δ radius j
      (by simp) hparam (fun k hk => hr k (hk.trans hj))
    exact (norm_le_insert' (orbit (c + δ) j z) (orbit c j z)).trans
      (add_le_add (hr j hj) (hshiftactual.trans (hshiftbound j (by omega))))
  · intro j hj
    apply (parameterJetApproximation_residual_le_recursive_forcing c z δ radius Δ j order hδ
      (fun k hk => hr k (hk.trans hj))).trans
    apply parameterJetRecursiveForcing_le_enclosure radius cap Δ j order
      (fun k hk => hrpos k (hk.trans hj)) hΔ
    apply parameterJetCoefficientBudget_le_enclosure radius cap j order
    · exact fun k hk => hrpos k (hk.trans hj)
    · exact fun k hk => hc k (by omega)
    · exact fun k hk => hlinear k (hk.trans hj)
    · exact fun k hk => hhigher k (hk.trans hj)

end IntMProof
