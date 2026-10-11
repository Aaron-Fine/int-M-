/**
 * Ring-wrap lag-scan kernel (opt-in via OrbitOptions.ringWrap, dispatched from
 * classifyInto in orbit.ts once per pixel). Lives in its own module, as the
 * instrumented mirror does, so the verifier body keeps its single inline copy
 * in orbit.ts (pinned by the period-two verifier pilot test).
 *
 * The body mirrors classifyInto's lag scan and inline verifier body for body;
 * only history indexing differs. Change it only together with classifyInto,
 * and keep the ring-wrap unit test (tests/unit/domain/ring-wrap.test.ts) green.
 */
import { TAU_CLOSURE_SCALED, VERIFIER_THRESHOLDS } from './verifier';
import type { OrbitOptions } from './types';
import { ORBIT_EVIDENCE_CODE } from './types';
import type { OrbitSample, OrbitScratch } from './orbit';

// Copy of orbit.ts finishAttractingCycle (kept local to avoid a module cycle).
const finishAttractingCycle = (
  out: OrbitSample,
  period: number,
  multiplierRe: number,
  multiplierIm: number,
  iterations: number,
  evidence: number,
  multiplierMagnitude: number = Math.hypot(multiplierRe, multiplierIm),
): void => {
  out.status = 2;
  out.iterations = iterations;
  out.evidence = evidence;
  out.period = period;
  out.multiplierRe = multiplierRe;
  out.multiplierIm = multiplierIm;
  out.multiplierMagnitude = multiplierMagnitude;
  out.multiplierAngle = multiplierMagnitude === 0 ? 0 : Math.atan2(multiplierIm, multiplierRe);
  out.stabilityExponent =
    multiplierMagnitude === 0 ? Number.POSITIVE_INFINITY : -Math.log(multiplierMagnitude) / period;
};

/**
 * Ring-wrap twin of the classifyInto lag scan (opt-in via options.ringWrap).
 * Acceptance, comparison order, and verifier body are identical to classifyInto;
 * only the history indexing differs. The write slot advances by increment and
 * wrap-to-zero, and each lag read is currentIndex - period, plus capacity when
 * negative. Because 0 <= currentIndex < capacity and 1 <= period < capacity,
 * that is the same slot as (currentIndex - period + capacity) % capacity,
 * without the two modulo operations per lag per iteration. Keep this body in
 * step with classifyInto; the ring-wrap unit test pins them together.
 */
export const classifyIntoRingWrap = (
  cRe: number,
  cIm: number,
  options: OrbitOptions,
  scratch: OrbitScratch,
  out: OrbitSample,
  // eslint-disable-next-line complexity -- mirrors classifyInto's fused scan + verifier body
): void => {
  scratch.ensureCapacity(options.maxPeriod);
  const historyRe = scratch.historyRe;
  const historyIm = scratch.historyIm;
  const capacity = historyRe.length;
  let zRe = 0;
  let zIm = 0;
  // Next history slot to write; equals (iteration - 1) % capacity at each step.
  let writeIndex = 0;
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

    const currentIndex = writeIndex;
    historyRe[currentIndex] = zRe;
    historyIm[currentIndex] = zIm;
    writeIndex += 1;
    if (writeIndex === capacity) {
      writeIndex = 0;
    }
    if (iteration < options.cycleWarmup) {
      continue;
    }

    const largestPeriod = Math.min(options.maxPeriod, iteration - 1);
    for (let period = 1; period <= largestPeriod; period += 1) {
      // previousIndex lies in [0, capacity - 1]: currentIndex is in [0, capacity)
      // and 1 <= period < capacity, so one conditional add replaces the modulo.
      let previousIndex = currentIndex - period;
      if (previousIndex < 0) {
        previousIndex += capacity;
      }
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- in-bounds proof above
      const distanceRe = zRe - historyRe[previousIndex]!;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- in-bounds proof above
      const distanceIm = zIm - historyIm[previousIndex]!;
      if (distanceRe * distanceRe + distanceIm * distanceIm > toleranceSquared) {
        continue;
      }

      // Verifier acceptance, inlined at its single call site; mirrors classifyInto
      // and verifyCycleInto in src/domain/verifier.ts body for body.
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
        continue;
      }
      const closureRe = cycleRe - zRe;
      const closureIm = cycleIm - zIm;
      const closureSquared = closureRe * closureRe + closureIm * closureIm;
      if (!Number.isFinite(closureSquared)) {
        continue;
      }
      if (closureSquared > excludeSquared) {
        continue;
      }
      if (closureSquared > acceptSquared) {
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
          break;
        }
        const divisorResidualRe = walkRe - zRe;
        const divisorResidualIm = walkIm - zIm;
        const divisorResidualSquared =
          divisorResidualRe * divisorResidualRe + divisorResidualIm * divisorResidualIm;
        if (!Number.isFinite(divisorResidualSquared)) {
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
        continue;
      }
      finishAttractingCycle(
        out,
        primitive,
        primitiveDerivativeRe,
        primitiveDerivativeIm,
        iteration,
        ORBIT_EVIDENCE_CODE.convergedCycle,
        multiplierMagnitude,
      );
      return;
    }
  }

  out.status = 0;
  out.iterations = options.maxIterations;
  out.evidence = ORBIT_EVIDENCE_CODE.iterationLimit;
};
