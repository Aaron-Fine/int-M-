import type { Complex } from '../domain/types';

/**
 * Component catalog schema v2 (ADR 0011): the loader's structural check of
 * catalog/components.v2.json. The mathematical invariants (exact periods,
 * addresses recomputed from the rays, conjugate closure) are tested in
 * tests/unit/catalog/; this runs on every load and rejects a malformed file.
 */

export const CATALOG_SCHEMA_VERSION_2 = 2;
/** The generated core of PHASE2-TODO item 7 stops at period 12. */
export const MAX_CATALOG_PERIOD = 12;
/** The longest annotation, in characters (code points): a sentence or two (ADR 0012). */
export const ANNOTATION_MAX_LENGTH = 280;

export interface RationalAngle {
  readonly numerator: number;
  readonly denominator: number;
}

export interface AngledAddressStep {
  readonly fromPeriod: number;
  readonly toPeriod: number;
  readonly rotation: RationalAngle;
}

export interface CatalogResidual {
  /** |f_c^p(0)| at the stored binary64 centre (80-digit evaluation, 3 significant digits). */
  readonly orbitAbs: number;
  /** Distance from the stored centre to the refined centre. */
  readonly centerError: number;
  /** Smallest |f_c^d(0)| over proper divisors d of p; absent for period 1. */
  readonly properDivisorOrbitMinAbs?: number;
}

export interface CatalogComponent {
  /** Canonical id `mi-p<p>-<lower>-<upper>`: the characteristic ray numerators over 2^p - 1. */
  readonly id: string;
  /** Earlier ids that still resolve to this entry (v1 share links). */
  readonly aliases: readonly string[];
  readonly label: string;
  /** A short curated note about the component; optional, additive to schema v2 (ADR 0012). */
  readonly annotation?: string;
  readonly center: Complex;
  readonly centerPrecisionDigits: number;
  readonly period: number;
  readonly internalAddress: readonly number[];
  /** Absent for the main cardioid, whose address has no steps. */
  readonly angledInternalAddress?: readonly AngledAddressStep[];
  /** The lower and upper characteristic angles; absent for the main cardioid (root angle 0). */
  readonly characteristicRays?: readonly [RationalAngle, RationalAngle];
  readonly residual: CatalogResidual;
  /** Key into Catalog.methods. */
  readonly method: string;
  /** Key into Catalog.provenance. */
  readonly provenance: string;
}

export interface CatalogProvenance {
  readonly generator: string;
  readonly arguments: string;
  readonly curated: string;
}

export interface Catalog {
  readonly schemaVersion: 2;
  readonly license: 'CC0-1.0';
  readonly maxPeriod: number;
  readonly methods: Readonly<Record<string, string>>;
  readonly provenance: Readonly<Record<string, CatalogProvenance>>;
  readonly components: readonly CatalogComponent[];
}

export class CatalogSchemaError extends Error {
  override readonly name = 'CatalogSchemaError';
}

const ALIAS_PATTERN = /^mi-[a-z0-9-]+$/;
/** The shape of a canonical id; an alias with it could collide once more periods are generated. */
const CANONICAL_ID_SHAPE = /^mi-p\d+-\d+-\d+$/;

/** The canonical id of a component from its period and characteristic ray numerators. */
export const catalogIdFor = (period: number, lower: number, upper: number): string =>
  `mi-p${period}-${lower}-${upper}`;

/** 2^period - 1, the denominator of every characteristic angle of that period. */
export const rayModulus = (period: number): number => 2 ** period - 1;

type Json = Readonly<Record<string, unknown>>;

const fail = (where: string, problem: string): never => {
  throw new CatalogSchemaError(`${where}: ${problem}`);
};

const isRecord = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const record = (value: unknown, where: string): Json =>
  isRecord(value) ? value : fail(where, 'must be an object');

const integer = (value: unknown, where: string, min: number, max: number): number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
    ? value
    : fail(where, `must be an integer in [${min}, ${max}]`);

const finite = (value: unknown, where: string): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fail(where, 'must be finite');

const nonNegative = (value: unknown, where: string): number => {
  const number = finite(value, where);
  return number >= 0 ? number : fail(where, 'must not be negative');
};

const text = (value: unknown, where: string): string =>
  typeof value === 'string' && value.trim() !== ''
    ? value
    : fail(where, 'must be a non-empty string');

const array = (value: unknown, where: string): readonly unknown[] =>
  Array.isArray(value) ? value : fail(where, 'must be an array');

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

