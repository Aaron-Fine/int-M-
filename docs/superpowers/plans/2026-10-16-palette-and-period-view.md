# Palette Acceptance and Period View Implementation Plan

<!-- prettier-ignore-start -->
<!-- Verbatim code snippets below are matched exactly by the implementer; Prettier would re-indent them. -->

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every semantic view a palette with numeric, unit-tested acceptance floors under simulated colour vision, make the period view emphasize at most five periods per view (owner decision Q1), let a reader isolate any emphasized period from the legend (owner decision 2026-10-17), and derive every legend colour, including new numeric κ, |λ| and arg λ scales, from the colorizer's own palette functions.

**Architecture:** A new domain module (`src/domain/period-emphasis.ts`) turns a frame's period histogram into a `PeriodKey`: the at most five periods with the most pixels, coloured from a fixed Okabe–Ito palette in ascending period order, plus one neutral for every other period. `CpuRenderer.colorize` builds the key from the semantic frame it is colorizing (so coarse, stable, cached, recolored and replayed deliveries each rank their own pixels without reclassification), draws with it, and returns it on the `RasterFrame`; the worker forwards it on the `FrameMessage`, and the main thread hands it to the legend. The legend's emphasized-period entries are toggle buttons: hovering, focusing or activating one sends an `isolatedPeriod` with the render request, and the worker recolors the cached semantic frame with every other pixel dimmed; isolation is a palette input, so it never enters the semantic cache key. A pure legend model (`src/ui/legend-model.ts`) computes every swatch and scale colour from the `src/domain` palette functions, and palette acceptance is a set of Node unit tests (`tests/unit/palette/`) that measure CIEDE2000 differences under Machado 2009 simulation against floors pinned to the passing Phase 1 palette (the period-colour floor raised to 11 once the owner accepted the palette).

**Tech Stack:** TypeScript 6 (strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), Vite 8, Vitest 5 (Node environment), Playwright 1.64 (Chromium and Firefox, headless), Prettier 3 (`printWidth` 100), ESLint 10 with `typescript-eslint` strict type-checked rules, SysML v2 text model.

**Spec:** `docs/verification/PHASE2-TODO.md`, items "1. Palette acceptance" and "2. Refine the multiplier, stability and period views", "Owner decisions (2026-10-16)" Q1 and Q5, and the 2026-10-17 entries "Palette" and "Non-hue cue". Background: `docs/PLAN.md` §5.4, §5.6, §8 and §8.1; `docs/RESEARCH.md` §13; `docs/verification/REQUIREMENTS.md` (`MI-UX-010`, `MI-UX-011`, `MI-UX-016`); `evidence/phase-1/cvd-4fd4fdd-2026-08-29.md`; the cue experiment's option E (isolate on legend focus).

## Global Constraints

- `npm run check`, `npm run fixtures:kernel-golden -- --check` and `npx playwright test` pass at the end of every task.
- Commit trailer for implementers: `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`.
- No headed browser runs.
- Follow the conventions in the files you touch.
- Q1: the period view emphasizes at most **5 periods per view**, chosen by area (pixel count) in the current frame; every other period is one neutral "other periods" colour; the fixed five-colour palette is assigned to the emphasized periods in **ascending period order**; the legend always shows the exact period-to-colour mapping.
- Palette (owner, 2026-10-17): Okabe–Ito for the five emphasized periods, `#BBBBBB` for "other periods"; the period-colour floor is 11.
- Non-hue cue (owner, 2026-10-17): **isolate on legend focus only.** No in-raster texture or outline: a texture would conflict with the stripes that carry meaning in the multiplier view. The legend's emphasized-period entries are buttons with `aria-pressed`; hover, keyboard focus or activation dims every pixel not of that period; Escape or a second activation restores; a tap toggles; isolation clears when the interior view changes, and a pressed isolation clears only when a **stable** frame no longer lists the period (it survives coarse previews); isolation recolors never write the status line (a live region), so `aria-pressed` and the visible tag are the announcement; the pressed state is visible without colour under forced colours; the point inspector keeps stating the exact period.
- Isolation is applied when colorizing (including the recolor path) only: it must not enter the semantic cache key or cause reclassification.
- Q5: keep the stability and multiplier palettes (their bytes must not change); numeric floors come from the passing Phase 1 CVD matrix and are checked by unit tests with no browser.
- The legend swatches must be derived from the same palette functions the colorizer uses.
- PLAN §5.4: semantic arrays stay worker-local; only RGBA plus the small `PeriodKey` object (and the isolated period number) crosses to the main thread.
- The semantic algorithm version (`SEMANTIC_ALGORITHM_VERSION = 2` in `src/render/semantic-store.ts`) does not change: no cached semantic field is added or altered.
- Do not commit screenshots (`evidence/phase-2/README.md`, retention tier 1; owner decision Q6).
- The branch is shared with other agents. Stage files by explicit path, never `git add -A`, and never revert or reformat changes you did not make.
- The shareable-URL plan (`docs/superpowers/plans/2026-10-16-shareable-urls.md`) lands at the same time and also edits `src/ui/application.ts`, `tests/e2e/explorer.spec.ts`, `docs/verification/REQUIREMENTS.md`, the SysML model, `model/README.md` and `docs/PLAN.md`. Every edit below is anchored on quoted text that the other plan keeps, or is made by a script that handles both orders. If a quoted anchor is not found exactly once, stop and report it; do not improvise a placement. Expected outputs never rely on total test counts, because the other plan adds tests.
- Known, out-of-scope browser issues: the Firefox test "catalog markers are keyboard-selectable and populate evidence" can time out when the whole suite runs under load (rerun it alone: `npx playwright test -g "catalog markers are keyboard" --project firefox`), and axe reports a `target-size` violation for catalog markers at 320 px (PHASE2-TODO item 0). Neither is caused by this plan; do not run axe at 320 px in new tests.

## Review Focus

1. **Coarse and stable frames rank differently.** At the default view the coarse frame finds periods {1, 2} and the stable frame {1, 2, 3, 4, 15}; near the Feigenbaum point the coarse frame finds none and the stable frame finds period 32. Expected: each frame is drawn with its own key and the legend shows the key of the frame on screen (never a stale one); because colours go in ascending period order, a period keeps its colour whenever the set of emphasized periods below it is unchanged. Pinned by the coarse/stable test in Task 4 and the per-frame legend update in Task 8.
2. **Recolor after a pan, and isolation, must not reclassify.** Switching to the period view after moving must rank the new cached frame, not the previous viewport's mapping; changing or clearing an isolation must recolor the cached frame without calling `render` and without changing the period key. Pinned in Task 6 ("ranks the new frame, not the previous view, when a recolor follows a pan") and Task 9 ("recolors the cached frame for each isolation change without reclassifying").
3. **Isolation lifecycle and announcements.** A pressed isolation must end on Escape, on a second activation (keyboard, click or tap), on an interior-view change, and when a *stable* frame's key no longer lists the period; it must survive a coarse preview that lacks the period (the canvas is then all dimmed until the stable frame). Hover and focus isolate only while they last, a focused entry keeps its focus when coarse and stable frames share a key, and no isolation recolor may change or re-announce the status line. Pinned by the state-machine tests (including "keeps a pressed isolation through a coarse frame that lacks the period, then clears it on a stable frame without it") and the browser test in Task 10 (which observes the status region during a hover isolation).
4. **Frames with zero interior pixels or exactly one period.** Expected: an empty key, a legend note "No attracting cycle detected in this view." and "Other periods: None in this view", with no isolation buttons; one period takes the first palette colour. Pinned in Tasks 3, 4 and 7.
5. **Ties in area, and a period above the classifier's maximum** (up to `PACK_PERIOD_MAX` = 2^24 − 1). Expected: equal pixel counts resolve to the lower period whatever the insertion order; a very high period is ranked, coloured and isolated like any other. Pinned in Tasks 3 and 4.

## Decisions this plan makes

- **Palette (owner-confirmed 2026-10-17).** Okabe–Ito yellow `#F0E442`, sky blue `#56B4E9`, reddish purple `#CC79A7`, vermillion `#D55E00`, blue `#0072B2` (in the order given to ascending emphasized periods) and neutral `#BBBBBB` (Paul Tol's grey) for "other periods". Measured six-class minimum CIEDE2000 under the four visions: 11.98 (Phase 1 p1–p5: 5.56); against unresolved 17.57 (floor 11); against escaped 20.72 (floor 18). Tol muted is a near tie (12.29 pairwise, 15.82 against unresolved); Okabe–Ito wins on the larger margin over the tightest class floor and on five distinct basic colour names. Tol bright fails (9.84 against unresolved, 8.66 pairwise). Task 2 records all of this.
- **Colour difference and simulation.** CIEDE2000 (Sharma, Wu and Dalal 2005), because CIE76 overstates differences among the dark blues of the escaped band and near-neutrals, exactly where this palette's classes meet. Machado, Oliveira and Fernandes (2009) at severity 1.0, applied to linear sRGB and clamped; it models dichromacy for all three cone types with one published matrix each.
- **Floors.** `PHASE1_FLOORS` are the Phase 1 palette's minima rounded down: escaped–unresolved 8 (stability) and 18 (multiplier, period); unresolved checker cells 8; multiplier stripes 9; period classes pairwise 5, against unresolved 11, against escaped 18. `PALETTE_FLOORS`, the floors the shipped palette must meet, equal them except the period-colour floor, raised to 11 because the owner accepted the palette (it reaches 11.98). Label contrast over the raster: 4.5:1 (WCAG 2.2 SC 1.4.3). The stability ramp and the multiplier hues overlap the escaped and unresolved colours by design (both kept palettes passed review that way); for those views the separating cues are the unresolved checker texture and the multiplier stripes, so those two get floors instead of an impossible interior colour floor.
- **Non-hue cue: isolate on legend focus (owner decision).** Hovering, focusing or activating an emphasized period's legend entry dims every other pixel; the legend lists the periods in ascending order with exact numbers and area shares; the point inspector states the exact period. The experiment found this the only option that identifies components under 6 px, under every simulated vision, at the cost of one recolor. There is no in-raster texture or outline.
- **Dimming factor 0.12.** Each channel of every pixel that is not of the isolated period is multiplied by 0.12 and rounded. Justification: WCAG 2.2 SC 1.4.11 asks 3:1 for the graphical object (the isolated period) against adjacent colours. The darkest emphasized colour, blue `#0072B2`, limits it: against dimmed yellow under simulated deutan vision it reaches 3.09:1 at 0.12 and only 2.92:1 at 0.14; the experiment's 0.18 gives 2.61:1. 0.12 is the largest step of 0.02 that meets 3:1 for every emphasized colour against every dimmed period-view colour in all four visions (pinned in Task 9). The dimmed field stays faintly visible (at most 31 of 255 per channel) so the reader keeps the shape of the set.
- **Isolation rules.** A hover (mouse only) or keyboard focus previews the period while it lasts; activation (click, Enter, Space, or a tap) toggles a persistent isolation shown as `aria-pressed="true"` plus a visible "Isolated" tag and a solid outline (system Highlight colour under forced colours); activating the pressed entry again, or Escape, restores the full view. Changing the interior view resets it. Any new frame drops hover and focus on periods it no longer lists; a pressed period is dropped only by a stable frame that does not list it, because a coarse preview routinely lacks small periods (coarse {1, 2} against stable {1, 2, 3, 4, 15} at the default view). While a coarse frame lacks the pressed period, the raster shows only dimmed pixels and the legend hint says the period stays isolated until the stable frame arrives. The pure state machine lives in `src/ui/period-isolation.ts`.
- **Isolation transport.** The main thread sends `isolatedPeriod` on the render message, only in the period view. The worker keeps it out of `semanticRequestKey`, so a change hits the cached or in-flight semantic frame; the delivery is a `recolor` (a `semantic-cache` delivery now means the same view and the same isolation). The raster reports `isolatedPeriod`, and the explorer exposes it as `data-isolated-period`. An isolation change calls `requestRender` directly, not `requestSemanticView`, so the status line never reads "Applying interior view…" for it, and frame statuses are written only when their text changes, so a recolor re-delivering "Stable frame" does not touch the live region; real interior-view changes keep their status behaviour.
- **Coarse versus stable ranking.** Each delivered frame ranks its own histogram; there is no hysteresis. This keeps the key a pure function of the semantic frame, so recolor and cache deliveries reproduce it exactly and the legend can never disagree with the raster.
- **Evidence.** Numbers, not screenshots: two directories under `evidence/phase-2/` (selection in Task 2; shipped palette, isolation contrast and browser record in Task 11).

## File Structure

| Path | Responsibility | Task |
| --- | --- | --- |
| `tests/unit/palette/color-science.ts` | Test helper: sRGB/CIELAB, CIEDE2000, Machado 2009 simulation, WCAG contrast, compositing | 1 |
| `tests/unit/palette/color-science.test.ts` | Helper tests against published CIEDE2000 pairs | 1 |
| `tests/unit/palette/palette-metrics.ts` | Metric definitions, frozen Phase 1 palette, shipped palette sampled from `colorizeFrame`, isolation contrast | 2, 5, 9 |
| `tests/unit/palette/palette-floors.ts` | Phase 1 floors, the shipped floors, label and isolation contrast floors | 2 |
| `tests/unit/palette/palette-candidates.ts` | Period-palette candidates and the selection | 2 |
| `tests/unit/palette/palette-selection.test.ts` | Phase 1 floors equal Phase 1 minima; the ratchet; selection clears the floors | 2 |
| `tools/palette_metrics.ts` | Evidence generator (`npm run evidence:palette`) | 2, 5, 9 |
| `src/domain/period-emphasis.ts` | `PeriodKey`, palette constants, ranking; isolation dimming | 3, 9 |
| `src/domain/semantic.ts` | Period colour from the key; exported escape band rate and unresolved texture colours | 4 |
| `src/render/colorize.ts` | `periodHistogram`; draws the period view from a key; dims around an isolated period | 4, 9 |
| `src/render/cpu-renderer.ts`, `renderer.ts` | `RasterFrame.periodKey`, `RasterFrame.isolatedPeriod`; `colorize(frame, view, isolatedPeriod?)` | 4, 9 |
| `tests/unit/palette/palette-acceptance.test.ts` | Shipped palette meets the floors; stability ramp monotonic | 5 |
| `tests/unit/palette/overlay-contrast.ts`, `label-contrast.test.ts` | Text-over-raster contrast read from `src/styles.css` (Node only) | 5 |
| `tests/unit/palette/isolation-contrast.test.ts` | Isolated period keeps 3:1 against the dimmed field | 9 |
| `src/worker/protocol.ts`, `runtime.ts` | `FrameMessage.periodKey`; `isolatedPeriod` on render and frame messages | 6, 9 |
| `src/ui/legend-model.ts` | Pure legend data: scales, swatches, period key, `DEFINITIONS` | 7 |
| `src/ui/period-isolation.ts` | Pure isolation state machine (hover, focus, activate, Escape, reset) | 10 |
| `src/ui/semantic-legend.ts`, `application.ts`, `src/styles.css` | Legend DOM; period key follows the presented frame; isolation buttons and wiring | 8, 10 |
| `tests/e2e/explorer.spec.ts` | Legend assertions; swatches are colours the canvas drew; 320 px reflow; isolation by keyboard, hover and under forced colours | 8, 10 |
| `evidence/phase-2/*-palette*`, `evidence/phase-2/README.md` | Palette evidence | 2, 11 |
| `docs/verification/REQUIREMENTS.md`, `model/*`, `docs/PLAN.md`, `docs/IMPLEMENTATION.md`, `docs/verification/PHASE2-TODO.md` | Requirements and traceability | 12 |

---

### Task 1: Colour-science test helper

**Files:**

- Create: `tests/unit/palette/color-science.ts`
- Test: `tests/unit/palette/color-science.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces (all exported from `tests/unit/palette/color-science.ts`):
  - `type Rgb = readonly [red: number, green: number, blue: number]`
  - `type Vision = 'normal' | 'protan' | 'deutan' | 'tritan'`
  - `const VISIONS: readonly Vision[]`
  - `simulate(rgb: Rgb, vision: Vision): Rgb`
  - `toLab(rgb: Rgb): readonly [l: number, a: number, b: number]`
  - `ciede2000Lab(lab1: readonly [number, number, number], lab2: readonly [number, number, number]): number`
  - `deltaE(first: Rgb, second: Rgb, vision?: Vision): number`
  - `relativeLuminance(rgb: Rgb): number`
  - `contrastRatio(first: Rgb, second: Rgb): number`
  - `composite(top: Rgb, alpha: number, bottom: Rgb): Rgb`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/palette/color-science.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  ciede2000Lab,
  composite,
  contrastRatio,
  deltaE,
  relativeLuminance,
  simulate,
  toLab,
  VISIONS,
} from './color-science';

describe('CIEDE2000', () => {
  // Sharma, Wu and Dalal (2005), supplementary test data, pairs 1, 7, 17, 19, 25, 26, 34.
  const pairs: readonly (readonly [
    readonly [number, number, number],
    readonly [number, number, number],
    number,
  ])[] = [
    [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
    [[50, 0, 0], [50, -1, 2], 2.3669],
    [[50, 2.5, 0], [73, 25, -18], 27.1492],
    [[50, 2.49, -0.001], [50, -2.49, 0.0011], 7.2195],
    [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
    [[63.0109, -31.0961, -5.8663], [62.8187, -29.7946, -4.0864], 1.263],
    [[2.0776, 0.0795, -1.135], [0.9033, -0.0636, -0.5514], 0.9082],
  ];

  it('reproduces the published test pairs to four decimals', () => {
    for (const [first, second, expected] of pairs) {
      expect(ciede2000Lab(first, second)).toBeCloseTo(expected, 4);
      expect(ciede2000Lab(second, first)).toBeCloseTo(expected, 4);
    }
  });

  it('maps sRGB white, black and mid gray to their CIELAB lightness', () => {
    expect(toLab([255, 255, 255])[0]).toBeCloseTo(100, 3);
    expect(toLab([0, 0, 0])[0]).toBeCloseTo(0, 6);
    expect(toLab([128, 128, 128])[0]).toBeCloseTo(53.585, 2);
  });
});

describe('Machado 2009 colour-vision simulation (severity 1.0)', () => {
  it('leaves neutral grays and normal vision unchanged', () => {
    for (const vision of VISIONS) {
      for (const level of [0, 84, 108, 187, 255]) {
        expect(simulate([level, level, level], vision)).toEqual([level, level, level]);
      }
    }
    expect(simulate([213, 94, 0], 'normal')).toEqual([213, 94, 0]);
  });

  it('collapses red-green contrast under protan and deutan, blue-yellow under tritan', () => {
    expect(simulate([255, 0, 0], 'protan')).toEqual([109, 95, 0]);
    expect(simulate([255, 0, 0], 'deutan')).toEqual([163, 144, 0]);
    expect(simulate([0, 0, 255], 'tritan')).toEqual([0, 107, 150]);
    expect(deltaE([255, 0, 0], [0, 128, 0], 'deutan')).toBeLessThan(
      deltaE([255, 0, 0], [0, 128, 0], 'normal'),
    );
  });
});

describe('WCAG contrast', () => {
  it('computes the extreme ratio and compositing', () => {
    expect(relativeLuminance([255, 255, 255])).toBeCloseTo(1, 6);
    expect(contrastRatio([255, 255, 255], [0, 0, 0])).toBeCloseTo(21, 6);
    expect(composite([0, 0, 0], 0.5, [255, 255, 255])).toEqual([127.5, 127.5, 127.5]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/palette/color-science.test.ts`
Expected: FAIL; the import `./color-science` cannot be resolved.

- [ ] **Step 3: Write the helper**

Create `tests/unit/palette/color-science.ts`:

```ts
/**
 * Colour-science helpers for palette acceptance tests (no browser).
 *
 * - sRGB (IEC 61966-2-1) <-> linear RGB, D65 XYZ and CIELAB (D65 white).
 * - CIEDE2000 colour difference (Sharma, Wu and Dalal 2005).
 * - Colour-vision deficiency simulation: Machado, Oliveira and Fernandes
 *   2009, severity 1.0 (dichromacy), applied to linear RGB and clamped.
 * - WCAG 2.x relative luminance, contrast ratio and alpha compositing.
 */

export type Rgb = readonly [red: number, green: number, blue: number];
export type Vision = 'normal' | 'protan' | 'deutan' | 'tritan';
export const VISIONS: readonly Vision[] = ['normal', 'protan', 'deutan', 'tritan'];

type Matrix = readonly [Rgb, Rgb, Rgb];

/** Machado et al. 2009, Table "severity 1.0" (protanopia, deuteranopia, tritanopia). */
const MACHADO_2009: Record<Exclude<Vision, 'normal'>, Matrix> = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritan: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

const toLinear = (byte: number): number => {
  const c = byte / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const toByte = (linear: number): number => {
  const c = Math.min(1, Math.max(0, linear));
  const encoded = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.round(encoded * 255);
};

/** Simulated appearance of an sRGB colour (bytes in, bytes out). */
export const simulate = (rgb: Rgb, vision: Vision): Rgb => {
  if (vision === 'normal') return rgb;
  const m = MACHADO_2009[vision];
  const lin = [toLinear(rgb[0]), toLinear(rgb[1]), toLinear(rgb[2])] as const;
  const row = (r: Rgb): number => r[0] * lin[0] + r[1] * lin[1] + r[2] * lin[2];
  return [toByte(row(m[0])), toByte(row(m[1])), toByte(row(m[2]))];
};

/** CIELAB (D65) of an sRGB colour. */
export const toLab = (rgb: Rgb): readonly [l: number, a: number, b: number] => {
  const r = toLinear(rgb[0]);
  const g = toLinear(rgb[1]);
  const b = toLinear(rgb[2]);
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (t: number): number => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
};

const degrees = (radians: number): number => (radians * 180) / Math.PI;
const radians = (deg: number): number => (deg * Math.PI) / 180;

/** CIEDE2000 between two CIELAB colours (kL = kC = kH = 1). */
export const ciede2000Lab = (
  lab1: readonly [number, number, number],
  lab2: readonly [number, number, number],
): number => {
  const [l1, a1, b1] = lab1;
  const [l2, a2, b2] = lab2;
  const c1 = Math.hypot(a1, b1);
  const c2 = Math.hypot(a2, b2);
  const cBar7 = ((c1 + c2) / 2) ** 7;
  const g = 0.5 * (1 - Math.sqrt(cBar7 / (cBar7 + 25 ** 7)));
  const a1p = (1 + g) * a1;
  const a2p = (1 + g) * a2;
  const c1p = Math.hypot(a1p, b1);
  const c2p = Math.hypot(a2p, b2);
  const hue = (bp: number, ap: number): number =>
    bp === 0 && ap === 0 ? 0 : (degrees(Math.atan2(bp, ap)) + 360) % 360;
  const h1p = hue(b1, a1p);
  const h2p = hue(b2, a2p);
  const dLp = l2 - l1;
  const dCp = c2p - c1p;
  let dhp = 0;
  if (c1p * c2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(c1p * c2p) * Math.sin(radians(dhp / 2));
  const lBarP = (l1 + l2) / 2;
  const cBarP = (c1p + c2p) / 2;
  let hBarP = h1p + h2p;
  if (c1p * c2p !== 0) {
    if (Math.abs(h1p - h2p) <= 180) hBarP = (h1p + h2p) / 2;
    else if (h1p + h2p < 360) hBarP = (h1p + h2p + 360) / 2;
    else hBarP = (h1p + h2p - 360) / 2;
  }
  const t =
    1 -
    0.17 * Math.cos(radians(hBarP - 30)) +
    0.24 * Math.cos(radians(2 * hBarP)) +
    0.32 * Math.cos(radians(3 * hBarP + 6)) -
    0.2 * Math.cos(radians(4 * hBarP - 63));
  const dTheta = 30 * Math.exp(-(((hBarP - 275) / 25) ** 2));
  const cBarP7 = cBarP ** 7;
  const rC = 2 * Math.sqrt(cBarP7 / (cBarP7 + 25 ** 7));
  const sL = 1 + (0.015 * (lBarP - 50) ** 2) / Math.sqrt(20 + (lBarP - 50) ** 2);
  const sC = 1 + 0.045 * cBarP;
  const sH = 1 + 0.015 * cBarP * t;
  const rT = -Math.sin(radians(2 * dTheta)) * rC;
  return Math.sqrt(
    (dLp / sL) ** 2 + (dCp / sC) ** 2 + (dHp / sH) ** 2 + rT * (dCp / sC) * (dHp / sH),
  );
};

/** CIEDE2000 between two sRGB colours as seen under the given vision. */
export const deltaE = (first: Rgb, second: Rgb, vision: Vision = 'normal'): number =>
  ciede2000Lab(toLab(simulate(first, vision)), toLab(simulate(second, vision)));

/** WCAG 2.x relative luminance of an sRGB colour. */
export const relativeLuminance = (rgb: Rgb): number =>
  0.2126 * toLinear(rgb[0]) + 0.7152 * toLinear(rgb[1]) + 0.0722 * toLinear(rgb[2]);

/** WCAG 2.x contrast ratio. */
export const contrastRatio = (first: Rgb, second: Rgb): number => {
  const l1 = relativeLuminance(first);
  const l2 = relativeLuminance(second);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};

/** Source-over compositing of `top` at `alpha` onto an opaque `bottom` (sRGB bytes). */
export const composite = (top: Rgb, alpha: number, bottom: Rgb): Rgb => [
  top[0] * alpha + bottom[0] * (1 - alpha),
  top[1] * alpha + bottom[1] * (1 - alpha),
  top[2] * alpha + bottom[2] * (1 - alpha),
];
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/palette/color-science.test.ts`
Expected: PASS; all five tests in the file pass.

- [ ] **Step 5: Format, check and commit**

```bash
npx prettier --write tests/unit/palette
npm run check
npm run fixtures:kernel-golden -- --check
npx playwright test
git add tests/unit/palette/color-science.ts tests/unit/palette/color-science.test.ts
git commit -F - <<'EOF'
Palette: CIEDE2000 and Machado 2009 colour-vision test helper

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
EOF
```

Expected: `npm run check` ends with the Vite build line (`✓ built in …`); the kernel golden check exits 0 with no output; Playwright reports no failed tests.

---

### Task 2: Floors from the Phase 1 matrix, the accepted ratchet, and the period palette selection

**Files:**

- Create: `tests/unit/palette/palette-metrics.ts`
- Create: `tests/unit/palette/palette-floors.ts`
- Create: `tests/unit/palette/palette-candidates.ts`
- Test: `tests/unit/palette/palette-selection.test.ts`
- Create: `tools/palette_metrics.ts`
- Modify: `package.json` (scripts), `tsconfig.node.json` (include), `evidence/phase-2/README.md` (append a section)
- Create (generated): `evidence/phase-2/<date>-<commit>-palette-selection/{palette-metrics.json,summary.md,manifest.sha256}`

**Interfaces:**

- Consumes: Task 1's `deltaE`, `Rgb`, `Vision`, `VISIONS`.
- Produces:
  - `palette-metrics.ts`: `METRIC_NAMES` (readonly tuple of the eight metric names), `type MetricName`, `interface PaletteSpec { escaped: Readonly<Record<SemanticView, readonly Rgb[]>>; unresolvedCells: readonly [Rgb, Rgb]; multiplierStripePairs: readonly (readonly [Rgb, Rgb])[]; periodClasses: readonly Rgb[] }`, `interface MetricResult { name; byVision; min }`, `ESCAPE_BAND_SAMPLES = 64`, `MULTIPLIER_ANGLE_STEPS = 72`, `MULTIPLIER_MAGNITUDE_STEPS = 20`, `measurePalette(spec): readonly MetricResult[]`, `metricByName(results, name): MetricResult`, `phase1Hsl`, `phase1PeriodColor(period): Rgb`, `phase1PaletteSpec(periodClasses?): PaletteSpec`, `hexToRgb(hex): Rgb`.
  - `palette-floors.ts`: `PHASE1_FLOORS` and `PALETTE_FLOORS` (both `Readonly<Record<MetricName, number>>`; equal except `'period-classes-pairwise'`: 5 and 11), `LABEL_CONTRAST_FLOOR = 4.5`, `ISOLATION_CONTRAST_FLOOR = 3` (used from Task 9).
  - `palette-candidates.ts`: `interface PeriodPaletteCandidate`, `PERIOD_PALETTE_CANDIDATES`, `SELECTED_PERIOD_PALETTE_ID = 'okabe-ito'`, `candidateClasses(candidate): readonly Rgb[]`.
  - `npm run evidence:palette -- <dir>` writes `palette-metrics.json` and `summary.md` into `<dir>`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/palette/palette-selection.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  candidateClasses,
  PERIOD_PALETTE_CANDIDATES,
  SELECTED_PERIOD_PALETTE_ID,
  type PeriodPaletteCandidate,
} from './palette-candidates';
import { PALETTE_FLOORS, PHASE1_FLOORS } from './palette-floors';
import {
  measurePalette,
  METRIC_NAMES,
  metricByName,
  phase1PaletteSpec,
  type MetricName,
  type MetricResult,
} from './palette-metrics';

