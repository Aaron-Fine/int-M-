# Phase 1 closeout TODO

This checklist turns the remaining Phase 1 verification gaps into an ordered
implementation and evidence backlog. Phase 1 is not ready to close until every
active normative requirement (`MI-UX-001` through `MI-UX-013` and `MI-UX-015`
through `MI-UX-017`) has passing evidence. `MI-UX-014` is retained as OBE.

## Fixed scope and decisions

- Retain the TypeScript and Node development toolchain. Node is used for Vite,
  static analysis, tests, browser automation, and evidence tooling; there is no
  production Node backend to replace.
- Retain the binary64 Worker CPU renderer selected in
  [ADR 0002](../decisions/0002-phase-0-renderer-zoom-and-gpu-gate.md).
- Retain the supported `6,000,000×` product zoom ceiling.
- Do not add a production WebGPU renderer until it is enabled by default in
  stable Firefox across every supported desktop platform and the remaining
  ADR 0002 numerical, performance, and fallback gates pass.
- Treat a Go/WebAssembly numerical kernel as a separately measured future
  experiment, not Phase 1 work.
- Do not pull Phase 2 work such as shareable URLs, expanded catalog navigation,
  or formal image regression into this closeout.

## Current requirement disposition

The detailed evidence references remain in the
[requirements matrix](REQUIREMENTS.md). This summary is the planning baseline;
update both documents as evidence is completed.

| State   | Requirements                                                                                                                                  |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Pass    | `MI-UX-001`, `MI-UX-002`, `MI-UX-004`, `MI-UX-005`, `MI-UX-006`, `MI-UX-008`, `MI-UX-009`, `MI-UX-010`, `MI-UX-012`, `MI-UX-013`, `MI-UX-017` |
| Partial | `MI-UX-003`, `MI-UX-007`, `MI-UX-011`, `MI-UX-015`, `MI-UX-016`                                                                               |
| Not met | None                                                                                                                                          |
| OBE     | `MI-UX-014`                                                                                                                                   |

## Ordered closeout backlog

Effort ranges are planning estimates and may overlap. Accessibility findings
can expand the remediation work.

### 1. Reconcile the renderer requirements with Phase 0

**Trace:** `MI-UX-002`, `MI-UX-014` (OBE), `MI-UX-017`
**Estimate:** 0.5–1 engineering day

- [x] Change the sensible-default requirement from speculative automatic
      renderer selection to the selected Worker CPU renderer.
- [x] Reframe automatic fallback so any future optional renderer falls back to
      Worker CPU, while the current CPU-only product provides automatic worker
      recovery.
- [x] Update the associated SysML verification objective so Phase 1 does not
      require an intentionally deferred WebGPU implementation.
- [x] Reconcile the requirement matrix and implementation guide with the
      accepted ADR 0002 language.

**Done when:** the normative model, ADR, implementation guide, and verification
matrix describe one consistent CPU-only Phase 1 contract without weakening the
future renderer-fallback requirement.

### 2. Make renderer failures recoverable

**Trace:** `MI-UX-013`, `MI-UX-017`
**Estimate:** 2–4 engineering days

- [x] Introduce a worker factory and lifecycle boundary rather than retaining
      one immutable worker for the application lifetime.
- [x] Handle both worker `error` and `messageerror` events.
- [x] Automatically recreate the worker once and resubmit the current render
      after an unexpected worker failure.
- [x] Bound automatic retries so a persistent fault cannot create a restart
      loop.
- [x] Preserve, cancel, or explicitly restart pending point inspection during
      recovery.
- [x] Present a nonblocking persistent failure state with a keyboard-operable
      **Retry renderer** action after automatic recovery is exhausted.
- [x] Add unit coverage for render rejection followed by successful work.
- [x] Add browser failure injection covering worker crash, automatic recovery,
      persistent failure, manual retry, and continued control operation.

**Done when:** a recoverable render or worker failure does not require a page
reload, persistent failure is understandable and actionable, and injected
browser scenarios pass in Firefox and Chromium.

### 3. Provide immediate visual feedback while panning

**Trace:** `MI-UX-007`  
**Estimate:** 1–2 engineering days

- [x] Translate the most recent stable presentation while a pointer pan is in
      progress, or implement an equally direct visual preview.
