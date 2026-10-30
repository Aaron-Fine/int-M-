import { describe, expect, it } from 'vitest';

import {
  buildPeriodKey,
  colorForAttracting,
  colorForEscaped,
  EMPTY_PERIOD_KEY,
  modulateForMultiplierDirection,
  shadeForMultiplierContour,
  MULTIPLIER_STRIPE_AMPLITUDE,
  MULTIPLIER_STRIPE_FREQUENCY,
  OTHER_PERIODS_COLOR,
  PERIOD_EMPHASIS_PALETTE,
  unresolvedTextureColors,
} from '../../../src/domain';
import {
  cssColor,
  DEFINITIONS,
  formatShare,
  legendModel,
  spectrumWidth,
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
    expect(model.formula).toBe('κ = −ln|λ| / p');
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
      'Internal coordinates',
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

  it('draws the multiplier stripe samples from the raster stripe functions', () => {
    const [magnitude, angle] = scales(legendModel('multiplier').items);
    const pitch = Math.PI / MULTIPLIER_STRIPE_FREQUENCY;
    expect(angle?.stripes?.map((stripe) => stripe.label)).toEqual(['−π/2', '0', 'π/2']);
    expect(magnitude?.detail).toContain(`±${MULTIPLIER_STRIPE_AMPLITUDE} lightness stripes`);

    for (const stripe of angle?.stripes ?? []) {
      const base = colorForAttracting(1, 0.5, stripe.argLambda, 'multiplier');
      const re = Math.cos(stripe.argLambda);
      const im = Math.sin(stripe.argLambda);
      const at = (distance: number) =>
        cssColor(modulateForMultiplierDirection(base, distance * re, distance * im, re, im));
      // Light where sin(f·projection) >= 0, dark in the next half period.
      expect(stripe.light).toBe(at(pitch / 2));
      expect(stripe.dark).toBe(at((3 * pitch) / 2));
      expect(stripe.light).not.toBe(stripe.dark);
      expect(stripe.pitch).toBeCloseTo(pitch, 10);
      // CSS angle a runs along (sin a, −cos a); the raster runs along (cos λ, sin λ).
      const a = (stripe.angleDeg * Math.PI) / 180;
      expect(Math.sin(a)).toBeCloseTo(re, 10);
      expect(-Math.cos(a)).toBeCloseTo(im, 10);
      expect(stripe.background).toBe(
        `repeating-linear-gradient(${stripe.angleDeg}deg, ${stripe.light} 0 ${pitch.toFixed(2)}px, ${stripe.dark} ${pitch.toFixed(2)}px ${(2 * pitch).toFixed(2)}px)`,
      );
    }
    // Orientation differs between samples, so the bar shows rotation.
    expect(new Set(angle?.stripes?.map((stripe) => stripe.angleDeg)).size).toBe(3);
    expect(angle?.background).not.toContain('repeating-linear-gradient');
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

  it('ranks the spectrum by area, keeps each period its palette colour, and lists the tail', () => {
    const key = buildPeriodKey(
      new Map([
        [1, 100],
        [2, 4000],
        [3, 9000],
        [4, 20],
        [5, 300],
        [6, 7],
        [7, 3],
      ]),
    );
    const items = swatches(legendModel('period', key).items);

    // Most pixels first; colours still follow ascending period (the raster's key).
    expect(items.slice(0, 5).map((item) => item.label)).toEqual([
      'Period 3',
      'Period 2',
      'Period 5',
      'Period 1',
      'Period 4',
    ]);
    expect(items.slice(0, 5).map((item) => item.background)).toEqual(
      [2, 1, 4, 0, 3].map((index) => cssColor(PERIOD_EMPHASIS_PALETTE[index] ?? [0, 0, 0, 0])),
    );
    const other = items[5];
    expect(other?.period).toBe('other');
    expect(other?.tail?.map((entry) => [entry.label, entry.period, entry.background])).toEqual([
      ['Period 6', 6, cssColor(OTHER_PERIODS_COLOR)],
      ['Period 7', 7, cssColor(OTHER_PERIODS_COLOR)],
    ]);
    expect(other?.tail?.[0]?.detail).toBe('<0.1% of attracting-cycle pixels');
  });

  it('draws spectrum bars on a four-decade log scale', () => {
    expect(spectrumWidth(1, 1)).toBe(1);
    expect(spectrumWidth(1, 10)).toBeCloseTo(0.75, 12);
    expect(spectrumWidth(1, 100)).toBeCloseTo(0.5, 12);
    expect(spectrumWidth(1, 10_000)).toBeCloseTo(0.02, 12);
    // Below the scale the bar keeps its minimum width; no pixels, no bar.
    expect(spectrumWidth(1, 1e9)).toBe(0.02);
    expect(spectrumWidth(0, 10)).toBe(0);
    expect(spectrumWidth(3, 0)).toBe(0);
    const key = buildPeriodKey(
      new Map([
        [1, 90],
        [2, 10],
      ]),
    );
    const [first, second] = swatches(legendModel('period', key).items);
    expect(first?.share).toBeCloseTo(1 + Math.log10(0.9) / 4, 12);
    expect(second?.share).toBeCloseTo(0.75, 12);
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

  it('draws the multiplier contour swatch from the colorizer contour shade', () => {
    const contour = swatches(legendModel('multiplier').items).find(
      (swatch) => swatch.label === 'Internal coordinates',
    );
    const base = colorForAttracting(1, 0.5, 0, 'multiplier');
    expect(contour?.background).toContain(cssColor(base));
    expect(contour?.background).toContain(cssColor(shadeForMultiplierContour(base)));
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
