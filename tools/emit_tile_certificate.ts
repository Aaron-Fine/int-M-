/// <reference types="node" />
/**
 * Untrusted witness emitter for the reflected Lean tile checker
 * (`proof/IntMProof/TileChecker.lean`, `checkTile`).
 *
 * Every emitted integer is computed with BigInt. The emitter rounds witnesses
 * in the safe direction so that an honest certificate passes, but it is not
 * trusted: Lean re-checks every inequality by kernel reduction and rejects a
 * witness violating a checked inequality. Nothing in this file contributes to
 * the Lean conclusion. Run `node tools/emit_tile_certificate.ts --help` for usage.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { argv, exit, stderr, stdout } from 'node:process';

interface Rational {
  num: bigint;
  den: bigint;
}

interface Complex {
  re: bigint;
  im: bigint;
}

interface CycleStep {
  point: Complex;
  radius: bigint;
  residual: bigint;
  seedError: bigint;
  centerError: bigint;
  multiplier: bigint;
}

interface CriticalStep {
  point: Complex;
  radius: bigint;
  residual: bigint;
  error: bigint;
}

/** Usage errors: print a clean message and exit with status 2. */
function fail(message: string): never {
  stderr.write(`emit_tile_certificate: error: ${message}\n`);
  stderr.write('Run with --help for usage.\n');
  exit(2);
}

function floorDiv(n: bigint, d: bigint): bigint {
  if (d <= 0n) fail('floorDiv expects a positive divisor');
  const q = n / d;
  return n % d !== 0n && n < 0n ? q - 1n : q;
}

function ceilDiv(n: bigint, d: bigint): bigint {
  return -floorDiv(-n, d);
}

function roundDiv(n: bigint, d: bigint): bigint {
  return floorDiv(2n * n + d, 2n * d);
}

function isqrtFloor(n: bigint): bigint {
  if (n < 0n) fail('isqrt of a negative number');
  if (n < 2n) return n;
  let x = 1n << BigInt(Math.ceil(n.toString(2).length / 2));
  for (;;) {
    const y = (x + n / x) >> 1n;
    if (y >= x) return x;
    x = y;
  }
}

function isqrtCeil(n: bigint): bigint {
  const r = isqrtFloor(n);
  return r * r === n ? r : r + 1n;
}

