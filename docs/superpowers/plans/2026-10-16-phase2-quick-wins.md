# Phase 2 Quick Wins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the four "Worth doing now" Phase 2 items that need no owner decision: corpus rationale corrections, an E2E in-flight-replay assertion, a per-engine memory high-water figure in the release harness (`MI-PERF-006`), and a depth-aware coarse iteration budget for deep views.

**Architecture:** Items 1 and 2 are text and test-only changes. Item 3 adds a pure, unit-tested summarizing module (`tools/benchmark/harness/memory.ts`) plus a thin browser pass (`tools/benchmark/harness/passes/memory.ts`) wired into `run-release.ts`; every figure is labelled with exactly what it measures, and an engine with no honest measurement records "not measured". Item 4 adds a pure `coarseIterationBudget(maxIterations, spanY)` (log-linear ramp in magnification, capped by the profile's stable budget), a Node study script whose printed output decides the ramp constant, and a one-line change in `CpuRenderer.render`.

**Tech Stack:** TypeScript (strict), Vite 7-style SSR builds for Node tools, Vitest (unit), Playwright (e2e, Chromium and Firefox projects), Playwright CDP sessions (Chromium only), Prettier and ESLint via `npm run check`.

**Spec:** `docs/verification/PHASE2-TODO.md`, section "0. Worth doing now" (items: Corpus rationale corrections, E2E in-flight replay, Memory high-water, Deep-view first frame). Supporting records: `docs/verification/WORKSTREAM-H-SPIKE-2026-10-16.md` ("Side findings" 1) and `docs/verification/PHASE-2-CLOSEOUT.md` ("Deep-view first frame"). Read the relevant section before each task.

## Global Constraints

- `npm run check`, `npm run fixtures:kernel-golden -- --check` and `npx playwright test` pass at the end of every task.
- Commit trailer for implementers: `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`.
- No headed browser runs; `npm run evidence:smoke` (headless) is fine. Never pass `--release` to `tools/benchmark/run-release.ts`.
- Follow the conventions in the files you touch (Prettier formatting, ESLint `--max-warnings 0`, existing naming such as `subject_condition_expectation` unit-test names where the file uses them, `.ts` import extensions inside `tools/benchmark/harness/`, no parameter properties or enums in files that Node runs directly with type stripping).
- Frozen corpus: case ids and viewport parameters (`center`, `spanY`, `profile`, `designation`, `class`, `strata`) must not change. Only the `rationale` text may.
- Do not tick checkboxes in `docs/verification/PHASE2-TODO.md` and do not change the status wording in `docs/verification/REQUIREMENTS.md`; the owner closes those after a release session.
- Run `npx prettier --write <touched files>` before each commit; `format:check` is part of `npm run check`.

## Review Focus

Failure modes the spec implies but a straight reading would not test; each has a pinning test or step in the owning task.

1. **Corpus edit drifts a frozen field** (Task 1): a hand edit to `corpus.v1.json` that touches `center`, `spanY`, `strata` etc. silently invalidates all earlier evidence. Expected: a unit test pins every non-rationale field of both cases.
2. **Firefox reports a number it cannot honestly produce** (Tasks 3, 4): Firefox under Playwright has no CDP, no `performance.memory`, and `measureUserAgentSpecificMemory` is Chromium-only. Expected: "not measured" with a reason, never a proxy such as `0` or a Node-side RSS.
3. **Garbage memory readings** (Task 3): a CDP metric that is missing, `NaN`, or negative must not become the "high-water". Expected: such readings are dropped; with none left the figure is "not measured".
4. **`--resume` on an evidence file written before this change** (Task 4): `raw-observations.json` has no `memory` entry. Expected: it reloads as "not measured (not recorded in this evidence file)" rather than crashing.
5. **Coarse budget edge inputs** (Tasks 5, 7): `maxIterations` below 256 (unit tests use 32 and 16), a non-finite or zero `spanY`, and the Quick profile (stable budget 256). Expected: never above `maxIterations`, never below the old behaviour, Quick unchanged, shallow views exactly 256.
6. **The in-flight-replay race** (Task 2): the stable frame can win. Expected: bounded retries (5), and the test fails (not skips) if no `inflight-replay` frame is ever observed.

---

## File Structure

| File                                                         | Responsibility                                                           | Task |
| ------------------------------------------------------------ | ------------------------------------------------------------------------ | ---- |
| `tools/benchmark/corpus.v1.json`                             | Rationale text for two cases (text only)                                 | 1    |
| `docs/verification/PERFORMANCE-CORPUS.md`                    | Repeats the two wrong rationales in three places                         | 1    |
| `tests/unit/benchmark/corpus.test.ts`                        | Pin frozen fields, assert corrected rationale                            | 1    |
| `tests/e2e/explorer.spec.ts`                                 | In-flight replay assertion in the provenance test                        | 2    |
| `tools/benchmark/harness/memory.ts` (new)                    | Pure memory-figure types, summarizing, labels, table rows                | 3    |
| `tests/unit/benchmark/harness-memory.test.ts` (new)          | Unit tests for the above                                                 | 3    |
| `tools/benchmark/harness/passes/memory.ts` (new)             | Browser memory pass (CDP heap polling, isolated UA-memory snapshot)      | 4    |
| `tools/benchmark/harness/session.ts`                         | Extra cross-origin-isolated preview server (Chromium only)               | 4    |
| `tools/benchmark/run-release.ts`                             | Run the pass, write `memory` to environment/raw, summary section, resume | 4    |
| `evidence/phase-2/README.md`                                 | Document what is measured per engine                                     | 4    |
| `src/render/coarse-budget.ts` (new)                          | `coarseIterationBudget`, `COARSE_RAMP`                                   | 5, 7 |
| `tests/unit/render/coarse-budget.test.ts` (new)              | Unit tests                                                               | 5, 7 |
| `tools/benchmark/coarse-budget-study.ts` (new)               | Node study that decides the ramp constant                                | 6    |
| `docs/verification/COARSE-BUDGET-STUDY-2026-10-16.md` (new)  | Recorded study output and decision                                       | 6, 7 |
| `src/render/cpu-renderer.ts`                                 | Use the budget for the coarse pass                                       | 7    |
| `tests/unit/render/cpu-renderer-coarse-budget.test.ts` (new) | Renderer passes the depth-aware budget                                   | 7    |
| `docs/verification/PHASE-2-CLOSEOUT.md`                      | Note on the deep-view finding                                            | 7    |

---

### Task 1: Corpus rationale corrections

**Files:**

- Modify: `tools/benchmark/corpus.v1.json` (the `rationale` strings of `mi-fallback-weak-attraction`, near line 139, and `mi-scale-6mx-basilica-rim`, near line 169)
- Modify: `docs/verification/PERFORMANCE-CORPUS.md` (lines ~92-98, ~111-117, ~142, ~148)
- Test: `tests/unit/benchmark/corpus.test.ts`

**Interfaces:**

- Consumes: `validateCorpus` from `tools/benchmark/validate-corpus` (already imported in the test).
- Produces: nothing for later tasks.

Background (verified): no hash, manifest or checksum covers `corpus.v1.json`. `validate-corpus.ts` only checks that `rationale` is a non-empty string (line ~169). Evidence directories' `manifest.sha256` hash only their own files. So the JSON edit needs no manifest regeneration. `PERFORMANCE-CORPUS.md` says case ids, geometry, profile, designation and stratum tags are frozen; rationale text is not in that list. Leave `strata` untouched even though `period-5-8` on the weak-attraction case no longer matches its period 3 (changing a tag needs a new corpus version).

- [ ] **Step 1: Write the failing test**

Add this test inside the existing `describe('frozen benchmark corpus', ...)` in `tests/unit/benchmark/corpus.test.ts`, after the last `it`:

```ts
it('corpus_rationaleCorrections_keepFrozenViewParametersAndNameTheMeasuredPeriods', () => {
  const cases = (corpusJson as unknown as { cases: MutableCase[] }).cases;
  const byId = (id: string): MutableCase => {
    const found = cases.find((entry) => entry['id'] === id);
    if (found === undefined) throw new Error(`missing case ${id}`);
    return found;
  };
  const { rationale: weakRationale, ...weakFrozen } = byId('mi-fallback-weak-attraction');
  const { rationale: rimRationale, ...rimFrozen } = byId('mi-scale-6mx-basilica-rim');

  expect(weakFrozen).toEqual({
    id: 'mi-fallback-weak-attraction',
    class: 'Fallback',
    center: { re: '-0.1205', im: '0.8268' },
    spanY: '0.005',
    profile: 'Balanced',
    designation: 'release-gate',
    strata: ['weak-attraction', 'period-5-8', 'boundary'],
  });
  expect(rimFrozen).toEqual({
    id: 'mi-scale-6mx-basilica-rim',
    class: 'Scale',
    center: { re: '-1.25', im: '0' },
    spanY: '0.00000041666666666666667',
    profile: 'Balanced',
    designation: 'release-gate',
    strata: ['period-1-4', 'weak-attraction', 'boundary', 'high-unresolved'],
  });

  // WORKSTREAM-H-SPIKE-2026-10-16.md, side finding 1.
  expect(String(weakRationale)).toMatch(/period-3/);
  expect(String(weakRationale)).not.toMatch(/period-6|p6/);
  expect(String(rimRationale)).toMatch(/period-4/);
  expect(String(rimRationale)).not.toMatch(/near-parabolic exterior/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/benchmark/corpus.test.ts`
Expected: FAIL on the new test only (`expected ... to match /period-3/`); the other four tests pass.

- [ ] **Step 3: Correct the rationale text**

In `tools/benchmark/corpus.v1.json`, replace only the two `rationale` values (keep every other line byte-identical; keep the JSON one line per string as the file does):

`mi-fallback-weak-attraction`:

```json
      "rationale": "Interior of the Douady rabbit next to its 1/2 root: ~97% attracting period-3 with |lambda| between 0.848 and 0.902 and arg lambda near -pi (production classifier, 256x160 sample), plus a ~3% near-boundary unresolved band. At the centre (-0.1205, 0.8268) the classifier gives period 3, |lambda| = 0.876. Exercises weak but resolvable attraction and the cost of the unresolved fringe in the fallback path. Corrected 2026-10-16: an earlier description of this view as a higher-period satellite was wrong (WORKSTREAM-H-SPIKE-2026-10-16.md, side finding 1)."
```

`mi-scale-6mx-basilica-rim`:

```json
      "rationale": "The declared product zoom envelope: spanY is the decimal rounding of 1/2,400,000, i.e. exactly 6,000,000x against the 2.5 default span. Centered on the basilica disk's 1/2-parabolic point (-5/4, 0), an exact rational coordinate; the boundary is locally vertical there, splitting the shipping raster deterministically at Re c = -1.25 into ~50% analytic period-2 interior (right half) and ~50% interior of the period-4 bulb (left half, Re c < -1.25), where |lambda| lies between 1 - 5e-6 and 1 - 2e-8 so the Balanced budget leaves those pixels unresolved (at the 256x160 spike raster all 20,480 left-half pixels confirm as period 4 with a 5,000,000-iteration budget). Corrected 2026-10-16: the left half is interior, not exterior (WORKSTREAM-H-SPIKE-2026-10-16.md, side finding 1)."
```

- [ ] **Step 4: Fix the repeated rationale in `docs/verification/PERFORMANCE-CORPUS.md`**

Use Edit with these exact replacements.

(a) Replace the whole bullet that begins `- \`mi-fallback-weak-attraction\` — the period-6 satellite capping the Douady`and ends`attraction near |λ| ≈ 0.81 in this region.` with:

```
- `mi-fallback-weak-attraction` — the interior of the Douady rabbit next to its
  1/2 root. ~97% of sampled pixels are attracting period-3 with |λ| between
  0.848 and 0.902 (arg λ ≈ −π); at the centre (−0.1205, 0.8268) the classifier
  gives period 3, |λ| = 0.876. A thin near-boundary band stays unresolved. The
  coordinates were located by scanning with the checked-in classifier. This
  entry originally described the view as a period-6 satellite with |λ| up to
  ~0.81; the H spike showed that was wrong
  ([side finding 1](WORKSTREAM-H-SPIKE-2026-10-16.md#side-findings)). The
  `period-5-8` stratum tag is kept because tags are frozen.
```

(b) In the `mi-scale-6mx-basilica-rim` bullet, replace the final sentence `the shipping raster splits deterministically into ~50% analytic period-2 interior and ~50% near-parabolic exterior that exhausts the budget.` with:

```
the shipping raster splits deterministically at Re c = −1.25 into ~50%
  analytic period-2 interior (right half) and ~50% interior of the period-4
  bulb (left half) with |λ| between 1 − 5e-6 and 1 − 2e-8, which the Balanced
  budget leaves unresolved
  ([side finding 1](WORKSTREAM-H-SPIKE-2026-10-16.md#side-findings)).
```

(c) In "Stratum evidence", replace `- \`mi-fallback-weak-attraction\`: 97% attracting p6 (|λ| up to 0.81), 3%\n unresolved.` with:

```
- `mi-fallback-weak-attraction`: 97% attracting p3 (|λ| 0.848–0.902), 3%
  unresolved.
```

(d) Replace `- \`mi-scale-6mx-basilica-rim\`: 50% unresolved, 50% analytic period-2.` with:

```
- `mi-scale-6mx-basilica-rim`: 50% analytic period-2, 50% period-4 interior
  that the production classifier leaves unresolved (|λ| within 5e-6 of 1).
```

Then run: `grep -n "period-6\|p6\|near-parabolic exterior" docs/verification/PERFORMANCE-CORPUS.md`
Expected: only the intentional "originally described ... period-6" mention in (a); nothing else. Do not edit `PHASE2-TODO.md`, `PHASE-2-CLOSEOUT.md` or the spike record (they describe the correction, not the error).

- [ ] **Step 5: Validate and run the checks**

Run: `npx prettier --write tools/benchmark/corpus.v1.json docs/verification/PERFORMANCE-CORPUS.md tests/unit/benchmark/corpus.test.ts && node tools/benchmark/validate-corpus-cli.mjs && npx vitest run tests/unit/benchmark/corpus.test.ts`
Expected: validator prints no diagnostics (exit 0); 5 tests pass.

Run: `git diff --stat tools/benchmark/corpus.v1.json` and confirm exactly 2 changed lines (`2 insertions(+), 2 deletions(-)`).

Run: `npm run check && npm run fixtures:kernel-golden -- --check && npx playwright test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add tools/benchmark/corpus.v1.json docs/verification/PERFORMANCE-CORPUS.md tests/unit/benchmark/corpus.test.ts
git commit -m "Correct two corpus rationales (weak-attraction is p3; basilica-rim left half is p4 interior)" -m "Text only; frozen view parameters pinned by a new unit test." -m "Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"
```

---

### Task 2: E2E in-flight replay assertion

**Files:**

- Modify: `tests/e2e/explorer.spec.ts` (test `render traces carry delivery provenance and two-event cancellation timing`, starts ~line 534)
- Reference only: `tools/benchmark/harness/passes/interactions.ts` (`runReplay`, `checkFrame`)

**Interfaces:**

- Consumes: existing helpers in the spec file: `renderTraces(page)`, `TraceView` (has `computeId`, `outcome`, `frames[].stage/source/originComputeId/workerWallMs/colorizeMs`).
- Produces: nothing.

How the benchmark provokes it (`runReplay`): press a zoom key to start a request, wait until the app's `data-render-stage` reaches `coarse`, then change the "Interior view" select. The new request is answered by replaying the retained coarse frame (`source: 'inflight-replay'`, `originComputeId` = the active computation, no compute fields), then the same computation delivers the stable frame as `computed` under the rebound request, whose `computeId` equals that `originComputeId`. The stable frame can win the race, so the benchmark records a "raced" outcome; the e2e test mirrors the cancel loop: bounded retries, fail if never observed.

- [ ] **Step 1: Write the test addition**

In the provenance test, after the line `await expectRecolorOf(page, computedTrace?.computeId);` and before the closing `});` of the test, add:

```ts
// In-flight replay: change the interior view while a coarse frame is the
// active computation. The worker replays the retained coarse frame and the
// same computation delivers the stable frame. The stable frame can win the
// race, so retry (bounded) until a trace opens with an inflight-replay
// frame; failing to observe one is a failure. Each attempt picks a view
// that differs from the previous one (the test is on 'multiplier' here).
const replayViews = ['period', 'stability'];
let replayTrace: TraceView | undefined;
for (let attempt = 0; attempt < 5 && replayTrace === undefined; attempt += 1) {
  await canvas.press(attempt % 2 === 0 ? '+' : '-');
  await expect(explorer).toHaveAttribute('data-render-stage', 'coarse', { timeout: 10_000 });
  await page.getByLabel('Interior view').selectOption(replayViews[attempt % 2] ?? 'period');
  await expect(explorer).toHaveAttribute('data-render-stage', 'stable', { timeout: 10_000 });
  replayTrace = (await renderTraces(page)).find(
    (trace) => trace.frames[0]?.source === 'inflight-replay',
  );
}
expect(replayTrace).toBeDefined();
const [replayFrame, replayStableFrame] = replayTrace?.frames ?? [];
expect(replayTrace?.outcome).toBe('completed');
expect(replayFrame?.stage).toBe('coarse');
expect(replayFrame?.originComputeId).toBeGreaterThan(0);
expect(replayFrame?.originComputeId).toBe(replayTrace?.computeId);
expect(replayFrame?.workerWallMs).toBeUndefined();
expect(replayFrame?.colorizeMs).toBeGreaterThanOrEqual(0);
expect(replayStableFrame?.stage).toBe('stable');
expect(replayStableFrame?.source).toBe('computed');
expect(replayStableFrame?.originComputeId).toBeUndefined();
expect(replayStableFrame?.workerWallMs).toBeGreaterThan(0);
```

- [ ] **Step 2: Run the test in both engines**

Run: `npx playwright test tests/e2e/explorer.spec.ts -g "render traces carry delivery provenance" --repeat-each=5`
Expected: PASS for all runs in the `chromium` and `firefox` projects (10 passes). The behaviour already exists in the app, so this test is expected to pass on first run; the guard against a vacuous test is Step 3.

- [ ] **Step 3: Prove the assertion can fail**

Temporarily change `'inflight-replay'` in the `find` to `'inflight-replayX'`, run `npx playwright test tests/e2e/explorer.spec.ts -g "render traces carry delivery provenance" --project=chromium`, and confirm it FAILS at `expect(replayTrace).toBeDefined()`. Revert the temporary change (`git diff` must show only the added block).

- [ ] **Step 4: Full checks**

Run: `npm run check && npm run fixtures:kernel-golden -- --check && npx playwright test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/explorer.spec.ts
git commit -m "E2E: assert an inflight-replay frame names the active computation" -m "Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Memory figures, pure module with unit tests

**Files:**

- Create: `tools/benchmark/harness/memory.ts`
- Test: `tests/unit/benchmark/harness-memory.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces (Task 4 imports these exact names):
  - `type MemoryEngine = 'chromium' | 'firefox'`
  - `interface MemoryReading { readonly caseId: string; readonly bytes: number }`
  - `type MemoryFigure = { readonly status: 'measured'; readonly label: string; readonly highWaterBytes: number; readonly atCaseId: string; readonly samples: number } | { readonly status: 'not measured'; readonly reason: string }`
  - `interface EngineMemory { readonly jsHeap: MemoryFigure; readonly retained: MemoryFigure }`
  - `const JS_HEAP_LABEL: string`, `const RETAINED_LABEL: string`
  - `summarizeReadings(label: string, readings: readonly MemoryReading[], emptyReason: string): MemoryFigure`
  - `notMeasured(reason: string): MemoryFigure`
  - `unsupportedEngineMemory(engine: MemoryEngine): EngineMemory` (Firefox: both figures "not measured")
  - `notRecordedMemory(): EngineMemory`
  - `formatMiB(bytes: number): string`
  - `memoryRows(memory: EngineMemory): string[][]` (rows for the summary table)
  - `MEMORY_TABLE_HEADERS: readonly string[]`

What each engine honestly offers (researched; document in the module header and Task 4's README text):

- **Chromium**, CDP `Performance.getMetrics` `JSHeapUsedSize`: the main-thread V8 JS heap. It excludes worker heaps and ArrayBuffer backing stores (where the semantic frames live). Sampled by polling, so the true peak between polls is not observed: a lower bound. Labelled `jsHeap`.
- **Chromium**, `performance.measureUserAgentSpecificMemory()`: whole-agent-cluster estimate including same-origin workers and buffers, but it requires a cross-origin-isolated page (COOP/COEP), triggers a GC and is a snapshot, not a peak. Labelled `retained`; measured only in a separate pass on an isolated copy of the same build so the timing passes are not perturbed.
- **Firefox** (WebDriver BiDi via Playwright): no CDP, no `performance.memory`, no `measureUserAgentSpecificMemory`; `about:memory` is not reachable from the session. Both figures are "not measured". Node-side RSS of the browser process is a proxy for the whole browser (all tabs, GPU, content processes) and is deliberately not used.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/benchmark/harness-memory.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  JS_HEAP_LABEL,
  MEMORY_TABLE_HEADERS,
  RETAINED_LABEL,
  formatMiB,
  memoryRows,
  notMeasured,
  notRecordedMemory,
  summarizeReadings,
  unsupportedEngineMemory,
} from '../../../tools/benchmark/harness/memory.ts';

const MIB = 1024 * 1024;

describe('summarizeReadings', () => {
  it('takes the maximum reading, names its case and counts the samples', () => {
    const figure = summarizeReadings(
      JS_HEAP_LABEL,
      [
        { caseId: 'a', bytes: 10 * MIB },
        { caseId: 'b', bytes: 30 * MIB },
        { caseId: 'c', bytes: 20 * MIB },
      ],
      'none',
    );
    expect(figure).toEqual({
      status: 'measured',
      label: JS_HEAP_LABEL,
      highWaterBytes: 30 * MIB,
      atCaseId: 'b',
      samples: 3,
    });
  });

  it('drops missing, non-finite and negative readings instead of reporting them', () => {
    const figure = summarizeReadings(
      RETAINED_LABEL,
      [
        { caseId: 'nan', bytes: Number.NaN },
        { caseId: 'inf', bytes: Number.POSITIVE_INFINITY },
        { caseId: 'neg', bytes: -5 },
        { caseId: 'ok', bytes: 7 * MIB },
      ],
      'none',
    );
    expect(figure).toMatchObject({
      status: 'measured',
      highWaterBytes: 7 * MIB,
      atCaseId: 'ok',
      samples: 1,
    });
  });

  it('reports "not measured" with the supplied reason when no valid reading remains', () => {
    expect(summarizeReadings(JS_HEAP_LABEL, [], 'page not isolated')).toEqual({
      status: 'not measured',
      reason: 'page not isolated',
    });
    expect(
      summarizeReadings(JS_HEAP_LABEL, [{ caseId: 'x', bytes: Number.NaN }], 'no valid readings'),
    ).toEqual({ status: 'not measured', reason: 'no valid readings' });
  });

  it('keeps zero as a valid reading', () => {
    expect(summarizeReadings(JS_HEAP_LABEL, [{ caseId: 'z', bytes: 0 }], 'none')).toMatchObject({
      status: 'measured',
      highWaterBytes: 0,
    });
  });
});

describe('engine defaults', () => {
  it('records Firefox as not measured for both figures, with a reason and no number', () => {
    const memory = unsupportedEngineMemory('firefox');
    for (const figure of [memory.jsHeap, memory.retained]) {
      expect(figure.status).toBe('not measured');
      expect(JSON.stringify(figure)).not.toMatch(/highWaterBytes/);
      if (figure.status === 'not measured') expect(figure.reason).toMatch(/Firefox/);
    }
  });

  it('marks evidence written before the memory pass as not recorded', () => {
    const memory = notRecordedMemory();
    expect(memory.jsHeap).toEqual(notMeasured('not recorded in this evidence file'));
    expect(memory.retained).toEqual(notMeasured('not recorded in this evidence file'));
  });
});

describe('formatMiB and memoryRows', () => {
  it('formats bytes as MiB with one decimal', () => {
    expect(formatMiB(1.5 * MIB)).toBe('1.5 MiB');
    expect(formatMiB(0)).toBe('0.0 MiB');
  });

  it('renders measured and not-measured figures as table rows matching the headers', () => {
    const rows = memoryRows({
      jsHeap: summarizeReadings(JS_HEAP_LABEL, [{ caseId: 'hard', bytes: 12 * MIB }], 'none'),
      retained: notMeasured('Firefox exposes no memory API'),
    });
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row).toHaveLength(MEMORY_TABLE_HEADERS.length);
    expect(rows[0]).toEqual([
      'JS heap (main thread)',
      'measured',
      '12.0 MiB',
      'hard',
      '1',
      JS_HEAP_LABEL,
    ]);
    expect(rows[1]).toEqual([
      'Retained after stable (all workers)',
      'not measured',
      'n/a',
      'n/a',
      '0',
      'Firefox exposes no memory API',
    ]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/benchmark/harness-memory.test.ts`
Expected: FAIL (cannot resolve `harness/memory.ts`).

- [ ] **Step 3: Write the implementation**

Create `tools/benchmark/harness/memory.ts`:

```ts
/**
 * Memory high-water figures for the release harness (MI-PERF-006). Pure
 * summarizing and labelling; the browser pass that produces the readings is
 * passes/memory.ts.
 *
 * What each engine honestly exposes through Playwright:
 * - Chromium, CDP Performance.getMetrics JSHeapUsedSize: the main-thread V8
 *   JS heap only (no worker heaps, no ArrayBuffer backing stores, which is
 *   where the semantic frames live). Polled, so a lower bound on the peak.
 * - Chromium, performance.measureUserAgentSpecificMemory(): an estimate over
 *   the whole agent cluster (same-origin workers included). Needs a
 *   cross-origin-isolated page, forces a GC, and is a post-render snapshot,
 *   not a peak during computation.
 * - Firefox (WebDriver BiDi): no CDP, no performance.memory, no
 *   measureUserAgentSpecificMemory, and about:memory is unreachable. Nothing
 *   honest is available, so it is recorded as "not measured". Process RSS from
 *   outside the browser is a whole-browser proxy and is not used.
 */

export type MemoryEngine = 'chromium' | 'firefox';

export interface MemoryReading {
  readonly caseId: string;
  readonly bytes: number;
}

export type MemoryFigure =
  | {
      readonly status: 'measured';
      readonly label: string;
      readonly highWaterBytes: number;
      readonly atCaseId: string;
      readonly samples: number;
    }
  | { readonly status: 'not measured'; readonly reason: string };

export interface EngineMemory {
  readonly jsHeap: MemoryFigure;
  readonly retained: MemoryFigure;
}

export const JS_HEAP_LABEL =
  'Main-thread V8 JS heap used (CDP Performance.getMetrics JSHeapUsedSize), polled every 50 ms from navigation to the stable frame; excludes worker heaps and ArrayBuffer backing stores; a lower bound on the true peak';
export const RETAINED_LABEL =
  'performance.measureUserAgentSpecificMemory() total after the stable frame, in a cross-origin-isolated copy of the same build (includes same-origin workers and buffers); a post-render snapshot, not the peak during computation';

export const MEMORY_TABLE_HEADERS: readonly string[] = [
  'Figure',
  'Status',
  'High-water',
  'At case',
  'Samples',
  'Basis',
];

export const notMeasured = (reason: string): MemoryFigure => ({ status: 'not measured', reason });

/** The maximum valid reading; readings that are not finite non-negative numbers are dropped. */
export const summarizeReadings = (
  label: string,
  readings: readonly MemoryReading[],
  emptyReason: string,
): MemoryFigure => {
  const valid = readings.filter((reading) => Number.isFinite(reading.bytes) && reading.bytes >= 0);
  let best: MemoryReading | undefined;
  for (const reading of valid) {
    if (best === undefined || reading.bytes > best.bytes) best = reading;
  }
  if (best === undefined) return notMeasured(emptyReason);
  return {
    status: 'measured',
    label,
    highWaterBytes: best.bytes,
    atCaseId: best.caseId,
    samples: valid.length,
  };
};

/** An engine with no honest memory measurement under Playwright. */
export const unsupportedEngineMemory = (engine: MemoryEngine): EngineMemory => {
  const reason =
    engine === 'firefox'
      ? 'Firefox over WebDriver BiDi exposes no CDP, performance.memory or measureUserAgentSpecificMemory'
      : `${engine} memory measurement is unavailable`;
  return { jsHeap: notMeasured(reason), retained: notMeasured(reason) };
};

/** Evidence files written before the memory pass existed (--resume). */
export const notRecordedMemory = (): EngineMemory => ({
  jsHeap: notMeasured('not recorded in this evidence file'),
  retained: notMeasured('not recorded in this evidence file'),
});

export const formatMiB = (bytes: number): string => `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;

const rowOf = (name: string, figure: MemoryFigure): string[] =>
  figure.status === 'measured'
    ? [
        name,
        'measured',
        formatMiB(figure.highWaterBytes),
        figure.atCaseId,
        String(figure.samples),
        figure.label,
      ]
    : [name, 'not measured', 'n/a', 'n/a', '0', figure.reason];

export const memoryRows = (memory: EngineMemory): string[][] => [
  rowOf('JS heap (main thread)', memory.jsHeap),
  rowOf('Retained after stable (all workers)', memory.retained),
];
```

- [ ] **Step 4: Run to verify pass, then checks**

Run: `npx prettier --write tools/benchmark/harness/memory.ts tests/unit/benchmark/harness-memory.test.ts && npx vitest run tests/unit/benchmark/harness-memory.test.ts`
Expected: 8 tests pass.

Run: `npm run check && npm run fixtures:kernel-golden -- --check && npx playwright test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add tools/benchmark/harness/memory.ts tests/unit/benchmark/harness-memory.test.ts
git commit -m "Harness: memory figure summarizing and labels (MI-PERF-006), unit tested" -m "Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Memory pass wired into the release harness, with documentation

**Files:**

- Create: `tools/benchmark/harness/passes/memory.ts`
- Modify: `tools/benchmark/harness/session.ts` (add the isolated preview server)
- Modify: `tools/benchmark/run-release.ts` (header comment, `EngineRun`, `runEngine`, `finishedEngine`, `writeEngineEvidence`, `summarySections`, new `memorySection`)
- Modify: `evidence/phase-2/README.md` (new section)

**Interfaces:**

- Consumes (Task 3): `EngineMemory`, `MemoryEngine`, `MemoryReading`, `JS_HEAP_LABEL`, `RETAINED_LABEL`, `summarizeReadings`, `unsupportedEngineMemory`, `notRecordedMemory`, `memoryRows`, `MEMORY_TABLE_HEADERS`, `notMeasured`. From existing code: `waitForStage(page, 'stable', 0)` exported by `harness/passes/interactions.ts`; `urlFor`, `CorpusCase`, `ArmSpec` from `harness/passes/corpus.ts`; `Session` from `harness/session.ts`.
- Produces: `runMemoryPass(session: Session, engine: MemoryEngine, cases: readonly CorpusCase[]): Promise<EngineMemory>`; `Session.baseUrls['isolated']` (Chromium only); a `## <engine> — memory` section in `summary.md`; `memory` key in each engine's `environment.json` entry and `raw-observations.json` entry.

This task is browser plumbing, verified by typecheck, the headless smoke run and reading the output; the logic that can be unit tested is already covered in Task 3.

- [ ] **Step 1: Add the isolated preview server to `session.ts`**

In `startSession`, change the local `serve` helper to accept optional headers and serve a cross-origin-isolated copy of the current build for Chromium only. Replace the `serve` definition's `preview:` option and add the isolated server after the compare dists loop:

```ts
const serve = async (
  root: string,
  port: number,
  target?: CompareDist,
  headers?: Record<string, string>,
): Promise<string> => {
  // A compare dist is served from its own directory: without the explicit
  // outDir, preview would serve the parent config's `dist`, the current build.
  const server = await preview({
    root,
    configFile: path.join(root, 'vite.config.ts'),
    ...(target === undefined ? {} : { build: { outDir: target.dir } }),
    preview: { host: '127.0.0.1', port, strictPort: true, ...(headers ? { headers } : {}) },
  });
  servers.push(server);
  if (target !== undefined) assertServes(target.name, server.config, target.dir);
  return `http://127.0.0.1:${port}`;
};
```

and, after the `for (const [index, compare] ...)` loop:

```ts
// The memory pass needs a cross-origin-isolated page for
// performance.measureUserAgentSpecificMemory(). The headers are applied
// to a separate copy of the same build so the timing passes are never
// served isolated.
if (options.engine === 'chromium') {
  baseUrls['isolated'] = await serve(repoRoot, ISOLATED_PREVIEW_PORT, undefined, {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
  });
}
```

Add the constant next to `PREVIEW_PORT`: `const ISOLATED_PREVIEW_PORT = 4205;`. Update the `Session.baseUrls` doc comment: ``/** `current` is the build under test; each compare dist is keyed by its name; `isolated` (Chromium only) is the current build served cross-origin-isolated. */``.

- [ ] **Step 2: Write the browser pass**

Create `tools/benchmark/harness/passes/memory.ts`:

```ts
/// <reference lib="dom" />
/**
 * Memory pass (MI-PERF-006). One fresh page per corpus case and measurement:
 * - jsHeap (Chromium): poll CDP Performance.getMetrics JSHeapUsedSize every
 *   POLL_MS from navigation to the stable frame, keep the maximum.
 * - retained (Chromium): on a cross-origin-isolated copy of the build, call
 *   performance.measureUserAgentSpecificMemory() after the stable frame.
 * Firefox offers nothing honest and is recorded as "not measured" without
 * opening a page. See harness/memory.ts for the definitions.
 */
import type { CDPSession, Page } from '@playwright/test';
import {
  JS_HEAP_LABEL,
  RETAINED_LABEL,
  notMeasured,
  summarizeReadings,
  unsupportedEngineMemory,
  type EngineMemory,
  type MemoryEngine,
  type MemoryReading,
} from '../memory.ts';
import type { Session } from '../session.ts';
import { urlFor, type CorpusCase } from './corpus.ts';
import { waitForStage } from './interactions.ts';

const POLL_MS = 50;
const STEP_TIMEOUT_MS = 2 * 60_000;
const PLAIN_ARM = { name: 'plain', hook: false } as const;

const log = (message: string): void => {
  process.stderr.write(`[memory] ${message}\n`);
};

const heapUsedBytes = async (cdp: CDPSession): Promise<number | undefined> => {
  const { metrics } = await cdp.send('Performance.getMetrics');
  return metrics.find((metric) => metric.name === 'JSHeapUsedSize')?.value;
};

/** Peak polled JS heap from navigation to the stable frame; the plain arm, no hook. */
const measureJsHeap = async (session: Session, caseInfo: CorpusCase): Promise<MemoryReading> => {
  const baseUrl = session.baseUrls['current'];
  if (baseUrl === undefined) throw new Error('no current build served');
  const context = await session.browser.newContext({
    viewport: session.viewport,
    deviceScaleFactor: 1,
  });
  try {
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable');
    let peak = Number.NaN;
    let polling = true;
    const sample = async (): Promise<void> => {
      const value = await heapUsedBytes(cdp).catch(() => undefined);
      if (value !== undefined && !(value <= peak)) peak = value;
    };
    const poller = (async () => {
      while (polling) {
        await sample();
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      }
    })();
    try {
      await page.goto(urlFor(baseUrl, caseInfo, PLAIN_ARM), { timeout: STEP_TIMEOUT_MS });
      await waitForStage(page, 'stable', 0);
      await sample();
    } finally {
      polling = false;
      await poller;
    }
    return { caseId: caseInfo.id, bytes: peak };
  } finally {
    await context.close();
  }
};

type Retained = { readonly bytes: number } | { readonly error: string };

const readRetained = (page: Page): Promise<Retained> =>
  page.evaluate(async (): Promise<Retained> => {
    const scope = globalThis as typeof globalThis & {
      crossOriginIsolated?: boolean;
      performance: Performance & {
        measureUserAgentSpecificMemory?: () => Promise<{ bytes: number }>;
      };
    };
    if (scope.crossOriginIsolated !== true) return { error: 'page is not cross-origin isolated' };
    if (typeof scope.performance.measureUserAgentSpecificMemory !== 'function') {
      return { error: 'performance.measureUserAgentSpecificMemory is unavailable' };
    }
    try {
      return { bytes: (await scope.performance.measureUserAgentSpecificMemory()).bytes };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  });

/** Snapshot after the stable frame on the isolated build; an error string when unavailable. */
const measureRetained = async (
  session: Session,
  caseInfo: CorpusCase,
): Promise<MemoryReading | string> => {
  const baseUrl = session.baseUrls['isolated'];
  if (baseUrl === undefined) return 'no cross-origin-isolated build was served';
  const context = await session.browser.newContext({
    viewport: session.viewport,
    deviceScaleFactor: 1,
  });
  try {
    const page = await context.newPage();
    await page.goto(urlFor(baseUrl, caseInfo, PLAIN_ARM), { timeout: STEP_TIMEOUT_MS });
    await waitForStage(page, 'stable', 0);
    const result = await readRetained(page);
    return 'error' in result ? result.error : { caseId: caseInfo.id, bytes: result.bytes };
  } finally {
    await context.close();
  }
};

export const runMemoryPass = async (
  session: Session,
  engine: MemoryEngine,
  cases: readonly CorpusCase[],
): Promise<EngineMemory> => {
  if (engine !== 'chromium') return unsupportedEngineMemory(engine);
  const heapReadings: MemoryReading[] = [];
  const retainedReadings: MemoryReading[] = [];
  let retainedReason = 'no readings';
  for (const [index, caseInfo] of cases.entries()) {
    log(`${engine}: ${caseInfo.id} (${index + 1}/${cases.length})`);
    heapReadings.push(await measureJsHeap(session, caseInfo));
    const retained = await measureRetained(session, caseInfo);
    if (typeof retained === 'string') retainedReason = retained;
    else retainedReadings.push(retained);
  }
  return {
    jsHeap: summarizeReadings(JS_HEAP_LABEL, heapReadings, 'CDP returned no JSHeapUsedSize'),
    retained:
      retainedReadings.length === 0
        ? notMeasured(`measureUserAgentSpecificMemory: ${retainedReason}`)
        : summarizeReadings(RETAINED_LABEL, retainedReadings, retainedReason),
  };
};
```

- [ ] **Step 3: Wire it into `run-release.ts`**

1. Imports: add

```ts
import {
  MEMORY_TABLE_HEADERS,
  memoryRows,
  notRecordedMemory,
  type EngineMemory,
} from './harness/memory.ts';
import { runMemoryPass } from './harness/passes/memory.ts';
```

2. `EngineRun`: add `memory: EngineMemory;`.
3. `runEngine`: after `const ringBytes = await ringBytesAfterRecolors(...)` add `const memory = await runMemoryPass(session, engine, ctx.selected);` and include `memory,` in the returned object.
4. `finishedEngine`: add to the returned object `memory: (entry['memory'] as EngineMemory | undefined) ?? notRecordedMemory(),`.
5. `writeEngineEvidence`: add `memory: run.memory,` inside the `environment` object (next to `launchedBy`) and inside `raw` (next to `ringBytes`).
6. New section function placed after `interactionSection`:

```ts
const memorySection = (engine: Engine, run: EngineRun): string =>
  `## ${engine} — memory (MI-PERF-006)\n\n${table(MEMORY_TABLE_HEADERS, memoryRows(run.memory))}\n\nHonesty note: informational, not a gate. A figure is the maximum over one fresh page per case; "not measured" means the engine exposes no honest measurement, and no proxy is substituted. Definitions: evidence/phase-2/README.md, "Memory high-water".`;
```

7. In `writeEngineEvidence`'s `summarySections`, insert `memorySection(engine, run),` after `interactionSection(engine, run),`.
8. Header comment of the file: add one line `Also records a per-engine memory high-water figure (MI-PERF-006): harness/memory.ts.` to the description.

- [ ] **Step 4: Document in `evidence/phase-2/README.md`**

Add this section after the "Repository retention policy" section (before any later top-level section; keep Prettier happy with `npx prettier --write`):

```markdown
## Memory high-water (`MI-PERF-006`)

`tools/benchmark/run-release.ts` records one memory figure set per engine, in
`summary.md` (section `<engine> — memory (MI-PERF-006)`), in
`environment.json` and in `raw-observations.json` (key `memory`). The figures
are informational: they are not gates. Each is the maximum over one fresh page
per corpus case, and each carries the label of what it measures.

| Engine   | Figure     | What it is                                                                                                                                                                                                                                       |
| -------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Chromium | `jsHeap`   | Main-thread V8 JS heap used (CDP `Performance.getMetrics`, `JSHeapUsedSize`), polled every 50 ms from navigation to the stable frame. Excludes worker heaps and ArrayBuffer backing stores. A lower bound on the true peak.                      |
| Chromium | `retained` | `performance.measureUserAgentSpecificMemory()` after the stable frame, on a cross-origin-isolated copy of the same build served only for this pass (the timing passes are never isolated). Includes workers and buffers. A snapshot, not a peak. |
| Firefox  | both       | **Not measured.** Under Playwright (WebDriver BiDi) Firefox has no CDP, no `performance.memory` and no `measureUserAgentSpecificMemory`, and `about:memory` is unreachable. No proxy (such as process RSS) is substituted.                       |

When Chromium's `retained` figure is "not measured", the reason is recorded
(for example, the page was not cross-origin isolated). Evidence written before
this pass existed reloads under `--resume` as "not recorded in this evidence
file". A real peak across workers needs per-worker heap sampling or an
engine-level memory report; neither is available in both engines, so
`MI-PERF-006` remains partial until an owner-run release session records these
figures.
```

- [ ] **Step 5: Typecheck, then a headless smoke run**

Run: `npx prettier --write tools/benchmark/harness/passes/memory.ts tools/benchmark/harness/session.ts tools/benchmark/run-release.ts evidence/phase-2/README.md && npm run typecheck && npm run lint`
Expected: no errors.

Run: `npm run evidence:smoke`
Expected: exit 0, stderr shows `[memory] chromium: ...` and `[memory] firefox` is silent (no pages opened). Then:

Run: `grep -n "memory" -A8 test-results/evidence-smoke/summary.md | head -40` and `node -e "const r=require('./test-results/evidence-smoke/raw-observations.json');console.log(JSON.stringify(r.byEngine.chromium.memory,null,1),JSON.stringify(r.byEngine.firefox.memory,null,1))"`
Expected: Chromium `jsHeap` is `measured` with a positive byte count; Chromium `retained` is either `measured` or `not measured` with a concrete reason (both are acceptable outcomes; do not substitute a proxy if it is unavailable); Firefox has both figures `not measured` with no `highWaterBytes` field. Record the actual Chromium `retained` outcome in your report. The smoke output directory is under `test-results/` (untracked); do not commit it.

Also run `node tools/benchmark/manifest.mjs --check test-results/evidence-smoke`
Expected: passes (the manifest was emitted after the files were final).

- [ ] **Step 6: Full checks and commit**

Run: `npm run check && npm run fixtures:kernel-golden -- --check && npx playwright test`
Expected: all pass.

```bash
git add tools/benchmark/harness/passes/memory.ts tools/benchmark/harness/session.ts tools/benchmark/run-release.ts evidence/phase-2/README.md
git commit -m "Release harness: per-engine memory high-water figure (MI-PERF-006)" -m "Chromium: polled main-thread JS heap and an isolated measureUserAgentSpecificMemory snapshot. Firefox: not measured, with the reason recorded." -m "Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Pure coarse-budget function (no behaviour change yet)

**Files:**

- Create: `src/render/coarse-budget.ts`
- Test: `tests/unit/render/coarse-budget.test.ts`

**Interfaces:**

- Consumes: `DEFAULT_VIEWPORT`, `MAX_MAGNIFICATION` from `src/domain` (index exports both).
- Produces (Tasks 6 and 7 import these exact names):
  - `const COARSE_BASE_ITERATIONS = 256`
  - `interface CoarseRamp { readonly startMagnification: number; readonly deepIterations: number }`
  - `const COARSE_RAMP: CoarseRamp` (initially `{ startMagnification: 1000, deepIterations: 256 }`, which reproduces today's behaviour exactly; Task 7 raises `deepIterations`)
  - `coarseIterationBudget(maxIterations: number, spanY: number, ramp?: CoarseRamp): number`

Shape: below `startMagnification` the budget is the base 256; from there to `MAX_MAGNIFICATION` it rises log-linearly to `deepIterations`; the result is rounded to a multiple of 32 and capped by the profile's stable `maxIterations` (so `maxIterations` < 256 still yields `maxIterations`, as today's `Math.min(maxIterations, 256)` did).

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/render/coarse-budget.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { DEFAULT_VIEWPORT, MAX_MAGNIFICATION, MIN_VIEWPORT_SPAN_Y } from '../../../src/domain';
import {
  COARSE_BASE_ITERATIONS,
  COARSE_RAMP,
  coarseIterationBudget,
  type CoarseRamp,
} from '../../../src/render/coarse-budget';

const RAMP: CoarseRamp = { startMagnification: 1000, deepIterations: 512 };
const spanAt = (magnification: number): number => DEFAULT_VIEWPORT.spanY / magnification;

describe('coarseIterationBudget', () => {
  it('returns the base budget at and below the ramp start', () => {
    expect(coarseIterationBudget(1024, DEFAULT_VIEWPORT.spanY, RAMP)).toBe(COARSE_BASE_ITERATIONS);
    expect(coarseIterationBudget(1024, spanAt(126), RAMP)).toBe(COARSE_BASE_ITERATIONS);
    expect(coarseIterationBudget(1024, spanAt(1000), RAMP)).toBe(COARSE_BASE_ITERATIONS);
  });

  it('reaches the deep budget at the product ceiling', () => {
    expect(coarseIterationBudget(1024, MIN_VIEWPORT_SPAN_Y, RAMP)).toBe(512);
    expect(coarseIterationBudget(1024, spanAt(MAX_MAGNIFICATION), RAMP)).toBe(512);
  });

  it('never exceeds the profile stable budget, and never drops below it for tiny budgets', () => {
    expect(coarseIterationBudget(384, MIN_VIEWPORT_SPAN_Y, RAMP)).toBe(384);
    expect(coarseIterationBudget(256, MIN_VIEWPORT_SPAN_Y, RAMP)).toBe(256);
    expect(coarseIterationBudget(32, DEFAULT_VIEWPORT.spanY, RAMP)).toBe(32);
    expect(coarseIterationBudget(16, MIN_VIEWPORT_SPAN_Y, RAMP)).toBe(16);
  });

  it('is non-decreasing in magnification and a multiple of 32', () => {
    let previous = 0;
    for (let exponent = 0; exponent <= 6.8; exponent += 0.1) {
      const budget = coarseIterationBudget(1024, spanAt(10 ** exponent), RAMP);
      expect(budget).toBeGreaterThanOrEqual(previous);
      expect(budget % 32).toBe(0);
      previous = budget;
    }
  });

  it('treats a non-finite or non-positive span as shallow instead of throwing', () => {
    for (const spanY of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(coarseIterationBudget(1024, spanY, RAMP)).toBe(COARSE_BASE_ITERATIONS);
    }
  });

  it('keeps the default ramp within [base, stable budget] at every magnification', () => {
    for (const maxIterations of [256, 512, 1024]) {
      for (const magnification of [1, 126, 1000, 50_000, MAX_MAGNIFICATION]) {
        const budget = coarseIterationBudget(maxIterations, spanAt(magnification));
        expect(budget).toBeGreaterThanOrEqual(COARSE_BASE_ITERATIONS);
        expect(budget).toBeLessThanOrEqual(maxIterations);
      }
    }
    expect(COARSE_RAMP.deepIterations).toBeGreaterThanOrEqual(COARSE_BASE_ITERATIONS);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/render/coarse-budget.test.ts`
Expected: FAIL (cannot resolve `coarse-budget`).

- [ ] **Step 3: Implement**

Create `src/render/coarse-budget.ts`:

```ts
import { DEFAULT_VIEWPORT, MAX_MAGNIFICATION } from '../domain';

/** The coarse pass's budget at shallow zoom: the pre-ramp constant. */
export const COARSE_BASE_ITERATIONS = 256;

/**
 * The coarse budget rises log-linearly in magnification from the base at
 * `startMagnification` to `deepIterations` at MAX_MAGNIFICATION. The deep
 * value comes from tools/benchmark/coarse-budget-study.ts (see
 * docs/verification/COARSE-BUDGET-STUDY-2026-10-16.md).
 */
export interface CoarseRamp {
  readonly startMagnification: number;
  readonly deepIterations: number;
}

export const COARSE_RAMP: CoarseRamp = Object.freeze({
  startMagnification: 1000,
  deepIterations: 256,
});

const GRANULARITY = 32;

/**
 * Iteration budget of the coarse pass for a view: deeper views get more
 * iterations so near-parabolic interior resolves in the first frame, capped
 * by the profile's stable budget so the coarse pass never out-spends the
 * stable one. A non-finite or non-positive span counts as shallow.
 */
export const coarseIterationBudget = (
  maxIterations: number,
  spanY: number,
  ramp: CoarseRamp = COARSE_RAMP,
): number => {
  const magnification = DEFAULT_VIEWPORT.spanY / spanY;
  const ramped =
    Number.isFinite(magnification) && magnification > ramp.startMagnification
      ? Math.min(
          1,
          Math.log(magnification / ramp.startMagnification) /
            Math.log(MAX_MAGNIFICATION / ramp.startMagnification),
        )
      : 0;
  const raw = COARSE_BASE_ITERATIONS + ramped * (ramp.deepIterations - COARSE_BASE_ITERATIONS);
  const rounded = Math.max(COARSE_BASE_ITERATIONS, Math.round(raw / GRANULARITY) * GRANULARITY);
  return Math.min(maxIterations, rounded);
};
```

- [ ] **Step 4: Run to verify pass and the full checks**

Run: `npx prettier --write src/render/coarse-budget.ts tests/unit/render/coarse-budget.test.ts && npx vitest run tests/unit/render/coarse-budget.test.ts`
Expected: 6 tests pass.

Run: `npm run check && npm run fixtures:kernel-golden -- --check && npx playwright test`
Expected: all pass (nothing calls the function yet).

- [ ] **Step 5: Commit**

```bash
git add src/render/coarse-budget.ts tests/unit/render/coarse-budget.test.ts
git commit -m "Add coarseIterationBudget (depth-aware ramp; default ramp keeps today's 256)" -m "Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Coarse-budget study script and its recorded output

**Files:**

- Create: `tools/benchmark/coarse-budget-study.ts`
- Modify: `package.json` (one script)
- Create: `docs/verification/COARSE-BUDGET-STUDY-2026-10-16.md`

**Interfaces:**

- Consumes: `classifyRows` (`src/render/classify-rows`), `unpackStatus`/`unpackPeriod` (`src/render/packed-semantic`), `coarseIterationBudget`/`CoarseRamp` (Task 5), `loadCorpusCases`/`profileQuality`/`parseRaster` (`tools/benchmark/judge/corpus`).
- Produces: the recorded study document; its "Decision" line gives `deepIterations` for Task 7.

The coarse pass is the scalar `OrbitClassifier` at stride `max(2, coarseStride)` with `maxPeriod` capped at 16 (see `CpuRenderer.render`); the study reproduces exactly that call. The stable reference is the same sample positions classified at the profile's own stable `maxIterations`/`maxPeriod` (what the stable frame will show). "Resolvable" pixels are those the reference resolves; the left half of the 6,000,000x basilica-rim view is period-4 interior with |lambda| within 5e-6 of 1, which no reasonable coarse budget resolves (workstream H will), so it stays in the reference's unresolved set and does not count against the budget.

- [ ] **Step 1: Write the script**

Create `tools/benchmark/coarse-budget-study.ts`:

```ts
/**
 * Coarse-budget study (development aid; output recorded in
 * docs/verification/COARSE-BUDGET-STUDY-2026-10-16.md). Decides the deep end
 * of the depth-aware coarse iteration ramp (src/render/coarse-budget.ts).
 *
 * Part 1: for the 6,000,000x basilica-rim view and two shallow views, run the
 * production coarse pass (scalar classifier, stride max(2, coarseStride),
 * maxPeriod <= 16) at several iteration budgets. Report time and the share of
 * "resolvable" sample pixels (those the profile's stable budget resolves)
 * that the coarse pass still leaves unresolved, split into left and right
 * halves, plus "flips" (resolved at both budgets but with a different status
 * or period: must be 0).
 * Part 2 (when a candidate deep budget is given): coarse time for every
 * corpus view at 256 and at its ramped budget.
 *
 * Usage: npm run coarse-budget-study -- [raster WxH] [reps] [candidate deep budget]
 */
import { classifyRows } from '../../src/render/classify-rows';
import { unpackPeriod, unpackStatus } from '../../src/render/packed-semantic';
import { coarseIterationBudget, COARSE_RAMP } from '../../src/render/coarse-budget';
import { loadCorpusCases, parseRaster, profileQuality, type CorpusCase } from './judge/corpus';

const args = process.argv.slice(2);
const size = parseRaster(args[0] ?? '1024x640');
const reps = Number(args[1] ?? '5');
const candidateDeep = args[2] === undefined ? undefined : Number(args[2]);
const signal = new AbortController().signal;

const DEEP_ID = 'mi-scale-6mx-basilica-rim';
const SHALLOW_IDS = ['mi-hard-supplied-126x', 'mi-fallback-budget-exhaustion'];
const BUDGETS = [256, 320, 384, 448, 512, 768, 1024];
/** Node classify time per corpus view that leaves headroom under the 100 ms coarse budget in a browser. */
const NODE_COARSE_LIMIT_MS = 35;

interface Samples {
  readonly status: Uint8Array;
  readonly period: Uint32Array;
  readonly medianMs: number;
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN;
};

const coarseStrideOf = (c: CorpusCase): number =>
  Math.max(2, profileQuality(c.profile).coarseStride);

/** Classifies the stride grid with the given budget; returns per-sample status/period and median ms. */
const classifyGrid = async (
  c: CorpusCase,
  maxIterations: number,
  maxPeriod: number,
  timed: boolean,
): Promise<Samples> => {
  const stride = coarseStrideOf(c);
  const quality = { maxIterations, maxPeriod, coarseStride: stride };
  const request = { viewport: c.viewport, size, quality };
  const times: number[] = [];
  let last = await classifyRows(request, quality, stride, 0, size.height, signal);
  for (let rep = 0; timed && rep < reps; rep += 1) {
    const started = performance.now();
    last = await classifyRows(request, quality, stride, 0, size.height, signal);
    times.push(performance.now() - started);
  }
  const columns = Math.ceil(size.width / stride);
  const rows = Math.ceil(size.height / stride);
  const status = new Uint8Array(columns * rows);
  const period = new Uint32Array(columns * rows);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const word = last.packedStatusPeriod[row * stride * size.width + column * stride] ?? 0;
      status[row * columns + column] = unpackStatus(word);
      period[row * columns + column] = unpackPeriod(word);
    }
  }
  return { status, period, medianMs: timed ? median(times) : Number.NaN };
};

const pct = (n: number, d: number): string => (d === 0 ? 'n/a' : `${((100 * n) / d).toFixed(1)}%`);
const out = (line: string): void => {
  process.stdout.write(`${line}\n`);
};

const part1 = async (c: CorpusCase): Promise<void> => {
  const stable = profileQuality(c.profile);
  const stride = coarseStrideOf(c);
  const columns = Math.ceil(size.width / stride);
  const reference = await classifyGrid(c, stable.maxIterations, stable.maxPeriod, false);
  const total = reference.status.length;
  const resolvable = reference.status.reduce((sum, s) => sum + (s === 0 ? 0 : 1), 0);
  out(
    `\n### ${c.id} (${c.profile}, stable budget ${stable.maxIterations}, stride ${stride}, ` +
      `${(2.5 / c.viewport.spanY).toFixed(0)}x)\n`,
  );
  out(
    `Reference (stable budget) leaves ${pct(total - resolvable, total)} of samples unresolved; ` +
      `the remaining ${pct(resolvable, total)} are resolvable.\n`,
  );
  out('| coarse budget | median ms | unresolved of resolvable | left half | right half | flips |');
  out('| --- | --- | --- | --- | --- | --- |');
  for (const budget of BUDGETS) {
    if (budget > stable.maxIterations) continue;
    const coarse = await classifyGrid(c, budget, Math.min(stable.maxPeriod, 16), true);
    let missed = 0;
    let missedLeft = 0;
    let missedRight = 0;
    let resolvableLeft = 0;
    let resolvableRight = 0;
    let flips = 0;
    for (let i = 0; i < total; i += 1) {
      const left = i % columns < columns / 2;
      const refStatus = reference.status[i] ?? 0;
      const status = coarse.status[i] ?? 0;
      if (refStatus === 0) continue;
      if (left) resolvableLeft += 1;
      else resolvableRight += 1;
      if (status === 0) {
        missed += 1;
        if (left) missedLeft += 1;
        else missedRight += 1;
      } else if (status !== refStatus || coarse.period[i] !== reference.period[i]) {
        flips += 1;
      }
    }
    out(
      `| ${budget} | ${coarse.medianMs.toFixed(1)} | ${pct(missed, resolvable)} | ` +
        `${pct(missedLeft, resolvableLeft)} | ${pct(missedRight, resolvableRight)} | ${flips} |`,
    );
  }
};

const part2 = async (cases: readonly CorpusCase[], deep: number): Promise<void> => {
  const ramp = { ...COARSE_RAMP, deepIterations: deep };
  out(`\n## Part 2: every corpus view at its ramped budget (deepIterations ${deep})\n`);
  out(
    `| case | magnification | ramped budget | ms @256 | ms @ramped | <= ${NODE_COARSE_LIMIT_MS} ms |`,
  );
  out('| --- | --- | --- | --- | --- | --- |');
  for (const c of cases) {
    const stable = profileQuality(c.profile);
    const ramped = coarseIterationBudget(stable.maxIterations, c.viewport.spanY, ramp);
    const base = await classifyGrid(
      c,
      Math.min(256, stable.maxIterations),
      Math.min(stable.maxPeriod, 16),
      true,
    );
    const deepRun =
      ramped === Math.min(256, stable.maxIterations)
        ? base
        : await classifyGrid(c, ramped, Math.min(stable.maxPeriod, 16), true);
    out(
      `| ${c.id} | ${(2.5 / c.viewport.spanY).toFixed(0)}x | ${ramped} | ${base.medianMs.toFixed(1)} | ` +
        `${deepRun.medianMs.toFixed(1)} | ${deepRun.medianMs <= NODE_COARSE_LIMIT_MS ? 'yes' : 'NO'} |`,
    );
  }
};

const cases = loadCorpusCases();
out(`# Coarse-budget study, raster ${size.width}x${size.height}, ${reps} reps (median)\n`);
out('## Part 1: unresolved share of resolvable samples by coarse budget');
for (const id of [DEEP_ID, ...SHALLOW_IDS]) {
  const c = cases.find((entry) => entry.id === id);
  if (c === undefined) throw new Error(`corpus case ${id} missing`);
  await part1(c);
}
if (candidateDeep !== undefined) await part2(cases, candidateDeep);
process.exit(0);
```

- [ ] **Step 2: Add the npm script**

In `package.json` `scripts`, after `"kernel-bench": ...` add (comma after the previous entry):

```json
    "coarse-budget-study": "vite build --ssr tools/benchmark/coarse-budget-study.ts --outDir .evidence-build/coarse-budget-study --emptyOutDir --logLevel warn && node .evidence-build/coarse-budget-study/coarse-budget-study.js"
```

- [ ] **Step 3: Typecheck and run Part 1**

Run: `npx prettier --write tools/benchmark/coarse-budget-study.ts package.json && npm run typecheck && npm run lint`
Expected: no errors (fix any reported type/lint issue in the script).

Run: `npm run coarse-budget-study > .evidence-build/coarse-part1.md && cat .evidence-build/coarse-part1.md` (`.evidence-build/` is untracked build output). Expected: three tables, one per view; the basilica-rim table's `flips` column is 0 for every budget (if any flips is nonzero, STOP and report: a deeper coarse budget changed a resolved pixel).

- [ ] **Step 4: Decide the constant from the output**

Apply this rule to the basilica-rim table, using the "unresolved of resolvable" column (call the 256 row's value `U256`):

1. If `U256` < 2.0%, STOP: there is no first-frame problem to fix on resolvable pixels. Report to the controller; do not do Task 7.
2. Otherwise `deepIterations` = the smallest listed budget `B` with `B <= 512` (the Balanced stable budget; the table has no larger rows for it) such that the share at `B` is `<= 0.5 * U256`. If no budget up to 512 reaches that, `deepIterations` = the budget with the lowest share (that is 512) and say so explicitly in the Decision line: the ramp then reaches the stable budget at the ceiling.
3. Then run Part 2 with the candidate: `npm run coarse-budget-study -- 1024x640 5 <B>`. Every row must show `yes` in the last column. If the deep view (or any view) shows `NO`, take the next smaller listed budget and re-run; if `256` is the only budget that passes, STOP and report.

The shallow views' own Part 1 tables are the cost evidence: they show the time the coarse pass would take at each budget if a ramp ever reached them, and Part 2 shows they stay at 256 (the ramp starts at 1000x).

- [ ] **Step 5: Record the study**

Create `docs/verification/COARSE-BUDGET-STUDY-2026-10-16.md` with: a title; two or three sentences of method (copy the first paragraph of this task's Background and the script's header); the full Part 1 and Part 2 output pasted verbatim as Markdown; the machine and Node version (`node --version`, `uname -sr`); a "Decision" paragraph stating the chosen `deepIterations` and which rule branch applied; and a "Limits" list: Node, scalar classifier, one laptop, directional; browser coarse medians are checked separately in Task 7; the left-half period-4 interior of the basilica-rim view is excluded from the target because the reference stable budget does not resolve it. Run `npx prettier --write` on it.

- [ ] **Step 6: Full checks and commit**

Run: `npm run check && npm run fixtures:kernel-golden -- --check && npx playwright test`
Expected: all pass.

```bash
git add tools/benchmark/coarse-budget-study.ts package.json docs/verification/COARSE-BUDGET-STUDY-2026-10-16.md
git commit -m "Coarse-budget study: measure unresolved share by coarse iteration budget" -m "Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Apply the depth-aware coarse budget

**Files:**

- Modify: `src/render/coarse-budget.ts` (`COARSE_RAMP.deepIterations`)
- Modify: `src/render/cpu-renderer.ts:69-74`
- Modify: `tests/unit/render/coarse-budget.test.ts` (pin the chosen ramp)
- Create: `tests/unit/render/cpu-renderer-coarse-budget.test.ts`
- Modify: `docs/verification/PHASE-2-CLOSEOUT.md` ("Deep-view first frame" paragraph, ~line 230)

**Interfaces:**

- Consumes: `coarseIterationBudget`, `COARSE_RAMP` (Task 5); `deepIterations` from the "Decision" in `docs/verification/COARSE-BUDGET-STUDY-2026-10-16.md` (Task 6). Call that value `D` below.
- Produces: the shipped behaviour. The stable pass, the tile pool, `viewKeyHash` and `semanticRequestKey` are untouched (they key on the profile quality, not the derived coarse budget).

- [ ] **Step 1: Write the failing tests**

(a) Create `tests/unit/render/cpu-renderer-coarse-budget.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_VIEWPORT,
  MIN_VIEWPORT_SPAN_Y,
  type RenderQuality,
  type Viewport,
} from '../../../src/domain';
import { classifyRows } from '../../../src/render/classify-rows';
import { coarseIterationBudget } from '../../../src/render/coarse-budget';
import { CpuRenderer } from '../../../src/render';

vi.mock('../../../src/render/classify-rows', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../src/render/classify-rows')>();
  return { ...original, classifyRows: vi.fn(original.classifyRows) };
});

const BALANCED: RenderQuality = { maxIterations: 512, maxPeriod: 32, coarseStride: 8 };
const DEEP_VIEWPORT: Viewport = { center: { re: -1.25, im: 0 }, spanY: MIN_VIEWPORT_SPAN_Y };

/** maxIterations the coarse (first) classifyRows call received. */
const coarseBudgetFor = async (viewport: Viewport, quality: RenderQuality): Promise<number> => {
  vi.mocked(classifyRows).mockClear();
  await new CpuRenderer().render(
    { viewport, size: { width: 16, height: 10 }, quality },
    new AbortController().signal,
    () => undefined,
  );
  const first = vi.mocked(classifyRows).mock.calls[0];
  return first?.[1].maxIterations ?? Number.NaN;
};

describe('CpuRenderer coarse budget', () => {
  it('coarsePass_shallowView_keepsTheBaseBudget', async () => {
    expect(await coarseBudgetFor(DEFAULT_VIEWPORT, BALANCED)).toBe(256);
  });

  it('coarsePass_deepView_usesTheDepthAwareBudget', async () => {
    const budget = await coarseBudgetFor(DEEP_VIEWPORT, BALANCED);
    expect(budget).toBe(coarseIterationBudget(512, MIN_VIEWPORT_SPAN_Y));
    expect(budget).toBeGreaterThan(256);
    expect(budget).toBeLessThanOrEqual(512);
  });

  it('coarsePass_quickProfileAtTheCeiling_staysAtItsStableBudget', async () => {
    const quick: RenderQuality = { maxIterations: 256, maxPeriod: 16, coarseStride: 12 };
    expect(await coarseBudgetFor(DEEP_VIEWPORT, quick)).toBe(256);
  });

  it('coarsePass_tinyBudgets_areNotRaised', async () => {
    const tiny: RenderQuality = { maxIterations: 32, maxPeriod: 4, coarseStride: 4 };
    expect(await coarseBudgetFor(DEEP_VIEWPORT, tiny)).toBe(32);
  });
});
```

(b) In `tests/unit/render/coarse-budget.test.ts`, add inside the describe (replace `<D>` with the decided number, a literal):

```ts
  it('ships the study-decided ramp (COARSE-BUDGET-STUDY-2026-10-16.md)', () => {
    expect(COARSE_RAMP).toEqual({ startMagnification: 1000, deepIterations: <D> });
    expect(coarseIterationBudget(512, MIN_VIEWPORT_SPAN_Y)).toBe(Math.min(512, <D>));
    expect(coarseIterationBudget(512, DEFAULT_VIEWPORT.spanY)).toBe(256);
    expect(coarseIterationBudget(256, MIN_VIEWPORT_SPAN_Y)).toBe(256);
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/render/cpu-renderer-coarse-budget.test.ts tests/unit/render/coarse-budget.test.ts`
Expected: FAIL: `coarsePass_deepView_usesTheDepthAwareBudget` (`expected 256 to be greater than 256`) and the pinned-ramp test. The shallow, Quick and tiny-budget tests already pass.

- [ ] **Step 3: Implement**

In `src/render/coarse-budget.ts` set `deepIterations: <D>` in `COARSE_RAMP` and update its doc comment's last sentence to name the chosen value and the study.

In `src/render/cpu-renderer.ts` add the import `import { coarseIterationBudget } from './coarse-budget';` (next to the other local imports, alphabetical) and replace

```ts
      maxIterations: Math.min(quality.maxIterations, 256),
```

with

```ts
      maxIterations: coarseIterationBudget(quality.maxIterations, request.viewport.spanY),
```

Leave `maxPeriod: Math.min(quality.maxPeriod, 16)` unchanged.

- [ ] **Step 4: Run to verify pass**

Run: `npx prettier --write src/render/coarse-budget.ts src/render/cpu-renderer.ts tests/unit/render/coarse-budget.test.ts tests/unit/render/cpu-renderer-coarse-budget.test.ts && npx vitest run tests/unit/render`
Expected: all render unit tests pass, including the new ones.

- [ ] **Step 5: Check goldens and e2e expectations for coarse changes**

Run: `npm run fixtures:kernel-golden -- --check`
Expected: pass unchanged (the fixture covers the stable pass only).

Run: `grep -rn -i "coarse" tests/e2e tests/unit/worker src/ui/*.test.ts | grep -i "256\|iteration\|hash\|pixel"`
Expected: no hit asserts coarse pixel content or a 256 coarse budget (all current coarse assertions are about stage order, timing marks and provenance). If any does, update that expectation and say which in the commit message. Then run `npx playwright test` (Chromium and Firefox; expected all pass).

- [ ] **Step 6: Check the coarse budget in a browser (headless, directional)**

Run: `node tools/benchmark/run-release.ts --reps 3 --skip-interactions --out-dir test-results/coarse-check --cases mi-easy-default-full,mi-hard-supplied-126x,mi-scale-6mx-basilica-rim`
Expected: exit 0. Then `grep -n "mi-scale-6mx-basilica-rim\|mi-hard-supplied-126x\|mi-easy-default-full" test-results/coarse-check/summary.md | head` and confirm every `coarse median (ms)` is below the 100 ms coarse budget in both engines. (Directional only: headless, bundled engines.) If the deep view's coarse median is >= 100 ms in either engine, STOP and report the numbers; take the next smaller budget from the study only if the study's decision rule still permits it. Do not commit `test-results/`.

- [ ] **Step 7: Note the finding in the closeout**

In `docs/verification/PHASE-2-CLOSEOUT.md`, at the end of the "Deep-view first frame (product follow-up)" bullet, append one sentence: `Resolved for the resolvable pixels by a depth-aware coarse budget ([study](COARSE-BUDGET-STUDY-2026-10-16.md)): the coarse pass now rises from 256 to <D> iterations between 1,000× and 6,000,000×, capped by the profile's stable budget; the period-4 interior of the basilica rim stays unresolved until workstream H.` Do not edit the checkbox in `PHASE2-TODO.md`. Run `npx prettier --write docs/verification/PHASE-2-CLOSEOUT.md`.

- [ ] **Step 8: Full checks and commit**

Run: `npm run check && npm run fixtures:kernel-golden -- --check && npx playwright test`
Expected: all pass.

```bash
git add src/render/coarse-budget.ts src/render/cpu-renderer.ts tests/unit/render/coarse-budget.test.ts tests/unit/render/cpu-renderer-coarse-budget.test.ts docs/verification/PHASE-2-CLOSEOUT.md
git commit -m "Coarse pass: depth-aware iteration budget for deep views" -m "Ramps 256 to the study-chosen budget between 1,000x and 6,000,000x, capped by the profile's stable budget. Stable pass, kernel golden and cache keys unchanged." -m "Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"
```

---

## Self-Review

- **Spec coverage:** item 1 (rationale text, validator/hash check, doc grep) is Task 1, with the no-hash finding stated; item 2 is Task 2 (reuses `runReplay`'s approach, bounded retries, fails if unobserved); item 3 is Tasks 3-4 (per-engine research, labels in `summary.md`/`environment.json`/raw, README, "not measured" for Firefox, unit tests); item 4 is Tasks 5-7 (depth-aware budget, study script as its own task deciding the constant, resolvable-pixel target, golden/e2e check in Task 7 Step 5).
- **Placeholders:** the only literal to fill in is `<D>`, the study's output, by design; Task 6 Step 4 gives the exact rule and stop conditions.
- **Types:** `MemoryFigure`, `EngineMemory`, `MemoryReading`, `summarizeReadings`, `unsupportedEngineMemory`, `notRecordedMemory`, `memoryRows`, `MEMORY_TABLE_HEADERS` (Task 3) match their use in Task 4; `coarseIterationBudget`, `COARSE_RAMP`, `CoarseRamp`, `COARSE_BASE_ITERATIONS` (Task 5) match Tasks 6-7.
