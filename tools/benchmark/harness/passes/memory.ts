/// <reference lib="dom" />
/**
 * Memory pass (MI-PERF-006). One fresh page per corpus case and measurement:
 * - jsHeap (Chromium): poll CDP Performance.getMetrics JSHeapUsedSize every
 *   POLL_MS from navigation to the stable frame, keep the maximum.
 * - retained (Chromium): on a cross-origin-isolated copy of the build, call
 *   performance.measureUserAgentSpecificMemory() after the stable frame.
 * Firefox offers nothing honest and is recorded as "not measured" without
 * opening a page. See harness/memory.ts for the definitions.
 */
import type { CDPSession, Page } from '@playwright/test';
import {
  JS_HEAP_LABEL,
  RETAINED_LABEL,
  notMeasured,
  summarizeReadings,
  unsupportedEngineMemory,
  type EngineMemory,
  type MemoryEngine,
  type MemoryReading,
} from '../memory.ts';
import type { Session } from '../session.ts';
import { urlFor, type CorpusCase } from './corpus.ts';
import { waitForStage } from './interactions.ts';

const POLL_MS = 50;
const STEP_TIMEOUT_MS = 2 * 60_000;
const PLAIN_ARM = { name: 'plain', hook: false } as const;

const log = (message: string): void => {
  process.stderr.write(`[memory] ${message}\n`);
};

const heapUsedBytes = async (cdp: CDPSession): Promise<number | undefined> => {
  const { metrics } = await cdp.send('Performance.getMetrics');
  return metrics.find((metric) => metric.name === 'JSHeapUsedSize')?.value;
};

/** Peak polled JS heap from navigation to the stable frame; the plain arm, no hook. */
const measureJsHeap = async (session: Session, caseInfo: CorpusCase): Promise<MemoryReading> => {
  const baseUrl = session.baseUrls['current'];
  if (baseUrl === undefined) throw new Error('no current build served');
  const context = await session.browser.newContext({
    viewport: session.viewport,
    deviceScaleFactor: 1,
  });
  try {
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable');
    let peak = Number.NaN;
    const state = { polling: true };
    const sample = async (): Promise<void> => {
      const value = await heapUsedBytes(cdp).catch(() => undefined);
      if (value !== undefined && !(value <= peak)) peak = value;
    };
    const poller = (async () => {
      while (state.polling) {
        await sample();
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      }
    })();
    try {
      await page.goto(urlFor(baseUrl, caseInfo, PLAIN_ARM), { timeout: STEP_TIMEOUT_MS });
      await waitForStage(page, 'stable', 0);
      await sample();
    } finally {
      state.polling = false;
      await poller;
    }
    return { caseId: caseInfo.id, bytes: peak };
  } finally {
    await context.close();
  }
};

type Retained = { readonly bytes: number } | { readonly error: string };

const readRetained = (page: Page): Promise<Retained> =>
  page.evaluate(async (): Promise<Retained> => {
    const scope = globalThis as typeof globalThis & {
      crossOriginIsolated?: boolean;
      performance: Performance & {
        measureUserAgentSpecificMemory?: () => Promise<{ bytes: number }>;
      };
    };
    if (!scope.crossOriginIsolated) return { error: 'page is not cross-origin isolated' };
    if (typeof scope.performance.measureUserAgentSpecificMemory !== 'function') {
      return { error: 'performance.measureUserAgentSpecificMemory is unavailable' };
    }
    try {
      return { bytes: (await scope.performance.measureUserAgentSpecificMemory()).bytes };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  });

/** Snapshot after the stable frame on the isolated build; an error string when unavailable. */
const measureRetained = async (
  session: Session,
  caseInfo: CorpusCase,
): Promise<MemoryReading | string> => {
  const baseUrl = session.baseUrls['isolated'];
  if (baseUrl === undefined) return 'no cross-origin-isolated build was served';
  const context = await session.browser.newContext({
    viewport: session.viewport,
    deviceScaleFactor: 1,
  });
  try {
    const page = await context.newPage();
    await page.goto(urlFor(baseUrl, caseInfo, PLAIN_ARM), { timeout: STEP_TIMEOUT_MS });
    await waitForStage(page, 'stable', 0);
    const result = await readRetained(page);
    return 'error' in result ? result.error : { caseId: caseInfo.id, bytes: result.bytes };
  } finally {
    await context.close();
  }
};

export const runMemoryPass = async (
  session: Session,
  engine: MemoryEngine,
  cases: readonly CorpusCase[],
): Promise<EngineMemory> => {
  if (engine !== 'chromium') return unsupportedEngineMemory(engine);
  const heapReadings: MemoryReading[] = [];
  const retainedReadings: MemoryReading[] = [];
  let retainedReason = 'no readings';
  for (const [index, caseInfo] of cases.entries()) {
    log(`${engine}: ${caseInfo.id} (${index + 1}/${cases.length})`);
    heapReadings.push(await measureJsHeap(session, caseInfo));
    const retained = await measureRetained(session, caseInfo);
    if (typeof retained === 'string') retainedReason = retained;
    else retainedReadings.push(retained);
  }
  return {
    jsHeap: summarizeReadings(JS_HEAP_LABEL, heapReadings, 'CDP returned no JSHeapUsedSize'),
    retained:
      retainedReadings.length === 0
        ? notMeasured(`measureUserAgentSpecificMemory: ${retainedReason}`)
        : summarizeReadings(RETAINED_LABEL, retainedReadings, retainedReason),
  };
};
