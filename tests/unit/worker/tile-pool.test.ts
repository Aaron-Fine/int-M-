import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_VIEWPORT, type RenderQuality } from '../../../src/domain';
import { classifyRows } from '../../../src/render/classify-rows';
import { RenderCancelledError } from '../../../src/render';
import {
  orderRowBandsForDispatch,
  orderRowBandsCenterOut,
  splitRowBands,
} from '../../../src/render/row-bands';
import { createTilePool } from '../../../src/worker/tile-pool';
import type {
  SupervisorToTileMessage,
  TileClassifyMessage,
  TileMessageEvent,
  TileResultMessage,
  TileToSupervisorMessage,
  TileWorkerHandle,
} from '../../../src/worker/tile-protocol';

const BALANCED: RenderQuality = { maxIterations: 512, maxPeriod: 32, coarseStride: 8 };
const SMALL_QUALITY: RenderQuality = { maxIterations: 32, maxPeriod: 4, coarseStride: 8 };

const requestOf = (width: number, height: number, bandOrder?: 'legacy') => ({
  viewport: DEFAULT_VIEWPORT,
  size: { width, height },
  quality: BALANCED,
  ...(bandOrder === undefined ? {} : { bandOrder }),
});

class FakeTileWorker implements TileWorkerHandle {
  public readonly posts: SupervisorToTileMessage[] = [];
  /** Result keys (generation:jobId) already answered, across all jobs. */
  public readonly answered = new Set<string>();
  public terminated = false;
  readonly #listeners = new Set<(event: TileMessageEvent) => void>();

  public postMessage(message: SupervisorToTileMessage): void {
    this.posts.push(message);
  }

  public addEventListener(_type: 'message', listener: (event: TileMessageEvent) => void): void {
    this.#listeners.add(listener);
  }

  public removeEventListener(_type: 'message', listener: (event: TileMessageEvent) => void): void {
    this.#listeners.delete(listener);
  }

  public terminate(): void {
    this.terminated = true;
  }

