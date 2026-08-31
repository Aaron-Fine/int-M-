/**
 * Schema validation and sanity checks for the frozen benchmark corpus
 * (tools/benchmark/corpus.v1.json). Pure module: no runtime dependencies, so it
 * typechecks under every tsconfig program and runs under plain Node type
 * stripping. The executable wrapper is tools/benchmark/validate-corpus-cli.mjs.
 */

export const CORPUS_SCHEMA_VERSION = 1;
export const CORPUS_CLASSES = ['Easy', 'Hard known', 'Fallback', 'Scale'] as const;
export const CORPUS_PROFILES = ['Quick', 'Balanced', 'Detailed'] as const;
export const CORPUS_DESIGNATIONS = ['screening', 'release-gate'] as const;
export const CORPUS_STRATA = [
  'exterior',
  'period-1-4',
  'period-5-8',
  'period-9-12',
  'uncataloged-higher-period',
  'weak-attraction',
  'boundary',
  'high-unresolved',
  'simd-divergent',
] as const;
export const CORPUS_RASTER_ROLES = ['shipping', 'diagnostic'] as const;

export type CorpusClass = (typeof CORPUS_CLASSES)[number];
export type CorpusProfile = (typeof CORPUS_PROFILES)[number];
export type CorpusDesignation = (typeof CORPUS_DESIGNATIONS)[number];
export type CorpusStratum = (typeof CORPUS_STRATA)[number];
export type CorpusRasterRole = (typeof CORPUS_RASTER_ROLES)[number];

/**
 * Declared product zoom envelope, mirrored from src/domain/viewport.ts
 * (DEFAULT_VIEWPORT.spanY / MAX_MAGNIFICATION / MAX_VIEWPORT_SPAN_Y).
 */
const DEFAULT_SPAN_Y = 2.5;
const MIN_SPAN_Y = DEFAULT_SPAN_Y / 6_000_000;
const MAX_SPAN_Y = 4;

/** Strict decimal notation: optional sign, digits, optional fraction; no exponent, no hex. */
const DECIMAL_STRING = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?$/;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const decimalString = (
  diagnostics: string[],
  context: string,
  value: unknown,
): number | undefined => {
  if (typeof value !== 'string') {
    diagnostics.push(`${context} must be an exact decimal string, got ${typeof value}`);
    return undefined;
  }
  if (!DECIMAL_STRING.test(value)) {
    diagnostics.push(`${context} must match ${DECIMAL_STRING}, got "${value}"`);
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    diagnostics.push(`${context} does not parse to a finite number: "${value}"`);
    return undefined;
  }
  return parsed;
};

const validateRaster = (diagnostics: string[], index: number, value: unknown): void => {
  const context = `rasters[${index}]`;
  if (!isObject(value)) {
    diagnostics.push(`${context} must be an object`);
    return;
  }
  if (typeof value['id'] !== 'string' || value['id'].length === 0) {
    diagnostics.push(`${context}.id must be a non-empty string`);
  }
  for (const field of ['width', 'height'] as const) {
    const size = value[field];
    if (typeof size !== 'number' || !Number.isInteger(size) || size <= 0) {
      diagnostics.push(`${context}.${field} must be a positive integer`);
    }
  }
  if (!CORPUS_RASTER_ROLES.includes(value['role'] as CorpusRasterRole)) {
    diagnostics.push(`${context}.role must be one of ${CORPUS_RASTER_ROLES.join(', ')}`);
  }
};

const validateCaseEnums = (
  diagnostics: string[],
  context: string,
  value: Record<string, unknown>,
): void => {
  if (!CORPUS_CLASSES.includes(value['class'] as CorpusClass)) {
    diagnostics.push(`${context}.class must be one of ${CORPUS_CLASSES.join(', ')}`);
  }
  if (!CORPUS_PROFILES.includes(value['profile'] as CorpusProfile)) {
    diagnostics.push(`${context}.profile must be one of ${CORPUS_PROFILES.join(', ')}`);
  }
  if (!CORPUS_DESIGNATIONS.includes(value['designation'] as CorpusDesignation)) {
    diagnostics.push(`${context}.designation must be one of ${CORPUS_DESIGNATIONS.join(', ')}`);
  }
};

const validateCaseGeometry = (
  diagnostics: string[],
  context: string,
  value: Record<string, unknown>,
): void => {
  const center = value['center'];
  if (!isObject(center)) {
    diagnostics.push(`${context}.center must be an object with decimal-string re/im`);
    return;
  }
  const re = decimalString(diagnostics, `${context}.center.re`, center['re']);
  const im = decimalString(diagnostics, `${context}.center.im`, center['im']);
  if (re !== undefined && Math.abs(re) > 4) {
    diagnostics.push(`${context}.center.re is outside the sanity bounds [-4, 4]: ${re}`);
  }
  if (im !== undefined && Math.abs(im) > 4) {
    diagnostics.push(`${context}.center.im is outside the sanity bounds [-4, 4]: ${im}`);
  }
};

