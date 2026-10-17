# Shareable Versioned URLs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A link to the explorer reopens the same viewport, semantic view, quality profile and selection; an old, unknown-version or malformed link opens the default view with a visible, announced notice; a keyboard-operable Copy link control copies the current view.

**Architecture:** A pure codec (`src/ui/share-state.ts`) encodes and decodes the owner's v1 query string with exact binary64 decimals. A pure application boundary (`src/ui/share-link.ts`) decides the startup state, giving a v1 link precedence over the benchmark harness parameters, which stay untouched in `src/ui/benchmark-params.ts`, and it composes the address-bar query and the copied link. `src/ui/application.ts` restores from the link at mount, records a settled view with a debounced `history.replaceState`, shows a persistent live-region notice, and adds the Copy link control.

**Tech Stack:** TypeScript 6 (strict, `exactOptionalPropertyTypes`), Vite 8, vanilla DOM/CSS, Vitest 5 (node environment), Playwright 1.64 (Chromium and Firefox, preview build on port 4174), `@axe-core/playwright`.

**Spec:** `docs/verification/PHASE2-TODO.md`: item "3. Shareable versioned URLs", owner decision Q2 under "Owner decisions (2026-10-16)", and the proposed `MI-UX-019` text under "Proposed requirements". Supporting context: `docs/PLAN.md` §5.3, §7, §8 and §8.1; `docs/RESEARCH.md` §8 and §9 ("persisted/share state is versioned"); `docs/verification/REQUIREMENTS.md`; `model/MandelbrotInteriority.sysml`.

## Global Constraints

- `npm run check`, `npm run fixtures:kernel-golden -- --check` and `npx playwright test` pass at the end of every task.
- Commit trailer for implementers: `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`.
- No headed browser runs. Never pass `--headed`; never run `npm run test:browser:headed` or `npm run evidence:release`.
- Follow the conventions in the files you touch. After editing any `.ts`, `.css` or `.md` file, run `npx prettier --write <that file>`.
- Owner decision Q2, verbatim: "A versioned query string, `?v=1&c=<re>,<im>&s=<span>&view=&q=&sel=`, with exact decimals and `replaceState` once a view settles. Old or broken links fall back with a visible notice."
- Owner brief: `history.replaceState` once a view settles, not `pushState`. An older version is never reinterpreted silently. The copy-link control is opt-in (it acts only when pressed), keyboard-operable, and announced in a live region.
- Do not modify `src/ui/benchmark-params.ts`, `tests/unit/ui/benchmark-params.test.ts`, anything under `tools/benchmark/`, or the existing tests in `tests/e2e/explorer.spec.ts`. The harness form `?perf=1&view=<re>,<im>,<spanY>&quality=<id>` must keep working unchanged (ADR 0009).
- Exact values: `URL_WRITE_DELAY_MS = 500`; `MAX_DECIMAL_LENGTH = 400`; schema version string `'1'`; accessible names `Copy link to this view`, `Link notice`, `Dismiss link notice`; feedback texts `Link to this view copied.` and `Could not copy automatically. The address bar now shows the link to this view.`
- Do not dispatch subagents from an implementer session. Work on branch `phase-2/core-atlas`.
- If a gate fails because of a file outside your task's **Files** list (for example an untracked plan from another session failing `format:check`), stop and report it. Do not edit that file.

## Review Focus

1. **`sel=` naming a catalog id that does not exist** (`mi-p9-nope`, or `MI-P2-BASILICA` in the wrong case). The explorer opens with nothing selected and a notice saying the selection was not found; it never selects the nearest or a case-folded id. Pinned by the Task 1 unit table and the Task 3 browser test "falls back visibly from malformed fields…".
2. **`s` outside the zoom bounds** (`1e-12`, `100`), and `s` exactly at a bound. Out of range clamps to the nearest bound and keeps the centre, with a notice; exactly at `MIN_VIEWPORT_SPAN_Y` or `MAX_VIEWPORT_SPAN_Y` opens with no notice. Pinned by the Task 1 clamp and bound tests and the Task 3 `6.00e6×` assertion.
3. **A huge-precision or hostile decimal** (`-0.75000000000000000000000000000001`, a 401-character number, `1e400`, a `+` sign, which a query decodes as a space). Extra digits round silently to the nearest binary64; overlong, overflowing or space-corrupted numbers are malformed and fall back with a notice. Pinned by the Task 1 decimal tests and the `c=+1,0` table row.
4. **The `perf` hook combined with product parameters**, and the harness `view` triple inside a v1 link. `?perf=1&v=1&…` restores the view and keeps the hook on; `?v=1&view=-1,0,0.5` treats the triple as a malformed semantic view; the harness-only form still works and is rewritten to v1 plus `perf=1`; a copied link never carries `perf`. Pinned by the Task 2 startup and address tests, the Task 3 harness browser test, and the Task 4 copy test.
5. **Back and forward.** Writing the address never adds history entries, so Back leaves the explorer instead of stepping through views. Pinned by the `history.length` assertion in the Task 3 round-trip browser test.

## Execution

Subagent-driven (`superpowers:subagent-driven-development`), owner direction:

- **Implementers: Haiku**, one fresh session per task, scoped to that task's **Files** list, transcribing the complete code below.
- **Per-task reviewer: Sonnet**, checking the task against this plan, the spec and ADR 0009 before the next task starts.
- Tasks run strictly in order; each consumes the previous task's exports.

---

## File Structure

| Path                                                   | Responsibility                                                                           |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `docs/decisions/0009-shareable-url-schema.md`          | The schema decision, version policy, and the benchmark-hook disposition                  |
| `src/ui/share-state.ts`                                | Pure v1 codec: exact decimals, decode with per-field issues, encode, version rejection   |
| `src/ui/share-link.ts`                                 | Pure application boundary: startup precedence, notice text, address-bar query, copy link |
| `src/ui/application.ts`                                | Restore at mount, settled-view `replaceState`, link notice, Copy link control            |
| `src/ui/icons.ts`                                      | `link` icon                                                                              |
| `src/styles.css`                                       | Link notice styling, phone reflow, forced colours                                        |
| `tests/unit/ui/share-state.test.ts`                    | Codec unit tests                                                                         |
| `tests/unit/ui/share-link.test.ts`                     | Boundary unit tests                                                                      |
| `tests/e2e/explorer.spec.ts`                           | `Shareable links (MI-UX-019)` browser scenarios                                          |
| `docs/verification/REQUIREMENTS.md`                    | `MI-UX-019` requirement row                                                              |
| `model/MandelbrotInteriority.sysml`, `model/README.md` | `MI-UX-019` requirement, satisfaction and verification                                   |
| `docs/IMPLEMENTATION.md`, `docs/PLAN.md`               | Architecture, testing and traceability notes                                             |
| `docs/verification/PHASE2-TODO.md`                     | Item 3 ticked, benchmark-hook disposition recorded                                       |

The README does not document URLs or query parameters, so it is not changed.

---

### Task 1: ADR 0009 and the v1 codec

**Files:**

- Create: `docs/decisions/0009-shareable-url-schema.md`
- Create: `src/ui/share-state.ts`
- Test: `tests/unit/ui/share-state.test.ts`

**Interfaces:**

- Consumes: `src/ui/view-state.ts` (`DEFAULT_QUALITY_PROFILE_ID`, `DEFAULT_VIEWPORT`, `isDefaultViewport`, `MAX_SCALE`, `MIN_SCALE`, `QUALITY_PROFILES`, `SEMANTIC_VIEWS`, types `QualityProfileId`, `SemanticView`, `Viewport`); `src/catalog/components.ts` (`findCatalogComponent(id: string): CatalogComponent | undefined`); `src/domain` type `Complex`.
- Produces (`src/ui/share-state.ts`):
  - `SHARE_SCHEMA_VERSION: '1'`; `SHARE_KEYS: readonly ['v', 'c', 's', 'view', 'q', 'sel']`; `MAX_DECIMAL_LENGTH = 400`
  - `type ShareSelection = { kind: 'catalog'; id: string } | { kind: 'point'; point: Complex }` (readonly fields)
  - `interface ShareState { viewport: Viewport; semanticView: SemanticView; qualityProfile: QualityProfileId; selection?: ShareSelection | undefined }`
  - `type ShareFieldIssue = 'viewport' | 'zoom-clamped' | 'view' | 'quality' | 'selection'`
  - `type ShareDecodeResult = { kind: 'absent' } | { kind: 'rejected'; reason: 'missing-version' | 'unsupported-version'; version?: string | undefined } | { kind: 'decoded'; state: ShareState; issues: readonly ShareFieldIssue[] }`
  - `DEFAULT_SHARE_STATE: ShareState`
  - `formatShareDecimal(value: number): string`; `parseShareDecimal(text: string): number | undefined`
  - `decodeShareState(search: string): ShareDecodeResult`; `encodeShareState(state: ShareState): string` (no leading `?`; `''` for the default state); `isDefaultShareState(state: ShareState): boolean`

- [ ] **Step 1: Write the ADR**

Create `docs/decisions/0009-shareable-url-schema.md` with exactly this content:

````markdown
# ADR 0009: Shareable URL schema

- Status: Accepted
- Date: 2026-10-16

## Context

