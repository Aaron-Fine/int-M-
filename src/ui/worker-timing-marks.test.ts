import { describe, expect, it, vi } from 'vitest';

import { recordWorkerTimingMarks } from './worker-timing-marks';
import type { FrameMessage } from '../worker/protocol';

const frame = (stage: FrameMessage['stage']): FrameMessage => ({
  type: 'frame',
  requestId: 17,
  stage,
  width: 1,
  height: 1,
  rgba: new Uint8ClampedArray([0, 0, 0, 255]),
  progress: stage === 'coarse' ? 0.2 : 1,
  workerTiming: {
    classifyMs: stage === 'coarse' ? 11 : 90,
    colorizeMs: stage === 'coarse' ? 2 : 4,
    yieldWaitMs: stage === 'coarse' ? 3 : 8,
    yieldCount: stage === 'coarse' ? 2 : 16,
  },
});

describe('recordWorkerTimingMarks', () => {
  it('copies worker timings onto the UI-visible mi:* marks', () => {
    const mark = vi.fn();

    recordWorkerTimingMarks(frame('coarse'), mark);
    recordWorkerTimingMarks(frame('stable'), mark);

    expect(mark).toHaveBeenCalledWith('mi:worker-coarse-classify', {
      detail: { requestId: 17, duration: 11 },
    });
    expect(mark).toHaveBeenCalledWith('mi:worker-coarse-colorize', {
      detail: { requestId: 17, duration: 2 },
    });
    expect(mark).toHaveBeenCalledWith('mi:worker-stable-classify', {
      detail: { requestId: 17, duration: 90 },
    });
    expect(mark).toHaveBeenCalledWith('mi:worker-stable-colorize', {
      detail: { requestId: 17, duration: 4 },
    });
    expect(mark).toHaveBeenCalledWith('mi:worker-yield-wait', {
      detail: { requestId: 17, stage: 'coarse', duration: 3, count: 2 },
    });
    expect(mark).toHaveBeenCalledWith('mi:worker-yield-wait', {
      detail: { requestId: 17, stage: 'stable', duration: 8, count: 16 },
    });
  });

  it('skips marks when a frame has no worker timing', () => {
    const mark = vi.fn();
    const untimed: FrameMessage = {
      type: 'frame',
      requestId: 1,
      stage: 'stable',
      width: 1,
      height: 1,
      rgba: new Uint8ClampedArray([0, 0, 0, 255]),
      progress: 1,
    };

    recordWorkerTimingMarks(untimed, mark);

    expect(mark).not.toHaveBeenCalled();
  });
});
