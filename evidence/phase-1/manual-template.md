# Phase 1 manual evidence — <date> — <target>

## Candidate and target

| Field                          | Value |
| ------------------------------ | ----- |
| Candidate URL                  |       |
| Commit SHA                     |       |
| Reviewer and local date/time   |       |
| OS and display scale           |       |
| CPU / logical cores            |       |
| GPU and driver                 |       |
| Memory                         |       |
| Viewport / canvas backing size |       |

## Release-browser results

Use **Pass**, **Fail**, or **Blocked** and explain every non-pass.

| Check                                                         | Firefox <version> | Chrome <version> | Notes / artifact |
| ------------------------------------------------------------- | ----------------- | ---------------- | ---------------- |
| First-use guide remains usable while stable frame arrives     |                   |                  |                  |
| Live pointer displacement and replacement rendering           |                   |                  |                  |
| Escape cancellation restores preview and coordinates          |                   |                  |                  |
| Area zoom, point inspection, view/quality changes, reset      |                   |                  |                  |
| Keyboard navigation and visible 6.00e6× ceiling               |                   |                  |                  |
| No stale frame, application console error, or failed resource |                   |                  |                  |

## Performance summary

Attach the raw `mi:` performance-mark JSON for each browser.

| Metric                                  |            Budget | Firefox | Chrome |
| --------------------------------------- | ----------------: | ------: | -----: |
| Coarse presentation at 768² / 1024²     | ≤150 ms / ≤250 ms |         |        |
| Stable presentation at 768² / 1024²     |  ≤2.0 s / ≤2.25 s |         |        |
| Cancellation acknowledgement p95        |            ≤50 ms |         |        |
| Rendering-related long tasks over 50 ms |                 0 |         |        |

## Accessibility record

| Check                                                             | Firefox | Chrome | Notes |
| ----------------------------------------------------------------- | ------- | ------ | ----- |
| Full tab order and visible focus                                  |         |        |       |
| Pointer operations have keyboard alternatives                     |         |        |       |
| Canvas name, instructions, status, viewport, and evidence         |         |        |       |
| Text zoom/reflow at 200%                                          |         |        |       |
| Native high contrast or forced-colors emulation                   |         |        |       |
| Protanopia simulation                                             |         |        |       |
| Deuteranopia simulation                                           |         |        |       |
| Tritanopia simulation                                             |         |        |       |
| Unresolved, selected, escaped, and catalog states remain distinct |         |        |       |

## Disposition

- Overall result:
- Failures or blockers:
- Follow-up issue/PR:
- Raw evidence files:
