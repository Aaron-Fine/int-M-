import type {
  ClassifierMode,
  Complex,
  OrbitResult,
  RasterSize,
  RenderQuality,
  SemanticView,
  Viewport,
} from '../domain';
import type { BandOrder, RenderStage } from '../render';

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
   * and workers keep the 'legacy-scan' default.
   */
  readonly classifierMode?: ClassifierMode;
  /**
   * Diagnostic stable-band dispatch order (renderer-path detail evidence).
   * Additive optional field: absent on the default path (center-out order).
   */
  readonly bandOrder?: BandOrder;
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

export interface WorkerFrameTiming {
  readonly classifyMs: number;
  readonly colorizeMs: number;
  readonly yieldWaitMs: number;
  readonly yieldCount: number;
  /** Tiled stable pass only: per-band completion elapsed, indexed by band (row order). */
  readonly bandsElapsedMs?: readonly number[];
}

export interface FrameMessage {
  readonly type: 'frame';
  readonly requestId: RequestId;
  readonly stage: RenderStage;
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray<ArrayBuffer>;
  readonly progress: number;
  readonly workerTiming?: WorkerFrameTiming;
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
  FrameMessage | InspectionMessage | CancelledMessage | WorkerErrorMessage;
