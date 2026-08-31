import { describe, expect, it, vi } from 'vitest';

import type { FrameMessage } from '../worker/protocol';
import {
  createRenderTraceRing,
  expectedWorkerCount,
  RENDER_TRACE_RING_CAPACITY,
  viewKeyHash,
  type FrameDelivery,
  type RenderRequestSummary,
} from './worker-timing-marks';

const frame = (requestId: number, stage: FrameMessage['stage']): FrameMessage => ({
  type: 'frame',
  requestId,
  stage,
  width: 64,
  height: 40,
  rgba: new Uint8ClampedArray([0, 0, 0, 255]),
  progress: stage === 'coarse' ? 0.2 : 1,
  workerTiming: {
    classifyMs: 11,
    colorizeMs: 2,
    yieldWaitMs: 3,
    yieldCount: 2,
  },
});

const request = (requestId: number, computeId?: number): RenderRequestSummary => ({
  requestId,
  computeId,
  viewKeyHash: '0124abcd',
  width: 64,
  height: 40,
  profile: 'balanced',
  backend: 'cpu',
  workerCount: 2,
});

const delivery = (overrides: Partial<FrameDelivery> = {}): FrameDelivery => ({
  requestToPresentMs: 12.5,
  colorizeMs: 2,
  ...overrides,
});

