import { describe, expect, it } from 'vitest';

import {
  classifyInto,
  createOrbitSample,
  materializeOrbitResult,
  resolveOrbitOptions,
  OrbitScratch,
  VERIFIER_REVISION,
  type OrbitOptions,
  type OrbitResult,
} from '../../../src/domain';
import { legacyClassifyOrbit, STRATA } from './legacy-differential';
import { classifyDDMinimal, type DDOracleVerdict } from './dd-oracle';

/**
 * Oracle adjudication of every legacy-versus-verifier disagreement (PR 3 M3,
 * plan section 3 semantic compatibility contract: "Categorical status and
 * primitive period are judged against independent high-precision fixtures
 * and deterministic stratified holdouts. A changed legacy answer may ship
 * only when the oracle supports the change. False attracting results and
 * wrong primitive periods are release blockers; numerically ambiguous cases
 * remain unresolved").
 *
 * The grid is the deterministic stratified differential grid (10 strata,
 * 3225 points, tests/unit/domain/legacy-differential.ts) under three
 * profiles. The baseline is the verbatim legacy port; the adjudicator is
 * the minimal double-double oracle shared with the PR 4 differential suite
 * (tests/unit/domain/dd-oracle.ts: dd arithmetic copied verbatim from
 * poc/performance/src/oracle/dd.ts, certification policy of
 * poc/performance/src/oracle/classify-dd.ts with the complex-Newton polish).
 *
 * The oracle deliberately lacks the analytic fast paths (like its poc
 * counterpart), so oracle agreement on cardioid/bulb points is genuine
 * cross-validation of the closed forms.
 */

// ---------------------------------------------------------------------------
// Adjudication over the differential grid.
// ---------------------------------------------------------------------------

const PROFILES: readonly { readonly label: string; readonly options: Partial<OrbitOptions> }[] = [
  { label: 'quick', options: { maxIterations: 256, maxPeriod: 16 } },
  { label: 'balanced', options: {} },
  { label: 'detailed', options: { maxIterations: 1024, maxPeriod: 64 } },
];

interface Adjudication {
  changed: number;
  periodReductions: string[];
  falseAttracting: number;
  wrongPrimitivePeriod: number;
  unsupported: string[];
  unresolvedDelta: number;
}