const failures = (
  results: readonly MetricResult[],
  floors: Readonly<Record<MetricName, number>> = PALETTE_FLOORS,
): string[] =>
  results
    .filter((result) => result.min < floors[result.name])
    .map((result) => `${result.name}: ${result.min.toFixed(2)} < ${floors[result.name]}`);

const candidate = (id: string): PeriodPaletteCandidate => {
  const found = PERIOD_PALETTE_CANDIDATES.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`candidate ${id} missing`);
  return found;
};

describe('palette floors', () => {
  const phase1 = measurePalette(phase1PaletteSpec());

  it('start from the Phase 1 minima rounded down', () => {
    for (const name of METRIC_NAMES) {
      expect(PHASE1_FLOORS[name], name).toBe(Math.floor(metricByName(phase1, name).min));
    }
  });

  it('are met by the Phase 1 palette at the Phase 1 floors', () => {
    expect(failures(phase1, PHASE1_FLOORS)).toEqual([]);
  });

  it('never fall below Phase 1, and only the accepted period-colour floor is raised', () => {
    const raised = METRIC_NAMES.filter((name) => PALETTE_FLOORS[name] !== PHASE1_FLOORS[name]);
    expect(raised).toEqual(['period-classes-pairwise']);
    expect(PALETTE_FLOORS['period-classes-pairwise']).toBe(11);
    for (const name of METRIC_NAMES) {
      expect(PALETTE_FLOORS[name]).toBeGreaterThanOrEqual(PHASE1_FLOORS[name]);
    }
  });
});

