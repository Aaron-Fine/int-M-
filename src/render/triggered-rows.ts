import {
  AIRPLANE_BOX,
  classifyAnalyticInto,
  classifyPeriodThreeInto,
  createOrbitSample,
  ORBIT_EVIDENCE_CODE,
  OrbitScratch,
  RABBIT_BOX,
  resolveOrbitOptions,
  TRIGGERED_SCAN_INTERVAL_FIRST,
  TRIGGERED_SCAN_INTERVAL_MAX,
  VERIFIER_VERDICT,
  verifyCycleInto,
  type OrbitOptions,
  type OrbitSample,
} from '../domain';
import { PACK_PERIOD_BITS, PACK_PERIOD_MAX, PACK_STATUS_CODES } from './packed-semantic';

/**
 * Two-lane row kernel for the triggered classifier (src/domain/orbit-triggered.ts).
 *
 * z -> z^2 + c is a latency-bound dependency chain; two independent orbits in
 * one loop let the CPU overlap them. Each lane streams its own pixels through
 * a stride-1 row: when a lane's pixel resolves (escape, acceptance, budget
 * exhaustion) its result is written straight into the band storage and the
 * lane takes the next unclaimed pixel, so a fast-escaping neighbour never
 * leaves the other lane running alone (as a bail-to-scalar pair kernel does).
 *
 * Per pixel, a lane performs exactly the operations of
 * classifyTriggeredOrbitInto in the same order (the analytic prologue, the
 * step, the escape test, the ring store, the watched-lag test, the period-3
 * closed form at the first scanning iteration, the full scans with their
 * argmin, and the canonical verifier call), so every result is
 * bit-identical to the scalar kernel; tests/unit/render/triggered-rows.test.ts
 * pins that. Two harmless reorderings: the ring store happens before the
 * escape test (an escaped pixel's last slot is never read: a lane's next
 * pixel overwrites slots before it reads them), and the watched-lag test is
 * evaluated during warmup but only used from the first scanning iteration.
 *
 * Hot-loop rules from orbit.ts: the lockstep loop has no calls. The rare
 * calls (verifier on a proposal, analytic closed forms on a region hit) run
 * with every double the loops carry round-tripped through `spill`.
 * classifyRow adds no inlinable call for the period-3 path (ADR 0010): the
 * gate is a per-row window computed from the box data before the lanes start,
 * and only the closed form, too large for TurboFan to inline, is called.
 * Calling inPeriodThreeGate here spent TurboFan's inlining budget, so a refill
 * site of classifyAnalyticInto stayed a real call, and the far-exterior stable
 * pass, where no pixel reaches the gate, ran about 10% slower.
 *
 * Lockstep shape: each lane raises an event on one of three tests, so the
 * common iteration is three compares per lane:
 * - escape (|z|^2 > 4);
 * - the watched-lag proposal test against `armX`, the lane's proposal
 *   threshold: cycleTolerance^2 while the lane may fire, -1 otherwise
 *   (before the first scanning iteration, or while parked), which makes the
 *   test false for every distance;
 * - `itX === dueX`, the next event iteration: one before the first
 *   scanning iteration (arms the lane), then the scalar kernel's next
 *   scheduled scan (`scheduledX`, gap `intervalX`) or the final iteration of
 *   the budget, whichever comes first.
 * Both lanes' history rings share one interleaved array (slot i holds lane
 * A's re, im then lane B's re, im), so the loop carries one ring pointer.
 */

const ESCAPED_WORD = PACK_STATUS_CODES.escaped << PACK_PERIOD_BITS;
const UNRESOLVED_WORD = PACK_STATUS_CODES.unresolved << PACK_PERIOD_BITS;
const ATTRACTING_BASE = PACK_STATUS_CODES.attracting << PACK_PERIOD_BITS;
/** Disarmed proposal threshold: no squared distance (or NaN) is <= -1. */
const DISARMED = -1;

