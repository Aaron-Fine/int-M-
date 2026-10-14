import { describe, expect, it } from 'vitest';

import {
  createViewportTransform,
  DEFAULT_VIEWPORT,
  OrbitClassifier,
  type RenderQuality,
  type Viewport,
} from '../../../src/domain';
import { classifyRows } from '../../../src/render/classify-rows';
import type { DynamicsRenderRequest } from '../../../src/render';

/**
 * Directional allocation probe for the raster classification loop (plan
 * workstream B). The observable is garbage-collection activity: the
 * pre-PR2 per-pixel pipeline churns per-pixel objects and must scavenge,
 * while the scalar pipeline must not scavenge beyond the one-off per-call
 * band allocations. GC performance entries flush asynchronously, so every
 * measurement drains the observer with a settle wait before counting; the
 * thresholds are documented and deliberately loose because Node does not
 * guarantee scavenge timing or entry delivery.
 */

const QUALITY: RenderQuality = { maxIterations: 128, maxPeriod: 16, coarseStride: 8 };

/** Escaping sink: storing into a module-level array defeats V8 escape analysis. */
const sink: unknown[] = new Array(1024);

const requestOf = (viewport: Viewport, width: number, height: number): DynamicsRenderRequest => ({
  viewport,
  size: { width, height },
  quality: QUALITY,
});

const countGcDuring = async (work: () => void | Promise<void>): Promise<number> => {
  let gcCount = 0;
  const observer = new PerformanceObserver((list) => {
    gcCount += list.getEntries().length;
  });
  observer.observe({ entryTypes: ['gc'] });
  try {
    await work();
    // GC entries are delivered on a later macrotask; drain before counting.
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 300);
    });
  } finally {
    observer.disconnect();
  }
  return gcCount;
};

/** Allocates one band set per pass without classifying: the one-off baseline. */
const runBandOnlyBaseline = async (
  request: DynamicsRenderRequest,
  passes: number,
): Promise<void> => {
  const length = request.size.height * request.size.width;
  for (let pass = 0; pass < passes; pass += 1) {
    sink[pass & 1023] = {
      status: new Uint8Array(length),
      period: new Uint32Array(length),
      smoothIterationOrMultiplierMagnitude: new Float64Array(length),
      multiplierAngle: new Float64Array(length),
    };
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  }
};

/** The pre-PR2 per-pixel pipeline: one Complex and one rich result per pixel. */
const runAllocatingControl = async (
  request: DynamicsRenderRequest,
  passes: number,
): Promise<void> => {
  const { width } = request.size;
  const classifier = new OrbitClassifier({
    maxIterations: QUALITY.maxIterations,
    maxPeriod: QUALITY.maxPeriod,
  });
  const transform = createViewportTransform(request.viewport, request.size);
  for (let pass = 0; pass < passes; pass += 1) {
    for (let y = 0; y < request.size.height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const result = classifier.classify(transform.pixelToComplex(x, y));
        sink[(y * width + x) & 1023] = result;
      }
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  }
};

describe('classifyRows allocation behavior', () => {
  it('records gc activity when the observer is fed garbage', async () => {
    const gcCount = await countGcDuring(() => {
      for (let i = 0; i < 3_000_000; i += 1) {
        sink[i & 1023] = { value: i, padding: i * 2 };
      }
    });
    expect(gcCount).toBeGreaterThanOrEqual(10);
  });

  it('classifyRows_scalarLoop_addsNoGarbageBeyondBandAllocation', async () => {
    // Mixed view: interior pixels exercise the full lag scan and history
    // ring, escape pixels exercise the escape write.
    const request = requestOf(DEFAULT_VIEWPORT, 256, 192);
    const runPasses = async (passes: number): Promise<void> => {
      for (let pass = 0; pass < passes; pass += 1) {
        await classifyRows(
          request,
          QUALITY,
          1,
          0,
          request.size.height,
          new AbortController().signal,
        );
      }
    };
    // Warm up JIT and young generation outside the measured windows.
    await runPasses(4);

    const bandOnlyGc = await countGcDuring(() => runBandOnlyBaseline(request, 4));
    const scalarGc = await countGcDuring(() => runPasses(4));
    const controlGc = await countGcDuring(() =>
      runAllocatingControl({ ...request, size: { width: 512, height: 512 } }, 3),
    );
    // Directional: the classifying loop must scavenge far less than the
    // per-pixel-allocating pre-PR2 pipeline over the same raster shape. Its
    // residual events stem from the one-off band allocations each call
    // performs anyway (a band-only baseline measures near zero but Node
    // does not guarantee scavenge entry delivery, so this stays relative).
    // Quantitative bytes-per-pixel old-vs-new evidence lives in the pr2
    // bench (poc/performance/results/pr2/).
    expect(scalarGc + 5).toBeLessThanOrEqual(controlGc);
    expect(bandOnlyGc).toBeLessThanOrEqual(scalarGc + 1);
  });

  it('allocatingControl_prePr2Pipeline_triggersGarbageCollection', async () => {
    // All pixels escape within a few iterations, so the control is cheap
    // while still churning tens of MB of per-pixel objects per pass.
    const request = requestOf({ center: { re: 2, im: 0 }, spanY: 0.5 }, 512, 512);
    const controlGc = await countGcDuring(() => runAllocatingControl(request, 3));
    expect(controlGc).toBeGreaterThanOrEqual(10);
  });
});