function parseRational(text: string): Rational {
  const power = /^(-?)2\^(-?\d+)$/.exec(text);
  if (power) {
    const sign = power[1] === '-' ? -1n : 1n;
    const exponent = Number(power[2]);
    if (!(Math.abs(exponent) <= 100000)) fail(`power-of-two exponent out of range: ${text}`);
    return exponent >= 0
      ? { num: sign * (1n << BigInt(exponent)), den: 1n }
      : { num: sign, den: 1n << BigInt(-exponent) };
  }
  const fraction = /^(-?\d+)\/(\d+)$/.exec(text);
  if (fraction) {
    return { num: BigInt(fraction[1] ?? '0'), den: BigInt(fraction[2] ?? '1') };
  }
  const decimal = /^(-?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(text);
  if (!decimal || `${decimal[2] ?? ''}${decimal[3] ?? ''}` === '') {
    fail(`cannot parse number: ${text}`);
  }
  const sign = decimal[1] === '-' ? -1n : 1n;
  const digits = `${decimal[2] ?? ''}${decimal[3] ?? ''}`;
  const exponent = Number(decimal[4] ?? '0') - (decimal[3] ?? '').length;
  const mantissa = sign * BigInt(digits);
  return exponent >= 0
    ? { num: mantissa * 10n ** BigInt(exponent), den: 1n }
    : { num: mantissa, den: 10n ** BigInt(-exponent) };
}

function toGrid(value: Rational, scale: bigint, mode: 'floor' | 'ceil' | 'nearest'): bigint {
  const n = value.num * scale;
  if (mode === 'floor') return floorDiv(n, value.den);
  if (mode === 'ceil') return ceilDiv(n, value.den);
  return roundDiv(n, value.den);
}

function normSq(z: Complex): bigint {
  return z.re * z.re + z.im * z.im;
}

/** Nearest-rounded stored step `x² + c` on the grid of scale `S`. */
function storedStep(x: Complex, c: Complex, scale: bigint): Complex {
  return {
    re: roundDiv(x.re * x.re - x.im * x.im, scale) + c.re,
    im: roundDiv(2n * x.re * x.im, scale) + c.im,
  };
}

/** Residual `S² (y - (x² + c))`, exactly as `tileResidualRe/Im` in Lean. */
function residual(x: Complex, y: Complex, c: Complex, scale: bigint): Complex {
  return {
    re: y.re * scale - (x.re * x.re - x.im * x.im) - c.re * scale,
    im: y.im * scale - 2n * x.re * x.im - c.im * scale,
  };
}

function errorStep(r: bigint, e: bigint, delta: bigint, rho: bigint, scale: bigint): bigint {
  return ceilDiv(2n * r * e + e * e + (delta + rho) * scale, scale);
}

/** Fixed-point complex arithmetic at scale `2^bits` for Newton refinement. */
function fixedMul(a: Complex, b: Complex, bits: bigint): Complex {
  return {
    re: (a.re * b.re - a.im * b.im) >> bits,
    im: (a.re * b.im + a.im * b.re) >> bits,
  };
}

function fixedDiv(a: Complex, b: Complex, bits: bigint): Complex {
  const den = normSq(b);
  if (den === 0n) fail('Newton derivative vanished');
  return {
    re: ((a.re * b.re + a.im * b.im) << bits) / den,
    im: ((a.im * b.re - a.re * b.im) << bits) / den,
  };
}

function newtonCyclePoint(
  guess: Complex,
  c: Complex,
  period: number,
  precision: number,
): { point: Complex; steps: number } {
  const bits = BigInt(2 * precision + 64);
  const shift = bits - BigInt(precision);
  const one = 1n << bits;
  const cc: Complex = { re: c.re << shift, im: c.im << shift };
  let z: Complex = { re: guess.re << shift, im: guess.im << shift };
  for (let step = 0; step < 200; step += 1) {
    let w = z;
    let derivative: Complex = { re: one, im: 0n };
    for (let j = 0; j < period; j += 1) {
      derivative = fixedMul(derivative, { re: 2n * w.re, im: 2n * w.im }, bits);
      const square = fixedMul(w, w, bits);
      w = { re: square.re + cc.re, im: square.im + cc.im };
    }
    const g: Complex = { re: w.re - z.re, im: w.im - z.im };
    const gPrime: Complex = { re: derivative.re - one, im: derivative.im };
    const correction = fixedDiv(g, gPrime, bits);
    z = { re: z.re - correction.re, im: z.im - correction.im };
    const size = correction.re < 0n ? -correction.re : correction.re;
    const sizeIm = correction.im < 0n ? -correction.im : correction.im;
    if (size + sizeIm < 1n << 8n) {
      return {
        point: { re: roundDiv(z.re, 1n << shift), im: roundDiv(z.im, 1n << shift) },
        steps: step + 1,
      };
    }
  }
  fail('Newton iteration did not converge');
}

const USAGE = `Usage:
  node tools/emit_tile_certificate.ts --name NAME --period P --entry K --precision S \\
    --c-re X --c-im Y (--delta D | --half-width A [--half-height B]) --radius R \\
    [--contraction Q|auto] [--z-re X --z-im Y | --guess-re X --guess-im Y] \\
    [--lower-multiplier] [--allow-fail] [--module] [--out FILE]
  node tools/emit_tile_certificate.ts --batch SPEC.json [--allow-fail] [--out FILE]

Numbers accept decimals (-0.1225, 1e-3), fractions (1/16), or powers of two (2^-32).
Parameter and seed centers are rounded to the nearest grid point; --delta and
half-widths are rounded up; --radius and --contraction are rounded down.
--contraction defaults to auto (the computed multiplier witness m_p).
Without --z-re the seed center is a period-P point found by Newton iteration at
2S+64 bits, started from the guess or (by default) from the stored critical
iterate K.

--lower-multiplier  also emit lower-radius witnesses and a lower multiplier chain,
                    checked by checkTileMultiplierLower.
--allow-fail        emit even if the emitter's own re-evaluation of the final
                    margins (contraction, multiplier, center, divisors, entry)
                    fails; by default it exits with status 1 and writes nothing.
--module            wrap the output in a full Lean module (always on with --batch).
--batch SPEC.json   SPEC is {"name": ID, "summary": "conjunction"|"all",
                    "doc": optional module docstring text,
                    "certificates": [{...per-certificate flags without --...}]}.
                    Emits all certificates into one module plus one summary theorem.
-h, --help          show this message.

Exit status: 0 success, 1 a margin check failed, 2 usage error.
`;

/** Flags taking a value that describe one certificate. */
const CERTIFICATE_VALUE_FLAGS = new Set([
  'name',
  'period',
  'entry',
  'precision',
  'c-re',
  'c-im',
  'delta',
  'half-width',
  'half-height',
  'radius',
  'contraction',
  'z-re',
  'z-im',
  'guess-re',
  'guess-im',
]);
const CERTIFICATE_BOOLEAN_FLAGS = new Set(['lower-multiplier']);
const GLOBAL_VALUE_FLAGS = new Set(['out', 'batch']);
const GLOBAL_BOOLEAN_FLAGS = new Set(['module', 'allow-fail', 'help']);

const LEAN_KEYWORDS = new Set([
  'at',
  'by',
  'def',
  'do',
  'else',
  'end',
  'example',
  'fun',
  'have',
  'if',
  'import',
  'in',
  'instance',
  'let',
  'match',
  'namespace',
  'open',
  'section',
  'show',
  'then',
  'theorem',
  'where',
  'with',
  'structure',
  'lemma',
  'abbrev',
  'variable',
  'class',
  'inductive',
  'noncomputable',
  'private',
  'protected',
  'mutual',
  'axiom',
  'opaque',
  'macro',
  'syntax',
  'set_option',
]);

interface Options {
  name: string;
  period: number;
  entry: number;
  precision: number;
  values: Map<string, string>;
  lowerMultiplier: boolean;
}

interface Global {
  values: Map<string, string>;
  flags: Set<string>;
  certificate: Map<string, string>;
  certificateFlags: Set<string>;
}

function parseArguments(args: string[]): Global {
  const global: Global = {
    values: new Map(),
    flags: new Set(),
    certificate: new Map(),
    certificateFlags: new Set(),
  };
  const seen = new Set<string>();
  for (let i = 0; i < args.length; i += 1) {
    const raw = args[i] ?? '';
    const shortHelp = raw === '-h';
    if (!shortHelp && !raw.startsWith('--')) fail(`unexpected argument: ${raw}`);
    const key = shortHelp ? 'help' : raw.slice(2);
    if (seen.has(key)) fail(`flag given more than once: ${raw}`);
    seen.add(key);
    if (shortHelp) {
      global.flags.add('help');
      continue;
    }
    if (GLOBAL_BOOLEAN_FLAGS.has(key)) global.flags.add(key);
    else if (CERTIFICATE_BOOLEAN_FLAGS.has(key)) global.certificateFlags.add(key);
    else if (GLOBAL_VALUE_FLAGS.has(key) || CERTIFICATE_VALUE_FLAGS.has(key)) {
      const value = args[i + 1];
      if (value === undefined || value.startsWith('--')) fail(`missing value for ${raw}`);
      (GLOBAL_VALUE_FLAGS.has(key) ? global.values : global.certificate).set(key, value);
      i += 1;
    } else fail(`unknown flag: ${raw}`);
  }
  return global;
}

function checkIdentifier(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_']*$/.test(name) || LEAN_KEYWORDS.has(name)) {
    fail(`not a valid Lean identifier: ${name}`);
  }
  return name;
}

