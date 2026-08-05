import { CpuRenderer, type SemanticFrame } from '../src/render';
import type { RasterSize, RenderQuality, Viewport } from '../src/domain';
import type { FrameMessage, WorkerToMainMessage } from '../src/worker/protocol';

const QUALITY: RenderQuality = {
  maxIterations: 512,
  maxPeriod: 32,
  coarseStride: 8,
};

// TypeScript's WebGPU declarations expose flag types but not the runtime
// constants. Keep the small subset used by this disposable harness local.
const BUFFER_USAGE = {
  mapRead: 0x0001,
  copySrc: 0x0004,
  copyDst: 0x0008,
  storage: 0x0080,
} as const;
const MAP_MODE_READ = 0x0001;

const CASES = [
  {
    id: 'full-set-512',
    viewport: { center: { re: -0.75, im: 0 }, spanY: 2.5 },
    size: { width: 512, height: 512 },
    sampleCount: 7,
  },
  {
    id: 'rabbit-detail-768',
    viewport: {
      center: { re: -0.1225611668766535, im: 0.7448617666197435 },
      spanY: 0.05,
    },
    size: { width: 768, height: 768 },
    sampleCount: 7,
  },
  {
    id: 'full-set-capacity-1024',
    viewport: { center: { re: -0.75, im: 0 }, spanY: 2.5 },
    size: { width: 1024, height: 1024 },
    sampleCount: 3,
  },
] as const;

interface CpuRun {
  readonly coarseMs: number;
  readonly stableMs: number;
  readonly unresolvedFraction: number;
  readonly rgbaTransferBytes: number;
}

const unresolvedFraction = (frame: FrameMessage): number => {
  let unresolved = 0;
  for (let offset = 0; offset < frame.rgba.length; offset += 4) {
    const value = frame.rgba[offset];
    if (
      value === frame.rgba[offset + 1] &&
      value === frame.rgba[offset + 2] &&
      (value === 84 || value === 108)
    ) {
      unresolved += 1;
    }
  }
  return unresolved / (frame.width * frame.height);
};

const workerCpuRun = (viewport: Viewport, size: RasterSize): Promise<CpuRun> =>
  new Promise((resolve, reject) => {
    const worker = new Worker('/src/worker/render.worker.ts', { type: 'module' });
    const started = performance.now();
    let coarseMs = Number.NaN;
    worker.addEventListener('message', (event: MessageEvent<WorkerToMainMessage>) => {
      const message = event.data;
      if (message.type === 'error') {
        worker.terminate();
        reject(new Error(message.message));
      } else if (message.type === 'frame' && message.stage === 'coarse') {
        coarseMs = performance.now() - started;
      } else if (message.type === 'frame' && message.stage === 'stable') {
        const result = {
          coarseMs,
          stableMs: performance.now() - started,
          unresolvedFraction: unresolvedFraction(message),
          rgbaTransferBytes: message.rgba.byteLength,
        };
        worker.terminate();
        resolve(result);
      }
    });
    worker.postMessage({
      type: 'render',
      requestId: 1,
      viewport,
      size,
      semanticView: 'period',
      quality: QUALITY,
    });
  });

const cancellationRun = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const worker = new Worker('/src/worker/render.worker.ts', { type: 'module' });
    const requestId = 1;
    let cancelStarted = 0;
    const cancelTimer = setTimeout(() => {
      cancelStarted = performance.now();
      worker.postMessage({ type: 'cancel', requestId });
    }, 75);
    worker.addEventListener('message', (event: MessageEvent<WorkerToMainMessage>) => {
      if (event.data.type === 'error') {
        clearTimeout(cancelTimer);
        worker.terminate();
        reject(new Error(event.data.message));
      } else if (event.data.type === 'cancelled') {
        clearTimeout(cancelTimer);
        const response = performance.now() - cancelStarted;
        worker.terminate();
        resolve(response);
      }
    });
    worker.postMessage({
      type: 'render',
      requestId,
      viewport: CASES[1].viewport,
      size: CASES[1].size,
      semanticView: 'period',
      quality: { maxIterations: 1024, maxPeriod: 64, coarseStride: 8 },
    });
  });

