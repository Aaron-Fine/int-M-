/**
 * Recorder-cost microbenchmark for the bounded render-trace ring
 * (performance plan §8: always-on recorder work ≤0.2 ms per frame average).
 *
 * Drives the production createRenderTraceRing in Node at the worst realistic
 * frame shape observed in the app (coarse + stable computed frames with
 * per-band elapsed arrays) and reports the mean ring call cost per frame,
 * per request, and per snapshot. Label: directional — Node/V8 timings
 * approximate but do not replace browser evidence; the paired end-to-end
 * overhead benchmark (tools/benchmark/run-overhead.mjs) bounds the same
 * budget behaviorally in the target browser.
 *
 * Usage: npm run bench:recorder
 */
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import {
  createRenderTraceRing,
  RENDER_TRACE_RING_CAPACITY,
} from '../../src/ui/worker-timing-marks';
import type { FrameDelivery } from '../../src/ui/worker-timing-marks';
import type { FrameMessage } from '../../src/worker/protocol';

const BANDS = 16;
const WARMUP_FRAMES = 2_000;
const MEASURED_FRAMES = 20_000;
const MEASURED_REQUESTS = 4_000;
const SNAPSHOTS = 200;
const CAPACITY = 4096;

const stableFrame = (requestId: number): FrameMessage => ({
  type: 'frame',
  requestId,
  stage: 'stable',
  width: 1024,
  height: 640,
  rgba: new Uint8ClampedArray(4),
  progress: 1,
  workerTiming: {
    classifyMs: 1200,
    colorizeMs: 8,
    yieldWaitMs: 2.5,
    yieldCount: 40,
    bandsElapsedMs: Array.from({ length: BANDS }, (_, band) => 100 + band * 7.5),
    mergeCpuMs: 1.2,
  },
});

const coarseFrame = (requestId: number): FrameMessage => ({
  ...stableFrame(requestId),
  stage: 'coarse',
  progress: 0.2,
  workerTiming: {
    classifyMs: 90,
    colorizeMs: 3,
    yieldWaitMs: 1.5,
    yieldCount: 12,
  },
});

const computedDelivery = (): FrameDelivery => ({
  requestToPresentMs: 33.2,
  colorizeMs: 8,
  bandsElapsedMs: stableFrame(0).workerTiming?.bandsElapsedMs,
  mergeCpuMs: 1.2,
  yieldWaitMs: 2.5,
  yieldCount: 40,
});

const summary = (requestId: number) => ({
  requestId,
  viewKeyHash: '0124abcd',
  width: 1024,
  height: 640,
  profile: 'detailed',
  backend: 'cpu',
  workerCount: 4,
});

const timeOps = (count: number, operation: (index: number) => void): number => {
  const started = performance.now();
  for (let index = 0; index < count; index += 1) operation(index);
  return (performance.now() - started) / count;
};

// Warm up V8/icache shapes so the measured loops see steady state.
{
  const ring = createRenderTraceRing({ capacity: CAPACITY });
  const delivery = computedDelivery();
  for (let index = 0; index < CAPACITY; index += 1) ring.beginRequest(summary(index));
  for (let index = 0; index < WARMUP_FRAMES; index += 1) {
    ring.recordFrame(stableFrame(index % CAPACITY), delivery);
  }
}

// Per-frame cost: recordFrame is the hot boundary (every presented frame).
// Requests are begun up front so the timed loop measures the frame path only.
const recordFrameUs =
  (() => {
    const ring = createRenderTraceRing({ capacity: CAPACITY });
    const delivery = computedDelivery();
    for (let index = 0; index < CAPACITY; index += 1) ring.beginRequest(summary(index));
    return timeOps(MEASURED_FRAMES, (index) => {
      ring.recordFrame(stableFrame(index % CAPACITY), delivery);
    });
  })() * 1000;

// Per-request cost: beginRequest (supersede scan + open-set insert) plus the
// coarse and stable recordFrame calls that fill and close it, attributed
// per presented frame (3 ring calls across the request's 2 frames + begin).
const perRequestUs =
  (() => {
    const ring = createRenderTraceRing({ capacity: CAPACITY });
    return (
      timeOps(MEASURED_REQUESTS, (index) => {
        const requestId = index % CAPACITY;
        ring.beginRequest(summary(requestId));
        ring.recordFrame(coarseFrame(requestId), { requestToPresentMs: 16.6 });
        ring.recordFrame(stableFrame(requestId), computedDelivery());
      }) / 3
    );
  })() * 1000;

// Snapshot cost amortized over completed traces at the shipping capacity.
const snapshotPerTraceUs = (() => {
  const ring = createRenderTraceRing();
  for (let requestId = 0; requestId < RENDER_TRACE_RING_CAPACITY; requestId += 1) {
    ring.beginRequest(summary(requestId));
    ring.recordFrame(coarseFrame(requestId), { requestToPresentMs: 16.6 });
    ring.recordFrame(stableFrame(requestId), computedDelivery());
  }
  return (
    (timeOps(SNAPSHOTS, () => {
      ring.snapshot();
    }) /
      RENDER_TRACE_RING_CAPACITY) *
    1000
  );
})();

const result = {
  schemaVersion: 1,
  measurement: 'render-trace-ring recorder cost per frame/request/snapshot',
  label:
    'directional Node/V8 microbenchmark of the production ring; browser-side overhead is bounded end-to-end by tools/benchmark/run-overhead.mjs',
  worstShape: {
    framesPerRequest: 2,
    bandsElapsedMsLength: BANDS,
    raster: '1024x640',
  },
  ringCapacity: RENDER_TRACE_RING_CAPACITY,
  measured: {
    warmupFrames: WARMUP_FRAMES,
    measuredFrames: MEASURED_FRAMES,
    measuredRequests: MEASURED_REQUESTS,
    recordFrameMeanUs: recordFrameUs,
    ringCallMeanUs: perRequestUs,
    snapshotPerTraceMeanUs: snapshotPerTraceUs,
  },
  budget: { perFrameBudgetMs: 0.2, perFrameBudgetUs: 200 },
  verdict: recordFrameUs <= 200 ? 'within ≤0.2 ms/frame budget (directional)' : 'EXCEEDS budget',
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
process.exit(0);
