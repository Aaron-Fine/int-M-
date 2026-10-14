/**
 * Interior-distance-estimated period guessing (plan section 5 PoC list,
 * candidate source layered on the checkpoint schedule).
 *
 * The kernel walks the orbit maintaining the plan section 6 parameter
 * derivative recurrence B_{j+1} = 2 z_j B_j + 1, B_0 = 0, so B_n = dz_n/dc,
 * and uses it as a p-free distance-estimate gate over the proposal
 * machinery of the checkpoint schedule. Design note (frozen before
 * benchmarking): the naive "fire when B settles" reading is period-1-only
 * and was rejected during design - on a period-p cycle the orbit (and with
 * it the B sequence) converges to a PERIODIC sequence, so consecutive B
 * differences do not vanish for p >= 2. The frozen criterion instead uses
 * the split the interior/exterior distance estimates are built from: |B_n|
 * stays bounded for orbits approaching any cycle and grows without bound
 * for escaping and chaotic orbits.
 *
 * Frozen policy:
 *
 * 1. Analytic fast paths first (shared with every kernel).
 * 2. Host schedule: the checkpoint kernel's frozen policy verbatim (one
 *    comparison per step against the retained checkpoint, tauCandidate
 *    proposals, doubling re-arm on rejection, interval doubling capped at
 *    the mode ceiling), so the variant isolates the DE addition.
 * 3. DE arming gate (evaluated every step; a B-sequence magnitude check,
 *    not a candidate lag distance evaluation, so it is not counted in
 *    lagComparisons - same convention as the trigger step gate):
 *    - |B_n| > disarmExteriorB * max(1, |z_n|) disarms proposals for the
 *      rest of the pixel: the orbit is exterior-bound by the same recurrence
 *      the exterior distance estimate uses, and no proposal can succeed.
 *    - While disarmed, |B_n| <= rearmInteriorB * max(1, |z_n|) re-arms
 *      proposals: the orbit has entered a convergent regime compatible with
 *      PoC-detectable cycles. The decade-wide hysteresis gap keeps noise
 *      around one threshold from oscillating the arm state.
 * 4. DE-plausibility extension round (the period-guessing proposal): when a
 *    checkpoint proximity hit is REJECTED by the verifier, one round
 *    evaluates the z-return distance for every lag 1..min(cap, n - 1)
 *    (each evaluation counted), keeps the tauCandidate-proximity hits, and
 *    proposes them ordered by DE plausibility: ascending B-return
 *    consistency |B_n - B_{n-lag}| (the parameter-derivative sequence of
 *    the true period repeats; ties break toward the smaller lag), all
 *    budget-gated, verifier-decided.
 * 5. The shared rejected-candidate budget stops all proposals and their
 *    comparisons once exhausted; the orbit walk (and the B recurrence)
 *    continue so escape classification is unaffected.
 * 6. On unresolved orbit-budget end the default-on exhaustion scan runs one
 *    full lag scan from the final state at the mode ceiling.
 *
 * Systematic mode caps candidate lags at the profile maxPeriod
 * (systematic bucket). Opportunistic mode caps at DE_OPPORTUNISTIC_CEILING,
 * chosen to match the dd oracle's maxPeriod so every opportunistic
 * acceptance stays inside oracle adjudication range (plan section 4
 * opportunistic bucket: verified and bounded, never a coverage guarantee).
 *
 * Known limits (frozen with the policy): a post-excursion cycle whose final
 * |B*| exceeds rearmInteriorB stays disarmed - the same weakly attracting
 * points the PoC budgets cannot detect anyway; the extension round only
 * fires on checkpoint rejections, so orbits whose checkpoint lag never
 * lands near a multiple of the true period rely on the exhaustion scan.
 */

import {
  acceptedResult,
  analyticInterior,
  emptyMetrics,
  fullLagScan,
  kappaOf,
  proposalThresholdSquared,
  ProposalBudget,
  verifyCandidate,
  type AcceptedCandidate,
  type LagScanContext,
} from './shared.ts';
import type { ClassificationKernel, KernelMetrics, KernelOptions, KernelResult } from './shared.ts';

