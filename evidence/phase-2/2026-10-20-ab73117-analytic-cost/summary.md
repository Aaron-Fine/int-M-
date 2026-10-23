# Analytic period-3/4 cost on the views they mostly refuse — 2026-10-20 @ ab73117

Owner decision 2026-10-20: "optimize, then decide" the Chrome Easy budget miss
of the 2026-10-20 release session (`mi-easy-default-full`, Chrome stable median
292.6 ms against 250 ms; [evidence](../2026-10-20-d3d0490-release/summary.md)).
Paired runs had charged the analytic period-3 and period-4 paths
([ADR 0010](../../../docs/decisions/0010-analytic-period-three.md),
[ADR 0013](../../../docs/decisions/0013-analytic-period-four.md)) about 6–9% of
the default view in Chrome, about 27% in Firefox, and about 10% of the
exterior-heavy view in Firefox.

- **Label:** directional. Node v24.19.0 (V8 13.6) and the bundled headless
  Playwright browsers (Chromium 156, Firefox 157); one laptop (i7-1185G7,
  8 threads); no headed or `--release` run.
- **Arms:** `base` = `b642fd6` (kernels identical to `cc8c952`, the branch head
  before this work); `candidate` = `ab73117` (code commits `fe68c59` and
  `ab73117`); `pre` = `e59db4a`, the last build without the analytic paths
  (reference only; its answers differ).
- **Answers:** bit-identical between base and candidate. Kernel and colorized
  goldens unchanged (`npm run fixtures:golden:check`); FNV-1a of the packed,
  primary and angle channels identical for all 13 corpus views at 1024×640 in
  the stable and the coarse pass (Node, 26 of 26); identical in both browsers
  for the six views of the cold-worker runs and the seven views of the
  run-release runs (0 hash mismatches).

## Cause

### The attempts cost almost nothing

Counted with the production kernels on the default view at 1024×640
(Balanced, 512 iterations; `raw-observations.json`, `attemptCounts1024x640`):

| Pixels                                                    |             Count |
| --------------------------------------------------------- | ----------------: |
| all                                                       |           655,360 |
| resolved by the period-1/2 closed forms                   |            90,104 |
| escaped before iteration 24                               |           544,750 |
| reached the attempt (iteration 24)                        |            20,506 |
| period-3 gate: attempts / accepted                        |     4,770 / 3,704 |
| period-4 gate: attempts / accepted                        |     2,090 / 1,516 |
| period-4 refusals by the margin / by the certificate      |           574 / 0 |
| refused attempts ending escaped / attracting / unresolved | 1,226 / 102 / 312 |

Warm cost per attempt (Node): period 3 33–51 ns, period 4 about 207 ns, so
about 0.65 ms for the whole view, against about 57 ms of single-thread
classification; every acceptance saves an orbit. The exterior-heavy view makes
no attempt (no pixel reaches iteration 24). In warm main-thread runs in the
browsers the analytic build was faster than `pre` on the default view
(Firefox −10%, Chrome −8%; diagnostic). The cost had to come from elsewhere.

### Cold tile workers recompile `classifyRow`

