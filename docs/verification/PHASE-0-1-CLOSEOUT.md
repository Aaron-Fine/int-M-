# Phase 0 and Phase 1 closeout evidence

- Assessment date: 2026-08-18
- Assessed merged production baseline:
  [`3b549eb`](https://github.com/Aaron-Fine/int-M-/commit/3b549ebcfad610b163750de0627d0bbea6509134)
- Status vocabulary:
  - **Pass** — criterion is implemented and has repeatable evidence.
  - **Partial** — meaningful evidence exists, but part of the criterion is
    unverified.
  - **Not met** — required implementation or evidence does not exist.
  - **External review** — automation cannot establish the criterion.
  - **OBE** — retained for identifier continuity but removed from the active
    baseline by a documented replacement or decision.

This assessment preserves the existing phase criteria. Phase 0 experiments
answer the renderer decision; they do not need to become three production
renderers. Deferred production GPU and perturbation work has explicit
reconsideration gates in [ADR 0002](../decisions/0002-phase-0-renderer-zoom-and-gpu-gate.md).

## Executive disposition

| Phase   | Readiness              | Disposition                                                                                                                                                                                                                                       |
| ------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 0 | **Closed**             | All six exit criteria pass; Worker CPU and a `6,000,000×` product ceiling are selected                                                                                                                                                            |
| Phase 1 | **Not ready to close** | Recovery, interaction, inspector, phone layout, CI, and the merged production smoke are evidenced; 1024² stable presentation misses 2.25 s on the target laptop; branded Chrome, pointer-pan, and manual accessibility evidence remain incomplete |

The vertical slice is nevertheless deployable and coherent. The remaining
items are evidence and requirement gaps, not a reason to discard the current
CPU architecture.

## Phase 0 exit criteria

| Criterion                                                               | State    | Evidence and disposition                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mathematical terms, status/evidence model, and v1 story are unambiguous | **Pass** | [`PLAN.md`](../PLAN.md), [`RESEARCH.md`](../RESEARCH.md), and the active requirements `MI-UX-001`–`MI-UX-013` plus `MI-UX-015`–`MI-UX-017` in the [SysML model](../../model/MandelbrotInteriority.sysml) define the semantics and product story; `MI-UX-014` is retained as OBE.                                                                                                                   |
| Licenses and data provenance are recorded                               | **Pass** | `LICENSE` and `package.json` declare GPL-3.0-only. Catalog and fixture files declare CC0-1.0 and name their generators.                                                                                                                                                                                                                                                                            |
| Catalog schema and golden-fixture procedures are reproducible           | **Pass** | `npm run catalog:check` regenerates all exact-period centers through period four. `npm run fixtures:check` regenerates six Decimal fixtures; unit tests compare them with the TypeScript classifier.                                                                                                                                                                                               |
| All three rendering experiments have comparable measurements            | **Pass** | The [target-hardware benchmark](../PHASE0_BENCHMARK.md) measures Worker CPU and direct WebGPU on common cases and compares their semantic fields. Its perturbation tile uses the same parameter mapping and high-precision reference policy at the deep scale that experiment is intended to test. The [protocol](EXPERIMENT-PROTOCOL.md) records the final disposition and provenance limitation. |
| One initial rendering path and preliminary zoom bound are selected      | **Pass** | [ADR 0002](../decisions/0002-phase-0-renderer-zoom-and-gpu-gate.md) selects Worker CPU and retains the implemented `6,000,000×` product ceiling. The deeper `spanY = 1e-8` experiment is numerical feasibility evidence, not a supported product bound.                                                                                                                                            |
| No unresolved external data dependency blocks the scaffold              | **Pass** | The initial catalog is independently generated. The unlicensed external period-41 data is excluded and does not block the application.                                                                                                                                                                                                                                                             |

## Phase 1 deliverable evidence

| Deliverable                                                                   | State                           | Evidence and remaining work                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vite, strict TypeScript, vanilla DOM/CSS                                      | **Pass**                        | `npm run check`; separate app, worker, Node, and e2e TypeScript projects                                                                                                                                                                                                                                        |
| Orbit, palette, and raster work off the main thread                           | **Pass**                        | Worker entry/runtime boundary; worker tests confirm only RGBA crosses to the UI                                                                                                                                                                                                                                 |
| Pan, point zoom, bounded area zoom, and reset                                 | **Pass functionally**           | Immediate presentation transforms, viewport unit tests, and automated area/keyboard navigation; manual release-browser pointer-pan and pointer-cancel evidence remains                                                                                                                                          |
| Selected Worker CPU renderer                                                  | **Pass**                        | Renderer-neutral protocol, `CpuRenderer`, target-hardware evidence, and accepted ADR 0002                                                                                                                                                                                                                       |
| Stability, multiplier, and restrained period views with legends               | **Pass**                        | Semantic coloring tests, semantic-frame reuse tests, and browser legend scenarios                                                                                                                                                                                                                               |
| Outcome, evidence, selected-point inspector, definitions, and adaptive labels | **Pass**                        | Persistent non-color marker, adjacent canvas semantics, viewport-aware coordinate precision, orbit tests, and arbitrary-point browser scenarios                                                                                                                                                                 |
| Quick, Balanced, and Detailed finite budgets                                  | **Pass**                        | Quality-profile unit tests and browser selection scenario                                                                                                                                                                                                                                                       |
| Progressive rendering, cancellation, cache, and resolution cap                | **Partial**                     | CPU renderer and worker tests plus browser evidence that one request advances through requested, coarse, and stable presentation with matching IDs. Target-laptop 768² presentation and cancellation p95 pass; 1024² stable misses 2.25 s.                                                                      |
| Worker failure recovery and manual retry                                      | **Pass functionally**           | Replaceable Worker lifecycle, 48 unit tests, and browser injection for automatic recovery, bounded persistent failure, continued controls, and manual retry                                                                                                                                                     |
| Guided first use                                                              | **Pass**                        | The guide remains visible and controls remain enabled while the first render reaches Stable frame, then it is dismissible                                                                                                                                                                                       |
| Keyboard and color-vision accessibility                                       | **Partial**                     | Keyboard, Axe, forced-colors, phone reflow, and narrow evidence/error/retry scenarios are automated. Target-laptop tab order and Chromium vision-deficiency screenshots are supporting data. Manual assistive-technology, 200% text zoom, native high-contrast, and branded-browser color-vision review remain. |
| Static analysis and browser coverage                                          | **Pass when CI is green**       | The dated [automation baseline](../../evidence/phase-1/automation-2026-08-18.md) pins `3b549eb`, CI run 32080021953, 48 unit tests, the production build, and 26 Firefox/Chromium scenarios                                                                                                                     |
| Cloudflare Pages production and PR previews                                   | **Pass for merged PR #9 build** | The [2026-08-18 production observation](../../evidence/deployment/cloudflare-2026-08-18.md) records the PR #9 assets, stable rendering, interaction, the zoom ceiling, and console health on `3b549eb`                                                                                                          |

## Evidence commands

```sh
npm ci
npm run check
npm run test:browser
INTM_EVIDENCE_SAMPLES=5 npm run evidence:cpu
node tools/measure_ui_path.mjs
curl -sSIL https://int-m.pages.dev
```

The Playwright container used by CI is authoritative when local managed browser
binaries are unavailable.

The remaining target-device work has a concise
[home-test procedure](PHASE1-HOME-TEST.md) and a committed
[evidence template](../../evidence/phase-1/manual-template.md).

## Phase 1 closeout actions that remain

The ordered implementation and evidence backlog is maintained in the
[Phase 1 closeout TODO](PHASE1-TODO.md).

1. Meet or revise the 1024² stable presentation budget (measured 2.364 s
   Chromium / 2.627 s Firefox versus 2.25 s on 2026-08-18).
2. Complete the manual WCAG 2.2 AA, keyboard-focus, canvas semantics, 200%
   text zoom/reflow, forced-colors, target-size, and simulated color-vision
   review on branded Firefox and Chrome.
3. Record branded stable Chrome (not installed here) plus headed branded
   Firefox pointer-pan / Escape-cancel evidence. Production on `3b549eb` is
   already re-observed.

These actions block Phase 1, not the completed Phase 0 decision baseline.
