import { createViewportTransform } from '../../../../src/domain/viewport';
import { OrbitClassifier, OrbitScratch } from '../../../../src/domain/orbit';
import { getQualityProfile } from '../../../../src/ui/view-state';
import type { Complex, RenderQuality, Viewport } from '../../../../src/domain';
import type {
  ConjugateMirrorParams,
  ConjugateMirrorResult,
  MirrorParityMismatch,
} from './microbench-api';

/**
 * Workstream M (plan §5): conjugate symmetry mirroring. For viewports
 * intersecting their conjugate (center on the real axis), the orbit of
 * conj(c) is the exact conjugate of the orbit of c (the orbit starts at
 * 0 ∈ R and IEEE arithmetic is odd-symmetric), so classifying only the
 * canonical half and mirroring should reproduce the full raster with
 * arg lambda negated and everything else identical.
 *
 * Mirrored coordinates are built by exact negation of the imaginary part:
 * the transform's im(y) = center.im - (y + 0.5 - h/2) * upp is exactly
 * odd-symmetric around the raster middle when center.im === 0, so pixel
 * (x, h-1-y) samples exactly conj(pixel (x, y)).
 *
 * Measurement shape: the app's real classifier (src/domain/orbit.ts
 * OrbitClassifier) runs on the main thread with no yields, for both arms.
 * The timed loops write only the numeric semantic channels the production
 * frame carries (plus iterations and kappa); no string work, so wall time
 * measures classification + mirror fill, not parity bookkeeping. Semantic
 * parity is a separate untimed pass that additionally captures the evidence
 * flags per pixel.
 */

// Indexed reads are in-bounds by construction; checked helpers satisfy
// noUncheckedIndexedAccess and no-non-null-assertion alike.
const num = (arr: Float64Array | Uint32Array | Uint8Array, i: number): number => {
  const value = arr[i];
  if (value === undefined) throw new Error(`typed-array index ${i} out of bounds`);
  return value;
};
const str = (arr: readonly string[], i: number): string => {
  const value = arr[i];
  if (value === undefined) throw new Error(`array index ${i} out of bounds`);
  return value;
};

interface RasterResults {
  readonly status: Uint8Array;
  readonly period: Uint32Array;
  readonly multiplierMagnitude: Float64Array;
  readonly multiplierAngle: Float64Array;
  readonly iterations: Uint32Array;
  readonly kappa: Float64Array;
  /** Evidence flags are captured only by the untimed parity pass. */
  readonly evidence: string[] | null;
}

const allocNumericResults = (pixelCount: number): RasterResults => ({
  status: new Uint8Array(pixelCount),
  period: new Uint32Array(pixelCount),
  multiplierMagnitude: new Float64Array(pixelCount),
  multiplierAngle: new Float64Array(pixelCount),
  iterations: new Uint32Array(pixelCount),
  kappa: new Float64Array(pixelCount),
  evidence: null,
});

const allocParityResults = (pixelCount: number): RasterResults => ({
  status: new Uint8Array(pixelCount),
  period: new Uint32Array(pixelCount),
  multiplierMagnitude: new Float64Array(pixelCount),
  multiplierAngle: new Float64Array(pixelCount),
  iterations: new Uint32Array(pixelCount),
  kappa: new Float64Array(pixelCount),
  evidence: new Array<string>(pixelCount).fill(''),
});

const classifyPoint = (
  classifier: OrbitClassifier,
  point: Complex,
  out: RasterResults,
  index: number,
): void => {
  const result = classifier.classify(point);
  if (result.status === 'escaped') {
    out.status[index] = 1;
    out.multiplierMagnitude[index] = result.smoothIteration;
  } else if (result.status === 'attracting-cycle') {
    out.status[index] = 2;
    out.period[index] = result.period;
    out.multiplierMagnitude[index] = result.multiplierMagnitude;
    out.multiplierAngle[index] = result.multiplierAngle;
    out.kappa[index] = result.stabilityExponent;
  }
  out.iterations[index] = result.iterations;
  const evidence = out.evidence;
  if (evidence !== null) {
    evidence[index] = result.evidence.join('|');
  }
};

