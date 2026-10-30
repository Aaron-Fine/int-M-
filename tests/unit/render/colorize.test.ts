import { describe, expect, it } from 'vitest';

import {
  buildPeriodKey,
  colorForAttracting,
  colorForEscaped,
  colorForUnresolved,
  crossesMultiplierContour,
  dimColor,
  EMPTY_PERIOD_KEY,
  modulateForMultiplierAngle,
  multiplierStripePhase,
  multiplierStripeWeight,
  OTHER_PERIODS_COLOR,
  PERIOD_EMPHASIS_PALETTE,
  shadeForMultiplierContour,
  type PeriodKey,
  type Rgba,
  type SemanticView,
} from '../../../src/domain';
import { CpuRenderer, type SemanticFrame } from '../../../src/render';
import { colorizeFrame, periodHistogram } from '../../../src/render/colorize';
import {
  PACK_PERIOD_MAX,
  packStatusPeriod,
  unpackPeriod,
  unpackStatus,
} from '../../../src/render/packed-semantic';

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
  periodKey: PeriodKey,
): Rgba => {
  if (status === 1) return colorForEscaped(smooth, view);
  if (status === 2) {
    const color = colorForAttracting(period, smooth, angle, view, periodKey);
    return view === 'multiplier' ? modulateForMultiplierAngle(color, x, y, angle) : color;
  }
  const color = colorForUnresolved();
  const cellSize = stride === 1 ? 4 : stride;
  const offset = (Math.floor(x / cellSize) + Math.floor(y / cellSize)) % 2 === 0 ? -12 : 12;
  return [color[0] + offset, color[1] + offset, color[2] + offset, color[3]];
};

/** Reference histogram: one map update per attracting pixel. */
const referenceHistogram = (frame: SemanticFrame): Map<number, number> => {
  const counts = new Map<number, number>();
  for (const band of frame.bands) {
    for (const word of band.packedStatusPeriod) {
      if (unpackStatus(word) !== 2) continue;
      const period = unpackPeriod(word);
      counts.set(period, (counts.get(period) ?? 0) + 1);
    }
  }
  return counts;
};

interface ReferenceSample {
  readonly word: number;
  readonly magnitude: number;
  readonly angle: number;
}

/**
 * Reference multiplier pixel with the neighbourhood rules of semantic.ts,
 * from a whole-frame lookup rather than colorizeFrame's streaming buffers.
 */
const referenceMultiplierPixel = (
  samples: readonly ReferenceSample[],
  width: number,
  x: number,
  y: number,
  periodKey: PeriodKey,
): Rgba => {
  const here = samples[y * width + x];
  if (here === undefined) throw new Error('sample out of range');
  const phase = (sample: ReferenceSample, px: number, py: number): number =>
    multiplierStripePhase(px, py, Math.cos(sample.angle), Math.sin(sample.angle));
  const neighbours = [
    x > 0 ? { sample: samples[y * width + x - 1], px: x - 1, py: y } : undefined,
    y > 0 ? { sample: samples[(y - 1) * width + x], px: x, py: y - 1 } : undefined,
  ].filter(
    (entry): entry is { sample: ReferenceSample; px: number; py: number } =>
      entry?.sample?.word === here.word,
  );
  const step = Math.max(
    0,
    ...neighbours.map(({ sample, px, py }) => Math.abs(phase(here, x, y) - phase(sample, px, py))),
  );
  const color = modulateForMultiplierAngle(
    colorForAttracting(
      unpackPeriod(here.word),
      here.magnitude,
      here.angle,
      'multiplier',
      periodKey,
    ),
    x,
    y,
    here.angle,
    multiplierStripeWeight(step),
  );
  const onContour = neighbours.some(({ sample }) =>
    crossesMultiplierContour(here.magnitude, here.angle, sample.magnitude, sample.angle),
  );
  return onContour ? shadeForMultiplierContour(color) : color;
};

