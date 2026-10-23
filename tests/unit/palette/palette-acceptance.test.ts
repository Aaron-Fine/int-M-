import { describe, expect, it } from 'vitest';

import { colorForAttracting } from '../../../src/domain';
import { relativeLuminance } from './color-science';
import {
  candidateClasses,
  PERIOD_PALETTE_CANDIDATES,
  SELECTED_PERIOD_PALETTE_ID,
} from './palette-candidates';
import { PALETTE_FLOORS } from './palette-floors';
import { measurePalette, shippedPaletteSpec } from './palette-metrics';

describe('shipped palette acceptance (MI-UX-021)', () => {
  it('meets every colour-difference floor under normal, protan, deutan and tritan vision', () => {
    const below = measurePalette(shippedPaletteSpec())
      .filter((result) => result.min < PALETTE_FLOORS[result.name])
      .map((result) => `${result.name}: ${result.min.toFixed(2)}`);
    expect(below).toEqual([]);
  });

  it('ships exactly the selected period palette', () => {
    const selected = PERIOD_PALETTE_CANDIDATES.find(
      (candidate) => candidate.id === SELECTED_PERIOD_PALETTE_ID,
    );
    expect(selected).toBeDefined();
    if (selected === undefined) return;
    expect(shippedPaletteSpec().periodClasses).toEqual(candidateClasses(selected));
  });

  it('keeps the stability ramp a neutral gray whose luminance never falls as κ grows', () => {
    // κ = −ln|λ| / p; sweep |λ| from 1 (κ = 0) down to 0 (κ = ∞) for several periods.
    for (const period of [1, 2, 7, 32]) {
      let previous = -1;
      for (let step = 0; step <= 1000; step += 1) {
        const magnitude = 1 - step / 1000;
        const [red, green, blue] = colorForAttracting(period, magnitude, 0, 'stability');
        expect(green).toBe(red);
        expect(blue).toBe(red);
        const luminance = relativeLuminance([red, green, blue]);
        expect(luminance).toBeGreaterThanOrEqual(previous);
        previous = luminance;
      }
    }
    expect(colorForAttracting(1, 1, 0, 'stability')[0]).toBe(35);
    expect(colorForAttracting(1, 0, 0, 'stability')[0]).toBe(240);
  });
});
