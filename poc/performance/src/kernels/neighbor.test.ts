import { describe, expect, it } from 'vitest';

import { buildCorpus } from '../corpus.ts';
import { GRID_SPECS, buildGrids } from '../grids.ts';
import { CANDIDATE_REJECTION_BUDGET } from './shared.ts';
import { CheckpointKernel } from './checkpoint.ts';
import { ControlKernel } from './control.ts';
import { NeighborKernel } from './neighbor.ts';

// Neighbor-informed lag ordering contract: hint-first proposals through the
// common verifier, trigger fallback with the frozen policy, rejection
// budget, and exhaustion toggling. Numbers are frozen from the
// deterministic corpus, grids, and kernels; they double as regression
// guards.

const balanced = {
  maxIterations: 512,
  maxPeriod: 32,
  cycleTolerance: 1e-10,
  cycleWarmup: 24,
  exhaustionScan: true,
};

const RABBIT_CENTER = [-0.1225611668766535, 0.7448617666197435] as const;
const PERIOD_4_CENTER = [-1.3107026413368348, 0] as const;
const REPELLING_CYCLE = [0, 1] as const;

describe('neighbor: hint-first detection through the common verifier', () => {
  const cases = [
    { label: 'rabbit center p3', c: RABBIT_CENTER, period: 3, hint: 3 },
    { label: 'period-4 center', c: PERIOD_4_CENTER, period: 4, hint: 4 },
  ] as const;

  for (const fixture of cases) {
    it(`detects the ${fixture.label} on the hinted lag alone`, () => {
      const result = new NeighborKernel(64).classifyWithHint(
        fixture.c[0],
        fixture.c[1],
        balanced,
        fixture.hint,
      );

      expect(result).toMatchObject({
        status: 'attracting',
        period: fixture.period,
        evidence: 'neighbor-hint',
      });
      // The hint comparison is the only lag evaluation before detection.
      expect(result.metrics.lagComparisons).toBe(1);
      expect(result.metrics.verifierCalls).toBe(1);
    });
  }

  it('a multiple-of-p hint reduces to the primitive period', () => {
    const result = new NeighborKernel(64).classifyWithHint(
      RABBIT_CENTER[0],
      RABBIT_CENTER[1],
      balanced,
      6,
    );
    expect(result).toMatchObject({ status: 'attracting', period: 3, evidence: 'neighbor-hint' });
  });

  it('a wrong hint still classifies through the fallback scan without weakening the gate', () => {
    // Period-4 center under the rabbit's hint: the hinted lag never hits
    // proximity; the trigger fallback must find the true cycle.
    const result = new NeighborKernel(64).classifyWithHint(
      PERIOD_4_CENTER[0],
      PERIOD_4_CENTER[1],
      balanced,
      3,
    );
    expect(result).toMatchObject({ status: 'attracting', period: 4 });
    expect(result.evidence).not.toBe('neighbor-hint');
  });

  it('no hint degrades to the trigger fallback policy', () => {
    const neighbor = new NeighborKernel(64).classifyWithHint(
      RABBIT_CENTER[0],
      RABBIT_CENTER[1],
      { ...balanced, exhaustionScan: false },
      0,
    );
    // Rabbit center detected in-loop only via the step-gate scan.
    if (neighbor.status === 'attracting') {
      expect(neighbor.evidence).toBe('neighbor-scan');
    } else {
      expect(neighbor.status).toBe('unresolved');
    }
  });

  it('stays budget-bounded on the exact repelling cycle', () => {
    const result = new NeighborKernel(64).classifyWithHint(
      REPELLING_CYCLE[0],
      REPELLING_CYCLE[1],
      balanced,
      2,
    );
    expect(result.status).toBe('unresolved');
    expect(result.metrics.rejectedNotAttracting).toBeLessThanOrEqual(CANDIDATE_REJECTION_BUDGET);
    expect(result.metrics.rejectedNotAttracting).toBeGreaterThan(0);
  });
});

