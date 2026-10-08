import IntMProof.ErrorBudget
import Mathlib.Tactic.Linarith

/-!
# Enclosures centered on an inexact stored reference (P3, J0)

The radius inputs bound the stored values, not an unknown exact orbit.
Each stored step has a supplied residual bound at the reference parameter.
The forcing budget includes both that residual and the parameter gap.
Only the finite prefix used by a conclusion needs certification.
-/

namespace IntMProof

/-- Error around a stored reference with parameter gap `Δ` and local
reference residual bounds `residual`. -/
def storedOrbitError (ε Δ : ℝ) (radius residual : ℕ → ℝ) (n : ℕ) : ℝ :=
  errorBudget ε radius (fun k => Δ + residual k) n

/-- The stored-reference enclosure starts with the seed/reference gap. -/
theorem storedOrbitError_zero (ε Δ : ℝ) (radius residual : ℕ → ℝ) :
    storedOrbitError ε Δ radius residual 0 = ε := rfl

/-- Parameter uncertainty and the reference residual contribute at each step. -/
theorem storedOrbitError_succ (ε Δ : ℝ) (radius residual : ℕ → ℝ) (n : ℕ) :
    storedOrbitError ε Δ radius residual (n + 1) =
      2 * radius n * storedOrbitError ε Δ radius residual n +
        storedOrbitError ε Δ radius residual n ^ 2 + (Δ + residual n) := rfl

/-- Nonnegative supplied budgets give a nonnegative stored-reference error. -/
theorem storedOrbitError_nonneg (ε Δ : ℝ) (radius residual : ℕ → ℝ) (n : ℕ)
    (hε : 0 ≤ ε) (hΔ : 0 ≤ Δ) (hr : ∀ k < n, 0 ≤ radius k)
    (hρ : ∀ k < n, 0 ≤ residual k) : 0 ≤ storedOrbitError ε Δ radius residual n := by
  exact errorBudget_nonneg ε radius (fun k => Δ + residual k) n hε hr
    (fun k hk => add_nonneg hΔ (hρ k hk))

/-- Enlarging certified inputs preserves the enclosure direction. -/
theorem storedOrbitError_mono (ε₀ ε₁ Δ₀ Δ₁ : ℝ)
    (radius₀ radius₁ residual₀ residual₁ : ℕ → ℝ) (n : ℕ)
    (hε₀ : 0 ≤ ε₀) (hΔ₀ : 0 ≤ Δ₀) (hε : ε₀ ≤ ε₁) (hΔ : Δ₀ ≤ Δ₁)
    (hr₀ : ∀ k < n, 0 ≤ radius₀ k) (hρ₀ : ∀ k < n, 0 ≤ residual₀ k)
    (hr : ∀ k < n, radius₀ k ≤ radius₁ k)
    (hρ : ∀ k < n, residual₀ k ≤ residual₁ k) :
    storedOrbitError ε₀ Δ₀ radius₀ residual₀ n ≤
      storedOrbitError ε₁ Δ₁ radius₁ residual₁ n := by
  exact errorBudget_mono ε₀ ε₁ radius₀ radius₁
    (fun k => Δ₀ + residual₀ k) (fun k => Δ₁ + residual₁ k) n hε₀ hε hr₀
    (fun k hk => add_nonneg hΔ₀ (hρ₀ k hk)) hr
    (fun k hk => add_le_add hΔ (hρ k hk))

/-- One exact target step differs from the stored step by the quadratic
error, parameter gap, and stored reference residual. -/
theorem storedReference_error_succ (cRef c z : ℂ) (reference : ℕ → ℂ) (n : ℕ) :
    ‖orbit c (n + 1) z - reference (n + 1)‖ ≤
      2 * ‖reference n‖ * ‖orbit c n z - reference n‖ +
        ‖orbit c n z - reference n‖ ^ 2 +
        (‖c - cRef‖ + ‖reference (n + 1) - quadratic cRef (reference n)‖) := by
  have halgebra : orbit c (n + 1) z - reference (n + 1) =
      (2 * reference n * (orbit c n z - reference n) +
        (orbit c n z - reference n) ^ 2) +
        ((c - cRef) - (reference (n + 1) - quadratic cRef (reference n))) := by
    rw [orbit_succ]
    simp only [quadratic]
    ring
  rw [halgebra]
  calc
    _ ≤ (‖2 * reference n * (orbit c n z - reference n)‖ +
          ‖(orbit c n z - reference n) ^ 2‖) +
          (‖c - cRef‖ + ‖reference (n + 1) - quadratic cRef (reference n)‖) :=
      (norm_add_le _ _).trans (add_le_add (norm_add_le _ _) (norm_sub_le _ _))
    _ = _ := by
      rw [Complex.norm_mul, Complex.norm_mul, Complex.norm_two, Complex.norm_pow]