const parseMethods = (value: unknown): Readonly<Record<string, string>> => {
  const methods = record(value, 'methods');
  return Object.fromEntries(
    Object.entries(methods).map(([key, description]) => [key, text(description, `methods.${key}`)]),
  );
};

const parseProvenance = (value: unknown): Readonly<Record<string, CatalogProvenance>> => {
  const table = record(value, 'provenance');
  return Object.fromEntries(
    Object.entries(table).map(([key, raw]) => {
      const entry = record(raw, `provenance.${key}`);
      return [
        key,
        {
          generator: text(entry['generator'], `provenance.${key}.generator`),
          arguments: text(entry['arguments'], `provenance.${key}.arguments`),
          curated: text(entry['curated'], `provenance.${key}.curated`),
        },
      ];
    }),
  );
};

const parseInternalAddress = (value: unknown, period: number, where: string): number[] => {
  const address = array(value, where).map((step, index) =>
    integer(step, `${where}[${index}]`, 1, period),
  );
  const increasing = address.every(
    (step, index) => index === 0 || step > (address[index - 1] ?? 0),
  );
  if (address[0] !== 1 || address.at(-1) !== period || !increasing) {
    fail(where, `must rise strictly from 1 to the period ${period}`);
  }
  return address;
};

const parseRotation = (value: unknown, where: string): RationalAngle => {
  const rotation = record(value, where);
  const denominator = integer(rotation['denominator'], `${where}.denominator`, 2, 2 ** 30);
  const numerator = integer(rotation['numerator'], `${where}.numerator`, 1, denominator - 1);
  if (gcd(numerator, denominator) !== 1) fail(where, 'must be in lowest terms');
  return { numerator, denominator };
};

const parseAngledAddress = (
  value: unknown,
  address: readonly number[],
  where: string,
): AngledAddressStep[] => {
  const steps = array(value, where);
  if (steps.length !== address.length - 1) fail(where, 'must have one step per address arrow');
  return steps.map((raw, index) => {
    const step = record(raw, `${where}[${index}]`);
    if (step['fromPeriod'] !== address[index] || step['toPeriod'] !== address[index + 1]) {
      fail(`${where}[${index}]`, 'must follow the internal address');
    }
    return {
      fromPeriod: address[index] ?? 0,
      toPeriod: address[index + 1] ?? 0,
      rotation: parseRotation(step['rotation'], `${where}[${index}].rotation`),
    };
  });
};

const parseRays = (
  value: unknown,
  period: number,
  where: string,
): readonly [RationalAngle, RationalAngle] => {
  const rays = array(value, where);
  const modulus = rayModulus(period);
  if (rays.length !== 2) fail(where, 'must hold exactly two angles');
  const [lower, upper] = rays.map((raw, index) => {
    const ray = record(raw, `${where}[${index}]`);
    if (ray['denominator'] !== modulus)
      fail(`${where}[${index}]`, `denominator must be ${modulus}`);
    return {
      numerator: integer(ray['numerator'], `${where}[${index}].numerator`, 1, modulus - 1),
      denominator: modulus,
    };
  });
  if (lower === undefined || upper === undefined || lower.numerator >= upper.numerator) {
    return fail(where, 'must list the lower angle first');
  }
  return [lower, upper];
};

const parseResidual = (value: unknown, period: number, where: string): CatalogResidual => {
  const residual = record(value, where);
  const base = {
    orbitAbs: nonNegative(residual['orbitAbs'], `${where}.orbitAbs`),
    centerError: nonNegative(residual['centerError'], `${where}.centerError`),
  };
  const divisor = residual['properDivisorOrbitMinAbs'];
  if (period === 1) {
    return divisor === undefined ? base : fail(where, 'period 1 has no proper divisor residual');
  }
  return {
    ...base,
    properDivisorOrbitMinAbs: nonNegative(divisor, `${where}.properDivisorOrbitMinAbs`),
  };
};

const parseAliases = (value: unknown, where: string): string[] =>
  value === undefined
    ? []
    : array(value, where).map((alias, index) =>
        typeof alias === 'string' && ALIAS_PATTERN.test(alias) && !CANONICAL_ID_SHAPE.test(alias)
          ? alias
          : fail(
              `${where}[${index}]`,
              'must look like mi-<lowercase words> and not like a canonical id (mi-p<p>-<a>-<b>)',
            ),
      );

const isControlCharacter = (character: string): boolean => {
  const code = character.codePointAt(0) ?? 0;
  return code < 0x20 || code === 0x7f;
};