const DIRECT_SHADER = /* wgsl */ `
struct Output {
  status: f32,
  period: f32,
  primary: f32,
  secondary: f32,
}

@group(0) @binding(0) var<storage, read> params: array<u32>;
@group(0) @binding(1) var<storage, read_write> output: array<Output>;

fn param_f32(index: u32) -> f32 {
  return bitcast<f32>(params[index]);
}

fn square_plus(z: vec2f, c: vec2f) -> vec2f {
  return vec2f(z.x * z.x - z.y * z.y + c.x, 2.0 * z.x * z.y + c.y);
}

fn cycle_multiplier(start: vec2f, c: vec2f, period: u32, closure_tolerance_squared: f32) -> vec4f {
  var z = start;
  var derivative = vec2f(1.0, 0.0);
  for (var index = 0u; index < period; index += 1u) {
    derivative = vec2f(
      derivative.x * (2.0 * z.x) - derivative.y * (2.0 * z.y),
      derivative.x * (2.0 * z.y) + derivative.y * (2.0 * z.x),
    );
    z = square_plus(z, c);
  }
  let difference = z - start;
  let closes = dot(difference, difference) <= closure_tolerance_squared;
  return vec4f(derivative, length(derivative), select(0.0, 1.0, closes));
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) invocation: vec3u) {
  let width = params[0];
  let height = params[1];
  if (invocation.x >= width || invocation.y >= height) {
    return;
  }
  let max_iterations = params[2];
  let max_period = params[3];
  let center = vec2f(param_f32(4), param_f32(5));
  let span_y = param_f32(6);
  let tolerance = param_f32(7);
  let warmup = params[8];
  let units_per_pixel = span_y / f32(height);
  let c = center + vec2f(
    (f32(invocation.x) + 0.5 - f32(width) / 2.0) * units_per_pixel,
    -(f32(invocation.y) + 0.5 - f32(height) / 2.0) * units_per_pixel,
  );
  let offset = invocation.y * width + invocation.x;

  let cardioid_x = c.x - 0.25;
  let q = cardioid_x * cardioid_x + c.y * c.y;
  if (q * (q + cardioid_x) < 0.25 * c.y * c.y) {
    let root = sqrt(vec2f((sqrt((1.0 - 4.0 * c.x) * (1.0 - 4.0 * c.x) + 16.0 * c.y * c.y) + (1.0 - 4.0 * c.x)) / 2.0,
                           (sqrt((1.0 - 4.0 * c.x) * (1.0 - 4.0 * c.x) + 16.0 * c.y * c.y) - (1.0 - 4.0 * c.x)) / 2.0));
    let root_im = select(root.y, -root.y, c.y > 0.0);
    let multiplier = vec2f(1.0 - root.x, -root_im);
    output[offset] = Output(2.0, 1.0, length(multiplier), atan2(multiplier.y, multiplier.x));
    return;
  }
  let bulb = c - vec2f(-1.0, 0.0);
  if (dot(bulb, bulb) < 0.0625) {
    let multiplier = 4.0 * bulb;
    output[offset] = Output(2.0, 2.0, length(multiplier), atan2(multiplier.y, multiplier.x));
    return;
  }

  var history: array<vec2f, 33>;
  var z = vec2f(0.0);
  let tolerance_squared = tolerance * tolerance;
  let closure_tolerance_squared = tolerance * 100.0 * (tolerance * 100.0);
  for (var iteration = 1u; iteration <= max_iterations; iteration += 1u) {
    z = square_plus(z, c);
    let magnitude_squared = dot(z, z);
    if (magnitude_squared > 4.0) {
      let smooth_iteration = f32(iteration) + 1.0 - log2(log2(sqrt(magnitude_squared)));
      output[offset] = Output(1.0, 0.0, smooth_iteration, 0.0);
      return;
    }
    let current_index = (iteration - 1u) % 33u;
    history[current_index] = z;
    if (iteration < warmup) {
      continue;
    }
    let largest_period = min(max_period, iteration - 1u);
    for (var period = 1u; period <= largest_period; period += 1u) {
      let previous_index = (current_index + 33u - period) % 33u;
      let difference = z - history[previous_index];
      if (dot(difference, difference) > tolerance_squared) {
        continue;
      }
      let multiplier = cycle_multiplier(z, c, period, closure_tolerance_squared);
      if (multiplier.w > 0.5 && multiplier.z < 1.0) {
        output[offset] = Output(2.0, f32(period), multiplier.z, atan2(multiplier.y, multiplier.x));
        return;
      }
    }
  }
  output[offset] = Output(0.0, 0.0, 0.0, 0.0);
}
`;

