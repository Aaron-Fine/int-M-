/**
 * Deterministic seeded corpus for the PoC differential runs (plan section 9
 * holdout discipline at PoC scale: hundreds of points, not thousands).
 *
 * Every stratum is either by-construction (exact multiplier-map placements,
 * closed-form membership tests) or verified against the double-double
 * oracle at build time (rabbit neighborhoods), so stratum labels are
 * grounded in independent truth rather than in the kernels under test.
 * The same seed always yields the identical point list.
 */

import { analyticInterior } from './kernels/shared.ts';
import { classifyDD } from './oracle/classify-dd.ts';

export type CorpusStratum =
  | 'exterior'
  | 'cardioid'
  | 'period-2-bulb'
  | 'rabbit-neighborhood'
  | 'period-5'
  | 'hard-view-anchor'
  | 'weak-attraction'
  | 'superattracting'
  | 'boundary'
  | 'unresolved-budget';

export interface CorpusPoint {
  readonly id: string;
  readonly stratum: CorpusStratum;
  readonly cRe: number;
  readonly cIm: number;
}

/**
 * Fixed corpus seed (provenance: PoC harness Milestone 3, chosen once and
 * frozen; changing it changes every downstream differential number).
 */
export const CORPUS_SEED = 0x4d4950;

/** The three hard-view anchors retained from the plan section 2 diagnosis. */
const HARD_VIEW_ANCHORS: readonly {
  readonly re: number;
  readonly im: number;
  readonly zoom: number;
}[] = Object.freeze([
  { re: -0.158902249, im: -1.034028, zoom: 126 },
  { re: -1.94130973, im: -0.0000974722949, zoom: 609 },
  { re: 0.305376533, im: 0.552677981, zoom: 13 },
]);

/** Catalog identity layer (catalog/components.v1.json, independently validated). */
const SUPERATTRACTING_CENTERS: readonly (readonly [number, number])[] = Object.freeze([
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
]);

/**
 * Feigenbaum point of the real period-doubling cascade (literature value
 * -1.401155189092...). Nearby points sit in period 2^k structure far beyond
 * the systematic profiles, exercising unresolved-budget behavior.
 */
const FEIGENBAUM_RE = -1.4011551890920506;

/**
 * Milestone 4 fixture stratum: the corpus had no period >= 5 point, which
 * the schedule-kernel contract requires. The center is the known period-5
 * bulb center near -0.5045 + 0.5629i and the offsets are deterministic;
 * every point is kept only when the dd oracle confirms an attracting
 * period-5 cycle (same oracle-grounding rule as rabbit-neighborhood).
 */
const PERIOD_5_CENTER: readonly [number, number] = Object.freeze([-0.504505098022, 0.5629264446]);

const PERIOD_5_OFFSETS: readonly (readonly [number, number])[] = Object.freeze([
  [0, 0],
  [3e-4, 0],
  [0, -3e-4],
]);

const buildPeriod5 = (push: Sink): void => {
  let count = 0;
  const [centerRe, centerIm] = PERIOD_5_CENTER;
  for (const [dRe, dIm] of PERIOD_5_OFFSETS) {
    const re = centerRe + dRe;
    const im = centerIm + dIm;
    const oracle = classifyDD(re, im, { maxIterations: 4096, maxPeriod: 32 });
    if (oracle.status === 'attracting-cycle' && oracle.period === 5) {
      count += 1;
      push('period-5', re, im);
    }
  }
  if (count < PERIOD_5_OFFSETS.length) {
    throw new Error(`period-5 stratum incomplete: ${count}/${PERIOD_5_OFFSETS.length}`);
  }
};

/**
 * Exact period-1 multiplier map: for lambda = |lambda| e^{i theta} the
 * attracting fixed point is z* = lambda/2 and c = z* - z*^2, so |lambda| is
 * fixed by construction and |lambda| < 1 lands inside the main cardioid
 * (weak-attraction holdout).
 */
