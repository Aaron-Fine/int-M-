import { describe, expect, it } from 'vitest';

import { type RenderQuality, type Viewport } from '../../../src/domain';
import {
  CpuRenderer,
  semanticRequestKey,
  type DynamicsRenderRequest,
  type SemanticFrame,
  type TilePool,
} from '../../../src/render';
import { parseBenchmarkParams } from '../../../src/ui/benchmark-params';
import { packStatusPeriod } from '../../../src/render/packed-semantic';
import { RenderWorkerRuntime, type WorkerToMainMessage } from '../../../src/worker';
import { createTileHandler } from '../../../src/worker/tile-handler';
import { createTilePool } from '../../../src/worker/tile-pool';
import type {
  SupervisorToTileMessage,
  TileClassifyMessage,
  TileMessageEvent,
  TileWorkerHandle,
} from '../../../src/worker/tile-protocol';

/**
 * End-to-end wiring of the bit-identical `conjugateMirror` switch (default
 * ON, `false` disables): URL toggle, worker runtime, semantic cache key, CPU
 * renderer, tile pool (in-process and tiled) and the tile handler. The mirror
 * only applies to views centered exactly on the real axis, hence the viewport.
 */

const QUALITY: RenderQuality = { maxIterations: 256, maxPeriod: 32, coarseStride: 4 };
const VIEWPORT: Viewport = { center: { re: -0.5, im: 0 }, spanY: 2.2 };
const SIZE = { width: 37, height: 23 }; // odd width and height
const BASE: DynamicsRenderRequest = { viewport: VIEWPORT, size: SIZE, quality: QUALITY };
const MIRROR_OFF = { conjugateMirror: false } as const;

const flatten = (frame: SemanticFrame) => {
  const length = SIZE.width * SIZE.height;
  const packed = new Uint32Array(length);
  const primary = new Float64Array(length);
  const angle = new Float64Array(length);
  for (const band of frame.bands) {
    const offset = band.y0 * SIZE.width;
    packed.set(band.packedStatusPeriod, offset);
    primary.set(band.smoothIterationOrMultiplierMagnitude, offset);
    angle.set(band.multiplierAngle, offset);
  }
  return { packed, primary, angle };
};

const expectFramesIdentical = (actual: SemanticFrame, expected: SemanticFrame): void => {
  const a = flatten(actual);
  const e = flatten(expected);
  expect(Array.from(a.packed)).toEqual(Array.from(e.packed));
  expect(a.primary.every((value, index) => Object.is(value, e.primary[index]))).toBe(true);
  expect(a.angle.every((value, index) => Object.is(value, e.angle[index]))).toBe(true);
};

const stableFrame = async (request: DynamicsRenderRequest): Promise<SemanticFrame> => {
  const frames: SemanticFrame[] = [];
  await new CpuRenderer().render(request, new AbortController().signal, (frame) => {
    frames.push(frame);
  });
  const stable = frames.find((frame) => frame.stage === 'stable');
  if (stable === undefined) throw new Error('no stable frame');
  return stable;
};

class LoopbackTileWorker implements TileWorkerHandle {
  public readonly classifyPosts: TileClassifyMessage[] = [];
  readonly #listeners = new Set<(event: TileMessageEvent) => void>();
  readonly #handle = createTileHandler({
    postMessage: (message) => {
      queueMicrotask(() => {
        for (const listener of this.#listeners) listener({ data: message });
      });
    },
  });

  public postMessage(message: SupervisorToTileMessage): void {
    if (message.type === 'tile-classify') this.classifyPosts.push(message);
    void this.#handle(message);
  }

  public addEventListener(_type: 'message', listener: (event: TileMessageEvent) => void): void {
    this.#listeners.add(listener);
  }

  public removeEventListener(_type: 'message', listener: (event: TileMessageEvent) => void): void {
    this.#listeners.delete(listener);
  }

  public terminate(): void {
    this.#listeners.clear();
  }
}

const loopbackPool = (workerCount: number): { pool: TilePool; workers: LoopbackTileWorker[] } => {
  const workers: LoopbackTileWorker[] = [];
  const pool = createTilePool({
    workerCount,
    factory: () => {
      const worker = new LoopbackTileWorker();
      workers.push(worker);
      return worker;
    },
  });
  return { pool, workers };
};

