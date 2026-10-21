# ADR 0010: Analytic period-3 classification

- Status: Accepted
- Date: 2026-10-16
- Amended: 2026-10-17 (owner decision on acceptance, Decision 2); 2026-10-20 (how the kernels reach the gate and the solves, Decisions 3 and 4; see the amendment at the end)

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
   `verifyCycleInto`: there is no cycle point to hand to the verifier.
   **Owner decision 2026-10-17 ("Accept, like p1/p2"):** period 3 is accepted
   by margin plus a derived allowance without the cycle verifier, as periods 1
   and 2 are, and `MI-PERF-004` is amended to name analytic closed forms
   (statement and status cell in `REQUIREMENTS.md`). The reading that follows
   is the owner's ruling, not an implementer interpretation. It reads
   `MI-PERF-004`'s "common declared acceptance procedure" as the verifier
   policy's attraction margin applied to an exact multiplier, with a declared
   binary64 allowance. The plan §4 table lists periods 3–4 as "checkpoint;
   optional algebraic candidate" under the common verifier; this ADR records
   the owner-approved deviation for period 3. `VERIFIER_REVISION` does not change.
3. Placement: both kernels (`classifyTriggeredOrbitInto` and
   `TriggeredRowKernel`) try it once per pixel at the first scanning
   iteration, `max(cycleWarmup, 2)` = 24, before that iteration's scan.
   Pixels that escape earlier never reach it. The record depends on c alone,
   so placement changes no bit. With `maxIterations` below the first
   scanning iteration it never runs; no production budget is that small.
4. Gate: padded bounding boxes of the three period-3 components
   (`src/domain/period-three-gate.ts`). The gate must contain every accepted
   parameter (checked on a dense grid and along every box edge), so it
   changes speed, not answers. Since the 2026-10-20 amendment neither kernel
   tests it: both call `classifyGatedAnalyticInto` for every pixel that
   reaches the first scanning iteration, and that function reads the gate as
   a window on Re c for the row (originally the scalar kernel called the
   straight-line gate and the row kernel evaluated a per-row window itself;
   see Consequences and the amendment).
5. Evidence: flag `analytic-period-3-component`, code 5, evidence source
   `analytic` (a closed form, like periods 1 and 2; `algebraic` stays
   reserved for algebraic candidates handed to the verifier). The inspector
   shows "Analytic Period 3 Component" and "Analytic closed form". Iterations
   are 0, as for the other closed forms.
6. Multiplier: period-3 pixels report the closed-form λ. It agrees with a dd
   reference to 3·10⁻¹⁵ on the golden raster, against up to 1.02·10⁻⁸ there
   (2.2·10⁻⁶ in the spike) for the orbit product.
7. Period 4 is out of scope until its root-error bound is rigorous. Superseded 2026-10-17 by [ADR 0013](0013-analytic-period-four.md), which ships period 4 with a certified root enclosure.

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
  generates its goldens on top of this change (item 5 has since added them;
  ADR 0013 regenerated seven).
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
  straight-line gate call. The fix depends on V8 inlining heuristics: rerun
  `tools/benchmark/fallback-overhead.ts` after any change to `classifyRow` or
  a V8 upgrade. The coarse (scalar) pass was not measured. The 2026-10-20 amendment replaced this placement: the kernels no longer hold the gate.
- The browser release run in both browsers is deferred to the owner's screen
  session.
- Evidence: [adjudication](../../evidence/phase-2/2026-10-17-9c1471e-period-three-adjudication/summary.md) (every
  changed pixel, 0 unsupported) and [fallback overhead](../../evidence/phase-2/2026-10-17-1bffe34-period-three-overhead/summary.md)
  (Node, directional).

## Amendment 2026-10-20: one gated call per pixel, nothing first run late in the row kernel

The 2026-10-20 release session (`d3d0490`, branded Chrome 155 and Firefox 158) put the Chrome default view at 292.6 ms against the 250 ms Easy budget, and paired directional runs against earlier builds charged the analytic paths about 6–9% of the default view in Chrome, about 27% in Firefox, and about 10% of the exterior-heavy view in Firefox, where no pixel reaches iteration 24. The limit of 5% set above had only been measured in Node, warm.

