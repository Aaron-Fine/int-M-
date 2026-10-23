import type { MetricName } from './palette-metrics';

/**
 * The Phase 1 palette's measured minimum CIEDE2000 differences under normal,
 * protan, deutan and tritan vision, rounded down to an integer. That palette
 * passed the reviewed Phase 1 CVD matrix
 * (evidence/phase-1/cvd-4fd4fdd-2026-08-29.md), so these are the floors
 * owner decision Q5 starts from; palette-selection.test.ts recomputes them.
 *
 * The stability ramp and the multiplier hues are not measured against the
 * escaped and unresolved colours: they overlap them by design, and the
 * unresolved checker texture and the multiplier stripes are the cues that
 * separate them (gated as `unresolved-checker` and `multiplier-stripes`).
 */
export const PHASE1_FLOORS: Readonly<Record<MetricName, number>> = {
  'escaped-vs-unresolved/stability': 8,
  'escaped-vs-unresolved/multiplier': 18,
  'escaped-vs-unresolved/period': 18,
  'unresolved-checker': 8,
  'multiplier-stripes': 9,
  'period-classes-pairwise': 5,
  'period-classes-vs-unresolved': 11,
  'period-classes-vs-escaped': 18,
};

/**
 * The floors the shipped palette must meet: the Phase 1 floors, with the
 * period-colour floor raised to 11 once the owner accepted the Okabe–Ito
 * palette (2026-10-17), which reaches 11.98.
 */
export const PALETTE_FLOORS: Readonly<Record<MetricName, number>> = {
  ...PHASE1_FLOORS,
  'period-classes-pairwise': 11,
};

/** WCAG 2.2 SC 1.4.3 (AA) minimum for text drawn over the raster. */
export const LABEL_CONTRAST_FLOOR = 4.5;

/**
 * WCAG 2.2 SC 1.4.11 (non-text contrast) minimum between an isolated period's
 * pixels and every dimmed pixel around them (MI-UX-018).
 */
export const ISOLATION_CONTRAST_FLOOR = 3;
