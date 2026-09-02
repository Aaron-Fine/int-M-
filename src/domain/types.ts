import type { EvidenceSource, PeriodPolicy } from './period-policy';

export interface Complex {
  readonly re: number;
  readonly im: number;
}

/** Mutable complex holder for allocation-free hot paths. */
export interface MutableComplex {
  re: number;
  im: number;
}

/**
 * A viewport is expressed in complex-plane units, independent of raster size.
 * `spanY` is authoritative; the horizontal span follows the raster aspect ratio.
 */
export interface Viewport {
  readonly center: Complex;
  readonly spanY: number;
}

export interface RasterSize {
  readonly width: number;
  readonly height: number;
}

export type OrbitStatus = 'escaped' | 'attracting-cycle' | 'unresolved';

export type EvidenceFlag =
  | 'escape-radius'
  | 'analytic-main-cardioid'
  | 'analytic-period-2-bulb'
  | 'converged-cycle'
  | 'iteration-limit';

interface OrbitResultBase {
  readonly status: OrbitStatus;
  readonly iterations: number;
  readonly evidence: readonly EvidenceFlag[];
}

export interface EscapedOrbitResult extends OrbitResultBase {
  readonly status: 'escaped';
  readonly escapeIteration: number;
  readonly smoothIteration: number;
  readonly magnitudeSquared: number;
}

export interface AttractingCycleOrbitResult extends OrbitResultBase {
  readonly status: 'attracting-cycle';
  readonly period: number;
  /** Magnitude of the derivative around one complete attracting cycle. */
  readonly multiplierMagnitude: number;
  /** Principal argument of the cycle multiplier in radians, in [-pi, pi]. */
  readonly multiplierAngle: number;
  /** Intrinsic stability kappa = -log(|lambda|) / period. */
  readonly stabilityExponent: number;
  /**
   * Revision of the common numerical verifier (frozen acceptance policy)
   * that accepted this result. Always set by materializeOrbitResult;
   * optional in the type so older wire payloads stay valid.
   */
  readonly verifierRevision?: string;
  /**
   * How the attracting candidate was PROPOSED (plan section 4
   * evidenceSource vocabulary; see src/domain/period-policy.ts for the
   * documented mapping). Pure origin metadata: acceptance is the common
   * verifier's alone and the quality barrier never depends on this field.
   * Always set by materializeOrbitResult; optional in the type so older
   * wire payloads stay valid.
   */
  readonly evidenceSource?: EvidenceSource;
}

export interface UnresolvedOrbitResult extends OrbitResultBase {
  readonly status: 'unresolved';
}

export type OrbitResult = EscapedOrbitResult | AttractingCycleOrbitResult | UnresolvedOrbitResult;

export type SemanticView = 'stability' | 'multiplier' | 'period';

export interface OrbitOptions {
  readonly maxIterations: number;
  readonly maxPeriod: number;
  /**
   * Candidate proposal gate for the lag scan. Acceptance is the frozen
   * common-verifier policy (src/domain/verifier.ts), not this option: with
   * the default 1e-10 the effective bounds match the legacy classifier.
   */
  readonly cycleTolerance: number;
  readonly cycleWarmup: number;
  /**
   * Versioned period policy (PR 5, plan section 4) describing the search
   * this classification runs: the systematic ceiling and orbit budget it
   * declares must equal `maxPeriod`/`maxIterations` (enforced by
   * resolveOrbitOptions), and `opportunisticMaxPeriod` is reserved for PR 4+
   * candidate sources — nothing in the current classifier reads it, so
   * raising it cannot change any classification outcome. When omitted,
   * resolution attaches the derived default policy.
   */
  readonly periodPolicy?: PeriodPolicy;
}

export interface RenderQuality {
  readonly maxIterations: number;
  readonly maxPeriod: number;
  readonly coarseStride: number;
}
