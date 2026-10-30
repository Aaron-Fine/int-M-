import type { ChildLocation } from '../domain/child-component';
import type {
  Complex,
  OrbitResult,
  PeriodKey,
  RasterSize,
  RenderQuality,
  SemanticView,
  Viewport,
} from '../domain';
import type { DynamicsPortrait } from '../domain/dynamics-portrait';
import type { RenderStage } from '../render';

export type RequestId = string | number;

export interface RenderMessage {
  readonly type: 'render';
  readonly requestId: RequestId;
  readonly viewport: Viewport;
  readonly size: RasterSize;
  readonly semanticView: SemanticView;
  readonly quality?: Partial<RenderQuality>;
  /**
   * Period view only: dim every pixel not of this period (legend isolation,
   * MI-UX-018). A palette input: never part of the semantic cache key.
   */
  readonly isolatedPeriod?: number;
  /** Period view only: outline this period's regions (legend preview). A palette input. */
  readonly outlinedPeriod?: number;
}

export interface InspectMessage {
  readonly type: 'inspect';
  readonly requestId: RequestId;
  readonly point: Complex;
  readonly quality?: Partial<RenderQuality>;
  /** Also post a dynamical-plane portrait after the inspection (inspector companion). */
  readonly portrait?: boolean;
}

export interface CancelMessage {
  readonly type: 'cancel';
  /** ID of the render request to cancel. */
  readonly requestId: RequestId;
}

/** The component lens: locate the p/q child of the component holding `point`. */
export interface LocateChildMessage {
  readonly type: 'locate-child';
  readonly requestId: RequestId;
  /** An attracting parameter of the parent component: the inspected point. */
  readonly point: Complex;
  /** The parent's period, as the inspection reported it. */
  readonly period: number;
  readonly rotation: ChildRotation;
}

export interface ChildRotation {
  readonly numerator: number;
  readonly denominator: number;
}

export type MainToWorkerMessage =
  RenderMessage | InspectMessage | LocateChildMessage | CancelMessage;

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
 * - `semantic-cache`: a completed cached frame in the semantic view and
 *   period emphasis (isolation and outline) it was last delivered in.
 * - `recolor`: a completed cached frame delivered in a different semantic
 *   view or period emphasis (the palette-only recolor path).
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
   * Period view only: the period-to-color mapping the raster was drawn with,
   * ranked from this delivery's own semantic frame (PLAN §8, MI-UX-018).
   */
  readonly periodKey?: PeriodKey;
  /** Period view only: the period the raster leaves undimmed. */
  readonly isolatedPeriod?: number;
  /** Period view only: the period whose regions the raster outlines. */
  readonly outlinedPeriod?: number;
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

/** Display-only companion of an inspection: the filled Julia set, critical orbit and cycle. */
export interface PortraitMessage {
  readonly type: 'portrait';
  readonly requestId: RequestId;
  readonly point: Complex;
  readonly portrait: DynamicsPortrait;
}

/** The located child, or why it was refused (locateChildComponent). */
export interface ChildComponentMessage {
  readonly type: 'child-component';
  readonly requestId: RequestId;
  readonly rotation: ChildRotation;
  readonly location: ChildLocation;
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
  | FrameMessage
  | InspectionMessage
  | PortraitMessage
  | ChildComponentMessage
  | CancelAckMessage
  | CancelledMessage
  | WorkerErrorMessage;
