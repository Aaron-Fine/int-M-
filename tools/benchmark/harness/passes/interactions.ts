/// <reference lib="dom" />
/**
 * Interaction passes (performance plan §8/§9; MI-PERF-006/007). Drives the
 * production bundle through the real application UI and reads the always-on
 * render-trace ring through the opt-in `?perf=1` hook. One persistent page per
 * distribution; every interaction's trace is stored raw.
 *
 * - `cancel`: hard view (mi-hard-supplied-126x). After each coarse frame a zoom
 *   key supersedes it and the application cancels the in-flight request.
 *   Records `cancelAckMs` and `childQuiescenceMs`; a stable frame that wins the
 *   race is recorded as `raced` and does not count.
 * - `inflight-replay`: same view; after each coarse frame the interior view
 *   changes, the worker replays its retained coarse frame, then delivers the
 *   stable frame as `computed` under the new request.
 * - `recolor`: same view, stable; cycle the interior view. Each request is a
 *   cached semantic frame delivered in a different view.
 * - `semantic-cache`: default view (mi-easy-default-full), stable; press Reset.
 *
 * Every interaction is checked against the provenance invariants: the expected
 * source, an `originComputeId` naming the computation that produced the reused
 * frame, and compute fields absent on every non-computed frame.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import type { BrowserContext, Page } from '@playwright/test';
import type { Session } from '../session.ts';
import { mad, median, p95 } from '../stats.ts';
import { urlFor, type CorpusCase } from './corpus.ts';

const repoRoot = path.resolve(import.meta.dirname, '../../../..');
const STEP_TIMEOUT_MS = 2 * 60_000;
const VIEWS = ['stability', 'multiplier', 'period'];
const HARD_ID = 'mi-hard-supplied-126x';
const EASY_ID = 'mi-easy-default-full';

export interface TraceFrame {
  stage: string;
  source: string;
  requestToPresentMs?: number | undefined;
  colorizeMs?: number | undefined;
  originComputeId?: number | undefined;
  workerWallMs?: number | undefined;
  [field: string]: unknown;
}

export interface RenderTrace {
  requestId: number;
  outcome: string;
  computeId?: number | undefined;
  cancelAckMs?: number | undefined;
  childQuiescenceMs?: number | undefined;
  frames: TraceFrame[];
}

interface RingGlobal {
  __miRenderTrace?: { snapshot(): RenderTrace[] };
}

export interface InteractionSample {
  interaction: number;
  requestId: number;
  outcome: string;
  violations: string[];
  cancelAckMs?: number | undefined;
  childQuiescenceMs?: number | undefined;
  replayRequestToPresentMs?: number | undefined;
  replayColorizeMs?: number | undefined;
  stableRequestToPresentMs?: number | undefined;
  requestToPresentMs?: number | undefined;
  colorizeMs?: number | undefined;
  trace: RenderTrace;
}

export interface Distribution {
  case: string;
  profile: string;
  originComputeId?: number | undefined;
  samples: InteractionSample[];
}

export interface InteractionResults {
  cancel: Distribution;
  'inflight-replay': Distribution;
  recolor: Distribution;
  'semantic-cache': Distribution;
}

const log = (message: string): void => {
  process.stderr.write(`[interactions] ${message}\n`);
};

const caseById = (id: string): CorpusCase => {
  const corpus = JSON.parse(
    readFileSync(path.join(repoRoot, 'tools/benchmark/corpus.v1.json'), 'utf8'),
  ) as { cases: CorpusCase[] };
  const found = corpus.cases.find((caseInfo) => caseInfo.id === id);
  if (found === undefined) throw new Error(`corpus case ${id} missing`);
  return found;
};

/**
 * Waits for the request's trace in the ring. `any` accepts any closed trace;
 * `cancel-resolved` accepts a cancelled or completed one.
 */
const waitForTrace = async (
  page: Page,
  kind: 'any' | 'cancel-resolved',
  requestId: number,
): Promise<RenderTrace> => {
  const handle = await page.waitForFunction(
    ([expectedKind, id]: [string, number]) => {
      const traces = (globalThis as unknown as RingGlobal).__miRenderTrace?.snapshot() ?? [];
      return traces.find(
        (trace) =>
          trace.requestId === id &&
          (expectedKind === 'any' ||
            trace.outcome === 'cancelled' ||
            trace.outcome === 'completed'),
      );
    },
    [kind, requestId] as [string, number],
    { timeout: STEP_TIMEOUT_MS, polling: 20 },
  );
  const trace = (await handle.jsonValue()) as RenderTrace | null;
  if (trace === null) throw new Error('render trace missing');
  return trace;
};

