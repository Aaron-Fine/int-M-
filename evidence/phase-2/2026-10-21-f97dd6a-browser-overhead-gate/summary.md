# Analytic-path overhead gate in the browsers — 2026-10-21 @ f97dd6a

Owner decision 2026-10-21: ADR 0010's 5% limit on the analytic paths' cost is
measured in the browsers, in cold tile workers, with
`tools/benchmark/cold-workers.ts`; the Node benchmark
`tools/benchmark/fallback-overhead.ts` stays as a diagnostic without gate force
([ADR 0010](../../../docs/decisions/0010-analytic-period-three.md), amendment
of 2026-10-21). This record is the first measurement under that rule.

- **Label:** directional (bundled headless Playwright browsers, not a headed
  release session). Chromium 156.0.8078.4 and Firefox 157.0 as bundled; Node
  v24.19.0; one laptop (i7-1185G7, 8 threads); 1024×640; 4 workers, 8 bands
  per worker (32 stable bands); cross-origin isolated; 21 timed repetitions
  after one hash repetition, arms interleaved with rotating order.
- **Load:** each run started with a 1-minute load below 1.0 (0.37 to 0.93,
  recorded in each JSON as `load`); nothing else ran.
- **Statistic:** paired median of the per-repetition wall-time ratio
  current/reference of the stable pass; 95% percentile bootstrap interval of
  that median (5,000 resamples, seed 1). The tool prints the same medians.

## Arms

