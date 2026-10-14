import IntMProof.Rebase
import IntMProof.PerturbationBound

/-!
# Conditional arithmetic-error budgets (P3, prerequisite for J0)

A caller supplies bounds for each reference radius and local residual. The
comparison covers an inexact orbit, including a reconstructed reference and
delta. It does not derive residual bounds for binary64 operations or implement
a glitch rule. Bounds are valid only on the supplied finite prefix.
-/

namespace IntMProof

/-- Comparison with a separate reference radius and forcing budget per step. -/
def errorBudget (ε : ℝ) (radius forcing : ℕ → ℝ) : ℕ → ℝ
  | 0 => ε
  | n + 1 =>
      2 * radius n * errorBudget ε radius forcing n
        + errorBudget ε radius forcing n ^ 2 + forcing n

/-- The error budget begins with the supplied initial error. -/
theorem errorBudget_zero (ε : ℝ) (radius forcing : ℕ → ℝ) :
    errorBudget ε radius forcing 0 = ε := rfl

/-- One step of the varying-radius error budget. -/
theorem errorBudget_succ (ε : ℝ) (radius forcing : ℕ → ℝ) (n : ℕ) :
    errorBudget ε radius forcing (n + 1) =
      2 * radius n * errorBudget ε radius forcing n
        + errorBudget ε radius forcing n ^ 2 + forcing n := rfl

/-- Constant radii and forcing recover the existing perturbation comparison. -/
theorem errorBudget_const (ε M Δ : ℝ) (n : ℕ) :
    errorBudget ε (fun _ => M) (fun _ => Δ) n = perturbationBound ε M Δ n := by
  induction n with
  | zero => rfl
  | succ n ih => simp only [errorBudget_succ, perturbationBound_succ, ih]

/-- A nonnegative initial budget, radius, and forcing give nonnegative budgets
through the stated prefix. No hypotheses beyond that prefix are needed. -/
theorem errorBudget_nonneg (ε : ℝ) (radius forcing : ℕ → ℝ) (n : ℕ)
    (hε : 0 ≤ ε) (hr : ∀ k < n, 0 ≤ radius k) (hf : ∀ k < n, 0 ≤ forcing k) :
    0 ≤ errorBudget ε radius forcing n := by
  induction n with
  | zero => exact hε
  | succ n ih =>
    have hb := ih (fun k hk => hr k (Nat.lt_succ_of_lt hk))
      (fun k hk => hf k (Nat.lt_succ_of_lt hk))
    rw [errorBudget_succ]
    exact add_nonneg
      (add_nonneg (mul_nonneg (mul_nonneg zero_le_two (hr n (Nat.lt_succ_self n))) hb)
        (sq_nonneg _)) (hf n (Nat.lt_succ_self n))