function certificateOptions(values: Map<string, string>, flags: Set<string>): Options {
  const required = (key: string): string => values.get(key) ?? fail(`missing --${key}`);
  const natural = (key: string): number => {
    const text = required(key);
    if (!/^\d+$/.test(text)) fail(`--${key} must be a natural number, got ${text}`);
    return Number(text);
  };
  const options: Options = {
    name: checkIdentifier(required('name')),
    period: natural('period'),
    entry: natural('entry'),
    precision: natural('precision'),
    values,
    lowerMultiplier: flags.has('lower-multiplier'),
  };
  if (options.period < 1) fail('--period must be positive');
  if (options.precision < 1) fail('--precision must be positive');
  return options;
}

/** Batch entries use the per-certificate flag names as JSON keys. */
function batchOptions(entry: unknown, index: number): Options {
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
    fail(`batch certificate ${index} is not an object`);
  }
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (const [key, value] of Object.entries(entry)) {
    if (CERTIFICATE_BOOLEAN_FLAGS.has(key)) {
      if (typeof value !== 'boolean') fail(`batch certificate ${index}: ${key} must be boolean`);
      if (value) flags.add(key);
    } else if (CERTIFICATE_VALUE_FLAGS.has(key)) {
      if (typeof value !== 'string' && typeof value !== 'number') {
        fail(`batch certificate ${index}: ${key} must be a string or number`);
      }
      values.set(key, String(value));
    } else fail(`batch certificate ${index}: unknown key ${key}`);
  }
  return certificateOptions(values, flags);
}

