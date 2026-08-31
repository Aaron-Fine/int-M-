# Phase 1 UX verification matrix

This matrix distinguishes implemented behavior from evidence sufficient to
close a normative requirement. **OBE** identifies a retained historical
requirement that is no longer part of the active baseline. Test names are
stable references into `tests/e2e/explorer.spec.ts`; the dated
[final-candidate automation record](../../evidence/phase-1/automation-2026-08-29.md)
records the exact commit and local Firefox/Chromium replay.

| Requirement                                | State    | Automated evidence                                                                                                                                                                                                                           | Remaining evidence                      |
| ------------------------------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `MI-UX-001` First-use rendering            | **Pass** | `starts with a useful, explained semantic view`                                                                                                                                                                                              | None                                    |
| `MI-UX-002` Sensible defaults              | **Pass** | First-use and quality-profile browser scenarios; `quality profiles` unit suite                                                                                                                                                               | None                                    |
| `MI-UX-003` Progressive first frame        | **Pass** | Ordered coarse/stable scenario and `CpuRenderer` unit evidence; exact-candidate target replay passes every 768²/1024² presentation budget ([2026-08-29 record](../../evidence/phase-1/automation-2026-08-29.md))                             | None                                    |
| `MI-UX-004` Truthful intermediate results  | **Pass** | Unresolved orbit and unresolved texture unit tests                                                                                                                                                                                           | None                                    |
| `MI-UX-005` Nonblocking first-use guidance | **Pass** | First-use browser scenario keeps the guide visible and controls enabled while rendering reaches Stable frame                                                                                                                                 | None                                    |
| `MI-UX-006` Focused primary controls       | **Pass** | Browser scenarios exercise view, quality, tools, zoom, reset, catalog, and inspection                                                                                                                                                        | None                                    |
| `MI-UX-007` Responsive navigation          | **Pass** | Area/keyboard navigation; synthetic pointer-pan/Escape regression; presentation/cancellation marks; target budgets; reviewer-accepted release-browser results in the [manual closeout](../../evidence/phase-1/manual-closeout-2026-08-29.md) | None                                    |
| `MI-UX-008` Restore default view           | **Pass** | Keyboard/reset browser scenario                                                                                                                                                                                                              | None                                    |
| `MI-UX-009` Zoom-bound feedback            | **Pass** | Browser feedback at both bounds; named-ceiling derivation and viewport clamp unit tests                                                                                                                                                      | None                                    |
| `MI-UX-010` Semantic legend                | **Pass** | Semantic-view and definition browser scenarios                                                                                                                                                                                               | None                                    |
| `MI-UX-011` Non-color state distinction    | **Pass** | Semantic color/texture tests, persistent crosshair/ring marker, shape-coded catalog markers, forced-colors checks, 12-cell exact-candidate [CVD matrix](../../evidence/phase-1/cvd-4fd4fdd-2026-08-29.md), and reviewer sign-off             | None                                    |
| `MI-UX-012` Evidence-bounded inspector     | **Pass** | Escaped/attracting/unresolved browser assertions; viewport-aware coordinate policy; high-precision fixture and orbit tests                                                                                                                   | None                                    |
| `MI-UX-013` Nonblocking status and failure | **Pass** | Worker recovery lifecycle tests; desktop and 320 px persistent-error/manual-retry browser scenarios                                                                                                                                          | None                                    |
| `MI-UX-014` Automatic renderer fallback    | **OBE**  | Historical WebGPU-first requirement retained for identifier continuity; superseded by `MI-UX-017`                                                                                                                                            | None; excluded from the active baseline |
| `MI-UX-015` Keyboard operation             | **Pass** | Keyboard navigation and catalog-selection browser scenarios, target-laptop tab-order dump, and reviewer-accepted Firefox/Chrome manual results                                                                                               | None                                    |
| `MI-UX-016` Accessible interface           | **Pass** | Axe WCAG A/AA; forced-colors focus/state cues; phone reflow; evidence/error/retry; overflow, canvas-ratio, target-size checks; and reviewer-accepted manual closeout                                                                         | None                                    |
| `MI-UX-017` Renderer recovery/fallback     | **Pass** | Selected CPU default; bounded worker/render recovery and manual retry; future optional-renderer CPU fallback remains normative                                                                                                               | None for the CPU-only Phase 1 product   |

## Manual accessibility record

Record reviewer, date, browser, operating system, viewport, and result for each
row. A blank row is not a pass. Use the
[home-test procedure](PHASE1-HOME-TEST.md) and commit a completed copy of the
[prefilled closeout form](../../evidence/phase-1/manual-closeout-2026-08-29.md).

| Check                                                                       | Firefox | Chrome | Notes                                                                  |
| --------------------------------------------------------------------------- | ------- | ------ | ---------------------------------------------------------------------- |
| Full keyboard tab order and visible focus                                   | Pass    | Pass   | Aaron, 2026-08-29                                                      |
| Pointer operations have keyboard alternatives                               | Pass    | Pass   | Aaron, 2026-08-29                                                      |
| Canvas has an understandable accessible name and adjacent textual semantics | Pass    | Pass   | Browser accessibility tools and automated semantics; reviewer accepted |
| Text zoom/reflow at 200%                                                    | Pass    | Pass   | Aaron, 2026-08-29                                                      |
| High-contrast or forced-colors mode                                         | Pass    | Pass   | Aaron, 2026-08-29                                                      |
| Protanopia simulation                                                       | Pass    | Pass   | Exact-candidate matrix and reviewer sign-off                           |
| Deuteranopia simulation                                                     | Pass    | Pass   | Exact-candidate matrix and reviewer sign-off                           |
| Tritanopia simulation                                                       | Pass    | Pass   | Exact-candidate matrix and reviewer sign-off                           |
| Unresolved, selected, escaped, and catalog states remain distinguishable    | Pass    | Pass   | Exact-candidate matrix and reviewer sign-off                           |