const bits = (value: number): number => {
  const floats = new Float32Array([value]);
  return new Uint32Array(floats.buffer)[0] ?? 0;
};

interface GpuContext {
  readonly adapter: GPUAdapter;
  readonly device: GPUDevice;
  readonly pipeline: GPUComputePipeline;
}

interface PerturbationFixture {
  readonly precisionDigits: number;
  readonly referenceMethod: string;
  readonly center: { readonly re: string; readonly im: string };
  readonly spanY: string;
  readonly size: RasterSize;
  readonly maxIterations: number;
  readonly referenceOrbit: readonly (readonly [number, number])[];
  readonly samples: readonly {
    readonly x: number;
    readonly y: number;
    readonly status: 'escaped' | 'unresolved';
    readonly escapeIteration: number;
  }[];
}

const PERTURBATION_SHADER = /* wgsl */ `
@group(0) @binding(0) var<storage, read> params: array<u32>;
@group(0) @binding(1) var<storage, read> reference: array<vec2f>;
@group(0) @binding(2) var<storage, read_write> output: array<vec2f>;

fn param_f32(index: u32) -> f32 {
  return bitcast<f32>(params[index]);
}

fn complex_square(value: vec2f) -> vec2f {
  return vec2f(value.x * value.x - value.y * value.y, 2.0 * value.x * value.y);
}

fn complex_multiply(left: vec2f, right: vec2f) -> vec2f {
  return vec2f(left.x * right.x - left.y * right.y, left.x * right.y + left.y * right.x);
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) invocation: vec3u) {
  let width = params[0];
  let height = params[1];
  if (invocation.x >= width || invocation.y >= height) {
    return;
  }
  let max_iterations = params[2];
  let span_y = param_f32(3);
  let units_per_pixel = span_y / f32(height);
  let delta_c = vec2f(
    (f32(invocation.x) + 0.5 - f32(width) / 2.0) * units_per_pixel,
    -(f32(invocation.y) + 0.5 - f32(height) / 2.0) * units_per_pixel,
  );
  let offset = invocation.y * width + invocation.x;
  var delta_z = vec2f(0.0);
  var glitch = 0.0;
  for (var iteration = 0u; iteration < max_iterations; iteration += 1u) {
    delta_z = 2.0 * complex_multiply(reference[iteration], delta_z)
      + complex_square(delta_z) + delta_c;
    let approximate_z = reference[iteration + 1u] + delta_z;
    let approximate_magnitude_squared = dot(approximate_z, approximate_z);
    let reference_magnitude_squared = dot(reference[iteration + 1u], reference[iteration + 1u]);
    if (approximate_magnitude_squared < 1e-6 * reference_magnitude_squared) {
      glitch = 1.0;
    }
    if (approximate_magnitude_squared > 4.0) {
      output[offset] = vec2f(f32(iteration + 1u), glitch);
      return;
    }
  }
  output[offset] = vec2f(0.0, glitch);
}
`;

const createGpuContext = async (): Promise<GpuContext | undefined> => {
  const gpu = (navigator as unknown as { readonly gpu?: GPU }).gpu;
  const adapter = await gpu?.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) return undefined;
  const device = await adapter.requestDevice();
  const module = device.createShaderModule({ code: DIRECT_SHADER });
  const compilation = await module.getCompilationInfo();
  const errors = compilation.messages.filter((message) => message.type === 'error');
  if (errors.length > 0) {
    throw new Error(
      errors.map((error) => `${error.lineNum}:${error.linePos} ${error.message}`).join('\n'),
    );
  }
  const pipeline = await device.createComputePipelineAsync({
    layout: 'auto',
    compute: { module, entryPoint: 'main' },
  });
  return { adapter, device, pipeline };
};

