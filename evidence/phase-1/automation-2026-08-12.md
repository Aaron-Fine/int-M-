# Phase 1 automation baseline — 2026-08-12

## Merged baseline

- Commit:
  [`4fce632`](https://github.com/Aaron-Fine/int-M-/commit/4fce632972e9a7b24be4e48213ddf2e21f94d4fc)
- GitHub Actions:
  [CI run 31664650043](https://github.com/Aaron-Fine/int-M-/actions/runs/31664650043)
- Result: successful static/unit/build job and successful managed
  Chromium/Firefox browser job
- Browser scenarios: 22 total executions across the two projects
- Unit tests: 48 passed

This merged run is the execution record for the PR #8 phone-layout baseline.

## Evidence-hardening candidate

- Commit:
  [`1a6939a`](https://github.com/Aaron-Fine/int-M-/commit/1a6939aa5f263347687717023adccaf484bcc4e9)
- GitHub Actions:
  [CI run 31665879013](https://github.com/Aaron-Fine/int-M-/actions/runs/31665879013)
- Result: successful static/unit/build job and successful managed
  Chromium/Firefox browser job
- Browser scenarios: 26 total executions across the two projects; all passed
- Unit tests: 48 passed

This candidate is the execution record for deterministic requested/coarse/stable
presentation states, forced-colors checks, narrow selected-evidence/error/retry
coverage, and cancellation-request timestamps. It is branch evidence until the
candidate is merged; the merged-main run becomes the authoritative regression
baseline afterward.

## Boundary

CI timing is not target-device performance evidence. This record does not
replace the release-browser, real-pointer, 200% zoom, assistive-technology,
color-vision, native high-contrast, or target-hardware checks in the
[home-test procedure](../../docs/verification/PHASE1-HOME-TEST.md).