/**
 * Waits for a newer request than `afterId` to reach `stage` (or, with
 * `orStable`, to reach either `stage` or stable: a cheap request can pass
 * through its coarse frame between polls).
 */
export const waitForStage = async (
  page: Page,
  stage: string,
  afterId: number,
  orStable = false,
): Promise<{ id: number; stage: string }> => {
  const handle = await page.waitForFunction(
    ([expected, after, acceptStable]: [string, number, boolean]) => {
      const explorer = globalThis.document.querySelector('#explorer');
      const current = explorer?.getAttribute('data-render-stage');
      const id = Number(explorer?.getAttribute('data-render-request-id'));
      return id > after && (current === expected || (acceptStable && current === 'stable'))
        ? { id, stage: current }
        : undefined;
    },
    [stage, afterId, orStable] as [string, number, boolean],
    { timeout: STEP_TIMEOUT_MS, polling: 5 },
  );
  return (await handle.jsonValue()) as { id: number; stage: string };
};

const canvasOf = (page: Page) => page.getByLabel('Interactive Mandelbrot set');
const zoomKey = (index: number): string => (index % 2 === 0 ? '+' : '-');
const viewAt = (index: number): string => VIEWS[index % VIEWS.length] ?? 'stability';

const COMPUTE_FIELDS = [
  'workerWallMs',
  'maxBandElapsedMs',
  'imbalanceRatio',
  'mergeCpuMs',
  'bandsElapsedMs',
  'yieldWaitMs',
  'yieldCount',
];

/** Provenance invariants for one frame (one entry per violation). */
export const checkFrame = (
  frame: TraceFrame,
  expectedSource: string,
  expectedOrigin?: number,
): string[] => {
  const violations: string[] = [];
  if (frame.source !== expectedSource) {
    violations.push(`source ${frame.source} != ${expectedSource}`);
  }
  if (expectedSource === 'computed') {
    if (frame.originComputeId !== undefined) {
      violations.push('computed frame carries originComputeId');
    }
    if (frame.workerWallMs === undefined) violations.push('computed frame lacks workerWallMs');
  } else {
    if (frame.originComputeId !== expectedOrigin) {
      violations.push(`originComputeId ${frame.originComputeId} != ${expectedOrigin}`);
    }
    for (const field of COMPUTE_FIELDS) {
      if (frame[field] !== undefined) violations.push(`${expectedSource} frame carries ${field}`);
    }
  }
  if (frame.colorizeMs === undefined) violations.push('colorizeMs missing');
  return violations;
};

const cancelViolations = (trace: RenderTrace): string[] => {
  if (trace.outcome !== 'cancelled') return [];
  const violations: string[] = [];
  if (trace.cancelAckMs === undefined) violations.push('no cancelAckMs');
  if (trace.childQuiescenceMs === undefined) violations.push('no childQuiescenceMs');
  if (
    trace.cancelAckMs !== undefined &&
    trace.childQuiescenceMs !== undefined &&
    trace.childQuiescenceMs < trace.cancelAckMs
  ) {
    violations.push('quiescence precedes acknowledgment');
  }
  return violations;
};

