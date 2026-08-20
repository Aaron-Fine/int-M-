# Phase 1 target-device UI-path evidence — 2026-08-18

## Candidate and target

| Field                        | Value                                                            |
| ---------------------------- | ---------------------------------------------------------------- |
| Candidate                    | Local production preview `http://127.0.0.1:4173/` from `3b549eb` |
| Commit SHA                   | `3b549ebcfad610b163750de0627d0bbea6509134`                       |
| Reviewer and local date/time | Automated collection, 2026-08-18 21:19 MDT                       |
| OS and display scale         | Fedora Linux 44, Wayland, 96 dpi, `devicePixelRatio` 1           |
| CPU / logical cores          | Intel Core i7-1185G7, 4 cores / 8 threads, `powersave`           |
| GPU and driver               | Intel Iris Xe (`8086:9a49`), Mesa 26.1.6, `i915`                 |
| Memory                       | 15 GiB                                                           |
| Viewport                     | 1440×1200 CSS px                                                 |
| Canvas backing               | Forced 768² and 1024² through the live explorer stack            |

This is the same four-core integrated-graphics class recorded in
[the Phase 0 benchmark](../../docs/PHASE0_BENCHMARK.md).

## Command

```sh
npm run build:assets
npm run preview
PHASE1_COMMIT=$(git rev-parse HEAD) \
  PHASE1_OUTPUT=evidence/phase-1/ui-path-raw-2026-08-18.json \
  PHASE1_SAMPLES=5 \
  PHASE1_CANCEL_PRESSES=24 \
  node tools/measure_ui_path.mjs
```

Harness: headed Playwright 1.62.0. Balanced quality. Each presentation sample
resets to the default viewport, then presses `+` (`spanY ≈ 1.47`). Cancellation
samples pan with ArrowRight after a coarse frame so the worker is in flight.
Raw paired samples:
[ui-path-raw-2026-08-18.json](ui-path-raw-2026-08-18.json).

Supporting Node `CpuRenderer` timings (not UI-path):
[cpu-node-2026-08-18.json](cpu-node-2026-08-18.json), refreshed under Node
24.19.0. Browser UI-path samples were collected earlier the same evening and
do not depend on the Node version of the Playwright host.

## Browsers

| Family   | Binary                        | Version       | Notes                                                                       |
| -------- | ----------------------------- | ------------- | --------------------------------------------------------------------------- |
| Chromium | Playwright Chrome for Testing | 151.0.7922.34 | Branded `google-chrome-stable` is not installed                             |
| Firefox  | Playwright Firefox            | 153.0         | System Firefox 153.0.3 is installed; Playwright cannot attach juggler to it |

## Presentation budgets

Times are `mi:render-request` → `mi:coarse-presented` / `mi:stable-presented`
for the same request ID. Five samples per cell. Budget language is “at most”.

| Metric (Balanced)                   | Budget | Chromium 151 median / max | Firefox 153 median / max | Result     |
| ----------------------------------- | -----: | ------------------------: | -----------------------: | ---------- |
| Coarse presentation at 768²         | 150 ms |            88.5 / 97.8 ms |             101 / 107 ms | Pass       |
| Stable presentation at 768²         |  2.0 s |           1.465 / 1.606 s |          1.605 / 1.621 s | Pass       |
| Coarse presentation at 1024²        | 250 ms |              131 / 138 ms |             147 / 159 ms | Pass       |
| Stable presentation at 1024²        | 2.25 s |           2.364 / 2.381 s |          2.627 / 2.664 s | **Fail**   |
| Cancellation acknowledgement p95    |  50 ms |            12.9 / 13.6 ms |               24 / 14 ms | Pass       |
| Rendering-related long tasks >50 ms |      0 |                         0 |    0 (no `longtask` API) | Pass / n/a |

Chromium 1024² stable samples: 2368.7, 2355.0, 2381.0, 2364.1, 2345.9 ms.
Firefox 1024² stable samples: 2610, 2664, 2653, 2627, 2597 ms. Every 1024²
stable sample missed 2250 ms.

In-flight cancellation counts: Chromium 47 pairs at each size; Firefox 28
(768²) and 30 (1024²). Worker `cancelled` messages were recorded.

## First-use and console

The first-use guide remained visible until **Stable frame**, then was
dismissible, in both browsers. Chromium logged only `GET /favicon.ico` 404
from the Vite preview origin. Firefox logged no warnings or errors. No
application `pageerror` events.

## Automated accessibility support (not a home-test substitute)

Keyboard tab order from the skip link through Guide, Interior view, Quality,
Pan, Zoom area, Catalog, Zoom out, Zoom in, Reset, canvas, and the inspector
disclosure. Primary controls showed the CSS focus ring (`box-shadow` on
`:focus-visible`). The `How to read these values` disclosure did not expose a
computed `box-shadow` in this harness.

CSS `zoom: 2` at 1440×1200 produced no horizontal overflow
(`scrollWidth === clientWidth`). This is not browser text zoom.

Chromium `Emulation.setEmulatedVisionDeficiency` screenshots of the default
view with Main cardioid selected:

- Stability / Multiplier / Period × none, protanopia, deuteranopia, tritanopia
  under `evidence/phase-1/vision-*.png`
- Catalog marker shapes (diamond / triangle / square), the selected-point
  crosshair, and the unresolved hatch remain visible without relying on hue
- Period view stays separable under deuteranopia by category color plus marker
  geometry; this is supporting evidence for `MI-UX-011`, not a completed
  manual color-vision review

## Limitations

- Headed Playwright, not a clean branded Chrome or Firefox tab.
- Canvas size was forced to 768² / 1024²; the shipping layout is 16:10 capped
  at the quality profile’s `maxRenderEdge`.
- Samples are one `+` from the default viewport, not the Phase 0 rabbit tile.
- Pointer-pan preview and Escape-cancel remain manual; this harness does not
  claim those checks.
- Firefox has no `longtask` PerformanceObserver in this run.
- Assistive technology, native high contrast, and 200% **text** zoom were not
  executed.

## Disposition

UI-path coarse, 768² stable, cancellation p95, and Chromium long-task budgets
pass on this hardware. **1024² stable presentation misses 2.25 s in both
browser families** and blocks Phase 1 closeout for `MI-UX-003` / `MI-UX-007`
until the budget is met or explicitly revised. Manual home-test rows remain
open.