const directGpuRun = async (
  context: GpuContext,
  viewport: Viewport,
  size: RasterSize,
): Promise<{ readonly latencyMs: number; readonly values: Float32Array }> => {
  const { device, pipeline } = context;
  const params = new Uint32Array([
    size.width,
    size.height,
    QUALITY.maxIterations,
    QUALITY.maxPeriod,
    bits(viewport.center.re),
    bits(viewport.center.im),
    bits(viewport.spanY),
    bits(1e-5),
    24,
  ]);
  const outputBytes = size.width * size.height * 16;
  const paramsBuffer = device.createBuffer({
    size: Math.ceil(params.byteLength / 4) * 4,
    usage: BUFFER_USAGE.storage | BUFFER_USAGE.copyDst,
  });
  const outputBuffer = device.createBuffer({
    size: outputBytes,
    usage: BUFFER_USAGE.storage | BUFFER_USAGE.copySrc,
  });
  const readback = device.createBuffer({
    size: outputBytes,
    usage: BUFFER_USAGE.copyDst | BUFFER_USAGE.mapRead,
  });
  device.queue.writeBuffer(paramsBuffer, 0, params);
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: paramsBuffer } },
      { binding: 1, resource: { buffer: outputBuffer } },
    ],
  });
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.dispatchWorkgroups(Math.ceil(size.width / 8), Math.ceil(size.height / 8));
  pass.end();
  encoder.copyBufferToBuffer(outputBuffer, 0, readback, 0, outputBytes);
  const started = performance.now();
  device.queue.submit([encoder.finish()]);
  await readback.mapAsync(MAP_MODE_READ);
  const latencyMs = performance.now() - started;
  const values = new Float32Array(readback.getMappedRange().slice(0));
  readback.unmap();
  paramsBuffer.destroy();
  outputBuffer.destroy();
  readback.destroy();
  return { latencyMs, values };
};