- [x] Reset the preview transform when the replacement coarse frame is
      presented or when the interaction is cancelled.
- [x] Verify that pointer and keyboard navigation cancel superseded work and
      that stale frames cannot replace the current request.
- [ ] Manually verify live pointer displacement, final viewport state,
      replacement rendering, and pointer-cancel rollback in supported release
      Chrome and Firefox. Playwright's synthetic pointer path does not expose
      the intermediate pan state reliably in CI, so this evidence must not be
      represented as an automated check.

**Done when:** pan, point zoom, and area zoom all provide immediate visible
feedback and replacement work observes the cancellation budget.

### 4. Complete arbitrary point selection and inspector evidence

**Trace:** `MI-UX-011`, `MI-UX-012`  
**Estimate:** 1.5–3 engineering days

- [x] Add a persistent ring, crosshair, or equivalent non-color marker for an
      arbitrarily selected point.
- [x] Define and test how the marker behaves across pan, zoom, quality changes,
      catalog selection, and reset.
- [x] Associate the selected coordinate and status with the canvas through
      adjacent accessible text.
- [x] Document a coordinate display-precision policy tied to viewport scale
      and raster evidence rather than relying only on a fixed significant-digit
      count.
- [x] Add browser assertions for arbitrary escaped, attracting-cycle, and
      unresolved points.
- [x] Assert canonical `c`, outcome, supporting evidence, available dynamical
      values, definitions, and the selected numerical-quality budget.
- [x] Verify that the inspector never reports precision unsupported by the
      available evidence.

**Done when:** arbitrary and catalog point selection are visibly and
accessibly identifiable, and the inspector has browser evidence for every
truthful outcome class.

### 5. Capture full UI-path performance evidence

**Trace:** `MI-UX-003`, `MI-UX-005`, `MI-UX-007`  
**Estimate:** 1–2 engineering days plus the target-device run

- [x] Add marks for application mount, render request, coarse presentation,
      stable presentation, immediate interaction feedback, and cancellation
      acknowledgement.
- [x] Pair cancellation-request and cancellation-acknowledgement marks by
      request ID so the target-device run can compute acknowledgement p95.
- [x] Measure presentation rather than stopping at worker message receipt.
- [x] Capture rendering-related main-thread long tasks.
- [x] Demonstrate that first-use guidance is interactive before the coarse
      frame and does not delay rendering or navigation.
- [x] Verify one browser render request progresses through requested, coarse,
      and stable presentation states with matching request IDs.
- [x] Run the deployed application on the documented four-core integrated-
      graphics target class in supported release Firefox and Chrome.
- [x] Record browser version, operating system, viewport, hardware, raw samples,
      and trace provenance.
- [ ] Verify the existing budgets:
  - coarse frame: at most 150 ms at 768² and 250 ms at 1024²;
  - stable frame: at most 2.0 s at 768² and 2.25 s at 1024²;
  - Worker CPU cancellation acknowledgement: at most 50 ms p95; and
  - rendering-related main-thread long tasks: zero tasks over 50 ms.
    Coarse, 768² stable, cancellation p95, and Chromium long-task budgets
    passed on 2026-08-18. **1024² stable missed 2.25 s in Chromium 151
    (median 2.364 s) and Firefox 153 (median 2.627 s).** See
    [the target-device record](../../evidence/phase-1/target-device-ui-path-2026-08-18.md).

**Done when:** committed target-device evidence covers application startup,
presentation, navigation feedback, cancellation, and main-thread responsiveness
in both supported browser families.

### 6. Complete accessibility review and remediation

**Trace:** `MI-UX-011`, `MI-UX-015`, `MI-UX-016`  
**Estimate:** 2–4 engineering days, subject to findings

- [x] Automate forced-colors focus, selected-point, classification, and Axe
      checks in Chromium and Firefox.
- [x] Automate 320 px selected evidence, long fact values, persistent renderer
      error, 44 px retry target, manual retry, and horizontal containment.
- [x] Retain 320/375/430 px checks for initial reflow, canvas ratio, guide
      containment, primary target size, and horizontal overflow.
- [ ] Complete every row of the manual accessibility record with reviewer,
      date, browser, operating system, viewport, result, and notes.
