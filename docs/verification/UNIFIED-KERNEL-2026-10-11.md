# Unified classifier kernel — October 11, 2026

Branch `proof/certified-acceptance`. This closes the performance round that
followed the optimization tournament
(`evidence/phase-2/optimization-tournament/2026-10-11-d641b8e/`): the three
tournament winners (triggered scan, two-pixel interleave, prepared coordinates)
and conjugate mirroring are folded into one default path, and each step was
checked for the PR 15 kind of refinement — keep intermediate products that are
needed later, drop the ones nobody reads, and remove steps that recompute what
is already known.

## What the default path does now

1. **Analytic fast paths** (main cardioid, period-2 bulb), shared by every
   kernel as `classifyAnalyticInto`.
2. **Watched-lag triggered scan** (`src/domain/orbit-triggered.ts`,
   [ADR 0006](../decisions/0006-watched-lag-default-classifier.md)). A full
   lag scan computes every lag distance; the kernel keeps their argmin as the
   watched lag and tests only that lag on later iterations, with the legacy
   proposal test. Full scans (each the legacy scan of its iteration) run when
   the watched lag proposes, at the first scanning iteration and then after
   gaps of 16 → 128 iterations (doubling), and at the end of the budget.
3. **One verifier.** Proposals go to the canonical `verifyCycleInto`, which
   now takes each proper divisor's residual and derivative from its forward
   walk over the full period instead of re-walking the divisor.
4. **Two-lane row kernel** (`src/render/triggered-rows.ts`) for the stable
   pass: two orbits per loop, each lane refilling from the row independently
   and writing band storage directly.
5. **Prepared coordinates** (per column and per row, unconditional) and
   **conjugate mirroring** of real-axis views (on by default).
6. **Allocation-free colorization** (`src/render/colorize.ts`).

`legacy-scan` stays as the explicit reference mode: the judge baseline, the
differential mode's reported answer, and the `perfCounters` instrumentation.

## Refinements, in the PR 15 spirit

| Refinement                                                        | Intermediate product or step                                                                    | Effect                                                                 | Exactness                                                                         |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Watched lag replaces the step gate                                | The per-lag distances of each full scan were discarded; their argmin is the next lag to propose | 2.5–4× over the tournament triggered scan; no tail window              | Same-or-later acceptance than legacy by construction; bit-identical on the corpus |
| First full scan at the first scanning iteration, doubling cadence | Early scans pick the watched lag before the orbit settles; later scans are rarely needed        | ~1.2× over a fixed 32-iteration cadence                                | λ bit-identical on every corpus pixel (fixed cadence: 98%)                        |
| Divisor residuals from the forward walk                           | Each proper divisor walk is a prefix of the full-period walk                                    | Fewer steps per verification                                           | Bit-identical, verdict codes included (`verifier-prefix.test.ts`)                 |
| Canonical verifier call instead of an inline copy                 | Proposals are rare in the triggered kernel                                                      | ~15% faster (smaller loop body); one verifier body for the new kernels | Same function                                                                     |
| Power-of-two history ring, mask indexing                          | Integer modulo per lag                                                                          | Cheaper scans                                                          | Ring layout only                                                                  |
| Two-lane row kernel                                               | Latency-bound z² + c chain; per-sample result records                                           | 1.18× geomean over the scalar triggered kernel                         | Bit-identical (`triggered-rows.test.ts`)                                          |
| Stability exponent only at rich boundaries                        | κ = −log\|λ\|/p computed per attracting pixel and never read by the raster                      | Analytic-heavy views 1.3–1.7×                                          | Same expression where materialized                                                |
| Colorization without tuples or fmod                               | Per-pixel RGBA arrays; `%` on doubles (an fmod call)                                            | 1.8–2.4× faster colorization                                           | Byte-identical (`colorize.test.ts`)                                               |

Removed as subsumed: the legacy two-lane pair kernel (`orbit-interleaved.ts`)
and the `interleave` / `preparedCoordinates` experiment flags.

## Evidence

- **Speed versus main** (`evidence/phase-2/2026-10-11-97d99de-cross-commit/`):
  the production `CpuRenderer` of each commit, serial, stable pass. Geometric
  mean over 17 cases: **14.7× faster than main before PR 15 (`296d5be`) and
  11.0× faster than main with PR 15 (`49845bf`)**; hard views 15–42× and
  12–25× respectively; easy views 3.6–16×. Per-pixel status identical to
  both older commits on all 10.2 M pixels.
- **Semantics versus the legacy verifier scan:** zero status, period, or
  multiplier-bit differences on every pixel of the frozen corpus at the
  shipping raster (`kernel-parity-1024x640.txt` in the same directory); the
  judge parity gate passes.
- **Browser screening** of legacy (mirroring off, the previous default) vs the
  new default: `evidence/phase-2/2026-10-11-d77eb7c-watched-lag-stage-a/`
  (headless Playwright Chromium and Firefox, 9 paired repetitions, production
  bundle through the real UI; directional). Every stable-canvas hash matches
  between the arms in both engines; release-gate cases are 1.6–16× faster in
  Chromium and 3.8–25× in Firefox (stable-frame `requestToPresentMs`, warm
  medians); easy views gain little, since fixed per-frame costs dominate them;
  no regression flags.

## Review findings fixed before merge

An adversarial review of the kernel commit and the default-flip work found:

1. **Fire cap could lose acceptances.** Capping watched-lag fires at 8 per
   pixel let repeated verifier refusals (divisor-ambiguous near λ = −1, or
   closure-ambiguous at a loose tolerance) exhaust the fires before the
   iteration where legacy accepts. No divergence at the shipping profiles,
   but the guarantee was wrong as stated. The cap is removed; reproducers are
   tests.
2. **Parked lanes were not inert.** A row-kernel lane parked at z = 0 still
   iterated c = i·cIm through the shared row imaginary part and, if that
   orbit escaped, wrote the previous row's last pixel. Lanes park at NaN; a
   regression test writes rows at a nonzero offset between sentinels.

Residual risk: equality with the legacy scan is established empirically, not
proved. A lag other than the watched one could propose and verify on an
iteration without a scheduled scan (the review's searches, including 135,720
runs near deep component centers, never found one).

## Open items

- The default flip needs the release-protocol Stage A run (≥21 paired
  repetitions, branded stable browsers, headed, declared target hardware;
  plan §9). The branded-Chrome half passed
  (`evidence/phase-2/2026-10-11-59926c5-watched-lag-release/`: release-gate
  cases 1.67×–16.45×, no regression flag, every hash matched). Update
  (2026-10-15): the branded-Firefox half passed in the same directory
  (release-gate cases 4.68×–26.06×, no regression flag, every hash matched),
  and ADR 0006 is accepted.
- Certified early acceptance (archived `tournament/early-accept`) would
  resolve slowly attracting pixels earlier and convert some unresolved pixels,
  but its binary64 error allowance is heuristic, not proved, and it changes
  visible output; it is not part of this default.
- The two-lane kernel reaches 1.18× where a stripped two-lane orbit loop in
  V8 reaches ~1.5–1.8×; the remaining gap is event handling and register
  pressure.
