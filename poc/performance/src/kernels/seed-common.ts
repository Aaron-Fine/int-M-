/**
 * Shared seed machinery for the raster-coherent candidate sources
 * (transplant and trap kernels): persistent verified-cycle seeds, the plan
 * section 6 multiplier-map prediction, and the first-order attempt guard.
 *
 * Everything here is pure arithmetic over plain number tuples so the
 * kernels stay allocation-free in their loops; the seed objects themselves
 * are per-pixel-boundary state (one persistent seed per kernel instance).
 */

export interface TransplantSeed {
  cRe: number;
  cIm: number;
  period: number;
  zRe: number;
  zIm: number;
  lambdaRe: number;
  lambdaIm: number;
  lambdaMagnitude: number;
}

export interface AcceptedCycle {
  readonly period: number;
  readonly multiplierMagnitude: number;
  readonly multiplierAngle: number;
}

export const buildSeed = (
  cRe: number,
  cIm: number,
  cycle: AcceptedCycle,
  zRe: number,
  zIm: number,
): TransplantSeed => ({
  cRe,
  cIm,
  period: cycle.period,
  zRe,
  zIm,
  lambdaRe: cycle.multiplierMagnitude * Math.cos(cycle.multiplierAngle),
  lambdaIm: cycle.multiplierMagnitude * Math.sin(cycle.multiplierAngle),
  lambdaMagnitude: cycle.multiplierMagnitude,
});

/** Replay the orbit from 0 and return the state at `iteration`. */
export const cyclePointAt = (
  cRe: number,
  cIm: number,
  iteration: number,
): [number, number] | undefined => {
  let zRe = 0;
  let zIm = 0;
  for (let index = 0; index < iteration; index += 1) {
    const nextRe = zRe * zRe - zIm * zIm + cRe;
    zIm = 2 * zRe * zIm + cIm;
    zRe = nextRe;
    if (!Number.isFinite(zRe) || !Number.isFinite(zIm)) {
      return undefined;
    }
  }
  return [zRe, zIm];
};

export interface WalkResult {
  readonly endRe: number;
  readonly endIm: number;
  readonly lambdaRe: number;
  readonly lambdaIm: number;
  readonly finite: boolean;
}

/** Walk `period` steps from (zRe, zIm) accumulating lambda = (f^period)'. */
export const walkWithDerivative = (
  cRe: number,
  cIm: number,
  zRe: number,
  zIm: number,
  period: number,
): WalkResult => {
  let wRe = zRe;
  let wIm = zIm;
  let dRe = 1;
  let dIm = 0;
  for (let index = 0; index < period; index += 1) {
    const nextDRe = dRe * (2 * wRe) - dIm * (2 * wIm);
    dIm = dRe * (2 * wIm) + dIm * (2 * wRe);
    dRe = nextDRe;
    const nextRe = wRe * wRe - wIm * wIm + cRe;
    wIm = 2 * wRe * wIm + cIm;
    wRe = nextRe;
  }
  const finite =
    Number.isFinite(wRe) && Number.isFinite(wIm) && Number.isFinite(dRe) && Number.isFinite(dIm);
  return { endRe: wRe, endIm: wIm, lambdaRe: dRe, lambdaIm: dIm, finite };
};

/**
 * B_cycle for the seed's cycle: one forward walk of the cycle with the plan
 * section 6 recurrence B_{j+1} = 2 z_j B_j + 1 (B_0 = 0), so the result is
 * df^p/dc at the seed parameter. Bounded: exactly one p-step walk.
 */
export const cycleParameterDerivative = (seed: TransplantSeed): [number, number] => {
  let zRe = seed.zRe;
  let zIm = seed.zIm;
  let bRe = 0;
  let bIm = 0;
  for (let index = 0; index < seed.period; index += 1) {
    const nextBRe = 2 * (zRe * bRe - zIm * bIm) + 1;
    const nextBIm = 2 * (zRe * bIm + zIm * bRe);
    const nextRe = zRe * zRe - zIm * zIm + seed.cRe;
    zIm = 2 * zRe * zIm + seed.cIm;
    zRe = nextRe;
    bRe = nextBRe;
    bIm = nextBIm;
  }
  return [bRe, bIm];
};

export interface Prediction {
  readonly zPredRe: number;
  readonly zPredIm: number;
  /** First-order displacement |B_cycle| * |dc| / |1 - lambda|. */
  readonly displacement: number;
}

/**
 * Plan section 6 prediction: dz-star/dc = B_cycle/(1 - lambda) evaluated at
 * the seed, first-order seed z_pred = z* + (dz-star/dc) * dc. Returns
 * undefined when the prediction is degenerate (1 - lambda underflow).
 */
export const predictCyclePoint = (
  seed: TransplantSeed,
  cRe: number,
  cIm: number,
  guardDisplacement: number,
): Prediction | undefined => {
  const [bRe, bIm] = cycleParameterDerivative(seed);
  const omRe = 1 - seed.lambdaRe;
  const omIm = -seed.lambdaIm;
  const omDen = omRe * omRe + omIm * omIm;
  if (!(omDen > 0) || !Number.isFinite(omDen)) {
    return undefined;
  }
  const dzDcRe = (bRe * omRe + bIm * omIm) / omDen;
  const dzDcIm = (bIm * omRe - bRe * omIm) / omDen;
  const dcRe = cRe - seed.cRe;
  const dcIm = cIm - seed.cIm;
  const displacement = Math.hypot(dzDcRe, dzDcIm) * Math.hypot(dcRe, dcIm);
  if (!(displacement <= guardDisplacement)) {
    return undefined;
  }
  return {
    zPredRe: seed.zRe + dzDcRe * dcRe - dzDcIm * dcIm,
    zPredIm: seed.zIm + dzDcRe * dcIm + dzDcIm * dcRe,
    displacement,
  };
};
