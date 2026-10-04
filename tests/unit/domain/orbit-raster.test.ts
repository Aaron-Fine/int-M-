import { describe, expect, it, vi } from 'vitest';
import fixtures from '../../../fixtures/orbit-raster-regression.v1.json';
import { OrbitClassifier, OrbitScratch, createViewportTransform } from '../../../src/domain';

describe('raster orbit kernel', () => {
  it.each(fixtures.cases)(
    'preserves original classification: $id at $maxIterations',
    async (fixture) => {
      const classifier = new OrbitClassifier({
        maxIterations: fixture.maxIterations,
        maxPeriod: 32,
      });
      const transform = createViewportTransform(fixture.viewport, fixtures.size);
      const records: string[] = [];
      for (let y = 0; y < fixtures.size.height; y += 1) {
        for (let x = 0; x < fixtures.size.width; x += 1) {
          const result = classifier.classify(transform.pixelToComplex(x, y));
          records.push(
            JSON.stringify([
              result.status,
              result.iterations,
              result.evidence,
              result.status === 'attracting-cycle' ? result.period : 0,
            ]),
          );
        }
      }
      const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(records.join('')),
      );
      const hex = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, '0'),
      ).join('');
      expect(hex).toBe(fixture.expectedDigest);
    },
  );

  it('matches rich results across scratch wraps and resets every raster field', () => {
    for (const maxPeriod of [1, 3, 8, 32]) {
      const classifier = new OrbitClassifier({ maxPeriod }, new OrbitScratch(48));
      const transform = createViewportTransform(
        { center: { re: -0.12, im: 0.74 }, spanY: 0.35 },
        { width: 32, height: 24 },
      );
      for (let y = 0; y < 24; y += 1) {
        for (let x = 0; x < 32; x += 1) {
          const point = transform.pixelToComplex(x, y);
          const rich = classifier.classify(point);
          const sample = classifier.classifyRaster(point.re, point.im);
          expect(sample.status).toBe(
            rich.status === 'escaped' ? 1 : rich.status === 'attracting-cycle' ? 2 : 0,
          );
          if (rich.status === 'attracting-cycle') {
            expect(sample.period).toBe(rich.period);
            expect(sample.smoothIterationOrMultiplierMagnitude).toBe(rich.multiplierMagnitude);
            expect(sample.multiplierUnitRe).toBeCloseTo(Math.cos(rich.multiplierAngle), 12);
            expect(sample.multiplierUnitIm).toBeCloseTo(Math.sin(rich.multiplierAngle), 12);
          } else {
            expect(sample.period).toBe(0);
            expect(sample.multiplierUnitRe).toBe(0);
            expect(sample.multiplierUnitIm).toBe(0);
            expect(sample.smoothIterationOrMultiplierMagnitude).toBe(
              rich.status === 'escaped' ? rich.smoothIteration : 0,
            );
          }
        }
      }
    }
  });

  it('does not compute discarded logs or angles for raster attraction', () => {
    const classifier = new OrbitClassifier();
    const log = vi.spyOn(Math, 'log');
    const atan = vi.spyOn(Math, 'atan2');
    try {
      const first = classifier.classifyRaster(0.1, 0.1);
      expect(first.status).toBe(2);
      expect(classifier.classifyRaster(-1, 0)).toBe(first);
      expect(log).not.toHaveBeenCalled();
      expect(atan).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
      atan.mockRestore();
    }
  });

  it('keeps experimental checkpoint results behind the same evidence checks', () => {
    const classifier = new OrbitClassifier({ cycleDetection: 'checkpoint', maxPeriod: 8 });
    expect(classifier.classify({ re: -0.1205, im: 0.7438 })).toMatchObject({
      status: 'attracting-cycle',
      period: 3,
      evidence: ['converged-cycle'],
    });
    expect(classifier.classify({ re: 0.25, im: 0 })).toMatchObject({
      status: 'unresolved',
      evidence: ['iteration-limit'],
    });
    expect(classifier.classify({ re: 1, im: 1 })).toMatchObject({
      status: 'escaped',
      evidence: ['escape-radius'],
    });
    expect(classifier.classify({ re: -0.1205, im: 0.7438 })).toMatchObject({
      status: 'attracting-cycle',
      period: 3,
    });
  });
});
