/**
 * Certified early acceptance kernel (classifierMode 'early-accept', default
 * OFF; candidate `early-accept` of the optimization tournament).
 *
 * This is classifyInto (src/domain/orbit.ts) with ONE addition: a cheap
 * trigger in the lag scan. When a lag p's proximity |z_n - z_(n-p)| falls
 * below the LOOSE proposal threshold (LOOSE_PROPOSAL * scale) but is still
 * above the production proposal gate (cycleTolerance), the lag is remembered
 * as pending; the production scan finishes the iteration unchanged (so the
 * normal verifier path keeps first refusal on every lag), and only if it did
 * not accept does the orbit loop exit to the certification phase below. The
 * certification core is src/domain/certify-cycle.ts (the Lean disk theorem,
 * specialized to exact c, with an explicit binary64 error allowance).
 *
 * Whichever of {production verifier, certificate} accepts first wins. A
 * certified pixel is reported attracting with the certified PRIMITIVE period
 * and the multiplier at a Newton-refined cycle point (certify-cycle.ts,
 * "Multiplier reporting"). A pixel the production scan would accept keeps its
 * status and period (tournament parity policy semantic-revision); pixels
 * production leaves unresolved at its budget may be converted, each backed by
 * the certificate in EarlyAcceptState.record.
 *
 * Trigger budget (the naive 7-radius ladder cost far more than it saved,
 * evidence/phase-2/early-accept-measurement): per (pixel, period) a failed
 * attempt must be followed by a proximity shrink of x16 (squared: x256) before
 * the period may trigger again; at most MAX_ATTEMPTS_PER_PIXEL certification
 * attempts per pixel; a radius-independent O(p) reject (prod 2|z_j| >= 1
 * implies q >= 1 for every radius) is tried first and is not an attempt; the
 * radius is chosen analytically in one shot, r = 2 rho / (1 - qhat).
 *
 * LOOSE_PROPOSAL = 1e-4: the measurement used a 1e-2 prefilter and found the
 * ladder cost dominated by attempts at pairs that could never certify. With
 * one analytic radius per attempt, the threshold only has to be loose enough
 * that a certificate can exist: the closure window needs rho <= r (1 - q), and
 * r must stay small enough that q(r) < 1, i.e. r (growth) << (1 - qhat); for
 * the |lambda| <= 0.95 cycles that dominate the savings that is roughly
 * rho <~ 1e-4. Looser triggers only add attempts that fail the window.
 *
 * Hot-loop rules carried over from classifyInto: the orbit loop contains no
 * calls; the certification call sits OUTSIDE it with the orbit state
 * round-tripped through OrbitScratch.checkpointSpill (the V8 phi-boxing
 * constraint documented at classifyInto and in checkpoint.ts).
 */
import {
  CERT_REASON,
  certifyWalked,
  createCertificateRecord,
  CertifyWorkspace,
  Q_MARGIN,
  refineMultiplier,
  walkedMultiplierEstimate,
  walkedResidual,
  walkOrbit,
  type CertificateRecord,
} from './certify-cycle';
import type { OrbitSample, OrbitScratch } from './orbit';
import type { OrbitOptions } from './types';
import { ORBIT_EVIDENCE_CODE } from './types';
import { TAU_CLOSURE_SCALED, VERIFIER_THRESHOLDS } from './verifier';

/** Loose proposal threshold, relative to scale = max(1, |re z|, |im z|). */
export const LOOSE_PROPOSAL = 1e-4;
/**
 * Hot-loop prefilter: scale <= 2 on the escape-bounded orbit, so
 * (LOOSE_PROPOSAL * 2)^2 bounds every scale-aware loose test from above; the
 * exact scale-aware test runs only inside the (rare) trigger branch.
 */
const LOOSE_CAP_SQUARED = 4 * LOOSE_PROPOSAL * LOOSE_PROPOSAL;
/** A failed (pixel, period) retries only after the proximity shrank x16. */
const RETRY_SHRINK_SQUARED = 16 * 16;
export const MAX_ATTEMPTS_PER_PIXEL = 8;
/** Includes radius-independent rejects, which are not attempts. */
export const MAX_TRIGGERS_PER_PIXEL = 32;

const SPILL_Z_RE = 0;
const SPILL_Z_IM = 1;

