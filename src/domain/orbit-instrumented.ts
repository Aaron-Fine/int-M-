/**
 * Instrumented legacy-scan kernel (plan section 8 opt-in diagnostics): the
 * classifyInto lag scan from orbit.ts mirrored body for body with integer
 * counter increments into a preallocated LegacyScanCounters record. This is
 * the "instrumented function" half of the plan's lean/instrumented split —
 * the classifier selects it OUTSIDE the raster loop (OrbitClassifier's
 * constructor takes the optional counters sink), so the lean kernel and the
 * default path keep their exact PR 2 measured shape (no hot-loop
 * instrumentation branch, no allocation).
 *
 * The parity test (tests/unit/domain/orbit-instrumented.test.ts) pins this
 * body to classifyInto bit for bit on stratified grids — the same discipline
 * as the verifier body mirrored at its orbit.ts call site. Change them only
 * as a pair, and keep every increment exactly where its event happens:
 *
 * - lagComparisons: one per lag distance evaluation in the scan (the
 *   deterministic primary cost metric of the workstream C gate; the
 *   checkpoint schedule's counterpart is CheckpointMetrics.lagComparisons);
 * - proposals: proximity hits that enter the verifier body (the legacy scan
 *   proposes and verifies inline; the checkpoint kernel's counterpart is
 *   CheckpointMetrics.verifierCalls);
 * - rejects*: the four verifier verdict classes, mirroring the checkpoint
 *   vocabulary (noClosure / notAttracting / nonFinite / ambiguous);
 * - analyticPathHits: closed-form acceptances (plan §8 path hits);
 * - systematic* buckets: accepted detections by primitive period. The lag
 *   scan is a systematic full-period scan by construction, so its detections
 *   are always systematic; the opportunistic buckets (checkpoint exhaustion
 *   scan) stay zero here and are never written by this kernel.
 */

import type { OrbitOptions } from './types';
import { ORBIT_EVIDENCE_CODE } from './types';
import type { OrbitSample, OrbitScratch } from './orbit';
import { periodBucketIndex } from './period-buckets';
import { TAU_CLOSURE_SCALED, VERIFIER_THRESHOLDS } from './verifier';

/**
 * Preallocated per-band counter record written by the instrumented lag scan.
 * Deliberately a structural subset of the render layer's MutablePerfCounters
 * so one object can serve as both the kernel sink and the message summary.
 */
export interface LegacyScanCounters {
  lagComparisons: number;
  proposals: number;
  analyticPathHits: number;
  rejectsNoClosure: number;
  rejectsNotAttracting: number;
  rejectsNonFinite: number;
  rejectsAmbiguous: number;
  systematic1to4: number;
  systematic5to8: number;
  systematic9to12: number;
  systematic13Plus: number;
}

export const createLegacyScanCounters = (): LegacyScanCounters => ({
  lagComparisons: 0,
  proposals: 0,
  analyticPathHits: 0,
  rejectsNoClosure: 0,
  rejectsNotAttracting: 0,
  rejectsNonFinite: 0,
  rejectsAmbiguous: 0,
  systematic1to4: 0,
  systematic5to8: 0,
  systematic9to12: 0,
  systematic13Plus: 0,
});

export const resetLegacyScanCounters = (counters: LegacyScanCounters): void => {
  counters.lagComparisons = 0;
  counters.proposals = 0;
  counters.analyticPathHits = 0;
  counters.rejectsNoClosure = 0;
  counters.rejectsNotAttracting = 0;
  counters.rejectsNonFinite = 0;
  counters.rejectsAmbiguous = 0;
  counters.systematic1to4 = 0;
  counters.systematic5to8 = 0;
  counters.systematic9to12 = 0;
  counters.systematic13Plus = 0;
};

const noteSystematicDetection = (counters: LegacyScanCounters, period: number): void => {
  const bucket = periodBucketIndex(period);
  if (bucket === 0) counters.systematic1to4 += 1;
  else if (bucket === 1) counters.systematic5to8 += 1;
  else if (bucket === 2) counters.systematic9to12 += 1;
  else counters.systematic13Plus += 1;
};

/**
 * Instrumented mirror of classifyInto (orbit.ts): identical classification
 * semantics bit for bit, plus the counter increments documented above. The
 * counters record must be preallocated (one per band/pass, reused across
 * pixels) — this kernel never allocates.
 */
