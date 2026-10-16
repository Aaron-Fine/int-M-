import type { DifferentialStats, RenderQuality, SemanticView, Viewport } from '../domain';
import type { FrameMessage, FrameSource } from '../worker/protocol';

/**
 * Bounded always-on render observability (performance plan §8).
 *
 * The ring retains the last RENDER_TRACE_RING_CAPACITY request summaries in
 * the UI. There is no telemetry, no per-pixel timer, and no User Timing mark
 * is ever emitted from this module; the only escape hatch is the opt-in
 * onTraceCompleted hook. Retention is bounded by design (well under the 64 KiB
 * budget: numeric summaries only, never pixel data).
 */

export const RENDER_TRACE_RING_CAPACITY = 32;

export type FrameStage = 'coarse' | 'stable' | 'refined';
export type { FrameSource } from '../worker/protocol';
export type RenderOutcome = 'completed' | 'cancelled' | 'failed' | 'superseded';

export interface FrameTrace {
  readonly stage: FrameStage;
  readonly source: FrameSource;
  /** Set when this frame reused semantic work identified by an earlier computeId. */
  readonly originComputeId?: number | undefined;
  /**
   * Fresh delivery timing: request start to the next presentation opportunity
   * after image upload. Present on every frame regardless of source; it is not
   * proof of physical paint.
   */
  readonly requestToPresentMs: number;
  /** Compute fields. Absent — never zero, never copied — on non-computed frames. */
  readonly workerWallMs?: number | undefined;
  /**
   * The worker's classification wall for this frame (tiled stable pass:
   * dispatch to last band with row yields subtracted, mirror fill included).
   */
  readonly classifyMs?: number | undefined;
  /**
   * Colorization cost of this delivery. Every delivery colorizes in the
   * current architecture (cache, replay, and recolor included), so it is
   * fresh work on every source.
   */
  readonly colorizeMs?: number | undefined;
  readonly maxBandElapsedMs?: number | undefined;
  readonly imbalanceRatio?: number | undefined;
  readonly mergeCpuMs?: number | undefined;
  /**
   * Tiled stable pass only: per-band completion elapsed from dispatch start,
   * indexed by band in row order (band-boundary observability, plan §8).
   */
  readonly bandsElapsedMs?: readonly number[] | undefined;
  /** Total time the frame's bands spent suspended at row yields. */
  readonly yieldWaitMs?: number | undefined;
  /** Number of row yields across the frame's bands. */
  readonly yieldCount?: number | undefined;
  /** Differential-mode disagreement record (classifierMode 'differential'). */
  readonly differential?: DifferentialStats | undefined;
}

export interface RenderTrace {
  /** Identifies UI intent. */
  readonly requestId: number | string;
  /** Identifies actual semantic work; survives rebinding and replay. */
  readonly computeId?: number | undefined;
  readonly viewKeyHash: string;
  readonly width: number;
  readonly height: number;
  readonly profile: string;
  readonly backend: string;
  readonly workerCount: number;
  readonly outcome: RenderOutcome;
  readonly frames: readonly FrameTrace[];
  /** User-visible acknowledgment of a cancel request. */
  readonly cancelAckMs?: number | undefined;
  /** All affected children stopping or the pool resetting. */
  readonly childQuiescenceMs?: number | undefined;
  /**
   * Main-thread Long Task summary (count/max). Populated from a Long Task
   * observer by the embedder; always zero when unobserved. Says nothing about
   * worker long tasks.
   */
  readonly mainLongTaskCount: number;
  readonly maxMainLongTaskMs: number;
}

export interface RenderRequestSummary {
  readonly requestId: number | string;
  readonly computeId?: number | undefined;
  readonly viewKeyHash: string;
  readonly width: number;
  readonly height: number;
  readonly profile: string;
  readonly backend: string;
  readonly workerCount: number;
}

export interface FrameDelivery {
  /** Required: an absent source is a protocol failure, never `computed`. */
  readonly source: FrameSource;
  /** The computation that produced a `computed` frame. */
  readonly computeId?: number | undefined;
  readonly originComputeId?: number | undefined;
  readonly requestToPresentMs: number;
  readonly workerWallMs?: number | undefined;
  readonly classifyMs?: number | undefined;
  readonly colorizeMs?: number | undefined;
  readonly maxBandElapsedMs?: number | undefined;
  readonly imbalanceRatio?: number | undefined;
  readonly mergeCpuMs?: number | undefined;
  readonly bandsElapsedMs?: readonly number[] | undefined;
  readonly yieldWaitMs?: number | undefined;
  readonly yieldCount?: number | undefined;
  readonly differential?: DifferentialStats | undefined;
}

