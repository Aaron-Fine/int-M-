# Phase 2 Lean proof DAG

**Status:** scoped proof obligations; no Lean declarations in this document are claimed checked.  
**Consumer:** [performance mathematics](../PERFORMANCE-MATHEMATICS.md) and [implementation status](../PERFORMANCE-PLAN.md) on the Phase 2 branch.

This is a small, consumer-driven graph of mathematical statements that could justify specific classifier experiments. A node is a theorem or explicitly conditional contract. An arrow means the target needs the source as a mathematical prerequisite. Code links, tests, and benchmark gates are tracked separately; they are **not** proof edges.

## Rooted graph

```mermaid
flowchart TD
  E0["E0 Iterate algebra"] --> E1["E1 Derivative recurrences"]
  E2["E2 Exact period criterion"]
  E0 --> V0["V0 Exact verifier model"]
  E2 --> V0
  V0 --> V1["V1 Shared prefix equivalence"]
  E1 --> G0["G0 Cycle continuation"]
  E0 --> G1["G1 Parameter error bound"]
  G0 --> G2["G2 Transplant proposal contract"]
  G1 --> G2
  V0 --> G2
  E1 --> L0["L0 Return map disk certificate"]
  E2 --> L1["L1 Basin entry and primitive period"]
  L0 --> L1
  V0 --> L1
  G1 --> J0["J0 Uniform parameter box bounds"]
  L0 --> J0
  J0 --> J1["J1 Uniform block verdict"]
  L1 --> J1
  V0 --> J1
```

The **pilot root** is E2: prove one generic exact-period theorem using Mathlib's periodic-point API. V1 is the first performance-facing target. G, L, and J are optional branches selected when the corresponding experiment needs a stronger guarantee. This graph is intentionally not a path toward Mandelbrot local connectivity.

## Nodes and proof boundaries

| ID | Lean-facing statement or obligation | Direct consumer | State |
| --- | --- | --- | --- |
| E0 | Define `f c z = z² + c`, `orbit c n z = (f c)^[n] z`; establish zero iterate, successor, and iterate addition. | Every subsequent node | Specified |
| E1 | For a return orbit, `D₀ = 1`, `Dₙ₊₁ = 2 zₙ Dₙ`; for the critical orbit's parameter derivative, `B₀ = 0`, `Bₙ₊₁ = 2 zₙ Bₙ + 1`. State the starting point explicitly: for a varying cycle seed, `B₀` differs. | G0, L0, multiplier contract | Specified |
| E2 | If `p > 0` and `f^[p] x = x`, then `minimalPeriod f x = p` iff `f^[(p/q)] x ≠ x` for every prime divisor `q` of `p`. Audit `p = 0`, existence of a prime divisor, and division assumptions. | Exact primitivity; optional center catalog | Pilot |
| V0 | Define a pure, exact-arithmetic model of closure, ordered proper-divisor reduction, multiplier, and a three-way accept/ambiguous/exclude policy **with abstract ordered thresholds**. Its verdict is a model of [verifier.ts](../../src/domain/verifier.ts), not a certificate that its floating thresholds imply true closure. | V1, G2, L1, J1 | Specified |
| V1 | Given equal orbit prefixes, candidate period, thresholds, and initial result record, the inlined lag-scan verifier and common verifier model produce the same verdict and accepted fields; a refusal leaves the record untouched. Factor out finite-value checks as an explicit precondition or separately modeled decision. | [orbit.ts](../../src/domain/orbit.ts) versus [verifier.ts](../../src/domain/verifier.ts) | First implementation target |
| G0 | For `Fₚ(z,c)=f_c^[p](z)-z`, an exact periodic point with `λ=(f_c^[p])'(z) ≠ 1` admits a local branch `z*(c)` with derivative `∂c f_c^[p](z)/(1-λ)`. Choose a consistent cycle phase. | Adjacent-pixel transplantation G | Conditional |
| G1 | If `eₙ = orbit (c+δ) n z - orbit c n z` with the same initial seed, then `eₙ₊₁ = 2 zₙ eₙ + eₙ² + δ`. Derive an inductive absolute bound from explicit orbit and parameter bounds. A varying seed needs its own `e₀`. | G and later J | Conditional |
| G2 | Under a region bound keeping `|1-λ|` away from zero and a quantified higher-order remainder, bound predictor error for G0; a corrected seed is a **candidate** until V0 adjudicates it. A proof of local continuation alone does not prove the existing `guardDisplacement = 0.01` safe. | [transplant PoC](../../poc/performance/src/kernels/transplant.ts) | Conditional |
| L0 | For return map `g=f_c^[p]`, a closed disk `D(a,r)` is mapped into itself and is contractive if a validated bound `sup_D |g'| ≤ q < 1` and `|g(a)-a| + qr ≤ r` hold. Prove existence and uniqueness of a fixed point in the disk and `|λ| ≤ q`. | Trap-radius early acceptance L | Research |
| L1 | Prove that the critical orbit enters the L0 disk (or state an explicit entry precondition); establish the claimed **primitive** period or return unresolved. Distinguish a return-map fixed point from an attracting cycle selected by the critical orbit. | [trap PoC](../../poc/performance/src/kernels/trap.ts) | Research |
| J0 | Extend G1 and L0 inequalities uniformly over a parameter rectangle using outward interval/ball enclosures, including all intermediate iterates and derivative bounds. | Rigorous subdivision J | Research |
| J1 | If every parameter in a rectangle satisfies the same certified classification and period hypotheses, propagate that status over the block; otherwise subdivide or run the per-pixel verifier. Matching sampled corners is insufficient. | Rigorous block fill J | Research |

