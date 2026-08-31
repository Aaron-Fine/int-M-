# Phase 1 final-candidate automation — 2026-08-29

## Candidate and target

| Field      | Value                                                                  |
| ---------- | ---------------------------------------------------------------------- |
| Commit     | `4fd4fdd98009d141f1a82a7524b3e9b12caf8f54`                             |
| Production | <https://mandelbrot.ourfinefamily.com/> and <https://int-m.pages.dev/> |
| Host       | `wells`, Dell Latitude 5520                                            |
| OS         | Fedora Linux 44 KDE, Wayland, kernel `7.1.10-200.fc44.x86_64`          |
| Display    | Internal 1920×1080 panel, scale 1, sRGB profile                        |
| CPU        | Intel Core i7-1185G7, 4 cores / 8 threads                              |
| GPU        | Intel Iris Xe (`8086:9a49`), `i915`                                    |
| Memory     | 15 GiB                                                                 |
| Toolchain  | Node 24.19.0; final gate replayed with cached npm 11.19.0              |

## Verification result

- `npm run check`: **Pass** — formatting, ESLint, all TypeScript projects,
  eleven generated catalog centers, six 80-digit fixtures, 16 unit-test files
  with 81 tests, and the production build.
- `npm run test:browser`: **Pass** — 31 managed Chromium/Firefox scenarios;
  one Firefox-only worker-count scenario is intentionally skipped because it
  requires Chromium CDP. This run includes the new pointer-pan/Escape-cancel
  regression and build-revision check.
- Production build assets:
  `index-CJQbjpJz.js`, `index-A5mS_k6j.css`,
  `render.worker-DLk4pHZz.js`, and `tile.worker-glxXKSkS.js`.

The first sandboxed unit and browser attempts were prevented from spawning a
nested build and binding the Vite test server. Replays outside that process
sandbox passed; those environmental denials were not product-test failures.

## Exact-commit UI-path budgets

Command, from a temporary working directory so previously committed vision
screenshots were not overwritten:

```sh
PHASE1_COMMIT=4fd4fdd98009d141f1a82a7524b3e9b12caf8f54 \
PHASE1_SAMPLES=5 \
PHASE1_CANCEL_PRESSES=24 \
PHASE1_SKIP_PRODUCTION=1 \
PHASE1_HEADLESS=1 \
PHASE1_OUTPUT=/home/aaron/int-M-/evidence/phase-1/ui-path-4fd4fdd-2026-08-29.json \
node /home/aaron/int-M-/tools/measure_ui_path.mjs
```

Raw samples:
[ui-path-4fd4fdd-2026-08-29.json](ui-path-4fd4fdd-2026-08-29.json).
Times are request to same-request presentation; results show median / maximum.

| Metric                            |  Budget |     Chromium 151 |     Firefox 153 | Result     |
| --------------------------------- | ------: | ---------------: | --------------: | ---------- |
| Coarse 768²                       | ≤150 ms |  84.4 / 101.8 ms |      87 / 95 ms | Pass       |
| Stable 768²                       |  ≤2.0 s |  0.528 / 0.568 s | 0.587 / 0.698 s | Pass       |
| Coarse 1024²                      | ≤250 ms | 133.6 / 136.8 ms |    136 / 148 ms | Pass       |
| Stable 1024²                      | ≤2.25 s |  0.867 / 0.955 s | 0.969 / 1.000 s | Pass       |
| In-flight cancellation p95        |  ≤50 ms |          13.8 ms |            1 ms | Pass       |
| Main-thread long tasks over 50 ms |       0 |                0 | API unavailable | Pass / n/a |

Both browsers kept the first-use guide visible through the first stable frame,
started one supervisor plus four tile workers, produced no application console
or page errors, and had no horizontal overflow under the harness's 2× zoom
check. The unforced production canvas was 1024×640 at DPR 1.

## Boundary

The timing replay is headless managed-browser evidence on the target hardware.
It supports the Phase 1 numerical budgets but does not replace real-pointer,
visible-focus, screen-reader, native/high-contrast, 200% browser text-zoom, or
current branded-release-browser observation. Broader rendering optimization is
Phase 2 work unless a Phase 1 budget regresses.