function leanInt(n: bigint): string {
  return n < 0n ? `(${n.toString()})` : n.toString();
}

/** Greedy word wrap at Mathlib's 100 columns; continuation lines indent two more. */
function wrapTokens(tokens: string[], indent: string): string {
  const lines: string[] = [];
  let current = indent;
  for (const token of tokens) {
    if (current.trim() !== '' && current.length + token.length + 1 > 100) {
      lines.push(current.trimEnd());
      current = `${indent}  `;
    }
    current += current.trim() === '' ? token : ` ${token}`;
  }
  lines.push(current.trimEnd());
  return lines.join('\n');
}

function complexTokens(z: Complex): string[] {
  return [`⟨${leanInt(z.re)},`, `${leanInt(z.im)}⟩`];
}

/** Anonymous-constructor tuple; complex parts are split so the line can wrap. */
function leanTuple(parts: (bigint | Complex)[], indent: string, suffix: string): string {
  const tokens: string[] = parts.flatMap((part, index) => {
    const pieces = typeof part === 'bigint' ? [part.toString()] : complexTokens(part);
    return index + 1 < parts.length
      ? pieces.map((piece, i) => (i + 1 < pieces.length ? piece : `${piece},`))
      : pieces;
  });
  const last = tokens.length - 1;
  return wrapTokens(
    tokens.map((token, i) => {
      const opened = i === 0 ? `⟨${token}` : token;
      return i === last ? `${opened}⟩${suffix}` : opened;
    }),
    indent,
  );
}

interface Inputs {
  options: Options;
  scale: bigint;
  c: Complex;
  delta: bigint;
  rectangle: { a: bigint; b: bigint } | undefined;
  r: bigint;
}

function gridValue(
  options: Options,
  key: string,
  scale: bigint,
  mode: 'floor' | 'ceil' | 'nearest',
): bigint {
  return toGrid(parseRational(options.values.get(key) ?? fail(`missing --${key}`)), scale, mode);
}

function readInputs(options: Options): Inputs {
  const scale = 1n << BigInt(options.precision);
  const c: Complex = {
    re: gridValue(options, 'c-re', scale, 'nearest'),
    im: gridValue(options, 'c-im', scale, 'nearest'),
  };
  let rectangle: { a: bigint; b: bigint } | undefined;
  let delta: bigint;
  if (options.values.has('half-width')) {
    if (options.values.has('delta')) fail('give either --delta or --half-width, not both');
    const a = gridValue(options, 'half-width', scale, 'ceil');
    const b = options.values.has('half-height')
      ? gridValue(options, 'half-height', scale, 'ceil')
      : a;
    rectangle = { a, b };
    delta = isqrtCeil(a * a + b * b);
  } else {
    delta = gridValue(options, 'delta', scale, 'ceil');
  }
  const r = gridValue(options, 'radius', scale, 'floor');
  if (delta < 0n || r < 0n) fail('--delta, half-widths and --radius must be nonnegative');
  return { options, scale, c, delta, rectangle, r };
}

