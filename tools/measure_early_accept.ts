/// <reference types="node" />
/**
 * OFFLINE early-acceptance measurement (offline Node measurement, iteration
 * counts, not wall-clock; no binary64 error allowance eta; not a release
 * gate).
 *
 * Question: how much earlier than the production lag scan could the exact-disk
 * certified-acceptance condition of proof/IntMProof/CertifiedAcceptance.lean
 * (`existsUnique_primitive_of_reference_accepted_disk`, specialised to
 * cRef = c, Delta = 0, eta = 0) accept an attracting cycle?
 *
 * For an exact parameter c, a seed z0 (a critical-orbit point), a candidate
 * period p and a disk radius r, the specialised conditions are
 *
 *   e_0 = r,  e_{j+1} = 2 |z_j| e_j + e_j^2   (z_j = f^j(z0))
 *   R_j = |z_j| + e_j,   q = prod_{j<p} 2 R_j,   q < 1
 *   closure window:  |f^p(z0) - z0| <= r (1 - q)
 *   divisor window:  e_d + r < |f^d(z0) - z0|  for every proper divisor d of p
 *
 * and then the disk contains a unique attracting fixed point of f^p with
 * minimal period exactly p and |lambda| <= q. In the Lean statement eta is
 * added to the squared residual in the closure window and subtracted in the
 * divisor window, so the slack available to a future binary64 allowance is
 * measured here in squared units ("etaRoom").
 *
 * This tool never modifies the production classifier: it calls the frozen
 * `classifyInto` for the production answer and runs its own instrumented
 * critical-orbit iteration (bit-identical z -> z^2 + c arithmetic) for the
 * certification attempts.
 *
 * Run: npm run evidence:early-accept -- [--width 96] [--height 72] [--cases id,id]
 *      [--budget-mult 4] [--prefilter 0.01] [--r-floor 1e-12] [--out-dir dir]
 *      [--schedule every|geometric] [--date YYYY-MM-DD] [--no-write]
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, release, totalmem } from 'node:os';
import { argv, exit, stderr, stdout, version } from 'node:process';
import { gzipSync } from 'node:zlib';

import {
  classifyInto,
  createOrbitSample,
  createViewportTransform,
  ORBIT_EVIDENCE_CODE,
  OrbitScratch,
  resolveOrbitOptions,
  type OrbitSample,
} from '../src/domain';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const CORPUS_PATH = 'tools/benchmark/corpus.v1.json';

/**
 * Quality-profile budgets, mirrored from QUALITY_PROFILES in
 * src/ui/view-state.ts (systematic maxIterations / maxPeriod). Mirrored, not
 * imported, so the SSR bundle does not pull in UI code.
 */
const PROFILE_BUDGETS: Readonly<Record<string, { maxIterations: number; maxPeriod: number }>> = {
  Quick: { maxIterations: 256, maxPeriod: 16 },
  Balanced: { maxIterations: 512, maxPeriod: 32 },
  Detailed: { maxIterations: 1024, maxPeriod: 64 },
};

/** Multipliers applied to |f^p(z0) - z0| to form the radius ladder. */
const RESIDUAL_LADDER = [2, 4, 16, 64, 256] as const;
/** Absolute radii added to the ladder. */
const ABSOLUTE_LADDER = [1e-3, 1e-4] as const;
const RADIUS_CEILING = 0.1;

const LAMBDA_EDGES = [0, 0.5, 0.8, 0.9, 0.95, 0.99, 1] as const;
const LAMBDA_LABELS = [
  '[0,0.5)',
  '[0.5,0.8)',
  '[0.8,0.9)',
  '[0.9,0.95)',
  '[0.95,0.99)',
  '[0.99,1)',
] as const;
const PERIOD_GROUPS: readonly { label: string; lo: number; hi: number }[] = [
  { label: 'p1', lo: 1, hi: 1 },
  { label: 'p2', lo: 2, hi: 2 },
  { label: 'p3', lo: 3, hi: 3 },
  { label: 'p4', lo: 4, hi: 4 },
  { label: 'p5-8', lo: 5, hi: 8 },
  { label: 'p9-16', lo: 9, hi: 16 },
  { label: 'p17-32', lo: 17, hi: 32 },
  { label: 'p33-64', lo: 33, hi: 64 },
];

interface Options {
  readonly width: number;
  readonly height: number;
  readonly cases: readonly string[] | undefined;
  readonly budgetMult: number;
  readonly prefilter: number;
  readonly rFloor: number;
  readonly schedule: 'every' | 'geometric';
  readonly outDir: string | undefined;
  readonly date: string | undefined;
  readonly write: boolean;
}

const parseOptions = (args: readonly string[]): Options => {
  const values = new Map<string, string>();
  let write = true;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? '';
    if (arg === '--no-write') {
      write = false;
    } else if (arg.startsWith('--')) {
      values.set(arg.slice(2), args[index + 1] ?? '');
      index += 1;
    }
  }
  const number = (key: string, fallback: number): number => {
    const raw = values.get(key);
    const parsed = raw === undefined ? fallback : Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) throw new RangeError(`--${key} must be positive`);
    return parsed;
  };
  const caseList = values.get('cases');
  return {
    width: Math.trunc(number('width', 96)),
    height: Math.trunc(number('height', 72)),
    cases: caseList === undefined ? undefined : caseList.split(','),
    budgetMult: Math.trunc(number('budget-mult', 4)),
    prefilter: number('prefilter', 1e-2),
    rFloor: number('r-floor', 1e-12),
    schedule: values.get('schedule') === 'geometric' ? 'geometric' : 'every',
    outDir: values.get('out-dir'),
    date: values.get('date'),
    write,
  };
};

// ---------------------------------------------------------------------------
// Corpus
// ---------------------------------------------------------------------------

interface CorpusCase {
  readonly id: string;
  readonly profile: string;
  readonly center: { readonly re: string; readonly im: string };
  readonly spanY: string;
}

const loadCorpus = (): readonly CorpusCase[] => {
  const parsed = JSON.parse(readFileSync(CORPUS_PATH, 'utf8')) as { cases: CorpusCase[] };
  return parsed.cases;
};

// ---------------------------------------------------------------------------
// Statistics helpers
// ---------------------------------------------------------------------------

const quantile = (values: readonly number[], fraction: number): number => {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const low = sorted[lower] ?? Number.NaN;
  const high = sorted[upper] ?? Number.NaN;
  return low + (high - low) * (position - lower);
};

const round = (value: number, digits = 4): number => {
  if (!Number.isFinite(value)) return value;
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};

// ---------------------------------------------------------------------------
// Certification
// ---------------------------------------------------------------------------

interface Counters {
  attempts: number;
  radiusEvaluations: number;
  complexSteps: number;
  errorSteps: number;
}

const createCounters = (): Counters => ({
  attempts: 0,
  radiusEvaluations: 0,
  complexSteps: 0,
  errorSteps: 0,
});

