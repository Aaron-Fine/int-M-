import type { AttractingCycleOrbitResult, Complex, OrbitOptions, OrbitResult } from '../../../src/domain';

/**
 * Shared differential fixtures for the PR 2/PR 3 tests: the verbatim
 * pre-PR2 legacy classifier port and the differential strata (closed forms
 * mirror poc/performance/src/corpus.ts so the differential covers the same
 * adversarial shapes without crossing the poc/ boundary, which the
 * tsconfig.app program cannot import).
 */

// ---------------------------------------------------------------------------
// Legacy reference (verbatim pre-PR2 algorithm; allocating by design).
// ---------------------------------------------------------------------------

const legacyComplexSqrt = (value: Complex): Complex => {
  const magnitude = Math.hypot(value.re, value.im);
  return {
    re: Math.sqrt(Math.max(0, (magnitude + value.re) / 2)),
    im:
      value.im < 0
        ? -Math.sqrt(Math.max(0, (magnitude - value.re) / 2))
        : Math.sqrt(Math.max(0, (magnitude - value.re) / 2)),
  };
};

const legacyStabilityExponent = (multiplierMagnitude: number, period: number): number =>
  multiplierMagnitude === 0 ? Number.POSITIVE_INFINITY : -Math.log(multiplierMagnitude) / period;

const legacyCycleResult = (
  period: number,
  multiplier: Complex,
  iterations: number,
  evidence: AttractingCycleOrbitResult['evidence'],
): AttractingCycleOrbitResult => {
  const multiplierMagnitude = Math.hypot(multiplier.re, multiplier.im);
  return {
    status: 'attracting-cycle',
    iterations,
    evidence,
    period,
    multiplierMagnitude,
    multiplierAngle: multiplierMagnitude === 0 ? 0 : Math.atan2(multiplier.im, multiplier.re),
    stabilityExponent: legacyStabilityExponent(multiplierMagnitude, period),
  };
};

const legacyAnalyticInterior = (c: Complex): AttractingCycleOrbitResult | undefined => {
  const x = c.re;
  const ySquared = c.im * c.im;
  const cardioidX = x - 0.25;
  const q = cardioidX * cardioidX + ySquared;

  if (q * (q + cardioidX) < 0.25 * ySquared) {
    const discriminantRoot = legacyComplexSqrt({ re: 1 - 4 * x, im: -4 * c.im });
    const multiplier = {
      re: 1 - discriminantRoot.re,
      im: -discriminantRoot.im,
    };
    return legacyCycleResult(1, multiplier, 0, ['analytic-main-cardioid']);
  }

  const bulbX = x + 1;
  if (bulbX * bulbX + ySquared < 1 / 16) {
    return legacyCycleResult(2, { re: 4 * bulbX, im: 4 * c.im }, 0, ['analytic-period-2-bulb']);
  }

  return undefined;
};

const legacyCycleMultiplier = (
  cycleStartRe: number,
  cycleStartIm: number,
  c: Complex,
  period: number,
  closureToleranceSquared: number,
): {
  readonly re: number;
  readonly im: number;
  readonly magnitude: number;
  readonly closes: boolean;
} => {
  let zRe = cycleStartRe;
  let zIm = cycleStartIm;
  let derivativeRe = 1;
  let derivativeIm = 0;

  for (let index = 0; index < period; index += 1) {
    const nextDerivativeRe = derivativeRe * (2 * zRe) - derivativeIm * (2 * zIm);
    derivativeIm = derivativeRe * (2 * zIm) + derivativeIm * (2 * zRe);
    derivativeRe = nextDerivativeRe;

    const nextRe = zRe * zRe - zIm * zIm + c.re;
    zIm = 2 * zRe * zIm + c.im;
    zRe = nextRe;
  }

  const closureRe = zRe - cycleStartRe;
  const closureIm = zIm - cycleStartIm;
  return {
    re: derivativeRe,
    im: derivativeIm,
    magnitude: Math.hypot(derivativeRe, derivativeIm),
    closes: closureRe * closureRe + closureIm * closureIm <= closureToleranceSquared,
  };
};

export const legacyClassifyOrbit = (c: Complex, options: OrbitOptions): OrbitResult => {
  const analytic = legacyAnalyticInterior(c);
  if (analytic !== undefined) {
    return analytic;
  }

  const historyRe = new Float64Array(options.maxPeriod + 1);
  const historyIm = new Float64Array(options.maxPeriod + 1);
  const capacity = historyRe.length;
  let zRe = 0;
  let zIm = 0;
  const toleranceSquared = options.cycleTolerance * options.cycleTolerance;
  const closureToleranceSquared = options.cycleTolerance * 100 * (options.cycleTolerance * 100);

  for (let iteration = 1; iteration <= options.maxIterations; iteration += 1) {
    const nextRe = zRe * zRe - zIm * zIm + c.re;
    zIm = 2 * zRe * zIm + c.im;
    zRe = nextRe;
    const magnitudeSquared = zRe * zRe + zIm * zIm;

    if (magnitudeSquared > 4) {
      const smoothIteration = iteration + 1 - Math.log2(Math.log2(Math.sqrt(magnitudeSquared)));
      return {
        status: 'escaped',
        iterations: iteration,
        evidence: ['escape-radius'],
        escapeIteration: iteration,
        smoothIteration: Number.isFinite(smoothIteration) ? smoothIteration : iteration,
        magnitudeSquared,
      };
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
      const distanceRe = zRe - (historyRe[previousIndex] ?? Number.NaN);
      const distanceIm = zIm - (historyIm[previousIndex] ?? Number.NaN);
      if (distanceRe * distanceRe + distanceIm * distanceIm > toleranceSquared) {
        continue;
      }

      const multiplier = legacyCycleMultiplier(zRe, zIm, c, period, closureToleranceSquared);
      if (
        !multiplier.closes ||
        !Number.isFinite(multiplier.magnitude) ||
        multiplier.magnitude >= 1
      ) {
        continue;
      }

      return legacyCycleResult(period, { re: multiplier.re, im: multiplier.im }, iteration, [
        'converged-cycle',
      ]);
    }
  }

  return {
    status: 'unresolved',
    iterations: options.maxIterations,
    evidence: ['iteration-limit'],
  };
};

