import IntMProof.ParameterJetEvaluation

/-!
# A finite exact coefficient packet for the minus-one Horner kernel

The literal packet contains orders zero through three for iterations zero
through sixteen. Its entries are exact integers, rather than coefficient caps.
The error theorem remains conditional on residual bounds for the actual decoded
Horner operations. It does not model IEEE754 or JavaScript execution, and its
target parameter uses exactly the offset supplied to the evaluator.
-/

namespace IntMProof

/-- Exact retained coefficients of the critical orbit at parameter minus one,
with one row for each iteration zero through sixteen. -/
def minusOneJetKernelRows : List (List ℤ) :=
  [
    [0, 0, 0, 0],
    [-1, 1, 0, 0],
    [0, -1, 1, 0],
    [-1, 1, 1, -2],
    [0, -1, -1, 6],
    [-1, 1, 1, 2],
    [0, -1, -1, -2],
    [-1, 1, 1, 2],
    [0, -1, -1, -2],
    [-1, 1, 1, 2],
    [0, -1, -1, -2],
    [-1, 1, 1, 2],
    [0, -1, -1, -2],
    [-1, 1, 1, 2],
    [0, -1, -1, -2],
    [-1, 1, 1, 2],
    [0, -1, -1, -2]
  ]

/-- Index the finite packet, returning zero outside its certified domain.
Correctness is asserted only for `n ≤ 16` and `k ≤ 3`. -/
def minusOneJetKernelCoefficient (n k : ℕ) : ℤ :=
  (minusOneJetKernelRows.getD n []).getD k 0

/-- The packet satisfies the retained exact convolution on its finite domain. -/
theorem minusOneJetKernelCoefficient_succ (n k : ℕ)
    (hn : n < 16) (hk : k ≤ 3) :
    (minusOneJetKernelCoefficient (n + 1) k : ℂ) =
      (∑ j ∈ Finset.range (k + 1),
        (minusOneJetKernelCoefficient n j : ℂ) *
          (minusOneJetKernelCoefficient n (k - j) : ℂ)) +
      (if k = 1 then 1 else 0) + (if k = 0 then (-1 : ℂ) else 0) := by
  interval_cases n <;> interval_cases k <;>
    norm_num [minusOneJetKernelCoefficient, minusOneJetKernelRows, Finset.sum_range_succ]

/-- Every retained literal is the exact fixed-seed parameter coefficient. -/
theorem minusOneJetKernelCoefficient_eq (n : ℕ) (hn : n ≤ 16) :
    ∀ k ≤ 3, (minusOneJetKernelCoefficient n k : ℂ) =
      parameterJetCoefficient (-1) 0 n k := by
  induction n with
  | zero =>
    intro k hk
    interval_cases k <;> simp [minusOneJetKernelCoefficient, minusOneJetKernelRows]
  | succ n ih =>
    intro k hk
    have hn' : n ≤ 16 := by omega
    calc
      (minusOneJetKernelCoefficient (n + 1) k : ℂ) =
          (∑ j ∈ Finset.range (k + 1),
            (minusOneJetKernelCoefficient n j : ℂ) *
              (minusOneJetKernelCoefficient n (k - j) : ℂ)) +
          (if k = 1 then 1 else 0) + (if k = 0 then (-1 : ℂ) else 0) :=
        minusOneJetKernelCoefficient_succ n k (by omega) hk
      _ = (∑ j ∈ Finset.range (k + 1),
            parameterJetCoefficient (-1) 0 n j *
              parameterJetCoefficient (-1) 0 n (k - j)) +
          (if k = 1 then 1 else 0) + (if k = 0 then (-1 : ℂ) else 0) := by
        congr 2
        apply Finset.sum_congr rfl
        intro j hj
        have hj' : j ≤ 3 := by
          have := Finset.mem_range.mp hj
          omega
        rw [ih hn' j hj', ih hn' (k - j) (by omega)]
      _ = parameterJetCoefficient (-1) 0 (n + 1) k :=
        (parameterJetCoefficient_succ_range (-1 : ℂ) 0 n k).symm

/-- The finite exact packet evaluates within the established disk allowance
when every actual decoded multiplication and addition residual fits `2⁻⁴⁰`.
The supplied offset itself defines the target orbit; binary64 semantics and
conversion from a different intended input are separate obligations. -/
theorem minusOneJetKernel_error_le
    (δ : ℂ) (mul add : ℂ → ℂ → ℂ) (n : ℕ)
    (hn : n ≤ 16) (hδ : ‖δ‖ ≤ (1 / 256 : ℝ))
    (hlocal : parameterJetHornerLocalErrors
      (fun k => (minusOneJetKernelCoefficient n k : ℂ)) δ mul add
      (fun _ => (1 / 1099511627776 : ℝ)) (fun _ => (1 / 1099511627776 : ℝ)) 0 3) :
    ‖parameterJetInexactHorner (fun k => (minusOneJetKernelCoefficient n k : ℂ))
      δ mul add 0 3 - orbit (-1 + δ) n 0‖ ≤ (1 / 1000000 : ℝ) := by
  apply minusOneJet_inexactHorner_error_le δ
    (fun k => (minusOneJetKernelCoefficient n k : ℂ)) mul add n hn hδ hlocal
  intro k hk
  rw [minusOneJetKernelCoefficient_eq n hn k hk, sub_self, norm_zero]
  norm_num

end IntMProof
