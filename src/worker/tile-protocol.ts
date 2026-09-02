import type { ClassifierMode, RasterSize, RenderQuality, Viewport } from '../domain';
import type { YieldMechanism } from '../render/yield-scheduler';

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
}

export interface TileResultMessage {
  readonly type: 'tile-result';
  readonly generation: number;
  readonly jobId: number;
  readonly y0: number;
  readonly y1: number;
  readonly status: Uint8Array<ArrayBuffer>;
  readonly period: Uint32Array<ArrayBuffer>;
  readonly smoothIterationOrMultiplierMagnitude: Float64Array<ArrayBuffer>;
  readonly multiplierAngle: Float64Array<ArrayBuffer>;
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