describe('period palette selection', () => {
  it('the selected palette clears every floor', () => {
    const selected = candidate(SELECTED_PERIOD_PALETTE_ID);
    expect(failures(measurePalette(phase1PaletteSpec(candidateClasses(selected))))).toEqual([]);
  });

  it('the selected palette at least doubles the Phase 1 pairwise separation', () => {
    const phase1 = metricByName(measurePalette(phase1PaletteSpec()), 'period-classes-pairwise');
    const selected = metricByName(
      measurePalette(phase1PaletteSpec(candidateClasses(candidate(SELECTED_PERIOD_PALETTE_ID)))),
      'period-classes-pairwise',
    );
    expect(selected.min).toBeGreaterThanOrEqual(2 * phase1.min);
  });

  it('Tol bright is rejected by the escaped and unresolved floors', () => {
    const rejected = failures(
      measurePalette(phase1PaletteSpec(candidateClasses(candidate('tol-bright')))),
    );
    expect(rejected.some((line) => line.startsWith('period-classes-vs-'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/palette/palette-selection.test.ts`
Expected: FAIL; `./palette-candidates` cannot be resolved.

- [ ] **Step 3: Write the metrics module**

Create `tests/unit/palette/palette-metrics.ts`:

```ts
/**
 * Palette acceptance metrics (owner decision Q5, MI-UX-021). Each metric is
 * the minimum CIEDE2000 difference between two sets of raster colours, taken
 * over normal vision and simulated protan, deutan and tritan vision
 * (color-science.ts). Floors come from the Phase 1 palette, whose CVD matrix
 * passed reviewer sign-off (evidence/phase-1/cvd-4fd4fdd-2026-08-29.md).
 */
import type { SemanticView } from '../../../src/domain';
import { deltaE, type Rgb, type Vision, VISIONS } from './color-science';

export const METRIC_NAMES = [
  'escaped-vs-unresolved/stability',
  'escaped-vs-unresolved/multiplier',
  'escaped-vs-unresolved/period',
  'unresolved-checker',
  'multiplier-stripes',
  'period-classes-pairwise',
  'period-classes-vs-unresolved',
  'period-classes-vs-escaped',
] as const;

export type MetricName = (typeof METRIC_NAMES)[number];

/** The raster colours a palette can produce, sampled. */
export interface PaletteSpec {
  /** Escaped colours per view over the full band cycle. */
  readonly escaped: Readonly<Record<SemanticView, readonly Rgb[]>>;
  /** The two cells of the unresolved checker texture. */
  readonly unresolvedCells: readonly [Rgb, Rgb];
  /** Multiplier-view colour pairs: light and dark stripe of one sample. */
  readonly multiplierStripePairs: readonly (readonly [Rgb, Rgb])[];
  /** Period-view interior classes (emphasized colours plus the neutral, or Phase 1 p1–p5). */
  readonly periodClasses: readonly Rgb[];
}

export interface MetricResult {
  readonly name: MetricName;
  readonly byVision: Readonly<Record<Vision, number>>;
  readonly min: number;
}

export const ESCAPE_BAND_SAMPLES = 64;
export const MULTIPLIER_ANGLE_STEPS = 72;
export const MULTIPLIER_MAGNITUDE_STEPS = 20;

const minBetween = (first: readonly Rgb[], second: readonly Rgb[], vision: Vision): number => {
  let minimum = Number.POSITIVE_INFINITY;
  for (const a of first) {
    for (const b of second) minimum = Math.min(minimum, deltaE(a, b, vision));
  }
  return minimum;
};

const minPairwise = (colors: readonly Rgb[], vision: Vision): number => {
  let minimum = Number.POSITIVE_INFINITY;
  colors.forEach((a, index) => {
    for (const b of colors.slice(index + 1)) minimum = Math.min(minimum, deltaE(a, b, vision));
  });
  return minimum;
};

const minOfPairs = (pairs: readonly (readonly [Rgb, Rgb])[], vision: Vision): number =>
  pairs.reduce((minimum, [a, b]) => Math.min(minimum, deltaE(a, b, vision)), Infinity);

const metricFunctions = (
  spec: PaletteSpec,
): Readonly<Record<MetricName, (vision: Vision) => number>> => {
  const cells: readonly Rgb[] = spec.unresolvedCells;
  return {
    'escaped-vs-unresolved/stability': (v) => minBetween(spec.escaped.stability, cells, v),
    'escaped-vs-unresolved/multiplier': (v) => minBetween(spec.escaped.multiplier, cells, v),
    'escaped-vs-unresolved/period': (v) => minBetween(spec.escaped.period, cells, v),
    'unresolved-checker': (v) => deltaE(spec.unresolvedCells[0], spec.unresolvedCells[1], v),
    'multiplier-stripes': (v) => minOfPairs(spec.multiplierStripePairs, v),
    'period-classes-pairwise': (v) => minPairwise(spec.periodClasses, v),
    'period-classes-vs-unresolved': (v) => minBetween(spec.periodClasses, cells, v),
    'period-classes-vs-escaped': (v) => minBetween(spec.periodClasses, spec.escaped.period, v),
  };
};

export const measurePalette = (spec: PaletteSpec): readonly MetricResult[] => {
  const functions = metricFunctions(spec);
  return METRIC_NAMES.map((name) => {
    const byVision = Object.fromEntries(
      VISIONS.map((vision) => [vision, functions[name](vision)]),
    ) as Record<Vision, number>;
    return { name, byVision, min: Math.min(...VISIONS.map((vision) => byVision[vision])) };
  });
};

export const metricByName = (results: readonly MetricResult[], name: MetricName): MetricResult => {
  const result = results.find((entry) => entry.name === name);
  if (result === undefined) throw new Error(`metric ${name} missing`);
  return result;
};

// --- Phase 1 palette, frozen (src/domain/semantic.ts at 4fd4fdd) -----------

const clampByte = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));

/** hslToRgba of the Phase 1 semantic.ts, without alpha. */
export const phase1Hsl = (hue: number, saturation: number, lightness: number): Rgb => {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const sector = (((hue % 360) + 360) % 360) / 60;
  const x = chroma * (1 - Math.abs((sector % 2) - 1));
  const [r, g, b] =
    sector < 1
      ? [chroma, x, 0]
      : sector < 2
        ? [x, chroma, 0]
        : sector < 3
          ? [0, chroma, x]
          : sector < 4
            ? [0, x, chroma]
            : sector < 5
              ? [x, 0, chroma]
              : [chroma, 0, x];
  const offset = lightness - chroma / 2;
  return [
    clampByte((r + offset) * 255),
    clampByte((g + offset) * 255),
    clampByte((b + offset) * 255),
  ];
};

const phase1Escaped = (band: number, view: SemanticView): Rgb => {
  if (view === 'stability') {
    const value = clampByte(18 + 42 * band);
    return [value, value, value];
  }
  return phase1Hsl(210 + 35 * band, 0.55, 0.12 + 0.16 * band);
};

const bands = (): readonly number[] =>
  Array.from({ length: ESCAPE_BAND_SAMPLES }, (_, index) => index / ESCAPE_BAND_SAMPLES);

const shift = (color: Rgb, offset: number): Rgb => [
  clampByte(color[0] + offset),
  clampByte(color[1] + offset),
  clampByte(color[2] + offset),
];

const phase1StripePairs = (): readonly (readonly [Rgb, Rgb])[] => {
  const pairs: (readonly [Rgb, Rgb])[] = [];
  for (let step = 0; step < MULTIPLIER_ANGLE_STEPS; step += 1) {
    const hue = (step * 360) / MULTIPLIER_ANGLE_STEPS;
    for (let m = 0; m <= MULTIPLIER_MAGNITUDE_STEPS; m += 1) {
      const magnitude = m / MULTIPLIER_MAGNITUDE_STEPS;
      const base = phase1Hsl(hue, 0.72, 0.3 + 0.35 * (1 - magnitude));
      pairs.push([shift(base, 22), shift(base, -22)]);
    }
  }
  return pairs;
};

/** Phase 1 period view: golden-angle hue per period; p1–p5 are the common classes. */
export const phase1PeriodColor = (period: number): Rgb =>
  phase1Hsl((period * 137.508) % 360, 0.72, 0.54);

/** The Phase 1 palette with a replaceable set of period-view classes. */
export const phase1PaletteSpec = (
  periodClasses: readonly Rgb[] = [1, 2, 3, 4, 5].map(phase1PeriodColor),
): PaletteSpec => ({
  escaped: {
    stability: bands().map((band) => phase1Escaped(band, 'stability')),
    multiplier: bands().map((band) => phase1Escaped(band, 'multiplier')),
    period: bands().map((band) => phase1Escaped(band, 'period')),
  },
  unresolvedCells: [
    [84, 84, 84],
    [108, 108, 108],
  ],
  multiplierStripePairs: phase1StripePairs(),
  periodClasses,
});

/** Parses '#rrggbb'. */
export const hexToRgb = (hex: string): Rgb => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
];
```

- [ ] **Step 4: Write the floors and the candidates**

Create `tests/unit/palette/palette-floors.ts`:

```ts
import type { MetricName } from './palette-metrics';

/**
 * The Phase 1 palette's measured minimum CIEDE2000 differences under normal,
 * protan, deutan and tritan vision, rounded down to an integer. That palette
 * passed the reviewed Phase 1 CVD matrix
 * (evidence/phase-1/cvd-4fd4fdd-2026-08-29.md), so these are the floors
 * owner decision Q5 starts from; palette-selection.test.ts recomputes them.
 *
 * The stability ramp and the multiplier hues are not measured against the
 * escaped and unresolved colours: they overlap them by design, and the
 * unresolved checker texture and the multiplier stripes are the cues that
 * separate them (gated as `unresolved-checker` and `multiplier-stripes`).
 */
export const PHASE1_FLOORS: Readonly<Record<MetricName, number>> = {
  'escaped-vs-unresolved/stability': 8,
  'escaped-vs-unresolved/multiplier': 18,
  'escaped-vs-unresolved/period': 18,
  'unresolved-checker': 8,
  'multiplier-stripes': 9,
  'period-classes-pairwise': 5,
  'period-classes-vs-unresolved': 11,
  'period-classes-vs-escaped': 18,
};

/**
 * The floors the shipped palette must meet: the Phase 1 floors, with the
 * period-colour floor raised to 11 once the owner accepted the Okabe–Ito
 * palette (2026-10-17), which reaches 11.98.
 */
export const PALETTE_FLOORS: Readonly<Record<MetricName, number>> = {
  ...PHASE1_FLOORS,
  'period-classes-pairwise': 11,
};

/** WCAG 2.2 SC 1.4.3 (AA) minimum for text drawn over the raster. */
export const LABEL_CONTRAST_FLOOR = 4.5;

/**
 * WCAG 2.2 SC 1.4.11 (non-text contrast) minimum between an isolated period's
 * pixels and every dimmed pixel around them (MI-UX-018).
 */
export const ISOLATION_CONTRAST_FLOOR = 3;
```

Create `tests/unit/palette/palette-candidates.ts`:

```ts
import { hexToRgb } from './palette-metrics';
import type { Rgb } from './color-science';

export interface PeriodPaletteCandidate {
  readonly id: string;
  readonly source: string;
  /** Five colours in the order assigned to ascending emphasized periods. */
  readonly emphasized: readonly string[];
  /** The neutral "other periods" colour. */
  readonly other: string;
}

/**
 * Five-colour period palettes evaluated against PALETTE_FLOORS. Each is the
 * best five-colour subset of its source by minimum pairwise CIEDE2000 under
 * the four visions; Tol bright has no subset that clears the escaped and
 * unresolved floors, so its first five colours stand in for it.
 */
export const PERIOD_PALETTE_CANDIDATES: readonly PeriodPaletteCandidate[] = [
  {
    id: 'okabe-ito',
    source: 'Okabe and Ito (2008): yellow, sky blue, reddish purple, vermillion, blue',
    emphasized: ['#F0E442', '#56B4E9', '#CC79A7', '#D55E00', '#0072B2'],
    other: '#BBBBBB',
  },
  {
    id: 'tol-muted',
    source: 'Paul Tol muted: cyan, teal, green, olive, sand',
    emphasized: ['#88CCEE', '#44AA99', '#117733', '#999933', '#DDCC77'],
    other: '#DDDDDD',
  },
  {
    id: 'tol-bright',
    source: 'Paul Tol bright: blue, cyan, green, yellow, red',
    emphasized: ['#4477AA', '#66CCEE', '#228833', '#CCBB44', '#EE6677'],
    other: '#BBBBBB',
  },
];

export const SELECTED_PERIOD_PALETTE_ID = 'okabe-ito';

export const candidateClasses = (candidate: PeriodPaletteCandidate): readonly Rgb[] => [
  ...candidate.emphasized.map(hexToRgb),
  hexToRgb(candidate.other),
];
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/unit/palette`
Expected: PASS; both files pass with no failed tests.

- [ ] **Step 6: Write the evidence tool and wire it**

Create `tools/palette_metrics.ts`:

```ts
/**
 * Palette metric record (owner decision Q5, MI-UX-021): CIEDE2000 minima under
 * normal and simulated protan, deutan and tritan vision for the Phase 1
 * palette, each period-palette candidate and, once it ships, the production
 * palette. Writes palette-metrics.json and summary.md into the directory
 * given; format both with Prettier and emit manifest.sha256 afterwards.
 * Usage: npm run evidence:palette -- <output directory>
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { VISIONS, type Rgb } from '../tests/unit/palette/color-science';
import {
  candidateClasses,
  PERIOD_PALETTE_CANDIDATES,
  SELECTED_PERIOD_PALETTE_ID,
} from '../tests/unit/palette/palette-candidates';
import { PALETTE_FLOORS, PHASE1_FLOORS } from '../tests/unit/palette/palette-floors';
import {
  ESCAPE_BAND_SAMPLES,
  measurePalette,
  METRIC_NAMES,
  MULTIPLIER_ANGLE_STEPS,
  MULTIPLIER_MAGNITUDE_STEPS,
  phase1PaletteSpec,
  type PaletteSpec,
} from '../tests/unit/palette/palette-metrics';

interface PaletteEntry {
  readonly id: string;
  readonly description: string;
  readonly spec: PaletteSpec;
}

const hex = (rgb: Rgb): string =>
  `#${rgb.map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`.toUpperCase();

const palettes = (): readonly PaletteEntry[] => [
  {
    id: 'phase-1',
    description: 'Phase 1 palette (4fd4fdd); period classes are the golden-angle hues of p1–p5',
    spec: phase1PaletteSpec(),
  },
  ...PERIOD_PALETTE_CANDIDATES.map((candidate) => ({
    id: `candidate/${candidate.id}`,
    description: `${candidate.source}; other periods ${candidate.other}${
      candidate.id === SELECTED_PERIOD_PALETTE_ID ? ' (selected)' : ''
    }`,
    spec: phase1PaletteSpec(candidateClasses(candidate)),
  })),
];

const record = (commit: string) => ({
  schemaVersion: 1,
  method: {
    difference: 'CIEDE2000 (Sharma, Wu and Dalal 2005), kL = kC = kH = 1, sRGB D65',
    simulation:
      'Machado, Oliveira and Fernandes (2009), severity 1.0, applied to linear sRGB and clamped',
    visions: VISIONS,
    sampling: {
      escapeBands: ESCAPE_BAND_SAMPLES,
      multiplierAngles: MULTIPLIER_ANGLE_STEPS,
      multiplierMagnitudes: MULTIPLIER_MAGNITUDE_STEPS + 1,
    },
    helper: 'tests/unit/palette/color-science.ts',
  },
  environment: { node: process.version, commit },
  phase1Floors: PHASE1_FLOORS,
  floors: PALETTE_FLOORS,
  palettes: palettes().map((palette) => ({
    id: palette.id,
    description: palette.description,
    periodClasses: palette.spec.periodClasses.map(hex),
    metrics: measurePalette(palette.spec).map((result) => ({
      name: result.name,
      byVision: Object.fromEntries(
        VISIONS.map((vision) => [vision, Number(result.byVision[vision].toFixed(2))]),
      ),
      min: Number(result.min.toFixed(2)),
      floor: PALETTE_FLOORS[result.name],
      pass: result.min >= PALETTE_FLOORS[result.name],
    })),
  })),
});

type PaletteRecord = ReturnType<typeof record>;

const summary = (data: PaletteRecord): string => {
  const header = `| Metric | Phase 1 floor | Floor | ${data.palettes.map((palette) => `\`${palette.id}\``).join(' | ')} |`;
  const rule = `| --- | --- | --- | ${data.palettes.map(() => '---').join(' | ')} |`;
  const rows = METRIC_NAMES.map((name) => {
    const cells = data.palettes.map((palette) => {
      const metric = palette.metrics.find((entry) => entry.name === name);
      return metric === undefined ? '—' : `${metric.min.toFixed(2)}${metric.pass ? '' : ' ✗'}`;
    });
    return `| \`${name}\` | ${PHASE1_FLOORS[name]} | ${PALETTE_FLOORS[name]} | ${cells.join(' | ')} |`;
  });
  const classes = data.palettes.map(
    (palette) =>
      `- \`${palette.id}\`: ${palette.description}. Classes ${palette.periodClasses.join(', ')}.`,
  );
  return [
    `# Palette metrics — \`${data.environment.commit}\``,
    '',
    `Generated by \`npm run evidence:palette\` (Node ${data.environment.node}).`,
    `Colour difference: ${data.method.difference}. Simulation: ${data.method.simulation}.`,
    'Each cell is the minimum over normal, protan, deutan and tritan vision;',
    '✗ marks a value below its floor. Per-vision values are in `palette-metrics.json`.',
    '',
    header,
    rule,
    ...rows,
    '',
    '## Palettes',
    '',
    ...classes,
    '',
  ].join('\n');
};

const main = (): void => {
  const outputArg = process.argv[2];
  if (outputArg === undefined) {
    process.stderr.write('usage: npm run evidence:palette -- <output directory>\n');
    process.exit(2);
  }
  // Resolved from the repo root (npm runs scripts there).
  const directory = path.resolve(process.cwd(), outputArg);
  const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  const data = record(commit);
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, 'palette-metrics.json'), `${JSON.stringify(data, null, 2)}\n`);
  writeFileSync(path.join(directory, 'summary.md'), summary(data));
  process.stdout.write(`${summary(data)}\nwrote ${directory}\n`);
};

main();
```

In `package.json`, add this script directly after the `"fixtures:kernel-golden"` line (keep the existing lines unchanged):

```json
    "evidence:palette": "vite build --ssr tools/palette_metrics.ts --outDir .evidence-build/palette --emptyOutDir --logLevel warn && node .evidence-build/palette/palette_metrics.js",
```

In `tsconfig.node.json`, replace

```json
    "tools/generate_kernel_golden.ts"
```

with

```json
    "tools/generate_kernel_golden.ts",
    "tools/palette_metrics.ts"
```

Append this section to the end of `evidence/phase-2/README.md`:

```md

## Palette acceptance (`MI-UX-021`)

Palette evidence is computed, not measured in a browser.
`npm run evidence:palette -- <directory>` (`tools/palette_metrics.ts`) writes:

- `palette-metrics.json`: the method (CIEDE2000; Machado, Oliveira and
  Fernandes 2009 simulation at severity 1.0; the sampling grid), the floors
  (`tests/unit/palette/palette-floors.ts`), and for each palette every
  metric's value under normal, protan, deutan and tritan vision with its
  minimum and pass flag; once the palette ships, also the worst contrast of
  each text overlay over the raster and of an isolated period against the
  dimmed field around it.
- `summary.md`: the same as tables.

Directories are named `<date>-<commit>-palette-selection` (the candidate
comparison that chose the period palette) and `<date>-<commit>-palette` (the
shipped palette, with a browser record of the axe and end-to-end run). Format
both files with `npx prettier --write <directory>`, then emit
`manifest.sha256` with `node tools/benchmark/manifest.mjs <directory>`. No
screenshots are committed: the numeric matrix replaces the Phase 1 screenshot
matrix (tier 1 above), and browser screenshots are advisory (owner decision
Q6).
```

- [ ] **Step 7: Check the tool runs**

Run: `npm run evidence:palette -- .evidence-build/palette-dry-run`
Expected: a Markdown table on stdout whose header and `period-classes-*` rows read:

```
| Metric | Phase 1 floor | Floor | `phase-1` | `candidate/okabe-ito` | `candidate/tol-muted` | `candidate/tol-bright` |
| `period-classes-pairwise` | 5 | 11 | 5.56 ✗ | 11.98 | 12.29 | 8.66 ✗ |
| `period-classes-vs-unresolved` | 11 | 11 | 11.16 | 17.57 | 15.82 | 9.84 ✗ |
| `period-classes-vs-escaped` | 18 | 18 | 18.91 | 20.72 | 24.58 | 23.13 |
```

(The Phase 1 palette fails the raised period-colour floor by design: the record shows why the period view needed a new palette.)

and a last line `wrote …/.evidence-build/palette-dry-run` (`.evidence-build/` is git-ignored).

- [ ] **Step 8: Format, check and commit the code**

```bash
npx prettier --write tests/unit/palette tools/palette_metrics.ts package.json tsconfig.node.json evidence/phase-2/README.md
npm run check
npm run fixtures:kernel-golden -- --check
npx playwright test
git add tests/unit/palette/palette-metrics.ts tests/unit/palette/palette-floors.ts tests/unit/palette/palette-candidates.ts tests/unit/palette/palette-selection.test.ts tools/palette_metrics.ts package.json tsconfig.node.json evidence/phase-2/README.md
git commit -F - <<'EOF'
Palette: floors from the Phase 1 CVD matrix (period colours raised to 11); choose Okabe–Ito

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
EOF
```

- [ ] **Step 9: Record and commit the selection evidence**

```bash
DIR="evidence/phase-2/$(date +%F)-$(git rev-parse --short HEAD)-palette-selection"
npm run evidence:palette -- "$DIR"
npx prettier --write "$DIR"
node tools/benchmark/manifest.mjs "$DIR"
node tools/benchmark/manifest.mjs --check "$DIR"
npx prettier --check "$DIR"
git add "$DIR"
git commit -F - <<'EOF'
Evidence: period palette selection record (Phase 1 baseline, floors, candidates)

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
EOF
```

Expected: `manifest.mjs --check` prints `…: 2 files verified`; Prettier reports all files formatted.

---

### Task 3: The period emphasis key

**Files:**

- Create: `src/domain/period-emphasis.ts`
- Modify: `src/domain/index.ts`
- Test: `tests/unit/domain/period-emphasis.test.ts`

**Interfaces:**

- Consumes: `Rgba` from `src/domain/semantic.ts` (type only).
- Produces (exported from `src/domain`):
  - `PERIOD_EMPHASIS_LIMIT = 5`
  - `PERIOD_EMPHASIS_PALETTE: readonly Rgba[]` (`[240,228,66,255]`, `[86,180,233,255]`, `[204,121,167,255]`, `[213,94,0,255]`, `[0,114,178,255]`)
  - `OTHER_PERIODS_COLOR: Rgba` (`[187,187,187,255]`)
  - `interface PeriodKeyEntry { readonly period: number; readonly color: Rgba; readonly pixelCount: number }`
  - `interface PeriodKey { readonly emphasized: readonly PeriodKeyEntry[]; readonly otherPeriodCount: number; readonly otherPixelCount: number; readonly attractingPixelCount: number }`
  - `EMPTY_PERIOD_KEY: PeriodKey`
  - `buildPeriodKey(histogram: ReadonlyMap<number, number>): PeriodKey`
  - `colorForPeriod(period: number, key: PeriodKey): Rgba`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/domain/period-emphasis.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  buildPeriodKey,
  colorForPeriod,
  EMPTY_PERIOD_KEY,
  OTHER_PERIODS_COLOR,
  PERIOD_EMPHASIS_LIMIT,
  PERIOD_EMPHASIS_PALETTE,
} from '../../../src/domain';
import { PACK_PERIOD_MAX } from '../../../src/render/packed-semantic';

const histogram = (entries: readonly (readonly [number, number])[]): Map<number, number> =>
  new Map(entries);

describe('period emphasis key', () => {
  it('emphasizes at most five periods, chosen by area and coloured in ascending period order', () => {
    const key = buildPeriodKey(
      histogram([
        [1, 9000],
        [2, 4000],
        [3, 50],
        [4, 300],
        [5, 7],
        [8, 120],
        [16, 60],
      ]),
    );

    expect(PERIOD_EMPHASIS_LIMIT).toBe(5);
    expect(key.emphasized.map((entry) => entry.period)).toEqual([1, 2, 4, 8, 16]);
    expect(key.emphasized.map((entry) => entry.color)).toEqual(PERIOD_EMPHASIS_PALETTE);
    expect(key.emphasized.map((entry) => entry.pixelCount)).toEqual([9000, 4000, 300, 120, 60]);
    expect(key.otherPeriodCount).toBe(2);
    expect(key.otherPixelCount).toBe(57);
    expect(key.attractingPixelCount).toBe(13537);
    expect(colorForPeriod(3, key)).toEqual(OTHER_PERIODS_COLOR);
    expect(colorForPeriod(16, key)).toEqual(PERIOD_EMPHASIS_PALETTE[4]);
  });

  it('gives the same colours to the same emphasized set whatever its area order', () => {
    const first = buildPeriodKey(
      histogram([
        [1, 10],
        [2, 20],
        [3, 30],
        [4, 40],
        [5, 50],
      ]),
    );
    const second = buildPeriodKey(
      histogram([
        [5, 10],
        [4, 20],
        [3, 30],
        [2, 40],
        [1, 50],
      ]),
    );

    expect(first.emphasized.map((entry) => [entry.period, entry.color])).toEqual(
      second.emphasized.map((entry) => [entry.period, entry.color]),
    );
  });

  it('breaks area ties toward the lower period, independent of insertion order', () => {
    const tied: (readonly [number, number])[] = [7, 6, 5, 4, 3, 2].map((period) => [period, 100]);
    const forward = buildPeriodKey(histogram(tied));
    const reverse = buildPeriodKey(histogram([...tied].reverse()));

    expect(forward.emphasized.map((entry) => entry.period)).toEqual([2, 3, 4, 5, 6]);
    expect(reverse).toEqual(forward);
    expect(forward.otherPeriodCount).toBe(1);
    expect(colorForPeriod(7, forward)).toEqual(OTHER_PERIODS_COLOR);
  });

  it('describes a frame with no attracting-cycle pixels as an empty key', () => {
    expect(buildPeriodKey(new Map())).toEqual(EMPTY_PERIOD_KEY);
    expect(buildPeriodKey(histogram([[3, 0]]))).toEqual(EMPTY_PERIOD_KEY);
    expect(colorForPeriod(1, EMPTY_PERIOD_KEY)).toEqual(OTHER_PERIODS_COLOR);
  });

  it('gives a frame with exactly one period the first palette colour and no other periods', () => {
    const key = buildPeriodKey(histogram([[3, 42]]));

    expect(key).toEqual({
      emphasized: [{ period: 3, color: PERIOD_EMPHASIS_PALETTE[0], pixelCount: 42 }],
      otherPeriodCount: 0,
      otherPixelCount: 0,
      attractingPixelCount: 42,
    });
  });

  it('ranks a period above any classifier ceiling like any other period', () => {
    const key = buildPeriodKey(
      histogram([
        [1, 5],
        [PACK_PERIOD_MAX, 9],
      ]),
    );

    expect(key.emphasized.map((entry) => entry.period)).toEqual([1, PACK_PERIOD_MAX]);
    expect(colorForPeriod(PACK_PERIOD_MAX, key)).toEqual(PERIOD_EMPHASIS_PALETTE[1]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/domain/period-emphasis.test.ts`
Expected: FAIL; `buildPeriodKey` is not exported by `src/domain` (`buildPeriodKey is not a function`).

- [ ] **Step 3: Write the module and export it**

Create `src/domain/period-emphasis.ts`:

```ts
import type { Rgba } from './semantic';

/**
 * Period-view emphasis (PLAN §8, owner decision Q1, MI-UX-018). The period
 * view colours at most PERIOD_EMPHASIS_LIMIT periods: those covering the most
 * pixels of the frame being colorized. They take PERIOD_EMPHASIS_PALETTE in
 * ascending period order, so a period's colour can change between views, and
 * every other period is OTHER_PERIODS_COLOR. The key is a pure function of
 * the frame's period histogram, so a recolor of a cached frame reproduces it
 * and no semantic field is added (the semantic algorithm version is
 * unchanged).
 */

export const PERIOD_EMPHASIS_LIMIT = 5;

/**
 * Okabe and Ito (2008) yellow, sky blue, reddish purple, vermillion and blue,
 * in the order assigned to ascending emphasized periods. Selected against
 * the palette floors in tests/unit/palette (palette-selection.test.ts).
 */
export const PERIOD_EMPHASIS_PALETTE: readonly Rgba[] = [
  [240, 228, 66, 255],
  [86, 180, 233, 255],
  [204, 121, 167, 255],
  [213, 94, 0, 255],
  [0, 114, 178, 255],
];

/** The single neutral for every period that is not emphasized (Paul Tol's grey). */
export const OTHER_PERIODS_COLOR: Rgba = [187, 187, 187, 255];

export interface PeriodKeyEntry {
  readonly period: number;
  readonly color: Rgba;
  /** Attracting-cycle pixels of this period in the frame. */
  readonly pixelCount: number;
}

/** The period-to-colour mapping a period-view raster was drawn with. */
export interface PeriodKey {
  /** Emphasized periods in ascending order, each with its palette colour. */
  readonly emphasized: readonly PeriodKeyEntry[];
  /** Distinct periods drawn in OTHER_PERIODS_COLOR. */
  readonly otherPeriodCount: number;
  /** Pixels drawn in OTHER_PERIODS_COLOR. */
  readonly otherPixelCount: number;
  /** Every attracting-cycle pixel of the frame. */
  readonly attractingPixelCount: number;
}

export const EMPTY_PERIOD_KEY: PeriodKey = Object.freeze({
  emphasized: Object.freeze([]),
  otherPeriodCount: 0,
  otherPixelCount: 0,
  attractingPixelCount: 0,
});

type HistogramEntry = readonly [period: number, pixelCount: number];

/** Most pixels first; equal areas go to the lower period. */
const byAreaThenPeriod = (a: HistogramEntry, b: HistogramEntry): number =>
  b[1] - a[1] || a[0] - b[0];

const sumPixels = (entries: readonly HistogramEntry[]): number =>
  entries.reduce((total, [, pixelCount]) => total + pixelCount, 0);

/**
 * Ranks a frame's period histogram (period -> attracting pixel count): the
 * PERIOD_EMPHASIS_LIMIT largest areas are emphasized and coloured in ascending
 * period order. Periods with a zero or negative count are ignored.
 */
export const buildPeriodKey = (histogram: ReadonlyMap<number, number>): PeriodKey => {
  const ranked = [...histogram.entries()]
    .filter(([, pixelCount]) => pixelCount > 0)
    .sort(byAreaThenPeriod);
  const chosen = ranked.slice(0, PERIOD_EMPHASIS_LIMIT).sort((a, b) => a[0] - b[0]);
  const rest = ranked.slice(PERIOD_EMPHASIS_LIMIT);
  const emphasized = chosen.map(([period, pixelCount], index): PeriodKeyEntry => ({
    period,
    color: PERIOD_EMPHASIS_PALETTE[index] ?? OTHER_PERIODS_COLOR,
    pixelCount,
  }));
  return {
    emphasized,
    otherPeriodCount: rest.length,
    otherPixelCount: sumPixels(rest),
    attractingPixelCount: sumPixels(ranked),
  };
};

/** The colour of an attracting-cycle pixel of `period` under `key`. */
export const colorForPeriod = (period: number, key: PeriodKey): Rgba =>
  key.emphasized.find((entry) => entry.period === period)?.color ?? OTHER_PERIODS_COLOR;
```

In `src/domain/index.ts`, insert this block directly above the existing `export {` that begins with `  colorForAttracting,`:

```ts
export {
  buildPeriodKey,
  colorForPeriod,
  EMPTY_PERIOD_KEY,
  OTHER_PERIODS_COLOR,
  PERIOD_EMPHASIS_LIMIT,
  PERIOD_EMPHASIS_PALETTE,
} from './period-emphasis';
export type { PeriodKey, PeriodKeyEntry } from './period-emphasis';
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/domain/period-emphasis.test.ts`
Expected: PASS; all six tests in the file pass.

- [ ] **Step 5: Format, check and commit**

```bash
npx prettier --write src/domain/period-emphasis.ts src/domain/index.ts tests/unit/domain/period-emphasis.test.ts
npm run check
npm run fixtures:kernel-golden -- --check
npx playwright test
git add src/domain/period-emphasis.ts src/domain/index.ts tests/unit/domain/period-emphasis.test.ts
git commit -F - <<'EOF'
Period view: rank at most five periods by area (period emphasis key)

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: Colorize the period view from the frame's key

The stability and multiplier bytes must not change; the parity test proves it. After this task the raster uses the new palette while the legend still shows the old CSS swatches; Task 8 replaces them.

**Files:**

- Modify: `src/domain/semantic.ts`, `src/domain/index.ts`
- Modify: `src/render/colorize.ts`, `src/render/renderer.ts`, `src/render/cpu-renderer.ts`
- Test: `tests/unit/render/colorize.test.ts` (replace), `tests/unit/domain/semantic.test.ts`, `tests/unit/render/cpu-renderer.test.ts`

**Interfaces:**

- Consumes: Task 3's `buildPeriodKey`, `colorForPeriod`, `EMPTY_PERIOD_KEY`, `OTHER_PERIODS_COLOR`, `PeriodKey`.
- Produces:
  - `src/domain` exports `ESCAPE_BAND_RATE = 0.037`, `UNRESOLVED_TEXTURE_OFFSET = 12`, `unresolvedTextureColors(): readonly [Rgba, Rgba]` (`[84,84,84,255]`, `[108,108,108,255]`).
  - `colorForAttracting(period, multiplierMagnitude, multiplierAngle, view, periodKey: PeriodKey = EMPTY_PERIOD_KEY): Rgba`; `colorForOrbit(result, view, periodKey = EMPTY_PERIOD_KEY): Rgba`.
  - `src/render/colorize.ts`: `periodHistogram(frame: SemanticFrame): Map<number, number>`; `colorizeFrame(frame, view, periodKey?: PeriodKey)` (defaults to the frame's own key in the period view).
  - `RasterFrame.periodKey?: PeriodKey` (present only when `view === 'period'`).

- [ ] **Step 1: Write the failing tests**

Replace the whole of `tests/unit/render/colorize.test.ts` with the following (the byte-parity test carries a 30 s timeout, as `kernel-golden.test.ts` does: it renders three views and compares 18 rasters, and it can pass 5 s when the suite runs in parallel on a loaded machine):

```ts
import { describe, expect, it } from 'vitest';

import {
  buildPeriodKey,
  colorForAttracting,
  colorForEscaped,
  colorForUnresolved,
  EMPTY_PERIOD_KEY,
  modulateForMultiplierAngle,
  OTHER_PERIODS_COLOR,
  PERIOD_EMPHASIS_PALETTE,
  type PeriodKey,
  type Rgba,
  type SemanticView,
} from '../../../src/domain';
import { CpuRenderer, type SemanticFrame } from '../../../src/render';
import { colorizeFrame, periodHistogram } from '../../../src/render/colorize';
import {
  PACK_PERIOD_MAX,
  packStatusPeriod,
  unpackPeriod,
  unpackStatus,
} from '../../../src/render/packed-semantic';

/**
 * Reference: the per-pixel tuple colorizer that colorizeFrame replaced
 * (CpuRenderer.colorize before the allocation-free rewrite).
 */
const referencePixel = (
  status: 0 | 1 | 2,
  period: number,
  smooth: number,
  angle: number,
  x: number,
  y: number,
  stride: number,
  view: SemanticView,
  periodKey: PeriodKey,
): Rgba => {
  if (status === 1) return colorForEscaped(smooth, view);
  if (status === 2) {
    const color = colorForAttracting(period, smooth, angle, view, periodKey);
    return view === 'multiplier' ? modulateForMultiplierAngle(color, x, y, angle) : color;
  }
  const color = colorForUnresolved();
  const cellSize = stride === 1 ? 4 : stride;
  const offset = (Math.floor(x / cellSize) + Math.floor(y / cellSize)) % 2 === 0 ? -12 : 12;
  return [color[0] + offset, color[1] + offset, color[2] + offset, color[3]];
};

/** Reference histogram: one map update per attracting pixel. */
const referenceHistogram = (frame: SemanticFrame): Map<number, number> => {
  const counts = new Map<number, number>();
  for (const band of frame.bands) {
    for (const word of band.packedStatusPeriod) {
      if (unpackStatus(word) !== 2) continue;
      const period = unpackPeriod(word);
      counts.set(period, (counts.get(period) ?? 0) + 1);
    }
  }
  return counts;
};

const referenceColorize = (frame: SemanticFrame, view: SemanticView): Uint8ClampedArray => {
  const { width } = frame.size;
  const rgba = new Uint8ClampedArray(width * frame.size.height * 4);
  const periodKey =
    view === 'period' ? buildPeriodKey(referenceHistogram(frame)) : EMPTY_PERIOD_KEY;
  for (const band of frame.bands) {
    for (let index = 0; index < band.packedStatusPeriod.length; index += 1) {
      const word = band.packedStatusPeriod[index] ?? 0;
      const x = index % width;
      const y = band.y0 + Math.floor(index / width);
      const color = referencePixel(
        unpackStatus(word),
        unpackPeriod(word),
        band.smoothIterationOrMultiplierMagnitude[index] ?? 0,
        band.multiplierAngle[index] ?? 0,
        x,
        y,
        frame.sampleStride,
        view,
        periodKey,
      );
      rgba.set(color, (y * width + x) * 4);
    }
  }
  return rgba;
};

describe('colorizeFrame', () => {
  it('reproduces the per-pixel tuple colorizer byte for byte', async () => {
    const renderer = new CpuRenderer();
    const views: readonly SemanticView[] = ['stability', 'multiplier', 'period'];
    const requests = [
      { center: { re: -0.75, im: 0 }, spanY: 2.5 },
      { center: { re: -0.1225611668766535, im: 0.7448617666197435 }, spanY: 0.3 },
      { center: { re: -1.401155189092, im: 0 }, spanY: 0.001 },
    ];
    let compared = 0;
    for (const viewport of requests) {
      const frames: SemanticFrame[] = [];
      await renderer.render(
        {
          viewport,
          size: { width: 97, height: 61 },
          quality: { maxIterations: 256, maxPeriod: 16, coarseStride: 8 },
        },
        new AbortController().signal,
        (frame) => {
          frames.push(frame);
        },
      );
      for (const frame of frames) {
        expect(periodHistogram(frame)).toEqual(referenceHistogram(frame));
        for (const view of views) {
          expect(colorizeFrame(frame, view)).toEqual(referenceColorize(frame, view));
          compared += 1;
        }
      }
    }
    expect(compared).toBe(18);
  }, 30_000);

  it('matches on synthetic extremes of every channel', () => {
    const width = 64;
    const height = 48;
    const length = width * height;
    const packed = new Uint32Array(length);
    const primary = new Float64Array(length);
    const angle = new Float64Array(length);
    let seed = 12345;
    const random = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const specialAngles = [0, -0, Math.PI, -Math.PI, Math.PI / 2, -Math.PI / 2, 1e-300, -1e-300];
    const specialSmooth = [0, -0, -3.5, 1e-9, 27.027027027027028, 1e6, 0.5 / 0.037, -1e5];
    for (let index = 0; index < length; index += 1) {
      const status = (index % 3) as 0 | 1 | 2;
      const period = status === 2 ? 1 + (index % 300) : 0;
      packed[index] = packStatusPeriod(status, period);
      if (status === 1) {
        primary[index] =
          index % 7 === 0
            ? (specialSmooth[(index / 7) % specialSmooth.length] ?? 0)
            : -50 + 2000 * random();
      } else if (status === 2) {
        primary[index] = index % 11 === 0 ? 0 : random();
        angle[index] =
          index % 5 === 0
            ? (specialAngles[(index / 5) % specialAngles.length] ?? 0)
            : Math.PI * (2 * random() - 1);
      }
    }
    for (const stride of [1, 8]) {
      const frame = {
        stage: 'stable',
        size: { width, height },
        sampleStride: stride,
        bands: [
          {
            y0: 0,
            y1: height,
            packedStatusPeriod: packed,
            smoothIterationOrMultiplierMagnitude: primary,
            multiplierAngle: angle,
          },
        ],
        progress: 1,
      } as unknown as SemanticFrame;
      expect(periodHistogram(frame)).toEqual(referenceHistogram(frame));
      for (const view of ['stability', 'multiplier', 'period'] as const) {
        expect(colorizeFrame(frame, view)).toEqual(referenceColorize(frame, view));
      }
    }
  });
});

/** A one-band stable frame from per-pixel [status, period] pairs. */
const syntheticFrame = (
  width: number,
  pixels: readonly (readonly [0 | 1 | 2, number])[],
): SemanticFrame => {
  const length = pixels.length;
  const packed = new Uint32Array(length);
  pixels.forEach(([status, period], index) => {
    packed[index] = packStatusPeriod(status, status === 2 ? period : 0);
  });
  return {
    stage: 'stable',
    size: { width, height: length / width },
    sampleStride: 1,
    bands: [
      {
        y0: 0,
        y1: length / width,
        packedStatusPeriod: packed,
        smoothIterationOrMultiplierMagnitude: new Float64Array(length).fill(0.5),
        multiplierAngle: new Float64Array(length),
      },
    ],
    progress: 1,
  };
};

const pixelAt = (rgba: Uint8ClampedArray, index: number): readonly number[] => [
  ...rgba.slice(index * 4, index * 4 + 4),
];

describe('period view emphasis', () => {
  it('colours the five largest periods in ascending order and every other period neutral', () => {
    // Areas: p1 6, p2 5, p3 4, p4 3, p5 2, p6 1, p7 1 pixels; then 2 escaped.
    const layout: (readonly [0 | 1 | 2, number])[] = [
      ...[1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 5, 5, 6, 7].map(
        (period) => [2, period] as const,
      ),
      [1, 0],
      [1, 0],
    ];
    const frame = syntheticFrame(4, layout);
    const raster = new CpuRenderer().colorize(frame, 'period');

    expect(raster.periodKey?.emphasized.map((entry) => entry.period)).toEqual([1, 2, 3, 4, 5]);
    expect(raster.periodKey?.otherPeriodCount).toBe(2);
    expect(pixelAt(raster.rgba, 0)).toEqual(PERIOD_EMPHASIS_PALETTE[0]);
    expect(pixelAt(raster.rgba, 6)).toEqual(PERIOD_EMPHASIS_PALETTE[1]);
    expect(pixelAt(raster.rgba, 19)).toEqual(PERIOD_EMPHASIS_PALETTE[4]);
    expect(pixelAt(raster.rgba, 20)).toEqual(OTHER_PERIODS_COLOR);
    expect(pixelAt(raster.rgba, 21)).toEqual(OTHER_PERIODS_COLOR);
  });

  it('reports no key outside the period view', () => {
    const frame = syntheticFrame(2, [
      [2, 1],
      [2, 2],
    ]);
    const renderer = new CpuRenderer();

    expect(renderer.colorize(frame, 'stability')).not.toHaveProperty('periodKey');
    expect(renderer.colorize(frame, 'multiplier')).not.toHaveProperty('periodKey');
  });

  it('reports an empty key for a frame with no attracting-cycle pixels', () => {
    const frame = syntheticFrame(2, [
      [1, 0],
      [0, 0],
    ]);

    expect(new CpuRenderer().colorize(frame, 'period').periodKey).toEqual(EMPTY_PERIOD_KEY);
  });

  it('colours a period beyond the classifier ceiling from the palette', () => {
    const frame = syntheticFrame(2, [
      [2, PACK_PERIOD_MAX],
      [2, PACK_PERIOD_MAX],
    ]);
    const raster = new CpuRenderer().colorize(frame, 'period');

    expect(raster.periodKey?.emphasized).toEqual([
      { period: PACK_PERIOD_MAX, color: PERIOD_EMPHASIS_PALETTE[0], pixelCount: 2 },
    ]);
    expect(pixelAt(raster.rgba, 1)).toEqual(PERIOD_EMPHASIS_PALETTE[0]);
  });
});
```

In `tests/unit/domain/semantic.test.ts`, replace the import block

```ts
import {
  colorForAttracting,
  colorForEscaped,
  colorForOrbit,
  modulateForMultiplierAngle,
  type OrbitResult,
  type SemanticView,
} from '../../../src/domain';
```

with

```ts
import {
  buildPeriodKey,
  colorForAttracting,
  colorForEscaped,
  colorForOrbit,
  modulateForMultiplierAngle,
  OTHER_PERIODS_COLOR,
  PERIOD_EMPHASIS_PALETTE,
  type OrbitResult,
  type SemanticView,
} from '../../../src/domain';
```

and insert this test directly above `  it('modulates multiplier-view lightness along the argument direction', () => {`:

```ts
  it('colours the period view from the period key, neutral without one', () => {
    const key = buildPeriodKey(
      new Map([
        [3, 10],
        [1, 40],
      ]),
    );

    expect(colorForOrbit(attracting, 'period', key)).toEqual(PERIOD_EMPHASIS_PALETTE[1]);
    expect(colorForAttracting(1, 0.5, 0, 'period', key)).toEqual(PERIOD_EMPHASIS_PALETTE[0]);
    expect(colorForAttracting(2, 0.5, 0, 'period', key)).toEqual(OTHER_PERIODS_COLOR);
    expect(colorForOrbit(attracting, 'period')).toEqual(OTHER_PERIODS_COLOR);
  });

```

In `tests/unit/render/cpu-renderer.test.ts`, replace

```ts
import { DEFAULT_VIEWPORT, type RenderQuality } from '../../../src/domain';
```

with

```ts
import { buildPeriodKey, DEFAULT_VIEWPORT, type RenderQuality } from '../../../src/domain';
```

replace

```ts
import { packStatusPeriod } from '../../../src/render/packed-semantic';
```

with

```ts
import { periodHistogram } from '../../../src/render/colorize';
import { packStatusPeriod, unpackPeriod, unpackStatus } from '../../../src/render/packed-semantic';
```

and insert this test directly below the line `describe('CpuRenderer', () => {`:

```ts
  it('ranks the coarse and the stable frame each from its own pixels', async () => {
    const renderer = new CpuRenderer();
    const frames: SemanticFrame[] = [];
    await renderer.render(
      // Near the Feigenbaum point the coarse budget finds no cycle while the
      // stable pass finds period 32.
      {
        viewport: { center: { re: -1.401155189092, im: 0 }, spanY: 0.001 },
        size: { width: 64, height: 40 },
        quality: STABLE_QUALITY,
      },
      new AbortController().signal,
      (frame) => {
        frames.push(frame);
      },
    );

    expect(frames.map((frame) => frame.stage)).toEqual(['coarse', 'stable']);
    const rasters = frames.map((frame) => renderer.colorize(frame, 'period'));
    rasters.forEach((raster, index) => {
      const frame = frames[index]!;
      expect(raster.periodKey).toEqual(buildPeriodKey(periodHistogram(frame)));
      // Every emphasized colour is drawn on a pixel of its own period.
      const band = frame.bands[0]!;
      for (const entry of raster.periodKey?.emphasized ?? []) {
        const pixel = band.packedStatusPeriod.findIndex(
          (word) => unpackStatus(word) === 2 && unpackPeriod(word) === entry.period,
        );
        expect([...raster.rgba.slice(pixel * 4, pixel * 4 + 4)]).toEqual(entry.color);
      }
    });
    // The two frames rank differently; each raster still matches its own key.
    const [coarseKey, stableKey] = rasters.map((raster) => raster.periodKey);
    expect(coarseKey?.emphasized.map((entry) => entry.period)).not.toEqual(
      stableKey?.emphasized.map((entry) => entry.period),
    );
  });

```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/render/colorize.test.ts tests/unit/domain/semantic.test.ts tests/unit/render/cpu-renderer.test.ts`
Expected: FAIL; `periodHistogram` is not exported by `src/render/colorize.ts`, and the semantic period test gets a golden-angle hue instead of a palette colour.

- [ ] **Step 3: Update `src/domain/semantic.ts`**

Replace the first line

```ts
import type { OrbitResult, SemanticView } from './types';
```

with

```ts
import { colorForPeriod, EMPTY_PERIOD_KEY, type PeriodKey } from './period-emphasis';
import type { OrbitResult, SemanticView } from './types';
```

Replace

```ts
const escapeBand = (smoothIteration: number): number => (((smoothIteration * 0.037) % 1) + 1) % 1;

export const colorForUnresolved = (): Rgba => [96, 96, 96, 255];
```

with

```ts
/** Escaped shading cycles once every 1 / ESCAPE_BAND_RATE smooth iterations (about 27). */
export const ESCAPE_BAND_RATE = 0.037;

const escapeBand = (smoothIteration: number): number =>
  (((smoothIteration * ESCAPE_BAND_RATE) % 1) + 1) % 1;

export const colorForUnresolved = (): Rgba => [96, 96, 96, 255];

/** The unresolved checker texture offsets the unresolved gray by this in alternate cells. */
export const UNRESOLVED_TEXTURE_OFFSET = 12;

/** The two cells of the unresolved checker texture: [darker, lighter]. */
export const unresolvedTextureColors = (): readonly [Rgba, Rgba] => {
  const [red, green, blue, alpha] = colorForUnresolved();
  const offset = UNRESOLVED_TEXTURE_OFFSET;
  return [
    [red - offset, green - offset, blue - offset, alpha],
    [red + offset, green + offset, blue + offset, alpha],
  ];
};
```

Replace

```ts
export const colorForAttracting = (
  period: number,
  multiplierMagnitude: number,
  multiplierAngle: number,
  view: SemanticView,
): Rgba => {
  switch (view) {
    case 'period':
      return hslToRgba((period * 137.508) % 360, 0.72, 0.54);
```

with

```ts
/**
 * Attracting-cycle colour. The period view colours by the frame's period key
 * (period-emphasis.ts); without one every period is the neutral "other".
 */
export const colorForAttracting = (
  period: number,
  multiplierMagnitude: number,
  multiplierAngle: number,
  view: SemanticView,
  periodKey: PeriodKey = EMPTY_PERIOD_KEY,
): Rgba => {
  switch (view) {
    case 'period':
      return colorForPeriod(period, periodKey);
```

Replace

```ts
export const colorForOrbit = (result: OrbitResult, view: SemanticView): Rgba => {
```

with

```ts
export const colorForOrbit = (
  result: OrbitResult,
  view: SemanticView,
  periodKey: PeriodKey = EMPTY_PERIOD_KEY,
): Rgba => {
```

and at the end of `colorForOrbit` replace

```ts
    result.multiplierAngle,
    view,
  );
};
```

with

```ts
    result.multiplierAngle,
    view,
    periodKey,
  );
};
```

In `src/domain/index.ts`, replace

```ts
export {
  colorForAttracting,
  colorForEscaped,
  colorForOrbit,
  colorForUnresolved,
  modulateForMultiplierAngle,
} from './semantic';
```

with

```ts
export {
  colorForAttracting,
  colorForEscaped,
  colorForOrbit,
  colorForUnresolved,
  ESCAPE_BAND_RATE,
  modulateForMultiplierAngle,
  UNRESOLVED_TEXTURE_OFFSET,
  unresolvedTextureColors,
} from './semantic';
```

- [ ] **Step 4: Update `src/render/colorize.ts`**

Replace the header (from the first line through the end of the first doc comment)

```ts
import type { SemanticView } from '../domain';
import { unpackPeriod, unpackStatus } from './packed-semantic';
import type { SemanticFrame } from './renderer';

/**
 * Allocation-free colorization of a semantic frame. Byte-for-byte the colors
 * of the per-pixel functions in src/domain/semantic.ts (colorForEscaped,
 * colorForAttracting, modulateForMultiplierAngle, colorForUnresolved) plus
 * the unresolved texture, written straight into the RGBA buffer instead of
 * through per-pixel color tuples (tests/unit/render/colorize.test.ts pins the
 * bytes). The period view's color depends on the period alone and is
 * computed once per period.
 */
```

with

```ts
import {
  buildPeriodKey,
  EMPTY_PERIOD_KEY,
  ESCAPE_BAND_RATE,
  OTHER_PERIODS_COLOR,
  unresolvedTextureColors,
  type PeriodKey,
  type Rgba,
  type SemanticView,
} from '../domain';
import { PACK_PERIOD_BITS, PACK_STATUS_CODES, unpackPeriod, unpackStatus } from './packed-semantic';
import type { SemanticFrame } from './renderer';

/**
 * Allocation-free colorization of a semantic frame. Byte-for-byte the colors
 * of the per-pixel functions in src/domain/semantic.ts (colorForEscaped,
 * colorForAttracting, modulateForMultiplierAngle, colorForUnresolved) plus
 * the unresolved texture, written straight into the RGBA buffer instead of
 * through per-pixel color tuples (tests/unit/render/colorize.test.ts pins the
 * bytes). The period view's colors come from the frame's period key
 * (src/domain/period-emphasis.ts), resolved once per frame.
 */
```

Replace

```ts
/** Period-view colors (RGBA packed in one integer), filled on first use. */
const periodColors = new Map<number, number>();
const periodScratch = new Uint8ClampedArray(4);

const periodColor = (period: number): number => {
  let packed = periodColors.get(period);
  if (packed === undefined) {
    writeHsl(periodScratch, 0, (period * 137.508) % 360, 0.72, 0.54);
    packed =
      ((periodScratch[0] ?? 0) << 16) | ((periodScratch[1] ?? 0) << 8) | (periodScratch[2] ?? 0);
    periodColors.set(period, packed);
  }
  return packed;
};
```

with

```ts
/** RGB packed in one integer (0xRRGGBB). */
const packRgb = (color: Rgba): number => (color[0] << 16) | (color[1] << 8) | color[2];

const OTHER_PERIODS_PACKED = packRgb(OTHER_PERIODS_COLOR);

/** Emphasized period -> packed color; every other period is OTHER_PERIODS_PACKED. */
const periodColorLookup = (key: PeriodKey): ReadonlyMap<number, number> =>
  new Map(key.emphasized.map((entry) => [entry.period, packRgb(entry.color)]));

/**
 * Attracting-cycle pixel count per period. Runs of equal period are counted
 * before touching the map, since periods repeat along rows.
 */
export const periodHistogram = (frame: SemanticFrame): Map<number, number> => {
  const counts = new Map<number, number>();
  const attracting = PACK_STATUS_CODES.attracting;
  let runPeriod = -1;
  let runLength = 0;
  for (const band of frame.bands) {
    for (const word of band.packedStatusPeriod) {
      const period = word >>> PACK_PERIOD_BITS === attracting ? unpackPeriod(word) : -1;
      if (period === runPeriod) {
        runLength += 1;
        continue;
      }
      if (runPeriod >= 0) counts.set(runPeriod, (counts.get(runPeriod) ?? 0) + runLength);
      runPeriod = period;
      runLength = 1;
    }
  }
  if (runPeriod >= 0) counts.set(runPeriod, (counts.get(runPeriod) ?? 0) + runLength);
  return counts;
};
```

In `writeEscaped`, replace

```ts
  const band = fractionOf(fractionOf(smoothIteration * 0.037) + 1);
```

with

```ts
  const band = fractionOf(fractionOf(smoothIteration * ESCAPE_BAND_RATE) + 1);
```

In `writeAttracting`, replace

```ts
  x: number,
  y: number,
  view: SemanticView,
): void => {
  if (view === 'period') {
    const packed = periodColor(period);
```

with

```ts
  x: number,
  y: number,
  view: SemanticView,
  periodColors: ReadonlyMap<number, number>,
): void => {
  if (view === 'period') {
    const packed = periodColors.get(period) ?? OTHER_PERIODS_PACKED;
```

Replace

```ts
/** Unresolved gray (96) with the checker texture of cell 4 (stable) or the stride. */
const writeUnresolved = (
  rgba: Uint8ClampedArray,
  offset: number,
  x: number,
  y: number,
  stride: number,
): void => {
  const cellSize = stride === 1 ? 4 : stride;
  const alternate = (Math.floor(x / cellSize) + Math.floor(y / cellSize)) % 2 === 0;
  writeGray(rgba, offset, alternate ? 84 : 108);
};

export const colorizeFrame = (
  frame: SemanticFrame,
  view: SemanticView,
): Uint8ClampedArray<ArrayBuffer> => {
  const { width } = frame.size;
  const rgba = new Uint8ClampedArray(width * frame.size.height * 4);
  const stride = frame.sampleStride;
```

with

```ts
const [UNRESOLVED_DARK_COLOR, UNRESOLVED_LIGHT_COLOR] = unresolvedTextureColors();
const UNRESOLVED_DARK = UNRESOLVED_DARK_COLOR[0];
const UNRESOLVED_LIGHT = UNRESOLVED_LIGHT_COLOR[0];

/** Unresolved gray with the checker texture of cell 4 (stable) or the stride. */
const writeUnresolved = (
  rgba: Uint8ClampedArray,
  offset: number,
  x: number,
  y: number,
  stride: number,
): void => {
  const cellSize = stride === 1 ? 4 : stride;
  const alternate = (Math.floor(x / cellSize) + Math.floor(y / cellSize)) % 2 === 0;
  writeGray(rgba, offset, alternate ? UNRESOLVED_DARK : UNRESOLVED_LIGHT);
};

/**
 * Colorizes `frame` in `view`. The period view draws with `periodKey`, which
 * defaults to the frame's own ranking; pass the key you report so the legend
 * and the raster cannot disagree.
 */
export const colorizeFrame = (
  frame: SemanticFrame,
  view: SemanticView,
  periodKey: PeriodKey = view === 'period'
    ? buildPeriodKey(periodHistogram(frame))
    : EMPTY_PERIOD_KEY,
): Uint8ClampedArray<ArrayBuffer> => {
  const { width } = frame.size;
  const rgba = new Uint8ClampedArray(width * frame.size.height * 4);
  const stride = frame.sampleStride;
  const periodColors = periodColorLookup(periodKey);
```

In the `writeAttracting(` call inside `colorizeFrame`, replace

```ts
          x,
          y,
          view,
        );
      } else {
```

with

```ts
          x,
          y,
          view,
          periodColors,
        );
      } else {
```

- [ ] **Step 5: Carry the key on `RasterFrame`**

In `src/render/renderer.ts`, replace

```ts
  Complex,
  OrbitResult,
  RasterSize,
```

with

```ts
  Complex,
  OrbitResult,
  PeriodKey,
  RasterSize,
```

and replace

```ts
  readonly rgba: Uint8ClampedArray<ArrayBuffer>;
  readonly progress: number;
}
```

with

```ts
  readonly rgba: Uint8ClampedArray<ArrayBuffer>;
  readonly progress: number;
  /** Period view only: the period-to-color mapping this raster was drawn with. */
  readonly periodKey?: PeriodKey;
}
```

In `src/render/cpu-renderer.ts`, replace

```ts
import {
  classifyOrbit,
```

with

```ts
import {
  buildPeriodKey,
  classifyOrbit,
```

replace

```ts
import { colorizeFrame } from './colorize';
```

with

```ts
import { colorizeFrame, periodHistogram } from './colorize';
```

and replace the `colorize` method

```ts
  public colorize(frame: SemanticFrame, view: SemanticView): RasterFrame {
    const rgba = colorizeFrame(frame, view);
    return {
      stage: frame.stage,
      size: frame.size,
      rgba,
      progress: frame.progress,
    };
  }
```

with

```ts
  public colorize(frame: SemanticFrame, view: SemanticView): RasterFrame {
    // The period view ranks this frame's own histogram (PLAN §8, Q1), so a
    // recolor of a cached frame reproduces the key without reclassifying.
    const periodKey = view === 'period' ? buildPeriodKey(periodHistogram(frame)) : undefined;
    const rgba = colorizeFrame(frame, view, periodKey);
    return {
      stage: frame.stage,
      size: frame.size,
      rgba,
      progress: frame.progress,
      ...(periodKey === undefined ? {} : { periodKey }),
    };
  }
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/render/colorize.test.ts tests/unit/domain/semantic.test.ts tests/unit/render/cpu-renderer.test.ts`
Expected: PASS, no failed tests in the three files. The byte-parity test still passing proves the stability and multiplier bytes are unchanged.

- [ ] **Step 7: Format, check and commit**

```bash
npx prettier --write src/domain src/render tests/unit/render/colorize.test.ts tests/unit/domain/semantic.test.ts tests/unit/render/cpu-renderer.test.ts
npm run check
npm run fixtures:kernel-golden -- --check
npx playwright test
git add src/domain/semantic.ts src/domain/index.ts src/render/colorize.ts src/render/renderer.ts src/render/cpu-renderer.ts tests/unit/render/colorize.test.ts tests/unit/domain/semantic.test.ts tests/unit/render/cpu-renderer.test.ts
git commit -F - <<'EOF'
Period view: colorize from the frame's period key; RasterFrame carries it

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 5: Acceptance tests on the shipped colorizer output

**Files:**

- Modify: `tests/unit/palette/palette-metrics.ts` (imports; append the shipped section)
- Create: `tests/unit/palette/overlay-contrast.ts`
- Test: `tests/unit/palette/palette-acceptance.test.ts`, `tests/unit/palette/label-contrast.test.ts`
- Modify: `tsconfig.app.json` (exclude the two Node-only files), `tools/palette_metrics.ts`

**Interfaces:**

- Consumes: Task 4's `colorizeFrame`, `ESCAPE_BAND_RATE`, `colorForAttracting`; `modulateForMultiplierDirection` from `src/domain/semantic.ts`; Task 2's metric types and floors.
- Produces: `shippedPaletteSpec(): PaletteSpec` (sampled from `colorizeFrame` output); `TEXT_OVERLAYS` and `worstOverlayContrast(selector: string): number` in `overlay-contrast.ts`; the evidence tool's `shipped` palette entry and `textOverRaster` record.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/palette/palette-acceptance.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { colorForAttracting } from '../../../src/domain';
import { relativeLuminance } from './color-science';
import {
  candidateClasses,
  PERIOD_PALETTE_CANDIDATES,
  SELECTED_PERIOD_PALETTE_ID,
} from './palette-candidates';
import { PALETTE_FLOORS } from './palette-floors';
import { measurePalette, shippedPaletteSpec } from './palette-metrics';

describe('shipped palette acceptance (MI-UX-021)', () => {
  it('meets every colour-difference floor under normal, protan, deutan and tritan vision', () => {
    const below = measurePalette(shippedPaletteSpec())
      .filter((result) => result.min < PALETTE_FLOORS[result.name])
      .map((result) => `${result.name}: ${result.min.toFixed(2)}`);
    expect(below).toEqual([]);
  });

  it('ships exactly the selected period palette', () => {
    const selected = PERIOD_PALETTE_CANDIDATES.find(
      (candidate) => candidate.id === SELECTED_PERIOD_PALETTE_ID,
    );
    expect(selected).toBeDefined();
    if (selected === undefined) return;
    expect(shippedPaletteSpec().periodClasses).toEqual(candidateClasses(selected));
  });

  it('keeps the stability ramp a neutral gray whose luminance never falls as κ grows', () => {
    // κ = −ln|λ| / p; sweep |λ| from 1 (κ = 0) down to 0 (κ = ∞) for several periods.
    for (const period of [1, 2, 7, 32]) {
      let previous = -1;
      for (let step = 0; step <= 1000; step += 1) {
        const magnitude = 1 - step / 1000;
        const [red, green, blue] = colorForAttracting(period, magnitude, 0, 'stability');
        expect(green).toBe(red);
        expect(blue).toBe(red);
        const luminance = relativeLuminance([red, green, blue]);
        expect(luminance).toBeGreaterThanOrEqual(previous);
        previous = luminance;
      }
    }
    expect(colorForAttracting(1, 1, 0, 'stability')[0]).toBe(35);
    expect(colorForAttracting(1, 0, 0, 'stability')[0]).toBe(240);
  });
});
```

Create `tests/unit/palette/label-contrast.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { TEXT_OVERLAYS, worstOverlayContrast } from './overlay-contrast';
import { LABEL_CONTRAST_FLOOR } from './palette-floors';

describe('text over the raster (MI-UX-016, MI-UX-021)', () => {
  for (const selector of TEXT_OVERLAYS) {
    it(`${selector} keeps at least ${LABEL_CONTRAST_FLOOR}:1 over every raster colour`, () => {
      expect(worstOverlayContrast(selector)).toBeGreaterThanOrEqual(LABEL_CONTRAST_FLOOR);
    });
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/palette/palette-acceptance.test.ts tests/unit/palette/label-contrast.test.ts`
Expected: FAIL; `shippedPaletteSpec` is not exported, and `./overlay-contrast` cannot be resolved.

- [ ] **Step 3: Sample the shipped palette from `colorizeFrame`**

In `tests/unit/palette/palette-metrics.ts`, replace

```ts
import type { SemanticView } from '../../../src/domain';
```

with

```ts
import {
  colorForAttracting,
  ESCAPE_BAND_RATE,
  type Rgba,
  type SemanticView,
} from '../../../src/domain';
import { modulateForMultiplierDirection } from '../../../src/domain/semantic';
import type { SemanticFrame } from '../../../src/render';
import { colorizeFrame } from '../../../src/render/colorize';
import { packStatusPeriod } from '../../../src/render/packed-semantic';
```

and append to the end of the file:

```ts

// --- Shipped palette (colorize.ts output) -------------------------------------

type Pixel = readonly [status: 0 | 1 | 2, period: number, primary: number];

/** Colorizes one row of pixels in `view` and returns each pixel's RGB. */
const colorizedRow = (pixels: readonly Pixel[], view: SemanticView): Rgb[] => {
  const width = pixels.length;
  const frame: SemanticFrame = {
    stage: 'stable',
    size: { width, height: 1 },
    sampleStride: 1,
    bands: [
      {
        y0: 0,
        y1: 1,
        packedStatusPeriod: Uint32Array.from(pixels, ([status, period]) =>
          packStatusPeriod(status, period),
        ),
        smoothIterationOrMultiplierMagnitude: Float64Array.from(pixels, (pixel) => pixel[2]),
        multiplierAngle: new Float64Array(width),
      },
    ],
    progress: 1,
  };
  const rgba = colorizeFrame(frame, view);
  return pixels.map((_, index) => [
    rgba[index * 4] ?? 0,
    rgba[index * 4 + 1] ?? 0,
    rgba[index * 4 + 2] ?? 0,
  ]);
};

const shippedEscaped = (view: SemanticView): readonly Rgb[] =>
  colorizedRow(
    bands().map((band): Pixel => [1, 0, band / ESCAPE_BAND_RATE]),
    view,
  );

/** Cells 0–3 and 4–7 of a stable unresolved row are the two checker cells. */
const shippedUnresolvedCells = (): readonly [Rgb, Rgb] => {
  const row = colorizedRow(
    Array.from({ length: 8 }, (): Pixel => [0, 0, 0]),
    'period',
  );
  return [row[0] ?? [0, 0, 0], row[4] ?? [0, 0, 0]];
};

/**
 * Periods 1–6 with areas 6, 5, 4, 3, 2 and 1 pixels: periods 1–5 take the
 * five palette colours and period 6 the neutral.
 */
const shippedPeriodClasses = (): readonly Rgb[] => {
  const pixels: Pixel[] = [];
  for (let period = 1; period <= 6; period += 1) {
    for (let count = 0; count < 7 - period; count += 1) pixels.push([2, period, 0.5]);
  }
  const row = colorizedRow(pixels, 'period');
  return [0, 6, 11, 15, 18, 20].map((index) => row[index] ?? [0, 0, 0]);
};

/**
 * Light and dark stripe of each multiplier sample. Stripe phase depends on
 * pixel position and angle, so these come from the domain functions the
 * colorizer is byte-pinned to (tests/unit/render/colorize.test.ts).
 */
const shippedStripePairs = (): readonly (readonly [Rgb, Rgb])[] => {
  const toRgb = (color: Rgba): Rgb => [color[0], color[1], color[2]];
  const pairs: (readonly [Rgb, Rgb])[] = [];
  for (let step = 0; step < MULTIPLIER_ANGLE_STEPS; step += 1) {
    const angle = (2 * Math.PI * step) / MULTIPLIER_ANGLE_STEPS;
    for (let m = 0; m <= MULTIPLIER_MAGNITUDE_STEPS; m += 1) {
      const base = colorForAttracting(1, m / MULTIPLIER_MAGNITUDE_STEPS, angle, 'multiplier');
      // Along the unit direction (1, 0): sin(0.45) > 0 lightens, sin(3.6) < 0 darkens.
      pairs.push([
        toRgb(modulateForMultiplierDirection(base, 1, 0, 1, 0)),
        toRgb(modulateForMultiplierDirection(base, 8, 0, 1, 0)),
      ]);
    }
  }
  return pairs;
};

/** The palette the colorizer ships, sampled from colorizeFrame output. */
export const shippedPaletteSpec = (): PaletteSpec => ({
  escaped: {
    stability: shippedEscaped('stability'),
    multiplier: shippedEscaped('multiplier'),
    period: shippedEscaped('period'),
  },
  unresolvedCells: shippedUnresolvedCells(),
  multiplierStripePairs: shippedStripePairs(),
  periodClasses: shippedPeriodClasses(),
});
```

- [ ] **Step 4: Write the overlay contrast helper (Node only)**

Create `tests/unit/palette/overlay-contrast.ts`:

```ts
/**
 * Contrast of text drawn over the raster (MI-UX-016, MI-UX-021). Reads the
 * overlay colours from src/styles.css (Node only: run from the repo root, as
 * npm and Vitest do) and composites them over every shipped raster colour.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { composite, contrastRatio, type Rgb } from './color-science';
import { shippedPaletteSpec } from './palette-metrics';

/** Overlays that draw text directly over the raster. */
export const TEXT_OVERLAYS = ['.catalog-marker__label', '.explorer__hint', '.feedback'] as const;

interface CssColor {
  readonly rgb: Rgb;
  readonly alpha: number;
}

const styles = (): string => readFileSync(path.resolve(process.cwd(), 'src/styles.css'), 'utf8');

const ruleBody = (css: string, selector: string): string => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`^${escaped} \\{([^}]*)\\}`, 'm').exec(css);
  if (match?.[1] === undefined) throw new Error(`no top-level rule for ${selector}`);
  return match[1];
};

const declaration = (body: string, property: string): string => {
  const match = new RegExp(`^\\s*${property}:\\s*([^;]+);`, 'm').exec(body);
  if (match?.[1] === undefined) throw new Error(`no ${property} declaration`);
  return match[1].trim();
};

const parseCssColor = (value: string): CssColor => {
  if (value === 'white') return { rgb: [255, 255, 255], alpha: 1 };
  const match = /^rgb\((\d+) (\d+) (\d+)(?: \/ (\d+)%)?\)$/.exec(value);
  if (match === null) throw new Error(`unsupported CSS colour ${value}`);
  return {
    rgb: [Number(match[1]), Number(match[2]), Number(match[3])],
    alpha: match[4] === undefined ? 1 : Number(match[4]) / 100,
  };
};

/** Every colour the raster can show under an overlay, plus the white bound. */
const rasterColors = (): readonly Rgb[] => {
  const spec = shippedPaletteSpec();
  return [
    [255, 255, 255],
    ...spec.escaped.stability,
    ...spec.escaped.multiplier,
    ...spec.unresolvedCells,
    ...spec.multiplierStripePairs.flat(),
    ...spec.periodClasses,
  ];
};

/** The lowest text contrast of `selector` over any raster colour. */
export const worstOverlayContrast = (selector: string): number => {
  const body = ruleBody(styles(), selector);
  const text = parseCssColor(declaration(body, 'color'));
  const background = parseCssColor(declaration(body, 'background'));
  let worst = Number.POSITIVE_INFINITY;
  for (const raster of rasterColors()) {
    const panel = composite(background.rgb, background.alpha, raster);
    const glyph = composite(text.rgb, text.alpha, panel);
    worst = Math.min(worst, contrastRatio(glyph, panel));
  }
  return worst;
};
```

Exclude the two Node-only files from the app project, which has no Node types (the node project still type-checks them). In `tsconfig.app.json`, replace

```json
    "tests/unit/render/kernel-golden.test.ts"
```

with

```json
    "tests/unit/render/kernel-golden.test.ts",
    "tests/unit/palette/label-contrast.test.ts",
    "tests/unit/palette/overlay-contrast.ts"
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/palette`
Expected: PASS; every file in the directory passes with no failed tests.

- [ ] **Step 6: Add the shipped palette and overlay contrast to the evidence tool**

In `tools/palette_metrics.ts`, replace

```ts
import { PALETTE_FLOORS, PHASE1_FLOORS } from '../tests/unit/palette/palette-floors';
```

with

```ts
import { TEXT_OVERLAYS, worstOverlayContrast } from '../tests/unit/palette/overlay-contrast';
import {
  LABEL_CONTRAST_FLOOR,
  PALETTE_FLOORS,
  PHASE1_FLOORS,
} from '../tests/unit/palette/palette-floors';
```

replace

```ts
  phase1PaletteSpec,
  type PaletteSpec,
} from '../tests/unit/palette/palette-metrics';
```

with

```ts
  phase1PaletteSpec,
  shippedPaletteSpec,
  type PaletteSpec,
} from '../tests/unit/palette/palette-metrics';
```

replace

```ts
    spec: phase1PaletteSpec(candidateClasses(candidate)),
  })),
];
```

with

```ts
    spec: phase1PaletteSpec(candidateClasses(candidate)),
  })),
  {
    id: 'shipped',
    description: 'colorize.ts output: period classes are the five emphasized colours, then other',
    spec: shippedPaletteSpec(),
  },
];
```

replace

```ts
  floors: PALETTE_FLOORS,
  palettes: palettes().map((palette) => ({
```

with

```ts
  floors: PALETTE_FLOORS,
  textOverRaster: TEXT_OVERLAYS.map((selector) => {
    const worst = worstOverlayContrast(selector);
    return {
      selector,
      worstContrast: Number(worst.toFixed(2)),
      floor: LABEL_CONTRAST_FLOOR,
      pass: worst >= LABEL_CONTRAST_FLOOR,
    };
  }),
  palettes: palettes().map((palette) => ({
```

and replace

```ts
    '## Palettes',
    '',
    ...classes,
    '',
  ].join('\n');
```

with

```ts
    '## Palettes',
    '',
    ...classes,
    '',
    '## Text over the raster',
    '',
    `Worst WCAG contrast of each overlay over every shipped raster colour and white (floor ${LABEL_CONTRAST_FLOOR}:1):`,
    '',
    ...data.textOverRaster.map(
      (overlay) =>
        `- \`${overlay.selector}\`: ${overlay.worstContrast.toFixed(2)}:1${overlay.pass ? '' : ' ✗'}`,
    ),
    '',
  ].join('\n');
```

Run: `npm run evidence:palette -- .evidence-build/palette-dry-run`
Expected: the table gains a `shipped` column equal to the `candidate/okabe-ito` column (`11.98`, `17.57`, `20.72` in the three `period-classes-*` rows), and the output ends with

```
- `.catalog-marker__label`: 10.58:1
- `.explorer__hint`: 5.15:1
- `.feedback`: 13.21:1
```

- [ ] **Step 7: Format, check and commit**

```bash
npx prettier --write tests/unit/palette tools/palette_metrics.ts tsconfig.app.json
npm run check
npm run fixtures:kernel-golden -- --check
npx playwright test
git add tests/unit/palette/palette-metrics.ts tests/unit/palette/overlay-contrast.ts tests/unit/palette/palette-acceptance.test.ts tests/unit/palette/label-contrast.test.ts tsconfig.app.json tools/palette_metrics.ts
git commit -F - <<'EOF'
Palette: acceptance tests on the shipped colorizer output and overlay contrast

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 6: Deliver the period key with every period-view frame

**Files:**

- Modify: `src/worker/protocol.ts`, `src/worker/runtime.ts`
- Test: `tests/unit/worker/runtime.test.ts` (append a `describe` block)

**Interfaces:**

- Consumes: `RasterFrame.periodKey` (Task 4); `PeriodKey` from `src/domain`.
- Produces: `FrameMessage.periodKey?: PeriodKey`, present on every delivery (computed, `semantic-cache`, `recolor`, `inflight-replay`) whose view is `period`, and ranked from that delivery's own semantic frame.

- [ ] **Step 1: Write the failing tests**

Append to the end of `tests/unit/worker/runtime.test.ts` (every name it uses is already imported at the top of that file):

```ts

describe('RenderWorkerRuntime period key delivery', () => {
  type FrameOut = Extract<WorkerToMainMessage, { type: 'frame' }>;
  const framesOf = (messages: readonly WorkerToMainMessage[]): FrameOut[] =>
    messages.filter((message): message is FrameOut => message.type === 'frame');
  const cpu = new CpuRenderer();
  const size = { width: 2, height: 2 };
  const viewportA = { center: { re: 0, im: 0 }, spanY: 3 };
  const viewportB = { center: { re: -1, im: 0 }, spanY: 1 };

  /** Every pixel attracting with `period`. */
  const uniformFrame = (
    period: number,
    stage: SemanticFrame['stage'] = 'stable',
  ): SemanticFrame => ({
    ...semanticFrame(size, stage),
    bands: [
      {
        y0: 0,
        y1: size.height,
        packedStatusPeriod: new Uint32Array(4).fill(packStatusPeriod(2, period)),
        smoothIterationOrMultiplierMagnitude: new Float64Array(4).fill(0.5),
        multiplierAngle: new Float64Array(4),
      },
    ],
  });

  /** Viewport A classifies as period 3, viewport B as period 7. */
  const renderer = (): Renderer => ({
    inspect: () => ({ status: 'unresolved', iterations: 1, evidence: ['iteration-limit'] }),
    render: async (request, _signal, onFrame) => {
      await onFrame(uniformFrame(request.viewport.spanY === 3 ? 3 : 7));
    },
    colorize: (frame, view) => cpu.colorize(frame, view),
  });

  const periodsOf = (frame: FrameOut | undefined): readonly number[] | undefined =>
    frame?.periodKey?.emphasized.map((entry) => entry.period);

  it('sends the key of the delivered frame on computed, cache and recolor deliveries', async () => {
    const messages: WorkerToMainMessage[] = [];
    const runtime = new RenderWorkerRuntime({ postMessage: (m) => messages.push(m) }, renderer());

    await runtime.handle({
      type: 'render',
      requestId: 1,
      semanticView: 'stability',
      viewport: viewportA,
      size,
    });
    await runtime.handle({
      type: 'render',
      requestId: 2,
      semanticView: 'period',
      viewport: viewportA,
      size,
    });
    await runtime.handle({
      type: 'render',
      requestId: 3,
      semanticView: 'period',
      viewport: viewportA,
      size,
    });

    const frames = framesOf(messages);
    expect(frames.map((frame) => frame.provenance.source)).toEqual([
      'computed',
      'recolor',
      'semantic-cache',
    ]);
    expect(frames[0]).not.toHaveProperty('periodKey');
    expect(periodsOf(frames[1])).toEqual([3]);
    expect(frames[2]?.periodKey).toEqual(frames[1]?.periodKey);
  });

  it('ranks the new frame, not the previous view, when a recolor follows a pan', async () => {
    const messages: WorkerToMainMessage[] = [];
    const runtime = new RenderWorkerRuntime({ postMessage: (m) => messages.push(m) }, renderer());

    await runtime.handle({
      type: 'render',
      requestId: 1,
      semanticView: 'period',
      viewport: viewportA,
      size,
    });
    await runtime.handle({
      type: 'render',
      requestId: 2,
      semanticView: 'stability',
      viewport: viewportB,
      size,
    });
    await runtime.handle({
      type: 'render',
      requestId: 3,
      semanticView: 'period',
      viewport: viewportB,
      size,
    });

    const frames = framesOf(messages);
    expect(frames.map((frame) => frame.provenance.source)).toEqual([
      'computed',
      'computed',
      'recolor',
    ]);
    expect(periodsOf(frames[0])).toEqual([3]);
    expect(periodsOf(frames[2])).toEqual([7]);
  });

  it('replays the retained coarse frame with that frame’s own key', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const messages: WorkerToMainMessage[] = [];
    const runtime = new RenderWorkerRuntime(
      { postMessage: (m) => messages.push(m) },
      {
        ...renderer(),
        render: async (_request, _signal, onFrame) => {
          await onFrame(uniformFrame(2, 'coarse'));
          await gate;
          await onFrame(uniformFrame(5));
        },
      },
    );

    const first = runtime.handle({
      type: 'render',
      requestId: 'a',
      semanticView: 'stability',
      viewport: viewportA,
      size,
    });
    await Promise.resolve();
    await runtime.handle({
      type: 'render',
      requestId: 'b',
      semanticView: 'period',
      viewport: viewportA,
      size,
    });
    release();
    await first;

    const frames = framesOf(messages);
    expect(frames.map((frame) => [frame.provenance.source, frame.stage])).toEqual([
      ['computed', 'coarse'],
      ['inflight-replay', 'coarse'],
      ['computed', 'stable'],
    ]);
    expect(periodsOf(frames[1])).toEqual([2]);
    expect(periodsOf(frames[2])).toEqual([5]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/worker/runtime.test.ts`
Expected: FAIL in the three new tests; `periodsOf(frames[1])` is `undefined` because the runtime does not forward the key.

- [ ] **Step 3: Forward the key**

In `src/worker/protocol.ts`, replace

```ts
  Complex,
  OrbitResult,
  RasterSize,
```

with

```ts
  Complex,
  OrbitResult,
  PeriodKey,
  RasterSize,
```

and in `interface FrameMessage` replace

```ts
  readonly progress: number;
  readonly workerTiming?: WorkerFrameTiming;
}
```

with

```ts
  readonly progress: number;
  readonly workerTiming?: WorkerFrameTiming;
  /**
   * Period view only: the period-to-color mapping the raster was drawn with,
   * ranked from this delivery's own semantic frame (PLAN §8, MI-UX-018).
   */
  readonly periodKey?: PeriodKey;
}
```

In `src/worker/runtime.ts`, inside `#postFrame`, replace

```ts
      progress: raster.progress,
      workerTiming,
    };
```

with

```ts
      progress: raster.progress,
      workerTiming,
      ...(raster.periodKey === undefined ? {} : { periodKey: raster.periodKey }),
    };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/worker/runtime.test.ts`
Expected: PASS, no failed tests (the three new tests included).

- [ ] **Step 5: Format, check and commit**

```bash
npx prettier --write src/worker tests/unit/worker/runtime.test.ts
npm run check
npm run fixtures:kernel-golden -- --check
npx playwright test
git add src/worker/protocol.ts src/worker/runtime.ts tests/unit/worker/runtime.test.ts
git commit -F - <<'EOF'
Worker: deliver the period key with every period-view frame

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 7: A palette-derived legend model

**Files:**

- Create: `src/ui/legend-model.ts`
- Test: `tests/unit/ui/legend-model.test.ts`

**Interfaces:**

- Consumes: `colorForAttracting`, `colorForEscaped`, `ESCAPE_BAND_RATE`, `OTHER_PERIODS_COLOR`, `unresolvedTextureColors`, `PeriodKey`, `Rgba`, `SemanticView` from `src/domain`.
- Produces (exported from `src/ui/legend-model.ts`):
  - `interface LegendTick { position: number; label: string }`
  - `interface LegendScale { kind: 'scale'; label; detail; background: string; ticks: readonly LegendTick[] }`
  - `interface LegendSwatch { kind: 'swatch'; label; detail; background: string; border: 'solid' | 'dashed' | 'dotted'; period?: number | 'other' }`
  - `interface LegendNote { kind: 'note'; text: string }`
  - `type LegendItem = LegendScale | LegendSwatch | LegendNote`
  - `interface LegendModel { definition: string; items: readonly LegendItem[] }`
  - `DEFINITIONS: Readonly<Record<SemanticView, string>>`
  - `cssColor(color: Rgba): string` (`'rgb(r g b)'`)
  - `stabilityPosition(kappa: number): number`
  - `formatShare(part: number, whole: number): string`
  - `legendModel(view: SemanticView, periodKey?: PeriodKey): LegendModel`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/ui/legend-model.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  buildPeriodKey,
  colorForAttracting,
  colorForEscaped,
  EMPTY_PERIOD_KEY,
  OTHER_PERIODS_COLOR,
  PERIOD_EMPHASIS_PALETTE,
  unresolvedTextureColors,
} from '../../../src/domain';
import {
  cssColor,
  DEFINITIONS,
  formatShare,
  legendModel,
  stabilityPosition,
  type LegendItem,
  type LegendScale,
  type LegendSwatch,
} from '../../../src/ui/legend-model';

const swatches = (items: readonly LegendItem[]): LegendSwatch[] =>
  items.filter((item): item is LegendSwatch => item.kind === 'swatch');
const scales = (items: readonly LegendItem[]): LegendScale[] =>
  items.filter((item): item is LegendScale => item.kind === 'scale');
const labels = (items: readonly LegendItem[]): string[] =>
  items.map((item) => (item.kind === 'note' ? item.text : item.label));

describe('legend model', () => {
  it('gives the stability view a numeric κ scale drawn from the stability ramp', () => {
    const model = legendModel('stability');
    const [scale] = scales(model.items);

    expect(model.definition).toBe(DEFINITIONS.stability);
    expect(labels(model.items)).toEqual(['Stability κ', 'Escaped', 'Unresolved']);
    expect(scale?.ticks.map((tick) => tick.label)).toEqual(['0', '0.5', '1', '2', '∞']);
    expect(scale?.ticks[2]?.position).toBeCloseTo(stabilityPosition(1), 12);
    expect(scale?.background).toContain(
      `${cssColor(colorForAttracting(1, 1, 0, 'stability'))} 0.00%`,
    );
    expect(scale?.background).toContain(
      `${cssColor(colorForAttracting(1, 0, 0, 'stability'))} 100.00%`,
    );
  });

  it('places each κ tick where the ramp draws that κ', () => {
    // The ramp at position n is |λ| = 1 − n for period 1, so κ = −ln(1 − n).
    for (const kappa of [0.5, 1, 2]) {
      const position = stabilityPosition(kappa);
      expect(colorForAttracting(1, 1 - position, 0, 'stability')).toEqual(
        colorForAttracting(3, Math.exp(-3 * kappa), 0, 'stability'),
      );
    }
  });

  it('gives the multiplier view numeric |λ| and arg λ scales from the multiplier palette', () => {
    const model = legendModel('multiplier');
    const [magnitude, angle] = scales(model.items);

    expect(labels(model.items)).toEqual([
      'Attraction |λ|',
      'Multiplier angle',
      'Escaped',
      'Unresolved',
    ]);
    expect(magnitude?.ticks.map((tick) => tick.label)).toEqual(['0', '0.25', '0.5', '0.75', '1']);
    expect(magnitude?.background).toContain(
      `${cssColor(colorForAttracting(1, 0.5, 0, 'multiplier'))} 50.00%`,
    );
    expect(angle?.ticks.map((tick) => tick.label)).toEqual(['−π', '−π/2', '0', 'π/2', 'π']);
    expect(angle?.background).toContain(
      `${cssColor(colorForAttracting(1, 0.5, 0, 'multiplier'))} 50.00%`,
    );
  });

  it('lists exactly the emphasized periods, in ascending order, plus the neutral class', () => {
    const key = buildPeriodKey(
      new Map([
        [4, 300],
        [1, 9000],
        [2, 4000],
        [3, 50],
        [8, 120],
        [16, 60],
        [5, 7],
      ]),
    );
    const items = swatches(legendModel('period', key).items);

    expect(items.map((item) => item.label)).toEqual([
      'Period 1',
      'Period 2',
      'Period 4',
      'Period 8',
      'Period 16',
      'Other periods',
      'Escaped',
      'Unresolved',
    ]);
    expect(items.slice(0, 5).map((item) => item.background)).toEqual(
      PERIOD_EMPHASIS_PALETTE.map(cssColor),
    );
    expect(items[0]?.detail).toBe('66% of attracting-cycle pixels');
    expect(items[5]).toMatchObject({
      background: cssColor(OTHER_PERIODS_COLOR),
      detail: '2 more periods · 0.4% of attracting-cycle pixels',
      period: 'other',
    });
  });

  it('shows one period and no other periods for a single-period frame', () => {
    const items = swatches(legendModel('period', buildPeriodKey(new Map([[3, 42]]))).items);

    expect(items.slice(0, 2)).toMatchObject([
      { label: 'Period 3', detail: '100% of attracting-cycle pixels', period: 3 },
      { label: 'Other periods', detail: 'None in this view', period: 'other' },
    ]);
  });

  it('says so when a frame has no attracting cycle', () => {
    expect(labels(legendModel('period', EMPTY_PERIOD_KEY).items)).toEqual([
      'No attracting cycle detected in this view.',
      'Other periods',
      'Escaped',
      'Unresolved',
    ]);
  });

  it('shows a pending note until the period frame arrives', () => {
    expect(labels(legendModel('period').items)[0]).toBe('Ranking the periods in this view…');
  });

  it('draws the escaped and unresolved swatches from the colorizer palette', () => {
    for (const view of ['stability', 'multiplier', 'period'] as const) {
      const [escaped, unresolved] = swatches(legendModel(view, EMPTY_PERIOD_KEY).items).slice(-2);
      expect(escaped?.background).toContain(`${cssColor(colorForEscaped(0, view))} 0.00%`);
      const [dark, light] = unresolvedTextureColors();
      expect(unresolved?.background).toContain(cssColor(dark));
      expect(unresolved?.background).toContain(cssColor(light));
    }
  });

  it('formats shares without rounding a minority to 0% or 100%', () => {
    expect(formatShare(0, 10)).toBe('0%');
    expect(formatShare(1, 100_000)).toBe('<0.1%');
    expect(formatShare(57, 13_537)).toBe('0.4%');
    expect(formatShare(9000, 13_537)).toBe('66%');
    expect(formatShare(13_536, 13_537)).toBe('>99%');
    expect(formatShare(42, 42)).toBe('100%');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/ui/legend-model.test.ts`
Expected: FAIL; `../../../src/ui/legend-model` cannot be resolved.

- [ ] **Step 3: Write the model**

Create `src/ui/legend-model.ts`:

```ts
import {
  colorForAttracting,
  colorForEscaped,
  ESCAPE_BAND_RATE,
  OTHER_PERIODS_COLOR,
  unresolvedTextureColors,
  type PeriodKey,
  type Rgba,
  type SemanticView,
} from '../domain';

/**
 * The semantic legend as data (MI-UX-010, MI-UX-018, MI-UX-021). Every swatch
 * and scale colour is computed from the src/domain palette functions the
 * colorizer uses, so the legend cannot drift from the raster.
 */

export interface LegendTick {
  /** 0 (left end) to 1 (right end) along the scale bar. */
  readonly position: number;
  readonly label: string;
}

export interface LegendScale {
  readonly kind: 'scale';
  readonly label: string;
  readonly detail: string;
  /** CSS background of the bar. */
  readonly background: string;
  readonly ticks: readonly LegendTick[];
}

export interface LegendSwatch {
  readonly kind: 'swatch';
  readonly label: string;
  readonly detail: string;
  /** CSS background of the swatch. */
  readonly background: string;
  readonly border: 'solid' | 'dashed' | 'dotted';
  /** Set on period-key entries: the exact period, or 'other' for the neutral class. */
  readonly period?: number | 'other';
}

export interface LegendNote {
  readonly kind: 'note';
  readonly text: string;
}

export type LegendItem = LegendScale | LegendSwatch | LegendNote;

export interface LegendModel {
  readonly definition: string;
  readonly items: readonly LegendItem[];
}

export const DEFINITIONS: Readonly<Record<SemanticView, string>> = {
  stability: 'Lighter regions settle faster. κ = −ln|λ| / p measures attraction per iteration.',
  multiplier:
    'Hue and oriented stripes show rotation (arg λ); lightness shows attraction strength through |λ|.',
  period:
    'Up to five periods covering the most area in this view get a color, in ascending period order; all other periods share one gray. Colors can change when the view changes, so this key always shows the current mapping.',
};

/** CSS colour of a palette colour (alpha is always 255 in the raster). */
export const cssColor = (color: Rgba): string => `rgb(${color[0]} ${color[1]} ${color[2]})`;

const SCALE_STOPS = 16;

/** A left-to-right CSS gradient sampling `colorAt` at evenly spaced positions. */
const gradient = (colorAt: (position: number) => Rgba): string => {
  const stops = Array.from({ length: SCALE_STOPS + 1 }, (_, index) => {
    const position = index / SCALE_STOPS;
    return `${cssColor(colorAt(position))} ${(position * 100).toFixed(2)}%`;
  });
  return `linear-gradient(90deg, ${stops.join(', ')})`;
};

/** Normalized stability position of κ: the ramp is linear in 1 − e^−κ. */
export const stabilityPosition = (kappa: number): number => 1 - Math.exp(-kappa);

const STABILITY_TICKS: readonly LegendTick[] = [
  { position: stabilityPosition(0), label: '0' },
  { position: stabilityPosition(0.5), label: '0.5' },
  { position: stabilityPosition(1), label: '1' },
  { position: stabilityPosition(2), label: '2' },
  { position: 1, label: '∞' },
];

const stabilityScale = (): LegendScale => ({
  kind: 'scale',
  label: 'Stability κ',
  detail: 'κ = −ln|λ| / p from 0 (dark, weakly attracting) to ∞ (light, a cycle center)',
  // Position n is κ = −ln(1 − n) for period 1, i.e. |λ| = 1 − n.
  background: gradient((position) => colorForAttracting(1, 1 - position, 0, 'stability')),
  ticks: STABILITY_TICKS,
});

const magnitudeScale = (): LegendScale => ({
  kind: 'scale',
  label: 'Attraction |λ|',
  detail: '|λ| from 0 (light, strongly attracting) to 1 (dark, neutral); shown at arg λ = 0',
  background: gradient((position) => colorForAttracting(1, position, 0, 'multiplier')),
  ticks: [0, 0.25, 0.5, 0.75, 1].map((position) => ({ position, label: String(position) })),
});

const ANGLE_STRIPES =
  'repeating-linear-gradient(115deg, rgb(0 0 0 / 28%) 0 2px, transparent 2px 6px)';

const angleScale = (): LegendScale => ({
  kind: 'scale',
  label: 'Multiplier angle',
  detail: 'Hue and stripe orientation represent arg λ from −π to π; shown at |λ| = 0.5',
  background: `${ANGLE_STRIPES}, ${gradient((position) =>
    colorForAttracting(1, 0.5, Math.PI * (2 * position - 1), 'multiplier'),
  )}`,
  ticks: [
    { position: 0, label: '−π' },
    { position: 0.25, label: '−π/2' },
    { position: 0.5, label: '0' },
    { position: 0.75, label: 'π/2' },
    { position: 1, label: 'π' },
  ],
});

/** A share of attracting-cycle pixels, never rounded to 0% or 100% when it is neither. */
export const formatShare = (part: number, whole: number): string => {
  if (whole <= 0 || part <= 0) return '0%';
  const percent = (100 * part) / whole;
  if (percent < 0.1) return '<0.1%';
  if (percent < 10) return `${percent.toFixed(1)}%`;
  if (part < whole && percent >= 99.5) return '>99%';
  return `${Math.round(percent)}%`;
};

const periodItems = (key: PeriodKey | undefined): readonly LegendItem[] => {
  if (key === undefined) return [{ kind: 'note', text: 'Ranking the periods in this view…' }];
  const emphasized = key.emphasized.map((entry): LegendSwatch => ({
    kind: 'swatch',
    label: `Period ${entry.period}`,
    detail: `${formatShare(entry.pixelCount, key.attractingPixelCount)} of attracting-cycle pixels`,
    background: cssColor(entry.color),
    border: 'solid',
    period: entry.period,
  }));
  const count = key.otherPeriodCount;
  const other: LegendSwatch = {
    kind: 'swatch',
    label: 'Other periods',
    detail:
      count === 0
        ? 'None in this view'
        : `${count} more ${count === 1 ? 'period' : 'periods'} · ${formatShare(
            key.otherPixelCount,
            key.attractingPixelCount,
          )} of attracting-cycle pixels`,
    background: cssColor(OTHER_PERIODS_COLOR),
    border: 'solid',
    period: 'other',
  };
  const none: readonly LegendItem[] =
    key.attractingPixelCount === 0
      ? [{ kind: 'note', text: 'No attracting cycle detected in this view.' }]
      : [];
  return [...none, ...emphasized, other];
};

const escapedSwatch = (view: SemanticView): LegendSwatch => ({
  kind: 'swatch',
  label: 'Escaped',
  detail: `Outside the Mandelbrot set; shading repeats every ${Math.round(1 / ESCAPE_BAND_RATE)} escape iterations`,
  background: gradient((band) => colorForEscaped(Math.min(band, 0.999) / ESCAPE_BAND_RATE, view)),
  border: 'dashed',
});

const unresolvedSwatch = (): LegendSwatch => {
  const [dark, light] = unresolvedTextureColors();
  return {
    kind: 'swatch',
    label: 'Unresolved',
    detail: 'No claim at current quality',
    background: `repeating-conic-gradient(${cssColor(dark)} 0 25%, ${cssColor(light)} 0 50%) 0 0 / 0.5rem 0.5rem`,
    border: 'dotted',
  };
};

const viewItems = (view: SemanticView, key: PeriodKey | undefined): readonly LegendItem[] => {
  switch (view) {
    case 'stability':
      return [stabilityScale()];
    case 'multiplier':
      return [magnitudeScale(), angleScale()];
    case 'period':
      return periodItems(key);
  }
};

/**
 * The legend for `view`. In the period view `periodKey` is the key of the
 * frame on screen; before one arrives the key is a pending note.
 */
export const legendModel = (view: SemanticView, periodKey?: PeriodKey): LegendModel => ({
  definition: DEFINITIONS[view],
  items: [...viewItems(view, periodKey), escapedSwatch(view), unresolvedSwatch()],
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/ui/legend-model.test.ts`
Expected: PASS; all tests in the file pass.

- [ ] **Step 5: Format, check and commit**

```bash
npx prettier --write src/ui/legend-model.ts tests/unit/ui/legend-model.test.ts
npm run check
npm run fixtures:kernel-golden -- --check
npx playwright test
git add src/ui/legend-model.ts tests/unit/ui/legend-model.test.ts
git commit -F - <<'EOF'
Legend: palette-derived model with κ, |λ| and arg λ scales and the period key

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 8: Render the legend model; the period key follows the frame on screen

**Files:**

- Modify: `src/ui/semantic-legend.ts` (replace), `src/ui/application.ts`, `src/styles.css`
- Test: `tests/e2e/explorer.spec.ts`

**Interfaces:**

- Consumes: Task 7's `legendModel`, `LegendItem`, `LegendScale`, `LegendSwatch`, `LegendTick`; `FrameMessage.periodKey` (Task 6).
- Produces: `createSemanticLegend(): { element: HTMLElement; update: (view: SemanticView, periodKey?: PeriodKey) => void }`. DOM contract the e2e test relies on: period entries are `li.legend__item.legend__item--period` with `data-period` set to the period number or `other`; every swatch is `span.legend__swatch` with an inline background; scale ticks are `span.legend__tick`.

- [ ] **Step 1: Write the failing e2e assertions**

In `tests/e2e/explorer.spec.ts`, insert this helper directly above the line `test.describe('Mandelbrot Interiority explorer', () => {`:

```ts
/**
 * The period legend lists at most five periods in ascending order plus "Other
 * periods", and every listed swatch is a colour the canvas actually drew
 * (the legend and the raster share one palette, MI-UX-018/MI-UX-021).
 */
const expectPeriodLegendMatchesRaster = async (page: Page): Promise<void> => {
  const legend = page.getByRole('region', { name: 'Semantic legend' });
  await expect(legend.getByText('Period 1', { exact: true })).toBeVisible();
  await expect(legend.getByText('Other periods', { exact: true })).toBeVisible();
  const periods = (
    await legend
      .locator('.legend__item--period')
      .evaluateAll((items) => items.map((item) => (item as HTMLElement).dataset['period'] ?? ''))
  )
    .filter((period) => period !== 'other')
    .map(Number);
  expect(periods.length).toBeGreaterThanOrEqual(1);
  expect(periods.length).toBeLessThanOrEqual(5);
  expect(periods).toEqual([...periods].sort((a, b) => a - b));

  const missing = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('.explorer__canvas');
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return ['no canvas'];
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    const drawn = new Set<string>();
    for (let index = 0; index < data.length; index += 4) {
      drawn.add(`${data[index]},${data[index + 1]},${data[index + 2]}`);
    }
    return [
      ...document.querySelectorAll<HTMLElement>(
        '.legend__item--period:not([data-period="other"]) .legend__swatch',
      ),
    ]
      .map((swatch) => (getComputedStyle(swatch).backgroundColor.match(/\d+/g) ?? []).join(','))
      .filter((rgb) => !drawn.has(rgb));
  });
  expect(missing).toEqual([]);
};

```

Replace

```ts
    await test.step('changes semantic views and updates their explanation', async () => {
      await page.getByLabel('Interior view').selectOption('multiplier');
      await expect(
        page.getByText('The strength and angle of attraction around a detected cycle.'),
      ).toBeVisible();
      await expect(page.getByText(/Hue and oriented stripes show rotation/)).toBeVisible();
      await expect(page.getByText('Multiplier angle', { exact: true })).toBeVisible();
```

with

```ts
    await test.step('changes semantic views and updates their explanation', async () => {
      const legend = page.getByRole('region', { name: 'Semantic legend' });
      await expect(legend.getByText('Stability κ', { exact: true })).toBeVisible();
      await expect(legend.locator('.legend__tick')).toHaveText(['0', '0.5', '1', '2', '∞']);

      await page.getByLabel('Interior view').selectOption('multiplier');
      await expect(
        page.getByText('The strength and angle of attraction around a detected cycle.'),
      ).toBeVisible();
      await expect(page.getByText(/Hue and oriented stripes show rotation/)).toBeVisible();
      await expect(page.getByText('Multiplier angle', { exact: true })).toBeVisible();
      await expect(legend.getByText('Attraction |λ|', { exact: true })).toBeVisible();
      await expect(legend.locator('.legend__tick').first()).toHaveText('0');
```

Replace

```ts
      await page.getByLabel('Interior view').selectOption('period');
      await expect(page.getByText('The detected attracting-cycle period.')).toBeVisible();
      await expect(
        page.getByText(
          'Each color category represents the exact detected attracting-cycle period p.',
        ),
      ).toBeVisible();
      await expect(page.getByText('Period 1', { exact: true })).toBeVisible();
      await expect(page.getByText('Period 3+', { exact: true })).toBeVisible();
    });
```

with

```ts
      await page.getByLabel('Interior view').selectOption('period');
      await expect(page.getByText('The detected attracting-cycle period.')).toBeVisible();
      await expect(
        page.getByText(/^Up to five periods covering the most area in this view get a color/),
      ).toBeVisible();
      await expect(page.locator('#explorer')).toHaveAttribute('data-render-stage', 'stable', {
        timeout: 20_000,
      });
      await expectPeriodLegendMatchesRaster(page);
    });
```

Insert this test directly above `  test('contains point evidence and renderer recovery controls on a narrow phone', async ({`:

```ts
  test('keeps every legend view and its scale ticks inside a 320 px phone layout', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Explore', exact: true }).click();
    for (const view of ['stability', 'multiplier', 'period'] as const) {
      await page.getByLabel('Interior view').selectOption(view);
      await expect(page.locator('#explorer')).toHaveAttribute('data-render-stage', 'stable', {
        timeout: 20_000,
      });
      await expectNoHorizontalOverflow(page, `320px ${view} legend`);
      const legendBox = await page.locator('.legend').boundingBox();
      expect(legendBox).not.toBeNull();
      const parts = await page
        .locator('.legend__tick, .legend__bar, .legend__swatch')
        .evaluateAll((elements) =>
          elements.map((element) => {
            const rect = element.getBoundingClientRect();
            return { left: rect.left, right: rect.right };
          }),
        );
      for (const part of parts) {
        expect(part.left).toBeGreaterThanOrEqual(legendBox?.x ?? 0);
        expect(part.right).toBeLessThanOrEqual((legendBox?.x ?? 0) + (legendBox?.width ?? 0));
      }
    }
  });

```

- [ ] **Step 2: Run the e2e tests to verify they fail**

Run: `npx playwright test -g "first-use flow|320 px phone layout"`
Expected: FAIL in both engines; the legend has no "Stability κ" text and no `.legend__tick` elements.

- [ ] **Step 3: Render the model**

Replace the whole of `src/ui/semantic-legend.ts` with:

```ts
import type { PeriodKey } from '../domain';
import { element, replaceChildren } from './dom';
import {
  legendModel,
  type LegendItem,
  type LegendScale,
  type LegendSwatch,
  type LegendTick,
} from './legend-model';
import type { SemanticView } from './view-state';

const copyOf = (label: string, detail: string): HTMLElement => {
  const copy = element('span', { className: 'legend__copy' });
  copy.append(element('strong', { text: label }), element('small', { text: detail }));
  return copy;
};

const tickClass = (tick: LegendTick): string =>
  tick.position <= 0
    ? 'legend__tick legend__tick--start'
    : tick.position >= 1
      ? 'legend__tick legend__tick--end'
      : 'legend__tick';

const renderScale = (scale: LegendScale): HTMLLIElement => {
  const item = element('li', { className: 'legend__item legend__item--scale' });
  const bar = element('span', { className: 'legend__bar' });
  bar.style.background = scale.background;
  const ticks = element('span', { className: 'legend__ticks' });
  for (const tick of scale.ticks) {
    const label = element('span', { className: tickClass(tick), text: tick.label });
    label.style.left = `${tick.position * 100}%`;
    ticks.append(label);
  }
  // The detail text states the range in words; the bar and ticks repeat it visually.
  const graphic = element('span', {
    className: 'legend__scale',
    attributes: { 'aria-hidden': 'true' },
  });
  graphic.append(bar, ticks);
  item.append(copyOf(scale.label, scale.detail), graphic);
  return item;
};

const renderSwatch = (entry: LegendSwatch): HTMLLIElement => {
  const item = element('li', {
    className: entry.period === undefined ? 'legend__item' : 'legend__item legend__item--period',
  });
  if (entry.period !== undefined) item.dataset['period'] = String(entry.period);
  const swatch = element('span', {
    className: `legend__swatch legend__swatch--${entry.border}`,
    attributes: { 'aria-hidden': 'true' },
  });
  swatch.style.background = entry.background;
  item.append(swatch, copyOf(entry.label, entry.detail));
  return item;
};

const renderItem = (entry: LegendItem): HTMLLIElement => {
  switch (entry.kind) {
    case 'scale':
      return renderScale(entry);
    case 'swatch':
      return renderSwatch(entry);
    case 'note':
      return element('li', { className: 'legend__item legend__note', text: entry.text });
  }
};

export function createSemanticLegend(): {
  readonly element: HTMLElement;
  /** Shows `view`; in the period view `periodKey` is the key of the frame on screen. */
  readonly update: (view: SemanticView, periodKey?: PeriodKey) => void;
} {
  const root = element('section', {
    className: 'legend',
    attributes: {
      'aria-labelledby': 'legend-heading',
    },
  });
  const heading = element('h2', {
    className: 'eyebrow',
    text: 'Semantic legend',
    attributes: { id: 'legend-heading' },
  });
  const definition = element('p', { className: 'legend__definition' });
  const list = element('ul', { className: 'legend__list' });
  root.append(heading, definition, list);

  let shown: string | undefined;
  const update = (view: SemanticView, periodKey?: PeriodKey): void => {
    // Coarse and stable frames often share a key; skip identical redraws.
    const signature = JSON.stringify([view, periodKey ?? null]);
    if (signature === shown) return;
    shown = signature;
    const model = legendModel(view, periodKey);
    definition.textContent = model.definition;
    replaceChildren(list, model.items.map(renderItem));
  };

  update('stability');
  return { element: root, update };
}
```

- [ ] **Step 4: Show the key of the presented frame**

In `src/ui/application.ts`, inside `presentFrame`, replace

```ts
    state.frameStage = frame.stage;
    canvasShell.dataset['renderStage'] = frame.stage;
    canvasShell.dataset['renderRequestId'] = String(frame.requestId);
```

with

```ts
    state.frameStage = frame.stage;
    // The period key ranks this frame (coarse and stable can differ); show
    // the mapping of the raster on screen, never a stale one.
    if (state.semanticView === 'period') legend.update('period', frame.periodKey);
    canvasShell.dataset['renderStage'] = frame.stage;
    canvasShell.dataset['renderRequestId'] = String(frame.requestId);
```

The existing `legend.update(state.semanticView);` in the view `change` handler stays: it shows the pending note until the period frame arrives. Frames of an earlier request are already dropped at the top of `presentFrame`.

- [ ] **Step 5: Replace the legend CSS**

In `src/styles.css`, replace this block (from `.legend__item {` up to, not including, `.legend__copy {`):

```css
.legend__item {
  display: grid;
  grid-template-columns: 1.15rem minmax(0, 1fr);
  align-items: center;
  gap: 0.65rem;
}

.legend__swatch {
  width: 1.15rem;
  height: 1.15rem;
  background-color: #aaa;
  border: 1px solid rgb(255 255 255 / 35%);
  border-radius: 0.2rem;
}

.legend__swatch--strong {
  background: #ececec;
}

.legend__swatch--weak {
  background: #4d4d4d;
}

.legend__swatch--angle {
  background:
    repeating-linear-gradient(115deg, rgb(0 0 0 / 28%) 0 2px, transparent 2px 6px),
    linear-gradient(135deg, #d95555, #d6c84e, #47a7a0, #665fc1);
}

.legend__swatch--period-1 {
  background: hsl(138deg 72% 54%);
}

.legend__swatch--period-2 {
  background: hsl(275deg 72% 54%);
}

.legend__swatch--period-3 {
  background: hsl(53deg 72% 54%);
}

.legend__swatch--outside {
  background: #19324b;
  border-style: dashed;
}

.legend__swatch--unknown {
  background: repeating-linear-gradient(45deg, #585b5e 0 3px, #85898d 3px 6px);
  border-style: dotted;
}

```

with

```css
.legend__item {
  display: grid;
  grid-template-columns: 1.15rem minmax(0, 1fr);
  align-items: center;
  gap: 0.65rem;
}

.legend__item--scale {
  grid-template-columns: minmax(0, 1fr);
  gap: 0.3rem;
}

.legend__note {
  grid-template-columns: minmax(0, 1fr);
  color: var(--ink-muted);
  font-size: 0.72rem;
}

/* Swatch and bar colors are set inline from the colorizer palette (legend-model.ts). */
.legend__swatch {
  width: 1.15rem;
  height: 1.15rem;
  border: 1px solid rgb(255 255 255 / 35%);
  border-radius: 0.2rem;
  forced-color-adjust: none;
}

.legend__swatch--dashed {
  border-style: dashed;
}

.legend__swatch--dotted {
  border-style: dotted;
}

.legend__scale {
  display: grid;
  gap: 0.15rem;
}

.legend__bar {
  display: block;
  height: 0.75rem;
  border: 1px solid rgb(255 255 255 / 35%);
  border-radius: 0.2rem;
  forced-color-adjust: none;
}

.legend__ticks {
  position: relative;
  display: block;
  height: 1rem;
  color: var(--ink-muted);
  font-size: 0.66rem;
  font-variant-numeric: tabular-nums;
  line-height: 1rem;
}

.legend__tick {
  position: absolute;
  top: 0;
  white-space: nowrap;
  transform: translateX(-50%);
}

.legend__tick--start {
  transform: none;
}

.legend__tick--end {
  transform: translateX(-100%);
}

```

`forced-color-adjust: none` keeps the swatches showing the canvas colours in forced-colours mode, where the canvas itself is not adjusted. In the `@media (forced-colors: active)` block, replace

```css
  .legend__swatch {
    border-width: 2px;
  }
```

with

```css
  .legend__swatch,
  .legend__bar {
    border-width: 2px;
  }
```

- [ ] **Step 6: Run the e2e tests to verify they pass**

Run: `npx playwright test -g "first-use flow|320 px phone layout|forced colors|reflows phone"`
Expected: every selected test passes in both the `chromium` and `firefox` projects, with no failures. The first-use flow runs axe in the period view with the new legend.

- [ ] **Step 7: Format, check and commit**

```bash
npx prettier --write src/ui/semantic-legend.ts src/ui/application.ts src/styles.css tests/e2e/explorer.spec.ts
npm run check
npm run fixtures:kernel-golden -- --check
npx playwright test
git add src/ui/semantic-legend.ts src/ui/application.ts src/styles.css tests/e2e/explorer.spec.ts
git commit -F - <<'EOF'
Legend: render the palette-derived model; the period key follows the frame on screen

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 9: Isolate a period when colorizing, without reclassifying

**Files:**

- Modify: `src/domain/period-emphasis.ts` (append), `src/domain/index.ts`
- Modify: `src/render/colorize.ts`, `src/render/renderer.ts`, `src/render/cpu-renderer.ts`
- Modify: `src/worker/protocol.ts`, `src/worker/runtime.ts`
- Modify: `tests/unit/palette/palette-metrics.ts` (import; append), `tools/palette_metrics.ts`
- Test: `tests/unit/domain/period-isolation-dim.test.ts` (new), `tests/unit/palette/isolation-contrast.test.ts` (new), `tests/unit/render/colorize.test.ts`, `tests/unit/worker/runtime.test.ts`

**Interfaces:**

- Consumes: `PeriodKey`, `buildPeriodKey`, `colorizeFrame`, `periodHistogram` (Tasks 3–4); `shippedPaletteSpec` (Task 5); `ISOLATION_CONTRAST_FLOOR` (Task 2); `FrameMessage.periodKey` (Task 6).
- Produces:
  - `src/domain`: `ISOLATION_DIM_FACTOR = 0.12`, `dimChannel(value: number): number` (`Math.round(value * 0.12)`), `dimColor(color: Rgba): Rgba` (alpha kept).
  - `colorizeFrame(frame, view, periodKey?, isolatedPeriod?: number)`: in the period view, every pixel that is not an attracting cycle of `isolatedPeriod` is drawn with `dimColor`.
  - `Renderer.colorize(frame, view, isolatedPeriod?: number): RasterFrame`; `RasterFrame.isolatedPeriod?: number` (period view only).
  - `RenderMessage.isolatedPeriod?: number`; `FrameMessage.isolatedPeriod?: number`. The worker never puts it in `semanticRequestKey`; a change of isolation on a cached frame is a `recolor` delivery.
  - `worstIsolationContrast(factor: number): number` in `tests/unit/palette/palette-metrics.ts`.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/domain/period-isolation-dim.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  dimChannel,
  dimColor,
  ISOLATION_DIM_FACTOR,
  OTHER_PERIODS_COLOR,
  PERIOD_EMPHASIS_PALETTE,
} from '../../../src/domain';

describe('isolation dimming', () => {
  it('scales each channel by the isolation factor and rounds', () => {
    expect(ISOLATION_DIM_FACTOR).toBe(0.12);
    expect(dimChannel(0)).toBe(0);
    expect(dimChannel(255)).toBe(31);
    expect(dimChannel(100)).toBe(12);
    expect(dimChannel(4)).toBe(0);
    expect(dimChannel(5)).toBe(1);
  });

  it('dims every channel but alpha and never brightens', () => {
    expect(dimColor([240, 228, 66, 255])).toEqual([29, 27, 8, 255]);
    expect(dimColor(OTHER_PERIODS_COLOR)).toEqual([22, 22, 22, 255]);
    for (const color of [...PERIOD_EMPHASIS_PALETTE, OTHER_PERIODS_COLOR]) {
      const dimmed = dimColor(color);
      for (let channel = 0; channel < 3; channel += 1) {
        expect(dimmed[channel]).toBeLessThanOrEqual(color[channel] ?? 0);
      }
      expect(dimmed[3]).toBe(color[3]);
    }
  });
});
```

Create `tests/unit/palette/isolation-contrast.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { dimColor, ISOLATION_DIM_FACTOR } from '../../../src/domain';
import { ISOLATION_CONTRAST_FLOOR } from './palette-floors';
import { shippedPaletteSpec, worstIsolationContrast } from './palette-metrics';

describe('period isolation contrast (MI-UX-018, WCAG 2.2 SC 1.4.11)', () => {
  it('keeps every isolated colour at 3:1 against every dimmed colour in every vision', () => {
    expect(worstIsolationContrast(ISOLATION_DIM_FACTOR)).toBeGreaterThanOrEqual(
      ISOLATION_CONTRAST_FLOOR,
    );
  });

  it('uses the largest 0.02 step that meets the floor (the experiment’s 0.18 does not)', () => {
    expect(worstIsolationContrast(ISOLATION_DIM_FACTOR + 0.02)).toBeLessThan(
      ISOLATION_CONTRAST_FLOOR,
    );
    expect(worstIsolationContrast(0.18)).toBeLessThan(ISOLATION_CONTRAST_FLOOR);
  });

  it('matches the production dimming function', () => {
    const [yellow] = shippedPaletteSpec().periodClasses;
    expect(yellow).toBeDefined();
    if (yellow === undefined) return;
    const production = dimColor([yellow[0], yellow[1], yellow[2], 255]);
    expect(production.slice(0, 3)).toEqual(
      yellow.map((channel) => Math.round(channel * ISOLATION_DIM_FACTOR)),
    );
  });
});
```

In `tests/unit/render/colorize.test.ts`, replace

```ts
  colorForUnresolved,
  EMPTY_PERIOD_KEY,
```

with

```ts
  colorForUnresolved,
  dimColor,
  EMPTY_PERIOD_KEY,
```

replace

```ts
const referenceColorize = (frame: SemanticFrame, view: SemanticView): Uint8ClampedArray => {
```

with

```ts
const referenceColorize = (
  frame: SemanticFrame,
  view: SemanticView,
  isolatedPeriod?: number,
): Uint8ClampedArray => {
```

replace

```ts
        view,
        periodKey,
      );
      rgba.set(color, (y * width + x) * 4);
```

with

```ts
        view,
        periodKey,
      );
      const dimmed =
        view === 'period' &&
        isolatedPeriod !== undefined &&
        !(unpackStatus(word) === 2 && unpackPeriod(word) === isolatedPeriod);
      rgba.set(dimmed ? dimColor(color) : color, (y * width + x) * 4);
```

and append to the end of the file:

```ts

describe('period isolation', () => {
  // Areas: p1 6, p2 5, p3 4, p4 3, p5 2, p6 1, p7 1; then escaped and unresolved.
  const isolationFrame = (): SemanticFrame =>
    syntheticFrame(4, [
      ...[1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 5, 5, 6, 7].map(
        (period) => [2, period] as const,
      ),
      [1, 0],
      [0, 0],
    ]);

  it('keeps the isolated period and dims every other pixel with dimColor', () => {
    const frame = isolationFrame();
    const raster = new CpuRenderer().colorize(frame, 'period', 3);

    expect(raster.isolatedPeriod).toBe(3);
    expect(pixelAt(raster.rgba, 11)).toEqual(PERIOD_EMPHASIS_PALETTE[2]);
    expect(pixelAt(raster.rgba, 0)).toEqual(dimColor(PERIOD_EMPHASIS_PALETTE[0] ?? [0, 0, 0, 0]));
    expect(pixelAt(raster.rgba, 20)).toEqual(dimColor(OTHER_PERIODS_COLOR));
    expect(raster.rgba).toEqual(referenceColorize(frame, 'period', 3));
  });

  it('isolates by period, not by colour: one grey period stays, the other grey dims', () => {
    const raster = new CpuRenderer().colorize(isolationFrame(), 'period', 6);

    expect(pixelAt(raster.rgba, 20)).toEqual(OTHER_PERIODS_COLOR);
    expect(pixelAt(raster.rgba, 21)).toEqual(dimColor(OTHER_PERIODS_COLOR));
  });

  it('leaves the period key unchanged: isolation is a palette input', () => {
    const renderer = new CpuRenderer();
    const frame = isolationFrame();

    expect(renderer.colorize(frame, 'period', 3).periodKey).toEqual(
      renderer.colorize(frame, 'period').periodKey,
    );
  });

  it('ignores isolation outside the period view', () => {
    const renderer = new CpuRenderer();
    const frame = isolationFrame();
    for (const view of ['stability', 'multiplier'] as const) {
      const raster = renderer.colorize(frame, view, 3);
      expect(raster).not.toHaveProperty('isolatedPeriod');
      expect(raster.rgba).toEqual(renderer.colorize(frame, view).rgba);
    }
  });

  it('matches the reference on a rendered frame', async () => {
    const renderer = new CpuRenderer();
    const frames: SemanticFrame[] = [];
    await renderer.render(
      {
        viewport: { center: { re: -0.75, im: 0 }, spanY: 2.5 },
        size: { width: 97, height: 61 },
        quality: { maxIterations: 256, maxPeriod: 16, coarseStride: 8 },
      },
      new AbortController().signal,
      (frame) => {
        frames.push(frame);
      },
    );
    const stable = frames.at(-1);
    expect(stable).toBeDefined();
    if (stable === undefined) return;
    expect(colorizeFrame(stable, 'period', undefined, 2)).toEqual(
      referenceColorize(stable, 'period', 2),
    );
  });
});
```

Append to the end of `tests/unit/worker/runtime.test.ts` (every name it uses is already imported there):

```ts

describe('RenderWorkerRuntime period isolation', () => {
  type FrameOut = Extract<WorkerToMainMessage, { type: 'frame' }>;
  const framesOf = (messages: readonly WorkerToMainMessage[]): FrameOut[] =>
    messages.filter((message): message is FrameOut => message.type === 'frame');
  const cpu = new CpuRenderer();
  const size = { width: 2, height: 2 };
  const viewport = { center: { re: 0, im: 0 }, spanY: 3 };

  /** Top row period 3, bottom row period 7. */
  const twoPeriodFrame = (stage: SemanticFrame['stage'] = 'stable'): SemanticFrame => ({
    ...semanticFrame(size, stage),
    bands: [
      {
        y0: 0,
        y1: size.height,
        packedStatusPeriod: Uint32Array.of(
          packStatusPeriod(2, 3),
          packStatusPeriod(2, 3),
          packStatusPeriod(2, 7),
          packStatusPeriod(2, 7),
        ),
        smoothIterationOrMultiplierMagnitude: new Float64Array(4).fill(0.5),
        multiplierAngle: new Float64Array(4),
      },
    ],
  });

  const period = (isolatedPeriod?: number) =>
    ({
      type: 'render',
      semanticView: 'period',
      viewport,
      size,
      ...(isolatedPeriod === undefined ? {} : { isolatedPeriod }),
    }) as const;

  it('recolors the cached frame for each isolation change without reclassifying', async () => {
    const messages: WorkerToMainMessage[] = [];
    const render = vi.fn(
      async (
        _request: DynamicsRenderRequest,
        _signal: AbortSignal,
        onFrame: SemanticFrameConsumer,
      ) => {
        await onFrame(twoPeriodFrame());
      },
    );
    const colorize = vi.fn((frame: SemanticFrame, view: SemanticView, isolated?: number) =>
      cpu.colorize(frame, view, isolated),
    );
    const runtime = new RenderWorkerRuntime(
      { postMessage: (m) => messages.push(m) },
      {
        inspect: () => ({ status: 'unresolved', iterations: 1, evidence: ['iteration-limit'] }),
        render,
        colorize,
      },
    );

    await runtime.handle({ ...period(), requestId: 1 });
    await runtime.handle({ ...period(7), requestId: 2 });
    await runtime.handle({ ...period(7), requestId: 3 });
    await runtime.handle({ ...period(), requestId: 4 });

    expect(render).toHaveBeenCalledOnce();
    expect(colorize.mock.calls.map((call) => call[2])).toEqual([undefined, 7, 7, undefined]);
    const frames = framesOf(messages);
    expect(frames.map((frame) => frame.provenance.source)).toEqual([
      'computed',
      'recolor',
      'semantic-cache',
      'recolor',
    ]);
    expect(frames.map((frame) => frame.isolatedPeriod)).toEqual([undefined, 7, 7, undefined]);
    // The period key and the semantic cache key ignore isolation.
    for (const frame of frames) expect(frame.periodKey).toEqual(frames[0]?.periodKey);
    // Period 3 (top row) is dimmed only while period 7 is isolated.
    expect(frames[1]?.rgba[0]).toBeLessThan(frames[0]?.rgba[0] ?? 0);
    expect([...(frames[1]?.rgba.slice(8, 12) ?? [])]).toEqual([
      ...(frames[0]?.rgba.slice(8, 12) ?? []),
    ]);
    expect(frames[3]?.rgba).toEqual(frames[0]?.rgba);
  });

  it('applies an isolation sent during a computation to its replay and later frames', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const messages: WorkerToMainMessage[] = [];
    const runtime = new RenderWorkerRuntime(
      { postMessage: (m) => messages.push(m) },
      {
        inspect: () => ({ status: 'unresolved', iterations: 1, evidence: ['iteration-limit'] }),
        render: async (_request, _signal, onFrame) => {
          await onFrame(twoPeriodFrame('coarse'));
          await gate;
          await onFrame(twoPeriodFrame());
        },
        colorize: (frame, view, isolated) => cpu.colorize(frame, view, isolated),
      },
    );

    const first = runtime.handle({ ...period(), requestId: 'a' });
    await Promise.resolve();
    await runtime.handle({ ...period(3), requestId: 'b' });
    release();
    await first;

    const frames = framesOf(messages);
    expect(frames.map((frame) => [frame.provenance.source, frame.isolatedPeriod])).toEqual([
      ['computed', undefined],
      ['inflight-replay', 3],
      ['computed', 3],
    ]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/domain/period-isolation-dim.test.ts tests/unit/palette/isolation-contrast.test.ts tests/unit/render/colorize.test.ts tests/unit/worker/runtime.test.ts`
Expected: FAIL; `dimChannel` and `dimColor` are not exported, `worstIsolationContrast` is not exported, and the colorizer ignores the isolated period.

- [ ] **Step 3: Add the dimming function**

Append to the end of `src/domain/period-emphasis.ts`:

```ts

/**
 * Isolating a period from the legend (MI-UX-018) keeps that period's pixels
 * and scales every channel of every other pixel by this factor. 0.12 is the
 * largest step of 0.02 at which the darkest emphasized colour (blue, under
 * simulated deutan vision) keeps 3:1 non-text contrast (WCAG 2.2 SC 1.4.11)
 * against every dimmed raster colour; the 0.18 of the cue experiment gives
 * 2.6:1 (tests/unit/palette/isolation-contrast.test.ts).
 */
export const ISOLATION_DIM_FACTOR = 0.12;

/** One dimmed channel value. */
export const dimChannel = (value: number): number => Math.round(value * ISOLATION_DIM_FACTOR);

/** A colour as it is drawn around an isolated period. */
export const dimColor = (color: Rgba): Rgba => [
  dimChannel(color[0]),
  dimChannel(color[1]),
  dimChannel(color[2]),
  color[3],
];
```

In `src/domain/index.ts`, replace

```ts
  buildPeriodKey,
  colorForPeriod,
  EMPTY_PERIOD_KEY,
  OTHER_PERIODS_COLOR,
```

with

```ts
  buildPeriodKey,
  colorForPeriod,
  dimChannel,
  dimColor,
  EMPTY_PERIOD_KEY,
  ISOLATION_DIM_FACTOR,
  OTHER_PERIODS_COLOR,
```

In `tests/unit/palette/palette-metrics.ts`, replace

```ts
import { deltaE, type Rgb, type Vision, VISIONS } from './color-science';
```

with

```ts
import { contrastRatio, deltaE, simulate, type Rgb, type Vision, VISIONS } from './color-science';
```

and append to the end of the file:

```ts

/**
 * Lowest WCAG contrast between an isolated emphasized colour and any other
 * period-view colour dimmed by `factor` (legend isolation, MI-UX-018), over
 * normal and simulated protan, deutan and tritan vision.
 */
export const worstIsolationContrast = (factor: number): number => {
  const spec = shippedPaletteSpec();
  const emphasized = spec.periodClasses.slice(0, 5);
  const surroundings: readonly Rgb[] = [
    ...spec.periodClasses,
    ...spec.escaped.period,
    ...spec.unresolvedCells,
  ];
  const dim = (color: Rgb): Rgb => [
    Math.round(color[0] * factor),
    Math.round(color[1] * factor),
    Math.round(color[2] * factor),
  ];
  let worst = Number.POSITIVE_INFINITY;
  for (const isolated of emphasized) {
    for (const other of surroundings) {
      if (other === isolated) continue;
      for (const vision of VISIONS) {
        worst = Math.min(
          worst,
          contrastRatio(simulate(isolated, vision), simulate(dim(other), vision)),
        );
      }
    }
  }
  return worst;
};
```

- [ ] **Step 4: Dim around the isolated period in the colorizer**

In `src/render/colorize.ts`, replace

```ts
import {
  buildPeriodKey,
  EMPTY_PERIOD_KEY,
```

with

```ts
import {
  buildPeriodKey,
  dimChannel,
  EMPTY_PERIOD_KEY,
```

replace

```ts
/**
 * Colorizes `frame` in `view`. The period view draws with `periodKey`, which
 * defaults to the frame's own ranking; pass the key you report so the legend
 * and the raster cannot disagree.
 */
export const colorizeFrame = (
  frame: SemanticFrame,
  view: SemanticView,
  periodKey: PeriodKey = view === 'period'
    ? buildPeriodKey(periodHistogram(frame))
    : EMPTY_PERIOD_KEY,
): Uint8ClampedArray<ArrayBuffer> => {
  const { width } = frame.size;
  const rgba = new Uint8ClampedArray(width * frame.size.height * 4);
  const stride = frame.sampleStride;
  const periodColors = periodColorLookup(periodKey);
```

with

```ts
/** dimColor of src/domain, in place: the pixel is not of the isolated period. */
const dimPixel = (rgba: Uint8ClampedArray, offset: number): void => {
  rgba[offset] = dimChannel(rgba[offset] ?? 0);
  rgba[offset + 1] = dimChannel(rgba[offset + 1] ?? 0);
  rgba[offset + 2] = dimChannel(rgba[offset + 2] ?? 0);
};

/**
 * Colorizes `frame` in `view`. The period view draws with `periodKey`, which
 * defaults to the frame's own ranking; pass the key you report so the legend
 * and the raster cannot disagree. With `isolatedPeriod` (period view only)
 * every pixel that is not an attracting cycle of that period is dimmed.
 */
export const colorizeFrame = (
  frame: SemanticFrame,
  view: SemanticView,
  periodKey: PeriodKey = view === 'period'
    ? buildPeriodKey(periodHistogram(frame))
    : EMPTY_PERIOD_KEY,
  isolatedPeriod?: number,
): Uint8ClampedArray<ArrayBuffer> => {
  const { width } = frame.size;
  const rgba = new Uint8ClampedArray(width * frame.size.height * 4);
  const stride = frame.sampleStride;
  const periodColors = periodColorLookup(periodKey);
  // -1 never matches a packed word: no isolation.
  const isolatedWord =
    view === 'period' && isolatedPeriod !== undefined
      ? (PACK_STATUS_CODES.attracting << PACK_PERIOD_BITS) | isolatedPeriod
      : -1;
```

and replace

```ts
      } else {
        writeUnresolved(rgba, offset, x, y, stride);
      }
      x += 1;
```

with

```ts
      } else {
        writeUnresolved(rgba, offset, x, y, stride);
      }
      if (isolatedWord !== -1 && word !== isolatedWord) dimPixel(rgba, offset);
      x += 1;
```

The packed word of an attracting pixel of period `p` is `(2 << 24) | p`, so one integer comparison decides isolation for every status.

- [ ] **Step 5: Carry isolation through the renderer**

In `src/render/renderer.ts`, replace

```ts
  /** Period view only: the period-to-color mapping this raster was drawn with. */
  readonly periodKey?: PeriodKey;
}
```

with

```ts
  /** Period view only: the period-to-color mapping this raster was drawn with. */
  readonly periodKey?: PeriodKey;
  /** Period view only: the period left undimmed (legend isolation, MI-UX-018). */
  readonly isolatedPeriod?: number;
}
```

and replace

```ts
  colorize(frame: SemanticFrame, view: SemanticView): RasterFrame;
```

with

```ts
  /**
   * Maps a semantic frame to RGBA. `isolatedPeriod` (period view only) dims
   * every pixel not of that period; it is a palette input, so it never
   * enters the semantic cache key.
   */
  colorize(frame: SemanticFrame, view: SemanticView, isolatedPeriod?: number): RasterFrame;
```

In `src/render/cpu-renderer.ts`, replace the `colorize` method (as written in Task 4)

```ts
  public colorize(frame: SemanticFrame, view: SemanticView): RasterFrame {
    // The period view ranks this frame's own histogram (PLAN §8, Q1), so a
    // recolor of a cached frame reproduces the key without reclassifying.
    const periodKey = view === 'period' ? buildPeriodKey(periodHistogram(frame)) : undefined;
    const rgba = colorizeFrame(frame, view, periodKey);
    return {
      stage: frame.stage,
      size: frame.size,
      rgba,
      progress: frame.progress,
      ...(periodKey === undefined ? {} : { periodKey }),
    };
  }
```

with

```ts
  public colorize(frame: SemanticFrame, view: SemanticView, isolatedPeriod?: number): RasterFrame {
    // The period view ranks this frame's own histogram (PLAN §8, Q1), so a
    // recolor of a cached frame reproduces the key without reclassifying.
    const periodKey = view === 'period' ? buildPeriodKey(periodHistogram(frame)) : undefined;
    const isolated = periodKey === undefined ? undefined : isolatedPeriod;
    const rgba = colorizeFrame(frame, view, periodKey, isolated);
    return {
      stage: frame.stage,
      size: frame.size,
      rgba,
      progress: frame.progress,
      ...(periodKey === undefined ? {} : { periodKey }),
      ...(isolated === undefined ? {} : { isolatedPeriod: isolated }),
    };
  }
```

- [ ] **Step 6: Carry isolation through the worker without touching the cache key**

In `src/worker/protocol.ts`, replace

```ts
  readonly semanticView: SemanticView;
  readonly quality?: Partial<RenderQuality>;
}
```

with

```ts
  readonly semanticView: SemanticView;
  readonly quality?: Partial<RenderQuality>;
  /**
   * Period view only: dim every pixel not of this period (legend isolation,
   * MI-UX-018). A palette input: never part of the semantic cache key.
   */
  readonly isolatedPeriod?: number;
}
```

replace

```ts
 * - `semantic-cache`: a completed cached frame in the semantic view it was
 *   last delivered in.
 * - `recolor`: a completed cached frame delivered in a different semantic
 *   view (the view-only recolor path).
```

with

```ts
 * - `semantic-cache`: a completed cached frame in the semantic view and
 *   period isolation it was last delivered in.
 * - `recolor`: a completed cached frame delivered in a different semantic
 *   view or period isolation (the palette-only recolor path).
```

and replace

```ts
  readonly periodKey?: PeriodKey;
}
```

with

```ts
  readonly periodKey?: PeriodKey;
  /** Period view only: the period the raster leaves undimmed. */
  readonly isolatedPeriod?: number;
}
```

In `src/worker/runtime.ts` (as left by Task 6), make these replacements. `dynamicsRequest` and `semanticRequestKey` stay unchanged, so isolation can never reach the cache key.

Replace

```ts
  semanticView: SemanticView;
  lastFrame?: SemanticFrame;
}
```

with

```ts
  semanticView: SemanticView;
  /** Period isolation of this computation's deliveries (a palette input). */
  isolatedPeriod: number | undefined;
  lastFrame?: SemanticFrame;
}
```

replace

```ts
  /** The semantic view the cached frame was most recently delivered in. */
  view: SemanticView;
}
```

with

```ts
  /** The semantic view the cached frame was most recently delivered in. */
  view: SemanticView;
  /** The period isolation it was most recently delivered with. */
  isolatedPeriod: number | undefined;
}
```

replace

```ts
    view: SemanticView,
    origin: {
```

with

```ts
    view: SemanticView,
    isolatedPeriod: number | undefined,
    origin: {
```

replace

```ts
    const raster = this.#renderer.colorize(frame, view);
```

with

```ts
    // Renderers that predate isolation see the two-argument call unchanged.
    const raster =
      isolatedPeriod === undefined
        ? this.#renderer.colorize(frame, view)
        : this.#renderer.colorize(frame, view, isolatedPeriod);
```

replace

```ts
      ...(raster.periodKey === undefined ? {} : { periodKey: raster.periodKey }),
    };
```

with

```ts
      ...(raster.periodKey === undefined ? {} : { periodKey: raster.periodKey }),
      ...(raster.isolatedPeriod === undefined ? {} : { isolatedPeriod: raster.isolatedPeriod }),
    };
```

replace

```ts
      const source = cachedOrigin.view === message.semanticView ? 'semantic-cache' : 'recolor';
      cachedOrigin.view = message.semanticView;
      this.#postFrame(message.requestId, cached, message.semanticView, {
```

with

```ts
      // Isolation is a palette input like the view: changing it recolors.
      const source =
        cachedOrigin.view === message.semanticView &&
        cachedOrigin.isolatedPeriod === message.isolatedPeriod
          ? 'semantic-cache'
          : 'recolor';
      cachedOrigin.view = message.semanticView;
      cachedOrigin.isolatedPeriod = message.isolatedPeriod;
      this.#postFrame(message.requestId, cached, message.semanticView, message.isolatedPeriod, {
```

replace

```ts
      this.#activeRender.semanticView = message.semanticView;
      if (this.#activeRender.lastFrame !== undefined) {
        this.#postFrame(message.requestId, this.#activeRender.lastFrame, message.semanticView, {
          source: 'inflight-replay',
          computeId: this.#activeRender.computeId,
        });
      }
```

with

```ts
      this.#activeRender.semanticView = message.semanticView;
      this.#activeRender.isolatedPeriod = message.isolatedPeriod;
      if (this.#activeRender.lastFrame !== undefined) {
        this.#postFrame(
          message.requestId,
          this.#activeRender.lastFrame,
          message.semanticView,
          message.isolatedPeriod,
          {
            source: 'inflight-replay',
            computeId: this.#activeRender.computeId,
          },
        );
      }
```

replace

```ts
      semanticView: message.semanticView,
    };
    this.#activeRender = active;
```

with

```ts
      semanticView: message.semanticView,
      isolatedPeriod: message.isolatedPeriod,
    };
    this.#activeRender = active;
```

replace

```ts
            view: active.semanticView,
          };
```

with

```ts
            view: active.semanticView,
            isolatedPeriod: active.isolatedPeriod,
          };
