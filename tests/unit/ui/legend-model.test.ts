import { describe, expect, it } from 'vitest';

import {
  buildPeriodKey,
  colorForAttracting,
  colorForEscaped,
  EMPTY_PERIOD_KEY,
  OTHER_PERIODS_COLOR,
  PERIOD_EMPHASIS_PALETTE,
  unresolvedTextureColors,
} from '../../../src/domain';
import {
  cssColor,
  DEFINITIONS,
  formatShare,
  legendModel,
  stabilityPosition,
  type LegendItem,
  type LegendScale,
  type LegendSwatch,
} from '../../../src/ui/legend-model';

const swatches = (items: readonly LegendItem[]): LegendSwatch[] =>
  items.filter((item): item is LegendSwatch => item.kind === 'swatch');
const scales = (items: readonly LegendItem[]): LegendScale[] =>
  items.filter((item): item is LegendScale => item.kind === 'scale');
const labels = (items: readonly LegendItem[]): string[] =>
  items.map((item) => (item.kind === 'note' ? item.text : item.label));

describe('legend model', () => {
  it('gives the stability view a numeric κ scale drawn from the stability ramp', () => {
    const model = legendModel('stability');
    const [scale] = scales(model.items);

    expect(model.definition).toBe(DEFINITIONS.stability);
    expect(labels(model.items)).toEqual(['Stability κ', 'Escaped', 'Unresolved']);
    expect(scale?.ticks.map((tick) => tick.label)).toEqual(['0', '0.5', '1', '2', '∞']);
    expect(scale?.ticks[2]?.position).toBeCloseTo(stabilityPosition(1), 12);
    expect(scale?.background).toContain(
      `${cssColor(colorForAttracting(1, 1, 0, 'stability'))} 0.00%`,
    );
    expect(scale?.background).toContain(
      `${cssColor(colorForAttracting(1, 0, 0, 'stability'))} 100.00%`,
    );
  });

  it('places each κ tick where the ramp draws that κ', () => {
    // The ramp at position n is |λ| = 1 − n for period 1, so κ = −ln(1 − n).
    for (const kappa of [0.5, 1, 2]) {
      const position = stabilityPosition(kappa);
      expect(colorForAttracting(1, 1 - position, 0, 'stability')).toEqual(
        colorForAttracting(3, Math.exp(-3 * kappa), 0, 'stability'),
      );
    }
  });

  it('gives the multiplier view numeric |λ| and arg λ scales from the multiplier palette', () => {
    const model = legendModel('multiplier');
    const [magnitude, angle] = scales(model.items);

    expect(labels(model.items)).toEqual([
      'Attraction |λ|',
      'Multiplier angle',
      'Escaped',
      'Unresolved',
    ]);
    expect(magnitude?.ticks.map((tick) => tick.label)).toEqual(['0', '0.25', '0.5', '0.75', '1']);
    expect(magnitude?.background).toContain(
      `${cssColor(colorForAttracting(1, 0.5, 0, 'multiplier'))} 50.00%`,
    );
    expect(angle?.ticks.map((tick) => tick.label)).toEqual(['−π', '−π/2', '0', 'π/2', 'π']);
    expect(angle?.background).toContain(
      `${cssColor(colorForAttracting(1, 0.5, 0, 'multiplier'))} 50.00%`,
    );
  });

  it('lists exactly the emphasized periods, in ascending order, plus the neutral class', () => {
    const key = buildPeriodKey(
      new Map([
        [4, 300],
        [1, 9000],
        [2, 4000],
        [3, 50],
        [8, 120],
        [16, 60],
        [5, 7],
      ]),
    );
    const items = swatches(legendModel('period', key).items);

    expect(items.map((item) => item.label)).toEqual([
      'Period 1',
      'Period 2',
      'Period 4',
      'Period 8',
      'Period 16',
      'Other periods',
      'Escaped',
      'Unresolved',
    ]);
    expect(items.slice(0, 5).map((item) => item.background)).toEqual(
      PERIOD_EMPHASIS_PALETTE.map(cssColor),
    );
    expect(items[0]?.detail).toBe('66% of attracting-cycle pixels');
    expect(items[5]).toMatchObject({
      background: cssColor(OTHER_PERIODS_COLOR),
      detail: '2 more periods · 0.4% of attracting-cycle pixels',
      period: 'other',
    });
  });

  it('shows one period and no other periods for a single-period frame', () => {
    const items = swatches(legendModel('period', buildPeriodKey(new Map([[3, 42]]))).items);

    expect(items.slice(0, 2)).toMatchObject([
      { label: 'Period 3', detail: '100% of attracting-cycle pixels', period: 3 },
      { label: 'Other periods', detail: 'None in this view', period: 'other' },
    ]);
  });

  it('says so when a frame has no attracting cycle', () => {
    expect(labels(legendModel('period', EMPTY_PERIOD_KEY).items)).toEqual([
      'No attracting cycle detected in this view.',
      'Other periods',
      'Escaped',
      'Unresolved',
    ]);
  });

  it('shows a pending note until the period frame arrives', () => {
    expect(labels(legendModel('period').items)[0]).toBe('Ranking the periods in this view…');
  });

  it('draws the escaped and unresolved swatches from the colorizer palette', () => {
    for (const view of ['stability', 'multiplier', 'period'] as const) {
      const [escaped, unresolved] = swatches(legendModel(view, EMPTY_PERIOD_KEY).items).slice(-2);
      expect(escaped?.background).toContain(`${cssColor(colorForEscaped(0, view))} 0.00%`);
      const [dark, light] = unresolvedTextureColors();
      expect(unresolved?.background).toContain(cssColor(dark));
      expect(unresolved?.background).toContain(cssColor(light));
    }
  });

  it('formats shares without rounding a minority to 0% or 100%', () => {
    expect(formatShare(0, 10)).toBe('0%');
    expect(formatShare(1, 100_000)).toBe('<0.1%');
    expect(formatShare(57, 13_537)).toBe('0.4%');
    expect(formatShare(9000, 13_537)).toBe('66%');
    expect(formatShare(13_536, 13_537)).toBe('>99%');
    expect(formatShare(42, 42)).toBe('100%');
  });
});
