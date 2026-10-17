import { describe, expect, it } from 'vitest';

import type { RenderQuality, Viewport } from '../../../src/domain';
import {
  RenderCancelledError,
  type DynamicsRenderRequest,
  type SemanticBand,
  type SemanticFrame,
  type TilePool,
} from '../../../src/render';
import { classifyRows } from '../../../src/render/classify-rows';
import { createTileHandler } from '../../../src/worker/tile-handler';
import { createTilePool } from '../../../src/worker/tile-pool';
import type {
  SupervisorToTileMessage,
  TileClassifyMessage,
  TileMessageEvent,
  TileWorkerHandle,
} from '../../../src/worker/tile-protocol';

const BALANCED: RenderQuality = { maxIterations: 512, maxPeriod: 32, coarseStride: 8 };

interface NamedView {
  readonly name: string;
  readonly viewport: Viewport;
  readonly size: { readonly width: number; readonly height: number };
}

/**
 * Views chosen so the tile split is exercised on and off the real axis:
 * a full on-axis set, an on-axis period-2 bulb, an asymmetric straddle with
 * exactly representable center.im, and a view that does not touch the axis.
 */
const VIEWS: readonly NamedView[] = [
  {
    name: 'full set (default view)',
    viewport: { center: { re: -0.75, im: 0 }, spanY: 2.5 },
    size: { width: 96, height: 64 },
  },
  {
    name: 'period-2 bulb region on the axis',
    viewport: { center: { re: -1, im: 0 }, spanY: 0.3 },
    size: { width: 96, height: 64 },
  },
  {
    name: 'straddles the axis asymmetrically',
    viewport: { center: { re: -0.75, im: 3 / 128 }, spanY: 0.5 },
    size: { width: 96, height: 64 },
  },
  {
    name: 'does not contain the axis',
    viewport: { center: { re: -0.75, im: 1 }, spanY: 0.5 },
    size: { width: 96, height: 64 },
  },
];

/** First index where two typed arrays differ bitwise (Object.is), or -1. */
const firstMismatch = (a: ArrayLike<number>, b: ArrayLike<number>): number => {
  if (a.length !== b.length) return 0;
  for (let index = 0; index < a.length; index += 1) {
    if (!Object.is(a[index], b[index])) return index;
  }
  return -1;
};

/** In-process stand-in for a tile worker: runs the production tile handler. */
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

/** Concatenates a frame's bands into one full-height band, in row order. */
const flatten = (frame: SemanticFrame, size: { width: number; height: number }): SemanticBand => {
  const length = size.width * size.height;
  const out = {
    y0: 0,
    y1: size.height,
    packedStatusPeriod: new Uint32Array(length),
    smoothIterationOrMultiplierMagnitude: new Float64Array(length),
    multiplierAngle: new Float64Array(length),
  };
  for (const band of frame.bands) {
    const offset = band.y0 * size.width;
    out.packedStatusPeriod.set(band.packedStatusPeriod, offset);
    out.smoothIterationOrMultiplierMagnitude.set(band.smoothIterationOrMultiplierMagnitude, offset);
    out.multiplierAngle.set(band.multiplierAngle, offset);
  }
  return out;
};

const expectBandsIdentical = (actual: SemanticBand, expected: SemanticBand): void => {
  expect(actual.y0).toBe(expected.y0);
  expect(actual.y1).toBe(expected.y1);
  expect(firstMismatch(actual.packedStatusPeriod, expected.packedStatusPeriod)).toBe(-1);
  expect(
    firstMismatch(
      actual.smoothIterationOrMultiplierMagnitude,
      expected.smoothIterationOrMultiplierMagnitude,
    ),
  ).toBe(-1);
  expect(firstMismatch(actual.multiplierAngle, expected.multiplierAngle)).toBe(-1);
};

describe('tile pool: parity with direct classification', () => {
  for (const view of VIEWS) {
    for (const workerCount of [1, 2, 3]) {
      // One worker classifies in process (no bands posted); two and three
      // exercise band split, dispatch, and assembly.
      const path = workerCount === 1 ? '1worker_inProcess' : `${workerCount}workers_bands`;
      it(`tilePool_matchesDirectClassification_${path}_${view.name}`, async () => {
        const request: DynamicsRenderRequest = {
          viewport: view.viewport,
          size: view.size,
          quality: BALANCED,
        };
        const signal = new AbortController().signal;
        const direct = await classifyRows(request, BALANCED, 1, 0, view.size.height, signal);
        const { pool, workers } = loopbackPool(workerCount);
        const frame = await pool.classifyStable(request, BALANCED, signal);
        pool.dispose();

        expectBandsIdentical(flatten(frame, view.size), {
          y0: 0,
          y1: view.size.height,
          packedStatusPeriod: direct.packedStatusPeriod,
          smoothIterationOrMultiplierMagnitude: direct.smoothIterationOrMultiplierMagnitude,
          multiplierAngle: direct.multiplierAngle,
        });
        // With workers, every row is dispatched to exactly one band (one worker
        // count of 1 classifies in-process and posts nothing).
        if (workerCount > 1) {
          const posts = workers.flatMap((worker) => worker.classifyPosts);
          expect(posts.reduce((sum, post) => sum + post.y1 - post.y0, 0)).toBe(view.size.height);
        }
      });
    }
  }
});

describe('tile pool: cancellation', () => {
  it.each([2, 3])(
    'tilePool_cancelMidRender_%sworkers_rejectsAndDeliversNoFrame',
    async (workerCount) => {
      const view = VIEWS[0]!;
      const controller = new AbortController();
      const workers: LoopbackTileWorker[] = [];
      const pool = createTilePool({
        workerCount,
        factory: () => {
          const worker = new LoopbackTileWorker();
          const original = worker.postMessage.bind(worker);
          // Abort as soon as the first band is dispatched, so the render is
          // cancelled while tiles are still in flight.
          worker.postMessage = (message: SupervisorToTileMessage): void => {
            original(message);
            if (message.type === 'tile-classify') controller.abort();
          };
          workers.push(worker);
          return worker;
        },
      });
      let delivered = 0;
      const frame = pool
        .classifyStable(
          { viewport: view.viewport, size: view.size, quality: BALANCED },
          BALANCED,
          controller.signal,
        )
        .then((result) => {
          delivered += 1;
          return result;
        });
      await expect(frame).rejects.toBeInstanceOf(RenderCancelledError);
      // Let the loopback workers reply; late results must not deliver a frame.
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(delivered).toBe(0);
      expect(workers.length).toBe(workerCount);
      expect(workers.flatMap((worker) => worker.classifyPosts).length).toBeGreaterThan(0);
      pool.dispose();
    },
  );
});