interface Certificate {
  readonly period: number;
  readonly radius: number;
  readonly q: number;
  /** Squared-unit room for eta: min(closure window, divisor windows). */
  readonly etaRoom: number;
  /** Absolute closure slack r(1-q) - |f^p(z0) - z0|. */
  readonly closureSlack: number;
  /** |f^p(z0) - z0| / (r (1 - q)); < 1 for a certificate. */
  readonly closureRatio: number;
  /** Smallest dist_d - (e_d + r) over proper divisors (Infinity when none). */
  readonly divisorSlack: number;
  /** Largest (e_d + r) / dist_d over proper divisors (0 when none). */
  readonly divisorRatio: number;
}

interface CertWork {
  readonly walkRe: Float64Array;
  readonly walkIm: Float64Array;
  readonly error: Float64Array;
  readonly divisors: readonly (readonly number[])[];
}

const createCertWork = (maxPeriod: number): CertWork => ({
  walkRe: new Float64Array(maxPeriod + 1),
  walkIm: new Float64Array(maxPeriod + 1),
  error: new Float64Array(maxPeriod + 1),
  divisors: Array.from({ length: maxPeriod + 1 }, (_, period) =>
    Array.from({ length: Math.max(0, period - 1) }, (_, offset) => offset + 1).filter(
      (divisor) => period % divisor === 0,
    ),
  ),
});

const at = (array: Float64Array, index: number): number => array[index] ?? Number.NaN;

/**
 * Why a radius failed. q(r) is nondecreasing in r and the divisor reach
 * e_d + r is nondecreasing in r, so a 'q' or 'divisor' failure at r also
 * fails at every larger radius; a 'closure' failure may still pass at a
 * larger radius.
 */
type RadiusFailure = 'q' | 'closure' | 'divisor';

/** Certification conditions for one (walk, radius); the walk is in `work`. */
const evaluateRadius = (
  work: CertWork,
  period: number,
  radius: number,
  residual: number,
): Certificate | RadiusFailure => {
  const { walkRe, walkIm, error } = work;
  error[0] = radius;
  let q = 1;
  let e = radius;
  for (let step = 0; step < period; step += 1) {
    const modulus = Math.hypot(at(walkRe, step), at(walkIm, step));
    q *= 2 * (modulus + e);
    e = 2 * modulus * e + e * e;
    error[step + 1] = e;
    if (!Number.isFinite(e) || !Number.isFinite(q)) return 'q';
  }
  if (!(q < 1)) return 'q';
  const window = radius * (1 - q);
  if (!(residual <= window)) return 'closure';
  let divisorSlack = Number.POSITIVE_INFINITY;
  let divisorRatio = 0;
  let divisorEta = Number.POSITIVE_INFINITY;
  for (const divisor of work.divisors[period] ?? []) {
    const distance = Math.hypot(
      at(walkRe, divisor) - at(walkRe, 0),
      at(walkIm, divisor) - at(walkIm, 0),
    );
    const reach = at(error, divisor) + radius;
    if (!(reach < distance)) return 'divisor';
    divisorSlack = Math.min(divisorSlack, distance - reach);
    divisorRatio = Math.max(divisorRatio, reach / distance);
    divisorEta = Math.min(divisorEta, distance * distance - reach * reach);
  }
  const closureEta = window * window - residual * residual;
  return {
    period,
    radius,
    q,
    etaRoom: Math.min(closureEta, divisorEta),
    closureSlack: window - residual,
    closureRatio: window === 0 ? 0 : residual / window,
    divisorSlack,
    divisorRatio,
  };
};

const radiusLadder = (residual: number, floor: number): number[] => {
  const raw = [...RESIDUAL_LADDER.map((factor) => residual * factor), ...ABSOLUTE_LADDER];
  const clipped = raw.map((radius) => Math.min(RADIUS_CEILING, Math.max(floor, radius)));
  return [...new Set(clipped)].sort((left, right) => left - right);
};

interface AttemptResult {
  readonly selected: Certificate | undefined;
  /** Best etaRoom over every certifying ladder radius (diagnostic, uncounted). */
  readonly bestEtaRoom: number;
}

/**
 * One certification attempt at seed z0 = (zRe, zIm) for candidate `period`.
 * The radii are tried in ascending order and the first certifying radius is
 * selected (that is the counted cost); the remaining radii are evaluated
 * uncounted only to report the best available eta room.
 */
const attemptPeriod = (
  work: CertWork,
  zRe: number,
  zIm: number,
  cRe: number,
  cIm: number,
  period: number,
  rFloor: number,
  counters: Counters,
): AttemptResult => {
  counters.attempts += 1;
  const { walkRe, walkIm } = work;
  walkRe[0] = zRe;
  walkIm[0] = zIm;
  for (let step = 0; step < period; step += 1) {
    const re = at(walkRe, step);
    const im = at(walkIm, step);
    walkRe[step + 1] = re * re - im * im + cRe;
    walkIm[step + 1] = 2 * re * im + cIm;
  }
  counters.complexSteps += period;
  const residual = Math.hypot(at(walkRe, period) - zRe, at(walkIm, period) - zIm);
  const none: AttemptResult = { selected: undefined, bestEtaRoom: Number.NaN };
  if (!Number.isFinite(residual)) return none;
  // Exact radius-independent rejection: R_j >= |z_j|, so q(r) >= prod 2|z_j|
  // (the orbit's own multiplier bound). One p-step pass, counted.
  let floorQ = 1;
  for (let step = 0; step < period; step += 1) {
    floorQ *= 2 * Math.hypot(at(walkRe, step), at(walkIm, step));
  }
  counters.errorSteps += period;
  if (!(floorQ < 1)) return none;
  let selected: Certificate | undefined;
  let bestEtaRoom = Number.NEGATIVE_INFINITY;
  for (const radius of radiusLadder(residual, rFloor)) {
    if (selected === undefined) {
      counters.radiusEvaluations += 1;
      counters.errorSteps += period;
    }
    const outcome = evaluateRadius(work, period, radius, residual);
    if (typeof outcome === 'string') {
      if (outcome !== 'closure') break;
      continue;
    }
    selected ??= outcome;
    bestEtaRoom = Math.max(bestEtaRoom, outcome.etaRoom);
  }
  return { selected, bestEtaRoom };
};

// ---------------------------------------------------------------------------
// Per-pixel measurement
// ---------------------------------------------------------------------------

const ANALYTIC_CODES: readonly number[] = [
  ORBIT_EVIDENCE_CODE.analyticMainCardioid,
  ORBIT_EVIDENCE_CODE.analyticPeriod2Bulb,
];

type Outcome = 'analytic' | 'escaped' | 'accepted' | 'unresolved';

interface PixelRecord {
  readonly x: number;
  readonly y: number;
  readonly cRe: number;
  readonly cIm: number;
  readonly outcome: Outcome;
  /** Production iterations (0 for analytic; maxIterations for unresolved). */
  readonly prodIterations: number;
  readonly prodPeriod: number;
  readonly prodLambda: number;
  /** First certified iteration within the extended budget (0 = none). */
  readonly certIteration: number;
  readonly cert: Certificate | undefined;
  readonly bestEtaRoom: number;
  /** Counted cost of a combined scheme: attempts up to min(certIteration, prodIterations). */
  readonly costAttempts: number;
  readonly costRadiusEvaluations: number;
  readonly costOps: number;
  /** Escape iteration of the instrumented orbit within the extended budget (0 = none). */
  readonly escapeIteration: number;
  /** Production re-run at the extended budget, unresolved pixels only. */
  readonly extStatus: number;
  readonly extPeriod: number;
  readonly extIterations: number;
}