const parseAnnotation = (value: unknown, where: string): { annotation?: string } => {
  if (value === undefined) return {};
  const annotation = text(value, where);
  // Code points, as Python's len() counts them in tools/generate_catalog.py.
  const characters = Array.from(annotation);
  if (annotation !== annotation.trim()) fail(where, 'must not start or end with white space');
  if (characters.some(isControlCharacter)) fail(where, 'must not contain control characters');
  if (characters.length > ANNOTATION_MAX_LENGTH) {
    fail(where, `must be at most ${ANNOTATION_MAX_LENGTH} characters`);
  }
  return { annotation };
};

const parseCombinatorics = (
  entry: Json,
  period: number,
  where: string,
): Pick<CatalogComponent, 'internalAddress' | 'angledInternalAddress' | 'characteristicRays'> => {
  const internalAddress = parseInternalAddress(
    entry['internalAddress'],
    period,
    `${where}.internalAddress`,
  );
  if (period === 1) {
    if (entry['angledInternalAddress'] !== undefined || entry['characteristicRays'] !== undefined) {
      fail(where, 'the main cardioid has no angled address or ray pair');
    }
    return { internalAddress };
  }
  return {
    internalAddress,
    angledInternalAddress: parseAngledAddress(
      entry['angledInternalAddress'],
      internalAddress,
      `${where}.angledInternalAddress`,
    ),
    characteristicRays: parseRays(
      entry['characteristicRays'],
      period,
      `${where}.characteristicRays`,
    ),
  };
};

const parseComponent = (
  raw: unknown,
  index: number,
  context: Pick<Catalog, 'maxPeriod' | 'methods' | 'provenance'>,
): CatalogComponent => {
  const where = `components[${index}]`;
  const entry = record(raw, where);
  const id = text(entry['id'], `${where}.id`);
  const period = integer(entry['period'], `${where}.period`, 1, context.maxPeriod);
  const combinatorics = parseCombinatorics(entry, period, where);
  const rays = combinatorics.characteristicRays;
  const expectedId =
    rays === undefined
      ? catalogIdFor(1, 0, 1)
      : catalogIdFor(period, rays[0].numerator, rays[1].numerator);
  if (id !== expectedId)
    fail(`${where}.id`, `must be ${expectedId}, derived from the period and rays`);
  const center = record(entry['center'], `${where}.center`);
  const method = text(entry['method'], `${where}.method`);
  const provenance = text(entry['provenance'], `${where}.provenance`);
  if (!(method in context.methods)) fail(`${where}.method`, `unknown method ${method}`);
  if (!(provenance in context.provenance))
    fail(`${where}.provenance`, `unknown provenance ${provenance}`);
  return {
    id,
    aliases: parseAliases(entry['aliases'], `${where}.aliases`),
    label: text(entry['label'], `${where}.label`),
    ...parseAnnotation(entry['annotation'], `${where}.annotation`),
    center: {
      re: finite(center['re'], `${where}.center.re`),
      im: finite(center['im'], `${where}.center.im`),
    },
    centerPrecisionDigits: integer(
      entry['centerPrecisionDigits'],
      `${where}.centerPrecisionDigits`,
      1,
      17,
    ),
    period,
    ...combinatorics,
    residual: parseResidual(entry['residual'], period, `${where}.residual`),
    method,
    provenance,
  };
};

/** One pass with a set: the period ≤12 core has 4,016 entries (PHASE2-TODO item 7). */
const requireUniqueNames = (components: readonly CatalogComponent[]): void => {
  const seen = new Set<string>();
  for (const name of components.flatMap((component) => [component.id, ...component.aliases])) {
    if (seen.has(name)) fail('components', `id or alias ${name} is not unique`);
    seen.add(name);
  }
};

/** Validates a parsed catalog file against schema v2; throws CatalogSchemaError. */
export const parseCatalog = (raw: unknown): Catalog => {
  const root = record(raw, 'catalog');
  if (root['schemaVersion'] !== CATALOG_SCHEMA_VERSION_2) {
    fail('schemaVersion', `must be ${CATALOG_SCHEMA_VERSION_2}`);
  }
  if (root['license'] !== 'CC0-1.0') fail('license', 'must be CC0-1.0');
  const context = {
    maxPeriod: integer(root['maxPeriod'], 'maxPeriod', 1, MAX_CATALOG_PERIOD),
    methods: parseMethods(root['methods']),
    provenance: parseProvenance(root['provenance']),
  };
  const components = array(root['components'], 'components').map((entry, index) =>
    parseComponent(entry, index, context),
  );
  if (components.length === 0) fail('components', 'must not be empty');
  requireUniqueNames(components);
  return { schemaVersion: 2, license: 'CC0-1.0', ...context, components };
};
