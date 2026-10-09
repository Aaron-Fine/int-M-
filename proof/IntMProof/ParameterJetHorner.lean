import IntMProof.ParameterJetTruncation

/-!
# Horner evaluation contracts for retained parameter jets (P4)

The order is inclusive. The leading coefficient initializes the accumulator,
so order zero performs no multiplication or addition. Inexact operations are
abstract decoded complex operations: their residual caps are hypotheses at
the actual operands, not a floating-point model. Each step multiplies `δ` by
the accumulator, then adds the coefficient to that product. Fused multiply-add
and the scalar operation order inside complex primitives need their own
refinement contracts. Concrete finite validity and decoding remain open.
-/

namespace IntMProof

section Algebra

variable {R : Type*} [CommRing R]

/-- Horner evaluation from `start` through `start + order`, inclusively. -/
def parameterJetHorner (a : ℕ → R) (δ : R) : ℕ → ℕ → R
  | start, 0 => a start
  | start, order + 1 => a start + δ * parameterJetHorner a δ (start + 1) order

/-- Order zero copies its sole coefficient without arithmetic. -/
@[simp] theorem parameterJetHorner_zero (a : ℕ → R) (δ : R) (start : ℕ) :
    parameterJetHorner a δ start 0 = a start := rfl

/-- Exact Horner evaluation is the finite polynomial in the offset. -/
theorem parameterJetHorner_eq_sum (a : ℕ → R) (δ : R) (start order : ℕ) :
    parameterJetHorner a δ start order =
      ∑ k ∈ Finset.range (order + 1), a (start + k) * δ ^ k := by
  induction order generalizing start with
  | zero => simp [parameterJetHorner]
  | succ order ih =>
    rw [parameterJetHorner, ih]
    conv_rhs => rw [Finset.sum_range_succ']
    simp only [Nat.add_zero, pow_zero, mul_one]
    rw [Finset.mul_sum, add_comm (a start)]
    apply congrArg (fun s => s + a start)
    apply Finset.sum_congr rfl
    intro k _
    have hindex : start + 1 + k = start + (k + 1) := by omega
    rw [hindex, pow_succ]
    ring

/-- Exact parameter coefficients evaluated by Horner give the retained jet. -/
theorem parameterJetHorner_eq_approximation (c z δ : R) (n order : ℕ) :
    parameterJetHorner (parameterJetCoefficient c z n) δ 0 order =
      parameterJetApproximation c z δ n order := by
  rw [parameterJetHorner_eq_sum, parameterJetApproximation_eq_sum]
  simp only [Nat.zero_add]

end Algebra

/-- Inexact Horner evaluation with separate multiply and add operations. -/
def parameterJetInexactHorner (a : ℕ → ℂ) (δ : ℂ)
    (mul add : ℂ → ℂ → ℂ) : ℕ → ℕ → ℂ
  | start, 0 => a start
  | start, order + 1 =>
      add (a start) (mul δ (parameterJetInexactHorner a δ mul add (start + 1) order))

/-- The copied leading coefficient needs no operation residual at order zero. -/
@[simp] theorem parameterJetInexactHorner_zero (a : ℕ → ℂ) (δ : ℂ)
    (mul add : ℂ → ℂ → ℂ) (start : ℕ) :
    parameterJetInexactHorner a δ mul add start 0 = a start := rfl

/-- Local residual caps at precisely the operands evaluated by this Horner call. -/
def parameterJetHornerLocalErrors (a : ℕ → ℂ) (δ : ℂ)
    (mul add : ℂ → ℂ → ℂ) (ρMul ρAdd : ℕ → ℝ) : ℕ → ℕ → Prop
  | _, 0 => True
  | start, order + 1 =>
      let next := parameterJetInexactHorner a δ mul add (start + 1) order
      ‖mul δ next - δ * next‖ ≤ ρMul start ∧
      ‖add (a start) (mul δ next) - (a start + mul δ next)‖ ≤ ρAdd start ∧
      parameterJetHornerLocalErrors a δ mul add ρMul ρAdd (start + 1) order

/-- Disk error budget for the multiply and add residuals along Horner evaluation. -/
def parameterJetHornerRoundBudget (Δ : ℝ) (ρMul ρAdd : ℕ → ℝ) : ℕ → ℕ → ℝ
  | _, 0 => 0
  | start, order + 1 =>
      Δ * parameterJetHornerRoundBudget Δ ρMul ρAdd (start + 1) order +
        ρMul start + ρAdd start

/-- The composed Horner error obeys its recursive disk budget.
Coefficient decoding discrepancies are a separate contract. -/
theorem parameterJetInexactHorner_error_le (a : ℕ → ℂ) (δ : ℂ)
    (mul add : ℂ → ℂ → ℂ) (Δ : ℝ) (ρMul ρAdd : ℕ → ℝ)
    (start order : ℕ) (hδ : ‖δ‖ ≤ Δ)
    (hlocal : parameterJetHornerLocalErrors a δ mul add ρMul ρAdd start order) :
    ‖parameterJetInexactHorner a δ mul add start order -
      parameterJetHorner a δ start order‖ ≤
      parameterJetHornerRoundBudget Δ ρMul ρAdd start order := by
  induction order generalizing start with
  | zero => simp [parameterJetInexactHorner, parameterJetHorner,
      parameterJetHornerRoundBudget]
  | succ order ih =>
    obtain ⟨hmul, hadd, hnext⟩ := hlocal
    have herror := ih (start + 1) hnext
    let next := parameterJetInexactHorner a δ mul add (start + 1) order
    let exactNext := parameterJetHorner a δ (start + 1) order
    have hdecompose : add (a start) (mul δ next) - (a start + δ * exactNext) =
        (add (a start) (mul δ next) - (a start + mul δ next)) +
        (mul δ next - δ * next) + δ * (next - exactNext) := by ring
    change ‖add (a start) (mul δ next) - (a start + δ * exactNext)‖ ≤ _
    rw [hdecompose]
    have hprop : ‖δ * (next - exactNext)‖ ≤
        Δ * parameterJetHornerRoundBudget Δ ρMul ρAdd (start + 1) order := by
      rw [Complex.norm_mul]
      exact mul_le_mul hδ herror (norm_nonneg _) ((norm_nonneg δ).trans hδ)
    calc
      _ ≤ (‖add (a start) (mul δ next) - (a start + mul δ next)‖ +
          ‖mul δ next - δ * next‖) + ‖δ * (next - exactNext)‖ :=
        (norm_add_le _ _).trans (add_le_add (norm_add_le _ _) le_rfl)
      _ ≤ (ρAdd start + ρMul start) +
          Δ * parameterJetHornerRoundBudget Δ ρMul ρAdd (start + 1) order :=
        add_le_add (add_le_add hadd hmul) hprop
      _ = parameterJetHornerRoundBudget Δ ρMul ρAdd start (order + 1) := by
        simp only [parameterJetHornerRoundBudget]
        ring

end IntMProof