interface PixelContext {
  readonly maxIterations: number;
  readonly maxPeriod: number;
  readonly extendedIterations: number;
  readonly options: ReturnType<typeof resolveOrbitOptions>;
  readonly extendedOptions: ReturnType<typeof resolveOrbitOptions>;
  readonly scratch: OrbitScratch;
  readonly sample: OrbitSample;
  readonly extendedSample: OrbitSample;
  readonly orbitRe: Float64Array;
  readonly orbitIm: Float64Array;
  readonly work: CertWork;
  readonly prefilterSquared: number;
  readonly rFloor: number;
  /** attemptAt[n] = 1 when the schedule attempts certification at iteration n. */
  readonly attemptAt: Uint8Array;
}

interface OrbitScanResult {
  certIteration: number;
  cert: Certificate | undefined;
  bestEtaRoom: number;
  escapeIteration: number;
  costAttempts: number;
  costRadiusEvaluations: number;
  costOps: number;
}

/** 'every': all n; 'geometric': 4 attempts per octave starting at n = 16. */
const buildSchedule = (kind: Options['schedule'], limit: number): Uint8Array => {
  const flags = new Uint8Array(limit + 1);
  if (kind === 'every') return flags.fill(1);
  let n = 16;
  while (n <= limit) {
    flags[n] = 1;
    n += Math.max(1, 2 ** (Math.floor(Math.log2(n)) - 2));
  }
  return flags;
};

const opsOf = (counters: Counters): number => counters.complexSteps + counters.errorSteps;

/** Scans iteration n for the smallest certifying period; undefined if none. */
const attemptIteration = (
  context: PixelContext,
  cRe: number,
  cIm: number,
  n: number,
  counters: Counters,
): AttemptResult | undefined => {
  const zRe = at(context.orbitRe, n);
  const zIm = at(context.orbitIm, n);
  const largest = Math.min(context.maxPeriod, n - 1);
  for (let period = 1; period <= largest; period += 1) {
    const dRe = zRe - at(context.orbitRe, n - period);
    const dIm = zIm - at(context.orbitIm, n - period);
    if (dRe * dRe + dIm * dIm >= context.prefilterSquared) continue;
    const result = attemptPeriod(
      context.work,
      zRe,
      zIm,
      cRe,
      cIm,
      period,
      context.rFloor,
      counters,
    );
    if (result.selected !== undefined) return result;
  }
  return undefined;
};

const scanOrbit = (
  context: PixelContext,
  cRe: number,
  cIm: number,
  productionLimit: number,
): OrbitScanResult => {
  const counters = createCounters();
  const result: OrbitScanResult = {
    certIteration: 0,
    cert: undefined,
    bestEtaRoom: Number.NaN,
    escapeIteration: 0,
    costAttempts: -1,
    costRadiusEvaluations: -1,
    costOps: -1,
  };
  const snapshot = (): void => {
    result.costAttempts = counters.attempts;
    result.costRadiusEvaluations = counters.radiusEvaluations;
    result.costOps = opsOf(counters);
  };
  let zRe = 0;
  let zIm = 0;
  for (let n = 1; n <= context.extendedIterations; n += 1) {
    const nextRe = zRe * zRe - zIm * zIm + cRe;
    zIm = 2 * zRe * zIm + cIm;
    zRe = nextRe;
    if (zRe * zRe + zIm * zIm > 4) {
      result.escapeIteration = n;
      break;
    }
    context.orbitRe[n] = zRe;
    context.orbitIm[n] = zIm;
    if (result.certIteration === 0 && context.attemptAt[n] === 1) {
      const found = attemptIteration(context, cRe, cIm, n, counters);
      if (found?.selected !== undefined) {
        result.certIteration = n;
        result.cert = found.selected;
        result.bestEtaRoom = found.bestEtaRoom;
        if (n <= productionLimit) snapshot();
      }
    }
    // Cost of the combined scheme stops at production's own stopping point.
    if (n === productionLimit && result.costOps < 0) snapshot();
  }
  if (result.costOps < 0) snapshot();
  return result;
};

const measurePixel = (
  context: PixelContext,
  x: number,
  y: number,
  cRe: number,
  cIm: number,
): PixelRecord => {
  const sample = context.sample;
  classifyInto(cRe, cIm, context.options, context.scratch, sample);
  const base = {
    x,
    y,
    cRe,
    cIm,
    prodPeriod: sample.period,
    prodLambda: sample.multiplierMagnitude,
  };
  const empty = {
    certIteration: 0,
    cert: undefined,
    bestEtaRoom: Number.NaN,
    costAttempts: 0,
    costRadiusEvaluations: 0,
    costOps: 0,
    escapeIteration: 0,
    extStatus: -1,
    extPeriod: 0,
    extIterations: 0,
  };
  if (sample.status === 2 && ANALYTIC_CODES.includes(sample.evidence)) {
    return { ...base, ...empty, outcome: 'analytic', prodIterations: 0 };
  }
  const outcome: Outcome =
    sample.status === 1 ? 'escaped' : sample.status === 2 ? 'accepted' : 'unresolved';
  const limit = sample.status === 0 ? context.maxIterations : sample.iterations;
  const scan = scanOrbit(context, cRe, cIm, limit);
  let extStatus = -1;
  let extPeriod = 0;
  let extIterations = 0;
  if (outcome === 'unresolved') {
    classifyInto(cRe, cIm, context.extendedOptions, context.scratch, context.extendedSample);
    extStatus = context.extendedSample.status;
    extPeriod = context.extendedSample.period;
    extIterations = context.extendedSample.iterations;
  }
  return {
    ...base,
    outcome,
    prodIterations: limit,
    certIteration: scan.certIteration,
    cert: scan.cert,
    bestEtaRoom: scan.bestEtaRoom,
    costAttempts: scan.costAttempts,
    costRadiusEvaluations: scan.costRadiusEvaluations,
    costOps: scan.costOps,
    escapeIteration: scan.escapeIteration,
    extStatus,
    extPeriod,
    extIterations,
  };
};

// ---------------------------------------------------------------------------
// Disagreements
// ---------------------------------------------------------------------------

type DisagreementKind =
  | 'period-mismatch'
  | 'cert-on-production-escaped'
  | 'cert-then-escapes'
  | 'period-mismatch-vs-extended-production'
  | 'cert-on-extended-escaped'
  | 'escape-iteration-mismatch';

interface Disagreement {
  readonly caseId: string;
  readonly kind: DisagreementKind;
  readonly x: number;
  readonly y: number;
  readonly c: { readonly re: number; readonly im: number };
  readonly certIteration: number;
  readonly z0: { readonly re: number; readonly im: number } | undefined;
  readonly period: number | undefined;
  readonly radius: number | undefined;
  readonly q: number | undefined;
  readonly productionPeriod: number;
  readonly productionIterations: number;
  readonly detail: string;
}

