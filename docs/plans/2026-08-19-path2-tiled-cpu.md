# Path 2 tiled Worker CPU renderer — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Meet the Phase 1 1024² stable presentation budget (≤2.25 s) on the documented i7-1185G7 target in Chromium and Firefox without a second numerical engine, by tiling the **stable** classify pass across nested workers behind `Renderer.render()`, while keeping cancellation p95 ≤50 ms and bit-identical semantics with today’s `OrbitClassifier`.

**Architecture:** The UI still owns exactly one module Worker via `RendererWorkerClient`. `RenderWorkerRuntime` is **unchanged** in its collaboration with `Renderer`: cache, inspect, view coalescing, cancel, and `error` recovery stay on that boundary. `CpuRenderer.render()` still does coarse then stable. When a tile pool is injected and `workerCount > 1`, **only the stable stride-1 classify** is fanned to nested tile workers; coarse, inspect, and colorize stay in-process on the UI-facing worker. Tile workers run the existing TypeScript classifier on exclusive row bands and transfer band-sized arrays back. Merge happens in `CpuRenderer` / `TilePool`, then the existing `onFrame(stable)` path colorizes and posts one UI `frame`. No SharedArrayBuffer, no COEP, no UI protocol change.

This plan was revised after four adversarial reviews (concurrency, architecture, performance, tests). The original draft put tiling in `RenderWorkerRuntime`, treated yield-32 as a tiling kill-gate, and used a non-existent worker `close` event. Those are rejected below.

**Tech Stack:** Existing Vite + TypeScript workers, `CpuRenderer` / `OrbitClassifier`, Vitest (Node), Playwright, `tools/measure_ui_path.mjs`.

## Global Constraints

- Retain the binary64 Worker CPU renderer (ADR 0002). Do not add WASM, SIMD, WebGPU, or Go.
- Retain the TypeScript/Node toolchain. Nested workers must be Vite module workers.
- UI thread still must not classify orbits or hold semantic arrays.
- `Renderer` and `MainToWorkerMessage` / `WorkerToMainMessage` stay renderer-neutral. Tile messages are **worker-internal**.
- `RenderWorkerRuntime` continues to call only `renderer.render()`, `inspect()`, and `colorize()`. It must not grow `coarseFrame` / `pool` APIs.
- Bit-identical stable `SemanticFrame` vs serial classify for the same request.
- Cancellation acknowledgement p95 ≤50 ms (`mi:cancellation-requested` → `mi:cancellation-acknowledged` by request ID).
- Automatic one-shot recovery and manual retry remain defined on the **UI-facing** worker only.
- Coarse budgets (≤150 ms @ 768², ≤250 ms @ 1024²) must not regress.
- Do not change quality profiles, `maxRenderEdge`, zoom ceiling, or inspector math.
- Do not enable `Cross-Origin-Embedder-Policy: require-corp`.
- Target evidence: headed Playwright Chromium 151 and Firefox 153 on the i7-1185G7.
- Do not merge a task that breaks cancel p95 or bit-identical semantics.

## Review-driven locks (do not regress these)

