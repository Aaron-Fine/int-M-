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

The follow-up candidate adds deterministic requested/coarse/stable presentation
states, forced-colors checks, narrow selected-evidence/error/retry coverage, and
cancellation-request timestamps. Its exact candidate commit and CI run must be
added here after the managed Chromium/Firefox matrix succeeds. Until then, the
new scenarios are implemented but not yet accepted as cross-browser evidence.

## Boundary

CI timing is not target-device performance evidence. This record does not
replace the release-browser, real-pointer, 200% zoom, assistive-technology,
color-vision, native high-contrast, or target-hardware checks in the
[home-test procedure](../../docs/verification/PHASE1-HOME-TEST.md).
