import { classifyRows } from '../render/classify-rows';
import { RenderCancelledError } from '../render/render-cancelled-error';
import type { DynamicsRenderRequest } from '../render';
import type {
  SupervisorToTileMessage,
  TileClassifyMessage,
  TileToSupervisorMessage,
} from './tile-protocol';

export interface TileHandlerHost {
  postMessage(message: TileToSupervisorMessage, transfer?: readonly ArrayBuffer[]): void;
}

export type ClassifyRowsFn = typeof classifyRows;

export interface TileHandlerOptions {
  readonly classifyRows?: ClassifyRowsFn;
}

const requestFromClassify = (message: TileClassifyMessage): DynamicsRenderRequest => ({
  viewport: message.viewport,
  size: message.size,
  quality: message.quality,
});

const transferOf = (
  message: Extract<TileToSupervisorMessage, { type: 'tile-result' }>,
): ArrayBuffer[] => [
  message.status.buffer,
  message.period.buffer,
  message.smoothIterationOrMultiplierMagnitude.buffer,
  message.multiplierAngle.buffer,
];

export function createTileHandler(
  host: TileHandlerHost,
  options: TileHandlerOptions = {},
): (message: SupervisorToTileMessage) => Promise<void> {
  const classify = options.classifyRows ?? classifyRows;
  let jobController: AbortController | undefined;
  let jobGeneration: number | undefined;
  let jobId: number | undefined;
  let inflight: Promise<void> = Promise.resolve();

  const runClassify = async (message: TileClassifyMessage, signal: AbortSignal): Promise<void> => {
    try {
      const band = await classify(
        requestFromClassify(message),
        message.quality,
        1,
        message.y0,
        message.y1,
        signal,
      );
      if (signal.aborted) return;
      const result = {
        type: 'tile-result' as const,
        generation: message.generation,
        jobId: message.jobId,
        y0: message.y0,
        y1: message.y1,
        status: band.status as Uint8Array<ArrayBuffer>,
        period: band.period as Uint32Array<ArrayBuffer>,
        smoothIterationOrMultiplierMagnitude:
          band.smoothIterationOrMultiplierMagnitude as Float64Array<ArrayBuffer>,
        multiplierAngle: band.multiplierAngle as Float64Array<ArrayBuffer>,
        yieldWaitMs: band.timing.yieldWaitMs,
        yieldCount: band.timing.yieldCount,
      };
      host.postMessage(result, transferOf(result));
    } catch (error: unknown) {
      if (error instanceof RenderCancelledError || signal.aborted) return;
      host.postMessage({
        type: 'tile-error',
        generation: message.generation,
        jobId: message.jobId,
        message: error instanceof Error ? error.message : 'tile error',
      });
    }
  };

  return async (message: SupervisorToTileMessage): Promise<void> => {
    if (message.type === 'tile-cancel') {
      if (jobGeneration === message.generation) {
        const cancelledGeneration = jobGeneration;
        const cancelledJobId = jobId;
        jobController?.abort();
        void inflight.finally(() => {
          if (cancelledJobId === undefined) return;
          host.postMessage({
            type: 'tile-cancelled',
            generation: cancelledGeneration,
            jobId: cancelledJobId,
          });
        });
      }
      return;
    }

    jobController?.abort();
    const previous = inflight;
    const controller = new AbortController();
    jobController = controller;
    jobGeneration = message.generation;
    jobId = message.jobId;

    const run = (async (): Promise<void> => {
      await previous.catch(() => undefined);
      await runClassify(message, controller.signal);
    })();
    inflight = run;
    await run;
  };
}
