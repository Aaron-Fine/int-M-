import type { Complex, EvidenceFlag, OrbitOptions, OrbitResult } from './types';

export const DEFAULT_ORBIT_OPTIONS: OrbitOptions = Object.freeze({
  maxIterations: 512,
  maxPeriod: 32,
  cycleTolerance: 1e-10,
  cycleWarmup: 24,
  cycleDetection: 'scan',
});

/** Reused by one sequential classifier; no state is carried between samples. */
export class OrbitScratch {
  public historyRe: Float64Array;
  public historyIm: Float64Array;
  public checkpointRe = 0;
  public checkpointIm = 0;
  public checkpointIteration = 0;
  public checkpointSpan = 1;

  public constructor(maxPeriod: number = DEFAULT_ORBIT_OPTIONS.maxPeriod) {
    const capacity = Math.max(2, Math.ceil(maxPeriod) + 1);
    this.historyRe = new Float64Array(capacity);
    this.historyIm = new Float64Array(capacity);
  }

  public ensureCapacity(maxPeriod: number): void {
    const required = maxPeriod + 1;
    if (this.historyRe.length >= required) return;
    this.historyRe = new Float64Array(required);
    this.historyIm = new Float64Array(required);
  }
}

/** Numeric raster status: 0 unresolved, 1 escaped, 2 attracting cycle. */
export interface RasterOrbitSample {
  status: 0 | 1 | 2;
  period: number;
  smoothIterationOrMultiplierMagnitude: number;
  multiplierUnitRe: number;
  multiplierUnitIm: number;
}

interface KernelResult extends RasterOrbitSample {
  iterations: number;
  evidence: EvidenceFlag;
  magnitudeSquared: number;
  multiplierRe: number;
  multiplierIm: number;
}

const createKernelResult = (): KernelResult => ({
  status: 0,
  period: 0,
  smoothIterationOrMultiplierMagnitude: 0,
  multiplierUnitRe: 0,
  multiplierUnitIm: 0,
  iterations: 0,
  evidence: 'iteration-limit',
  magnitudeSquared: 0,
  multiplierRe: 0,
  multiplierIm: 0,
});

const writeCycle = (
  output: KernelResult,
  period: number,
  re: number,
  im: number,
  magnitude: number,
  iterations: number,
  evidence: EvidenceFlag,
): void => {
  output.status = 2;
  output.period = period;
  output.smoothIterationOrMultiplierMagnitude = magnitude;
  output.multiplierRe = re;
  output.multiplierIm = im;
  // Zero has the inspector's existing angle convention (0 radians).
  output.multiplierUnitRe = magnitude === 0 ? 1 : re / magnitude;
  output.multiplierUnitIm = magnitude === 0 ? 0 : im / magnitude;
  output.iterations = iterations;
  output.evidence = evidence;
};

const analyticInterior = (cRe: number, cIm: number, output: KernelResult): boolean => {
  const ySquared = cIm * cIm;
  const cardioidX = cRe - 0.25;
  const q = cardioidX * cardioidX + ySquared;
  if (q * (q + cardioidX) < 0.25 * ySquared) {
    // Scalar form of the existing principal complex square root.
    const discriminantRe = 1 - 4 * cRe;
    const discriminantIm = -4 * cIm;
    const discriminantMagnitude = Math.hypot(discriminantRe, discriminantIm);
    const rootRe = Math.sqrt(Math.max(0, (discriminantMagnitude + discriminantRe) / 2));
    const rootImMagnitude = Math.sqrt(Math.max(0, (discriminantMagnitude - discriminantRe) / 2));
    const re = 1 - rootRe;
    const im = discriminantIm < 0 ? rootImMagnitude : -rootImMagnitude;
    writeCycle(output, 1, re, im, Math.hypot(re, im), 0, 'analytic-main-cardioid');
    return true;
  }
  const bulbX = cRe + 1;
  if (bulbX * bulbX + ySquared < 1 / 16) {
    const re = 4 * bulbX;
    const im = 4 * cIm;
    writeCycle(output, 2, re, im, Math.hypot(re, im), 0, 'analytic-period-2-bulb');
    return true;
  }
  return false;
};

