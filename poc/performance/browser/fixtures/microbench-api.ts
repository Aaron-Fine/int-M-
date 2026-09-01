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
