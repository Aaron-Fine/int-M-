import { describe, expect, it } from 'vitest';

import { DEFAULT_RENDER_QUALITY } from '../../../src/render';
import {
  DEFAULT_QUALITY_PROFILE_ID,
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