PLAN §5.3 and §7 require versioned share state, so that a later coordinate or
numerical change never silently reinterprets an old link. Phase 2 adds
shareable URLs ([PHASE2-TODO item 3](../verification/PHASE2-TODO.md#3-shareable-versioned-urls)),
traced to `MI-UX-019`. The owner chose the format on 2026-10-16 (Q2): a
versioned query string with exact decimals, written with `replaceState` once
a view settles, where an old or broken link falls back visibly.

The explorer already reads `?perf=1&view=<re>,<im>,<spanY>&quality=<id>`
(`src/ui/benchmark-params.ts`). The release harness
(`tools/benchmark/harness/passes/corpus.ts`), its `--compare dist:<dir>` arms
against earlier builds, and the e2e provenance test depend on it. Its `view`
key means a viewport, but the product schema uses `view` for the semantic
view.

## Decision

A link has this form:

```text
?v=1&c=<re>,<im>&s=<spanY>&view=<stability|multiplier|period>&q=<quick|balanced|detailed>&sel=<catalog id | re,im>
```

- **Numbers.** Written as the shortest decimal that reads back as the same
  binary64 value (`String(x)`, with `e+` shortened to `e` because a query
  string decodes `+` as a space). On reading, a strict decimal of at most 400
  characters becomes the nearest binary64 value. Extra digits are rounded
  without a notice: binary64 cannot hold them, and they are far below the
  pixel spacing at the `6,000,000×` ceiling.
- **Version.** `v` versions both the field layout and its meaning. Version 1
  fixes the canonical-`c` viewport with `s` as the vertical span
  (`src/domain/viewport.ts`), the three semantic view ids, the three quality
  profile ids and their budgets, and the catalog ids in
  `catalog/components.v1.json`. Any change that would make a v1 link show
  something else must bump `v`. The decoder accepts only versions it can show
  faithfully, so an old or unknown version is rejected with a notice, never
  reinterpreted.
- **Fields.** `c` and `s` travel together. With both absent the default
  viewport applies. With one absent or malformed, the default viewport applies
  and the notice says so. A span outside the zoom bounds is clamped to the
  nearest bound, with a notice. The centre need only be finite, because the
  explorer's own panning is unbounded. `view`, `q` and `sel` are optional;
  each malformed value falls back to its default and is listed in the notice.
  `sel` names a catalog id that exists, or holds an exact `re,im` pair. A
  repeated key is malformed. Parameters the schema does not own are ignored.
- **Rejection.** A query with `c`, `s`, `q`, `sel` or a semantic-view `view`
  but no `v` is unversioned. A `v` other than exactly `1` is unsupported. In
  both cases nothing in the link is applied: the default view opens with a
  notice. The notice repeats the version only when it is one to four digits.
- **Writing.** The address bar is updated with `history.replaceState` 500 ms
  after a stable frame, never during a pointer session or while a render is
  pending (its stable frame reschedules the write). It uses `replaceState`, not
  `pushState`: the explorer does not create history entries, so Back leaves
  the explorer instead of stepping back through views, and no `popstate`
  handling is needed. The default state writes no parameters. Parameters the
  schema does not own, such as `perf=1`, stay in the address bar.
- **Copy link.** A Copy link control copies the origin, path and v1 fields,
  never `perf` or other foreign parameters, and announces the result in the
  existing feedback live region. Without clipboard access it updates the
  address bar at once and says so.
- **Benchmark hook: kept separate.** `perf=1` remains an orthogonal diagnostic
  switch: a v1 link with `perf=1` restores the view and enables the hook. The
  harness's `view=<re>,<im>,<spanY>&quality=<id>` applies only when the URL has
  no share fields. It is a harness interface, not an earlier share-link
  version, and it still means what it always meant. Migrating the harness to
  v1 would break `--compare` against every build made before this ADR, which
  only reads `?view=`. Inside a v1 link the harness triple is a malformed
  `view` and `quality` is ignored.

## Consequences

- A copied or bookmarked link reopens the same viewport, semantic view,
  quality profile and selection. A selected point is inspected again on load.
- Catalog ids become part of v1. PHASE2-TODO item 4 plans a stable id scheme
  because today's `mi-p4-NN` ids are ordinal. If ids change, the old ids must
  stay resolvable or `v` must be bumped.
- Changing a quality profile's budget or a semantic view's meaning bumps `v`.
  Classifier improvements that keep the common acceptance procedure
  (`MI-PERF-004`) do not: a link names a place, a view and a budget, not a
  frozen image.
- On a harness page the address bar is rewritten to v1 (plus `perf=1`) after
  the view settles. The harness reads the viewport from the hook, not from the
  URL, and the write happens at least 500 ms after the stable frame on which
  its wall-clock measurement ends.
- The codec is pure (`src/ui/share-state.ts`, `src/ui/share-link.ts`) and
  covered by unit tests. The browser behaviour is covered by the
  `Shareable links (MI-UX-019)` scenarios in both engines.
````

- [ ] **Step 2: Write the failing codec tests**

Create `tests/unit/ui/share-state.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { COMPONENT_CATALOG } from '../../../src/catalog/components';
import { MAX_VIEWPORT_SPAN_Y, MIN_VIEWPORT_SPAN_Y } from '../../../src/domain';
import {
  DEFAULT_SHARE_STATE,
  decodeShareState,
  encodeShareState,
  formatShareDecimal,
  MAX_DECIMAL_LENGTH,
  parseShareDecimal,
  type ShareFieldIssue,
  type ShareState,
} from '../../../src/ui/share-state';

/** Decodes a link that must be v1, failing the test otherwise. */
const v1 = (search: string): { state: ShareState; issues: readonly ShareFieldIssue[] } => {
  const result = decodeShareState(search);
  if (result.kind !== 'decoded') throw new Error(`${search} was ${result.kind}, not decoded`);
  return { state: result.state, issues: result.issues };
};

const DEEP_VIEW: ShareState = {
  viewport: { center: { re: -0.1592, im: -1.0344 }, spanY: 0.0198 },
  semanticView: 'multiplier',
  qualityProfile: 'detailed',
  selection: { kind: 'catalog', id: 'mi-p3-rabbit' },
};

describe('share decimals', () => {
  it('round-trips binary64 values exactly through the shortest decimal', () => {
    for (const value of [
      -0.75,
      0,
      2.5,
      0.1,
      0.1 + 0.2,
      1 / 3,
      Math.PI,
      -1.7548776662466927,
      -0.12345678901234568,
      MIN_VIEWPORT_SPAN_Y,
      MAX_VIEWPORT_SPAN_Y,
      1e21,
      -1.25e-12,
      Number.MAX_VALUE,
      Number.MIN_VALUE,
    ]) {
      expect(parseShareDecimal(formatShareDecimal(value)), String(value)).toBe(value);
    }
  });

  it('writes negative zero as 0 and never writes a "+"', () => {
    expect(formatShareDecimal(-0)).toBe('0');
    expect(formatShareDecimal(1e21)).toBe('1e21');
    expect(formatShareDecimal(Number.MAX_VALUE)).toBe('1.7976931348623157e308');
    expect(formatShareDecimal(MIN_VIEWPORT_SPAN_Y)).toBe('4.1666666666666667e-7');
  });

  it('refuses to encode a non-finite value', () => {
    expect(() => formatShareDecimal(Number.NaN)).toThrow(RangeError);
    expect(() => formatShareDecimal(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it('accepts strict decimal forms only', () => {
    expect(parseShareDecimal('-.5')).toBe(-0.5);
    expect(parseShareDecimal('5.')).toBe(5);
    expect(parseShareDecimal('+1')).toBe(1);
    expect(parseShareDecimal('1E-3')).toBe(0.001);
    for (const text of [
      '',
      ' 1',
      '1 ',
      '.',
      '+',
      '--1',
      '1e',
      '1,5',
      '0x10',
      'NaN',
      'Infinity',
      '1e400',
      '-1e400',
    ]) {
      expect(parseShareDecimal(text), JSON.stringify(text)).toBeUndefined();
    }
  });

  it('rounds a huge-precision decimal to the nearest binary64 value', () => {
    expect(parseShareDecimal('-0.75000000000000000000000000000001')).toBe(-0.75);
    expect(parseShareDecimal('0.1000000000000000055511151231257827')).toBe(0.1);
  });

  it('rejects decimals longer than MAX_DECIMAL_LENGTH', () => {
    expect(parseShareDecimal(`0.${'1'.repeat(MAX_DECIMAL_LENGTH - 2)}`)).toBeCloseTo(1 / 9, 15);
    expect(parseShareDecimal(`0.${'1'.repeat(MAX_DECIMAL_LENGTH - 1)}`)).toBeUndefined();
  });
});

describe('decodeShareState', () => {
  it('is absent when no share field is present', () => {
    for (const search of [
      '',
      '?',
      '?perf=1',
      '?utm_source=mail',
      '?view=-0.75,0,2.5&quality=detailed',
      '?perf=1&view=not-a-view&quality=detailed',
      '?view=',
    ]) {
      expect(decodeShareState(search), search).toEqual({ kind: 'absent' });
    }
  });

  it('rejects share fields that carry no version', () => {
    for (const search of [
      '?c=-1,0&s=0.5',
      '?s=0.5',
      '?q=detailed',
      '?sel=mi-p2-basilica',
      '?view=period',
      '?perf=1&c=-1,0',
    ]) {
      expect(decodeShareState(search), search).toEqual({
        kind: 'rejected',
        reason: 'missing-version',
      });
    }
  });

  it('rejects every version other than exactly 1 and never reinterprets it', () => {
    const rejected = (version?: string) => ({
      kind: 'rejected',
      reason: 'unsupported-version',
      version,
    });
    expect(decodeShareState('?v=0&c=-1,0&s=0.5&view=period')).toEqual(rejected('0'));
    expect(decodeShareState('?v=2&c=-1,0&s=0.5')).toEqual(rejected('2'));
    expect(decodeShareState('?v=01')).toEqual(rejected('01'));
    expect(decodeShareState('?v=')).toEqual(rejected());
    expect(decodeShareState('?v=1.0')).toEqual(rejected());
    expect(decodeShareState('?v=99999')).toEqual(rejected());
    expect(decodeShareState('?v=1&v=1')).toEqual(rejected());
    expect(decodeShareState('?v=%3Cb%3E1%3C%2Fb%3E')).toEqual(rejected());
  });

  it('decodes a complete v1 link exactly', () => {
    expect(
      decodeShareState(
        '?v=1&c=-0.1592,-1.0344&s=0.0198&view=multiplier&q=detailed&sel=mi-p3-rabbit',
      ),
    ).toEqual({ kind: 'decoded', state: DEEP_VIEW, issues: [] });
  });

  it('treats absent optional fields as their defaults without an issue', () => {
    expect(v1('?v=1')).toEqual({ state: DEFAULT_SHARE_STATE, issues: [] });
    expect(v1('v=1&view=period')).toEqual({
      state: { ...DEFAULT_SHARE_STATE, semanticView: 'period' },
      issues: [],
    });
  });

  it('decodes a selected point as an exact pair', () => {
    expect(v1('?v=1&c=-0.75,0&s=2.5&sel=-0.1,0.65').state.selection).toEqual({
      kind: 'point',
      point: { re: -0.1, im: 0.65 },
    });
  });

  it.each([
    ['?v=1&c=abc,0&s=2.5', ['viewport'], {}],
    ['?v=1&c=-1&s=0.5', ['viewport'], {}],
    ['?v=1&c=-1,0,1&s=0.5', ['viewport'], {}],
    ['?v=1&c=-1,&s=0.5', ['viewport'], {}],
    ['?v=1&c=-1,0', ['viewport'], {}],
    ['?v=1&s=0.5', ['viewport'], {}],
    ['?v=1&c=-1,0&s=0', ['viewport'], {}],
    ['?v=1&c=-1,0&s=-0.5', ['viewport'], {}],
    ['?v=1&c=-1,0&s=NaN', ['viewport'], {}],
    ['?v=1&c=1e400,0&s=0.5', ['viewport'], {}],
    ['?v=1&c=+1,0&s=0.5', ['viewport'], {}],
    ['?v=1&c=-1,0&c=1,0&s=0.5', ['viewport'], {}],
    ['?v=1&view=sparkle', ['view'], {}],
    ['?v=1&view=Period', ['view'], {}],
    ['?v=1&view=', ['view'], {}],
    ['?v=1&view=-1,0,0.5', ['view'], {}],
    ['?v=1&view=period&view=multiplier', ['view'], {}],
    ['?v=1&q=ultra', ['quality'], {}],
    ['?v=1&q=Balanced', ['quality'], {}],
    ['?v=1&sel=mi-p9-nope', ['selection'], {}],
    ['?v=1&sel=MI-P2-BASILICA', ['selection'], {}],
    ['?v=1&sel=-0.1', ['selection'], {}],
    ['?v=1&sel=-0.1,abc', ['selection'], {}],
    ['?v=1&sel=', ['selection'], {}],
    [
      '?v=1&c=abc,0&s=0.5&view=period&q=ultra&sel=mi-p2-basilica',
      ['viewport', 'quality'],
      { semanticView: 'period', selection: { kind: 'catalog', id: 'mi-p2-basilica' } },
    ],
  ] as const)('falls back field by field for %s', (search, issues, kept) => {
    expect(v1(search)).toEqual({ state: { ...DEFAULT_SHARE_STATE, ...kept }, issues });
  });

  it('clamps a span outside the zoom bounds, keeps the centre, and says so', () => {
    expect(v1('?v=1&c=-1,0.25&s=1e-12')).toEqual({
      state: {
        ...DEFAULT_SHARE_STATE,
        viewport: { center: { re: -1, im: 0.25 }, spanY: MIN_VIEWPORT_SPAN_Y },
      },
      issues: ['zoom-clamped'],
    });
    expect(v1('?v=1&c=-1,0.25&s=100').state.viewport.spanY).toBe(MAX_VIEWPORT_SPAN_Y);
    expect(v1('?v=1&c=-1,0.25&s=100').issues).toEqual(['zoom-clamped']);
  });

  it('accepts spans exactly at both zoom bounds without clamping', () => {
    for (const spanY of [MIN_VIEWPORT_SPAN_Y, MAX_VIEWPORT_SPAN_Y]) {
      expect(v1(`?v=1&c=-1,0&s=${formatShareDecimal(spanY)}`)).toEqual({
        state: { ...DEFAULT_SHARE_STATE, viewport: { center: { re: -1, im: 0 }, spanY } },
        issues: [],
      });
    }
  });

  it('ignores parameters the schema does not own, including the harness quality key', () => {
    expect(v1('?v=1&perf=1&utm_source=mail&quality=quick')).toEqual({
      state: DEFAULT_SHARE_STATE,
      issues: [],
    });
  });
});

describe('encodeShareState', () => {
  it('writes the default state as an empty query', () => {
    expect(encodeShareState(DEFAULT_SHARE_STATE)).toBe('');
    expect(
      encodeShareState({
        ...DEFAULT_SHARE_STATE,
        viewport: { center: { re: -0.75, im: -0 }, spanY: 2.5 },
      }),
    ).toBe('');
  });

  it('writes every field in schema order with exact decimals', () => {
    expect(encodeShareState(DEEP_VIEW)).toBe(
      'v=1&c=-0.1592,-1.0344&s=0.0198&view=multiplier&q=detailed&sel=mi-p3-rabbit',
    );
  });

  it('writes the full viewport when only the view, quality or selection differs', () => {
    expect(encodeShareState({ ...DEFAULT_SHARE_STATE, semanticView: 'period' })).toBe(
      'v=1&c=-0.75,0&s=2.5&view=period&q=balanced',
    );
    expect(
      encodeShareState({
        ...DEFAULT_SHARE_STATE,
        selection: { kind: 'point', point: { re: -0.12345678901234568, im: 0.7 } },
      }),
    ).toBe('v=1&c=-0.75,0&s=2.5&view=stability&q=balanced&sel=-0.12345678901234568,0.7');
  });

  it('round-trips encodable states exactly', () => {
    const states: ShareState[] = [
      DEEP_VIEW,
      { ...DEFAULT_SHARE_STATE, qualityProfile: 'quick' },
      {
        viewport: { center: { re: 0.1 + 0.2, im: -1 / 3 }, spanY: MIN_VIEWPORT_SPAN_Y },
        semanticView: 'period',
        qualityProfile: 'balanced',
        selection: { kind: 'point', point: { re: Math.PI / 10, im: -0.12345678901234568 } },
      },
      {
        viewport: { center: { re: 12.5, im: -7 }, spanY: MAX_VIEWPORT_SPAN_Y },
        semanticView: 'stability',
        qualityProfile: 'detailed',
      },
      ...COMPONENT_CATALOG.map((component): ShareState => ({
        ...DEFAULT_SHARE_STATE,
        selection: { kind: 'catalog', id: component.id },
      })),
    ];
    for (const state of states) {
      const query = encodeShareState(state);
      expect(decodeShareState(`?${query}`), query).toEqual({ kind: 'decoded', state, issues: [] });
    }
  });

  it('round-trips the default state through the plain address', () => {
    expect(decodeShareState(`?${encodeShareState(DEFAULT_SHARE_STATE)}`)).toEqual({
      kind: 'absent',
    });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/ui/share-state.test.ts`
Expected: FAIL. The suite cannot resolve `../../../src/ui/share-state` ("Failed to resolve import" or "Cannot find module"), and no test runs.

- [ ] **Step 4: Write the codec**

Create `src/ui/share-state.ts`:

```ts
import type { Complex } from '../domain';
import { findCatalogComponent } from '../catalog/components';
import {
  DEFAULT_QUALITY_PROFILE_ID,
  DEFAULT_VIEWPORT,
  isDefaultViewport,
  MAX_SCALE,
  MIN_SCALE,
  QUALITY_PROFILES,
  SEMANTIC_VIEWS,
  type QualityProfileId,
  type SemanticView,
  type Viewport,
} from './view-state';

/**
 * Shareable view links, schema version 1 (ADR 0009, MI-UX-019).
 *
 * `?v=1&c=<re>,<im>&s=<spanY>&view=<semantic view>&q=<quality>&sel=<selection>`
 *
 * Numbers are written as the shortest decimal that reads back as the same
 * binary64 value, so a link reproduces the exact viewport. The version tag
 * covers both the field layout and their meaning: any change that would make
 * a v1 link show something else must bump it, and an unknown version is
 * rejected, never reinterpreted. This module is pure: no DOM, no history.
 */

export const SHARE_SCHEMA_VERSION = '1';

/** Every query key the v1 schema owns, in the order the encoder writes them. */
export const SHARE_KEYS = ['v', 'c', 's', 'view', 'q', 'sel'] as const;

/** Longest accepted decimal string; longer values are malformed, not rounded. */
export const MAX_DECIMAL_LENGTH = 400;

/** Strict decimal: optional sign, digits with optional fraction, optional exponent. */
const DECIMAL_PATTERN = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

/** A version string short and plain enough to repeat back in a notice. */
const PRINTABLE_VERSION_PATTERN = /^\d{1,4}$/;

export type ShareSelection =
  | { readonly kind: 'catalog'; readonly id: string }
  | { readonly kind: 'point'; readonly point: Complex };

export interface ShareState {
  readonly viewport: Viewport;
  readonly semanticView: SemanticView;
  readonly qualityProfile: QualityProfileId;
  readonly selection?: ShareSelection | undefined;
}

/** A v1 field that could not be used as written. */
export type ShareFieldIssue = 'viewport' | 'zoom-clamped' | 'view' | 'quality' | 'selection';

export type ShareDecodeResult =
  | { readonly kind: 'absent' }
  | {
      readonly kind: 'rejected';
      readonly reason: 'missing-version' | 'unsupported-version';
      /** The rejected version, only when it is safe to show (1–4 digits). */
      readonly version?: string | undefined;
    }
  | {
      readonly kind: 'decoded';
      readonly state: ShareState;
      readonly issues: readonly ShareFieldIssue[];
    };

export const DEFAULT_SHARE_STATE: ShareState = Object.freeze({
  viewport: DEFAULT_VIEWPORT,
  semanticView: 'stability',
  qualityProfile: DEFAULT_QUALITY_PROFILE_ID,
});

/**
 * The shortest decimal that reads back as exactly `value`. A positive
 * exponent drops its "+", because a query string decodes "+" as a space.
 */
export const formatShareDecimal = (value: number): string => {
  if (!Number.isFinite(value)) {
    throw new RangeError('share coordinates must be finite');
  }
  return String(value).replace('e+', 'e');
};

/**
 * Parses one strict decimal into the nearest binary64 value. Returns
 * undefined for anything else, including overflow to Infinity.
 */
export const parseShareDecimal = (text: string): number | undefined => {
  if (text.length > MAX_DECIMAL_LENGTH || !DECIMAL_PATTERN.test(text)) return undefined;
  const value = Number(text);
  return Number.isFinite(value) ? value : undefined;
};

const parsePair = (text: string): Complex | undefined => {
  const parts = text.split(',');
  if (parts.length !== 2) return undefined;
  const re = parseShareDecimal(parts[0] ?? '');
  const im = parseShareDecimal(parts[1] ?? '');
  return re === undefined || im === undefined ? undefined : { re, im };
};

const formatPair = (point: Complex): string =>
  `${formatShareDecimal(point.re)},${formatShareDecimal(point.im)}`;

/** The single value of `key`: `null` when absent, `undefined` when repeated. */
const singleValue = (params: URLSearchParams, key: string): string | null | undefined => {
  const values = params.getAll(key);
  if (values.length === 0) return null;
  return values.length === 1 ? values[0] : undefined;
};

const decodeViewport = (
  params: URLSearchParams,
): { viewport: Viewport; issues: ShareFieldIssue[] } => {
  const centerText = singleValue(params, 'c');
  const spanText = singleValue(params, 's');
  if (centerText === null && spanText === null) {
    return { viewport: DEFAULT_SHARE_STATE.viewport, issues: [] };
  }
  const center = typeof centerText === 'string' ? parsePair(centerText) : undefined;
  const span = typeof spanText === 'string' ? parseShareDecimal(spanText) : undefined;
  if (center === undefined || span === undefined || span <= 0) {
    return { viewport: DEFAULT_SHARE_STATE.viewport, issues: ['viewport'] };
  }
  const spanY = Math.min(MAX_SCALE, Math.max(MIN_SCALE, span));
  return { viewport: { center, spanY }, issues: spanY === span ? [] : ['zoom-clamped'] };
};

/** `fallback` when absent; the matching id; or undefined when malformed. */
const decodeChoice = <T extends string>(
  text: string | null | undefined,
  choices: readonly { readonly id: T }[],
  fallback: T,
): T | undefined => {
  if (text === null) return fallback;
  return choices.find((choice) => choice.id === text)?.id;
};

/** `null` when absent; the selection; or undefined when malformed or unknown. */
const decodeSelection = (text: string | null | undefined): ShareSelection | null | undefined => {
  if (text === null) return null;
  if (text === undefined) return undefined;
  if (text.includes(',')) {
    const point = parsePair(text);
    return point === undefined ? undefined : { kind: 'point', point };
  }
  return findCatalogComponent(text) === undefined ? undefined : { kind: 'catalog', id: text };
};

const decodeVersion1 = (params: URLSearchParams): ShareDecodeResult => {
  const { viewport, issues } = decodeViewport(params);
  const semanticView = decodeChoice(
    singleValue(params, 'view'),
    SEMANTIC_VIEWS,
    DEFAULT_SHARE_STATE.semanticView,
  );
  const qualityProfile = decodeChoice(
    singleValue(params, 'q'),
    QUALITY_PROFILES,
    DEFAULT_SHARE_STATE.qualityProfile,
  );
  const selection = decodeSelection(singleValue(params, 'sel'));
  if (semanticView === undefined) issues.push('view');
  if (qualityProfile === undefined) issues.push('quality');
  if (selection === undefined) issues.push('selection');
  return {
    kind: 'decoded',
    state: {
      viewport,
      semanticView: semanticView ?? DEFAULT_SHARE_STATE.semanticView,
      qualityProfile: qualityProfile ?? DEFAULT_SHARE_STATE.qualityProfile,
      ...(selection ? { selection } : {}),
    },
    issues,
  };
};

/**
 * True when the query carries v1 fields but no `v`. A bare `view=` only
 * counts when it names a semantic view: the benchmark harness's
 * `view=<re>,<im>,<spanY>` (src/ui/benchmark-params.ts) has no `v` either.
 */
const hasUnversionedShareFields = (params: URLSearchParams): boolean =>
  ['c', 's', 'q', 'sel'].some((key) => params.has(key)) ||
  SEMANTIC_VIEWS.some((view) => view.id === params.get('view'));

/**
 * Reads a share link from a location search string (with or without "?").
 *
 * - `absent`: no share fields; the caller applies its other defaults.
 * - `rejected`: share fields without `v`, or any `v` other than exactly "1";
 *   nothing in the link is applied.
 * - `decoded`: a v1 link. Each malformed field falls back to its default
 *   and is listed in `issues`; a span outside the zoom bounds is clamped
 *   and reported as `zoom-clamped`.
 */
export const decodeShareState = (search: string): ShareDecodeResult => {
  const params = new URLSearchParams(search);
  const versions = params.getAll('v');
  if (versions.length === 0) {
    return hasUnversionedShareFields(params)
      ? { kind: 'rejected', reason: 'missing-version' }
      : { kind: 'absent' };
  }
  const version = versions.length === 1 ? versions[0] : undefined;
  if (version !== SHARE_SCHEMA_VERSION) {
    return {
      kind: 'rejected',
      reason: 'unsupported-version',
      version:
        version !== undefined && PRINTABLE_VERSION_PATTERN.test(version) ? version : undefined,
    };
  }
  return decodeVersion1(params);
};

export const isDefaultShareState = (state: ShareState): boolean =>
  isDefaultViewport(state.viewport) &&
  state.semanticView === DEFAULT_SHARE_STATE.semanticView &&
  state.qualityProfile === DEFAULT_SHARE_STATE.qualityProfile &&
  state.selection === undefined;

const encodeSelection = (selection: ShareSelection): string =>
  selection.kind === 'catalog' ? encodeURIComponent(selection.id) : formatPair(selection.point);

/**
 * The v1 query for `state`, without the leading "?". The default state
 * encodes as "" so that the plain address opens it.
 */
export const encodeShareState = (state: ShareState): string => {
  if (isDefaultShareState(state)) return '';
  const fields = [
    `v=${SHARE_SCHEMA_VERSION}`,
    `c=${formatPair(state.viewport.center)}`,
    `s=${formatShareDecimal(state.viewport.spanY)}`,
    `view=${state.semanticView}`,
    `q=${state.qualityProfile}`,
  ];
  if (state.selection !== undefined) fields.push(`sel=${encodeSelection(state.selection)}`);
  return fields.join('&');
};
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/ui/share-state.test.ts`
Expected: PASS, `Tests  45 passed (45)`.

- [ ] **Step 6: Run the gates**

Run: `npx prettier --write docs/decisions/0009-shareable-url-schema.md src/ui/share-state.ts tests/unit/ui/share-state.test.ts`
Then run each of these:

```bash
npm run check
npm run fixtures:kernel-golden -- --check
npx playwright test
```

Expected: all three exit 0. Against the counts before this task, the unit step gains one test file and 45 tests with no failures, and Playwright's counts are unchanged (no failures, the usual one skipped). Other sessions land work on this branch, so compare counts with the run before your change, not with fixed numbers. ESLint runs with `--max-warnings 0` and a function-complexity warning at 18; the code above stays under it.

- [ ] **Step 7: Commit**

```bash
git add docs/decisions/0009-shareable-url-schema.md src/ui/share-state.ts tests/unit/ui/share-state.test.ts
git commit -F - <<'EOF'
Shareable URLs: ADR 0009 and the v1 share-state codec

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: Startup precedence, notices, and the address-bar query

**Files:**

- Create: `src/ui/share-link.ts`
- Test: `tests/unit/ui/share-link.test.ts`

**Interfaces:**

- Consumes: Task 1 exports `DEFAULT_SHARE_STATE`, `decodeShareState`, `encodeShareState`, `SHARE_KEYS`, types `ShareDecodeResult`, `ShareFieldIssue`, `ShareState`; `parseBenchmarkParams(search: string): BenchmarkParams` from `src/ui/benchmark-params.ts` (unchanged; returns `{ perfEnabled: boolean; viewport?: Viewport; qualityProfile?: QualityProfileId }`).
- Produces (`src/ui/share-link.ts`):
  - `interface StartupState extends ShareState { perfEnabled: boolean; notice?: string | undefined }`
  - `resolveStartupState(search: string): StartupState`
  - `addressBarSearch(currentSearch: string, state: ShareState): string` (`''` or a string starting with `?`, comparable to `location.search`)
  - `shareLink(origin: string, pathname: string, state: ShareState): string`
  - `rejectionNotice(result: Extract<ShareDecodeResult, { kind: 'rejected' }>): string`; `issuesNotice(issues: readonly ShareFieldIssue[]): string`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/ui/share-link.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { MIN_VIEWPORT_SPAN_Y } from '../../../src/domain';
import { addressBarSearch, resolveStartupState, shareLink } from '../../../src/ui/share-link';
import { DEFAULT_SHARE_STATE, type ShareState } from '../../../src/ui/share-state';

const BASILICA_VIEW: ShareState = {
  viewport: { center: { re: -1, im: 0 }, spanY: 0.5 },
  semanticView: 'period',
  qualityProfile: 'quick',
  selection: { kind: 'catalog', id: 'mi-p2-basilica' },
};
const BASILICA_QUERY = 'v=1&c=-1,0&s=0.5&view=period&q=quick&sel=mi-p2-basilica';
const DEFAULT_VIEW_SUFFIX = 'Opening the default full-set view instead.';

describe('resolveStartupState', () => {
  it('starts at the defaults without parameters and without a notice', () => {
    expect(resolveStartupState('')).toEqual({ ...DEFAULT_SHARE_STATE, perfEnabled: false });
    expect(resolveStartupState('').notice).toBeUndefined();
  });

  it('keeps the benchmark harness form working (ADR 0009)', () => {
    expect(
      resolveStartupState(
        '?perf=1&view=-0.158902249,-1.034028,0.019841269841269841269&quality=detailed',
      ),
    ).toEqual({
      ...DEFAULT_SHARE_STATE,
      viewport: {
        center: { re: -0.158902249, im: -1.034028 },
        spanY: Number('0.019841269841269841269'),
      },
      qualityProfile: 'detailed',
      perfEnabled: true,
    });
    expect(resolveStartupState('?view=-1,0,0.5&quality=quick')).toEqual({
      ...DEFAULT_SHARE_STATE,
      viewport: { center: { re: -1, im: 0 }, spanY: 0.5 },
      qualityProfile: 'quick',
      perfEnabled: false,
    });
  });

  it('restores a v1 link and keeps the perf hook orthogonal to it', () => {
    expect(resolveStartupState(`?${BASILICA_QUERY}`)).toEqual({
      ...BASILICA_VIEW,
      perfEnabled: false,
    });
    expect(resolveStartupState(`?perf=1&${BASILICA_QUERY}`)).toEqual({
      ...BASILICA_VIEW,
      perfEnabled: true,
    });
  });

  it('does not read a harness view triple or quality key inside a v1 link', () => {
    const startup = resolveStartupState('?v=1&view=-1,0,0.5&quality=detailed');
    expect(startup.viewport).toEqual(DEFAULT_SHARE_STATE.viewport);
    expect(startup.qualityProfile).toBe('balanced');
    expect(startup.notice).toBe(
      'This link was adjusted: the interior view was not recognized, so Stability is shown.',
    );
  });

  it('falls back to the defaults with a notice when the version is missing', () => {
    expect(resolveStartupState('?c=-1,0&s=0.5&view=period')).toEqual({
      ...DEFAULT_SHARE_STATE,
      perfEnabled: false,
      notice: `This link has no format version, so it was not applied. ${DEFAULT_VIEW_SUFFIX}`,
    });
  });

  it('falls back to the defaults with a notice naming an unsupported version', () => {
    expect(resolveStartupState('?perf=1&v=2&c=-1,0&s=0.5')).toEqual({
      ...DEFAULT_SHARE_STATE,
      perfEnabled: true,
      notice: `This link uses format version 2, which this explorer does not read. ${DEFAULT_VIEW_SUFFIX}`,
    });
    expect(resolveStartupState('?v=0&view=period').notice).toBe(
      `This link uses format version 0, which this explorer does not read. ${DEFAULT_VIEW_SUFFIX}`,
    );
  });

  it('never repeats an unprintable version back to the user', () => {
    const notice = resolveStartupState('?v=%3Cb%3Ex%3C%2Fb%3E').notice;
    expect(notice).toBe(
      `This link uses an unrecognized format, so it was not applied. ${DEFAULT_VIEW_SUFFIX}`,
    );
    expect(notice).not.toContain('<b>');
  });

  it('lists every adjusted field in one notice, in field order', () => {
    const startup = resolveStartupState('?v=1&c=-1,0&s=1e-12&q=ultra&sel=mi-p9-nope');
    expect(startup.viewport).toEqual({ center: { re: -1, im: 0 }, spanY: MIN_VIEWPORT_SPAN_Y });
    expect(startup.notice).toBe(
      'This link was adjusted: ' +
        'the zoom was outside the supported range, so the nearest supported zoom is shown; ' +
        'the quality was not recognized, so Balanced is used; ' +
        'the selected point or component was not found, so nothing is selected.',
    );
  });
});

describe('addressBarSearch', () => {
  it('leaves a plain address plain for the default state', () => {
    expect(addressBarSearch('', DEFAULT_SHARE_STATE)).toBe('');
    expect(addressBarSearch('?v=1&c=-1,0&s=0.5', DEFAULT_SHARE_STATE)).toBe('');
    expect(addressBarSearch('?perf=1', DEFAULT_SHARE_STATE)).toBe('?perf=1');
  });

  it('writes the v1 fields after the parameters the schema does not own', () => {
    expect(addressBarSearch('', BASILICA_VIEW)).toBe(`?${BASILICA_QUERY}`);
    expect(addressBarSearch('?perf=1', BASILICA_VIEW)).toBe(`?perf=1&${BASILICA_QUERY}`);
  });

  it('replaces the harness view triple and quality key with v1 fields', () => {
    expect(
      addressBarSearch('?perf=1&view=-1,0,0.5&quality=detailed', {
        ...DEFAULT_SHARE_STATE,
        viewport: { center: { re: -1, im: 0 }, spanY: 0.5 },
        qualityProfile: 'detailed',
      }),
    ).toBe('?perf=1&v=1&c=-1,0&s=0.5&view=stability&q=detailed');
  });

  it('drops stale v1 fields, including a selection that was cleared', () => {
    expect(
      addressBarSearch(`?utm_source=mail&${BASILICA_QUERY}`, {
        ...BASILICA_VIEW,
        selection: undefined,
      }),
    ).toBe('?utm_source=mail&v=1&c=-1,0&s=0.5&view=period&q=quick');
  });

  it('is stable: the address it writes restores the same state and rewrites to itself', () => {
    const search = addressBarSearch('?perf=1', BASILICA_VIEW);
    expect(resolveStartupState(search)).toEqual({ ...BASILICA_VIEW, perfEnabled: true });
    expect(addressBarSearch(search, BASILICA_VIEW)).toBe(search);
  });
});

describe('shareLink', () => {
  it('carries only the v1 fields, never perf or foreign parameters', () => {
    expect(shareLink('http://127.0.0.1:4174', '/', BASILICA_VIEW)).toBe(
      `http://127.0.0.1:4174/?${BASILICA_QUERY}`,
    );
  });

  it('is the plain address for the default state', () => {
    expect(shareLink('https://example.org', '/atlas/', DEFAULT_SHARE_STATE)).toBe(
      'https://example.org/atlas/',
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/ui/share-link.test.ts`
Expected: FAIL. The suite cannot resolve `../../../src/ui/share-link`.

- [ ] **Step 3: Write the boundary module**

Create `src/ui/share-link.ts`:

```ts
import { parseBenchmarkParams } from './benchmark-params';
import {
  DEFAULT_SHARE_STATE,
  decodeShareState,
  encodeShareState,
  SHARE_KEYS,
  type ShareDecodeResult,
  type ShareFieldIssue,
  type ShareState,
} from './share-state';

/**
 * How the application starts from its address and keeps that address current
 * (ADR 0009). The benchmark harness parameters (`perf`, and `view`/`quality`
 * without `v`) keep their meaning; a v1 link takes precedence over them; and
 * `perf=1` stays an orthogonal diagnostic switch that is never copied into a
 * shared link.
 */

export interface StartupState extends ShareState {
  /** `?perf=1`: expose the render-trace diagnostic hook. */
  readonly perfEnabled: boolean;
  /** Shown and announced when the link could not be used as written. */
  readonly notice?: string | undefined;
}

/** The harness `quality` key, which the v1 `q` replaces when the address is rewritten. */
const LEGACY_SHARE_KEYS = ['quality'] as const;

const DEFAULT_VIEW_SUFFIX = 'Opening the default full-set view instead.';

const ISSUE_TEXT: Readonly<Record<ShareFieldIssue, string>> = Object.freeze({
  viewport: 'the view position was not valid, so the full-set view is shown',
  'zoom-clamped':
    'the zoom was outside the supported range, so the nearest supported zoom is shown',
  view: 'the interior view was not recognized, so Stability is shown',
  quality: 'the quality was not recognized, so Balanced is used',
  selection: 'the selected point or component was not found, so nothing is selected',
});

export const rejectionNotice = (
  result: Extract<ShareDecodeResult, { kind: 'rejected' }>,
): string => {
  if (result.reason === 'missing-version') {
    return `This link has no format version, so it was not applied. ${DEFAULT_VIEW_SUFFIX}`;
  }
  return result.version === undefined
    ? `This link uses an unrecognized format, so it was not applied. ${DEFAULT_VIEW_SUFFIX}`
    : `This link uses format version ${result.version}, which this explorer does not read. ${DEFAULT_VIEW_SUFFIX}`;
};

export const issuesNotice = (issues: readonly ShareFieldIssue[]): string =>
  `This link was adjusted: ${issues.map((issue) => ISSUE_TEXT[issue]).join('; ')}.`;

/** The state the application mounts with, from `window.location.search`. */
export const resolveStartupState = (search: string): StartupState => {
  const benchmark = parseBenchmarkParams(search);
  const shared = decodeShareState(search);
  switch (shared.kind) {
    case 'absent':
      return {
        ...DEFAULT_SHARE_STATE,
        viewport: benchmark.viewport ?? DEFAULT_SHARE_STATE.viewport,
        qualityProfile: benchmark.qualityProfile ?? DEFAULT_SHARE_STATE.qualityProfile,
        perfEnabled: benchmark.perfEnabled,
      };
    case 'rejected':
      return {
        ...DEFAULT_SHARE_STATE,
        perfEnabled: benchmark.perfEnabled,
        notice: rejectionNotice(shared),
      };
    case 'decoded':
      return {
        ...shared.state,
        perfEnabled: benchmark.perfEnabled,
        ...(shared.issues.length > 0 ? { notice: issuesNotice(shared.issues) } : {}),
      };
  }
};

/**
 * The address-bar query for `state`: every parameter the schema does not own
 * (for example `perf=1`), in its original order, followed by the v1 fields.
 * Returns "" or a string starting with "?", comparable to `location.search`.
 */
export const addressBarSearch = (currentSearch: string, state: ShareState): string => {
  const kept = new URLSearchParams(currentSearch);
  for (const key of [...SHARE_KEYS, ...LEGACY_SHARE_KEYS]) kept.delete(key);
  const parts = [kept.toString(), encodeShareState(state)].filter((part) => part !== '');
  return parts.length === 0 ? '' : `?${parts.join('&')}`;
};

/** The link the copy control places on the clipboard: the v1 fields only. */
export const shareLink = (origin: string, pathname: string, state: ShareState): string => {
  const query = encodeShareState(state);
  return `${origin}${pathname}${query === '' ? '' : `?${query}`}`;
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/ui/share-link.test.ts tests/unit/ui/share-state.test.ts tests/unit/ui/benchmark-params.test.ts`
Expected: PASS, `Test Files  3 passed (3)`. The benchmark-params suite is unchanged and still passes.

- [ ] **Step 5: Run the gates**

Run: `npx prettier --write src/ui/share-link.ts tests/unit/ui/share-link.test.ts`, then:

```bash
npm run check
npm run fixtures:kernel-golden -- --check
npx playwright test
```

Expected: all exit 0. The unit step gains one test file and 15 tests with no failures; Playwright's counts are unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/ui/share-link.ts tests/unit/ui/share-link.test.ts
git commit -F - <<'EOF'
Shareable URLs: startup precedence, notices and address-bar query

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: Restore on load, settled-view `replaceState`, and the link notice

**Files:**

- Modify: `src/ui/application.ts` (imports lines 15–38, constant at line 70, mount start lines 95–140, semantic select lines 211–219, feedback/legend lines 280–292, `primary.append` line 407, timers line 414, `showFeedback` lines 432–438, `presentFrame` line 597, `inspectPoint` lines 718–740, semantic change handler lines 812–816, end of mount lines 1083–1095, helper before `formatEvidence` line 1351)
- Modify: `src/styles.css` (before `.controls {` at line 209; inside `@media (max-width: 45rem)` at line 1050; inside `@media (forced-colors: active)` at line 1214)
- Test: `tests/e2e/explorer.spec.ts` (append a new `test.describe` at the end of the file)

**Interfaces:**

- Consumes: `resolveStartupState`, `addressBarSearch` (Task 2); types `ShareSelection`, `ShareState` (Task 1); `findCatalogComponent` from `src/catalog/components.ts`.
- Produces, inside `mountApplication` (Task 4 uses these): `linkNotice: HTMLDivElement`; `currentShareState(): ShareState`; `replaceAddressBar(): void`; `scheduleUrlWrite(): void`; `showLinkNotice(message: string): void`. Module level: `URL_WRITE_DELAY_MS = 500`; `semanticViewDescription(view: SemanticView): string`. DOM: a `role="status"` element named `Link notice` above the controls.

- [ ] **Step 1: Write the failing browser tests**

Append to the end of `tests/e2e/explorer.spec.ts`, after the final `});` that closes `test.describe('Mandelbrot Interiority explorer', …)`, leaving one blank line between them:

```ts
test.describe('Shareable links (MI-UX-019)', () => {
  const waitForStable = async (page: Page): Promise<void> => {
    await expect(page.locator('#explorer')).toHaveAttribute('data-render-stage', 'stable', {
      timeout: 30_000,
    });
  };
  const searchParam = (page: Page, key: string): string | null =>
    new URL(page.url()).searchParams.get(key);

  test('records a settled view in the address without adding history and reopens it', async ({
    page,
    context,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Explore' }).click();
    await waitForStable(page);
    const historyLength = await page.evaluate(() => history.length);

    const periodTwo = page.getByRole('button', { name: 'Inspect Period-2 bulb, period 2' });
    await expect(periodTwo).toBeVisible({ timeout: 20_000 });
    await periodTwo.click();
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await page.getByLabel('Interior view').selectOption('period');
    await page.getByLabel('Quality').selectOption('quick');
    await waitForStable(page);
    await expect.poll(() => searchParam(page, 'q')).toBe('quick');
    expect(searchParam(page, 'v')).toBe('1');
    expect(searchParam(page, 'view')).toBe('period');
    expect(searchParam(page, 'sel')).toBe('mi-p2-basilica');
    expect(await page.evaluate(() => history.length)).toBe(historyLength);

    const link = page.url();
    const magnification = (await page.getByLabel('Magnification').textContent()) ?? '';
    const center = (await page.locator('.coordinates__center').textContent()) ?? '';
    const reopened = await context.newPage();
    await reopened.goto(link);
    await waitForStable(reopened);
    await expect(reopened.getByLabel('Interior view')).toHaveValue('period');
    await expect(reopened.getByLabel('Quality')).toHaveValue('quick');
    await expect(reopened.getByLabel('Magnification')).toHaveText(magnification);
    await expect(reopened.locator('.coordinates__center')).toHaveText(center);
    await expect(
      reopened
        .getByRole('region', { name: 'Point evidence' })
        .getByRole('heading', { name: 'Period-2 bulb' }),
    ).toBeVisible();
    await expect(reopened.getByRole('status', { name: 'Link notice' })).toHaveText('');
    expect(reopened.url()).toBe(link);
  });

  test('restores a selected point and inspects it again', async ({ page }) => {
    await page.goto('/?v=1&c=-0.75,0&s=2.5&view=stability&q=balanced&sel=-0.1,0.65');
    await expect(page.locator('#selected-point-status')).toContainText('Outcome:', {
      timeout: 10_000,
    });
    await expect(page.locator('.selected-point-marker')).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Point evidence' }).locator('.inspector__coordinate'),
    ).toHaveText('c = -0.1 + 0.65i');
    await expect(page.getByRole('status', { name: 'Link notice' })).toHaveText('');
  });

  test('falls back visibly from malformed fields and clamps an out-of-range zoom', async ({
    page,
  }) => {
    await page.goto('/?v=1&c=abc,0&s=2.5&view=sparkle&q=ultra&sel=mi-p9-nope');
    const notice = page.getByRole('status', { name: 'Link notice' });
    await expect(notice).toContainText(
      'This link was adjusted: the view position was not valid, so the full-set view is shown',
    );
    await expect(notice).toContainText('so nothing is selected.');
    await expect(page.getByLabel('Interior view')).toHaveValue('stability');
    await expect(page.getByLabel('Quality')).toHaveValue('balanced');
    await expect(page.getByRole('button', { name: /Reset/ })).toBeDisabled();
    await expect(page.locator('#selected-point-status')).toHaveText('No point selected.');
    await waitForStable(page);
    await expectNoAccessibilityViolations(page);
    // The resulting default view owns no parameters, so the broken link leaves the address.
    await expect.poll(() => new URL(page.url()).search).toBe('');

    await page.getByRole('button', { name: 'Explore' }).click();
    await notice.getByRole('button', { name: 'Dismiss link notice' }).click();
    await expect(notice).toHaveText('');
    await expect(page.getByLabel('Interactive Mandelbrot set')).toBeFocused();

    await page.goto('/?v=1&c=-1.25,0&s=1e-12&view=multiplier');
    await expect(notice).toContainText('the nearest supported zoom is shown');
    await expect(page.getByLabel('Magnification')).toHaveText('6.00e6×');
    await expect(page.getByLabel('Interior view')).toHaveValue('multiplier');
    await expect(page.getByRole('button', { name: 'Zoom in' })).toBeDisabled();
  });

  test('refuses an unknown or missing version with a notice instead of guessing', async ({
    page,
  }) => {
    const notice = page.getByRole('status', { name: 'Link notice' });
    for (const [search, message] of [
      [
        '/?v=2&c=-1,0&s=0.5&view=period&q=quick',
        'This link uses format version 2, which this explorer does not read.',
      ],
      ['/?v=0&c=-1,0&s=0.5', 'This link uses format version 0, which this explorer does not read.'],
      ['/?c=-1,0&s=0.5&view=period', 'This link has no format version, so it was not applied.'],
    ] as const) {
      await page.goto(search);
      await expect(notice).toContainText(message);
      await expect(notice).toContainText('Opening the default full-set view instead.');
      await expect(page.getByLabel('Interior view')).toHaveValue('stability');
      await expect(page.getByLabel('Quality')).toHaveValue('balanced');
      await expect(page.getByRole('button', { name: /Reset/ })).toBeDisabled();
    }
  });

  test('keeps the benchmark harness view and quality parameters working', async ({ page }) => {
    await page.goto('/?view=-1,0,0.5&quality=quick');
    await expect(page.getByLabel('Quality')).toHaveValue('quick');
    await expect(page.getByLabel('Magnification')).toHaveText('5.00×');
    await expect(page.getByRole('status', { name: 'Link notice' })).toHaveText('');
    await waitForStable(page);
    await expect.poll(() => searchParam(page, 'v')).toBe('1');
    expect(searchParam(page, 'q')).toBe('quick');
    expect(searchParam(page, 'quality')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx playwright test -g "Shareable links" --project=chromium --project=firefox`
Expected: FAIL, 10 failed (5 per engine). The `Link notice` status does not exist, the address bar never gains `v=1`, and a restored selection is not inspected.

- [ ] **Step 3: Wire the startup state and link notice into `src/ui/application.ts`**

Make each replacement below exactly. Every "Replace" block occurs exactly once in the file.

3a. Replace

```
import { COMPONENT_CATALOG, type CatalogComponent } from '../catalog/components';
```

with

```
import {
  COMPONENT_CATALOG,
  findCatalogComponent,
  type CatalogComponent,
} from '../catalog/components';
```

3b. Replace

```
import { parseBenchmarkParams } from './benchmark-params';
```

with

```
import { addressBarSearch, resolveStartupState } from './share-link';
import type { ShareSelection, ShareState } from './share-state';
```

3c. In the `./view-state` import list, replace

```
  DEFAULT_VIEWPORT,
  DEFAULT_QUALITY_PROFILE_ID,
```

with

```
  DEFAULT_VIEWPORT,
```

3d. Replace

```
const RENDER_DELAY_MS = 65;
```

with

```
const RENDER_DELAY_MS = 65;
/** Quiet time after a settled view before the address bar records it (ADR 0009). */
const URL_WRITE_DELAY_MS = 500;
```

3e. Replace

```
  // Opt-in benchmark parameters (plan §8/§9): validated query parameters for
  // the Stage A evidence harness. Absent parameters leave every default —
  // viewport, quality profile, and trace hook — untouched.
  const benchmark = parseBenchmarkParams(window.location.search);
```

with

```
  // The starting view (ADR 0009): a v1 share link, else the benchmark
  // harness's opt-in parameters (plan §8/§9), else the defaults. `perf=1`
  // enables the render-trace hook in every case.
  const startup = resolveStartupState(window.location.search);
```

3f. Replace both occurrences of `benchmark.perfEnabled` with `startup.perfEnabled` (one in `createRenderTraceRing({ ...(benchmark.perfEnabled`, one in `if (benchmark.perfEnabled) {`).

3g. Replace

```
    viewport: benchmark.viewport ? { ...benchmark.viewport } : { ...DEFAULT_VIEWPORT },
    semanticView: 'stability',
```

with

```
    viewport: { ...startup.viewport },
    semanticView: startup.semanticView,
```

3h. Replace

```
    qualityProfile: benchmark.qualityProfile ?? DEFAULT_QUALITY_PROFILE_ID,
```

with

```
    qualityProfile: startup.qualityProfile,
```

3i. Replace

```
    semanticSelect.append(element('option', { text: view.label, attributes: { value: view.id } }));
  }
  const semanticDescription = element('p', {
    className: 'control-description',
    text: SEMANTIC_VIEWS[0].description,
```

with

```
    semanticSelect.append(element('option', { text: view.label, attributes: { value: view.id } }));
  }
  semanticSelect.value = state.semanticView;
  const semanticDescription = element('p', {
    className: 'control-description',
    text: semanticViewDescription(state.semanticView),
```

3j. Replace

```
      'aria-label': 'Interaction feedback',
      'aria-live': 'polite',
      'aria-atomic': 'true',
    },
  });
```

with

```
      'aria-label': 'Interaction feedback',
      'aria-live': 'polite',
      'aria-atomic': 'true',
    },
  });
  // Always in the document so that filling it is announced; empty, it takes
  // no space (styles.css `.link-notice:empty`).
  const linkNotice = element('div', {
    className: 'link-notice',
    attributes: {
      role: 'status',
      'aria-label': 'Link notice',
      'aria-live': 'polite',
      'aria-atomic': 'true',
    },
  });
```

3k. Replace

```
  const legend = createSemanticLegend();
```

with

```
  const legend = createSemanticLegend();
  legend.update(state.semanticView);
```

3l. Replace

```
  primary.append(controls, canvasShell);
```

with

```
  primary.append(linkNotice, controls, canvasShell);
```

3m. Replace

```
  let feedbackTimer: ReturnType<typeof setTimeout> | undefined;
```

with

```
  let feedbackTimer: ReturnType<typeof setTimeout> | undefined;
  let urlTimer: ReturnType<typeof setTimeout> | undefined;
  let noticeTimer: ReturnType<typeof setTimeout> | undefined;
```

3n. Replace the end of `showFeedback`

```
    feedbackTimer = setTimeout(() => {
      feedback.classList.remove('feedback--visible');
    }, 2600);
  }
```

with

```
    feedbackTimer = setTimeout(() => {
      feedback.classList.remove('feedback--visible');
    }, 2600);
  }

  function showLinkNotice(message: string): void {
    const dismiss = button('Dismiss', { className: 'link-notice__dismiss' });
    dismiss.setAttribute('aria-label', 'Dismiss link notice');
    dismiss.addEventListener('click', () => {
      linkNotice.replaceChildren();
      renderCanvas.focus();
    });
    linkNotice.replaceChildren(
      element('p', { className: 'link-notice__text', text: message }),
      dismiss,
    );
  }

  function currentSelection(): ShareSelection | undefined {
    if (state.selectedCatalogId !== undefined) {
      return { kind: 'catalog', id: state.selectedCatalogId };
    }
    return state.selectedPoint === undefined
      ? undefined
      : { kind: 'point', point: state.selectedPoint };
  }

  function currentShareState(): ShareState {
    return {
      viewport: state.viewport,
      semanticView: state.semanticView,
      qualityProfile: state.qualityProfile,
      selection: currentSelection(),
    };
  }

  function replaceAddressBar(): void {
    const search = addressBarSearch(window.location.search, currentShareState());
    if (search === window.location.search) return;
    history.replaceState(
      history.state,
      '',
      `${window.location.pathname}${search}${window.location.hash}`,
    );
  }

  /**
   * Records the view in the address bar once it has settled (ADR 0009):
   * `replaceState`, so Back still leaves the explorer, and never mid-drag or
   * while a newer render is pending, whose stable frame reschedules this.
   */
  function scheduleUrlWrite(): void {
    if (urlTimer !== undefined) clearTimeout(urlTimer);
    urlTimer = setTimeout(() => {
      urlTimer = undefined;
      if (pointerSession !== undefined || renderTimer !== undefined) return;
      if (state.frameStage !== 'stable') return;
      replaceAddressBar();
    }, URL_WRITE_DELAY_MS);
  }

  /** Applies the link's notice and selection; needs the worker client. */
  function restoreFromLink(): void {
    const notice = startup.notice;
    if (notice !== undefined) {
      // Filled after mount: screen readers announce changes to a live
      // region, not the content it starts with.
      noticeTimer = setTimeout(() => {
        showLinkNotice(notice);
      }, 0);
    }
    const selection = startup.selection;
    if (selection?.kind === 'point') {
      inspectPoint(selection.point);
    } else if (selection?.kind === 'catalog') {
      const component = findCatalogComponent(selection.id);
      if (component) inspectPoint(component.center, component);
    }
  }
```

3o. In `presentFrame`, replace

```
      presentationContext.drawImage(renderCanvas, 0, 0);
    }
  }
```

with

```
      presentationContext.drawImage(renderCanvas, 0, 0);
      scheduleUrlWrite();
    }
  }
```

3p. At the end of `inspectPoint`, replace

```
    updateCatalogSelection();
    updateSelectedPointMarker();
  }

  function updateCatalogSelection(): void {
```

with

```
    updateCatalogSelection();
    updateSelectedPointMarker();
    scheduleUrlWrite();
  }

  function updateCatalogSelection(): void {
```

3q. In the `semanticSelect` change handler, replace

```
    state.semanticView = semanticSelect.value as SemanticView;
    const selected = SEMANTIC_VIEWS.find((view) => view.id === state.semanticView);
    semanticDescription.textContent = selected?.description ?? '';
```

with

```
    state.semanticView = semanticSelect.value as SemanticView;
    semanticDescription.textContent = semanticViewDescription(state.semanticView);
```

3r. Replace

```
  resizeObserver.observe(canvasStack);
  scheduleRender(true);
```

with

```
  resizeObserver.observe(canvasStack);
  scheduleRender(true);
  restoreFromLink();
```

3s. In the returned cleanup function, replace

```
    if (feedbackTimer !== undefined) clearTimeout(feedbackTimer);
    resizeObserver.disconnect();
```

with

```
    if (feedbackTimer !== undefined) clearTimeout(feedbackTimer);
    if (urlTimer !== undefined) clearTimeout(urlTimer);
    if (noticeTimer !== undefined) clearTimeout(noticeTimer);
    resizeObserver.disconnect();
```

3t. Replace

```
function formatEvidence(evidence: string): string {
```

with

```
function semanticViewDescription(view: SemanticView): string {
  return SEMANTIC_VIEWS.find((candidate) => candidate.id === view)?.description ?? '';
}

function formatEvidence(evidence: string): string {
```

Do not add branches to the body of `mountApplication` itself: its ESLint complexity is 13 of the allowed 18, and these edits lower it by two. New logic lives in the nested functions above.

- [ ] **Step 4: Style the link notice in `src/styles.css`**

4a. Replace

```
.controls {
  min-height: 5.5rem;
```

with

```
.link-notice {
  margin-bottom: 0.75rem;
  padding: 0.5rem 0.5rem 0.5rem 0.85rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  color: var(--ink);
  background: var(--surface);
  border: 1px solid var(--warning);
  border-left-width: 0.3rem;
  border-radius: var(--radius-md);
  font-size: 0.85rem;
}

.link-notice:empty {
  margin: 0;
  padding: 0;
  border: 0;
}

.link-notice__text {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
}

.link-notice__dismiss {
  min-height: 2.75rem;
  padding: 0.4rem 0.75rem;
  flex: none;
  color: var(--ink);
  background: var(--surface-raised);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-weight: 650;
}

.controls {
  min-height: 5.5rem;
```

4b. Inside `@media (max-width: 45rem)`, replace

```
  .controls {
    padding: 0.75rem;
    align-items: stretch;
```

with

```
  .link-notice {
    align-items: stretch;
    flex-direction: column;
    gap: 0.5rem;
  }

  .controls {
    padding: 0.75rem;
    align-items: stretch;
```

4c. Inside `@media (forced-colors: active)`, replace

```
  .zoom-selection {
    border: 2px dashed CanvasText;
  }
```

with

```
  .zoom-selection {
    border: 2px dashed CanvasText;
  }

  .link-notice {
    border-color: CanvasText;
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx prettier --write src/ui/application.ts src/styles.css tests/e2e/explorer.spec.ts`
Run: `npx playwright test -g "Shareable links" --project=chromium --project=firefox`
Expected: PASS, `10 passed`.

- [ ] **Step 6: Run the gates**

```bash
npm run check
npm run fixtures:kernel-golden -- --check
npx playwright test
```

Expected: all exit 0. Unit counts are unchanged. Playwright gains 10 passing tests (5 per engine) with no failures; the existing `render traces carry delivery provenance…` test (legacy `?perf=1&view=…&quality=…`) still passes.

- [ ] **Step 7: Commit**

```bash
git add src/ui/application.ts src/styles.css tests/e2e/explorer.spec.ts
git commit -F - <<'EOF'
Shareable URLs: restore on load, settled-view replaceState, link notice

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: The Copy link control

**Files:**

- Modify: `src/ui/icons.ts` (add `link` after `region`, line 11–12)
- Modify: `src/ui/application.ts` (share-link import; reset button block near line 254; `controlActions.append` near line 358; before `restoreFromLink`; after `resetButton.addEventListener` near line 864)
- Test: `tests/e2e/explorer.spec.ts` (insert three tests into the `Shareable links (MI-UX-019)` block)

**Interfaces:**

- Consumes: `shareLink(origin, pathname, state)` (Task 2); `currentShareState()`, `replaceAddressBar()`, `showFeedback(message)` inside `mountApplication` (Task 3 and existing).
- Produces: a button with accessible name `Copy link to this view`, visible label `Copy link`, title `Copy a link to this view`, last in `.controls__actions`; `copyShareLink(): Promise<void>` inside `mountApplication`; icon key `link`.

- [ ] **Step 1: Write the failing browser tests**

In `tests/e2e/explorer.spec.ts`, inside `test.describe('Shareable links (MI-UX-019)', …)`, insert the following directly before the line `  test('keeps the benchmark harness view and quality parameters working', async ({ page }) => {`. The block is indented two spaces, as it sits inside the `describe` callback, and ends with one blank line:

```
  test('copies a link to the current view from the keyboard and announces it', async ({
    page,
    context,
  }) => {
    await page.addInitScript(() => {
      const copied: string[] = [];
      Object.defineProperty(window, '__copiedLinks', { value: copied });
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: (text: string): Promise<void> => {
            copied.push(text);
            return Promise.resolve();
          },
        },
      });
    });
    await page.goto('/?perf=1');
    await page.getByRole('button', { name: 'Explore' }).click();
    await waitForStable(page);
    await page.getByLabel('Interior view').selectOption('multiplier');
    const canvas = page.getByLabel('Interactive Mandelbrot set');
    await canvas.focus();
    await canvas.press('+');
    await waitForStable(page);

    const copy = page.getByRole('button', { name: 'Copy link to this view' });
    await copy.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status', { name: 'Interaction feedback' })).toHaveText(
      'Link to this view copied.',
    );
    const copied = await page.evaluate(
      () => (window as unknown as { __copiedLinks: string[] }).__copiedLinks,
    );
    expect(copied).toHaveLength(1);
    const link = new URL(copied[0] ?? '');
    expect(link.searchParams.get('perf')).toBeNull();
    expect(link.searchParams.get('v')).toBe('1');
    expect(link.searchParams.get('view')).toBe('multiplier');

    const magnification = (await page.getByLabel('Magnification').textContent()) ?? '';
    const reopened = await context.newPage();
    await reopened.goto(link.toString());
    await waitForStable(reopened);
    await expect(reopened.getByLabel('Interior view')).toHaveValue('multiplier');
    await expect(reopened.getByLabel('Magnification')).toHaveText(magnification);
  });

  test('explains a failed copy and puts the link in the address bar', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: (): Promise<void> => Promise.reject(new Error('denied')) },
      });
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Explore' }).click();
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await page.getByRole('button', { name: 'Copy link to this view' }).click();
    await expect(page.getByRole('status', { name: 'Interaction feedback' })).toHaveText(
      'Could not copy automatically. The address bar now shows the link to this view.',
    );
    expect(searchParam(page, 'v')).toBe('1');
  });

  test('keeps the link notice and copy control usable in forced colors at 320 px', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.emulateMedia({ forcedColors: 'active' });
    await page.goto('/?v=9');
    await page.getByRole('button', { name: 'Explore', exact: true }).click();
    const notice = page.getByRole('status', { name: 'Link notice' });
    await expect(notice).toContainText('This link uses format version 9');
    await expect(notice).toHaveCSS('border-top-style', 'solid');
    // Non-colour cue: the thick leading edge survives forced colours.
    expect(
      await notice.evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).borderLeftWidth),
      ),
    ).toBeGreaterThanOrEqual(4);
    await expectNoHorizontalOverflow(page, '320 px link notice');

    const copy = page.getByRole('button', { name: 'Copy link to this view' });
    for (const target of [notice.getByRole('button', { name: 'Dismiss link notice' }), copy]) {
      const box = await target.boundingBox();
      expect(box).not.toBeNull();
      if (box) {
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(320);
      }
    }

    for (let step = 0; step < 20; step += 1) {
      if (await copy.evaluate((element) => element === document.activeElement)) break;
      await page.keyboard.press('Tab');
    }
    await expect(copy).toBeFocused();
    await expect
      .poll(() => copy.evaluate((element) => element.matches(':focus-visible')))
      .toBe(true);
    const focusStyle = await copy.evaluate((element) => {
      const style = getComputedStyle(element);
      return { style: style.outlineStyle, width: Number.parseFloat(style.outlineWidth) };
    });
    expect(focusStyle.style).not.toBe('none');
    expect(focusStyle.width).toBeGreaterThanOrEqual(3);
  });

```

The 320 px test deliberately does not run axe: at 320 px the existing catalog markers already fail axe `target-size` (`button[title="Airplane, period 3"]`), independently of this work. The existing `reflows phone layouts…` test also covers the new button, because it checks every `.controls__actions button` for a 44 px height inside the viewport at 320, 375 and 430 px.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx playwright test -g "copies a link|failed copy|forced colors at 320" --project=chromium --project=firefox`
Expected: FAIL, 6 failed. No button named `Copy link to this view` exists.

- [ ] **Step 3: Add the icon**

In `src/ui/icons.ts`, replace

```
  region:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4H4v4M16 4h4v4M20 16v4h-4M8 20H4v-4"/><path d="M9 9h6v6H9z"/></svg>',
```

with

```
  region:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4H4v4M16 4h4v4M20 16v4h-4M8 20H4v-4"/><path d="M9 9h6v6H9z"/></svg>',
  link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
```

- [ ] **Step 4: Add the control to `src/ui/application.ts`**

4a. Replace

```
import { addressBarSearch, resolveStartupState } from './share-link';
```

with

```
import { addressBarSearch, resolveStartupState, shareLink } from './share-link';
```

4b. Replace

```
  setIcon(resetButton, 'reset', 'Reset');
```

with

```
  setIcon(resetButton, 'reset', 'Reset');
  const copyLinkButton = button('', {
    className: 'icon-button',
    title: 'Copy a link to this view',
  });
  setIcon(copyLinkButton, 'link', 'Copy link');
  copyLinkButton.setAttribute('aria-label', 'Copy link to this view');
```

4c. Replace

```
  controlActions.append(pointerToolGroup, catalogToggle, zoomGroup, resetButton);
```

with

```
  controlActions.append(pointerToolGroup, catalogToggle, zoomGroup, resetButton, copyLinkButton);
```

4d. Replace

```
  /** Applies the link's notice and selection; needs the worker client. */
```

with

```
  /**
   * Copies the v1 link for the current view. The shared link never carries
   * `perf` or foreign parameters. Without clipboard access (an insecure
   * origin, a denied permission) the address bar is brought up to date
   * instead, so the link is still one step away.
   */
  async function copyShareLink(): Promise<void> {
    const link = shareLink(window.location.origin, window.location.pathname, currentShareState());
    try {
      await navigator.clipboard.writeText(link);
      showFeedback('Link to this view copied.');
    } catch {
      replaceAddressBar();
      showFeedback(
        'Could not copy automatically. The address bar now shows the link to this view.',
      );
    }
  }

  /** Applies the link's notice and selection; needs the worker client. */
```

4e. Replace

```
  resetButton.addEventListener('click', resetView);
```

with

```
  resetButton.addEventListener('click', resetView);
  copyLinkButton.addEventListener('click', () => {
    void copyShareLink();
  });
```

The announcement uses the existing `feedback` element, which is already a polite, atomic `role="status"` live region named `Interaction feedback`. The visible label `Copy link` is the start of the accessible name `Copy link to this view` (WCAG 2.5.3), and below 27rem, where `.icon-button span` is hidden, the `aria-label` keeps the name.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx prettier --write src/ui/application.ts src/ui/icons.ts tests/e2e/explorer.spec.ts`
Run: `npx playwright test -g "Shareable links|reflows phone|forced colors" --project=chromium --project=firefox`
Expected: PASS, `20 passed`.

- [ ] **Step 6: Run the gates**

```bash
npm run check
npm run fixtures:kernel-golden -- --check
npx playwright test
```

Expected: all exit 0. Playwright gains 6 passing tests (3 per engine) with no failures.

- [ ] **Step 7: Commit**

```bash
git add src/ui/application.ts src/ui/icons.ts tests/e2e/explorer.spec.ts
git commit -F - <<'EOF'
Shareable URLs: keyboard-operable Copy link control with announcement

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 5: `MI-UX-019` traceability, documentation, and the TODO

**Files:**

- Modify: `docs/verification/REQUIREMENTS.md` (new section before `## Phase 2 performance requirements`, line 49)
- Modify: `model/MandelbrotInteriority.sysml` (after `MI-UX-017` at line 383; `uxSatisfactionContext`; `MI-VER-UX-002` at line 556)
- Modify: `model/README.md` (lines 18–19)
- Modify: `docs/PLAN.md` (§8.1, lines 263–264)
- Modify: `docs/IMPLEMENTATION.md` (end of "Architecture boundaries", "Testing boundaries", "Requirements traceability")
- Modify: `docs/verification/PHASE2-TODO.md` (item 3, lines 140–158; "Proposed requirements" bullet, lines 256–259)

**Interfaces:**

- Consumes: the test names from Tasks 3–4 (`Shareable links (MI-UX-019)` block), ADR 0009, and the unit suite names `share-state` and `share-link`.
- Produces: `MI-UX-019` in the requirements matrix and the SysML model, satisfied by `app.uiShell` and verified by `MI-VER-UX-002`.

- [ ] **Step 1: Add the requirement to `docs/verification/REQUIREMENTS.md`**

Replace

```
## Phase 2 performance requirements
```

with

```
## Phase 2 UX requirements

Added as each [Phase 2 TODO](PHASE2-TODO.md) item lands, continuing the
`MI-UX` numbering. As above, test names are stable references into
`tests/e2e/explorer.spec.ts`, and **Implemented** means the behavior and its
automated evidence exist while some evidence needed to close the requirement
is still outstanding.

| Requirement | Requirement text | State | Automated evidence | Remaining evidence |
| --- | --- | --- | --- | --- |
| `MI-UX-019` Shareable state | The viewport (exact decimal centre and span), semantic view, quality profile, and selection shall be encoded in a versioned URL and restored on load; malformed or out-of-range values shall fall back to defaults with a notice; an older version shall never be reinterpreted silently. | **Implemented** | `Shareable links (MI-UX-019)` browser scenarios in Firefox and Chromium (round trip, copy link, failed copy, malformed fields, zoom clamp, unknown and missing versions, harness parameters, forced colors at 320 px); `share-state` and `share-link` unit suites; [ADR 0009](../decisions/0009-shareable-url-schema.md) | Screen-reader announcement of the link notice and the copy confirmation in the next manual accessibility record |

## Phase 2 performance requirements
```

Prettier aligns the table in Step 7.

- [ ] **Step 2: Add the requirement to `model/MandelbrotInteriority.sysml`**

2a. Replace the end of the `MI-UX-017` requirement and the closing brace of `package UserExperienceRequirements`:

```
             * retry after recovery is exhausted. Any future optional renderer
             * shall fall back automatically to Worker CPU when unavailable or
             * rejected.
             */
        }
    }
```

with

```
             * retry after recovery is exhausted. Any future optional renderer
             * shall fall back automatically to Worker CPU when unavailable or
             * rejected.
             */
        }

        requirement <'MI-UX-019'> ShareableState {
            subject app : Architecture::MandelbrotInteriorityApplication;
            doc /*
             * The viewport (exact decimal centre and span), semantic view,
             * quality profile, and selection shall be encoded in a versioned
             * URL and restored on load. Malformed or out-of-range values
             * shall fall back to defaults with a notice, and an older version
             * shall never be reinterpreted silently.
             */
        }
    }
```

2b. Replace

```
            satisfy UserExperienceRequirements::RendererRecoveryAndFallback
                by app.uiShell.rendererLifecycle;
```

with

```
            satisfy UserExperienceRequirements::RendererRecoveryAndFallback
                by app.uiShell.rendererLifecycle;
            satisfy UserExperienceRequirements::ShareableState
                by app.uiShell;
```

2c. In `MI-VER-UX-002` `NavigationInteractionTest`, replace

```
             * Exercise pointer and keyboard navigation, point and
             * area-selection zoom, cancellation, reset, and both boundaries
             * of the permitted zoom range.
             */
            objective navigationInteraction {
                verify UserExperienceRequirements::ResponsiveNavigation;
                verify UserExperienceRequirements::RestoreDefaultView;
                verify UserExperienceRequirements::ZoomBoundFeedback;
            }
```

with

```
             * Exercise pointer and keyboard navigation, point and
             * area-selection zoom, cancellation, reset, both boundaries of
             * the permitted zoom range, and shareable links: round trip,
             * copy, malformed fields, and unknown or missing versions.
             */
            objective navigationInteraction {
                verify UserExperienceRequirements::ResponsiveNavigation;
                verify UserExperienceRequirements::RestoreDefaultView;
                verify UserExperienceRequirements::ZoomBoundFeedback;
                verify UserExperienceRequirements::ShareableState;
            }
```

- [ ] **Step 3: Update `model/README.md`**

Replace

```
- `UserExperienceRequirements` — sixteen active baselined Phase 1 UX
  requirements plus the retained OBE `MI-UX-014` requirement;
```

with

```
- `UserExperienceRequirements` — sixteen active baselined Phase 1 UX
  requirements, the Phase 2 shareable-state requirement `MI-UX-019`, and the
  retained OBE `MI-UX-014` requirement;
```

- [ ] **Step 4: Update `docs/PLAN.md` §8.1**

Replace

```
The active normative first-release UX requirements are `MI-UX-001` through
`MI-UX-013` and `MI-UX-015` through `MI-UX-017` in
```

with

```
The active normative first-release UX requirements are `MI-UX-001` through
`MI-UX-013`, `MI-UX-015` through `MI-UX-017`, and the Phase 2 `MI-UX-019`
(shareable versioned links) in
```

- [ ] **Step 5: Update `docs/IMPLEMENTATION.md`**

5a. At the end of "Architecture boundaries", replace

```
coordinates at higher magnification. Catalog source coordinates remain stored independently at
their canonical data precision.
```

with

```
coordinates at higher magnification. Catalog source coordinates remain stored independently at
their canonical data precision.

Shareable links follow [ADR 0009](decisions/0009-shareable-url-schema.md). `src/ui/share-state.ts`
is the pure v1 codec and `src/ui/share-link.ts` its application boundary: startup precedence, the
address-bar query, the copied link, and the notice text. The UI reads the address once at mount,
records a settled view with `history.replaceState` 500 ms after a stable frame (never during a
pointer session or while a render is pending), and copies only the v1 fields through the Copy link
control. The benchmark parameters in `src/ui/benchmark-params.ts` stay separate: `perf=1` is
orthogonal to a share link, and `view=<re>,<im>,<spanY>&quality=` applies only to a URL without
share fields.
```

5b. In "Testing boundaries", replace

```
- Numerical fixtures must state their provenance and tolerances.
```

with

```
- Shareable links: unit tests pin the codec (exact round trip, every malformed field, clamping,
  versions) and the startup precedence over the benchmark parameters; browser tests in both engines
  cover the round trip, copy link, malformed and unknown-version links, and the harness parameters.
  Copy tests stub `navigator.clipboard` with `page.addInitScript`, because Playwright cannot grant
  clipboard permissions in Firefox.
- Numerical fixtures must state their provenance and tolerances.
```

5c. In the "Requirements traceability" table, replace

```
| MI-UX-017                   | Replaceable Worker lifecycle, bounded recovery, manual retry, and future CPU fallback |
```

with

```
| MI-UX-017                   | Replaceable Worker lifecycle, bounded recovery, manual retry, and future CPU fallback |
| MI-UX-019 | Versioned share-link codec, settled-view `replaceState`, copy link, and visible notices |
```

- [ ] **Step 6: Tick item 3 in `docs/verification/PHASE2-TODO.md`**

6a. Replace

```
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
```

with

```
**Trace:** `MI-UX-019`. **Estimate:** 3–4. **Needs:** Q2.

- [x] A short ADR for the URL schema
      ([ADR 0009](../decisions/0009-shareable-url-schema.md)).
- [x] A pure `encodeState`/`decodeState` module: versioned, exact decimals,
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
```

6b. Under "Proposed requirements", replace

```
  with a notice; an older version is never reinterpreted silently.
```

with

```
  with a notice; an older version is never reinterpreted silently. Added
  2026-10-16 with item 3.
```

- [ ] **Step 7: Format and verify the trace**

Run: `npx prettier --write docs/verification/REQUIREMENTS.md docs/IMPLEMENTATION.md docs/verification/PHASE2-TODO.md docs/PLAN.md model/README.md`
Run: `grep -c "MI-UX-019" docs/verification/REQUIREMENTS.md model/MandelbrotInteriority.sysml model/README.md docs/PLAN.md docs/IMPLEMENTATION.md docs/verification/PHASE2-TODO.md`
Expected: every count is at least 1 (`REQUIREMENTS.md:1`, `MandelbrotInteriority.sysml:1`, `README.md:1`, `PLAN.md:1`, `IMPLEMENTATION.md:1`, `PHASE2-TODO.md:2`).
Run: `grep -n "ShareableState" model/MandelbrotInteriority.sysml`
Expected: three lines: the requirement definition, the `satisfy`, and the `verify`.

- [ ] **Step 8: Run the gates**

```bash
npm run check
npm run fixtures:kernel-golden -- --check
npx playwright test
```

Expected: all exit 0, with no change in test counts.

- [ ] **Step 9: Commit**

```bash
git add docs/verification/REQUIREMENTS.md model/MandelbrotInteriority.sysml model/README.md docs/PLAN.md docs/IMPLEMENTATION.md docs/verification/PHASE2-TODO.md
git commit -F - <<'EOF'
Shareable URLs: MI-UX-019 in the requirements and model; tick TODO item 3

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
EOF
```
