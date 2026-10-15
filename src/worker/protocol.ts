import type {
  ClassifierMode,
  Complex,
  DifferentialStats,
  OrbitResult,
  RasterSize,
  RenderQuality,
  SemanticView,
  Viewport,
} from '../domain';
import type { BandOrder, FrameOutput, RenderStage } from '../render';
import type { PerfCounters } from '../render/perf-counters';
import type { YieldMechanism } from '../render/yield-scheduler';

export type RequestId = string | number;

export interface RenderMessage {
  readonly type: 'render';
  readonly requestId: RequestId;
  readonly viewport: Viewport;
  readonly size: RasterSize;
  readonly semanticView: SemanticView;
  readonly quality?: Partial<RenderQuality>;
  /**
   * Versioned classifier mode (Stage A opt-in wiring). Additive optional
   * field: absent on the default path, so default messages are byte-identical
   * and workers use the default 'triggered-scan' kernel.
   */
  readonly classifierMode?: ClassifierMode;
  /**
   * Diagnostic stable-band dispatch order (renderer-path detail evidence).
   * Additive optional field: absent on the default path (center-out order).
   */
  readonly bandOrder?: BandOrder;
  /**
   * Diagnostic stable-frame output path (renderer-path detail evidence).
   * Additive optional field: absent on the default path (zero-copy).
   */
  readonly frameOutput?: FrameOutput;
  /**
   * Diagnostic row-yield mechanism (renderer-path detail evidence).
   * Additive optional field: absent on the default path (MessageChannel).
   */
  readonly yieldMechanism?: YieldMechanism;
  /**
   * Opt-in diagnostics counters (plan §8, `?perf=1&perfCounters=1` wiring).
   * Additive optional field: absent on the default path, so default messages
   * stay byte-identical and no counters structure is allocated anywhere.
   */
  readonly perfCounters?: boolean;
  /**
   * Conjugate-symmetry row mirroring of the stable pass, default ON; `false`
   * disables it (`?perf=1&conjugateMirror=0`). Additive optional field:
   * absent on the default path.
   */
  readonly conjugateMirror?: boolean;
}

export interface InspectMessage {
  readonly type: 'inspect';
  readonly requestId: RequestId;
  readonly point: Complex;
  readonly quality?: Partial<RenderQuality>;
}

export interface CancelMessage {
  readonly type: 'cancel';
  /** ID of the render request to cancel. */
  readonly requestId: RequestId;
}

export type MainToWorkerMessage = RenderMessage | InspectMessage | CancelMessage;

/**
 * Worker timing of one delivery. `colorizeMs` is present on every delivery
 * (every delivery colorizes). The classification fields describe performed
 * semantic work: present on computed frames only, never copied onto a reused
 * frame and never encoded as zero for work that did not run.
 */
export interface WorkerFrameTiming {
  readonly classifyMs?: number;
  readonly colorizeMs: number;
  readonly yieldWaitMs?: number;
  readonly yieldCount?: number;
  /** Tiled stable pass only: per-band completion elapsed, indexed by band (row order). */
  readonly bandsElapsedMs?: readonly number[];
  /** Tiled stable pass only: supervisor-side merge/assembly cost. */
  readonly mergeCpuMs?: number;
}

/**
 * Which runtime branch produced a delivery (plan §8 observability). Set where
 * the delivery is made, never inferred downstream.
 *
 * - `computed`: a fresh renderer callback of the semantic computation
 *   `computeId` (a rebound in-flight computation keeps its ID).
 * - `inflight-replay`: the retained last frame of an active matching
 *   computation, re-delivered to a new request.
 * - `semantic-cache`: a completed cached frame in the semantic view it was
 *   last delivered in.
 * - `recolor`: a completed cached frame delivered in a different semantic
 *   view (the view-only recolor path).
 */
export type FrameSource = 'computed' | 'semantic-cache' | 'inflight-replay' | 'recolor';

export type FrameProvenance =
  | {
      readonly source: 'computed';
      /** Monotonic per worker runtime; identifies the semantic computation. */
      readonly computeId: number;
      /** Semantic-compute start through this frame's assembly. */
      readonly workerWallMs: number;
    }
  | {
      readonly source: 'semantic-cache' | 'inflight-replay' | 'recolor';
      /** The computation whose semantic work this delivery reuses. */
      readonly originComputeId: number;
    };

export interface FrameMessage {
  readonly type: 'frame';
  readonly requestId: RequestId;
  readonly stage: RenderStage;
  readonly provenance: FrameProvenance;
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray<ArrayBuffer>;
  readonly progress: number;
  readonly workerTiming?: WorkerFrameTiming;
  /**
   * Opt-in diagnostics counters (plan §8): per-band counters summed once per
   * frame. Additive optional field; absent unless the request opted in via
   * `?perf=1&perfCounters=1`.
   */
  readonly counters?: PerfCounters;
  /**
   * Differential-mode disagreement record (classifierMode 'differential'):
   * per-band stats summed once. Additive optional field; absent otherwise.
   */
  readonly differential?: DifferentialStats;
}

export interface InspectionResult {
  readonly point: Complex;
  readonly orbit: OrbitResult;
}

export interface InspectionMessage {
  readonly type: 'inspection';
  readonly requestId: RequestId;
  readonly result: InspectionResult;
}

/**
 * The runtime accepted a cancel request: the active computation for
 * `requestId` is aborted (or nothing was running for it). Posted on receipt
 * of the cancel, before any work has stopped.
 */
export interface CancelAckMessage {
  readonly type: 'cancel-ack';
  readonly requestId: RequestId;
}

/**
 * Quiescence: the cancelled computation's renderer promise has settled and
 * every nested tile worker has stopped (or the pool was reset). Always
 * follows the matching `cancel-ack` when the cancel was explicit; also posted
 * for a computation implicitly superseded by a different render.
 */
export interface CancelledMessage {
  readonly type: 'cancelled';
  readonly requestId: RequestId;
}

export interface WorkerErrorMessage {
  readonly type: 'error';
  readonly requestId: RequestId;
  readonly message: string;
}

export type WorkerToMainMessage =
  FrameMessage | InspectionMessage | CancelAckMessage | CancelledMessage | WorkerErrorMessage;
