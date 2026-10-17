# ADR 0010: Analytic period-3 classification

- Status: Accepted
- Date: 2026-10-16

## Context

The workstream H spike ([record](../verification/WORKSTREAM-H-SPIKE-2026-10-16.md))
found that the multipliers of the two period-3 cycles have the closed form
λ = 4(c+2) ± 4i·c·√(4c+7). In Node, period-3 and period-4 pixels took 30.7% of
summed corpus time; the closed form answers a period-3 pixel in about 60 ns
against 1–2 µs for the orbit path, and it decides cycles too weakly
attracting for any iteration budget. Owner decision (2026-10-16): adopt
period 3 now and period 4 after a rigorous root-error bound.

## Decision

1. A third closed-form fast path, `classifyPeriodThreeInto`
   (`src/domain/analytic-period-three.ts`, revision `src-analytic-p3-1.0.0`).
   It keeps the root of smaller modulus and accepts iff
   |λ̂| + 2⁻⁴⁶·(|Re c + 2| + |Im c| + 1) < 1 − attractMargin. The exact-period
   argument and the binary64 error budget are in
   [PERFORMANCE-MATHEMATICS §11](../PERFORMANCE-MATHEMATICS.md#11-period-3-closed-form-workstream-h-adr-0010);
   the exact identities are checked in
   `proof/IntMProof/PeriodThreeMultiplier.lean`.
2. Acceptance is the closed-form criterion the period-1 and period-2 paths
   already use (plan §4, bucket 1–2: a conservative binary64 criterion), not
   `verifyCycleInto`: there is no cycle point to hand to the verifier. We read
   `MI-PERF-004`'s "common declared acceptance procedure" as the verifier
   policy's attraction margin applied to an exact multiplier, with a declared
   binary64 allowance. The plan §4 table lists periods 3–4 as "checkpoint;
   optional algebraic candidate" under the common verifier; this ADR records
   the deviation for period 3. `VERIFIER_REVISION` does not change.
3. Placement: both kernels (`classifyTriggeredOrbitInto` and
   `TriggeredRowKernel`) try it once per pixel at the first scanning
   iteration, `max(cycleWarmup, 2)` = 24, before that iteration's scan.
   Pixels that escape earlier never reach it. The record depends on c alone,
   so placement changes no bit. With `maxIterations` below the first
   scanning iteration it never runs; no production budget is that small.
4. Gate: padded bounding boxes of the three period-3 components
   (`src/domain/period-three-gate.ts`), tested by a straight-line function,
   hull first. The gate must contain every accepted parameter (checked on a
   dense grid and along every box edge), so it changes speed, not answers.
5. Evidence: flag `analytic-period-3-component`, code 5, evidence source
   `analytic` (a closed form, like periods 1 and 2; `algebraic` stays
   reserved for algebraic candidates handed to the verifier). The inspector
   shows "Analytic Period 3 Component" and "Analytic closed form". Iterations
   are 0, as for the other closed forms.
6. Multiplier: period-3 pixels report the closed-form λ. It agrees with a dd
   reference to 3·10⁻¹⁵ on the golden raster, against up to 1.02·10⁻⁸ there
   (2.2·10⁻⁶ in the spike) for the orbit product.
7. Period 4 is out of scope until its root-error bound is rigorous.

## Consequences

- Answer change (plan §3: a changed answer ships only when the oracle
  supports it). On the golden raster (160×100) 1,074 pixels move from
  unresolved to attracting period 3 (26 in the default view, 620 at the rabbit
  boundary, 428 in the weak-attraction view), and 18,142 period-3 pixels
  report the closed-form multiplier instead of the orbit product. All 19,216
  are checked against the independent dd period-3 cycle
  (`tests/unit/render/period-three-golden-oracle.test.ts`).
- The golden kernel fixture is regenerated in the same commit; three cases
  change (`mi-easy-default-full`, `mi-hard-rabbit-boundary`,
  `mi-fallback-weak-attraction`).
- Colour: the multiplier change alone alters no colorized byte on the golden
  raster in any view; only the status changes are visible. No colorized-buffer
  goldens exist yet (PHASE2-TODO item 5), so none are regenerated; item 5
  generates its goldens on top of this change.
- The differential tests against the frozen legacy port and the PoC control
  kernel gain one documented divergence class, analytic period 3, each case
  adjudicated in `tests/unit/domain/orbit-oracle-adjudication.test.ts`.
- Speed on the far exterior depends on the row kernel's code generation,
  not on work done: no pixel there reaches iteration 24. Calling the gate from
  `TriggeredRowKernel.classifyRow` cost about 10% on `mi-easy-exterior-heavy`
  in Node, because the inlined gate spent TurboFan's inlining budget and left
  a refill call to `classifyAnalyticInto` out of line. The effect appeared in some compiles and not others (bimodal); the CPU-level reason is not pinned down, and the inlining account is the working explanation. The row kernel
  therefore evaluates the gate once per row as a window on Re c (exact: the
  boxes' |Im c| bands are disjoint and lie inside the hull) and calls only the
  closed form, which is too large to inline. The scalar kernel keeps the
  straight-line gate call.
- The browser release run in both browsers is deferred to the owner's screen
  session.
- Evidence: [adjudication](../../evidence/phase-2/2026-10-17-9c1471e-period-three-adjudication/summary.md) (every
  changed pixel, 0 unsupported) and [fallback overhead](../../evidence/phase-2/2026-10-17-1bffe34-period-three-overhead/summary.md)
  (Node, directional).
