import type { RenderQuality } from '../domain';
import type { DynamicsRenderRequest, SemanticFrame } from './renderer';
import { resolveRenderQuality } from './renderer';

const SEMANTIC_ALGORITHM_VERSION = 1;

const qualityKey = (quality: RenderQuality): string =>
  `${quality.maxIterations}:${quality.maxPeriod}:${quality.coarseStride}`;

export const semanticRequestKey = (request: DynamicsRenderRequest): string => {
  const quality = resolveRenderQuality(request.quality);
  return [
    SEMANTIC_ALGORITHM_VERSION,
    request.viewport.center.re,
    request.viewport.center.im,
    request.viewport.spanY,
    request.size.width,
    request.size.height,
    qualityKey(quality),
  ].join('|');
};

/**
 * A deliberately single-entry store: interaction only needs the current stable
 * viewport, and bounding it avoids an unreviewed browser-memory cache policy.
 */
export class SemanticFrameStore {
  #key: string | undefined;
  #frame: SemanticFrame | undefined;

  public get(request: DynamicsRenderRequest): SemanticFrame | undefined {
    return this.#key === semanticRequestKey(request) ? this.#frame : undefined;
  }

  public put(request: DynamicsRenderRequest, frame: SemanticFrame): void {
    if (frame.stage !== 'stable') return;
    this.#key = semanticRequestKey(request);
    this.#frame = frame;
  }
}