describe('createRenderTraceRing', () => {
  it('ring_retainsAtMost32RequestSummariesAndEvictsTheOldest', () => {
    const ring = createRenderTraceRing();
    for (let requestId = 1; requestId <= RENDER_TRACE_RING_CAPACITY + 1; requestId += 1) {
      ring.beginRequest(request(requestId, requestId));
      ring.recordFrame(frame(requestId, 'stable'), delivery());
    }

    const traces = ring.snapshot();
    expect(traces).toHaveLength(RENDER_TRACE_RING_CAPACITY);
    expect(traces[0]?.requestId).toEqual(2);
    expect(traces.at(-1)?.requestId).toEqual(RENDER_TRACE_RING_CAPACITY + 1);
  });

  it('cacheFrame_carriesFreshDeliveryTimingWithComputeFieldsAbsent', () => {
    const ring = createRenderTraceRing();
    ring.beginRequest(request(7, 41));
    // Adversarial delivery: a caller must not be able to smuggle compute
    // timing into a cache hit, and delivery timing stays fresh.
    ring.recordFrame(
      frame(7, 'coarse'),
      delivery({
        source: 'semantic-cache',
        originComputeId: 41,
        requestToPresentMs: 3,
        workerWallMs: 99,
        colorizeMs: 99,
        maxBandElapsedMs: 99,
        imbalanceRatio: 99,
        mergeCpuMs: 99,
      }),
    );
    ring.recordFrame(frame(7, 'stable'), delivery({ source: 'semantic-cache', originComputeId: 41, requestToPresentMs: 4 }));

    const [trace] = ring.snapshot();
    expect(trace?.computeId).toEqual(41);
    expect(trace?.outcome).toEqual('completed');
    expect(trace?.frames[0]).toEqual({
      stage: 'coarse',
      source: 'semantic-cache',
      originComputeId: 41,
      requestToPresentMs: 3,
      workerWallMs: undefined,
      colorizeMs: undefined,
      maxBandElapsedMs: undefined,
      imbalanceRatio: undefined,
      mergeCpuMs: undefined,
    });
    expect(trace?.frames[1]?.requestToPresentMs).toEqual(4);
  });

  it('replayFrame_preservesOriginComputeIdAndReboundRequestsKeepTheirComputeId', () => {
    const ring = createRenderTraceRing();
    ring.beginRequest(request(1, 41));
    ring.recordFrame(frame(1, 'stable'), delivery());

    // Rebinding: a recovered worker re-issues the same semantic work under a
    // new requestId; the computeId survives.
    ring.beginRequest(request(2, 41));
    ring.recordFrame(
      frame(2, 'coarse'),
      delivery({ source: 'inflight-replay', originComputeId: 41, requestToPresentMs: 1.5 }),
    );

    // A pure replay performs no semantic work of its own.
    ring.beginRequest(request(3));
    ring.recordFrame(
      frame(3, 'stable'),
      delivery({ source: 'inflight-replay', originComputeId: 41, requestToPresentMs: 2 }),
    );

    const traces = ring.snapshot();
    expect(traces.find((trace) => trace.requestId === 1)?.computeId).toEqual(41);
    expect(traces.find((trace) => trace.requestId === 2)?.computeId).toEqual(41);
    expect(traces.find((trace) => trace.requestId === 2)?.frames[0]?.source).toEqual('inflight-replay');
    expect(traces.find((trace) => trace.requestId === 2)?.frames[0]?.originComputeId).toEqual(41);
    expect(traces.find((trace) => trace.requestId === 3)?.computeId).toBeUndefined();
    expect(traces.find((trace) => trace.requestId === 3)?.frames[0]?.originComputeId).toEqual(41);
  });

  it('computedFrame_recordsFreshDeliveryTimingAndCompletesOnStable', () => {
    const onTraceCompleted = vi.fn();
    const ring = createRenderTraceRing({ onTraceCompleted });
    ring.beginRequest(request(5));
    ring.recordFrame(frame(5, 'coarse'), delivery({ requestToPresentMs: 8 }));
    ring.recordFrame(frame(5, 'stable'), delivery({ requestToPresentMs: 20, colorizeMs: 4 }));

    const [trace] = ring.snapshot();
    expect(trace?.outcome).toEqual('completed');
    expect(trace?.frames).toHaveLength(2);
    expect(trace?.frames[0]?.source).toEqual('computed');
    expect(trace?.frames[0]?.colorizeMs).toEqual(2);
    expect(trace?.frames[1]?.requestToPresentMs).toEqual(20);
    expect(trace?.mainLongTaskCount).toEqual(0);
    expect(onTraceCompleted).toHaveBeenCalledTimes(1);
  });

  it('recolorFrame_keepsFreshColorizeMsButNoWorkerComputeFields', () => {
    const ring = createRenderTraceRing();
    ring.beginRequest(request(9));
    ring.recordFrame(
      frame(9, 'stable'),
      delivery({
        source: 'recolor',
        requestToPresentMs: 6,
        colorizeMs: 3.5,
        workerWallMs: 77,
        maxBandElapsedMs: 77,
      }),
    );

    const [trace] = ring.snapshot();
    expect(trace?.frames[0]?.colorizeMs).toEqual(3.5);
    expect(trace?.frames[0]?.workerWallMs).toBeUndefined();
    expect(trace?.frames[0]?.maxBandElapsedMs).toBeUndefined();
  });

  it('cancellation_recordsAckLatencyAndOutcome', () => {
    const ring = createRenderTraceRing();
    ring.beginRequest(request(11));
    ring.recordFrame(frame(11, 'coarse'), delivery());
    ring.recordCancellation(11, 4.5);

    const [trace] = ring.snapshot();
    expect(trace?.outcome).toEqual('cancelled');
    expect(trace?.cancelAckMs).toEqual(4.5);
    expect(trace?.childQuiescenceMs).toBeUndefined();
    expect(trace?.frames).toHaveLength(1);
  });

  it('supersededRequests_closeWhenANewRequestBegins', () => {
    const ring = createRenderTraceRing();
    ring.beginRequest(request(1));
    ring.beginRequest(request(2));
    ring.recordFrame(frame(2, 'stable'), delivery());

    const traces = ring.snapshot();
    expect(traces[0]?.outcome).toEqual('superseded');
    expect(traces[0]?.requestId).toEqual(1);
    expect(traces[1]?.outcome).toEqual('completed');
    expect(traces[1]?.requestId).toEqual(2);
  });

  it('workerRecovery_failsOpenRequests', () => {
    const ring = createRenderTraceRing();
    ring.beginRequest(request(1));
    ring.beginRequest(request(2));
    ring.recordFrame(frame(2, 'coarse'), delivery());
    ring.failOpenRequests();

    const traces = ring.snapshot();
    expect(traces).toHaveLength(2);
    expect(traces[0]?.outcome).toEqual('superseded');
    expect(traces[1]?.outcome).toEqual('failed');
    expect(traces[1]?.mainLongTaskCount).toEqual(0);
  });

  it('longTaskNotes_summarizeCountAndMaxWhileARequestIsOpen', () => {
    const ring = createRenderTraceRing();
    ring.beginRequest(request(1));
    ring.noteMainThreadLongTask(60);
    ring.noteMainThreadLongTask(120);
    ring.recordFrame(frame(1, 'stable'), delivery());

    const [trace] = ring.snapshot();
    expect(trace?.mainLongTaskCount).toEqual(2);
    expect(trace?.maxMainLongTaskMs).toEqual(120);
  });

  it('staleFrames_forUnknownRequestIdsAreIgnored', () => {
    const ring = createRenderTraceRing();
    ring.beginRequest(request(1));
    ring.recordFrame(frame(99, 'coarse'), delivery());
    ring.recordCancellation(99, 1);

    expect(ring.snapshot()).toHaveLength(0);
  });

  it('snapshot_returnsDefensiveCopies', () => {
    const ring = createRenderTraceRing();
    ring.beginRequest(request(1));
    ring.recordFrame(frame(1, 'stable'), delivery());

    const snapshot = ring.snapshot() as unknown as Array<{ requestId: number; frames: unknown[] }>;
    snapshot.pop();
    snapshot[0]?.frames.pop();
    expect(ring.snapshot()).toHaveLength(1);
    expect(ring.snapshot()[0]?.frames).toHaveLength(1);
  });

  it('ring_neverEmitsUserTimingMarks', () => {
    const mark = vi.spyOn(performance, 'mark');
    const ring = createRenderTraceRing();
    ring.beginRequest(request(1));
    ring.recordFrame(frame(1, 'coarse'), delivery());
    ring.recordCancellation(1, 1);
    ring.beginRequest(request(2));
    ring.recordFrame(frame(2, 'stable'), delivery());
    ring.snapshot();

    expect(mark).not.toHaveBeenCalled();
    mark.mockRestore();
  });

  it('viewKeyHash_isStableAcrossEqualViewsAndSensitiveToComponents', () => {
    const viewport = { center: { re: -0.75, im: 0 }, spanY: 2.5 };
    const quality = { maxIterations: 512, maxPeriod: 32, coarseStride: 8 };
    expect(viewKeyHash(viewport, 'stability', quality)).toEqual(
      viewKeyHash({ ...viewport, center: { ...viewport.center } }, 'stability', { ...quality }),
    );
    expect(viewKeyHash(viewport, 'period', quality)).not.toEqual(viewKeyHash(viewport, 'stability', quality));
    expect(viewKeyHash(viewport, 'stability', { ...quality, maxIterations: 256 })).not.toEqual(
      viewKeyHash(viewport, 'stability', quality),
    );
    expect(viewKeyHash(viewport, 'stability', quality)).toMatch(/^[0-9a-f]{8}$/);
  });

  it('expectedWorkerCount_mirrorsTheTilePoolClamp', () => {
    expect(expectedWorkerCount(undefined)).toEqual(1);
    expect(expectedWorkerCount(0)).toEqual(1);
    expect(expectedWorkerCount(2)).toEqual(2);
    expect(expectedWorkerCount(16)).toEqual(4);
  });
});
