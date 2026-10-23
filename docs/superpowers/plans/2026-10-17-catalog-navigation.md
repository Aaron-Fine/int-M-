# Catalog Navigation and Marker Density Implementation Plan

<!-- prettier-ignore-start -->
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every catalog entry reachable by a keyboard-operable list grouped by period (activating an entry zooms to it and selects it), add optional annotations and a glossary, and bound the canvas markers to about 40 at any zoom with a pure, tested density policy over a viewport index, all designed and tested at the 4,016-entry scale of PHASE2-TODO item 7.

**Architecture:** Three pure modules carry the logic and are unit-tested against a synthetic 4,016-entry catalog built in the tests: `src/catalog/navigation.ts` (catalog order, size estimate, zoom span, period groups), `src/catalog/viewport-index.ts` (per-period buckets sorted by Re, queried lowest period first) and `src/ui/marker-density.ts` (`planMarkers`: cap, priority, dot and label collisions, focus order). The DOM layer is thin: `src/ui/catalog-panel.ts` renders the list and glossary, and `src/ui/application.ts` asks `planMarkers` which marker buttons to show on each frame. Schema v2 gains an optional `annotation`, carried by the Python generator from the curation file.

**Tech Stack:** TypeScript 6, Vite 8, Vitest 5 (Node environment, no DOM), Playwright 1.64.1 with `@axe-core/playwright` 4.14.0 (Chromium and Firefox, headless), Python 3 standard library (`unittest`), Node 24, npm 12.

**Spec:** `docs/verification/PHASE2-TODO.md`, item "6. Catalog navigation and annotations", with the owner decisions at the top of that file: Q4 (a zoom-dependent cap of about 40 interactive markers, lowest periods first, with the catalog list reaching every entry) and Q3 (the full period ≤12 core, item 7, which this item must be ready for). Also ADR 0004, ADR 0009 (`sel=` and alias canonicalisation), ADR 0011 (schema v2, ray-derived ids), `docs/verification/REQUIREMENTS.md` (`MI-UX-006`, `MI-UX-015`, `MI-PERF-008`, and the proposed `MI-UX-020` in PHASE2-TODO "Proposed requirements"), and `fixtures/README.md` (the golden policy).

**Done when (spec):** every catalog entry is reachable by list and keyboard, and the marker count stays bounded at any zoom.

## Global Constraints

- `npm run check` passes at every commit. Run it before each commit; a task is not done while it fails.
- Renderer untouched: no change to `src/render/`, `src/worker/`, `src/domain/` (except reading its exports), the kernels, the colourisation or any golden (`fixtures/kernel-golden.v1.json`, `fixtures/colorized-golden.v1.json`). Markers and the panel are DOM outside the colourised buffer; `tools/generate_colorized_golden.ts` imports only `src/domain`, `src/render` and the benchmark corpus, never `src/ui` or `src/catalog`. If `npm run fixtures:golden:check` or a golden unit test fails, stop and report; do not regenerate.
- E2E runs headless in both engines: `npx playwright test --project=chromium --project=firefox …` for targeted runs, `npx playwright test` for the full suite. Never pass `--headed`; never run `test:browser:headed`.
- Before any Playwright run, check that nothing already listens on port 4174 (`ss -ltn | grep -q ':4174 ' && echo BUSY`). Outside CI, Playwright reuses a running server, which would test a stale build. If it prints `BUSY`, stop that server first.
- Advisory screenshots (`tests/visual/`) are not gating. Never run `npm run test:visual -- --update-snapshots` or `npm run test:visual:container -- --update-snapshots=all`: only the owner regenerates baselines, in the container. The annotation changes `selected-marker-evidence.png`; the CI job is `continue-on-error`, and Task 7 records the pending baseline in `fixtures/README.md`.
- Markdown: never wrap an inline code span across lines (Prettier oscillates). After editing Markdown, run `npx prettier --write <files>` twice, then `npx prettier --check <files>`.
- `catalog/components.v2.json` is generated: never edit it by hand; regenerate it with `python3 tools/generate_catalog.py --write catalog/components.v2.json`. `npm run catalog:check` requires byte equality.
- No new npm or pip dependencies.
- Code passes the repository's strict settings: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `typescript-eslint` `strictTypeChecked` with `--max-warnings 0` and `complexity` 18. Run `npx prettier --write` on every TypeScript and CSS file you touch.
- Work on branch `phase-2/core-atlas` from the repository root `/home/aaron/int-M-`. Commit once per task with the message given. Do not push.
- Commit messages use the repository's "Area: summary" style and end with the trailer line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- An untracked plan file breaks `npm run check` (Prettier sees it). The controller commits this plan with `git commit -- docs/superpowers/plans/2026-10-17-catalog-navigation.md`; implementers never stage it with `git add -A`.
- Edits to existing files are given as exact text to find, not line numbers; line numbers in **Files** lists are approximate.
- The code in this plan was verified on a scratch copy of `b7cb494`: `npm run check` passed (754 unit tests), and the full Playwright suite, new scenarios included, passed headless in both engines (97 passed, 1 skipped).

## Review Focus

1. A person selects a high-period entry from the list while the view is crowded or the cap is full: they expect its marker to appear and its neighbours to yield, not to see nothing — Task 4, `always shows the selected entry when it is in view, with its label` and the selected case in `drops a marker whose dot would cover a dot already placed`.
2. A person browsing with 200% text: rem-sized markers grow, so the policy must space them by the real root font size or hit boxes overlap — Task 4, `scales hit boxes with the root font size`.
3. Activating a tiny component near the tip (smaller than the ceiling allows) or an entry whose orbit escapes must open a valid view at the ceiling, never `NaN` or a span past the bounds — Task 2, `never zooms past the 6,000,000× ceiling or out past the widest view`.
4. A shared link, including a v1 alias such as `sel=mi-p4-02`, must open with that entry marked in the list — Task 6, `marks the entry a shared link selects, also by a v1 alias`.
5. Keyboard focus on a marker must survive the policy re-planning the overlay on every frame (a rebuilt or moved button loses focus) — Task 5 runs the existing `keeps keyboard focus on a catalog marker across a redraw` and `keeps one marker per component and the selection across redraws and toggles` scenarios.

## Design Decisions

Each decision is recorded in ADR 0012 (Task 7).

