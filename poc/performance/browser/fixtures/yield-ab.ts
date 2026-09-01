import { shouldYieldToEventLoop, yieldMaskForQuality } from '../../../../src/render/yield-policy';
import type { YieldAbParams, YieldAbResult, YieldCancelSample } from './microbench-api';

/**
 * Workstream E / plan §12 renderer-path detail: the production classifier
 * yields with nested `setTimeout(0)` (`src/render/classify-rows.ts`). HTML
 * timer nesting clamps to 4 ms after 5 levels, so every yield deep in the
 * row loop pays timer policy; a MessageChannel port yield is a task source
 * and should stay sub-millisecond. Both mechanisms are A/B'd here:
 * per-hop latency across a long chain, and cancel-to-quiescence of a
 * synthetic classification workload (spin per row + production yield mask).
 */

export type YieldMechanism = 'settimeout' | 'messagechannel';

const channel = new MessageChannel();
const portQueue: (() => void)[] = [];
channel.port1.onmessage = () => {
  const resolve = portQueue.shift();
  if (resolve !== undefined) resolve();
};

const yieldViaSetTimeout = (): Promise<void> =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });

const yieldViaMessageChannel = (): Promise<void> =>
  new Promise<void>((resolve) => {
    portQueue.push(resolve);
    channel.port2.postMessage(undefined);
  });

const mechanismOf = (name: YieldMechanism): (() => Promise<void>) =>
  name === 'settimeout' ? yieldViaSetTimeout : yieldViaMessageChannel;

const spin = (ms: number): void => {
  const end = performance.now() + ms;
  while (performance.now() < end) {
    // Synthetic compute stand-in; the wall clock is the measured quantity.
  }
};

/** Per-hop latency across a sequential chain of `hops` yields. */
const measureHops = async (name: YieldMechanism, hops: number): Promise<number[]> => {
  const yields = mechanismOf(name);
  const perHopMs: number[] = [];
  let last = performance.now();
  for (let hop = 0; hop < hops; hop += 1) {
    await yields();
    const now = performance.now();
    perHopMs.push(now - last);
    last = now;
  }
  return perHopMs;
};

interface CancelWorkloadOptions {
  readonly rows: number;
  readonly spinMsPerRow: number;
  readonly maxIterationsForMask: number;
  readonly cancelAfterMs: number;
}

/**
 * Synthetic classification workload shaped like classifyRows: per-row spin,
 * yield per the production mask (`shouldYieldToEventLoop`), abort observed
 * at the same points the real loop checks its signal. Returns the time from
 * cancel() to loop exit (quiescence), plus the row reached.
 */
const runCancelWorkload = async (
  name: YieldMechanism,
  options: CancelWorkloadOptions,
): Promise<{ quiescenceMs: number; rowReached: number }> => {
  const yields = mechanismOf(name);
  const mask = yieldMaskForQuality(options.maxIterationsForMask);
  const controller = new AbortController();
  let cancelledAt = 0;
  let finishedAt = Number.NaN;
  let rowReached = -1;

  // Read through a function so TS cannot narrow signal.aborted between checks.
  const isAborted = (): boolean => controller.signal.aborted;

  const workload = (async (): Promise<void> => {
    for (let row = 0; row < options.rows; row += 1) {
      if (isAborted()) {
        rowReached = row;
        finishedAt = performance.now();
        return;
      }
      spin(options.spinMsPerRow);
      if (shouldYieldToEventLoop(row, 1, mask)) {
        await yields();
        if (isAborted()) {
          rowReached = row;
          finishedAt = performance.now();
          return;
        }
      }
    }
    rowReached = options.rows;
    finishedAt = performance.now();
  })();

  setTimeout(() => {
    cancelledAt = performance.now();
    controller.abort();
  }, options.cancelAfterMs);

  await workload;
  return { quiescenceMs: finishedAt - cancelledAt, rowReached };
};

export const runYieldAb = async (params: YieldAbParams): Promise<YieldAbResult> => {
  const mechanisms: readonly YieldMechanism[] = ['settimeout', 'messagechannel'];

  // Per-hop chains, one per mechanism (raw per-hop latencies retained).
  const chains = mechanisms.map((name) => ({
    mechanism: name,
    perHopMs: [] as number[],
  }));
  for (const entry of chains) {
    entry.perHopMs = await measureHops(entry.mechanism, params.hops);
  }

  // Cancel-to-quiescence: 21+ reps per mechanism, order alternates per rep
  // (settimeout, messagechannel, messagechannel, settimeout, ...) so
  // thermal drift spreads across both arms.
  const cancelSamples: YieldCancelSample[] = [];
  for (let rep = 0; rep < params.cancelReps; rep += 1) {
    const order =
      rep % 2 === 0
        ? (['settimeout', 'messagechannel'] as const)
        : (['messagechannel', 'settimeout'] as const);
    for (const name of order) {
      const started = performance.now();
      const outcome = await runCancelWorkload(name, {
        rows: 64,
        spinMsPerRow: 1,
        maxIterationsForMask: 1024,
        cancelAfterMs: 30,
      });
      cancelSamples.push({
        rep,
        mechanism: name,
        quiescenceMs: outcome.quiescenceMs,
        rowReached: outcome.rowReached,
        workloadWallMs: performance.now() - started,
      });
    }
  }

  return {
    hops: params.hops,
    cancelReps: params.cancelReps,
    chains,
    cancelSamples,
  };
};
