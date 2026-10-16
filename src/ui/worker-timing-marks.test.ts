import { describe, expect, it, vi } from 'vitest';

import type { FrameMessage } from '../worker/protocol';
import {
  createRenderTraceRing,
  expectedWorkerCount,
  frameDelivery,
  RENDER_TRACE_CANCELLING_CAPACITY,
  RENDER_TRACE_RING_CAPACITY,
  viewKeyHash,
  type FrameDelivery,
  type RenderRequestSummary,
} from './worker-timing-marks';

const frame = (requestId: number, stage: FrameMessage['stage']): FrameMessage => ({
  type: 'frame',
  requestId,
  stage,
  provenance: { source: 'computed', computeId: 1, workerWallMs: 15 },
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
  source: 'computed',
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
    // timing into a cache hit, and delivery timing stays fresh. Colorization
    // is fresh work on every delivery, so its timing is kept.
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
    ring.recordFrame(
      frame(7, 'stable'),
      delivery({ source: 'semantic-cache', originComputeId: 41, requestToPresentMs: 4 }),
    );

    const [trace] = ring.snapshot();
    expect(trace?.computeId).toEqual(41);
    expect(trace?.outcome).toEqual('completed');
    expect(trace?.frames[0]).toEqual({
      stage: 'coarse',
      source: 'semantic-cache',
      originComputeId: 41,
      requestToPresentMs: 3,
      workerWallMs: undefined,
      classifyMs: undefined,
      colorizeMs: 99,
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
    expect(traces.find((trace) => trace.requestId === 2)?.frames[0]?.source).toEqual(
      'inflight-replay',
    );
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

  it('cancellation_recordsAckThenQuiescenceFromTheRequestTime', () => {
    const ring = createRenderTraceRing();
    ring.beginRequest(request(11));
    ring.recordFrame(frame(11, 'coarse'), delivery());
    ring.requestCancellation(11, 100);
    ring.recordCancellationAck(11, 104.5);
    // Duplicate and late events are idempotent.
    ring.recordCancellationAck(11, 150);
    ring.recordCancellationQuiesced(11, 112);
    ring.recordCancellationQuiesced(11, 190);

    const traces = ring.snapshot();
    expect(traces).toHaveLength(1);
    expect(traces[0]?.outcome).toEqual('cancelled');
    expect(traces[0]?.cancelAckMs).toEqual(4.5);
    expect(traces[0]?.childQuiescenceMs).toEqual(12);
    expect(traces[0]?.frames).toHaveLength(1);
  });

  it('cancellation_survivesTheNextRequestAndIsAttributedToTheOriginal', () => {
    const ring = createRenderTraceRing();
    ring.beginRequest(request(1));
    ring.requestCancellation(1, 10);
    ring.beginRequest(request(2));
    ring.recordCancellationAck(1, 11);
    ring.recordFrame(frame(2, 'coarse'), delivery());
    ring.recordCancellationQuiesced(1, 30);
    ring.recordFrame(frame(2, 'stable'), delivery());

    const traces = ring.snapshot();
    expect(traces.map((trace) => [trace.requestId, trace.outcome])).toEqual([
      [1, 'cancelled'],
      [2, 'completed'],
    ]);
    expect(traces[0]?.cancelAckMs).toEqual(1);
    expect(traces[0]?.childQuiescenceMs).toEqual(20);
  });

  it('cancellation_aStableFrameThatRacedTheCancelCompletesTheRequest', () => {
    const ring = createRenderTraceRing();
    ring.beginRequest(request(3));
    ring.requestCancellation(3, 10);
    ring.recordFrame(frame(3, 'stable'), delivery());
    ring.recordCancellationAck(3, 12);
    ring.recordCancellationQuiesced(3, 12);

    const traces = ring.snapshot();
    expect(traces).toHaveLength(1);
    expect(traces[0]?.outcome).toEqual('completed');
    expect(traces[0]?.cancelAckMs).toBeUndefined();
  });

  it('cancellation_pendingSetIsBoundedAndOverflowClosesTheOldestWithoutQuiescence', () => {
    const ring = createRenderTraceRing();
    for (let requestId = 1; requestId <= RENDER_TRACE_CANCELLING_CAPACITY + 1; requestId += 1) {
      ring.beginRequest(request(requestId));
      ring.requestCancellation(requestId, requestId);
      ring.recordCancellationAck(requestId, requestId + 0.5);
    }

    const [oldest] = ring.snapshot();
    expect(ring.snapshot()).toHaveLength(1);
    expect(oldest?.requestId).toEqual(1);
    expect(oldest?.outcome).toEqual('cancelled');
    expect(oldest?.cancelAckMs).toEqual(0.5);
    expect(oldest?.childQuiescenceMs).toBeUndefined();
  });

  it('cancellation_workerRecoveryFailsPendingCancellations', () => {
    const ring = createRenderTraceRing();
    ring.beginRequest(request(1));
    ring.requestCancellation(1, 0);
    ring.failOpenRequests();

    expect(ring.snapshot()[0]?.outcome).toEqual('failed');
  });

  it('computeId_comesFromTheFirstComputedDeliveryWhenTheSummaryHasNone', () => {
    const ring = createRenderTraceRing();
    ring.beginRequest(request(4));
    ring.recordFrame(frame(4, 'coarse'), delivery({ computeId: 17, originComputeId: 3 }));
    ring.recordFrame(frame(4, 'stable'), delivery({ computeId: 17 }));

    const [trace] = ring.snapshot();
    expect(trace?.computeId).toEqual(17);
    // A computed frame reuses nothing, so an origin is never recorded on it.
    expect(trace?.frames[0]?.originComputeId).toBeUndefined();
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
    ring.requestCancellation(99, 1);
    ring.recordCancellationAck(99, 2);
    ring.recordCancellationQuiesced(99, 3);

    expect(ring.snapshot()).toHaveLength(0);
  });

  it('snapshot_returnsDefensiveCopies', () => {
    const ring = createRenderTraceRing();
    ring.beginRequest(request(1));
    ring.recordFrame(frame(1, 'stable'), delivery());

    const snapshot = ring.snapshot() as unknown as { requestId: number; frames: unknown[] }[];
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
    ring.requestCancellation(1, 1);
    ring.recordCancellationAck(1, 2);
    ring.recordCancellationQuiesced(1, 3);
    ring.beginRequest(request(2));
    ring.recordFrame(frame(2, 'stable'), delivery());
    ring.snapshot();

    expect(mark).not.toHaveBeenCalled();
    mark.mockRestore();
  });

  it('frameDelivery_mapsComputedProvenanceAndDerivesBandImbalance', () => {
    const message: FrameMessage = {
      ...frame(5, 'stable'),
      provenance: { source: 'computed', computeId: 9, workerWallMs: 120 },
      workerTiming: {
        classifyMs: 100,
        colorizeMs: 4,
        yieldWaitMs: 1,
        yieldCount: 3,
        bandsElapsedMs: [40, 80, Number.NaN, 60],
        mergeCpuMs: 2,
      },
    };

    const mapped = frameDelivery(message, 130);
    expect(mapped).toMatchObject({
      source: 'computed',
      computeId: 9,
      workerWallMs: 120,
      requestToPresentMs: 130,
      classifyMs: 100,
      colorizeMs: 4,
      maxBandElapsedMs: 80,
      mergeCpuMs: 2,
      yieldWaitMs: 1,
      yieldCount: 3,
    });
    expect(mapped.imbalanceRatio).toBeCloseTo(80 / 60, 12);
    expect(mapped.originComputeId).toBeUndefined();
  });

  it('frameDelivery_leavesComputeFieldsAbsentOnReusedFrames', () => {
    const message: FrameMessage = {
      ...frame(6, 'stable'),
      provenance: { source: 'recolor', originComputeId: 9 },
      workerTiming: { colorizeMs: 3 },
    };

    const mapped = frameDelivery(message, 7);
    expect(mapped).toEqual({
      source: 'recolor',
      originComputeId: 9,
      requestToPresentMs: 7,
      classifyMs: undefined,
      colorizeMs: 3,
      maxBandElapsedMs: undefined,
      imbalanceRatio: undefined,
      mergeCpuMs: undefined,
      bandsElapsedMs: undefined,
      yieldWaitMs: undefined,
      yieldCount: undefined,
    });
  });

  it('viewKeyHash_isStableAcrossEqualViewsAndSensitiveToComponents', () => {
    const viewport = { center: { re: -0.75, im: 0 }, spanY: 2.5 };
    const quality = { maxIterations: 512, maxPeriod: 32, coarseStride: 8 };
    expect(viewKeyHash(viewport, 'stability', quality)).toEqual(
      viewKeyHash({ ...viewport, center: { ...viewport.center } }, 'stability', { ...quality }),
    );
    expect(viewKeyHash(viewport, 'period', quality)).not.toEqual(
      viewKeyHash(viewport, 'stability', quality),
    );
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