export interface RenderTraceRingOptions {
  readonly capacity?: number;
  /** Opt-in diagnostic hook boundary. */
  readonly onTraceCompleted?: ((trace: RenderTrace) => void) | undefined;
}

interface OpenRequest {
  readonly summary: RenderRequestSummary;
  computeId: number | undefined;
  readonly frames: FrameTrace[];
  mainLongTaskCount: number;
  maxMainLongTaskMs: number;
}

interface CancellingRequest {
  readonly request: OpenRequest;
  readonly requestedAtMs: number;
  cancelAckMs: number | undefined;
}

/**
 * Cancelled requests awaiting quiescence. A new request does not supersede
 * them; the oldest is closed without quiescence timing when this overflows.
 */
export const RENDER_TRACE_CANCELLING_CAPACITY = 4;

export interface RenderTraceRing {
  readonly capacity: number;
  /** Begins a request summary. Any request it displaces is recorded as superseded. */
  beginRequest(summary: RenderRequestSummary): void;
  recordFrame(frame: FrameMessage, delivery: FrameDelivery): void;
  /**
   * The UI asked the worker to cancel an open request (main-thread clock).
   * The request leaves the open set and waits for acknowledgment and
   * quiescence; duplicate calls are ignored.
   */
  requestCancellation(requestId: number | string, requestedAtMs: number): void;
  /** The worker accepted the cancel. Idempotent; late or unknown IDs are ignored. */
  recordCancellationAck(requestId: number | string, atMs: number): void;
  /**
   * The cancelled work and every child have stopped. Closes the trace as
   * `cancelled`. Idempotent; late or unknown IDs are ignored.
   */
  recordCancellationQuiesced(requestId: number | string, atMs: number): void;
  failOpenRequests(): void;
  noteMainThreadLongTask(durationMs: number): void;
  snapshot(): readonly RenderTrace[];
}

/** Computes the frame trace, dropping compute fields for non-computed sources. */
const toFrameTrace = (frame: FrameMessage, delivery: FrameDelivery): FrameTrace => {
  const source = delivery.source;
  const computed = source === 'computed';
  return {
    stage: frame.stage,
    source,
    originComputeId: computed ? undefined : delivery.originComputeId,
    requestToPresentMs: delivery.requestToPresentMs,
    workerWallMs: computed ? delivery.workerWallMs : undefined,
    classifyMs: computed ? delivery.classifyMs : undefined,
    colorizeMs: delivery.colorizeMs,
    maxBandElapsedMs: computed ? delivery.maxBandElapsedMs : undefined,
    imbalanceRatio: computed ? delivery.imbalanceRatio : undefined,
    mergeCpuMs: computed ? delivery.mergeCpuMs : undefined,
    bandsElapsedMs: computed ? delivery.bandsElapsedMs : undefined,
    yieldWaitMs: computed ? delivery.yieldWaitMs : undefined,
    yieldCount: computed ? delivery.yieldCount : undefined,
    differential: computed ? delivery.differential : undefined,
  };
};