// eslint-disable-next-line complexity -- resource lifecycle and sampled comparison intentionally share one disposable experiment.
const perturbationGpuRun = async (context: GpuContext, fixture: PerturbationFixture) => {
  const { device } = context;
  const module = device.createShaderModule({ code: PERTURBATION_SHADER });
  const compilation = await module.getCompilationInfo();
  const errors = compilation.messages.filter((message) => message.type === 'error');
  if (errors.length > 0) {
    throw new Error(
      errors.map((error) => `${error.lineNum}:${error.linePos} ${error.message}`).join('\n'),
    );
  }
  const pipeline = await device.createComputePipelineAsync({
    layout: 'auto',
    compute: { module, entryPoint: 'main' },
  });
  const params = new Uint32Array([
    fixture.size.width,
    fixture.size.height,
    fixture.maxIterations,
    bits(Number(fixture.spanY)),
  ]);
  const referenceValues = new Float32Array(fixture.referenceOrbit.length * 2);
  for (let index = 0; index < fixture.referenceOrbit.length; index += 1) {
    referenceValues[index * 2] = fixture.referenceOrbit[index]?.[0] ?? Number.NaN;
    referenceValues[index * 2 + 1] = fixture.referenceOrbit[index]?.[1] ?? Number.NaN;
  }
  const outputBytes = fixture.size.width * fixture.size.height * 8;
  const paramsBuffer = device.createBuffer({
    size: params.byteLength,
    usage: BUFFER_USAGE.storage | BUFFER_USAGE.copyDst,
  });
  const referenceBuffer = device.createBuffer({
    size: referenceValues.byteLength,
    usage: BUFFER_USAGE.storage | BUFFER_USAGE.copyDst,
  });
  const outputBuffer = device.createBuffer({
    size: outputBytes,
    usage: BUFFER_USAGE.storage | BUFFER_USAGE.copySrc,
  });
  const readback = device.createBuffer({
    size: outputBytes,
    usage: BUFFER_USAGE.copyDst | BUFFER_USAGE.mapRead,
  });
  device.queue.writeBuffer(paramsBuffer, 0, params);
  device.queue.writeBuffer(referenceBuffer, 0, referenceValues);
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: paramsBuffer } },
      { binding: 1, resource: { buffer: referenceBuffer } },
      { binding: 2, resource: { buffer: outputBuffer } },
    ],
  });

  const samples: { latencyMs: number; values: Float32Array }[] = [];
  for (let run = 0; run < 8; run += 1) {
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(Math.ceil(fixture.size.width / 8), Math.ceil(fixture.size.height / 8));
    pass.end();
    encoder.copyBufferToBuffer(outputBuffer, 0, readback, 0, outputBytes);
    const started = performance.now();
    device.queue.submit([encoder.finish()]);
    await readback.mapAsync(MAP_MODE_READ);
    samples.push({
      latencyMs: performance.now() - started,
      values: new Float32Array(readback.getMappedRange().slice(0)),
    });
    readback.unmap();
  }
  const measured = samples.slice(1);
  const values = measured.at(-1)?.values;
  if (!values) throw new Error('Perturbation benchmark did not return results');

  let statusMismatches = 0;
  const iterationErrors: number[] = [];
  for (const sample of fixture.samples) {
    const offset = (sample.y * fixture.size.width + sample.x) * 2;
    const gpuIteration = values[offset] ?? 0;
    const gpuStatus = gpuIteration > 0 ? 'escaped' : 'unresolved';
    if (gpuStatus !== sample.status) statusMismatches += 1;
    if (gpuStatus === 'escaped' && sample.status === 'escaped') {
      iterationErrors.push(Math.abs(gpuIteration - sample.escapeIteration));
    }
  }
  iterationErrors.sort((a, b) => a - b);
  let glitches = 0;
  for (let offset = 1; offset < values.length; offset += 2) {
    if ((values[offset] ?? 0) > 0) glitches += 1;
  }
  const cpuRenderer = new CpuRenderer();
  let cpuStatusMismatches = 0;
  const cpuIterationErrors: number[] = [];
  const centerRe = Number(fixture.center.re);
  const centerIm = Number(fixture.center.im);
  const spanY = Number(fixture.spanY);
  for (const sample of fixture.samples) {
    const unitsPerPixel = spanY / fixture.size.height;
    const result = cpuRenderer.inspect(
      {
        re: centerRe + (sample.x + 0.5 - fixture.size.width / 2) * unitsPerPixel,
        im: centerIm - (sample.y + 0.5 - fixture.size.height / 2) * unitsPerPixel,
      },
      { maxIterations: fixture.maxIterations, maxPeriod: 64 },
    );
    const cpuStatus = result.status === 'escaped' ? 'escaped' : 'unresolved';
    if (cpuStatus !== sample.status) cpuStatusMismatches += 1;
    if (result.status === 'escaped' && sample.status === 'escaped') {
      cpuIterationErrors.push(Math.abs(result.escapeIteration - sample.escapeIteration));
    }
  }
  cpuIterationErrors.sort((a, b) => a - b);
  paramsBuffer.destroy();
  referenceBuffer.destroy();
  outputBuffer.destroy();
  readback.destroy();
  return {
    tile: {
      center: fixture.center,
      spanY: fixture.spanY,
      size: fixture.size,
      maxIterations: fixture.maxIterations,
    },
    reference: {
      method: fixture.referenceMethod,
      precisionDigits: fixture.precisionDigits,
      referenceOrbitPoints: fixture.referenceOrbit.length,
      directHighPrecisionSamples: fixture.samples.length,
    },
    latencyMs: summary(measured.map((sample) => sample.latencyMs)),
    buffers: {
      referenceBytes: referenceValues.byteLength,
      outputBytes,
    },
    comparison: {
      statusMismatchFraction: statusMismatches / fixture.samples.length,
      comparableEscapedSamples: iterationErrors.length,
      escapeIterationAbsoluteErrorP50: percentile(iterationErrors, 0.5),
      escapeIterationAbsoluteErrorP95: percentile(iterationErrors, 0.95),
      escapeIterationAbsoluteErrorMax: iterationErrors.at(-1) ?? Number.NaN,
      glitchFraction: glitches / (fixture.size.width * fixture.size.height),
      rebasingImplemented: false,
    },
    cpuBinary64Comparison: {
      statusMismatchFraction: cpuStatusMismatches / fixture.samples.length,
      comparableEscapedSamples: cpuIterationErrors.length,
      escapeIterationAbsoluteErrorP50: percentile(cpuIterationErrors, 0.5),
      escapeIterationAbsoluteErrorP95: percentile(cpuIterationErrors, 0.95),
      escapeIterationAbsoluteErrorMax: cpuIterationErrors.at(-1) ?? Number.NaN,
    },
  };
};