const orbitPoint = (c: { re: number; im: number }, n: number): { re: number; im: number } => {
  let re = 0;
  let im = 0;
  for (let step = 0; step < n; step += 1) {
    const next = re * re - im * im + c.re;
    im = 2 * re * im + c.im;
    re = next;
  }
  return { re, im };
};

const disagreementKinds = (pixel: PixelRecord): [DisagreementKind, string][] => {
  const found: [DisagreementKind, string][] = [];
  const cert = pixel.cert;
  if (cert !== undefined) {
    if (pixel.outcome === 'accepted' && cert.period !== pixel.prodPeriod) {
      found.push([
        'period-mismatch',
        `certified p=${cert.period} vs production accepted p=${pixel.prodPeriod}`,
      ]);
    }
    if (pixel.outcome === 'escaped') {
      found.push(['cert-on-production-escaped', 'production classifies this pixel as escaped']);
    }
    if (pixel.escapeIteration > 0 && pixel.outcome !== 'escaped') {
      found.push([
        'cert-then-escapes',
        `instrumented orbit escapes at n=${pixel.escapeIteration} after certification`,
      ]);
    }
    if (pixel.extStatus === 2 && cert.period !== pixel.extPeriod) {
      found.push([
        'period-mismatch-vs-extended-production',
        `certified p=${cert.period} vs extended-budget production p=${pixel.extPeriod}`,
      ]);
    }
    if (pixel.extStatus === 1) {
      found.push([
        'cert-on-extended-escaped',
        `extended-budget production escapes at n=${pixel.extIterations}`,
      ]);
    }
  }
  if (
    pixel.outcome === 'escaped' &&
    pixel.escapeIteration !== 0 &&
    pixel.escapeIteration !== pixel.prodIterations
  ) {
    found.push([
      'escape-iteration-mismatch',
      `instrumented n=${pixel.escapeIteration} vs production n=${pixel.prodIterations}`,
    ]);
  }
  return found;
};

const collectDisagreements = (caseId: string, pixel: PixelRecord): Disagreement[] =>
  disagreementKinds(pixel).map(([kind, detail]) => ({
    caseId,
    kind,
    x: pixel.x,
    y: pixel.y,
    c: { re: pixel.cRe, im: pixel.cIm },
    certIteration: pixel.certIteration,
    z0:
      pixel.cert === undefined
        ? undefined
        : orbitPoint({ re: pixel.cRe, im: pixel.cIm }, pixel.certIteration),
    period: pixel.cert?.period,
    radius: pixel.cert?.radius,
    q: pixel.cert?.q,
    productionPeriod: pixel.prodPeriod,
    productionIterations: pixel.prodIterations,
    detail,
  }));

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

const lambdaBucket = (pixel: PixelRecord): number => {
  let lambda = Number.NaN;
  if (pixel.outcome === 'accepted') lambda = pixel.prodLambda;
  else if (pixel.outcome === 'unresolved' && pixel.cert !== undefined) lambda = pixel.cert.q;
  if (!(lambda >= 0 && lambda < 1)) return -1;
  for (let index = 0; index < LAMBDA_LABELS.length; index += 1) {
    if (lambda < (LAMBDA_EDGES[index + 1] ?? 1)) return index;
  }
  return -1;
};

const periodOf = (pixel: PixelRecord): number =>
  pixel.outcome === 'accepted' ? pixel.prodPeriod : (pixel.cert?.period ?? 0);

interface Tagged {
  readonly caseId: string;
  readonly pixel: PixelRecord;
  readonly budget: number;
}

interface GroupSummary {
  readonly pixels: number;
  readonly analytic: number;
  readonly escaped: number;
  readonly accepted: number;
  readonly acceptedCertified: number;
  readonly acceptedCertEarlier: number;
  readonly acceptedCertSame: number;
  readonly acceptedCertLater: number;
  readonly acceptedNeverCertified: number;
  readonly acceptedCertWithinBudget: number;
  readonly deltaMedian: number;
  readonly deltaP90: number;
  readonly ratioMedian: number;
  readonly ratioP90: number;
  readonly unresolved: number;
  readonly unresolvedCertWithinBudget: number;
  readonly unresolvedCertWithinExtended: number;
  readonly unresolvedStillUnresolved: number;
  readonly unresolvedLateEscape: number;
  readonly unresolvedExtendedProductionAccepts: number;
  readonly productionIterations: number;
  readonly grossSavedIterations: number;
  readonly attemptOps: number;
  readonly attempts: number;
  readonly radiusEvaluations: number;
  readonly netSavedIterations: number;
  readonly netSavedPercent: number;
  /** Net saving when one production iteration costs W ops (W = 8, 32). */
  readonly netSavedPercentW8: number;
  readonly netSavedPercentW32: number;
  readonly grossSavedPercent: number;
  readonly attemptOpsPercent: number;
}

const summarizeTagged = (tagged: readonly Tagged[]): GroupSummary => {
  const counts = {
    analytic: 0,
    escaped: 0,
    accepted: 0,
    certified: 0,
    earlier: 0,
    same: 0,
    later: 0,
    never: 0,
    withinBudget: 0,
    unresolved: 0,
    convBudget: 0,
    convExtended: 0,
    stillUnresolved: 0,
    lateEscape: 0,
    extAccepts: 0,
  };
  const deltas: number[] = [];
  const ratios: number[] = [];
  let productionIterations = 0;
  let gross = 0;
  let attemptOps = 0;
  let attempts = 0;
  let radiusEvaluations = 0;
  for (const { pixel, budget } of tagged) {
    if (pixel.outcome === 'analytic') {
      counts.analytic += 1;
      continue;
    }
    productionIterations += pixel.prodIterations;
    attemptOps += Math.max(0, pixel.costOps);
    attempts += Math.max(0, pixel.costAttempts);
    radiusEvaluations += Math.max(0, pixel.costRadiusEvaluations);
    const within = pixel.certIteration > 0 && pixel.certIteration <= budget;
    if (within) gross += Math.max(0, pixel.prodIterations - pixel.certIteration);
    if (pixel.outcome === 'escaped') counts.escaped += 1;
    if (pixel.outcome === 'accepted') {
      counts.accepted += 1;
      if (pixel.certIteration === 0) counts.never += 1;
      else {
        counts.certified += 1;
        if (within) counts.withinBudget += 1;
        const delta = pixel.prodIterations - pixel.certIteration;
        deltas.push(delta);
        ratios.push(pixel.certIteration / pixel.prodIterations);
        if (delta > 0) counts.earlier += 1;
        else if (delta === 0) counts.same += 1;
        else counts.later += 1;
      }
    }
    if (pixel.outcome === 'unresolved') {
      counts.unresolved += 1;
      if (pixel.certIteration > 0) {
        counts.convExtended += 1;
        if (within) counts.convBudget += 1;
      } else {
        counts.stillUnresolved += 1;
        if (pixel.extStatus === 1) counts.lateEscape += 1;
      }
      if (pixel.extStatus === 2) counts.extAccepts += 1;
    }
  }
  const net = gross - attemptOps;
  const weighted = (weight: number): number =>
    productionIterations === 0
      ? 0
      : round((100 * (gross * weight - attemptOps)) / (productionIterations * weight), 3);
  const percent = (value: number): number =>
    productionIterations === 0 ? 0 : round((100 * value) / productionIterations, 3);
  return {
    pixels: tagged.length,
    analytic: counts.analytic,
    escaped: counts.escaped,
    accepted: counts.accepted,
    acceptedCertified: counts.certified,
    acceptedCertEarlier: counts.earlier,
    acceptedCertSame: counts.same,
    acceptedCertLater: counts.later,
    acceptedNeverCertified: counts.never,
    acceptedCertWithinBudget: counts.withinBudget,
    deltaMedian: quantile(deltas, 0.5),
    deltaP90: quantile(deltas, 0.9),
    ratioMedian: round(quantile(ratios, 0.5)),
    ratioP90: round(quantile(ratios, 0.9)),
    unresolved: counts.unresolved,
    unresolvedCertWithinBudget: counts.convBudget,
    unresolvedCertWithinExtended: counts.convExtended,
    unresolvedStillUnresolved: counts.stillUnresolved,
    unresolvedLateEscape: counts.lateEscape,
    unresolvedExtendedProductionAccepts: counts.extAccepts,
    productionIterations,
    grossSavedIterations: gross,
    attemptOps,
    attempts,
    radiusEvaluations,
    netSavedIterations: net,
    netSavedPercent: percent(net),
    netSavedPercentW8: weighted(8),
    netSavedPercentW32: weighted(32),
    grossSavedPercent: percent(gross),
    attemptOpsPercent: percent(attemptOps),
  };
};

