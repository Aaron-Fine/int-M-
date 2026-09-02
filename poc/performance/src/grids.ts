/**
 * Deterministic raster grids for the neighbor/transplant/trap variants
 * (plan section 5 PoC list: raster-coherent candidate sources).
 *
 * The differential corpus is a point list, so neighbor evidence cannot come
 * from spatial adjacency in the matrix. These grids simulate the raster
 * layer the production dispatcher has: small deterministic point grids
 * classified in raster order (y outer, x inner), so the previously
 * classified pixel is the LEFT neighbor and the period it detected is the
 * neighbor hint / transplant seed. The simplification is documented in the
 * runner output and README: single-neighbor (left) evidence only, no
 * top-neighbor or two-dimensional seed pooling.
 *
 * All specs are frozen: changing a center, spacing, or the grid size
 * changes every downstream grid measurement. Spacing provenance per spec
 * below. Escaped-heavy grids are deliberately included (anchor views mix
 * interior and exterior) so hint quality is measured with transitions,
 * not only on coherent interior blocks.
 */

import { HARD_VIEW_ANCHORS } from './corpus.ts';

export const GRIDS_REVISION = 'poc-grids-1.0.0';

/** Frozen grid edge length (16x16 = 256 points per grid). */
export const GRID_SIZE = 16;

export interface GridSpec {
  readonly name: string;
  readonly centerRe: number;
  readonly centerIm: number;
  readonly spacing: number;
  readonly provenance: string;
}

/**
 * Exact period-1 multiplier map (corpus.ts fixedPointParameter convention):
 * z* = lambda/2 and c = z* - z*^2 place a period-1 cycle with the requested
 * |lambda| inside the main cardioid by construction. The weak-cardioid grid
 * documents that weak period-1 attraction is closed-form territory: every
 * pixel is caught by the analytic fast path without orbit work.
 */
const weakGridCenter = (lambdaMagnitude: number, theta: number): [number, number] => {
  const zStarRe = (lambdaMagnitude * Math.cos(theta)) / 2;
  const zStarIm = (lambdaMagnitude * Math.sin(theta)) / 2;
  // c = z* - z*^2: real part a - (a^2 - b^2), imaginary part b - 2ab.
  return [zStarRe - (zStarRe * zStarRe - zStarIm * zStarIm), zStarIm - 2 * zStarRe * zStarIm];
};

/**
 * Frozen probe direction from the rabbit center into its period-6 satellite
 * bulb, used for the near-boundary weak-attraction grids. Provenance: the
 * radii below were chosen with a binary64/dd multiplier probe along this
 * direction (the only non-analytic weak-attraction territory a straight
 * line reaches from the rabbit center); the actual |lambda| of each grid's
 * seed pixel is measured per run from the oracle adjudication and reported
 * in the grid section, so the spec does not hard-code a multiplier claim.
 */
const PROBE_DIRECTION = { re: 0.3, im: 1 } as const;
const probeOffset = (radius: number): [number, number] => {
  const norm = Math.hypot(PROBE_DIRECTION.re, PROBE_DIRECTION.im);
  return [
    -0.1225611668766535 + (radius * PROBE_DIRECTION.re) / norm,
    0.7448617666197435 + (radius * PROBE_DIRECTION.im) / norm,
  ];
};

const WEAK_P3 = probeOffset(0.055);
const WEAK_P6A = probeOffset(0.085);
const WEAK_P6B = probeOffset(0.09);

