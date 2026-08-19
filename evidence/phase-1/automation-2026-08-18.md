# Phase 1 automation baseline — 2026-08-18

## Merged candidate

- Commit:
  [`3b549eb`](https://github.com/Aaron-Fine/int-M-/commit/3b549ebcfad610b163750de0627d0bbea6509134)
  (`Merge pull request #9 from Aaron-Fine/agent/phase-1-evidence-hardening`)
- GitHub Actions:
  [CI run 32080021953](https://github.com/Aaron-Fine/int-M-/actions/runs/32080021953)
- Result: successful `Static checks and unit tests` job and successful managed
  Chromium/Firefox `Browser tests` job
- Local replay on the documented target laptop, 2026-08-18 MDT:
  - First pass under system Node 22.22.2 / npm 10.9.7
  - Replay under nvm Node 24.19.0 / npm 11.17.0: `npm ci`, `npm run check`
    (format, ESLint, TypeScript, catalog, fixtures, 48 unit tests, production
    asset build) and `npm run test:browser` (26/26 in 34.0 s) all passed
  - Production asset hashes were unchanged after the Node 24 rebuild
- Production assets from the local build:
  - `dist/assets/index-B2Japiw_.js`
  - `dist/assets/index-D1fGRq2y.css`
  - `dist/assets/render.worker-nTA_J0GO.js`

This merged-main run is the regression baseline for the evidence-hardening
candidate after PR #9. It supersedes the 2026-08-12 merged-main record at
`4fce632` for CI provenance; keep that earlier record for the phone-layout
merge.

## Environment

| Item       | Value                                                                                 |
| ---------- | ------------------------------------------------------------------------------------- |
| Host       | `wells`, Fedora Linux 44 (KDE Plasma), kernel `7.1.5-201.fc44.x86_64`                 |
| CPU        | Intel Core i7-1185G7, 4 cores / 8 threads, `powersave` governor                       |
| GPU        | Intel TigerLake-LP GT2 Iris Xe (`8086:9a49`), Mesa 26.1.6                             |
| Memory     | 15 GiB                                                                                |
| Node / npm | nvm `v24.19.0` / npm 11.17.0 (`.nvmrc` pins 24.18.0; `packageManager` is npm 11.16.0) |
| Python     | 3.14.6                                                                                |
| Playwright | 1.62.0                                                                                |

## Boundary

CI and local managed-browser timing are not target-device UI-path performance
evidence. See
[the 2026-08-18 target-device record](target-device-ui-path-2026-08-18.md).
This record does not replace branded Chrome, real-pointer, 200% browser text
zoom, assistive-technology, or native high-contrast checks in the
[home-test procedure](../../docs/verification/PHASE1-HOME-TEST.md).