interface CaseResult {
  readonly id: string;
  readonly profile: string;
  readonly maxIterations: number;
  readonly maxPeriod: number;
  readonly extendedIterations: number;
  readonly width: number;
  readonly height: number;
  readonly center: { readonly re: string; readonly im: string };
  readonly spanY: string;
  readonly seconds: number;
  readonly pixels: readonly PixelRecord[];
}

// ---------------------------------------------------------------------------
// Margins
// ---------------------------------------------------------------------------

interface MarginExtreme {
  readonly caseId: string;
  readonly c: { readonly re: number; readonly im: number };
  readonly certIteration: number;
  readonly period: number;
  readonly radius: number;
  readonly q: number;
  readonly value: number;
}

const extreme = (
  tagged: readonly Tagged[],
  pick: (certificate: Certificate, pixel: PixelRecord) => number,
  direction: 'min' | 'max',
): MarginExtreme | undefined => {
  let best: MarginExtreme | undefined;
  for (const { caseId, pixel } of tagged) {
    if (pixel.cert === undefined) continue;
    const value = pick(pixel.cert, pixel);
    if (!Number.isFinite(value)) continue;
    if (best === undefined || (direction === 'min' ? value < best.value : value > best.value)) {
      best = {
        caseId,
        c: { re: pixel.cRe, im: pixel.cIm },
        certIteration: pixel.certIteration,
        period: pixel.cert.period,
        radius: pixel.cert.radius,
        q: pixel.cert.q,
        value,
      };
    }
  }
  return best;
};

const distribution = (
  tagged: readonly Tagged[],
  pick: (certificate: Certificate, pixel: PixelRecord) => number,
): Record<string, number> => {
  const values = tagged.flatMap(({ pixel }) =>
    pixel.cert === undefined ? [] : [pick(pixel.cert, pixel)],
  );
  return {
    count: values.length,
    min: quantile(values, 0),
    p01: quantile(values, 0.01),
    p10: quantile(values, 0.1),
    median: quantile(values, 0.5),
    max: quantile(values, 1),
  };
};

const belowShare = (
  tagged: readonly Tagged[],
  pick: (certificate: Certificate, pixel: PixelRecord) => number,
  threshold: number,
): number => {
  const values = tagged.flatMap(({ pixel }) =>
    pixel.cert === undefined ? [] : [pick(pixel.cert, pixel)],
  );
  return values.length === 0
    ? 0
    : values.filter((value) => value < threshold).length / values.length;
};

const summarizeMargins = (tagged: readonly Tagged[]): Record<string, unknown> => {
  const selectedEta = (certificate: Certificate): number => certificate.etaRoom;
  const bestEta = (_certificate: Certificate, pixel: PixelRecord): number => pixel.bestEtaRoom;
  const smallestRadius = (certificate: Certificate): number => certificate.radius;
  return {
    note: 'etaRoom is in squared-residual units: the largest eta the Lean windows tolerate (closure: (r(1-q))^2 - res^2; divisor: dist^2 - (e_d+r)^2; min of the two). "selected" uses the first (smallest) certifying ladder radius; "best" is the best over all certifying ladder radii.',
    etaRoomSelected: distribution(tagged, selectedEta),
    etaRoomBest: distribution(tagged, bestEta),
    etaRoomSelectedBelow: {
      '1e-20': belowShare(tagged, selectedEta, 1e-20),
      '1e-24': belowShare(tagged, selectedEta, 1e-24),
      '1e-28': belowShare(tagged, selectedEta, 1e-28),
      '1e-30': belowShare(tagged, selectedEta, 1e-30),
    },
    etaRoomBestBelow: {
      '1e-20': belowShare(tagged, bestEta, 1e-20),
      '1e-24': belowShare(tagged, bestEta, 1e-24),
      '1e-28': belowShare(tagged, bestEta, 1e-28),
      '1e-30': belowShare(tagged, bestEta, 1e-30),
    },
    radiusUsed: distribution(tagged, smallestRadius),
    smallestClosureSlackAbsolute: extreme(tagged, (certificate) => certificate.closureSlack, 'min'),
    largestClosureRatio: extreme(tagged, (certificate) => certificate.closureRatio, 'max'),
    smallestDivisorSlackAbsolute: extreme(tagged, (certificate) => certificate.divisorSlack, 'min'),
    largestDivisorRatio: extreme(tagged, (certificate) => certificate.divisorRatio, 'max'),
    smallestEtaRoomSelected: extreme(tagged, (certificate) => certificate.etaRoom, 'min'),
    smallestEtaRoomBest: extreme(tagged, bestEta, 'min'),
    smallestRadius: extreme(tagged, smallestRadius, 'min'),
  };
};

// ---------------------------------------------------------------------------
// Measurement driver
// ---------------------------------------------------------------------------

