import { describe, expect, it } from 'vitest';

import {
  SemanticFrameStore,
  semanticRequestKey,
  type DynamicsRenderRequest,
  type SemanticFrame,
} from '../../../src/render';

const request: DynamicsRenderRequest = {
  viewport: { center: { re: -0.5, im: 0 }, spanY: 3 },
  size: { width: 8, height: 6 },
};

const frame = (stage: SemanticFrame['stage']): SemanticFrame => ({
  stage,
  size: request.size,
  sampleStride: stage === 'coarse' ? 4 : 1,
  status: new Uint8Array(48),
  period: new Uint32Array(48),
  smoothIterationOrMultiplierMagnitude: new Float64Array(48),
  multiplierAngle: new Float64Array(48),
  progress: stage === 'coarse' ? 0.2 : 1,
});

describe('SemanticFrameStore', () => {
  it('normalizes omitted and explicit default quality into the same key', () => {
    expect(semanticRequestKey(request)).toBe(
      semanticRequestKey({
        ...request,
        quality: { maxIterations: 512, maxPeriod: 32, coarseStride: 8 },
      }),
    );
  });

  it('invalidates on viewport, raster, and quality changes', () => {
    const key = semanticRequestKey(request);
    expect(
      semanticRequestKey({
        ...request,
        viewport: { ...request.viewport, spanY: 2 },
      }),
    ).not.toBe(key);
    expect(
      semanticRequestKey({
        ...request,
        size: { ...request.size, width: 9 },
      }),
    ).not.toBe(key);
    expect(
      semanticRequestKey({
        ...request,
        quality: { maxIterations: 1024 },
      }),
    ).not.toBe(key);
  });

  it('keeps the default key byte-identical and scopes it by classifier mode when present', () => {
    const defaultKey = semanticRequestKey(request);
    expect(defaultKey).not.toContain('cm:');

    const checkpointKey = semanticRequestKey({ ...request, classifierMode: 'checkpoint' });
    expect(checkpointKey).not.toBe(defaultKey);
    expect(checkpointKey).toBe(semanticRequestKey({ ...request, classifierMode: 'checkpoint' }));
    expect(semanticRequestKey({ ...request, classifierMode: 'differential' })).not.toBe(
      checkpointKey,
    );

    const store = new SemanticFrameStore();
    const stable = frame('stable');
    store.put({ ...request, classifierMode: 'checkpoint' }, stable);
    expect(store.get(request)).toBeUndefined();
    expect(store.get({ ...request, classifierMode: 'checkpoint' })).toBe(stable);
  });

  it('retains only stable semantic evidence', () => {
    const store = new SemanticFrameStore();
    store.put(request, frame('coarse'));
    expect(store.get(request)).toBeUndefined();

    const stable = frame('stable');
    store.put(request, stable);
    expect(store.get(request)).toBe(stable);
  });
});
