import type { ClassifierMode, Viewport } from '../domain';
import { CLASSIFIER_MODES } from '../domain';
import type { BandOrder, FrameOutput } from '../render';
import { isYieldMechanism, type YieldMechanism } from '../render/yield-scheduler';
import { MAX_SCALE, MIN_SCALE, QUALITY_PROFILES, type QualityProfileId } from './view-state';

/**
 * Opt-in benchmark/diagnostic query parameters (performance plan §8/§9).
 *
 * These exist solely for the Stage A browser-evidence harness: without the
 * query parameters the application mounts exactly as before, and every value
 * is validated before use — anything unrecognized is ignored so the default
 * path stays byte-identical.
 */

const BAND_ORDERS: readonly BandOrder[] = ['center-out', 'legacy'];

export interface BenchmarkParams {
  /** `?perf=1` only; enables the window.__miRenderTrace diagnostic hook. */
  readonly perfEnabled: boolean;
  /**
   * `?perf=1&perfCounters=1` only; enables the plan §8 opt-in diagnostics
   * counters (workers accumulate per-band counters and attach them to frame
   * messages). Absent otherwise, so the default parse keeps its exact shape.
   */
  readonly perfCounters?: true | undefined;
  /** Validated `?classifierMode=` value; absent when missing or invalid. */
  readonly classifierMode?: ClassifierMode | undefined;
  /**
   * Validated `?bandOrder=` stable-band dispatch order; absent when missing
   * or invalid. Diagnostic arm selector for the center-out scheduling gate.
   */
  readonly bandOrder?: BandOrder | undefined;
  /**
   * Validated `?yieldMechanism=` row-yield mechanism; absent when missing or
   * invalid. Diagnostic arm selector for the yield-mechanism gate.
   */
  readonly yieldMechanism?: YieldMechanism | undefined;
  /**
   * Validated `?frameOutput=` stable-frame output path; absent when missing
   * or invalid. Diagnostic arm selector for the zero-copy gate.
   */
  readonly frameOutput?: FrameOutput | undefined;
  /** Validated `?view=<re>,<im>,<spanY>` viewport of exact decimal strings. */
  readonly viewport?: Viewport | undefined;
  /** Validated `?quality=` profile id; absent when missing or invalid. */
  readonly qualityProfile?: QualityProfileId | undefined;
}

/** Strict decimal-string form: optional sign, digits with optional fraction, optional exponent. */
const DECIMAL_PATTERN = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

/**
 * Parses a `re,im,spanY` triple of exact decimal strings into a Viewport.
 * Returns undefined unless all three parts are finite decimals and spanY is
 * inside the application's declared zoom envelope — a partial or out-of-range
 * view must never silently move the camera.
 */
export const parseViewParam = (value: string | null): Viewport | undefined => {
  if (value === null) return undefined;
  const parts = value.split(',');
  if (parts.length !== 3) return undefined;
  const [re, im, spanY] = parts;
  if (
    re === undefined ||
    im === undefined ||
    spanY === undefined ||
    !DECIMAL_PATTERN.test(re) ||
    !DECIMAL_PATTERN.test(im) ||
    !DECIMAL_PATTERN.test(spanY)
  ) {
    return undefined;
  }
  const centerRe = Number(re);
  const centerIm = Number(im);
  const spanYNumeric = Number(spanY);
  if (
    !Number.isFinite(centerRe) ||
    !Number.isFinite(centerIm) ||
    !Number.isFinite(spanYNumeric) ||
    spanYNumeric < MIN_SCALE ||
    spanYNumeric > MAX_SCALE
  ) {
    return undefined;
  }
  return { center: { re: centerRe, im: centerIm }, spanY: spanYNumeric };
};

export const parseBenchmarkParams = (search: string): BenchmarkParams => {
  const params = new URLSearchParams(search);
  const result: {
    perfEnabled: boolean;
    perfCounters?: true;
    classifierMode?: ClassifierMode;
    bandOrder?: BandOrder;
    yieldMechanism?: YieldMechanism;
    frameOutput?: FrameOutput;
    viewport?: Viewport;
    qualityProfile?: QualityProfileId;
  } = { perfEnabled: params.get('perf') === '1' };
  // Counters are a strict sub-mode of the perf diagnostics: they never turn
  // on without ?perf=1 and add nothing to the default path.
  if (result.perfEnabled && params.get('perfCounters') === '1') {
    result.perfCounters = true;
  }

  const classifierMode = params.get('classifierMode');
  if (classifierMode !== null && (CLASSIFIER_MODES as readonly string[]).includes(classifierMode)) {
    result.classifierMode = classifierMode as ClassifierMode;
  }
  const bandOrder = params.get('bandOrder');
  if (bandOrder !== null && (BAND_ORDERS as readonly string[]).includes(bandOrder)) {
    result.bandOrder = bandOrder as BandOrder;
  }
  const yieldMechanism = params.get('yieldMechanism');
  if (yieldMechanism !== null && isYieldMechanism(yieldMechanism)) {
    result.yieldMechanism = yieldMechanism;
  }
  const frameOutput = params.get('frameOutput');
  if (frameOutput === 'zero-copy' || frameOutput === 'legacy-merge') {
    result.frameOutput = frameOutput;
  }
  const viewport = parseViewParam(params.get('view'));
  if (viewport !== undefined) result.viewport = viewport;
  const qualityProfile = params.get('quality');
  if (
    qualityProfile !== null &&
    QUALITY_PROFILES.some((profile) => profile.id === qualityProfile)
  ) {
    result.qualityProfile = qualityProfile as QualityProfileId;
  }
  return result;
};