/** Stored critical reference from 0, nearest rounding, initial error 0. */
function buildCritical(inputs: Inputs): CriticalStep[] {
  const { scale, c, delta } = inputs;
  const critical: CriticalStep[] = [];
  let x: Complex = { re: 0n, im: 0n };
  let error = 0n;
  for (let j = 0; j <= inputs.options.entry; j += 1) {
    const next = storedStep(x, c, scale);
    const rho = ceilDiv(isqrtCeil(normSq(residual(x, next, c, scale))), scale);
    const radius = isqrtCeil(normSq(x));
    critical.push({ point: x, radius, residual: rho, error });
    error = errorStep(radius, error, delta, rho, scale);
    x = next;
  }
  return critical;
}

/** Seed-disk center: supplied, or a Newton-refined period point. */
function chooseCenter(inputs: Inputs, hit: CriticalStep): Complex {
  const { options, scale } = inputs;
  if (options.values.has('z-re')) {
    return {
      re: gridValue(options, 'z-re', scale, 'nearest'),
      im: gridValue(options, 'z-im', scale, 'nearest'),
    };
  }
  const guess: Complex = options.values.has('guess-re')
    ? {
        re: gridValue(options, 'guess-re', scale, 'nearest'),
        im: gridValue(options, 'guess-im', scale, 'nearest'),
      }
    : hit.point;
  const solved = newtonCyclePoint(guess, inputs.c, options.period, options.precision);
  stderr.write(`${options.name}: newton converged in ${solved.steps} steps\n`);
  return solved.point;
}

/** Stored period reference from z0 with both error tables and the multiplier chain. */
function buildCycle(inputs: Inputs, z0: Complex): CycleStep[] {
  const { scale, c, delta } = inputs;
  const cycle: CycleStep[] = [];
  let y = z0;
  let seedError = inputs.r;
  let centerError = 0n;
  let multiplier = scale;
  for (let j = 0; j <= inputs.options.period; j += 1) {
    const next = storedStep(y, c, scale);
    const rho = ceilDiv(isqrtCeil(normSq(residual(y, next, c, scale))), scale);
    const radius = isqrtCeil(normSq(y));
    cycle.push({ point: y, radius, residual: rho, seedError, centerError, multiplier });
    multiplier = ceilDiv(multiplier * 2n * (radius + seedError), scale);
    seedError = errorStep(radius, seedError, delta, rho, scale);
    centerError = errorStep(radius, centerError, delta, rho, scale);
    y = next;
  }
  return cycle;
}

interface LowerStep {
  lowerRadius: bigint;
  lowerMultiplier: bigint;
}

/** Lower radii `floor |ref_j|` and the chain `n_{j+1} = floor(n_j 2 max(l_j - e_j, 0) / S)`,
 * using the seed-disk error table, exactly as `checkTileMultiplierLower` checks. */
function buildLower(inputs: Inputs, cycle: CycleStep[]): LowerStep[] {
  const lower: LowerStep[] = [];
  let lowerMultiplier = inputs.scale;
  for (const step of cycle) {
    const lowerRadius = isqrtFloor(normSq(step.point));
    lower.push({ lowerRadius, lowerMultiplier });
    const gap = lowerRadius > step.seedError ? lowerRadius - step.seedError : 0n;
    lowerMultiplier = floorDiv(lowerMultiplier * 2n * gap, inputs.scale);
  }
  return lower;
}

function distanceSq(a: Complex, b: Complex): bigint {
  const dx = a.re - b.re;
  const dy = a.im - b.im;
  return dx * dx + dy * dy;
}

/** Decimal rendering of `n / scale` that stays finite for any precision. */
function decimal(n: bigint, scale: bigint): string {
  const digits = 10n ** 9n;
  const scaled = floorDiv(n * digits, scale);
  const whole = scaled / digits;
  const frac = (scaled % digits).toString().padStart(9, '0');
  return `${whole.toString()}.${frac}`;
}

/**
 * Re-evaluate the final margin checks of `checkTile` (contraction, multiplier,
 * center return, divisor separation, critical entry). The per-step radius,
 * residual, error and multiplier witnesses are constructed to satisfy their
 * checks and are not re-evaluated here. Returns whether all margins pass.
 */