export const GRID_SPECS: readonly GridSpec[] = Object.freeze([
  {
    name: 'anchor-0',
    centerRe: HARD_VIEW_ANCHORS[0]?.re ?? Number.NaN,
    centerIm: HARD_VIEW_ANCHORS[0]?.im ?? Number.NaN,
    // 16x16 slice of the nominal vertical span 2.5/zoom (pr2-bench
    // convention), so one grid pixel = one view pixel at that zoom.
    spacing: 2.5 / (HARD_VIEW_ANCHORS[0]?.zoom ?? 1) / GRID_SIZE,
    provenance: 'hard view anchor 0 (zoom 126), 16x16 slice of the 2.5/zoom span',
  },
  {
    name: 'anchor-1',
    centerRe: HARD_VIEW_ANCHORS[1]?.re ?? Number.NaN,
    centerIm: HARD_VIEW_ANCHORS[1]?.im ?? Number.NaN,
    spacing: 2.5 / (HARD_VIEW_ANCHORS[1]?.zoom ?? 1) / GRID_SIZE,
    provenance: 'hard view anchor 1 (zoom 609), 16x16 slice of the 2.5/zoom span',
  },
  {
    name: 'anchor-2',
    centerRe: HARD_VIEW_ANCHORS[2]?.re ?? Number.NaN,
    centerIm: HARD_VIEW_ANCHORS[2]?.im ?? Number.NaN,
    spacing: 2.5 / (HARD_VIEW_ANCHORS[2]?.zoom ?? 1) / GRID_SIZE,
    provenance: 'hard view anchor 2 (zoom 13), 16x16 slice of the 2.5/zoom span',
  },
  {
    name: 'rabbit',
    centerRe: -0.1225611668766535,
    centerIm: 0.7448617666197435,
    // Rabbit-neighborhood stratum scale (offsets up to 3e-3): 1e-4 covers a
    // coherent period-3 block with room for boundary transitions.
    spacing: 1e-4,
    provenance: 'rabbit center, stratum-scale spacing 1e-4',
  },
  {
    name: 'co-rabbit',
    centerRe: -0.1225611668766535,
    centerIm: -0.7448617666197435,
    spacing: 1e-4,
    provenance: 'co-rabbit center, stratum-scale spacing 1e-4',
  },
  {
    name: 'period-5',
    centerRe: -0.504505098022,
    centerIm: 0.5629264446,
    spacing: 1e-4,
    provenance: 'period-5 bulb center (corpus stratum scale), spacing 1e-4',
  },
  {
    name: 'weak-cardioid',
    centerRe: weakGridCenter(0.95, 0)[0],
    centerIm: weakGridCenter(0.95, 0)[1],
    spacing: 1.5e-4,
    provenance:
      'period-1 cycle with |lambda| = 0.95 (epsilon 0.05), theta 0; analytic-path witness',
  },
  {
    name: 'weak-p3',
    centerRe: WEAK_P3[0],
    centerIm: WEAK_P3[1],
    // 5e-5 keeps the first-order transplant displacement of the
    // near-boundary seeds inside the frozen transplant guard (1e-2) for
    // |B_cycle| up to ~10; measured guard-refusal rates by |lambda| bucket
    // are reported regardless.
    spacing: 5e-5,
    provenance:
      'rabbit component interior near its boundary along the probe direction (p3, |lambda| ~ 0.59 measured)',
  },
  {
    name: 'weak-p6a',
    centerRe: WEAK_P6A[0],
    centerIm: WEAK_P6A[1],
    spacing: 5e-5,
    provenance:
      'period-6 satellite bulb near its boundary along the probe direction (|lambda| ~ 0.83 measured)',
  },
  {
    name: 'weak-p6b',
    centerRe: WEAK_P6B[0],
    centerIm: WEAK_P6B[1],
    spacing: 5e-5,
    provenance:
      'period-6 satellite bulb near its parabolic boundary along the probe direction (|lambda| ~ 0.94 measured)',
  },
]);

export interface GridPoint {
  readonly id: string;
  /** Grid-local raster coordinates (x right, y down). */
  readonly x: number;
  readonly y: number;
  readonly grid: string;
  readonly cRe: number;
  readonly cIm: number;
}

/**
 * Raster-order grid points across all frozen specs: for each grid, y outer
 * and x inner, with y running DOWN (imaginary part decreasing), matching
 * the production viewport transform convention (pr2-bench).
 */
export const buildGrids = (): GridPoint[] => {
  const points: GridPoint[] = [];
  for (const spec of GRID_SPECS) {
    const half = (GRID_SIZE - 1) / 2;
    for (let y = 0; y < GRID_SIZE; y += 1) {
      for (let x = 0; x < GRID_SIZE; x += 1) {
        points.push({
          id: `grid-${spec.name}-${x}-${y}`,
          x,
          y,
          grid: spec.name,
          cRe: spec.centerRe + (x - half) * spec.spacing,
          cIm: spec.centerIm - (y - half) * spec.spacing,
        });
      }
    }
  }
  return points;
};
