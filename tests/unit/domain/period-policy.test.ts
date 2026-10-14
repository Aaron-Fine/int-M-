import { describe, expect, it } from 'vitest';

import {
  classifyOrbit,
  createOrbitSample,
  DEFAULT_ORBIT_OPTIONS,
  evidenceSourceForFlag,
  EVIDENCE_SOURCE_VALUES,
  materializeOrbitResult,
  ORBIT_EVIDENCE_CODE,
  PERIOD_POLICIES,
  PERIOD_POLICY_REVISION,
  resolveOrbitOptions,
  VERIFIER_REVISION,
  VERIFIER_THRESHOLDS,
  type EvidenceSource,
  type PeriodPolicy,
} from '../../../src/domain';
import { STRATA } from './legacy-differential';

describe('period policy values (plan section 4 initial table)', () => {
  it('pins the per-profile systematic ceilings and iteration budgets', () => {
    expect(PERIOD_POLICIES.quick).toMatchObject({
      systematicMaxPeriod: 16,
      maxIterations: 256,
    });
    expect(PERIOD_POLICIES.balanced).toMatchObject({
      systematicMaxPeriod: 32,
      maxIterations: 512,
    });
    expect(PERIOD_POLICIES.detailed).toMatchObject({
      systematicMaxPeriod: 64,
      maxIterations: 1024,
    });
    for (const policy of Object.values(PERIOD_POLICIES)) {
      expect(policy.revision).toBe(PERIOD_POLICY_REVISION);
      expect(Object.isFrozen(policy)).toBe(true);
    }
  });

  it('derives the opportunistic ceiling as equal to the systematic ceiling until a candidate source ships', () => {
    // Revision period-policy-1.0.0 derivation: src/ has no candidate source,
    // so an opportunistic ceiling above the systematic one would claim
    // coverage nothing provides. PR 4 owns the first source and the first
    // raise of this value under a new revision.
    for (const policy of Object.values(PERIOD_POLICIES)) {
      expect(policy.opportunisticMaxPeriod).toBe(policy.systematicMaxPeriod);
    }
  });
});

describe('period policy in OrbitOptions resolution', () => {
  it('attaches the derived default policy with legacy-identical operative options', () => {
    const resolved = resolveOrbitOptions();
    expect(resolved.maxIterations).toBe(DEFAULT_ORBIT_OPTIONS.maxIterations);
    expect(resolved.maxPeriod).toBe(DEFAULT_ORBIT_OPTIONS.maxPeriod);
    expect(resolved.cycleTolerance).toBe(DEFAULT_ORBIT_OPTIONS.cycleTolerance);
    expect(resolved.cycleWarmup).toBe(DEFAULT_ORBIT_OPTIONS.cycleWarmup);
    expect(resolved.periodPolicy).toEqual(PERIOD_POLICIES.balanced);
  });

  it('matches each profile-equivalent budget to that profile’s policy', () => {
    expect(resolveOrbitOptions({ maxIterations: 256, maxPeriod: 16 }).periodPolicy).toEqual(
      PERIOD_POLICIES.quick,
    );
    expect(resolveOrbitOptions({ maxIterations: 512, maxPeriod: 32 }).periodPolicy).toEqual(
      PERIOD_POLICIES.balanced,
    );
    expect(resolveOrbitOptions({ maxIterations: 1024, maxPeriod: 64 }).periodPolicy).toEqual(
      PERIOD_POLICIES.detailed,
    );
  });

  it('keeps legacy behavior identical when an explicit policy equals today’s constants', () => {
    const withPolicy = resolveOrbitOptions({
      maxIterations: 512,
      maxPeriod: 32,
      periodPolicy: PERIOD_POLICIES.balanced,
    });
    const withoutPolicy = resolveOrbitOptions({ maxIterations: 512, maxPeriod: 32 });
    expect(withPolicy).toEqual(withoutPolicy);
  });

  it('rejects policies that disagree with the operative budgets', () => {
    expect(() =>
      resolveOrbitOptions({
        maxIterations: 512,
        maxPeriod: 32,
        periodPolicy: { ...PERIOD_POLICIES.balanced, systematicMaxPeriod: 64 },
      }),
    ).toThrow(RangeError);
    expect(() =>
      resolveOrbitOptions({
        maxIterations: 512,
        maxPeriod: 32,
        periodPolicy: { ...PERIOD_POLICIES.balanced, maxIterations: 1024 },
      }),
    ).toThrow(RangeError);
    expect(() =>
      resolveOrbitOptions({
        maxIterations: 512,
        maxPeriod: 32,
        periodPolicy: {
          revision: PERIOD_POLICY_REVISION,
          systematicMaxPeriod: 32,
          opportunisticMaxPeriod: 16,
          maxIterations: 512,
        },
      }),
    ).toThrow(RangeError);
  });

  it('accepts a raised opportunistic ceiling as the PR 4+ seam without altering operative options', () => {
    const raised: PeriodPolicy = {
      revision: 'period-policy-test-opportunistic-4096',
      systematicMaxPeriod: 32,
      opportunisticMaxPeriod: 4096,
      maxIterations: 512,
    };
    const resolved = resolveOrbitOptions({
      maxIterations: 512,
      maxPeriod: 32,
      periodPolicy: raised,
    });
    expect(resolved.periodPolicy).toEqual(raised);
    expect(resolved.maxIterations).toBe(512);
    expect(resolved.maxPeriod).toBe(32);
    expect(resolved.cycleTolerance).toBe(DEFAULT_ORBIT_OPTIONS.cycleTolerance);
  });
});