```

and replace

```ts
        this.#postFrame(active.requestId, frame, active.semanticView, {
```

with

```ts
        this.#postFrame(active.requestId, frame, active.semanticView, active.isolatedPeriod, {
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/domain/period-isolation-dim.test.ts tests/unit/palette tests/unit/render tests/unit/worker`
Expected: PASS, no failed tests. The existing runtime test "coalesces a view change into an in-progress dynamics render" still sees `colorize(frame, 'multiplier')` with two arguments.

- [ ] **Step 8: Record the isolation contrast in the evidence tool**

In `tools/palette_metrics.ts`, replace

```ts
import {
  LABEL_CONTRAST_FLOOR,
  PALETTE_FLOORS,
  PHASE1_FLOORS,
} from '../tests/unit/palette/palette-floors';
```

with

```ts
import { ISOLATION_DIM_FACTOR } from '../src/domain';
import {
  ISOLATION_CONTRAST_FLOOR,
  LABEL_CONTRAST_FLOOR,
  PALETTE_FLOORS,
  PHASE1_FLOORS,
} from '../tests/unit/palette/palette-floors';
```

replace

```ts
  shippedPaletteSpec,
  type PaletteSpec,
```

with

```ts
  shippedPaletteSpec,
  worstIsolationContrast,
  type PaletteSpec,
