import { describe, expect, it } from 'vitest';

import { DEFAULT_RENDER_QUALITY } from '../../../src/render';
import { evidenceSourceForFlag, PERIOD_POLICY_REVISION } from '../../../src/domain/period-policy';
import {
  DEFAULT_QUALITY_PROFILE_ID,
  describePeriodPolicy,
  formatCoordinateForViewport,
  getQualityProfile,
  QUALITY_PROFILES,
} from '../../../src/ui/view-state';

describe('quality profiles', () => {
  it('keeps the balanced profile aligned with the renderer default', () => {
    expect(getQualityProfile(DEFAULT_QUALITY_PROFILE_ID).quality).toEqual(DEFAULT_RENDER_QUALITY);
  });

  it('uses finite positive integer budgets within the application render cap', () => {
    for (const profile of QUALITY_PROFILES) {
      expect(profile.maxRenderEdge).toBeLessThanOrEqual(1024);
      for (const value of Object.values(profile.quality)) {
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThan(0);
      }
    }
  });

  it('increases iteration and period budgets from quick through detailed', () => {
    const quick = getQualityProfile('quick').quality;
    const balanced = getQualityProfile('balanced').quality;
    const detailed = getQualityProfile('detailed').quality;

    expect(quick.maxIterations).toBeLessThan(balanced.maxIterations);
    expect(balanced.maxIterations).toBeLessThan(detailed.maxIterations);
    expect(quick.maxPeriod).toBeLessThan(balanced.maxPeriod);
    expect(balanced.maxPeriod).toBeLessThan(detailed.maxPeriod);
  });
});

describe('period policy product language (PR 5, plan section 4)', () => {
  it('pairs every profile with the period policy matching its budgets', () => {
    for (const profile of QUALITY_PROFILES) {
      expect(profile.policy.revision).toBe(PERIOD_POLICY_REVISION);
      expect(profile.policy.systematicMaxPeriod).toBe(profile.quality.maxPeriod);
      expect(profile.policy.maxIterations).toBe(profile.quality.maxIterations);
      expect(profile.policy.opportunisticMaxPeriod).toBeGreaterThanOrEqual(
        profile.policy.systematicMaxPeriod,
      );
    }
  });

  it('frames the copy as the plan’s systematic check, driven by the policy values', () => {
    for (const profile of QUALITY_PROFILES) {
      expect(describePeriodPolicy(profile.policy)).toBe(
        `Systematically checks through period ${profile.quality.maxPeriod} ` +
          `within ${profile.quality.maxIterations} iterations. ` +
          'Higher periods may appear when independently found and verified.',
      );
    }
  });

  it('follows synthetic policy values rather than hardcoded budgets', () => {
    const copy = describePeriodPolicy({
      revision: 'period-policy-test',
      systematicMaxPeriod: 7,
      opportunisticMaxPeriod: 99,
      maxIterations: 123,
    });
    expect(copy).toContain('period 7 within 123 iterations');
  });

  it('never implies coverage up to the opportunistic ceiling', () => {
    // The formatter must not mention the opportunistic ceiling as a search
    // bound: with a synthetic policy whose opportunistic ceiling (99)
    // exceeds the systematic one (7), no coverage claim about 99 may appear.
    const copy = describePeriodPolicy({
      revision: 'period-policy-test',
      systematicMaxPeriod: 7,
      opportunisticMaxPeriod: 99,
      maxIterations: 123,
    });
    expect(copy).not.toContain('99');
    expect(copy).not.toMatch(/exhaustive|all periods|every period|guaranteed through period 99/i);
  });

  it('keeps the analytic evidence source reserved for the closed-form paths', () => {
    // Opportunistic results (when candidate sources ship in PR 4+) are
    // proposed by non-analytic sources, so they carry evidenceSource !==
    // 'analytic' by construction of this mapping; acceptance and the
    // quality barrier are unaffected either way (pinned against the
    // classifier in tests/unit/domain/period-policy.test.ts, invariant 8).
    expect(evidenceSourceForFlag('converged-cycle')).not.toBe('analytic');
    expect(evidenceSourceForFlag('analytic-main-cardioid')).toBe('analytic');
    expect(evidenceSourceForFlag('analytic-period-2-bulb')).toBe('analytic');
  });
});

describe('viewport-aware coordinate formatting', () => {
  it('increases displayed precision with raster scale', () => {
    expect(formatCoordinateForViewport(-0.123456789, 2.5, 1000)).toBe('-0.1235');
    expect(formatCoordinateForViewport(-0.123456789, 0.0000004, 1000)).toBe('-0.123456789');
  });

  it('does not report more than binary64 useful decimal precision', () => {
    expect(formatCoordinateForViewport(Number('0.12345678901234567'), 1e-30, 1000)).toBe(
      '0.123456789012346',
    );
  });
});
