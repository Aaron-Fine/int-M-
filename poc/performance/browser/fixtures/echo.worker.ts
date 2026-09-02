/**
 * Minimal module worker used by the microbench page to exercise worker
 * mechanics in isolation (spawn cost, postMessage roundtrip, zero-copy
 * transfer A/B). Deliberately tiny; it is not the render worker.
 */

interface EchoRequest {
  readonly type: 'echo';
  readonly bytes: number;
}

interface FrameRequest {
  readonly type: 'frame';
  readonly channels: {
    readonly status: Uint8Array<ArrayBuffer>;
    readonly period: Uint32Array<ArrayBuffer>;
    readonly smoothIterationOrMultiplierMagnitude: Float64Array<ArrayBuffer>;
    readonly multiplierAngle: Float64Array<ArrayBuffer>;
  };
  readonly transferBack: boolean;
}

interface SpinRequest {
  readonly type: 'spin';
  readonly ms: number;
}

type EchoMessage = EchoRequest | FrameRequest | SpinRequest;

const scope = globalThis as unknown as {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
};

const buffersOf = (frame: FrameRequest['channels']): ArrayBuffer[] => [
  frame.status.buffer,
  frame.period.buffer,
  frame.smoothIterationOrMultiplierMagnitude.buffer,
  frame.multiplierAngle.buffer,
];

scope.addEventListener('message', (event: MessageEvent<unknown>) => {
  const message = event.data as Partial<EchoMessage> | null;
  if (message === null) return;
  if (message.type === 'echo' && Number.isFinite(message.bytes)) {
    scope.postMessage({ type: 'echo-ack', bytes: message.bytes });
    return;
  }
  if (message.type === 'frame' && message.channels !== undefined) {
    // Echo the channels back in the same mode the sender chose.
    scope.postMessage(
      { type: 'frame-ack', channels: message.channels },
      message.transferBack ? buffersOf(message.channels) : [],
    );
    return;
  }
  if (message.type === 'spin' && message.ms !== undefined && Number.isFinite(message.ms)) {
    // Synthetic per-band cost for the band-order simulation.
    const end = performance.now() + message.ms;
    while (performance.now() < end) {
      // Busy-wait: the wall clock is the measured quantity.
    }
    scope.postMessage({ type: 'spin-ack', ms: message.ms });
  }
});