/** Per-classifier mutable counters (read via OrbitClassifier.earlyAccept). */
export interface EarlyAcceptCounters {
  triggers: number;
  quickRejects: number;
  certificationAttempts: number;
  certifications: number;
  /** Estimated production iterations avoided (see estimateSavedIterations). */
  iterationsSaved: number;
  failNonFinite: number;
  failRadius: number;
  failMultiplierBound: number;
  failClosure: number;
  failDivisor: number;
  failRefinement: number;
  failVariation: number;
}

export const createEarlyAcceptCounters = (): EarlyAcceptCounters => ({
  triggers: 0,
  quickRejects: 0,
  certificationAttempts: 0,
  certifications: 0,
  iterationsSaved: 0,
  failNonFinite: 0,
  failRadius: 0,
  failMultiplierBound: 0,
  failClosure: 0,
  failDivisor: 0,
  failRefinement: 0,
  failVariation: 0,
});

/** All preallocated state of one early-accept classifier instance. */
export class EarlyAcceptState {
  public readonly counters: EarlyAcceptCounters = createEarlyAcceptCounters();
  public readonly workspace: CertifyWorkspace;
  /** Certificate of the most recent certification (valid when `certified`). */
  public readonly record: CertificateRecord;
  /** True when the last classification was accepted by certificate. */
  public certified = false;
  /** Pixel-scoped epoch stamp for the per-period retry gate. */
  public epoch = 1;
  public attempts = 0;
  public triggers = 0;
  public gateSquared: Float64Array;
  public gateEpoch: Int32Array;

  public constructor(maxPeriod: number) {
    this.workspace = new CertifyWorkspace(maxPeriod);
    this.record = createCertificateRecord(maxPeriod);
    this.gateSquared = new Float64Array(maxPeriod + 2);
    this.gateEpoch = new Int32Array(maxPeriod + 2);
  }

  public ensureCapacity(maxPeriod: number): void {
    this.workspace.ensureCapacity(maxPeriod);
    if (this.gateSquared.length < maxPeriod + 2) {
      this.gateSquared = new Float64Array(maxPeriod + 2);
      this.gateEpoch = new Int32Array(maxPeriod + 2);
    }
  }
}

const failCounter = (counters: EarlyAcceptCounters, reason: number): void => {
  if (reason === CERT_REASON.nonFinite) counters.failNonFinite += 1;
  else if (reason === CERT_REASON.radiusTooLarge) counters.failRadius += 1;
  else if (reason === CERT_REASON.multiplierBoundNotBelowOne) counters.failMultiplierBound += 1;
  else if (reason === CERT_REASON.closureWindow) counters.failClosure += 1;
  else if (reason === CERT_REASON.divisorSeparation) counters.failDivisor += 1;
  else if (reason === CERT_REASON.refinementFailed) counters.failRefinement += 1;
  else counters.failVariation += 1;
};

/**
 * Estimated production iterations avoided by a certification at iteration n:
 * production waits until the lag-p proximity falls to cycleTolerance, which at
 * the certified contraction rate takes p ln(prox / tol) / ln(1/|lambda|) more
 * iterations, clipped to the remaining budget. An ESTIMATE (production may
 * also verify at a multiple of p, or never reach the gate within budget).
 */
const estimateSavedIterations = (
  proximity: number,
  gate: number,
  multiplier: number,
  period: number,
  remaining: number,
): number => {
  if (!(proximity > gate) || !(multiplier > 0)) return 0;
  const rate = Math.min(multiplier, 1 - 1e-9);
  const estimate = (period * Math.log(proximity / gate)) / -Math.log(rate);
  return Math.max(0, Math.min(remaining, Math.ceil(estimate)));
};

/**
 * Certification phase for one pending (iteration, period). Returns 1 and
 * writes `out` when the cycle is certified, otherwise 0. Called OUTSIDE the
 * orbit loop. All pixel state arrives by value; only the retry gate and the
 * counters are updated on the way.
 */