function reportChecks(
  inputs: Inputs,
  z0: Complex,
  q: bigint,
  cycle: CycleStep[],
  hit: CriticalStep,
): boolean {
  const { scale, r } = inputs;
  const { name, period } = inputs.options;
  const last = cycle[period] ?? fail('internal: missing cycle step');
  const centerMargin = r * scale - last.centerError * scale - q * r;
  const checks: [string, boolean][] = [
    ['contraction q < 1', q < scale],
    ['multiplier m_p <= q', last.multiplier <= q],
    [
      'center return',
      centerMargin >= 0n &&
        distanceSq(last.point, z0) * scale * scale <= centerMargin * centerMargin,
    ],
  ];
  for (let d = 1; d < period; d += 1) {
    if (period % d !== 0) continue;
    const step = cycle[d] ?? fail('internal: missing cycle step');
    const bound = step.seedError + r;
    checks.push([`divisor ${d} separation`, bound * bound < distanceSq(step.point, z0)]);
  }
  const entryMargin = r - hit.error;
  const entryDistanceSq = distanceSq(hit.point, z0);
  checks.push([
    'critical entry',
    entryMargin >= 0n && entryDistanceSq <= entryMargin * entryMargin,
  ]);
  for (const [label, ok] of checks) {
    stderr.write(`${name}: check ${ok ? 'pass' : 'FAIL'}: ${label}\n`);
  }
  stderr.write(
    `${name}: multiplier bound ${decimal(last.multiplier, scale)}, q ${decimal(q, scale)}, ` +
      `center error ${decimal(last.centerError, scale)}, ` +
      `entry error ${decimal(hit.error, scale)}, ` +
      `entry distance ${decimal(isqrtCeil(entryDistanceSq), scale)}\n`,
  );
  return checks.every(([, ok]) => ok);
}

/** Arguments, without output-only flags, wrapped for a Lean docstring. */
function commandLines(options: Options): string[] {
  const recorded: string[] = [];
  for (const [key, value] of options.values) recorded.push(`--${key}`, value);
  if (options.lowerMultiplier) recorded.push('--lower-multiplier');
  const lines: string[] = [];
  let line = 'node tools/emit_tile_certificate.ts';
  for (const arg of recorded) {
    if (line.length + arg.length + 1 > 96) {
      lines.push(line);
      line = ' ';
    }
    line += ` ${arg}`;
  }
  lines.push(line);
  return lines;
}

interface Emitted {
  name: string;
  ok: boolean;
  text: string;
  lowerCheck: string | undefined;
}

function renderLean(
  inputs: Inputs,
  z0: Complex,
  q: bigint,
  cycle: CycleStep[],
  critical: CriticalStep[],
  lower: LowerStep[] | undefined,
  checkTheorem: boolean,
): string {
  const { options, c, delta, rectangle, r } = inputs;
  const { name, period, entry, precision } = options;
  const lines: string[] = [];
  // Long list literals exceed the default elaborator recursion depth.
  if (entry + period > 300) {
    lines.push(`set_option maxRecDepth ${100 * (entry + period) + 1000} in`);
  }
  lines.push(
    `/-- Generated by the untrusted emitter (arguments below). Lean re-checks every witness.`,
    ...commandLines(options).map((line) => `  ${line}`),
    '-/',
    `def ${name} : TileCertificate where`,
    `  precision := ${precision}`,
    wrapTokens(['parameter :=', ...complexTokens(c)], '  '),
    wrapTokens(['parameterRadius :=', delta.toString()], '  '),
    wrapTokens(['center :=', ...complexTokens(z0)], '  '),
    wrapTokens(['seedRadius :=', r.toString()], '  '),
    wrapTokens(['contraction :=', q.toString()], '  '),
    `  period := ${period}`,
    `  entry := ${entry}`,
    '  cycle := [',
    ...cycle.map((s, index) =>
      leanTuple(
        [s.point, s.radius, s.residual, s.seedError, s.centerError, s.multiplier],
        '    ',
        index + 1 < cycle.length ? ',' : ']',
      ),
    ),
    '  critical := [',
    ...critical.map((s, index) =>
      leanTuple(
        [s.point, s.radius, s.residual, s.error],
        '    ',
        index + 1 < critical.length ? ',' : ']',
      ),
    ),
  );
  if (checkTheorem) {
    lines.push(
      '',
      `/-- The generic reflected checker accepts \`${name}\` by kernel reduction. -/`,
      `theorem ${name}_check : checkTile ${name} = true := by`,
      '  decide +kernel',
    );
  }
  if (rectangle !== undefined) {
    lines.push(
      '',
      `/-- The emitted rectangle half-widths lie in the parameter disk of \`${name}\`. -/`,
      `theorem ${name}_rectangle :`,
      wrapTokens(
        ['tileRectangleOK', name, rectangle.a.toString(), rectangle.b.toString(), '= true := by'],
        '    ',
      ),
      '  decide +kernel',
    );
  }
  if (lower !== undefined) {
    const bound = lower[period]?.lowerMultiplier ?? fail('internal: missing lower step');
    lines.push(
      '',
      `/-- Lower-radius and lower-multiplier witnesses for \`${name}\`. -/`,
      `def ${name}Lower : List TileLowerStep := [`,
      ...lower.map((s, index) =>
        leanTuple([s.lowerRadius, s.lowerMultiplier], '    ', index + 1 < lower.length ? ',' : ']'),
      ),
      '',
      `/-- The lower multiplier chain of \`${name}\` passes by kernel reduction. -/`,
      `theorem ${name}_lower_check :`,
      `    checkTileMultiplierLower ${name} ${bound.toString()}`,
      `      ${name}Lower = true := by`,
      '  decide +kernel',
    );
  }
  return `${lines.join('\n')}\n`;
}