const fixedPointParameter = (lambdaMagnitude: number, theta: number): [number, number] => {
  const lambdaRe = lambdaMagnitude * Math.cos(theta);
  const lambdaIm = lambdaMagnitude * Math.sin(theta);
  // c = z* - z*^2 with z* = lambda/2.
  return [
    lambdaRe / 2 - (lambdaRe * lambdaRe - lambdaIm * lambdaIm) / 4,
    lambdaIm / 2 - (lambdaRe * lambdaIm) / 2,
  ];
};

const mulberry32 = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

type Random = () => number;
type Sink = (stratum: CorpusStratum, cRe: number, cIm: number) => void;

const escapeIterationEstimate = (cRe: number, cIm: number, limit: number): number => {
  let zRe = 0;
  let zIm = 0;
  let iteration = 0;
  while (iteration < limit && zRe * zRe + zIm * zIm <= 4) {
    const nextRe = zRe * zRe - zIm * zIm + cRe;
    zIm = 2 * zRe * zIm + cIm;
    zRe = nextRe;
    iteration += 1;
  }
  return iteration;
};

// Exterior: 24 guaranteed escapes (|c| >= 2.5) and 24 slower near-set
// escapes, so exterior-heavy profiles dominate the corpus as in production.
const buildExterior = (rng: Random, push: Sink): void => {
  let count = 0;
  while (count < 24) {
    const re = -3 + 4 * rng();
    const im = -2 + 4 * rng();
    if (re * re + im * im >= 6.25) {
      push('exterior', re, im);
      count += 1;
    }
  }
  while (count < 48) {
    const re = -2.1 + 3 * rng();
    const im = -1.4 + 2.8 * rng();
    if (escapeIterationEstimate(re, im, 64) < 64) {
      push('exterior', re, im);
      count += 1;
    }
  }
};

const buildCardioid = (rng: Random, push: Sink): void => {
  let count = 0;
  while (count < 40) {
    const re = -0.72 + 1.04 * rng();
    const im = -0.62 + 1.24 * rng();
    if (analyticInterior(re, im) !== undefined) {
      push('cardioid', re, im);
      count += 1;
    }
  }
};

const buildPeriod2Bulb = (rng: Random, push: Sink): void => {
  let count = 0;
  while (count < 24) {
    const re = -1.24 + 0.48 * rng();
    const im = -0.24 + 0.48 * rng();
    if (analyticInterior(re, im) !== undefined) {
      push('period-2-bulb', re, im);
      count += 1;
    }
  }
};

// Rabbit and co-rabbit neighborhoods: candidates at up to 3e-3 from the
// centers, kept only when the dd oracle confirms an attracting period-3
// cycle (the period-3 components are smaller than the naive radius, so
// oracle grounding keeps the stratum honest).
const buildRabbitNeighborhood = (rng: Random, push: Sink): void => {
  let count = 0;
  for (let attempt = 0; attempt < 400 && count < 24; attempt += 1) {
    const coRabbit = count >= 20;
    const centerRe = -0.1225611668766535;
    const centerIm = coRabbit ? -0.7448617666197435 : 0.7448617666197435;
    const radius = 0.0005 + 0.0025 * rng();
    const angle = 2 * Math.PI * rng();
    const re = centerRe + radius * Math.cos(angle);
    const im = centerIm + radius * Math.sin(angle);
    const oracle = classifyDD(re, im, { maxIterations: 512, maxPeriod: 32 });
    if (oracle.status === 'attracting-cycle' && oracle.period === 3) {
      count += 1;
      push('rabbit-neighborhood', re, im);
    }
  }
  if (count < 24) {
    throw new Error(`rabbit-neighborhood stratum incomplete: ${count}/24`);
  }
};

// Hard-view anchors: each anchor plus a 3x3 grid at one quarter of the view
// span in each direction (span = 2.5 / zoom, the product's nominal vertical
// span at that zoom level).
const buildHardViewAnchors = (push: Sink): void => {
  for (const anchor of HARD_VIEW_ANCHORS) {
    const offset = 2.5 / anchor.zoom / 4;
    for (let gy = -1; gy <= 1; gy += 1) {
      for (let gx = -1; gx <= 1; gx += 1) {
        push('hard-view-anchor', anchor.re + gx * offset, anchor.im + gy * offset);
      }
    }
    push('hard-view-anchor', anchor.re, anchor.im);
  }
};

