import { describe, expect, it } from 'vitest';

import {
  colorForAttracting,
  colorForEscaped,
  colorForUnresolved,
  modulateForMultiplierAngle,
  type Rgba,
  type SemanticView,
} from '../../../src/domain';
import { CpuRenderer, type SemanticFrame } from '../../../src/render';
import { colorizeFrame } from '../../../src/render/colorize';
import { packStatusPeriod, unpackPeriod, unpackStatus } from '../../../src/render/packed-semantic';

/**
 * Reference: the per-pixel tuple colorizer that colorizeFrame replaced
 * (CpuRenderer.colorize before the allocation-free rewrite).
 */
const referencePixel = (
  status: 0 | 1 | 2,
  period: number,
  smooth: number,
  angle: number,
  x: number,
  y: number,
  stride: number,
  view: SemanticView,
): Rgba => {
  if (status === 1) return colorForEscaped(smooth, view);
  if (status === 2) {
    const color = colorForAttracting(period, smooth, angle, view);
    return view === 'multiplier' ? modulateForMultiplierAngle(color, x, y, angle) : color;
  }
  const color = colorForUnresolved();
  const cellSize = stride === 1 ? 4 : stride;
  const offset = (Math.floor(x / cellSize) + Math.floor(y / cellSize)) % 2 === 0 ? -12 : 12;
  return [color[0] + offset, color[1] + offset, color[2] + offset, color[3]];
};

const referenceColorize = (frame: SemanticFrame, view: SemanticView): Uint8ClampedArray => {
  const { width } = frame.size;
  const rgba = new Uint8ClampedArray(width * frame.size.height * 4);
  for (const band of frame.bands) {
    for (let index = 0; index < band.packedStatusPeriod.length; index += 1) {
      const word = band.packedStatusPeriod[index] ?? 0;
      const x = index % width;
      const y = band.y0 + Math.floor(index / width);
      const color = referencePixel(
        unpackStatus(word),
        unpackPeriod(word),
        band.smoothIterationOrMultiplierMagnitude[index] ?? 0,
        band.multiplierAngle[index] ?? 0,
        x,
        y,
        frame.sampleStride,
        view,
      );
      rgba.set(color, (y * width + x) * 4);
    }
  }
  return rgba;
};

describe('colorizeFrame', () => {
  it('reproduces the per-pixel tuple colorizer byte for byte', async () => {
    const renderer = new CpuRenderer();
    const views: readonly SemanticView[] = ['stability', 'multiplier', 'period'];
    const requests = [
      { center: { re: -0.75, im: 0 }, spanY: 2.5 },
      { center: { re: -0.1225611668766535, im: 0.7448617666197435 }, spanY: 0.3 },
      { center: { re: -1.401155189092, im: 0 }, spanY: 0.001 },
    ];
    let compared = 0;
    for (const viewport of requests) {
      const frames: SemanticFrame[] = [];
      await renderer.render(
        {
          viewport,
          size: { width: 97, height: 61 },
          quality: { maxIterations: 256, maxPeriod: 16, coarseStride: 8 },
        },
        new AbortController().signal,
        (frame) => {
          frames.push(frame);
        },
      );
      for (const frame of frames) {
        for (const view of views) {
          expect(colorizeFrame(frame, view)).toEqual(referenceColorize(frame, view));
          compared += 1;
        }
      }
    }
    expect(compared).toBe(18);
  });

  it('matches on synthetic extremes of every channel', () => {
    const width = 64;
    const height = 48;
    const length = width * height;
    const packed = new Uint32Array(length);
    const primary = new Float64Array(length);
    const angle = new Float64Array(length);
    let seed = 12345;
    const random = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const specialAngles = [0, -0, Math.PI, -Math.PI, Math.PI / 2, -Math.PI / 2, 1e-300, -1e-300];
    const specialSmooth = [0, -0, -3.5, 1e-9, 27.027027027027028, 1e6, 0.5 / 0.037, -1e5];
    for (let index = 0; index < length; index += 1) {
      const status = (index % 3) as 0 | 1 | 2;
      const period = status === 2 ? 1 + (index % 300) : 0;
      packed[index] = packStatusPeriod(status, period);
      if (status === 1) {
        primary[index] =
          index % 7 === 0
            ? (specialSmooth[(index / 7) % specialSmooth.length] ?? 0)
            : -50 + 2000 * random();
      } else if (status === 2) {
        primary[index] = index % 11 === 0 ? 0 : random();
        angle[index] =
          index % 5 === 0
            ? (specialAngles[(index / 5) % specialAngles.length] ?? 0)
            : Math.PI * (2 * random() - 1);
      }
    }
    for (const stride of [1, 8]) {
      const frame = {
        stage: 'stable',
        size: { width, height },
        sampleStride: stride,
        bands: [
          {
            y0: 0,
            y1: height,
            packedStatusPeriod: packed,
            smoothIterationOrMultiplierMagnitude: primary,
            multiplierAngle: angle,
          },
        ],
        progress: 1,
      } as unknown as SemanticFrame;
      for (const view of ['stability', 'multiplier', 'period'] as const) {
        expect(colorizeFrame(frame, view)).toEqual(referenceColorize(frame, view));
      }
    }
  });
});