/** A candidate alone is never evidence: check forward closure and attraction. */
const confirmCycle = (
  cycleStartRe: number,
  cycleStartIm: number,
  cRe: number,
  cIm: number,
  period: number,
  closureToleranceSquared: number,
  iteration: number,
  output: KernelResult,
): boolean => {
  let zRe = cycleStartRe;
  let zIm = cycleStartIm;
  let derivativeRe = 1;
  let derivativeIm = 0;
  for (let index = 0; index < period; index += 1) {
    const nextDerivativeRe = derivativeRe * (2 * zRe) - derivativeIm * (2 * zIm);
    derivativeIm = derivativeRe * (2 * zIm) + derivativeIm * (2 * zRe);
    derivativeRe = nextDerivativeRe;
    const nextRe = zRe * zRe - zIm * zIm + cRe;
    zIm = 2 * zRe * zIm + cIm;
    zRe = nextRe;
  }
  const closureRe = zRe - cycleStartRe;
  const closureIm = zIm - cycleStartIm;
  if (!(closureRe * closureRe + closureIm * closureIm <= closureToleranceSquared)) return false;
  // Reuse one hypot, retaining the original attraction threshold's rounding
  // at |lambda| = 1 rather than substituting a squared floating-point test.
  const magnitude = Math.hypot(derivativeRe, derivativeIm);
  if (!Number.isFinite(magnitude) || magnitude >= 1) return false;
  writeCycle(output, period, derivativeRe, derivativeIm, magnitude, iteration, 'converged-cycle');
  return true;
};

const resolveOrbitOptions = (options: Partial<OrbitOptions> = {}): OrbitOptions => {
  const resolved: OrbitOptions = { ...DEFAULT_ORBIT_OPTIONS, ...options };
  if (
    !Number.isInteger(resolved.maxIterations) ||
    resolved.maxIterations < 1 ||
    !Number.isInteger(resolved.maxPeriod) ||
    resolved.maxPeriod < 1 ||
    !Number.isFinite(resolved.cycleTolerance) ||
    resolved.cycleTolerance <= 0 ||
    !Number.isInteger(resolved.cycleWarmup) ||
    resolved.cycleWarmup < 0 ||
    (resolved.cycleDetection !== 'scan' && resolved.cycleDetection !== 'checkpoint')
  ) {
    throw new RangeError(
      'iteration, period, and warmup options must be integers; tolerance must be positive; detection must be scan or checkpoint',
    );
  }
  return resolved;
};

/** Brent-style windows only decide which history lags to verify. */
const checkpointScanLimit = (
  zRe: number,
  zIm: number,
  iteration: number,
  resolved: OrbitOptions,
  scratch: OrbitScratch,
  toleranceSquared: number,
): number => {
  const lag = iteration - scratch.checkpointIteration;
  const distanceRe = zRe - scratch.checkpointRe;
  const distanceIm = zIm - scratch.checkpointIm;
  const candidate =
    lag <= resolved.maxPeriod &&
    distanceRe * distanceRe + distanceIm * distanceIm <= toleranceSquared;
  const atCheckpoint = lag === scratch.checkpointSpan;
  const limit =
    atCheckpoint || iteration === resolved.maxIterations ? resolved.maxPeriod : candidate ? lag : 0;
  if (atCheckpoint) {
    scratch.checkpointRe = zRe;
    scratch.checkpointIm = zIm;
    scratch.checkpointIteration = iteration;
    if (scratch.checkpointSpan < resolved.maxPeriod) scratch.checkpointSpan *= 2;
  }
  return limit;
};

