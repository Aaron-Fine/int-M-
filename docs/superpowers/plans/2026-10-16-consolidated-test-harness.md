# Consolidated Test Harness and Production-Only Renderer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One ≤ 30-minute release evidence session replaces five browser runners, the e2e suite runs on the production bundle without slow or duplicate renders, the browser can run only the production renderer, and every npm dependency is current.

**Architecture:** A new `tools/benchmark/harness/` (TypeScript run directly by Node 24's type stripping) holds pure statistics, budgets, scheduling, and checkpoint modules plus browser session, capture, evidence, and two passes, driven by `tools/benchmark/run-release.ts`. The browser path gets its own production classifier (`ProductionOrbitClassifier`, `classifyProductionRows`) and renderer (`ProductionRenderer`) that never import the reference kernels; Node keeps `CpuRenderer` with every mode. A build check fails if the reference kernels reach a browser bundle.

**Tech Stack:** TypeScript 6/7, Vite 8, Vitest 5, Playwright 1.64, Node 24, branded Chrome (Flatpak) and Firefox on Fedora/KDE.

**Spec:** `docs/superpowers/specs/2026-10-16-consolidated-test-harness-design.md`

## Global Constraints

- Release protocol (plan §9) is unchanged: branded stable browsers, headed, ≥ 22 repetitions (rep 0 cold), 95% BCa paired intervals, 10,000 resamples, recorded seed.
- Regression flag: paired median difference > max(5% of baseline median, 20 ms) and BCa interval excluding zero.
- p95 is reported only with ≥ 40 observations (nearest rank).
- Frozen budgets (warm medians, both browsers): coarse ≤ 100 ms every case; stable ≤ 250 ms Easy, ≤ 600 ms Hard known, ≤ 1,500 ms Fallback and Scale.
- A full release session (both browsers) takes ≤ 30 minutes on the target laptop.
- The browser runs only the production renderer; `?perf=1&conjugateMirror=0` is the only remaining renderer toggle.
- `legacy-scan`, `checkpoint`, and `differential` stay available to Node code only.
- Headed runs refuse to start on a locked session (`loginctl show-session <id> -p LockedHint`); long runs are wrapped in `kde-inhibit --screenSaver --power` by the caller.
- Evidence directories follow `evidence/phase-2/README.md`: `environment.json`, raw observations, `summary.md`, `manifest.sha256` written last; Prettier-format the directory before emitting the manifest.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `npm run check` and `npx playwright test` pass at the end of every task.

## Review Focus

1. A headed browser that never presents a stable frame (locked or covered window, browser hiccup) must cost one retried sample, not the session — Task 3 capture test pins the retry.
2. A session interrupted mid-run (`Ctrl-C`, crash, lock) must resume without repeating completed cases or double-counting samples — Task 2 checkpoint tests pin merge and skip.
3. A stale `?classifierMode=legacy-scan` (or `bandOrder`, `yieldMechanism`, `frameOutput`, `perfCounters`) URL from an old bookmark or script must render the production default, not error — Task 8 test pins it.
4. A `--compare dist:<dir>` pointing at a build without `?view=` support must fail fast with a clear message rather than measure the wrong viewport — Task 4 test pins the viewport check failure.
5. A whole-build compare arm must alternate position with the other arms; a fixed order biases headed runs (the 2026-10-16 build-check defect) — Task 2 schedule test pins full rotation.

---

## File Structure

| Path                                                                 | Responsibility                                                     |
| -------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `tools/benchmark/harness/stats.ts`                                   | median, MAD, p95, paired BCa ratio, regression flag (pure)         |
| `tools/benchmark/harness/budgets.ts`, `budgets.v1.json`              | frozen budgets and per-case evaluation (pure)                      |
| `tools/benchmark/harness/schedule.ts`                                | arm order per repetition (pure)                                    |
| `tools/benchmark/harness/checkpoint.ts`                              | partial-sample file merge and resume selection (pure + fs)         |
| `tools/benchmark/harness/session.ts`                                 | build/serve, branded launch, calibration, lock check               |
| `tools/benchmark/harness/capture.ts`                                 | one in-page capture per render, stall retry                        |
| `tools/benchmark/harness/evidence.ts`                                | environment, raw, summary, manifest                                |
| `tools/benchmark/harness/passes/corpus.ts`, `passes/interactions.ts` | the two passes                                                     |
| `tools/benchmark/run-release.ts`                                     | CLI                                                                |
| `src/domain/orbit-production.ts`                                     | `ProductionOrbitClassifier`                                        |
| `src/render/row-common.ts`                                           | band-writing and coordinate helpers shared by both row classifiers |
| `src/render/production-rows.ts`                                      | `classifyProductionRows`                                           |
| `src/render/staged-renderer.ts`                                      | coarse→stable orchestration shared by both renderers               |
| `src/render/production-renderer.ts`                                  | `ProductionRenderer` (browser)                                     |
| `tools/check-bundle-modules.mjs`                                     | fails if reference kernels reach a browser bundle                  |

---

### Task 1: Update dependencies

**Files:**

- Modify: `package.json`, `package-lock.json`, any file Prettier reformats

**Interfaces:**

- Consumes: nothing
- Produces: current toolchain; later tasks assume Playwright 1.64 browsers are installed.

- [ ] **Step 1: Minor and patch updates**

```bash
npm install --save-dev @axe-core/playwright@latest @playwright/test@latest eslint@latest globals@latest prettier@latest typescript-eslint@latest vite@latest vitest@latest
npx playwright install chromium chromium-headless-shell firefox
```

- [ ] **Step 2: Fix the audit advisory**

Run: `npm audit fix && npm audit`
Expected: `found 0 vulnerabilities` (the `source-map-js` GHSA-68fv-2mgg-jv7q advisory resolved).

- [ ] **Step 3: `@types/node` on the runtime's major**

Run: `node --version` (expect v24.x), then `npm install --save-dev @types/node@^24`.

- [ ] **Step 4: Verify, reformat if Prettier changed output**

Run: `npm run format && npm run check && npx playwright test`
Expected: all pass (494-ish unit tests; 35 passed, 1 skipped browser tests).

- [ ] **Step 5: Commit**

```bash
git add -A package.json package-lock.json src tests tools docs
git commit -m "Update dev dependencies; fix source-map-js advisory"
```

- [ ] **Step 6: Try TypeScript 7**

Run: `npm install --save-dev typescript@^7 && npm run typecheck && npm run lint`
Expected PASS → `npm run check && npx playwright test`, commit "Adopt TypeScript 7".
If typecheck or lint fails because `typescript-eslint` does not support TS 7 (its peer range or a parser error): `npm install --save-dev typescript@^6`, verify `npm run check`, and add one line under "Dependency update" in the spec: "TypeScript 7 deferred: <exact error>". Commit "Stay on TypeScript 6: <reason>".

---

### Task 2: Harness pure modules (stats, budgets, schedule, checkpoint)

**Files:**

- Create: `tools/benchmark/harness/stats.ts`, `budgets.ts`, `budgets.v1.json`, `schedule.ts`, `checkpoint.ts`
- Modify: `tsconfig.node.json` (add `"allowImportingTsExtensions": true` to `compilerOptions`; add `"tools/benchmark/harness/**/*.ts"` and `"tools/benchmark/run-release.ts"` to `include`)
- Test: `tests/unit/benchmark/harness-stats.test.ts`, `harness-budgets.test.ts`, `harness-schedule.test.ts`, `harness-checkpoint.test.ts`

**Interfaces:**

- Consumes: `bcaInterval({ values, resamples, seed })` from `tools/benchmark/bca.ts` → `{ estimate: number; interval: readonly [number, number]; degenerate: boolean }`
- Produces:
  - `median(values: readonly number[]): number | undefined`
  - `mad(values: readonly number[]): number | undefined`
  - `p95(values: readonly number[]): number | undefined`
  - `pairedRatio(baseline: readonly number[], candidate: readonly number[], seed: number): { pairs: number; ratio: number; interval: readonly [number, number] } | undefined` (ratio = baseline/candidate, >1 means candidate faster)
  - `regression(baseline: readonly number[], candidate: readonly number[], seed: number): { deltaMs: number; interval: readonly [number, number]; flagged: boolean } | undefined`
  - `BUDGETS` and `evaluateBudget(caseClass: string, coarseMedianMs: number | undefined, stableMedianMs: number | undefined): { coarse: 'pass' | 'fail' | 'n/a'; stable: 'pass' | 'fail' | 'n/a'; stableBudgetMs: number }`
  - `armOrder(arms: readonly string[], repetition: number): string[]`
  - `mergeSamples<T extends { caseId: string; repetition: number; arm: string }>(existing: readonly T[], incoming: readonly T[]): T[]`, `completedCases(samples, caseIds, reps, arms): Set<string>`, `readPartial(path): unknown[]`, `appendPartial(path, samples)`

- [ ] **Step 1: Write the failing tests**

`tests/unit/benchmark/harness-stats.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  mad,
  median,
  p95,
  pairedRatio,
  regression,
} from '../../../tools/benchmark/harness/stats.ts';

describe('harness stats', () => {
  it('median and MAD of odd and even samples', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeUndefined();
    expect(mad([1, 2, 3, 4, 100])).toBe(1);
  });

  it('p95 needs at least 40 observations and uses the nearest rank', () => {
    expect(p95(Array.from({ length: 39 }, (_, i) => i))).toBeUndefined();
    expect(p95(Array.from({ length: 40 }, (_, i) => i + 1))).toBe(38);
  });

  it('paired ratio above 1 when the candidate is faster', () => {
    const baseline = Array.from({ length: 21 }, (_, i) => 200 + i);
    const candidate = baseline.map((value) => value / 2);
    const result = pairedRatio(baseline, candidate, 7);
    expect(result?.pairs).toBe(21);
    expect(result?.ratio).toBeCloseTo(2, 10);
  });

  it('regression flag needs max(5%, 20 ms) and an interval excluding zero', () => {
    const baseline = Array.from({ length: 21 }, (_, i) => 1000 + (i % 3));
    expect(
      regression(
        baseline,
        baseline.map((v) => v + 30),
        7,
      )?.flagged,
    ).toBe(false);
    expect(
      regression(
        baseline,
        baseline.map((v) => v + 60),
        7,
      )?.flagged,
    ).toBe(true);
    expect(regression([1], [2], 7)).toBeUndefined();
  });
});
```

`tests/unit/benchmark/harness-budgets.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { evaluateBudget } from '../../../tools/benchmark/harness/budgets.ts';

describe('frozen latency budgets', () => {
  it('passes at the threshold and fails just above it', () => {
    expect(evaluateBudget('Easy', 100, 250)).toEqual({
      coarse: 'pass',
      stable: 'pass',
      stableBudgetMs: 250,
    });
    expect(evaluateBudget('Easy', 100.1, 250.1)).toEqual({
      coarse: 'fail',
      stable: 'fail',
      stableBudgetMs: 250,
    });
  });

  it('uses the class budget', () => {
    expect(evaluateBudget('Hard known', 50, 600).stable).toBe('pass');
    expect(evaluateBudget('Fallback', 50, 1500).stable).toBe('pass');
    expect(evaluateBudget('Scale', 50, 1500.5).stable).toBe('fail');
  });

  it('reports n/a for missing medians and rejects unknown classes', () => {
    expect(evaluateBudget('Easy', undefined, undefined)).toEqual({
      coarse: 'n/a',
      stable: 'n/a',
      stableBudgetMs: 250,
    });
    expect(() => evaluateBudget('Catalog', 1, 1)).toThrow(/no stable budget/);
  });
});
```

`tests/unit/benchmark/harness-schedule.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { armOrder } from '../../../tools/benchmark/harness/schedule.ts';

describe('arm order', () => {
  it('rotates so every arm takes every position', () => {
    const arms = ['hook', 'plain', 'previous'];
    const positions = new Map(arms.map((arm) => [arm, new Set<number>()]));
    for (let rep = 0; rep < arms.length; rep += 1) {
      armOrder(arms, rep).forEach((arm, index) => positions.get(arm)?.add(index));
    }
    for (const seen of positions.values()) expect(seen.size).toBe(arms.length);
  });

  it('alternates two arms', () => {
    expect(armOrder(['hook', 'plain'], 0)).toEqual(['hook', 'plain']);
    expect(armOrder(['hook', 'plain'], 1)).toEqual(['plain', 'hook']);
  });
});
```

`tests/unit/benchmark/harness-checkpoint.test.ts`:

```ts
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  appendPartial,
  completedCases,
  mergeSamples,
  readPartial,
} from '../../../tools/benchmark/harness/checkpoint.ts';

const sample = (caseId: string, repetition: number, arm: string) => ({
  caseId,
  repetition,
  arm,
  wallMs: 1,
});

describe('checkpoint', () => {
  it('merges without duplicating a (case, rep, arm) cell', () => {
    const merged = mergeSamples(
      [sample('a', 0, 'hook')],
      [sample('a', 0, 'hook'), sample('a', 1, 'hook')],
    );
    expect(merged).toHaveLength(2);
  });

  it('a case is complete only when every rep × arm cell exists', () => {
    const samples = [sample('a', 0, 'hook'), sample('a', 0, 'plain'), sample('a', 1, 'hook')];
    expect(completedCases(samples, ['a'], 2, ['hook', 'plain']).has('a')).toBe(false);
    expect(
      completedCases([...samples, sample('a', 1, 'plain')], ['a'], 2, ['hook', 'plain']).has('a'),
    ).toBe(true);
  });

  it('round-trips appended samples through the partial file', () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'harness-')), '.partial-chromium.json');
    expect(readPartial(file)).toEqual([]);
    appendPartial(file, [sample('a', 0, 'hook')]);
    appendPartial(file, [sample('a', 0, 'hook'), sample('b', 0, 'hook')]);
    expect(readPartial(file)).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/benchmark/harness-`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

`tools/benchmark/harness/stats.ts`:

```ts
/** Derived statistics for evidence summaries (plan §9). Pure functions. */
import { bcaInterval } from '../bca.ts';

const RESAMPLES = 10_000;

const sorted = (values: readonly number[]): number[] => [...values].sort((a, b) => a - b);

export const median = (values: readonly number[]): number | undefined => {
  if (values.length === 0) return undefined;
  const s = sorted(values);
  const middle = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[middle] : ((s[middle - 1] ?? 0) + (s[middle] ?? 0)) / 2;
};

export const mad = (values: readonly number[]): number | undefined => {
  const center = median(values);
  return center === undefined ? undefined : median(values.map((value) => Math.abs(value - center)));
};

/** Nearest-rank p95, only with at least 40 observations. */
export const p95 = (values: readonly number[]): number | undefined =>
  values.length < 40 ? undefined : sorted(values)[Math.ceil(0.95 * values.length) - 1];

const pairs = (baseline: readonly number[], candidate: readonly number[]): [number, number][] =>
  baseline.flatMap((b, index) => {
    const c = candidate[index];
    return c === undefined || !(b > 0) || !(c > 0) ? [] : [[b, c] as [number, number]];
  });

export const pairedRatio = (
  baseline: readonly number[],
  candidate: readonly number[],
  seed: number,
): { pairs: number; ratio: number; interval: readonly [number, number] } | undefined => {
  const matched = pairs(baseline, candidate);
  if (matched.length < 2) return undefined;
  const result = bcaInterval({
    values: matched.map(([b, c]) => Math.log(b / c)),
    resamples: RESAMPLES,
    seed,
  });
  return {
    pairs: matched.length,
    ratio: Math.exp(result.estimate),
    interval: [Math.exp(result.interval[0]), Math.exp(result.interval[1])],
  };
};

/** Plan §9 cap: paired median difference > max(5%, 20 ms) and interval excluding zero. */
export const regression = (
  baseline: readonly number[],
  candidate: readonly number[],
  seed: number,
): { deltaMs: number; interval: readonly [number, number]; flagged: boolean } | undefined => {
  const matched = pairs(baseline, candidate);
  if (matched.length < 2) return undefined;
  const result = bcaInterval({
    values: matched.map(([b, c]) => c - b),
    resamples: RESAMPLES,
    seed,
  });
  const baselineMedian = median(matched.map(([b]) => b)) ?? 0;
  return {
    deltaMs: result.estimate,
    interval: result.interval,
    flagged: result.estimate > Math.max(0.05 * baselineMedian, 20) && result.interval[0] > 0,
  };
};
```

`tools/benchmark/harness/budgets.v1.json`:

```json
{
  "schemaVersion": 1,
  "revision": "budgets-1.0.0",
  "approved": "2026-10-16",
  "source": "docs/verification/PHASE-2-CLOSEOUT.md#latency-budgets-approved-2026-10-16",
  "coarseMedianMs": 100,
  "stableMedianMsByClass": { "Easy": 250, "Hard known": 600, "Fallback": 1500, "Scale": 1500 }
}
```

`tools/benchmark/harness/budgets.ts`:

```ts
/** Frozen latency budgets (warm medians, both browsers) and their evaluation. */
import { readFileSync } from 'node:fs';
import path from 'node:path';

interface BudgetFile {
  readonly revision: string;
  readonly coarseMedianMs: number;
  readonly stableMedianMsByClass: Readonly<Record<string, number>>;
}

export const BUDGETS: BudgetFile = JSON.parse(
  readFileSync(path.join(import.meta.dirname, 'budgets.v1.json'), 'utf8'),
) as BudgetFile;

type Verdict = 'pass' | 'fail' | 'n/a';
const verdict = (value: number | undefined, limit: number): Verdict =>
  value === undefined ? 'n/a' : value <= limit ? 'pass' : 'fail';

export const evaluateBudget = (
  caseClass: string,
  coarseMedianMs: number | undefined,
  stableMedianMs: number | undefined,
): { coarse: Verdict; stable: Verdict; stableBudgetMs: number } => {
  const stableBudgetMs = BUDGETS.stableMedianMsByClass[caseClass];
  if (stableBudgetMs === undefined) throw new RangeError(`no stable budget for class ${caseClass}`);
  return {
    coarse: verdict(coarseMedianMs, BUDGETS.coarseMedianMs),
    stable: verdict(stableMedianMs, stableBudgetMs),
    stableBudgetMs,
  };
};
```

`tools/benchmark/harness/schedule.ts`:

```ts
/**
 * Arm order for one repetition: a rotation, so over arms.length repetitions
 * every arm takes every position. Headed browsers pay window start-up on the
 * first navigation of a fresh context; a fixed order would bias the first arm.
 */
export const armOrder = (arms: readonly string[], repetition: number): string[] => {
  const shift = repetition % arms.length;
  return [...arms.slice(shift), ...arms.slice(0, shift)];
};
```

`tools/benchmark/harness/checkpoint.ts`:

```ts
/** Per-case checkpointing so an interrupted session resumes without repeats. */
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';

interface Cell {
  readonly caseId: string;
  readonly repetition: number;
  readonly arm: string;
}

const key = (cell: Cell): string => `${cell.caseId}\u001f${cell.repetition}\u001f${cell.arm}`;

export const mergeSamples = <T extends Cell>(
  existing: readonly T[],
  incoming: readonly T[],
): T[] => {
  const byKey = new Map(existing.map((sample) => [key(sample), sample]));
  for (const sample of incoming) byKey.set(key(sample), sample);
  return [...byKey.values()];
};

export const completedCases = (
  samples: readonly Cell[],
  caseIds: readonly string[],
  reps: number,
  arms: readonly string[],
): Set<string> => {
  const present = new Set(samples.map(key));
  return new Set(
    caseIds.filter((caseId) =>
      Array.from({ length: reps }, (_, repetition) => repetition).every((repetition) =>
        arms.every((arm) => present.has(key({ caseId, repetition, arm }))),
      ),
    ),
  );
};

export const readPartial = (file: string): unknown[] =>
  existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as unknown[]) : [];

/** Atomic append: write a temporary file, then rename over the partial. */
export const appendPartial = <T extends Cell>(file: string, samples: readonly T[]): void => {
  const merged = mergeSamples(readPartial(file) as T[], samples);
  writeFileSync(`${file}.tmp`, JSON.stringify(merged));
  renameSync(`${file}.tmp`, file);
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/benchmark/harness- && npm run typecheck && npx eslint tools/benchmark/harness tests/unit/benchmark --max-warnings 0`
Expected: PASS. If the p95 test disagrees, recompute: for 1..40, nearest rank `ceil(0.95·40) = 38` → value 38.

- [ ] **Step 5: Commit**

```bash
git add tools/benchmark/harness tests/unit/benchmark tsconfig.node.json
git commit -m "Harness: pure stats, budgets, arm schedule, and checkpoint modules"
```

---

### Task 3: Harness browser modules (session, capture, evidence)

**Files:**

- Create: `tools/benchmark/harness/session.ts`, `capture.ts`, `evidence.ts`
- Delete after porting: `tools/benchmark/release-browser.mjs` (its code moves into `session.ts`; update its importers in Task 5 when those runners retire — until then keep the file)
- Test: `tests/unit/benchmark/harness-capture.test.ts`

**Interfaces:**

- Consumes: Task 2 modules; `tools/benchmark/manifest.mjs` (CLI); `tools/benchmark/capture-environment.mjs` (CLI)
- Produces:
  - `startSession(options: { engine: 'chromium' | 'firefox'; release: boolean; compareDists: readonly { name: string; dir: string }[]; executablePath?: string }): Promise<Session>` where `Session = { browser; baseUrls: Record<string, string>; viewport: { width: number; height: number }; launchedBy: string | undefined; version: string; userAgent: string; close(): Promise<void> }` (`baseUrls.current` is the build under test; each compare dist is keyed by its name)
  - `sessionLocked(): boolean | null`, `readPowerMode(): string | null`
  - `measureRender(page: Page, url: string, hook: boolean): Promise<RenderCapture>` with `RenderCapture = { markWallMs: number; hash: string; width: number; height: number; viewport?: ViewportLike; trace?: unknown; retriedAfterStall: boolean }`
  - `withStallRetry<T>(attempt: (fresh: boolean) => Promise<T>, onStall: () => void): Promise<T>`
  - `writeEvidence(outDir: string, parts: { engine: string; environment: Record<string, unknown>; raw: unknown; summarySections: readonly string[] }): void`

- [ ] **Step 1: Write the failing test for the stall retry**

`tests/unit/benchmark/harness-capture.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { withStallRetry } from '../../../tools/benchmark/harness/capture.ts';

const timeout = (): Error => Object.assign(new Error('stalled'), { name: 'TimeoutError' });

describe('withStallRetry', () => {
  it('retries a timed-out attempt once with a fresh context and records it', async () => {
    const calls: boolean[] = [];
    let stalls = 0;
    const value = await withStallRetry(
      async (fresh) => {
        calls.push(fresh);
        if (!fresh) throw timeout();
        return 42;
      },
      () => {
        stalls += 1;
      },
    );
    expect(value).toBe(42);
    expect(calls).toEqual([false, true]);
    expect(stalls).toBe(1);
  });

  it('gives up after the second stall and rethrows other errors at once', async () => {
    await expect(
      withStallRetry(
        () => Promise.reject(timeout()),
        () => undefined,
      ),
    ).rejects.toThrow('stalled');
    let attempts = 0;
    await expect(
      withStallRetry(
        () => {
          attempts += 1;
          return Promise.reject(new Error('boom'));
        },
        () => undefined,
      ),
    ).rejects.toThrow('boom');
    expect(attempts).toBe(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/benchmark/harness-capture.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `capture.ts`**

```ts
/**
 * One in-page capture per render: the mark-based wall (both arms), an in-page
 * SHA-256 of the stable canvas (row-major RGBA from getImageData), the
 * achieved viewport and the stable computed trace (hook arm only).
 */
import type { Page } from '@playwright/test';

export const STABLE_TIMEOUT_MS = 3 * 60_000;

export interface ViewportLike {
  readonly center: { readonly re: number; readonly im: number };
  readonly spanY: number;
}

export interface RenderCapture {
  readonly markWallMs: number;
  readonly hash: string;
  readonly width: number;
  readonly height: number;
  readonly viewport?: ViewportLike;
  readonly trace?: unknown;
  retriedAfterStall: boolean;
}

export const withStallRetry = async <T>(
  attempt: (fresh: boolean) => Promise<T>,
  onStall: () => void,
): Promise<T> => {
  try {
    return await attempt(false);
  } catch (error) {
    if (!(error instanceof Error) || error.name !== 'TimeoutError') throw error;
    onStall();
    return attempt(true);
  }
};

/** Navigates and waits for the stable frame; reads every metric from that render. */
export const measureRender = async (
  page: Page,
  url: string,
  hook: boolean,
): Promise<RenderCapture> => {
  await page.goto(url, { timeout: STABLE_TIMEOUT_MS });
  await page.waitForFunction(
    () => performance.getEntriesByType('mark').some((mark) => mark.name === 'mi:stable-presented'),
    undefined,
    { timeout: STABLE_TIMEOUT_MS, polling: 50 },
  );
  return page.evaluate(async (withHook: boolean) => {
    const marks = performance.getEntriesByType('mark') as PerformanceMark[];
    const stable = marks.filter((mark) => mark.name === 'mi:stable-presented').at(-1);
    const requestId = (stable?.detail as { requestId?: number } | undefined)?.requestId;
    const request = marks.find(
      (mark) =>
        mark.name === 'mi:render-request' &&
        (mark.detail as { requestId?: number } | undefined)?.requestId === requestId,
    );
    const canvas = document.querySelector('canvas.explorer__canvas') as HTMLCanvasElement;
    const image = canvas
      .getContext('2d', { alpha: false })!
      .getImageData(0, 0, canvas.width, canvas.height);
    const digest = await crypto.subtle.digest('SHA-256', image.data);
    const hook = (
      globalThis as { __miRenderTrace?: { snapshot(): unknown[]; viewport(): unknown } }
    ).__miRenderTrace;
    return {
      markWallMs: (stable?.startTime ?? Number.NaN) - (request?.startTime ?? Number.NaN),
      hash: [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join(''),
      width: canvas.width,
      height: canvas.height,
      ...(withHook && hook ? { viewport: hook.viewport(), trace: hook.snapshot().at(-1) } : {}),
      retriedAfterStall: false,
    };
  }, hook) as Promise<RenderCapture>;
};
```

- [ ] **Step 4: Implement `session.ts`**

Port, verbatim in behavior, from existing code:

- `launchEvidenceBrowser`, `automationLabel`, `RELEASE_LABEL`, `DIRECTIONAL_LABEL`, `readPowerMode`, `sessionLocked` from `tools/benchmark/release-browser.mjs` (add parameter and return types; keep the Flatpak Chrome-over-CDP and Firefox-over-BiDi launch exactly).
- `calibrateViewport` from `tools/benchmark/run-operational.mjs` (`calibrateViewport`, lines starting `const calibrateViewport = async () =>`), parameterized by `browser` and `baseUrl`.
- The build/preview block from `run-operational.mjs` (`await build(...)`, `await preview(...)`), plus one extra `preview({ root: path.dirname(dir), configFile: path.join(path.dirname(dir), 'vite.config.ts'), preview: { host: '127.0.0.1', port, strictPort: true } })` per compare dist, ports 4186, 4187, …

Then export:

```ts
export const startSession = async (options: {
  engine: 'chromium' | 'firefox';
  release: boolean;
  compareDists: readonly { name: string; dir: string }[];
  executablePath?: string;
}): Promise<Session> => {
  if (options.release && sessionLocked() === true) {
    throw new Error(
      'the session is locked: headed release runs stall without frame callbacks; unlock it first',
    );
  }
  // build → preview current at 4185 → preview each compare dist → launch → calibrate → userAgent
  // return { browser, baseUrls, viewport, launchedBy, version: browser.version(), userAgent, close }
};
```

`close()` closes the browser (`launch.close()`) and every preview server.

- [ ] **Step 5: Implement `evidence.ts`**

```ts
/** Evidence directory writer (evidence/phase-2/README.md contract). */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '../../..');

export const writeEvidence = (
  outDir: string,
  parts: {
    engine: string;
    environment: Record<string, unknown>;
    raw: unknown;
    summarySections: readonly string[];
  },
): void => {
  mkdirSync(outDir, { recursive: true });
  const environmentPath = path.join(outDir, 'environment.json');
  const existing = existsSync(environmentPath)
    ? (JSON.parse(readFileSync(environmentPath, 'utf8')) as Record<string, unknown>)
    : undefined;
  spawnSync(
    'node',
    [
      path.join(repoRoot, 'tools/benchmark/capture-environment.mjs'),
      '--out',
      environmentPath,
      '--note',
      'Release session (tools/benchmark/run-release.ts).',
    ],
    { cwd: repoRoot, stdio: 'inherit' },
  );
  const captured = JSON.parse(readFileSync(environmentPath, 'utf8')) as Record<string, unknown>;
  const browsers = {
    ...((existing?.['browsers'] as object | undefined) ?? {}),
    [parts.engine]: parts.environment,
  };
  writeFileSync(environmentPath, `${JSON.stringify({ ...captured, browsers }, null, 2)}\n`);

  const rawPath = path.join(outDir, 'raw-observations.json');
  const rawExisting = existsSync(rawPath)
    ? (JSON.parse(readFileSync(rawPath, 'utf8')) as { byEngine?: Record<string, unknown> })
    : {};
  writeFileSync(
    rawPath,
    `${JSON.stringify({ schemaVersion: 1, byEngine: { ...(rawExisting.byEngine ?? {}), [parts.engine]: parts.raw } }, null, 2)}\n`,
  );

  const summaryPath = path.join(outDir, 'summary.md');
  const kept = existsSync(summaryPath)
    ? readFileSync(summaryPath, 'utf8')
        .split(/(?=^## )/m)
        .filter((section) => !section.startsWith(`## ${parts.engine}`))
    : ['# Release evidence session\n\n'];
  writeFileSync(summaryPath, `${[...kept, ...parts.summarySections].join('\n')}\n`);

  spawnSync('npx', ['prettier', '--write', outDir], { cwd: repoRoot, stdio: 'ignore' });
  const manifest = spawnSync(
    'node',
    [path.join(repoRoot, 'tools/benchmark/manifest.mjs'), outDir],
    { cwd: repoRoot, stdio: 'inherit' },
  );
  if (manifest.status !== 0) throw new Error('manifest emission failed');
};
```

Every engine section in `summarySections` must start with `## <engine>` so a second engine's run replaces only its own sections.

- [ ] **Step 6: Run tests, typecheck, lint**

Run: `npx vitest run tests/unit/benchmark && npm run typecheck && npx eslint tools/benchmark/harness --max-warnings 0`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add tools/benchmark/harness tests/unit/benchmark
git commit -m "Harness: browser session, single-render capture with stall retry, evidence writer"
```

---

### Task 4: Corpus and interaction passes, `run-release.ts`, smoke

**Files:**

- Create: `tools/benchmark/harness/passes/corpus.ts`, `tools/benchmark/harness/passes/interactions.ts`, `tools/benchmark/run-release.ts`
- Modify: `package.json` scripts: `"evidence:release": "node tools/benchmark/run-release.ts --release"`, `"evidence:smoke": "node tools/benchmark/run-release.ts --reps 2 --cases mi-easy-default-full,mi-hard-supplied-126x --compare mirrorOff=conjugateMirror=0"`; remove `"evidence:stage-a"`
- Test: `tests/unit/benchmark/harness-corpus.test.ts`

**Interfaces:**

- Consumes: Tasks 2–3 exports; `tools/benchmark/corpus.v1.json`
- Produces:
  - `urlFor(baseUrl: string, caseInfo: CorpusCase, arm: ArmSpec): string` with `ArmSpec = { name: string; hook: boolean; query?: string; dist?: string }`
  - `summarizeCase(caseInfo: CorpusCase, samples: readonly CorpusSample[], arms: readonly ArmSpec[], seed: number): CaseSummary`
  - `runCorpusPass(session: Session, cases: readonly CorpusCase[], arms: readonly ArmSpec[], reps: number, partialFile: string): Promise<CorpusSample[]>`
  - `runInteractionPass(session: Session, interactions: number): Promise<InteractionResults>`

- [ ] **Step 1: Write the failing tests**

`tests/unit/benchmark/harness-corpus.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { summarizeCase, urlFor } from '../../../tools/benchmark/harness/passes/corpus.ts';

const caseInfo = {
  id: 'mi-hard-supplied-126x',
  class: 'Hard known',
  center: { re: '-0.158902249', im: '-1.034028' },
  spanY: '0.019841269841269841269',
  profile: 'Detailed',
  designation: 'release-gate',
};

describe('corpus pass', () => {
  it('builds hook, plain, query, and dist arm URLs with exact decimal views', () => {
    const view = 'view=-0.158902249,-1.034028,0.019841269841269841269&quality=detailed';
    expect(urlFor('http://h', caseInfo, { name: 'hook', hook: true })).toBe(
      `http://h/?perf=1&${view}`,
    );
    expect(urlFor('http://h', caseInfo, { name: 'plain', hook: false })).toBe(`http://h/?${view}`);
    expect(
      urlFor('http://h', caseInfo, { name: 'mirrorOff', hook: true, query: 'conjugateMirror=0' }),
    ).toBe(`http://h/?perf=1&conjugateMirror=0&${view}`);
  });

  it('summarizes budgets, hook overhead, parity, and a compare arm from one sample set', () => {
    const samples = Array.from({ length: 22 }, (_, repetition) =>
      ['hook', 'plain', 'mirrorOff'].map((arm) => ({
        caseId: caseInfo.id,
        repetition,
        arm,
        climate: repetition === 0 ? 'cold' : 'warm',
        markWallMs: arm === 'mirrorOff' ? 500 : 400,
        stableMs: arm === 'plain' ? undefined : arm === 'mirrorOff' ? 480 : 380,
        coarseMs: arm === 'plain' ? undefined : 50,
        classifyMs: arm === 'plain' ? undefined : 300,
        hash: 'h',
        retriedAfterStall: false,
      })),
    ).flat();
    const arms = [
      { name: 'hook', hook: true },
      { name: 'plain', hook: false },
      { name: 'mirrorOff', hook: true, query: 'conjugateMirror=0' },
    ];
    const summary = summarizeCase(caseInfo, samples, arms, 11);
    expect(summary.budget).toEqual({ coarse: 'pass', stable: 'pass', stableBudgetMs: 600 });
    expect(summary.hookOverhead?.ratio).toBeCloseTo(1, 10);
    expect(summary.hashMismatches).toBe(0);
    expect(summary.compare['mirrorOff']?.wall?.ratio).toBeCloseTo(500 / 400, 10);
  });

  it('counts hash mismatches across arms and repetitions', () => {
    const samples = [0, 1].flatMap((repetition) =>
      ['hook', 'plain'].map((arm) => ({
        caseId: caseInfo.id,
        repetition,
        arm,
        climate: 'warm',
        markWallMs: 1,
        stableMs: 1,
        coarseMs: 1,
        classifyMs: 1,
        hash: arm === 'plain' && repetition === 1 ? 'x' : 'h',
        retriedAfterStall: false,
      })),
    );
    expect(
      summarizeCase(
        caseInfo,
        samples,
        [
          { name: 'hook', hook: true },
          { name: 'plain', hook: false },
        ],
        11,
      ).hashMismatches,
    ).toBe(1);
  });
});
```

Add to the same file the Review Focus 4 test (a compare dist that ignores `?view=` must fail fast):

```ts
import { assertViewport } from '../../../tools/benchmark/harness/passes/corpus.ts';

it('rejects a render whose achieved viewport is not the corpus view', () => {
  expect(() =>
    assertViewport(caseInfo, { center: { re: -0.75, im: 0 }, spanY: 2.5 }, 'previous'),
  ).toThrow(/previous.*did not apply \?view=/);
  expect(() =>
    assertViewport(
      caseInfo,
      { center: { re: -0.158902249, im: -1.034028 }, spanY: 0.019841269841269841269 },
      'hook',
    ),
  ).not.toThrow();
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/unit/benchmark/harness-corpus.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `passes/corpus.ts`**

Types and pure parts:

```ts
import { evaluateBudget } from '../budgets.ts';
import { armOrder } from '../schedule.ts';
import { median, pairedRatio, regression } from '../stats.ts';

export interface CorpusCase {
  readonly id: string;
  readonly class: string;
  readonly center: { readonly re: string; readonly im: string };
  readonly spanY: string;
  readonly profile: string;
  readonly designation: string;
}
export interface ArmSpec {
  readonly name: string;
  readonly hook: boolean;
  readonly query?: string;
  readonly dist?: string;
}
export interface CorpusSample {
  readonly caseId: string;
  readonly repetition: number;
  readonly arm: string;
  readonly climate: 'cold' | 'warm' | string;
  readonly markWallMs: number;
  readonly stableMs: number | undefined;
  readonly coarseMs: number | undefined;
  readonly classifyMs: number | undefined;
  readonly hash: string;
  readonly retriedAfterStall: boolean;
  readonly bandsElapsedMs?: readonly number[] | undefined;
}

export const urlFor = (baseUrl: string, caseInfo: CorpusCase, arm: ArmSpec): string => {
  const view = `view=${caseInfo.center.re},${caseInfo.center.im},${caseInfo.spanY}&quality=${caseInfo.profile.toLowerCase()}`;
  const parts = [
    ...(arm.hook ? ['perf=1'] : []),
    ...(arm.query === undefined ? [] : [arm.query]),
    view,
  ];
  return `${baseUrl}/?${parts.join('&')}`;
};

export const assertViewport = (
  caseInfo: CorpusCase,
  viewport: { center: { re: number; im: number }; spanY: number },
  arm: string,
): void => {
  if (
    viewport.center.re !== Number(caseInfo.center.re) ||
    viewport.center.im !== Number(caseInfo.center.im) ||
    viewport.spanY !== Number(caseInfo.spanY)
  ) {
    throw new Error(
      `${caseInfo.id}: arm ${arm} did not apply ?view= (got ${JSON.stringify(viewport)})`,
    );
  }
};

const warm = (samples: readonly CorpusSample[], arm: string) =>
  samples
    .filter((s) => s.arm === arm && s.climate === 'warm')
    .sort((a, b) => a.repetition - b.repetition);
const values = (samples: readonly CorpusSample[], pick: (s: CorpusSample) => number | undefined) =>
  samples.map(pick).filter((v): v is number => v !== undefined);

export const summarizeCase = (
  caseInfo: CorpusCase,
  samples: readonly CorpusSample[],
  arms: readonly ArmSpec[],
  seed: number,
) => {
  const own = samples.filter((s) => s.caseId === caseInfo.id);
  const hook = warm(own, 'hook');
  const plain = warm(own, 'plain');
  const stableMedian = median(values(hook, (s) => s.stableMs));
  const coarseMedian = median(values(hook, (s) => s.coarseMs));
  const reference = own.find((s) => s.arm === 'hook')?.hash;
  const compare: Record<
    string,
    {
      wall?: ReturnType<typeof pairedRatio>;
      classify?: ReturnType<typeof pairedRatio>;
      regression?: ReturnType<typeof regression>;
    }
  > = {};
  for (const arm of arms.filter((a) => a.name !== 'hook' && a.name !== 'plain')) {
    const other = warm(own, arm.name);
    compare[arm.name] = {
      wall: pairedRatio(
        values(other, (s) => s.stableMs),
        values(hook, (s) => s.stableMs),
        seed,
      ),
      classify: pairedRatio(
        values(other, (s) => s.classifyMs),
        values(hook, (s) => s.classifyMs),
        seed,
      ),
      regression: regression(
        values(other, (s) => s.stableMs),
        values(hook, (s) => s.stableMs),
        seed,
      ),
    };
  }
  return {
    caseId: caseInfo.id,
    caseClass: caseInfo.class,
    stableMedianMs: stableMedian,
    coarseMedianMs: coarseMedian,
    budget: evaluateBudget(caseInfo.class, coarseMedian, stableMedian),
    hookOverhead: pairedRatio(
      values(plain, (s) => s.markWallMs),
      values(hook, (s) => s.markWallMs),
      seed,
    ),
    hashMismatches: own.filter((s) => s.hash !== reference).length,
    stalls: own.filter((s) => s.retriedAfterStall).length,
    compare,
  };
};
export type CaseSummary = ReturnType<typeof summarizeCase>;
```

Note the ratio orientation: `pairedRatio(baseline, candidate)` returns baseline/candidate, so `hookOverhead` > 1 means the hook arm is faster than plain, and `compare[arm].wall` > 1 means the production hook arm is faster than the compare arm (500/400 in the test).

The browser part:

```ts
import type { Session } from '../session.ts';
import { measureRender, withStallRetry } from '../capture.ts';
import { appendPartial, completedCases, readPartial } from '../checkpoint.ts';
import { sessionLocked } from '../session.ts';

export const runCorpusPass = async (
  session: Session,
  cases: readonly CorpusCase[],
  arms: readonly ArmSpec[],
  reps: number,
  partialFile: string,
): Promise<CorpusSample[]> => {
  let samples = readPartial(partialFile) as CorpusSample[];
  const done = completedCases(
    samples,
    cases.map((c) => c.id),
    reps,
    arms.map((a) => a.name),
  );
  for (const caseInfo of cases) {
    if (done.has(caseInfo.id)) continue;
    if (sessionLocked() === true)
      throw new Error(`session locked before ${caseInfo.id}; resume with --resume`);
    const caseSamples: CorpusSample[] = [];
    for (let repetition = 0; repetition < reps; repetition += 1) {
      const order = armOrder(
        arms.map((a) => a.name),
        repetition,
      );
      let context = await session.browser.newContext({
        viewport: session.viewport,
        deviceScaleFactor: 1,
      });
      try {
        let page = await context.newPage();
        for (const name of order) {
          const arm = arms.find((a) => a.name === name)!;
          const baseUrl = session.baseUrls[arm.dist ?? 'current']!;
          let retried = false;
          const capture = await withStallRetry(
            async (fresh) => {
              if (fresh) {
                await context.close();
                context = await session.browser.newContext({
                  viewport: session.viewport,
                  deviceScaleFactor: 1,
                });
                page = await context.newPage();
              }
              return measureRender(page, urlFor(baseUrl, caseInfo, arm), arm.hook);
            },
            () => {
              retried = true;
            },
          );
          if (arm.hook) assertViewport(caseInfo, capture.viewport!, arm.name);
          const trace = capture.trace as
            | {
                frames?: {
                  stage: string;
                  source: string;
                  requestToPresentMs: number;
                  classifyMs?: number;
                  bandsElapsedMs?: number[];
                }[];
              }
            | undefined;
          const stable = trace?.frames?.find(
            (f) => f.stage === 'stable' && f.source === 'computed',
          );
          const coarse = trace?.frames?.find((f) => f.stage === 'coarse');
          caseSamples.push({
            caseId: caseInfo.id,
            repetition,
            arm: name,
            climate: repetition === 0 ? 'cold' : 'warm',
            markWallMs: capture.markWallMs,
            stableMs: stable?.requestToPresentMs,
            coarseMs: coarse?.requestToPresentMs,
            classifyMs: stable?.classifyMs,
            bandsElapsedMs: stable?.bandsElapsedMs,
            hash: capture.hash,
            retriedAfterStall: retried,
          });
        }
      } finally {
        await context.close();
      }
    }
    appendPartial(partialFile, caseSamples);
    samples = readPartial(partialFile) as CorpusSample[];
  }
  return samples;
};
```

- [ ] **Step 4: Implement `passes/interactions.ts`**

Port `runCancel`, `runReplay`, `runCached`, `checkFrame`, `waitForStage`, `waitForTrace`, `openPage`, and the invariant logic from `tools/benchmark/run-operational.mjs` unchanged in behavior, typed, taking `session` instead of module globals, and returning `{ cancel, 'inflight-replay', recolor, 'semantic-cache' }` with the same sample shapes. Export `runInteractionPass(session, interactions)` and `summarizeInteractions(results)` that produces the same table rows as `run-operational.mjs`'s summary (n, median (MAD), p95, min/max, violations, raced).

- [ ] **Step 5: Implement `run-release.ts`**

```ts
#!/usr/bin/env node
/**
 * Release evidence session (plan §9): one browser session per engine runs the
 * corpus pass (hook + plain arms on the production renderer, plus any
 * --compare arms) and the interaction pass, and writes one evidence directory.
 * Usage: node tools/benchmark/run-release.ts [--engines chromium,firefox] [--release]
 *   [--reps 22] [--cases id,…] [--compare name=<query>|name=dist:<dir>]… [--skip-interactions]
 *   [--resume] [--out-dir <dir>] [--interactions 50]
 * Wrap long headed runs: kde-inhibit --screenSaver --power node tools/benchmark/run-release.ts --release
 */
```

Behavior:

1. Parse options. `--release` requires `--reps >= 22` (default 22 with `--release`, 9 without) and `--interactions >= 50`.
2. Arms: `hook`, `plain`, then each `--compare name=value` → `{ name, hook: true, query: value }`, or `{ name, hook: true, dist: name }` when `value` starts with `dist:` (and add `{ name, dir }` to `compareDists`).
3. Out dir default: `evidence/phase-2/<YYYY-MM-DD>-<short HEAD>-release`. Without `--resume`, refuse to run if `<out-dir>/.partial-<engine>.json` exists (tell the user to pass `--resume` or delete it).
4. Per engine: `startSession` → `runCorpusPass` → (unless skipped) `runInteractionPass` → ring retention (`page.evaluate(() => new TextEncoder().encode(JSON.stringify(__miRenderTrace.snapshot())).length)` on a fresh hook page after 32 recolors, ≤ 65,536 bytes) → `session.close()` → `writeEvidence` with sections `## <engine> — budgets`, `## <engine> — hook overhead`, `## <engine> — parity and stalls`, `## <engine> — interactions`, `## <engine> — compare <name>` (one per compare arm), each a Markdown table built from `summarizeCase` / `summarizeInteractions` → delete the partial file.
5. Exit non-zero if any budget fails, any hash mismatches, any provenance violation, or the hook overhead pooled interval upper bound exceeds 1.05 in plain/hook terms; print which.

- [ ] **Step 6: Run unit tests and the smoke run**

Run: `npx vitest run tests/unit/benchmark && npm run typecheck && npx eslint tools/benchmark --max-warnings 0`
Expected: PASS.
Run: `npm run evidence:smoke -- --out-dir /tmp/release-smoke && cat /tmp/release-smoke/summary.md`
Expected: exit 0 (budget verdicts may be `n/a` only for missing arms), two engines' sections, compare `mirrorOff` section, interactions with 0 violations, `manifest.sha256` present (`node tools/benchmark/manifest.mjs --check /tmp/release-smoke` passes).

- [ ] **Step 7: Commit**

```bash
git add tools/benchmark package.json tests/unit/benchmark
git commit -m "Harness: corpus and interaction passes and the run-release session CLI"
```

---

### Task 5: Retire the old runners

**Files:**

- Delete: `tools/benchmark/run-stage-a.mjs`, `run-operational.mjs`, `run-overhead.mjs`, `run-renderer-path.mjs`, `run-b-gate.mjs`, `release-browser.mjs`; `view-chain.mjs`, `view-chain.d.mts`, `tests/unit/benchmark/view-chain.test.ts` (only the B gate used them)
- Modify: `evidence/phase-2/README.md` (replace the per-runner sections with one "Release sessions (`tools/benchmark/run-release.ts`)" section describing arms, passes, outputs, `--compare`, `--resume`, and the kde-inhibit wrapper; state that earlier run directories were produced by runners retired on 2026-10-16 and are reproducible from their recorded commits), `docs/IMPLEMENTATION.md` (evidence runners bullet → the release harness), `docs/PERFORMANCE-PLAN.md` (any `run-stage-a.mjs` usage line → `npm run evidence:release`), `eslint.config.mjs`/`tsconfig.*.json` entries that name deleted files

**Interfaces:**

- Consumes: Task 4 CLI
- Produces: no references to deleted files

- [ ] **Step 1: Delete and find references**

Run: `git rm tools/benchmark/run-stage-a.mjs tools/benchmark/run-operational.mjs tools/benchmark/run-overhead.mjs tools/benchmark/run-renderer-path.mjs tools/benchmark/run-b-gate.mjs tools/benchmark/release-browser.mjs tools/benchmark/view-chain.mjs tools/benchmark/view-chain.d.mts tests/unit/benchmark/view-chain.test.ts`
Run: `grep -rn "run-stage-a\|run-operational\|run-overhead\|run-renderer-path\|run-b-gate\|release-browser\|view-chain" --include=*.md --include=*.json --include=*.ts --include=*.mjs . | grep -v node_modules | grep -v "^./evidence/phase-2/20"`
Expected: only documentation hits to rewrite (historical evidence directories are left alone).

- [ ] **Step 2: Rewrite the listed docs** as described under Files.

- [ ] **Step 3: Verify**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A tools tests docs evidence/phase-2/README.md eslint.config.mjs tsconfig*.json package.json
git commit -m "Retire the five per-purpose browser runners in favor of run-release"
```

---

### Task 6: Production classifier and row path (domain + render)

**Files:**

- Create: `src/domain/orbit-production.ts`, `src/render/row-common.ts`, `src/render/production-rows.ts`
- Modify: `src/domain/index.ts` (export `ProductionOrbitClassifier`), `src/render/classify-rows.ts` (import moved helpers from `row-common.ts`)
- Test: `tests/unit/render/production-rows.test.ts`

**Interfaces:**

- Consumes: `classifyAnalyticInto`, `createOrbitSample`, `materializeOrbitResult`, `OrbitScratch`, `resolveOrbitOptions` from `src/domain/orbit.ts`; `classifyTriggeredOrbitInto` from `src/domain/orbit-triggered.ts`; `TriggeredRowKernel` from `src/render/triggered-rows.ts`
- Produces:
  - `class ProductionOrbitClassifier { constructor(options?: Partial<OrbitOptions>); classifyInto(cRe: number, cIm: number, out: OrbitSample): void; classify(c: Complex): OrbitResult }`
  - `row-common.ts`: `throwIfAborted`, `nowMs`, `BandOutputBuffers`, `writeSampleToBand`, `prepareRealColumns`, `preparedRowImaginary`, `assertMirrorStride`, `isMirroredRow` (moved verbatim from `classify-rows.ts`)
  - `classifyProductionRows(request: DynamicsRenderRequest, quality: RenderQuality, stride: number, y0: number, y1: number, signal: AbortSignal, output?: BandOutputBuffers, mirrorPlan?: ConjugateMirrorPlan): Promise<ProductionRowsResult>` where `ProductionRowsResult = SemanticBand & { timing: SemanticStageTiming }`

- [ ] **Step 1: Write the failing parity test**

`tests/unit/render/production-rows.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { classifyOrbit, planConjugateMirror } from '../../../src/domain';
import { ProductionOrbitClassifier } from '../../../src/domain/orbit-production';
import { classifyRows } from '../../../src/render/classify-rows';
import { classifyProductionRows } from '../../../src/render/production-rows';

const QUALITY = { maxIterations: 512, maxPeriod: 32, coarseStride: 8 };
const VIEWS = [
  { center: { re: -0.75, im: 0 }, spanY: 2.5 },
  { center: { re: -0.158902249, im: -1.034028 }, spanY: 0.019841269841269841269 },
  { center: { re: -0.1225611668766535, im: 0.7448617666197435 }, spanY: 0.3 },
];

describe('production row path', () => {
  for (const viewport of VIEWS) {
    for (const stride of [1, 8]) {
      it(`matches classifyRows' default bit for bit (${viewport.center.re}, stride ${stride})`, async () => {
        const request = { viewport, size: { width: 64, height: 40 }, quality: QUALITY };
        const signal = new AbortController().signal;
        const mirrorPlan = stride === 1 ? planConjugateMirror(viewport, request.size) : undefined;
        const reference = await classifyRows(
          request,
          QUALITY,
          stride,
          0,
          40,
          signal,
          undefined,
          undefined,
          undefined,
          { mirrorPlan },
        );
        const production = await classifyProductionRows(
          request,
          QUALITY,
          stride,
          0,
          40,
          signal,
          undefined,
          mirrorPlan,
        );
        expect([...production.packedStatusPeriod]).toEqual([...reference.packedStatusPeriod]);
        expect([...production.smoothIterationOrMultiplierMagnitude]).toEqual([
          ...reference.smoothIterationOrMultiplierMagnitude,
        ]);
        expect([...production.multiplierAngle]).toEqual([...reference.multiplierAngle]);
      });
    }
  }

  it('the production inspector matches classifyOrbit', () => {
    const classifier = new ProductionOrbitClassifier({ maxIterations: 512, maxPeriod: 32 });
    for (const point of [
      { re: -0.75, im: 0.1 },
      { re: 0.3, im: 0.5 },
      { re: -0.1225611668766535, im: 0.7448617666197435 },
    ]) {
      expect(classifier.classify(point)).toEqual(
        classifyOrbit(point, { maxIterations: 512, maxPeriod: 32 }),
      );
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/render/production-rows.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

`src/domain/orbit-production.ts`:

```ts
import {
  classifyAnalyticInto,
  createOrbitSample,
  materializeOrbitResult,
  OrbitScratch,
  resolveOrbitOptions,
  type OrbitSample,
} from './orbit';
import { classifyTriggeredOrbitInto } from './orbit-triggered';
import type { Complex, OrbitOptions, OrbitResult } from './types';

/**
 * The production classifier: the analytic fast paths, then the watched-lag
 * kernel (ADR 0006). Bit-identical to OrbitClassifier in its default mode,
 * without referencing the reference kernels, so browser bundles that use it
 * tree-shake legacy-scan, checkpoint, and the instrumented kernel away.
 */
export class ProductionOrbitClassifier {
  readonly #options: OrbitOptions;
  readonly #scratch: OrbitScratch;

  public constructor(options: Partial<OrbitOptions> = {}) {
    this.#options = resolveOrbitOptions({ ...options, classifierMode: 'triggered-scan' });
    this.#scratch = new OrbitScratch(this.#options.maxPeriod);
  }

  public classifyInto(cRe: number, cIm: number, out: OrbitSample): void {
    if (classifyAnalyticInto(cRe, cIm, out)) return;
    this.#scratch.ensureCapacity(this.#options.maxPeriod);
    classifyTriggeredOrbitInto(cRe, cIm, this.#options, this.#scratch, out);
  }

  public classify(c: Complex): OrbitResult {
    const sample = createOrbitSample();
    this.classifyInto(c.re, c.im, sample);
    return materializeOrbitResult(sample);
  }
}
```

`src/render/row-common.ts`: move (cut/paste, then `export`) `throwIfAborted`, `nowMs`, `BandOutputBuffers`, `writeSampleToBand`, `prepareRealColumns`, `preparedRowImaginary`, `assertMirrorStride`, `isMirroredRow` from `src/render/classify-rows.ts`; `classify-rows.ts` imports them back (and re-exports `BandOutputBuffers`, `prepareRealColumns`, `preparedRowImaginary` so existing importers keep working).

`src/render/production-rows.ts`: a copy of `classifyRows`'s body with only the production branches — `TriggeredRowKernel` (constructed with `{ maxIterations, maxPeriod }`) at stride 1, `ProductionOrbitClassifier` + `writeSampleToBand` row loop at stride > 1, `defaultRowYieldScheduler()` yields with `yieldMaskForQuality`, mirror-row skipping, and the same `timing` object. No `classifierMode`, `yieldMechanism`, counters, or differential parameters, and no import of `classify-rows.ts`, `OrbitClassifier`, `perf-counters.ts`, or `checkpoint`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/unit/render && npm run typecheck`
Expected: PASS (new parity tests and every existing render test).

- [ ] **Step 5: Commit**

```bash
git add src/domain src/render tests/unit/render
git commit -m "Production classifier and row path that never import the reference kernels"
```

---

### Task 7: Production renderer for the browser; build check

**Files:**

- Create: `src/render/staged-renderer.ts`, `src/render/production-renderer.ts`, `tools/check-bundle-modules.mjs`
- Modify: `src/render/cpu-renderer.ts` (becomes a thin `StagedRenderer` subclass), `src/render/index.ts` (export `ProductionRenderer`), `src/worker/runtime.ts` (default renderer `new ProductionRenderer()`), `src/worker/render.worker.ts` (`new ProductionRenderer(pool)`), `src/worker/tile-handler.ts` and `src/worker/tile-pool.ts` (call `classifyProductionRows`; drop `classifierMode`, `yieldMechanism`, `bandOrder: 'legacy'`, `frameOutput: 'legacy-merge'`, and differential aggregation), `src/worker/tile-protocol.ts` (drop `classifierMode`, `yieldMechanism`, `differential`, legacy-merge fields), `src/render/renderer.ts` (`TilePool.classifyStable(request, quality, signal)`; remove `BandOrder`/`FrameOutput` from `DynamicsRenderRequest`), `package.json` (`"check:bundle": "vite build --sourcemap --outDir .bundle-check --emptyOutDir --logLevel warn && node tools/check-bundle-modules.mjs .bundle-check"`, appended to `check`), `.gitignore` (`.bundle-check/`)
- Test: `tests/unit/render/production-renderer.test.ts`; update `tests/unit/worker/tile-pool.test.ts` (delete the legacy band-order and legacy-merge tests), `tests/unit/worker/runtime.test.ts` (fake pools: three-argument `classifyStable`)

**Interfaces:**

- Consumes: Task 6 exports
- Produces:
  - `type BandClassifier = (request: DynamicsRenderRequest, quality: RenderQuality, stride: number, y0: number, y1: number, signal: AbortSignal, mirrorPlan: ConjugateMirrorPlan | undefined) => Promise<SemanticBand & { timing: SemanticStageTiming; counters?: PerfCounters; differential?: DifferentialStats }>`
  - `class StagedRenderer implements Renderer { constructor(classifyBand: BandClassifier, inspectPoint: (point: Complex, quality: RenderQuality) => OrbitResult, tilePool?: TilePool, poolEligible?: (request: DynamicsRenderRequest) => boolean) }`
  - `class ProductionRenderer extends StagedRenderer { constructor(tilePool?: TilePool) }`
  - `class CpuRenderer extends StagedRenderer { constructor(tilePool?: TilePool) }` — Node reference renderer, all modes; uses the pool only for production-default requests

- [ ] **Step 1: Write the failing renderer parity test**

`tests/unit/render/production-renderer.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CpuRenderer, ProductionRenderer, type SemanticFrame } from '../../../src/render';

const render = async (
  renderer: CpuRenderer | ProductionRenderer,
  viewport: { center: { re: number; im: number }; spanY: number },
) => {
  const frames: SemanticFrame[] = [];
  await renderer.render(
    {
      viewport,
      size: { width: 48, height: 30 },
      quality: { maxIterations: 512, maxPeriod: 32, coarseStride: 8 },
    },
    new AbortController().signal,
    (frame) => {
      frames.push(frame);
    },
  );
  return frames;
};

describe('ProductionRenderer', () => {
  it('produces the same coarse and stable frames as CpuRenderer by default', async () => {
    for (const viewport of [
      { center: { re: -0.75, im: 0 }, spanY: 2.5 },
      { center: { re: -0.158902249, im: -1.034028 }, spanY: 0.019841269841269841269 },
    ]) {
      const [expected, actual] = await Promise.all([
        render(new CpuRenderer(), viewport),
        render(new ProductionRenderer(), viewport),
      ]);
      expect(actual.map((f) => f.stage)).toEqual(expected.map((f) => f.stage));
      actual.forEach((frame, index) => {
        const reference = expected[index]!;
        expect(frame.bands.map((b) => [...b.packedStatusPeriod])).toEqual(
          reference.bands.map((b) => [...b.packedStatusPeriod]),
        );
        expect(frame.bands.map((b) => [...b.multiplierAngle])).toEqual(
          reference.bands.map((b) => [...b.multiplierAngle]),
        );
      });
    }
  });

  it('inspects with the production kernel', () => {
    const point = { re: -0.75, im: 0.1 };
    expect(new ProductionRenderer().inspect(point)).toEqual(new CpuRenderer().inspect(point));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/render/production-renderer.test.ts`
Expected: FAIL (`ProductionRenderer` not exported).

- [ ] **Step 3: Implement `staged-renderer.ts`, `production-renderer.ts`, refactor `cpu-renderer.ts`**

Move the body of `CpuRenderer` (coarse quality derivation, `classifyFull`, pool dispatch, `inspect`, `colorize`, `quiesce`) into `StagedRenderer`, replacing the direct `classifyRows(...)` call in `classifyFull` with `this.classifyBand(request, quality, stride, 0, request.size.height, signal, mirrorPlan)` and the `classifyOrbit` call in `inspect` with `this.inspectPoint(point, resolveRenderQuality(quality))`. The stable pass uses the pool when `pool !== undefined && pool.size > 1 && poolEligible(request)`.

`production-renderer.ts`:

```ts
import { ProductionOrbitClassifier } from '../domain/orbit-production';
import { classifyProductionRows } from './production-rows';
import type { TilePool } from './renderer';
import { StagedRenderer } from './staged-renderer';

/** The browser renderer: the production path only (ADR 0006), always pool-eligible. */
export class ProductionRenderer extends StagedRenderer {
  public constructor(tilePool?: TilePool) {
    super(
      (request, quality, stride, y0, y1, signal, mirrorPlan) =>
        classifyProductionRows(request, quality, stride, y0, y1, signal, undefined, mirrorPlan),
      (point, quality) =>
        new ProductionOrbitClassifier({
          maxIterations: quality.maxIterations,
          maxPeriod: quality.maxPeriod,
        }).classify(point),
      tilePool,
      () => true,
    );
  }
}
```

`cpu-renderer.ts` keeps `export class CpuRenderer extends StagedRenderer` with `classifyRows(request, quality, stride, y0, y1, signal, request.classifierMode, request.yieldMechanism, undefined, { perfCounters: request.perfCounters === true, mirrorPlan })`, `classifyOrbit(point, { maxIterations, maxPeriod })`, and `poolEligible = (r) => r.perfCounters !== true && (r.classifierMode ?? 'triggered-scan') === 'triggered-scan' && (r.yieldMechanism ?? 'message-channel') === 'message-channel'`.

- [ ] **Step 4: Rewire the workers and slim the pool**

- `runtime.ts`: `renderer: Renderer = new ProductionRenderer()`; import from `'../render/production-renderer'` (not the barrel).
- `render.worker.ts`: `new RenderWorkerRuntime(port, new ProductionRenderer(pool))`.
- `tile-handler.ts`: `classifyProductionRows(request, message.quality, 1, message.y0, message.y1, signal, bandOutput, mirrorPlan)`; result message without `differential`.
- `tile-pool.ts`: `classifyStable(request, quality, signal)`; `#classifyInProcess` uses `classifyProductionRows`; dispatch order always `orderRowBandsForDispatch`; always zero-copy band storage; remove differential accumulation and the legacy-merge copy branch.
- `tile-protocol.ts` and `renderer.ts`: remove the dropped fields and `BandOrder`/`FrameOutput` types; fix every compile error by deleting the now-dead branch, never by re-adding a field.

- [ ] **Step 5: Write the build check**

`tools/check-bundle-modules.mjs`:

```js
#!/usr/bin/env node
/**
 * Fails if a browser bundle contains a reference kernel: the browser runs only
 * the production renderer (ADR 0006; spec 2026-10-16). Reads Vite source maps.
 * Usage: node tools/check-bundle-modules.mjs <outDir>
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const FORBIDDEN = [
  'src/domain/checkpoint.ts',
  'src/domain/orbit-instrumented.ts',
  'src/render/classify-rows.ts',
  'src/render/perf-counters.ts',
];
const assets = path.join(process.argv[2] ?? '.bundle-check', 'assets');
const offenders = readdirSync(assets)
  .filter((file) => file.endsWith('.js.map'))
  .flatMap((file) => {
    const { sources } = JSON.parse(readFileSync(path.join(assets, file), 'utf8'));
    return sources
      .filter((source) => FORBIDDEN.some((name) => source.endsWith(name)))
      .map((source) => `${file}: ${source}`);
  });
if (offenders.length > 0) {
  process.stderr.write(`reference kernels in browser bundles:\n${offenders.join('\n')}\n`);
  process.exit(1);
}
process.stdout.write('browser bundles contain only the production renderer\n');
```

- [ ] **Step 6: Run everything**

Run: `npm run check:bundle`
Expected: `browser bundles contain only the production renderer`. If it lists a file, follow the import chain from the worker entry (`grep -rn "from '../render'" src/worker`) and import the specific module instead of the barrel.
Run: `npm run check && npx playwright test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A src tests tools/check-bundle-modules.mjs package.json .gitignore
git commit -m "Browser runs only the production renderer; build check keeps reference kernels out of bundles"
```

---

### Task 8: Remove old-renderer URL parameters and message fields

**Files:**

- Modify: `src/ui/benchmark-params.ts` (remove `classifierMode`, `bandOrder`, `yieldMechanism`, `frameOutput`; keep `perf`, `conjugateMirror`, `view`, `quality`), `src/ui/application.ts` (stop sending those fields; drop `lastDifferential` from the hook), `src/worker/protocol.ts` (remove `classifierMode`, `bandOrder`, `frameOutput`, `yieldMechanism` from `RenderMessage`; `differential` from `FrameMessage`), `src/worker/runtime.ts` (`dynamicsRequest` passes only viewport, size, quality, conjugateMirror), `src/ui/worker-timing-marks.ts` (remove `differential`), `tests/unit/ui/benchmark-params.test.ts`, `tests/unit/render/bit-identical-flags.test.ts`, `tests/unit/worker/runtime.test.ts`, `src/ui/worker-timing-marks.test.ts`, `docs/IMPLEMENTATION.md` (classifier-mode bullet: browser runs only the default; modes are Node-only)
- Test: `tests/unit/ui/benchmark-params.test.ts`

**Interfaces:**

- Consumes: Task 7
- Produces: `BenchmarkParams = { perfEnabled: boolean; conjugateMirror?: false; viewport?: Viewport; qualityProfile?: QualityProfileId }`

- [ ] **Step 1: Write the failing test (Review Focus 3)**

Add to `tests/unit/ui/benchmark-params.test.ts`:

```ts
it('ignores retired renderer parameters from old URLs', () => {
  const parsed = parseBenchmarkParams(
    '?perf=1&classifierMode=legacy-scan&bandOrder=legacy&yieldMechanism=timeout&frameOutput=legacy-merge&perfCounters=1',
  );
  expect(parsed).toEqual({ perfEnabled: true });
});
```

Delete the existing tests that assert those parameters parse (classifier vocabulary, band order, yield mechanism, frame output).

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/ui/benchmark-params.test.ts`
Expected: FAIL (`classifierMode` etc. still present).

- [ ] **Step 3: Remove the parameters and fields** listed under Files; let the compiler find every use.

- [ ] **Step 4: Run everything**

Run: `npm run check && npm run check:bundle && npx playwright test`
Expected: PASS; the browser bundle check still passes. The e2e provenance test still uses `classifierMode=legacy-scan` in its URL until Task 9 — it now renders the production default and may race; if it fails here, do Task 9's provenance rewrite in this task.

- [ ] **Step 5: Commit**

```bash
git add -A src tests docs
git commit -m "Remove retired renderer parameters from the browser"
```

---

### Task 9: E2E suite on the production bundle; fast provenance test; one first-use flow

**Files:**

- Modify: `playwright.config.ts`, `package.json` (`"test:browser:dev": "PLAYWRIGHT_DEV_SERVER=1 playwright test"`), `tests/e2e/explorer.spec.ts`, `src/ui/application.ts` (test seam gate, two lines)

**Interfaces:**

- Consumes: Tasks 7–8 (production-only browser)
- Produces: suite with three fewer default-view loads per engine and no test above 10 s

- [ ] **Step 1: Serve the production bundle**

In `playwright.config.ts`:

```ts
const devServer = Boolean(process.env['PLAYWRIGHT_DEV_SERVER']);
const port = devServer ? 5173 : 4173;
// use.baseURL:
baseURL: `http://127.0.0.1:${port}`,
// webServer:
webServer: {
  command: devServer
    ? 'npm run dev'
    : 'npx vite build --mode e2e --outDir dist-e2e --emptyOutDir --logLevel warn && npx vite preview --outDir dist-e2e --host 127.0.0.1 --port 4173 --strictPort',
  url: `http://127.0.0.1:${port}`,
  reuseExistingServer: !process.env['CI'],
  timeout: 180_000,
},
```

The failure-injection seam the recovery tests use (`window.__MI_PHASE1_TEST__`) is
dev-only today (`src/ui/application.ts`, `if (import.meta.env.DEV)` at the
seam's install and removal). Enable it for the e2e build mode too, so the
suite runs a minified production bundle that differs only by this hook. In
both places change the condition to:

```ts
if (import.meta.env.DEV || import.meta.env.MODE === 'e2e')
```

Add `dist-e2e/` to `.gitignore`, `.prettierignore`, and the ESLint ignores.

Run: `npx playwright test`
Expected: PASS on the preview server in both engines.
Run: `npx vite build --logLevel warn && grep -c "__MI_PHASE1_TEST__" dist/assets/*.js`
Expected: every count `0` (the normal production build still omits the seam).

- [ ] **Step 2: Rewrite the provenance test for the fast kernel**

Replace the body of `render traces carry delivery provenance and two-event cancellation timing` with:

```ts
await page.goto('/?perf=1&view=-0.158902249,-1.034028,0.019841269841269841269&quality=detailed');
const explorer = page.locator('#explorer');
await expect(explorer).toHaveAttribute('data-render-stage', 'stable', { timeout: 30_000 });
const canvas = page.getByLabel('Interactive Mandelbrot set');
await canvas.focus();

// Cancel: press during a coarse frame; the stable frame can win the race,
// so retry until a trace closes as cancelled.
let cancelledTrace: TraceView | undefined;
for (let attempt = 0; attempt < 5 && cancelledTrace === undefined; attempt += 1) {
  await canvas.press(attempt % 2 === 0 ? '+' : '-');
  await expect(explorer).toHaveAttribute('data-render-stage', 'coarse', { timeout: 10_000 });
  await canvas.press(attempt % 2 === 0 ? '-' : '+');
  await expect(explorer).toHaveAttribute('data-render-stage', 'stable', { timeout: 10_000 });
  cancelledTrace = await tracesWith(page, 'cancelled');
}
expect(cancelledTrace).toBeDefined();
expect(cancelledTrace?.childQuiescenceMs).toBeGreaterThanOrEqual(
  cancelledTrace?.cancelAckMs ?? Number.POSITIVE_INFINITY,
);

const computedTrace = (await renderTraces(page)).filter((t) => t.outcome === 'completed').at(-1);
expect(computedTrace?.computeId).toBeGreaterThan(0);
for (const frame of computedTrace?.frames ?? []) {
  expect(frame.source).toBe('computed');
  expect(frame.workerWallMs).toBeGreaterThan(0);
}

await page.getByLabel('Interior view').selectOption('multiplier');
await expectRecolorOf(page, computedTrace?.computeId);
```

Run: `npx playwright test -g "delivery provenance" --repeat-each 5`
Expected: 10/10 pass, each under 10 s.

- [ ] **Step 3: Fold the four default-view tests into one**

Create `test('first-use flow: explanations, evidence terms, interior views, and accessibility', async ({ page }) => { … })` containing, in order, each wrapped in `await test.step('<old title>', async () => { … })`:

1. the body of `starts with a useful, explained semantic view` (keeps its `page.goto('/')`);
2. the body of `explains evidence terms and exposes bounded quality profiles` without its `page.goto('/')`, with its `quality.selectOption('detailed')` and the two assertions after it moved to step 5;
3. the body of `changes semantic views and updates their explanation` without its `page.goto('/')`;
4. the body of `has no automated WCAG A or AA violations in primary states` without its `page.goto('/')`; if its first `Explore` click fails because step 1 already dismissed the guide, guard it with `if (await page.getByRole('button', { name: 'Explore', exact: true }).isVisible())`;
5. the Detailed quality selection and its two assertions.

Delete the four original tests. Every `expect` from the originals appears exactly once in the new test.

- [ ] **Step 4: Verify**

Run: `npx playwright test --reporter=list`
Expected: all pass in both engines; the list shows 15 tests per engine (18 − 4 + 1); no test above 10 s (check the durations printed).

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts package.json tests/e2e
git commit -m "E2E on the production bundle; fast provenance test; one first-use flow"
```

---

### Task 10: Acceptance release session

**Files:**

- Create: `evidence/phase-2/<date>-<commit>-release/` (generated)
- Modify: `docs/verification/PHASE-2-CLOSEOUT.md` (add one "Release session harness" paragraph under Findings citing the directory and its runtime), `docs/PERFORMANCE-PLAN.md` (Stage A section: release sessions use `npm run evidence:release`)

**Interfaces:**

- Consumes: everything above
- Produces: the acceptance evidence for the spec

- [ ] **Step 1: Check the session, then run**

Run: `loginctl show-session $(loginctl list-sessions --no-legend | awk '$3=="'"$USER"'" && $4=="seat0"{print $1}') -p LockedHint`
Expected: `LockedHint=no`. Ask the owner to keep the browser windows uncovered for 30 minutes.
Run: `time kde-inhibit --screenSaver --power npm run evidence:release`
Expected: exit 0; `real` ≤ 30 minutes; summary shows every budget `pass`, 0 hash mismatches, 0 provenance violations, hook overhead pooled upper bound ≤ 1.05.

- [ ] **Step 2: Compare with the 2026-10-15 runs**

Check that each case's stable median lies within the 2026-10-11/15 Stage A candidate interval spread (±20% of the earlier median) and interactions agree within their MADs. Record any disagreement in the closeout paragraph rather than re-running until it agrees.

- [ ] **Step 3: Commit and push**

```bash
git add evidence/phase-2 docs
git commit -m "Acceptance release session for the consolidated harness"
git push
```