// Spill slots: both lanes' orbit points and parameters, and a scan minimum.
const S_ZA_RE = 0;
const S_ZA_IM = 1;
const S_ZB_RE = 2;
const S_ZB_IM = 3;
const S_CA = 4;
const S_CB = 5;
const S_NEAREST = 6;

/** Band channels for one stride-1 row (views into the band storage). */
export interface RowOutput {
  readonly packedStatusPeriod: Uint32Array;
  readonly smoothIterationOrMultiplierMagnitude: Float64Array;
  readonly multiplierAngle: Float64Array;
}

/**
 * Prepared two-lane kernel: options, the shared ring, the spill, and the
 * verifier target are allocated once. Single-threaded; reusable across rows.
 */
export class TriggeredRowKernel {
  readonly #options: OrbitOptions;
  readonly #ring: Float64Array;
  readonly #mask: number;
  readonly #spill = new Float64Array(8);
  readonly #out: OrbitSample = createOrbitSample();

  public constructor(options: Partial<OrbitOptions>) {
    this.#options = resolveOrbitOptions(options);
    if (this.#options.maxPeriod > PACK_PERIOD_MAX) {
      throw new RangeError('maxPeriod does not fit the packed period channel');
    }
    // Same power-of-two capacity as OrbitScratch, four doubles per slot.
    const capacity = new OrbitScratch(this.#options.maxPeriod).historyRe.length;
    this.#mask = capacity - 1;
    this.#ring = new Float64Array(4 * capacity);
  }

  /**
   * Classifies pixels x = 0..width-1 of one row (real parts `columnsRe[x]`,
   * shared imaginary part `cIm`) into `row` at `offset + x`.
   */
  // eslint-disable-next-line complexity -- two lanes of the fused triggered kernel; see the module comment
  public classifyRow(
    columnsRe: Float64Array,
    cIm: number,
    width: number,
    row: RowOutput,
    offset: number,
  ): void {
    const options = this.#options;
    const spill = this.#spill;
    const out = this.#out;
    const ring = this.#ring;
    const mask = this.#mask;
    const packed = row.packedStatusPeriod;
    const primary = row.smoothIterationOrMultiplierMagnitude;
    const angle = row.multiplierAngle;
    const toleranceSquared = options.cycleTolerance * options.cycleTolerance;
    const maxIterations = options.maxIterations;
    const maxPeriod = options.maxPeriod;
    const scanStart = Math.max(options.cycleWarmup, 2);
    // Period-3 gate (ADR 0010), per row. The boxes' |Im c| bands are
    // disjoint and every box lies inside the hull, so on this row
    // inPeriodThreeGate(c, cIm) is exactly p3ReMin <= c <= p3ReMax for the box
    // whose band holds |cIm|, and an empty window (false for every c, NaN
    // included) when none does. Math.abs(-0) is +0, which compares as -0
    // does. Written out, not called (see the module comment).
    const absIm = Math.abs(cIm);
    let p3ReMin = Number.POSITIVE_INFINITY;
    let p3ReMax = Number.NEGATIVE_INFINITY;
    if (absIm >= RABBIT_BOX.absImMin && absIm <= RABBIT_BOX.absImMax) {
      p3ReMin = RABBIT_BOX.reMin;
      p3ReMax = RABBIT_BOX.reMax;
    } else if (absIm >= AIRPLANE_BOX.absImMin && absIm <= AIRPLANE_BOX.absImMax) {
      p3ReMin = AIRPLANE_BOX.reMin;
      p3ReMax = AIRPLANE_BOX.reMax;
    }

    let nextX = 0;
    // Lane state. A parked lane (no pixel left) holds z = NaN with a disarmed
    // threshold and an unreachable due iteration: no event, ever. (z = 0 is
    // not inert: the row's shared imaginary part would make the parked lane
    // iterate c = i * cIm, which can escape.) NaN is absorbing, and every
    // event test (|z|^2 > 4, distance <= arm) is false for NaN.
    let xA = -1;
    let cA = 0;
    let zaRe = 0;
    let zaIm = 0;
    let itA = 0;
    let dueA = -1;
    let scheduledA = 0;
    let intervalA = TRIGGERED_SCAN_INTERVAL_FIRST;
    let armA = DISARMED;
    let watchA = 1;
    let xB = -1;
    let cB = 0;
    let zbRe = 0;
    let zbIm = 0;
    let itB = 0;
    let dueB = -1;
    let scheduledB = 0;
    let intervalB = TRIGGERED_SCAN_INTERVAL_FIRST;
    let armB = DISARMED;
    let watchB = 1;
    let pendingA = true;
    let pendingB = true;

    for (;;) {
      // Refill: claim the next pixel; analytic pixels resolve on the spot.
      if (pendingA) {
        pendingA = false;
        xA = -1;
        cA = 0;
        zaRe = Number.NaN;
        zaIm = Number.NaN;
        itA = 0;
        dueA = -1;
        armA = DISARMED;
        while (nextX < width) {
          const x = nextX;
          nextX += 1;
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- x < width <= columnsRe.length
          const c = columnsRe[x]!;
          const ySquared = cIm * cIm;
          const cardioidX = c - 0.25;
          const q = cardioidX * cardioidX + ySquared;
          const bulbX = c + 1;
          if (q * (q + cardioidX) < 0.25 * ySquared || bulbX * bulbX + ySquared < 1 / 16) {
            spill[S_ZB_RE] = zbRe;
            spill[S_ZB_IM] = zbIm;
            spill[S_CB] = cB;
            const analytic = classifyAnalyticInto(c, cIm, out);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fixed-size spill
            zbRe = spill[S_ZB_RE]!;
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fixed-size spill
            zbIm = spill[S_ZB_IM]!;
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fixed-size spill
            cB = spill[S_CB]!;
            if (analytic) {
              const o = offset + x;
              packed[o] = ATTRACTING_BASE | out.period;
              primary[o] = out.multiplierMagnitude;
              angle[o] = out.multiplierAngle;
              continue;
            }
          }
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- x < width <= columnsRe.length
          cA = columnsRe[x]!;
          xA = x;
          zaRe = 0;
          zaIm = 0;
          dueA = Math.min(scanStart - 1, maxIterations);
          scheduledA = scanStart;
          intervalA = TRIGGERED_SCAN_INTERVAL_FIRST;
          watchA = 1;
          break;
        }
      }
      if (pendingB) {
        pendingB = false;
        xB = -1;
        cB = 0;
        zbRe = Number.NaN;
        zbIm = Number.NaN;
        itB = 0;
        dueB = -1;
        armB = DISARMED;
        while (nextX < width) {
          const x = nextX;
          nextX += 1;
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- x < width <= columnsRe.length
          const c = columnsRe[x]!;
          const ySquared = cIm * cIm;
          const cardioidX = c - 0.25;
          const q = cardioidX * cardioidX + ySquared;
          const bulbX = c + 1;
          if (q * (q + cardioidX) < 0.25 * ySquared || bulbX * bulbX + ySquared < 1 / 16) {
            spill[S_ZA_RE] = zaRe;
            spill[S_ZA_IM] = zaIm;
            spill[S_CA] = cA;
            const analytic = classifyAnalyticInto(c, cIm, out);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fixed-size spill
            zaRe = spill[S_ZA_RE]!;
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fixed-size spill
            zaIm = spill[S_ZA_IM]!;
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fixed-size spill
            cA = spill[S_CA]!;
            if (analytic) {
              const o = offset + x;
              packed[o] = ATTRACTING_BASE | out.period;
              primary[o] = out.multiplierMagnitude;
              angle[o] = out.multiplierAngle;
              continue;
            }
          }
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- x < width <= columnsRe.length
          cB = columnsRe[x]!;
          xB = x;
          zbRe = 0;
          zbIm = 0;
          dueB = Math.min(scanStart - 1, maxIterations);
          scheduledB = scanStart;
          intervalB = TRIGGERED_SCAN_INTERVAL_FIRST;
          watchB = 1;
          break;
        }
      }
      if (xA < 0 && xB < 0) {
        return;
      }

      // Lockstep: both orbits advance until either lane raises an event.
      let magnitudeA: number;
      let magnitudeB: number;
      let watchedA: number;
      let watchedB: number;
      for (;;) {
        const nextARe = zaRe * zaRe - zaIm * zaIm + cA;
        const nextBRe = zbRe * zbRe - zbIm * zbIm + cB;
        zaIm = 2 * zaRe * zaIm + cIm;
        zbIm = 2 * zbRe * zbIm + cIm;
        zaRe = nextARe;
        zbRe = nextBRe;
        itA += 1;
        itB += 1;
        magnitudeA = zaRe * zaRe + zaIm * zaIm;
        magnitudeB = zbRe * zbRe + zbIm * zbIm;
        const slotA = ((itA - 1) & mask) << 2;
        const slotB = (((itB - 1) & mask) << 2) + 2;
        ring[slotA] = zaRe;
        ring[slotA + 1] = zaIm;
        ring[slotB] = zbRe;
        ring[slotB + 1] = zbIm;
        const watchSlotA = ((itA - 1 - watchA) & mask) << 2;
        const watchSlotB = (((itB - 1 - watchB) & mask) << 2) + 2;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- masked slot < ring length
        const watchARe = zaRe - ring[watchSlotA]!;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- masked slot < ring length
        const watchAIm = zaIm - ring[watchSlotA + 1]!;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- masked slot < ring length
        const watchBRe = zbRe - ring[watchSlotB]!;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- masked slot < ring length
        const watchBIm = zbIm - ring[watchSlotB + 1]!;
        watchedA = watchARe * watchARe + watchAIm * watchAIm;
        watchedB = watchBRe * watchBRe + watchBIm * watchBIm;
        if (
          magnitudeA > 4 ||
          watchedA <= armA ||
          itA === dueA ||
          magnitudeB > 4 ||
          watchedB <= armB ||
          itB === dueB
        ) {
          break;
        }
      }

      // Lane A event.
      if (magnitudeA > 4) {
        const smoothIteration = itA + 1 - Math.log2(Math.log2(Math.sqrt(magnitudeA)));
        const o = offset + xA;
        packed[o] = ESCAPED_WORD;
        primary[o] = Number.isFinite(smoothIteration) ? smoothIteration : itA;
        angle[o] = 0;
        pendingA = true;
      } else if (itA === dueA && itA < scanStart) {
        // Before the first scanning iteration: arm the lane (the watched-lag
        // test applies from the next iteration), or end an exhausted budget.
        if (itA === maxIterations) {
          const o = offset + xA;
          packed[o] = UNRESOLVED_WORD;
          primary[o] = 0;
          angle[o] = 0;
          pendingA = true;
        } else {
          armA = toleranceSquared;
          dueA = Math.min(scheduledA, maxIterations);
        }
      } else if (watchedA <= armA || itA === dueA) {
        // Analytic period-3 fast path at the first scanning iteration, as in
        // classifyTriggeredOrbitInto (ADR 0010).
        let analyticA = false;
        if (itA === scanStart && cA >= p3ReMin && cA <= p3ReMax) {
          spill[S_ZA_RE] = zaRe;
          spill[S_ZA_IM] = zaIm;
          spill[S_ZB_RE] = zbRe;
          spill[S_ZB_IM] = zbIm;
          spill[S_CA] = cA;
          spill[S_CB] = cB;
          analyticA = classifyPeriodThreeInto(cA, cIm, out);
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fixed-size spill
          zaRe = spill[S_ZA_RE]!;
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fixed-size spill
          zaIm = spill[S_ZA_IM]!;
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fixed-size spill
          zbRe = spill[S_ZB_RE]!;
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fixed-size spill
          zbIm = spill[S_ZB_IM]!;
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fixed-size spill
          cA = spill[S_CA]!;
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fixed-size spill
          cB = spill[S_CB]!;
        }
        if (analyticA) {
          const o = offset + xA;
          packed[o] = ATTRACTING_BASE | out.period;
          primary[o] = out.multiplierMagnitude;
          angle[o] = out.multiplierAngle;
          pendingA = true;
        } else {
          if (itA === scheduledA) {
            scheduledA = itA + intervalA;
            intervalA = Math.min(2 * intervalA, TRIGGERED_SCAN_INTERVAL_MAX);
          }
          // Full scan of lane A: the legacy lag scan of this iteration.
          const currentSlot = ((itA - 1) & mask) << 2;
          const largestPeriod = Math.min(maxPeriod, itA - 1);
          let nearestLag = 1;
          let nearestSquared = Number.POSITIVE_INFINITY;
          let accepted = false;
          for (let period = 1; period <= largestPeriod; period += 1) {
            const previousSlot = (currentSlot - (period << 2)) & ((mask << 2) | 3);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- masked slot < ring length
            const distanceRe = zaRe - ring[previousSlot]!;
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- masked slot < ring length
            const distanceIm = zaIm - ring[previousSlot + 1]!;
            const distanceSquared = distanceRe * distanceRe + distanceIm * distanceIm;
            if (distanceSquared < nearestSquared) {
              nearestSquared = distanceSquared;
              nearestLag = period;
            }
            if (distanceSquared > toleranceSquared) {
              continue;
            }
            spill[S_ZA_RE] = zaRe;
            spill[S_ZA_IM] = zaIm;
            spill[S_ZB_RE] = zbRe;
            spill[S_ZB_IM] = zbIm;
            spill[S_CA] = cA;
            spill[S_CB] = cB;
            spill[S_NEAREST] = nearestSquared;
            const verdict = verifyCycleInto(
              cA,
              cIm,
              zaRe,
              zaIm,
              period,
              itA,
              ORBIT_EVIDENCE_CODE.convergedCycle,
              out,
            );
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fixed-size spill
            zaRe = spill[S_ZA_RE]!;
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fixed-size spill
            zaIm = spill[S_ZA_IM]!;
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fixed-size spill
            zbRe = spill[S_ZB_RE]!;
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fixed-size spill
            zbIm = spill[S_ZB_IM]!;
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fixed-size spill
            cA = spill[S_CA]!;
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fixed-size spill
            cB = spill[S_CB]!;
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fixed-size spill
            nearestSquared = spill[S_NEAREST]!;
            if (verdict === VERIFIER_VERDICT.accepted) {
              accepted = true;
              break;
            }
          }
          const o = offset + xA;
          if (accepted) {
            packed[o] = ATTRACTING_BASE | out.period;
            primary[o] = out.multiplierMagnitude;
            angle[o] = out.multiplierAngle;
            pendingA = true;
          } else if (itA === maxIterations) {
            packed[o] = UNRESOLVED_WORD;
            primary[o] = 0;
            angle[o] = 0;
            pendingA = true;
          } else {
            watchA = nearestLag;
            dueA = Math.min(scheduledA, maxIterations);
          }
        }
      }

      // Lane B event.
      if (magnitudeB > 4) {
        const smoothIteration = itB + 1 - Math.log2(Math.log2(Math.sqrt(magnitudeB)));
        const o = offset + xB;
        packed[o] = ESCAPED_WORD;
        primary[o] = Number.isFinite(smoothIteration) ? smoothIteration : itB;
        angle[o] = 0;
        pendingB = true;
      } else if (itB === dueB && itB < scanStart) {
        if (itB === maxIterations) {
          const o = offset + xB;
          packed[o] = UNRESOLVED_WORD;
          primary[o] = 0;
          angle[o] = 0;
          pendingB = true;
        } else {
          armB = toleranceSquared;
          dueB = Math.min(scheduledB, maxIterations);
        }
      } else if (watchedB <= armB || itB === dueB) {
        let analyticB = false;
        if (itB === scanStart && cB >= p3ReMin && cB <= p3ReMax) {
          spill[S_ZA_RE] = zaRe;
          spill[S_ZA_IM] = zaIm;
          spill[S_ZB_RE] = zbRe;
          spill[S_ZB_IM] = zbIm;
          spill[S_CA] = cA;
          spill[S_CB] = cB;
          analyticB = classifyPeriodThreeInto(cB, cIm, out);
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fixed-size spill
          zaRe = spill[S_ZA_RE]!;
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fixed-size spill
          zaIm = spill[S_ZA_IM]!;
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fixed-size spill
          zbRe = spill[S_ZB_RE]!;
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fixed-size spill
          zbIm = spill[S_ZB_IM]!;
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fixed-size spill
          cA = spill[S_CA]!;
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fixed-size spill
          cB = spill[S_CB]!;
        }
        if (analyticB) {
          const o = offset + xB;
          packed[o] = ATTRACTING_BASE | out.period;
          primary[o] = out.multiplierMagnitude;
          angle[o] = out.multiplierAngle;
          pendingB = true;
        } else {
          if (itB === scheduledB) {
            scheduledB = itB + intervalB;
            intervalB = Math.min(2 * intervalB, TRIGGERED_SCAN_INTERVAL_MAX);
          }
          const currentSlot = (((itB - 1) & mask) << 2) + 2;
          const largestPeriod = Math.min(maxPeriod, itB - 1);
          let nearestLag = 1;
          let nearestSquared = Number.POSITIVE_INFINITY;
          let accepted = false;
          for (let period = 1; period <= largestPeriod; period += 1) {
            const previousSlot = (currentSlot - (period << 2)) & ((mask << 2) | 3);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- masked slot < ring length
            const distanceRe = zbRe - ring[previousSlot]!;
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- masked slot < ring length
            const distanceIm = zbIm - ring[previousSlot + 1]!;
            const distanceSquared = distanceRe * distanceRe + distanceIm * distanceIm;
            if (distanceSquared < nearestSquared) {
              nearestSquared = distanceSquared;
              nearestLag = period;
            }
            if (distanceSquared > toleranceSquared) {
              continue;
            }
            spill[S_ZA_RE] = zaRe;
            spill[S_ZA_IM] = zaIm;
            spill[S_ZB_RE] = zbRe;
            spill[S_ZB_IM] = zbIm;
            spill[S_CA] = cA;
            spill[S_CB] = cB;
            spill[S_NEAREST] = nearestSquared;
            const verdict = verifyCycleInto(
              cB,
              cIm,
              zbRe,
              zbIm,
              period,
              itB,
              ORBIT_EVIDENCE_CODE.convergedCycle,
              out,
            );
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fixed-size spill
            zaRe = spill[S_ZA_RE]!;
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fixed-size spill
            zaIm = spill[S_ZA_IM]!;
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fixed-size spill
            zbRe = spill[S_ZB_RE]!;
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fixed-size spill
            zbIm = spill[S_ZB_IM]!;
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fixed-size spill
            cA = spill[S_CA]!;
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fixed-size spill
            cB = spill[S_CB]!;
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fixed-size spill
            nearestSquared = spill[S_NEAREST]!;
            if (verdict === VERIFIER_VERDICT.accepted) {
              accepted = true;
              break;
            }
          }
          const o = offset + xB;
          if (accepted) {
            packed[o] = ATTRACTING_BASE | out.period;
            primary[o] = out.multiplierMagnitude;
            angle[o] = out.multiplierAngle;
            pendingB = true;
          } else if (itB === maxIterations) {
            packed[o] = UNRESOLVED_WORD;
            primary[o] = 0;
            angle[o] = 0;
            pendingB = true;
          } else {
            watchB = nearestLag;
            dueB = Math.min(scheduledB, maxIterations);
          }
        }
      }
    }
  }
}