- **Not the attempts.** At 1024×640 the default view makes 6,860 attempts (4,770 period 3, 3,704 accepted; 2,090 period 4, 1,516 accepted; the 574 period-4 refusals all fail the margin, none the certificate), about 0.65 ms of warm work in all, while each acceptance saves an orbit; the exterior-heavy view makes none.
- **Cause: cold tile workers.** Every page load starts four fresh tile workers, so the stable pass runs while the engines are still compiling `classifyRow`. Blocks of `classifyRow` that first ran after its first optimizing compile were the per-row gate windows (each box band's branch, first taken on that band's first row) and each lane's gated call block (first taken at the first gate pixel). SpiderMonkey compiles a block not yet run as a bailout and invalidates the compile after ten bailouts (frequent-bailout threshold), then runs the row in Baseline until a recompile: Firefox profiler markers show 34 invalidations of `classifyRow` in two default-view renders against 10 without the analytic paths (16 against 2 on the exterior-heavy view), and band times show a 2.5–5 ms spike at each band where a new window type first appears (exterior-heavy: the rabbit, cardioid-satellite and bulb-satellite rows). Raising `javascript.options.ion.frequent_bailout_threshold` removed the difference (diagnostic only). V8 deoptimized on the same blocks' missing feedback (24 deopts of `classifyRow` in two renders against 8) and each Maglev recompile of the larger function took a median 16.3 ms against 9.2 ms. In warm workers the analytic build was faster than the build without it in both browsers.
- **Change** (`fe68c59`, `ab73117`): both kernels call `classifyGatedAnalyticInto` for every pixel that reaches the first scanning iteration. It reads the period-3 and period-4 gates as Re c windows of the row (`src/domain/analytic-gate-windows.ts`, recomputed when Im c changes) and runs at most one solve; the row kernel's analytic acceptance takes the verifier acceptance's write path. `classifyRow` has no gate and no block that first runs when a gate row or gate pixel arrives. The closed form and the dispatch share one function body, far above V8's 460-byte inlining limit, so the solve calls never land in a kernel's code (a small dispatcher was inlined and its solve calls deoptimized the kernel). Answers are bit-identical: same records as gate-then-solve (unit tests at every box edge), kernel and colorized goldens unchanged, every corpus view at 1024×640 identical in the stable and coarse passes.
- **Measured effect** ([evidence](../../evidence/phase-2/2026-10-20-ab73117-analytic-cost/summary.md), directional, bundled headless browsers): `classifyRow` is back to 11 invalidations in two default-view renders (2 on exterior-heavy) and 8 V8 deopts. In the full harness against `b642fd6` (20 warm pairs) the default view's stable time fell by 43 ms in Chromium and 38 ms in Firefox (wall ratio 1.227 [1.118, 1.309] and 1.237 [1.122, 1.304]; medians 194.4 and 197.0 ms) and the exterior-heavy view's by 12 and 14 ms; no view the paths answer got slower (13×, rabbit boundary and Firefox 126× faster; 126× in Chromium, 6,000,000× and weak attraction within ±2%). Cold workers alone: default view −37.6% (Firefox) and −17.9% (Chromium), exterior-heavy −37.3% and −8.5%. Node, warm: default view +1.6%, ambiguous boundary +0.4%, hard views −2.4% to +3.7%, coarse pass within ±1%, and the far-exterior stable pass **+7.0% [+5.9%, +9.9%]**, above the 5% limit of this ADR, with a quiet control. That view makes no analytic call in any build; Node's code generation for the rest of `classifyRow` has been bimodal there since 2026-10-17, and both browsers measure the same build faster on it, cold and warm. Variants that kept per-row windows in the row kernel passed in Node but cost cold Chromium about 8% on that view. Whether the Node far-exterior figure stays a gate is for the owner.
- **Fragility.** Code generation in both engines and their tiering heuristics decide this; nothing guards it. Rerun `tools/benchmark/cold-workers.ts` (both engines) and `tools/benchmark/fallback-overhead.ts` (stable and coarse pass) after any change to either kernel or `classifyGatedAnalyticInto`, or an engine upgrade. The Node figure and the browsers disagree on the far-exterior view (see the evidence); the Consequences paragraph on Node's bimodal far-exterior compile describes the 2026-10-17 form.