describe('evidence source vocabulary (plan section 4)', () => {
  it('carries exactly the plan’s six values', () => {
    expect([...EVIDENCE_SOURCE_VALUES]).toEqual([
      'analytic',
      'checkpoint',
      'catalog',
      'chart',
      'algebraic',
      'fallback',
    ]);
  });

  it('maps evidence flags to sources per the documented mapping', () => {
    expect(evidenceSourceForFlag('analytic-main-cardioid')).toBe('analytic');
    expect(evidenceSourceForFlag('analytic-period-2-bulb')).toBe('analytic');
    expect(evidenceSourceForFlag('converged-cycle')).toBe('fallback');
  });

  it('stamps the evidence source at the rich result boundary only for attracting results', () => {
    const analytic = createOrbitSample();
    analytic.status = 2;
    analytic.evidence = ORBIT_EVIDENCE_CODE.analyticMainCardioid;
    analytic.period = 1;
    const analyticResult = materializeOrbitResult(analytic);
    expect(analyticResult).toMatchObject({ evidenceSource: 'analytic' });

    const scan = createOrbitSample();
    scan.status = 2;
    scan.evidence = ORBIT_EVIDENCE_CODE.convergedCycle;
    scan.period = 3;
    const scanResult = materializeOrbitResult(scan);
    expect(scanResult).toMatchObject({ evidenceSource: 'fallback' });

    const unresolved = createOrbitSample();
    unresolved.status = 0;
    unresolved.evidence = ORBIT_EVIDENCE_CODE.iterationLimit;
    const unresolvedResult = materializeOrbitResult(unresolved);
    expect('evidenceSource' in unresolvedResult).toBe(false);
  });

  it('classifies every current attracting path with a source the vocabulary covers', () => {
    // Exhaustiveness guard: if the plan vocabulary grows, this cast target
    // must be extended deliberately rather than by omission.
    const vocabulary: readonly EvidenceSource[] = EVIDENCE_SOURCE_VALUES;
    for (const flag of [
      'analytic-main-cardioid',
      'analytic-period-2-bulb',
      'converged-cycle',
      'escape-radius',
      'iteration-limit',
    ] as const) {
      expect(vocabulary).toContain(evidenceSourceForFlag(flag));
    }
  });
});