describe('neighbor: parity on the corpus and the exhaustion toggle', () => {
  it('matches control status and period on the interior strata', () => {
    const neighbor = new NeighborKernel(64);
    const control = new ControlKernel(64);
    const strata = new Set([
      'cardioid',
      'period-2-bulb',
      'rabbit-neighborhood',
      'period-5',
      'superattracting',
    ]);
    let compared = 0;
    for (const point of buildCorpus()) {
      if (!strata.has(point.stratum)) {
        continue;
      }
      compared += 1;
      const baseline = control.classify(point.cRe, point.cIm, balanced);
      const hint = baseline.status === 'attracting' ? baseline.period : 0;
      const result = neighbor.classifyWithHint(point.cRe, point.cIm, balanced, hint);
      expect(result.status).toBe(baseline.status);
      if (baseline.status === 'attracting' && result.status === 'attracting') {
        expect(result.period).toBe(baseline.period);
      }
    }
    expect(compared).toBe(102);
  });

  it('toggling the exhaustion scan only changes unresolved-end points', () => {
    const kernel = new NeighborKernel(64);
    const corpus = buildCorpus();
    for (let index = 0; index < corpus.length; index += 1) {
      const point = corpus[index];
      if (point === undefined) {
        throw new Error('empty corpus entry');
      }
      // The matrix hinter: the previous corpus point's detected period.
      const previous = corpus[index - 1];
      const prior = previous === undefined ? '' : previous.stratum;
      const hint = prior === 'rabbit-neighborhood' || prior === 'period-5' ? 3 : 0;
      const without = kernel.classifyWithHint(
        point.cRe,
        point.cIm,
        { ...balanced, exhaustionScan: false },
        hint,
      );
      const withScan = kernel.classifyWithHint(point.cRe, point.cIm, balanced, hint);
      if (without.status !== 'unresolved') {
        expect(JSON.stringify(withScan)).toBe(JSON.stringify(without));
      } else if (withScan.status === 'attracting') {
        expect(withScan.evidence).toBe('exhaustion-scan');
      } else {
        const delta = withScan.metrics.lagComparisons - without.metrics.lagComparisons;
        expect(delta).toBeGreaterThanOrEqual(0);
        expect(delta).toBeLessThanOrEqual(2 * balanced.maxPeriod);
      }
    }
  });
});

describe('neighbor: grid strata', () => {
  it('grid specs are frozen and raster order is deterministic', () => {
    expect(GRID_SPECS.length).toBe(10);
    const grids = buildGrids();
    expect(grids.length).toBe(GRID_SPECS.length * 256);
    // Raster order: within a grid, y outer (down), x inner (right).
    const first = grids[0];
    const second = grids[1];
    expect(first?.grid).toBe('anchor-0');
    expect(second?.y).toBe(first?.y);
    expect((second?.x ?? 0) - (first?.x ?? 0)).toBe(1);
  });

  it('hint ordering beats the checkpoint baseline on coherent grids', () => {
    const opts = balanced;
    const kernel = new NeighborKernel(64);
    const checkpoint = new CheckpointKernel(64);
    const grids = buildGrids();
    let currentGrid = '';
    let previous = 0;
    let neighborComparisons = 0;
    let checkpointComparisons = 0;
    for (const point of grids) {
      if (point.grid !== currentGrid) {
        currentGrid = point.grid;
        previous = 0;
      }
      const result = kernel.classifyWithHint(point.cRe, point.cIm, opts, previous);
      previous = result.status === 'attracting' ? result.period : 0;
      neighborComparisons += result.metrics.lagComparisons;
      checkpointComparisons += checkpoint.classify(point.cRe, point.cIm, opts).metrics
        .lagComparisons;
    }
    // Coherent interior grids make the hint-first scan strictly cheaper.
    expect(neighborComparisons).toBeLessThan(checkpointComparisons);
  });
});
