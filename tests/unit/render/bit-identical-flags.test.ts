import { describe, expect, it, vi } from 'vitest';

import { InterleavedClassifier, type RenderQuality, type Viewport } from '../../../src/domain';
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
 * End-to-end wiring of the two bit-identical experiment flags `interleave`
 * and `preparedCoordinates`: URL toggles, worker runtime, semantic cache key,
 * CPU renderer, tile pool (in-process and tiled) and the tile handler.
 */

const QUALITY: RenderQuality = { maxIterations: 256, maxPeriod: 32, coarseStride: 4 };
const VIEWPORT: Viewport = { center: { re: -0.5, im: 0.1 }, spanY: 2.2 };
const SIZE = { width: 37, height: 23 }; // odd width: trailing scalar cell
const BASE: DynamicsRenderRequest = { viewport: VIEWPORT, size: SIZE, quality: QUALITY };
const FLAGS = { interleave: true, preparedCoordinates: true } as const;

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

describe('URL toggles', () => {
  it.each(['interleave', 'preparedCoordinates'] as const)(
    '%s is on only for the exact ?perf=1&%s=1 form',
    (flag) => {
      expect(parseBenchmarkParams(`?perf=1&${flag}=1`)[flag]).toBe(true);
      expect(parseBenchmarkParams('').perfEnabled).toBe(false);
      expect(parseBenchmarkParams('')[flag]).toBeUndefined();
      expect(parseBenchmarkParams('?perf=1')[flag]).toBeUndefined();
      expect(parseBenchmarkParams(`?${flag}=1`)[flag]).toBeUndefined();
      expect(parseBenchmarkParams(`?perf=0&${flag}=1`)[flag]).toBeUndefined();
      expect(parseBenchmarkParams(`?perf=1&${flag}=0`)[flag]).toBeUndefined();
      expect(parseBenchmarkParams(`?perf=1&${flag}=true`)[flag]).toBeUndefined();
    },
  );
});

describe('semantic cache key', () => {
  it('adds a marker per flag when on and leaves the default key unchanged', () => {
    const key = semanticRequestKey(BASE);
    expect(semanticRequestKey({ ...BASE, interleave: false, preparedCoordinates: false })).toBe(
      key,
    );
    expect(semanticRequestKey({ ...BASE, interleave: true })).toBe(`${key}|il:1`);
    expect(semanticRequestKey({ ...BASE, preparedCoordinates: true })).toBe(`${key}|cp:1`);
    expect(semanticRequestKey({ ...BASE, ...FLAGS })).toBe(`${key}|il:1|cp:1`);
  });
});

describe('worker runtime', () => {
  it('threads the flags into the dynamics request only when set', async () => {
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
    await runtime.handle({ ...base, requestId: 2, interleave: true });
    await runtime.handle({ ...base, requestId: 3, preparedCoordinates: true });
    await runtime.handle({ ...base, requestId: 4, ...FLAGS });

    expect(requests).toHaveLength(4);
    expect(requests[0]).not.toHaveProperty('interleave');
    expect(requests[0]).not.toHaveProperty('preparedCoordinates');
    expect(requests[1]?.interleave).toBe(true);
    expect(requests[1]).not.toHaveProperty('preparedCoordinates');
    expect(requests[2]?.preparedCoordinates).toBe(true);
    expect(requests[2]).not.toHaveProperty('interleave');
    expect(requests[3]?.interleave).toBe(true);
    expect(requests[3]?.preparedCoordinates).toBe(true);
  });
});

describe('CPU renderer and tile pool', () => {
  it('renders bit-identically with both flags on (CpuRenderer)', async () => {
    const pairSpy = vi.spyOn(InterleavedClassifier.prototype, 'classifyPairInto');
    try {
      const off = await stableFrame(BASE);
      expect(pairSpy).not.toHaveBeenCalled();
      const on = await stableFrame({ ...BASE, ...FLAGS });
      expect(pairSpy).toHaveBeenCalled();
      expectFramesIdentical(on, off);
    } finally {
      pairSpy.mockRestore();
    }
  });

  it('renders bit-identically in the in-process tile pool path (1 worker)', async () => {
    const off = await stableFrame(BASE);
    const { pool } = loopbackPool(1);
    const pairSpy = vi.spyOn(InterleavedClassifier.prototype, 'classifyPairInto');
    try {
      const on = await pool.classifyStable(
        { ...BASE, ...FLAGS },
        QUALITY,
        new AbortController().signal,
      );
      expect(pairSpy).toHaveBeenCalled();
      expectFramesIdentical(on, off);
    } finally {
      pairSpy.mockRestore();
      pool.dispose();
    }
  });

  it('forwards the flags to tile workers and renders bit-identically (3 workers)', async () => {
    const off = await stableFrame(BASE);
    const { pool: defaultPool, workers: defaultWorkers } = loopbackPool(3);
    await defaultPool.classifyStable(BASE, QUALITY, new AbortController().signal);
    defaultPool.dispose();
    const defaultPosts = defaultWorkers.flatMap((worker) => worker.classifyPosts);
    expect(defaultPosts.length).toBeGreaterThan(0);
    for (const post of defaultPosts) {
      expect(post).not.toHaveProperty('interleave');
      expect(post).not.toHaveProperty('preparedCoordinates');
    }

    const { pool, workers } = loopbackPool(3);
    const pairSpy = vi.spyOn(InterleavedClassifier.prototype, 'classifyPairInto');
    try {
      const on = await pool.classifyStable(
        { ...BASE, ...FLAGS },
        QUALITY,
        new AbortController().signal,
      );
      expect(pairSpy).toHaveBeenCalled();
      expectFramesIdentical(on, off);
    } finally {
      pairSpy.mockRestore();
      pool.dispose();
    }
    const posts = workers.flatMap((worker) => worker.classifyPosts);
    expect(posts.length).toBeGreaterThan(0);
    for (const post of posts) {
      expect(post.interleave).toBe(true);
      expect(post.preparedCoordinates).toBe(true);
    }
  });
});