const cpuSemanticFrame = async (viewport: Viewport, size: RasterSize): Promise<SemanticFrame> => {
  const renderer = new CpuRenderer();
  let stable: SemanticFrame | undefined;
  await renderer.render(
    { viewport, size, quality: QUALITY },
    new AbortController().signal,
    (frame) => {
      if (frame.stage === 'stable') stable = frame;
    },
  );
  if (!stable) throw new Error('CPU renderer did not produce a stable frame');
  return stable;
};

const percentile = (sorted: readonly number[], fraction: number): number => {
  if (sorted.length === 0) return Number.NaN;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? Number.NaN;
};

// eslint-disable-next-line complexity -- each branch records a distinct disagreement field in one raster pass.
const compareFrames = (cpu: SemanticFrame, gpu: Float32Array) => {
  let statusMismatch = 0;
  let periodMismatch = 0;
  let comparableCycles = 0;
  let gpuUnresolved = 0;
  const multiplierErrors: number[] = [];
  const stabilityErrors: number[] = [];
  for (let pixel = 0; pixel < cpu.status.length; pixel += 1) {
    const base = pixel * 4;
    const gpuStatus = gpu[base] ?? Number.NaN;
    const cpuStatus = cpu.status[pixel] ?? 0;
    if (gpuStatus === 0) gpuUnresolved += 1;
    if (gpuStatus !== cpuStatus) statusMismatch += 1;
    if (gpuStatus === 2 && cpuStatus === 2) {
      const gpuPeriod = gpu[base + 1] ?? 0;
      const cpuPeriod = cpu.period[pixel] ?? 0;
      if (gpuPeriod !== cpuPeriod) {
        periodMismatch += 1;
      } else {
        comparableCycles += 1;
        const gpuMagnitude = gpu[base + 2] ?? Number.NaN;
        const cpuMagnitude = cpu.smoothIterationOrMultiplierMagnitude[pixel] ?? Number.NaN;
        const magnitudeError = Math.abs(gpuMagnitude - cpuMagnitude);
        multiplierErrors.push(magnitudeError);
        const gpuStability = gpuMagnitude === 0 ? Infinity : -Math.log(gpuMagnitude) / gpuPeriod;
        const cpuStability = cpuMagnitude === 0 ? Infinity : -Math.log(cpuMagnitude) / cpuPeriod;
        if (Number.isFinite(gpuStability) && Number.isFinite(cpuStability)) {
          stabilityErrors.push(Math.abs(gpuStability - cpuStability));
        }
      }
    }
  }
  multiplierErrors.sort((a, b) => a - b);
  stabilityErrors.sort((a, b) => a - b);
  const pixels = cpu.status.length;
  return {
    statusMismatchFraction: statusMismatch / pixels,
    periodMismatchFraction: periodMismatch / pixels,
    comparableCycles,
    gpuUnresolvedFraction: gpuUnresolved / pixels,
    multiplierAbsoluteErrorP50: percentile(multiplierErrors, 0.5),
    multiplierAbsoluteErrorP95: percentile(multiplierErrors, 0.95),
    multiplierAbsoluteErrorMax: multiplierErrors.at(-1) ?? Number.NaN,
    stabilityAbsoluteErrorP50: percentile(stabilityErrors, 0.5),
    stabilityAbsoluteErrorP95: percentile(stabilityErrors, 0.95),
    stabilityAbsoluteErrorMax: stabilityErrors.at(-1) ?? Number.NaN,
  };
};

const f32DistinctionSweep = (center: number, height: number) =>
  [1e-3, 3e-4, 1e-4, 7.5e-5, 5e-5, 3e-5, 1e-5, 1e-6].map((spanY) => {
    const units = Math.fround(Math.fround(spanY) / height);
    const values = new Set<number>();
    for (let x = 0; x < height; x += 1) {
      const offset = Math.fround(Math.fround(x + 0.5 - height / 2) * units);
      values.add(Math.fround(Math.fround(center) + offset));
    }
    return {
      spanY,
      magnification: 2.5 / spanY,
      distinctColumns: values.size,
      collapsedColumnFraction: 1 - values.size / height,
    };
  });

