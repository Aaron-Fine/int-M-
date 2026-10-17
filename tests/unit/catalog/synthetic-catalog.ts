import {
  catalogIdFor,
  parseCatalog,
  rayModulus,
  type Catalog,
  type CatalogComponent,
} from '../../../src/catalog/components';

/**
 * A synthetic catalog with the shape of PHASE2-TODO item 7's period ≤12 core:
 * the true number of components per period, unique ray-derived ids and
 * generated labels. The ray pairs and centres are NOT the real ones (the real
 * core is item 7's generator): exact-period angles are paired in ascending
 * order, and each centre sits just outside the main cardioid at its pair's
 * mid-angle, pushed out further for lower periods. Conjugate pairs mirror
 * each other. It exists to test scale: the loader, the catalog order, the
 * viewport index and the marker density policy.
 */

/** Hyperbolic components of exact period p (OEIS A000740), p = 1..12; 4,016 in all. */
export const COMPONENT_COUNTS = [1, 1, 3, 6, 15, 27, 63, 120, 252, 495, 1023, 2010] as const;

const properDivisors = (n: number): number[] =>
  Array.from({ length: n - 1 }, (_, index) => index + 1).filter((d) => n % d === 0);

/** Numerators k of the angles k / (2^p − 1) of exact period p under doubling, ascending. */
export const exactPeriodNumerators = (period: number): number[] => {
  const modulus = rayModulus(period);
  // k / (2^p − 1) has period d | p exactly when (2^p − 1) / (2^d − 1) divides k.
  const steps = properDivisors(period).map((divisor) => modulus / rayModulus(divisor));
  return Array.from({ length: modulus - 1 }, (_, index) => index + 1).filter((numerator) =>
    steps.every((step) => numerator % step !== 0),
  );
};

/** Synthetic ray pairs: consecutive exact-period angles, (k0, k1), (k2, k3), … */
const syntheticPairs = (period: number): [number, number][] => {
  const numerators = exactPeriodNumerators(period);
  return Array.from({ length: numerators.length / 2 }, (_, index) => [
    numerators[2 * index] ?? 0,
    numerators[2 * index + 1] ?? 0,
  ]);
};

/** A point outside the main cardioid at the pair's mid-angle. */
const syntheticCentre = (period: number, lower: number, upper: number) => {
  const turn = (2 * Math.PI * (lower + upper)) / (2 * rayModulus(period));
  const re = Math.cos(turn) / 2 - Math.cos(2 * turn) / 4;
  const im = Math.sin(turn) / 2 - Math.sin(2 * turn) / 4;
  const push = 1 + 0.6 / period;
  return { re: -0.25 + (re + 0.25) * push, im: im * push };
};

const rawEntry = (period: number, lower: number, upper: number): Record<string, unknown> => {
  const modulus = rayModulus(period);
  return {
    id: catalogIdFor(period, lower, upper),
    label: `Period ${period}, rays ${lower}/${modulus} and ${upper}/${modulus}`,
    period,
    center: syntheticCentre(period, lower, upper),
    centerPrecisionDigits: 16,
    internalAddress: [1, period],
    angledInternalAddress: [
      { fromPeriod: 1, toPeriod: period, rotation: { numerator: 1, denominator: period } },
    ],
    characteristicRays: [
      { numerator: lower, denominator: modulus },
      { numerator: upper, denominator: modulus },
    ],
    residual: { orbitAbs: 0, centerError: 0, properDivisorOrbitMinAbs: 1 },
    method: 'synthetic',
    provenance: 'synthetic',
  };
};

/** The raw (unparsed) synthetic catalog through `maxPeriod`. */
export const syntheticCatalogData = (maxPeriod = 12): Record<string, unknown> => ({
  schemaVersion: 2,
  license: 'CC0-1.0',
  maxPeriod,
  methods: { synthetic: 'Synthetic test data with real per-period counts; not centres.' },
  provenance: {
    synthetic: {
      generator: 'tests/unit/catalog/synthetic-catalog.ts',
      arguments: `maxPeriod ${maxPeriod}`,
      curated: 'none',
    },
  },
  components: [
    {
      id: 'mi-p1-0-1',
      label: 'Main cardioid',
      period: 1,
      center: { re: 0, im: 0 },
      centerPrecisionDigits: 16,
      internalAddress: [1],
      residual: { orbitAbs: 0, centerError: 0 },
      method: 'synthetic',
      provenance: 'synthetic',
    },
    ...Array.from({ length: maxPeriod - 1 }, (_, index) => index + 2).flatMap((period) =>
      syntheticPairs(period).map(([lower, upper]) => rawEntry(period, lower, upper)),
    ),
  ],
});

/** The synthetic catalog through `maxPeriod`, validated by the production loader. */
export const syntheticCatalog = (maxPeriod = 12): Catalog =>
  parseCatalog(syntheticCatalogData(maxPeriod));

/** One hand-placed component for geometry tests (not validated). */
export const testComponent = (
  period: number,
  lower: number,
  upper: number,
  center: { re: number; im: number },
  label = `Period ${period}, rays ${lower}/${rayModulus(period)} and ${upper}/${rayModulus(period)}`,
): CatalogComponent => ({
  id: period === 1 ? catalogIdFor(1, 0, 1) : catalogIdFor(period, lower, upper),
  aliases: [],
  label,
  center,
  centerPrecisionDigits: 16,
  period,
  internalAddress: period === 1 ? [1] : [1, period],
  ...(period === 1
    ? {}
    : {
        characteristicRays: [
          { numerator: lower, denominator: rayModulus(period) },
          { numerator: upper, denominator: rayModulus(period) },
        ] as const,
      }),
  residual: { orbitAbs: 0, centerError: 0 },
  method: 'synthetic',
  provenance: 'synthetic',
});
