import { describe, expect, it } from 'vitest';

import {
  classifyInto,
  createOrbitSample,
  materializeOrbitResult,
  OrbitClassifier,
  OrbitScratch,
  resolveOrbitOptions,
  type Complex,
  type OrbitOptions,
} from '../../../src/domain';

/**
 * Watched-lag triggered kernel on named pixels and the review reproducers.
 * The expectations are the classifications the kernel is pinned to; the
 * legacy scan is no longer part of the domain.
 */

const DEFAULTS: OrbitOptions = resolveOrbitOptions({});

const classifyPixel = (re: number, im: number, options: OrbitOptions = DEFAULTS) => {
  const sample = createOrbitSample();
  classifyInto(re, im, options, new OrbitScratch(options.maxPeriod), sample);
  return materializeOrbitResult(sample);
};

describe('triggered kernel on named pixels', () => {
  it('classifies the period-1 centre as an attracting period-1 cycle', () => {
    const result = classifyPixel(0, 0);
    expect(result.status).toBe('attracting-cycle');
    if (result.status === 'attracting-cycle') expect(result.period).toBe(1);
  });

  it('classifies the period-2 centre as an attracting period-2 cycle', () => {
    const result = classifyPixel(-1, 0);
    expect(result.status).toBe('attracting-cycle');
    if (result.status === 'attracting-cycle') expect(result.period).toBe(2);
  });

  it('classifies the period-3 bulb centre as an attracting period-3 cycle', () => {
    const result = classifyPixel(-1.7548776662466927, 0);
    expect(result.status).toBe('attracting-cycle');
    if (result.status === 'attracting-cycle') expect(result.period).toBe(3);
  });

  it('classifies an escaping point as escaped', () => {
    expect(classifyPixel(1, 1).status).toBe('escaped');
  });
});

describe('triggered kernel at large maxPeriod', () => {
  it('accepts cycles inside the end-of-budget window at large maxPeriod', () => {
    // Pixels (maxIterations 1024, maxPeriod 128) whose acceptable lag scan lies
    // more than 64 iterations before the budget end, so a fixed 64-iteration
    // tail window alone would miss them.
    const options: Partial<OrbitOptions> = { maxIterations: 1024, maxPeriod: 128 };
    const pixels: readonly (readonly [number, number, number])[] = [
      [0.0582386729470506, 0.6199566293493743, 94],
      [0.3716336745978876, -0.2877599674776909, 128],
      [-0.3855504355631629, -0.5939111473845738, 105],
    ];
    for (const [re, im, period] of pixels) {
      const result = classifyPixel(re, im, resolveOrbitOptions(options));
      expect(result.status).toBe('attracting-cycle');
      if (result.status === 'attracting-cycle') expect(result.period).toBe(period);
    }
  });
});

describe('triggered kernel never loses an acceptance to refused proposals', () => {
  // Review reproducers: the watched lag proposes repeatedly while the
  // verifier refuses (divisor-ambiguous near lambda = -1 at the default
  // tolerance; closure-ambiguous at a loose tolerance). A per-pixel cap on
  // fired scans skipped the iteration where the acceptance lies, ending
  // unresolved.
  const cases: readonly { c: Complex; options: Partial<OrbitOptions> }[] = [
    {
      c: { re: -0.11577919362193681, im: 0.8375396650544321 },
      options: { maxIterations: 8402, maxPeriod: 64 },
    },
    {
      c: { re: -0.11577919362193681, im: 0.8375396650544321 },
      options: { maxIterations: 20000, maxPeriod: 64 },
    },
    {
      c: { re: -1.2813498829491436, im: 0.04482033597305417 },
      options: { maxIterations: 512, maxPeriod: 32, cycleTolerance: 1e-6 },
    },
  ];

  it.each(cases)('accepts an attracting cycle at $c.re, $c.im', ({ c, options }) => {
    const resolved = resolveOrbitOptions(options);
    const sample = createOrbitSample();
    new OrbitClassifier(resolved).classifyInto(c.re, c.im, sample);
    expect(sample.status).toBe(2);
  });
});