```

replace

```ts
  palettes: palettes().map((palette) => ({
```

with

```ts
  isolation: {
    dimFactor: ISOLATION_DIM_FACTOR,
    worstContrast: Number(worstIsolationContrast(ISOLATION_DIM_FACTOR).toFixed(2)),
    floor: ISOLATION_CONTRAST_FLOOR,
    pass: worstIsolationContrast(ISOLATION_DIM_FACTOR) >= ISOLATION_CONTRAST_FLOOR,
  },
  palettes: palettes().map((palette) => ({
```

and in `summary`, replace

```ts
        `- \`${overlay.selector}\`: ${overlay.worstContrast.toFixed(2)}:1${overlay.pass ? '' : ' ✗'}`,
    ),
    '',
  ].join('\n');
```

with

```ts
        `- \`${overlay.selector}\`: ${overlay.worstContrast.toFixed(2)}:1${overlay.pass ? '' : ' ✗'}`,
    ),
    '',
    '## Period isolation',
    '',
    `Legend isolation dims every other pixel to ${data.isolation.dimFactor} of its value. Worst contrast of an isolated emphasized colour against any dimmed colour, over the four visions: ${data.isolation.worstContrast.toFixed(2)}:1 (floor ${data.isolation.floor}:1)${data.isolation.pass ? '' : ' ✗'}.`,
    '',
  ].join('\n');
```

Run: `npm run evidence:palette -- .evidence-build/palette-dry-run`
Expected: the output ends with a `## Period isolation` section reading `… dims every other pixel to 0.12 of its value. … 3.09:1 (floor 3:1).`

- [ ] **Step 9: Format, check and commit**

```bash
npx prettier --write src/domain src/render src/worker tests/unit/domain/period-isolation-dim.test.ts tests/unit/palette tests/unit/render/colorize.test.ts tests/unit/worker/runtime.test.ts tools/palette_metrics.ts
npm run check
npm run fixtures:kernel-golden -- --check
npx playwright test
git add src/domain/period-emphasis.ts src/domain/index.ts src/render/colorize.ts src/render/renderer.ts src/render/cpu-renderer.ts src/worker/protocol.ts src/worker/runtime.ts tests/unit/domain/period-isolation-dim.test.ts tests/unit/palette/isolation-contrast.test.ts tests/unit/palette/palette-metrics.ts tests/unit/render/colorize.test.ts tests/unit/worker/runtime.test.ts tools/palette_metrics.ts
git commit -F - <<'EOF'
Period view: isolate a period when colorizing (dim 0.12, 3:1), outside the cache key

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 10: Legend isolation controls

**Files:**

- Create: `src/ui/period-isolation.ts`
- Modify: `src/ui/semantic-legend.ts` (replace), `src/ui/application.ts`, `src/styles.css`
- Test: `tests/unit/ui/period-isolation.test.ts` (new), `tests/e2e/explorer.spec.ts`

**Interfaces:**

- Consumes: `legendModel` and its item types (Task 7); the Task 8 legend and its `presentFrame` line; `RenderMessage.isolatedPeriod` and `FrameMessage.isolatedPeriod` (Task 9).
- Produces:
  - `src/ui/period-isolation.ts`: `interface IsolationState { pressed; hovered; focused }` (each `number | undefined`), `NO_ISOLATION`, `type IsolationEvent`, `nextIsolation(state, event): IsolationState`, `isolatedPeriodOf(state): number | undefined`.
  - `createSemanticLegend(): SemanticLegend` with `update(view, periodKey?, stage?: 'coarse' | 'stable')` (stage defaults to `'stable'`; the existing calls `const legend = createSemanticLegend();` and `legend.update(state.semanticView)` keep working) and the new `onIsolate(listener: (period: number | undefined) => void)`.
  - `nextIsolation`'s `available` event carries `final: boolean`: hover and focus on unlisted periods drop on any frame, a pressed period only on a stable (`final`) frame.
  - DOM contract: each emphasized period is `li.legend__item--period.legend__item--control[data-period]` holding `button.legend__entry[data-period][aria-pressed]` with the swatch, the label and detail, and a `span.legend__state` reading "Isolated" (shown only when pressed). The explorer shell carries `data-isolated-period` while the presented raster is isolated.

- [ ] **Step 1: Write the failing unit test**

Create `tests/unit/ui/period-isolation.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  isolatedPeriodOf,
  NO_ISOLATION,
  nextIsolation,
  type IsolationEvent,
  type IsolationState,
} from '../../../src/ui/period-isolation';

const run = (...events: readonly IsolationEvent[]): IsolationState =>
  events.reduce(nextIsolation, NO_ISOLATION);

describe('legend period isolation', () => {
  it('isolates while an entry is hovered or focused, and restores after', () => {
    expect(isolatedPeriodOf(run({ type: 'hover', period: 2 }))).toBe(2);
    expect(
      isolatedPeriodOf(run({ type: 'hover', period: 2 }, { type: 'unhover', period: 2 })),
    ).toBe(undefined);
    expect(isolatedPeriodOf(run({ type: 'focus', period: 4 }))).toBe(4);
    expect(isolatedPeriodOf(run({ type: 'focus', period: 4 }, { type: 'blur', period: 4 }))).toBe(
      undefined,
    );
  });

  it('keeps an activated entry isolated after focus leaves it', () => {
    const state = run(
      { type: 'focus', period: 1 },
      { type: 'activate', period: 1 },
      { type: 'blur', period: 1 },
    );

    expect(state.pressed).toBe(1);
    expect(isolatedPeriodOf(state)).toBe(1);
  });

  it('restores the full view on a second activation, focus and hover included', () => {
    const state = run(
      { type: 'hover', period: 1 },
      { type: 'focus', period: 1 },
      { type: 'activate', period: 1 },
      { type: 'activate', period: 1 },
    );

    expect(state).toEqual(NO_ISOLATION);
    expect(isolatedPeriodOf(state)).toBeUndefined();
  });

  it('toggles on a tap (focus then activation) and off on the next tap', () => {
    const tapped = run({ type: 'focus', period: 3 }, { type: 'activate', period: 3 });
    expect(isolatedPeriodOf(tapped)).toBe(3);
    expect(
      isolatedPeriodOf(nextIsolation(tapped, { type: 'activate', period: 3 })),
    ).toBeUndefined();
  });

  it('restores on Escape while the entry keeps focus', () => {
    const state = run(
      { type: 'focus', period: 2 },
      { type: 'activate', period: 2 },
      { type: 'escape' },
    );

    expect(isolatedPeriodOf(state)).toBeUndefined();
    expect(isolatedPeriodOf(nextIsolation(state, { type: 'activate', period: 2 }))).toBe(2);
  });

  it('previews another period over the pressed one, then returns to it', () => {
    const pressed = run({ type: 'activate', period: 1 });
    const previewing = nextIsolation(pressed, { type: 'hover', period: 5 });

    expect(isolatedPeriodOf(previewing)).toBe(5);
    expect(isolatedPeriodOf(nextIsolation(previewing, { type: 'unhover', period: 5 }))).toBe(1);
  });

  it('ignores a stale leave event for another entry', () => {
    const state = run({ type: 'hover', period: 2 }, { type: 'unhover', period: 3 });

    expect(isolatedPeriodOf(state)).toBe(2);
  });

  it('resets on a view change and drops periods a stable key no longer lists', () => {
    const state = run({ type: 'activate', period: 4 }, { type: 'focus', period: 2 });

    expect(nextIsolation(state, { type: 'reset' })).toEqual(NO_ISOLATION);
    expect(nextIsolation(state, { type: 'available', periods: [1, 2, 3], final: true })).toEqual({
      pressed: undefined,
      hovered: undefined,
      focused: 2,
    });
  });

  it('keeps a pressed isolation through a coarse frame that lacks the period, then clears it on a stable frame without it', () => {
    const pressed = run({ type: 'activate', period: 4 }, { type: 'hover', period: 4 });
    const coarse = nextIsolation(pressed, { type: 'available', periods: [1, 2], final: false });

    expect(coarse).toEqual({ pressed: 4, hovered: undefined, focused: undefined });
    expect(isolatedPeriodOf(coarse)).toBe(4);
    const stableWithIt = nextIsolation(coarse, {
      type: 'available',
      periods: [1, 2, 4],
      final: true,
    });
    expect(isolatedPeriodOf(stableWithIt)).toBe(4);
    const stableWithout = nextIsolation(coarse, {
      type: 'available',
      periods: [1, 2, 3],
      final: true,
    });
    expect(isolatedPeriodOf(stableWithout)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/ui/period-isolation.test.ts`
Expected: FAIL; `../../../src/ui/period-isolation` cannot be resolved.

- [ ] **Step 3: Write the state machine**

Create `src/ui/period-isolation.ts`:

```ts
/**
 * Legend isolation (MI-UX-018, owner decision 2026-10-17): hovering,
 * focusing or activating an emphasized period's legend entry dims every
 * pixel not of that period. Pure state so the rules are unit-tested; the
 * legend feeds it DOM events and the renderer recolors with the result.
 *
 * - Hover (mouse only) and keyboard focus isolate while they last.
 * - Activation (click, Enter, Space, or a tap) toggles a persistent
 *   isolation; activating the pressed entry again, or Escape, restores the
 *   full view, including any hover or focus isolation in effect.
 * - A view change resets everything. Each new frame drops hover and focus
 *   on periods its key no longer lists (their buttons are gone). A pressed
 *   period is dropped only by a stable frame that does not list it: a coarse
 *   preview routinely lacks small periods, so the isolation survives it, and
 *   until the stable frame arrives the raster shows only dimmed pixels.
 */

export interface IsolationState {
  /** The persistent isolation, shown as `aria-pressed="true"`. */
  readonly pressed: number | undefined;
  readonly hovered: number | undefined;
  readonly focused: number | undefined;
}

export const NO_ISOLATION: IsolationState = Object.freeze({
  pressed: undefined,
  hovered: undefined,
  focused: undefined,
});

export type IsolationEvent =
  | {
      readonly type: 'hover' | 'unhover' | 'focus' | 'blur' | 'activate';
      readonly period: number;
    }
  | { readonly type: 'escape' | 'reset' }
  | {
      readonly type: 'available';
      readonly periods: readonly number[];
      /** True for a stable frame: only then can a pressed period be dropped. */
      readonly final: boolean;
    };

const unless = (slot: number | undefined, period: number): number | undefined =>
  slot === period ? undefined : slot;

const keepListed = (slot: number | undefined, periods: readonly number[]): number | undefined =>
  slot !== undefined && periods.includes(slot) ? slot : undefined;

export const nextIsolation = (state: IsolationState, event: IsolationEvent): IsolationState => {
  switch (event.type) {
    case 'hover':
      return { ...state, hovered: event.period };
    case 'unhover':
      return { ...state, hovered: unless(state.hovered, event.period) };
    case 'focus':
      return { ...state, focused: event.period };
    case 'blur':
      return { ...state, focused: unless(state.focused, event.period) };
    case 'activate':
      return state.pressed === event.period ? NO_ISOLATION : { ...state, pressed: event.period };
    case 'escape':
    case 'reset':
      return NO_ISOLATION;
    case 'available':
      return {
        pressed: event.final ? keepListed(state.pressed, event.periods) : state.pressed,
        hovered: keepListed(state.hovered, event.periods),
        focused: keepListed(state.focused, event.periods),
      };
  }
};

/** The period the raster isolates: a hover or focus preview, else the pressed entry. */
export const isolatedPeriodOf = (state: IsolationState): number | undefined =>
  state.hovered ?? state.focused ?? state.pressed;
```

Run: `npx vitest run tests/unit/ui/period-isolation.test.ts`
Expected: PASS; all tests in the file pass.

- [ ] **Step 4: Write the failing e2e tests**

In `tests/e2e/explorer.spec.ts`, insert these helpers directly above the line `test.describe('Mandelbrot Interiority explorer', () => {` (below the Task 8 helper `expectPeriodLegendMatchesRaster`), followed by one blank line:

```ts
/**
 * Legend isolation (MI-UX-018): counts canvas pixels drawn in the swatch
 * colour of `period`'s legend entry, and pixels of any other colour brighter
 * than the isolation dimming allows (dimChannel(255) = 31).
 */
const isolationPixels = async (
  page: Page,
  period: number,
): Promise<{ readonly kept: number; readonly undimmed: number }> =>
  page.evaluate((target) => {
    const swatch = document.querySelector<HTMLElement>(
      `.legend__entry[data-period="${target}"] .legend__swatch`,
    );
    const canvas = document.querySelector<HTMLCanvasElement>('.explorer__canvas');
    const context = canvas?.getContext('2d');
    if (!swatch || !canvas || !context) return { kept: -1, undimmed: -1 };
    const [red, green, blue] = (getComputedStyle(swatch).backgroundColor.match(/\d+/g) ?? []).map(
      Number,
    );
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let kept = 0;
    let undimmed = 0;
    for (let index = 0; index < data.length; index += 4) {
      const r = data[index] ?? 0;
      const g = data[index + 1] ?? 0;
      const b = data[index + 2] ?? 0;
      if (r === red && g === green && b === blue) kept += 1;
      else if (Math.max(r, g, b) > 31) undimmed += 1;
    }
    return { kept, undimmed };
  }, period);

/** Opens the period view and waits for its stable frame. */
const openPeriodView = async (page: Page): Promise<void> => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  await page.getByLabel('Interior view').selectOption('period');
  await expect(page.locator('#explorer')).toHaveAttribute('data-render-stage', 'stable', {
    timeout: 20_000,
  });
};
```

Insert these tests directly above the line `  test('contains point evidence and renderer recovery controls on a narrow phone', async ({` (inside the `Mandelbrot Interiority explorer` block, after the Task 8 320 px test), followed by one blank line:

```ts
  test('isolates a period from the legend by keyboard and restores it (MI-UX-018)', async ({
    page,
  }) => {
    await openPeriodView(page);
    const explorer = page.locator('#explorer');
    const legend = page.getByRole('region', { name: 'Semantic legend' });
    const periodOne = legend.locator('.legend__entry[data-period="1"]');
    await expect(periodOne).toHaveAttribute('aria-pressed', 'false');
    await expect(legend.getByText(/^Hover, focus or select a period/)).toBeVisible();

    // Keyboard focus previews the isolation.
    await periodOne.focus();
    await expect(explorer).toHaveAttribute('data-isolated-period', '1');
    await expect(explorer).toHaveAttribute('data-render-stage', 'stable');
    const isolated = await isolationPixels(page, 1);
    expect(isolated.kept).toBeGreaterThan(0);
    expect(isolated.undimmed).toBe(0);

    // Activation keeps it; Escape restores the full view.
    await page.keyboard.press('Enter');
    await expect(periodOne).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await expect(periodOne).toHaveAttribute('aria-pressed', 'false');
    await expect(explorer).not.toHaveAttribute('data-isolated-period');
    await expect(explorer).toHaveAttribute('data-render-stage', 'stable');
    expect((await isolationPixels(page, 1)).undimmed).toBeGreaterThan(0);

    // A second activation also restores it.
    await page.keyboard.press('Enter');
    await expect(explorer).toHaveAttribute('data-isolated-period', '1');
    await page.keyboard.press('Enter');
    await expect(periodOne).toHaveAttribute('aria-pressed', 'false');
    await expect(explorer).not.toHaveAttribute('data-isolated-period');

    // A pressed isolation ends when the interior view changes.
    await page.keyboard.press('Enter');
    await expect(explorer).toHaveAttribute('data-isolated-period', '1');
    await page.getByLabel('Interior view').selectOption('stability');
    await expect(explorer).not.toHaveAttribute('data-isolated-period');
    await page.getByLabel('Interior view').selectOption('period');
    await expect(explorer).toHaveAttribute('data-render-stage', 'stable');
    await expect(legend.locator('.legend__entry[data-period="1"]')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(explorer).not.toHaveAttribute('data-isolated-period');

    // Mouse hover previews another period while it lasts, without touching
    // the render status live region (no announcement per hover).
    const renderStatus = page.getByRole('status', { name: 'Render status' });
    const statusBefore = await renderStatus.textContent();
    await renderStatus.evaluate((element) => {
      const observed = window as typeof window & { __statusMutations?: number };
      observed.__statusMutations = 0;
      new MutationObserver((records) => {
        observed.__statusMutations = (observed.__statusMutations ?? 0) + records.length;
      }).observe(element, { childList: true, characterData: true, subtree: true });
    });
    const periodTwo = legend.locator('.legend__entry[data-period="2"]');
    await periodTwo.hover();
    await expect(explorer).toHaveAttribute('data-isolated-period', '2');
    await expect(explorer).toHaveAttribute('data-render-stage', 'stable');
    await page.mouse.move(0, 0);
    await expect(explorer).not.toHaveAttribute('data-isolated-period');
    await expect(explorer).toHaveAttribute('data-render-stage', 'stable');
    expect(await renderStatus.textContent()).toBe(statusBefore);
    expect(
      await page.evaluate(
        () => (window as typeof window & { __statusMutations?: number }).__statusMutations,
      ),
    ).toBe(0);
  });

  test('marks the isolated legend entry without colour in forced colours', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await openPeriodView(page);
    const legend = page.getByRole('region', { name: 'Semantic legend' });
    const periodOne = legend.locator('.legend__entry[data-period="1"]');
    const periodTwo = legend.locator('.legend__entry[data-period="2"]');

    await periodOne.click();
    await expect(periodOne).toHaveAttribute('aria-pressed', 'true');
    // Move focus away so only the pressed state remains.
    await page.getByLabel('Interior view').focus();
    await expect(page.locator('#explorer')).toHaveAttribute('data-isolated-period', '1');
    await expect(periodOne.locator('.legend__state')).toBeVisible();
    await expect(periodOne.locator('.legend__state')).toHaveText('Isolated');
    await expect(periodTwo.locator('.legend__state')).toBeHidden();
    const outline = await periodOne.evaluate((element) => {
      const style = getComputedStyle(element);
      return { style: style.outlineStyle, width: Number.parseFloat(style.outlineWidth) };
    });
    expect(outline.style).toBe('solid');
    expect(outline.width).toBeGreaterThanOrEqual(2);
    await expectNoAccessibilityViolations(page);
  });
```

Run: `npx playwright test -g "isolat"`
Expected: FAIL in both projects; the legend has no `.legend__entry` buttons yet.

- [ ] **Step 5: Make the emphasized entries isolation buttons**

Replace the whole of `src/ui/semantic-legend.ts` with:

```ts
import type { PeriodKey } from '../domain';
import { element, replaceChildren } from './dom';
import {
  legendModel,
  type LegendItem,
  type LegendScale,
  type LegendSwatch,
  type LegendTick,
} from './legend-model';
import {
  isolatedPeriodOf,
  NO_ISOLATION,
  nextIsolation,
  type IsolationEvent,
} from './period-isolation';
import type { SemanticView } from './view-state';

export type IsolationListener = (period: number | undefined) => void;

/** The stage of the frame whose key the legend shows. */
export type LegendFrameStage = 'coarse' | 'stable';

export interface SemanticLegend {
  readonly element: HTMLElement;
  /**
   * Shows `view`; in the period view `periodKey` is the key of the frame on
   * screen and `stage` its stage (only a stable frame can end a pressed
   * isolation).
   */
  readonly update: (view: SemanticView, periodKey?: PeriodKey, stage?: LegendFrameStage) => void;
  /** Called with the period to isolate (undefined: none) whenever it changes. */
  readonly onIsolate: (listener: IsolationListener) => void;
}

const ISOLATION_HINT =
  'Hover, focus or select a period to show only its pixels; Escape or selecting it again restores the view.';

const waitingHint = (period: number): string =>
  `Period ${period} stays isolated until the stable frame arrives; this preview does not show it, so every pixel is dimmed.`;

const copyOf = (label: string, detail: string): HTMLElement => {
  const copy = element('span', { className: 'legend__copy' });
  copy.append(element('strong', { text: label }), element('small', { text: detail }));
  return copy;
};

const tickClass = (tick: LegendTick): string =>
  tick.position <= 0
    ? 'legend__tick legend__tick--start'
    : tick.position >= 1
      ? 'legend__tick legend__tick--end'
      : 'legend__tick';

const renderScale = (scale: LegendScale): HTMLLIElement => {
  const item = element('li', { className: 'legend__item legend__item--scale' });
  const bar = element('span', { className: 'legend__bar' });
  bar.style.background = scale.background;
  const ticks = element('span', { className: 'legend__ticks' });
  for (const tick of scale.ticks) {
    const label = element('span', { className: tickClass(tick), text: tick.label });
    label.style.left = `${tick.position * 100}%`;
    ticks.append(label);
  }
  // The detail text states the range in words; the bar and ticks repeat it visually.
  const graphic = element('span', {
    className: 'legend__scale',
    attributes: { 'aria-hidden': 'true' },
  });
  graphic.append(bar, ticks);
  item.append(copyOf(scale.label, scale.detail), graphic);
  return item;
};

const swatchOf = (entry: LegendSwatch): HTMLElement => {
  const swatch = element('span', {
    className: `legend__swatch legend__swatch--${entry.border}`,
    attributes: { 'aria-hidden': 'true' },
  });
  swatch.style.background = entry.background;
  return swatch;
};

/** An emphasized period: a toggle button that isolates the period (MI-UX-018). */
const renderPeriodControl = (entry: LegendSwatch, period: number): HTMLLIElement => {
  const item = element('li', {
    className: 'legend__item legend__item--period legend__item--control',
  });
  item.dataset['period'] = String(period);
  const control = element('button', {
    className: 'legend__entry',
    // The accessible name comes from the visible label and detail.
    attributes: { type: 'button', 'aria-pressed': 'false' },
  });
  control.dataset['period'] = String(period);
  // Visible, non-colour pressed state (forced colours included).
  const state = element('span', {
    className: 'legend__state',
    text: 'Isolated',
    attributes: { 'aria-hidden': 'true' },
  });
  control.append(swatchOf(entry), copyOf(entry.label, entry.detail), state);
  item.append(control);
  return item;
};

const renderSwatch = (entry: LegendSwatch): HTMLLIElement => {
  if (typeof entry.period === 'number') return renderPeriodControl(entry, entry.period);
  const item = element('li', {
    className: entry.period === undefined ? 'legend__item' : 'legend__item legend__item--period',
  });
  if (entry.period !== undefined) item.dataset['period'] = entry.period;
  item.append(swatchOf(entry), copyOf(entry.label, entry.detail));
  return item;
};

const renderItem = (entry: LegendItem): HTMLLIElement => {
  switch (entry.kind) {
    case 'scale':
      return renderScale(entry);
    case 'swatch':
      return renderSwatch(entry);
    case 'note':
      return element('li', { className: 'legend__item legend__note', text: entry.text });
  }
};

const periodOf = (target: EventTarget | null): number | undefined => {
  if (!(target instanceof Element)) return undefined;
  const control = target.closest<HTMLElement>('.legend__entry');
  const value = control?.dataset['period'];
  return value === undefined ? undefined : Number(value);
};

export function createSemanticLegend(): SemanticLegend {
  const root = element('section', {
    className: 'legend',
    attributes: {
      'aria-labelledby': 'legend-heading',
    },
  });
  const heading = element('h2', {
    className: 'eyebrow',
    text: 'Semantic legend',
    attributes: { id: 'legend-heading' },
  });
  const definition = element('p', { className: 'legend__definition' });
  const list = element('ul', { className: 'legend__list' });
  const hint = element('p', { className: 'legend__hint', text: ISOLATION_HINT });
  hint.hidden = true;
  root.append(heading, definition, list, hint);

  let isolation = NO_ISOLATION;
  let notified: number | undefined;
  let listener: IsolationListener | undefined;
  let shownView: SemanticView | undefined;
  let shown: string | undefined;
  let listed: readonly number[] = [];

  const controls = (): HTMLElement[] => [...list.querySelectorAll<HTMLElement>('.legend__entry')];

  const refreshHint = (): void => {
    const pressed = isolation.pressed;
    const waiting = pressed !== undefined && !listed.includes(pressed);
    hint.hidden = listed.length === 0 && !waiting;
    hint.textContent = waiting ? waitingHint(pressed) : ISOLATION_HINT;
  };

  const apply = (event: IsolationEvent): void => {
    isolation = nextIsolation(isolation, event);
    for (const control of controls()) {
      const pressed = Number(control.dataset['period']) === isolation.pressed;
      control.setAttribute('aria-pressed', String(pressed));
    }
    refreshHint();
    const period = isolatedPeriodOf(isolation);
    if (period === notified) return;
    notified = period;
    listener?.(period);
  };

  const onPeriodEvent =
    (type: 'focus' | 'blur' | 'activate') =>
    (event: Event): void => {
      const period = periodOf(event.target);
      if (period !== undefined) apply({ type, period });
    };
  list.addEventListener('focusin', onPeriodEvent('focus'));
  list.addEventListener('focusout', onPeriodEvent('blur'));
  list.addEventListener('click', onPeriodEvent('activate'));
  // Hover previews with a mouse only: a tap focuses and activates instead.
  list.addEventListener('pointerover', (event) => {
    const period = periodOf(event.target);
    if (event.pointerType === 'mouse' && period !== undefined) apply({ type: 'hover', period });
  });
  list.addEventListener('pointerout', (event) => {
    const period = periodOf(event.target);
    const next = periodOf(event.relatedTarget);
    if (period !== undefined && next !== period) apply({ type: 'unhover', period });
  });
  list.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || isolatedPeriodOf(isolation) === undefined) return;
    event.preventDefault();
    apply({ type: 'escape' });
  });

  const redraw = (view: SemanticView, periodKey: PeriodKey | undefined): void => {
    if (view !== shownView) apply({ type: 'reset' });
    shownView = view;
    const focusedPeriod = periodOf(document.activeElement);
    const model = legendModel(view, periodKey);
    definition.textContent = model.definition;
    replaceChildren(list, model.items.map(renderItem));
    listed = periodKey?.emphasized.map((entry) => entry.period) ?? [];
    apply({ type: 'available', periods: listed, final: false });
    controls()
      .find((control) => Number(control.dataset['period']) === focusedPeriod)
      ?.focus();
  };

  const update = (
    view: SemanticView,
    periodKey?: PeriodKey,
    stage: LegendFrameStage = 'stable',
  ): void => {
    // Coarse and stable frames often share a key; skip identical redraws so
    // a focused entry keeps its focus.
    const signature = JSON.stringify([view, periodKey ?? null]);
    if (signature !== shown) {
      shown = signature;
      redraw(view, periodKey);
    }
    // Only a stable frame can end a pressed isolation (period-isolation.ts).
    if (stage === 'stable') apply({ type: 'available', periods: listed, final: true });
  };

  update('stability');
  return {
    element: root,
    update,
    onIsolate: (next) => {
      listener = next;
    },
  };
}
```

The accessible name of each button comes from its visible text ("Period 1 80% of attracting-cycle pixels" in both engines); the "Isolated" tag is `aria-hidden`, and `aria-pressed` carries the state to assistive technology. Do not add an `aria-label`: axe's `label-content-name-mismatch` rule rejects one that differs from the visible text.

- [ ] **Step 6: Wire isolation into the application**

Make each replacement in `src/ui/application.ts` exactly; every quoted anchor occurs once whether or not the shareable-URL plan has landed.

6a. Replace

```ts
  semanticView: SemanticView;
  catalogVisible: boolean;
```

with

```ts
  semanticView: SemanticView;
  /** Period isolated from the legend (MI-UX-018): a palette input, never in the cache key. */
  isolatedPeriod?: number | undefined;
  catalogVisible: boolean;
```

6b. In `requestRender`, replace

```ts
      semanticView: state.semanticView,
      quality: quality.quality,
    } satisfies MainToWorkerMessage);
```

with

```ts
      semanticView: state.semanticView,
      quality: quality.quality,
      ...(state.semanticView === 'period' && state.isolatedPeriod !== undefined
        ? { isolatedPeriod: state.isolatedPeriod }
        : {}),
    } satisfies MainToWorkerMessage);
```

6c. In `presentFrame`, replace the line added in Task 8

```ts
    if (state.semanticView === 'period') legend.update('period', frame.periodKey);
```

with

```ts
    if (state.semanticView === 'period') legend.update('period', frame.periodKey, frame.stage);
    canvasShell.toggleAttribute('data-isolated-period', frame.isolatedPeriod !== undefined);
    if (frame.isolatedPeriod !== undefined) {
      canvasShell.dataset['isolatedPeriod'] = String(frame.isolatedPeriod);
    }
```

6d. Replace

```ts
  document.addEventListener('keydown', onDocumentKeydown);
```

with

```ts
  document.addEventListener('keydown', onDocumentKeydown);

  // Legend isolation recolors the frame on screen, silently: the status line
  // is a live region, and the legend's aria-pressed state is the
  // announcement. The legend resets isolation on a view change before the
  // new view is requested.
  legend.onIsolate((period) => {
    state.isolatedPeriod = period;
    if (state.semanticView !== 'period') return;
    if (renderTimer !== undefined) clearTimeout(renderTimer);
    requestRender();
  });
```

The callback calls `requestRender`, not `requestSemanticView`: it must not set "Applying interior view…" in the status line.

6e. Make frame statuses quiet when they repeat. Replace

```ts
  function presentFrame(frame: FrameMessage): void {
```

with

```ts
  /** Writes the render status only when it changes, so a recolor is not re-announced. */
  function showRenderStatus(text: string): void {
    if (statusText.textContent !== text) statusText.textContent = text;
  }

  function presentFrame(frame: FrameMessage): void {
```

replace

```ts
      statusText.textContent = `Refining view · ${Math.round(frame.progress * 100)}%`;
```

with

```ts
      showRenderStatus(`Refining view · ${Math.round(frame.progress * 100)}%`);
```

and replace

```ts
      statusText.textContent = 'Stable frame';
```

with

```ts
      showRenderStatus('Stable frame');
```

An isolation recolor of the cached frame re-delivers "Stable frame" (or the same coarse progress for an in-flight replay); with this guard the live region is not mutated, so nothing is re-announced. Real interior-view changes keep their behaviour: `requestSemanticView` still writes "Applying interior view…", and the next frame's status differs from it.

The interior-view `change` handler is not edited: it already calls `legend.update(state.semanticView)` before `requestSemanticView()`, and the legend resets isolation (and tells the listener) when the view changes. The point inspector is unchanged and keeps stating the exact period.

- [ ] **Step 7: Style the buttons and their pressed state**

In `src/styles.css`, replace

```css
.legend__tick--end {
  transform: translateX(-100%);
}
```

with

```css
.legend__tick--end {
  transform: translateX(-100%);
}

/* Emphasized periods are toggle buttons that isolate the period (MI-UX-018). */
.legend__item--control {
  grid-template-columns: minmax(0, 1fr);
}

.legend__entry {
  display: grid;
  grid-template-columns: 1.15rem minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.65rem;
  width: 100%;
  min-height: 1.75rem;
  margin: 0;
  padding: 0.2rem 0.35rem;
  color: inherit;
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: var(--radius-sm);
}

.legend__entry:hover {
  background: var(--surface-muted);
}

.legend__entry[aria-pressed='true'] {
  outline: 2px solid var(--ink);
  outline-offset: 1px;
}

.legend__state {
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.legend__entry[aria-pressed='false'] .legend__state {
  display: none;
}

.legend__hint {
  margin: 0.65rem 0 0;
  color: var(--ink-muted);
  font-size: 0.69rem;
}
```

and in the `@media (forced-colors: active)` block replace

```css
  .legend__swatch,
  .legend__bar {
    border-width: 2px;
  }
```

with

```css
  .legend__swatch,
  .legend__bar {
    border-width: 2px;
  }

  .legend__entry[aria-pressed='true'] {
    outline: 2px solid Highlight;
  }
```

Under forced colours the pressed entry shows both a non-colour cue (the "Isolated" text) and a system-colour outline.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/ui`
Expected: PASS, no failed tests.

Run: `npx playwright test -g "isolat|first-use flow|320 px phone layout|forced colors"`
Expected: every selected test passes in both the `chromium` and `firefox` projects. The forced-colours isolation test also runs axe.

- [ ] **Step 9: Format, check and commit**

```bash
npx prettier --write src/ui/period-isolation.ts src/ui/semantic-legend.ts src/ui/application.ts src/styles.css tests/unit/ui/period-isolation.test.ts tests/e2e/explorer.spec.ts
npm run check
npm run fixtures:kernel-golden -- --check
npx playwright test
git add src/ui/period-isolation.ts src/ui/semantic-legend.ts src/ui/application.ts src/styles.css tests/unit/ui/period-isolation.test.ts tests/e2e/explorer.spec.ts
git commit -F - <<'EOF'
Legend: isolate a period on hover, focus or activation (MI-UX-018)

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 11: Shipped palette evidence and browser record

**Files:**

- Create (generated): `evidence/phase-2/<date>-<commit>-palette/{palette-metrics.json,summary.md,manifest.sha256}`

**Interfaces:**

- Consumes: `npm run evidence:palette` (Tasks 2, 5 and 9); the e2e suite (Tasks 8 and 10).
- Produces: the directory that Task 12 links from `REQUIREMENTS.md`.

- [ ] **Step 1: Run the browser suite and keep its summary**

```bash
mkdir -p .evidence-build
npx playwright test 2>&1 | tee .evidence-build/palette-e2e.txt
grep -Eo '[0-9]+ passed' .evidence-build/palette-e2e.txt | tail -1
```

Expected: no failed tests. Do not write the log under `test-results/`: Playwright clears that directory when it starts.

- [ ] **Step 2: Generate the record and append the browser record**

```bash
DIR="evidence/phase-2/$(date +%F)-$(git rev-parse --short HEAD)-palette"
npm run evidence:palette -- "$DIR"
PASSED="$(grep -Eo '[0-9]+ passed' .evidence-build/palette-e2e.txt | tail -1)"
cat >> "$DIR/summary.md" <<EOF

## Browser record

\`npx playwright test\` (Chromium and Firefox, headless) on \`$(git rev-parse --short HEAD)\`: ${PASSED}.
The first-use flow runs axe (WCAG A and AA tags) in the stability and period
views with the palette-derived legend and finds no violations, and checks that
every period swatch in the legend is a colour the canvas drew. The isolation
tests isolate period 1 by keyboard focus and activation, check that every
other pixel is dimmed (no channel above 31), restore it with Escape and with a
second activation, clear it with an interior-view change, preview by mouse
hover without any change to the render status live region, and show the
pressed state under forced colours (with axe). The 320 px
legend test keeps every legend view free of horizontal overflow. No
screenshots are committed (owner decision Q6; README tier 1).
EOF
npx prettier --write "$DIR"
node tools/benchmark/manifest.mjs "$DIR"
node tools/benchmark/manifest.mjs --check "$DIR"
```

Expected: in `summary.md` the `shipped` column has no `✗` (the `phase-1` and `candidate/tol-bright` columns do, by design); the three overlay contrasts read 10.58, 5.15 and 13.21; the period isolation line reads 3.09:1 (floor 3:1); the browser record follows. `manifest.mjs --check` prints `…: 2 files verified`.

- [ ] **Step 3: Check and commit**

```bash
DIR="$(ls -d evidence/phase-2/*-palette | tail -1)"
npm run check
npm run fixtures:kernel-golden -- --check
git add "$DIR"
git commit -F - <<'EOF'
Evidence: shipped palette metrics, isolation contrast and browser record (MI-UX-021)

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
EOF
```

The Playwright run in Step 1 covers this task's browser gate.

---

### Task 12: Requirements, model and checklist

The shareable-URL plan has already added `MI-UX-019` (a `## Phase 2 UX requirements` section in `REQUIREMENTS.md`, a SysML requirement, and lines in `model/README.md`, `docs/PLAN.md` and `docs/IMPLEMENTATION.md`). This task adds `MI-UX-018` and `MI-UX-021` beside it. The table and README edits are made by a script that also works if that section were absent.

**Files:**

- Modify: `docs/verification/REQUIREMENTS.md`, `model/MandelbrotInteriority.sysml`, `model/README.md`, `docs/PLAN.md`, `docs/IMPLEMENTATION.md`, `docs/verification/PHASE2-TODO.md`

**Interfaces:**

- Consumes: the evidence directory from Task 11; the test names of Tasks 3–10.
- Produces: `MI-UX-018` and `MI-UX-021` in the requirements matrix and the SysML model, satisfied by `paletteMapper` and `legend` and verified by `MI-VER-UX-003`.

- [ ] **Step 1: Add the requirements to `REQUIREMENTS.md`, `model/README.md` and `docs/IMPLEMENTATION.md`**

Save this script as `.evidence-build/trace_docs.py` (`.evidence-build/` is git-ignored):

```python
"""Adds MI-UX-018 and MI-UX-021 to the traceability documents.

Works whether or not the shareable-URL plan (MI-UX-019) has already added its
own Phase 2 UX section and README wording. Run from the repo root.
"""
import re
import sys
import textwrap
from pathlib import Path

PALETTE_DIR = sys.argv[1]

ROWS = [
    "| `MI-UX-018` Period view emphasis | The period view shall emphasize at most five periods per view, chosen by area in the frame shown, and draw every other period in one neutral color. The legend shall list exactly the emphasized periods in ascending order, with their exact period numbers, their shares of the attracting-cycle area and the colors the raster uses, plus the neutral class. Each emphasized period shall be identifiable without relying on hue through that legend and by isolation: hovering, focusing or activating its legend entry shall dim every pixel not of that period, with at least 3:1 contrast between the period and the dimmed field, until the entry is released or activated again, Escape is pressed, or the interior view changes. | **Implemented** | `period emphasis key` (`tests/unit/domain/period-emphasis.test.ts`); `period view emphasis` and `period isolation` (`tests/unit/render/colorize.test.ts`); coarse and stable ranking (`tests/unit/render/cpu-renderer.test.ts`); `RenderWorkerRuntime period key delivery` and `RenderWorkerRuntime period isolation` (`tests/unit/worker/runtime.test.ts`); `legend model` and `legend period isolation` (`tests/unit/ui/`); `period isolation contrast` (`tests/unit/palette/isolation-contrast.test.ts`); browser scenarios: first-use flow (legend swatches are colors the canvas drew), `isolates a period from the legend by keyboard and restores it (MI-UX-018)`, `marks the isolated legend entry without colour in forced colours` | Screen-reader check of the isolation buttons in the next manual accessibility record |",
    f"| `MI-UX-021` Palette acceptance | Each semantic view's palette shall meet the declared minimum CIEDE2000 differences, set from the passing Phase 1 matrix (the period-color floor raised to 11 for the accepted palette), between the escaped and unresolved classes and among and against the period-view classes under normal and simulated protan, deutan and tritan vision; where interior colors overlap those classes by design, the unresolved texture and the multiplier stripes shall meet their own floors. The stability ramp shall be monotonic in luminance, text drawn over the raster shall keep at least 4.5:1 contrast, and every legend color shall derive from the colorizer's palette. | **Pass (proposed)** | `tests/unit/palette/` (Phase 1 floors and the ratchet, palette selection, shipped-palette acceptance, overlay contrast); `legend model`; [palette metrics](../../evidence/phase-2/{PALETTE_DIR}/summary.md) | Owner acceptance of the recorded floors |",
]

SECTION = """## Phase 2 UX requirements

Added as each [Phase 2 TODO](PHASE2-TODO.md) item lands, continuing the
`MI-UX` numbering; the wording matches the
[SysML model](../../model/MandelbrotInteriority.sysml).

| Requirement | Requirement text | State | Automated evidence | Remaining evidence |
| --- | --- | --- | --- | --- |
{rows}

"""


def requirements() -> None:
    path = Path('docs/verification/REQUIREMENTS.md')
    text = path.read_text()
    assert '`MI-UX-018`' not in text, 'MI-UX-018 already present'
    rows = '\n'.join(ROWS)
    if '## Phase 2 UX requirements' in text:
        # Append to the existing table: after its last row.
        start = text.index('## Phase 2 UX requirements')
        lines = text[start:].split('\n')
        in_table = False
        offset = start
        for line in lines:
            if line.startswith('|'):
                in_table = True
            elif in_table:
                break
            offset += len(line) + 1
        text = text[:offset] + rows + '\n' + text[offset:]
    else:
        anchor = '## Phase 2 performance requirements'
        assert text.count(anchor) == 1
        text = text.replace(anchor, SECTION.format(rows=rows) + anchor)
    path.write_text(text)


def model_readme() -> None:
    path = Path('model/README.md')
    text = path.read_text()
    match = re.search(r'- `UserExperienceRequirements` — .*?requirement;\n', text, re.S)
    assert match, 'UserExperienceRequirements bullet not found'
    phase2 = ['`MI-UX-018` (period view emphasis)']
    if '`MI-UX-019`' in match.group(0):
        phase2.append('`MI-UX-019` (shareable state)')
    phase2.append('`MI-UX-021` (palette acceptance)')
    listed = ', '.join(phase2[:-1]) + ' and ' + phase2[-1]
    sentence = (
        '- `UserExperienceRequirements` — sixteen active baselined Phase 1 UX '
        f'requirements, the Phase 2 requirements {listed}, and the retained OBE '
        '`MI-UX-014` requirement;'
    )
    wrapped = textwrap.fill(sentence, width=78, subsequent_indent='  ', break_on_hyphens=False)
    text = text[: match.start()] + wrapped + '\n' + text[match.end() :]
    path.write_text(text)


def implementation() -> None:
    path = Path('docs/IMPLEMENTATION.md')
    text = path.read_text()
    assert 'MI-UX-018' not in text, 'MI-UX-018 already present'
    start = text.index('## Requirements traceability')
    lines = text[start:].split('\n')
    offset = start
    last_row_end = None
    for line in lines:
        offset += len(line) + 1
        if line.startswith('| MI-UX-'):
            last_row_end = offset
    assert last_row_end is not None
    rows = (
        '| MI-UX-018 | Period emphasis key ranked per frame, palette-derived legend, and legend isolation recolored outside the cache key |\n'
        '| MI-UX-021 | Palette floors from the Phase 1 CVD matrix, checked by Node unit tests; legend colors from the colorizer palette |\n'
    )
    text = text[:last_row_end] + rows + text[last_row_end:]
    path.write_text(text)


requirements()
model_readme()
implementation()
print('MI-UX-018 and MI-UX-021 added')
```

Run it with the Task 11 directory name, then format:

```bash
PALETTE_DIR="$(basename "$(ls -d evidence/phase-2/*-palette | tail -1)")"
python3 .evidence-build/trace_docs.py "$PALETTE_DIR"
npx prettier --write docs/verification/REQUIREMENTS.md docs/IMPLEMENTATION.md
grep -n "MI-UX-018\|MI-UX-021" docs/verification/REQUIREMENTS.md docs/IMPLEMENTATION.md model/README.md
```

Expected: the script prints `MI-UX-018 and MI-UX-021 added`; `grep` finds one row of each in the `## Phase 2 UX requirements` table (after the `MI-UX-019` row), one row of each in the `docs/IMPLEMENTATION.md` traceability table, and the README bullet now lists `MI-UX-018`, `MI-UX-019` and `MI-UX-021`. The script refuses to run twice.

- [ ] **Step 2: Add the requirements to the SysML model**

In `model/MandelbrotInteriority.sysml`, replace the closing of the `UserExperienceRequirements` package (this text occurs once: the last requirement's closing brace, the package's closing brace, and the next package)

```
        }
    }


    package PerformanceRequirements {
```

with

```
        }

        requirement <'MI-UX-018'> PeriodViewEmphasis {
            subject app : Architecture::MandelbrotInteriorityApplication;
            doc /*
             * The period view shall emphasize at most five periods per view,
             * chosen by area in the frame shown, and draw every other period
             * in one neutral color. The legend shall list exactly the
             * emphasized periods in ascending order, with their exact period
             * numbers, their shares of the attracting-cycle area and the
             * colors the raster uses, plus the neutral class. Each emphasized
             * period shall be identifiable without relying on hue through
             * that legend and by isolation: hovering, focusing or activating
             * its legend entry shall dim every pixel not of that period, with
             * at least 3:1 contrast between the period and the dimmed field,
             * until the entry is released or activated again, Escape is
             * pressed, or the interior view changes.
             */
        }

        requirement <'MI-UX-021'> PaletteAcceptance {
            subject app : Architecture::MandelbrotInteriorityApplication;
            doc /*
             * Each semantic view's palette shall meet the declared minimum
             * CIEDE2000 differences, set from the passing Phase 1 matrix (the
             * period-color floor raised to 11 for the accepted palette),
             * between the escaped and unresolved classes and among and
             * against the period-view classes under normal and simulated
             * protan, deutan and tritan vision; where interior colors overlap
             * those classes by design, the unresolved texture and the
             * multiplier stripes shall meet their own floors. The stability
             * ramp shall be monotonic in luminance, text drawn over the
             * raster shall keep at least 4.5:1 contrast, and every legend
             * color shall derive from the colorizer's palette.
             */
        }
    }


    package PerformanceRequirements {
```

Replace

```
            satisfy UserExperienceRequirements::RendererRecoveryAndFallback
                by app.uiShell.rendererLifecycle;
```

with

```
            satisfy UserExperienceRequirements::RendererRecoveryAndFallback
                by app.uiShell.rendererLifecycle;
            satisfy UserExperienceRequirements::PeriodViewEmphasis
                by app.renderingWorker.paletteMapper;
            satisfy UserExperienceRequirements::PeriodViewEmphasis
                by app.uiShell.legend;
            satisfy UserExperienceRequirements::PaletteAcceptance
                by app.renderingWorker.paletteMapper;
```

Replace

```
                verify UserExperienceRequirements::EvidenceBoundedInspector;
            }
```

with

```
                verify UserExperienceRequirements::EvidenceBoundedInspector;
                verify UserExperienceRequirements::PeriodViewEmphasis;
                verify UserExperienceRequirements::PaletteAcceptance;
            }
```

(That `verify … EvidenceBoundedInspector;` line occurs once, in `MI-VER-UX-003 SemanticComprehensionTest`.)

- [ ] **Step 3: List the requirements in `docs/PLAN.md` §8.1**

Replace

```md
`MI-UX-013`, `MI-UX-015` through `MI-UX-017`, and the Phase 2 `MI-UX-019`
(shareable versioned links) in
```

with

```md
`MI-UX-013`, `MI-UX-015` through `MI-UX-017`, and the Phase 2 `MI-UX-018`
(period view emphasis), `MI-UX-019` (shareable versioned links) and
`MI-UX-021` (palette acceptance) in
```

- [ ] **Step 4: Tick the Phase 2 checklist**

```bash
sed -i \
  -e 's/^- \[ \] Define the numeric acceptance:/- [x] Define the numeric acceptance:/' \
  -e 's/^- \[ \] Unit-test those thresholds/- [x] Unit-test those thresholds/' \
  -e 's/^- \[ \] Derive the legend swatches/- [x] Derive the legend swatches/' \
  -e 's/^- \[ \] Re-run the CVD matrix and axe/- [x] Re-run the CVD matrix and axe/' \
  -e 's/^- \[ \] The period view emphasizes the (at most 5)/- [x] The period view emphasizes the (at most 5)/' \
  -e 's/^- \[ \] Legend numeric scales for κ and |λ|/- [x] Legend numeric scales for κ and |λ|/' \
  -e 's/^- \[ \] Update `DEFINITIONS`, the colorizer byte-parity test/- [x] Update `DEFINITIONS`, the colorizer byte-parity test/' \
  docs/verification/PHASE2-TODO.md
git diff --stat docs/verification/PHASE2-TODO.md
```

Expected: one file, 7 lines changed (7 insertions, 7 deletions).

In the "Proposed requirements" list of the same file, replace

```md
  the agreed classes, each also distinguishable by a non-hue cue, and the
  legend lists exactly what is emphasized.
```

with

```md
  the agreed classes, each also distinguishable by a non-hue cue, and the
  legend lists exactly what is emphasized. Added with items 1 and 2: the
  non-hue identification is the ordered legend (exact periods, area shares)
  plus isolation on legend hover, focus or activation.
```

and replace

```md
  colour vision, and the legend derives from the rendered palette.
```

with

```md
  colour vision, and the legend derives from the rendered palette. Added with
  item 1.
```

- [ ] **Step 5: Check and commit**

```bash
npx prettier --write docs/verification/REQUIREMENTS.md docs/IMPLEMENTATION.md docs/verification/PHASE2-TODO.md
npm run check
npm run fixtures:kernel-golden -- --check
npx playwright test
git add docs/verification/REQUIREMENTS.md model/MandelbrotInteriority.sysml model/README.md docs/PLAN.md docs/IMPLEMENTATION.md docs/verification/PHASE2-TODO.md
git commit -F - <<'EOF'
Requirements: MI-UX-018 and MI-UX-021; Phase 2 TODO items 1 and 2 done

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
EOF
```

(`model/` and `docs/PLAN.md` are Prettier-ignored; keep their existing wrapping by hand.)

<!-- prettier-ignore-end -->