// Weak attraction: |lambda| = 1 - epsilon by construction. Small epsilon
// stays unresolved at every PoC budget; larger epsilon detects late.
const WEAK_ATTRACTION_EPSILONS: readonly number[] = Object.freeze([
  0.05, 0.05, 0.02, 0.02, 0.01, 0.01, 0.005, 0.005, 0.03, 0.03, 0.007, 0.007, 1e-3, 1e-3, 1e-4,
  1e-4, 1e-5, 1e-5, 1e-6, 1e-6,
]);

const buildWeakAttraction = (rng: Random, push: Sink): void => {
  for (const epsilon of WEAK_ATTRACTION_EPSILONS) {
    const theta = 2 * Math.PI * rng();
    const [re, im] = fixedPointParameter(1 - epsilon, theta);
    push('weak-attraction', re, im);
  }
};

// Boundary: just outside the main cardioid via radial scaling of the exact
// boundary curve c(theta) = e^{i theta}/2 - e^{2i theta}/4. Radial scaling
// alone does not guarantee slow escape (attachment points, real antenna), so
// candidates are kept only when the oracle confirms genuinely
// parabolic-adjacent behavior: escape after >100 iterations, or budget
// exhaustion while hugging the boundary.
const BOUNDARY_DELTAS: readonly number[] = Object.freeze([1e-5, 3e-5, 1e-4, 3e-4]);

const buildBoundary = (rng: Random, push: Sink): void => {
  let count = 0;
  for (let attempt = 0; attempt < 400 && count < 16; attempt += 1) {
    const epsilon = BOUNDARY_DELTAS[attempt % BOUNDARY_DELTAS.length] ?? 1e-5;
    const theta = 2 * Math.PI * rng();
    const re = (1 + epsilon) * (Math.cos(theta) / 2 - Math.cos(2 * theta) / 4);
    const im = (1 + epsilon) * (Math.sin(theta) / 2 - Math.sin(2 * theta) / 4);
    const oracle = classifyDD(re, im);
    const slow =
      (oracle.status === 'escaped' && oracle.escapeIteration > 100) ||
      oracle.status === 'unresolved';
    if (slow) {
      count += 1;
      push('boundary', re, im);
    }
  }
  if (count < 16) {
    throw new Error(`boundary stratum incomplete: ${count}/16`);
  }
};

const buildSuperattracting = (push: Sink): void => {
  for (const [re, im] of SUPERATTRACTING_CENTERS) {
    push('superattracting', re, im);
  }
};

// Unresolved-budget: deterministic jitter ring around the Feigenbaum point.
const buildUnresolvedBudget = (rng: Random, push: Sink): void => {
  for (let index = 0; index < 12; index += 1) {
    const angle = (2 * Math.PI * index) / 12;
    const radius = 1e-5 * (0.5 + rng() / 2);
    push('unresolved-budget', FEIGENBAUM_RE + radius * Math.cos(angle), radius * Math.sin(angle));
  }
};

export const buildCorpus = (): CorpusPoint[] => {
  const rng = mulberry32(CORPUS_SEED);
  const points: CorpusPoint[] = [];
  const stratumCounts = new Map<CorpusStratum, number>();
  const push: Sink = (stratum, cRe, cIm) => {
    const index = stratumCounts.get(stratum) ?? 0;
    stratumCounts.set(stratum, index + 1);
    points.push({ id: `${stratum}-${index}`, stratum, cRe, cIm });
  };

  buildExterior(rng, push);
  buildCardioid(rng, push);
  buildPeriod2Bulb(rng, push);
  buildRabbitNeighborhood(rng, push);
  buildPeriod5(push);
  buildHardViewAnchors(push);
  buildWeakAttraction(rng, push);
  buildBoundary(rng, push);
  buildSuperattracting(push);
  buildUnresolvedBudget(rng, push);

  return points;
};

export const CORPUS_STRATA: readonly CorpusStratum[] = Object.freeze([
  'exterior',
  'cardioid',
  'period-2-bulb',
  'rabbit-neighborhood',
  'period-5',
  'hard-view-anchor',
  'weak-attraction',
  'boundary',
  'superattracting',
  'unresolved-budget',
]);
