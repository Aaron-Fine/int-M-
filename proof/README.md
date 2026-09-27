# Lean pilot: E0 and E2

This isolated Lake project implements the E0 orbit algebra and the E2 exact
period criteria in [the proof DAG](../docs/verification/LEAN-PROOF-DAG.md).
The quadratic map is defined over any commutative ring. The period theorem is
about an arbitrary self-map and reuses Mathlib's `Function.minimalPeriod`.

For any positive candidate `n`, the following are equivalent to
`minimalPeriod f x = n`, provided `f^[n] x = x`:

- No return at `n / q` for any prime divisor `q` of `n`.
- No return at any positive proper divisor of `n`.
- No return at any earlier positive iterate.

The `exactPeriod_iff_closure_and_prime_quotients` and
`exactPeriod_iff_first_return` theorems include the closure equation in their
conclusions. `criticalPeriod_iff_prime_quotients` and
`criticalPeriod_iff_proper_divisors` specialize the criteria to the critical
orbit of `z ↦ z² + c`. These match the **exact arithmetic** specification of
the catalog's all-proper-divisor test.

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
