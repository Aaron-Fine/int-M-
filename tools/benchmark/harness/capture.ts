/// <reference lib="dom" />
/**
 * One in-page capture per render: the mark-based wall (both arms), an in-page
 * SHA-256 of the stable canvas (row-major RGBA from getImageData), the
 * achieved viewport and the stable computed trace (hook arm only).
 */
import type { Page } from '@playwright/test';

export const STABLE_TIMEOUT_MS = 3 * 60_000;

export interface ViewportLike {
  readonly center: { readonly re: number; readonly im: number };
  readonly spanY: number;
}

export interface RenderCapture {
  readonly markWallMs: number;
  readonly hash: string;
  readonly width: number;
  readonly height: number;
  readonly viewport?: ViewportLike;
  readonly trace?: unknown;
  retriedAfterStall: boolean;
}

/**
 * Runs `attempt` on a warm context; on a Playwright timeout (a stalled
 * presentation) runs it once more on a fresh context. Any other error, or a
 * second stall, propagates.
 */
export const withStallRetry = async <T>(
  attempt: (fresh: boolean) => Promise<T>,
  onStall: () => void,
): Promise<T> => {
  try {
    return await attempt(false);
  } catch (error) {
    if (!(error instanceof Error) || error.name !== 'TimeoutError') throw error;
    onStall();
    return attempt(true);
  }
};

/** Navigates and waits for the stable frame; reads every metric from that render. */
export const measureRender = async (
  page: Page,
  url: string,
  hook: boolean,
): Promise<RenderCapture> => {
  await page.goto(url, { timeout: STABLE_TIMEOUT_MS });
  await page.waitForFunction(
    () => performance.getEntriesByType('mark').some((mark) => mark.name === 'mi:stable-presented'),
    undefined,
    { timeout: STABLE_TIMEOUT_MS, polling: 50 },
  );
  return page.evaluate(async (withHook: boolean) => {
    const marks = performance.getEntriesByType('mark') as PerformanceMark[];
    const stable = marks.filter((mark) => mark.name === 'mi:stable-presented').at(-1);
    const requestId = (stable?.detail as { requestId?: number } | undefined)?.requestId;
    const request = marks.find(
      (mark) =>
        mark.name === 'mi:render-request' &&
        (mark.detail as { requestId?: number } | undefined)?.requestId === requestId,
    );
    const canvas = document.querySelector('canvas.explorer__canvas');
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('stable canvas missing');
    const context = canvas.getContext('2d', { alpha: false });
    if (context === null) throw new Error('canvas has no 2d context');
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const digest = await crypto.subtle.digest('SHA-256', image.data);
    const renderTrace = (
      globalThis as { __miRenderTrace?: { snapshot(): unknown[]; viewport(): unknown } }
    ).__miRenderTrace;
    return {
      markWallMs: (stable?.startTime ?? Number.NaN) - (request?.startTime ?? Number.NaN),
      hash: [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join(''),
      width: canvas.width,
      height: canvas.height,
      ...(withHook && renderTrace
        ? { viewport: renderTrace.viewport(), trace: renderTrace.snapshot().at(-1) }
        : {}),
      retriedAfterStall: false,
    };
  }, hook) as Promise<RenderCapture>;
};