const attemptCertification = (
  state: EarlyAcceptState,
  scratch: OrbitScratch,
  options: OrbitOptions,
  cRe: number,
  cIm: number,
  zRe: number,
  zIm: number,
  period: number,
  iteration: number,
  out: OrbitSample,
): number => {
  const counters = state.counters;
  state.triggers += 1;
  counters.triggers += 1;
  const historyRe = scratch.historyRe;
  const historyIm = scratch.historyIm;
  const capacity = historyRe.length;
  const currentIndex = (iteration - 1) % capacity;
  const previousIndex = (currentIndex - period + capacity) % capacity;
  const distanceRe = zRe - (historyRe[previousIndex] ?? Number.NaN);
  const distanceIm = zIm - (historyIm[previousIndex] ?? Number.NaN);
  const proximitySquared = distanceRe * distanceRe + distanceIm * distanceIm;
  // Retry gate first: whatever happens below, this period may trigger again
  // only after the proximity shrinks by x16 (success returns anyway).
  state.gateEpoch[period] = state.epoch;
  state.gateSquared[period] = proximitySquared / RETRY_SHRINK_SQUARED;

  // Radius-independent reject: q >= prod 2|z_j| for every r >= 0, over the
  // cycle points z_(n-p+1 .. n) read from the history ring (no walk needed).
  let product = 1;
  for (let j = 1; j <= period; j += 1) {
    const index = (currentIndex - period + j + capacity) % capacity;
    product *= 2 * Math.hypot(historyRe[index] ?? Number.NaN, historyIm[index] ?? Number.NaN);
  }
  if (!(product < 1 - Q_MARGIN)) {
    counters.quickRejects += 1;
    return 0;
  }

  state.attempts += 1;
  counters.certificationAttempts += 1;
  const workspace = state.workspace;
  const rec = state.record;
  rec.cRe = cRe;
  rec.cIm = cIm;
  rec.z0Re = zRe;
  rec.z0Im = zIm;
  if (!walkOrbit(workspace, cRe, cIm, zRe, zIm, period)) {
    rec.period = period;
    rec.reason = CERT_REASON.nonFinite;
    failCounter(counters, rec.reason);
    return 0;
  }
  const residual = walkedResidual(workspace, period);
  const qHat = walkedMultiplierEstimate(workspace, period);
  if (!(qHat < 1 - Q_MARGIN)) {
    // The fresh walk's product disagrees with the ring's: still a
    // radius-independent reject.
    counters.quickRejects += 1;
    state.attempts -= 1;
    counters.certificationAttempts -= 1;
    return 0;
  }
  // One-shot analytic radius: the closure window needs r (1 - q) >= rho, and
  // q(r) <= (1 + qhat) / 2 holds for the small r this selects.
  const radius = (2 * residual) / (1 - qHat);
  let reason = certifyWalked(workspace, period, radius, rec);
  if (reason === CERT_REASON.certified) {
    reason = refineMultiplier(workspace, rec, cRe, cIm);
  }
  if (reason !== CERT_REASON.certified) {
    failCounter(counters, reason);
    return 0;
  }

  const multiplierRe = rec.multiplierRe;
  const multiplierIm = rec.multiplierIm;
  const multiplierMagnitude = Math.hypot(multiplierRe, multiplierIm);
  out.status = 2;
  out.iterations = iteration;
  out.evidence = ORBIT_EVIDENCE_CODE.convergedCycle;
  out.period = period;
  out.multiplierRe = multiplierRe;
  out.multiplierIm = multiplierIm;
  out.multiplierMagnitude = multiplierMagnitude;
  out.multiplierAngle = multiplierMagnitude === 0 ? 0 : Math.atan2(multiplierIm, multiplierRe);
  out.stabilityExponent =
    multiplierMagnitude === 0 ? Number.POSITIVE_INFINITY : -Math.log(multiplierMagnitude) / period;
  state.certified = true;
  counters.certifications += 1;
  counters.iterationsSaved += estimateSavedIterations(
    Math.sqrt(proximitySquared),
    options.cycleTolerance,
    multiplierMagnitude,
    period,
    options.maxIterations - iteration,
  );
  return 1;
};

// Identical to finishAttractingCycle in orbit.ts (not exported there so the
// flag-off module stays textually unchanged).
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
 * Early-accept classification core. Same contract as classifyInto
 * (options pre-resolved, scratch/out/state not shared concurrently).
 */
