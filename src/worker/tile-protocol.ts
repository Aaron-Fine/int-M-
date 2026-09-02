import type { ClassifierMode, RasterSize, RenderQuality, Viewport } from '../domain';
import type { YieldMechanism } from '../render/yield-scheduler';
import type { PACKED_OUTPUT_REVISION } from '../render/packed-semantic';

/**
 * Pre-sliced per-band output views (zero-copy renderer-path detail): the
 * supervisor allocates them, transfers them with the classify message, and
 * the tile worker classifies directly into them, posting the same buffers
 * back with the transfer list. The supervisor-side merge becomes a no-op.
 */
export interface TileBandOutput {
  readonly y0: number;
  readonly y1: number;
  readonly packedStatusPeriod: Uint32Array<ArrayBuffer>;
  readonly smoothIterationOrMultiplierMagnitude: Float64Array<ArrayBuffer>;
  readonly multiplierAngle: Float64Array<ArrayBuffer>;
}

export interface TileClassifyMessage {
  readonly type: 'tile-classify';
  readonly generation: number;
  readonly jobId: number;
  readonly viewport: Viewport;
  readonly size: RasterSize;
  readonly y0: number;
  readonly y1: number;
  readonly quality: RenderQuality;
  /** Additive optional classifier mode; absent on the default path. */
  readonly classifierMode?: ClassifierMode;
  /**
   * Additive optional row-yield mechanism (renderer-path detail); absent =
   * the default MessageChannel scheduler.
   */
  readonly yieldMechanism?: YieldMechanism;
  /**
   * Additive optional zero-copy band views (renderer-path detail); absent on
   * the legacy-merge measurement arm, where the worker allocates its output.
   * Carries the packed-output revision it was allocated against.
   */
  readonly bandOutput?: TileBandOutput;
  /** Frozen packed status+period encoding of any bandOutput views. */
  readonly outputRevision?: typeof PACKED_OUTPUT_REVISION;
}

export interface TileResultMessage {
  readonly type: 'tile-result';
  readonly generation: number;
  readonly jobId: number;
  readonly y0: number;
  readonly y1: number;
  /** Packed status (high 8 bits) + primitive period (low 24 bits), poc-packed-1.0.0. */
  readonly packedStatusPeriod: Uint32Array<ArrayBuffer>;
  readonly smoothIterationOrMultiplierMagnitude: Float64Array<ArrayBuffer>;
  readonly multiplierAngle: Float64Array<ArrayBuffer>;
  /** Frozen packed status+period encoding of the returned buffers. */
  readonly outputRevision: typeof PACKED_OUTPUT_REVISION;
  readonly yieldWaitMs: number;
  readonly yieldCount: number;
}

export interface TileCancelMessage {
  readonly type: 'tile-cancel';
  readonly generation: number;
}

export interface TileErrorMessage {
  readonly type: 'tile-error';
  readonly generation: number;
  readonly jobId: number;
  readonly message: string;
}

export interface TileCancelledMessage {
  readonly type: 'tile-cancelled';
  readonly generation: number;
  readonly jobId: number;
}

export type SupervisorToTileMessage = TileClassifyMessage | TileCancelMessage;
export type TileToSupervisorMessage = TileResultMessage | TileErrorMessage | TileCancelledMessage;

export interface TileMessageEvent {
  readonly data: TileToSupervisorMessage;
}

export interface TileWorkerHandle {
  postMessage(message: SupervisorToTileMessage, transfer?: readonly ArrayBuffer[]): void;
  addEventListener(type: 'message', listener: (event: TileMessageEvent) => void): void;
  removeEventListener(type: 'message', listener: (event: TileMessageEvent) => void): void;
  terminate(): void;
}
