# Phase 1 final manual closeout — 2026-08-29

This form contains only checks that cannot be honestly established by the
committed automated and captured evidence. Use **Pass**, **Fail**, or
**Blocked**; add a note only for a non-pass. Run against
<https://mandelbrot.ourfinefamily.com/> on the target laptop.

## Prefilled candidate

| Field                     | Value                                                         |
| ------------------------- | ------------------------------------------------------------- |
| Commit/build badge        | `4fd4fdd98009d141f1a82a7524b3e9b12caf8f54` / `4fd4fdd`        |
| Target                    | `wells`, Dell Latitude 5520                                   |
| OS/display                | Fedora 44 KDE/Wayland; 1920×1080 internal sRGB panel; scale 1 |
| CPU/GPU/RAM               | i7-1185G7, 4 cores/8 threads; Intel Iris Xe (`i915`); 15 GiB  |
| Installed release Firefox | Firefox 154.0                                                 |
| Assistive technology      | Orca 50.2 installed                                           |
| Accepted Chrome evidence  | Browserling Chrome 138 on Windows 10                          |
| Reviewer                  | Aaron                                                         |
| Local review date/time    | 2026-08-29 10:35 MDT                                          |

The reviewer explicitly accepted the supplied Browserling Windows 10 / Chrome
138 evidence for Phase 1 and directed that every Chrome result be recorded as
Pass. This is a documented closeout acceptance of Chrome 138 in place of the
procedure's current-stable-Chrome wording.

## Manual-only results

Enter one result in each blank browser cell. These five rows consolidate the
longer home-test procedure without weakening its remaining requirements.

| Check                                                                                                                                                             | Firefox 154 | Chrome 138 / Windows 10 | Notes for Fail/Blocked |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ----------------------- | ---------------------- |
| Real pointer: drag from image and catalog marker; live preview follows; replacement reaches Stable frame; Escape restores the preview and coordinates             | Pass        | Pass                    |                        |
| Full Tab order has visible focus and makes sense; operate view, quality, Pan/Zoom area, catalog, zoom/reset, canvas inspection, and disclosures from the keyboard | Pass        | Pass                    |                        |
| At 200% **browser text zoom**, controls, inspector, and reset remain available with no unintended horizontal page scroll                                          | Pass        | Pass                    |                        |
| Native high contrast, or browser `forced-colors: active` emulation: focus, selected ring/crosshair, catalog shapes, and classifications remain visible            | Pass        | Pass                    |                        |
| No application-origin console errors or failed application resources during the run                                                                               | Pass        | Pass                    |                        |

### One-browser assistive-technology check

- Browser used: Firefox 154
- Result: Pass
- Evidence: browser accessibility tools found no errors; automated Axe, ARIA,
  forced-colors, keyboard, status, and adjacent canvas-semantics checks pass.
  Orca 50.2 was installed but was not separately narrated in this record; the
  reviewer explicitly accepted the available evidence for Phase 1.
- Notes for Fail/Blocked: none

### Color-vision sign-off

- Result: Pass
- I used browser accessibility tools and the captured matrix to review
  Stability, Multiplier, and Period under normal vision, protanopia,
  deuteranopia, and tritanopia—and confirmed escaped, unresolved, selected, and
  catalog states remain distinguishable without hue alone.
- Notes for Fail/Blocked: none

## Closeout disposition

- Overall Phase 1 result: Pass
- Known performance work accepted for Phase 2:
  performance tests were only done on "easy" areas but areas with lots of period 4 components become expensive to test using current algorithms
- Other failures/blockers: none
- Reviewer signature/initials: AF

Closeout completed by Aaron (AF) on 2026-08-29. The requirements matrix and
formal phase disposition record Phase 1 as **Closed**.

## Evidence already complete — no manual repetition required

- [Final-candidate automation and performance](automation-2026-08-29.md):
  pinned toolchain gate, 81 unit tests, 31 managed-browser scenarios, exact
  target specs, and all Phase 1 timing/cancellation budgets passing.
- [Production observation](../deployment/cloudflare-2026-08-29.md): exact
  build, HTTP/security headers, stable-frame smoke, zoom ceiling, console and
  network health, and the supplied Browserling screenshot.
- Automated Axe A/AA, forced-colors, phone reflow, target size, point evidence,
  worker recovery/manual retry, progressive rendering, cancellation, and stale
  frame prevention remain covered by the browser suite.
