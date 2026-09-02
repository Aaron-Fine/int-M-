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

/**
 * Evidence flags encoded as small integers in the primitive record;
 * materializeOrbitResult maps them back to EvidenceFlag strings at the rich
 * result boundary. Shared vocabulary of every classifier kernel (the lag
 * scan and the PR 4 checkpoint schedule write the same codes), so the codes
 * live beside the types rather than in one kernel.
 */
export const ORBIT_EVIDENCE_CODE = Object.freeze({
  escapeRadius: 0,
  analyticMainCardioid: 1,
  analyticPeriod2Bulb: 2,
  convergedCycle: 3,
  iterationLimit: 4,
} as const);

export const EVIDENCE_BY_CODE: readonly EvidenceFlag[] = Object.freeze([
  'escape-radius',
  'analytic-main-cardioid',
  'analytic-period-2-bulb',
  'converged-cycle',
  'iteration-limit',
]);

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
}

export interface UnresolvedOrbitResult extends OrbitResultBase {
  readonly status: 'unresolved';
}

export type OrbitResult = EscapedOrbitResult | AttractingCycleOrbitResult | UnresolvedOrbitResult;

export type SemanticView = 'stability' | 'multiplier' | 'period';

/**
 * Versioned classifier-mode option (PR 4, plan section 11: the checkpoint
 * schedule lands "behind a legacy differential flag"). The vocabulary is
 * frozen; 'legacy-scan' remains the default until Stage A browser evidence
 * says otherwise (plan section 9).
 *
 * - 'legacy-scan': the post-PR-3 lag scan (src/domain/orbit.ts classifyInto),
 *   unchanged.
 * - 'checkpoint': the PR 4 power-of-two checkpoint schedule
 *   (src/domain/checkpoint.ts), candidate-only toward the common verifier.
 * - 'differential': both kernels run per pixel; disagreements (status,
 *   period, |lambda| bits) are counted into a preallocated differential
 *   record while the legacy answer stays the reported one.
 */
export type ClassifierMode = 'legacy-scan' | 'checkpoint' | 'differential';

export const CLASSIFIER_MODES: readonly ClassifierMode[] = Object.freeze([
  'legacy-scan',
  'checkpoint',
  'differential',
]);

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
  /** Versioned classifier mode; default 'legacy-scan' (see ClassifierMode). */
  readonly classifierMode?: ClassifierMode;
  /**
   * Checkpoint-schedule exhaustion scan (plan section 4): one final full lag
   * scan from the final state when the orbit budget ends unresolved,
   * verifier-gated like every candidate path. Default on; read only by the
   * checkpoint kernel (the legacy scan is unaffected).
   */
  readonly exhaustionScan?: boolean;
}

export interface RenderQuality {
  readonly maxIterations: number;
  readonly maxPeriod: number;
  readonly coarseStride: number;
}
