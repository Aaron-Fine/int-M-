/**
 * Packed status+period output (plan section 5 renderer-path efficiency
 * details): status in the high 8 bits, primitive period (<= 2^24 - 1) in
 * the low 24 bits of one Uint32 per pixel, merging the two semantic stores
 * into one.
 *
 * Frozen encoding (poc-packed-1.0.0):
 * - bits 24..31: status code (0 reserved so no pixel can encode "status
 *   zero with a period"; 1 escaped; 2 attracting; 3 unresolved), matching
 *   the production status-channel convention exercised in the pr2
 *   microbench.
 * - bits 0..23: primitive period; escaped and unresolved pixels carry 0.
 * - A period >= 2^24 throws: the systematic profiles cap at 64 and the
 *   opportunistic ceiling at 96, so this only fires on a harness bug.
 *
 * In production the kernel writes the word directly into the zero-copy
 * semantic frame; in this harness the runner packs at the result boundary
 * (kernels/shared.ts:KernelResult consumers), asserts round-trip identity
 * for every classification, and measures the byte saving against the
 * current two-field layout (Uint8 status + Uint32 period = 5 B/pixel vs
 * 4 B/pixel) on a 1024^2 raster slice.
 */

export const PACKED_OUTPUT_REVISION = 'poc-packed-1.0.0';

/** Frozen status codes (0 reserved so a zero word is never valid). */
export const PACK_STATUS_CODES = Object.freeze({
  reserved: 0,
  escaped: 1,
  attracting: 2,
  unresolved: 3,
} as const);

export const PACK_PERIOD_BITS = 24;
export const PACK_PERIOD_MAX = (1 << PACK_PERIOD_BITS) - 1;

export type PackableStatus = 'attracting' | 'escaped' | 'unresolved';

const statusCodeOf = (status: PackableStatus): number => {
  switch (status) {
    case 'escaped':
      return PACK_STATUS_CODES.escaped;
    case 'attracting':
      return PACK_STATUS_CODES.attracting;
    case 'unresolved':
      return PACK_STATUS_CODES.unresolved;
  }
};

const statusOfCode = (code: number): PackableStatus => {
  switch (code) {
    case PACK_STATUS_CODES.escaped:
      return 'escaped';
    case PACK_STATUS_CODES.attracting:
      return 'attracting';
    case PACK_STATUS_CODES.unresolved:
      return 'unresolved';
    default:
      throw new Error(`invalid packed status code ${code}`);
  }
};

/** Pack status and primitive period into one Uint32 word. */
export const packStatusPeriod = (status: PackableStatus, period: number): number => {
  if (!Number.isInteger(period) || period < 0 || period > PACK_PERIOD_MAX) {
    throw new Error(`period ${period} does not fit ${PACK_PERIOD_BITS} bits`);
  }
  if (status !== 'attracting' && period !== 0) {
    throw new Error(`non-attracting status ${status} must pack period 0`);
  }
  return (statusCodeOf(status) << PACK_PERIOD_BITS) | period;
};

export const unpackStatus = (word: number): PackableStatus =>
  statusOfCode(word >>> PACK_PERIOD_BITS);

export const unpackPeriod = (word: number): number => word & PACK_PERIOD_MAX;
