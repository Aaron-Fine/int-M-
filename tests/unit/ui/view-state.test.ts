import { describe, expect, it } from 'vitest';

import { DEFAULT_RENDER_QUALITY } from '../../../src/render';
import {
  DEFAULT_QUALITY_PROFILE_ID,
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
