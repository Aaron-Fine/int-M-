/** Frozen-corpus access for the judge: cases, quality profiles, render specs. */
import corpusJson from '../corpus.v1.json';
import type { RasterSize, Viewport } from '../../../src/domain';
import { getQualityProfile } from '../../../src/ui/view-state';
import type { CaseRenderSpec, QualityProfileName } from '../candidates/types';

export interface CorpusCase {
  readonly id: string;
  readonly caseClass: string;
  readonly designation: string;
  readonly profile: QualityProfileName;
  readonly viewport: Viewport;
}

interface RawCase {
  readonly id: string;
  readonly class: string;
  readonly designation: string;
  readonly profile: QualityProfileName;
  readonly center: { readonly re: string; readonly im: string };
  readonly spanY: string;
}

interface RawRaster {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly role: string;
}

/** The product's raster (docs/verification/PERFORMANCE-CORPUS.md: shipping-1024x640). */
export const SHIPPING_RASTER: RasterSize = (() => {
  const raster = (corpusJson.rasters as readonly RawRaster[]).find((r) => r.role === 'shipping');
  if (raster === undefined) throw new Error('corpus has no shipping raster');
  return { width: raster.width, height: raster.height };
})();

export const loadCorpusCases = (): readonly CorpusCase[] =>
  (corpusJson.cases as readonly RawCase[]).map((raw) => ({
    id: raw.id,
    caseClass: raw.class,
    designation: raw.designation,
    profile: raw.profile,
    // Parsed once from exact decimal strings, as the corpus spec requires.
    viewport: {
      center: { re: Number(raw.center.re), im: Number(raw.center.im) },
      spanY: Number(raw.spanY),
    },
  }));

export const profileQuality = (profile: QualityProfileName): CaseRenderSpec['quality'] => {
  const id = profile.toLowerCase() as 'quick' | 'balanced' | 'detailed';
  return getQualityProfile(id).quality;
};

export interface SpecFlags {
  readonly diagnostics: boolean;
  readonly collectCounters: boolean;
}

export const makeSpec = (
  corpusCase: CorpusCase,
  size: RasterSize,
  flags: SpecFlags,
): CaseRenderSpec => ({
  caseId: corpusCase.id,
  caseClass: corpusCase.caseClass,
  viewport: corpusCase.viewport,
  size,
  profile: corpusCase.profile,
  quality: profileQuality(corpusCase.profile),
  diagnostics: flags.diagnostics,
  collectCounters: flags.collectCounters,
});

export const parseRaster = (text: string): RasterSize => {
  const match = /^(\d+)x(\d+)$/.exec(text);
  if (match === null) throw new RangeError(`raster must look like 512x384, got "${text}"`);
  return { width: Number(match[1]), height: Number(match[2]) };
};

export const rasterLabel = (size: RasterSize): string => `${size.width}x${size.height}`;
