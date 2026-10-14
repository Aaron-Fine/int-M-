/**
 * Contract shared between the microbench page (fixtures/, runs in the
 * browser) and the Playwright specs (tests/, run in Node). Runtime-free:
 * types and the runner-name union only, so both sides can import it.
 */

export interface EnvironmentSample {
  readonly hardwareConcurrency: number | null;
  readonly devicePixelRatio: number;
  readonly userAgent: string;
  /** Cold echo-worker spawn plus one 16 KiB roundtrip; a worker sanity probe. */
  readonly echoWorkerRoundtripMs: number;
}

export interface MicrobenchApi {
  readonly runnerNames: readonly string[];
  run(name: string, params?: unknown): Promise<unknown>;
}

declare global {
  interface Window {
    __miPocBench: MicrobenchApi;
  }
}

/* ---------- pool sizing (workstream K, milestone M2) ---------- */

export type QualityProfileId = 'quick' | 'balanced' | 'detailed';

export interface PoolSizingParams {
  readonly caseId: string;
  readonly profileId: QualityProfileId;
  readonly edge: number;
  readonly sizes: readonly number[];
  readonly warmupReps: number;
  readonly measuredReps: number;
}

export interface PoolBandSample {
  readonly jobId: number;
  readonly y0: number;
  readonly y1: number;
  /** Main-thread receive time relative to the first postMessage, in ms. */
  readonly receivedAtMs: number;
  readonly yieldWaitMs: number;
  readonly yieldCount: number;
}

export interface PoolSizingSample {
  readonly workerCount: number;
  readonly phase: 'warmup' | 'measured';
  readonly rep: number;
  /** postMessage(first band) until every band was received and merged. */
  readonly wallMs: number;
  readonly mergeMs: number;
  readonly yieldWaitMs: number;
  readonly yieldCount: number;
  readonly bands: readonly PoolBandSample[];
}

export interface PoolSizingResult {
  readonly caseId: string;
  readonly profileId: QualityProfileId;
  readonly edge: number;
  readonly quality: {
    readonly maxIterations: number;
    readonly maxPeriod: number;
    readonly coarseStride: number;
  };
  readonly viewport: {
    readonly centerRe: number;
    readonly centerIm: number;
    readonly spanY: number;
  };
  readonly hardwareConcurrency: number | null;
  /** Worker-object construction time per size; module fetch/compile lands in the warmup rep. */
  readonly spawnMsByWorkerCount: Record<string, number>;
  readonly samples: readonly PoolSizingSample[];
}

/* ---------- yield mechanism / zero-copy / band order (plan §12, M3) ---------- */

export type YieldMechanism = 'settimeout' | 'messagechannel';

export interface YieldChainEntry {
  readonly mechanism: YieldMechanism;
  /** Raw per-hop latency (ms), hop order preserved so the clamp is visible. */
  readonly perHopMs: readonly number[];
}

export interface YieldCancelSample {
  readonly rep: number;
  readonly mechanism: YieldMechanism;
  /** cancel() until the workload loop actually exited. */
  readonly quiescenceMs: number;
  readonly rowReached: number;
  readonly workloadWallMs: number;
}

export interface YieldAbResult {
  readonly hops: number;
  readonly cancelReps: number;
  readonly chains: readonly YieldChainEntry[];
  readonly cancelSamples: readonly YieldCancelSample[];
}

export interface ZeroCopySample {
  readonly rep: number;
  readonly mode: 'copy' | 'transfer';
  /** Main-thread duration of the postMessage call itself. */
  readonly postMs: number;
  /** Main post until the echoed channels were back on the main thread. */
  readonly roundtripMs: number;
  readonly bytes: number;
  readonly intact: boolean;
}

export interface ZeroCopyResult {
  readonly width: number;
  readonly height: number;
  readonly bytesPerRoundtrip: number;
  readonly repsPerMode: number;
  readonly samples: readonly ZeroCopySample[];
}

export interface BandOrderSample {
  readonly profile: 'uniform' | 'edges-heavy';
  readonly strategy: BandOrderStrategy;
  readonly rep: number;
  readonly ttfbMs: number;
  readonly t50RowsMs: number;
  readonly totalMs: number;
}

