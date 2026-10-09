# Bounded period-two verifier correctness pilot

**Scope:** A research-only executable certificate for finite binary64
parameters satisfying `|Re(c)+1| <= 2^-32` and `|Im(c)| <= 2^-32`, critical
seed zero, and proposed period two. The target is the exact decoded parameter,
not an intended decimal coordinate or a separately rounded `-1 + offset`.

This closes the [first executable proof slice](PHASE-3-PROOF-PROGRAM.md#first-executable-proof-slice)
through an executable certificate and a checked conditional Lean bridge.
The JavaScript decoder, BigInt checker, and correspondence with production
source remain trusted and tested. This is not a formal proof of TypeScript,
the compiler, or a JavaScript engine. No general arithmetic library, new
dependency, production integration, performance claim, or zoom change is added.
The [earlier numerical-kernel prior-art decision](NUMERICAL-KERNEL-PILOT.md)
still applies; this pilot reuses its decoder rather than starting another
floating-point implementation.

## Checked decision bridge

[`PeriodTwoVerifierPilot.lean`](../../proof/IntMProof/PeriodTwoVerifierPilot.lean)
strengthens the existing exact rational tile margins:

| Quantity                                  | Exact bound      | Allowed computed discrepancy |
| ----------------------------------------- | ---------------- | ---------------------------- |
| One-step divisor residual square          | At least `1/2`   | At most `10^-12`             |
| Two-step candidate residual square        | At most `10^-18` | At most `10^-18`             |
| Critical-seed return multiplier magnitude | Zero             | Must remain exactly zero     |

Decoded machine policy cutoffs must satisfy `acceptSquared >= 10^-17`,
`excludeSquared <= 10^-11`, `acceptSquared < excludeSquared`, and
`attractUpper > 0`. These inequalities leave substantial slack: the candidate
square is at most `2 * 10^-18`; the divisor square is at least
`1/2 - 10^-12`.

`periodTwoVerifierPilot_residual_margins` supplies the exact tile bounds.
`periodTwoVerifierPilot_audited_accepts` proves that the audited discrepancies
and decoded cutoff margins imply acceptance with period two by both V0 and
V1. Its conclusion includes the complete record with supplied provenance and
frame payload. It preserves that payload; it does not prove the mathematical
accuracy of arbitrary payload fields. Selected axiom guards are imported by
the aggregate audit.

## Executable certificate

[`auditPeriodTwoVerifier`](../../poc/performance/src/numerics/period-two-verifier.ts)
captures each parameter component once and uses the existing DataView decoder
to express every finite Number as an integer in units `U^-1`, `U = 2^1074`.
All certificate comparisons use BigInt, including exact rectangle membership.

The candidate performs two steps and its only proper divisor performs one.
The pilot reuses the production complex-square expression
`(re*re-im*im+cRe, 2*re*im+cIm)` and the four separate products of the
derivative update. Each computed complex step has its aggregate component
residual checked against `2^-50`; each derivative update must decode to zero.
These are per-call composed-operation audits, not universal scalar rounding
bounds. For this tiny prefix, direct exact iteration supplies the final
residual-square discrepancy rather than a general P3 error recurrence.

The exact one-step square has numerator `cReUnits^2+cImUnits^2` and denominator
`U^2`. The exact second iterate has numerators
`cReUnits^2-cImUnits^2+cReUnits*U` and
`2*cReUnits*cImUnits+cImUnits*U`, each over `U^2`; its norm square is over
`U^4`. A computed residual square with decoded units `s` is compared as
`s*U` against the divisor numerator, or `s*U^3` against the candidate
numerator. Multiplication by the exact decimal error denominator checks the
Lean inequalities without rounding the bound itself. Subnormal contributions
are retained even if machine squaring underflows to zero.

The pilot evaluates and decodes the actual unit-scale policy expressions,
checks the zero-input `Math.hypot` result, and calls the actual
`src/domain/verifier.ts` wrapper at `(c, seed=0, period=2)`. It returns
`audited` only when that verifier agrees on period and its critical-seed
zero-multiplier output identity. Unsupported input, uncertified policy or
arithmetic, and verifier disagreement produce an explicit refusal. The
successful result includes the captured parameter and exact rational
residual, discrepancy, step-defect, and cutoff witnesses.

## What the result means

Acceptance is the frozen numerical verifier's tolerance verdict. Away from
`c=-1`, the critical seed generally is not exactly periodic. Its derivative
product is nevertheless zero because its first factor is zero. Accordingly,
the returned zero magnitude, zero angle, and infinite kappa describe the
verifier's critical-seed calculation, not the multiplier of the nearby true
attracting cycle. Those values are not certified per-pixel interior metrics.

The independent `periodTwoRationalTile_complex_trap` theorem proves that every
parameter in the same rectangle has a unique attracting primitive period-two
return point in the stated disk and that the critical orbit converges to it.
No new trapping theorem is needed. The bounded certificate does not authorize
tile block fills, arbitrary cycle starts, candidate selection, larger periods,
general `hypot`/square-root accuracy, or transcendental output approximation.

## Validation

The focused unit tests cover a 17-by-17 grid and eight additional endpoint,
adjacent-representable, non-grid, signed-zero, and subnormal parameters. An
independent base-two-text decoder and general rational iteration check both
exact residuals and the reported computed discrepancies. Tests exercise
nonfinite and immediately outside-edge refusal, captured inputs, corrupted
operations, and production verdict/payload disagreement.

A test extracts and executes both the actual `verifyCycleInto` body and the
`orbit.ts` inline verifier block at the critical seed. It compares their
intermediate orbit/derivative states and computed residual squares against
the audit witnesses on the same 297 inputs, as well as checking accepted
output and provenance. It deliberately bypasses
the analytic fast path and proposal loop only in the test harness. It does
not certify the renderer's proposal policy. A browser test imports the
research module through Vite and checks the center, corners, a non-grid
parameter, a subnormal, and refusals in Chromium and Firefox. The application
does not import this module.

The adversarial review identified that identical accepted payloads throughout
the tile could hide residual-arithmetic drift. The update added both source
body observations and intermediate-frame comparisons, plus a policy-margin
refusal test. All eight focused tests passed again, and the independent
adversarial rereview found no remaining blockers or overstated scope claims.
Final build, lint, axiom-audit, and browser results are recorded below after
the checks complete.
