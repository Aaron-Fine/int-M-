# Phase 1 UX verification matrix

This matrix distinguishes implemented behavior from evidence sufficient to
close a normative requirement. Test names are stable evidence references; CI
provides the execution record in current Firefox and Chromium.

| Requirement                                | State       | Automated evidence                                                                                | Remaining evidence                                                                           |
| ------------------------------------------ | ----------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `MI-UX-001` First-use rendering            | **Pass**    | `starts with a useful, explained semantic view`                                                   | None                                                                                         |
| `MI-UX-002` Sensible defaults              | **Partial** | First-use and quality-profile browser scenarios; `quality profiles` unit suite                    | Automatic renderer selection is modeled but not implemented                                  |
| `MI-UX-003` Progressive first frame        | **Partial** | `CpuRenderer` emits coarse then stable frames                                                     | Target-device coarse-frame budget and browser trace                                          |
| `MI-UX-004` Truthful intermediate results  | **Pass**    | Unresolved orbit and unresolved texture unit tests                                                | None                                                                                         |
| `MI-UX-005` Nonblocking first-use guidance | **Partial** | First-use browser scenario verifies visible, dismissible guidance while rendering starts          | Browser trace showing guidance never delays first frame                                      |
| `MI-UX-006` Focused primary controls       | **Pass**    | Browser scenarios exercise view, quality, tools, zoom, reset, catalog, and inspection             | None                                                                                         |
| `MI-UX-007` Responsive navigation          | **Partial** | Area/keyboard navigation browser scenarios; viewport math and worker cancellation unit tests      | Target-device response and long-task budgets                                                 |
| `MI-UX-008` Restore default view           | **Pass**    | Keyboard/reset browser scenario                                                                   | None                                                                                         |
| `MI-UX-009` Zoom-bound feedback            | **Partial** | Browser lower-bound feedback plus viewport clamp unit tests                                       | Browser assertion for the deep-zoom bound                                                    |
| `MI-UX-010` Semantic legend                | **Pass**    | Semantic-view and definition browser scenarios                                                    | None                                                                                         |
| `MI-UX-011` Non-color state distinction    | **Partial** | Semantic color tests, unresolved texture, selection boundary, and adaptive-label browser scenario | Manual simulated color-vision and canvas review                                              |
| `MI-UX-012` Evidence-bounded inspector     | **Partial** | Inspector browser scenario; high-precision fixture and orbit tests                                | Browser assertions for arbitrary canonical `c`, evidence, definitions, and bounded precision |
| `MI-UX-013` Nonblocking status and failure | **Partial** | Render status browser assertion; worker cancellation and error protocol                           | Injected worker/render failure browser scenario and recovery evidence                        |
| `MI-UX-014` Automatic renderer fallback    | **Not met** | CPU is the only current renderer                                                                  | Capability selection and rejected/unavailable WebGPU fallback scenario                       |
| `MI-UX-015` Keyboard operation             | **Partial** | Keyboard navigation and catalog selection browser scenarios                                       | Manual full-tab-order and visible-focus review                                               |
| `MI-UX-016` Accessible interface           | **Partial** | Axe WCAG A/AA scans in primary and inspector states, in Firefox and Chromium                      | Manual WCAG 2.2 AA review, canvas alternative, 200% zoom/reflow, and color-vision checks     |

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