- **Panel placement and disclosure.** A "Catalog" section after the legend in the side panel, which already stacks below the canvas at 68rem and 45rem, so the panel never takes canvas space at 320 px. Each period is a native `<details>` (keyboard operable with no script); a group of at most 8 entries starts open (all of today's catalog), a larger one builds its buttons on first open and scrolls inside 20rem. Rationale: native disclosure is accessible by default, and lazy groups keep the 4,016-entry core free until used.
- **Grouping and order.** By period, then by the lower characteristic angle a/(2^p − 1) (ray order). Rationale: exact integers carried by the id alone (item 7's compact form stores `(p, a, b)`), total within a period, the cyclic order of the roots around the set, and immune to binary64 ties (conjugates share Re exactly). The marker focus order is the same order, so it never depends on the view. The file order is unchanged.
- **Activation.** Centre on the component and set spanY to 2.5 × Heiland-Allen's size estimate, clamped to `[MIN_VIEWPORT_SPAN_Y, MAX_VIEWPORT_SPAN_Y]` (never past `6,000,000×`); select it, announce "Zoomed to …", keep focus on the entry. Rationale: sizes within one period differ by two orders of magnitude, the estimate costs p complex multiplications and needs no stored field. Markers keep their current behaviour (inspect without zooming).
- **Annotations.** Optional `annotation` in schema v2: one line, at most 280 code points, no leading or trailing white space, no control characters; additive, so `schemaVersion` stays 2 and links stay `v=1`. The generator carries it from `catalog/curation.v2.json` (byte equality kept by regenerating). The five named components get one; the inspector shows it under the entry's name.
- **Glossary.** Data in `src/ui/catalog-glossary.ts`, shown as a disclosure at the end of the catalog panel: period, characteristic rays, internal address, angled internal address. Rationale: it explains the list's grouping, order and ids where they appear; the inspector's existing help is about numerical evidence.
- **Marker density policy (Q4).** `planMarkers` (pure): candidates are whole lowest periods until at least 40 in view, plus the selected entry; priority is selected, period, larger size estimate, catalog order (deterministic, conjugates tie exactly and fall to rank); a candidate is dropped only when the cap is reached or its 1.5rem dot would overlap a placed dot; a marker whose 2.75rem hit box overlaps another becomes compact (hit box = dot), so hit boxes never overlap (WCAG 2.5.8); a label is hidden when it would cover an earlier label or another marker, never the marker itself, and the selected entry always keeps its label; output in catalog order.
- **Viewport index.** One bucket per period, sorted by Re, built once at load; a query binary-searches each bucket's Re slab and stops after the first period that brings the candidates to 40. Rationale: the simplest structure that avoids a full scan; at the default view it examines 53 of 4,016 synthetic entries, asserted by counting, and at every zoom it examines exactly the Re slab of the periods it walks.
- **Accessibility tests.** Browser scenarios in both engines (the default Playwright projects): axe with the glossary open and an entry selected, forced colours (selected entry and focus cues), 320 px reflow (panel below the canvas, 44 px entries, axe), Tab reach of every entry in catalog order, group disclosure by keyboard, marker hit boxes apart at 320 px.
- **Traces.** `MI-UX-020` is added to REQUIREMENTS.md and the SysML model (satisfied by `uiShell`, verified by `MI-VER-UX-002` and `MI-VER-UX-005`), the `MI-PERF-008` trace row names the new evidence, ADR 0011 gets an amendment, and item 6 is ticked in PHASE2-TODO.md.

## File Structure

| File | Responsibility | Task |
| --- | --- | --- |
| `src/catalog/schema.ts` (modify) | `annotation` field and its validation; set-based uniqueness | 1 |
| `src/catalog/components.ts` (modify) | Re-export `ANNOTATION_MAX_LENGTH` | 1 |
| `tools/generate_catalog.py`, `tools/test_generate_catalog.py` (modify) | Carry and validate curated annotations | 1 |
| `catalog/curation.v2.json` (modify), `catalog/components.v2.json` (regenerated) | Five annotations | 1 |
| `catalog/README.md` (modify) | Document the field | 1 |
| `tests/unit/catalog/synthetic-catalog.ts` (new) | Synthetic 4,016-entry catalog and a hand-placed component helper | 1 |
| `tests/unit/catalog/schema.test.ts` (modify) | Annotation acceptance and rejection; loader at scale | 1 |
| `src/catalog/navigation.ts` (new) | Catalog order, size estimate, zoom span, period groups | 2 |
| `tests/unit/catalog/navigation.test.ts` (new) | Its tests | 2 |
| `src/catalog/viewport-index.ts` (new) | Per-period Re-sorted index, `viewportBounds` | 3 |
| `tests/unit/catalog/viewport-index.test.ts` (new) | Visit counts and full-scan agreement | 3 |
| `src/ui/marker-density.ts` (new) | `planMarkers` | 4 |
| `tests/unit/ui/marker-density.test.ts` (new) | Cap, priority, collisions, focus order | 4 |
| `src/ui/application.ts` (modify) | Overlay uses `planMarkers` (5); panel, activation, annotation (6) | 5, 6 |
| `src/styles.css` (modify) | Compact and hidden-label markers (5); panel and glossary (6) | 5, 6 |
| `tests/unit/catalog/catalog.test.ts` (modify) | Retitle the file-order test | 5 |
| `tests/e2e/explorer.spec.ts` (modify) | Marker order and spacing (5); `Catalog panel (MI-UX-020)` (6) | 5, 6 |
| `src/ui/catalog-glossary.ts`, `src/ui/catalog-panel.ts` (new) | Glossary data; the panel DOM | 6 |
| `docs/decisions/0012-catalog-navigation-and-marker-density.md` (new) | The decisions | 7 |
| `docs/decisions/0011-…`, `docs/verification/REQUIREMENTS.md`, `docs/verification/PHASE2-TODO.md`, `model/MandelbrotInteriority.sysml`, `model/README.md`, `fixtures/README.md` (modify) | Traces and the advisory note | 7 |

---

### Task 1: Optional annotations in schema v2, and the loader at 4,016 entries

Add the optional `annotation` field end to end (curation, generator, generated file, loader) and a synthetic catalog with the period ≤12 core's shape, which later tasks reuse.

**Files:**
- Modify: `tools/generate_catalog.py` (constants near line 40; `build_entry` near line 320; `check_curation` near line 400)
- Modify: `tools/test_generate_catalog.py`
- Modify (full rewrite): `catalog/curation.v2.json`
- Regenerate: `catalog/components.v2.json`
- Modify: `catalog/README.md`
- Modify: `src/catalog/schema.ts`, `src/catalog/components.ts`
- Create: `tests/unit/catalog/synthetic-catalog.ts`
- Modify: `tests/unit/catalog/schema.test.ts`

**Interfaces:**
- Consumes: `parseCatalog`, `catalogIdFor`, `rayModulus`, `Catalog`, `CatalogComponent` from `src/catalog/components.ts`.
- Produces:
  - `CatalogComponent.annotation?: string` and `ANNOTATION_MAX_LENGTH = 280` (exported from `src/catalog/schema.ts` and re-exported by `src/catalog/components.ts`).
  - Python `ANNOTATION_MAX_LENGTH = 280` and `check_annotation(identifier: str, annotation: object) -> None` in `tools/generate_catalog.py`.
  - `tests/unit/catalog/synthetic-catalog.ts`: `COMPONENT_COUNTS` (readonly tuple of 12 counts), `exactPeriodNumerators(period: number): number[]`, `syntheticCatalogData(maxPeriod = 12): Record<string, unknown>`, `syntheticCatalog(maxPeriod = 12): Catalog`, `testComponent(period: number, lower: number, upper: number, center: { re: number; im: number }, label?: string): CatalogComponent`.

- [ ] **Step 1: Write the failing Python tests**

In `tools/test_generate_catalog.py`, find:

```python
        self.assertNotIn("aliases", rabbit)
```

and replace it with:

```python
        self.assertNotIn("aliases", rabbit)
        self.assertNotIn("annotation", rabbit)

    def test_curated_annotations_follow_the_label(self) -> None:
        rabbit = next(e for e in self.catalog["components"] if e["id"] == "mi-p3-1-2")
        self.assertEqual(list(rabbit)[:4], ["id", "aliases", "label", "annotation"])
        self.assertIn("Douady rabbit", rabbit["annotation"])
        period_four = next(e for e in self.catalog["components"] if e["id"] == "mi-p4-1-2")
        self.assertNotIn("annotation", period_four)
```

In the same file, find:

```python
    def test_rejects_an_empty_label(self) -> None:
```

and replace it with:

```python
    def test_rejects_a_malformed_annotation(self) -> None:
        for annotation, message in [
            ("", "empty"),
            (42, "non-text"),
            (" leading space", "white space"),
            ("two\nlines", "control characters"),
            ("x" * 281, "longer than 280"),
        ]:
            with self.subTest(annotation=annotation):
                curation = {"mi-p1-0-1": {"label": "Main", "annotation": annotation}}
                with self.assertRaisesRegex(ValueError, message):
                    check_curation(curation, self.components())

    def test_accepts_an_annotation_of_the_maximum_length(self) -> None:
        curation = {"mi-p1-0-1": {"label": "Main", "annotation": "x" * 280}}
        check_curation(curation, self.components())

    def test_rejects_an_empty_label(self) -> None:
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm run catalog:test`
Expected: FAIL: `test_curated_annotations_follow_the_label` (the list of keys has no `annotation`) and `test_rejects_a_malformed_annotation` (`ValueError not raised`).

- [ ] **Step 3: Carry and validate annotations in the generator**

In `tools/generate_catalog.py`, find:

```python
# Landing points and refined centres must agree this closely to be matched.
MATCH_TOLERANCE = 1e-9
```

and replace it with:

```python
# Landing points and refined centres must agree this closely to be matched.
MATCH_TOLERANCE = 1e-9
# The longest curated annotation, in characters (ADR 0012; src/catalog/schema.ts).
ANNOTATION_MAX_LENGTH = 280
```

Find:

```python
        else f"Period {period}, rays {lower}/{modulus} and {upper}/{modulus}"
    )
```

and replace it with:

```python
        else f"Period {period}, rays {lower}/{modulus} and {upper}/{modulus}"
    )
    if curated is not None and "annotation" in curated:
        entry["annotation"] = curated["annotation"]
```

Find:

```python
def check_curation(
    curation: dict[str, dict[str, Any]],
```

and replace it with:

```python
def check_annotation(identifier: str, annotation: object) -> None:
    """A curated annotation: one short line of text (ADR 0012)."""
    if not isinstance(annotation, str) or not annotation.strip():
        raise ValueError(f"{identifier} has an empty or non-text annotation")
    if annotation != annotation.strip():
        raise ValueError(f"{identifier} annotation must not start or end with white space")
    if any(ord(character) < 0x20 or ord(character) == 0x7F for character in annotation):
        raise ValueError(f"{identifier} annotation must not contain control characters")
    if len(annotation) > ANNOTATION_MAX_LENGTH:
        raise ValueError(
            f"{identifier} annotation is longer than {ANNOTATION_MAX_LENGTH} characters"
        )


def check_curation(
    curation: dict[str, dict[str, Any]],
```

Find:

```python
            raise ValueError(f"{identifier} needs a non-empty curated label")
```

and replace it with:

```python
            raise ValueError(f"{identifier} needs a non-empty curated label")
        if "annotation" in curated:
            check_annotation(identifier, curated["annotation"])
```

- [ ] **Step 4: Add the five annotations and regenerate the catalog**

Replace the whole of `catalog/curation.v2.json` with:

```json
{
  "schemaVersion": 2,
  "license": "CC0-1.0",
  "description": "Reviewed names, the v1 ids each canonical id keeps as an alias (ADR 0011), and optional annotations of at most 280 characters (ADR 0012). Keys are canonical catalog ids.",
  "entries": {
    "mi-p1-0-1": {
      "label": "Main cardioid",
      "aliases": ["mi-p1-main"],
      "annotation": "Parameters with an attracting fixed point. Where the fixed point's multiplier on the boundary is e^(2πi·p/q), with p/q in lowest terms and q ≥ 2, a bulb of period q is attached."
    },
    "mi-p2-1-2": {
      "label": "Period-2 bulb",
      "aliases": ["mi-p2-basilica"],
      "annotation": "Parameters with an attracting 2-cycle: the disk of radius 1/4 about −1. It meets the main cardioid at c = −3/4, where the rays 1/3 and 2/3 land."
    },
    "mi-p3-1-2": {
      "label": "Douady rabbit",
      "aliases": ["mi-p3-rabbit"],
      "annotation": "The 1/3 bulb of the main cardioid. At its centre the Julia set is the Douady rabbit: three Fatou components meet at the α fixed point and at each of its preimages. Rays 1/7 and 2/7 land at its root."
    },
    "mi-p3-3-4": {
      "label": "Airplane",
      "aliases": ["mi-p3-airplane"],
      "annotation": "The period-3 component on the real axis, the main cardioid of a small copy of the Mandelbrot set; along the real line it is the logistic map's period-3 window. Rays 3/7 and 4/7 land at its cusp, c = −7/4."
    },
    "mi-p3-5-6": {
      "label": "Co-rabbit",
      "aliases": ["mi-p3-corabbit"],
      "annotation": "The 2/3 bulb, the complex conjugate of the rabbit's 1/3 bulb; its Julia sets are mirror images of the rabbit's. Rays 5/7 and 6/7 land at its root."
    },
    "mi-p4-1-2": { "label": "Period-4 component 6", "aliases": ["mi-p4-06"] },
    "mi-p4-3-4": { "label": "Period-4 component 4", "aliases": ["mi-p4-04"] },
    "mi-p4-6-9": { "label": "Period-4 component 2", "aliases": ["mi-p4-02"] },
    "mi-p4-7-8": { "label": "Period-4 component 1", "aliases": ["mi-p4-01"] },
    "mi-p4-11-12": { "label": "Period-4 component 3", "aliases": ["mi-p4-03"] },
    "mi-p4-13-14": { "label": "Period-4 component 5", "aliases": ["mi-p4-05"] }
  }
}
```

Run: `python3 tools/generate_catalog.py --write catalog/components.v2.json && git diff --stat catalog/components.v2.json`
Expected: `catalog/components.v2.json | 5 +++++` (one `"annotation"` line after each of the five curated labels; nothing else changes).

- [ ] **Step 5: Run the Python checks to verify they pass**

Run: `npm run catalog:test && npm run catalog:check`
Expected: `OK`, then `validated 11 exact-period components through period 4`.

- [ ] **Step 6: Write the synthetic catalog**

Create `tests/unit/catalog/synthetic-catalog.ts`:

```ts
import {
  catalogIdFor,
  parseCatalog,
  rayModulus,
  type Catalog,
  type CatalogComponent,
} from '../../../src/catalog/components';

/**
 * A synthetic catalog with the shape of PHASE2-TODO item 7's period ≤12 core:
 * the true number of components per period, unique ray-derived ids and
 * generated labels. The ray pairs and centres are NOT the real ones (the real
 * core is item 7's generator): exact-period angles are paired in ascending
 * order, and each centre sits just outside the main cardioid at its pair's
 * mid-angle, pushed out further for lower periods. Conjugate pairs mirror
 * each other. It exists to test scale: the loader, the catalog order, the
 * viewport index and the marker density policy.
 */

/** Hyperbolic components of exact period p (OEIS A000740), p = 1..12; 4,016 in all. */
export const COMPONENT_COUNTS = [1, 1, 3, 6, 15, 27, 63, 120, 252, 495, 1023, 2010] as const;

const properDivisors = (n: number): number[] =>
  Array.from({ length: n - 1 }, (_, index) => index + 1).filter((d) => n % d === 0);

/** Numerators k of the angles k / (2^p − 1) of exact period p under doubling, ascending. */
export const exactPeriodNumerators = (period: number): number[] => {
  const modulus = rayModulus(period);
  // k / (2^p − 1) has period d | p exactly when (2^p − 1) / (2^d − 1) divides k.
  const steps = properDivisors(period).map((divisor) => modulus / rayModulus(divisor));
  return Array.from({ length: modulus - 1 }, (_, index) => index + 1).filter((numerator) =>
    steps.every((step) => numerator % step !== 0),
  );
};

/** Synthetic ray pairs: consecutive exact-period angles, (k0, k1), (k2, k3), … */
const syntheticPairs = (period: number): [number, number][] => {
  const numerators = exactPeriodNumerators(period);
  return Array.from({ length: numerators.length / 2 }, (_, index) => [
    numerators[2 * index] ?? 0,
    numerators[2 * index + 1] ?? 0,
  ]);
};

/** A point outside the main cardioid at the pair's mid-angle. */
const syntheticCentre = (period: number, lower: number, upper: number) => {
  const turn = (2 * Math.PI * (lower + upper)) / (2 * rayModulus(period));
  const re = Math.cos(turn) / 2 - Math.cos(2 * turn) / 4;
  const im = Math.sin(turn) / 2 - Math.sin(2 * turn) / 4;
  const push = 1 + 0.6 / period;
  return { re: -0.25 + (re + 0.25) * push, im: im * push };
};

const rawEntry = (period: number, lower: number, upper: number): Record<string, unknown> => {
  const modulus = rayModulus(period);
  return {
    id: catalogIdFor(period, lower, upper),
    label: `Period ${period}, rays ${lower}/${modulus} and ${upper}/${modulus}`,
    period,
    center: syntheticCentre(period, lower, upper),
    centerPrecisionDigits: 16,
    internalAddress: [1, period],
    angledInternalAddress: [
      { fromPeriod: 1, toPeriod: period, rotation: { numerator: 1, denominator: period } },
    ],
    characteristicRays: [
      { numerator: lower, denominator: modulus },
      { numerator: upper, denominator: modulus },
    ],
    residual: { orbitAbs: 0, centerError: 0, properDivisorOrbitMinAbs: 1 },
    method: 'synthetic',
    provenance: 'synthetic',
  };
};

/** The raw (unparsed) synthetic catalog through `maxPeriod`. */
export const syntheticCatalogData = (maxPeriod = 12): Record<string, unknown> => ({
  schemaVersion: 2,
  license: 'CC0-1.0',
  maxPeriod,
  methods: { synthetic: 'Synthetic test data with real per-period counts; not centres.' },
  provenance: {
    synthetic: {
      generator: 'tests/unit/catalog/synthetic-catalog.ts',
      arguments: `maxPeriod ${maxPeriod}`,
      curated: 'none',
    },
  },
  components: [
    {
      id: 'mi-p1-0-1',
      label: 'Main cardioid',
      period: 1,
      center: { re: 0, im: 0 },
      centerPrecisionDigits: 16,
      internalAddress: [1],
      residual: { orbitAbs: 0, centerError: 0 },
      method: 'synthetic',
      provenance: 'synthetic',
    },
    ...Array.from({ length: maxPeriod - 1 }, (_, index) => index + 2).flatMap((period) =>
      syntheticPairs(period).map(([lower, upper]) => rawEntry(period, lower, upper)),
    ),
  ],
});

/** The synthetic catalog through `maxPeriod`, validated by the production loader. */
export const syntheticCatalog = (maxPeriod = 12): Catalog =>
  parseCatalog(syntheticCatalogData(maxPeriod));

/** One hand-placed component for geometry tests (not validated). */
export const testComponent = (
  period: number,
  lower: number,
  upper: number,
  center: { re: number; im: number },
  label = `Period ${period}, rays ${lower}/${rayModulus(period)} and ${upper}/${rayModulus(period)}`,
): CatalogComponent => ({
  id: period === 1 ? catalogIdFor(1, 0, 1) : catalogIdFor(period, lower, upper),
  aliases: [],
  label,
  center,
  centerPrecisionDigits: 16,
  period,
  internalAddress: period === 1 ? [1] : [1, period],
  ...(period === 1
    ? {}
    : {
        characteristicRays: [
          { numerator: lower, denominator: rayModulus(period) },
          { numerator: upper, denominator: rayModulus(period) },
        ] as const,
      }),
  residual: { orbitAbs: 0, centerError: 0 },
  method: 'synthetic',
  provenance: 'synthetic',
});
```

- [ ] **Step 7: Write the failing loader tests**

In `tests/unit/catalog/schema.test.ts`, find:

```ts
import {
  CATALOG,
  CatalogSchemaError,
  findCatalogComponent,
  parseCatalog,
} from '../../../src/catalog/components';
```

and replace it with:

```ts
import {
  ANNOTATION_MAX_LENGTH,
  CATALOG,
  CatalogSchemaError,
  findCatalogComponent,
  parseCatalog,
} from '../../../src/catalog/components';
import { COMPONENT_COUNTS, syntheticCatalog } from './synthetic-catalog';
```

Append to the end of the file:

```ts
describe('catalog annotations (ADR 0012)', () => {
  it('loads the curated annotations and leaves the others without one', () => {
    expect(findCatalogComponent('mi-p3-1-2')?.annotation).toMatch(/Douady rabbit/);
    expect(findCatalogComponent('mi-p4-1-2')?.annotation).toBeUndefined();
    expect(CATALOG.components.filter((component) => component.annotation)).toHaveLength(5);
  });

  it('accepts an annotation of exactly the maximum length, counted in characters', () => {
    const raw = edited((_, e) => (at(e, 5)['annotation'] = '→'.repeat(ANNOTATION_MAX_LENGTH)));
    expect(parseCatalog(raw).components[5]?.annotation).toHaveLength(ANNOTATION_MAX_LENGTH);
  });

  it.each([
    ['a non-string annotation', 42, /annotation: must be a non-empty string/],
    ['an empty annotation', ' ', /annotation: must be a non-empty string/],
    ['a padded annotation', ' Padded.', /annotation: must not start or end with white space/],
    ['a two-line annotation', 'Two\nlines.', /annotation: must not contain control characters/],
    [
      'an annotation over the limit',
      'x'.repeat(ANNOTATION_MAX_LENGTH + 1),
      /annotation: must be at most 280 characters/,
    ],
  ])('rejects %s', (_name, annotation, message) => {
    expectRejected(
      edited((_, e) => (at(e, 5)['annotation'] = annotation)),
      message,
    );
  });
});

describe('catalog loader at the scale of the period ≤12 core', () => {
  it('parses a synthetic catalog of 4,016 entries with the true count per period', () => {
    const catalog = syntheticCatalog();
    expect(catalog.components).toHaveLength(4016);
    const counts = COMPONENT_COUNTS.map(
      (_, index) => catalog.components.filter((c) => c.period === index + 1).length,
    );
    expect(counts).toEqual([...COMPONENT_COUNTS]);
  });
});
```

- [ ] **Step 8: Run them to verify they fail**

Run: `npx vitest run tests/unit/catalog/schema.test.ts`
Expected: FAIL. `loads the curated annotations` gets `undefined` (the loader drops the field), the `rejects …` annotation cases do not throw, and the maximum-length case fails. `parses a synthetic catalog of 4,016 entries` already passes: it pins the scale.

- [ ] **Step 9: Validate annotations in the loader**

In `src/catalog/schema.ts`, find:

```ts
export const MAX_CATALOG_PERIOD = 12;
```

and replace it with:

```ts
export const MAX_CATALOG_PERIOD = 12;
/** The longest annotation, in characters (code points): a sentence or two (ADR 0012). */
export const ANNOTATION_MAX_LENGTH = 280;
```

Find:

```ts
  readonly label: string;
  readonly center: Complex;
```

and replace it with:

```ts
  readonly label: string;
  /** A short curated note about the component; optional, additive to schema v2 (ADR 0012). */
  readonly annotation?: string;
  readonly center: Complex;
```

Find:

```ts
const parseCombinatorics = (
```

and replace it with:

```ts
const isControlCharacter = (character: string): boolean => {
  const code = character.codePointAt(0) ?? 0;
  return code < 0x20 || code === 0x7f;
};

const parseAnnotation = (value: unknown, where: string): { annotation?: string } => {
  if (value === undefined) return {};
  const annotation = text(value, where);
  // Code points, as Python's len() counts them in tools/generate_catalog.py.
  const characters = Array.from(annotation);
  if (annotation !== annotation.trim()) fail(where, 'must not start or end with white space');
  if (characters.some(isControlCharacter)) fail(where, 'must not contain control characters');
  if (characters.length > ANNOTATION_MAX_LENGTH) {
    fail(where, `must be at most ${ANNOTATION_MAX_LENGTH} characters`);
  }
  return { annotation };
};

const parseCombinatorics = (
```

Find:

```ts
    label: text(entry['label'], `${where}.label`),
```

and replace it with:

```ts
    label: text(entry['label'], `${where}.label`),
    ...parseAnnotation(entry['annotation'], `${where}.annotation`),
```

Find:

```ts
const requireUniqueNames = (components: readonly CatalogComponent[]): void => {
  const names = components.flatMap((component) => [component.id, ...component.aliases]);
  const repeated = names.find((name, index) => names.indexOf(name) !== index);
  if (repeated !== undefined) fail('components', `id or alias ${repeated} is not unique`);
};
```

and replace it with:

```ts
/** One pass with a set: the period ≤12 core has 4,016 entries (PHASE2-TODO item 7). */
const requireUniqueNames = (components: readonly CatalogComponent[]): void => {
  const seen = new Set<string>();
  for (const name of components.flatMap((component) => [component.id, ...component.aliases])) {
    if (seen.has(name)) fail('components', `id or alias ${name} is not unique`);
    seen.add(name);
  }
};
```

(Do not spread a string, `[...annotation]`: the lint rule `@typescript-eslint/no-misused-spread` rejects it. `Array.from` counts the same code points.)

In `src/catalog/components.ts`, find:

```ts
export {
  catalogIdFor,
```

and replace it with:

```ts
export {
  ANNOTATION_MAX_LENGTH,
  catalogIdFor,
```

- [ ] **Step 10: Run the loader tests to verify they pass**

Run: `npx prettier --write src/catalog tests/unit/catalog && npx vitest run tests/unit/catalog`
Expected: PASS (all catalog unit tests, including the unchanged `catalog.test.ts`).

- [ ] **Step 11: Document the field**

In `catalog/README.md`, find:

```markdown
- `curation.v2.json` holds what a person reviewed: the names (labels) and the
  v1 ids each entry keeps as aliases, keyed by canonical id. Edit it, then
  regenerate.
```

and replace it with:

```markdown
- `curation.v2.json` holds what a person reviewed: the names (labels), the v1
  ids each entry keeps as aliases, and optional annotations, keyed by
  canonical id. Edit it, then regenerate.
```

Find:

```markdown
- `method` and `provenance`: keys into the file's `methods` and `provenance`
```

and replace it with:

```markdown
- `annotation` (optional, curated): one line of at most 280 characters, shown
  in the inspector under the entry's name (ADR 0012).
- `method` and `provenance`: keys into the file's `methods` and `provenance`
```

(`catalog/` is excluded from Prettier by `.prettierignore`; keep the two-space continuation indent by hand.)

- [ ] **Step 12: Verify and commit**

Run: `npm run check`
Expected: exits 0.

```bash
git add tools/generate_catalog.py tools/test_generate_catalog.py catalog/curation.v2.json catalog/components.v2.json catalog/README.md src/catalog/schema.ts src/catalog/components.ts tests/unit/catalog/synthetic-catalog.ts tests/unit/catalog/schema.test.ts
git commit -m "$(cat <<'EOF'
Catalog: optional annotations in schema v2, loader tested at 4,016 entries

Curated entries may carry one line of at most 280 characters, carried by the
generator from curation.v2.json and validated by it and by the loader;
schemaVersion stays 2. The five named components get one. A synthetic
catalog with the period <=12 core's per-period counts tests the loader at
item 7's scale; uniqueness is now checked in one pass.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Catalog order, size estimate, zoom span and period groups

**Files:**
- Create: `src/catalog/navigation.ts`
- Create: `tests/unit/catalog/navigation.test.ts`

**Interfaces:**
- Consumes: `CatalogComponent` (`src/catalog/schema.ts`); `MIN_VIEWPORT_SPAN_Y`, `MAX_VIEWPORT_SPAN_Y` (`src/domain/viewport.ts`); from Task 1, `syntheticCatalog`, `testComponent`, `COMPONENT_COUNTS`.
- Produces (`src/catalog/navigation.ts`):
  - `lowerRayNumerator(component: CatalogComponent): number`
  - `compareCatalogOrder(left: CatalogComponent, right: CatalogComponent): number`
  - `componentSizeEstimate(component: CatalogComponent): number` (finite, ≥ 0)
  - `ZOOM_SPAN_PER_SIZE = 2.5`; `zoomSpanFor(component: CatalogComponent): number`
  - `GROUP_OPEN_LIMIT = 8`; `interface CatalogGroup { period: number; components: readonly CatalogComponent[]; openByDefault: boolean }`; `catalogGroups(components: readonly CatalogComponent[]): CatalogGroup[]`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/catalog/navigation.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { COMPONENT_CATALOG, findCatalogComponent } from '../../../src/catalog/components';
import {
  catalogGroups,
  compareCatalogOrder,
  componentSizeEstimate,
  GROUP_OPEN_LIMIT,
  zoomSpanFor,
} from '../../../src/catalog/navigation';
import { MAX_VIEWPORT_SPAN_Y, MIN_VIEWPORT_SPAN_Y } from '../../../src/domain/viewport';
import { COMPONENT_COUNTS, syntheticCatalog, testComponent } from './synthetic-catalog';

const SYNTHETIC = syntheticCatalog().components;

const component = (id: string) => {
  const found = findCatalogComponent(id);
  if (found === undefined) throw new Error(`no catalog entry ${id}`);
  return found;
};

/** A deterministic shuffle (mulberry32), so a failure reproduces. */
const shuffled = <T>(values: readonly T[], seed: number): T[] => {
  let state = seed;
  const random = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [copy[index], copy[other]] = [copy[other]!, copy[index]!];
  }
  return copy;
};

describe('catalog order (ADR 0012)', () => {
  it('orders the curated catalog by period, then by the lower ray', () => {
    expect([...COMPONENT_CATALOG].sort(compareCatalogOrder).map((c) => c.id)).toEqual([
      'mi-p1-0-1',
      'mi-p2-1-2',
      'mi-p3-1-2',
      'mi-p3-3-4',
      'mi-p3-5-6',
      'mi-p4-1-2',
      'mi-p4-3-4',
      'mi-p4-6-9',
      'mi-p4-7-8',
      'mi-p4-11-12',
      'mi-p4-13-14',
    ]);
  });

  it('is a total order on 4,016 entries, whatever order they arrive in', () => {
    const sorted = [...SYNTHETIC].sort(compareCatalogOrder);
    for (let index = 1; index < sorted.length; index += 1) {
      expect(compareCatalogOrder(sorted[index - 1]!, sorted[index]!)).toBeLessThan(0);
    }
    expect(shuffled(SYNTHETIC, 7).sort(compareCatalogOrder)).toEqual(sorted);
  });
});

describe('component size estimate and zoom span', () => {
  it('matches the known sizes of the low-period components', () => {
    expect(componentSizeEstimate(component('mi-p1-0-1'))).toBe(1);
    expect(componentSizeEstimate(component('mi-p2-1-2'))).toBe(0.5);
    expect(componentSizeEstimate(component('mi-p3-3-4'))).toBeCloseTo(0.0190355, 6);
    expect(componentSizeEstimate(component('mi-p3-1-2'))).toBeCloseTo(0.1889138, 6);
    expect(componentSizeEstimate(component('mi-p4-6-9'))).toBeCloseTo(0.1179602, 6);
    expect(componentSizeEstimate(component('mi-p4-7-8'))).toBeCloseTo(0.00099163, 7);
  });

  it('gives a component and its conjugate the same size', () => {
    expect(componentSizeEstimate(component('mi-p3-5-6'))).toBe(
      componentSizeEstimate(component('mi-p3-1-2')),
    );
    expect(componentSizeEstimate(component('mi-p4-13-14'))).toBe(
      componentSizeEstimate(component('mi-p4-1-2')),
    );
  });

  it('frames a component at 2.5 times its size', () => {
    expect(zoomSpanFor(component('mi-p1-0-1'))).toBe(2.5);
    expect(zoomSpanFor(component('mi-p2-1-2'))).toBe(1.25);
    expect(zoomSpanFor(component('mi-p3-3-4'))).toBeCloseTo(0.0475888, 6);
  });

  it('never zooms past the 6,000,000× ceiling or out past the widest view', () => {
    // Near the tip at −2, a period-12 component is far below the ceiling.
    const tiny = testComponent(12, 1, 2, { re: -1.99999, im: 0 });
    expect(componentSizeEstimate(tiny)).toBeLessThan(MIN_VIEWPORT_SPAN_Y);
    expect(zoomSpanFor(tiny)).toBe(MIN_VIEWPORT_SPAN_Y);
    // An escaping orbit overflows: the size is 0, not NaN, so the span is the ceiling.
    const escaping = testComponent(12, 1, 2, { re: 2, im: 2 });
    expect(componentSizeEstimate(escaping)).toBe(0);
    expect(zoomSpanFor(escaping)).toBe(MIN_VIEWPORT_SPAN_Y);
    for (const entry of [...COMPONENT_CATALOG, ...SYNTHETIC]) {
      const span = zoomSpanFor(entry);
      expect(span, entry.id).toBeGreaterThanOrEqual(MIN_VIEWPORT_SPAN_Y);
      expect(span, entry.id).toBeLessThanOrEqual(MAX_VIEWPORT_SPAN_Y);
    }
  });
});

describe('catalog groups', () => {
  it('groups the curated catalog by period, all expanded', () => {
    const groups = catalogGroups(COMPONENT_CATALOG);
    expect(groups.map((group) => [group.period, group.components.length])).toEqual([
      [1, 1],
      [2, 1],
      [3, 3],
      [4, 6],
    ]);
    expect(groups.every((group) => group.openByDefault)).toBe(true);
    expect(groups[2]?.components.map((c) => c.label)).toEqual([
      'Douady rabbit',
      'Airplane',
      'Co-rabbit',
    ]);
  });

  it('puts each of 4,016 entries in exactly one group, collapsing the large ones', () => {
    const groups = catalogGroups(shuffled(SYNTHETIC, 11));
    expect(groups.map((group) => group.period)).toEqual(COMPONENT_COUNTS.map((_, i) => i + 1));
    expect(groups.map((group) => group.components.length)).toEqual([...COMPONENT_COUNTS]);
    expect(groups.map((group) => group.openByDefault)).toEqual(
      COMPONENT_COUNTS.map((count) => count <= GROUP_OPEN_LIMIT),
    );
    const ids = groups.flatMap((group) => group.components.map((c) => c.id));
    expect(ids).toEqual([...SYNTHETIC].sort(compareCatalogOrder).map((c) => c.id));
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/catalog/navigation.test.ts`
Expected: FAIL: `Failed to resolve import "../../../src/catalog/navigation"`.

- [ ] **Step 3: Write the module**

Create `src/catalog/navigation.ts`:

```ts
import { MAX_VIEWPORT_SPAN_Y, MIN_VIEWPORT_SPAN_Y } from '../domain/viewport';
import type { CatalogComponent } from './schema';

/**
 * Catalog order, grouping and zoom framing (PHASE2-TODO item 6, ADR 0012).
 * Pure functions of the entries, so they hold for the 4,016-entry core of
 * item 7 as well as for today's eleven.
 */

/** The lower characteristic ray's numerator over 2^p − 1; the main cardioid's root angle is 0. */
export const lowerRayNumerator = (component: CatalogComponent): number =>
  component.characteristicRays?.[0].numerator ?? 0;

/**
 * Catalog order: by period, then by the lower characteristic angle
 * a / (2^p − 1), which is the order of the roots around the set. Exact
 * integers, read from the id alone, and total: within a period no two
 * components share a lower angle.
 */
export const compareCatalogOrder = (left: CatalogComponent, right: CatalogComponent): number =>
  left.period - right.period || lowerRayNumerator(left) - lowerRayNumerator(right);

/**
 * Size estimate of a hyperbolic component from its period p and centre c
 * (Heiland-Allen, "Mandelbrot set component size estimates"): with
 * z_q = f_c^q(0), l_q = 2^q z_1 ⋯ z_q and b = 1 + Σ 1/l_q over q < p, the size
 * is 1 / |b l_{p−1}²|. It is about a bulb's diameter (0.5 for the period-2
 * disk) and 1 for the main cardioid. Evaluated at (Re c, |Im c|), so a
 * component and its conjugate get identical sizes; 0 if the orbit overflows.
 */
export const componentSizeEstimate = (component: CatalogComponent): number => {
  const cRe = component.center.re;
  const cIm = Math.abs(component.center.im);
  let zRe = 0;
  let zIm = 0;
  let lRe = 1;
  let lIm = 0;
  let bRe = 1;
  let bIm = 0;
  for (let step = 1; step < component.period; step += 1) {
    const nextZRe = zRe * zRe - zIm * zIm + cRe;
    zIm = 2 * zRe * zIm + cIm;
    zRe = nextZRe;
    const nextLRe = 2 * (zRe * lRe - zIm * lIm);
    lIm = 2 * (zRe * lIm + zIm * lRe);
    lRe = nextLRe;
    const norm = lRe * lRe + lIm * lIm;
    bRe += lRe / norm;
    bIm -= lIm / norm;
  }
  const squareRe = lRe * lRe - lIm * lIm;
  const squareIm = 2 * lRe * lIm;
  const size = 1 / Math.hypot(bRe * squareRe - bIm * squareIm, bRe * squareIm + bIm * squareRe);
  return Number.isFinite(size) ? size : 0;
};

/** A component fills about 40% of the view height when activated from the list. */
export const ZOOM_SPAN_PER_SIZE = 2.5;

/**
 * The view height (spanY) that frames a component: 2.5 times its size
 * estimate, within the zoom range, so never past the 6,000,000× ceiling
 * (ADR 0002). The main cardioid gets 2.5, the default view's height.
 */
export const zoomSpanFor = (component: CatalogComponent): number =>
  Math.min(
    MAX_VIEWPORT_SPAN_Y,
    Math.max(MIN_VIEWPORT_SPAN_Y, ZOOM_SPAN_PER_SIZE * componentSizeEstimate(component)),
  );

/** Groups with at most this many entries start expanded in the catalog panel. */
export const GROUP_OPEN_LIMIT = 8;

export interface CatalogGroup {
  readonly period: number;
  /** In catalog order. */
  readonly components: readonly CatalogComponent[];
  readonly openByDefault: boolean;
}

/** One group per period, in ascending period order, each in catalog order. */
export const catalogGroups = (components: readonly CatalogComponent[]): CatalogGroup[] => {
  const byPeriod = new Map<number, CatalogComponent[]>();
  for (const component of [...components].sort(compareCatalogOrder)) {
    const members = byPeriod.get(component.period);
    if (members === undefined) byPeriod.set(component.period, [component]);
    else members.push(component);
  }
  return [...byPeriod].map(([period, members]) => ({
    period,
    components: members,
    openByDefault: members.length <= GROUP_OPEN_LIMIT,
  }));
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx prettier --write src/catalog/navigation.ts tests/unit/catalog/navigation.test.ts && npx vitest run tests/unit/catalog/navigation.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Verify and commit**

Run: `npm run check`
Expected: exits 0.

```bash
git add src/catalog/navigation.ts tests/unit/catalog/navigation.test.ts
git commit -m "$(cat <<'EOF'
Catalog: catalog order, size estimate, zoom span and period groups

Entries order by period, then by the lower characteristic angle, which the id
alone carries. A component is framed at 2.5 times Heiland-Allen's size
estimate, clamped to the zoom range. Groups of at most 8 entries start open.
Tested on the synthetic 4,016-entry catalog.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Viewport-indexed catalog lookup

**Files:**
- Create: `src/catalog/viewport-index.ts`
- Create: `tests/unit/catalog/viewport-index.test.ts`

**Interfaces:**
- Consumes: from Task 2, `compareCatalogOrder`, `componentSizeEstimate`; `Viewport` (`src/domain/types.ts`); `DEFAULT_VIEWPORT`, `MIN_VIEWPORT_SPAN_Y`, `MAX_VIEWPORT_SPAN_Y`; from Task 1, `syntheticCatalog`.
- Produces (`src/catalog/viewport-index.ts`):
  - `interface ComplexBounds { reMin; reMax; imMin; imMax }` (numbers)
  - `interface IndexedComponent { component: CatalogComponent; rank: number; size: number }`
  - `interface CatalogQuery { entries: readonly IndexedComponent[]; visited: number }`
  - `interface CatalogIndex { entries: readonly IndexedComponent[]; find(id: string): IndexedComponent | undefined; lowestPeriodsInView(bounds: ComplexBounds, atLeast: number): CatalogQuery }`
  - `createCatalogIndex(components: readonly CatalogComponent[]): CatalogIndex`
  - `viewportBounds(viewport: Viewport, width: number, height: number, marginPx = 1): ComplexBounds`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/catalog/viewport-index.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { COMPONENT_CATALOG } from '../../../src/catalog/components';
import { compareCatalogOrder } from '../../../src/catalog/navigation';
import {
  createCatalogIndex,
  viewportBounds,
  type ComplexBounds,
  type IndexedComponent,
} from '../../../src/catalog/viewport-index';
import {
  DEFAULT_VIEWPORT,
  MAX_VIEWPORT_SPAN_Y,
  MIN_VIEWPORT_SPAN_Y,
} from '../../../src/domain/viewport';
import { syntheticCatalog } from './synthetic-catalog';

const SYNTHETIC = syntheticCatalog().components;
const INDEX = createCatalogIndex(SYNTHETIC);
const WIDTH = 960;
const HEIGHT = 600;

const inside = (entry: IndexedComponent, bounds: ComplexBounds): boolean =>
  entry.component.center.re >= bounds.reMin &&
  entry.component.center.re <= bounds.reMax &&
  entry.component.center.im >= bounds.imMin &&
  entry.component.center.im <= bounds.imMax;

/** The full scan the index replaces: the query's answer and the slab entries it may examine. */
const bruteForce = (bounds: ComplexBounds, atLeast: number) => {
  let collected = 0;
  let lastPeriod = 12;
  for (let period = 1; period <= 12; period += 1) {
    collected += INDEX.entries.filter(
      (entry) => entry.component.period === period && inside(entry, bounds),
    ).length;
    if (collected >= atLeast) {
      lastPeriod = period;
      break;
    }
  }
  const walked = INDEX.entries.filter((entry) => entry.component.period <= lastPeriod);
  return {
    ids: walked.filter((entry) => inside(entry, bounds)).map((entry) => entry.component.id),
    slab: walked.filter(
      (entry) =>
        entry.component.center.re >= bounds.reMin && entry.component.center.re <= bounds.reMax,
    ).length,
  };
};

/** Deterministic pseudo-random numbers (mulberry32), so a failure reproduces. */
const random = (seed: number) => {
  let state = seed;
  return (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

describe('catalog viewport index', () => {
  it('ranks entries in catalog order and finds them by id', () => {
    const index = createCatalogIndex(COMPONENT_CATALOG);
    expect(index.entries.map((entry) => entry.rank)).toEqual(COMPONENT_CATALOG.map((_, i) => i));
    expect(index.entries.map((entry) => entry.component.id)).toEqual(
      [...COMPONENT_CATALOG].sort(compareCatalogOrder).map((component) => component.id),
    );
    expect(index.find('mi-p3-1-2')?.component.label).toBe('Douady rabbit');
    expect(index.find('mi-p3-rabbit')).toBeUndefined();
  });

  it('examines only periods 1 to 6 at the default view of 4,016 entries', () => {
    const bounds = viewportBounds(DEFAULT_VIEWPORT, WIDTH, HEIGHT);
    const query = INDEX.lowestPeriodsInView(bounds, 40);
    // 1 + 1 + 3 + 6 + 15 + 27 entries: the first periods that reach 40.
    expect(query.visited).toBe(53);
    expect(query.entries).toHaveLength(53);
    expect(Math.max(...query.entries.map((entry) => entry.component.period))).toBe(6);
  });

  it('examines a few entries per period at the zoom ceiling', () => {
    const target = INDEX.entries.find(
      (entry) => entry.component.period === 12 && entry.component.center.im > 0.1,
    );
    if (target === undefined) throw new Error('no period-12 entry above the axis');
    const viewport = { center: target.component.center, spanY: MIN_VIEWPORT_SPAN_Y };
    const query = INDEX.lowestPeriodsInView(viewportBounds(viewport, WIDTH, HEIGHT), 40);
    expect(query.entries.map((entry) => entry.component.id)).toContain(target.component.id);
    expect(query.visited).toBeLessThanOrEqual(24);
  });

  it('agrees with a full scan and examines only the Re slab, at any centre and zoom', () => {
    const next = random(20261017);
    for (let trial = 0; trial < 300; trial += 1) {
      const spanY = Math.exp(
        Math.log(MIN_VIEWPORT_SPAN_Y) +
          next() * (Math.log(MAX_VIEWPORT_SPAN_Y) - Math.log(MIN_VIEWPORT_SPAN_Y)),
      );
      // Half the trials centre on an entry, so deep views still contain some.
      const anchor = INDEX.entries[Math.floor(next() * INDEX.entries.length)]!.component.center;
      const center = trial % 2 === 0 ? anchor : { re: -2 + 2.5 * next(), im: -1.25 + 2.5 * next() };
      const bounds = viewportBounds({ center, spanY }, WIDTH, HEIGHT);
      for (const atLeast of [40, Number.POSITIVE_INFINITY]) {
        const query = INDEX.lowestPeriodsInView(bounds, atLeast);
        const expected = bruteForce(bounds, atLeast);
        expect(query.entries.map((entry) => entry.component.id)).toEqual(expected.ids);
        expect(query.visited).toBe(expected.slab);
      }
    }
  });

  it('covers every pixel a marker can be drawn on', () => {
    const bounds = viewportBounds(DEFAULT_VIEWPORT, WIDTH, HEIGHT);
    const unitsPerPixel = DEFAULT_VIEWPORT.spanY / HEIGHT;
    expect(bounds.reMin).toBeCloseTo(-0.75 - (WIDTH / 2 + 1) * unitsPerPixel, 12);
    expect(bounds.imMax).toBeCloseTo((HEIGHT / 2 + 1) * unitsPerPixel, 12);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/catalog/viewport-index.test.ts`
Expected: FAIL: `Failed to resolve import "../../../src/catalog/viewport-index"`.

- [ ] **Step 3: Write the module**

Create `src/catalog/viewport-index.ts`:

```ts
import type { Viewport } from '../domain/types';
import { compareCatalogOrder, componentSizeEstimate } from './navigation';
import type { CatalogComponent } from './schema';

/**
 * Viewport-indexed catalog lookup (PHASE2-TODO item 6, ADR 0012). Built once
 * at load: one bucket per period, each sorted by Re c. A query walks the
 * periods from the lowest, binary-searches each bucket for the view's Re
 * range and examines only that slab, and stops after the first period that
 * brings the collected entries up to the number asked for. At the default
 * view it examines periods 1 to 6 (53 entries of 4,016), and deep in a zoom
 * it examines a slab a few pixels wide in each period.
 */

export interface ComplexBounds {
  readonly reMin: number;
  readonly reMax: number;
  readonly imMin: number;
  readonly imMax: number;
}

export interface IndexedComponent {
  readonly component: CatalogComponent;
  /** Position in catalog order (period, then lower ray): the focus order. */
  readonly rank: number;
  /** componentSizeEstimate, computed once at load. */
  readonly size: number;
}

export interface CatalogQuery {
  /** The in-view entries found, in catalog order. */
  readonly entries: readonly IndexedComponent[];
  /** How many entries the query examined: the cost measure the tests bound. */
  readonly visited: number;
}

export interface CatalogIndex {
  /** Every entry, in catalog order. */
  readonly entries: readonly IndexedComponent[];
  find(id: string): IndexedComponent | undefined;
  /**
   * The entries inside `bounds` of the lowest periods: whole periods in
   * ascending order, until at least `atLeast` entries are collected or the
   * periods run out.
   */
  lowestPeriodsInView(bounds: ComplexBounds, atLeast: number): CatalogQuery;
}

interface PeriodBucket {
  /** This period's entries sorted by Re c, then rank. */
  readonly byRe: readonly IndexedComponent[];
  readonly re: Float64Array;
}

/** The first index whose value is at least `target`, in ascending `values`. */
const lowerBound = (values: Float64Array, target: number): number => {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if ((values[middle] ?? Number.POSITIVE_INFINITY) < target) low = middle + 1;
    else high = middle;
  }
  return low;
};

const bucketsByPeriod = (entries: readonly IndexedComponent[]): PeriodBucket[] => {
  const byPeriod = new Map<number, IndexedComponent[]>();
  for (const entry of entries) {
    const members = byPeriod.get(entry.component.period);
    if (members === undefined) byPeriod.set(entry.component.period, [entry]);
    else members.push(entry);
  }
  return [...byPeriod.values()].map((members) => {
    const byRe = [...members].sort(
      (left, right) =>
        left.component.center.re - right.component.center.re || left.rank - right.rank,
    );
    return { byRe, re: Float64Array.from(byRe, (entry) => entry.component.center.re) };
  });
};

/** Scans one bucket's Re slab, adding the entries inside `bounds`; returns the count examined. */
const scanSlab = (
  bucket: PeriodBucket,
  bounds: ComplexBounds,
  found: IndexedComponent[],
): number => {
  let visited = 0;
  for (let index = lowerBound(bucket.re, bounds.reMin); index < bucket.byRe.length; index += 1) {
    const entry = bucket.byRe[index];
    if (entry === undefined || entry.component.center.re > bounds.reMax) break;
    visited += 1;
    const im = entry.component.center.im;
    if (im >= bounds.imMin && im <= bounds.imMax) found.push(entry);
  }
  return visited;
};

export const createCatalogIndex = (components: readonly CatalogComponent[]): CatalogIndex => {
  const entries = [...components]
    .sort(compareCatalogOrder)
    .map((component, rank) => ({ component, rank, size: componentSizeEstimate(component) }));
  const byId = new Map(entries.map((entry) => [entry.component.id, entry] as const));
  // Map iteration follows insertion, and entries arrive in ascending period.
  const buckets = bucketsByPeriod(entries);
  return {
    entries,
    find: (id) => byId.get(id),
    lowestPeriodsInView: (bounds, atLeast) => {
      const found: IndexedComponent[] = [];
      let visited = 0;
      for (const bucket of buckets) {
        if (found.length >= atLeast) break;
        visited += scanSlab(bucket, bounds, found);
      }
      found.sort((left, right) => left.rank - right.rank);
      return { entries: found, visited };
    },
  };
};

/**
 * The part of the plane a viewport shows on a width × height canvas, widened
 * by `marginPx` pixels on each side so that nothing a projection places on
 * the canvas edge is missed.
 */
export const viewportBounds = (
  viewport: Viewport,
  width: number,
  height: number,
  marginPx = 1,
): ComplexBounds => {
  const unitsPerPixel = viewport.spanY / height;
  const halfRe = (width / 2 + marginPx) * unitsPerPixel;
  const halfIm = (height / 2 + marginPx) * unitsPerPixel;
  return {
    reMin: viewport.center.re - halfRe,
    reMax: viewport.center.re + halfRe,
    imMin: viewport.center.im - halfIm,
    imMax: viewport.center.im + halfIm,
  };
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx prettier --write src/catalog/viewport-index.ts tests/unit/catalog/viewport-index.test.ts && npx vitest run tests/unit/catalog/viewport-index.test.ts`
Expected: PASS (5 tests). The default-view test reports `visited` 53; the 300-view property test compares every query with a full scan.

- [ ] **Step 5: Verify and commit**

Run: `npm run check`
Expected: exits 0.

```bash
git add src/catalog/viewport-index.ts tests/unit/catalog/viewport-index.test.ts
git commit -m "$(cat <<'EOF'
Catalog: viewport index, lowest periods first, with no full scan

One Re-sorted bucket per period, built once. A query binary-searches each
bucket's Re slab and stops after the first period that brings the
candidates to the number asked for: 53 of 4,016 synthetic entries at the
default view. Tests count examined entries and compare 300 views with a full
scan.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Marker density policy (Q4)

**Files:**
- Create: `src/ui/marker-density.ts`
- Create: `tests/unit/ui/marker-density.test.ts`

**Interfaces:**
- Consumes: from Task 3, `CatalogIndex`, `IndexedComponent`, `viewportBounds`, `createCatalogIndex`; from Task 2, `compareCatalogOrder`; `complexToPixel` (`src/domain/viewport.ts`); from Task 1, `syntheticCatalog`, `testComponent`.
- Produces (`src/ui/marker-density.ts`):
  - `MARKER_CAP = 40`, `MARKER_HIT_REM = 2.75`, `COMPACT_HIT_REM = 1.5`, `LABEL_OFFSET_REM = 1.475`, `LEFT_FACING_FROM = 0.76`
  - `interface MarkerPlanInput { index: CatalogIndex; viewport: Viewport; width: number; height: number; remPx: number; selectedId?: string | undefined; cap?: number }` (width and height are whole CSS pixels)
  - `interface PlannedMarker { component: CatalogComponent; x: number; y: number; compact: boolean; labelVisible: boolean; leftFacing: boolean }` (x and y are fractions of the canvas)
  - `interface MarkerPlan { markers: readonly PlannedMarker[]; visited: number }`
  - `planMarkers(input: MarkerPlanInput): MarkerPlan`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/ui/marker-density.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { COMPONENT_CATALOG } from '../../../src/catalog/components';
import { compareCatalogOrder } from '../../../src/catalog/navigation';
import { createCatalogIndex, viewportBounds } from '../../../src/catalog/viewport-index';
import type { Viewport } from '../../../src/domain/types';
import {
  complexToPixel,
  DEFAULT_VIEWPORT,
  MAX_VIEWPORT_SPAN_Y,
  MIN_VIEWPORT_SPAN_Y,
} from '../../../src/domain/viewport';
import {
  COMPACT_HIT_REM,
  MARKER_CAP,
  MARKER_HIT_REM,
  planMarkers,
  type MarkerPlan,
} from '../../../src/ui/marker-density';
import { syntheticCatalog, testComponent } from '../catalog/synthetic-catalog';

const REM = 16;
const SYNTHETIC = syntheticCatalog().components;
const INDEX = createCatalogIndex(SYNTHETIC);
const CURATED = createCatalogIndex(COMPONENT_CATALOG);
/** The canvas at 1280 × 720 (Playwright's desktop) and at 320 px wide. */
const DESKTOP = { width: 922, height: 576 };
const PHONE = { width: 300, height: 225 };
const WIDE = { width: 960, height: 600 };

const plan = (
  viewport: Viewport,
  options: { selectedId?: string; cap?: number; size?: { width: number; height: number } } = {},
  index = INDEX,
): MarkerPlan =>
  planMarkers({
    index,
    viewport,
    ...(options.size ?? WIDE),
    remPx: REM,
    selectedId: options.selectedId,
    ...(options.cap === undefined ? {} : { cap: options.cap }),
  });

const ids = (result: MarkerPlan): string[] => result.markers.map((m) => m.component.id);

/** Deterministic pseudo-random numbers (mulberry32), so a failure reproduces. */
const random = (seed: number) => {
  let state = seed;
  return (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Views at every zoom from the widest to the ceiling, half of them centred on an entry. */
const views = (count: number, seed: number): Viewport[] => {
  const next = random(seed);
  return Array.from({ length: count }, (_, trial) => {
    const spanY = Math.exp(
      Math.log(MIN_VIEWPORT_SPAN_Y) +
        next() * (Math.log(MAX_VIEWPORT_SPAN_Y) - Math.log(MIN_VIEWPORT_SPAN_Y)),
    );
    const anchor = INDEX.entries[Math.floor(next() * INDEX.entries.length)]!.component.center;
    const center = trial % 2 === 0 ? anchor : { re: -2 + 2.5 * next(), im: -1.25 + 2.5 * next() };
    return { center, spanY };
  });
};

const hitSide = (compact: boolean): number => (compact ? COMPACT_HIT_REM : MARKER_HIT_REM) * REM;

describe('catalog marker density policy (Q4)', () => {
  it('shows every curated marker at the default desktop view, in catalog order', () => {
    const result = plan(DEFAULT_VIEWPORT, { size: DESKTOP }, CURATED);
    expect(ids(result)).toEqual(
      [...COMPONENT_CATALOG].sort(compareCatalogOrder).map((component) => component.id),
    );
    // The airplane and the period-4 component at the tip are 43 px apart: both shrink to their dots.
    expect(result.markers.filter((m) => m.compact).map((m) => m.component.id)).toEqual([
      'mi-p3-3-4',
      'mi-p4-7-8',
    ]);
  });

  it('drops only the marker whose dot would cover the airplane at 320 px', () => {
    const result = plan(DEFAULT_VIEWPORT, { size: PHONE }, CURATED);
    expect(result.markers).toHaveLength(10);
    expect(ids(result)).not.toContain('mi-p4-7-8');
  });

  it('never shows more than 40 markers, at any centre and zoom', () => {
    for (const viewport of [DEFAULT_VIEWPORT, ...views(200, 1)]) {
      expect(plan(viewport).markers.length).toBeLessThanOrEqual(MARKER_CAP);
    }
    expect(plan(DEFAULT_VIEWPORT, { cap: 5 }).markers.length).toBeLessThanOrEqual(5);
  });

  it('examines only periods 1 to 6 of 4,016 entries at the default view', () => {
    const result = plan(DEFAULT_VIEWPORT);
    expect(result.visited).toBe(53);
    expect(Math.max(...result.markers.map((m) => m.component.period))).toBeLessThanOrEqual(6);
  });

  it('fills the cap from the lowest periods, skipping only covered dots', () => {
    const dot = COMPACT_HIT_REM * REM;
    for (const viewport of views(200, 2)) {
      const result = plan(viewport);
      const shown = new Set(ids(result));
      const query = INDEX.lowestPeriodsInView(
        viewportBounds(viewport, WIDE.width, WIDE.height),
        MARKER_CAP,
      );
      const cut = Math.max(0, ...query.entries.map((entry) => entry.component.period));
      expect(result.markers.every((m) => m.component.period <= cut)).toBe(true);
      if (result.markers.length === MARKER_CAP) continue;
      for (const entry of query.entries) {
        if (shown.has(entry.component.id)) continue;
        const point = complexToPixel(viewport, WIDE, entry.component.center);
        if (point.x < 0 || point.x > WIDE.width || point.y < 0 || point.y > WIDE.height) continue;
        // An in-view candidate is missing only because its dot would cover a shown dot.
        const covered = result.markers.some(
          (m) =>
            Math.abs(m.x * WIDE.width - point.x) < dot &&
            Math.abs(m.y * WIDE.height - point.y) < dot,
        );
        expect(covered, entry.component.id).toBe(true);
      }
    }
  });

  it('keeps hit boxes apart, so every marker keeps a 24 px target', () => {
    for (const viewport of views(200, 3)) {
      const markers = plan(viewport).markers;
      for (const [index, a] of markers.entries()) {
        for (const b of markers.slice(index + 1)) {
          const reach = (hitSide(a.compact) + hitSide(b.compact)) / 2;
          const apart =
            Math.abs(a.x - b.x) * WIDE.width >= reach || Math.abs(a.y - b.y) * WIDE.height >= reach;
          expect(apart, `${a.component.id} and ${b.component.id}`).toBe(true);
        }
      }
    }
  });

  it('always shows the selected entry when it is in view, with its label', () => {
    const selected = INDEX.entries.find(
      (entry) => entry.component.period === 12 && entry.component.center.im > 0.2,
    );
    if (selected === undefined) throw new Error('no period-12 entry above the axis');
    const result = plan(DEFAULT_VIEWPORT, { selectedId: selected.component.id });
    const marker = result.markers.find((m) => m.component.id === selected.component.id);
    expect(marker?.labelVisible).toBe(true);
    expect(result.markers.length).toBeLessThanOrEqual(MARKER_CAP);
    const away = { center: { re: 5, im: 5 }, spanY: 0.01 };
    expect(ids(plan(away, { selectedId: selected.component.id }))).toEqual([]);
  });

  it('returns markers in catalog order, so panning never reorders focus', () => {
    const rank = new Map(INDEX.entries.map((entry) => [entry.component.id, entry.rank]));
    let previous: string[] = [];
    for (let step = 0; step < 12; step += 1) {
      const viewport = { center: { re: -1.2 + 0.08 * step, im: 0.3 }, spanY: 0.6 };
      const current = ids(plan(viewport));
      const ranks = current.map((id) => rank.get(id) ?? -1);
      expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
      const common = current.filter((id) => previous.includes(id));
      expect(common).toEqual(previous.filter((id) => current.includes(id)));
      previous = current;
    }
  });

  it('gives the same plan whatever order the index was built from', () => {
    const reversed = createCatalogIndex([...SYNTHETIC].reverse());
    for (const viewport of views(20, 4)) {
      expect(plan(viewport, {}, reversed)).toEqual(plan(viewport));
    }
  });
});

describe('catalog marker collisions', () => {
  const at = (x: number, y: number) => ({ re: x / 240, im: -y / 240 });
  // 960 × 600 at spanY 2.5 is 240 px per unit, centred on 0: offsets below are in CSS px.
  const view = { center: { re: 0, im: 0 }, spanY: 2.5 };
  const alpha = testComponent(2, 1, 2, at(0, 0), 'Alpha component');

  it('hides a label, never its marker, when labels collide', () => {
    const beta = testComponent(3, 1, 2, at(-40, 12), 'Beta component');
    const result = plan(view, {}, createCatalogIndex([alpha, beta]));
    expect(result.markers.map((m) => [m.component.label, m.compact, m.labelVisible])).toEqual([
      ['Alpha component', true, true],
      ['Beta component', true, false],
    ]);
  });

  it('drops a marker whose dot would cover a dot already placed', () => {
    const beta = testComponent(3, 1, 2, at(-10, 0), 'Beta component');
    expect(ids(plan(view, {}, createCatalogIndex([alpha, beta])))).toEqual([alpha.id]);
    // Selected, the lower-priority entry wins the place instead.
    expect(ids(plan(view, { selectedId: beta.id }, createCatalogIndex([alpha, beta])))).toEqual([
      beta.id,
    ]);
  });

  it('scales hit boxes with the root font size', () => {
    const beta = testComponent(3, 1, 2, at(-30, 0), 'Beta component');
    const index = createCatalogIndex([alpha, beta]);
    expect(ids(plan(view, {}, index))).toEqual([alpha.id, beta.id]);
    // At 200% text the dots are 48 px: 30 px apart, they would overlap.
    const large = planMarkers({ index, viewport: view, ...WIDE, remPx: 2 * REM });
    expect(ids(large)).toEqual([alpha.id]);
  });

  it('keeps the full hit box when no neighbour is near', () => {
    const beta = testComponent(3, 1, 2, at(-200, 0), 'Beta component');
    const result = plan(view, {}, createCatalogIndex([alpha, beta]));
    expect(result.markers.map((m) => [m.compact, m.labelVisible])).toEqual([
      [false, true],
      [false, true],
    ]);
  });

  it('puts labels on the left of markers near the right edge', () => {
    const right = testComponent(3, 1, 2, at(360, 0), 'Right component');
    const result = plan(view, {}, createCatalogIndex([alpha, right]));
    expect(result.markers.map((m) => m.leftFacing)).toEqual([false, true]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/ui/marker-density.test.ts`
Expected: FAIL: `Failed to resolve import "../../../src/ui/marker-density"`.

- [ ] **Step 3: Write the module**

Create `src/ui/marker-density.ts`:

```ts
import type { CatalogComponent } from '../catalog/schema';
import {
  viewportBounds,
  type CatalogIndex,
  type IndexedComponent,
} from '../catalog/viewport-index';
import type { Viewport } from '../domain/types';
import { complexToPixel } from '../domain/viewport';

/**
 * Catalog marker density policy (owner decision Q4, ADR 0012): which
 * catalog entries get an interactive marker on the canvas, where, and with
 * which label. A pure function of the view, so it is tested at the scale of
 * the period ≤12 core without a browser.
 *
 * 1. Candidates are the in-view entries of the lowest periods (the viewport
 *    index), plus the selected entry when it is in view.
 * 2. In priority order (selected first, then period, then larger components,
 *    then catalog order), a candidate is placed unless the cap is reached or
 *    its 1.5rem dot would overlap a dot already placed.
 * 3. A placed marker whose 2.75rem hit box overlaps another placed marker's
 *    hit box is compact: its hit box shrinks to its 1.5rem dot, so hit boxes
 *    never overlap and every target keeps at least 24 × 24 CSS px.
 * 4. In the same priority order, a label is shown only where it covers no
 *    earlier label and no other marker; the selected entry always keeps its
 *    label. A collision hides a label, never its marker.
 * 5. The markers come back in catalog order, the DOM and keyboard focus
 *    order, which does not depend on the view.
 */

/** Owner decision Q4: about 40 interactive markers at once, lowest periods first. */
export const MARKER_CAP = 40;
/** Hit box of a marker, in rem (`.catalog-marker` in styles.css). */
export const MARKER_HIT_REM = 2.75;
/** Hit box of a compact marker: its dot (`.catalog-marker--compact`). */
export const COMPACT_HIT_REM = 1.5;
/** A label starts this far from its marker's centre (`.catalog-marker__label`). */
export const LABEL_OFFSET_REM = 1.475;
/** Label box estimate: 0.67rem text, 0.35rem side padding, at most 11rem wide. */
const LABEL_HEIGHT_REM = 1.2;
const LABEL_CHARACTER_REM = 0.42;
const LABEL_PADDING_REM = 0.7;
const LABEL_MAX_REM = 11;
/** Markers right of this fraction of the width put their label on their left. */
export const LEFT_FACING_FROM = 0.76;

export interface MarkerPlanInput {
  readonly index: CatalogIndex;
  readonly viewport: Viewport;
  /** Canvas size in whole CSS pixels. */
  readonly width: number;
  readonly height: number;
  /** CSS pixels per rem (the root font size). */
  readonly remPx: number;
  readonly selectedId?: string | undefined;
  /** Defaults to MARKER_CAP. */
  readonly cap?: number;
}

export interface PlannedMarker {
  readonly component: CatalogComponent;
  /** Centre as fractions of the canvas width and height. */
  readonly x: number;
  readonly y: number;
  /** The hit box shrinks to the dot because a neighbour is close. */
  readonly compact: boolean;
  readonly labelVisible: boolean;
  /** The label sits left of the marker (near the right edge). */
  readonly leftFacing: boolean;
}

export interface MarkerPlan {
  /** In catalog order: the DOM and keyboard focus order. */
  readonly markers: readonly PlannedMarker[];
  /** Index entries examined (the MI-PERF-008 cost measure). */
  readonly visited: number;
}

interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

interface Placement {
  readonly entry: IndexedComponent;
  /** Centre in CSS pixels. */
  readonly x: number;
  readonly y: number;
  readonly dot: Box;
  readonly full: Box;
}

const square = (x: number, y: number, side: number): Box => ({
  left: x - side / 2,
  top: y - side / 2,
  right: x + side / 2,
  bottom: y + side / 2,
});

const overlaps = (a: Box, b: Box): boolean =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

const byPriority =
  (selectedId: string | undefined) =>
  (left: IndexedComponent, right: IndexedComponent): number =>
    Number(right.component.id === selectedId) - Number(left.component.id === selectedId) ||
    left.component.period - right.component.period ||
    right.size - left.size ||
    left.rank - right.rank;

const candidatesFor = (input: MarkerPlanInput, cap: number) => {
  const bounds = viewportBounds(input.viewport, input.width, input.height);
  const query = input.index.lowestPeriodsInView(bounds, cap);
  const candidates = [...query.entries];
  const selected = input.selectedId === undefined ? undefined : input.index.find(input.selectedId);
  if (selected !== undefined && !candidates.includes(selected)) candidates.push(selected);
  return { candidates: candidates.sort(byPriority(input.selectedId)), visited: query.visited };
};

const place = (
  candidates: readonly IndexedComponent[],
  input: MarkerPlanInput,
  cap: number,
): Placement[] => {
  const size = { width: input.width, height: input.height };
  const placed: Placement[] = [];
  for (const entry of candidates) {
    if (placed.length >= cap) break;
    const { x, y } = complexToPixel(input.viewport, size, entry.component.center);
    if (x < 0 || x > input.width || y < 0 || y > input.height) continue;
    const dot = square(x, y, COMPACT_HIT_REM * input.remPx);
    if (placed.some((other) => overlaps(dot, other.dot))) continue;
    placed.push({ entry, x, y, dot, full: square(x, y, MARKER_HIT_REM * input.remPx) });
  }
  return placed;
};

const labelBox = (placement: Placement, input: MarkerPlanInput, leftFacing: boolean): Box => {
  const characters = Array.from(placement.entry.component.label).length;
  const width =
    Math.min(LABEL_MAX_REM, LABEL_PADDING_REM + LABEL_CHARACTER_REM * characters) * input.remPx;
  const offset = LABEL_OFFSET_REM * input.remPx;
  const left = leftFacing ? placement.x - offset - width : placement.x + offset;
  const half = (LABEL_HEIGHT_REM * input.remPx) / 2;
  return { left, right: left + width, top: placement.y - half, bottom: placement.y + half };
};

/** Plans the catalog markers for one view; see the module comment for the rules. */
export const planMarkers = (input: MarkerPlanInput): MarkerPlan => {
  const cap = input.cap ?? MARKER_CAP;
  const { candidates, visited } = candidatesFor(input, cap);
  const placed = place(candidates, input, cap);
  const compact = placed.map((placement) =>
    placed.some((other) => other !== placement && overlaps(placement.full, other.full)),
  );
  const hitBoxes = placed.map((placement, index) =>
    compact[index] === true ? placement.dot : placement.full,
  );
  const labels: Box[] = [];
  const ranked = placed.map((placement, index) => {
    const leftFacing = placement.x / input.width > LEFT_FACING_FROM;
    const box = labelBox(placement, input, leftFacing);
    const labelVisible =
      placement.entry.component.id === input.selectedId ||
      (labels.every((other) => !overlaps(box, other)) &&
        hitBoxes.every((other, otherIndex) => otherIndex === index || !overlaps(box, other)));
    if (labelVisible) labels.push(box);
    const marker: PlannedMarker = {
      component: placement.entry.component,
      x: placement.x / input.width,
      y: placement.y / input.height,
      compact: compact[index] === true,
      labelVisible,
      leftFacing,
    };
    return { rank: placement.entry.rank, marker };
  });
  ranked.sort((left, right) => left.rank - right.rank);
  return { markers: ranked.map((item) => item.marker), visited };
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx prettier --write src/ui/marker-density.ts tests/unit/ui/marker-density.test.ts && npx vitest run tests/unit/ui/marker-density.test.ts`
Expected: PASS (14 tests).

- [ ] **Step 5: Verify and commit**

Run: `npm run check`
Expected: exits 0.

```bash
git add src/ui/marker-density.ts tests/unit/ui/marker-density.test.ts
git commit -m "$(cat <<'EOF'
UI: marker density policy, at most 40 markers, lowest periods first (Q4)

planMarkers chooses the catalog markers for a view: whole lowest periods
from the viewport index plus the selected entry; a marker is left off only
at the cap or when its dot would cover another; crowded markers shrink
their hit box to the dot so hit boxes never overlap; colliding labels are
hidden, never their markers; output in catalog order, the focus order.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Draw the overlay from the density policy

The overlay shows exactly the markers `planMarkers` returns, in its order, with compact hit boxes and hidden labels. Focus survives redraws as before.

**Files:**
- Modify: `src/ui/application.ts` (imports near line 15; `catalogMarkers` near line 928; `updateCatalogOverlay` near line 957)
- Modify: `src/styles.css` (after the period-4 left-facing label rule, near line 784)
- Modify: `tests/unit/catalog/catalog.test.ts` (one test title)
- Modify: `tests/e2e/explorer.spec.ts` (two scenarios)

**Interfaces:**
- Consumes: from Task 3, `createCatalogIndex`; from Task 4, `planMarkers`, `PlannedMarker`.
- Produces: the CSS classes `catalog-marker--compact` and `catalog-marker--label-hidden`; in `mountApplication`, `catalogIndex` (a `CatalogIndex` of `COMPONENT_CATALOG`) and `remPx(): number`, which Task 6 leaves in place.

- [ ] **Step 1: Write the failing browser scenarios**

In `tests/e2e/explorer.spec.ts`, find:

```ts
  test('Reset clears the selection from the evidence, the marker, and the address bar', async ({
```

and insert directly before it:

```ts
  test('tabs through catalog markers in catalog order, lowest periods first (ADR 0012)', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Explore', exact: true }).click();
    await expect(page.locator('#explorer')).toHaveAttribute('data-render-stage', 'stable', {
      timeout: 20_000,
    });
    await expect(page.locator('.catalog-marker')).toHaveCount(11);
    await page.getByLabel('Interactive Mandelbrot set').focus();
    const names: string[] = [];
    for (let step = 0; step < 11; step += 1) {
      await page.keyboard.press('Tab');
      names.push(
        await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? ''),
      );
    }
    expect(names).toEqual([
      'Inspect Main cardioid, period 1',
      'Inspect Period-2 bulb, period 2',
      'Inspect Douady rabbit, period 3',
      'Inspect Airplane, period 3',
      'Inspect Co-rabbit, period 3',
      'Inspect Period-4 component 6, period 4',
      'Inspect Period-4 component 4, period 4',
      'Inspect Period-4 component 2, period 4',
      'Inspect Period-4 component 1, period 4',
      'Inspect Period-4 component 3, period 4',
      'Inspect Period-4 component 5, period 4',
    ]);
  });

  test('keeps catalog marker hit boxes apart at 320 px (MI-PERF-008)', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Explore', exact: true }).click();
    await expect(page.locator('#explorer')).toHaveAttribute('data-render-stage', 'stable', {
      timeout: 20_000,
    });
    const boxes = await page.locator('.catalog-marker').evaluateAll((markers) =>
      markers.map((marker) => {
        const { left, top, right, bottom, width } = marker.getBoundingClientRect();
        return { left, top, right, bottom, width };
      }),
    );
    expect(boxes.length).toBeGreaterThan(0);
    expect(boxes.length).toBeLessThanOrEqual(40);
    for (const [index, a] of boxes.entries()) {
      expect(a.width).toBeGreaterThanOrEqual(24);
      for (const b of boxes.slice(index + 1)) {
        const apart =
          a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
        expect(apart, `marker boxes ${JSON.stringify([a, b])} overlap`).toBe(true);
      }
    }
  });


```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx playwright test --project=chromium --project=firefox -g "catalog order, lowest periods first|hit boxes apart at 320"`
Expected: 4 failed. The order scenario receives the airplane third (today's file order: airplane, co-rabbit, rabbit); the 320 px scenario reports the airplane's box overlapping the period-4 marker at the tip.

- [ ] **Step 3: Use the policy in the overlay**

In `src/ui/application.ts`, find:

```ts
} from '../catalog/components';
import { button, element, replaceChildren } from './dom';
import { setIcon } from './icons';
```

and replace it with:

```ts
} from '../catalog/components';
import { createCatalogIndex } from '../catalog/viewport-index';
import { button, element, replaceChildren } from './dom';
import { setIcon } from './icons';
import { planMarkers } from './marker-density';
```

Find:

```ts
  /** One live button per visible catalog component, keyed by catalog id. */
  const catalogMarkers = new Map<string, HTMLButtonElement>();
```

and replace it with:

```ts
  /** One live button per shown catalog component, keyed by catalog id. */
  const catalogMarkers = new Map<string, HTMLButtonElement>();
  /** Built once: the density policy queries it on every frame (ADR 0012). */
  const catalogIndex = createCatalogIndex(COMPONENT_CATALOG);
```

Find:

```ts
  /**
   * Moves the existing buttons instead of rebuilding them on every frame. A
   * rebuilt button drops keyboard focus and vanishes under a pointer or a
   * test between two reads. Stale buttons are removed first so the survivors
   * keep their order and never move (moving a focused node blurs it).
   */
  function updateCatalogOverlay(): void {
    if (!state.catalogVisible) {
      catalogMarkers.clear();
      catalogOverlay.replaceChildren();
      return;
    }
    const size = dimensions();
    const visible: HTMLButtonElement[] = [];
    for (const component of COMPONENT_CATALOG) {
      const point = complexToPixel(state.viewport, size, component.center);
      if (point.x < 0 || point.x > size.width || point.y < 0 || point.y > size.height) {
        catalogMarkers.delete(component.id);
        continue;
      }
      let marker = catalogMarkers.get(component.id);
      if (marker === undefined) {
        marker = createCatalogMarker(component);
        catalogMarkers.set(component.id, marker);
      }
      marker.classList.toggle('catalog-marker--left-facing', point.x / size.width > 0.76);
      marker.style.left = `${(point.x / size.width) * 100}%`;
      marker.style.top = `${(point.y / size.height) * 100}%`;
      visible.push(marker);
    }
```

and replace it with:

```ts
  /** CSS pixels per rem: marker and label sizes are set in rem (styles.css). */
  function remPx(): number {
    return Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  }

  /**
   * Shows the markers the density policy chooses (src/ui/marker-density.ts):
   * at most 40, lowest periods first, in catalog order. Moves the existing
   * buttons instead of rebuilding them on every frame. A rebuilt button drops
   * keyboard focus and vanishes under a pointer or a test between two reads.
   * Stale buttons are removed first so the survivors keep their order and
   * never move (moving a focused node blurs it).
   */
  function updateCatalogOverlay(): void {
    if (!state.catalogVisible) {
      catalogMarkers.clear();
      catalogOverlay.replaceChildren();
      return;
    }
    const rect = canvasStack.getBoundingClientRect();
    const plan = planMarkers({
      index: catalogIndex,
      viewport: state.viewport,
      width: Math.max(1, Math.round(rect.width)),
      height: Math.max(1, Math.round(rect.height)),
      remPx: remPx(),
      selectedId: state.selectedCatalogId,
    });
    const visible: HTMLButtonElement[] = [];
    for (const planned of plan.markers) {
      const { component } = planned;
      let marker = catalogMarkers.get(component.id);
      if (marker === undefined) {
        marker = createCatalogMarker(component);
        catalogMarkers.set(component.id, marker);
      }
      marker.classList.toggle('catalog-marker--left-facing', planned.leftFacing);
      marker.classList.toggle('catalog-marker--compact', planned.compact);
      marker.classList.toggle('catalog-marker--label-hidden', !planned.labelVisible);
      marker.style.left = `${planned.x * 100}%`;
      marker.style.top = `${planned.y * 100}%`;
      visible.push(marker);
    }
    for (const [id, marker] of catalogMarkers) {
      if (!visible.includes(marker)) catalogMarkers.delete(id);
    }
```

The rest of `updateCatalogOverlay` (removing stale children, inserting in order, `updateCatalogSelection()`) stays. `complexToPixel` stays imported: `updateSelectedPointMarker` still uses it.

- [ ] **Step 4: Style compact markers and hidden labels**

In `src/styles.css`, find:

```css
.catalog-marker--period-4.catalog-marker--left-facing .catalog-marker__label {
  right: calc(var(--p4-hit) / 2 + 23.6px);
  left: auto;
}
```

and insert directly after it:

```css
/* The density policy (src/ui/marker-density.ts) marks a marker compact when its 44px box would
   overlap a neighbour's: the box shrinks to the 24px dot, so hit boxes never overlap. The dot and
   the label (1.475rem from the centre) stay where they were. */
.catalog-marker--compact {
  width: 1.5rem;
  height: 1.5rem;
}

.catalog-marker--compact .catalog-marker__dot {
  inset: 0;
}

.catalog-marker--period-4.catalog-marker--compact {
  --p4-hit: 1.5rem;
}

.catalog-marker--compact .catalog-marker__label {
  left: 2.225rem;
}

.catalog-marker--compact.catalog-marker--left-facing .catalog-marker__label {
  right: 2.225rem;
  left: auto;
}

/* The policy hides a label that would cover another label or marker; hover and focus show it. */
.catalog-marker--label-hidden:not(:hover, :focus-visible) .catalog-marker__label {
  display: none;
}
```

- [ ] **Step 5: Retitle the file-order unit test**

The file order is no longer the focus order. In `tests/unit/catalog/catalog.test.ts`, find:

```ts
  it('keeps the v1 order, which is the keyboard focus order of the markers', () => {
```

and replace it with:

```ts
  it('keeps the v1 file order; the marker focus order is the catalog order (ADR 0012)', () => {
```

- [ ] **Step 6: Run the scenarios to verify they pass, then the whole suite**

Run: `npx prettier --write src/ui/application.ts src/styles.css tests/e2e/explorer.spec.ts tests/unit/catalog/catalog.test.ts && npx playwright test --project=chromium --project=firefox -g "catalog order, lowest periods first|hit boxes apart at 320"`
Expected: 4 passed.

Run: `npx playwright test`
Expected: every test passes (1 skipped by design). In particular `keeps keyboard focus on a catalog marker across a redraw`, `keeps one marker per component and the selection across redraws and toggles`, `zooms to a selected area and reveals labels as magnification increases` and the three `has no automated WCAG violations at … px` scenarios pass in both engines.

- [ ] **Step 7: Verify and commit**

Run: `npm run check`
Expected: exits 0.

```bash
git add src/ui/application.ts src/styles.css tests/e2e/explorer.spec.ts tests/unit/catalog/catalog.test.ts
git commit -m "$(cat <<'EOF'
UI: draw catalog markers from the density policy, in catalog order

The overlay shows what planMarkers returns: at most 40 markers, lowest
periods first, in catalog order, so the focus order no longer depends on
the file. Crowded markers shrink their hit box to the dot and colliding
labels are hidden. At phone widths the period-4 marker at the tip, whose dot
would cover the airplane's, is left to the list.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Catalog panel, glossary, activation and annotations in the inspector

**Files:**
- Create: `src/ui/catalog-glossary.ts`, `src/ui/catalog-panel.ts`
- Modify: `src/ui/application.ts` (imports; after `legend.update(state.semanticView);`; `sidePanel.append`; before `updateCatalogSelection`; `createInspector`)
- Modify: `src/styles.css` (`.inspector, .legend` rule; after `.measurement-help dd`; the 45rem media query)
- Modify: `tests/e2e/explorer.spec.ts` (one existing assertion; a new `Catalog panel (MI-UX-020)` block)

**Interfaces:**
- Consumes: from Task 2, `catalogGroups`, `zoomSpanFor`, `CatalogGroup`; from Task 1, `CatalogComponent.annotation`; `button`, `element` (`src/ui/dom.ts`); in `mountApplication`, `cancelPointerSession`, `clearPresentationPreview`, `updateCoordinateReadout`, `inspectPoint`, `showFeedback`, `scheduleRender`.
- Produces:
  - `src/ui/catalog-glossary.ts`: `interface GlossaryEntry { term: string; definition: string }`, `CATALOG_GLOSSARY: readonly GlossaryEntry[]`.
  - `src/ui/catalog-panel.ts`: `interface CatalogPanel { element: HTMLElement; setSelected(id: string | undefined): void }`, `createCatalogPanel(options: { groups: readonly CatalogGroup[]; onActivate: (component: CatalogComponent) => void }): CatalogPanel`.
  - In `mountApplication`: `activateCatalogEntry(component: CatalogComponent): void`.
  - DOM: a region named "Catalog" (`section.catalog-panel`), one `details.catalog-group` per period with `summary.catalog-group__summary`, entries `button.catalog-entry` named by their label with `aria-current="true"` when selected, the glossary `details.catalog-glossary`, and `p.inspector__annotation`.

- [ ] **Step 1: Write the failing browser scenarios**

The panel adds the text "Internal address" (glossary) to the page, so the one unscoped query for it would match several elements. In `tests/e2e/explorer.spec.ts`, find:

```ts
    await expect(page.getByText('Internal address')).toBeVisible();
```

and replace it with:

```ts
    await expect(
      page.locator('.facts').getByText('Internal address', { exact: true }),
    ).toBeVisible();
```

Append to the end of the file:

```ts
test.describe('Catalog panel (MI-UX-020)', () => {
  const ENTRY_ORDER = [
    'Main cardioid',
    'Period-2 bulb',
    'Douady rabbit',
    'Airplane',
    'Co-rabbit',
    'Period-4 component 6',
    'Period-4 component 4',
    'Period-4 component 2',
    'Period-4 component 1',
    'Period-4 component 3',
    'Period-4 component 5',
  ];

  const openExplorer = async (page: Page): Promise<void> => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Explore', exact: true }).click();
    await expect(page.locator('#explorer')).toHaveAttribute('data-render-stage', 'stable', {
      timeout: 20_000,
    });
  };

  test('zooms to an entry and selects it from the keyboard', async ({ page }) => {
    await openExplorer(page);
    const panel = page.getByRole('region', { name: 'Catalog' });
    const airplane = panel.getByRole('button', { name: 'Airplane', exact: true });
    await airplane.focus();
    await airplane.press('Enter');

    // zoomSpanFor: 2.5 × the size estimate 0.019036, so 2.5 / 0.047589 ≈ 53×.
    await expect(page.getByLabel('Magnification')).toHaveText('53×');
    await expect(page.getByText('Zoomed to Airplane.')).toBeVisible();
    await expect(airplane).toBeFocused();
    await expect(airplane).toHaveAttribute('aria-current', 'true');
    const pointEvidence = page.getByRole('region', { name: 'Point evidence' });
    await expect(pointEvidence.getByRole('heading', { name: 'Airplane' })).toBeVisible();
    await expect(pointEvidence.locator('.inspector__annotation')).toContainText('period-3 window');
    await expect(page.locator('#explorer')).toHaveAttribute('data-render-stage', 'stable', {
      timeout: 20_000,
    });
    await expect(page.getByRole('button', { name: 'Inspect Airplane, period 3' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    await expect
      .poll(() => new URL(page.url()).searchParams.get('sel'), { timeout: 10_000 })
      .toBe('mi-p3-3-4');
  });

  test('reaches every entry by Tab, grouped by period in catalog order', async ({ page }) => {
    await openExplorer(page);
    const panel = page.getByRole('region', { name: 'Catalog' });
    await panel.locator('summary').first().focus();
    const visited: string[] = [];
    for (let step = 0; step < 40; step += 1) {
      const focused = await page.evaluate(() => {
        const active = document.activeElement;
        if (!active?.closest('.catalog-panel')) return undefined;
        return `${active.tagName.toLowerCase()}:${active.textContent}`;
      });
      // The last stop repeats in Firefox, where Tab then leaves the document.
      if (focused === undefined || focused === visited.at(-1)) break;
      visited.push(focused);
      await page.keyboard.press('Tab');
    }
    expect(visited).toEqual([
      'summary:Period 11 component',
      'button:Main cardioid',
      'summary:Period 21 component',
      'button:Period-2 bulb',
      'summary:Period 33 components',
      ...ENTRY_ORDER.slice(2, 5).map((label) => `button:${label}`),
      'summary:Period 46 components',
      ...ENTRY_ORDER.slice(5).map((label) => `button:${label}`),
      'summary:About periods, rays and addresses',
    ]);
  });

  test('opens and closes a period group from the keyboard', async ({ page }) => {
    await openExplorer(page);
    const panel = page.getByRole('region', { name: 'Catalog' });
    const group = panel.locator('details.catalog-group').nth(3);
    const entry = panel.getByRole('button', { name: 'Period-4 component 2', exact: true });
    await expect(entry).toBeVisible();
    await group.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(entry).toBeHidden();
    await page.keyboard.press('Enter');
    await expect(entry).toBeVisible();
  });

  test('marks a marker selection in the list, opening its group, and Reset clears it', async ({
    page,
  }) => {
    await openExplorer(page);
    const panel = page.getByRole('region', { name: 'Catalog' });
    const group = panel.locator('details.catalog-group').nth(2);
    await group.locator('summary').click();
    await expect(group).not.toHaveAttribute('open');

    await page.getByRole('button', { name: 'Inspect Douady rabbit, period 3' }).click();
    const rabbit = panel.getByRole('button', { name: 'Douady rabbit', exact: true });
    await expect(group).toHaveAttribute('open');
    await expect(rabbit).toHaveAttribute('aria-current', 'true');
    await expect(panel.locator('[aria-current="true"]')).toHaveCount(1);

    // Reset is enabled only away from the default view.
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await page.getByRole('button', { name: 'Reset' }).click();
    await expect(panel.locator('[aria-current="true"]')).toHaveCount(0);
  });

  test('marks the entry a shared link selects, also by a v1 alias', async ({ page }) => {
    await page.goto('/?v=1&c=-1.3107026413368328,0&s=0.05&sel=mi-p4-02');
    const panel = page.getByRole('region', { name: 'Catalog' });
    await expect(
      panel.getByRole('button', { name: 'Period-4 component 2', exact: true }),
    ).toHaveAttribute('aria-current', 'true');
    await expect(panel.locator('[aria-current="true"]')).toHaveCount(1);
  });

  test('has no automated WCAG violations with an entry selected and the glossary open', async ({
    page,
  }) => {
    await openExplorer(page);
    const panel = page.getByRole('region', { name: 'Catalog' });
    await panel.getByText('About periods, rays and addresses').click();
    await expect(panel.getByText('Angled internal address', { exact: true })).toBeVisible();
    await panel.getByRole('button', { name: 'Douady rabbit', exact: true }).click();
    await expect(page.locator('#explorer')).toHaveAttribute('data-render-stage', 'stable', {
      timeout: 20_000,
    });
    await expectNoAccessibilityViolations(page);
  });

  test('marks the selected entry and focus without colour in forced colours', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await openExplorer(page);
    const panel = page.getByRole('region', { name: 'Catalog' });
    const rabbit = panel.getByRole('button', { name: 'Douady rabbit', exact: true });
    await rabbit.click();
    await expect(rabbit).toHaveAttribute('aria-current', 'true');
    const cue = await rabbit.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        edge: Number.parseFloat(style.borderLeftWidth),
        weight: Number.parseInt(style.fontWeight, 10),
      };
    });
    expect(cue.edge).toBeGreaterThanOrEqual(4);
    expect(cue.weight).toBeGreaterThanOrEqual(700);

    // Keyboard focus draws a forced-colours outline on entries and on group toggles.
    const summary = panel.locator('summary').first();
    const entry = panel.getByRole('button', { name: 'Main cardioid', exact: true });
    await summary.focus();
    await page.keyboard.press('Tab');
    await expect(entry).toBeFocused();
    await expect
      .poll(() => entry.evaluate((element) => element.matches(':focus-visible')))
      .toBe(true);
    expect(await entry.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe(
      'none',
    );
    await page.keyboard.press('Shift+Tab');
    await expect(summary).toBeFocused();
    expect(await summary.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe(
      'none',
    );
    await expectNoAccessibilityViolations(page);
  });

  test('reflows below the canvas at 320 px with full-size entries', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await openExplorer(page);
    const panel = page.getByRole('region', { name: 'Catalog' });
    await panel.getByText('About periods, rays and addresses').click();
    await expectNoHorizontalOverflow(page, '320 px catalog panel');
    const canvas = await page.locator('.explorer__stack').boundingBox();
    const panelBox = await panel.boundingBox();
    if (!canvas || !panelBox) throw new Error('canvas or panel has no box');
    expect(canvas.width / canvas.height).toBeGreaterThan(1.3);
    expect(panelBox.y).toBeGreaterThanOrEqual(canvas.y + canvas.height);
    expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(320);
    const entries = await panel.locator('.catalog-entry').evaluateAll((buttons) =>
      buttons.map((entry) => {
        const { right, height } = entry.getBoundingClientRect();
        return { right, height };
      }),
    );
    expect(entries).toHaveLength(11);
    for (const entry of entries) {
      expect(entry.height).toBeGreaterThanOrEqual(44);
      expect(entry.right).toBeLessThanOrEqual(320);
    }
    await expectNoAccessibilityViolations(page);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx playwright test --project=chromium --project=firefox -g "Catalog panel"`
Expected: 16 failed (8 scenarios × 2 engines), waiting for `getByRole('region', { name: 'Catalog' })`.

- [ ] **Step 3: Write the glossary data**

Create `src/ui/catalog-glossary.ts`:

```ts
/**
 * The catalog panel's glossary (PHASE2-TODO item 6, ADR 0012): the terms the
 * panel's grouping and order and the inspector's catalog facts use.
 */
export interface GlossaryEntry {
  readonly term: string;
  readonly definition: string;
}

export const CATALOG_GLOSSARY: readonly GlossaryEntry[] = [
  {
    term: 'Period',
    definition:
      'The length of the attracting cycle shared by every parameter in the component. The catalog groups its entries by period.',
  },
  {
    term: 'Characteristic rays',
    definition:
      'The two external rays that land at the component’s root, where a bulb meets its parent or at the cusp of a cardioid such as the airplane. Their angles are a/(2^p − 1) and b/(2^p − 1) of a full turn; within a period the catalog lists entries by the first angle, and an entry’s id mi-p<p>-<a>-<b> records p, a and b.',
  },
  {
    term: 'Internal address',
    definition:
      'Start at the main cardioid, period 1. Each next number is the lowest period of any component on the rest of the way to this one, so the rabbit’s is 1 → 3. Different components can share it: the co-rabbit’s is also 1 → 3.',
  },
  {
    term: 'Angled internal address',
    definition:
      'The internal address with the angle taken at each step, shown as 1 → 3 at 1/3 for the rabbit and 1 → 3 at 2/3 for the co-rabbit. It names exactly one component.',
  },
];
```

- [ ] **Step 4: Write the panel**

Create `src/ui/catalog-panel.ts`:

```ts
import type { CatalogGroup } from '../catalog/navigation';
import type { CatalogComponent } from '../catalog/schema';
import { CATALOG_GLOSSARY } from './catalog-glossary';
import { button, element } from './dom';

/**
 * The catalog panel (PHASE2-TODO item 6, MI-UX-020): every entry, grouped by
 * period in catalog order, each a button that zooms to its component and
 * selects it. Groups are native disclosures; a group's buttons are built the
 * first time it opens, so the 4,016-entry core costs nothing until then.
 */
export interface CatalogPanel {
  readonly element: HTMLElement;
  /** Marks the selected entry (aria-current) and opens its group; undefined clears the mark. */
  setSelected(id: string | undefined): void;
}

const HINT_ID = 'catalog-panel-hint';

const countText = (count: number): string => `${count} component${count === 1 ? '' : 's'}`;

function createGlossary(): HTMLElement {
  const glossary = element('details', { className: 'catalog-glossary' });
  const terms = element('dl');
  for (const { term, definition } of CATALOG_GLOSSARY) {
    terms.append(element('dt', { text: term }), element('dd', { text: definition }));
  }
  glossary.append(element('summary', { text: 'About periods, rays and addresses' }), terms);
  return glossary;
}

export function createCatalogPanel(options: {
  readonly groups: readonly CatalogGroup[];
  readonly onActivate: (component: CatalogComponent) => void;
}): CatalogPanel {
  const root = element('section', {
    className: 'catalog-panel',
    attributes: { 'aria-labelledby': 'catalog-panel-heading' },
  });
  const entries = new Map<string, HTMLButtonElement>();
  const openers = new Map<string, () => void>();
  let selectedId: string | undefined;

  const createEntry = (component: CatalogComponent): HTMLLIElement => {
    const entry = button(component.label, { className: 'catalog-entry' });
    entry.dataset['catalogId'] = component.id;
    entry.setAttribute('aria-describedby', HINT_ID);
    if (component.id === selectedId) entry.setAttribute('aria-current', 'true');
    entry.addEventListener('click', () => {
      options.onActivate(component);
    });
    entries.set(component.id, entry);
    const item = element('li');
    item.append(entry);
    return item;
  };

  const createGroup = (group: CatalogGroup): HTMLDetailsElement => {
    const details = element('details', { className: 'catalog-group' });
    const summary = element('summary', { className: 'catalog-group__summary' });
    summary.append(
      element('span', { text: `Period ${group.period}` }),
      element('span', {
        className: 'catalog-group__count',
        text: countText(group.components.length),
      }),
    );
    const list = element('ul', { className: 'catalog-group__list' });
    details.append(summary, list);
    let built = false;
    const open = (): void => {
      if (!built) {
        built = true;
        list.append(...group.components.map(createEntry));
      }
      details.open = true;
    };
    details.addEventListener('toggle', () => {
      if (details.open) open();
    });
    for (const component of group.components) openers.set(component.id, open);
    if (group.openByDefault) open();
    return details;
  };

  root.append(
    element('h2', {
      className: 'eyebrow',
      text: 'Catalog',
      attributes: { id: 'catalog-panel-heading' },
    }),
    element('p', {
      className: 'catalog-panel__hint',
      text: 'Choose a component to zoom to it and inspect it.',
      attributes: { id: HINT_ID },
    }),
    ...options.groups.map(createGroup),
    createGlossary(),
  );

  return {
    element: root,
    setSelected: (id) => {
      if (id === selectedId) return;
      if (selectedId !== undefined) entries.get(selectedId)?.removeAttribute('aria-current');
      selectedId = id;
      if (id === undefined) return;
      openers.get(id)?.();
      entries.get(id)?.setAttribute('aria-current', 'true');
    },
  };
}
```

- [ ] **Step 5: Mount the panel and wire activation and selection**

In `src/ui/application.ts`, find:

```ts
import { createCatalogIndex } from '../catalog/viewport-index';
import { button, element, replaceChildren } from './dom';
```

and replace it with:

```ts
import { catalogGroups, zoomSpanFor } from '../catalog/navigation';
import { createCatalogIndex } from '../catalog/viewport-index';
import { createCatalogPanel } from './catalog-panel';
import { button, element, replaceChildren } from './dom';
```

Find:

```ts
  const legend = createSemanticLegend();
  legend.update(state.semanticView);
```

and replace it with:

```ts
  const legend = createSemanticLegend();
  legend.update(state.semanticView);
  const catalogPanel = createCatalogPanel({
    groups: catalogGroups(COMPONENT_CATALOG),
    onActivate: (component) => {
      activateCatalogEntry(component);
    },
  });
```

Find:

```ts
  sidePanel.append(inspector.element, legend.element);
```

and replace it with:

```ts
  sidePanel.append(inspector.element, legend.element, catalogPanel.element);
```

Find:

```ts
  function updateCatalogSelection(): void {
    for (const marker of catalogOverlay.querySelectorAll<HTMLButtonElement>('.catalog-marker')) {
```

and replace it with:

```ts
  /** Zooms to a catalog entry and selects it: the catalog panel's action (MI-UX-020). */
  function activateCatalogEntry(component: CatalogComponent): void {
    cancelPointerSession(false);
    clearPresentationPreview();
    state.viewport = { center: { ...component.center }, spanY: zoomSpanFor(component) };
    updateCoordinateReadout();
    inspectPoint(component.center, component);
    showFeedback(`Zoomed to ${component.label}.`);
    scheduleRender(true);
  }

  function updateCatalogSelection(): void {
    catalogPanel.setSelected(state.selectedCatalogId);
    for (const marker of catalogOverlay.querySelectorAll<HTMLButtonElement>('.catalog-marker')) {
```

`updateCatalogSelection` already runs after every selection change (`inspectPoint`, `resetView`, each overlay update), so the list follows marker clicks, shared links and Reset.

- [ ] **Step 6: Show the annotation in the inspector**

In `createInspector` in `src/ui/application.ts`, find:

```ts
  const loading = (coordinate: string, component?: CatalogComponent): void => {
    replaceChildren(body, [
      component
        ? element('h3', {
            className: 'inspector__selection',
            text: component.label,
          })
        : undefined,
```

and replace it with:

```ts
  const annotation = (component: CatalogComponent | undefined): HTMLElement | undefined =>
    component?.annotation === undefined
      ? undefined
      : element('p', { className: 'inspector__annotation', text: component.annotation });

  const loading = (coordinate: string, component?: CatalogComponent): void => {
    replaceChildren(body, [
      component
        ? element('h3', {
            className: 'inspector__selection',
            text: component.label,
          })
        : undefined,
      annotation(component),
```

Then find (in `show`, the only remaining match):

```ts
        : undefined,
      element('p', {
        className: 'inspector__coordinate',
        text: `c = ${coordinate}`,
      }),
      badge,
```

and replace it with:

```ts
        : undefined,
      annotation(component),
      element('p', {
        className: 'inspector__coordinate',
        text: `c = ${coordinate}`,
      }),
      badge,
```

- [ ] **Step 7: Style the panel**

In `src/styles.css`, find:

```css
.inspector,
.legend {
  padding: 1rem;
```

and replace it with:

```css
.inspector,
.legend,
.catalog-panel {
  padding: 1rem;
```

Find (inside `@media (max-width: 45rem)`):

```css
  .inspector,
  .legend {
    padding: 0.875rem;
```

and replace it with:

```css
  .inspector,
  .legend,
  .catalog-panel {
    padding: 0.875rem;
```

Find:

```css
.measurement-help dd {
  margin: 0.1rem 0 0.65rem;
  color: var(--ink-muted);
}
```

and insert directly after it:

```css
.inspector__annotation {
  margin: 0.35rem 0 0;
  color: var(--ink-muted);
  font-size: 0.82rem;
}

.catalog-panel__hint {
  margin: 0.35rem 0 0.5rem;
  color: var(--ink-muted);
  font-size: 0.78rem;
}

.catalog-group + .catalog-group {
  border-top: 1px solid var(--line);
}

.catalog-group__summary {
  min-height: 2.75rem;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 700;
  list-style: none;
}

.catalog-group__summary::-webkit-details-marker {
  display: none;
}

/* A drawn chevron replaces the disclosure triangle that display: flex removes. */
.catalog-group__summary::before {
  width: 0.45rem;
  height: 0.45rem;
  flex: none;
  content: '';
  border-right: 2px solid currentcolor;
  border-bottom: 2px solid currentcolor;
  transform: rotate(-45deg);
}

.catalog-group[open] > .catalog-group__summary::before {
  transform: rotate(45deg);
}

.catalog-group__count {
  margin-left: auto;
  color: var(--ink-muted);
  font-size: 0.75rem;
  font-weight: 400;
}

/* A long group (the period ≤12 core) scrolls inside the panel; the padding keeps focus rings unclipped. */
.catalog-group__list {
  max-height: 20rem;
  margin: 0 0 0.5rem;
  padding: 0.3rem;
  overflow-y: auto;
  list-style: none;
}

.catalog-entry {
  width: 100%;
  min-height: 2.75rem;
  padding: 0.4rem 0.6rem;
  color: var(--ink);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  cursor: pointer;
  font: inherit;
  font-size: 0.85rem;
  overflow-wrap: anywhere;
  text-align: left;
}

.catalog-entry:hover {
  background: var(--surface-muted);
}

/* The selected entry: a thick leading edge and bold text, cues that survive forced colours. */
.catalog-entry[aria-current='true'] {
  border-color: var(--accent);
  border-left-width: 0.3rem;
  font-weight: 700;
}

.catalog-glossary {
  margin-top: 0.75rem;
  padding-top: 0.8rem;
  border-top: 1px solid var(--line);
  font-size: 0.76rem;
}

.catalog-glossary summary {
  cursor: pointer;
  color: var(--accent-strong);
  font-weight: 700;
}

.catalog-glossary dl {
  margin: 0.75rem 0 0;
}

.catalog-glossary dt {
  color: var(--ink);
  font-weight: 700;
}

.catalog-glossary dd {
  margin: 0.1rem 0 0.65rem;
  color: var(--ink-muted);
}
```

No forced-colours rule is needed: the selected entry's cues are its 0.3rem leading border and bold text, and focus uses the existing forced-colours outline for buttons and the browser's own for `summary`; the forced-colours scenario checks both.

- [ ] **Step 8: Run the scenarios to verify they pass, then the whole suite**

Run: `npx prettier --write src/ui/catalog-glossary.ts src/ui/catalog-panel.ts src/ui/application.ts src/styles.css tests/e2e/explorer.spec.ts && npx playwright test --project=chromium --project=firefox -g "Catalog panel"`
Expected: 16 passed.

Run: `npx playwright test`
Expected: every test passes (1 skipped by design).

- [ ] **Step 9: Verify and commit**

Run: `npm run check`
Expected: exits 0.

```bash
git add src/ui/catalog-glossary.ts src/ui/catalog-panel.ts src/ui/application.ts src/styles.css tests/e2e/explorer.spec.ts
git commit -m "$(cat <<'EOF'
UI: catalog panel with period groups, zoom-to-entry, glossary and annotations

Every entry is a button in a per-period disclosure, in catalog order;
activating one zooms to 2.5 times its size estimate and selects it, and
focus stays on it. Selections made elsewhere are marked in the list. A
glossary explains periods, rays and addresses; the inspector shows curated
annotations. Browser scenarios cover Tab reach of every entry, axe, forced
colours and 320 px reflow in both engines (MI-UX-020).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: ADR 0012, requirements, model and TODO

**Files:**
- Create: `docs/decisions/0012-catalog-navigation-and-marker-density.md`
- Modify: `docs/decisions/0011-catalog-schema-v2-and-stable-ids.md` (amendment)
- Modify: `docs/verification/REQUIREMENTS.md` (`MI-UX-020` row; `MI-PERF-008` trace row)
- Modify: `model/MandelbrotInteriority.sysml`, `model/README.md`
- Modify: `docs/verification/PHASE2-TODO.md` (item 6 ticked; `MI-UX-020` added)
- Modify: `fixtures/README.md` (the pending advisory baseline)

**Interfaces:**
- Consumes: the names of every module, test and scenario of Tasks 1–6.
- Produces: documentation only.

- [ ] **Step 1: Write ADR 0012**

Create `docs/decisions/0012-catalog-navigation-and-marker-density.md`:

````markdown
# ADR 0012: Catalog navigation and marker density

- Status: Accepted
- Date: 2026-10-17
- Amends: [ADR 0011](0011-catalog-schema-v2-and-stable-ids.md) (an optional
  `annotation` field; the marker focus order)
- Trace: [PHASE2-TODO item 6](../verification/PHASE2-TODO.md#6-catalog-navigation-and-annotations);
  owner decision Q4; `MI-UX-020`, `MI-UX-006`, `MI-UX-015`, `MI-PERF-008`

## Context

The catalog has eleven entries today, each drawn as a marker on the canvas and
reachable only through those markers. PHASE2-TODO item 7 will add the full
period ≤12 core: 4,016 entries with ids `mi-p<p>-<a>-<b>`, generated labels
and curated names where known. Drawing a marker per entry would put thousands
of buttons on the canvas. The owner chose (Q4) a zoom-dependent cap of about
40 interactive markers, lowest periods first, with a list that reaches every
entry. Item 6 builds that list, the cap and the lookup behind it, and tests
them on a synthetic catalog of the core's size, so that item 7 only supplies
data.

## Decision

**Order.** The catalog order is by period, then by the lower characteristic
angle a/(2^p − 1): the order of the components' roots around the set. It uses
exact integers that the id alone carries (item 7's compact form stores
`(p, a, b)`), and it is total, because within a period no two components share
a lower angle. The list uses it, and so does the keyboard focus order of the
markers, which therefore never depends on the view. The file order is not
changed.

**Panel.** A "Catalog" section after the legend in the side panel. On narrow
screens the side panel already stacks below the canvas, so the panel never
takes canvas space. Each period is a native `<details>` disclosure (keyboard
operable without script); a group of at most 8 entries starts open, so all of
today's catalog is visible, and a larger group builds its buttons the first
time it opens and scrolls inside a 20rem box. Each entry is a button named by
its label; activating it zooms to the component and selects it, and focus
stays on the button. Selecting a component any other way (its marker, a
shared link) marks its entry with `aria-current` and opens its group.

**Zoom span.** Activation centres the view on the component and sets the view
height to 2.5 times Heiland-Allen's size estimate (`componentSizeEstimate`:
about a bulb's diameter, 1 for the main cardioid), clamped to the zoom range,
so never past the `6,000,000×` ceiling. The estimate needs p complex
multiplications at load, no stored field, and follows the component's real
size: the airplane opens at 53×, the period-2 bulb at 2×.

**Annotations.** An optional `annotation` per entry: one line of at most 280
characters (code points), with no leading or trailing white space and no
control characters, carried by `tools/generate_catalog.py` from
`catalog/curation.v2.json` and validated by the generator and the loader. It
is additive, so `schemaVersion` stays 2 and the share-link version stays 1.
The inspector shows it under the entry's name. The five named components carry
one.

**Glossary.** A disclosure at the end of the catalog panel defines period,
characteristic rays, internal address and angled internal address, the terms
the panel's grouping and order and the inspector's catalog facts use. It
lives with the list it explains; the inspector's own help explains the
numerical evidence instead.

**Marker density (Q4).** `planMarkers` is a pure function of the index, the
view, the canvas size and the root font size:

1. Candidates are the in-view entries of the lowest periods: whole periods in
   ascending order until at least 40 are collected, plus the selected entry
   when it is in view.
2. In priority order (the selected entry, then period, then larger size
   estimate, then catalog order), a candidate is placed unless 40 are placed
   or its 1.5rem dot would overlap a dot already placed.
3. A placed marker whose 2.75rem hit box overlaps another's is compact: its
   hit box shrinks to its dot, so hit boxes never overlap and every target
   keeps at least 24 × 24 CSS px (WCAG 2.5.8).
4. In priority order, a label is shown only where it covers no earlier label
   and no other marker; the selected entry always keeps its label. A
   collision hides a label, never its marker.
5. The markers return in catalog order.

So the count is at most 40 at any zoom, the selected entry is always shown
when in view, and an entry left off the canvas is still in the list.

**Viewport index.** Built once at load: one bucket per period, sorted by
Re c. A query binary-searches each bucket for the view's Re range, examines
only that slab, and stops after the first period that brings the candidates
to 40. At the default view it examines periods 1 to 6, 53 of 4,016 entries; at
the zoom ceiling a slab a few pixels wide. The tests count examined entries
rather than time them.

## Alternatives rejected

- **Clustering** (one marker per group of nearby components): a cluster has
  no single component to select or name, and Q4 chose the cap.
- **A list only for generated entries**: it leaves the canvas without any
  marker for a high-period component, even when zoomed onto it.
- **Spatial focus order** (left to right): also view-independent, but it
  differs from the list order and interleaves periods.
- **A uniform grid index**: at the default view every cell is in view, so it
  would scan all entries; the period walk is what bounds the work, and the Re
  slab is enough inside it.
- **A period-based zoom span**: components of one period differ in size by
  orders of magnitude (period 4: 0.001 to 0.12).

## Consequences

- Markers can become compact (24px hit box) when a neighbour is close: on
  today's catalog, the airplane and the period-4 component at the tip are
  compact on a 1280-px-wide window, and at phone widths that period-4 marker
  is left off because its dot would cover the airplane's. It stays in the
  list.
- The marker focus order within periods 3 and 4 changes from the file order
  to the catalog order (the rabbit now precedes the airplane).
- The advisory `selected-marker-evidence.png` baselines change (the
  annotation line); the owner regenerates them in the container.
- Item 7 supplies data only: the loader, the order, the index, the policy and
  the panel are tested at its size. A find field for its 2,010-entry
  period-12 group is left to item 7.
````

- [ ] **Step 2: Apply the trace edits**

Run this script from the repository root. Each replacement asserts that its text occurs exactly once, so a mismatch stops it before it writes anything wrong:

```bash
python3 - <<'PY'
from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    if text.count(old) != 1:
        raise SystemExit(f"{path}: expected the text once, found {text.count(old)}:\n{old}")
    file.write_text(text.replace(old, new), encoding="utf-8")


# 1. REQUIREMENTS.md: MI-UX-020 row after MI-UX-021, and the MI-PERF-008 trace row.
requirements = "docs/verification/REQUIREMENTS.md"
lines = Path(requirements).read_text(encoding="utf-8").splitlines(keepends=True)
row_021 = next(i for i, line in enumerate(lines) if line.startswith("| `MI-UX-021` Palette acceptance"))
lines.insert(
    row_021 + 1,
    "| `MI-UX-020` Catalog navigation | Every catalog entry shall be reachable and selectable by keyboard and by a list grouped by period. Activating an entry shall zoom to it, never past the 6,000,000× ceiling, and select it. Curated entries may carry annotation text, and a glossary shall explain periods, characteristic rays and internal and angled internal addresses. At most 40 catalog markers shall be interactive at once, lowest periods first; the selected entry shall be shown whenever it is in view; the marker focus order shall not depend on the view; a marker shall be left off only when the cap is reached or its dot would cover another marker's, and a colliding label shall be hidden while its marker stays. | **Implemented** | `catalog order`, `component size estimate and zoom span` and `catalog groups` (`tests/unit/catalog/navigation.test.ts`), `catalog viewport index` (`tests/unit/catalog/viewport-index.test.ts`), `catalog marker density policy (Q4)` and `catalog marker collisions` (`tests/unit/ui/marker-density.test.ts`), all over a synthetic 4,016-entry catalog; `catalog annotations (ADR 0012)` (`tests/unit/catalog/schema.test.ts`); browser scenarios in Firefox and Chromium: `Catalog panel (MI-UX-020)` (zoom to an entry, Tab reach of every entry, group disclosure, selection sync, shared links, axe, forced colours, 320 px reflow), `tabs through catalog markers in catalog order, lowest periods first (ADR 0012)`, `keeps catalog marker hit boxes apart at 320 px (MI-PERF-008)`; [ADR 0012](../decisions/0012-catalog-navigation-and-marker-density.md) | Screen-reader check of the catalog panel in the next manual accessibility record; display of the generated period ≤12 core (PHASE2-TODO item 7) |\n",
)
Path(requirements).write_text("".join(lines), encoding="utf-8")
perf_row = next(i for i, line in enumerate(lines) if line.startswith("| `MI-PERF-008` | `MI-VER-PERF-003`"))
row = lines[perf_row]
for old, new in [
    (
        "`src/ui/` catalog presentation (Phase 1 surface; dynamic markers conditional on F)",
        "`src/ui/` catalog presentation: `marker-density.ts` (at most 40 markers), `catalog-panel.ts` (the list); `src/catalog/viewport-index.ts` (ADR 0012)",
    ),
    (
        "Phase 1 evidence retained; dynamic markers unassigned",
        "PHASE2-TODO item 6 (catalog navigation); the generated core's display is item 7",
    ),
    (
        "Accessibility record, marker cap, focus and search/list tests",
        "`catalog marker density policy (Q4)` (cap, lowest periods first, catalog focus order, hit boxes apart) and `catalog viewport index` (53 of 4,016 synthetic entries examined at the default view; Re-slab bound at any zoom); browser scenarios `Catalog panel (MI-UX-020)`, `tabs through catalog markers in catalog order, lowest periods first (ADR 0012)`, `keeps catalog marker hit boxes apart at 320 px (MI-PERF-008)`",
    ),
    (
        "**Pass (proposed)** — Phase 1 catalog accessibility evidence stands; F not adopted",
        "**Pass (proposed)** — bounded markers, a view-independent focus order and the list landed with item 6 (ADR 0012); F not adopted; the next manual accessibility record covers the panel",
    ),
]:
    if row.count(old) != 1:
        raise SystemExit(f"MI-PERF-008 row: expected {old!r} once")
    row = row.replace(old, new)
lines[perf_row] = row
Path(requirements).write_text("".join(lines), encoding="utf-8")

# 2. The SysML model: requirement, satisfaction, verification.
model = "model/MandelbrotInteriority.sysml"
replace_once(
    model,
    "        requirement <'MI-UX-018'> PeriodViewEmphasis {\n",
    """        requirement <'MI-UX-020'> CatalogNavigation {
            subject app : Architecture::MandelbrotInteriorityApplication;
            doc /*
             * Every catalog entry shall be reachable and selectable by
             * keyboard and by a list grouped by period. Activating an entry
             * shall zoom to it, never past the zoom ceiling, and select it.
             * Curated entries may carry annotation text, and a glossary shall
             * explain periods, characteristic rays and internal and angled
             * internal addresses. At most 40 catalog markers shall be
             * interactive at once, lowest periods first; the selected entry
             * shall be shown whenever it is in view; the marker focus order
             * shall not depend on the view; a marker shall be left off only
             * when the cap is reached or its dot would cover another
             * marker's, and a colliding label shall be hidden while its
             * marker stays.
             */
        }

        requirement <'MI-UX-018'> PeriodViewEmphasis {
""",
)
replace_once(
    model,
    """            satisfy UserExperienceRequirements::ShareableState
                by app.uiShell;
""",
    """            satisfy UserExperienceRequirements::ShareableState
                by app.uiShell;
            satisfy UserExperienceRequirements::CatalogNavigation
                by app.uiShell;
""",
)
replace_once(
    model,
    """                verify UserExperienceRequirements::ShareableState;
            }""",
    """                verify UserExperienceRequirements::ShareableState;
                verify UserExperienceRequirements::CatalogNavigation;
            }""",
)
replace_once(
    model,
    """                verify UserExperienceRequirements::KeyboardOperation;
                verify UserExperienceRequirements::AccessibleInterface;
            }""",
    """                verify UserExperienceRequirements::KeyboardOperation;
                verify UserExperienceRequirements::AccessibleInterface;
                verify UserExperienceRequirements::CatalogNavigation;
            }""",
)
replace_once(
    "model/README.md",
    """  requirements, the Phase 2 requirements `MI-UX-018` (period view emphasis),
  `MI-UX-019` (shareable state) and `MI-UX-021` (palette acceptance), and the
  retained OBE `MI-UX-014` requirement;""",
    """  requirements, the Phase 2 requirements `MI-UX-018` (period view emphasis),
  `MI-UX-019` (shareable state), `MI-UX-020` (catalog navigation) and
  `MI-UX-021` (palette acceptance), and the retained OBE `MI-UX-014`
  requirement;""",
)

# 3. PHASE2-TODO: item 6 ticked, MI-UX-020 no longer proposed.
todo = "docs/verification/PHASE2-TODO.md"
replace_once(
    todo,
    "**Trace:** proposed `MI-UX-020`; `MI-UX-006`, `MI-UX-015`, `MI-PERF-008`.",
    "**Trace:** `MI-UX-020`; `MI-UX-006`, `MI-UX-015`, `MI-PERF-008`.",
)
replace_once(
    todo,
    """- [ ] A catalog panel: entries grouped by period; activating one zooms to it
      and selects it; keyboard operable.
- [ ] Per-entry annotation text (an optional schema field) and a short
      glossary for internal and angled addresses and rays.
- [ ] A marker density policy (Q4) with a stable focus order; handle label
      collisions.
- [ ] A viewport-indexed lookup so thousands of centres need no full scan.
- [ ] Accessibility tests for the panel: axe, forced colours, 320 px reflow.
""",
    """- [x] A catalog panel: entries grouped by period; activating one zooms to it
      and selects it; keyboard operable. Done: `src/ui/catalog-panel.ts`,
      [ADR 0012](../decisions/0012-catalog-navigation-and-marker-density.md).
- [x] Per-entry annotation text (an optional schema field) and a short
      glossary for internal and angled addresses and rays. Done: `annotation`
      (at most 280 characters) in schema v2 and `catalog/curation.v2.json`,
      five curated; the glossary in the catalog panel
      (`src/ui/catalog-glossary.ts`).
- [x] A marker density policy (Q4) with a stable focus order; handle label
      collisions. Done: `src/ui/marker-density.ts`: at most 40 markers,
      lowest periods first, catalog focus order, colliding labels hidden.
- [x] A viewport-indexed lookup so thousands of centres need no full scan.
      Done: `src/catalog/viewport-index.ts`; at the default view it examines
      53 of 4,016 synthetic entries.
- [x] Accessibility tests for the panel: axe, forced colours, 320 px reflow.
      Done: `Catalog panel (MI-UX-020)` in Firefox and Chromium.
""",
)
replace_once(
    todo,
    """- `MI-UX-020` Catalog navigation: every catalog entry is reachable and
  selectable by keyboard and by a list, with zoom-to-entry, annotation text,
  and a bounded marker count.
""",
    """- `MI-UX-020` Catalog navigation: every catalog entry is reachable and
  selectable by keyboard and by a list, with zoom-to-entry, annotation text,
  and a bounded marker count. Added 2026-10-17 with item 6.
""",
)

# 4. fixtures/README.md: the advisory baseline the panel changes.
replace_once(
    "fixtures/README.md",
    "is a prompt to look at the report (`playwright-report-visual/`), not a\nfailure. Commit new baselines with the change that explains them.\n",
    "is a prompt to look at the report (`playwright-report-visual/`), not a\nfailure. Commit new baselines with the change that explains them.\n\n"
    "Pending (2026-10-17, PHASE2-TODO item 6): the inspector now shows a curated\n"
    "entry's annotation, so `selected-marker-evidence.png` differs in both\n"
    "engines until the owner regenerates the baselines in the container. The\n"
    "other baselines are not expected to change; the advisory job reports any\n"
    "that do.\n",
)

# 5. ADR 0011: the amendment ADR 0012 makes.
adr = Path("docs/decisions/0011-catalog-schema-v2-and-stable-ids.md")
adr.write_text(
    adr.read_text(encoding="utf-8")
    + """
## Amendment (2026-10-17, ADR 0012)

[ADR 0012](0012-catalog-navigation-and-marker-density.md) adds an optional
`annotation` to each entry: at most 280 characters, carried from
`curation.v2.json` by the generator and validated by the loader. The change is
additive, so `schemaVersion` stays 2. ADR 0012 also makes the catalog order
(period, then lower characteristic angle) the keyboard focus order of the
markers in place of the file order; the file order itself is unchanged.
""",
    encoding="utf-8",
)
print("docs edited")
PY
```

Expected: `docs edited`.

- [ ] **Step 3: Format and check**

Run:

```bash
npx prettier --write docs/decisions/0012-catalog-navigation-and-marker-density.md docs/decisions/0011-catalog-schema-v2-and-stable-ids.md docs/verification/REQUIREMENTS.md docs/verification/PHASE2-TODO.md fixtures/README.md
npx prettier --write docs/decisions/0012-catalog-navigation-and-marker-density.md docs/decisions/0011-catalog-schema-v2-and-stable-ids.md docs/verification/REQUIREMENTS.md docs/verification/PHASE2-TODO.md fixtures/README.md
npx prettier --check docs/decisions/0012-catalog-navigation-and-marker-density.md docs/decisions/0011-catalog-schema-v2-and-stable-ids.md docs/verification/REQUIREMENTS.md docs/verification/PHASE2-TODO.md fixtures/README.md
```

Expected: the second run lists every file as `(unchanged)`; the check prints `All matched files use Prettier code style!`. (`model/` is excluded from Prettier.)

Run: `grep -c "CatalogNavigation" model/MandelbrotInteriority.sysml && grep -c "^- \[x\]" docs/verification/PHASE2-TODO.md`
Expected: `4` (the requirement, its satisfaction and two verifications), then `35` (30 before this task, plus item 6's five).

- [ ] **Step 4: Verify the global gates**

Run: `npm run check && npx playwright test`
Expected: both exit 0 (1 Playwright test skipped by design).

- [ ] **Step 5: Commit**

```bash
git add docs/decisions/0012-catalog-navigation-and-marker-density.md docs/decisions/0011-catalog-schema-v2-and-stable-ids.md docs/verification/REQUIREMENTS.md docs/verification/PHASE2-TODO.md model/MandelbrotInteriority.sysml model/README.md fixtures/README.md
git commit -m "$(cat <<'EOF'
Docs and model: ADR 0012, MI-UX-020 and the MI-PERF-008 evidence (item 6)

ADR 0012 records the catalog order, the panel, the zoom span, annotations,
the glossary, the marker density policy and the viewport index; ADR 0011 is
amended for the annotation field and the focus order. MI-UX-020 joins
REQUIREMENTS.md and the SysML model, the MI-PERF-008 trace names its new
evidence, the pending advisory baseline is noted, and PHASE2-TODO item 6 is
ticked.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Notes for the owner

1. **Annotation wording.** The five annotations in Task 1 are proposed text for the curation file, which `catalog/README.md` describes as what a person reviewed. Review the wording in the Task 1 diff.
2. **Period-4 labels** stay the v1 placeholders ("Period-4 component N"); ADR 0011 left naming them to item 6 or 7, and renaming changes visible names that browser scenarios use. This plan leaves them to item 7.
3. **A find field for item 7.** Every entry is reachable by Tab, but the period-12 group will hold 2,010 entries. ADR 0012 leaves a find field (by name or rays) to item 7.
4. **Observed while planning, not changed:** at a 1280 px window the Pan and Zoom area buttons overlap the Quality select in the controls bar. It is independent of this plan (it happens with the panel removed).

<!-- prettier-ignore-end -->