const classifyKernel = (
  cRe: number,
  cIm: number,
  resolved: OrbitOptions,
  scratch: OrbitScratch,
  output: KernelResult,
): void => {
  output.status = 0;
  output.period = 0;
  output.smoothIterationOrMultiplierMagnitude = 0;
  output.multiplierUnitRe = 0;
  output.multiplierUnitIm = 0;
  output.iterations = resolved.maxIterations;
  output.evidence = 'iteration-limit';
  if (analyticInterior(cRe, cIm, output)) return;

  const historyRe = scratch.historyRe;
  const historyIm = scratch.historyIm;
  const capacity = historyRe.length;
  const { maxIterations, maxPeriod, cycleWarmup } = resolved;
  const useCheckpoints = resolved.cycleDetection === 'checkpoint';
  let currentIndex = -1;
  let zRe = 0;
  let zIm = 0;
  scratch.checkpointRe = 0;
  scratch.checkpointIm = 0;
  scratch.checkpointIteration = 0;
  scratch.checkpointSpan = 1;
  const toleranceSquared = resolved.cycleTolerance * resolved.cycleTolerance;
  const closureToleranceSquared = (resolved.cycleTolerance * 100) ** 2;

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    const nextRe = zRe * zRe - zIm * zIm + cRe;
    zIm = 2 * zRe * zIm + cIm;
    zRe = nextRe;
    const magnitudeSquared = zRe * zRe + zIm * zIm;
    if (magnitudeSquared > 4) {
      const smooth = iteration + 1 - Math.log2(0.5 * Math.log2(magnitudeSquared));
      output.status = 1;
      output.iterations = iteration;
      output.evidence = 'escape-radius';
      output.magnitudeSquared = magnitudeSquared;
      output.smoothIterationOrMultiplierMagnitude = Number.isFinite(smooth) ? smooth : iteration;
      return;
    }
    currentIndex += 1;
    if (currentIndex === capacity) currentIndex = 0;
    historyRe[currentIndex] = zRe;
    historyIm[currentIndex] = zIm;

    const scanLimit = useCheckpoints
      ? checkpointScanLimit(zRe, zIm, iteration, resolved, scratch, toleranceSquared)
      : maxPeriod;
    if (iteration >= cycleWarmup && scanLimit > 0) {
      const largestPeriod = Math.min(maxPeriod, iteration - 1, scanLimit);
      let previousIndex = currentIndex;
      // Keep array access and the modulo-free walk inside the hot loop.
      for (let period = 1; period <= largestPeriod; period += 1) {
        previousIndex -= 1;
        if (previousIndex < 0) previousIndex = capacity - 1;
        const distanceRe = zRe - (historyRe[previousIndex] ?? Number.NaN);
        const distanceIm = zIm - (historyIm[previousIndex] ?? Number.NaN);
        if (distanceRe * distanceRe + distanceIm * distanceIm > toleranceSquared) continue;
        if (confirmCycle(zRe, zIm, cRe, cIm, period, closureToleranceSquared, iteration, output))
          return;
      }
    }
  }
};

const richResult = (result: KernelResult): OrbitResult => {
  const evidence = [result.evidence];
  const iterations = result.iterations;
  if (result.status === 1) {
    return {
      status: 'escaped',
      iterations,
      evidence,
      escapeIteration: iterations,
      smoothIteration: result.smoothIterationOrMultiplierMagnitude,
      magnitudeSquared: result.magnitudeSquared,
    };
  }
  if (result.status === 2) {
    const magnitude = result.smoothIterationOrMultiplierMagnitude;
    return {
      status: 'attracting-cycle',
      iterations,
      evidence,
      period: result.period,
      multiplierMagnitude: magnitude,
      multiplierAngle: magnitude === 0 ? 0 : Math.atan2(result.multiplierIm, result.multiplierRe),
      stabilityExponent:
        magnitude === 0 ? Number.POSITIVE_INFINITY : -Math.log(magnitude) / result.period,
    };
  }
  return { status: 'unresolved', iterations, evidence };
};

export class OrbitClassifier {
  readonly #options: OrbitOptions;
  readonly #scratch: OrbitScratch;
  readonly #result = createKernelResult();

  public constructor(options: Partial<OrbitOptions> = {}, scratch?: OrbitScratch) {
    this.#options = resolveOrbitOptions(options);
    this.#scratch = scratch ?? new OrbitScratch(this.#options.maxPeriod);
    this.#scratch.ensureCapacity(this.#options.maxPeriod);
  }

  public classify(c: Complex): OrbitResult {
    classifyKernel(c.re, c.im, this.#options, this.#scratch, this.#result);
    return richResult(this.#result);
  }

  /** Borrowed result: consume before the next call. No per-sample allocation. */
  public classifyRaster(re: number, im: number): Readonly<RasterOrbitSample> {
    classifyKernel(re, im, this.#options, this.#scratch, this.#result);
    return this.#result;
  }
}

export const classifyOrbit = (
  c: Complex,
  options: Partial<OrbitOptions> = {},
  scratch?: OrbitScratch,
): OrbitResult => new OrbitClassifier(options, scratch).classify(c);
