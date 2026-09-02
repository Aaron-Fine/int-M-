import type { RenderQuality, SemanticView, Viewport } from '../domain';
import type { FrameMessage } from '../worker/protocol';

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
export type FrameSource = 'computed' | 'semantic-cache' | 'inflight-replay' | 'recolor';
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
  /** Colorization cost; fresh work for computed and recolor frames only. */
  readonly colorizeMs?: number | undefined;
  readonly maxBandElapsedMs?: number | undefined;
  readonly imbalanceRatio?: number | undefined;
  readonly mergeCpuMs?: number | undefined;
  /**
   * Tiled stable pass only: per-band completion elapsed from dispatch start,
   * indexed by band in row order (band-boundary observability, plan §8).
   */
  readonly bandsElapsedMs?: readonly number[] | undefined;
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
  readonly source?: FrameSource | undefined;
  readonly originComputeId?: number | undefined;
  readonly requestToPresentMs: number;
  readonly workerWallMs?: number | undefined;
  readonly colorizeMs?: number | undefined;
  readonly maxBandElapsedMs?: number | undefined;
  readonly imbalanceRatio?: number | undefined;
  readonly mergeCpuMs?: number | undefined;
  readonly bandsElapsedMs?: readonly number[] | undefined;
}

export interface RenderTraceRingOptions {
  readonly capacity?: number;
  /** Opt-in diagnostic hook boundary; no counters mode is built here. */
  readonly onTraceCompleted?: ((trace: RenderTrace) => void) | undefined;
}

interface OpenRequest {
  readonly summary: RenderRequestSummary;
  readonly frames: FrameTrace[];
  mainLongTaskCount: number;
  maxMainLongTaskMs: number;
}

export interface RenderTraceRing {
  readonly capacity: number;
  /** Begins a request summary. Any request it displaces is recorded as superseded. */
  beginRequest(summary: RenderRequestSummary): void;
  recordFrame(frame: FrameMessage, delivery: FrameDelivery): void;
  recordCancellation(
    requestId: number | string,
    cancelAckMs: number,
    childQuiescenceMs?: number,
  ): void;
  failOpenRequests(): void;
  noteMainThreadLongTask(durationMs: number): void;
  snapshot(): readonly RenderTrace[];
}

/** Computes the frame trace, dropping compute fields for non-computed sources. */
const toFrameTrace = (frame: FrameMessage, delivery: FrameDelivery): FrameTrace => {
  const source = delivery.source ?? 'computed';
  const computed = source === 'computed';
  const colorized = computed || source === 'recolor';
  const originComputeId = delivery.originComputeId;
  return {
    stage: frame.stage,
    source,
    originComputeId,
    requestToPresentMs: delivery.requestToPresentMs,
    workerWallMs: computed ? delivery.workerWallMs : undefined,
    colorizeMs: colorized ? delivery.colorizeMs : undefined,
    maxBandElapsedMs: computed ? delivery.maxBandElapsedMs : undefined,
    imbalanceRatio: computed ? delivery.imbalanceRatio : undefined,
    mergeCpuMs: computed ? delivery.mergeCpuMs : undefined,
    bandsElapsedMs: computed ? delivery.bandsElapsedMs : undefined,
  };
};

export const createRenderTraceRing = (options: RenderTraceRingOptions = {}): RenderTraceRing => {
  const capacity = options.capacity ?? RENDER_TRACE_RING_CAPACITY;
  const completed: RenderTrace[] = [];
  const open = new Map<number | string, OpenRequest>();

  const finalize = (
    request: OpenRequest,
    outcome: RenderOutcome,
    cancellation: {
      cancelAckMs?: number | undefined;
      childQuiescenceMs?: number | undefined;
    } = {},
  ): void => {
    open.delete(request.summary.requestId);
    const trace: RenderTrace = Object.freeze({
      ...request.summary,
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
        frames: [],
        mainLongTaskCount: 0,
        maxMainLongTaskMs: 0,
      });
    },
    recordFrame(frame: FrameMessage, delivery: FrameDelivery): void {
      const request = open.get(frame.requestId);
      if (request === undefined) return;
      request.frames.push(toFrameTrace(frame, delivery));
      if (frame.stage === 'stable') finalize(request, 'completed');
    },
    recordCancellation(
      requestId: number | string,
      cancelAckMs: number,
      childQuiescenceMs?: number,
    ): void {
      const request = open.get(requestId);
      if (request === undefined) return;
      finalize(request, 'cancelled', { cancelAckMs, childQuiescenceMs });
    },
    failOpenRequests(): void {
      for (const request of [...open.values()]) finalize(request, 'failed');
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
