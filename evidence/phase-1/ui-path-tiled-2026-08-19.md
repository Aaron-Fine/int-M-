# Phase 1 tiled Worker CPU UI-path evidence — 2026-08-19

## Candidate and target

| Field                        | Value                                                                       |
| ---------------------------- | --------------------------------------------------------------------------- |
| Candidate                    | Local production preview `http://127.0.0.1:4173/` from Path 2 Task 5        |
| Parent SHA in JSON           | `9d93759ce6834e3cf6f031d14d5475a0381d2c27` (Task 4 wiring)                  |
| Reviewer and local date/time | Automated collection, 2026-08-18 23:30 MDT (`measuredAt` 2026-08-19T05:30Z) |
| OS and display scale         | Fedora Linux 44, Wayland, 96 dpi, `devicePixelRatio` 1                      |
| CPU / logical cores          | Intel Core i7-1185G7, 4 cores / 8 threads, `powersave`                      |
| GPU and driver               | Intel Iris Xe (`8086:9a49`), Mesa 26.1.6, `i915`                            |
| Memory                       | 15 GiB                                                                      |
| Viewport                     | 1440×1200 CSS px                                                            |
| Canvas backing               | Forced 768² and 1024², plus unforced 16:10 sidecar 1024×640                 |
| `hardwareConcurrency`        | 8                                                                           |
| Tile pool                    | `clampTileWorkers` → **4**; after first stable: 1 supervisor + 4 tiles      |

This is the same four-core integrated-graphics class recorded in
[the Phase 0 benchmark](../../docs/PHASE0_BENCHMARK.md) and the
[2026-08-18 serial baseline](target-device-ui-path-2026-08-18.md).

## Command

```sh
npm run build:assets
npm run preview
PHASE1_COMMIT=$(git rev-parse HEAD) \
  PHASE1_SAMPLES=11 \
  PHASE1_CANCEL_PRESSES=24 \
  PHASE1_SKIP_PRODUCTION=1 \
  PHASE1_OUTPUT=evidence/phase-1/ui-path-tiled-2026-08-19.json \
  node tools/measure_ui_path.mjs
```

Harness: headed Playwright 1.62.1. Balanced quality. Each presentation sample
resets to the default viewport, then presses `+` (`spanY ≈ 1.47`). Cancellation
samples pan with ArrowRight after a coarse frame so the worker is in flight.
Raw paired samples:
[ui-path-tiled-2026-08-19.json](ui-path-tiled-2026-08-19.json).

## Browsers

| Family   | Binary                        | Version       | Notes                                                                       |
| -------- | ----------------------------- | ------------- | --------------------------------------------------------------------------- |
| Chromium | Playwright Chrome for Testing | 151.0.7922.34 | Branded `google-chrome-stable` is not installed                             |
| Firefox  | Playwright Firefox            | 153.0         | System Firefox 153.0.3 is installed; Playwright cannot attach juggler to it |

## Nested workers

After the cold first stable frame, both browsers had started the nested pool:

| Browser      | `hardwareConcurrency` | Inferred pool | Observed workers                                                       |
| ------------ | --------------------: | ------------: | ---------------------------------------------------------------------- |
| Chromium 151 |                     8 |             4 | CDP `Target.getTargets`: 1 `mandelbrot-renderer` + 4 `mandelbrot-tile` |
| Firefox 153  |                     8 |             4 | `page.workers()`: 1 `render.worker` + 4 `tile.worker`                  |

Firefox nested module workers **do start**. They are visible to Playwright's
worker list. CDP `Target.getTargets` is Chromium-only, so the recovery leak
count is proved in Chromium Playwright (`recovery_doesNotLeakNestedWorkers`:
still `1+4` after one `failRenderer`, not `2*(1+4)`).

## Presentation budgets

Times are `mi:render-request` → `mi:coarse-presented` / `mi:stable-presented`
for the same request ID. Eleven samples per forced-size cell. Budget language
is “at most”.