1. **Pool is behind `Renderer`, not `RenderWorkerRuntime`.** Inject `TilePool` into `CpuRenderer` (or a `TiledCpuRenderer implements Renderer` wrapper). Runtime tests keep using a fake `Renderer`.
2. **Keep today’s 8-step Balanced yield until tiling is measured.** `throwIfAborted` every outer `y` does **not** see UI cancel until `setTimeout(0)` (or equivalent) runs. Scaling serial yields from 8 rows to 32 rows is predicted to push Firefox cancel p95 over 50 ms. Do **not** stop tiling if a later yield-relax probe fails cancel; revert the cadence, keep the pool.
3. **Yield cadence is loop steps, not `rowsPerYield / stride`.** Preserve `(Math.floor(y / stride) & mask) === mask` with `mask = 7` (Balanced/Quick) or `1` (Detailed, `maxIterations > 512`). Coarse stride 8 must still yield every 8 coarse steps (~16 yields at 1024 high), not every coarse row.
4. **`AbortSignal` is not structured-cloneable.** Children learn about cancel only via `tile-cancel` plus a trip through their event loop. Cancel SLO is **child time-to-next-yield**, not “abort-check every row.”
5. **No `close` listener as teardown.** Dedicated workers have no `close` event; UI `terminate()` aborts the supervisor without running JS. Nested children must die because the HTML owner-set is empty, **proved** with a CDP worker-count test. `dispose()` still `terminate()`s children for fakes and for any in-process shutdown that _can_ run.
6. **Construct nested `Worker` only in `render.worker.ts`.** Vitest imports `runtime.ts` / `cpu-renderer.ts` under `environment: 'node'`. A factory in those constructors will spawn `worker_threads` or throw. Default: `workerCount = 1`, no factory, serial path. Production: `render.worker.ts` passes the pool in.
7. **Single-flight pool and child.** One in-flight `classifyStable`. New work must abort, **drain** (every child settled or `terminate()`d), clear the generation-scoped accumulator, then dispatch. A child runs one `classifyRows` at a time and never shares `OrbitScratch` across overlapping calls.
8. **After every `await` in `CpuRenderer.render`:** if `signal.aborted`, throw `RenderCancelledError` before `onFrame` / cache. Runtime already suppresses aborted frames; do not put a stable frame from a cancelled generation.
9. **Band writes are band-relative; samples are full-raster absolute.** `offset = (y - y0) * width + x`. `pixelToComplex` uses full `request.size` and absolute `(x, y)`.
10. **`splitRowBands` is stride-1 only.** Do not tile coarse through it (coarse samples `y += stride` and would leave the serial grid).
11. **Lazy pool start after the first coarse `onFrame` of the process** (or after the first stable is requested). Do not compile four nested module workers during first-use coarse.
12. **Worker count** `clampTileWorkers(hardwareConcurrency) = min(4, max(1, n || 1))`. Argument order is `(value)` with internal min 1 max 4. Count 1 never calls `factory`.
13. **Do not reuse `RendererWorker`.** Define `TileWorkerHandle` in `tile-protocol.ts` with `postMessage(msg, transfer?)`. Worker code must not import `src/ui/`.
14. **Children allocate per job and transfer those buffers once.** Never write into a transferred buffer; never transfer the supervisor’s merged frame.
15. **Skip the pool if** a cancel-safe serial change already puts **both** browsers’ 1024² median and max ≤ 2250 ms. Otherwise continue tiling at 8-step yield.

## File map

| File                                                                     | Responsibility                                                                                                                              |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/render/yield-policy.ts` **create**                                  | Bitwise yield helper matching today’s `cpu-renderer.ts` cadence.                                                                            |
| `src/render/row-bands.ts` **create**                                     | `splitRowBands`, `copyBandIntoFrame`. Stride-1 only.                                                                                        |
| `src/render/classify-rows.ts` **create** or extract in `cpu-renderer.ts` | `classifyRows` with absolute samples, band-relative writes, abort every row, yield by helper.                                               |
| `src/render/cpu-renderer.ts`                                             | `render()` still orchestrates coarse then stable; stable may call `TilePool`.                                                               |
| `src/worker/tile-protocol.ts` **create**                                 | Tile messages + `TileWorkerHandle`.                                                                                                         |
| `src/worker/tile-handler.ts` **create**                                  | Pure handler used by `tile.worker.ts` **and** unit tests (no real `Worker`).                                                                |
| `src/worker/tile.worker.ts` **create**                                   | Thin `onmessage` → `tile-handler`.                                                                                                          |
| `src/worker/tile-pool.ts` **create**                                     | Generation, single-flight, cancel, drain, merge.                                                                                            |
| `src/worker/render.worker.ts`                                            | **Only** production site of `new Worker(new URL('./tile.worker.ts', import.meta.url), { type: 'module' })`. Builds `CpuRenderer` with pool. |
| `src/worker/runtime.ts`                                                  | **No tiling changes.**                                                                                                                      |
| `src/ui/renderer-worker-client.ts`                                       | **No protocol change.**                                                                                                                     |
| Tests as listed in Task 3–5                                              | See required tests; several were missing from the first draft.                                                                              |

## Current bottlenecks

Measured 2026-08-18, Balanced, forced 1024², reset then `+`:

| Browser      | Stable median / max |  Budget |           Gap |
| ------------ | ------------------: | ------: | ------------: |
| Chromium 151 |      2364 / 2381 ms | 2250 ms | ~114 / 131 ms |
| Firefox 153  |      2627 / 2664 ms | 2250 ms | ~377 / 414 ms |

Envelope (not yet measured — Task 0 clocks it): ~80–85% of e2e is stable classify, ~6–10% yield `setTimeout(0)`, ~3–5% colorize+present, ~6% coarse. Four tile workers on this 15 W 4c/8t CPU should be planned as **σ ≈ 2.0–3.0× on classify**, not 4.0×, and wall time is `max(band)` (equator is slower). That is still enough **if nested workers actually overlap**. If they serialize, Path 2 cannot close Firefox.

Peak memory during tiled stable: coarse frame + supervisor stable frame + in-flight bands ≈ **~63 MiB semantic + 4 MiB RGBA**, above Phase 0’s ~46 MiB serial peak. Accept for this plan; watch Firefox max-sample jitter.

## Internal tile protocol (supervisor ↔ child only)

```ts
interface TileClassifyMessage {
  readonly type: 'tile-classify';
  readonly generation: number;
  readonly jobId: number;
  readonly viewport: Viewport;
  readonly size: RasterSize; // full raster
  readonly y0: number; // inclusive
  readonly y1: number; // exclusive
  readonly quality: RenderQuality; // resolved **stable** quality, never coarseQuality
}

