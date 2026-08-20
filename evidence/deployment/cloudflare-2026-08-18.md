# Cloudflare Pages production observation — 2026-08-18

- Production URL: <https://int-m.pages.dev/>
- Observed production assets match local `3b549eb` build:
  - `/assets/index-B2Japiw_.js`
  - `/assets/index-D1fGRq2y.css`
- Source change since the previous production note: merged
  [PR #9](https://github.com/Aaron-Fine/int-M-/pull/9) (evidence hardening)
  on top of the PR #8 phone-layout baseline
- Post-merge CI:
  [run 32080021953](https://github.com/Aaron-Fine/int-M-/actions/runs/32080021953),
  successful
- Observation environment: Playwright Chromium 151.0.7922.34, headless, from
  the documented target laptop

## Production smoke result

`curl -sSIL https://int-m.pages.dev` returned HTTP 200 with the existing
Pages security headers (`COOP`/`CORP`, `nosniff`, `DENY` framing, no-referrer,
permissions policy). The document title was `Mandelbrot Interiority`.

Playwright then:

1. reached **Stable frame** with the first-use guide still visible;
2. dismissed first-use guidance;
3. selected Main cardioid and populated its point evidence;
4. changed Interior view from Stability to Period;
5. zoomed by keyboard and returned to a stable frame; and
6. reached the visible `6.00e6×` ceiling with Zoom in disabled.

No console errors and no failed network requests were recorded from the
production origin during the smoke run.

## Scope

This observation verifies that production now serves the PR #9 application
assets, not the earlier `4fce632` build. It does not satisfy branded
Firefox/Chrome interaction, real-device pointer cancellation, 200% text zoom,
assistive-technology, color-vision, or the 1024² UI-path budget. Repeat again
if a later Phase 1 change alters built application assets.