function emitCertificate(options: Options, checkTheorem: boolean): Emitted {
  const inputs = readInputs(options);
  const critical = buildCritical(inputs);
  const hit = critical[options.entry] ?? fail('internal: missing critical step');
  const z0 = chooseCenter(inputs, hit);
  const cycle = buildCycle(inputs, z0);
  const last = cycle[options.period] ?? fail('internal: missing cycle step');
  const contraction = options.values.get('contraction') ?? 'auto';
  const q =
    contraction === 'auto'
      ? last.multiplier
      : toGrid(parseRational(contraction), inputs.scale, 'floor');
  let ok = reportChecks(inputs, z0, q, cycle, hit);
  let lower: LowerStep[] | undefined;
  let lowerCheck: string | undefined;
  if (options.lowerMultiplier) {
    lower = buildLower(inputs, cycle);
    const bound = lower[options.period]?.lowerMultiplier ?? 0n;
    stderr.write(`${options.name}: lower multiplier bound ${decimal(bound, inputs.scale)}\n`);
    if (bound === 0n) {
      stderr.write(`${options.name}: warning: lower bound is zero\n`);
      stderr.write(`${options.name}: check FAIL: lower multiplier bound is zero\n`);
      ok = false;
    }
    lowerCheck =
      `checkTileMultiplierLower ${options.name}\n        ` +
      `${bound.toString()} ${options.name}Lower`;
  }
  const text = renderLean(inputs, z0, q, cycle, critical, lower, checkTheorem);
  return { name: options.name, ok, text, lowerCheck };
}

const MODULE_HEADER = ['import IntMProof.TileChecker', '', 'namespace IntMProof', ''];

interface BatchSpec {
  batchName: string;
  perCertificate: boolean;
  doc: string | undefined;
  options: ReturnType<typeof batchOptions>[];
}

function readBatchSpec(specPath: string): BatchSpec {
  let spec: unknown;
  try {
    spec = JSON.parse(readFileSync(specPath, 'utf8'));
  } catch (error) {
    fail(`cannot read batch spec ${specPath}: ${String(error)}`);
  }
  if (typeof spec !== 'object' || spec === null || Array.isArray(spec)) {
    fail('batch spec must be an object');
  }
  const record = spec as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!['name', 'summary', 'doc', 'certificates'].includes(key)) {
      fail(`batch spec: unknown key ${key}`);
    }
  }
  const batchName = checkIdentifier(
    typeof record['name'] === 'string' ? record['name'] : fail('batch spec needs a string name'),
  );
  const summary = record['summary'] ?? 'conjunction';
  if (summary !== 'conjunction' && summary !== 'all') {
    fail('batch spec summary must be "conjunction" or "all"');
  }
  const entries = record['certificates'];
  if (!Array.isArray(entries) || entries.length === 0) {
    fail('batch spec needs a nonempty certificates array');
  }
  const options = entries.map((entry, index) => batchOptions(entry, index));
  const names = new Set<string>();
  for (const option of options) {
    if (names.has(option.name)) fail(`duplicate certificate name ${option.name}`);
    names.add(option.name);
  }
  const doc = record['doc'];
  if (doc !== undefined && typeof doc !== 'string') fail('batch spec doc must be a string');
  return { batchName, perCertificate: summary === 'conjunction', doc, options };
}

