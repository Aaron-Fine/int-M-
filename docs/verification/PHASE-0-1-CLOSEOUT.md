# Phase 0 and Phase 1 closeout evidence

- Assessment date: 2026-08-29
- Assessed merged production baseline:
  [`4fd4fdd`](https://github.com/Aaron-Fine/int-M-/commit/4fd4fdd98009d141f1a82a7524b3e9b12caf8f54)
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

| Phase   | Readiness  | Disposition                                                                                                                                                                |
| ------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 0 | **Closed** | All six exit criteria pass; Worker CPU and a `6,000,000×` product ceiling are selected                                                                                     |
| Phase 1 | **Closed** | All sixteen active requirements pass on the `4fd4fdd` production baseline. Aaron (AF) accepted the final manual evidence and documented closeout deviations on 2026-08-29. |

The vertical slice is deployable and coherent. Broader performance work for
period-4-heavy regions is accepted into Phase 2 and does not reopen the Phase 1
budgets or closeout.

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

| Deliverable                                                                   | State                  | Evidence and remaining work                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vite, strict TypeScript, vanilla DOM/CSS                                      | **Pass**               | `npm run check`; separate app, worker, Node, and e2e TypeScript projects                                                                                                                                                                                        |
| Orbit, palette, and raster work off the main thread                           | **Pass**               | Worker entry/runtime boundary; worker tests confirm only RGBA crosses to the UI                                                                                                                                                                                 |
| Pan, point zoom, bounded area zoom, and reset                                 | **Pass**               | Immediate presentation transforms, viewport tests, automated navigation, and reviewer-accepted pointer-pan/pointer-cancel results                                                                                                                               |
| Selected Worker CPU renderer                                                  | **Pass**               | Renderer-neutral protocol, `CpuRenderer`, target-hardware evidence, and accepted ADR 0002                                                                                                                                                                       |
| Stability, multiplier, and restrained period views with legends               | **Pass**               | Semantic coloring tests, semantic-frame reuse tests, and browser legend scenarios                                                                                                                                                                               |
| Outcome, evidence, selected-point inspector, definitions, and adaptive labels | **Pass**               | Persistent non-color marker, adjacent canvas semantics, viewport-aware coordinate precision, orbit tests, and arbitrary-point browser scenarios                                                                                                                 |
| Quick, Balanced, and Detailed finite budgets                                  | **Pass**               | Quality-profile unit tests and browser selection scenario                                                                                                                                                                                                       |
| Progressive rendering, cancellation, cache, and resolution cap                | **Pass**               | CPU/worker tests and browser evidence cover ordered presentation. The exact-candidate target replay passes 768²/1024² presentation, cancellation, and Chromium long-task budgets; see the [2026-08-29 record](../../evidence/phase-1/automation-2026-08-29.md). |
| Worker failure recovery and manual retry                                      | **Pass**               | Replaceable Worker lifecycle and browser injection cover automatic recovery, bounded persistent failure, continued controls, and manual retry                                                                                                                   |
| Guided first use                                                              | **Pass**               | The guide remains visible and controls remain enabled while the first render reaches Stable frame, then it is dismissible                                                                                                                                       |
| Keyboard and color-vision accessibility                                       | **Pass**               | Keyboard, Axe, forced-colors, phone reflow, tab order, exact-candidate CVD matrix, and the reviewer-signed [manual closeout](../../evidence/phase-1/manual-closeout-2026-08-29.md) cover the accepted Phase 1 baseline.                                         |
| Static analysis and browser coverage                                          | **Pass**               | The [final-candidate record](../../evidence/phase-1/automation-2026-08-29.md) pins `4fd4fdd`, the npm 11 gate, 81 unit tests, production build, and 31 passing managed Firefox/Chromium scenarios.                                                              |
| Cloudflare Pages production and PR previews                                   | **Pass for `4fd4fdd`** | The [2026-08-29 production observation](../../evidence/deployment/cloudflare-2026-08-29.md) records matching assets on both domains, stable rendering, the zoom ceiling, console/network health, and supplied branded-Chrome presentation evidence.             |

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

The completed target-device review is recorded in the
[final closeout form](../../evidence/phase-1/manual-closeout-2026-08-29.md).

## Phase 1 closeout disposition

The ordered implementation and evidence backlog is maintained in the
[Phase 1 closeout TODO](PHASE1-TODO.md).

No Phase 1 actions remain. Aaron (AF) approved the manual record and directed
that all results be marked Pass on 2026-08-29. The record transparently notes
that Browserling Chrome 138 was accepted in place of a locally installed
current-stable Chrome and that browser accessibility tools plus automated
coverage were accepted without a separately narrated Orca session.

Known Phase 2 performance work: the closeout timing cells cover the documented
default/easy cases, while regions dense with period-4 components remain
expensive under the current algorithms. That follow-up is accepted and does not
invalidate the passing Phase 1 budgets.
