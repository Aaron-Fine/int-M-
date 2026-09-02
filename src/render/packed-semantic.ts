/**
 * Packed status+period output (plan §5 renderer-path efficiency detail,
 * adopted together with zero-copy output). Status and primitive period share
 * one Uint32 per pixel, merging the two semantic stores into one and saving
 * 1 byte per pixel (1 MiB per 1024² frame) plus copy traffic.
 *
 * Frozen encoding (poc-packed-1.0.0, mirroring the PoC harness):
 * - bits 24..31: status code — 0 reserved (a zero word is never valid), 1
 *   escaped, 2 attracting, 3 unresolved. The production semantic status
 *   channel (0 unresolved, 1 escaped, 2 attracting) maps 3 -> 0 on decode.
 * - bits 0..23: primitive period; escaped and unresolved pixels carry 0.
 * - A period >= 2^24 throws: the systematic profiles cap far below this, so
 *   this only fires on a kernel bug.
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

/** Production semantic status code (0 unresolved, 1 escaped, 2 attracting). */
export type SemanticStatusCodePacked = 0 | 1 | 2;

const packedCodeOf = (status: SemanticStatusCodePacked): number =>
  status === 0 ? PACK_STATUS_CODES.unresolved : status;

/** Packs a production status code and primitive period into one Uint32. */
export const packStatusPeriod = (status: SemanticStatusCodePacked, period: number): number => {
  if (!Number.isInteger(period) || period < 0 || period > PACK_PERIOD_MAX) {
    throw new Error(`period ${period} does not fit ${PACK_PERIOD_BITS} bits`);
  }
  if (status !== 2 && period !== 0) {
    throw new Error(`non-attracting status ${status} must pack period 0`);
  }
  return (packedCodeOf(status) << PACK_PERIOD_BITS) | period;
};

/** Decodes the production status code from a packed word. */
export const unpackStatus = (word: number): SemanticStatusCodePacked => {
  const code = word >>> PACK_PERIOD_BITS;
  switch (code) {
    case PACK_STATUS_CODES.escaped:
      return 1;
    case PACK_STATUS_CODES.attracting:
      return 2;
    case PACK_STATUS_CODES.unresolved:
      return 0;
    default:
      throw new Error(`invalid packed status code ${code}`);
  }
};

/** Decodes the primitive period from a packed word (0 unless attracting). */
export const unpackPeriod = (word: number): number => word & PACK_PERIOD_MAX;
