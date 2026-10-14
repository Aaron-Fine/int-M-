import { describe, expect, it } from 'vitest';

import { DEFAULT_VIEWPORT, type ClassifierMode, type RenderQuality } from '../../../src/domain';
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
      classifyRows: (
        _request,
        _quality,
        _stride,
        _y0,
        _y1,
        _signal,
        classifierMode,
        _yieldMechanism,
        output,
      ) => {
        seenModes.push(classifierMode);
        return Promise.resolve({
          y0: 3,
          y1: 7,
          packedStatusPeriod: output?.packedStatusPeriod ?? new Uint32Array(4 * 8),
          smoothIterationOrMultiplierMagnitude:
            output?.smoothIterationOrMultiplierMagnitude ?? new Float64Array(4 * 8),
          multiplierAngle: output?.multiplierAngle ?? new Float64Array(4 * 8),
          timing: { classifyMs: 1, yieldWaitMs: 0, yieldCount: 0 },
        });
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
