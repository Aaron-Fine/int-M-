# Phase 0 and Phase 1 closeout evidence

- Assessment date: 2026-07-29
- Assessed baseline: `7c991a2` plus this evidence change
- Status vocabulary:
  - **Pass** — criterion is implemented and has repeatable evidence.
  - **Partial** — meaningful evidence exists, but part of the criterion is
    unverified.
  - **Not met** — required implementation or evidence does not exist.
  - **External review** — automation cannot establish the criterion.

This assessment preserves the existing phase criteria. Deferring work to a
later phase does not silently convert an unmet criterion into a pass.

## Executive disposition

| Phase   | Readiness              | Blocking evidence                                                                                                                                    |
| ------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 0 | **Not ready to close** | No direct WebGPU or perturbation experiment; no representative-device comparison; renderer decision remains provisional                              |
| Phase 1 | **Not ready to close** | No measured interaction budget on target hardware; incomplete failure/fallback verification; incomplete manual accessibility and color-vision review |

The vertical slice is nevertheless deployable and coherent. The remaining
items are evidence and requirement gaps, not a reason to discard the current
CPU architecture.

## Phase 0 exit criteria

| Criterion                                                               | State       | Evidence and disposition                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mathematical terms, status/evidence model, and v1 story are unambiguous | **Pass**    | [`PLAN.md`](../PLAN.md), [`RESEARCH.md`](../RESEARCH.md), and `MI-UX-001`–`MI-UX-016` in the [SysML model](../../model/MandelbrotInteriority.sysml) define the semantics and product story.                                                                                                                                              |
| Licenses and data provenance are recorded                               | **Pass**    | `LICENSE` and `package.json` declare GPL-3.0-only. Catalog and fixture files declare CC0-1.0 and name their generators.                                                                                                                                                                                                                  |
| Catalog schema and golden-fixture procedures are reproducible           | **Pass**    | `npm run catalog:check` regenerates all exact-period centers through period four. `npm run fixtures:check` regenerates six Decimal fixtures; unit tests compare them with the TypeScript classifier.                                                                                                                                     |
| All three rendering experiments have comparable measurements            | **Not met** | Only the Worker CPU renderer exists. The [common protocol](EXPERIMENT-PROTOCOL.md) records exactly what is missing; direct WebGPU and perturbation have no harness or result.                                                                                                                                                            |
| One initial rendering path and preliminary zoom bound are selected      | **Partial** | Worker CPU and a preliminary `6,000,000×` ceiling are implemented and tested. The [observation](../../evidence/phase-0/zoom-bound-observation-2026-07-29.md) supports the bound; [ADR 0001](../decisions/0001-interim-renderer-and-zoom.md) keeps the renderer decision provisional pending target-hardware and three-renderer evidence. |
| No unresolved external data dependency blocks the scaffold              | **Pass**    | The initial catalog is independently generated. The unlicensed external period-41 data is excluded and does not block the application.                                                                                                                                                                                                   |

## Phase 1 deliverable evidence

| Deliverable                                                                   | State                       | Evidence and remaining work                                                                                                                                            |
| ----------------------------------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vite, strict TypeScript, vanilla DOM/CSS                                      | **Pass**                    | `npm run check`; separate app, worker, Node, and e2e TypeScript projects                                                                                               |
| Orbit, palette, and raster work off the main thread                           | **Pass**                    | Worker entry/runtime boundary; worker tests confirm only RGBA crosses to the UI                                                                                        |
| Pan, point zoom, bounded area zoom, and reset                                 | **Pass**                    | Viewport unit tests and Chromium/Firefox Playwright navigation scenarios                                                                                               |
| Selected Worker CPU renderer                                                  | **Pass for implementation** | Renderer-neutral protocol and `CpuRenderer`; final Phase 0 selection remains provisional                                                                               |
| Stability, multiplier, and restrained period views with legends               | **Pass**                    | Semantic coloring tests, semantic-frame reuse tests, and browser legend scenarios                                                                                      |
| Outcome, evidence, selected-point inspector, definitions, and adaptive labels | **Pass**                    | Orbit tests and browser inspector, definition, and magnified-label scenarios                                                                                           |
| Quick, Balanced, and Detailed finite budgets                                  | **Pass**                    | Quality-profile unit tests and browser selection scenario                                                                                                              |
| Progressive rendering, cancellation, cache, and resolution cap                | **Pass functionally**       | CPU renderer, worker runtime, semantic store, and viewport tests                                                                                                       |
| Guided first use                                                              | **Pass**                    | Browser first-use scenario verifies a rendered view and dismissible guidance                                                                                           |
| Keyboard and color-vision accessibility                                       | **Partial**                 | Keyboard scenarios and automated Axe WCAG A/AA scan exist. Manual focus, canvas semantics, 200% zoom/reflow, and simulated color-vision review remain external review. |
| Static analysis and browser coverage                                          | **Pass when CI is green**   | Required GitHub Actions jobs run formatting, lint, strict type checking, 42 unit tests, build, and Playwright in Firefox and Chromium                                  |
| Cloudflare Pages production and PR previews                                   | **Pass**                    | The [deployment observation](../../evidence/deployment/cloudflare-2026-07-29.md) records the production HTTP 200 response and PR #4 preview evidence                   |

## Evidence commands

```sh
npm ci
npm run check
npm run test:browser
INTM_EVIDENCE_SAMPLES=5 npm run evidence:cpu
curl -sSIL https://int-m.pages.dev
```

The Playwright container used by CI is authoritative when local managed browser
binaries are unavailable.

## Closeout actions that remain

1. Run the CPU harness and a browser performance trace on the documented
   four-core integrated-graphics target; set coarse, stable, cancellation, and
   long-task budgets from those results.
2. Implement and run the disposable direct WebGPU and perturbation experiments,
   or approve a criteria change that moves both comparisons to Phase 3.
3. Use those results to finalize the renderer decision and confirm or revise
   the preliminary `6,000,000×` zoom ceiling.
4. Complete the manual WCAG 2.2 AA, keyboard-focus, canvas alternative, 200%
   zoom/reflow, and color-vision review checklist.
5. Resolve the incomplete `MI-UX-013` failure-injection and `MI-UX-014`
   renderer-fallback evidence identified in the
   [requirements matrix](REQUIREMENTS.md).

Only after those dispositions should the plan mark Phase 0 or Phase 1 closed.