interface TileResultMessage {
  readonly type: 'tile-result';
  readonly generation: number;
  readonly jobId: number;
  readonly y0: number;
  readonly y1: number;
  readonly status: Uint8Array<ArrayBuffer>;
  readonly period: Uint32Array<ArrayBuffer>;
  readonly smoothIterationOrMultiplierMagnitude: Float64Array<ArrayBuffer>;
  readonly multiplierAngle: Float64Array<ArrayBuffer>;
}

interface TileCancelMessage {
  readonly type: 'tile-cancel';
  readonly generation: number;
}

interface TileErrorMessage {
  readonly type: 'tile-error';
  readonly generation: number;
  readonly jobId: number;
  readonly message: string;
}
```

Child handler (must be unit-testable without `Worker`):

```ts
// one jobController per child
// tile-cancel → jobController.abort(); do not post tile-result
// tile-classify → abort previous job, await settlement, new AbortController,
//   classifyRows(..., jobController.signal), transfer four buffers
// throw → tile-error, no tile-result
```

Pool abort (same thread as `CpuRenderer`):

```ts
if (signal.aborted) throw new RenderCancelledError();
const generation = ++this.generation;
const onAbort = () => {
  this.generation += 1;
  for (const child of assigned)
    child.postMessage({ type: 'tile-cancel', generation: this.generation - 1 });
  rejectWaiter(new RenderCancelledError());
};
signal.addEventListener('abort', onAbort, { once: true });
// register onAbort **before** the first tile-classify post
```

`classifyStable` **rejects on abort even if children never reply**.

## Band split

Remainder-front, count clamped to height, exclusive `[y0, y1)` covering `[0, height)`:

```ts
export function splitRowBands(height: number, bandCount: number): readonly RowBand[] {
  if (height < 1 || bandCount < 1) throw new RangeError('height and bandCount must be >= 1');
  const count = Math.min(bandCount, height);
  const base = Math.floor(height / count);
  let remainder = height % count;
  let y = 0;
  const bands: RowBand[] = [];
  for (let i = 0; i < count; i += 1) {
    const extra = remainder > 0 ? 1 : 0;
    if (remainder > 0) remainder -= 1;
    const y1 = y + base + extra;
    bands.push({ y0: y, y1 });
    y = y1;
  }
  return bands;
}
```

`copyBandIntoFrame`: `frame.status.set(band.status, y0 * width)` (length `(y1-y0)*width`).

## Yield helper (must match production today)

```ts
export function yieldMaskForQuality(maxIterations: number): number {
  return maxIterations > 512 ? 1 : 7;
}