Every page load creates four fresh tile workers for the stable pass, so the
harness always times the kernel while the engines are still compiling it. In
`base`, blocks of `TriggeredRowKernel.classifyRow` first ran after its first
optimizing compile: the per-row gate windows (one branch per box band, first
taken on the band's first row) and each lane's gated call block (first taken
at the first gate pixel).

- SpiderMonkey compiles a block that has not run as a bailout
  (`FirstExecution`) and invalidates the compile after ten bailouts. Firefox
  profiler markers (two renders, four fresh workers each):

  | Build               | default: classifyRow invalidations / all bailouts | exterior-heavy: same |
  | ------------------- | ------------------------------------------------: | -------------------: |
  | pre `e59db4a`       |                                          10 / 120 |               2 / 23 |
  | base `b642fd6`      |                                          34 / 365 |             16 / 190 |
  | candidate `ab73117` |                                          11 / 227 |               2 / 37 |

  In `base` the bailouts sat on the window branches (rabbit band 99 in one
  profile, cardioid-satellite band 28, complex-primitive band 10), the gated
  call blocks and the analytic write blocks. Per-band times in a single cold
  worker showed a 2.5–5 ms spike at each band where a new window type first
  appears (exterior-heavy: the rabbit, cardioid-satellite and bulb-satellite
  rows, bands that otherwise take 1 ms). Raising
  `javascript.options.ion.frequent_bailout_threshold` to 100,000 brought
  `base` within 2–3% of `pre` (diagnostic only).

- V8 deoptimizes optimized code on operations without feedback.
  `classifyRow` "insufficient type feedback" deopts (two renders): pre 8,
  base 24, candidate 8 on the default view; 2, 4, 0 on exterior-heavy. Each
  Maglev recompile of the larger `base` function also took longer (median:
  pre 9.2 ms, base 16.3 ms, candidate 10.0 ms), and TurboFan compiles of
  `classifyRow` took 50–75 ms, longer than a worker's share of the default
  view, so cold Chromium workers run the kernel mostly in Maglev.
- A small dispatcher function would not do: V8 inlined it into the kernel,
  and its solve calls, first taken at the first gate pixel, deoptimized the
  kernel again (variant measured: +25% on the default view, cold Chromium).

## Change

`fe68c59`, `ab73117`. Both kernels call `classifyGatedAnalyticInto` for every
pixel that reaches the first scanning iteration. It reads the two gates as
Re c windows of the row (`src/domain/analytic-gate-windows.ts`, recomputed
when Im c changes) and runs at most one solve; its body also holds the
period-3 closed form, so it is far above V8's 460-byte inlining limit and
neither engine inlines it, or the solve calls in it, into a kernel. The row
kernel's analytic acceptance takes the verifier acceptance's write path.
`classifyRow` holds no gate and no block that first runs when a gate row or
gate pixel arrives.

## Results

### Cold workers (`tools/benchmark/cold-workers.ts`)

Four fresh module workers per sample classify the view's 32 stable bands at
1024×640 in the tile pool's dispatch order; arms interleaved, 21 repetitions
after one hash repetition; cross-origin isolated. Paired median change against
`base` of the stable pass wall time (summed band classify time in brackets).
1-minute load 1.26 (Firefox) and 1.20 (Chromium) at the start.

| Case                        | Firefox base ms | Firefox candidate | Chromium base ms | Chromium candidate |
| --------------------------- | --------------: | ----------------- | ---------------: | ------------------ |
| mi-easy-default-full        |           115.5 | −37.6% (−37.6%)   |            154.3 | −17.9% (−19.4%)    |
| mi-easy-exterior-heavy      |            42.9 | −37.3% (−38.7%)   |             40.3 | −8.5% (−6.0%)      |
| mi-hard-supplied-126x       |           212.7 | −9.1% (−8.2%)     |            236.3 | +1.6% (+1.7%)      |
| mi-hard-rabbit-boundary     |           180.4 | −9.9% (−11.5%)    |            336.1 | −0.9% (−1.6%)      |
| mi-scale-6mx-basilica-rim   |            90.7 | −1.0% (−0.6%)     |            127.3 | −2.2% (−1.3%)      |
| mi-fallback-weak-attraction |            83.6 | +0.2% (0.0%)      |            103.0 | −1.6% (−1.9%)      |

Against `pre` the candidate is +9% (Firefox) and −2% (Chromium) on the
default view and keeps every gain: `pre` is slower than the
candidate on 126× and the rabbit boundary by 55–66% (Firefox) and 25–39%
(Chromium), and 3.5–10.7 times slower on the 6,000,000× and weak-attraction
views (paired medians of the stored samples).

Command, per engine, with bundles built by
`npx rolldown tools/benchmark/cold-worker-entry.ts --format esm --platform browser -m`
in each checkout:

```
node tools/benchmark/cold-workers.ts --engine <firefox|chromium> \
  --arm base=<b642fd6 bundle> --arm cand=<ab73117 bundle> --arm pre=<e59db4a bundle> --reps 21 \
  --cases mi-easy-default-full,mi-easy-exterior-heavy,mi-hard-supplied-126x,mi-hard-rabbit-boundary,mi-scale-6mx-basilica-rim,mi-fallback-weak-attraction
```

### Full harness, directional (`run-release/`)

```
node tools/benchmark/run-release.ts --reps 21 \
  --cases mi-easy-default-full,mi-easy-exterior-heavy,mi-hard-supplied-126x,mi-hard-supplied-13x,mi-hard-rabbit-boundary,mi-scale-6mx-basilica-rim,mi-fallback-weak-attraction \
  --compare base=dist:<vite build of b642fd6> --skip-interactions --skip-memory
```

Current build `ab73117` (working tree: docs only). 20 warm pairs per case;
1-minute load 1.29 at the start. Wall ratio base/candidate (above 1: the
candidate is faster), 95% BCa interval; full tables in `run-release/summary.md`.

| Case                        | Chromium wall ratio  | Chromium stable Δ | Firefox wall ratio   | Firefox stable Δ |
| --------------------------- | -------------------- | ----------------: | -------------------- | ---------------: |
| mi-easy-default-full        | 1.227 [1.118, 1.309] |          −43.3 ms | 1.237 [1.122, 1.304] |         −38.0 ms |
| mi-easy-exterior-heavy      | 1.119 [1.054, 1.200] |          −11.6 ms | 1.139 [1.122, 1.210] |         −14.0 ms |
| mi-hard-supplied-126x       | 1.002 [0.984, 1.016] |           −0.9 ms | 1.072 [1.032, 1.156] |         −21.0 ms |
| mi-hard-supplied-13x        | 1.064 [1.033, 1.096] |          −23.0 ms | 1.110 [1.036, 1.151] |         −29.5 ms |
| mi-hard-rabbit-boundary     | 1.050 [1.018, 1.099] |          −21.7 ms | 1.059 [1.007, 1.108] |         −16.5 ms |
| mi-scale-6mx-basilica-rim   | 1.019 [0.998, 1.055] |           −4.7 ms | 1.000 [0.959, 1.063] |           0.0 ms |
| mi-fallback-weak-attraction | 1.009 [0.972, 1.041] |           −2.4 ms | 1.008 [0.960, 1.043] |          −1.5 ms |

Stable medians of the candidate (bundled headless browsers, not the release
protocol): default view 194.4 ms in Chromium and 197.0 ms in Firefox, against
the 250 ms Easy budget. Whether branded headed Chrome meets the budget is for
the release session.

### Node, warm (`tools/benchmark/fallback-overhead.ts`)

Baseline `b642fd6` bundle, candidate `ab73117` bundle, A/A control, three arms
interleaved, `taskset -c 5`, every arm first warmed on the whole corpus at
256×160. Overhead = 1/ratio − 1 of the paired median, 95% BCa interval.
1-minute load 1.20–1.27 at the start of each run.

| Pass, reps                       | Case                            | Baseline ms | Candidate overhead          | Control |
| -------------------------------- | ------------------------------- | ----------: | --------------------------- | ------: |
| stable, 60                       | mi-easy-exterior-heavy          |       36.68 | **+7.01% [+5.86%, +9.89%]** |  +0.35% |
| stable, 60                       | mi-fallback-ambiguous-boundary  |      110.58 | +0.44% [−0.34%, +0.97%]     |  +0.38% |
| stable, 60                       | mi-easy-default-full            |       60.70 | +1.64% [+1.05%, +2.24%]     |  +0.59% |
| stable, 20                       | mi-hard-supplied-126x           |      259.73 | −1.94% [−4.50%, +1.47%]     |  −0.47% |
| stable, 20                       | mi-hard-supplied-13x            |      200.63 | −2.35% [−3.24%, −1.13%]     |  −1.01% |
| stable, 20                       | mi-hard-supplied-609x           |      133.52 | −1.64% [−3.03%, +1.23%]     |  +0.49% |
| stable, 20                       | mi-hard-rabbit-boundary         |      186.62 | −0.16% [−1.03%, +1.60%]     |  +1.02% |
| stable, 20                       | mi-scale-6mx-basilica-rim       |      123.34 | +1.01% [−4.23%, +5.16%]     |  +0.44% |
| stable, 20                       | mi-fallback-weak-attraction     |      102.88 | +3.66% [+2.87%, +11.72%]    |  +0.99% |
| coarse (stride 8, 4096×2560), 40 | mi-easy-exterior-heavy          |      108.34 | +0.24% [−0.75%, +1.96%]     |  +0.03% |
| coarse, 40                       | mi-fallback-ambiguous-boundary  |      130.33 | +0.55% [−3.21%, +2.61%]     |  −0.22% |
| coarse, 40                       | mi-easy-default-full            |      116.66 | −0.98% [−2.16%, +0.16%]     |  −0.04% |
| stable, 10                       | mi-fallback-budget-exhaustion   |     1089.08 | −3.82% [−4.58%, −3.04%]     |  +0.45% |
| stable, 10                       | mi-fallback-unknown-high-period |      933.71 | −4.03% [−5.42%, −1.49%]     |  +0.05% |

The far-exterior stable pass fails ADR 0010's 5% limit in Node (warm, V8
13.6) with a quiet control, and weak attraction measures +3.66% [+2.87%,
+11.72%] against a control of +0.99%: the interval excludes 0 and its upper
end is above 5%. In the browsers the
far-exterior view is 8.5% faster cold in Chromium and 37.3% faster in
Firefox (11–14% in the full harness), and was faster warm in Chromium 156
(main-thread diagnostic: −8% against `base` for the `fe68c59`-shaped build).
Weak attraction is unchanged within noise there (+0.2% Firefox, −1.6%
Chromium cold). No pixel of the far-exterior view reaches the analytic call;
the difference is code generation of the rest of `classifyRow`, which has
been bimodal in Node since ADR 0010 (in multi-arm processes `base` itself
landed 10–20% slower in some processes). Variants that kept the per-row windows in
the row kernel were neutral there in Node but cost cold Chromium about 8% on
the same view. Whether Node keeps gating this view is an owner decision.

Cold-worker output hashes differ between Firefox and Chromium for the same
arm, `pre` included (for example `mi-easy-exterior-heavy`, where all three
arms agree within each engine), so "bit-identical" means within each engine;
this predates the change.

## Limits

- Directional only: bundled headless browsers, one machine, background load
  1.2–1.3 from a desktop session. The headed release session is still to
  run.
- The cold-worker benchmark times the stable pass alone; the release harness
  adds page start-up, the coarse pass and presentation.
- Exploratory runs (variants, preference experiments, single-worker band
  timelines) are described here and in ADR 0010's amendment and not stored;
  the kept runs are in `raw-observations.json` and `run-release/`.
