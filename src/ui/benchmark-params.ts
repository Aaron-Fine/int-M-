import type { ClassifierMode, Viewport } from '../domain';
import { CLASSIFIER_MODES } from '../domain';
import { MAX_SCALE, MIN_SCALE, QUALITY_PROFILES, type QualityProfileId } from './view-state';

/**
 * Opt-in benchmark/diagnostic query parameters (performance plan §8/§9).
 *
 * These exist solely for the Stage A browser-evidence harness: without the
 * query parameters the application mounts exactly as before, and every value
 * is validated before use — anything unrecognized is ignored so the default
 * path stays byte-identical.
 */

export interface BenchmarkParams {
  /** `?perf=1` only; enables the window.__miRenderTrace diagnostic hook. */
  readonly perfEnabled: boolean;
  /** Validated `?classifierMode=` value; absent when missing or invalid. */
  readonly classifierMode?: ClassifierMode | undefined;
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
    classifierMode?: ClassifierMode;
    viewport?: Viewport;
    qualityProfile?: QualityProfileId;
  } = { perfEnabled: params.get('perf') === '1' };

  const classifierMode = params.get('classifierMode');
  if (classifierMode !== null && (CLASSIFIER_MODES as readonly string[]).includes(classifierMode)) {
    result.classifierMode = classifierMode as ClassifierMode;
  }
  const viewport = parseViewParam(params.get('view'));
  if (viewport !== undefined) result.viewport = viewport;
  const qualityProfile = params.get('quality');
  if (qualityProfile !== null && QUALITY_PROFILES.some((profile) => profile.id === qualityProfile)) {
    result.qualityProfile = qualityProfile as QualityProfileId;
  }
  return result;
};