const openPage = async (
  session: Session,
  caseInfo: CorpusCase,
): Promise<{ context: BrowserContext; page: Page; firstId: number }> => {
  const baseUrl = session.baseUrls['current'];
  if (baseUrl === undefined) throw new Error('no current build served');
  const context = await session.browser.newContext({
    viewport: session.viewport,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.goto(urlFor(baseUrl, caseInfo, { name: 'hook', hook: true }), {
    timeout: STEP_TIMEOUT_MS,
  });
  const { id: firstId } = await waitForStage(page, 'stable', 0);
  await canvasOf(page).focus();
  return { context, page, firstId };
};

const runCancel = async (
  session: Session,
  caseInfo: CorpusCase,
  interactions: number,
): Promise<InteractionSample[]> => {
  const { context, page, firstId } = await openPage(session, caseInfo);
  const samples: InteractionSample[] = [];
  let lastId = firstId;
  let attempts = 0;
  try {
    await canvasOf(page).press(zoomKey(attempts));
    while (samples.filter((sample) => sample.outcome === 'cancelled').length < interactions) {
      if (attempts > interactions * 3) throw new Error('cancel: too many raced attempts');
      const { id: coarseId } = await waitForStage(page, 'coarse', lastId, true);
      attempts += 1;
      // A request already stable is not cancelled; the press only starts the
      // next one, and its trace closes as completed (recorded as raced).
      await canvasOf(page).press(zoomKey(attempts));
      const resolved = await waitForTrace(page, 'cancel-resolved', coarseId);
      lastId = coarseId;
      samples.push({
        interaction: attempts,
        requestId: coarseId,
        outcome: resolved.outcome === 'cancelled' ? 'cancelled' : 'raced',
        cancelAckMs: resolved.cancelAckMs,
        childQuiescenceMs: resolved.childQuiescenceMs,
        violations: cancelViolations(resolved),
        trace: resolved,
      });
      if (attempts % 10 === 0) log(`cancel: ${attempts} interactions`);
    }
  } finally {
    await context.close();
  }
  return samples;
};

const runReplay = async (
  session: Session,
  caseInfo: CorpusCase,
  interactions: number,
): Promise<InteractionSample[]> => {
  const { context, page, firstId } = await openPage(session, caseInfo);
  const samples: InteractionSample[] = [];
  let lastId = firstId;
  let viewIndex = 0;
  try {
    for (let index = 0; index < interactions; index += 1) {
      await canvasOf(page).press(zoomKey(index));
      const { id: coarseId } = await waitForStage(page, 'coarse', lastId, true);
      viewIndex = (viewIndex + 1) % VIEWS.length;
      await page.getByLabel('Interior view').selectOption(viewAt(viewIndex));
      const replayId = coarseId + 1;
      const resolved = await waitForTrace(page, 'any', replayId);
      const origin = await waitForTrace(page, 'any', coarseId);
      lastId = replayId;
      const replay: TraceFrame | undefined = resolved.frames[0];
      const stable = resolved.frames.find((frame) => frame.stage === 'stable');
      const violations: string[] = [];
      // The superseded origin trace carries its computeId only if its coarse
      // frame was recorded before the view change began the new request; the
      // rebound request always carries it.
      const originComputeId = origin.computeId ?? resolved.computeId;
      if (origin.computeId !== undefined && resolved.computeId !== origin.computeId) {
        violations.push(`origin computeId ${origin.computeId} != rebound ${resolved.computeId}`);
      }
      if (replay === undefined || stable === undefined) {
        violations.push(`incomplete replay trace (outcome ${resolved.outcome})`);
      } else if (replay.stage === 'coarse') {
        violations.push(...checkFrame(replay, 'inflight-replay', originComputeId));
        violations.push(...checkFrame(stable, 'computed'));
        if (resolved.computeId !== originComputeId) {
          violations.push(`rebound computeId ${resolved.computeId} != ${originComputeId}`);
        }
      }
      const replayed = replay?.source === 'inflight-replay';
      samples.push({
        interaction: index,
        requestId: replayId,
        // The stable frame can win the race against the view change.
        outcome: replayed ? 'replayed' : 'raced',
        replayRequestToPresentMs: replay?.requestToPresentMs,
        replayColorizeMs: replay?.colorizeMs,
        stableRequestToPresentMs: stable?.requestToPresentMs,
        violations: replayed ? violations : [],
        trace: resolved,
      });
      if ((index + 1) % 10 === 0) log(`inflight-replay: ${index + 1} interactions`);
    }
  } finally {
    await context.close();
  }
  return samples;
};

const runCached = async (
  session: Session,
  caseInfo: CorpusCase,
  distribution: 'recolor' | 'semantic-cache',
  interactions: number,
): Promise<{ originComputeId?: number | undefined; samples: InteractionSample[] }> => {
  const { context, page, firstId } = await openPage(session, caseInfo);
  const samples: InteractionSample[] = [];
  try {
    let origin = await waitForTrace(page, 'any', firstId);
    let lastId = firstId;
    if (distribution === 'semantic-cache') {
      // Settle on the exact Reset viewport first: the corpus view's decimal
      // strings need not equal the default viewport bit for bit.
      await canvasOf(page).press('0');
      lastId = (await waitForStage(page, 'stable', lastId)).id;
      const reset = await waitForTrace(page, 'any', lastId);
      if (reset.computeId !== undefined) origin = reset;
    }
    let viewIndex = 0;
    for (let index = 0; index < interactions; index += 1) {
      if (distribution === 'recolor') {
        viewIndex = (viewIndex + 1) % VIEWS.length;
        await page.getByLabel('Interior view').selectOption(viewAt(viewIndex));
      } else {
        await canvasOf(page).press('0');
      }
      const { id: requestId } = await waitForStage(page, 'stable', lastId);
      lastId = requestId;
      const resolved = await waitForTrace(page, 'any', requestId);
      const frame: TraceFrame | undefined = resolved.frames[0];
      samples.push({
        interaction: index,
        requestId,
        outcome: resolved.outcome,
        requestToPresentMs: frame?.requestToPresentMs,
        colorizeMs: frame?.colorizeMs,
        violations: [
          ...(resolved.frames.length === 1
            ? []
            : [`expected 1 frame, got ${resolved.frames.length}`]),
          ...(frame === undefined
            ? ['no frame']
            : checkFrame(frame, distribution, origin.computeId)),
          ...(resolved.computeId === undefined ? [] : ['reused request carries a computeId']),
        ],
        trace: resolved,
      });
      if ((index + 1) % 10 === 0) log(`${distribution}: ${index + 1} interactions`);
    }
    return { originComputeId: origin.computeId, samples };
  } finally {
    await context.close();
  }
};

/**
 * Runs the four interaction distributions against the served current build
 * (hard case for cancel, replay, and recolor; default view for semantic-cache).
 */
export const runInteractionPass = async (
  session: Session,
  interactions: number,
): Promise<InteractionResults> => {
  if (!Number.isInteger(interactions) || interactions < 1) {
    throw new Error('interactions must be a positive integer');
  }
  const hard = caseById(HARD_ID);
  const easy = caseById(EASY_ID);
  log('cancel distribution…');
  const cancel = {
    case: hard.id,
    profile: hard.profile,
    samples: await runCancel(session, hard, interactions),
  };
  log('inflight-replay distribution…');
  const replay = {
    case: hard.id,
    profile: hard.profile,
    samples: await runReplay(session, hard, interactions),
  };
  log('recolor distribution…');
  const recolor = {
    case: hard.id,
    profile: hard.profile,
    ...(await runCached(session, hard, 'recolor', interactions)),
  };
  log('semantic-cache distribution…');
  const semanticCache = {
    case: easy.id,
    profile: easy.profile,
    ...(await runCached(session, easy, 'semantic-cache', interactions)),
  };
  return {
    cancel,
    'inflight-replay': replay,
    recolor,
    'semantic-cache': semanticCache,
  };
};

export interface InteractionRow {
  readonly distribution: string;
  readonly metric: string;
  readonly n: number;
  readonly median?: number | undefined;
  readonly mad?: number | undefined;
  readonly p95?: number | undefined;
  readonly min?: number | undefined;
  readonly max?: number | undefined;
  readonly violations: number;
  readonly raced: number;
}

const rowOf = (
  distribution: string,
  metric: string,
  values: readonly (number | undefined)[],
  samples: readonly InteractionSample[],
  raced: number,
): InteractionRow => {
  const finite = values.filter((value): value is number => Number.isFinite(value));
  return {
    distribution,
    metric,
    n: finite.length,
    median: median(finite),
    mad: mad(finite),
    p95: p95(finite),
    min: finite.length === 0 ? undefined : Math.min(...finite),
    max: finite.length === 0 ? undefined : Math.max(...finite),
    violations: samples.reduce((sum, sample) => sum + sample.violations.length, 0),
    raced,
  };
};

/** Table rows (one per distribution metric) from every interaction. */
export const summarizeInteractions = (results: InteractionResults): InteractionRow[] => {
  const cancel = results.cancel.samples;
  const cancelled = cancel.filter((sample) => sample.outcome === 'cancelled');
  const cancelRaced = cancel.length - cancelled.length;
  const replay = results['inflight-replay'].samples;
  const replayed = replay.filter((sample) => sample.outcome === 'replayed');
  return [
    rowOf(
      'cancel',
      'cancelAckMs',
      cancelled.map((sample) => sample.cancelAckMs),
      cancel,
      cancelRaced,
    ),
    rowOf(
      'cancel',
      'childQuiescenceMs',
      cancelled.map((sample) => sample.childQuiescenceMs),
      cancel,
      cancelRaced,
    ),
    rowOf(
      'inflight-replay',
      'requestToPresentMs (replayed coarse)',
      replayed.map((sample) => sample.replayRequestToPresentMs),
      replay,
      replay.length - replayed.length,
    ),
    ...(['recolor', 'semantic-cache'] as const).flatMap((name) => {
      const samples = results[name].samples;
      return [
        rowOf(
          name,
          'requestToPresentMs',
          samples.map((sample) => sample.requestToPresentMs),
          samples,
          0,
        ),
        rowOf(
          name,
          'colorizeMs',
          samples.map((sample) => sample.colorizeMs),
          samples,
          0,
        ),
      ];
    }),
  ];
};

const formatMs = (value: number | undefined): string =>
  value === undefined ? '—' : `${value.toFixed(1)} ms`;

/** Markdown table of `summarizeInteractions` rows. */
export const interactionTable = (rows: readonly InteractionRow[]): string =>
  [
    '| Distribution | Metric | n | median (MAD) | p95 | min / max | provenance violations | raced |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows.map(
      (row) =>
        `| ${row.distribution} | ${row.metric} | ${row.n} | ${formatMs(row.median)} (${formatMs(row.mad)}) | ${formatMs(row.p95)} | ${formatMs(row.min)} / ${formatMs(row.max)} | ${row.violations} | ${row.raced} |`,
    ),
  ].join('\n');
