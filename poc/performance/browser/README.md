# PoC browser companion (`poc/performance/browser/`)

Playwright-driven browser measurements for the performance-plan decision
block in §5 and the renderer-path details in §12: pool sizing (workstream K),
yield mechanism, zero-copy transfer, band order (workstream E details),
conjugate-mirroring savings (workstream M), and coarse-pass cost-estimate
quality (workstream N input). This directory extends the Node harness in
`poc/performance/src/` from Node/V8 evidence to headless-Chromium evidence.

> All evidence here is **directional** (headless Chromium via Playwright). It
> does not replace Stage A browser evidence (plan §9: stable branded Chrome
> and Firefox, headed, on the declared target hardware).

## Running

One command from the repo root:

```
npx playwright test --config poc/performance/browser/playwright.config.ts
```

One invocation builds the production app bundle (`vite build` → `dist/`),
builds the microbench page (`vite build` → `dist/poc-bench/`), serves both
through `vite preview` on port 4178, and runs every spec sequentially (one
worker; parallelism would fight for CPU and invalidate wall-clock samples).
Every measurement writes `results/<measurement>.json` — raw per-run samples
plus a summary — embedding the plan §9 environment manifest produced by
`tools/benchmark/capture-environment.mjs` plus live browser facts.

Knobs (all recorded in the results files either way):
`MI_POC_SIZES` / `MI_POC_REPS` / `MI_POC_WARMUP` / `MI_POC_PROFILE` trim the
pool-sizing protocol for quick probes; `MI_POC_REUSE=1` reuses a manually
started preview server while iterating on a measurement. The default full
protocol takes ~6–7 minutes on the reference machine (pool-sizing dominates).

Typecheck/lint wiring: `poc/performance/browser/tsconfig.json` extends
`tsconfig.poc.json` (which includes this directory, grants DOM lib, and
allows the corpus JSON import — the Node-side PoC sources in
`poc/performance/src/` do not use DOM globals).

## Measurements and the gates they feed