function batchModule(specPath: string): { text: string; ok: boolean } {
  const { batchName, perCertificate, doc, options } = readBatchSpec(specPath);
  const emitted = options.map((option) => emitCertificate(option, perCertificate));
  const lines = [...MODULE_HEADER];
  if (doc !== undefined) lines.splice(1, 0, '', '/-!', doc.trimEnd(), '-/');
  for (const item of emitted) lines.push(item.text);
  const certificateNames = emitted.map((item) => item.name);
  const lowerChecks = emitted.flatMap((item) =>
    item.lowerCheck === undefined ? [] : [`${item.lowerCheck} = true`],
  );
  if (perCertificate) {
    const conjuncts = [
      ...certificateNames.map((name) => `checkTile ${name} = true`),
      ...lowerChecks,
    ];
    const proofs = [
      ...certificateNames.map((name) => `${name}_check`),
      ...emitted.flatMap((item) =>
        item.lowerCheck === undefined ? [] : [`${item.name}_lower_check`],
      ),
    ];
    lines.push(
      `/-- Every certificate of the batch \`${batchName}\` passes \`checkTile\`. -/`,
      `theorem ${batchName}_all :`,
      `    ${conjuncts.join(' ∧\n      ')} :=`,
      `  ⟨${proofs.join(',\n    ')}⟩`,
      '',
    );
  } else {
    lines.push(
      `/-- The certificates of the batch \`${batchName}\`. -/`,
      `def ${batchName}Certificates : List TileCertificate := [`,
      `  ${certificateNames.join(',\n  ')}]`,
      '',
      `/-- One kernel evaluation checks every certificate of \`${batchName}\`. -/`,
      `theorem ${batchName}_all : ${batchName}Certificates.all checkTile = true := by`,
      '  decide +kernel',
      '',
    );
    for (const name of certificateNames) {
      lines.push(
        `/-- \`${name}\` passes \`checkTile\`, extracted from \`${batchName}_all\`. -/`,
        `theorem ${name}_check : checkTile ${name} = true :=`,
        `  List.all_eq_true.mp ${batchName}_all ${name} (by`,
        `    simp only [${batchName}Certificates, List.mem_cons, true_or])`,
        '',
      );
    }
  }
  lines.push('end IntMProof');
  return { text: `${lines.join('\n')}\n`, ok: emitted.every((item) => item.ok) };
}

function main(): void {
  const global = parseArguments(argv.slice(2));
  if (global.flags.has('help')) {
    stdout.write(USAGE);
    return;
  }
  let text: string;
  let ok: boolean;
  const batch = global.values.get('batch');
  if (batch !== undefined) {
    if (global.certificate.size > 0 || global.certificateFlags.size > 0) {
      fail('per-certificate flags are not allowed with --batch; put them in the spec');
    }
    ({ text, ok } = batchModule(batch));
  } else {
    const emitted = emitCertificate(
      certificateOptions(global.certificate, global.certificateFlags),
      true,
    );
    ok = emitted.ok;
    text = global.flags.has('module')
      ? `${[...MODULE_HEADER, emitted.text, 'end IntMProof'].join('\n')}\n`
      : emitted.text;
  }
  if (!ok && !global.flags.has('allow-fail')) {
    stderr.write(
      'emit_tile_certificate: a margin check failed; nothing written (use --allow-fail)\n',
    );
    exit(1);
  }
  const out = global.values.get('out');
  if (out === undefined) {
    stdout.write(text);
    return;
  }
  try {
    writeFileSync(out, text);
  } catch (error) {
    fail(`cannot write ${out}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

main();
