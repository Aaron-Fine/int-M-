/**
 * Reusable yield scheduler for worker raster loops (plan §5 renderer-path
 * detail "yield mechanism", §12).
 *
 * Browsers clamp nested timers to a 4 ms minimum after five nesting levels
 * (the HTML timer-nesting rule), so the previous `setTimeout(0)` row yields
 * spent most of their budget in timer policy rather than yielding to real
 * work. A MessageChannel port posts a task with no timer clamp, making the
 * same yield effectively free while still releasing the event loop between
 * kernels — cancellation messages therefore preempt on the same schedule as
 * before, just sooner.
 *
 * The scheduler coalesces concurrent yields onto a single port message and
 * bounds its pending queue: callers that exceed the bound resolve on the
 * microtask queue instead of queueing without limit.
 */

export type YieldMechanism = 'message-channel' | 'timeout';

export const DEFAULT_YIELD_MECHANISM: YieldMechanism = 'message-channel';

export const YIELD_MECHANISMS: readonly YieldMechanism[] = ['message-channel', 'timeout'];

/** Never queue more than this many resolvers; overflow resolves as microtasks. */
export const MAX_PENDING_YIELDS = 64;

interface MessagePortLike {
  postMessage(message?: unknown): void;
  start?(): void;
  close?(): void;
  set onmessage(handler: ((event: unknown) => void) | null);
}

export interface MessageChannelLike {
  readonly port1: MessagePortLike;
  readonly port2: MessagePortLike;
}

export interface YieldSchedulerOptions {
  /**
   * 'message-channel' (default) posts a port task per drain; 'timeout' uses
   * `setTimeout(0)` and keeps the 4 ms nested-timer clamp as the measurement
   * arm for paired evidence.
   */
  readonly mechanism?: YieldMechanism;
  /** Test seam: overrides the MessageChannel source. */
  readonly createChannel?: () => MessageChannelLike | undefined;
}

export interface YieldScheduler {
  /** Suspends the caller to the macrotask queue (never a timer under the default mechanism). */
  yieldToEventLoop(): Promise<void>;
  /** Resolvers waiting for the next port drain. */
  readonly pendingCount: number;
  /** Resolves everything pending and closes the channel. */
  dispose(): void;
}

export const createYieldScheduler = (options: YieldSchedulerOptions = {}): YieldScheduler => {
  const mechanism = options.mechanism ?? DEFAULT_YIELD_MECHANISM;
  const pending: (() => void)[] = [];
  let scheduled = false;
  let channel: MessageChannelLike | undefined;
  let sender: MessagePortLike | undefined;
  let disposed = false;

  const drain = (): void => {
    scheduled = false;
    const resolvers = pending.splice(0, pending.length);
    for (const resolve of resolvers) resolve();
  };

  const schedule = (): void => {
    if (mechanism === 'timeout') {
      setTimeout(drain, 0);
      return;
    }
    if (sender === undefined) {
      const createChannel =
        options.createChannel ??
        ((): MessageChannelLike | undefined => {
          const ctor = (globalThis as Record<string, unknown>)['MessageChannel'] as
            (new () => MessageChannelLike) | undefined;
          return ctor === undefined ? undefined : new ctor();
        });
      const created = createChannel();
      // Environments without MessageChannel fall back to timers.
      if (created === undefined) {
        sender = {
          postMessage: () => {
            setTimeout(drain, 0);
          },
          set onmessage(_handler: ((event: unknown) => void) | null) {
            // No port events; drain is driven by the timer above.
          },
        };
        scheduled = true;
        sender.postMessage(null);
        return;
      }
      channel = created;
      // port1 listens, port2 sends: a port receives what the other end posts.
      created.port1.onmessage = drain;
      sender = created.port2;
    }
    scheduled = true;
    // Node requires an argument to postMessage; browsers accept one. The
    // payload is an unused sentinel — the drain is the message.
    sender.postMessage(null);
  };

  return {
    yieldToEventLoop(): Promise<void> {
      if (disposed) return Promise.resolve();
      return new Promise<void>((resolve) => {
        if (scheduled) {
          if (pending.length >= MAX_PENDING_YIELDS) {
            // Overflow bound: still asynchronous, but never an unbounded queue.
            queueMicrotask(resolve);
            return;
          }
          pending.push(resolve);
          return;
        }
        pending.push(resolve);
        schedule();
      });
    },
    get pendingCount(): number {
      return pending.length;
    },
    dispose(): void {
      disposed = true;
      drain();
      sender?.close?.();
      channel?.port1.close?.();
      sender = undefined;
      channel = undefined;
    },
  };
};

/**
 * Process-wide default scheduler for raster-row yields. Workers and the
 * supervisor classify sequentially per loop, so the pending queue holds at
 * most one resolver per concurrent classify loop (≤ pool size).
 */
let defaultScheduler: YieldScheduler | undefined;

export const defaultRowYieldScheduler = (): YieldScheduler => {
  defaultScheduler ??= createYieldScheduler();
  return defaultScheduler;
};

export const isYieldMechanism = (value: string): value is YieldMechanism =>
  (YIELD_MECHANISMS as readonly string[]).includes(value);
