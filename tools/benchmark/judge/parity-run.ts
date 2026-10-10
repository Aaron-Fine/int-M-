/** Parity gate runner: renders baseline and candidates, compares, aggregates. */
import { createViewportTransform, type RasterSize } from '../../../src/domain';
import type { Candidate, CaseRenderSpec, RenderedFrame, SemanticFields } from '../candidates/types';
import { aggregateCandidate, type CandidateParity, type CaseParity } from './aggregate';
import { makeSpec, rasterLabel, type CorpusCase } from './corpus';
import { runOracle, type OracleResult } from './oracle';
import { compareFrames, SEMANTIC_VIEWS, type RgbaViews } from './parity';

export interface ParityRunOptions {
  readonly cases: readonly CorpusCase[];
  readonly parityRaster: RasterSize;
  readonly shippingRaster: RasterSize;
  /** Case ids that are additionally compared at the shipping raster. */
  readonly shippingCaseIds: readonly string[];
  readonly oracle: boolean;
  readonly log: (message: string) => void;
}

export interface ParityRunResult {
  readonly candidates: readonly CandidateParity[];
}

interface Rendered {
  readonly fields: SemanticFields;
  readonly rgba: RgbaViews;
}

export const toCertificateMap = (
  value: ReturnType<NonNullable<Candidate['certificates']>> | undefined,
): ReadonlyMap<number, unknown> | undefined => {
  if (value === undefined) return undefined;
  if (value instanceof Map) return value as ReadonlyMap<number, unknown>;
  return new Map(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [Number(key), entry]),
  );
};

/** Render, then decode OUTSIDE any timed region. RGBA is copied so it survives reuse. */
const materialize = async (arm: Candidate, spec: CaseRenderSpec): Promise<Rendered> => {
  arm.reset?.();
  const frame: RenderedFrame = await arm.render(spec);
  const fields = frame.readFields();
  const rgba: RgbaViews = {};
  for (const view of SEMANTIC_VIEWS) rgba[view] = frame.colorize(view).slice();
  return { fields, rgba };
};

const compareOne = async (
  baseline: Rendered,
  candidate: Candidate,
  corpusCase: CorpusCase,
  spec: CaseRenderSpec,
): Promise<CaseParity> => {
  const raster = rasterLabel(spec.size);
  try {
    const cand = await materialize(candidate, spec);
    const transform = createViewportTransform(spec.viewport, spec.size);
    const result = compareFrames({
      caseId: corpusCase.id,
      raster,
      width: spec.size.width,
      height: spec.size.height,
      policy: candidate.parityPolicy ?? 'bit-identical',
      tolerance: candidate.tolerance,
      base: baseline.fields,
      cand: cand.fields,
      baseRgba: baseline.rgba,
      candRgba: cand.rgba,
      pixelToComplex: (x, y) => transform.pixelToComplex(x, y),
      certificates: toCertificateMap(candidate.certificates?.()),
    });
    return { caseId: corpusCase.id, raster, result, error: undefined };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { caseId: corpusCase.id, raster, result: undefined, error: message };
  }
};

const safeOracle = async (baseline: Candidate, candidate: Candidate): Promise<OracleResult> => {
  try {
    return await runOracle(baseline, candidate);
  } catch (error: unknown) {
    return {
      fixtures: [],
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

export const runParity = async (
  baseline: Candidate,
  candidates: readonly Candidate[],
  options: ParityRunOptions,
): Promise<ParityRunResult> => {
  const perCandidate = new Map<string, CaseParity[]>(candidates.map((c) => [c.id, []]));
  for (const corpusCase of options.cases) {
    const sizes = [options.parityRaster];
    if (options.shippingCaseIds.includes(corpusCase.id)) sizes.push(options.shippingRaster);
    for (const size of sizes) {
      const spec = makeSpec(corpusCase, size, { diagnostics: true, collectCounters: false });
      options.log(`parity ${corpusCase.id} @ ${rasterLabel(size)}: baseline`);
      const base = await materialize(baseline, spec);
      for (const candidate of candidates) {
        options.log(`parity ${corpusCase.id} @ ${rasterLabel(size)}: ${candidate.id}`);
        perCandidate.get(candidate.id)?.push(await compareOne(base, candidate, corpusCase, spec));
      }
    }
  }
  const results: CandidateParity[] = [];
  for (const candidate of candidates) {
    options.log(`oracle: ${candidate.id}`);
    results.push(
      aggregateCandidate({
        id: candidate.id,
        description: candidate.description,
        policy: candidate.parityPolicy ?? 'bit-identical',
        tolerance: candidate.tolerance,
        cases: perCandidate.get(candidate.id) ?? [],
        oracle: options.oracle ? await safeOracle(baseline, candidate) : undefined,
      }),
    );
  }
  return { candidates: results };
};
