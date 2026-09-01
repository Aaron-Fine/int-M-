/**
 * Minimal module worker used by the microbench page to exercise worker
 * mechanics in isolation (spawn cost, postMessage roundtrip, and later the
 * zero-copy transfer A/B). Deliberately tiny; it is not the render worker.
 */

interface EchoRequest {
  readonly type: 'echo';
  readonly bytes: number;
}

const scope = globalThis as unknown as {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
};

scope.addEventListener('message', (event: MessageEvent<unknown>) => {
  const message = event.data as Partial<EchoRequest> | null;
  if (message?.type !== 'echo' || !Number.isFinite(message.bytes)) return;
  scope.postMessage({ type: 'echo-ack', bytes: message.bytes });
});
