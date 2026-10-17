import type { RasterSize, RenderQuality, Viewport } from '../domain';
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
  /**
   * Supervisor-allocated band views the worker classifies into and transfers
   * back. Always present on the tile path.
   */
  readonly bandOutput: TileBandOutput;
  /** Frozen packed status+period encoding of the bandOutput views. */
  readonly outputRevision: typeof PACKED_OUTPUT_REVISION;
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
