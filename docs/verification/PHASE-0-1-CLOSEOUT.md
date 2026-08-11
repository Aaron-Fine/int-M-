# Phase 0 and Phase 1 closeout evidence

- Assessment date: 2026-08-11
- Assessed baseline: `b663fdf` plus this closeout change
- Status vocabulary:
  - **Pass** — criterion is implemented and has repeatable evidence.
  - **Partial** — meaningful evidence exists, but part of the criterion is
    unverified.
  - **Not met** — required implementation or evidence does not exist.
  - **External review** — automation cannot establish the criterion.

This assessment preserves the existing phase criteria. Phase 0 experiments
answer the renderer decision; they do not need to become three production
renderers. Deferred production GPU and perturbation work has explicit
reconsideration gates in [ADR 0002](../decisions/0002-phase-0-renderer-zoom-and-gpu-gate.md).

## Executive disposition

| Phase   | Readiness              | Disposition                                                                                                                         |
| ------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Phase 0 | **Closed**             | All six exit criteria pass; Worker CPU and a `6,000,000×` product ceiling are selected                                              |
| Phase 1 | **Not ready to close** | Target-hardware budgets now exist; failure/fallback verification and manual accessibility and color-vision review remain incomplete |

The vertical slice is nevertheless deployable and coherent. The remaining
items are evidence and requirement gaps, not a reason to discard the current
CPU architecture.

## Phase 0 exit criteria

| Criterion                                                               | State    | Evidence and disposition                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mathematical terms, status/evidence model, and v1 story are unambiguous | **Pass** | [`PLAN.md`](../PLAN.md), [`RESEARCH.md`](../RESEARCH.md), and `MI-UX-001`–`MI-UX-016` in the [SysML model](../../model/MandelbrotInteriority.sysml) define the semantics and product story.                                                                                                                                                                                                        |
| Licenses and data provenance are recorded                               | **Pass** | `LICENSE` and `package.json` declare GPL-3.0-only. Catalog and fixture files declare CC0-1.0 and name their generators.                                                                                                                                                                                                                                                                            |
| Catalog schema and golden-fixture procedures are reproducible           | **Pass** | `npm run catalog:check` regenerates all exact-period centers through period four. `npm run fixtures:check` regenerates six Decimal fixtures; unit tests compare them with the TypeScript classifier.                                                                                                                                                                                               |
| All three rendering experiments have comparable measurements            | **Pass** | The [target-hardware benchmark](../PHASE0_BENCHMARK.md) measures Worker CPU and direct WebGPU on common cases and compares their semantic fields. Its perturbation tile uses the same parameter mapping and high-precision reference policy at the deep scale that experiment is intended to test. The [protocol](EXPERIMENT-PROTOCOL.md) records the final disposition and provenance limitation. |
| One initial rendering path and preliminary zoom bound are selected      | **Pass** | [ADR 0002](../decisions/0002-phase-0-renderer-zoom-and-gpu-gate.md) selects Worker CPU and retains the implemented `6,000,000×` product ceiling. The deeper `spanY = 1e-8` experiment is numerical feasibility evidence, not a supported product bound.                                                                                                                                            |
| No unresolved external data dependency blocks the scaffold              | **Pass** | The initial catalog is independently generated. The unlicensed external period-41 data is excluded and does not block the application.                                                                                                                                                                                                                                                             |

## Phase 1 deliverable evidence

| Deliverable                                                                   | State                     | Evidence and remaining work                                                                                                                                            |
| ----------------------------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vite, strict TypeScript, vanilla DOM/CSS                                      | **Pass**                  | `npm run check`; separate app, worker, Node, and e2e TypeScript projects                                                                                               |
| Orbit, palette, and raster work off the main thread                           | **Pass**                  | Worker entry/runtime boundary; worker tests confirm only RGBA crosses to the UI                                                                                        |
| Pan, point zoom, bounded area zoom, and reset                                 | **Pass**                  | Viewport unit tests and Chromium/Firefox Playwright navigation scenarios                                                                                               |
| Selected Worker CPU renderer                                                  | **Pass**                  | Renderer-neutral protocol, `CpuRenderer`, target-hardware evidence, and accepted ADR 0002                                                                              |
| Stability, multiplier, and restrained period views with legends               | **Pass**                  | Semantic coloring tests, semantic-frame reuse tests, and browser legend scenarios                                                                                      |
| Outcome, evidence, selected-point inspector, definitions, and adaptive labels | **Pass**                  | Orbit tests and browser inspector, definition, and magnified-label scenarios                                                                                           |
| Quick, Balanced, and Detailed finite budgets                                  | **Pass**                  | Quality-profile unit tests and browser selection scenario                                                                                                              |
| Progressive rendering, cancellation, cache, and resolution cap                | **Pass functionally**     | CPU renderer, worker runtime, semantic store, and viewport tests                                                                                                       |
| Guided first use                                                              | **Pass**                  | Browser first-use scenario verifies a rendered view and dismissible guidance                                                                                           |
| Keyboard and color-vision accessibility                                       | **Partial**               | Keyboard scenarios and automated Axe WCAG A/AA scan exist. Manual focus, canvas semantics, 200% zoom/reflow, and simulated color-vision review remain external review. |
| Static analysis and browser coverage                                          | **Pass when CI is green** | Required GitHub Actions jobs run formatting, lint, strict type checking, 43 unit tests, build, and Playwright in Firefox and Chromium                                  |
| Cloudflare Pages production and PR previews                                   | **Pass**                  | The [deployment observation](../../evidence/deployment/cloudflare-2026-07-29.md) records the production HTTP 200 response and PR #4 preview evidence                   |

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

## Phase 1 closeout actions that remain

The ordered implementation and evidence backlog is maintained in the
[Phase 1 closeout TODO](PHASE1-TODO.md).

1. Complete the manual WCAG 2.2 AA, keyboard-focus, canvas alternative, 200%
   zoom/reflow, and color-vision review checklist.
2. Resolve the incomplete `MI-UX-013` failure-injection and `MI-UX-014`
   renderer-fallback evidence identified in the
   [requirements matrix](REQUIREMENTS.md).
3. Confirm the measured interaction budgets against the release browser
   versions when those versions are pinned.

These actions block Phase 1, not the completed Phase 0 decision baseline.