const referenceColorize = (
  frame: SemanticFrame,
  view: SemanticView,
  isolatedPeriod?: number,
): Uint8ClampedArray => {
  const { width } = frame.size;
  const rgba = new Uint8ClampedArray(width * frame.size.height * 4);
  const samples: ReferenceSample[] = [];
  for (const band of frame.bands) {
    for (let index = 0; index < band.packedStatusPeriod.length; index += 1) {
      samples[band.y0 * width + index] = {
        word: band.packedStatusPeriod[index] ?? 0,
        magnitude: band.smoothIterationOrMultiplierMagnitude[index] ?? 0,
        angle: band.multiplierAngle[index] ?? 0,
      };
    }
  }
  const periodKey =
    view === 'period' ? buildPeriodKey(referenceHistogram(frame)) : EMPTY_PERIOD_KEY;
  for (const band of frame.bands) {
    for (let index = 0; index < band.packedStatusPeriod.length; index += 1) {
      const word = band.packedStatusPeriod[index] ?? 0;
      const x = index % width;
      const y = band.y0 + Math.floor(index / width);
      const color =
        view === 'multiplier' && unpackStatus(word) === 2
          ? referenceMultiplierPixel(samples, width, x, y, periodKey)
          : referencePixel(
              unpackStatus(word),
              unpackPeriod(word),
              band.smoothIterationOrMultiplierMagnitude[index] ?? 0,
              band.multiplierAngle[index] ?? 0,
              x,
              y,
              frame.sampleStride,
              view,
              periodKey,
            );
      const dimmed =
        view === 'period' &&
        isolatedPeriod !== undefined &&
        !(unpackStatus(word) === 2 && unpackPeriod(word) === isolatedPeriod);
      rgba.set(dimmed ? dimColor(color) : color, (y * width + x) * 4);
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
        expect(periodHistogram(frame)).toEqual(referenceHistogram(frame));
        for (const view of views) {
          expect(colorizeFrame(frame, view)).toEqual(referenceColorize(frame, view));
          compared += 1;
        }
      }
    }
    expect(compared).toBe(18);
  }, 30_000);

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
      expect(periodHistogram(frame)).toEqual(referenceHistogram(frame));
      for (const view of ['stability', 'multiplier', 'period'] as const) {
        expect(colorizeFrame(frame, view)).toEqual(referenceColorize(frame, view));
      }
    }
  });
});

/** A one-band stable frame from per-pixel [status, period] pairs. */
const syntheticFrame = (
  width: number,
  pixels: readonly (readonly [0 | 1 | 2, number])[],
): SemanticFrame => {
  const length = pixels.length;
  const packed = new Uint32Array(length);
  pixels.forEach(([status, period], index) => {
    packed[index] = packStatusPeriod(status, status === 2 ? period : 0);
  });
  return {
    stage: 'stable',
    size: { width, height: length / width },
    sampleStride: 1,
    bands: [
      {
        y0: 0,
        y1: length / width,
        packedStatusPeriod: packed,
        smoothIterationOrMultiplierMagnitude: new Float64Array(length).fill(0.5),
        multiplierAngle: new Float64Array(length),
      },
    ],
    progress: 1,
  };
};

const pixelAt = (rgba: Uint8ClampedArray, index: number): readonly number[] => [
  ...rgba.slice(index * 4, index * 4 + 4),
];

describe('period view emphasis', () => {
  it('colours the five largest periods in ascending order and every other period neutral', () => {
    // Areas: p1 6, p2 5, p3 4, p4 3, p5 2, p6 1, p7 1 pixels; then 2 escaped.
    const layout: (readonly [0 | 1 | 2, number])[] = [
      ...[1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 5, 5, 6, 7].map(
        (period) => [2, period] as const,
      ),
      [1, 0],
      [1, 0],
    ];
    const frame = syntheticFrame(4, layout);
    const raster = new CpuRenderer().colorize(frame, 'period');

    expect(raster.periodKey?.emphasized.map((entry) => entry.period)).toEqual([1, 2, 3, 4, 5]);
    expect(raster.periodKey?.otherPeriodCount).toBe(2);
    expect(pixelAt(raster.rgba, 0)).toEqual(PERIOD_EMPHASIS_PALETTE[0]);
    expect(pixelAt(raster.rgba, 6)).toEqual(PERIOD_EMPHASIS_PALETTE[1]);
    expect(pixelAt(raster.rgba, 19)).toEqual(PERIOD_EMPHASIS_PALETTE[4]);
    expect(pixelAt(raster.rgba, 20)).toEqual(OTHER_PERIODS_COLOR);
    expect(pixelAt(raster.rgba, 21)).toEqual(OTHER_PERIODS_COLOR);
  });

  it('reports no key outside the period view', () => {
    const frame = syntheticFrame(2, [
      [2, 1],
      [2, 2],
    ]);
    const renderer = new CpuRenderer();

    expect(renderer.colorize(frame, 'stability')).not.toHaveProperty('periodKey');
    expect(renderer.colorize(frame, 'multiplier')).not.toHaveProperty('periodKey');
  });

  it('reports an empty key for a frame with no attracting-cycle pixels', () => {
    const frame = syntheticFrame(2, [
      [1, 0],
      [0, 0],
    ]);

    expect(new CpuRenderer().colorize(frame, 'period').periodKey).toEqual(EMPTY_PERIOD_KEY);
  });

  it('colours a period beyond the classifier ceiling from the palette', () => {
    const frame = syntheticFrame(2, [
      [2, PACK_PERIOD_MAX],
      [2, PACK_PERIOD_MAX],
    ]);
    const raster = new CpuRenderer().colorize(frame, 'period');

    expect(raster.periodKey?.emphasized).toEqual([
      { period: PACK_PERIOD_MAX, color: PERIOD_EMPHASIS_PALETTE[0], pixelCount: 2 },
    ]);
    expect(pixelAt(raster.rgba, 1)).toEqual(PERIOD_EMPHASIS_PALETTE[0]);
  });
});