- **current** (`cand` in the JSON): `f97dd6a`, the branch head.
- **no-analytic**: `f97dd6a` with the analytic call removed from both kernels
  ([no-analytic-variant.diff](no-analytic-variant.diff): the two row-kernel
  call sites and the scalar kernel's call replaced by `false`). This is the
  comparison ADR 0010's limit is about: the same code with and without the
  analytic attempt. Its answers differ on the views the paths answer, so the
  tool reports "OUTPUT DIFFERS" for those views and exits 1, as expected.
- **b642fd6** (`base` in the JSON): the build before the 2026-10-20 kernel
  change ([evidence](../2026-10-20-ab73117-analytic-cost/summary.md)); answers
  identical to current in every view and both engines.

Bundles were built in each checkout with
`npx rolldown tools/benchmark/cold-worker-entry.ts --format esm --platform browser -m --file <arm>.js`
(the `b642fd6` checkout with the current `cold-worker-entry.ts` copied in).

```
node tools/benchmark/cold-workers.ts --engine <firefox|chromium> \
  --arm none=<no-analytic bundle> --arm cand=<f97dd6a bundle> --reps 21 \
  --cases mi-easy-default-full,mi-easy-exterior-heavy,mi-fallback-ambiguous-boundary,mi-fallback-weak-attraction,mi-hard-supplied-126x,mi-hard-supplied-13x,mi-hard-rabbit-boundary,mi-scale-6mx-basilica-rim \
  --out <engine>-no-analytic-vs-current.json
```

The `b642fd6` runs used `--arm base=<b642fd6 bundle>` in place of the first
arm.

## Gate: current against no-analytic

Rule (ADR 0010 amendment of 2026-10-21): on every view the paths mostly refuse
(`mi-easy-default-full`, `mi-easy-exterior-heavy`,
`mi-fallback-ambiguous-boundary`), the paired median is at most +5% in both
engines. **Pass.**

| Case                             | Firefox ref → current ms | Firefox change [95%]    | Chromium ref → current ms | Chromium change [95%]   |
| -------------------------------- | -----------------------: | ----------------------- | ------------------------: | ----------------------- |
| `mi-easy-default-full`           |              47.3 → 48.0 | +1.3% [−2.2%, +5.2%]    |             118.7 → 115.3 | −2.4% [−7.5%, +1.8%]    |
| `mi-easy-exterior-heavy`         |              17.2 → 17.4 | +3.7% [−0.4%, +7.4%]    |               33.3 → 34.0 | −0.1% [−4.2%, +4.0%]    |
| `mi-fallback-ambiguous-boundary` |              66.9 → 69.4 | +3.7% [+2.8%, +8.7%]    |             169.1 → 174.9 | +0.9% [−4.8%, +3.8%]    |
| `mi-fallback-weak-attraction`    |             557.7 → 57.3 | −89.6% [−90.2%, −89.0%] |             724.6 → 103.3 | −86.8% [−87.6%, −85.9%] |
| `mi-hard-supplied-126x`          |            193.9 → 128.4 | −33.1% [−37.1%, −32.4%] |             313.5 → 213.3 | −28.5% [−35.0%, −25.8%] |
| `mi-hard-supplied-13x`           |            162.9 → 110.1 | −33.3% [−34.6%, −30.4%] |             316.6 → 247.7 | −19.7% [−22.7%, −16.5%] |
| `mi-hard-rabbit-boundary`        |            171.3 → 109.2 | −37.2% [−39.3%, −32.8%] |             401.2 → 316.4 | −20.8% [−25.9%, −18.9%] |
| `mi-scale-6mx-basilica-rim`      |             280.5 → 62.8 | −77.5% [−78.5%, −76.0%] |             419.7 → 123.9 | −70.2% [−70.9%, −69.5%] |

Firefox's exterior-heavy and ambiguous-boundary views sit closest to the
limit: point estimates +3.7%, upper interval ends +7.4% and +8.7%. The
ambiguous-boundary interval excludes 0, so a small real cost there is likely.

## Change since b642fd6 (no answer changes)

| Case                             | Firefox ref → current ms | Firefox change [95%]    | Chromium ref → current ms | Chromium change [95%]   |
| -------------------------------- | -----------------------: | ----------------------- | ------------------------: | ----------------------- |
| `mi-easy-default-full`           |              76.4 → 47.3 | −40.7% [−41.8%, −36.7%] |              108.1 → 88.5 | −17.7% [−20.8%, −15.0%] |
| `mi-easy-exterior-heavy`         |              28.8 → 17.6 | −40.4% [−41.7%, −37.6%] |               26.1 → 24.7 | −5.0% [−10.5%, −3.3%]   |
| `mi-fallback-ambiguous-boundary` |              77.9 → 69.9 | −18.1% [−21.4%, −16.6%] |             162.4 → 130.7 | −19.1% [−20.1%, −17.9%] |
| `mi-fallback-weak-attraction`    |              57.0 → 55.6 | −5.5% [−12.4%, +1.4%]   |               74.3 → 74.1 | −1.3% [−4.3%, +2.2%]    |
| `mi-hard-supplied-126x`          |            141.9 → 130.0 | −12.1% [−14.8%, −5.2%]  |             167.3 → 169.0 | −1.2% [−4.8%, −0.2%]    |
| `mi-hard-supplied-13x`           |            123.6 → 104.2 | −14.1% [−16.0%, −8.4%]  |             191.6 → 185.5 | −1.5% [−6.3%, +0.8%]    |
| `mi-hard-rabbit-boundary`        |            126.2 → 104.0 | −12.0% [−14.6%, −3.4%]  |             236.0 → 228.4 | −1.7% [−5.3%, −0.7%]    |
| `mi-scale-6mx-basilica-rim`      |              64.7 → 59.0 | +0.4% [−4.0%, +5.8%]    |               90.9 → 90.6 | −0.9% [−4.4%, +1.4%]    |

Output hashes are identical between `b642fd6` and current for all eight views
in both engines. A first Chromium run started at load 2.75, right after the
Firefox run, and was discarded and rerun at load 0.92.

## Notes

- Absolute times differ between runs of the same arm (for example the current
  default view in Chromium: 88.5 ms here, 115.3 ms in the no-analytic run):
  cold-worker times move with the browser process's state, which is why the
  rule uses paired ratios within one run.
- The Node figures that prompted the decision (far-exterior +7.0%
  [+5.9%, +9.9%] and weak attraction +3.7% [+2.9%, +11.7%] against
  `b642fd6`) are in the
  [2026-10-20 evidence](../2026-10-20-ab73117-analytic-cost/summary.md). Here
  the same build is 40% (Firefox) and 5% (Chromium) faster than `b642fd6` on
  exterior-heavy and unchanged within noise on weak attraction, and about 87%
  to 90% faster than no-analytic on weak attraction.
- **Not covered:** the coarse (scalar) pass. The cold-worker tool times the
  stable pass only; the coarse pass was last measured in Node (2026-10-20,
  within ±1%).
- The raw JSON records the arm bundles' scratchpad paths; the bundles were not
  kept.

## Files

- `firefox-no-analytic-vs-current.json`, `chromium-no-analytic-vs-current.json`:
  the gate runs.
- `firefox-b642fd6-vs-current.json`, `chromium-b642fd6-vs-current.json`: the
  comparison with the previous build.
- `no-analytic-variant.diff`: the patch that makes the no-analytic arm.
- `manifest.sha256`: SHA-256 of every other file in this folder.