/-- The target is enclosed using radii of stored values and stored-step
residuals. No exact reference-orbit radius is assumed. -/
theorem orbit_sub_storedReference_le_budget (cRef c z : ℂ) (reference : ℕ → ℂ)
    (ε Δ : ℝ) (radius residual : ℕ → ℝ) (n : ℕ)
    (hε : ‖z - reference 0‖ ≤ ε) (hparam : ‖c - cRef‖ ≤ Δ)
    (hr : ∀ k < n, ‖reference k‖ ≤ radius k)
    (hρ : ∀ k < n, ‖reference (k + 1) - quadratic cRef (reference k)‖ ≤ residual k) :
    ‖orbit c n z - reference n‖ ≤ storedOrbitError ε Δ radius residual n := by
  induction n with
  | zero => simpa only [orbit_zero, storedOrbitError_zero] using hε
  | succ n ih =>
    have hb := ih (fun k hk => hr k (Nat.lt_succ_of_lt hk))
      (fun k hk => hρ k (Nat.lt_succ_of_lt hk))
    have hn := Nat.lt_succ_self n
    have hrad := hr n hn
    have he := norm_nonneg (orbit c n z - reference n)
    have hbudget := he.trans hb
    have hsq : ‖orbit c n z - reference n‖ ^ 2 ≤
        storedOrbitError ε Δ radius residual n ^ 2 := by
      rw [sq_le_sq, abs_of_nonneg he, abs_of_nonneg hbudget]
      exact hb
    have hlin := mul_le_mul (mul_le_mul_of_nonneg_left hrad zero_le_two) hb he
      (mul_nonneg zero_le_two ((norm_nonneg _).trans hrad))
    rw [storedOrbitError_succ]
    exact (storedReference_error_succ cRef c z reference n).trans
      (add_le_add (add_le_add hlin hsq) (add_le_add hparam (hρ n hn)))

/-- Absolute orbit radius from a stored-value radius and its error budget. -/
def storedOrbitRadius (ε Δ : ℝ) (radius residual : ℕ → ℝ) (n : ℕ) : ℝ :=
  radius n + storedOrbitError ε Δ radius residual n

/-- Nonnegative stored radii and budgets yield a nonnegative absolute radius. -/
theorem storedOrbitRadius_nonneg (ε Δ : ℝ) (radius residual : ℕ → ℝ) (n : ℕ)
    (hε : 0 ≤ ε) (hΔ : 0 ≤ Δ) (hr : ∀ k ≤ n, 0 ≤ radius k)
    (hρ : ∀ k < n, 0 ≤ residual k) : 0 ≤ storedOrbitRadius ε Δ radius residual n := by
  exact add_nonneg (hr n le_rfl)
    (storedOrbitError_nonneg ε Δ radius residual n hε hΔ
      (fun k hk => hr k (Nat.le_of_lt hk)) hρ)

/-- The endpoint stored-value radius is needed for an absolute orbit bound;
the error recurrence itself only uses radii before that endpoint. -/
theorem orbit_norm_le_storedOrbitRadius (cRef c z : ℂ) (reference : ℕ → ℂ)
    (ε Δ : ℝ) (radius residual : ℕ → ℝ) (n : ℕ)
    (hε : ‖z - reference 0‖ ≤ ε) (hparam : ‖c - cRef‖ ≤ Δ)
    (hr : ∀ k ≤ n, ‖reference k‖ ≤ radius k)
    (hρ : ∀ k < n, ‖reference (k + 1) - quadratic cRef (reference k)‖ ≤ residual k) :
    ‖orbit c n z‖ ≤ storedOrbitRadius ε Δ radius residual n := by
  have herr := orbit_sub_storedReference_le_budget cRef c z reference ε Δ radius residual n
    hε hparam (fun k hk => hr k (Nat.le_of_lt hk)) hρ
  have hsplit : orbit c n z = reference n + (orbit c n z - reference n) := by ring
  calc
    _ ≤ ‖reference n‖ + ‖orbit c n z - reference n‖ := by
      conv_lhs => rw [hsplit]
      exact norm_add_le _ _
    _ ≤ storedOrbitRadius ε Δ radius residual n := add_le_add (hr n le_rfl) herr

/-- A seed disk adds its radius to the stored initial-center error. -/
theorem seed_sub_storedReference_zero_le (z₀ z : ℂ) (reference : ℕ → ℂ) (r ε : ℝ)
    (hseed : ‖z - z₀‖ ≤ r) (hinit : ‖z₀ - reference 0‖ ≤ ε) :
    ‖z - reference 0‖ ≤ r + ε := by
  have hsplit : z - reference 0 = (z - z₀) + (z₀ - reference 0) := by ring
  rw [hsplit]
  exact (norm_add_le _ _).trans (add_le_add hseed hinit)

/-- A stored-reference segment after a checkpoint or rebase retains the
absolute orbit index. Its initial allowance must include conversion error. -/
theorem orbit_sub_storedReference_le_budget_from (cRef c z : ℂ) (reference : ℕ → ℂ)
    (ε Δ : ℝ) (radius residual : ℕ → ℝ) (start n : ℕ)
    (hε : ‖orbit c start z - reference start‖ ≤ ε) (hparam : ‖c - cRef‖ ≤ Δ)
    (hr : ∀ k < n, ‖reference (start + k)‖ ≤ radius k)
    (hρ : ∀ k < n,
      ‖reference (start + (k + 1)) - quadratic cRef (reference (start + k))‖ ≤ residual k) :
    ‖orbit c (start + n) z - reference (start + n)‖ ≤
      storedOrbitError ε Δ radius residual n := by
  have hbound := orbit_sub_storedReference_le_budget cRef c (orbit c start z)
    (fun k => reference (start + k)) ε Δ radius residual n
  simp only [Nat.add_zero, ← orbit_add] at hbound
  exact hbound hε hparam hr hρ

end IntMProof
