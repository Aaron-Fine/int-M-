import type { ZeroCopyParams, ZeroCopyResult, ZeroCopySample } from './microbench-api';

/**
 * Plan §12 renderer-path detail (zero-copy output, part of E): the
 * supervisor semantic frame for a 1024x640 stable frame is ~12.75 MiB across
 * four channels (status u8, period u32, two f64 channels; ~21 MiB at
 * 1024x1024). This A/B measures postMessage cost of exactly those channels
 * through a worker: transferable (zero-copy) versus structured-clone copy.
 * Roundtrip = main post -> worker echoes the buffers back with the same
 * mode, so both arms pay two crossings.
 */

const WIDTH = 1024;
const HEIGHT = 640;
const PIXELS = WIDTH * HEIGHT;

export interface FrameChannels {
  readonly status: Uint8Array<ArrayBuffer>;
  readonly period: Uint32Array<ArrayBuffer>;
  readonly smoothIterationOrMultiplierMagnitude: Float64Array<ArrayBuffer>;
  readonly multiplierAngle: Float64Array<ArrayBuffer>;
}

const createFrameChannels = (): FrameChannels => ({
  status: new Uint8Array(PIXELS),
  period: new Uint32Array(PIXELS),
  smoothIterationOrMultiplierMagnitude: new Float64Array(PIXELS),
  multiplierAngle: new Float64Array(PIXELS),
});

const fillFrameChannels = (frame: FrameChannels): void => {
  for (let index = 0; index < PIXELS; index += 1) {
    frame.status[index] = index % 3;
    frame.period[index] = index % 32;
    frame.smoothIterationOrMultiplierMagnitude[index] = (index % 512) + 0.5;
    frame.multiplierAngle[index] = (index % 360) * (Math.PI / 180);
  }
};

const buffersOf = (frame: FrameChannels): ArrayBuffer[] => [
  frame.status.buffer,
  frame.period.buffer,
  frame.smoothIterationOrMultiplierMagnitude.buffer,
  frame.multiplierAngle.buffer,
];

const startFrameEchoWorker = (): Worker =>
  new Worker(new URL('./echo.worker.ts', import.meta.url), {
    type: 'module',
    name: 'mi-poc-echo',
  });

export const runZeroCopy = async (params: ZeroCopyParams): Promise<ZeroCopyResult> => {
  const worker = startFrameEchoWorker();
  let frame = createFrameChannels();
  fillFrameChannels(frame);
  const totalBytes =
    frame.status.byteLength +
    frame.period.byteLength +
    frame.smoothIterationOrMultiplierMagnitude.byteLength +
    frame.multiplierAngle.byteLength;

  // Wait for the worker to be alive: a tiny ping through the same channel.
  await new Promise<void>((resolve, reject) => {
    worker.addEventListener('error', () => reject(new Error('echo worker failed')), {
      once: true,
    });
    const onAck = (): void => {
      worker.removeEventListener('message', onAck);
      resolve();
    };
    worker.addEventListener('message', onAck);
    worker.postMessage({ type: 'echo', bytes: 1 });
  });

  const samples: ZeroCopySample[] = [];
  // Each rep runs both arms with the starting arm alternating per rep
  // (copy, transfer / transfer, copy, ...), so thermal drift spreads across
  // both modes.
  for (let rep = 0; rep < params.repsPerMode; rep += 1) {
    const order = rep % 2 === 0 ? (['copy', 'transfer'] as const) : (['transfer', 'copy'] as const);
    for (const mode of order) {
      const transferOut = mode === 'transfer' ? buffersOf(frame) : [];
      const postStarted = performance.now();
      worker.postMessage(
        { type: 'frame', channels: frame, transferBack: mode === 'transfer' },
        transferOut,
      );
      const postMs = performance.now() - postStarted;

      const roundtripStarted = performance.now();
      const returned = await new Promise<FrameChannels>((resolve, reject) => {
        const onError = (): void => {
          reject(new Error('echo worker failed during frame echo'));
        };
        worker.addEventListener('error', onError, { once: true });
        worker.addEventListener(
          'message',
          (event: MessageEvent<{ type: string; channels?: FrameChannels }>) => {
            const message = event.data;
            if (message.type !== 'frame-ack' || message.channels === undefined) return;
            worker.removeEventListener('error', onError);
            resolve(message.channels);
          },
        );
      });
      const roundtripMs = performance.now() - roundtripStarted;

      // Guard against dead-code elimination and silent corruption.
      const intact =
        returned.status[0] === 0 &&
        returned.status[PIXELS - 1] === (PIXELS - 1) % 3 &&
        returned.period[PIXELS - 1] === (PIXELS - 1) % 32;

      // Transferable posts detach the sender-side buffers; the echoed
      // channels are the only live view afterwards, so reuse them.
      frame = returned;

      samples.push({
        rep,
        mode,
        postMs,
        roundtripMs,
        bytes: totalBytes,
        intact,
      });
    }
  }

  worker.terminate();
  return {
    width: WIDTH,
    height: HEIGHT,
    bytesPerRoundtrip: totalBytes,
    repsPerMode: params.repsPerMode,
    samples,
  };
};
