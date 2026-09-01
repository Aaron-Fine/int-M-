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