const classifyCanonicalHalf = (
  viewport: Viewport,
  quality: RenderQuality,
  edge: number,
  results: RasterResults,
): number => {
  const classifier = new OrbitClassifier(
    { maxIterations: quality.maxIterations, maxPeriod: quality.maxPeriod },
    new OrbitScratch(quality.maxPeriod),
  );
  const transform = createViewportTransform(viewport, { width: edge, height: edge });
  const started = performance.now();
  for (let y = 0; y < edge / 2; y += 1) {
    for (let x = 0; x < edge; x += 1) {
      classifyPoint(classifier, transform.pixelToComplex(x, y), results, y * edge + x);
    }
  }
  return performance.now() - started;
};

const classifyFull = (
  viewport: Viewport,
  quality: RenderQuality,
  edge: number,
  results: RasterResults,
): number => {
  const classifier = new OrbitClassifier(
    { maxIterations: quality.maxIterations, maxPeriod: quality.maxPeriod },
    new OrbitScratch(quality.maxPeriod),
  );
  const transform = createViewportTransform(viewport, { width: edge, height: edge });
  const started = performance.now();
  for (let y = 0; y < edge; y += 1) {
    for (let x = 0; x < edge; x += 1) {
      classifyPoint(classifier, transform.pixelToComplex(x, y), results, y * edge + x);
    }
  }
  return performance.now() - started;
};

/** Mirror the canonical half onto the lower half: copy fields, negate arg lambda. */
const mirrorLowerHalf = (edge: number, results: RasterResults): number => {
  const started = performance.now();
  const half = edge / 2;
  const evidence = results.evidence;
  for (let y = half; y < edge; y += 1) {
    const sourceY = edge - 1 - y;
    for (let x = 0; x < edge; x += 1) {
      const source = sourceY * edge + x;
      const target = y * edge + x;
      results.status[target] = num(results.status, source);
      results.period[target] = num(results.period, source);
      results.multiplierMagnitude[target] = num(results.multiplierMagnitude, source);
      results.multiplierAngle[target] = -num(results.multiplierAngle, source);
      results.kappa[target] = num(results.kappa, source);
      results.iterations[target] = num(results.iterations, source);
      if (evidence !== null) {
        evidence[target] = str(evidence, source);
      }
    }
  }
  return performance.now() - started;
};

const compareMirrored = (
  edge: number,
  full: RasterResults,
  mirrored: RasterResults,
): {
  pixelsCompared: number;
  mismatchCount: number;
  mismatchesByField: Record<string, number>;
  examples: MirrorParityMismatch[];
} => {
  const fullEvidence = full.evidence;
  const mirroredEvidence = mirrored.evidence;
  if (fullEvidence === null || mirroredEvidence === null) {
    throw new Error('parity comparison requires evidence-capturing rasters');
  }
  const pixelsCompared = (edge * edge) / 2;
  let mismatchCount = 0;
  const mismatchesByField: Record<string, number> = {};
  const examples: MirrorParityMismatch[] = [];
  const bump = (field: string): void => {
    mismatchesByField[field] = (mismatchesByField[field] ?? 0) + 1;
  };
  const note = (
    y: number,
    x: number,
    field: string,
    fullValue: number | string,
    mirroredValue: number | string,
  ): void => {
    mismatchCount += 1;
    bump(field);
    if (examples.length < 20) {
      examples.push({ y, x, field, fullValue, mirroredValue });
    }
  };

  const half = edge / 2;
  for (let y = half; y < edge; y += 1) {
    for (let x = 0; x < edge; x += 1) {
      const index = y * edge + x;
      if (full.status[index] !== mirrored.status[index]) {
        note(y, x, 'status', num(full.status, index), num(mirrored.status, index));
        continue;
      }
      if (full.period[index] !== mirrored.period[index]) {
        note(y, x, 'period', num(full.period, index), num(mirrored.period, index));
      }
      if (full.iterations[index] !== mirrored.iterations[index]) {
        note(y, x, 'iterations', num(full.iterations, index), num(mirrored.iterations, index));
      }
      if (str(fullEvidence, index) !== str(mirroredEvidence, index)) {
        note(y, x, 'evidence', str(fullEvidence, index), str(mirroredEvidence, index));
      }
      const magFull = num(full.multiplierMagnitude, index);
      const magMirror = num(mirrored.multiplierMagnitude, index);
      if (Math.abs(magFull - magMirror) > 1e-12) {
        note(y, x, 'multiplierMagnitude', magFull, magMirror);
      }
      const kappaFull = num(full.kappa, index);
      const kappaMirror = num(mirrored.kappa, index);
      if (Math.abs(kappaFull - kappaMirror) > 1e-12) {
        note(y, x, 'kappa', kappaFull, kappaMirror);
      }
      // The assembled mirrored raster must EQUAL the direct full raster:
      // the mirror fill negates arg lambda once, and the conjugate pixel's
      // own multiplier is the conjugate (negated) of the canonical pixel's,
      // so the two negations cancel in the final comparison. Any residual
      // difference is exactly an arg-lambda negation-parity violation.
      const angleFull = num(full.multiplierAngle, index);
      const angleMirror = num(mirrored.multiplierAngle, index);
      if (Math.abs(angleFull - angleMirror) > 1e-12) {
        note(y, x, 'multiplierAngle', angleFull, angleMirror);
      }
    }
  }
  return { pixelsCompared, mismatchCount, mismatchesByField, examples };
};

