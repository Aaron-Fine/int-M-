/**
 * Optimization-tournament candidate contract (judge: tools/benchmark/tournament.ts).
 *
 * A candidate is one optimization behind a flag. It renders a corpus case
 * through production code with its flag enabled and returns every semantic
 * field the production renderer stores. The judge compares those fields
 * against the BASELINE candidate (tools/benchmark/candidates/baseline.ts,
 * the production path with default options) and times the render() call.
 */
import type { RasterSize, RenderQuality, SemanticView, Viewport } from '../../../src/domain';

export type { SemanticView };

export type QualityProfileName = 'Quick' | 'Balanced' | 'Detailed';

/** One corpus case at one raster size and quality profile. */
export interface CaseRenderSpec {
  readonly caseId: string;
  readonly caseClass: string;
  readonly viewport: Viewport;
  readonly size: RasterSize;
  readonly profile: QualityProfileName;
  /** Resolved production quality (maxIterations, maxPeriod, coarseStride). */
  readonly quality: RenderQuality;
  /**
   * True only in the UNTIMED parity pass. Candidates should then also fill the
   * optional `iterations`/`evidence` channels of readFields() and expose
   * certificates(). Never true in a timed render.
   */
  readonly diagnostics: boolean;
  /**
   * True only in the single UNTIMED counter pass that follows the timed
   * repetitions. Candidates may switch on instrumented kernels here; timed
   * renders always see false, so instrumentation never perturbs timing.
   */
  readonly collectCounters: boolean;
}

/**
 * Every stored semantic channel of the production frame, one entry per pixel,
 * row-major (index = y * width + x). Unused channels are zero:
 * smoothIteration is nonzero only for escaped pixels; multiplierMagnitude and
 * multiplierAngle only for attracting pixels; period only for attracting.
 */
export interface SemanticFields {
  /** 0 = unresolved, 1 = escaped, 2 = attracting (production status codes). */
  readonly status: Uint8Array;
  readonly period: Uint32Array;
  /** Smooth escape iteration (escaped pixels). */
  readonly smoothIteration: Float64Array;
  /** |lambda| of the attracting cycle; the stability view derives from it. */
  readonly multiplierMagnitude: Float64Array;
  /** arg(lambda) in radians; the multiplier view's direction derives from it. */
  readonly multiplierAngle: Float64Array;
  /** Optional diagnostics (parity pass only): iterations used by the classifier. */
  readonly iterations?: Uint32Array;
  /** Optional diagnostics (parity pass only): ORBIT_EVIDENCE_CODE per pixel. */
  readonly evidence?: Uint8Array;
}

export interface RenderedFrame {
  readonly size: RasterSize;
  /**
   * Unpack the stored semantic channels. Called by the judge OUTSIDE the timed
   * region, right after render() and before the next render() of the same
   * candidate, so a frame may keep views onto reused buffers. Must return
   * arrays the judge may retain (fresh copies if the candidate reuses storage).
   */
  readFields(): SemanticFields;
  /**
   * RGBA (row-major, width * height * 4) for one semantic view. Called by the
   * judge outside the timed region, immediately after render().
   */
  colorize(view: SemanticView): Uint8ClampedArray;
}

export interface FloatTolerance {
  /** Allowed deviation = absolute + relative * |baseline|. */
  readonly absolute?: number;
  readonly relative?: number;
}

/**
 * Declared tolerances for specific FLOAT fields. status, period, and every
 * classification/verdict field are always exact; there is no way to loosen
 * them. The judge validates the numbers against policy ceilings, applies
 * them, and reports every declared tolerance with the maximum observed
 * deviation. The default (no tolerance) is bit-identical.
 */
export interface FieldTolerancePolicy {
  /** Escaped pixels. Not permitted under 'semantic-revision' (escapes are bit-identical). */
  readonly smoothIteration?: FloatTolerance;
  readonly multiplierMagnitude?: FloatTolerance;
  /** Raw angle in radians (wraps at +-pi; prefer multiplierDirection). */
  readonly multiplierAngle?: FloatTolerance;
  /**
   * Absolute tolerance on the unit direction components (cos, sin) of the
   * angle, wrap-safe. `minBaselineMagnitude` skips pixels whose baseline
   * |lambda| is below it (the direction of ~0 is numerically meaningless).
   */
  readonly multiplierDirection?: {
    readonly absolute: number;
    readonly minBaselineMagnitude?: number;
  };
  /** Max per-channel byte difference allowed in any RGBA view (default 0). */
  readonly rgbaMaxChannelDelta?: number;
  /** Free text justifying the tolerance; echoed into the report. */
  readonly note?: string;
}

/**
 * - 'bit-identical' (default): every field must equal baseline's, except
 *   float fields within a declared tolerance.
 * - 'semantic-revision': for candidates that intentionally change results
 *   (e.g. certified early acceptance). See tools/benchmark/candidates/README.md.
 */
export type ParityPolicy = 'bit-identical' | 'semantic-revision';

export interface Candidate {
  readonly id: string;
  readonly description: string;
  /**
   * Render the stable (stride-1) semantic frame of the case. May be async
   * (the production renderer yields to the event loop between row groups).
   * The whole call is what the judge times.
   */
  render(spec: CaseRenderSpec): RenderedFrame | Promise<RenderedFrame>;
  /**
   * Counters of the most recent render (only requested after a render with
   * spec.collectCounters === true). Keys are free-form (iterations, lag
   * comparisons, verifierCalls, certificationAttempts, newtonSteps, ...);
   * all keys are recorded per case and compared against baseline where the
   * baseline reports the same key.
   */
  counters?(): Record<string, number>;
  /**
   * Certificate data for pixels the candidate ACCEPTED where baseline stayed
   * unresolved ('semantic-revision' only), keyed by pixel index
   * (y * width + x), for the most recent render with spec.diagnostics true.
   * Values must be JSON-serializable; the judge records them in the report.
   */
  certificates?(): ReadonlyMap<number, unknown> | Readonly<Record<string, unknown>>;
  /** Forget any per-render state (called before each case). */
  reset?(): void;
  /** Declared float tolerances (default: none, i.e. bit-identical). */
  readonly tolerance?: FieldTolerancePolicy;
  /** Default 'bit-identical'. */
  readonly parityPolicy?: ParityPolicy;
}
