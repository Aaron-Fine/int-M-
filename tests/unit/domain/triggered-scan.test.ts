import { describe, expect, it } from 'vitest';

import {
  classifyInto,
  createLegacyScanCounters,
  createOrbitSample,
  materializeOrbitResult,
  OrbitClassifier,
  OrbitScratch,
  resolveOrbitOptions,
  type OrbitOptions,
  type OrbitResult,
} from '../../../src/domain';

/**
 * Triggered-scan (classifierMode 'triggered-scan') parity against the legacy
 * lag scan on a few pixels and a small grid. The gate only decides WHEN a
 * legacy-identical scan runs, so per pixel:
 * - escaped under legacy: the materialized result is identical;
 * - attracting under legacy: triggered also attracts, with the same period,
 *   at the same or a later iteration (it can never accept earlier);
 * - unresolved under legacy: triggered stays unresolved (no certificates).
 */

const LEGACY: OrbitOptions = resolveOrbitOptions({ classifierMode: 'legacy-scan' });
const TRIGGERED: OrbitOptions = resolveOrbitOptions({ classifierMode: 'triggered-scan' });

const classifyPixel = (re: number, im: number, options: OrbitOptions): OrbitResult => {
  const sample = createOrbitSample();
  classifyInto(re, im, options, new OrbitScratch(options.maxPeriod), sample);
  return materializeOrbitResult(sample);
};

const expectTriggeredParity = (re: number, im: number): void => {
  const legacy = classifyPixel(re, im, LEGACY);
  const triggered = classifyPixel(re, im, TRIGGERED);
  if (legacy.status === 'escaped') {
    expect(triggered).toEqual(legacy);
    return;
  }
  if (legacy.status === 'attracting-cycle') {
    expect(triggered.status).toBe('attracting-cycle');
    if (triggered.status !== 'attracting-cycle') {
      return;
    }
    expect(triggered.period).toBe(legacy.period);
    expect(triggered.iterations).toBeGreaterThanOrEqual(legacy.iterations);
    return;
  }
  expect(triggered.status).toBe('unresolved');
};

const NAMED_PIXELS: readonly (readonly [string, number, number])[] = [
  ['period-1 centre', 0, 0],
  ['period-2 centre', -1, 0],
  ['period-3 bulb centre', -1.7548776662466927, 0],
  ['boundary near cusp', -0.75, 0.1],
  ['parabolic cusp', 0.25, 0],
  ['escaping', 1, 1],
  ['interior off-centre', -0.1, 0.65],
  ['near main-cardioid boundary', 0.3, 0.5],
];

describe('triggered-scan classifier mode', () => {
  it('is the default mode; legacy-scan stays selectable', () => {
    expect(resolveOrbitOptions({}).classifierMode).toBe('triggered-scan');
    expect(resolveOrbitOptions({ classifierMode: 'legacy-scan' }).classifierMode).toBe(
      'legacy-scan',
    );
  });

  it.each(NAMED_PIXELS)('matches legacy on %s', (_name, re, im) => {
    expectTriggeredParity(re, im);
  });

  it('matches legacy on a small grid and sees both attracting and escaped pixels', () => {
    const outcomes = new Set<string>();
    for (let row = 0; row < 12; row += 1) {
      for (let column = 0; column < 12; column += 1) {
        const re = -2 + (column * 2.5) / 11;
        const im = -1.25 + (row * 2.5) / 11;
        expectTriggeredParity(re, im);
        outcomes.add(classifyPixel(re, im, LEGACY).status);
      }
    }
    expect(outcomes.has('attracting-cycle')).toBe(true);
    expect(outcomes.has('escaped')).toBe(true);
  });

  it('keeps legacy acceptances that land inside the end-of-budget window at large maxPeriod', () => {
    // Legacy-accepted pixels (maxIterations 1024, maxPeriod 128) whose first
    // acceptable lag scan lies more than 64 iterations before the budget end
    // and so was lost by a fixed 64-iteration tail window.
    const legacyOptions = resolveOrbitOptions({
      classifierMode: 'legacy-scan',
      maxIterations: 1024,
      maxPeriod: 128,
    });
    const triggeredOptions = resolveOrbitOptions({
      classifierMode: 'triggered-scan',
      maxIterations: 1024,
      maxPeriod: 128,
    });
    const pixels: readonly (readonly [number, number, number])[] = [
      [0.0582386729470506, 0.6199566293493743, 94],
      [0.3716336745978876, -0.2877599674776909, 128],
      [-0.3855504355631629, -0.5939111473845738, 105],
    ];
    for (const [re, im, period] of pixels) {
      const legacy = classifyPixel(re, im, legacyOptions);
      const triggered = classifyPixel(re, im, triggeredOptions);
      expect(legacy.status).toBe('attracting-cycle');
      expect(triggered.status).toBe('attracting-cycle');
      if (legacy.status !== 'attracting-cycle' || triggered.status !== 'attracting-cycle') {
        continue;
      }
      expect(legacy.period).toBe(period);
      expect(triggered.period).toBe(legacy.period);
      expect(triggered.iterations).toBeGreaterThanOrEqual(legacy.iterations);
    }
  });

  it('rejects perfCounters instead of silently running the legacy instrumented kernel', () => {
    expect(
      () =>
        new OrbitClassifier(
          { classifierMode: 'triggered-scan' },
          undefined,
          createLegacyScanCounters(),
        ),
    ).toThrow(RangeError);
    // The legacy mode with counters is still allowed.
    expect(
      () =>
        new OrbitClassifier(
          { classifierMode: 'legacy-scan' },
          undefined,
          createLegacyScanCounters(),
        ),
    ).not.toThrow();
  });
});
