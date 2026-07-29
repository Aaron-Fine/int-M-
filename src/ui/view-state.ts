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

import type { SemanticView, Viewport } from '../domain';
import { DEFAULT_VIEWPORT, MAX_VIEWPORT_SPAN_Y, MIN_VIEWPORT_SPAN_Y } from '../domain/viewport';

export type { SemanticView, Viewport };
export { DEFAULT_VIEWPORT };

export const MIN_SCALE = MIN_VIEWPORT_SPAN_Y;
export const MAX_SCALE = MAX_VIEWPORT_SPAN_Y;
export const ZOOM_FACTOR = 1.7;

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

export function formatMagnification(spanY: number): string {
  const magnification = DEFAULT_VIEWPORT.spanY / spanY;
  if (magnification < 10_000) {
    return `${magnification.toFixed(magnification < 10 ? 2 : 0)}×`;
  }
  return `${magnification.toExponential(2).replace('+', '')}×`;
}
