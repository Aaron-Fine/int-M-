import { describe, expect, it } from 'vitest';

import { DEFAULT_VIEWPORT, type ClassifierMode, type RenderQuality } from '../../../src/domain';
import { classifyRows } from '../../../src/render/classify-rows';
import { RenderCancelledError } from '../../../src/render';
import { createTileHandler } from '../../../src/worker/tile-handler';
import type {
  SupervisorToTileMessage,
  TileClassifyMessage,
  TileToSupervisorMessage,
} from '../../../src/worker/tile-protocol';

const BALANCED: RenderQuality = { maxIterations: 512, maxPeriod: 32, coarseStride: 8 };

const classifyMessage = (overrides: Partial<TileClassifyMessage> = {}): TileClassifyMessage => ({
  type: 'tile-classify',
  generation: 3,
  jobId: 1,
  viewport: DEFAULT_VIEWPORT,
  size: { width: 8, height: 11 },
  y0: 3,
  y1: 7,
  quality: BALANCED,
  ...overrides,
});

interface RecordedPost {
  readonly message: TileToSupervisorMessage;
  readonly transfer: readonly ArrayBuffer[];
}

const recordingHost = (): {
  posts: RecordedPost[];
  postMessage: (message: TileToSupervisorMessage, transfer?: readonly ArrayBuffer[]) => void;
} => {
  const posts: RecordedPost[] = [];
  return {
    posts,
    postMessage(message, transfer = []) {
      posts.push({ message, transfer: [...transfer] });
    },
  };
};

describe('tile-handler', () => {
  it('handleTileClassify_forwardsClassifierModeToClassifyRows', async () => {
    const host = recordingHost();
    const seenModes: (ClassifierMode | undefined)[] = [];
    const handle = createTileHandler(host, {
      classifyRows: async (_request, _quality, _stride, _y0, _y1, _signal, classifierMode) => {
        seenModes.push(classifierMode);
        return {
          status: new Uint8Array(4 * 8),
          period: new Uint32Array(4 * 8),
          smoothIterationOrMultiplierMagnitude: new Float64Array(4 * 8),
          multiplierAngle: new Float64Array(4 * 8),
          timing: { classifyMs: 1, yieldWaitMs: 0, yieldCount: 0 },
        };
      },
    });

    await handle(classifyMessage({ classifierMode: 'checkpoint' }));
    await handle(classifyMessage({ generation: 4, jobId: 2 }));

    expect(seenModes).toEqual(['checkpoint', undefined]);
  });

  it('handleTileClassify_postsTransferredBandForAbsoluteRows', async () => {
    const host = recordingHost();
    const handle = createTileHandler(host);
    const message = classifyMessage();

    await handle(message);

    const expected = await classifyRows(
      { viewport: message.viewport, size: message.size, quality: message.quality },
      message.quality,
      1,
      message.y0,
      message.y1,
      new AbortController().signal,
    );

    expect(host.posts).toHaveLength(1);
    const posted = host.posts[0]!;
    expect(posted.message).toMatchObject({
      type: 'tile-result',
      generation: message.generation,
      jobId: message.jobId,
      y0: message.y0,
      y1: message.y1,
      status: expected.status,
      period: expected.period,
      smoothIterationOrMultiplierMagnitude: expected.smoothIterationOrMultiplierMagnitude,
      multiplierAngle: expected.multiplierAngle,
      yieldCount: expected.timing.yieldCount,
    });
    expect(posted.message.type).toBe('tile-result');
    if (posted.message.type === 'tile-result') {
      expect(posted.message.yieldWaitMs).toBeGreaterThanOrEqual(0);
    }
    expect(posted.message.type).toBe('tile-result');
    if (posted.message.type === 'tile-result') {
      expect(posted.transfer).toEqual([
        posted.message.status.buffer,
        posted.message.period.buffer,
        posted.message.smoothIterationOrMultiplierMagnitude.buffer,
        posted.message.multiplierAngle.buffer,
      ]);
    }
  });

  it('handleTileCancel_suppressesResultForThatGeneration', async () => {
    const host = recordingHost();
    let seenSignal: AbortSignal | undefined;
    const handle = createTileHandler(host, {
      classifyRows: async (_request, _quality, _stride, _y0, _y1, signal) => {
        seenSignal = signal;
        await new Promise<never>((_resolve, reject) => {
          if (signal.aborted) {
            reject(new RenderCancelledError());
            return;
          }
          signal.addEventListener(
            'abort',
            () => {
              reject(new RenderCancelledError());
            },
            { once: true },
          );
        });
        throw new Error('unreachable');
      },
    });

    const message = classifyMessage({ generation: 9, jobId: 0 });
    const work = handle(message);
    await Promise.resolve();
    const cancel: SupervisorToTileMessage = { type: 'tile-cancel', generation: 9 };
    await handle(cancel);
    await work;

    expect(seenSignal?.aborted).toBe(true);
    expect(host.posts.map((post) => post.message)).toEqual([
      { type: 'tile-cancelled', generation: 9, jobId: 0 },
    ]);
  });

  it('handleTileClassify_postsTileErrorOnThrow', async () => {
    const host = recordingHost();
    const handle = createTileHandler(host, {
      classifyRows: () => Promise.reject(new Error('classifier exploded')),
    });
    const message = classifyMessage({ generation: 2, jobId: 4 });

    await handle(message);

    expect(host.posts.map((post) => post.message)).toEqual([
      {
        type: 'tile-error',
        generation: 2,
        jobId: 4,
        message: 'classifier exploded',
      },
    ]);
  });
});