  public emit(message: TileToSupervisorMessage): void {
    const event: TileMessageEvent = { data: message };
    for (const listener of this.#listeners) listener(event);
  }

  /** Answers a classify exactly once; guards the test against double answers. */
  public emitResult(
    classify: TileClassifyMessage,
    fillStatus: number,
    fillPeriod = 0,
    yieldWaitMs = 0,
    yieldCount = 0,
  ): void {
    const key = `${classify.generation}:${classify.jobId}`;
    if (this.answered.has(key)) throw new Error(`double answer for ${key}`);
    this.answered.add(key);
    this.emit(bandResult(classify, fillStatus, fillPeriod, yieldWaitMs, yieldCount));
  }

  public lastClassify(): TileClassifyMessage {
    const message = [...this.posts].reverse().find((post) => post.type === 'tile-classify');
    if (message === undefined) {
      throw new Error('expected a tile-classify post');
    }
    return message;
  }
}

const classifyPosts = (worker: FakeTileWorker): TileClassifyMessage[] =>
  worker.posts.filter((post): post is TileClassifyMessage => post.type === 'tile-classify');

const bandResult = (
  classify: TileClassifyMessage,
  fillStatus: number,
  fillPeriod = 0,
  yieldWaitMs = 0,
  yieldCount = 0,
): TileResultMessage => {
  const length = (classify.y1 - classify.y0) * classify.size.width;
  return {
    type: 'tile-result',
    generation: classify.generation,
    jobId: classify.jobId,
    y0: classify.y0,
    y1: classify.y1,
    status: new Uint8Array(length).fill(fillStatus),
    period: new Uint32Array(length).fill(fillPeriod),
    smoothIterationOrMultiplierMagnitude: new Float64Array(length),
    multiplierAngle: new Float64Array(length),
    yieldWaitMs,
    yieldCount,
  };
};

const cancelled = (classify: TileClassifyMessage) => ({
  type: 'tile-cancelled' as const,
  generation: classify.generation,
  jobId: classify.jobId,
});

/** Answers the (unique) outstanding classify with the given job id. */
const answerJobId = (
  workers: readonly FakeTileWorker[],
  jobId: number,
  fillStatus: number,
  fillPeriod = 0,
  yieldWaitMs = 0,
  yieldCount = 0,
): void => {
  for (const worker of workers) {
    const post = classifyPosts(worker).find(
      (candidate) =>
        candidate.jobId === jobId &&
        !worker.answered.has(`${candidate.generation}:${candidate.jobId}`),
    );
    if (post !== undefined) {
      worker.emitResult(post, fillStatus, fillPeriod, yieldWaitMs, yieldCount);
      return;
    }
  }
  throw new Error(`no outstanding classify for jobId ${jobId}`);
};

/**
 * Answers every outstanding tile-classify post exactly once. Answering a band
 * posts the next queued band, so the loop re-scans until the queue drains.
 */
const replyAll = (workers: readonly FakeTileWorker[], fillStatus: number, fillPeriod = 0): void => {
  for (let guard = 0; guard < 256; guard += 1) {
    const pending = workers.flatMap((worker) =>
      classifyPosts(worker).filter(
        (post) => !worker.answered.has(`${post.generation}:${post.jobId}`),
      ),
    );
    const next = pending[0];
    if (next === undefined) return;
    answerJobId(workers, next.jobId, fillStatus, fillPeriod);
  }
  throw new Error('replyAll did not converge');
};

describe('orderRowBandsCenterOut', () => {
  it('orders six unit bands from the center outward with lower-index tie-breaks', () => {
    const bands = splitRowBands(6, 6);
    expect(orderRowBandsCenterOut(bands, 6)).toEqual([2, 3, 1, 4, 0, 5]);
  });

  it('is a permutation covering every band exactly once', () => {
    const bands = splitRowBands(641, 16);
    const order = orderRowBandsCenterOut(bands, 641);
    expect([...order].sort((a, b) => a - b)).toEqual(bands.map((_, index) => index));
  });

  it('keeps top-to-bottom order for a single band', () => {
    expect(orderRowBandsCenterOut([{ y0: 0, y1: 5 }], 5)).toEqual([0]);
  });
});

describe('orderRowBandsForDispatch', () => {
  it('dispatches the first wave center-out and the remainder in row order', () => {
    const bands = splitRowBands(6, 6);
    expect(orderRowBandsForDispatch(bands, 6, 2)).toEqual([2, 3, 0, 1, 4, 5]);
  });

  it('keeps row order when the wave covers every band', () => {
    const bands = splitRowBands(6, 6);
    expect(orderRowBandsForDispatch(bands, 6, 6)).toEqual([2, 3, 1, 4, 0, 5]);
  });

  it('is a permutation covering every band exactly once', () => {
    const bands = splitRowBands(641, 16);
    const order = orderRowBandsForDispatch(bands, 641, 4);
    expect([...order].sort((a, b) => a - b)).toEqual(bands.map((_, index) => index));
    expect(order.slice(0, 4)).toEqual(orderRowBandsCenterOut(bands, 641).slice(0, 4));
  });
});

describe('createTilePool', () => {
  it('dispatches the first wave center-out and continues outward as workers free up', async () => {
    const workers: FakeTileWorker[] = [];
    const pool = createTilePool({
      workerCount: 2,
      factory: () => {
        const worker = new FakeTileWorker();
        workers.push(worker);
        return worker;
      },
    });
    // height 6, 2 workers -> 6 unit bands; dispatch order [2,3,0,1,4,5]
    // (center-out first wave, row-ordered remainder).
    const pending = pool.classifyStable(requestOf(4, 6), BALANCED, new AbortController().signal);

    expect(classifyPosts(workers[0]!).map((post) => post.jobId)).toEqual([2]);
    expect(classifyPosts(workers[1]!).map((post) => post.jobId)).toEqual([3]);

    answerJobId(workers, 2, 1);
    answerJobId(workers, 3, 1);
    expect(classifyPosts(workers[0]!).map((post) => post.jobId)).toEqual([2, 0]);
    expect(classifyPosts(workers[1]!).map((post) => post.jobId)).toEqual([3, 1]);

    answerJobId(workers, 0, 1);
    answerJobId(workers, 1, 1);
    answerJobId(workers, 4, 1);
    answerJobId(workers, 5, 1);
    const frame = await pending;
    expect(classifyPosts(workers[0]!).map((post) => post.jobId)).toEqual([2, 0, 4]);
    expect(classifyPosts(workers[1]!).map((post) => post.jobId)).toEqual([3, 1, 5]);
    expect(frame.status.every((value) => value === 1)).toBe(true);
  });

  it('dispatches top-to-bottom when the legacy diagnostic order is requested', async () => {
    const workers: FakeTileWorker[] = [];
    const pool = createTilePool({
      workerCount: 2,
      factory: () => {
        const worker = new FakeTileWorker();
        workers.push(worker);
        return worker;
      },
    });
    const pending = pool.classifyStable(
      requestOf(4, 6, 'legacy'),
      BALANCED,
      new AbortController().signal,
    );

    expect(classifyPosts(workers[0]!).map((post) => post.jobId)).toEqual([0]);
    expect(classifyPosts(workers[1]!).map((post) => post.jobId)).toEqual([1]);
    for (const jobId of [0, 1, 2, 3, 4, 5]) {
      answerJobId(workers, jobId, 1);
    }
    await pending;
    expect(classifyPosts(workers[0]!).map((post) => post.jobId)).toEqual([0, 2, 4]);
    expect(classifyPosts(workers[1]!).map((post) => post.jobId)).toEqual([1, 3, 5]);
  });

  it('reports per-band completion elapsed on the merged frame timing', async () => {
    const workers: FakeTileWorker[] = [];
    const pool = createTilePool({
      workerCount: 2,
      factory: () => {
        const worker = new FakeTileWorker();
        workers.push(worker);
        return worker;
      },
    });
    const pending = pool.classifyStable(requestOf(4, 6), BALANCED, new AbortController().signal);
    replyAll(workers, 1);
    const frame = await pending;
    expect(frame.timing?.bandsElapsedMs).toHaveLength(6);
    for (const elapsed of frame.timing?.bandsElapsedMs ?? []) {
      expect(elapsed).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(elapsed)).toBe(true);
    }
  });

  it('createTilePool_tiled_threadsClassifierModeIntoTileMessages', async () => {
    const workers: FakeTileWorker[] = [];
    const pool = createTilePool({
      workerCount: 2,
      factory: () => {
        const worker = new FakeTileWorker();
        workers.push(worker);
        return worker;
      },
    });
    const request = requestOf(6, 4);

    const settled = pool
      .classifyStable(request, SMALL_QUALITY, new AbortController().signal, 'checkpoint')
      .then(() => undefined);
    await Promise.resolve();
    replyAll(workers, 1);
    await settled;

    const withMode = workers.flatMap((worker) => classifyPosts(worker));
    expect(withMode.length).toBeGreaterThan(0);
    for (const message of withMode) {
      expect(message.classifierMode).toBe('checkpoint');
    }
  });

  it('createTilePool_tiled_omitsClassifierModeByDefault', async () => {
    const workers: FakeTileWorker[] = [];
    const pool = createTilePool({
      workerCount: 2,
      factory: () => {
        const worker = new FakeTileWorker();
        workers.push(worker);
        return worker;
      },
    });
    const request = requestOf(6, 4);

    const settled = pool
      .classifyStable(request, SMALL_QUALITY, new AbortController().signal)
      .then(() => undefined);
    await Promise.resolve();
    replyAll(workers, 1);
    await settled;

    const messages = workers.flatMap((worker) => classifyPosts(worker));
    expect(messages.length).toBeGreaterThan(0);
    for (const message of messages) {
      expect(message).not.toHaveProperty('classifierMode');
    }
  });

  it('createTilePool_workerCount1_neverCallsFactory', async () => {
    const factory = vi.fn((): TileWorkerHandle => {
      throw new Error('factory must not be called');
    });
    const pool = createTilePool({ workerCount: 1, factory });
    const request = {
      viewport: DEFAULT_VIEWPORT,
      size: { width: 6, height: 4 },
      quality: SMALL_QUALITY,
    };

    const frame = await pool.classifyStable(request, SMALL_QUALITY, new AbortController().signal);
    const expected = await classifyRows(
      request,
      SMALL_QUALITY,
      1,
      0,
      request.size.height,
      new AbortController().signal,
    );

    expect(factory).not.toHaveBeenCalled();
    expect(pool.size).toBe(1);
    expect(frame.status).toEqual(expected.status);
    expect(frame.period).toEqual(expected.period);
    expect(frame.smoothIterationOrMultiplierMagnitude).toEqual(
      expected.smoothIterationOrMultiplierMagnitude,
    );
    expect(frame.multiplierAngle).toEqual(expected.multiplierAngle);
    expect(frame.stage).toBe('stable');
    expect(frame.sampleStride).toBe(1);
  });

  it('createTilePool_reusesWorkersAcrossTwoClassifyStableCalls', async () => {
    const workers: FakeTileWorker[] = [];
    const factory = vi.fn(() => {
      const worker = new FakeTileWorker();
      workers.push(worker);
      return worker;
    });
    const pool = createTilePool({ workerCount: 2, factory });
    const request = requestOf(4, 6);

    const first = pool.classifyStable(request, BALANCED, new AbortController().signal);
    expect(factory).toHaveBeenCalledTimes(2);
    replyAll(workers, 1);
    await first;
    const totalPostsAfterFirst = workers.reduce(
      (sum, worker) => sum + classifyPosts(worker).length,
      0,
    );
    expect(totalPostsAfterFirst).toBe(6);

    const second = pool.classifyStable(request, BALANCED, new AbortController().signal);
    expect(factory).toHaveBeenCalledTimes(2);
    expect(workers).toHaveLength(2);
    replyAll(workers, 2);
    const frame = await second;
    expect(workers.reduce((sum, worker) => sum + classifyPosts(worker).length, 0)).toBe(12);
    expect(frame.status[0]).toBe(2);
  });

  it('classifyStable_rejectsWhenSignalAbortsEvenIfChildrenNeverReply', async () => {
    const workers: FakeTileWorker[] = [];
    const controller = new AbortController();
    const factory = vi.fn(() => {
      const worker = new FakeTileWorker();
      const original = worker.postMessage.bind(worker);
      worker.postMessage = (message: SupervisorToTileMessage): void => {
        original(message);
        if (message.type === 'tile-classify') controller.abort();
      };
      workers.push(worker);
      return worker;
    });
    const pool = createTilePool({ workerCount: 2, factory });

    await expect(
      pool.classifyStable(requestOf(4, 6), BALANCED, controller.signal),
    ).rejects.toBeInstanceOf(RenderCancelledError);

    expect(classifyPosts(workers[0]!).length).toBeGreaterThan(0);
    expect(workers.some((worker) => worker.posts.some((post) => post.type === 'tile-cancel'))).toBe(
      true,
    );
  });

  it('classifyStable_lateResultAfterAbortDoesNotResolveOrCorruptNextJob', async () => {
    const workers: FakeTileWorker[] = [];
    const factory = vi.fn(() => {
      const worker = new FakeTileWorker();
      workers.push(worker);
      return worker;
    });
    const pool = createTilePool({ workerCount: 2, factory });
    const controller = new AbortController();
    const first = pool.classifyStable(requestOf(4, 6), BALANCED, controller.signal);
    const gen1 = workers.map((worker) => classifyPosts(worker)[0]!);

    controller.abort();
    await expect(first).rejects.toBeInstanceOf(RenderCancelledError);

    for (const classify of gen1) {
      workers[classify.jobId % workers.length]!.emit(bandResult(classify, 9, 99));
    }

    const second = pool.classifyStable(requestOf(4, 6), BALANCED, new AbortController().signal);
    const gen2 = workers.map((worker) => classifyPosts(worker).at(-1)!);
    expect(gen2[0]!.generation).not.toBe(gen1[0]!.generation);

    let secondSettled = false;
    void second.then(() => {
      secondSettled = true;
    });
    workers[1]!.emit(bandResult(gen2[1]!, 1));
    await Promise.resolve();
    expect(secondSettled).toBe(false);

    workers[0]!.emit(bandResult(gen2[0]!, 1));
    replyAll(workers, 1);
    const frame = await second;
    expect(frame.status.every((value) => value === 1)).toBe(true);
    expect(frame.period.every((value) => value === 0)).toBe(true);
  });

  it('classifyStable_overlappingDrainsBeforeSecondDispatch leftover job cannot complete the new generation', async () => {
    const workers: FakeTileWorker[] = [];
    const factory = vi.fn(() => {
      const worker = new FakeTileWorker();
      workers.push(worker);
      return worker;
    });
    const pool = createTilePool({ workerCount: 2, factory });
    const request = requestOf(4, 6);
    const bands = splitRowBands(request.size.height, 6);

    const first = pool.classifyStable(request, BALANCED, new AbortController().signal);
    const gen1 = workers.map((worker) => classifyPosts(worker)[0]!);
    expect(gen1.map((message) => message.jobId)).toEqual([2, 3]);

    const second = pool.classifyStable(request, BALANCED, new AbortController().signal);
    await expect(first).rejects.toBeInstanceOf(RenderCancelledError);
    expect(classifyPosts(workers[0]!)).toHaveLength(1);

    for (const classify of gen1) {
      workers[classify.jobId % workers.length]!.emit(cancelled(classify));
    }

    await vi.waitFor(() => {
      expect(classifyPosts(workers[0]!)).toHaveLength(2);
    });

    for (const worker of workers) {
      const types = worker.posts.map((post) => post.type);
      expect(types).toEqual(['tile-classify', 'tile-cancel', 'tile-classify']);
      const [firstClassify, cancel, secondClassify] = worker.posts;
      expect(firstClassify?.type).toBe('tile-classify');
      expect(cancel?.type).toBe('tile-cancel');
      expect(secondClassify?.type).toBe('tile-classify');
      if (
        firstClassify?.type === 'tile-classify' &&
        cancel?.type === 'tile-cancel' &&
        secondClassify?.type === 'tile-classify'
      ) {
        expect(cancel.generation).toBe(firstClassify.generation);
        expect(secondClassify.generation).not.toBe(firstClassify.generation);
      }
    }

    const leftover = bandResult(gen1[0]!, 7, 70);
    expect(leftover.jobId).toBe(2);
    workers[0]!.emit(leftover);

    const gen2 = workers.map((worker) => classifyPosts(worker).at(-1)!);
    workers[1]!.emit(bandResult(gen2[1]!, 1));

    let secondSettled = false;
    void second.then(() => {
      secondSettled = true;
    });
    await Promise.resolve();
    expect(secondSettled).toBe(false);

    workers[0]!.emit(bandResult(gen2[0]!, 1));
    replyAll(workers, 1);
    const frame = await second;
    const leftoverStart = bands[2]!.y0 * request.size.width;
    expect(frame.status[leftoverStart]).toBe(1);
    expect(frame.period[leftoverStart]).toBe(0);
    expect(frame.status.every((value) => value === 1)).toBe(true);
  });

  it('does not dispatch the next classify until children settle', async () => {
    const workers: FakeTileWorker[] = [];
    const factory = vi.fn(() => {
      const worker = new FakeTileWorker();
      workers.push(worker);
      return worker;
    });
    const pool = createTilePool({ workerCount: 2, factory });
    const first = pool.classifyStable(requestOf(4, 6), BALANCED, new AbortController().signal);
    const gen1 = workers.map((worker) => classifyPosts(worker)[0]!);
    const second = pool.classifyStable(requestOf(4, 6), BALANCED, new AbortController().signal);
    await expect(first).rejects.toBeInstanceOf(RenderCancelledError);
    expect(classifyPosts(workers[0]!)).toHaveLength(1);

    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
    expect(classifyPosts(workers[0]!)).toHaveLength(1);

    for (const classify of gen1) {
      workers[classify.jobId % workers.length]!.emit(cancelled(classify));
    }
    await vi.waitFor(() => {
      expect(classifyPosts(workers[0]!)).toHaveLength(2);
    });
    replyAll(workers, 1);
    await second;
  });

  it('aggregates child yield timing onto the merged frame', async () => {
    const workers: FakeTileWorker[] = [];
    const factory = vi.fn(() => {
      const worker = new FakeTileWorker();
      workers.push(worker);
      return worker;
    });
    const pool = createTilePool({ workerCount: 2, factory });
    const pending = pool.classifyStable(requestOf(4, 6), BALANCED, new AbortController().signal);
    const gen = workers.map((worker) => classifyPosts(worker)[0]!);
    answerJobId(workers, gen[0]!.jobId, 1, 0, 4, 3);
    answerJobId(workers, gen[1]!.jobId, 1, 0, 10, 5);
    for (const jobId of [0, 1, 4, 5]) {
      answerJobId(workers, jobId, 1);
    }
    const frame = await pending;
    expect(frame.timing?.yieldCount).toBe(8);
    expect(frame.timing?.yieldWaitMs).toBe(10);
  });
});
