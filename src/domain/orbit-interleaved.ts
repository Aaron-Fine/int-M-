import { classifyInto, OrbitScratch, resolveOrbitOptions, type OrbitSample } from './orbit';
import { TAU_CLOSURE_SCALED, VERIFIER_THRESHOLDS } from './verifier';
import { ORBIT_EVIDENCE_CODE, type OrbitOptions } from './types';

/**
 * Two-pixel interleaved classification kernel (tournament candidate
 * `interleave-2`, default OFF; opt in with the `interleave` render option).
 *
 * Idea: z -> z^2 + c is a latency-bound dependency chain, so a modern CPU can
 * overlap two independent chains. The lockstep loop below iterates the orbits
 * of two pixels of the same row together (each with its own history ring)
 * and does, per pixel, exactly the operations of the scalar classifyInto in
 * the same order: interleaving only changes instruction scheduling, never
 * arithmetic, so every result is bit-identical to classifyInto.
 *
 * Structure (simplest correct): the lockstep loop handles only the cheap,
 * common iterations. It bails out, handing both lanes to the scalar
 * resume kernel, at the first "event": either lane leaving the escape
 * radius, either lane producing a lag-scan proposal (distance within the
 * proposal gate, which needs the inline verifier), or budget exhaustion
 * (written directly). After a bail the two pixels finish one after the
 * other in continueInto, which is the classifyInto loop entered mid-orbit.
 * Pixels in the analytic fast-path regions (main cardioid, period-2 bulb)
 * skip the pair loop entirely and run through the scalar classifyInto.
 *
 * Scope: this kernel mirrors the plain legacy-scan classifyInto only. It does
 * NOT currently combine with classifierMode 'triggered-scan' (nor checkpoint
 * or differential, nor perfCounters): classifyRows falls back to the scalar
 * kernel for those. A combined triggered-scan pair kernel is future work.
 *
 * Hot-loop rules from orbit.ts apply: the lockstep loop contains no JS calls
 * (all non-inlined calls happen after it exits, with the orbit state handed
 * over through a preallocated Float64Array, never as boxed arguments), and
 * history loads are bare typed-array loads.
 */

/** The cheap region tests of classifyInto's analytic fast paths. */
const inAnalyticRegion = (cRe: number, cIm: number): boolean => {
  const ySquared = cIm * cIm;
  const cardioidX = cRe - 0.25;
  const q = cardioidX * cardioidX + ySquared;
  if (q * (q + cardioidX) < 0.25 * ySquared) {
    return true;
  }
  const bulbX = cRe + 1;
  return bulbX * bulbX + ySquared < 1 / 16;
};