| Metric (Balanced)                   | Budget | Chromium 151 median / max | Firefox 153 median / max | Result     |
| ----------------------------------- | -----: | ------------------------: | -----------------------: | ---------- |
| Coarse presentation at 768²         | 150 ms |           99.1 / 102.5 ms |             105 / 114 ms | Pass       |
| Stable presentation at 768²         |  2.0 s |           0.566 / 0.619 s |          0.691 / 0.756 s | Pass       |
| Coarse presentation at 1024²        | 250 ms |          142.6 / 154.1 ms |             158 / 176 ms | Pass       |
| Stable presentation at 1024²        | 2.25 s |           0.899 / 0.969 s |          1.240 / 1.389 s | **Pass**   |
| Cancellation acknowledgement p95    |  50 ms |            13.5 / 13.6 ms |                 2 / 1 ms | Pass       |
| Rendering-related long tasks >50 ms |      0 |                         0 |    0 (no `longtask` API) | Pass / n/a |

Chromium 1024² stable samples (ms): 872.3, 904.2, 876.1, 852.2, 915.4, 903.2,
854.4, 833.7, 927.9, 969.0, 898.7. Every sample is under 2250 ms.

Firefox 1024² stable samples (ms): 1127, 1147, 1145, 1240, 1257, 1297, 1280,
1224, 1214, 1389, 1270. Every sample is under 2250 ms.

Versus the 2026-08-18 serial baseline (n=5): Chromium 1024² stable dropped from
2364 / 2381 ms to 899 / 969 ms (**2.63×** median). Firefox dropped from
2627 / 2664 ms to 1240 / 1389 ms (**2.12×** median).

In-flight cancellation counts: Chromium 47 pairs at each size; Firefox 24 at
each size. Worker `cancelled` messages were recorded. Tiled abort rejects on
the supervisor without waiting for child replies; Firefox p95 of 1–2 ms is
consistent with that.

## Worker-stage marks (Task 0)

Copied onto `mi:worker-*` from `frame.workerTiming`. Tiled stable `classifyMs`
is supervisor wall (first tile dispatch → last band merge). Child yield waits
are not summed onto the UI mark (`stableYieldCount` is 0 on the tiled path).

| 1024² Balanced median         | Chromium 151 | Firefox 153 |
| ----------------------------- | -----------: | ----------: |
| e2e stable                    |     898.7 ms |     1240 ms |
| coarse classify               |      39.6 ms |       40 ms |
| coarse colorize               |      49.6 ms |       52 ms |
| coarse yield wait (16 awaits) |      42.0 ms |       52 ms |
| stable classify (tiled wall)  |     707.5 ms |     1030 ms |
| stable colorize               |      49.3 ms |       62 ms |

Task 0 serial Chromium 1024² stable classify was 1638.6 ms plus 527.9 ms yield.
Tiled wall 707.5 ms versus that 1638.6 ms classify is **2.32×**. Firefox tiled
wall 1030 ms versus the 2026-08-18 2627 ms e2e is **2.12×** end-to-end. That is
not ≲ 1.3×; nested workers overlap. Per-band CPU sum (first `tile-classify` →
last `tile-result` vs Σ child `classifyMs`) was not added to the tile protocol;
the wall/e2e ratios above are the overlap evidence in this run.

## Cold first-stable and 16:10 sidecar

Cold first-stable (navigation → first `data-render-stage=stable`, default
viewport, unforced backing, pool not yet warm): Chromium **586 ms**, Firefox
**809 ms**.

Unforced 16:10 sidecar after the forced-size cases: backing **1024×640** in
both browsers (`css` 1082×676.25). Shipping layout remains 16:10 capped at
`maxRenderEdge`.

## First-use and console

The first-use guide remained visible until **Stable frame**, then was
dismissible, in both browsers. No application `pageerror` events.

## Limitations

- Headed Playwright, not a clean branded Chrome or Firefox tab.
- Forced 768² / 1024² cells are the closeout budget cells; the shipping layout
  sidecar is 1024×640.
- Samples are one `+` from the default viewport, not the Phase 0 rabbit tile.
- Pointer-pan preview and Escape-cancel remain manual.
- Firefox has no `longtask` PerformanceObserver in this run.
- Firefox recovery leak count cannot use CDP; Chromium CDP is the proof.
- Tiled `mi:worker-stable-classify` is supervisor wall, not Σ band CPU.

## Disposition

Forced 1024² stable **median and max** are ≤ 2250 ms in Chromium 151 and
Firefox 153. Coarse budgets, 768² stable, cancel in-flight p95 ≤ 50 ms, and
Chromium long-tasks >50 ms remain 0. Nested tile workers start in both
browsers with pool size 4. Path 2 Task 5 budget gate **passes**.