export const DE_GUESS_REVISION = 'poc-de-guess-1.0.0';

/**
 * Frozen DE-guess policy. Provenance: interior cycles detectable at PoC
 * budgets have |B*| = |B_cycle| / |1 - lambda| no larger than ~1e7 (|lambda|
 * <= 1 - 1e-4 for detection inside 1024 iterations, |B_cycle| <= ~1e3 at
 * corpus parameter scales), so disarmExteriorB = 1e8 sits one decade above
 * every proposal-viable regime and disarming only ever declares
 * exterior-bound behavior; rearmInteriorB = 1e6 marks the |B*| scale of
 * cycles still detectable at PoC budgets, and the [1e6, 1e8] gap is the
 * hysteresis band. Disarming is gate-side only (it stops proposals, never
 * creates them), so the constants cannot weaken the zero false/wrong gate.
 * PoC policy choices, frozen before benchmarking.
 */
export const DE_GUESS_THRESHOLDS = Object.freeze({
  disarmExteriorB: 1e8,
  rearmInteriorB: 1e6,
});

/**
 * Opportunistic ceiling for the capped-opportunistic mode. Provenance:
 * matches the dd oracle's maxPeriod = 96
 * (poc/performance/src/oracle/classify-dd.ts DEFAULT_DD_ORACLE_OPTIONS) so
 * opportunistic acceptances remain oracle-adjudicable in the differential
 * run.
 */
export const DE_OPPORTUNISTIC_CEILING = 96;

export class DeGuessKernel implements ClassificationKernel {
  public readonly name = 'de-guess' as const;
  readonly #opportunistic: boolean;
  #historyRe: Float64Array;
  #historyIm: Float64Array;
  #bHistoryRe: Float64Array;
  #bHistoryIm: Float64Array;
  // Per-round ordering scratch (preallocated once; reused every classify).
  #distanceSquared: Float64Array;
  #within: Uint8Array;
  #used: Uint8Array;
  #budget = new ProposalBudget();
  #scan: LagScanContext;

