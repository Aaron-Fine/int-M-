/**
 * Contrast of text drawn over the raster (MI-UX-016, MI-UX-021). Reads the
 * overlay colours from src/styles.css (Node only: run from the repo root, as
 * npm and Vitest do) and composites them over every shipped raster colour.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { dimColor } from '../../../src/domain';
import { composite, contrastRatio, type Rgb } from './color-science';
import { shippedPaletteSpec } from './palette-metrics';

/** Overlays that draw text directly over the raster. */
export const TEXT_OVERLAYS = ['.catalog-marker__label', '.explorer__hint', '.feedback'] as const;

interface CssColor {
  readonly rgb: Rgb;
  readonly alpha: number;
}

const styles = (): string => readFileSync(path.resolve(process.cwd(), 'src/styles.css'), 'utf8');

const ruleBody = (css: string, selector: string): string => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`^${escaped} \\{([^}]*)\\}`, 'm').exec(css);
  if (match?.[1] === undefined) throw new Error(`no top-level rule for ${selector}`);
  return match[1];
};

const declaration = (body: string, property: string): string => {
  const match = new RegExp(`^\\s*${property}:\\s*([^;]+);`, 'm').exec(body);
  if (match?.[1] === undefined) throw new Error(`no ${property} declaration`);
  return match[1].trim();
};

const parseCssColor = (value: string): CssColor => {
  if (value === 'white') return { rgb: [255, 255, 255], alpha: 1 };
  const match = /^rgb\((\d+) (\d+) (\d+)(?: \/ (\d+)%)?\)$/.exec(value);
  if (match === null) throw new Error(`unsupported CSS colour ${value}`);
  return {
    rgb: [Number(match[1]), Number(match[2]), Number(match[3])],
    alpha: match[4] === undefined ? 1 : Number(match[4]) / 100,
  };
};

/** Every colour the raster can show under an overlay, plus the white bound. */
const rasterColors = (): readonly Rgb[] => {
  const spec = shippedPaletteSpec();
  const undimmed: readonly Rgb[] = [
    [255, 255, 255],
    ...spec.escaped.stability,
    ...spec.escaped.multiplier,
    ...spec.unresolvedCells,
    ...spec.multiplierStripePairs.flat(),
    ...spec.periodClasses,
  ];
  // Legend isolation (MI-UX-018) dims every period-view pixel but the isolated period's.
  const dimmed = [...spec.periodClasses, ...spec.escaped.period, ...spec.unresolvedCells].map(
    (color): Rgb => {
      const [r, g, b] = dimColor([color[0], color[1], color[2], 255]);
      return [r, g, b];
    },
  );
  return [...undimmed, ...dimmed];
};

/** The lowest text contrast of `selector` over any raster colour. */
export const worstOverlayContrast = (selector: string): number => {
  const body = ruleBody(styles(), selector);
  const text = parseCssColor(declaration(body, 'color'));
  const background = parseCssColor(declaration(body, 'background'));
  let worst = Number.POSITIVE_INFINITY;
  for (const raster of rasterColors()) {
    const panel = composite(background.rgb, background.alpha, raster);
    const glyph = composite(text.rgb, text.alpha, panel);
    worst = Math.min(worst, contrastRatio(glyph, panel));
  }
  return worst;
};
