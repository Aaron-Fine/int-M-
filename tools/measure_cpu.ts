import { cpus, platform, release, totalmem } from 'node:os';

import { CpuRenderer, RenderCancelledError, type DynamicsRenderRequest } from '../src/render';

interface MeasurementCase {
  readonly id: string;
  readonly request: DynamicsRenderRequest;
}

interface RenderTiming {
  readonly coarseMs: number;
  readonly stableMs: number;
  readonly totalMs: number;
  readonly semanticBytes: number;
}

const CASES: readonly MeasurementCase[] = [
  {
    id: 'full-set-512',
    request: {
      viewport: { center: { re: -0.5, im: 0 }, spanY: 2.5 },
      size: { width: 512, height: 384 },
      quality: { maxIterations: 512, maxPeriod: 32, coarseStride: 8 },
    },
  },
  {
    id: 'period-three-neighborhood-768',
    request: {
      viewport: { center: { re: -0.12, im: 0.74 }, spanY: 0.35 },
      size: { width: 768, height: 512 },
      quality: { maxIterations: 512, maxPeriod: 32, coarseStride: 8 },
    },
  },
];

const roundMilliseconds = (value: number): number => Math.round(value * 100) / 100;

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const value =
    sorted.length % 2 === 0
      ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
      : (sorted[middle] ?? 0);
  return roundMilliseconds(value);
};

const measureRender = async (
  renderer: CpuRenderer,
  measurementCase: MeasurementCase,
): Promise<RenderTiming> => {
  const started = performance.now();
  let coarseAt = started;
  let stableAt = started;
  let semanticBytes = 0;

  await renderer.render(measurementCase.request, new AbortController().signal, (frame) => {
    semanticBytes =
      frame.status.byteLength +
      frame.period.byteLength +
      frame.smoothIterationOrMultiplierMagnitude.byteLength +
      frame.multiplierAngle.byteLength;
    if (frame.stage === 'coarse') coarseAt = performance.now();
    if (frame.stage === 'stable') stableAt = performance.now();
  });

  return {
    coarseMs: roundMilliseconds(coarseAt - started),
    stableMs: roundMilliseconds(stableAt - coarseAt),
    totalMs: roundMilliseconds(stableAt - started),
    semanticBytes,
  };
};

const measureCancellationAfterCoarse = async (
  renderer: CpuRenderer,
  measurementCase: MeasurementCase,
): Promise<number> => {
  const controller = new AbortController();
  let abortedAt = 0;
  try {
    await renderer.render(measurementCase.request, controller.signal, (frame) => {
      if (frame.stage === 'coarse') {
        abortedAt = performance.now();
        controller.abort();
      }
    });
  } catch (error: unknown) {
    if (!(error instanceof RenderCancelledError)) throw error;
    return roundMilliseconds(performance.now() - abortedAt);
  }
  throw new Error('cancellation measurement completed without cancellation');
};

const sampleCount = Number.parseInt(process.env['INTM_EVIDENCE_SAMPLES'] ?? '3', 10);
if (!Number.isInteger(sampleCount) || sampleCount < 1 || sampleCount > 10) {
  throw new RangeError('INTM_EVIDENCE_SAMPLES must be an integer from 1 through 10');
}

const renderer = new CpuRenderer();
const measurements = [];
for (const measurementCase of CASES) {
  const samples: RenderTiming[] = [];
  for (let sample = 0; sample < sampleCount; sample += 1) {
    samples.push(await measureRender(renderer, measurementCase));
  }
  const cancellationMs = await measureCancellationAfterCoarse(renderer, measurementCase);
  measurements.push({
    id: measurementCase.id,
    viewport: measurementCase.request.viewport,
    size: measurementCase.request.size,
    quality: measurementCase.request.quality,
    samples,
    median: {
      coarseMs: median(samples.map((sample) => sample.coarseMs)),
      stableMs: median(samples.map((sample) => sample.stableMs)),
      totalMs: median(samples.map((sample) => sample.totalMs)),
      cancellationAfterCoarseMs: cancellationMs,
      semanticBytes: samples[0]?.semanticBytes ?? 0,
    },
  });
}

const cpuList = cpus();
const report = {
  schemaVersion: 1,
  measuredAt: new Date().toISOString(),
  renderer: 'cpu-binary64',
  executionMode: 'Node process invoking the production CpuRenderer directly',
  environment: {
    node: process.version,
    platform: platform(),
    platformRelease: release(),
    logicalCpuCount: cpuList.length,
    cpuModel: cpuList[0]?.model ?? 'unknown',
    totalMemoryBytes: totalmem(),
    note: 'Node harness measures numerical rendering, not browser main-thread long tasks.',
  },
  sampleCount,
  measurements,
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