describe('period isolation', () => {
  // Areas: p1 6, p2 5, p3 4, p4 3, p5 2, p6 1, p7 1; then escaped and unresolved.
  const isolationFrame = (): SemanticFrame =>
    syntheticFrame(4, [
      ...[1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 5, 5, 6, 7].map(
        (period) => [2, period] as const,
      ),
      [1, 0],
      [0, 0],
    ]);

  it('keeps the isolated period and dims every other pixel with dimColor', () => {
    const frame = isolationFrame();
    const raster = new CpuRenderer().colorize(frame, 'period', 3);

    expect(raster.isolatedPeriod).toBe(3);
    expect(pixelAt(raster.rgba, 11)).toEqual(PERIOD_EMPHASIS_PALETTE[2]);
    expect(pixelAt(raster.rgba, 0)).toEqual(dimColor(PERIOD_EMPHASIS_PALETTE[0] ?? [0, 0, 0, 0]));
    expect(pixelAt(raster.rgba, 20)).toEqual(dimColor(OTHER_PERIODS_COLOR));
    expect(raster.rgba).toEqual(referenceColorize(frame, 'period', 3));
  });

  it('isolates by period, not by colour: one grey period stays, the other grey dims', () => {
    const raster = new CpuRenderer().colorize(isolationFrame(), 'period', 6);

    expect(pixelAt(raster.rgba, 20)).toEqual(OTHER_PERIODS_COLOR);
    expect(pixelAt(raster.rgba, 21)).toEqual(dimColor(OTHER_PERIODS_COLOR));
  });

  it('leaves the period key unchanged: isolation is a palette input', () => {
    const renderer = new CpuRenderer();
    const frame = isolationFrame();

    expect(renderer.colorize(frame, 'period', 3).periodKey).toEqual(
      renderer.colorize(frame, 'period').periodKey,
    );
  });

  it('ignores isolation outside the period view', () => {
    const renderer = new CpuRenderer();
    const frame = isolationFrame();
    for (const view of ['stability', 'multiplier'] as const) {
      const raster = renderer.colorize(frame, view, 3);
      expect(raster).not.toHaveProperty('isolatedPeriod');
      expect(raster.rgba).toEqual(renderer.colorize(frame, view).rgba);
    }
  });

  it.each([-1, 0, 1.5, Number.NaN, PACK_PERIOD_MAX + 1])(
    'treats out-of-range isolated period %s as no isolation',
    (isolated) => {
      const renderer = new CpuRenderer();
      const frame = isolationFrame();
      const raster = renderer.colorize(frame, 'period', isolated);
      expect(raster).not.toHaveProperty('isolatedPeriod');
      expect(raster.rgba).toEqual(renderer.colorize(frame, 'period').rgba);
      expect(colorizeFrame(frame, 'period', undefined, isolated)).toEqual(
        colorizeFrame(frame, 'period'),
      );
    },
  );

  it('dims every pixel when the isolated period is absent from the frame', () => {
    const frame = isolationFrame();
    const raster = new CpuRenderer().colorize(frame, 'period', 9);
    const plain = new CpuRenderer().colorize(frame, 'period').rgba;
    expect(raster.isolatedPeriod).toBe(9);
    for (let pixel = 0; pixel < plain.length / 4; pixel += 1) {
      const base = pixelAt(plain, pixel);
      expect(pixelAt(raster.rgba, pixel)).toEqual(dimColor(base as unknown as Rgba));
    }
  });

  it('matches the reference on a rendered frame', async () => {
    const renderer = new CpuRenderer();
    const frames: SemanticFrame[] = [];
    await renderer.render(
      {
        viewport: { center: { re: -0.75, im: 0 }, spanY: 2.5 },
        size: { width: 97, height: 61 },
        quality: { maxIterations: 256, maxPeriod: 16, coarseStride: 8 },
      },
      new AbortController().signal,
      (frame) => {
        frames.push(frame);
      },
    );
    const stable = frames.at(-1);
    expect(stable).toBeDefined();
    if (stable === undefined) return;
    expect(colorizeFrame(stable, 'period', undefined, 2)).toEqual(
      referenceColorize(stable, 'period', 2),
    );
  });
});
