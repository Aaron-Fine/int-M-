import { describe, expect, it } from 'vitest';

import { dimColor, ISOLATION_DIM_FACTOR } from '../../../src/domain';
import { ISOLATION_CONTRAST_FLOOR } from './palette-floors';
import { shippedPaletteSpec, worstIsolationContrast } from './palette-metrics';

describe('period isolation contrast (MI-UX-018, WCAG 2.2 SC 1.4.11)', () => {
  it('keeps every isolated colour at 3:1 against every dimmed colour in every vision', () => {
    expect(worstIsolationContrast(ISOLATION_DIM_FACTOR)).toBeGreaterThanOrEqual(
      ISOLATION_CONTRAST_FLOOR,
    );
  });

  it('uses the largest 0.02 step that meets the floor (the experiment’s 0.18 does not)', () => {
    expect(worstIsolationContrast(ISOLATION_DIM_FACTOR + 0.02)).toBeLessThan(
      ISOLATION_CONTRAST_FLOOR,
    );
    expect(worstIsolationContrast(0.18)).toBeLessThan(ISOLATION_CONTRAST_FLOOR);
  });

  it('matches the production dimming function', () => {
    const [yellow] = shippedPaletteSpec().periodClasses;
    expect(yellow).toBeDefined();
    if (yellow === undefined) return;
    const production = dimColor([yellow[0], yellow[1], yellow[2], 255]);
    expect(production.slice(0, 3)).toEqual(
      yellow.map((channel) => Math.round(channel * ISOLATION_DIM_FACTOR)),
    );
  });
});
