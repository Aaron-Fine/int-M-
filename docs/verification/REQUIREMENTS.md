# Phase 1 UX verification matrix

This matrix distinguishes implemented behavior from evidence sufficient to
close a normative requirement. Test names are stable evidence references; CI
provides the execution record in current Firefox and Chromium.

| Requirement                                | State       | Automated evidence                                                                                                                          | Remaining evidence                                                                       |
| ------------------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `MI-UX-001` First-use rendering            | **Pass**    | `starts with a useful, explained semantic view`                                                                                             | None                                                                                     |
| `MI-UX-002` Sensible defaults              | **Pass**    | First-use and quality-profile browser scenarios; `quality profiles` unit suite                                                              | None                                                                                     |
| `MI-UX-003` Progressive first frame        | **Partial** | `CpuRenderer` emits coarse then stable frames                                                                                               | Target-device coarse-frame budget and browser trace                                      |
| `MI-UX-004` Truthful intermediate results  | **Pass**    | Unresolved orbit and unresolved texture unit tests                                                                                          | None                                                                                     |
| `MI-UX-005` Nonblocking first-use guidance | **Partial** | First-use browser scenario verifies visible, dismissible guidance while rendering starts                                                    | Browser trace showing guidance never delays first frame                                  |
| `MI-UX-006` Focused primary controls       | **Pass**    | Browser scenarios exercise view, quality, tools, zoom, reset, catalog, and inspection                                                       | None                                                                                     |
| `MI-UX-007` Responsive navigation          | **Partial** | Live pointer-pan/cleanup, area/keyboard navigation, presentation marks, viewport math, cancellation tests                                   | Target-device response, cancellation p95, and long-task budgets                          |
| `MI-UX-008` Restore default view           | **Pass**    | Keyboard/reset browser scenario                                                                                                             | None                                                                                     |
| `MI-UX-009` Zoom-bound feedback            | **Pass**    | Browser feedback at both zoom bounds; named-ceiling derivation and viewport clamp unit tests                                                | None                                                                                     |
| `MI-UX-010` Semantic legend                | **Pass**    | Semantic-view and definition browser scenarios                                                                                              | None                                                                                     |
| `MI-UX-011` Non-color state distinction    | **Partial** | Semantic color tests, unresolved texture, persistent crosshair/ring selection marker, and adaptive-label browser scenario                   | Manual simulated color-vision and canvas review                                          |
| `MI-UX-012` Evidence-bounded inspector     | **Pass**    | Arbitrary escaped/attracting/unresolved browser assertions; viewport-aware coordinate policy; high-precision fixture and orbit tests        | None                                                                                     |
| `MI-UX-013` Nonblocking status and failure | **Pass**    | Injected worker failure, automatic recovery, persistent status, continued controls, and manual-retry browser scenario; lifecycle unit tests | None                                                                                     |
| `MI-UX-014` Renderer recovery/fallback     | **Pass**    | Selected CPU default; bounded automatic worker/render recovery and manual retry; future optional-renderer CPU fallback remains normative    | None for the CPU-only Phase 1 product                                                    |
| `MI-UX-015` Keyboard operation             | **Partial** | Keyboard navigation and catalog selection browser scenarios                                                                                 | Manual full-tab-order and visible-focus review                                           |
| `MI-UX-016` Accessible interface           | **Partial** | Axe WCAG A/AA scans in primary and inspector states, in Firefox and Chromium                                                                | Manual WCAG 2.2 AA review, canvas alternative, 200% zoom/reflow, and color-vision checks |

## Manual accessibility record

Record reviewer, date, browser, operating system, viewport, and result for each
row. A blank row is not a pass.

| Check                                                                       | Firefox | Chrome  | Notes |
| --------------------------------------------------------------------------- | ------- | ------- | ----- |
| Full keyboard tab order and visible focus                                   | Not run | Not run |       |
| Pointer operations have keyboard alternatives                               | Not run | Not run |       |
| Canvas has an understandable accessible name and adjacent textual semantics | Not run | Not run |       |
| Text zoom/reflow at 200%                                                    | Not run | Not run |       |
| High-contrast or forced-colors mode                                         | Not run | Not run |       |
| Protanopia simulation                                                       | Not run | Not run |       |
| Deuteranopia simulation                                                     | Not run | Not run |       |
| Tritanopia simulation                                                       | Not run | Not run |       |
| Unresolved, selected, escaped, and catalog states remain distinguishable    | Not run | Not run |       |
