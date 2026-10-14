# Bounded numerical kernel pilot

## Decision and prior-art check

The next P4 artifact is a research-only binary64 Horner evaluator for one
existing certificate: reference parameter `-1`, critical seed `0`, retained
order `3`, iterations `0..16`, and the closed offset disk `‖δ‖ ≤ 1/256`.
Its job is to check the numerical premises of an existing Lean theorem for
an actual execution. It is not a general floating-point library or a renderer
feature. Stop this batch after the evaluator, exact checks, independent tests,
and documentation are complete.

Primary-source reuse investigation on 2026-10-08:

| Existing work                                                                                                                                                                                      | Useful scope                                                                                                           | Decision for this bounded batch                                                                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [FloatLib](https://github.com/lean-dojo/FloatLib), including [complex semantics](https://github.com/lean-dojo/FloatLib/blob/main/FloatLib/Floats/Formats/BinaryInterchange/Complex/Semantics.lean) | Verified software floating-point arithmetic; four-product complex multiplication semantics under finite-value premises | Do not recreate it. Current [toolchain](https://github.com/lean-dojo/FloatLib/blob/main/lean-toolchain) is Lean 4.34.0, whereas this project pins 4.33.1. Integrating the library and its native-runtime boundary is a separate task. |
| [FloatSpec](https://github.com/Beneficial-AI-Foundation/FloatSpec), including [PrimFloat](https://github.com/Beneficial-AI-Foundation/FloatSpec/blob/main/FloatSpec/src/IEEE754/PrimFloat.lean)    | Flocq-derived floating-point models and modeled primitive correspondences                                              | Current [toolchain](https://github.com/Beneficial-AI-Foundation/FloatSpec/blob/main/lean-toolchain) is 4.34.0-rc2; no direct JavaScript correspondence. No dependency added.                                                          |
| [interval-arithmetic](https://github.com/mauriciopoppe/interval-arithmetic)                                                                                                                        | JavaScript interval operations with outward bounds                                                                     | Broad API and a different arithmetic abstraction; does not supply this project's jet certificate.                                                                                                                                     |
| [robust-predicates](https://github.com/mourner/robust-predicates)                                                                                                                                  | Robust geometric sign tests                                                                                            | Different consumer: orientation and circle/sphere predicates.                                                                                                                                                                         |
| [double-bits](https://github.com/mikolalysenko/double-bits)                                                                                                                                        | Binary64 representation inspection                                                                                     | Native `DataView` provides the required bit access without another package.                                                                                                                                                           |
| Existing project code                                                                                                                                                                              | `complexMultiply`, compensated PoC oracles, Lean coefficient/Horner/truncation contracts                               | Reuse the complex expression and the proved finite disk certificate. Compensated arithmetic alone is not an exact residual audit at subnormal inputs.                                                                                 |

The [ECMAScript numerical specification](https://tc39.es/ecma262/multipage/ecmascript-data-types-and-values.html)
defines Number multiplication and addition using binary double-precision
arithmetic. FloatLib's [native-float guide](https://github.com/lean-dojo/FloatLib/blob/main/site/content/chapters/18-lean-native-floats.md)
also distinguishes modeled software proofs from external native execution.
We retain that distinction. We have not built or audited either external Lean
library and make no library-wide claim about its axioms.

## Smallest useful implementation boundary

1. Freeze four exact integer coefficients per iterate and check their equality
   to the existing Lean coefficient recurrence on the finite horizon.
2. Evaluate with three multiply-then-add Horner steps. Multiplication reuses
   the production `complexMultiply` expression; coefficient addition is
   componentwise, in the order prescribed by `parameterJetInexactHorner`.
3. Decode finite operands and actual results exactly as integer multiples of
   `2^-1074`. Check the complex residual using the sum of absolute real and
   imaginary residuals. Each complex multiply and add must fit `2^-40`.
4. Check disk membership using exact squared coordinates. Refuse invalid
   iteration counts, nonfinite offsets, offsets outside the disk, or failed
   arithmetic checks. Report the error allowance as exact `1/1000000`.

The target parameter is the mathematical sum `-1 + decoded offset`, not an
additional rounded Number sum. Signed zeros have the same real interpretation;
subnormals are decoded exactly. No intended-input conversion error is included.
The returned value approximates an orbit; it does not classify a parameter or
prove that the critical orbit is periodic.

## Trust boundary and exit criteria

Lean checks the coefficient table and the theorem composing exact coefficients,
local Horner residual premises, and truncation. TypeScript performs per-call
exact checks using `DataView` and `BigInt`; their implementation and JavaScript
execution are trusted and tested, not formally verified. A successful result
is called **audited**, keeping this distinction visible in its API.

The exit criteria are a bounded evaluator, exact disk/residual guards,
independent rational-oracle and refusal tests, a completed adversarial
review/update loop, normal project checks, and updated P4 documentation.
No new dependencies, configurable precision/order/anchor, generic interval API,
renderer wiring, tile classification, compiler verification, or performance
claim belongs to this batch. Any production promotion needs a separate measured
consumer and review; J2 and V2 remain open.

## Implementation and validation record

The isolated [evaluator](../../poc/performance/src/numerics/minus-one-jet.ts)
reuses `src/domain/complex.ts`. Its fixed 17-by-4 integer packet matches
[`MinusOneJetKernel.lean`](../../proof/IntMProof/MinusOneJetKernel.lean):
`minusOneJetKernelCoefficient_eq` proves each entry is the exact coefficient;
`minusOneJetKernel_error_le` supplies the conditional total error theorem.
All three new selected axiom guards are imported by the aggregate audit.

The decoder maps each finite Number to an integer in units of `2^-1074`.
For exponent bits `e > 0` and fraction bits `f`, this integer's magnitude is
`(2^52 + f) * 2^(e-1)`; for subnormals it is `f`. The sign bit supplies its sign.
Disk membership compares `re² + im²` with `2^2132`. Complex multiplication
residuals use units of `2^-2148` and a limit of `2^2108`; addition residuals
use units of `2^-1074` and a limit of `2^1034`. All comparisons are BigInt
operations, so the error checker itself does not need floating-point bounds.

This audits the aggregate complex result rather than separately exposing all
six scalar residuals. That directly supplies the existing Horner premise.
The coefficient packet is copied exactly; this pilot does not implement a
binary64 coefficient generator. At most three complex multiplications and
three coefficient additions are evaluated per call. The caller receives either
`audited` with the value and the exact rational allowance, or a stated refusal.

The [eight focused tests](../../poc/performance/src/numerics/minus-one-jet.test.ts)
check the Lean/TypeScript packet parity, binary64 exponent boundaries/signs,
both zeros, subnormals, nonfinite refusal, all iteration boundaries, exact disk
membership, operation order/count, and corrupted multiplication refusal.
The disk test includes `(1/256, Number.MIN_VALUE)`, which is strictly outside
the disk even though a rounded `Math.hypot` returns `1/256`.

An independent oracle decodes numbers via base-two text and performs direct
BigInt rational critical iteration, using neither jets nor the kernel decoder.
Eight dyadic offsets are compared at all 17 horizons (136 executions).
Additional non-grid, tiny-offset and subnormal cases cover the early horizon;
their final-horizon kernel calls are also checked for successful auditing.
These samples validate the implementation; the per-call guards, conditional
Lean theorem, and stated trust boundary determine the numerical claim.

Validated on 2026-10-08:

- Bare `lake build` passed (3183 jobs), including the new packet and aggregate
  axiom guards. `lake lint` and `lake exe lint-style` passed; the optional
  upstream style-exemption file is absent, as in earlier batches.
- The namespace audit inspected 1153 declarations and allowed only `propext`,
  `Classical.choice`, and `Quot.sound`; no `sorryAx` or custom axiom appeared.
- `npm run check` passed formatting, ESLint, all TypeScript configurations,
  catalog/fixture checks, 367 unit tests in 45 files, and the production build.
  Local tools were Node 24.19.0 and npm 11.9.0; npm reported the existing
  package's requested npm 12.1.0 minimum. Package and lockfile are unchanged.
- The independent adversarial review/update loop added threshold witnesses:
  an exact `2^-40` real residual audits, while two `2^-40` component residuals
  refuse. The eight focused tests passed again after this update, and the
  implementation/scope documentation was rereviewed.
- `git diff --check` passed. No production module imports the pilot, and no
  dependency, renderer path, verifier decision, or supported zoom limit changed.