| Spec                                       | Workstream          | What it measures                                                                                                                                                                                        | Gate it feeds                                                                                                                               |
| ------------------------------------------ | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/smoke.spec.ts`                      | —                   | Production bundle boots to a stable frame; microbench page and worker mechanics load                                                                                                                    | Harness sanity                                                                                                                              |
| `tests/pool-sizing.spec.ts`                | K (plan §5)         | Wall time per worker count (1/2/4/6/8) on the hard corpus view `mi-hard-supplied-126x`, warm pools, one band per worker per frame                                                                       | K: hard-view wall-clock ≥20% better on a ≥8-core target class in both browsers; easy views <3% slower                                       |
| `tests/renderer-path.spec.ts` (yield A/B)  | E detail (plan §12) | Nested `setTimeout(0)` chain vs MessageChannel port chain: steady-state per-hop latency (HTML 4 ms timer-nesting clamp) and cancel-to-quiescence of a classifyRows-shaped workload                      | Informs replacing production yields; measured via cancel-to-child-quiescence                                                                |
| `tests/renderer-path.spec.ts` (zero-copy)  | E detail (plan §12) | postMessage roundtrip of the real semantic-frame channels (u8/u32/f64/f64, 1024×640 ≈ 12.75 MiB), transferable vs structured-clone copy                                                                 | Informs pre-sliced transferable band views; merge memcpy the plan prices                                                                    |
| `tests/renderer-path.spec.ts` (band order) | E detail (plan §12) | Top-to-bottom vs center-out dispatch over real spin workers: time-to-first-band and time-to-50%-rows under uniform (control) and skewed per-band costs                                                  | Perceived-latency gate: t50 improves under skew, throughput unchanged; uniform control must not matter                                      |
| `tests/conjugate-mirror.spec.ts`           | M (plan §5)         | Full-raster classification vs canonical-half classify + mirror fill (exact imaginary-part negation, `center.im = 0`), plus semantic parity of every mirrored pixel                                      | M: ≥1.6× classifier on real-axis-symmetric easy cases in both browsers with semantic parity; any parity mismatch is a loud finding          |
| `tests/coarse-cost.spec.ts`                | N input (plan §5)   | Production coarse pass per-band statistics (mean escape iteration, unresolved fraction) vs actual stable-pass per-band compute; estimate-vs-actual correlation; equal-cost vs equal-height banding skew | N: attempted before E when the skew gate (baseline slowest/mean > 1.2) fires; killed if the coarse cost signal mispredicts stable-pass cost |

## Headline results

From the committed run in `results/` (headless Chromium, 8-core i7-1185G7
laptop):

- **Pool sizing (K).** 1024² hard view, Balanced: median wall 16.8 s (1
  worker) → 8.4 s (4 workers, the production cap) → 7.0 s (8 workers). On
  this machine 6/8 workers measured 0.89×/0.83× of the 4-worker cap (a
  11–17% gain, below K's 20% bar), but earlier runs on the same hardware
  measured 0.985×/0.864× and 0.69×/0.58× — the >4-worker verdict is genuinely
  run-sensitive on this part-HT laptop and needs the declared ≥8-core target
  class before it gates anything.
- **Yield mechanism (E).** Steady-state yield: `setTimeout` 4.1 ms vs
  MessageChannel ~0.1 ms; cancel-to-quiescence 4.1 ms vs 0.1 ms. The nested
  timer clamp is visible per-hop after 5 levels.
- **Zero-copy (E).** 12.75 MiB frame roundtrip: structured-clone copy
  26.8 ms (post itself 13.0 ms) vs transferable 0.2 ms (post ~0).
- **Band order (E).** Skewed costs: t50-rows 60.4 ms top-to-bottom vs
  43.1 ms center-out; first band 32.2 ms vs 10.8 ms. Uniform control: t50
  49.1 vs 48.5 ms — order must not and does not matter. Throughput unchanged.
- **Conjugate mirroring (M).** Ratio 1.57× on the real-axis-symmetric easy
  corpus view (`mi-easy-default-full`) and 1.65× on a symmetric variant of
  the hard `mi-hard-supplied-126x`. Across repeated runs on this machine the
  easy view measured 1.57–2.04× and the hard variant 1.65–1.77×, so the
  ≥1.6× verdict on the easy case sits at the bar and needs repeated runs
  (and the gate's second browser) before it gates a PR; the hard variant
  clears it consistently. Semantic parity exact: 0 mismatches over 131 072
  mirrored pixels per view in every run (status, period, |λ|, κ, iterations,
  evidence; arg-λ negation verified by the assembled comparison).
- **Coarse-cost quality (N input).** The skew gate fires on all three
  measured views at production band count 4 (slowest/mean 1.21 / 1.89 /
  3.30). Coarse estimate vs actual per-band compute: r = 0.92
  (`mi-hard-supplied-126x`) and 0.99 (`mi-fallback-ambiguous-boundary`), and
  equal-cost banding lowers skew (1.89→1.08, 3.30→2.09). But on the
  interior-heavy easy default view the signal mispredicts (r = 0.29) and
  equal-cost banding is _worse_ (1.21→1.59): the escape-iteration +
  unresolved-fraction model overcharges analytic-interior bands — N's kill
  criterion on that view class. Pooled r = 0.67 over 48 bands.

## Limitations

- Headless Chromium only, via Playwright. The K and M gates are written per
  browser ("both browsers") on target-class hardware; this harness covers one
  browser and one laptop. Firefox and headed branded runs are Stage A scope.
- Single machine, and run-to-run variance is real: medians of 5–21 reps with
  alternating arm order and warmup reps bound it, but conclusions near a bar
  (pool sizing above 4 workers) need repeated runs before they gate a PR.
  Allocation churn (fresh rasters per rep, per-row band buffers) adds GC
  noise to individual samples; medians and 64-row band sums absorb most of
  it, and the raw samples are committed so outliers are auditable.
- Workstream M and the coarse-cost measurement classify on the main thread
  with no worker scheduling, so their ratios isolate classification +
  mirror-fill cost; production dispatch effects (worker startup, queueing,
  merge) are measured separately by pool sizing and the band-order
  simulation.
- Budget deviations for harness runtime, both recorded in the results notes:
  pool sizing, conjugate mirroring, and coarse cost run the Balanced profile
  on views whose corpus records sometimes carry Detailed (Detailed at 1024²
  costs minutes per rep on a single worker).
- The band-order measurement is a labeled simulation: real workers, synthetic
  deterministic per-band spins; no corpus view cost is claimed for it.
- Mirror-fill cost here copies six numeric fields; the production semantic
  frame carries four channels, so measured mirroring savings are a
  conservative overestimate of the production mirror cost. Parity is exact
  under exact imaginary-part negation; no sub-ulp sampling offset is needed,
  so none is declared in the tolerance policy.
- `performance.now` coarsening (~100 µs in non-isolated page contexts) limits
  per-row resolution in the coarse-cost measurement on cheap exterior rows.
