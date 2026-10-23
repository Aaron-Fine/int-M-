import { describe, expect, it } from 'vitest';

import {
  candidateClasses,
  PERIOD_PALETTE_CANDIDATES,
  SELECTED_PERIOD_PALETTE_ID,
  type PeriodPaletteCandidate,
} from './palette-candidates';
import { PALETTE_FLOORS, PHASE1_FLOORS } from './palette-floors';
import {
  measurePalette,
  METRIC_NAMES,
  metricByName,
  phase1PaletteSpec,
  type MetricName,
  type MetricResult,
} from './palette-metrics';

const failures = (
  results: readonly MetricResult[],
  floors: Readonly<Record<MetricName, number>> = PALETTE_FLOORS,
): string[] =>
  results
    .filter((result) => result.min < floors[result.name])
    .map((result) => `${result.name}: ${result.min.toFixed(2)} < ${floors[result.name]}`);

const candidate = (id: string): PeriodPaletteCandidate => {
  const found = PERIOD_PALETTE_CANDIDATES.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`candidate ${id} missing`);
  return found;
};

describe('palette floors', () => {
  const phase1 = measurePalette(phase1PaletteSpec());

  it('start from the Phase 1 minima rounded down', () => {
    for (const name of METRIC_NAMES) {
      expect(PHASE1_FLOORS[name], name).toBe(Math.floor(metricByName(phase1, name).min));
    }
  });

  it('self-consistency: the Phase 1 palette meets its own floors', () => {
    expect(failures(phase1, PHASE1_FLOORS)).toEqual([]);
  });

  it('never fall below Phase 1, and only the accepted period-colour floor is raised', () => {
    const raised = METRIC_NAMES.filter((name) => PALETTE_FLOORS[name] !== PHASE1_FLOORS[name]);
    expect(raised).toEqual(['period-classes-pairwise']);
    expect(PALETTE_FLOORS['period-classes-pairwise']).toBe(11);
    for (const name of METRIC_NAMES) {
      expect(PALETTE_FLOORS[name]).toBeGreaterThanOrEqual(PHASE1_FLOORS[name]);
    }
  });
});

describe('period palette selection', () => {
  it('the selected palette clears every floor', () => {
    const selected = candidate(SELECTED_PERIOD_PALETTE_ID);
    expect(failures(measurePalette(phase1PaletteSpec(candidateClasses(selected))))).toEqual([]);
  });

  it('the selected palette at least doubles the Phase 1 pairwise separation', () => {
    const phase1 = metricByName(measurePalette(phase1PaletteSpec()), 'period-classes-pairwise');
    const selected = metricByName(
      measurePalette(phase1PaletteSpec(candidateClasses(candidate(SELECTED_PERIOD_PALETTE_ID)))),
      'period-classes-pairwise',
    );
    expect(selected.min).toBeGreaterThanOrEqual(2 * phase1.min);
  });

  it('Tol bright is rejected by the escaped and unresolved floors', () => {
    const rejected = failures(
      measurePalette(phase1PaletteSpec(candidateClasses(candidate('tol-bright')))),
    );
    expect(rejected.some((line) => line.startsWith('period-classes-vs-'))).toBe(true);
  });
});
