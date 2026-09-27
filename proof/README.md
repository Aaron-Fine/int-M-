# Lean pilot: E0 and E2

This isolated Lake project implements the E0 orbit algebra and the E2 exact
period criterion in [the proof DAG](../docs/verification/LEAN-PROOF-DAG.md).
The quadratic map is defined over any commutative ring. The period theorem is
about an arbitrary self-map and reuses Mathlib's `Function.minimalPeriod`.

From this directory, with `elan` installed:

```sh
lake update
lake build
lake env lean IntMProof/Axioms.lean
```

The toolchain is Lean `v4.33.1`; `lake-manifest.json` pins the Mathlib commit
and its transitive dependencies. The last command checks the recorded axiom
sets and fails if one changes, including if a `sorryAx` is introduced. The E0
zero-iterate theorem uses no axioms; the successor and addition lemmas use
`[propext, Quot.sound]` and `[propext]`, respectively. E2 uses
`[propext, Classical.choice, Quot.sound]`. There are no project axioms.

The criterion requires `p > 0` and the exact equation `f^[p] x = x`.
The test periods `p / q` use prime divisors `q` of `p`. A small numerical
residual, including one in the component catalog, does not establish that
exact equation. No numerical result or TypeScript classifier behavior is
certified by this pilot.
