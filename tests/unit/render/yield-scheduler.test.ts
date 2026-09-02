import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MAX_PENDING_YIELDS,
  createYieldScheduler,
  defaultRowYieldScheduler,
  isYieldMechanism,
} from '../../../src/render/yield-scheduler';
import type { MessageChannelLike } from '../../../src/render/yield-scheduler';

interface FakePort {
  onmessage: ((event: unknown) => void) | null;
  postMessage: (message?: unknown) => void;
  close: () => void;
}

interface FakeChannel extends MessageChannelLike {
  port1: FakePort;
  port2: FakePort;
  posts: number;
}

const fakeChannelFactory = (): { factory: () => FakeChannel; channels: FakeChannel[] } => {
  const channels: FakeChannel[] = [];
  return {
    channels,
    factory: () => {
      const channel: FakeChannel = {
        posts: 0,
        port1: {
          onmessage: null,
          postMessage: () => {
            channel.posts += 1;
          },
          close: () => undefined,
        },
        port2: {
          onmessage: null,
          postMessage: () => {
            channel.posts += 1;
          },
          close: () => undefined,
        },
      };
      channels.push(channel);
      return channel;
    },
  };
};

describe('createYieldScheduler (message-channel)', () => {
  it('yields through the port without timers (real channel, fake timers)', async () => {
    vi.useFakeTimers();
    try {
      const scheduler = createYieldScheduler();
      // No timer advancement: a timer-based yield would hang here, while a
      // MessageChannel post is a real macrotask that still arrives.
      await scheduler.yieldToEventLoop();
      scheduler.dispose();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('resolves concurrent yields in FIFO order with one coalesced port post', async () => {
    const { factory, channels } = fakeChannelFactory();
    const scheduler = createYieldScheduler({ createChannel: factory });
    const order: number[] = [];
    const pending = [1, 2, 3].map(async (index) => {
      await scheduler.yieldToEventLoop();
      order.push(index);
    });
    await Promise.resolve();
    expect(channels).toHaveLength(1);
    expect(channels[0]!.posts).toBe(1);
    expect(scheduler.pendingCount).toBe(3);

    channels[0]!.port1.onmessage?.(undefined);
    await Promise.all(pending);
    expect(order).toEqual([1, 2, 3]);
    scheduler.dispose();
  });

  it('schedules one new port post per sequential yield after a drain', async () => {
    const { factory, channels } = fakeChannelFactory();
    const scheduler = createYieldScheduler({ createChannel: factory });
    let resolved = 0;
    const first = scheduler.yieldToEventLoop().then(() => {
      resolved += 1;
    });
    channels[0]!.port1.onmessage?.(undefined);
    await first;
    const second = scheduler.yieldToEventLoop().then(() => {
      resolved += 1;
    });
    channels[0]!.port1.onmessage?.(undefined);
    await second;
    expect(resolved).toBe(2);
    expect(channels[0]!.posts).toBe(2);
    scheduler.dispose();
  });

  it('bounds the pending queue: overflow still resolves without draining', async () => {
    const { factory, channels } = fakeChannelFactory();
    const scheduler = createYieldScheduler({ createChannel: factory });
    const all = Array.from({ length: MAX_PENDING_YIELDS + 8 }, () => scheduler.yieldToEventLoop());
    // The overflow resolvers must not wait for the (dead) port drain.
    await Promise.race([Promise.all(all.slice(MAX_PENDING_YIELDS)), Promise.resolve()]);
    scheduler.dispose();
    await Promise.all(all);
    expect(channels[0]?.posts).toBe(1);
  });

  it('dispose resolves pending yields and closes the channel', async () => {
    const { factory } = fakeChannelFactory();
    const scheduler = createYieldScheduler({ createChannel: factory });
    const pending = scheduler.yieldToEventLoop();
    scheduler.dispose();
    await pending;
    expect(scheduler.pendingCount).toBe(0);
    void expect(scheduler.yieldToEventLoop()).resolves.toBeUndefined();
  });

  it('falls back to timers when MessageChannel is unavailable', async () => {
    vi.useFakeTimers();
    try {
      const scheduler = createYieldScheduler({ createChannel: () => undefined });
      const pending = scheduler.yieldToEventLoop();
      await vi.advanceTimersByTimeAsync(0);
      await pending;
      scheduler.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('createYieldScheduler (timeout measurement arm)', () => {
  it('uses the timer queue', async () => {
    vi.useFakeTimers();
    try {
      const scheduler = createYieldScheduler({ mechanism: 'timeout' });
      let resolved = false;
      const pending = scheduler.yieldToEventLoop().then(() => {
        resolved = true;
      });
      await Promise.resolve();
      expect(resolved).toBe(false);
      await vi.advanceTimersByTimeAsync(0);
      await pending;
      expect(resolved).toBe(true);
      scheduler.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('defaultRowYieldScheduler (real macrotasks)', () => {
  beforeEach(() => {
    expect(typeof globalThis.MessageChannel).toBe('function');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not inherit the 4 ms nested-timer clamp across 50 sequential yields', async () => {
    const scheduler = defaultRowYieldScheduler();
    const started = performance.now();
    for (let index = 0; index < 50; index += 1) {
      await scheduler.yieldToEventLoop();
    }
    const elapsed = performance.now() - started;
    // 50 nested setTimeout(0) yields cost >= 50 x 4 ms under the HTML
    // timer-nesting clamp; port yields cost well under a tenth of that.
    expect(elapsed).toBeLessThan(100);
  });

  it('keeps the pending queue empty between sequential yields', async () => {
    const scheduler = defaultRowYieldScheduler();
    await scheduler.yieldToEventLoop();
    expect(scheduler.pendingCount).toBe(0);
  });
});

describe('isYieldMechanism', () => {
  it('accepts only known mechanisms', () => {
    expect(isYieldMechanism('message-channel')).toBe(true);
    expect(isYieldMechanism('timeout')).toBe(true);
    expect(isYieldMechanism('port')).toBe(false);
    expect(isYieldMechanism('')).toBe(false);
  });
});
