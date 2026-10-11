import {
  createOrbitSample,
  createViewportTransform,
  OrbitClassifier,
  OrbitScratch,
} from '../../../src/domain';
import {
  certificateToJson,
  MULTIPLIER_VARIATION_MAX,
  MULTIPLIER_VARIATION_RELATIVE,
} from '../../../src/domain/certify-cycle';
import { CpuRenderer } from '../../../src/render';
import {
  productionRequest,
  renderStableFrame,
  wrapSemanticFrame,
  type DiagnosticChannels,
} from './support';
import type { Candidate, CaseRenderSpec, FieldTolerancePolicy } from './types';

/**
 * Certified early acceptance (classifierMode 'early-accept'; kernel in
 * src/domain/early-accept.ts, certification core in src/domain/certify-cycle.ts).
 *
 * Parity policy: semantic-revision WITH certificates.
 *  - baseline-accepted pixels keep identical status and period;
 *  - escapes are bit-identical;
 *  - baseline-unresolved pixels the certificate accepts are conversions and
 *    each exposes its certificate through certificates().
 *
 * DECLARED TOLERANCES (fixed before the first parity run; derivation):
 * the reported multiplier is evaluated at a Newton-refined cycle point, the
 * production one at its detection point, which lies within
 * 1e-8 * scale / (1 - q) of the cycle (closure acceptance bound, and
 * |g(z)| >= (1 - q) |z - zeta| on the certified disk). The certification
 * refuses any pixel whose multiplier-variation bound V over a disk of that
 * radius (src/domain/certify-cycle.ts, "Multiplier reporting") exceeds
 * MULTIPLIER_VARIATION_MAX = 1e-4 absolute or MULTIPLIER_VARIATION_RELATIVE =
 * 5e-4 of |lambda|. Hence, for every certified pixel,
 *   | |lambda_ours| - |lambda_production| | <= |lambda_ours - lambda_production| <= V <= 1e-4
 * (declared: 2e-4, a factor 2 for binary64 slack in the bound), and the
 * direction deviation is <= V / |lambda| <= 5e-4 (declared: 6e-4; the judge
 * ceiling is 1e-3). The RGBA delta of 1 byte covers the induced color change:
 * hue and stability-ramp slopes are < 250 bytes per unit, so a 1e-4 absolute /
 * 5e-4 relative change moves a channel by < 1 byte before rounding. The bound
 * inherits the heuristic status of the binary64 error allowance and assumes
 * the production detection point is within the same disk (the multiplier is
 * phase-invariant but the bound is computed for our phase).
 */
const tolerance: FieldTolerancePolicy = {
  multiplierMagnitude: { absolute: 2 * MULTIPLIER_VARIATION_MAX },
  multiplierDirection: { absolute: 1.2 * MULTIPLIER_VARIATION_RELATIVE },
  rgbaMaxChannelDelta: 1,
  note:
    'Multiplier reported at a Newton-refined cycle point; certified only when the variation bound over the ' +
    'production-offset disk is <= 1e-4 abs and <= 5e-4 |lambda| (derivation in this file).',
};

const renderer = new CpuRenderer();
let lastCounters: Record<string, number> = {};
let lastCertificates = new Map<number, unknown>();

interface DiagnosticPass {
  readonly channels: DiagnosticChannels;
  readonly counters: Record<string, number>;
  readonly certificates: Map<number, unknown>;
}

/**
 * UNTIMED per-pixel pass: runs the legacy and the early-accept kernels with
 * the production stable-pass options, records the early-accept iteration and
 * evidence channels, the kernel counters, and one certificate per conversion
 * (legacy unresolved, early-accept attracting by certificate).
 */
const diagnosticPass = (spec: CaseRenderSpec): DiagnosticPass => {
  const { width, height } = spec.size;
  const iterations = new Uint32Array(width * height);
  const evidence = new Uint8Array(width * height);
  const options = { maxIterations: spec.quality.maxIterations, maxPeriod: spec.quality.maxPeriod };
  const legacy = new OrbitClassifier(options, new OrbitScratch(spec.quality.maxPeriod));
  const early = new OrbitClassifier(
    { ...options, classifierMode: 'early-accept' },
    new OrbitScratch(spec.quality.maxPeriod),
  );
  const state = early.earlyAccept;
  if (state === null) throw new Error('early-accept classifier has no state');
  const transform = createViewportTransform(spec.viewport, spec.size);
  const legacySample = createOrbitSample();
  const earlySample = createOrbitSample();
  const point = { re: 0, im: 0 };
  const certificates = new Map<number, unknown>();
  let conversions = 0;
  let certifiedWhereBaselineAccepts = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      transform.pixelToComplexInto(x, y, point);
      legacy.classifyInto(point.re, point.im, legacySample);
      early.classifyInto(point.re, point.im, earlySample);
      iterations[index] = earlySample.iterations;
      evidence[index] = earlySample.evidence;
      if (state.certified) {
        if (legacySample.status === 0) {
          conversions += 1;
          certificates.set(index, certificateToJson(state.record));
        } else if (legacySample.status === 2) {
          certifiedWhereBaselineAccepts += 1;
        }
      }
    }
  }
  const c = state.counters;
  return {
    channels: { iterations, evidence },
    certificates,
    counters: {
      certificationAttempts: c.certificationAttempts,
      quickRejects: c.quickRejects,
      certifications: c.certifications,
      iterationsSaved: c.iterationsSaved,
      triggers: c.triggers,
      conversions,
      certifiedWhereBaselineAccepts,
      failClosure: c.failClosure,
      failMultiplierBound: c.failMultiplierBound,
      failDivisor: c.failDivisor,
      failRefinement: c.failRefinement,
      failVariation: c.failVariation,
      failNonFinite: c.failNonFinite,
      failRadius: c.failRadius,
    },
  };
};

export const earlyAccept: Candidate = {
  id: 'early-accept',
  description:
    "Production renderer with classifierMode 'early-accept': certified early acceptance of attracting cycles.",
  parityPolicy: 'semantic-revision',
  tolerance,
  reset: (): void => {
    lastCounters = {};
    lastCertificates = new Map();
  },
  counters: (): Record<string, number> => ({ ...lastCounters }),
  certificates: (): ReadonlyMap<number, unknown> => lastCertificates,
  render: async (spec: CaseRenderSpec) => {
    const request = productionRequest(spec, { classifierMode: 'early-accept' });
    const frame = await renderStableFrame(renderer, request);
    let pass: DiagnosticPass | undefined;
    if (spec.diagnostics || spec.collectCounters) {
      // Untimed by contract (the judge never sets these flags in timed renders).
      pass = diagnosticPass(spec);
      lastCounters = pass.counters;
      lastCertificates = pass.certificates;
    }
    const diagnostics = spec.diagnostics && pass !== undefined ? pass.channels : undefined;
    return wrapSemanticFrame(
      renderer,
      frame,
      diagnostics === undefined ? undefined : () => diagnostics,
    );
  },
};