// ---------------------------------------------------------------------------
// Differential strata (closed forms mirror poc/performance/src/corpus.ts).
// ---------------------------------------------------------------------------

export const gridPoints = (): { readonly re: number; readonly im: number }[] => {
  const points: { re: number; im: number }[] = [];
  for (let gy = 0; gy < 48; gy += 1) {
    for (let gx = 0; gx < 64; gx += 1) {
      points.push({
        re: -2.1 + (gx + 0.5) * (3.0 / 64),
        im: -1.35 + (gy + 0.5) * (2.7 / 48),
      });
    }
  }
  return points;
};

// Boundary: just outside the main cardioid via radial scaling of the exact
// boundary curve c(theta) = e^{i theta}/2 - e^{2 i theta}/4.
export const boundaryPoints = (): { readonly re: number; readonly im: number }[] => {
  const points: { re: number; im: number }[] = [];
  for (const epsilon of [1e-5, 3e-5, 1e-4, 3e-4]) {
    for (let step = 0; step < 12; step += 1) {
      const theta = (2 * Math.PI * step) / 12;
      points.push({
        re: (1 + epsilon) * (Math.cos(theta) / 2 - Math.cos(2 * theta) / 4),
        im: (1 + epsilon) * (Math.sin(theta) / 2 - Math.sin(2 * theta) / 4),
      });
    }
  }
  return points;
};

// Exact period-1 multiplier map: c = z* - z*^2 with z* = lambda/2, so
// |lambda| = 1 - epsilon by construction.
export const weakAttractionPoints = (): { readonly re: number; readonly im: number }[] => {
  const points: { re: number; im: number }[] = [];
  for (const epsilon of [0.05, 0.02, 0.01, 0.005, 1e-3, 1e-4, 1e-5]) {
    for (const theta of [0, Math.PI / 2, Math.PI, 2.3]) {
      const lambdaRe = (1 - epsilon) * Math.cos(theta);
      const lambdaIm = (1 - epsilon) * Math.sin(theta);
      points.push({
        re: lambdaRe / 2 - (lambdaRe * lambdaRe - lambdaIm * lambdaIm) / 4,
        im: lambdaIm / 2 - (lambdaRe * lambdaIm) / 2,
      });
    }
  }
  return points;
};

// Superattracting centers of the catalog identity layer (see corpus.ts).
export const superattractingPoints = (): { readonly re: number; readonly im: number }[] =>
  (
    [
      [0, 0],
      [-1, 0],
      [-1.7548776662466907, 0],
      [-0.1225611668766535, 0.7448617666197435],
      [-0.1225611668766535, -0.7448617666197435],
      [-1.9407998065294834, 0],
      [-1.3107026413368348, 0],
      [-0.1565201668337543, 1.0322471089228327],
      [-0.1565201668337543, -1.0322471089228327],
      [0.2822713907669141, 0.5300606175785254],
      [0.2822713907669141, -0.5300606175785254],
    ] as const
  ).map(([re, im]) => ({ re, im }));

// Deterministic jitter ring around the Feigenbaum point: deep
// unresolved-budget behavior.
export const feigenbaumRingPoints = (): { readonly re: number; readonly im: number }[] => {
  const points: { re: number; im: number }[] = [];
  for (let index = 0; index < 12; index += 1) {
    const angle = (2 * Math.PI * index) / 12;
    const radius = 1e-5 * (0.5 + index / 24);
    points.push({
      re: -1.4011551890920506 + radius * Math.cos(angle),
      im: radius * Math.sin(angle),
    });
  }
  return points;
};

// Hard-view anchors retained from the plan section 2 diagnosis.
export const hardAnchorPoints = (): { readonly re: number; readonly im: number }[] => {
  const anchors = [
    { re: -0.158902249, im: -1.034028, zoom: 126 },
    { re: -1.94130973, im: -0.0000974722949, zoom: 609 },
    { re: 0.305376533, im: 0.552677981, zoom: 13 },
  ];
  const points: { re: number; im: number }[] = [];
  for (const anchor of anchors) {
    const offset = 2.5 / anchor.zoom / 4;
    for (let gy = -1; gy <= 1; gy += 1) {
      for (let gx = -1; gx <= 1; gx += 1) {
        points.push({ re: anchor.re + gx * offset, im: anchor.im + gy * offset });
      }
    }
    points.push({ re: anchor.re, im: anchor.im });
  }
  return points;
};

// Rabbit and co-rabbit neighborhoods (period 3).
export const rabbitPoints = (): { readonly re: number; readonly im: number }[] =>
  (
    [
      [-0.1225611668766535, 0.7448617666197435],
      [-0.1225611668766535, -0.7448617666197435],
    ] as const
  ).flatMap(([centerRe, centerIm]) =>
    [0, 3e-4, -3e-4, 1e-4].map((offset) => ({
      re: centerRe + offset,
      im: centerIm - offset,
    })),
  );

export const STRATA = [
  ...gridPoints(),
  ...boundaryPoints(),
  ...weakAttractionPoints(),
  ...superattractingPoints(),
  ...feigenbaumRingPoints(),
  ...hardAnchorPoints(),
  ...rabbitPoints(),
];