export const classifyEarlyAcceptInto = (
  cRe: number,
  cIm: number,
  options: OrbitOptions,
  scratch: OrbitScratch,
  out: OrbitSample,
  state: EarlyAcceptState,
  // eslint-disable-next-line complexity -- the branch count is the fused scan + verifier policy body (mirrors classifyInto) plus the certification trigger
): void => {
  state.certified = false;
  // Analytic fast paths: verbatim mirror of the classifyInto block (same
  // closed forms, same attraction margin, same fall-through on refusal).
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
      finishAttractingCycle(
        out,
        1,
        multiplierRe,
        multiplierIm,
        0,
        ORBIT_EVIDENCE_CODE.analyticMainCardioid,
        multiplierMagnitude,
      );
      return;
    }
  } else {
    const bulbX = x + 1;
    if (bulbX * bulbX + ySquared < 1 / 16) {
      const multiplierRe = 4 * bulbX;
      const multiplierIm = 4 * cIm;
      const multiplierMagnitude = Math.hypot(multiplierRe, multiplierIm);
      if (multiplierMagnitude < 1 - VERIFIER_THRESHOLDS.attractMargin) {
        finishAttractingCycle(
          out,
          2,
          multiplierRe,
          multiplierIm,
          0,
          ORBIT_EVIDENCE_CODE.analyticPeriod2Bulb,
          multiplierMagnitude,
        );
        return;
      }
    }
  }

  scratch.ensureCapacity(options.maxPeriod);
  state.ensureCapacity(options.maxPeriod);
  const historyRe = scratch.historyRe;
  const historyIm = scratch.historyIm;
  const capacity = historyRe.length;
  const spill = scratch.checkpointSpill;
  const gateSquared = state.gateSquared;
  const gateEpoch = state.gateEpoch;
  state.epoch = (state.epoch + 1) | 0;
  const epoch = state.epoch;
  state.attempts = 0;
  state.triggers = 0;
  let zRe = 0;
  let zIm = 0;
  let iteration = 1;
  // Candidate proposal gate (frozen), as in classifyInto.
  const toleranceSquared = options.cycleTolerance * options.cycleTolerance;

  // The orbit loop contains no non-inlined calls with orbit state live (see
  // classifyInto). Certification happens in the outer driver, after the
  // iteration loop exits with a pending lag; z round-trips through the spill.
  for (;;) {
    let pendingPeriod = 0;
    for (; iteration <= options.maxIterations; iteration += 1) {
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
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- in-bounds proof as in classifyInto
        const distanceRe = zRe - historyRe[previousIndex]!;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- in-bounds proof as in classifyInto
        const distanceIm = zIm - historyIm[previousIndex]!;
        const distanceSquared = distanceRe * distanceRe + distanceIm * distanceIm;
        // Common case: one compare, as in classifyInto (the threshold is the
        // loose cap instead of the production gate).
        if (distanceSquared > LOOSE_CAP_SQUARED) {
          continue;
        }
        if (distanceSquared > toleranceSquared) {
          // Trigger candidate: loose but not production-close. Remember the
          // smallest eligible lag; the scan itself continues unchanged.
          if (
            pendingPeriod === 0 &&
            state.attempts < MAX_ATTEMPTS_PER_PIXEL &&
            state.triggers < MAX_TRIGGERS_PER_PIXEL
          ) {
            const looseBound = LOOSE_PROPOSAL * Math.max(1, Math.abs(zRe), Math.abs(zIm));
            if (
              distanceSquared <= looseBound * looseBound &&
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- period <= maxPeriod < gate array length
              (gateEpoch[period] !== epoch || distanceSquared <= gateSquared[period]!)
            ) {
              pendingPeriod = period;
            }
          }
          continue;
        }

        // Verifier acceptance, inlined at its single call site (see the orbit
        // loop comment in classifyInto for why the helper form is forbidden
        // here). Verbatim copy of the classifyInto block.
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
      if (pendingPeriod !== 0) {
        break;
      }
    }
    if (pendingPeriod === 0) {
      break;
    }

    // ---- certification phase: outside the orbit loop (V8 constraint) ----
    spill[SPILL_Z_RE] = zRe;
    spill[SPILL_Z_IM] = zIm;
    const certified = attemptCertification(
      state,
      scratch,
      options,
      cRe,
      cIm,
      zRe,
      zIm,
      pendingPeriod,
      iteration,
      out,
    );
    if (certified === 1) {
      return;
    }
    // Reload after the call so no orbit phi is live across it.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- spill has four slots
    zRe = spill[SPILL_Z_RE]!;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- spill has four slots
    zIm = spill[SPILL_Z_IM]!;
    iteration += 1;
  }

  out.status = 0;
  out.iterations = options.maxIterations;
  out.evidence = ORBIT_EVIDENCE_CODE.iterationLimit;
};