const measureCase = (corpusCase: CorpusCase, options: Options): CaseResult => {
  const budget = PROFILE_BUDGETS[corpusCase.profile];
  if (budget === undefined) throw new RangeError(`unknown profile ${corpusCase.profile}`);
  const extendedIterations = budget.maxIterations * options.budgetMult;
  const resolved = resolveOrbitOptions({ ...budget });
  const extendedOptions = resolveOrbitOptions({ ...budget, maxIterations: extendedIterations });
  const viewport = {
    center: { re: Number(corpusCase.center.re), im: Number(corpusCase.center.im) },
    spanY: Number(corpusCase.spanY),
  };
  const transform = createViewportTransform(viewport, {
    width: options.width,
    height: options.height,
  });
  const context: PixelContext = {
    maxIterations: budget.maxIterations,
    maxPeriod: budget.maxPeriod,
    extendedIterations,
    options: resolved,
    extendedOptions,
    scratch: new OrbitScratch(budget.maxPeriod),
    sample: createOrbitSample(),
    extendedSample: createOrbitSample(),
    orbitRe: new Float64Array(extendedIterations + 1),
    orbitIm: new Float64Array(extendedIterations + 1),
    work: createCertWork(budget.maxPeriod),
    prefilterSquared: options.prefilter * options.prefilter,
    rFloor: options.rFloor,
    attemptAt: buildSchedule(options.schedule, extendedIterations),
  };
  const started = performance.now();
  const pixels: PixelRecord[] = [];
  for (let y = 0; y < options.height; y += 1) {
    for (let x = 0; x < options.width; x += 1) {
      const c = transform.pixelToComplex(x, y);
      pixels.push(measurePixel(context, x, y, c.re, c.im));
    }
  }
  return {
    id: corpusCase.id,
    profile: corpusCase.profile,
    maxIterations: budget.maxIterations,
    maxPeriod: budget.maxPeriod,
    extendedIterations,
    width: options.width,
    height: options.height,
    center: corpusCase.center,
    spanY: corpusCase.spanY,
    seconds: (performance.now() - started) / 1000,
    pixels,
  };
};

const tagCase = (result: CaseResult): Tagged[] =>
  result.pixels.map((pixel) => ({
    caseId: result.id,
    pixel,
    budget: result.maxIterations,
  }));

const bucketTables = (
  tagged: readonly Tagged[],
): { byLambda: Record<string, GroupSummary>; byPeriod: Record<string, GroupSummary> } => {
  const byLambda: Record<string, GroupSummary> = {};
  LAMBDA_LABELS.forEach((label, index) => {
    byLambda[label] = summarizeTagged(tagged.filter(({ pixel }) => lambdaBucket(pixel) === index));
  });
  byLambda['none (escaped / unresolved-uncertified)'] = summarizeTagged(
    tagged.filter(({ pixel }) => pixel.outcome !== 'analytic' && lambdaBucket(pixel) < 0),
  );
  const byPeriod: Record<string, GroupSummary> = {};
  for (const group of PERIOD_GROUPS) {
    byPeriod[group.label] = summarizeTagged(
      tagged.filter(({ pixel }) => {
        const period = periodOf(pixel);
        return period >= group.lo && period <= group.hi;
      }),
    );
  }
  return { byLambda, byPeriod };
};

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

