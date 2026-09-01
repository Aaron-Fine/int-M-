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