export function shouldYieldToEventLoop(y: number, stride: number, mask: number): boolean {
  return (Math.floor(y / stride) & mask) === mask;
}
```

Tests: stride 1 mask 7 yields at y=7,15,…; stride 8 mask 7 yields 16 times on height 1024 (steps 7,15,…,127), **not** every coarse row.

---

### Task 0: Instrument worker stages (before changing cadence or adding workers)

**Files:** `src/render/cpu-renderer.ts`, `src/worker/runtime.ts` or `application.ts` marks, `tools/measure_ui_path.mjs`

Add worker-side timestamps copied onto `mi:*` marks or `performance.measure` names:

- `mi:worker-coarse-classify`
- `mi:worker-coarse-colorize`
- `mi:worker-stable-classify`
- `mi:worker-stable-colorize`

Also count yield awaits and sum their delay.

Rerun `measure_ui_path.mjs` once. This splits the 2364/2627 ms **before** Path 2 implementation. Do not claim closeout.

If this shows colorize+present already ≥ the Chromium gap and classify is not ~80%, **stop and re-plan** (tiling classify would be the wrong hammer).

---

### Task 1: Extract yield helper with **zero** cadence change

**Files:** `src/render/yield-policy.ts`, `tests/unit/render/yield-policy.test.ts`, `src/render/cpu-renderer.ts`

- [ ] Lock bitwise cadence for stride 1 and stride 8 (tests named in the review: `shouldYieldToEventLoop_matchesCurrentBitwiseCadence_stride1AndStride8`).
- [ ] Wire `cpu-renderer.ts` to the helper. `npm run test:unit` green. **No** rowsPerYield=32 in this task.
- [ ] Commit: `Extract Worker CPU yield policy without changing cadence`

A **later optional** task may probe a **time-sliced** yield (e.g. `performance.now()` budget 8–12 ms) after tiling is measured. Row-32 is not that task.

---

### Task 2: Pure band split and merge

**Files:** `src/render/row-bands.ts`, `tests/unit/render/row-bands.test.ts`

- [ ] `splitRowBands(10, 3)` remainder-front cover; `splitRowBands(4, 4)`; `splitRowBands(3, 8)` clamps to 3; reject `< 1`.
- [ ] `copyBandIntoFrame_oddHeightLastRow` (height 5, band `{4,5}`).
- [ ] Commit: `Add exclusive row-band split and semantic merge helpers`

---

### Task 3: `classifyRows` + testable tile handler + pool (no real Workers)

**Files:** extract `classifyRows`; `tile-protocol.ts`; `tile-handler.ts`; `tile.worker.ts` (thin); `tile-pool.ts`; tests.

`classifyRows` signature:

```ts
export async function classifyRows(
  request: DynamicsRenderRequest,
  quality: RenderQuality,
  stride: number,
  y0: number,
  y1: number,
  signal: AbortSignal,
): Promise<BandArrays>; // four ArrayBuffers, length (y1-y0)*width
```

- [ ] `classifyRows_bandMatchesSerialSlice` on height 11, band `[3,7)`, Balanced `{512,32,8}` — band equals `serial.subarray(3*width, 7*width)` for all four channels.
- [ ] `classifyRows_abortsOnEveryRow` — abort at `y0+1`, rejects `RenderCancelledError` without waiting for a yield.
- [ ] `handleTileClassify_postsTransferredBandForAbsoluteRows`
- [ ] `handleTileCancel_suppressesResultForThatGeneration`
- [ ] `handleTileClassify_postsTileErrorOnThrow`
- [ ] `createTilePool_workerCount1_neverCallsFactory`
- [ ] `createTilePool_reusesWorkersAcrossTwoClassifyStableCalls`
- [ ] `classifyStable_rejectsWhenSignalAbortsEvenIfChildrenNeverReply`
- [ ] `classifyStable_lateResultAfterAbortDoesNotResolveOrCorruptNextJob`
- [ ] Overlapping `classifyStable`: drain before the second dispatch; leftover `jobId` 0 cannot complete the new generation.

`stageSemantics` / `CpuRenderer.render` still serial until Task 4.

Commit: `Add band classify, tile handler, and a generation-aware pool`

---

### Task 4: Wire pool into `CpuRenderer.render()`; construct it in `render.worker.ts`

**Files:** `cpu-renderer.ts`, `render.worker.ts`, `tests/unit/render/cpu-renderer.test.ts` (not runtime tiling).

```ts
class CpuRenderer implements Renderer {
  public constructor(private readonly tilePool?: TilePool) {}
  public async render(request, signal, onFrame) {
    validateRasterSize(request.size);
    const quality = resolveRenderQuality(request.quality);
    const coarse = await classifyFull(..., coarseQuality, coarseStride, signal);
    throwIfAborted(signal);
    await onFrame(coarse);
    throwIfAborted(signal);
    const stable =
      this.tilePool !== undefined && this.tilePool.size > 1
        ? await this.tilePool.classifyStable(request, quality, signal)
        : await classifyFull(..., quality, 1, signal);
    throwIfAborted(signal);
    await onFrame(stable);
  }
}
```

`render.worker.ts`:

```ts
const pool = createTilePool({
  workerCount: clampTileWorkers(globalThis.navigator?.hardwareConcurrency),
  factory: () =>
    new Worker(new URL('./tile.worker.ts', import.meta.url), {
      type: 'module',
      name: 'mandelbrot-tile',
    }),
});
const runtime = new RenderWorkerRuntime(port, new CpuRenderer(pool));
```

Lazy: `createTilePool` may spawn on first `classifyStable`, not at module evaluate.

- [ ] Existing `new RenderWorkerRuntime(port, renderer)` tests **unchanged** and still pass (no `Worker` in Vitest).
- [ ] `runtime_coarseDoesNotCallPool` — inject a `CpuRenderer` with a pool that throws if `classifyStable` is called during coarse; one `render()` posts coarse then stable; `classifyStable` once with **stable** quality.
- [ ] `runtime_secondRenderSameKey_doesNotCallClassifyStable` — still via `Renderer.render` + existing cache.
- [ ] `runtime_inspectDuringPendingClassifyStable_stillHitsRendererInspect`
- [ ] `runtime_cancelAfterCoarse_doesNotStartTiles`
- [ ] `runtime_cancelDuringClassifyStable_postsCancelledNotStable` — fake pool pending, cancel, `cancelled`, no stable `frame`.
- [ ] `build_emitsNestedTileWorkerChunk` — `npm run build:assets` then assert `dist/assets` has `tile.worker-*.js` referenced from `render.worker-*.js`.

Commit: `Run stable classify through an optional nested tile pool inside CpuRenderer`

---

### Task 5: Identity, nested-worker smoke, recovery leak check, budgets

- [ ] `stableFrame_matchesInProcessThreeBandMerge_atBalancedQuality_oddHeight` — `DEFAULT_VIEWPORT`, **16×9**, quality **`{ maxIterations: 512, maxPeriod: 32, coarseStride: 8 }`**, 3 bands, typed arrays `toEqual`.
- [ ] Headed smoke: supervisor can start `tile.worker` in Chromium 151 and Firefox 153 (dev or preview). If Firefox cannot start nested module workers, **stop** and switch to sibling+`MessageChannel` (out of this plan’s happy path; do not silently run serial and call it tiled).
- [ ] `recovery_doesNotLeakNestedWorkers` — Playwright Chromium CDP `Target.getTargets`: after first stable, worker count is `1+N` (`N` in 1..4). `failRenderer` once, wait Stable, count still `1+N` not `2*(1+N)`.
- [ ] `npm run check` and `npm run test:browser` green.
- [ ] Target-device evidence with **n ≥ 11** samples, plus:
  - worker stage marks (Task 0)
  - overlap ratio: wall(first tile-classify → last tile-result) vs sum of band CPU; **fail the tile claim if Firefox overlap ≲ 1.3×**
  - cold first-stable once per browser (pool not yet warm)
  - sidecar: unforced 16:10 backing (~1024×640) **in addition to** forced 1024²
  - record `hardwareConcurrency`, pool size, CPU governor
- [ ] Success for closeout of this plan: forced 1024² stable **median and max** ≤ 2250 ms in both browsers, cancel in-flight p95 ≤ 50 ms, coarse budgets hold, Chromium long-tasks >50 ms remain 0.
- [ ] If overlap is real and Firefox still misses 2.25 s: **do not** raise worker count above 4; **do not** drop period search. Stop and report. Optional follow-ups (new plan): reuse coarse **escaped** pixels only; tile or yield inside colorize if Task 0 clocks show it.

Docs: `IMPLEMENTATION.md` — pool hidden behind `Renderer`, nested workers, no COEP, owner-set teardown + CDP proof. `PHASE1-TODO.md` budget checkbox only if the gate passes. Dated evidence under `evidence/phase-1/`.

Commit: `Prove tiled stable classify matches serial output and meets 1024 budgets`

---

## Test matrix (authoritative)

See Task 3–5 names. CI must not assert wall-clock budgets. CI **must** assert cancel rejects without child replies, Balanced-quality odd-height identity, worker chunk emit, and CDP worker-count after recovery.

## Out of scope

- WASM/SIMD/WebGPU
- Tiling coarse or colorize
- Skipping escaped pixels (separate idea)
- SharedArrayBuffer / Atomics / `hardwareConcurrency` > 4
- Changing Balanced quality or `maxRenderEdge`
- Main-thread worker pool
- Yield-32 as a prerequisite
- Putting tile APIs on `RenderWorkerRuntime`
- Inspector parallelization

## Rollback

Task 0–2 are behavior-preserving. Task 4 can force `workerCount = 1` without deleting files if nested workers cannot start.

## Success

Path 2 is done when Task 5 evidence is committed, 1024² stable is ≤2.25 s in both measured browsers, cancel p95 ≤50 ms, unit identity holds at Balanced quality, recovery does not leak nested workers, and ADR 0002 still describes a single TypeScript Worker CPU renderer behind one UI worker.
