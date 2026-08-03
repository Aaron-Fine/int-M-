# Cloudflare Pages deployment observation

- Observed: 2026-07-29
- Production URL: <https://int-m.pages.dev>
- Assessed baseline: merge commit `7c991a2`
- Command: `curl -sSIL --max-time 20 https://int-m.pages.dev`
- Result: HTTP 200

Observed response headers included:

```text
content-type: text/html; charset=utf-8
cache-control: public, max-age=0, must-revalidate
cross-origin-opener-policy: same-origin
cross-origin-resource-policy: same-origin
permissions-policy: camera=(), geolocation=(), microphone=(), payment=(), usb=()
referrer-policy: no-referrer
x-content-type-options: nosniff
x-frame-options: DENY
server: cloudflare
```

The returned document was titled `Mandelbrot Interiority` and referenced the
same production asset hashes built from the merged Phase 1 baseline.

[PR #4’s Cloudflare deployment record](https://github.com/Aaron-Fine/int-M-/pull/4#issuecomment-5121995342)
also reports a successful immutable preview and branch preview for commit
`5854c2d`.