**Edges are proof prerequisites, not statements of current implementation.** A V1 proof concerns a mathematical model of two verifier paths; a refinement argument plus differential tests must still connect that model to TypeScript. E2 concerns **exact equality** and cannot turn a binary64 residual smaller than `1e-8` into a proof of exact period. L0/L1/J0/J1 would require genuine outward enclosures to justify a certified result; the current double-double oracle is a floating reference.

## Execution order and gates

1. **Pilot:** pin a Lean/mathlib toolchain in an isolated `proof/` Lake project when implementation begins. Prove E0 and E2 against existing `Function.IsPeriodicPt`/`minimalPeriod` APIs. Record the precise Lean statement, toolchain and Mathlib revisions, source, and `#print axioms` output. Evaluate proof cost and whether a consumer actually uses the result before expanding.
2. **Verifier:** formalize only the minimal V0 decision procedure and prove V1 for the shared prefix. State where TypeScript finite checks, signed zero, NaN, infinity, and rounding cross the abstraction boundary. Preserve the existing differential/oracle tests for actual code.
3. **Transplantation (G):** use E1, G0, and G1 to replace the heuristic guard with a *stated* bound, or retain the guard as a proposal filter. Keep Newton correction and V0 separate.
4. **Trap (L):** advance only after disk inclusion, contraction, critical-orbit entry, and primitive-period obligations can all be expressed with computable enclosures.
5. **Subdivision (J):** advance only if a uniform box certificate is both sound and cheaper than the pixels it replaces.

H (period algebra and center generation) is a separate **optional** consumer of E2: the generator currently tests all proper divisors with numerical residuals in [generate_catalog.py](../../tools/generate_catalog.py). It needs its own symbolic polynomial/division and root-enclosure obligations before any claim about enumerated centers becomes certified. Candidate ordering, checkpoint scheduling, SIMD, worker bands, and browser latency do not gain a useful guarantee from this Lean DAG.

## Evidence and status discipline

For each implemented node, record: ID, exact Lean declaration, natural-language claim, prerequisite IDs, source or derivation, Lean/mathlib commit, status (`specified`, `proved`, `conditional`, or `blocked`), admitted axioms, and the consuming code/test. Run a root-specific axiom check in CI after a Lean root exists; fail on `sorryAx` and unexpected project axioms. Never label a node proved from a green test or a graph edge inferred from text.

[kirill-kondrashov/mlc](https://github.com/kirill-kondrashov/mlc) is the model for **rooted declaration graphs and explicit axiom-frontier checks**: its [graph script](https://github.com/kirill-kondrashov/mlc/blob/main/scripts/generate_dependency_graph_site.py) derives textual usage edges, while [check_axioms.lean](https://github.com/kirill-kondrashov/mlc/blob/main/check_axioms.lean) checks the semantic axiom frontier. Its root theorem remains conditional on two named mathematical axioms; its local-connectivity modules and graph UI are outside this project's proof scope. This document's edges are reviewed mathematical obligations. If a declaration graph is later generated automatically, label inferred edges as such and use Lean's checked imports and axiom report as authority.

The release boundary remains: **formal theorem → mathematical contract → numerical implementation → floating-point error/differential tests → target-browser benchmarks**. The [Phase 2 status](../PERFORMANCE-PLAN.md) still keeps the legacy scan as default pending Stage A evidence; proof work does not waive that gate.
