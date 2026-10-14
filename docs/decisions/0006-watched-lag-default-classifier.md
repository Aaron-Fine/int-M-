# ADR 0006: Watched-lag triggered scan as the default classifier

- Status: Proposed — default flipped on `proof/certified-acceptance`; acceptance
  waits on the release-protocol Stage A run (plan §9), whose Chrome half has
  passed and whose Firefox half is pending
- Date: 2026-10-11

## Context

ADR 0003 kept the legacy lag scan as the reported default until Stage A browser
evidence justified a flip. The legacy scan tests every lag 1..`maxPeriod`
against the proposal gate on every iteration after warmup, and the optimization
tournament (evidence/phase-2/optimization-tournament/2026-10-11-d641b8e/) showed
that scan is the dominant cost. Its winner, `triggered-scan`, gated the scan on
the per-step distance |z_n − z_{n−1}|. Profiling showed that gate never fired:
period-1 cycles are all inside the analytic main-cardioid path, and for a
period-p > 1 cycle the per-step distance does not vanish. Its speed came only
from periodic safety scans plus an every-lag end-of-budget tail window, and its
acceptances lagged legacy's by up to tens of iterations (|Δλ| up to ~3e-5).

## Decision

`OrbitOptions.classifierMode` defaults to `'triggered-scan'`, redefined as the
watched-lag kernel (`src/domain/orbit-triggered.ts`); `'legacy-scan'` remains
the explicit reference mode (the judge baseline, the differential mode's
reported answer, and the mode under `perfCounters`).

- Each full scan computes all lag distances anyway; the kernel keeps their
  argmin (the watched lag) and tests only that lag on later iterations, with
  exactly the legacy proposal test. A fire, a scheduled scan (first at the
  first scanning iteration, then gaps 16 → 128 doubling), or the final
  iteration runs the full scan, which is the legacy scan of that iteration.
  Fires are not capped.
- Acceptance is unchanged: proposals go to the canonical `verifyCycleInto`
  (`src-verifier-1.0.0`), which now reads proper-divisor residuals off its
  forward walk (bit-identical to the separate walks, pinned by
  `tests/unit/domain/verifier-prefix.test.ts`).
- The stable pass runs a two-lane row kernel (`src/render/triggered-rows.ts`),
  bit-identical to the scalar kernel; conjugate mirroring is on by default.

## Semantic argument

Every full scan is the legacy scan of its iteration (same ring contents, same
ascending lags, same verifier), and legacy returns at its first accepting
iteration, so the watched-lag kernel accepts at the same iteration as legacy
or later, never earlier, never with a result legacy would not give at that
iteration. "Later" is the only possible difference: a different multiplier
rounding, or a loss if the budget ends first. The watched lag is tested every
iteration, so the phase at which its lag first proposes is never skipped; a
later acceptance needs a proposal at a non-watched lag on an iteration without
a scheduled scan.

Evidence: zero status/period differences and λ bit-identical on every
attracting pixel of the frozen corpus at 256×160 and in the judge parity gate
at the shipping raster; an adversarial review
(see the PR) found one real loss mechanism — a per-pixel cap on fires, removed,
with its reproducers as tests — and no divergence at the shipping profiles in
135,720 runs near deep component centers. No proof of exact equality exists;
the semantic cache version advanced to 2.

## Consequences

- Hard views are an order of magnitude faster in Node (see
  `docs/verification/UNIFIED-KERNEL-2026-10-11.md`).
- The default flip still needs the release-protocol Stage A run (≥21 paired
  repetitions, branded stable browsers, headed, declared target hardware). The
  directional screening run (headless Playwright engines) is recorded with
  the PR.
- Release-protocol run, Chrome half
  (`evidence/phase-2/2026-10-11-59926c5-watched-lag-release/`): branded
  Chrome 155, headed, on the target laptop (AC, balanced profile), 21 warm
  pairs per case with 95% BCa paired intervals. Release-gate cases are
  1.67×–16.45× faster (lower bounds 1.61×–13.56×), easy cases 1.01×–1.58×, no
  regression flag, and all 286 stable-canvas hash pairs match. The Firefox
  half was stopped by host memory pressure before it stored samples; it is
  the remaining condition for acceptance.