describe('dd-oracle adjudication of every legacy-versus-verifier disagreement', () => {
  const oracleByIndex = new Map<number, DDOracleVerdict>();
  for (let index = 0; index < STRATA.length; index += 1) {
    const point = STRATA[index];
    if (point === undefined) {
      throw new Error('empty grid slot');
    }
    oracleByIndex.set(index, classifyDDMinimal(point.re, point.im));
  }

  for (const profile of PROFILES) {
    // eslint-disable-next-line complexity -- the branch count is the adjudication decision table itself; see the plan section 3 rules it implements
    it(`supports every changed legacy answer and certifies every attracting claim (${profile.label})`, () => {
      const options = resolveOrbitOptions(profile.options);
      const scratch = new OrbitScratch(64);
      const sample = createOrbitSample();
      const classifyProduction = (point: {
        readonly re: number;
        readonly im: number;
      }): OrbitResult => {
        classifyInto(point.re, point.im, options, scratch, sample);
        return materializeOrbitResult(sample);
      };

      const adjudication: Adjudication = {
        changed: 0,
        periodReductions: [],
        falseAttracting: 0,
        wrongPrimitivePeriod: 0,
        unsupported: [],
        unresolvedDelta: 0,
      };

      for (let index = 0; index < STRATA.length; index += 1) {
        const point = STRATA[index];
        if (point === undefined) {
          throw new Error('empty grid slot');
        }
        const production = classifyProduction(point);
        const legacy = legacyClassifyOrbit(point, options);
        const oracle = oracleByIndex.get(index);
        if (oracle === undefined) {
          throw new Error(`missing oracle adjudication for grid point ${index}`);
        }

        if (production.status === 'unresolved') {
          adjudication.unresolvedDelta += 1;
        }
        if (legacy.status === 'unresolved') {
          adjudication.unresolvedDelta -= 1;
        }

        // Zero false attracting (release blocker): production claims
        // attracting where the oracle proves escape.
        if (production.status === 'attracting-cycle' && oracle.status === 'escaped') {
          adjudication.falseAttracting += 1;
        }
        // Zero wrong primitive periods (release blocker).
        if (
          production.status === 'attracting-cycle' &&
          oracle.status === 'attracting-cycle' &&
          production.period !== oracle.cycle.primitive
        ) {
          adjudication.wrongPrimitivePeriod += 1;
        }

        if (
          production.status === legacy.status &&
          (production.status !== 'attracting-cycle' ||
            legacy.status !== 'attracting-cycle' ||
            (production.period === legacy.period &&
              production.multiplierMagnitude === legacy.multiplierMagnitude))
        ) {
          continue;
        }

        // A legacy-versus-verifier disagreement: it may ship only when the
        // oracle supports the change (plan section 3).
        adjudication.changed += 1;

        if (
          production.status === 'attracting-cycle' &&
          legacy.status === 'attracting-cycle' &&
          production.period < legacy.period &&
          legacy.period % production.period === 0
        ) {
          // The documented legacy flaw: a non-primitive multiple reported
          // by the legacy scan. Supported iff the oracle certifies the same
          // primitive period.
          adjudication.periodReductions.push(`${index}:${legacy.period}->${production.period}`);
          if (
            oracle.status !== 'attracting-cycle' ||
            oracle.cycle.primitive !== production.period
          ) {
            adjudication.unsupported.push(
              `${index}: reduction ${legacy.period}->${production.period} not oracle-supported (oracle ${oracle.status})`,
            );
          }
          continue;
        }

        adjudication.unsupported.push(
          `${index}: unsupported change shape ${legacy.status}->${production.status} (periods ${legacy.status === 'attracting-cycle' ? String(legacy.period) : '-'}->${production.status === 'attracting-cycle' ? String(production.period) : '-'})`,
        );
      }

      // Unresolved-rate delta vs legacy, quantified: zero on this grid
      // (every disagreement is a period reduction, no status flips).
      expect(adjudication.unresolvedDelta).toBe(0);
      expect(adjudication.falseAttracting).toBe(0);
      expect(adjudication.wrongPrimitivePeriod).toBe(0);
      expect(adjudication.unsupported).toEqual([]);
      // Pin the disagreement shape and size per profile: every changed
      // legacy answer on this grid is a primitive-period reduction (the
      // documented flaw the verifier's three-way divisor policy fixes).
      const expectedReductions: Record<string, number> = { quick: 6, balanced: 13, detailed: 17 };
      expect(adjudication.periodReductions.length).toBe(expectedReductions[profile.label]);
      expect(adjudication.periodReductions.length).toBe(adjudication.changed);
    });
  }

  it('certifies every production attracting claim or leaves it honestly unadjudicated', () => {
    const options = resolveOrbitOptions({});
    const scratch = new OrbitScratch(64);
    const sample = createOrbitSample();
    let certified = 0;
    let unadjudicatedAttracting = 0;
    let missedDetections = 0;
    for (let index = 0; index < STRATA.length; index += 1) {
      const point = STRATA[index];
      const oracle = oracleByIndex.get(index);
      if (point === undefined || oracle === undefined) {
        throw new Error('empty grid slot');
      }
      classifyInto(point.re, point.im, options, scratch, sample);
      const production = materializeOrbitResult(sample);

      if (production.status === 'attracting-cycle') {
        if (oracle.status !== 'attracting-cycle') {
          // The oracle's budget cannot reach this cycle (near-parabolic
          // attraction or analytic fast paths it deliberately lacks):
          // unadjudicated, never false.
          unadjudicatedAttracting += 1;
          continue;
        }
        certified += 1;
        expect(production.period).toBe(oracle.cycle.primitive);
        if (production.multiplierMagnitude === 0) {
          // Superattracting identity: both sides |lambda| ~ 0 (plan
          // section 3; never arithmetic on infinities).
          expect(oracle.cycle.magnitude).toBeLessThanOrEqual(MULTIPLIER_IDENTITY_TOLERANCE);
        } else {
          expect(
            Math.abs(production.multiplierMagnitude - oracle.cycle.magnitude),
          ).toBeLessThanOrEqual(MULTIPLIER_TOLERANCE);
        }
      } else if (production.status === 'unresolved' && oracle.status === 'attracting-cycle') {
        // Profile-budget miss against a certified oracle cycle: an honest
        // budget limitation, not a false claim. Pinned below.
        missedDetections += 1;
      }
    }
    expect(certified).toBeGreaterThan(0);
    expect(unadjudicatedAttracting).toBeGreaterThan(0);
    expect(missedDetections).toBe(14);
    expect(VERIFIER_REVISION).toBe('src-verifier-1.0.0');
  });
});

/** Declared binary64 multiplier tolerance (fixtures/orbits.v1.json policy). */
const MULTIPLIER_TOLERANCE = 1e-7;

/** Superattracting identity band: |lambda| this small is effectively zero. */
const MULTIPLIER_IDENTITY_TOLERANCE = 1e-7;
