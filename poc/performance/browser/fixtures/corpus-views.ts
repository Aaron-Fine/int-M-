import corpusJson from '../../../../tools/benchmark/corpus.v1.json' with { type: 'json' };
import type { Viewport } from '../../../../src/domain';
import type { QualityProfileId } from './microbench-api';

/**
 * Access to the frozen benchmark corpus (tools/benchmark/corpus.v1.json,
 * PR 1). Coordinates are exact decimal strings; conversion to binary64
 * happens here and only here, so every measurement uses the same records.
 */
interface RawCorpusCase {
  readonly id: string;
  readonly class: string;
  readonly center: { readonly re: string; readonly im: string };
  readonly spanY: string;
  readonly profile: string;
  readonly designation: string;
}

const corpus = corpusJson as unknown as { readonly cases: readonly RawCorpusCase[] };

export interface CorpusCase {
  readonly id: string;
  corpusClass: string;
  readonly viewport: Viewport;
  readonly profileId: QualityProfileId;
  readonly designation: string;
  /**
   * Exact decimal strings from the frozen manifest, for measurements that
   * must assemble a derived viewport (e.g. a conjugate-symmetric variant)
   * from the same records instead of restating decimals in a spec.
   */
  readonly raw: {
    readonly centerRe: string;
    readonly centerIm: string;
    readonly spanY: string;
  };
}

export const getCorpusCase = (caseId: string): CorpusCase => {
  const found = corpus.cases.find((candidate) => candidate.id === caseId);
  if (found === undefined) {
    throw new Error(`case ${caseId} is not in tools/benchmark/corpus.v1.json`);
  }
  const profileId = found.profile.toLowerCase();
  if (profileId !== 'balanced' && profileId !== 'detailed' && profileId !== 'quick') {
    throw new Error(`case ${caseId} has unknown profile ${found.profile}`);
  }
  return {
    id: found.id,
    corpusClass: found.class,
    viewport: {
      center: { re: Number(found.center.re), im: Number(found.center.im) },
      spanY: Number(found.spanY),
    },
    profileId,
    designation: found.designation,
    raw: { centerRe: found.center.re, centerIm: found.center.im, spanY: found.spanY },
  };
};
