import { describe, expect, it } from 'vitest';
import { MIN_REGION_SIZE_PX, planRegionChain } from '../../../tools/benchmark/view-chain.mjs';
// The application's own viewport math: the planner's expectations are only
// meaningful if its replica and the app agree.
import {
  panViewport as appPanViewport,
  zoomViewportToRect as appZoomViewportToRect,
} from '../../../src/domain/viewport';

const SIZE = { width: 1024, height: 640 };
const START = { center: { re: -0.75, im: 0 }, spanY: 2.5 };

interface PlannedStep {
  readonly kind: 'pan' | 'region';
  readonly rect?: {
    readonly x1: number;
    readonly y1: number;
    readonly x2: number;
    readonly y2: number;
  };
  readonly deltaPx?: { readonly dx: number; readonly dy: number };
  readonly viewportAfter: {
    readonly center: { readonly re: number; readonly im: number };
    readonly spanY: number;
  };
}

const replayStepWithAppMath = (
  viewport: { center: { re: number; im: number }; spanY: number },
  step: PlannedStep,
) =>
  step.kind === 'pan'
    ? appPanViewport(viewport, SIZE, step.deltaPx!.dx, step.deltaPx!.dy)
    : appZoomViewportToRect(viewport, SIZE, step.rect!);

// One target per frozen corpus case. Exact decimal strings parsed exactly as
// the runner parses them (Number on the corpus string, never a source-code
// literal — several of these strings lose precision as literals).
const corpusTargets = [
  { id: 'mi-easy-default-full', re: -0.75, im: 0, spanY: 2.5 },
  { id: 'mi-easy-exterior-heavy', re: 2.5, im: 1, spanY: 2 },
  { id: 'mi-easy-main-cardioid', re: 0.1, im: 0.05, spanY: 0.2 },
  { id: 'mi-easy-period2-bulb', re: -1.05, im: 0.05, spanY: 0.15 },
  { id: 'mi-hard-rabbit-boundary', re: -0.1225611668766535, im: 0.7448617666197435, spanY: 0.3 },
  {
    id: 'mi-hard-supplied-126x',
    re: Number('-0.158902249'),
    im: Number('-1.034028'),
    spanY: Number('0.019841269841269841269'),
  },
  {
    id: 'mi-hard-supplied-609x',
    re: -1.94130973,
    im: -0.0000974722949,
    spanY: Number('0.0041050903119868637110'),
  },
  {
    id: 'mi-hard-supplied-13x',
    re: 0.305376533,
    im: 0.552677981,
    spanY: Number('0.19230769230769230769'),
  },
  {
    id: 'mi-fallback-unknown-high-period',
    re: -0.7436438870371587,
    im: 0.1318259042053119,
    spanY: 0.00001,
  },
  { id: 'mi-fallback-weak-attraction', re: -0.1205, im: 0.8268, spanY: 0.005 },
  { id: 'mi-fallback-ambiguous-boundary', re: 0.3, im: 0.008, spanY: 0.02 },
  { id: 'mi-fallback-budget-exhaustion', re: -1.401155189092, im: 0, spanY: 0.001 },
  { id: 'mi-scale-6mx-basilica-rim', re: -1.25, im: 0, spanY: Number('0.00000041666666666666667') },
];

describe('view-chain planner', () => {
  it('every planned step matches the application viewport math exactly', () => {
    for (const target of corpusTargets) {
      const { steps } = planRegionChain({ target, size: SIZE });
      let viewport = { center: { ...START.center }, spanY: START.spanY };
      for (const [index, step] of steps.entries()) {
        viewport = replayStepWithAppMath(viewport, step);
        const expected = steps[index]!.viewportAfter;
        expect(viewport.spanY, `${target.id} step ${index} span`).toBeCloseTo(expected.spanY, 12);
        expect(viewport.center.re, `${target.id} step ${index} re`).toBeCloseTo(
          expected.center.re,
          12,
        );
        expect(viewport.center.im, `${target.id} step ${index} im`).toBeCloseTo(
          expected.center.im,
          12,
        );
      }
    }
  });

  it('every planned chain lands on its corpus target through the application math', () => {
    for (const target of corpusTargets) {
      const { finalViewport } = planRegionChain({ target, size: SIZE });
      const spanError = Math.abs(finalViewport.spanY - target.spanY) / target.spanY;
      expect(spanError, `${target.id} span`).toBeLessThan(1e-12);
      expect(
        Math.max(
          Math.abs(finalViewport.center.re - target.re),
          Math.abs(finalViewport.center.im - target.im),
        ),
        `${target.id} center`,
      ).toBeLessThan(target.spanY * 1e-9);
    }
  });

  it('every region rect clears the UI minimum size and stays inside the raster', () => {
    for (const target of corpusTargets) {
      const { steps } = planRegionChain({ target, size: SIZE });
      for (const step of steps) {
        if (step.kind !== 'region') continue;
        const rect = step.rect;
        expect(Math.abs(rect.x2 - rect.x1), `${target.id} rect width`).toBeGreaterThanOrEqual(
          MIN_REGION_SIZE_PX,
        );
        expect(Math.abs(rect.y2 - rect.y1), `${target.id} rect height`).toBeGreaterThanOrEqual(
          MIN_REGION_SIZE_PX,
        );
        expect(rect.x1).toBeGreaterThanOrEqual(0);
        expect(rect.y1).toBeGreaterThanOrEqual(0);
        expect(rect.x2).toBeLessThanOrEqual(SIZE.width);
        expect(rect.y2).toBeLessThanOrEqual(SIZE.height);
      }
    }
  });

  it('pan steps only ever precede zoom steps', () => {
    for (const target of corpusTargets) {
      const kinds = planRegionChain({ target, size: SIZE }).steps.map((step) => step.kind);
      const lastPan = kinds.lastIndexOf('pan');
      const firstRegion = kinds.indexOf('region');
      if (lastPan !== -1 && firstRegion !== -1) {
        expect(lastPan, `${target.id} pan must precede zooms`).toBeLessThan(firstRegion);
      }
    }
  });

  it('rejects infeasible targets', () => {
    expect(() => planRegionChain({ target: { re: 0, im: 0, spanY: -1 }, size: SIZE })).toThrow();
    expect(() =>
      planRegionChain({ target: { re: 0, im: 0, spanY: Number.NaN }, size: SIZE }),
    ).toThrow();
    expect(() =>
      planRegionChain({ target: { re: 0, im: 0, spanY: 1 }, size: { width: 1023.5, height: 640 } }),
    ).toThrow();
  });
});