export const createRenderTraceRing = (options: RenderTraceRingOptions = {}): RenderTraceRing => {
  const capacity = options.capacity ?? RENDER_TRACE_RING_CAPACITY;
  const completed: RenderTrace[] = [];
  const open = new Map<number | string, OpenRequest>();
  const cancelling = new Map<number | string, CancellingRequest>();

  const finalize = (
    request: OpenRequest,
    outcome: RenderOutcome,
    cancellation: {
      cancelAckMs?: number | undefined;
      childQuiescenceMs?: number | undefined;
    } = {},
  ): void => {
    open.delete(request.summary.requestId);
    cancelling.delete(request.summary.requestId);
    const trace: RenderTrace = Object.freeze({
      ...request.summary,
      computeId: request.computeId,
      outcome,
      frames: Object.freeze([...request.frames]),
      cancelAckMs: cancellation.cancelAckMs,
      childQuiescenceMs: cancellation.childQuiescenceMs,
      mainLongTaskCount: request.mainLongTaskCount,
      maxMainLongTaskMs: request.maxMainLongTaskMs,
    });
    completed.push(trace);
    if (completed.length > capacity) completed.shift();
    options.onTraceCompleted?.(trace);
  };

  return {
    capacity,
    beginRequest(summary: RenderRequestSummary): void {
      // The UI holds one active render intent; beginning a request supersedes
      // every still-open request, which also bounds the open set.
      for (const pending of [...open.values()]) finalize(pending, 'superseded');
      open.set(summary.requestId, {
        summary,
        computeId: summary.computeId,
        frames: [],
        mainLongTaskCount: 0,
        maxMainLongTaskMs: 0,
      });
    },
    recordFrame(frame: FrameMessage, delivery: FrameDelivery): void {
      // A stable frame that raced ahead of its cancel completes the request;
      // the late acknowledgment and quiescence are then ignored.
      const request = open.get(frame.requestId) ?? cancelling.get(frame.requestId)?.request;
      if (request === undefined) return;
      if (delivery.source === 'computed' && delivery.computeId !== undefined) {
        request.computeId ??= delivery.computeId;
      }
      request.frames.push(toFrameTrace(frame, delivery));
      if (frame.stage === 'stable') finalize(request, 'completed');
    },
    requestCancellation(requestId: number | string, requestedAtMs: number): void {
      const request = open.get(requestId);
      if (request === undefined) return;
      open.delete(requestId);
      cancelling.set(requestId, { request, requestedAtMs, cancelAckMs: undefined });
      if (cancelling.size > RENDER_TRACE_CANCELLING_CAPACITY) {
        const [oldest] = cancelling.values();
        if (oldest !== undefined) {
          finalize(oldest.request, 'cancelled', { cancelAckMs: oldest.cancelAckMs });
        }
      }
    },
    recordCancellationAck(requestId: number | string, atMs: number): void {
      const entry = cancelling.get(requestId);
      if (entry === undefined || entry.cancelAckMs !== undefined) return;
      entry.cancelAckMs = atMs - entry.requestedAtMs;
    },
    recordCancellationQuiesced(requestId: number | string, atMs: number): void {
      const entry = cancelling.get(requestId);
      if (entry === undefined) return;
      finalize(entry.request, 'cancelled', {
        cancelAckMs: entry.cancelAckMs,
        childQuiescenceMs: atMs - entry.requestedAtMs,
      });
    },
    failOpenRequests(): void {
      for (const request of [...open.values()]) finalize(request, 'failed');
      for (const entry of [...cancelling.values()]) finalize(entry.request, 'failed');
    },
    noteMainThreadLongTask(durationMs: number): void {
      const request = open.values().next().value;
      if (request === undefined) return;
      request.mainLongTaskCount += 1;
      request.maxMainLongTaskMs = Math.max(request.maxMainLongTaskMs, durationMs);
    },
    snapshot(): readonly RenderTrace[] {
      return completed.map((trace) => Object.freeze({ ...trace, frames: [...trace.frames] }));
    },
  };
};

/**
 * The single protocol-to-trace mapping (plan §8): provenance and worker
 * metrics pass through unchanged; only `requestToPresentMs` is measured on the
 * main thread. Band imbalance derives from the frame's own band snapshot and
 * is absent when there are no finite band timings.
 */
export const frameDelivery = (frame: FrameMessage, requestToPresentMs: number): FrameDelivery => {
  const provenance = frame.provenance;
  const timing = frame.workerTiming;
  const bands = timing?.bandsElapsedMs?.filter((value) => Number.isFinite(value)) ?? [];
  const maxBandElapsedMs = bands.length === 0 ? undefined : Math.max(...bands);
  const meanBandElapsedMs =
    bands.length === 0 ? 0 : bands.reduce((sum, value) => sum + value, 0) / bands.length;
  return {
    source: provenance.source,
    ...(provenance.source === 'computed'
      ? { computeId: provenance.computeId, workerWallMs: provenance.workerWallMs }
      : { originComputeId: provenance.originComputeId }),
    requestToPresentMs,
    classifyMs: timing?.classifyMs,
    colorizeMs: timing?.colorizeMs,
    maxBandElapsedMs,
    imbalanceRatio:
      maxBandElapsedMs === undefined || meanBandElapsedMs <= 0
        ? undefined
        : maxBandElapsedMs / meanBandElapsedMs,
    mergeCpuMs: timing?.mergeCpuMs,
    bandsElapsedMs: timing?.bandsElapsedMs,
    yieldWaitMs: timing?.yieldWaitMs,
    yieldCount: timing?.yieldCount,
    differential: frame.differential,
  };
};

/**
 * Deterministic short hash of everything that defines the semantic content of
 * a view (viewport, semantic view, and quality budget). Binary64 values are
 * rendered through their canonical shortest round-trip form.
 */
export const viewKeyHash = (
  viewport: Viewport,
  semanticView: SemanticView,
  quality: RenderQuality,
): string => {
  const key = [
    viewport.center.re,
    viewport.center.im,
    viewport.spanY,
    semanticView,
    quality.maxIterations,
    quality.maxPeriod,
    quality.coarseStride,
  ].join('\u001f');
  let hash = 0x811c9dc5;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

/**
 * Mirrors clampTileWorkers in src/worker/tile-pool.ts. Keep in sync until the
 * frame protocol reports the authoritative pool size per request.
 */
export const expectedWorkerCount = (hardwareConcurrency: number | undefined): number => {
  const workers = hardwareConcurrency ?? 0;
  return Math.min(4, Math.max(1, workers > 0 ? workers : 1));
};