const git = (args: readonly string[]): string => {
  try {
    return execFileSync('git', [...args], { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
};

const fmt = (value: number, digits = 1): string =>
  Number.isNaN(value) ? 'n/a' : value.toFixed(digits);

const sci = (value: number | undefined): string =>
  value === undefined || !Number.isFinite(value) ? 'n/a' : value.toExponential(2);

const summaryRow = (label: string, g: GroupSummary): string =>
  `| ${label} | ${g.accepted} | ${g.acceptedCertified} | ${g.acceptedCertEarlier}/${g.acceptedCertSame}/${g.acceptedCertLater} | ${g.acceptedNeverCertified} | ${fmt(g.deltaMedian)} / ${fmt(g.deltaP90)} | ${fmt(g.ratioMedian, 3)} / ${fmt(g.ratioP90, 3)} | ${g.unresolved} | ${g.unresolvedCertWithinBudget} | ${g.unresolvedCertWithinExtended} | ${g.unresolvedLateEscape} |`;

const requireGroup = (groups: Record<string, GroupSummary>, id: string): GroupSummary => {
  const group = groups[id];
  if (group === undefined) throw new RangeError(`missing summary for ${id}`);
  return group;
};

const SUMMARY_HEADER =
  '| group | prod accepted | also certified | cert earlier/same/later | never certified | n_prod-n_cert median / p90 | n_cert/n_prod median / p90 | prod unresolved | conv <= budget | conv <= ext. budget | late escape |\n|---|---|---|---|---|---|---|---|---|---|---|';

const savingsRow = (label: string, g: GroupSummary): string =>
  `| ${label} | ${g.productionIterations} | ${g.grossSavedIterations} (${fmt(g.grossSavedPercent, 2)}%) | ${g.attempts} / ${g.radiusEvaluations} | ${g.attemptOps} (${fmt(g.attemptOpsPercent, 2)}%) | ${g.netSavedIterations} (${fmt(g.netSavedPercent, 2)}%) | ${fmt(g.netSavedPercentW8, 2)}% / ${fmt(g.netSavedPercentW32, 2)}% |`;

const SAVINGS_HEADER =
  '| group | production iterations | gross saved iterations | period attempts / radius evals | attempt cost (ops) | net saved (1 op/iter) | net % if 1 prod iter = 8 / 32 ops |\n|---|---|---|---|---|---|---|';

interface Report {
  readonly options: Options;
  readonly cases: readonly CaseResult[];
  readonly perCase: Record<string, GroupSummary>;
  readonly overall: GroupSummary;
  readonly tables: ReturnType<typeof bucketTables>;
  readonly margins: Record<string, unknown>;
  readonly disagreements: readonly Disagreement[];
  readonly seconds: number;
}

const kindCounts = (disagreements: readonly Disagreement[]): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const entry of disagreements) counts[entry.kind] = (counts[entry.kind] ?? 0) + 1;
  return counts;
};

const renderDisagreements = (disagreements: readonly Disagreement[]): string => {
  if (disagreements.length === 0) return 'None.\n';
  const lines = [
    `Counts by kind: ${JSON.stringify(kindCounts(disagreements))}`,
    '',
    '| case | kind | c | n_cert | z0 | p | r | q | prod p | detail |',
    '|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (const entry of disagreements.slice(0, 60)) {
    const z0 = entry.z0 === undefined ? 'n/a' : `${sci(entry.z0.re)}, ${sci(entry.z0.im)}`;
    lines.push(
      `| ${entry.caseId} | ${entry.kind} | ${entry.c.re}, ${entry.c.im} | ${entry.certIteration} | ${z0} | ${entry.period ?? 'n/a'} | ${sci(entry.radius)} | ${fmt(entry.q ?? Number.NaN, 4)} | ${entry.productionPeriod} | ${entry.detail} |`,
    );
  }
  if (disagreements.length > 60)
    lines.push('', `(first 60 of ${disagreements.length}; all in results.json)`);
  return `${lines.join('\n')}\n`;
};

const marginLine = (label: string, entry: unknown): string => {
  const e = entry as MarginExtreme | undefined;
  if (e === undefined) return `- ${label}: n/a`;
  return `- ${label}: ${sci(e.value)} (${e.caseId}, c = ${e.c.re}, ${e.c.im}; n_cert = ${e.certIteration}, p = ${e.period}, r = ${sci(e.radius)}, q = ${fmt(e.q, 4)})`;
};

const renderMargins = (margins: Record<string, unknown>): string => {
  const selected = margins['etaRoomSelected'] as Record<string, number>;
  const best = margins['etaRoomBest'] as Record<string, number>;
  const below = margins['etaRoomSelectedBelow'] as Record<string, number>;
  const bestBelow = margins['etaRoomBestBelow'] as Record<string, number>;
  const dist = (name: string, d: Record<string, number>): string =>
    `- ${name}: min ${sci(d['min'])}, p01 ${sci(d['p01'])}, p10 ${sci(d['p10'])}, median ${sci(d['median'])}, max ${sci(d['max'])} (n = ${d['count']})`;
  return [
    dist('etaRoom, first-success radius (squared units)', selected),
    dist('etaRoom, best certifying radius on the ladder (squared units)', best),
    `- Fraction of certified pixels with selected etaRoom below 1e-20 / 1e-24 / 1e-28 / 1e-30: ${['1e-20', '1e-24', '1e-28', '1e-30'].map((k) => fmt(100 * (below[k] ?? 0), 2) + '%').join(' / ')}`,
    `- Same for best-radius etaRoom: ${['1e-20', '1e-24', '1e-28', '1e-30'].map((k) => fmt(100 * (bestBelow[k] ?? 0), 2) + '%').join(' / ')}`,
    marginLine('smallest selected etaRoom', margins['smallestEtaRoomSelected']),
    marginLine('smallest best-radius etaRoom', margins['smallestEtaRoomBest']),
    marginLine(
      'smallest absolute closure slack r(1-q) - res',
      margins['smallestClosureSlackAbsolute'],
    ),
    marginLine('largest closure ratio res / (r(1-q))', margins['largestClosureRatio']),
    marginLine(
      'smallest absolute divisor slack dist_d - (e_d + r)',
      margins['smallestDivisorSlackAbsolute'],
    ),
    marginLine('largest divisor ratio (e_d + r) / dist_d', margins['largestDivisorRatio']),
    marginLine('smallest radius used', margins['smallestRadius']),
  ].join('\n');
};

interface Provenance {
  readonly date: string;
  readonly commit: string;
  readonly branch: string;
  readonly dirty: boolean;
  readonly command: string;
  readonly node: string;
  readonly platform: string;
  readonly cpu: string;
  readonly totalMemoryMiB: number;
}

const renderSummary = (report: Report, provenance: Provenance): string => {
  const { options, overall, tables } = report;
  const lines: string[] = [
    '# Early certified-acceptance measurement',
    '',
    '> Offline Node measurement. Iteration counts, not wall-clock. No binary64 error',
    '> allowance eta (eta = 0). Not a release gate. Approximate where stated below.',
    '',
    `- Date: ${provenance.date}; commit \`${provenance.commit}\` on \`${provenance.branch}\`${provenance.dirty ? ' (working tree not clean: includes this tool, its package.json script and tsconfig.tools.json entry, and possibly unrelated changes)' : ''}`,
    `- Command: \`${provenance.command}\``,
    `- Environment: Node ${provenance.node}, ${provenance.platform}, ${provenance.cpu}, ${provenance.totalMemoryMiB} MiB RAM`,
    `- Samples: ${report.cases.length} corpus cases x ${options.width}x${options.height} pixel-center raster = ${overall.pixels} pixels (${overall.analytic} analytic fast-path pixels have 0 production iterations and are excluded from certification)`,
    `- Runtime: ${fmt(report.seconds, 1)} s total (single process, includes the production re-runs and extended scans; informational only)`,
    `- Budgets: each case uses its corpus profile (Quick 256/16, Balanced 512/32, Detailed 1024/64 for maxIterations/maxPeriod); the extended budget is ${options.budgetMult}x maxIterations.`,
    `- Certification: prefilter |z_n - z_(n-p)| < ${options.prefilter}; radius ladder r in {2,4,16,64,256} x |f^p(z0)-z0| and {1e-3, 1e-4}, floored at ${sci(options.rFloor)} and clipped to <= ${RADIUS_CEILING}; tried in ascending order (stopping at a 'q' or divisor failure, which is monotone in r), first success taken; smallest p first; an exact radius-independent rejection q >= prod 2|z_j| >= 1 is applied first (counted); attempt schedule: ${options.schedule === 'every' ? 'every iteration n' : 'geometric, 4 attempts per octave from n = 16'}; z0 = z_n; no warmup; n - p >= 1.`,
    '',
    '## Approximations and caveats',
    '',
    '- eta = 0: exact-real arithmetic is assumed for the certification inequalities, evaluated in binary64. The radius floor (`--r-floor`) keeps r well above binary64 resolution; the etaRoom figures below say how much slack a real eta would have.',
    '- Cost unit: one op = one complex z^2+c step (the p-step lookahead walk, shared by all radii at an (n, p) attempt) or one real error-recursion step (e_j, R_j, q; counted per tried radius, p steps each). A production "iteration" is counted as 1 op although its lag scan also does up to maxPeriod comparisons, so attempt cost relative to production work is overstated, possibly by an order of magnitude; the last savings column re-weights a production iteration as 8 and 32 ops (a sensitivity, not a calibrated figure). Prefilter comparisons are not counted (production performs the same comparisons).',
    '- Savings assume a combined scheme: the certifier runs alongside the production scan and the pixel stops at whichever accepts first. Gross savings = sum over pixels certified within the production budget of max(0, n_prod - n_cert) (for unresolved pixels n_prod = maxIterations). Attempt cost is counted on every non-analytic pixel up to min(n_cert, n_prod), including escaping pixels. Net = gross - attempt cost. Escaping pixels contribute their iterations to the denominator and no saving.',
    '- "n_cert" for production-accepted pixels is found by scanning up to the extended budget even when production already accepted, so "cert later" is measured, not assumed.',
    '- Bucketing: |lambda| is production\'s multiplier modulus for accepted pixels and the certified q (an upper bound on |lambda|) for unresolved pixels that certify; pixels with neither are in the "none" row. Period is production\'s accepted period, else the certified period.',
    '- The raster is a downsampled raster of the case view, not the shipping 1024x640 raster; pixel centers follow the viewport transform. Distributions are therefore per-sample, not area-exact.',
    '',
    '## Per case',
    '',
    SUMMARY_HEADER,
    ...report.cases.map((entry) => summaryRow(entry.id, requireGroup(report.perCase, entry.id))),
    summaryRow('**ALL**', overall),
    '',
    '### Per-case savings',
    '',
    SAVINGS_HEADER,
    ...report.cases.map((entry) => savingsRow(entry.id, requireGroup(report.perCase, entry.id))),
    savingsRow('**ALL**', overall),
    '',
    '## Aggregated by |lambda| bucket',
    '',
    SUMMARY_HEADER,
    ...Object.entries(tables.byLambda).map(([label, group]) => summaryRow(label, group)),
    '',
    SAVINGS_HEADER,
    ...Object.entries(tables.byLambda).map(([label, group]) => savingsRow(label, group)),
    '',
    '## Aggregated by period',
    '',
    SUMMARY_HEADER,
    ...Object.entries(tables.byPeriod).map(([label, group]) => summaryRow(label, group)),
    '',
    SAVINGS_HEADER,
    ...Object.entries(tables.byPeriod).map(([label, group]) => savingsRow(label, group)),
    '',
    '## Disagreements',
    '',
    renderDisagreements(report.disagreements),
    '## Unresolved pixels (production, at its budget)',
    '',
    `- ${overall.unresolved} unresolved; ${overall.unresolvedCertWithinBudget} certify within the production budget; ${overall.unresolvedCertWithinExtended} within the extended budget; ${overall.unresolvedStillUnresolved} remain uncertified (${overall.unresolvedLateEscape} of those escape within the extended budget).`,
    `- Extended-budget production (same classifier, ${options.budgetMult}x maxIterations) accepts ${overall.unresolvedExtendedProductionAccepts} of the unresolved pixels.`,
    '',
    '## Estimated savings',
    '',
    `- Production iterations (all non-analytic pixels, escapes included): ${overall.productionIterations}`,
    `- Gross saved: ${overall.grossSavedIterations} (${fmt(overall.grossSavedPercent, 2)}%); attempt cost: ${overall.attemptOps} ops (${fmt(overall.attemptOpsPercent, 2)}%); net: ${overall.netSavedIterations} (${fmt(overall.netSavedPercent, 2)}%); net if a production iteration costs 8 / 32 ops: ${fmt(overall.netSavedPercentW8, 2)}% / ${fmt(overall.netSavedPercentW32, 2)}%`,
    '',
    '## Smallest margins observed (eta slack)',
    '',
    renderMargins(report.margins),
    '',
  ];
  return `${lines.join('\n')}\n`;
};

const rowsOf = (result: CaseResult): unknown[][] =>
  result.pixels.map((pixel) => [
    result.id,
    pixel.x,
    pixel.y,
    pixel.cRe,
    pixel.cIm,
    pixel.outcome,
    pixel.prodIterations,
    pixel.prodPeriod,
    pixel.prodLambda,
    pixel.certIteration,
    pixel.cert?.period ?? 0,
    pixel.cert?.radius ?? 0,
    pixel.cert?.q ?? 0,
    pixel.cert?.etaRoom ?? 0,
    pixel.bestEtaRoom,
    pixel.costAttempts,
    pixel.costRadiusEvaluations,
    pixel.costOps,
    pixel.escapeIteration,
    pixel.extStatus,
    pixel.extPeriod,
    pixel.extIterations,
  ]);

const PIXEL_COLUMNS = [
  'case',
  'x',
  'y',
  'cRe',
  'cIm',
  'outcome',
  'prodIterations',
  'prodPeriod',
  'prodLambda',
  'certIteration',
  'certPeriod',
  'certRadius',
  'certQ',
  'certEtaRoom',
  'bestEtaRoom',
  'costAttempts',
  'costRadiusEvaluations',
  'costOps',
  'escapeIteration',
  'extStatus',
  'extPeriod',
  'extIterations',
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const main = (): void => {
  const options = parseOptions(argv.slice(2));
  const corpus = loadCorpus().filter(
    (entry) => options.cases === undefined || options.cases.includes(entry.id),
  );
  const started = performance.now();
  const results: CaseResult[] = [];
  for (const corpusCase of corpus) {
    const result = measureCase(corpusCase, options);
    results.push(result);
    stderr.write(
      `${corpusCase.id}: ${result.pixels.length} pixels in ${fmt(result.seconds, 1)} s\n`,
    );
  }
  const taggedAll = results.flatMap(tagCase);
  const perCase: Record<string, GroupSummary> = {};
  for (const result of results) perCase[result.id] = summarizeTagged(tagCase(result));
  const certified = taggedAll.filter(({ pixel }) => pixel.cert !== undefined);
  const report: Report = {
    options,
    cases: results,
    perCase,
    overall: summarizeTagged(taggedAll),
    tables: bucketTables(taggedAll),
    margins: summarizeMargins(certified),
    disagreements: results.flatMap((result) =>
      result.pixels.flatMap((pixel) => collectDisagreements(result.id, pixel)),
    ),
    seconds: (performance.now() - started) / 1000,
  };
  const commit = git(['rev-parse', '--short', 'HEAD']);
  const date = options.date ?? new Date().toISOString().slice(0, 10);
  const provenance: Provenance = {
    date,
    commit,
    branch: git(['rev-parse', '--abbrev-ref', 'HEAD']),
    dirty: git(['status', '--porcelain']).length > 0,
    command: `npm run evidence:early-accept -- ${argv.slice(2).join(' ')}`.trim(),
    node: version,
    platform: `${platform()} ${release()} ${arch()}`,
    cpu: cpus()[0]?.model ?? 'unknown',
    totalMemoryMiB: Math.round(totalmem() / 1048576),
  };
  const summary = renderSummary(report, provenance);
  if (!options.write) {
    stdout.write(summary);
    return;
  }
  const outDir =
    options.outDir ??
    `evidence/phase-2/early-accept-measurement/${date}-${commit}${options.schedule === 'every' ? '' : `-${options.schedule}`}`;
  mkdirSync(outDir, { recursive: true });
  const json = {
    label:
      'offline Node measurement, iteration counts, not wall-clock; no binary64 eta; not a release gate',
    provenance,
    options: { ...options, cases: options.cases ?? 'all', outDir: undefined, date: undefined },
    verifierConditions:
      'e_0=r, e_{j+1}=2|z_j|e_j+e_j^2, R_j=|z_j|+e_j, q=prod 2R_j<1, |f^p(z0)-z0|<=r(1-q), e_d+r<|f^d(z0)-z0| for proper divisors d|p',
    cases: results.map((entry) => ({
      id: entry.id,
      profile: entry.profile,
      maxIterations: entry.maxIterations,
      maxPeriod: entry.maxPeriod,
      extendedIterations: entry.extendedIterations,
      width: entry.width,
      height: entry.height,
      center: entry.center,
      spanY: entry.spanY,
      seconds: entry.seconds,
    })),
    perCase,
    overall: report.overall,
    byLambdaBucket: report.tables.byLambda,
    byPeriod: report.tables.byPeriod,
    margins: report.margins,
    disagreementCounts: kindCounts(report.disagreements),
    disagreements: report.disagreements,
    pixelFile: 'pixels.jsonl.gz',
    pixelColumns: PIXEL_COLUMNS,
  };
  writeFileSync(`${outDir}/results.json`, `${JSON.stringify(json, null, 2)}\n`);
  writeFileSync(`${outDir}/summary.md`, summary);
  const pixelLines = results.flatMap(rowsOf).map((row) => JSON.stringify(row));
  writeFileSync(`${outDir}/pixels.jsonl.gz`, gzipSync(`${pixelLines.join('\n')}\n`, { level: 9 }));
  stderr.write(`wrote ${outDir}\n`);
};

try {
  main();
} catch (error) {
  stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
  exit(1);
}
