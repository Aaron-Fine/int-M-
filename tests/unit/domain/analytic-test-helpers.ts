import { createOrbitSample, type OrbitSample } from '../../../src/domain';
import type { DDOracleCycle } from './dd-oracle';

const STEP_BITS = new DataView(new ArrayBuffer(8));

/**
 * The double `ulps` steps above a finite nonzero `value` (below it for
 * negative `ulps`), for either sign of `value`, as long as the steps do not
 * cross zero.
 */
export const stepUlps = (value: number, ulps: number): number => {
  STEP_BITS.setFloat64(0, value);
  STEP_BITS.setBigInt64(0, STEP_BITS.getBigInt64(0) + BigInt(value < 0 ? -ulps : ulps));
  return STEP_BITS.getFloat64(0);
};

/** |lambda_production - lambda_dd| from magnitude and angle. */
export const multiplierDistance = (
  production: { readonly multiplierMagnitude: number; readonly multiplierAngle: number },
  cycle: DDOracleCycle,
): number =>
  Math.hypot(
    production.multiplierMagnitude * Math.cos(production.multiplierAngle) -
      cycle.magnitude * Math.cos(cycle.angle),
    production.multiplierMagnitude * Math.sin(production.multiplierAngle) -
      cycle.magnitude * Math.sin(cycle.angle),
  );

/** Value of every field an analytic solve writes, in a sentinel record. */
const SENTINEL = -7;

/**
 * A record with every field an analytic solve writes set to SENTINEL, so a
 * refusal can be checked to leave the whole record untouched.
 */
export const sentinelSample = (): OrbitSample => ({
  ...createOrbitSample(),
  status: SENTINEL as OrbitSample['status'],
  iterations: SENTINEL,
  evidence: SENTINEL,
  period: SENTINEL,
  multiplierRe: SENTINEL,
  multiplierIm: SENTINEL,
  multiplierMagnitude: SENTINEL,
  multiplierAngle: SENTINEL,
});
