# Phase 0 target-hardware benchmark

Measured 2026-08-02 MDT (2026-08-03 UTC) at repository commit
`7c991a27792f6b23d099d6ae2b56928485da2ab6`.

## Gate decision

Select the existing binary64 Worker CPU renderer as the initial production
path and retain WebGPU only as a later optimization experiment. The CPU path
works in both measured browsers, keeps the main thread free of long tasks, and
meets the preliminary interaction budgets below. Direct WebGPU is much faster,
but it was unavailable in the measured Firefox configuration, disagreed with
the CPU status for about 0.40% of full-set pixels, cannot preempt submitted
work, and loses distinct parameter columns below a whole-set-safe `spanY` of
approximately `1e-4` at 768 pixels.

Defer production perturbation. The single test tile is promising, but it
validates only escape behavior on one location. It does not yet implement
cycle/multiplier semantics, glitch recovery, tile subdivision, or rebasing.
The disposable benchmark is already 876 lines across its browser, WebGPU,
high-precision fixture, and runner code, which is material complexity compared
with the bounded first release.

Use `spanY = 1e-8` (magnification `2.5e8×` from the default view) as the
evidence-backed preliminary CPU zoom bound. The perturbation experiment has
80-digit comparison evidence at that scale. The currently configured `1e-10`
UI bound remains unvalidated and should not be claimed as supported until an
equivalent direct binary64/high-precision sweep is recorded. A direct `f32`
renderer would instead require a conservative whole-set bound of `1e-4`
(`25,000×`) at 768 pixels.

## Target hardware and software

| Item               | Measured baseline                                                          |
| ------------------ | -------------------------------------------------------------------------- |
| CPU                | Intel Core i7-1185G7, 4 cores / 8 threads, 3.0–4.8 GHz                     |
| CPU governor       | `powersave`                                                                |
| GPU                | Intel TigerLake-LP GT2 Iris Xe (`8086:9a49`), `i915` kernel driver         |
| Graphics userspace | Mesa DRI/Vulkan 26.1.5                                                     |
| Memory             | 16,079,816 kB (~15.3 GiB), 8 GiB swap                                      |
| OS                 | Fedora Linux, kernel `7.1.5-201.fc44.x86_64`, Wayland                      |
| Chromium run       | Chrome for Testing 147.0.7727.15, headed, hardware WebGPU available        |
| Firefox run        | Firefox 148.0.2; CPU timed headless; WebGPU unavailable headed or headless |
| Repository runner  | Node 22.22.2 / npm 10.9.7                                                  |

The repository pins Node 24.18.0 and npm 11.16.0. The mismatch affects only
the Playwright orchestration process: all timed rendering ran in the browser's
worker or GPU process. The installed managed Chrome 151 and Firefox 153
binaries were not present, so the measurements must be refreshed before those
browser versions become the release baseline.

## Worker CPU results

Balanced quality was used throughout: 512 maximum iterations, period through
32, and coarse stride 8. Latencies are end-to-end from a fresh worker request
through receipt of the transferred RGBA frame. Seven samples were used except
for the three-sample 1024-pixel capacity check.

| Browser / view              | Coarse median / max |  Stable median / max | Unresolved |      Semantic / RGBA / estimated peak |
| --------------------------- | ------------------: | -------------------: | ---------: | ------------------------------------: |
| Chrome, full set 512²       |      63.6 / 69.2 ms |     661.3 / 677.0 ms |     0.798% | 5.25 / 1.00 / 46 Bpp = 11.50 MiB peak |
| Chrome, rabbit detail 768²  |    105.9 / 115.9 ms | 1,613.9 / 1,629.5 ms |         0% |         11.81 / 2.25 / 25.88 MiB peak |
| Chrome, full set 1024²      |    184.4 / 188.6 ms | 1,960.2 / 1,977.8 ms |     0.788% |         21.00 / 4.00 / 46.00 MiB peak |
| Firefox, full set 512²      |          65 / 66 ms |         684 / 691 ms |     0.798% |                 same layout as Chrome |
| Firefox, rabbit detail 768² |        110 / 116 ms |     1,734 / 1,808 ms |         0% |                 same layout as Chrome |

The 46-byte-per-pixel peak estimate covers simultaneous coarse and stable
semantic arrays plus one RGBA colorization buffer. It excludes worker/browser
runtime overhead. The stable semantic representation is 21 Bpp and each RGBA
transfer is 4 Bpp.

Cancellation response over 12 detailed 768² samples was 39.1 ms median and
48.2 ms maximum in Chrome, and 9 ms median / 45 ms maximum in Firefox. No main
thread task longer than 50 ms was observed in either run.

## Direct WebGPU results