- [ ] Review the full tab order and visible focus in Firefox and Chrome.
- [ ] Verify keyboard equivalents for primary navigation, semantic and quality
      selection, reset, catalog operation, point inspection, and disclosures.
- [ ] Review canvas name, instructions, live render state, viewport state, and
      selected-point semantics with assistive technology.
- [ ] Verify 200% text zoom and narrow-viewport reflow without lost controls or
      unintended horizontal scrolling.
- [ ] Verify Windows high-contrast or forced-colors presentation and add an
      explicit forced-colors focus outline if the normal indicator is lost.
- [ ] Evaluate catalog marker target size and spacing against WCAG 2.2 AA;
      enlarge the hit area or provide equivalent operation where necessary.
- [ ] Review stability, multiplier, and period views under protanopia,
      deuteranopia, and tritanopia simulation.
- [ ] Confirm that escaped, attracting-cycle, unresolved, selected, and catalog
      states remain distinguishable without hue alone.
- [ ] Re-run Axe checks after remediation in primary and inspector states in
      both browser projects.

Use the concise [home-test procedure](PHASE1-HOME-TEST.md) and commit a
completed copy of the
[manual evidence template](../../evidence/phase-1/manual-template.md).

**Done when:** the manual record is complete, automated checks remain green,
all discovered applicable WCAG 2.2 AA failures are resolved, and non-color
semantic distinctions are documented with evidence.

### 7. Assemble release-browser and deployment evidence

**Trace:** all Phase 1 requirements  
**Estimate:** 1–2 engineering days

- [x] Retain Playwright coverage in managed Chromium and Firefox.
- [ ] Record explicit supported release-browser versions and validate stable
      Chrome plus branded stable Firefox on the target-device class.
      2026-08-18 recorded Playwright Chrome for Testing 151.0.7922.34 and
      Playwright Firefox 153.0 on the target laptop. Branded Firefox 153.0.3
      is installed but Playwright cannot attach to it; branded Chrome is not
      installed.
- [x] Add the automatable browser scenarios for arbitrary point
      inspection, progressive presentation, and renderer recovery; record
      pointer-pan and pointer-cancel behavior in the manual release-browser
      evidence.
- [x] Run all static checks, 43 or more unit tests, production build, and the
      complete browser matrix from the final candidate commit.
      Local `npm run check` (48 unit tests) and `npm run test:browser` (26/26)
      passed on `3b549eb`; CI run 32080021953 is green.
- [x] Verify the final immutable Cloudflare preview for rendering,
      interaction, accessibility smoke checks, console errors, and network
      errors.
- [x] After the PR #8 merge, verify the production response, first useful
      frame, normal interaction, console health, and visible `6,000,000×`
      ceiling in the
      [2026-08-12 production observation](../../evidence/deployment/cloudflare-2026-08-12.md).
- [x] Repeat the production observation if the final Phase 1 release changes
      built application assets after that baseline.
      Production on 2026-08-18 served `index-B2Japiw_.js` / `index-D1fGRq2y.css`
      from `3b549eb`; see
      [cloudflare-2026-08-18.md](../../evidence/deployment/cloudflare-2026-08-18.md).
- [ ] Update `REQUIREMENTS.md` so every active Phase 1 requirement is **Pass**
      with a stable evidence reference while `MI-UX-014` remains **OBE**.
- [ ] Record the final reviewer and closeout date in
      `PHASE-0-1-CLOSEOUT.md`.

**Done when:** required CI is green, supported release-browser and target-device
evidence is committed, the production deployment is verified, and all sixteen
active normative requirements have passing evidence.

## Phase 1 definition of done

Phase 1 may be declared closed only when:

- [ ] Every task above that contributes to a normative requirement is complete.
- [ ] `MI-UX-001` through `MI-UX-013` and `MI-UX-015` through `MI-UX-017` are
      all marked **Pass**; `MI-UX-014` remains **OBE**.
- [ ] The manual accessibility record contains no blank or `Not run` entries.
- [ ] Target-device UI-path performance meets the documented budgets.
- [ ] Final Firefox and Chrome release validation is recorded.
- [ ] The merged Cloudflare Pages production deployment is verified.
- [ ] The application still uses the selected Worker CPU renderer and enforces
      the `6,000,000×` zoom ceiling.