const finishAttractingCycle = (
  out: OrbitSample,
  period: number,
  multiplierRe: number,
  multiplierIm: number,
  iterations: number,
  evidence: number,
  multiplierMagnitude: number,
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
 * The classifyInto orbit loop entered mid-orbit. `spill[spillOffset]` and
 * `spill[spillOffset + 1]` hold z after the step of `startIteration`;
 * `startPeriod` selects the entry point inside that iteration:
 *   0   z is stepped but not yet escape-checked or stored (full iteration
 *       tail: escape test, ring store, warmup gate, then the lag scan);
 *   > 0 escape test and ring store are done; resume the lag scan at that lag.
 * Everything below mirrors classifyInto line for line (the analytic prologue
 * is the caller's concern: pair lanes are never in an analytic region).
 */
const continueInto = (
  cRe: number,
  cIm: number,
  options: OrbitOptions,
  historyRe: Float64Array,
  historyIm: Float64Array,
  capacity: number,
  out: OrbitSample,
  spill: Float64Array,
  spillOffset: number,
  startIteration: number,
  startPeriod: number,
  // eslint-disable-next-line complexity -- fused scan + verifier policy body, mirrors classifyInto
): void => {
  let zRe = spill[spillOffset] ?? 0;
  let zIm = spill[spillOffset + 1] ?? 0;
  const toleranceSquared = options.cycleTolerance * options.cycleTolerance;
  const maxIterations = options.maxIterations;
  const maxPeriod = options.maxPeriod;
  const cycleWarmup = options.cycleWarmup;

  for (let iteration = startIteration; iteration <= maxIterations; iteration += 1) {
    if (iteration > startIteration) {
      const nextRe = zRe * zRe - zIm * zIm + cRe;
      zIm = 2 * zRe * zIm + cIm;
      zRe = nextRe;
    }
    const currentIndex = (iteration - 1) % capacity;
    let scanFrom = 1;
    if (iteration === startIteration && startPeriod > 0) {
      scanFrom = startPeriod;
    } else {
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

      historyRe[currentIndex] = zRe;
      historyIm[currentIndex] = zIm;
      if (iteration < cycleWarmup) {
        continue;
      }
    }

    const largestPeriod = Math.min(maxPeriod, iteration - 1);
    for (let period = scanFrom; period <= largestPeriod; period += 1) {
      const previousIndex = (currentIndex - period + capacity) % capacity;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- in-bounds proof as in classifyInto
      const distanceRe = zRe - historyRe[previousIndex]!;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- in-bounds proof as in classifyInto
      const distanceIm = zIm - historyIm[previousIndex]!;
      if (distanceRe * distanceRe + distanceIm * distanceIm > toleranceSquared) {
        continue;
      }

      // Verifier acceptance, inlined (same body as classifyInto / verifyCycleInto).
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
  out.iterations = maxIterations;
  out.evidence = ORBIT_EVIDENCE_CODE.iterationLimit;
};

/**
 * Prepared two-lane classifier: options, both history rings and the hand-off
 * spill are allocated once. One instance is single-threaded and reusable
 * across sequential pairs.
 */
export class InterleavedClassifier {
  readonly #options: OrbitOptions;
  readonly #scratchA: OrbitScratch;
  readonly #scratchB: OrbitScratch;
  readonly #spill = new Float64Array(4);

  public constructor(options: Partial<OrbitOptions> = {}) {
    this.#options = resolveOrbitOptions(options);
    this.#scratchA = new OrbitScratch(this.#options.maxPeriod);
    this.#scratchB = new OrbitScratch(this.#options.maxPeriod);
    this.#scratchA.ensureCapacity(this.#options.maxPeriod);
    this.#scratchB.ensureCapacity(this.#options.maxPeriod);
  }

  /** Single pixel: the scalar kernel (used for an odd trailing pixel). */
  public classifyInto(cRe: number, cIm: number, out: OrbitSample): void {
    classifyInto(cRe, cIm, this.#options, this.#scratchA, out);
  }

  /**
   * Classifies two points; the results equal two independent classifyInto
   * calls bit for bit.
   */
  public classifyPairInto(
    cReA: number,
    cImA: number,
    cReB: number,
    cImB: number,
    outA: OrbitSample,
    outB: OrbitSample,
  ): void {
    const options = this.#options;
    if (inAnalyticRegion(cReA, cImA) || inAnalyticRegion(cReB, cImB)) {
      classifyInto(cReA, cImA, options, this.#scratchA, outA);
      classifyInto(cReB, cImB, options, this.#scratchA, outB);
      return;
    }

    const historyReA = this.#scratchA.historyRe;
    const historyImA = this.#scratchA.historyIm;
    const historyReB = this.#scratchB.historyRe;
    const historyImB = this.#scratchB.historyIm;
    // One shared modulus keeps both lanes' ring indices identical; the
    // continuation reuses it so ring slots line up across the hand-off.
    const capacity = Math.min(historyReA.length, historyReB.length);
    const toleranceSquared = options.cycleTolerance * options.cycleTolerance;
    const maxIterations = options.maxIterations;
    const maxPeriod = options.maxPeriod;
    const cycleWarmup = options.cycleWarmup;
    let zaRe = 0;
    let zaIm = 0;
    let zbRe = 0;
    let zbIm = 0;
    // Hand-off point: -1 means the budget ran out with no event.
    let bailIteration = -1;
    let bailPeriod = 0;

    lockstep: for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
      const nextReA = zaRe * zaRe - zaIm * zaIm + cReA;
      const nextReB = zbRe * zbRe - zbIm * zbIm + cReB;
      zaIm = 2 * zaRe * zaIm + cImA;
      zbIm = 2 * zbRe * zbIm + cImB;
      zaRe = nextReA;
      zbRe = nextReB;
      const magnitudeSquaredA = zaRe * zaRe + zaIm * zaIm;
      const magnitudeSquaredB = zbRe * zbRe + zbIm * zbIm;

      if (magnitudeSquaredA > 4 || magnitudeSquaredB > 4) {
        bailIteration = iteration;
        bailPeriod = 0;
        break;
      }

      const currentIndex = (iteration - 1) % capacity;
      historyReA[currentIndex] = zaRe;
      historyImA[currentIndex] = zaIm;
      historyReB[currentIndex] = zbRe;
      historyImB[currentIndex] = zbIm;
      if (iteration < cycleWarmup) {
        continue;
      }

      const largestPeriod = Math.min(maxPeriod, iteration - 1);
      for (let period = 1; period <= largestPeriod; period += 1) {
        const previousIndex = (currentIndex - period + capacity) % capacity;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- in-bounds proof as in classifyInto
        const distanceReA = zaRe - historyReA[previousIndex]!;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- in-bounds proof as in classifyInto
        const distanceImA = zaIm - historyImA[previousIndex]!;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- in-bounds proof as in classifyInto
        const distanceReB = zbRe - historyReB[previousIndex]!;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- in-bounds proof as in classifyInto
        const distanceImB = zbIm - historyImB[previousIndex]!;
        if (
          distanceReA * distanceReA + distanceImA * distanceImA > toleranceSquared &&
          distanceReB * distanceReB + distanceImB * distanceImB > toleranceSquared
        ) {
          continue;
        }
        // A proposal (or NaN) in either lane: both lanes resume at this lag.
        bailIteration = iteration;
        bailPeriod = period;
        break lockstep;
      }
    }

    if (bailIteration < 0) {
      outA.status = 0;
      outA.iterations = maxIterations;
      outA.evidence = ORBIT_EVIDENCE_CODE.iterationLimit;
      outB.status = 0;
      outB.iterations = maxIterations;
      outB.evidence = ORBIT_EVIDENCE_CODE.iterationLimit;
      return;
    }

    // Hand both lanes to the scalar continuation. z crosses the call through
    // the preallocated spill so no orbit phi is a boxed call argument.
    const spill = this.#spill;
    spill[0] = zaRe;
    spill[1] = zaIm;
    spill[2] = zbRe;
    spill[3] = zbIm;
    continueInto(
      cReA,
      cImA,
      options,
      historyReA,
      historyImA,
      capacity,
      outA,
      spill,
      0,
      bailIteration,
      bailPeriod,
    );
    continueInto(
      cReB,
      cImB,
      options,
      historyReB,
      historyImB,
      capacity,
      outB,
      spill,
      2,
      bailIteration,
      bailPeriod,
    );
  }
}
