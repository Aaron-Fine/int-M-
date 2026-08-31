import { describe, expect, it } from 'vitest';

import { buildCorpus, CORPUS_SEED, CORPUS_STRATA } from './corpus.ts';
import { analyticInterior } from './kernels/shared.ts';

const countByStratum = (points: ReturnType<typeof buildCorpus>): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const point of points) {
    counts.set(point.stratum, (counts.get(point.stratum) ?? 0) + 1);
  }
  return counts;
};

describe('deterministic corpus', () => {
  it('builds the identical point list from the same seed', () => {
    const first = buildCorpus();
    const second = buildCorpus();

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.length).toBe(second.length);
  });

  it('has the expected strata, unique ids, and finite coordinates', () => {
    const corpus = buildCorpus();
    const counts = countByStratum(corpus);

    expect([...CORPUS_STRATA]).toEqual([...counts.keys()]);
    // Hundreds of points, not thousands.
    expect(corpus.length).toBeGreaterThan(200);
    expect(corpus.length).toBeLessThan(300);
    expect(counts.get('exterior')).toBe(48);
    expect(counts.get('cardioid')).toBe(40);
    expect(counts.get('period-2-bulb')).toBe(24);
    expect(counts.get('rabbit-neighborhood')).toBe(24);
    expect(counts.get('hard-view-anchor')).toBe(30);
    expect(counts.get('weak-attraction')).toBe(20);
    expect(counts.get('superattracting')).toBe(11);
    expect(counts.get('boundary')).toBe(16);
    expect(counts.get('unresolved-budget')).toBe(12);

    const ids = new Set(corpus.map((point) => point.id));
    expect(ids.size).toBe(corpus.length);
    for (const point of corpus) {
      expect(Number.isFinite(point.cRe)).toBe(true);
      expect(Number.isFinite(point.cIm)).toBe(true);
    }
  });

  it('places closed-form strata by their exact membership tests', () => {
    const corpus = buildCorpus();

    for (const point of corpus.filter((p) => p.stratum === 'cardioid')) {
      expect(analyticInterior(point.cRe, point.cIm)?.period).toBe(1);
    }
    for (const point of corpus.filter((p) => p.stratum === 'period-2-bulb')) {
      expect(analyticInterior(point.cRe, point.cIm)?.period).toBe(2);
    }
    // Weak attraction is strictly inside the cardioid; boundary is outside it.
    for (const point of corpus.filter((p) => p.stratum === 'weak-attraction')) {
      expect(analyticInterior(point.cRe, point.cIm)).toBeDefined();
    }
    for (const point of corpus.filter((p) => p.stratum === 'boundary')) {
      expect(analyticInterior(point.cRe, point.cIm)).toBeUndefined();
    }
  });

  it('retains the plan hard-view anchors verbatim', () => {
    const corpus = buildCorpus();
    const anchors = corpus.filter((point) => point.stratum === 'hard-view-anchor');

    expect(anchors.some((p) => p.cRe === -0.158902249 && p.cIm === -1.034028)).toBe(true);
    expect(anchors.some((p) => p.cRe === -1.94130973 && p.cIm === -0.0000974722949)).toBe(true);
    expect(anchors.some((p) => p.cRe === 0.305376533 && p.cIm === 0.552677981)).toBe(true);
    expect(CORPUS_SEED).toBe(0x4d4950);
  });
});