describe('invariant 8: systematic and opportunistic claims differ', () => {
  // A policy revision that only changes the opportunistic ceiling: same
  // systematic search, same iteration budget, same verifier. If any
  // classification outcome moved, the policy vocabulary would be leaking
  // into the quality barrier (workstream D kill condition).
  const balancedBudget = {
    maxIterations: 512,
    maxPeriod: 32,
    cycleWarmup: DEFAULT_ORBIT_OPTIONS.cycleWarmup,
  };
  const systematicPolicy = PERIOD_POLICIES.balanced;
  const opportunisticPolicy: PeriodPolicy = {
    revision: 'period-policy-test-invariant-8',
    systematicMaxPeriod: 32,
    opportunisticMaxPeriod: 4096,
    maxIterations: 512,
  };

  const classifyWithPolicy = (
    point: { readonly re: number; readonly im: number },
    policy: PeriodPolicy,
  ): ReturnType<typeof classifyOrbit> =>
    classifyOrbit(point, { ...balancedBudget, periodPolicy: policy });

  it('produces identical classification outcomes across the stratified grid when only opportunisticMaxPeriod changes', () => {
    let attracting = 0;
    let escaped = 0;
    let unresolved = 0;
    for (const point of STRATA) {
      const systematic = classifyWithPolicy(point, systematicPolicy);
      const opportunistic = classifyWithPolicy(point, opportunisticPolicy);
      expect(opportunistic).toEqual(systematic);
      if (systematic.status === 'attracting-cycle') {
        attracting += 1;
        // The evidence-source stamp stays descriptive under both revisions:
        // origin metadata only, never a different acceptance path.
        expect(opportunistic.status).toBe('attracting-cycle');
        if (opportunistic.status === 'attracting-cycle') {
          expect(opportunistic.evidenceSource).toBe(systematic.evidenceSource);
          expect(opportunistic.verifierRevision).toBe(VERIFIER_REVISION);
        }
      } else if (systematic.status === 'escaped') {
        escaped += 1;
      } else {
        unresolved += 1;
      }
    }
    // Coverage bookkeeping so the grid cannot silently degenerate: every
    // stratum family contributes its outcome class.
    expect(attracting).toBeGreaterThan(0);
    expect(escaped).toBeGreaterThan(0);
    expect(unresolved).toBeGreaterThan(0);
  });

  it('classifies identically with no policy, the matching policy, and a raised opportunistic ceiling', () => {
    const probePoints = [
      { re: 0, im: 0 },
      { re: -1, im: 0 },
      { re: -0.1205, im: 0.7438 },
      { re: 1, im: 1 },
      { re: 0.25, im: 0 },
    ];
    for (const point of probePoints) {
      const implicit = classifyOrbit(point, balancedBudget);
      expect(classifyWithPolicy(point, systematicPolicy)).toEqual(implicit);
      expect(classifyWithPolicy(point, opportunisticPolicy)).toEqual(implicit);
    }
  });

  it('keeps maxIterations and the acceptance thresholds untouched by policy constants', () => {
    const resolved = resolveOrbitOptions({ ...balancedBudget, periodPolicy: opportunisticPolicy });
    expect(resolved.maxIterations).toBe(512);
    expect(resolved.maxPeriod).toBe(32);
    expect(resolved.cycleTolerance).toBe(DEFAULT_ORBIT_OPTIONS.cycleTolerance);
    expect(resolved.cycleWarmup).toBe(DEFAULT_ORBIT_OPTIONS.cycleWarmup);
    // The frozen acceptance policy is a separate, unchanged versioned
    // constant: policy revisions cannot move it.
    expect(VERIFIER_THRESHOLDS).toEqual({
      tauAccept: 1e-10,
      closureRelaxation: 100,
      // PR 4's candidate proposal gate — a proposal threshold, not an
      // acceptance threshold: acceptance remains tauAccept/margin below.
      tauCandidate: 1e-8,
      tauExclude: 1e-6,
      attractMargin: 1e-12,
    });
  });

  it('leaves unresolved semantics unchanged across policy revisions', () => {
    // The parabolic boundary point stays honestly unresolved at a tiny
    // budget under the systematic policy and under an opportunistic
    // revision raised far above the ceiling: an opportunistic ceiling is
    // not additional search, so it cannot resolve what the budget could not.
    const budgets = [
      { maxIterations: 48, maxPeriod: 8 },
      { maxIterations: 256, maxPeriod: 16 },
    ] as const;
    for (const budget of budgets) {
      const systematicRevision: PeriodPolicy = {
        revision: 'period-policy-test-low',
        systematicMaxPeriod: budget.maxPeriod,
        opportunisticMaxPeriod: budget.maxPeriod,
        maxIterations: budget.maxIterations,
      };
      const raisedRevision: PeriodPolicy = {
        revision: 'period-policy-test-low-raised',
        systematicMaxPeriod: budget.maxPeriod,
        opportunisticMaxPeriod: 4096,
        maxIterations: budget.maxIterations,
      };
      for (const policy of [systematicRevision, raisedRevision]) {
        const result = classifyOrbit({ re: 0.25, im: 0 }, { ...budget, periodPolicy: policy });
        expect(result).toEqual({
          status: 'unresolved',
          iterations: budget.maxIterations,
          evidence: ['iteration-limit'],
        });
      }
    }
  });
});
