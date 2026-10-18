import { describe, expect, it } from 'vitest';
import { withStallRetry } from '../../../tools/benchmark/harness/capture.ts';

const timeout = (): Error => Object.assign(new Error('stalled'), { name: 'TimeoutError' });

describe('withStallRetry', () => {
  it('retries a timed-out attempt once with a fresh context and records it', async () => {
    const calls: boolean[] = [];
    let stalls = 0;
    const value = await withStallRetry(
      (fresh) => {
        calls.push(fresh);
        if (!fresh) return Promise.reject(timeout());
        return Promise.resolve(42);
      },
      () => {
        stalls += 1;
      },
    );
    expect(value).toBe(42);
    expect(calls).toEqual([false, true]);
    expect(stalls).toBe(1);
  });

  it('gives up after the second stall and rethrows other errors at once', async () => {
    await expect(
      withStallRetry(
        () => Promise.reject(timeout()),
        () => undefined,
      ),
    ).rejects.toThrow('stalled');
    let attempts = 0;
    await expect(
      withStallRetry(
        () => {
          attempts += 1;
          return Promise.reject(new Error('boom'));
        },
        () => undefined,
      ),
    ).rejects.toThrow('boom');
    expect(attempts).toBe(1);
  });
});
