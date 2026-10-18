/**
 * Helpers that let a candidate call the PRODUCTION render path and wrap the
 * result in the judge's RenderedFrame contract. Candidates should build on
 * these so that unpacking/colorizing is identical to baseline's.
 */
import type { SemanticView } from '../../../src/domain';
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

/** Wraps a production SemanticFrame as a RenderedFrame. */
export const wrapSemanticFrame = (renderer: CpuRenderer, frame: SemanticFrame): RenderedFrame => ({
  size: frame.size,
  readFields: (): SemanticFields => fieldsFromSemanticFrame(frame),
  colorize: (view: SemanticView): Uint8ClampedArray => renderer.colorize(frame, view).rgba,
});

export interface ProductionCandidateConfig {
  readonly id: string;
  readonly description: string;
  /** Production request options this candidate enables (its "flag"). */
  readonly requestOptions?: Partial<DynamicsRenderRequest>;
}

/**
 * A candidate that renders through the production CpuRenderer with some
 * request options (none for the baseline: the production defaults).
 */
export const productionCandidate = (config: ProductionCandidateConfig): Candidate => {
  const renderer = new CpuRenderer();
  return {
    id: config.id,
    description: config.description,
    render: async (spec: CaseRenderSpec): Promise<RenderedFrame> => {
      const frame = await renderStableFrame(
        renderer,
        productionRequest(spec, config.requestOptions),
      );
      return wrapSemanticFrame(renderer, frame);
    },
  };
};
