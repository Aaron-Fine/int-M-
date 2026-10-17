/**
 * Memory high-water figures for the release harness (MI-PERF-006). Pure
 * summarizing and labelling; the browser pass that produces the readings is
 * passes/memory.ts.
 *
 * What each engine honestly exposes through Playwright:
 * - Chromium, CDP Performance.getMetrics JSHeapUsedSize: the main-thread V8
 *   JS heap only (no worker heaps, no ArrayBuffer backing stores, which is
 *   where the semantic frames live). Polled, so a lower bound on the peak.
 * - Chromium, performance.measureUserAgentSpecificMemory(): an estimate over
 *   the whole agent cluster (same-origin workers included). Needs a
 *   cross-origin-isolated page, forces a GC, and is a post-render snapshot,
 *   not a peak during computation.
 * - Firefox (WebDriver BiDi): no CDP, no performance.memory, no
 *   measureUserAgentSpecificMemory, and about:memory is unreachable. Nothing
 *   honest is available, so it is recorded as "not measured". Process RSS from
 *   outside the browser is a whole-browser proxy and is not used.
 */

export type MemoryEngine = 'chromium' | 'firefox';

export interface MemoryReading {
  readonly caseId: string;
  readonly bytes: number;
}

export type MemoryFigure =
  | {
      readonly status: 'measured';
      readonly label: string;
      readonly highWaterBytes: number;
      readonly atCaseId: string;
      readonly samples: number;
    }
  | { readonly status: 'not measured'; readonly reason: string };

export interface EngineMemory {
  readonly jsHeap: MemoryFigure;
  readonly retained: MemoryFigure;
}

export const JS_HEAP_LABEL =
  'Main-thread V8 JS heap used (CDP Performance.getMetrics JSHeapUsedSize), polled every 50 ms from navigation to the stable frame; excludes worker heaps and ArrayBuffer backing stores; a lower bound on the true peak';
export const RETAINED_LABEL =
  'performance.measureUserAgentSpecificMemory() total after the stable frame, in a cross-origin-isolated copy of the same build (includes same-origin workers and buffers); a post-render snapshot, not the peak during computation';

export const MEMORY_TABLE_HEADERS: readonly string[] = [
  'Figure',
  'Status',
  'High-water',
  'At case',
  'Samples',
  'Basis',
];

export const notMeasured = (reason: string): MemoryFigure => ({ status: 'not measured', reason });

/** A figure whose measurement threw: recorded as not measured with the error, never fatal. */
export const memoryPassFailure = (error: unknown): MemoryFigure =>
  notMeasured(`memory pass failed: ${error instanceof Error ? error.message : String(error)}`);

/** The maximum valid reading; readings that are not finite non-negative numbers are dropped. */
export const summarizeReadings = (
  label: string,
  readings: readonly MemoryReading[],
  emptyReason: string,
): MemoryFigure => {
  const valid = readings.filter((reading) => Number.isFinite(reading.bytes) && reading.bytes >= 0);
  let best: MemoryReading | undefined;
  for (const reading of valid) {
    if (best === undefined || reading.bytes > best.bytes) best = reading;
  }
  if (best === undefined) return notMeasured(emptyReason);
  return {
    status: 'measured',
    label,
    highWaterBytes: best.bytes,
    atCaseId: best.caseId,
    samples: valid.length,
  };
};

/** An engine with no honest memory measurement under Playwright. */
export const unsupportedEngineMemory = (engine: MemoryEngine): EngineMemory => {
  const reason =
    engine === 'firefox'
      ? 'Firefox over WebDriver BiDi exposes no CDP, performance.memory or measureUserAgentSpecificMemory'
      : `${engine} memory measurement is unavailable`;
  return { jsHeap: notMeasured(reason), retained: notMeasured(reason) };
};

/** Evidence files written before the memory pass existed (--resume). */
export const notRecordedMemory = (): EngineMemory => ({
  jsHeap: notMeasured('not recorded in this evidence file'),
  retained: notMeasured('not recorded in this evidence file'),
});

export const formatMiB = (bytes: number): string => `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;

const rowOf = (name: string, figure: MemoryFigure): string[] =>
  figure.status === 'measured'
    ? [
        name,
        'measured',
        formatMiB(figure.highWaterBytes),
        figure.atCaseId,
        String(figure.samples),
        figure.label,
      ]
    : [name, 'not measured', 'n/a', 'n/a', '0', figure.reason];

export const memoryRows = (memory: EngineMemory): string[][] => [
  rowOf('JS heap (main thread)', memory.jsHeap),
  rowOf('Retained after stable (all workers)', memory.retained),
];
