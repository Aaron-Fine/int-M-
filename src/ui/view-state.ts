export const SEMANTIC_VIEWS = [
  {
    id: 'stability',
    label: 'Stability',
    description: 'How quickly the orbit settles into an attracting cycle.',
  },
  {
    id: 'multiplier',
    label: 'Multiplier',
    description: 'The strength and angle of attraction around a detected cycle.',
  },
  {
    id: 'period',
    label: 'Period',
    description: 'The detected attracting-cycle period.',
  },
] as const;

import type { RenderQuality, SemanticView, Viewport } from '../domain';
import { DEFAULT_VIEWPORT, MAX_VIEWPORT_SPAN_Y, MIN_VIEWPORT_SPAN_Y } from '../domain/viewport';

export type { SemanticView, Viewport };
export { DEFAULT_VIEWPORT };

export const MIN_SCALE = MIN_VIEWPORT_SPAN_Y;
export const MAX_SCALE = MAX_VIEWPORT_SPAN_Y;
export const ZOOM_FACTOR = 1.7;
export const DEFAULT_QUALITY_PROFILE_ID = 'balanced';

export type QualityProfileId = 'quick' | 'balanced' | 'detailed';

export interface QualityProfile {
  readonly id: QualityProfileId;
  readonly label: string;
  readonly description: string;
  readonly quality: RenderQuality;
  readonly maxRenderEdge: number;
}

/**
 * Named finite search budgets keep the UI understandable and ensure the
 * renderer and point inspector use the same evidence limits.
 */
export const QUALITY_PROFILES: readonly QualityProfile[] = Object.freeze([
  {
    id: 'quick',
    label: 'Quick',
    description: 'Faster exploration; more points may remain unresolved.',
    quality: Object.freeze({ maxIterations: 256, maxPeriod: 16, coarseStride: 12 }),
    maxRenderEdge: 768,
  },
  {
    id: DEFAULT_QUALITY_PROFILE_ID,
    label: 'Balanced',
    description: 'Recommended balance of detail and render time.',
    quality: Object.freeze({ maxIterations: 512, maxPeriod: 32, coarseStride: 8 }),
    maxRenderEdge: 1024,
  },
  {
    id: 'detailed',
    label: 'Detailed',
    description: 'Checks longer and higher-period cycles; renders more slowly.',
    quality: Object.freeze({ maxIterations: 1024, maxPeriod: 64, coarseStride: 8 }),
    maxRenderEdge: 1024,
  },
]);

export function getQualityProfile(id: QualityProfileId): QualityProfile {
  const profile = QUALITY_PROFILES.find((candidate) => candidate.id === id);
  if (!profile) throw new Error(`Unknown quality profile: ${id}`);
  return profile;
}

export function isDefaultViewport(viewport: Viewport): boolean {
  return (
    viewport.center.re === DEFAULT_VIEWPORT.center.re &&
    viewport.center.im === DEFAULT_VIEWPORT.center.im &&
    viewport.spanY === DEFAULT_VIEWPORT.spanY
  );
}

export function formatCoordinate(value: number): string {
  if (Math.abs(value) < 1e-12) return '0';
  return value.toPrecision(9).replace(/(?:\.0+|(\.\d+?)0+)e/, '$1e');
}

/**
 * Formats an inspected coordinate without implying sub-raster selection
 * precision. One decimal guard digit is retained beyond the pixel spacing so
 * adjacent selectable samples remain distinguishable, capped at binary64's
 * useful decimal precision.
 */
export function formatCoordinateForViewport(
  value: number,
  spanY: number,
  rasterHeight: number,
): string {
  const unitsPerPixel = spanY / Math.max(1, rasterHeight);
  const decimalPlaces = Math.min(15, Math.max(3, Math.ceil(-Math.log10(unitsPerPixel)) + 1));
  if (Math.abs(value) < 10 ** -decimalPlaces) return '0';
  return value.toFixed(decimalPlaces).replace(/(?:\.0+|(\.\d+?)0+)$/, '$1');
}

export function formatMagnification(spanY: number): string {
  const magnification = DEFAULT_VIEWPORT.spanY / spanY;
  if (magnification < 10_000) {
    return `${magnification.toFixed(magnification < 10 ? 2 : 0)}×`;
  }
  return `${magnification.toExponential(2).replace('+', '')}×`;
}