const worstCaseF32DistinctionSweep = (height: number) => {
  const centers = [-1.95, -1.75, -0.75, -0.1225611668766535, 0.2822713907669141];
  const sweeps = centers.map((center) => f32DistinctionSweep(center, height));
  return sweeps[0]?.map((sample, index) => {
    const distinctColumns = Math.min(
      ...sweeps.map((sweep) => sweep[index]?.distinctColumns ?? height),
    );
    return {
      spanY: sample.spanY,
      magnification: sample.magnification,
      distinctColumns,
      collapsedColumnFraction: 1 - distinctColumns / height,
    };
  });
};

const summary = (values: readonly number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    min: sorted[0],
    median: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    max: sorted.at(-1),
  };
};

export const runPhase0Benchmarks = async (perturbationFixture: PerturbationFixture) => {
  const longTasks: number[] = [];
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) longTasks.push(entry.duration);
  });
  if (PerformanceObserver.supportedEntryTypes.includes('longtask')) {
    observer.observe({ entryTypes: ['longtask'] });
  }

  const cpu = [];
  for (const benchmarkCase of CASES) {
    const runs: CpuRun[] = [];
    for (let run = 0; run < benchmarkCase.sampleCount; run += 1) {
      runs.push(await workerCpuRun(benchmarkCase.viewport, benchmarkCase.size));
    }
    const pixels = benchmarkCase.size.width * benchmarkCase.size.height;
    cpu.push({
      id: benchmarkCase.id,
      size: benchmarkCase.size,
      viewport: benchmarkCase.viewport,
      sampleCount: runs.length,
      coarseMs: summary(runs.map((run) => run.coarseMs)),
      stableMs: summary(runs.map((run) => run.stableMs)),
      unresolvedFraction: summary(runs.map((run) => run.unresolvedFraction)),
      memory: {
        semanticBytes: pixels * 21,
        rgbaTransferBytes: pixels * 4,
        estimatedPeakBytes: pixels * 46,
      },
    });
  }

  const cancellationSamples: number[] = [];
  for (let run = 0; run < 12; run += 1) cancellationSamples.push(await cancellationRun());

  const gpuContext = await createGpuContext();
  const gpu = [];
  let perturbation = null;
  if (gpuContext) {
    for (const benchmarkCase of CASES) {
      const cpuFrame = await cpuSemanticFrame(benchmarkCase.viewport, benchmarkCase.size);
      await directGpuRun(gpuContext, benchmarkCase.viewport, benchmarkCase.size);
      const runs = [];
      let lastValues: Float32Array | undefined;
      for (let run = 0; run < 7; run += 1) {
        const result = await directGpuRun(gpuContext, benchmarkCase.viewport, benchmarkCase.size);
        runs.push(result.latencyMs);
        lastValues = result.values;
      }
      if (!lastValues) throw new Error('GPU benchmark did not return results');
      gpu.push({
        id: benchmarkCase.id,
        sampleCount: runs.length,
        latencyMs: summary(runs),
        outputBytes: lastValues.byteLength,
        comparison: compareFrames(cpuFrame, lastValues),
      });
    }
    perturbation = await perturbationGpuRun(gpuContext, perturbationFixture);
  }

  await new Promise((resolve) => setTimeout(resolve, 0));
  observer.disconnect();
  return {
    schemaVersion: 1,
    timestamp: new Date().toISOString(),
    browser: navigator.userAgent,
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemoryGiB:
      (navigator as Navigator & { readonly deviceMemory?: number }).deviceMemory ?? null,
    cpu,
    cancellationMs: summary(cancellationSamples),
    mainThreadLongTasks: {
      count: longTasks.length,
      maxMs: longTasks.length === 0 ? 0 : Math.max(...longTasks),
    },
    directWebGpu: {
      available: gpuContext !== undefined,
      adapterInfo: gpuContext ? gpuContext.adapter.info : null,
      features: gpuContext ? [...gpuContext.adapter.features].sort() : [],
      runs: gpu,
      f32DistinctionSweep768: worstCaseF32DistinctionSweep(768),
      cancellation:
        'Submitted WebGPU work is not preemptible; superseded results can only be discarded.',
    },
    perturbation,
  };
};