export const classifyIntoInstrumented = (
  cRe: number,
  cIm: number,
  options: OrbitOptions,
  scratch: OrbitScratch,
  out: OrbitSample,
  counters: LegacyScanCounters,
  // eslint-disable-next-line complexity -- the branch count is the fused scan + verifier policy body plus its counters; it mirrors classifyInto exactly (see the module comment)
): void => {
  // Analytic fast paths: verbatim mirror of the classifyInto block, with the
  // closed-form acceptances counted as analytic path hits (plan §8).
  const x = cRe;
  const ySquared = cIm * cIm;
  const cardioidX = x - 0.25;
  const q = cardioidX * cardioidX + ySquared;

  if (q * (q + cardioidX) < 0.25 * ySquared) {
    const sqrtArgRe = 1 - 4 * x;
    const sqrtArgIm = -4 * cIm;
    const discriminantMagnitude = Math.hypot(sqrtArgRe, sqrtArgIm);
    const rootRe = Math.sqrt(Math.max(0, (discriminantMagnitude + sqrtArgRe) / 2));
    const rootImMagnitude = Math.sqrt(Math.max(0, (discriminantMagnitude - sqrtArgRe) / 2));
    const multiplierRe = 1 - rootRe;
    const multiplierIm = sqrtArgIm < 0 ? rootImMagnitude : -rootImMagnitude;
    const multiplierMagnitude = Math.hypot(multiplierRe, multiplierIm);
    if (multiplierMagnitude < 1 - VERIFIER_THRESHOLDS.attractMargin) {
      counters.analyticPathHits += 1;
      out.status = 2;
      out.iterations = 0;
      out.evidence = ORBIT_EVIDENCE_CODE.analyticMainCardioid;
      out.period = 1;
      out.multiplierRe = multiplierRe;
      out.multiplierIm = multiplierIm;
      out.multiplierMagnitude = multiplierMagnitude;
      out.multiplierAngle = multiplierMagnitude === 0 ? 0 : Math.atan2(multiplierIm, multiplierRe);
      out.stabilityExponent =
        multiplierMagnitude === 0 ? Number.POSITIVE_INFINITY : -Math.log(multiplierMagnitude);
      return;
    }
  } else {
    const bulbX = x + 1;
    if (bulbX * bulbX + ySquared < 1 / 16) {
      const multiplierRe = 4 * bulbX;
      const multiplierIm = 4 * cIm;
      const multiplierMagnitude = Math.hypot(multiplierRe, multiplierIm);
      if (multiplierMagnitude < 1 - VERIFIER_THRESHOLDS.attractMargin) {
        counters.analyticPathHits += 1;
        out.status = 2;
        out.iterations = 0;
        out.evidence = ORBIT_EVIDENCE_CODE.analyticPeriod2Bulb;
        out.period = 2;
        out.multiplierRe = multiplierRe;
        out.multiplierIm = multiplierIm;
        out.multiplierMagnitude = multiplierMagnitude;
        out.multiplierAngle =
          multiplierMagnitude === 0 ? 0 : Math.atan2(multiplierIm, multiplierRe);
        out.stabilityExponent =
          multiplierMagnitude === 0 ? Number.POSITIVE_INFINITY : -Math.log(multiplierMagnitude) / 2;
        return;
      }
    }
  }

  scratch.ensureCapacity(options.maxPeriod);
  const historyRe = scratch.historyRe;
  const historyIm = scratch.historyIm;
  const capacity = historyRe.length;
  let zRe = 0;
  let zIm = 0;
  const toleranceSquared = options.cycleTolerance * options.cycleTolerance;

  for (let iteration = 1; iteration <= options.maxIterations; iteration += 1) {
    const nextRe = zRe * zRe - zIm * zIm + cRe;
    zIm = 2 * zRe * zIm + cIm;
    zRe = nextRe;
    const magnitudeSquared = zRe * zRe + zIm * zIm;

    if (magnitudeSquared > 4) {
      const smoothIteration = iteration + 1 - Math.log2(Math.log2(Math.sqrt(magnitudeSquared)));
      out.status = 1;
      out.iterations = iteration;
      out.evidence = ORBIT_EVIDENCE_CODE.escapeRadius;
      out.escapeIteration = iteration;
      out.smoothIteration = Number.isFinite(smoothIteration) ? smoothIteration : iteration;
      out.magnitudeSquared = magnitudeSquared;
      return;
    }

    const currentIndex = (iteration - 1) % capacity;
    historyRe[currentIndex] = zRe;
    historyIm[currentIndex] = zIm;
    if (iteration < options.cycleWarmup) {
      continue;
    }

    const largestPeriod = Math.min(options.maxPeriod, iteration - 1);
    for (let period = 1; period <= largestPeriod; period += 1) {
      const previousIndex = (currentIndex - period + capacity) % capacity;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- in-bounds: mirrors the classifyInto indexing proof
      const distanceRe = zRe - historyRe[previousIndex]!;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- in-bounds proof above
      const distanceIm = zIm - historyIm[previousIndex]!;
      counters.lagComparisons += 1;
      if (distanceRe * distanceRe + distanceIm * distanceIm > toleranceSquared) {
        continue;
      }

      // Proximity hit: the scan proposes and verifies inline (see the module
      // comment for the counter mapping). The verifier body below mirrors
      // classifyInto's inlined acceptance policy exactly, with each verdict
      // class counted.
      counters.proposals += 1;
      const scale = Math.max(1, Math.abs(zRe), Math.abs(zIm));
      const acceptSquared = TAU_CLOSURE_SCALED * TAU_CLOSURE_SCALED * scale * scale;
      const excludeSquared =
        VERIFIER_THRESHOLDS.tauExclude * VERIFIER_THRESHOLDS.tauExclude * scale * scale;

      let cycleRe = zRe;
      let cycleIm = zIm;
      let derivativeRe = 1;
      let derivativeIm = 0;
      for (let index = 0; index < period; index += 1) {
        const nextDerivativeRe = derivativeRe * (2 * cycleRe) - derivativeIm * (2 * cycleIm);
        derivativeIm = derivativeRe * (2 * cycleIm) + derivativeIm * (2 * cycleRe);
        derivativeRe = nextDerivativeRe;

        const nextCycleRe = cycleRe * cycleRe - cycleIm * cycleIm + cRe;
        cycleIm = 2 * cycleRe * cycleIm + cIm;
        cycleRe = nextCycleRe;
      }

      if (
        !Number.isFinite(cycleRe) ||
        !Number.isFinite(cycleIm) ||
        !Number.isFinite(derivativeRe) ||
        !Number.isFinite(derivativeIm)
      ) {
        counters.rejectsNonFinite += 1;
        continue;
      }
      const closureRe = cycleRe - zRe;
      const closureIm = cycleIm - zIm;
      const closureSquared = closureRe * closureRe + closureIm * closureIm;
      if (!Number.isFinite(closureSquared)) {
        counters.rejectsNonFinite += 1;
        continue;
      }
      if (closureSquared > excludeSquared) {
        counters.rejectsNoClosure += 1;
        continue;
      }
      if (closureSquared > acceptSquared) {
        counters.rejectsAmbiguous += 1;
        continue;
      }

      let primitive = period;
      let primitiveDerivativeRe = derivativeRe;
      let primitiveDerivativeIm = derivativeIm;
      let accepted = true;
      for (let divisor = 1; divisor < period; divisor += 1) {
        if (period % divisor !== 0) {
          continue;
        }
        let walkRe = zRe;
        let walkIm = zIm;
        let walkDerivativeRe = 1;
        let walkDerivativeIm = 0;
        for (let index = 0; index < divisor; index += 1) {
          const nextWalkDerivativeRe =
            walkDerivativeRe * (2 * walkRe) - walkDerivativeIm * (2 * walkIm);
          walkDerivativeIm = walkDerivativeRe * (2 * walkIm) + walkDerivativeIm * (2 * walkRe);
          walkDerivativeRe = nextWalkDerivativeRe;

          const nextWalkRe = walkRe * walkRe - walkIm * walkIm + cRe;
          walkIm = 2 * walkRe * walkIm + cIm;
          walkRe = nextWalkRe;
          if (!Number.isFinite(walkRe) || !Number.isFinite(walkIm)) {
            accepted = false;
            break;
          }
        }
        if (!accepted) {
          counters.rejectsNonFinite += 1;
          break;
        }
        const divisorResidualRe = walkRe - zRe;
        const divisorResidualIm = walkIm - zIm;
        const divisorResidualSquared =
          divisorResidualRe * divisorResidualRe + divisorResidualIm * divisorResidualIm;
        if (!Number.isFinite(divisorResidualSquared)) {
          counters.rejectsNonFinite += 1;
          accepted = false;
          break;
        }
        if (divisorResidualSquared <= acceptSquared) {
          primitive = divisor;
          primitiveDerivativeRe = walkDerivativeRe;
          primitiveDerivativeIm = walkDerivativeIm;
          break;
        }
        if (divisorResidualSquared < excludeSquared) {
          counters.rejectsAmbiguous += 1;
          accepted = false;
          break;
        }
      }
      if (!accepted) {
        continue;
      }

      const multiplierMagnitude = Math.hypot(primitiveDerivativeRe, primitiveDerivativeIm);
      if (
        !Number.isFinite(multiplierMagnitude) ||
        multiplierMagnitude >= 1 - VERIFIER_THRESHOLDS.attractMargin
      ) {
        counters.rejectsNotAttracting += 1;
        continue;
      }
      noteSystematicDetection(counters, primitive);
      out.status = 2;
      out.iterations = iteration;
      out.evidence = ORBIT_EVIDENCE_CODE.convergedCycle;
      out.period = primitive;
      out.multiplierRe = primitiveDerivativeRe;
      out.multiplierIm = primitiveDerivativeIm;
      out.multiplierMagnitude = multiplierMagnitude;
      out.multiplierAngle =
        multiplierMagnitude === 0 ? 0 : Math.atan2(primitiveDerivativeIm, primitiveDerivativeRe);
      out.stabilityExponent =
        multiplierMagnitude === 0
          ? Number.POSITIVE_INFINITY
          : -Math.log(multiplierMagnitude) / primitive;
      return;
    }
  }

  out.status = 0;
  out.iterations = options.maxIterations;
  out.evidence = ORBIT_EVIDENCE_CODE.iterationLimit;
};
