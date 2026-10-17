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
- Q5 and Q6 are still open.

### 0. Worth doing now

- [ ] **Confirming release session on the mirror-free build** (owner screen
      time, about 19 minutes headed). It measures the Easy budget, now
      projected at 238 ms against 250 ms in Chrome; it is the last input to the
      "Phase 2 performance closed" approval.
- [ ] **Merge PR #25** (owner). This also clears the Dependabot `source-map-js`
      alert on `main`.
- [ ] **Deep-view first frame.** On deep views near parabolic points the
      coarse frame's ≤256-iteration budget leaves most of the image
      unresolved until the stable frame
      ([closeout finding](PHASE-2-CLOSEOUT.md#findings-from-the-release-runs)).
      Add a depth-aware coarse budget or progressive stable bands; prove it
      with the 6,000,000× basilica rim in the release harness. 2–3.
- [ ] **Bands per worker.** Measure `BANDS_PER_WORKER` (`src/worker/tile-pool.ts`)
      at 8 and 16 against 4 with
      `npm run evidence:release -- --compare name=dist:<dir>`. Adopt only on a paired win with no budget regression. 1.
- [ ] **Memory high-water (`MI-PERF-006`).** It is the one performance
      requirement never measured in the release browsers. Add a
      per-engine high-water figure to the release harness. 1–2.
- [ ] **E2E in-flight replay.** Assert an `inflight-replay` frame naming the
      active computation in the browser provenance test (final-review M6). 0.5.

### 1. Palette acceptance (PLAN item: tune palettes and legends)

**Trace:** proposed `MI-UX-021`; `MI-UX-011`, `MI-UX-016`. **Estimate:** 3–4.
**Needs:** Q5.

- [ ] Define the numeric acceptance: luminance monotonicity of the stability
      ramp, minimum ΔE between the escaped, unresolved and interior classes
      under protan, deutan and tritan simulation, and label contrast over the
      raster.
- [ ] Unit-test those thresholds from the `colorize.ts` output (no browser).
- [ ] Derive the legend swatches from the same palette functions; today they
      are CSS and can drift.
- [ ] Re-run the CVD matrix and axe on any palette change and record the
      evidence under `evidence/phase-2/`.

**Done when:** each view's palette has numeric thresholds that a unit test
checks, and the legend cannot drift from the rendered colours.

### 2. Refine the multiplier, stability and period views

**Trace:** proposed `MI-UX-018`; `MI-UX-010`. **Estimate:** 2–3. **Needs:**
Q1, item 1.

- [ ] The period view emphasizes the (at most 5) periods covering the most
      area in the current view, coloured from a fixed five-colour CVD-safe
      palette in ascending period order; every other period is one neutral
      colour (Q1). Today `src/domain/semantic.ts:52` gives every period its
      own hue. The per-view ranking needs the frame's period histogram at
      colorize time, so a pan or zoom can recolour without reclassifying.
- [ ] Legend numeric scales for κ and |λ|; the period key lists exactly the
      emphasized classes plus "other".
- [ ] Update `DEFINITIONS`, the colorizer byte-parity test, and the e2e legend
      assertions; bump the semantic algorithm version only if cached fields
      change.

**Done when:** the period view follows PLAN §8 and every legend entry states
what its colour means numerically.

### 3. Shareable versioned URLs

**Trace:** proposed `MI-UX-019`. **Estimate:** 3–4. **Needs:** Q2.

- [ ] A short ADR for the URL schema.
- [ ] A pure `encodeState`/`decodeState` module: versioned, exact decimals,
      clamped to the zoom bounds, and falling back to the default view with a
      visible notice on a malformed or unknown-version URL; unit tests.
- [ ] Wire it into `application.ts`: restore on load, debounced
      `replaceState` once a view settles.
- [ ] A keyboard-operable "copy link" control with a live-region
      announcement.
- [ ] E2E in both engines: round trip, malformed URLs, version mismatch.
- [ ] Keep the benchmark `?perf=1` hook separate, or fold it in, and record
      which.

**Done when:** a copied link reopens the same view, semantic view, quality
profile and selection, and an old or broken link degrades visibly, never
silently.

### 4. Catalog schema and tests

**Trace:** PLAN §3.3, §11. **Estimate:** 2.

- [ ] Schema v2: per-entry `residual`, `method` and `provenance` (generator,
      loader, `npm run catalog:check`).
- [ ] A catalog unit test: unique ids, exact period, ray pairs, schema.
- [ ] A stable id scheme that survives regeneration (today's `mi-p4-NN` is
      ordinal).
- [ ] Record internal and angled addresses for the six period-4 entries that
      lack them, or state why not.

**Done when:** every catalog entry carries its validation residual and
provenance, and a unit test guards the file.

### 5. Semantic and image regression tests

**Trace:** proposed `MI-VER-UX-001`; PLAN §7. **Estimate:** 4–5. **Needs:**
Q6; after items 1–2 to avoid churn.

- [ ] A policy note: which fixtures are golden, who regenerates them, and how
      a reviewed change is recorded.
- [ ] Colorized-buffer goldens per view (default plus two zoomed views) in
      unit tests.
- [ ] Browser screenshot baselines for 3 views × 2 engines in the pinned
      Playwright container, as advisory checks or a gate per Q6.
- [ ] UI-state baselines: catalog overlay and a selected marker.
- [ ] Document every fixture in `fixtures/README.md` and wire the checks into
      `npm run check`.

**Done when:** a change to any view's pixels fails a test unless its golden
is regenerated in the same reviewed commit.

### 6. Catalog navigation and annotations

**Trace:** proposed `MI-UX-020`; `MI-UX-006`, `MI-UX-015`, `MI-PERF-008`.
**Estimate:** 6–9. **Needs:** Q4, item 4.

- [ ] A catalog panel: entries grouped by period; activating one zooms to it
      and selects it; keyboard operable.
- [ ] Per-entry annotation text (an optional schema field) and a short
      glossary for internal and angled addresses and rays.
- [ ] A marker density policy (Q4) with a stable focus order; handle label
      collisions.
- [ ] A viewport-indexed lookup so thousands of centres need no full scan.
- [ ] Accessibility tests for the panel: axe, forced colours, 320 px reflow.

**Done when:** every catalog entry is reachable by list and keyboard, and the
marker count stays bounded at any zoom.

### 7. Generated period ≤12 catalog (workstream F as a product feature)

**Trace:** `MI-PERF-003`, `MI-PERF-008`, `MI-VER-PERF-003`; reopens
[ADR 0004](../decisions/0004-catalog-disposition.md). **Estimate:** 7–10.
**Needs:** Q3, items 4 and 6.

- [ ] A generator for exact-period centres through period 12 with a pinned
      arbitrary-precision root isolator.
- [ ] An independent cross-check: counts per period against the known totals,
      residuals, exclusion of divisor periods, conjugate closure.
- [ ] Generated labels, plus curated names where they exist; the encoded size
      budget (≤256 KiB) and a loader off the main thread.
- [ ] Display through item 6's markers and panel.
- [ ] An ADR 0004 amendment recording the product decision.

**Done when:** the full core ships, is validated independently, stays within
its size budget, and is displayed like the curated markers.

## Proposed requirements

To be added to [REQUIREMENTS.md](REQUIREMENTS.md) and the SysML model as each
item lands:

- `MI-UX-018` Period view emphasis: the period view emphasizes no more than
  the agreed classes, each also distinguishable by a non-hue cue, and the
  legend lists exactly what is emphasized.
- `MI-UX-019` Shareable state: the viewport (exact decimal centre and span),
  semantic view, quality profile and selection are encoded in a versioned URL
  and restored on load; malformed or out-of-range values fall back to defaults
  with a notice; an older version is never reinterpreted silently.
- `MI-UX-020` Catalog navigation: every catalog entry is reachable and
  selectable by keyboard and by a list, with zoom-to-entry, annotation text,
  and a bounded marker count.
- `MI-UX-021` Palette acceptance: each view's palette meets declared
  monotonicity and distinguishability thresholds under normal and simulated
  colour vision, and the legend derives from the rendered palette.
- `MI-VER-UX-001` Image regression: each semantic view has committed goldens
  for the default and two zoomed views, with a documented tolerance and
  update procedure.

## Not in Phase 2

These remain a performance and maintenance backlog, each with its own reopen
condition in the closeout:

- overlapping the coarse and stable passes;
- weak-attraction early acceptance (research track L);
- workstream H, pending its exploratory spike;
- the dormant Firefox B bisect, reopened only on a missed budget;
- the 2% always-on overhead check, which needs a recorder-free build;
- TypeScript 7, once `typescript-eslint` supports it.
