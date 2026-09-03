import { classifyRows } from '../render/classify-rows';
import { RenderCancelledError } from '../render/render-cancelled-error';
import { PACKED_OUTPUT_REVISION } from '../render/packed-semantic';
import type { DynamicsRenderRequest } from '../render';
import type {
  SupervisorToTileMessage,
  TileClassifyMessage,
  TileResultMessage,
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

/**
 * Buffers to transfer with a result. After postMessage these are detached in
 * the worker — the handler never touches the result again once posted.
 */
const transferOf = (result: TileResultMessage): ArrayBuffer[] => [
  result.packedStatusPeriod.buffer,
  result.smoothIterationOrMultiplierMagnitude.buffer,
  result.multiplierAngle.buffer,
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
        message.classifierMode,
        message.yieldMechanism,
        // Zero-copy: classify directly into the supervisor's band views.
        // Absent on the legacy-merge arm, where classifyRows allocates.
        message.bandOutput === undefined
          ? undefined
          : {
              packedStatusPeriod: message.bandOutput.packedStatusPeriod,
              smoothIterationOrMultiplierMagnitude:
                message.bandOutput.smoothIterationOrMultiplierMagnitude,
              multiplierAngle: message.bandOutput.multiplierAngle,
            },
        ...(message.perfCounters === true ? [true as const] : []),
      );
      if (signal.aborted) return;
      const result: TileResultMessage = {
        type: 'tile-result',
        generation: message.generation,
        jobId: message.jobId,
        y0: message.y0,
        y1: message.y1,
        packedStatusPeriod: band.packedStatusPeriod,
        smoothIterationOrMultiplierMagnitude: band.smoothIterationOrMultiplierMagnitude,
        multiplierAngle: band.multiplierAngle,
        outputRevision: PACKED_OUTPUT_REVISION,
        yieldWaitMs: band.timing.yieldWaitMs,
        yieldCount: band.timing.yieldCount,
        ...(band.differential === undefined ? {} : { differential: band.differential }),
        ...(band.counters === undefined ? {} : { counters: band.counters }),
      };
      // Transfers ownership back to the supervisor; the views are detached
      // in this worker afterwards and are never read here again.
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