export const runConjugateMirror = (params: ConjugateMirrorParams): ConjugateMirrorResult => {
  const edge = params.edge;
  if (edge % 2 !== 0) {
    throw new Error('edge must be even so no raster row is its own mirror');
  }
  const centerRe = Number(params.centerRe);
  const spanY = Number(params.spanY);
  // Real-axis-symmetric viewport: the given center re with center.im exactly
  // 0, and the given spanY. center.im = 0 makes the transform exactly
  // conjugate-symmetric across the raster middle.
  const viewport: Viewport = {
    center: { re: centerRe, im: 0 },
    spanY,
  };
  const quality = getQualityProfile(params.profileId).quality;

  // Warmup: untimed full cycles of both arms so JIT/IC warmup does not land
  // in the first measured rep (mirrors pool-sizing's warmup reps).
  for (let warmup = 0; warmup < params.warmupReps; warmup += 1) {
    const full = allocNumericResults(edge * edge);
    const mirrored = allocNumericResults(edge * edge);
    classifyFull(viewport, quality, edge, full);
    classifyCanonicalHalf(viewport, quality, edge, mirrored);
    mirrorLowerHalf(edge, mirrored);
  }

  // Parity is deterministic, so it is computed once from dedicated
  // evidence-capturing rasters; the measured reps stay numeric-only.
  const fullParity = allocParityResults(edge * edge);
  const mirroredParity = allocParityResults(edge * edge);
  classifyFull(viewport, quality, edge, fullParity);
  classifyCanonicalHalf(viewport, quality, edge, mirroredParity);
  mirrorLowerHalf(edge, mirroredParity);
  const parity = compareMirrored(edge, fullParity, mirroredParity);

  const samples: {
    rep: number;
    fullMs: number;
    halfMs: number;
    mirrorFillMs: number;
    combinedMs: number;
  }[] = [];
  for (let rep = 0; rep < params.reps; rep += 1) {
    // Alternate arm order per rep to spread thermal drift.
    const arms =
      rep % 2 === 0 ? (['full', 'half+mirror'] as const) : (['half+mirror', 'full'] as const);
    let fullMs = 0;
    let halfMs = 0;
    let mirrorFillMs = 0;
    const full = allocNumericResults(edge * edge);
    const mirrored = allocNumericResults(edge * edge);
    for (const arm of arms) {
      if (arm === 'full') {
        fullMs = classifyFull(viewport, quality, edge, full);
      } else {
        halfMs = classifyCanonicalHalf(viewport, quality, edge, mirrored);
        mirrorFillMs = mirrorLowerHalf(edge, mirrored);
      }
    }
    samples.push({ rep, fullMs, halfMs, mirrorFillMs, combinedMs: halfMs + mirrorFillMs });
  }

  return {
    viewId: params.viewId,
    centerRe,
    spanY,
    edge,
    profileId: params.profileId,
    warmupReps: params.warmupReps,
    quality: {
      maxIterations: quality.maxIterations,
      maxPeriod: quality.maxPeriod,
      coarseStride: quality.coarseStride,
    },
    samples,
    parity,
  };
};
