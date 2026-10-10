/**
 * Helpers that let a candidate call the PRODUCTION render path and wrap the
 * result in the judge's RenderedFrame contract. Candidates should build on
 * these so that unpacking/colorizing is identical to baseline's.
 */
import {
  createOrbitSample,
  createViewportTransform,
  OrbitClassifier,
  OrbitScratch,
  type ClassifierMode,
  type SemanticView,
} from '../../../src/domain';
import { CpuRenderer, type DynamicsRenderRequest, type SemanticFrame } from '../../../src/render';
import { unpackPeriod, unpackStatus } from '../../../src/render/packed-semantic';
import type { Candidate, CaseRenderSpec, RenderedFrame, SemanticFields } from './types';

/** The production DynamicsRenderRequest for a spec, plus candidate-specific options. */
export const productionRequest = (
  spec: CaseRenderSpec,
  options: Partial<DynamicsRenderRequest> = {},
): DynamicsRenderRequest => ({
  viewport: spec.viewport,
  size: spec.size,
  quality: spec.quality,
  ...options,
});

/** Runs the production CpuRenderer and returns the stable (stride-1) frame. */
export const renderStableFrame = async (
  renderer: CpuRenderer,
  request: DynamicsRenderRequest,
): Promise<SemanticFrame> => {
  let stable: SemanticFrame | undefined;
  await renderer.render(request, new AbortController().signal, (frame) => {
    if (frame.stage === 'stable') stable = frame;
  });
  if (stable === undefined) throw new Error('production renderer produced no stable frame');
  return stable;
};

/** Unpacks the production band storage into the judge's per-field arrays. */
export const fieldsFromSemanticFrame = (frame: SemanticFrame): SemanticFields => {
  const { width, height } = frame.size;
  const total = width * height;
  const status = new Uint8Array(total);
  const period = new Uint32Array(total);
  const smoothIteration = new Float64Array(total);
  const multiplierMagnitude = new Float64Array(total);
  const multiplierAngle = new Float64Array(total);
  for (const band of frame.bands) {
    const base = band.y0 * width;
    for (let index = 0; index < band.packedStatusPeriod.length; index += 1) {
      const word = band.packedStatusPeriod[index] ?? 0;
      const st = unpackStatus(word);
      const pixel = base + index;
      const channel = band.smoothIterationOrMultiplierMagnitude[index] ?? 0;
      status[pixel] = st;
      period[pixel] = unpackPeriod(word);
      if (st === 1) smoothIteration[pixel] = channel;
      if (st === 2) multiplierMagnitude[pixel] = channel;
      multiplierAngle[pixel] = band.multiplierAngle[index] ?? 0;
    }
  }
  return { status, period, smoothIteration, multiplierMagnitude, multiplierAngle };
};

export interface DiagnosticChannels {
  readonly iterations: Uint32Array;
  readonly evidence: Uint8Array;
}

/**
 * UNTIMED per-pixel pass through OrbitClassifier (same options as the
 * production stable pass) recording the classifier's iteration count and
 * evidence code. Use `classifierMode` to reproduce a mode's kernel.
 */
export const diagnosticChannels = (
  spec: CaseRenderSpec,
  classifierMode?: ClassifierMode,
): DiagnosticChannels => {
  const { width, height } = spec.size;
  const iterations = new Uint32Array(width * height);
  const evidence = new Uint8Array(width * height);
  const classifier = new OrbitClassifier(
    {
      maxIterations: spec.quality.maxIterations,
      maxPeriod: spec.quality.maxPeriod,
      ...(classifierMode === undefined ? {} : { classifierMode }),
    },
    new OrbitScratch(spec.quality.maxPeriod),
  );
  const transform = createViewportTransform(spec.viewport, spec.size);
  const sample = createOrbitSample();
  const point = { re: 0, im: 0 };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      transform.pixelToComplexInto(x, y, point);
      classifier.classifyInto(point.re, point.im, sample);
      iterations[y * width + x] = sample.iterations;
      evidence[y * width + x] = sample.evidence;
    }
  }
  return { iterations, evidence };
};

/**
 * Wraps a production SemanticFrame as a RenderedFrame. `diagnostics` (if given)
 * is evaluated lazily inside readFields(), i.e. outside the timed region.
 */
export const wrapSemanticFrame = (
  renderer: CpuRenderer,
  frame: SemanticFrame,
  diagnostics?: () => DiagnosticChannels,
): RenderedFrame => ({
  size: frame.size,
  readFields: (): SemanticFields => {
    const fields = fieldsFromSemanticFrame(frame);
    return diagnostics === undefined ? fields : { ...fields, ...diagnostics() };
  },
  colorize: (view: SemanticView): Uint8ClampedArray => renderer.colorize(frame, view).rgba,
});

/** Flattens production PerfCounters (or any record of numbers) into counters. */
export const countersFromRecord = (
  record: Readonly<Record<string, number>> | undefined,
): Record<string, number> => ({ ...record });

export interface ProductionCandidateConfig {
  readonly id: string;
  readonly description: string;
  /** Production request options this candidate enables (its "flag"). */
  readonly requestOptions?: Partial<DynamicsRenderRequest>;
  /** Classifier mode used for the untimed iteration/evidence diagnostics. */
  readonly diagnosticMode?: ClassifierMode;
}

/**
 * A candidate that renders through the production CpuRenderer with some
 * request options. Counter passes switch on the production `perfCounters`
 * option (an instrumented kernel); timed renders never do.
 */
export const productionCandidate = (config: ProductionCandidateConfig): Candidate => {
  const renderer = new CpuRenderer();
  let lastCounters: Record<string, number> = {};
  return {
    id: config.id,
    description: config.description,
    reset: (): void => {
      lastCounters = {};
    },
    counters: (): Record<string, number> => ({ ...lastCounters }),
    render: async (spec: CaseRenderSpec): Promise<RenderedFrame> => {
      const request = productionRequest(spec, {
        ...config.requestOptions,
        ...(spec.collectCounters ? { perfCounters: true } : {}),
      });
      const frame = await renderStableFrame(renderer, request);
      lastCounters = countersFromRecord(frame.counters);
      return wrapSemanticFrame(
        renderer,
        frame,
        spec.diagnostics ? () => diagnosticChannels(spec, config.diagnosticMode) : undefined,
      );
    },
  };
};
