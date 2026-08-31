# Cloudflare production observation — 2026-08-29

- Candidate: `4fd4fdd98009d141f1a82a7524b3e9b12caf8f54`
- Primary custom URL: <https://mandelbrot.ourfinefamily.com/>
- Cloudflare Pages URL: <https://int-m.pages.dev/>
- Assets on both domains match the local candidate build:
  `index-CJQbjpJz.js` and `index-A5mS_k6j.css`.
- Both domains returned HTTP 200 with COOP/CORP, `nosniff`, `DENY` framing,
  no-referrer, and permissions-policy headers.

## Automated smoke

Playwright Chrome for Testing 151.0.7922.34 on the target laptop:

1. observed the first-use guide before and at the first stable frame;
2. read the visible build revision `4fd4fdd`;
3. selected Main cardioid and populated its evidence;
4. changed to Period view;
5. reached a final **Stable frame** at the visible `6.00e6×` ceiling; and
6. confirmed Zoom in was disabled at the ceiling.

There were no console/page errors and no failed requests. See the
[production screenshot](cloudflare-2026-08-29.png).

## User-supplied Chrome evidence

The user supplied a Browserling screenshot of the custom domain using branded
Chrome 138 on Windows 10. It shows the first-use guide, rendered Stability
view, primary controls, and shape-coded catalog markers visible without
horizontal clipping. The screenshot is preserved as
[browserling-win10-chrome138-2026-08-29.png](../phase-1/browserling-win10-chrome138-2026-08-29.png).

The still image alone does not prove pointer, keyboard, screen-reader, console,
or network behavior, and Chrome 138 was not the current stable release on the
assessment date. Aaron (AF) explicitly accepted Chrome 138 together with the
managed-browser automation and marked the Chrome manual rows Pass for Phase 1;
the deviation is retained in the completed closeout form.
