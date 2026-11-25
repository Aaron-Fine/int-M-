import type { Renderer } from '../render';

/** The message a browser test posts to the render worker to hold or release renders. */
export const COARSE_GATE_MESSAGE = 'e2e-coarse-gate';

export interface CoarseGateMessage {
  readonly type: typeof COARSE_GATE_MESSAGE;
  readonly hold: boolean;
}

export const isCoarseGateMessage = (data: unknown): data is CoarseGateMessage =>
  typeof data === 'object' &&
  data !== null &&
  (data as { type?: unknown }).type === COARSE_GATE_MESSAGE &&
  typeof (data as { hold?: unknown }).hold === 'boolean';

export interface CoarseGate {
  readonly renderer: Renderer;
  /** From now on, every render waits after delivering its coarse frame. */
  hold(): void;
  /** Lets every waiting render go on to its stable frame; later renders do not wait. */
  release(): void;
}

/**
 * A test seam for dev and e2e builds (render.worker.ts): while held, a render
 * delivers its coarse frame and then waits until the gate is released or the
 * render is cancelled. A browser test can then act while a computation is in
 * flight (cancel it, or replay its coarse frame in another view) on events
 * instead of racing the stable frame.
 */
export const createCoarseGate = (inner: Renderer): CoarseGate => {
  let held: { readonly opened: Promise<void>; readonly open: () => void } | undefined;

  const waitWhileHeld = async (signal: AbortSignal): Promise<void> => {
    const gate = held;
    if (gate === undefined || signal.aborted) return;
    await new Promise<void>((resolve) => {
      void gate.opened.then(resolve);
      signal.addEventListener('abort', () => resolve(), { once: true });
    });
  };

  const renderer: Renderer = {
    render: (request, signal, onFrame) =>
      inner.render(request, signal, async (frame) => {
        await onFrame(frame);
        if (frame.stage === 'coarse') await waitWhileHeld(signal);
      }),
    // Every argument passes through, so a parameter added to Renderer is never dropped here.
    inspect: (...args) => inner.inspect(...args),
    colorize: (...args) => inner.colorize(...args),
    quiesce: async () => {
      await inner.quiesce?.();
    },
  };

  return {
    renderer,
    hold() {
      if (held !== undefined) return;
      let open = (): void => undefined;
      const opened = new Promise<void>((resolve) => {
        open = resolve;
      });
      held = { opened, open };
    },
    release() {
      held?.open();
      held = undefined;
    },
  };
};