The disposable shader used `f32`, the same analytic period-1/period-2 checks,
512 iterations, period through 32, a `1e-5` recurrence tolerance, and a
`1e-3` forward-closure tolerance. Latency includes dispatch, semantic-buffer
copy, and CPU readback. Each value is the median of seven warmed samples.

| View               | GPU latency | CPU stable / GPU speedup | Status mismatch | Period mismatch | GPU unresolved |
| ------------------ | ----------: | -----------------------: | --------------: | --------------: | -------------: |
| Full set 512²      |     33.1 ms |                    20.0× |         0.3998% |         0.0420% |        0.4333% |
| Rabbit detail 768² |     14.9 ms |                   108.3× |              0% |              0% |             0% |
| Full set 1024²     |    100.2 ms |                    19.6× |         0.4057% |         0.0387% |        0.4154% |

For pixels where both paths found the same attracting period, the full-set
512² multiplier absolute error was `2.81e-8` median, `7.62e-6` p95, and
`4.23e-3` maximum. Stability absolute error was `3.90e-8` median, `4.56e-6`
p95, and `9.12e-4` maximum. The rabbit-detail p95 errors were `6.92e-6` for
multiplier magnitude and `7.65e-6` for stability.

The conservative `f32` mapping sweep checked representative real centers from
`-1.95` through `0.282`. All 768 columns remained distinct at `spanY=1e-4`.
At `7.5e-5`, 18.1% of columns collapsed; at `5e-5`, 45.4% collapsed. This is a
coordinate-representation limit before dynamical disagreement is considered.
Submitted WebGPU commands cannot be preempted; application cancellation can
discard their result but does not reclaim the device immediately.

## Perturbation tile

The tile was 256² at
`c = -0.743643887037151 + 0.131825904205330i`, `spanY=1e-8`, and 1,024
iterations. Python `decimal` generated a 1,025-point reference orbit and 256
sparse direct samples at 80 significant digits. The GPU evaluated the delta
recurrence in `f32`.

| Measurement                |                       Result |
| -------------------------- | ---------------------------: |
| Median / maximum latency   |                 7.1 / 8.1 ms |
| Reference / output buffers |        8,200 / 524,288 bytes |
| GPU sparse status mismatch |                      0 / 256 |
| Comparable escaped samples |                          144 |
| GPU escape-iteration error |   0 median, p95, and maximum |
| CPU sparse status mismatch |                      0 / 256 |
| CPU escape-iteration error |   0 median, p95, and maximum |
| Detected glitch fraction   |                           0% |
| Rebasing                   | Not implemented or exercised |

This result establishes feasibility for the one sampled tile, not a general
perturbation renderer. In particular, zero observed glitches is not evidence
that glitch handling can be omitted.

## Preliminary budgets

These budgets include modest headroom over the measured maxima and are
normative only for this hardware class at Balanced quality:

- coarse frame: 150 ms at 768²; 250 ms at the 1024² cap;
- stable frame: 2.0 s at 768²; 2.25 s at the 1024² cap;
- Worker CPU cancellation response: 50 ms p95;
- main-thread long tasks caused by rendering: zero tasks over 50 ms;
- maximum raster: 1024², 46 MiB estimated renderer peak, 4 MiB per RGBA transfer;
- Balanced numerical search: 512 iterations and period through 32;
- direct-GPU acceptance before production use: status mismatch no more than
  0.1%, period mismatch no more than 0.01%, multiplier/stability absolute error
  no more than `1e-5` at p95, plus a defined unresolved policy; and
- preliminary CPU zoom: `spanY >= 1e-8`; direct `f32` zoom:
  `spanY >= 1e-4` at 768² across the whole set.

The direct GPU experiment fails the proposed status and period disagreement
budgets on the full-set views. Perturbation passes its sampled escape checks
but has insufficient semantic and glitch/rebase coverage for production.

## Reproduction

Start Vite, then run the harness with an explicit browser binary. A headed
Chromium session is required on this Linux configuration to expose the Iris Xe
WebGPU adapter.

```sh
npm run dev -- --host 127.0.0.1

PHASE0_BROWSER=chromium \
PHASE0_BROWSER_EXECUTABLE=/path/to/chrome \
PHASE0_OUTPUT=/tmp/phase0-chromium.json \
node tools/run-phase0-benchmark.mjs

PHASE0_BROWSER=firefox \
PHASE0_BROWSER_EXECUTABLE=/path/to/firefox \
PHASE0_HEADLESS=1 \
PHASE0_OUTPUT=/tmp/phase0-firefox.json \
node tools/run-phase0-benchmark.mjs
```

The browser harness and disposable shaders are in
[`tools/phase0-browser-benchmark.ts`](../tools/phase0-browser-benchmark.ts).
The independent high-precision input is generated by
[`tools/generate_perturbation_fixture.py`](../tools/generate_perturbation_fixture.py).