  public constructor(maxPeriod = 64, opportunistic = false) {
    const cap = opportunistic ? DE_OPPORTUNISTIC_CEILING : maxPeriod;
    const capacity = Math.max(2, Math.ceil(cap) + 1);
    this.#opportunistic = opportunistic;
    this.#historyRe = new Float64Array(capacity);
    this.#historyIm = new Float64Array(capacity);
    this.#bHistoryRe = new Float64Array(capacity);
    this.#bHistoryIm = new Float64Array(capacity);
    this.#distanceSquared = new Float64Array(capacity);
    this.#within = new Uint8Array(capacity);
    this.#used = new Uint8Array(capacity);
    this.#scan = {
      cRe: 0,
      cIm: 0,
      zRe: 0,
      zIm: 0,
      iteration: 0,
      maxPeriod: cap,
      historyRe: this.#historyRe,
      historyIm: this.#historyIm,
      metrics: emptyMetrics(),
      budget: this.#budget,
    };
  }

  /** Hysteresis update of the DE arming state (frozen threshold pair). */
  #updateArmed(armed: boolean, bMagnitude: number, bScale: number): boolean {
    if (armed) {
      return bMagnitude <= DE_GUESS_THRESHOLDS.disarmExteriorB * bScale;
    }
    return bMagnitude <= DE_GUESS_THRESHOLDS.rearmInteriorB * bScale;
  }

  /** Exhaustion scan (frozen) plus the honest unresolved epilogue. */
  #epilogue(
    cRe: number,
    cIm: number,
    zRe: number,
    zIm: number,
    options: KernelOptions,
    cap: number,
    metrics: KernelMetrics,
  ): KernelResult {
    if (options.exhaustionScan && !this.#budget.isExhausted()) {
      this.#scan.cRe = cRe;
      this.#scan.cIm = cIm;
      this.#scan.maxPeriod = cap;
      this.#scan.zRe = zRe;
      this.#scan.zIm = zIm;
      this.#scan.iteration = options.maxIterations;
      const candidate = fullLagScan(this.#scan);
      if (candidate !== undefined) {
        return acceptedResult('exhaustion-scan', options.maxIterations, candidate, metrics);
      }
    }
    return {
      status: 'unresolved',
      iterations: options.maxIterations,
      evidence: this.#budget.isExhausted() ? 'candidate-budget-exhausted' : 'iteration-limit',
      metrics,
    };
  }

  public classify(cRe: number, cIm: number, options: KernelOptions): KernelResult {
    const metrics = emptyMetrics();
    metrics.deGuessRounds = 0;
    this.#budget.reset();

    const analytic = analyticInterior(cRe, cIm);
    if (analytic !== undefined) {
      const magnitude = Math.hypot(analytic.multiplierRe, analytic.multiplierIm);
      return {
        status: 'attracting',
        iterations: 0,
        evidence: analytic.evidence,
        metrics,
        period: analytic.period,
        multiplierMagnitude: magnitude,
        multiplierAngle:
          magnitude === 0 ? 0 : Math.atan2(analytic.multiplierIm, analytic.multiplierRe),
        kappa: kappaOf(magnitude, analytic.period),
      };
    }

    const capacity = this.#historyRe.length;
    const cap = this.#opportunistic ? DE_OPPORTUNISTIC_CEILING : options.maxPeriod;
    this.#scan.metrics = metrics;
    this.#scan.cRe = cRe;
    this.#scan.cIm = cIm;
    this.#scan.maxPeriod = cap;

    let zRe = 0;
    let zIm = 0;
    let bRe = 0;
    let bIm = 0;
    let checkpointRe = 0;
    let checkpointIm = 0;
    let checkpointIteration = 0;
    let interval = 1;
    let reArmAt = 0;
    let reArmGap = 1;
    let armed = true;

    for (let iteration = 1; iteration <= options.maxIterations; iteration += 1) {
      // B_{j+1} = 2 z_j B_j + 1 with the pre-step z_j, so B stays aligned
      // with the new orbit state (B_n = dz_n/dc, B_0 = 0).
      const nextBRe = 2 * (zRe * bRe - zIm * bIm) + 1;
      const nextBIm = 2 * (zRe * bIm + zIm * bRe);
      const nextRe = zRe * zRe - zIm * zIm + cRe;
      zIm = 2 * zRe * zIm + cIm;
      zRe = nextRe;
      bRe = nextBRe;
      bIm = nextBIm;
      const magnitudeSquared = zRe * zRe + zIm * zIm;

      if (magnitudeSquared > 4) {
        return {
          status: 'escaped',
          iterations: iteration,
          evidence: 'escape-radius',
          metrics,
          escapeIteration: iteration,
          magnitudeSquared,
        };
      }

      const slot = (iteration - 1) % capacity;
      this.#historyRe[slot] = zRe;
      this.#historyIm[slot] = zIm;
      this.#bHistoryRe[slot] = bRe;
      this.#bHistoryIm[slot] = bIm;

      // DE arming gate: |B| bounded means possibly-interior; |B| exploding
      // through the disarm threshold means exterior-bound. Hysteresis pair,
      // one-way down, re-armable on genuine convergence.
      const bScale = Math.max(1, Math.abs(zRe), Math.abs(zIm));
      const bMagnitude = Math.abs(bRe) + Math.abs(bIm);
      armed = this.#updateArmed(armed, bMagnitude, bScale);

      if (
        iteration >= options.cycleWarmup &&
        iteration >= reArmAt &&
        armed &&
        !this.#budget.isExhausted()
      ) {
        const lag = iteration - checkpointIteration;
        metrics.lagComparisons += 1;
        const distanceRe = zRe - checkpointRe;
        const distanceIm = zIm - checkpointIm;
        // Host proposal path (checkpoint policy): a proximity hit with lag
        // inside the mode ceiling proposes (z_n, q) to the common verifier.
        let proposed = false;
        if (
          distanceRe * distanceRe + distanceIm * distanceIm <= proposalThresholdSquared(zRe, zIm) &&
          lag <= cap
        ) {
          proposed = true;
          const candidate = verifyCandidate(cRe, cIm, zRe, zIm, lag, metrics, this.#budget);
          if (candidate !== undefined) {
            return acceptedResult('de-guess-candidate', iteration, candidate, metrics);
          }
          // DE-plausibility extension round: the host lag failed; propose
          // the remaining proximity lags ordered by B-return consistency.
          metrics.deGuessRounds += 1;
          const roundCandidate = this.#extensionRound(
            cRe,
            cIm,
            zRe,
            zIm,
            bRe,
            bIm,
            iteration,
            lag,
            cap,
            metrics,
          );
          if (roundCandidate !== undefined) {
            return acceptedResult('de-guess-round', iteration, roundCandidate, metrics);
          }
          // Frozen rejection-retry (checkpoint policy): retain the
          // checkpoint and re-arm.
          reArmAt = iteration + reArmGap;
          reArmGap *= 2;
        }
        // Interval-exhaustion update (checkpoint policy, unchanged).
        if (!proposed && lag >= interval) {
          checkpointRe = zRe;
          checkpointIm = zIm;
          checkpointIteration = iteration;
          interval = Math.min(interval * 2, cap);
        }
      }
    }

    return this.#epilogue(cRe, cIm, zRe, zIm, options, cap, metrics);
  }

  /**
   * One extension round: tauCandidate-proximity lags proposed in
   * DE-plausibility order (ascending B-return consistency |B_n - B_{n-lag}|,
   * ties toward the smaller lag). No allocation: distance and ordering
   * scratch is preallocated kernel state.
   */
  #extensionRound(
    cRe: number,
    cIm: number,
    zRe: number,
    zIm: number,
    bRe: number,
    bIm: number,
    iteration: number,
    failedLag: number,
    cap: number,
    metrics: KernelMetrics,
  ): AcceptedCandidate | undefined {
    const capacity = this.#historyRe.length;
    const largest = Math.min(cap, iteration - 1);
    const thresholdSquared = proposalThresholdSquared(zRe, zIm);
    const distanceSquared = this.#distanceSquared;
    const within = this.#within;

    let hitCount = 0;
    for (let lag = 1; lag <= largest; lag += 1) {
      const index = (iteration - 1 - lag) % capacity;
      const dRe = zRe - (this.#historyRe[index] ?? Number.NaN);
      const dIm = zIm - (this.#historyIm[index] ?? Number.NaN);
      const dSquared = dRe * dRe + dIm * dIm;
      // Honest counting: every candidate lag distance evaluation is a lag
      // comparison; the B-consistency ordering below reuses the proximity
      // hits without new z evaluations (it reads the B history instead).
      metrics.lagComparisons += 1;
      distanceSquared[lag] = dSquared;
      const isHit = lag !== failedLag && dSquared <= thresholdSquared;
      within[lag] = isHit ? 1 : 0;
      if (isHit) {
        hitCount += 1;
      }
    }

    const used = this.#used;
    used.fill(0, 0, largest + 1);
    const bScale = Math.max(1, Math.abs(bRe), Math.abs(bIm));
    while (hitCount > 0) {
      if (this.#budget.isExhausted()) {
        return undefined;
      }
      let best = 0;
      let bestConsistency = Number.POSITIVE_INFINITY;
      for (let lag = 1; lag <= largest; lag += 1) {
        if (within[lag] !== 1 || used[lag] === 1) {
          continue;
        }
        const bIndex = (iteration - 1 - lag) % capacity;
        const dbRe = bRe - (this.#bHistoryRe[bIndex] ?? Number.NaN);
        const dbIm = bIm - (this.#bHistoryIm[bIndex] ?? Number.NaN);
        // DE plausibility: the true period repeats the B sequence, so its
        // B-return consistency is the smallest; ties keep the smaller lag.
        const consistency = (Math.abs(dbRe) + Math.abs(dbIm)) / bScale;
        if (consistency < bestConsistency) {
          best = lag;
          bestConsistency = consistency;
        }
      }
      if (best === 0) {
        return undefined;
      }
      used[best] = 1;
      hitCount -= 1;
      const candidate = verifyCandidate(cRe, cIm, zRe, zIm, best, metrics, this.#budget);
      if (candidate !== undefined) {
        return candidate;
      }
    }
    return undefined;
  }
}