describe('URL toggle', () => {
  it('mirroring is disabled only by the exact ?perf=1&conjugateMirror=0 form', () => {
    expect(parseBenchmarkParams('?perf=1&conjugateMirror=0').conjugateMirror).toBe(false);
    expect(parseBenchmarkParams('').conjugateMirror).toBeUndefined();
    expect(parseBenchmarkParams('?perf=1').conjugateMirror).toBeUndefined();
    expect(parseBenchmarkParams('?conjugateMirror=0').conjugateMirror).toBeUndefined();
    expect(parseBenchmarkParams('?perf=0&conjugateMirror=0').conjugateMirror).toBeUndefined();
    expect(parseBenchmarkParams('?perf=1&conjugateMirror=1').conjugateMirror).toBeUndefined();
    expect(parseBenchmarkParams('?perf=1&conjugateMirror=false').conjugateMirror).toBeUndefined();
  });

  it('perfCounters without a classifierMode selects legacy-scan explicitly', () => {
    expect(parseBenchmarkParams('?perf=1&perfCounters=1').classifierMode).toBe('legacy-scan');
    expect(
      parseBenchmarkParams('?perf=1&perfCounters=1&classifierMode=checkpoint').classifierMode,
    ).toBe('checkpoint');
    expect(parseBenchmarkParams('?perf=1').classifierMode).toBeUndefined();
    expect(parseBenchmarkParams('?perfCounters=1').classifierMode).toBeUndefined();
  });
});

describe('semantic cache key', () => {
  it('marks only the explicit disable and leaves the default key unchanged', () => {
    const key = semanticRequestKey(BASE);
    expect(semanticRequestKey({ ...BASE, conjugateMirror: true })).toBe(key);
    expect(semanticRequestKey({ ...BASE, ...MIRROR_OFF })).toBe(`${key}|cj:0`);
  });
});

describe('worker runtime', () => {
  it('threads conjugateMirror into the dynamics request only when given', async () => {
    const requests: DynamicsRenderRequest[] = [];
    const messages: WorkerToMainMessage[] = [];
    const length = SIZE.width * SIZE.height;
    const runtime = new RenderWorkerRuntime(
      { postMessage: (message) => messages.push(message) },
      {
        inspect: () => ({ status: 'unresolved', iterations: 1, evidence: ['iteration-limit'] }),
        render: async (request, _signal, onFrame) => {
          requests.push(request);
          await onFrame({
            stage: 'stable',
            size: SIZE,
            sampleStride: 1,
            bands: [
              {
                y0: 0,
                y1: SIZE.height,
                packedStatusPeriod: new Uint32Array(length).fill(packStatusPeriod(0, 0)),
                smoothIterationOrMultiplierMagnitude: new Float64Array(length),
                multiplierAngle: new Float64Array(length),
              },
            ],
            progress: 1,
          });
        },
        colorize: (frame) => ({
          stage: frame.stage,
          size: frame.size,
          rgba: new Uint8ClampedArray(length * 4),
          progress: frame.progress,
        }),
      },
    );
    const base = {
      type: 'render' as const,
      viewport: VIEWPORT,
      size: SIZE,
      semanticView: 'stability' as const,
    };
    await runtime.handle({ ...base, requestId: 1 });
    await runtime.handle({ ...base, requestId: 2, conjugateMirror: false });

    expect(requests).toHaveLength(2);
    expect(requests[0]).not.toHaveProperty('conjugateMirror');
    expect(requests[1]?.conjugateMirror).toBe(false);
  });
});

describe('CPU renderer and tile pool', () => {
  it('renders bit-identically with mirroring on (default) and off (CpuRenderer)', async () => {
    const off = await stableFrame({ ...BASE, ...MIRROR_OFF });
    const on = await stableFrame(BASE);
    expectFramesIdentical(on, off);
  });

  it('renders bit-identically in the in-process tile pool path (1 worker)', async () => {
    const off = await stableFrame({ ...BASE, ...MIRROR_OFF });
    const { pool } = loopbackPool(1);
    try {
      const on = await pool.classifyStable(BASE, QUALITY, new AbortController().signal);
      expectFramesIdentical(on, off);
    } finally {
      pool.dispose();
    }
  });

  it('mirrors by default across tile workers and renders bit-identically (3 workers)', async () => {
    const off = await stableFrame({ ...BASE, ...MIRROR_OFF });
    const rowsDispatched = (workers: LoopbackTileWorker[]): number =>
      workers
        .flatMap((worker) => worker.classifyPosts)
        .reduce((sum, post) => sum + post.y1 - post.y0, 0);

    const { pool: offPool, workers: offWorkers } = loopbackPool(3);
    const offFrame = await offPool.classifyStable(
      { ...BASE, ...MIRROR_OFF },
      QUALITY,
      new AbortController().signal,
    );
    offPool.dispose();
    expect(rowsDispatched(offWorkers)).toBe(SIZE.height);
    expectFramesIdentical(offFrame, off);

    const { pool, workers } = loopbackPool(3);
    const on = await pool.classifyStable(BASE, QUALITY, new AbortController().signal);
    pool.dispose();
    // Prefix scheduling: only the ceil(height / 2) computed rows are dispatched.
    expect(rowsDispatched(workers)).toBe(Math.ceil(SIZE.height / 2));
    expectFramesIdentical(on, off);
  });
});
