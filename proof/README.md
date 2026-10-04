# Lean proof base

This isolated Lake project records the checked roots of the [lightweight proof DAG](../docs/verification/LEAN-PROOF-DAG.md). Lean v4.33.1 and the committed `lake-manifest.json` pin Mathlib and its dependencies.

- **E0 / E2:** The quadratic orbit is defined over any commutative ring. Mathlib's `Function.minimalPeriod` gives an exact-period criterion for every positive candidate: exact return plus no return at a prime quotient, a positive proper divisor, or any earlier positive iterate. The critical-orbit specialization matches the catalog's mathematical divisor condition.
- **E1:** Mathlib's formal polynomial derivative establishes D₀ = 1, Dₙ₊₁ = 2zₙDₙ in the seed variable and Bₙ₊₁ = 2zₙBₙ + 1 in the parameter variable. A varying initial seed contributes its own B₀; a constant seed gives B₀ = 0.
- **M0:** Orbit iteration commutes with ring homomorphisms, injective ring homomorphisms preserve minimal period, and bijective changes of coordinates preserve the minimal period of the transported map. Complex conjugation therefore takes the orbit, exact period, and squared seed-derivative magnitude at `(c,z)` to those at `(conj c, conj z)`. The sign chart transports the map to `w ↦ −w²−c`.
- **V0 / V1:** Two ordered verifier procedures on the _same_ exact rational frame prefix yield the same verdict and entire output record. Refusals preserve the old record. The acceptance and exclusion thresholds are ordered abstractly, and accepted payload fields are opaque.

The model's `Frame` uses rational residual squares and multiplier magnitudes. It does not model nonfinite input, signed zero, floating point rounding, `hypot`, angle/log output, or how the TypeScript lag scan chooses and evaluates frames. Accordingly, these proofs neither certify binary64 period/attraction nor prove the TypeScript implementation refines the Lean model. Retain the existing differential and oracle tests; a future refinement proof must specify an arithmetic error bound and finite-prefix correspondence. Similarly, conjugating a map by an arbitrary chart preserves its transported dynamics, not necessarily the canonical quadratic family or its parameter coordinates.

From this directory, with `elan` installed:

```sh
lake update
lake build
lake env lean IntMProof/Axioms.lean
lake lint
lake exe lint-style
```

`lake update` refreshes the lockfile and should be reviewed and committed deliberately; for routine reproducible checks use the committed manifest without updating. The axiom guards check selected theorems' exact axiom sets and fail if those change, including introduction of `sorryAx`. CI also uses `lean-action`'s namespace-wide axiom audit to catch unchecked declarations. `lake lint` runs Batteries' declaration linter over the project root; `lake exe lint-style` runs Mathlib's text style linters. For a supported automatic style fix, use `lake exe lint-style --fix` and review the resulting diff. Lean/Mathlib does not supply a general semantics-preserving code formatter through these commands; follow the [Mathlib style guide](https://leanprover-community.github.io/contribute/style.html) when editing proofs. Keep declarations documented, name hypotheses and lemmas by mathematical content, prefer existing Mathlib APIs, and rerun build and axiom audit after refactoring.

Mathlib source APIs used here include [periodic points](https://leanprover-community.github.io/mathlib4_docs/Mathlib/Dynamics/PeriodicPts/Defs.html), [polynomial derivatives](https://leanprover-community.github.io/mathlib4_docs/Mathlib/Algebra/Polynomial/Derivative.html), and complex conjugation. The [Mathlib downstream lint guide](https://github.com/leanprover-community/mathlib4/wiki/Setting-up-linting-and-testing-for-your-Lean-project) and [lean-action inputs](https://github.com/leanprover/lean-action/blob/main/action.yml) describe the tooling. The precise imported versions are the pinned files under `.lake/packages/mathlib` after `lake update`.
