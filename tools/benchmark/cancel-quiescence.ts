/**
 * Cancel-to-child-quiescence A/B for the row-yield mechanism (renderer-path
 * detail, plan §5/§12), driving the REAL production tile handler and
 * classifyRows over a worker-shaped message flow in Node.
 *
 * Per repetition: post a tile-classify for a slow band, let it run, post
 * tile-cancel, and measure the time until the child posts 'tile-cancelled'
 * (the child has stopped — the same signal the supervisor's drain waits for).
 * Arms: message-channel (default) vs timeout (the nested setTimeout(0)
 * measurement arm that keeps the HTML 4 ms nested-timer clamp).
 *
 * Label: directional. Node does not implement the browser timer-nesting
 * clamp, so the timeout arm's per-yield cost here under-reports the browser
 * value; the browser-side clamp magnitudes (4.1 ms vs 0.1 ms per hop) are
 * established in poc/performance/browser/results/yield-ab.json, and the
 * browser-side yieldWaitMs deltas are recorded in the renderer-path paired
 * evidence (tools/benchmark/run-renderer-path.mjs, detail m2-yield).
 *
 * Usage: npm run bench:cancel-quiescence
 */
import process from 'node:process';
import { createTileHandler } from '../../src/worker/tile-handler';
import type { TileToSupervisorMessage } from '../../src/worker/tile-protocol';
import type { YieldMechanism } from '../../src/render/yield-scheduler';

const REPS = 15;
const RUN_MS = 60;
const QUALITY = { maxIterations: 512, maxPeriod: 32, coarseStride: 8 };
const VIEW = {
  // Interior-heavy boundary view: enough unresolved work to still be running.
  center: { re: -0.158902249, im: -1.034028 },
  spanY: 0.01984126984126984,
};

interface Sample {
  arm: YieldMechanism;
  repetition: number;
  cancelToCancelledMs: number;
  cancelledSeen: boolean;
  lateResultSeen: boolean;
}

const runOnce = async (mechanism: YieldMechanism, repetition: number): Promise<Sample> => {
  const posted: TileToSupervisorMessage[] = [];
  const handler = createTileHandler({
    postMessage(message) {
      posted.push(message);
    },
  });
  void handler({
    type: 'tile-classify',
    generation: 1,
    jobId: 0,
    viewport: { center: VIEW.center, spanY: VIEW.spanY },
    size: { width: 256, height: 256 },
    y0: 0,
    y1: 64,
    quality: QUALITY,
    yieldMechanism: mechanism,
  });
  // Let the child get deep into the band, then cancel.
  await new Promise((resolve) => {
    setTimeout(resolve, RUN_MS);
  });
  const postsAtCancel = posted.length;
  const cancelAt = performance.now();
  void handler({ type: 'tile-cancel', generation: 1 });
  const cancelledAt = await (async () => {
    for (let guard = 0; guard < 2000; guard += 1) {
      if (posted.some((message) => message.type === 'tile-cancelled')) {
        return performance.now();
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    return Number.NaN;
  })();
  // A result posted after the cancel would mean the child did not actually
  // stop; results posted before the cancel are the band finishing early.
  const lateResultSeen = posted
    .slice(postsAtCancel)
    .some((message) => message.type === 'tile-result');
  return {
    arm: mechanism,
    repetition,
    cancelToCancelledMs: cancelledAt - cancelAt,
    cancelledSeen: Number.isFinite(cancelledAt),
    lateResultSeen,
  };
};

const median = (values: number[]): number | undefined => {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle];
  if (upper === undefined) return undefined;
  if (sorted.length % 2 === 1) return upper;
  const lower = sorted[middle - 1];
  return lower === undefined ? undefined : (lower + upper) / 2;
};

const samples: Sample[] = [];
for (const mechanism of ['message-channel', 'timeout'] as const) {
  for (let repetition = 0; repetition < REPS; repetition += 1) {
    samples.push(await runOnce(mechanism, repetition));
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
  }
}

const summary = (['message-channel', 'timeout'] as const).map((mechanism) => {
  const armSamples = samples.filter((sample) => sample.arm === mechanism);
  return {
    arm: mechanism,
    reps: armSamples.length,
    medianCancelToCancelledMs: median(armSamples.map((sample) => sample.cancelToCancelledMs)),
    maxCancelToCancelledMs: Math.max(...armSamples.map((sample) => sample.cancelToCancelledMs)),
    allCancelled: armSamples.every((sample) => sample.cancelledSeen),
    anyLateResult: armSamples.some((sample) => sample.lateResultSeen),
  };
});

const result = {
  schemaVersion: 1,
  measurement: 'cancel-to-child-quiescence-yield-mechanism',
  label:
    'directional Node run of the production tile handler + classifyRows; Node lacks the browser 4 ms nested-timer clamp, browser magnitudes are in poc/performance/browser/results/yield-ab.json',
  quality: QUALITY,
  view: VIEW,
  band: { y0: 0, y1: 64, width: 256 },
  runMsBeforeCancel: RUN_MS,
  reps: REPS,
  samples,
  summary,
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
// The default row-yield scheduler's port keeps the Node event loop alive;
// evidence scripts exit explicitly (same as run-stage-a.mjs).
process.exit(0);