const validateCaseStrata = (
  diagnostics: string[],
  context: string,
  value: Record<string, unknown>,
): void => {
  const strata = value['strata'];
  if (!Array.isArray(strata) || strata.length === 0) {
    diagnostics.push(`${context}.strata must be a non-empty array of stratum tags`);
    return;
  }
  for (const tag of strata) {
    if (!CORPUS_STRATA.includes(tag as CorpusStratum)) {
      diagnostics.push(`${context}.strata contains unknown tag ${JSON.stringify(tag)}`);
    }
  }
  if (new Set(strata).size !== strata.length) {
    diagnostics.push(`${context}.strata contains duplicate tags`);
  }
};

const validateCase = (diagnostics: string[], index: number, value: unknown): string | undefined => {
  const context = `cases[${index}]`;
  if (!isObject(value)) {
    diagnostics.push(`${context} must be an object`);
    return undefined;
  }
  const id = value['id'];
  if (typeof id !== 'string' || !/^mi-[a-z0-9-]+$/.test(id)) {
    diagnostics.push(`${context}.id must match /^mi-[a-z0-9-]+$/`);
  }

  validateCaseEnums(diagnostics, context, value);
  validateCaseGeometry(diagnostics, context, value);

  const spanY = decimalString(diagnostics, `${context}.spanY`, value['spanY']);
  if (spanY !== undefined) {
    if (spanY <= 0) {
      diagnostics.push(`${context}.spanY must be positive`);
    } else if (spanY < MIN_SPAN_Y || spanY > MAX_SPAN_Y) {
      diagnostics.push(
        `${context}.spanY ${spanY} is outside the declared viewport envelope [${MIN_SPAN_Y}, ${MAX_SPAN_Y}]`,
      );
    }
  }

  validateCaseStrata(diagnostics, context, value);

  const rationale = value['rationale'];
  if (typeof rationale !== 'string' || rationale.trim().length === 0) {
    diagnostics.push(`${context}.rationale must be a non-empty string`);
  }

  return typeof id === 'string' ? id : undefined;
};

/** Returns one human-readable diagnostic per problem; an empty array means valid. */
export const validateCorpus = (value: unknown): readonly string[] => {
  const diagnostics: string[] = [];
  if (!isObject(value)) {
    return ['corpus must be a JSON object'];
  }

  if (value['schemaVersion'] !== CORPUS_SCHEMA_VERSION) {
    diagnostics.push(`schemaVersion must be ${CORPUS_SCHEMA_VERSION}`);
  }
  const baseline = decimalString(
    diagnostics,
    'magnificationBaseline',
    value['magnificationBaseline'],
  );
  if (baseline !== undefined && baseline !== DEFAULT_SPAN_Y) {
    diagnostics.push(`magnificationBaseline must equal ${DEFAULT_SPAN_Y}`);
  }

  const rasters = value['rasters'];
  if (!Array.isArray(rasters) || rasters.length === 0) {
    diagnostics.push('rasters must be a non-empty array');
  } else {
    const rasterIds = new Set<string>();
    let shippingCount = 0;
    rasters.forEach((raster, index) => {
      validateRaster(diagnostics, index, raster);
      if (isObject(raster) && typeof raster['id'] === 'string') {
        if (rasterIds.has(raster['id'])) diagnostics.push(`duplicate raster id "${raster['id']}"`);
        rasterIds.add(raster['id']);
      }
      if (isObject(raster) && raster['role'] === 'shipping') shippingCount += 1;
    });
    if (shippingCount !== 1) {
      diagnostics.push(`exactly one shipping raster is required, found ${shippingCount}`);
    }
  }

  const cases = value['cases'];
  if (!Array.isArray(cases) || cases.length === 0) {
    diagnostics.push('cases must be a non-empty array');
  } else {
    const caseIds = new Set<string>();
    const classes = new Set<CorpusClass>();
    const coveredStrata = new Set<CorpusStratum>();
    cases.forEach((entry, index) => {
      const id = validateCase(diagnostics, index, entry);
      if (id !== undefined) {
        if (caseIds.has(id)) diagnostics.push(`duplicate case id "${id}"`);
        caseIds.add(id);
      }
      if (isObject(entry) && CORPUS_CLASSES.includes(entry['class'] as CorpusClass)) {
        classes.add(entry['class'] as CorpusClass);
      }
      if (isObject(entry) && Array.isArray(entry['strata'])) {
        for (const tag of entry['strata']) {
          if (CORPUS_STRATA.includes(tag as CorpusStratum)) {
            coveredStrata.add(tag as CorpusStratum);
          }
        }
      }
    });
    for (const required of CORPUS_CLASSES) {
      if (!classes.has(required)) diagnostics.push(`no case covers class "${required}"`);
    }
    for (const required of CORPUS_STRATA) {
      if (!coveredStrata.has(required)) {
        diagnostics.push(`no case covers holdout stratum "${required}"`);
      }
    }
  }

  return diagnostics;
};
