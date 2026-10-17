import { describe, expect, it } from 'vitest';

import { TEXT_OVERLAYS, worstOverlayContrast } from './overlay-contrast';
import { LABEL_CONTRAST_FLOOR } from './palette-floors';

describe('text over the raster (MI-UX-016, MI-UX-021)', () => {
  for (const selector of TEXT_OVERLAYS) {
    it(`${selector} keeps at least ${LABEL_CONTRAST_FLOOR}:1 over every raster colour`, () => {
      expect(worstOverlayContrast(selector)).toBeGreaterThanOrEqual(LABEL_CONTRAST_FLOOR);
    });
  }
});
