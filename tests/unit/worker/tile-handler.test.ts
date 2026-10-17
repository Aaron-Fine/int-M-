import { describe, expect, it } from 'vitest';

import { DEFAULT_VIEWPORT, type RenderQuality } from '../../../src/domain';
import { classifyRows } from '../../../src/render/classify-rows';
import { RenderCancelledError } from '../../../src/render';
import { packStatusPeriod } from '../../../src/render/packed-semantic';
import { createTileHandler } from '../../../src/worker/tile-handler';
import type {
  SupervisorToTileMessage,
  TileClassifyMessage,
  TileToSupervisorMessage,
} from '../../../src/worker/tile-protocol';

const BALANCED: RenderQuality = { maxIterations: 512, maxPeriod: 32, coarseStride: 8 };

const bandViews = (y0: number, y1: number, width: number) => ({
  y0,
  y1,
  packedStatusPeriod: new Uint32Array((y1 - y0) * width),
  smoothIterationOrMultiplierMagnitude: new Float64Array((y1 - y0) * width),
  multiplierAngle: new Float64Array((y1 - y0) * width),
});

const classifyMessage = (overrides: Partial<TileClassifyMessage> = {}): TileClassifyMessage => ({
  type: 'tile-classify',
  generation: 3,
  jobId: 1,
  viewport: DEFAULT_VIEWPORT,
  size: { width: 8, height: 11 },
  y0: 3,
  y1: 7,
  quality: BALANCED,
  bandOutput: bandViews(3, 7, 8),
  outputRevision: 'poc-packed-1.0.0',
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
  it('handleTileClassify_passesRequestAndBandViewsInPositionalOrder', async () => {
    const host = recordingHost();
    const calls: unknown[][] = [];
    const handle = createTileHandler(host, {
      classifyRows: (...args) => {
        calls.push(args);
        const output = args[6] as ReturnType<typeof bandViews>;
        return Promise.resolve({
          y0: 3,
          y1: 7,
          packedStatusPeriod: output.packedStatusPeriod,
          smoothIterationOrMultiplierMagnitude: output.smoothIterationOrMultiplierMagnitude,
          multiplierAngle: output.multiplierAngle,
          timing: { classifyMs: 1, yieldWaitMs: 0, yieldCount: 0 },
        });
      },
    });
    const message = classifyMessage();

    await handle(message);

    expect(calls).toHaveLength(1);
    const [request, quality, stride, y0, y1, , output] = calls[0]!;
    expect(request).toEqual({ viewport: message.viewport, size: message.size, quality: BALANCED });
    expect(quality).toBe(BALANCED);
    expect(stride).toBe(1);
    expect(y0).toBe(3);
    expect(y1).toBe(7);
    expect(output).toEqual({
      y0: undefined,
      y1: undefined,
      packedStatusPeriod: message.bandOutput.packedStatusPeriod,
      smoothIterationOrMultiplierMagnitude: message.bandOutput.smoothIterationOrMultiplierMagnitude,
      multiplierAngle: message.bandOutput.multiplierAngle,
    });
    expect(calls[0]).toHaveLength(7);
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
      packedStatusPeriod: expected.packedStatusPeriod,
      smoothIterationOrMultiplierMagnitude: expected.smoothIterationOrMultiplierMagnitude,
      multiplierAngle: expected.multiplierAngle,
      outputRevision: 'poc-packed-1.0.0',
      yieldCount: expected.timing.yieldCount,
    });
    expect(posted.message.type).toBe('tile-result');
    if (posted.message.type === 'tile-result') {
      expect(posted.message.yieldWaitMs).toBeGreaterThanOrEqual(0);
    }
    expect(posted.message.type).toBe('tile-result');
    if (posted.message.type === 'tile-result') {
      expect(posted.transfer).toEqual([
        posted.message.packedStatusPeriod.buffer,
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

describe('tile-handler zero-copy band output', () => {
  it('classifies into the provided band views and returns the same buffers', async () => {
    const host = recordingHost();
    const handle = createTileHandler(host);
    const width = 8;
    const bandOutput = {
      y0: 3,
      y1: 7,
      packedStatusPeriod: new Uint32Array(4 * width),
      smoothIterationOrMultiplierMagnitude: new Float64Array(4 * width),
      multiplierAngle: new Float64Array(4 * width),
    };
    for (let index = 0; index < bandOutput.packedStatusPeriod.length; index += 1) {
      bandOutput.packedStatusPeriod[index] = packStatusPeriod(0, 0);
    }

    await handle(classifyMessage({ bandOutput, outputRevision: 'poc-packed-1.0.0' }));

    const posted = host.posts[0]!;
    if (posted.message.type !== 'tile-result') throw new Error('expected tile-result');
    // The worker classifies into the supervisor's views: identity, not copies.
    expect(posted.message.packedStatusPeriod).toBe(bandOutput.packedStatusPeriod);
    expect(posted.message.smoothIterationOrMultiplierMagnitude).toBe(
      bandOutput.smoothIterationOrMultiplierMagnitude,
    );
    expect(posted.message.multiplierAngle).toBe(bandOutput.multiplierAngle);
    // Every pixel was rewritten: no zero word (reserved code) survives.
    expect(bandOutput.packedStatusPeriod.every((word) => word !== 0)).toBe(true);
  });
});
