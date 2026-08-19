import type { FrameMessage } from '../worker/protocol';

type WorkerTimingMark = (name: string, options: PerformanceMarkOptions) => void;

export const recordWorkerTimingMarks = (
  frame: FrameMessage,
  mark: WorkerTimingMark = (name, options) => {
    performance.mark(name, options);
  },
): void => {
  const timing = frame.workerTiming;
  if (timing === undefined) return;
  const requestId = frame.requestId;
  mark(`mi:worker-${frame.stage}-classify`, {
    detail: { requestId, duration: timing.classifyMs },
  });
  mark(`mi:worker-${frame.stage}-colorize`, {
    detail: { requestId, duration: timing.colorizeMs },
  });
  mark('mi:worker-yield-wait', {
    detail: {
      requestId,
      stage: frame.stage,
      duration: timing.yieldWaitMs,
      count: timing.yieldCount,
    },
  });
};
