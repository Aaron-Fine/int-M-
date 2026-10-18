# Phase 2 TODO

This checklist turns the rest of [Phase 2 — core atlas](../PLAN.md#phase-2--core-atlas)
into an ordered implementation and evidence backlog. The performance part of
Phase 2 (PLAN item "optimize the selected renderer from measured profiles") is
recorded separately in [PHASE-2-CLOSEOUT.md](PHASE-2-CLOSEOUT.md). The other
Phase 2 items had no closeout. The audit behind this list (2026-10-16) found
each one partial or not started.

The owner's direction (2026-10-16): the Phase 1 performance regression is
resolved; the remaining Phase 2 work is done with subagents. Items with
user-visible choices get a short design for owner approval first, and
mechanical items go straight to implementation.

## Fixed scope and decisions

- The product stays the binary64 Worker CPU renderer at the `6,000,000×`
  ceiling ([ADR 0002](../decisions/0002-phase-0-renderer-zoom-and-gpu-gate.md)).
  Deep zoom, perturbation and high precision are Phase 3 and stay out.
- The browser runs only the production renderer
  ([ADR 0007](../decisions/0007-remove-reference-kernels.md),
  [ADR 0008](../decisions/0008-remove-conjugate-mirroring.md)).
- Workstream F, the generated period ≤12 catalog, is a product feature
  candidate. It ships only when its components are displayed the way the
  existing catalog markers are
  ([closeout, F](PHASE-2-CLOSEOUT.md#conditional-workstream-dispositions)).
  It shipped with item 7 ([ADR 0014](../decisions/0014-generated-catalog-core.md)).
- User-programmable colour curves remain a non-goal (PLAN §4).

## Owner design questions

Each needs an answer before the item it gates starts. The recommendations are
from the audit.

| #   | Question                                                                          | Options                                                                                         | Recommendation                                                                                                                                         | Gates |
| --- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| Q1  | Period view scheme (PLAN §8: no "dozens of equally prominent categorical colors") | emphasize p1–p4 plus a neutral "higher"; emphasize the catalog's periods; keep a hue per period | p1–p4 plus neutral, each emphasized class also carrying a non-hue cue                                                                                  | 2     |
| Q2  | URL schema                                                                        | query or hash; fields; `replaceState` vs `pushState`; version tag                               | `?v=1&c=<re>,<im>&s=<span>&view=&q=&sel=`, exact decimals, `replaceState` on settle, a notice on an unknown version                                    | 3     |
| Q3  | How far to expand the catalog, and how to validate it                             | curated p ≤ 6–8 with reviewed addresses; the full p ≤ 12 core (F, 4,016 centres)                | F with generated labels plus optional curated names; a pinned arbitrary-precision tool and an independent count/residual cross-check; reopens ADR 0004 | 6, 7  |
| Q4  | Marker density once the catalog is large                                          | zoom-dependent period cap; clustering; list-only for generated entries                          | zoom-dependent cap (about 40 interactive markers) plus the list                                                                                        | 6     |
| Q5  | Palette acceptance thresholds                                                     | numeric ΔE and contrast floors; simulation review only                                          | keep the stability and multiplier palettes, change only the period view; floors from the existing CVD matrix                                           | 2     |
| Q6  | Image regression gate                                                             | committed browser screenshots; deterministic colorized-buffer hashes                            | buffer hashes as the gate, screenshots advisory                                                                                                        | 5     |

## Ordered backlog

Estimates are engineering days. They are planning figures and may overlap.

### Owner decisions (2026-10-16)

- **Q1:** The period view emphasizes at most **5 periods per view**, chosen by
  area in the current view, and draws every other period in one neutral
  "other periods" colour. A fixed five-colour CVD-safe palette is assigned to
  the emphasized periods in ascending period order, so a period's colour may
  change between views, and the legend always shows the mapping. Basis: on the
  frozen corpus, no view has more than 2 periods covering ≥1% of its pixels,
  or more than 6 covering ≥0.1% (320×200, production classifier). The periods
  that matter vary by view (p4/8/12/16 at 126×, p32 at the Feigenbaum point),
  so a fixed p1–p4 scheme was rejected.
- **Q2:** A versioned query string, `?v=1&c=<re>,<im>&s=<span>&view=&q=&sel=`,
  with exact decimals and `replaceState` once a view settles. Old or broken
  links fall back with a visible notice.
- **Q3:** The full period ≤12 core (workstream F), generated with a pinned
  arbitrary-precision tool and independently cross-checked, with generated
  labels plus curated names where known.
- **Q4:** A zoom-dependent cap of about 40 interactive markers, lowest periods
  first, with the catalog list reaching every entry.
- **Q5:** Keep the stability and multiplier palettes. Set numeric floors
  (minimum colour difference and contrast under simulated colour vision) from
  the passing Phase 1 CVD matrix, checked by unit tests.
- **Q6:** Deterministic hashes of colorized frames in unit tests are the gate;
  browser screenshots are advisory.
- **Palette (2026-10-17):** Okabe–Ito for the five emphasized periods, grey
  `#BBBBBB` for the rest. The non-hue cue is being chosen from a rendered
  experiment ([cue trials](https://claude.ai/artifact/HonnuCvzVG8wBKYkdk8ESW));
  the experiment recommends a texture per rank plus isolate-on-legend-focus.
- **Non-hue cue (2026-10-17):** isolate on legend focus only (option E). The
  owner rejected in-raster textures because they would conflict with the
  stripes that already carry meaning (the multiplier view). Focusing or
  hovering a legend entry dims every other period; the legend lists the
  periods in ascending order with exact numbers, and the point inspector
  states the exact period.
- **Workstream H acceptance (2026-10-17):** period 3 is accepted by margin and
  a derived rounding allowance, like periods 1 and 2, without the cycle
  verifier; ADR 0010 records it and `MI-PERF-004` names analytic closed forms.
- **Workstream H period 4 (2026-10-17):** period 4 is accepted by the same
  margin through a certified root enclosure with a proved binary64 budget,
  without the cycle verifier; ADR 0013 records it. The owner accepted the
  paper-proved Rouché enclosure with the exact sampled audit, and the
  engine-dependent last bits.
- **Workstream H:** adopt period 3 now and period 4 after a rigorous error
  bound ([spike](WORKSTREAM-H-SPIKE-2026-10-16.md)); item 8 below.
- **Item 7 (2026-10-17):** add a find field above the period groups that
  filters by label, id or ray numerators (no roving tabindex); label every
  generated entry by its rays ("Period 4, rays 6/15 and 9/15"), with the
  curated names kept only for the five named components; after a list
  activation on a narrow layout, show a short in-panel confirmation next to
  the list (optionally with a link that scrolls to the canvas), and leave
  focus where it is.
- **Item 7, generator (2026-10-17):** prove which ray pair lands at which
  centre (evidence of the association is not enough); run the full
  regenerate-and-cross-check in CI only when the catalog or its tools change
  and on pushes to main; keep the collision-limited marker counts (29 on
  desktop, 16 on a phone at the default view); accept the measured first open
  of the period-12 group (47–55 ms in Firefox).

### 0. Worth doing now

- [ ] **Before release:** rerun `tools/benchmark/fallback-overhead.ts` (Node),
      with and without `--stride`, after any change to
      `TriggeredRowKernel.classifyRow`, `classifyTriggeredOrbitInto`, the size
      of either analytic solve, or a V8/Node upgrade; the overhead fix for
      periods 3 and 4 depends on V8 inlining heuristics (ADR 0010, ADR 0013).
      Both passes were measured for period 4 (2026-10-17, within 5%).
- [ ] **Flake watch** (all unrelated to item 8; each failed once under heavy
      load on 2026-10-17 and passed on rerun). `classify-rows-allocation.test.ts`
      failed its GC-count assertion `bandOnlyGc ≤ scalarGc + 1` with 2 against
      ≤ 1 at load around 8: it fails when the band-only baseline collects more
      often than the classifier, which is noise in GC delivery under load (extra
      kernel allocation would raise `scalarGc` and make it pass, and
      `classifyPeriodFourInto` allocates no objects). `verifier-prefix.test.ts`
      hit its 5 s timeout at load around 20; it calls only `verifyCycleInto`
      and its reference, and the plan did not touch `verifier.ts`.
      `period-three-gate.test.ts` failed its grid test once at load 12–17
      during the item 8 fix wave and passed at load about 5. Rerun on a quiet
      machine before treating any of them as a regression.
- [x] **Inspector source label for period 4** (owner wording decision). The
      inspector says "Analytic closed form" for the certified period-4 solve,
      which is not a closed form (ADR 0013 Decision 5). Options: "Analytic
      (closed form or certified solve)", or a label per flag. Changing it also
      changes the period 1–3 e2e strings and the pending selected-marker
      baseline.
      Decided 2026-10-18: a label per method. Periods 1–3 keep "Analytic
      closed form"; period 4 says "Certified analytic solve". The period 1–3
      e2e strings are unchanged.
- [ ] **Confirming release session on the mirror-free build** (owner screen
      time, about 19 minutes headed). It measures the Easy budget, now
      projected at 238 ms against 250 ms in Chrome; it is the last input to the
      "Phase 2 performance closed" approval.
- [x] **Merge PR #25** (owner). Merged 2026-10-18 (`5a4c611`). This also clears the Dependabot `source-map-js`
      alert on `main`.
- [x] **Review the five catalog annotations' wording** (`catalog/curation.v2.json`) (owner).
      Approved 2026-10-18 after the literature-nomenclature pass; references to
      the terms are kept out of the annotation text.
- [x] **Phone feedback after a list activation** (decided 2026-10-17:
      an in-panel confirmation; built in item 7). At 320 px the catalog panel stacks below the canvas and the
      inspector, and the "Zoomed to" toast sits inside the canvas stack, so a
      tap on an entry changes things only off-screen. Either scroll the canvas
      into view on narrow layouts (focus stays on the button and leaves the
      viewport), or show a short confirmation in the panel next to the list.
      The list grows long at item 7.
      Done 2026-10-17 (item 7, ADR 0014): at 68rem and narrower a list
      activation shows "Zoomed to …" with a Show the view button, sticky at
      the bottom of the panel; it is not a live region (the toast announces
      once), and focus stays on the entry.
- [x] **Controls bar at 1280 px.** The Pan and Zoom area buttons overlapped the
      Quality select. The overlap did not depend on the catalog panel. Cause:
      above 68rem the bar was `nowrap` and `.controls__fields` had `min-width: 0`,
      so the fields shrank below their content and spilled over the actions. The
      bar now wraps at every width and the fields keep their content width; the
      scenario "keeps controls-bar controls from overlapping at desktop and phone
      widths" pins it at 320, 1024, 1280, 1366 and 1440 px.
- [x] **Deep-view first frame: re-diagnosed, no coarse change.** The
      [coarse-budget study](COARSE-BUDGET-STUDY-2026-10-16.md) found that the
      6,000,000× view's unresolved half is period-4 interior the stable pass
      also misses; H's period-4 path (item 8) is the fix. The depth ramp
      (`src/render/coarse-budget.ts`) stays unwired at today's 256.
- [x] **Coarse budget at the Feigenbaum view (optional).** At 2,500× the
      coarse frame leaves 20.2% of resolvable pixels unresolved (4.8% at a
      512 budget); 126× leaves 6.5%. A depth ramp starting at 1,000× barely
      reaches 2,500× (about 10% of its rise) and does not reach 126×. Decide
      whether a per-view or per-profile coarse budget is worth its
      coarse-frame time; the per-budget costs are already in the study's
      Part 1 tables.
      Decided 2026-10-18: not adopted; the coarse budget stays 256. The gap
      lasts one coarse frame and the stable pass closes it. The figures predate
      period 4 (item 8). Reopen only on a user-visible first-frame complaint.
- [ ] **Bands per worker.** Measure `BANDS_PER_WORKER` (`src/worker/tile-pool.ts`)
      at 8 and 16 against 4 with
      `npm run evidence:release -- --compare name=dist:<dir>`. Adopt only on a paired win with no budget regression. 1.
- [ ] **Memory high-water (`MI-PERF-006`).** Harness pass landed 2026-10-17 (main-thread JS heap in Chromium; `retained` and Firefox not measured headless); stays open until a measured `retained` figure from branded Chrome and an owner decision on the Firefox gap. It is the one performance
      requirement never measured in the release browsers. Add a
      per-engine high-water figure to the release harness. 1–2.
      Decided 2026-10-18 (Firefox gap): the requirement passes on the
      branded-Chrome `retained` figure from the owner's screen session;
      Firefox is recorded as unmeasured, and a manual `about:memory` reading
      is the reopen path. Still open until that Chrome figure exists.
- [x] **Corpus rationale corrections.** `mi-fallback-weak-attraction` is
      period 3 (|λ| 0.848–0.902), not period 6. The left half of
      `mi-scale-6mx-basilica-rim` is period-4 interior, not near-parabolic
      exterior ([H spike, side finding 1](WORKSTREAM-H-SPIKE-2026-10-16.md#side-findings)).
      Correct the rationale text only; the frozen view parameters stay. 0.5.
- [x] **E2E flake watch.** Three different tests each failed once in a full
      headless run and passed alone (2026-10-16/17, all while other agents
      loaded the laptop): Firefox "pans from a catalog marker…", Chromium
      "marks and describes arbitrary … points", Firefox "catalog markers are
      keyboard-selectable" (each two to four times by 2026-10-17); and Chromium "render traces carry delivery provenance…" once, at the recolor assertion (`originComputeId` 4 against an expected 2). Rerun the suite on a quiet machine with
      `--repeat-each 5`; fix any test that still fails (waits on fixed
      timeouts rather than state). 0.5–1. Root cause found for the Chromium
      one (2026-10-17): `resetView` in `src/ui/application.ts` does not
      invalidate `state.activeInspectionRequestId`, so a slow inspection
      reply arriving after Reset re-selects the point. That is a real app
      race: fix it in `resetView` and make the test await the inspection
      result before Reset.
      Done 2026-10-17: Reset now invalidates the pending inspection and ends a
      drag in progress; the catalog overlay keeps its marker buttons across
      redraws (the cause of both Firefox flakes and of lost keyboard focus);
      the provenance flake was not reproduced. Probable cause: the page closes a
      render trace in a `requestAnimationFrame` after it sets
      `data-render-stage="stable"`, so the test could read the ring before the
      newest trace closed and take an older computed trace as the cached one.
      The test now waits for the settled request's own trace, and prints the
      trace ring from both the recolor and the in-flight replay assertions; the
      coarse and stable order test waits for the presented marks of the request
      on screen; the folded first-use flow is marked slow. The full suite
      passed `--repeat-each 3 --workers 8` beside eight busy loops (225 passed,
      3 skipped, 0 failed, both engines). Not run: `--repeat-each 5` on a quiet
      machine (substituted by the loaded run; the owner accepted the substitution
      on 2026-10-18).
- [x] **Catalog marker target size at 320 px.** axe reports a `target-size`
      violation on catalog markers at 320 px width (for example the button
      "Airplane component, period 3"), found while planning item 3. Enlarge the hit
      target without changing the drawn marker, and add axe to the 320 px
      reflow test. 0.5–1.
      Done 2026-10-17: below 28rem (448 px) period-4 markers use their 24px dot
      as the hit target; above it they keep 44 px (axe fails at 440 px with the
      44 px box and passes at 448 px). Their focus ring clears the diamond tips.
      axe runs at 320, 375 and 430 px, each in its own single-viewport test (kept
      out of the multi-viewport reflow test, which would exceed 30 s under load).
- [x] **E2E in-flight replay.** Assert an `inflight-replay` frame naming the
      active computation in the browser provenance test (final-review M6). 0.5.

### 1. Palette acceptance (PLAN item: tune palettes and legends)

**Trace:** proposed `MI-UX-021`; `MI-UX-011`, `MI-UX-016`. **Estimate:** 3–4.
**Needs:** Q5.

- [x] Define the numeric acceptance: luminance monotonicity of the stability
      ramp, minimum ΔE between the escaped, unresolved and interior classes
      under protan, deutan and tritan simulation, and label contrast over the
      raster.
- [x] Unit-test those thresholds from the `colorize.ts` output (no browser).
- [x] Derive the legend swatches from the same palette functions; today they
      are CSS and can drift.
- [x] Re-run the CVD matrix and axe on any palette change and record the
      evidence under `evidence/phase-2/`.

**Done when:** each view's palette has numeric thresholds that a unit test
checks, and the legend cannot drift from the rendered colours.

### 2. Refine the multiplier, stability and period views

**Trace:** proposed `MI-UX-018`; `MI-UX-010`. **Estimate:** 2–3. **Needs:**
Q1, item 1.

- [x] The period view emphasizes the (at most 5) periods covering the most
      area in the current view, coloured from a fixed five-colour CVD-safe
      palette in ascending period order; every other period is one neutral
      colour (Q1). Today `src/domain/semantic.ts:52` gives every period its
      own hue. The per-view ranking needs the frame's period histogram at
      colorize time, so a pan or zoom can recolour without reclassifying.
- [x] Legend numeric scales for κ and |λ|; the period key lists exactly the
      emphasized classes plus "other".
- [x] Update `DEFINITIONS`, the colorizer byte-parity test, and the e2e legend
      assertions; bump the semantic algorithm version only if cached fields
      change.

**Done when:** the period view follows PLAN §8 and every legend entry states
what its colour means numerically.

### 3. Shareable versioned URLs

**Trace:** `MI-UX-019`. **Estimate:** 3–4. **Needs:** Q2.

- [x] A short ADR for the URL schema
      ([ADR 0009](../decisions/0009-shareable-url-schema.md)).
- [x] A pure `encodeShareState`/`decodeShareState` module: versioned, exact decimals,
      clamped to the zoom bounds, and falling back to the default view with a
      visible notice on a malformed or unknown-version URL; unit tests
      (`src/ui/share-state.ts`, `src/ui/share-link.ts`).
- [x] Wire it into `application.ts`: restore on load, debounced
      `replaceState` once a view settles.
- [x] A keyboard-operable "copy link" control with a live-region
      announcement.
- [x] E2E in both engines: round trip, malformed URLs, version mismatch.
- [x] Keep the benchmark `?perf=1` hook separate, or fold it in, and record
      which. Kept separate (ADR 0009): `perf=1` is orthogonal to a share
      link, and the harness's `view=<re>,<im>,<spanY>&quality=` still applies
      to a URL without share fields, so `--compare` against earlier builds
      keeps working.

**Done when:** a copied link reopens the same view, semantic view, quality
profile and selection, and an old or broken link degrades visibly, never
silently.

### 4. Catalog schema and tests

**Trace:** PLAN §3.3, §11. **Estimate:** 2.

- [x] Schema v2: per-entry `residual`, `method` and `provenance` (generator,
      loader, `npm run catalog:check`). Done:
      [ADR 0011](../decisions/0011-catalog-schema-v2-and-stable-ids.md),
      `catalog/components.v2.json`, `src/catalog/schema.ts`.
- [x] A catalog unit test: unique ids, exact period, ray pairs, schema.
      Done: `tests/unit/catalog/` and `npm run catalog:test`.
- [x] A stable id scheme that survives regeneration (today's `mi-p4-NN` is
      ordinal). Done: `mi-p<p>-<a>-<b>` from the characteristic rays; v1 ids
      stay as aliases, `v` unchanged (ADR 0011, ADR 0009 amendment).
- [x] Record internal and angled addresses for the six period-4 entries that
      lack them, or state why not. Done: generated from the rays (kneading
      sequence, Schleicher denominators, tuned sub-wakes), listed in ADR 0011.

**Done when:** every catalog entry carries its validation residual and
provenance, and a unit test guards the file.

### 5. Semantic and image regression tests

**Trace:** `MI-VER-UX-006` (proposed as `MI-VER-UX-001`); PLAN §7. **Estimate:** 4–5. **Needs:**
Q6; after items 1–2 to avoid churn.

- [x] A policy note: which fixtures are golden, who regenerates them, and how
      a reviewed change is recorded. Done:
      [fixtures/README.md](../../fixtures/README.md#golden-fixture-policy).
- [x] Colorized-buffer goldens per view (default plus two zoomed views) in
      unit tests. Done: `fixtures/colorized-golden.v1.json`,
      `tests/unit/render/colorized-golden.test.ts`.
- [x] Browser screenshot baselines for 3 views × 2 engines in the pinned
      Playwright container, as advisory checks or a gate per Q6. Done:
      advisory, `tests/visual/` with its own configuration
      (`npm run test:visual:container`) and a non-gating CI job.
- [x] UI-state baselines: catalog overlay and a selected marker (advisory,
      `tests/visual/`).
- [x] Document every fixture in `fixtures/README.md` and wire the checks into
      `npm run check` (`catalog:test`, `fixtures:golden:check`; the golden
      unit tests run in `test:unit`).

**Done when:** a change to any view's pixels fails a test unless its golden
is regenerated in the same reviewed commit.

### 6. Catalog navigation and annotations

**Trace:** `MI-UX-020`; `MI-UX-006`, `MI-UX-015`, `MI-PERF-008`.
**Estimate:** 6–9. **Needs:** Q4, item 4.

- [x] A catalog panel: entries grouped by period; activating one zooms to it
      and selects it; keyboard operable. Done: `src/ui/catalog-panel.ts`,
      [ADR 0012](../decisions/0012-catalog-navigation-and-marker-density.md).
- [x] Per-entry annotation text (an optional schema field) and a short
      glossary for internal and angled addresses and rays. Done: `annotation`
      (at most 280 characters) in schema v2 and `catalog/curation.v2.json`,
      five curated, named by the literature (owner decision 2026-10-18: "1/3-bulb
      (Douady rabbit)"); the glossary in the catalog panel
      (`src/ui/catalog-glossary.ts`) defines the parameter ray pair.
- [x] A marker density policy (Q4) with a stable focus order; handle label
      collisions. Done: `src/ui/marker-density.ts`: at most 40 markers,
      lowest periods first, catalog focus order, colliding labels hidden.
- [x] A viewport-indexed lookup so thousands of centres need no full scan.
      Done: `src/catalog/viewport-index.ts`; at the default view it examines
      53 of 4,016 synthetic entries.
- [x] Accessibility tests for the panel: axe, forced colours, 320 px reflow.
      Done: `Catalog panel (MI-UX-020)` in Firefox and Chromium.

**Done when:** every catalog entry is reachable by list and keyboard, and the
marker count stays bounded at any zoom.

### 7. Generated period ≤12 catalog (workstream F as a product feature)

**Trace:** `MI-PERF-003`, `MI-PERF-008`, `MI-VER-PERF-003`; reopens
[ADR 0004](../decisions/0004-catalog-disposition.md). **Estimate:** 7–10.
**Needs:** Q3, items 4 and 6.

- [x] A generator for exact-period centres through period 12 with a pinned
      arbitrary-precision root isolator. Done: `tools/catalog_certify.py`
      (ball arithmetic, Krawczyk test, divisor exclusion) and
      `tools/generate_catalog_core.py`, standard library only, about 100 s;
      [ADR 0014](../decisions/0014-generated-catalog-core.md).
- [x] An independent cross-check: counts per period against the known totals,
      residuals, exclusion of divisor periods, conjugate closure. Done:
      `tools/crosscheck_catalog_core.py`, exact integer arithmetic and
      Rouché's theorem at every stored centre, and `tools/crosscheck_rays.py`,
      which proves that for c at each centre the pair's two dynamic rays land
      together at a repelling periodic point, so that with the wake theorem
      every pair's parameter rays are proved to land at the root of its
      centre's component (owner decision 2026-10-17); about 3 minutes in parallel. The
      `Catalog core` workflow runs both when the catalog or its tools change
      and on pushes to main.
- [x] Generated labels, plus curated names where they exist; the encoded size
      budget (≤256 KiB) and a loader off the main thread. Done:
      `catalog/core.v1.bin`, 136,560 bytes; `src/worker/catalog-core.worker.ts`.
- [x] Display through item 6's markers and panel.
- [x] Lazy period groups (ADR 0012): a group of more than 8 entries builds
      its buttons on first open. Over the real 4,016-entry catalog, add an
      e2e for build on first open, no duplicates on re-open, and a link
      `sel=` to an entry in an unbuilt group marking it current once built.
      Measure the main-thread time to build the 2,010-entry period-12 group,
      which `setSelected` builds synchronously on any selection in it.
      Done: `Catalog core (ADR 0014)` scenarios; 34–39 ms in Chromium and
      47–55 ms in Firefox.
- [x] Asynchronous catalog hand-over. A loader off the main thread means the
      index and the panel can no longer be built at mount from a synchronous
      import (`application.ts`). Add an update path (for example
      `catalogPanel.setGroups` and an index swap) and decide what the panel
      shows while loading. Done: `catalogPanel.addGroups`, an index swap, and
      "Loading periods 5 to 12…" where the groups will appear.
- [x] Keyboard efficiency in long groups: a find field filtering by label, id
      or ray numerators (owner decision 2026-10-17; no roving tabindex).
      Done: `src/catalog/find.ts`.
- [x] Screen-reader verbosity: replace the per-entry `aria-describedby` hint
      with one description on the region or on each list, and include the
      panel at full size in the manual screen-reader record. Done: one
      description on the region; PHASE1-HOME-TEST step 3 (owner to run).
- [x] Scroll the current entry into view inside its 20rem list when the
      selection comes from a marker or a link, without moving focus.
- [x] Q4 measurement on real geometry (the synthetic centres are not real).
      Record the placed-marker count at the default and representative zooms
      on desktop (922×576) and phone (300×225) canvases. If collisions leave
      far fewer than about 40, decide whether to keep walking periods. Check
      the label-width estimate against real generated labels ("Period 12,
      rays a/4095 and b/4095" hits the 11rem maximum), and whether 40 markers
      is too dense on a phone canvas. Done: 29 and 16 at the default view;
      the walk is kept (the phone saturates at 18 even over all 4,016); labels
      measure 9.5–13.7rem, so the maximum is 14rem (ADR 0014).
- [x] Sizes: the generator's cross-check asserts that `componentSizeEstimate`
      is finite and greater than 0 for every entry.
- [x] E2e at scale: a marker left off by the policy; selecting from the list
      an entry the policy had left off, which forces it in and exercises the
      JS re-plan that CSS alone cannot pass; and a re-check of the
      data-dependent preconditions (the `.catalog-marker--label-hidden` count
      and the compact pairs). Done (Period 5, rays 7/31 and 8/31):
      `selects from the list an entry the policy left off, and a link forces it in`.
- [x] Labels by rays for every generated entry, period 4 included
      ("Period 4, rays 6/15 and 9/15"); curated names only for the five named
      components (owner decision 2026-10-17; ADR 0011).
- [x] An ADR 0004 amendment recording the product decision.
- [ ] Owner: regenerate the advisory `catalog-overlay.png` and
      `selected-marker.png` baselines in the container for both engines
      (`npm run test:visual:container`, with the owner's update flag), since
      the default view now shows 18 more markers (`fixtures/README.md`).

**Done when:** the full core ships, is validated independently, stays within
its size budget, and is displayed like the curated markers.

### 8. Algebraic period-3/4 classification (workstream H)

**Trace:** `MI-PERF-001`, plan §3 answer-change rule. **Estimate:** p3 3–4;
p4 3–5 more. **Basis:** [H spike](WORKSTREAM-H-SPIKE-2026-10-16.md).

- [x] **Period 3:** add the closed form λ = 4(c+2) ± 4i·c·√(4c+7) as an
      analytic fast path beside the period-1/2 ones, with a written error
      budget and, if practical, a Lean statement next to `PeriodThreeLocus`. Done: [ADR 0010](../decisions/0010-analytic-period-three.md), [PERFORMANCE-MATHEMATICS §11](../PERFORMANCE-MATHEMATICS.md#11-period-3-closed-form-workstream-h-adr-0010).
- [x] Place the test so early escapers never pay it (the spike measured
      3–8% fallback overhead on the far exterior against a 5% limit). Done: first scanning iteration; straight-line gate in the scalar kernel, a per-row Re c window in the row kernel (the stable pass); Node [overhead](../../evidence/phase-2/2026-10-17-1bffe34-period-three-overhead/summary.md) within 5%.
- [x] Evidence codes and flags for the analytic source; regenerate the golden
      kernel fixture in the same commit, with oracle evidence for every
      changed pixel (unresolved → attracting). Done: [adjudication](../../evidence/phase-2/2026-10-17-9c1471e-period-three-adjudication/summary.md), 19,216 changed pixels, 0 unsupported.
- [ ] A release-harness run in both browsers. Deferred to the owner's screen session (headed release harness). It now covers period 4 too.
- [x] **Period 4, after a rigorous root-error bound** (Kantorovich, or a cusp
      exclusion disk): the cubic solve inside the component boxes. This also
      resolves the unresolved half of the 6,000,000× basilica-rim view. Done: [ADR 0013](../decisions/0013-analytic-period-four.md), a certified root enclosure with a proved binary64 budget ([PERFORMANCE-MATHEMATICS §12](../PERFORMANCE-MATHEMATICS.md#12-period-4-cubic-with-a-certified-root-workstream-h-adr-0013)); [adjudication](../../evidence/phase-2/2026-10-17-cf414cc-period-four-adjudication/summary.md): 12,435 changed golden-raster pixels and all 327,680 pixels of the 6,000,000× view's left half at 1024×640, 0 unsupported; Node [overhead and gain](../../evidence/phase-2/2026-10-17-cf414cc-period-four-overhead/summary.md).

**Done when:** the hard views gain as the spike measured, in the browsers, and
every changed pixel is adjudicated against the oracle.

## Proposed requirements

To be added to [REQUIREMENTS.md](REQUIREMENTS.md) and the SysML model as each
item lands:

- `MI-UX-018` Period view emphasis: the period view emphasizes no more than
  the agreed classes, each also distinguishable by a non-hue cue, and the
  legend lists exactly what is emphasized. Added with items 1 and 2: the
  non-hue identification is the ordered legend (exact periods, area shares)
  plus isolation on legend hover, focus or activation.
- `MI-UX-019` Shareable state: the viewport (exact decimal centre and span),
  semantic view, quality profile and selection are encoded in a versioned URL
  and restored on load; malformed or out-of-range values fall back to defaults
  with a notice; an older version is never reinterpreted silently. Added
  2026-10-16 with item 3.
- `MI-UX-020` Catalog navigation: every catalog entry is reachable and
  selectable by keyboard and by a list, with zoom-to-entry, annotation text,
  and a bounded marker count. Added 2026-10-17 with item 6.
- `MI-UX-021` Palette acceptance: each view's palette meets declared
  monotonicity and distinguishability thresholds under normal and simulated
  colour vision, and the legend derives from the rendered palette. Added with
  item 1.
- `MI-VER-UX-006` Image regression (proposed as `MI-VER-UX-001`, which the
  SysML model already uses for the first-use verification case): each
  semantic view has committed goldens for the default and two zoomed views,
  with a documented tolerance and update procedure. Added 2026-10-17 with
  item 5.

## Not in Phase 2

These remain a performance and maintenance backlog, each with its own reopen
condition in the closeout:

- overlapping the coarse and stable passes;
- weak-attraction early acceptance (research track L);
- the dormant Firefox B bisect, reopened only on a missed budget;
- the 2% always-on overhead check, which needs a recorder-free build;
- TypeScript 7, once `typescript-eslint` supports it.
