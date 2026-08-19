import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_VIEWPORT, type RenderQuality } from '../../../src/domain';
import { classifyRows } from '../../../src/render/classify-rows';
import { RenderCancelledError } from '../../../src/render';
import { splitRowBands } from '../../../src/render/row-bands';
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

const requestOf = (width: number, height: number) => ({
  viewport: DEFAULT_VIEWPORT,
  size: { width, height },
  quality: BALANCED,
});

class FakeTileWorker implements TileWorkerHandle {
  public readonly posts: SupervisorToTileMessage[] = [];
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

  public lastClassify(): TileClassifyMessage {
    const message = [...this.posts].reverse().find((post) => post.type === 'tile-classify');
    if (message === undefined) {
      throw new Error('expected a tile-classify post');
    }
    return message;
  }
}

const bandResult = (
  classify: TileClassifyMessage,
  fillStatus: number,
  fillPeriod = 0,
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
  };
};

const replyAll = (workers: readonly FakeTileWorker[], fillStatus: number, fillPeriod = 0): void => {
  for (const worker of workers) {
    worker.emit(bandResult(worker.lastClassify(), fillStatus, fillPeriod));
  }
};

describe('createTilePool', () => {
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

    const second = pool.classifyStable(request, BALANCED, new AbortController().signal);
    expect(factory).toHaveBeenCalledTimes(2);
    expect(workers).toHaveLength(2);
    expect(workers[0]!.posts.filter((post) => post.type === 'tile-classify')).toHaveLength(2);
    expect(workers[1]!.posts.filter((post) => post.type === 'tile-classify')).toHaveLength(2);
    replyAll(workers, 2);
    const frame = await second;
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

    expect(workers[0]!.posts.some((post) => post.type === 'tile-classify')).toBe(true);
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
    const gen1 = workers.map((worker) => worker.lastClassify());

    controller.abort();
    await expect(first).rejects.toBeInstanceOf(RenderCancelledError);

    for (const classify of gen1) {
      workers[classify.jobId]!.emit(bandResult(classify, 9, 99));
    }

    const second = pool.classifyStable(requestOf(4, 6), BALANCED, new AbortController().signal);
    const gen2 = workers.map((worker) => worker.lastClassify());
    expect(gen2[0]!.generation).not.toBe(gen1[0]!.generation);

    let secondSettled = false;
    void second.then(() => {
      secondSettled = true;
    });
    workers[1]!.emit(bandResult(gen2[1]!, 1));
    await Promise.resolve();
    expect(secondSettled).toBe(false);

    workers[0]!.emit(bandResult(gen2[0]!, 1));
    const frame = await second;
    expect(frame.status.every((value) => value === 1)).toBe(true);
    expect(frame.period.every((value) => value === 0)).toBe(true);
  });

  it('classifyStable_overlappingDrainsBeforeSecondDispatch leftover jobId 0 cannot complete the new generation', async () => {
    const workers: FakeTileWorker[] = [];
    const factory = vi.fn(() => {
      const worker = new FakeTileWorker();
      workers.push(worker);
      return worker;
    });
    const pool = createTilePool({ workerCount: 2, factory });
    const request = requestOf(4, 6);
    const bands = splitRowBands(request.size.height, 2);

    const first = pool.classifyStable(request, BALANCED, new AbortController().signal);
    const gen1 = workers.map((worker) => worker.lastClassify());
    expect(gen1.map((message) => message.jobId)).toEqual([0, 1]);

    const second = pool.classifyStable(request, BALANCED, new AbortController().signal);
    await expect(first).rejects.toBeInstanceOf(RenderCancelledError);

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
        expect(secondClassify.jobId).toBe(firstClassify.jobId);
      }
    }

    const leftover = bandResult(gen1[0]!, 7, 70);
    expect(leftover.jobId).toBe(0);
    workers[0]!.emit(leftover);

    const gen2 = workers.map((worker) => worker.lastClassify());
    workers[1]!.emit(bandResult(gen2[1]!, 1));

    let secondSettled = false;
    void second.then(() => {
      secondSettled = true;
    });
    await Promise.resolve();
    expect(secondSettled).toBe(false);

    workers[0]!.emit(bandResult(gen2[0]!, 1));
    const frame = await second;
    const leftoverStart = bands[0]!.y0 * request.size.width;
    expect(frame.status[leftoverStart]).toBe(1);
    expect(frame.period[leftoverStart]).toBe(0);
    expect(frame.status.every((value) => value === 1)).toBe(true);
  });
});