/-- Comparison of one quadratic error step on nonnegative inputs. -/
private theorem errorStep_mono {w M e b : ℝ} (hM : 0 ≤ M) (he : 0 ≤ e)
    (heb : e ≤ b) (hw : w ≤ M) :
    2 * w * e + e ^ 2 ≤ 2 * M * b + b ^ 2 := by
  have hb : 0 ≤ b := he.trans heb
  have hlin := mul_le_mul_of_nonneg_right
    (mul_le_mul_of_nonneg_left hw zero_le_two) he
  have hlin' := mul_le_mul_of_nonneg_left heb (mul_nonneg zero_le_two hM)
  have hsq : e ^ 2 ≤ b ^ 2 := by
    rw [sq_le_sq, abs_of_nonneg he, abs_of_nonneg hb]
    exact heb
  exact add_le_add (hlin.trans hlin') hsq

/-- A local residual bound controls one error step against an exact orbit. -/
theorem inexactOrbit_error_succ (c : ℂ) (z : ℂ) (approx : ℕ → ℂ) (n : ℕ) :
    ‖approx (n + 1) - orbit c (n + 1) z‖ ≤
      2 * ‖orbit c n z‖ * ‖approx n - orbit c n z‖
        + ‖approx n - orbit c n z‖ ^ 2
        + ‖approx (n + 1) - quadratic c (approx n)‖ := by
  have halgebra : approx (n + 1) - orbit c (n + 1) z =
      2 * orbit c n z * (approx n - orbit c n z)
        + (approx n - orbit c n z) ^ 2
        + (approx (n + 1) - quadratic c (approx n)) := by
    rw [orbit_succ]
    simp only [quadratic]
    ring
  rw [halgebra]
  calc
    _ ≤ ‖2 * orbit c n z * (approx n - orbit c n z)
        + (approx n - orbit c n z) ^ 2‖
        + ‖approx (n + 1) - quadratic c (approx n)‖ := norm_add_le _ _
    _ ≤ (‖2 * orbit c n z * (approx n - orbit c n z)‖
        + ‖(approx n - orbit c n z) ^ 2‖)
        + ‖approx (n + 1) - quadratic c (approx n)‖ :=
      add_le_add (norm_add_le _ _) le_rfl
    _ = _ := by rw [Complex.norm_mul, Complex.norm_mul, Complex.norm_two, Complex.norm_pow]

/-- Any inexact quadratic sequence obeys the supplied finite-prefix error
budget. The caller must justify every radius and local residual bound. -/
theorem inexactOrbit_error_le_budget (c z : ℂ) (approx : ℕ → ℂ)
    (ε : ℝ) (radius forcing : ℕ → ℝ) (n : ℕ)
    (hε : ‖approx 0 - z‖ ≤ ε)
    (hr : ∀ k < n, ‖orbit c k z‖ ≤ radius k)
    (hf : ∀ k < n, ‖approx (k + 1) - quadratic c (approx k)‖ ≤ forcing k) :
    ‖approx n - orbit c n z‖ ≤ errorBudget ε radius forcing n := by
  induction n with
  | zero => simpa only [orbit_zero, errorBudget_zero] using hε
  | succ n ih =>
    have hb := ih (fun k hk => hr k (Nat.lt_succ_of_lt hk))
      (fun k hk => hf k (Nat.lt_succ_of_lt hk))
    have hrn := hr n (Nat.lt_succ_self n)
    have hfn := hf n (Nat.lt_succ_self n)
    have hM := (norm_nonneg _).trans hrn
    calc
      _ ≤ 2 * ‖orbit c n z‖ * ‖approx n - orbit c n z‖
          + ‖approx n - orbit c n z‖ ^ 2
          + ‖approx (n + 1) - quadratic c (approx n)‖ :=
        inexactOrbit_error_succ c z approx n
      _ ≤ 2 * radius n * errorBudget ε radius forcing n
          + errorBudget ε radius forcing n ^ 2 + forcing n :=
        add_le_add (errorStep_mono hM (norm_nonneg _) hb hrn) hfn
      _ = _ := (errorBudget_succ ε radius forcing n).symm

/-- Reference-step, delta-step, and parameter-offset errors add to the
residual of the reconstructed target step. -/
theorem reconstruction_residual (c cRef ref delta nextRef nextDelta offset : ℂ) :
    (nextRef + nextDelta) - quadratic c (ref + delta) =
      (nextRef - quadratic cRef ref)
        + (nextDelta - (2 * ref * delta + delta ^ 2 + offset))
        + (offset - (c - cRef)) := by
  simp only [quadratic]
  ring

/-- Separate bounds on reference, delta, and parameter errors bound the
reconstructed local residual. Budget values are caller-supplied. -/
theorem reconstruction_residual_norm_le
    (c cRef ref delta nextRef nextDelta offset : ℂ) (ρR ρD ρC : ℝ)
    (hR : ‖nextRef - quadratic cRef ref‖ ≤ ρR)
    (hD : ‖nextDelta - (2 * ref * delta + delta ^ 2 + offset)‖ ≤ ρD)
    (hC : ‖offset - (c - cRef)‖ ≤ ρC) :
    ‖(nextRef + nextDelta) - quadratic c (ref + delta)‖ ≤ ρR + ρD + ρC := by
  rw [reconstruction_residual]
  exact (norm_add_le _ _).trans
    (add_le_add ((norm_add_le _ _).trans (add_le_add hR hD)) hC)

/-- A rounded rebase may add a new delta-evaluation error; an exact rebase
has zero such error, even when the reference values themselves are inexact. -/
theorem rebase_error_norm_le (oldRef newRef delta roundedDelta target : ℂ)
    (ε ρ : ℝ) (hold : ‖oldRef + delta - target‖ ≤ ε)
    (hround : ‖roundedDelta - rebaseDelta oldRef newRef delta‖ ≤ ρ) :
    ‖newRef + roundedDelta - target‖ ≤ ε + ρ := by
  have hstate : newRef + roundedDelta - target =
      (oldRef + delta - target) +
        (roundedDelta - rebaseDelta oldRef newRef delta) := by
    simp only [rebaseDelta]
    ring
  rw [hstate]
  exact (norm_add_le _ _).trans (add_le_add hold hround)

/-- Increasing the initial, radius, and forcing budgets cannot decrease the
resulting comparison. Only the stated prefix needs ordered budgets. -/
theorem errorBudget_mono (ε₀ ε₁ : ℝ) (radius₀ radius₁ forcing₀ forcing₁ : ℕ → ℝ)
    (n : ℕ) (hε₀ : 0 ≤ ε₀) (hε : ε₀ ≤ ε₁)
    (hr₀ : ∀ k < n, 0 ≤ radius₀ k) (hf₀ : ∀ k < n, 0 ≤ forcing₀ k)
    (hr : ∀ k < n, radius₀ k ≤ radius₁ k)
    (hf : ∀ k < n, forcing₀ k ≤ forcing₁ k) :
    errorBudget ε₀ radius₀ forcing₀ n ≤ errorBudget ε₁ radius₁ forcing₁ n := by
  induction n with
  | zero => exact hε
  | succ n ih =>
    have hbudget := ih (fun k hk => hr₀ k (Nat.lt_succ_of_lt hk))
      (fun k hk => hf₀ k (Nat.lt_succ_of_lt hk))
      (fun k hk => hr k (Nat.lt_succ_of_lt hk))
      (fun k hk => hf k (Nat.lt_succ_of_lt hk))
    have hn := Nat.lt_succ_self n
    have hnonneg := errorBudget_nonneg ε₀ radius₀ forcing₀ n hε₀
      (fun k hk => hr₀ k (Nat.lt_succ_of_lt hk))
      (fun k hk => hf₀ k (Nat.lt_succ_of_lt hk))
    rw [errorBudget_succ, errorBudget_succ]
    exact add_le_add
      (errorStep_mono ((hr₀ n hn).trans (hr n hn)) hnonneg hbudget (hr n hn))
      (hf n hn)

/-- A parameter and seed region shares one varying-radius orbit enclosure.
The assumptions may be reused for every point in a rectangle enclosed by
these norm bounds; no corner sampling is used. Derivatives are not enclosed. -/
theorem orbit_norm_sub_le_budget (c₀ c₁ z₀ z₁ : ℂ) (ε Δ : ℝ)
    (radius : ℕ → ℝ) (n : ℕ) (hseed : ‖z₁ - z₀‖ ≤ ε)
    (hparam : ‖c₁ - c₀‖ ≤ Δ) (hr : ∀ k < n, ‖orbit c₀ k z₀‖ ≤ radius k) :
    ‖orbit c₁ n z₁ - orbit c₀ n z₀‖ ≤ errorBudget ε radius (fun _ => Δ) n := by
  apply inexactOrbit_error_le_budget c₀ z₀ (fun k => orbit c₁ k z₁)
    ε radius (fun _ => Δ) n
  · simpa only [orbit_zero] using hseed
  · exact hr
  · intro k _
    have hres : orbit c₁ (k + 1) z₁ - quadratic c₀ (orbit c₁ k z₁) = c₁ - c₀ := by
      rw [orbit_succ]
      simp only [quadratic]
      ring
    rw [hres]
    exact hparam

/-- Reference and delta sequences inherit one error bound when their local
residuals and parameter offset error are separately budgeted. -/
theorem reconstruction_error_le_budget
    (c cRef z offset : ℂ) (ref delta : ℕ → ℂ) (ε : ℝ)
    (radius ρR ρD ρC : ℕ → ℝ) (n : ℕ)
    (hε : ‖ref 0 + delta 0 - z‖ ≤ ε)
    (hr : ∀ k < n, ‖orbit c k z‖ ≤ radius k)
    (hR : ∀ k < n, ‖ref (k + 1) - quadratic cRef (ref k)‖ ≤ ρR k)
    (hD : ∀ k < n,
      ‖delta (k + 1) - (2 * ref k * delta k + delta k ^ 2 + offset)‖ ≤ ρD k)
    (hC : ∀ k < n, ‖offset - (c - cRef)‖ ≤ ρC k) :
    ‖ref n + delta n - orbit c n z‖ ≤
      errorBudget ε radius (fun k => ρR k + ρD k + ρC k) n := by
  apply inexactOrbit_error_le_budget c z (fun k => ref k + delta k)
    ε radius (fun k => ρR k + ρD k + ρC k) n hε hr
  intro k hk
  exact reconstruction_residual_norm_le c cRef (ref k) (delta k)
    (ref (k + 1)) (delta (k + 1)) offset (ρR k) (ρD k) (ρC k)
    (hR k hk) (hD k hk) (hC k hk)

/-- A post-rebase segment retains its absolute index. Supply its updated
initial error (including rebase rounding) and the remaining local budgets. -/
theorem inexactOrbit_error_le_budget_from (c z : ℂ) (approx : ℕ → ℂ)
    (ε : ℝ) (radius forcing : ℕ → ℝ) (start n : ℕ)
    (hε : ‖approx start - orbit c start z‖ ≤ ε)
    (hr : ∀ k < n, ‖orbit c (start + k) z‖ ≤ radius k)
    (hf : ∀ k < n,
      ‖approx (start + (k + 1)) - quadratic c (approx (start + k))‖ ≤ forcing k) :
    ‖approx (start + n) - orbit c (start + n) z‖ ≤
      errorBudget ε radius forcing n := by
  have hbound := inexactOrbit_error_le_budget c (orbit c start z)
    (fun k => approx (start + k)) ε radius forcing n
  simp only [Nat.add_zero, ← orbit_add] at hbound
  exact hbound hε hr hf

/-- An approximate critical iterate and its certified error budget can prove
actual disk entry, providing the hypothesis used by L1's return contraction.
The radius margin must include the whole error budget. -/
theorem critical_mem_closedBall_of_error_budget (c z₀ : ℂ) (approx : ℕ → ℂ)
    (ε r : ℝ) (radius forcing : ℕ → ℝ) (n : ℕ)
    (hε : ‖approx 0‖ ≤ ε)
    (hr : ∀ k < n, ‖orbit c k 0‖ ≤ radius k)
    (hf : ∀ k < n, ‖approx (k + 1) - quadratic c (approx k)‖ ≤ forcing k)
    (hentry : ‖approx n - z₀‖ + errorBudget ε radius forcing n ≤ r) :
    orbit c n 0 ∈ Metric.closedBall z₀ r := by
  have herror := inexactOrbit_error_le_budget c 0 approx ε radius forcing n
    (by simpa only [sub_zero] using hε) hr hf
  rw [Metric.mem_closedBall, dist_eq_norm]
  calc
    ‖orbit c n 0 - z₀‖ ≤ ‖orbit c n 0 - approx n‖ + ‖approx n - z₀‖ :=
      by
        have hsplit : orbit c n 0 - z₀ =
            (orbit c n 0 - approx n) + (approx n - z₀) := by ring
        rw [hsplit]
        exact norm_add_le _ _
    _ ≤ errorBudget ε radius forcing n + ‖approx n - z₀‖ :=
      add_le_add (by rwa [norm_sub_rev]) le_rfl
    _ ≤ r := by rwa [add_comm] at hentry

end IntMProof