export type BandOrderStrategy = 'top-to-bottom' | 'center-out';

export interface BandOrderResult {
  readonly rows: number;
  readonly bandCount: number;
  readonly rowsPerBand: number;
  readonly workerCount: number;
  readonly reps: number;
  readonly samples: readonly BandOrderSample[];
}

export interface YieldAbParams {
  readonly hops: number;
  readonly cancelReps: number;
}

export interface ZeroCopyParams {
  readonly repsPerMode: number;
}

export interface BandOrderParams {
  readonly rows: number;
  readonly bandCount: number;
  readonly workerCount: number;
  readonly reps: number;
}

/* ---------- coarse-pass cost-estimate quality (workstream N input, M5) ---------- */

export interface CoarseCostParams {
  readonly caseId: string;
  readonly profileId: QualityProfileId;
  /** Square raster edge for both the coarse and the stable pass. */
  readonly edge: number;
  /** Untimed stable rows classified before the measured pass (JIT/IC warm). */
  readonly warmupRows: number;
}

/** Per-coarse-row aggregates read back from the real coarse semantic frame. */
export interface CoarseRowSample {
  /** Raster row of the coarse block origin (blocks are stride tall). */
  readonly y: number;
  readonly pixels: number;
  readonly escaped: number;
  readonly attracting: number;
  readonly unresolved: number;
  readonly unresolvedFraction: number;
  /** Mean smooth escape iteration over escaped coarse pixels; 0 if none. */
  readonly meanEscapeIteration: number;
  /**
   * Cost model available to workstream N: escaped pixels cost their escape
   * iteration, everything else costs the coarse iteration budget (units:
   * iterations per pixel, mean over the row's coarse pixels).
   */
  readonly estimatedCostUnits: number;
}

export interface StableRowSample {
  readonly y: number;
  /** classifyRows timing.classifyMs: compute only, yield waits excluded. */
  readonly classifyMs: number;
  readonly yieldWaitMs: number;
  readonly yieldCount: number;
}

export interface CoarseCostResult {
  readonly caseId: string;
  readonly profileId: QualityProfileId;
  readonly edge: number;
  readonly warmupRows: number;
  readonly coarseStride: number;
  readonly coarseQuality: {
    readonly maxIterations: number;
    readonly maxPeriod: number;
  };
  readonly stableQuality: {
    readonly maxIterations: number;
    readonly maxPeriod: number;
  };
  readonly viewport: {
    readonly centerRe: number;
    readonly centerIm: number;
    readonly spanY: number;
  };
  readonly coarseRows: readonly CoarseRowSample[];
  readonly stableRows: readonly StableRowSample[];
}

/* ---------- conjugate mirroring (workstream M, M4) ---------- */

export interface MirrorParityMismatch {
  readonly y: number;
  readonly x: number;
  readonly field: string;
  readonly fullValue: number | string;
  readonly mirroredValue: number | string;
}

export interface ConjugateMirrorParams {
  /** Labels the derived symmetric view in results (corpus case or variant). */
  readonly viewId: string;
  /** Exact corpus decimal strings; converted to binary64 in the page. */
  readonly centerRe: string;
  readonly spanY: string;
  readonly edge: number;
  readonly profileId: QualityProfileId;
  /** Untimed full cycle of both arms before the measured reps (JIT/IC warm). */
  readonly warmupReps: number;
  readonly reps: number;
}

export interface ConjugateMirrorResult {
  readonly viewId: string;
  readonly centerRe: number;
  readonly spanY: number;
  readonly edge: number;
  readonly profileId: QualityProfileId;
  readonly warmupReps: number;
  readonly quality: {
    readonly maxIterations: number;
    readonly maxPeriod: number;
    readonly coarseStride: number;
  };
  readonly samples: readonly {
    readonly rep: number;
    readonly fullMs: number;
    readonly halfMs: number;
    readonly mirrorFillMs: number;
    readonly combinedMs: number;
  }[];
  readonly parity: {
    readonly pixelsCompared: number;
    readonly mismatchCount: number;
    readonly mismatchesByField: Record<string, number>;
    readonly examples: readonly MirrorParityMismatch[];
  };
}
