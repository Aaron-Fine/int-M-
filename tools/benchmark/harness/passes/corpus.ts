/**
 * Corpus pass (plan §9): per case and repetition, one render per arm on a
 * fresh-enough browser context, in rotated arm order. The hook arm is the
 * production renderer with `?perf=1`; the plain arm omits the hook; compare
 * arms add a query or a compare build. Summaries pair arms by repetition.
 */
import type { Session } from '../session.ts';
import type { RenderCapture, ViewportLike } from '../capture.ts';
import { measureRender, withStallRetry } from '../capture.ts';
import type { BrowserContext, Page } from '@playwright/test';
import {
  appendPartial,
  claimPartial,
  completedCases,
  readPartial,
  type PartialHeader,
} from '../checkpoint.ts';
import { evaluateBudget } from '../budgets.ts';
import { armOrder } from '../schedule.ts';
import { median, pairedRatio, regression } from '../stats.ts';
import { sessionLocked } from '../session.ts';

export interface CorpusCase {
  readonly id: string;
  readonly class: string;
  readonly center: { readonly re: string; readonly im: string };
  readonly spanY: string;
  readonly profile: string;
  readonly designation: string;
}

export interface ArmSpec {
  readonly name: string;
  readonly hook: boolean;
  readonly query?: string;
  readonly dist?: string;
}

export interface CorpusSample {
  readonly caseId: string;
  readonly repetition: number;
  readonly arm: string;
  readonly climate: string;
  readonly markWallMs: number;
  readonly stableMs: number | undefined;
  readonly coarseMs: number | undefined;
  readonly classifyMs: number | undefined;
  readonly hash: string;
  readonly retriedAfterStall: boolean;
  readonly bandsElapsedMs?: readonly number[] | undefined;
  /** The stable computed frame of the render trace (hook arms only). */
  readonly trace?: unknown;
}

/** A case that stalled twice and was abandoned; it fails the gate. */
export interface IncompleteCase {
  readonly caseId: string;
  readonly stalls: number;
  readonly reason: string;
  readonly repetition: number;
}

export const urlFor = (baseUrl: string, caseInfo: CorpusCase, arm: ArmSpec): string => {
  const view = `view=${caseInfo.center.re},${caseInfo.center.im},${caseInfo.spanY}&quality=${caseInfo.profile.toLowerCase()}`;
  const parts = [
    ...(arm.hook ? ['perf=1'] : []),
    ...(arm.query === undefined ? [] : [arm.query]),
    view,
  ];
  return `${baseUrl}/?${parts.join('&')}`;
};

/** Fails fast when an arm did not apply the corpus view (?view= ignored). */
export const assertViewport = (caseInfo: CorpusCase, viewport: ViewportLike, arm: string): void => {
  if (
    viewport.center.re !== Number(caseInfo.center.re) ||
    viewport.center.im !== Number(caseInfo.center.im) ||
    viewport.spanY !== Number(caseInfo.spanY)
  ) {
    throw new Error(
      `${caseInfo.id}: arm ${arm} did not apply ?view= (got ${JSON.stringify(viewport)})`,
    );
  }
};

const warm = (samples: readonly CorpusSample[], arm: string): CorpusSample[] =>
  samples.filter((s) => s.arm === arm && s.climate === 'warm');

const values = (
  samples: readonly CorpusSample[],
  pick: (s: CorpusSample) => number | undefined,
): number[] => samples.map(pick).filter((v): v is number => v !== undefined);

/**
 * Pairs two arms' values by repetition, so a missing value on one side drops
 * that repetition from both rather than shifting the pairing.
 */
const aligned = (
  baseline: readonly CorpusSample[],
  candidate: readonly CorpusSample[],
  pick: (s: CorpusSample) => number | undefined,
): [number[], number[]] => {
  const candidateByRepetition = new Map(candidate.map((s) => [s.repetition, pick(s)]));
  const base: number[] = [];
  const cand: number[] = [];
  for (const sample of baseline) {
    const b = pick(sample);
    const c = candidateByRepetition.get(sample.repetition);
    if (b !== undefined && c !== undefined) {
      base.push(b);
      cand.push(c);
    }
  }
  return [base, cand];
};

export const summarizeCase = (
  caseInfo: CorpusCase,
  samples: readonly CorpusSample[],
  arms: readonly ArmSpec[],
  seed: number,
  incomplete: readonly IncompleteCase[] = [],
) => {
  const own = samples.filter((s) => s.caseId === caseInfo.id);
  const hook = warm(own, 'hook');
  const plain = warm(own, 'plain');
  const stableMedian = median(values(hook, (s) => s.stableMs));
  const coarseMedian = median(values(hook, (s) => s.coarseMs));
  const reference = own.find((s) => s.arm === 'hook')?.hash;
  const compare: Record<
    string,
    {
      wall?: ReturnType<typeof pairedRatio>;
      classify?: ReturnType<typeof pairedRatio>;
      regression?: ReturnType<typeof regression>;
      hashMismatches: number;
    }
  > = {};
  for (const arm of arms.filter((a) => a.name !== 'hook' && a.name !== 'plain')) {
    const other = warm(own, arm.name);
    const [otherStable, hookStable] = aligned(other, hook, (s) => s.stableMs);
    const [otherClassify, hookClassify] = aligned(other, hook, (s) => s.classifyMs);
    compare[arm.name] = {
      wall: pairedRatio(otherStable, hookStable, seed),
      classify: pairedRatio(otherClassify, hookClassify, seed),
      regression: regression(otherStable, hookStable, seed),
      hashMismatches: own.filter((s) => s.arm === arm.name && s.hash !== reference).length,
    };
  }
  const [plainWall, hookWall] = aligned(plain, hook, (s) => s.markWallMs);
  return {
    caseId: caseInfo.id,
    caseClass: caseInfo.class,
    stableMedianMs: stableMedian,
    coarseMedianMs: coarseMedian,
    budget: evaluateBudget(caseInfo.class, coarseMedian, stableMedian),
    hookOverhead: pairedRatio(plainWall, hookWall, seed),
    hashMismatches: own.filter(
      (s) => (s.arm === 'hook' || s.arm === 'plain') && s.hash !== reference,
    ).length,
    stalls: own.filter((s) => s.retriedAfterStall).length,
    incomplete: incomplete.find((entry) => entry.caseId === caseInfo.id),
    compare,
  };
};
export type CaseSummary = ReturnType<typeof summarizeCase>;

/**
 * Hook overhead pooled across cases: every case's warm plain/hook pairs
 * (matched by repetition within the case) feed one paired interval.
 */
export const pooledHookOverhead = (samples: readonly CorpusSample[], seed: number) => {
  const plainAll: number[] = [];
  const hookAll: number[] = [];
  const caseIds = [...new Set(samples.map((s) => s.caseId))];
  for (const caseId of caseIds) {
    const own = samples.filter((s) => s.caseId === caseId);
    const [plainWall, hookWall] = aligned(
      warm(own, 'plain'),
      warm(own, 'hook'),
      (s) => s.markWallMs,
    );
    plainAll.push(...plainWall);
    hookAll.push(...hookWall);
  }
  return pairedRatio(plainAll, hookAll, seed);
};

/** Hook may be at most this much slower than plain (non-inferiority bound, release runs only). */
export const HOOK_OVERHEAD_MAX = 1.05;

export type HookOverheadVerdict = 'pass' | 'fail' | 'not-gated';

/**
 * Non-inferiority gate on the pooled plain/hook interval (< 1 means the hook is slower).
 * Fails when the lower bound shows the hook could be more than 5% slower.
 * Binds only release runs; other runs report the row without gating it.
 */
export const hookOverheadVerdict = (
  pooled: { interval: readonly [number, number] } | undefined,
  release: boolean,
): HookOverheadVerdict => {
  if (!release) return 'not-gated';
  if (pooled === undefined) return 'fail';
  return pooled.interval[0] < 1 / HOOK_OVERHEAD_MAX ? 'fail' : 'pass';
};

interface Frame {
  stage: string;
  source: string;
  requestToPresentMs: number;
  classifyMs?: number;
  bandsElapsedMs?: number[];
}

const frameOf = (capture: { trace?: unknown }, pick: (f: Frame) => boolean): Frame | undefined => {
  const trace = capture.trace as { frames?: Frame[] } | undefined;
  return trace?.frames?.find(pick);
};

export interface Live {
  context: BrowserContext;
  page: Page;
}

const openLive = async (session: Session): Promise<Live> => {
  const context = await session.browser.newContext({
    viewport: session.viewport,
    deviceScaleFactor: 1,
  });
  return { context, page: await context.newPage() };
};

/** One arm's render; a stall re-renders on a fresh context and is recorded. */
const captureArm = async (
  session: Session,
  live: Live,
  caseInfo: CorpusCase,
  arm: ArmSpec,
  baseUrl: string,
): Promise<{ capture: RenderCapture; retried: boolean }> => {
  let retried = false;
  const capture = await withStallRetry(
    async (fresh) => {
      if (fresh) {
        await live.context.close();
        Object.assign(live, await openLive(session));
      }
      return measureRender(live.page, urlFor(baseUrl, caseInfo, arm), arm.hook);
    },
    () => {
      retried = true;
    },
  );
  return { capture, retried };
};

/** What the pass needs from a browser; tests substitute a stub. */
export interface CorpusDriver {
  baseUrl(arm: ArmSpec): string | undefined;
  open(): Promise<Live>;
  capture(
    live: Live,
    caseInfo: CorpusCase,
    arm: ArmSpec,
    baseUrl: string,
  ): Promise<{ capture: RenderCapture; retried: boolean }>;
}

const sessionDriver = (session: Session): CorpusDriver => ({
  baseUrl: (arm) => session.baseUrls[arm.dist ?? 'current'],
  open: () => openLive(session),
  capture: (live, caseInfo, arm, baseUrl) => captureArm(session, live, caseInfo, arm, baseUrl),
});

export interface CorpusPassOptions {
  readonly header: PartialHeader;
  readonly driver?: CorpusDriver;
  readonly locked?: () => boolean | null;
}

export interface CorpusPassResult {
  readonly samples: CorpusSample[];
  readonly incomplete: IncompleteCase[];
}

const isStall = (error: unknown): boolean =>
  error instanceof Error && error.name === 'TimeoutError';

/**
 * Runs every case. A case that stalls twice is recorded as incomplete and the
 * pass moves on; a stall on a locked session throws the resumable error
 * instead, since every later case would stall too.
 */
export const runCorpusPass = async (
  session: Session,
  cases: readonly CorpusCase[],
  arms: readonly ArmSpec[],
  reps: number,
  partialFile: string,
  checkLock: boolean,
  options: CorpusPassOptions,
): Promise<CorpusPassResult> => {
  const driver = options.driver ?? sessionDriver(session);
  const locked = options.locked ?? sessionLocked;
  const armByName = new Map(arms.map((arm) => [arm.name, arm]));
  claimPartial(partialFile, options.header);
  const done = completedCases(
    readPartial(partialFile) as CorpusSample[],
    cases.map((c) => c.id),
    reps,
    arms.map((a) => a.name),
  );
  const incomplete: IncompleteCase[] = [];
  const incompleteSamples: CorpusSample[] = [];
  for (const caseInfo of cases) {
    if (done.has(caseInfo.id)) continue;
    if (checkLock && locked() === true)
      throw new Error(`session locked before ${caseInfo.id}; resume with --resume`);
    const caseSamples: CorpusSample[] = [];
    let abandoned: IncompleteCase | undefined;
    for (let repetition = 0; repetition < reps && abandoned === undefined; repetition += 1) {
      const order = armOrder(
        arms.map((a) => a.name),
        repetition,
      );
      const live = await driver.open();
      try {
        for (const name of order) {
          const arm = armByName.get(name);
          if (arm === undefined) throw new Error(`unknown arm ${name}`);
          const baseUrl = driver.baseUrl(arm);
          if (baseUrl === undefined) throw new Error(`no served build for arm ${arm.name}`);
          let result: Awaited<ReturnType<CorpusDriver['capture']>>;
          try {
            result = await driver.capture(live, caseInfo, arm, baseUrl);
          } catch (error) {
            if (!isStall(error)) throw error;
            if (checkLock && locked() === true) {
              throw new Error(
                `session locked during ${caseInfo.id}; resume with --resume (${(error as Error).message})`,
              );
            }
            abandoned = {
              caseId: caseInfo.id,
              repetition,
              stalls: caseSamples.filter((s) => s.retriedAfterStall).length + 2,
              reason: `arm ${name} stalled twice at repetition ${repetition}: ${(error as Error).message.split('\n')[0] ?? 'timeout'}`,
            };
            break;
          }
          const { capture, retried } = result;
          if (arm.hook) {
            if (capture.viewport === undefined)
              throw new Error(`${caseInfo.id}: arm ${arm.name} reported no viewport`);
            assertViewport(caseInfo, capture.viewport, arm.name);
          }
          const stable = frameOf(capture, (f) => f.stage === 'stable' && f.source === 'computed');
          const coarse = frameOf(capture, (f) => f.stage === 'coarse');
          caseSamples.push({
            caseId: caseInfo.id,
            repetition,
            arm: name,
            climate: repetition === 0 ? 'cold' : 'warm',
            markWallMs: capture.markWallMs,
            stableMs: stable?.requestToPresentMs,
            coarseMs: coarse?.requestToPresentMs,
            classifyMs: stable?.classifyMs,
            bandsElapsedMs: stable?.bandsElapsedMs,
            ...(arm.hook && stable !== undefined ? { trace: stable } : {}),
            hash: capture.hash,
            retriedAfterStall: retried,
          });
        }
      } finally {
        await live.context.close().catch(() => undefined);
      }
    }
    if (abandoned === undefined) {
      appendPartial(partialFile, caseSamples);
    } else {
      incomplete.push(abandoned);
      incompleteSamples.push(...caseSamples);
    }
  }
  const selectedCases = new Set(cases.map((c) => c.id));
  const selectedArms = new Set(arms.map((a) => a.name));
  const samples = (readPartial(partialFile) as CorpusSample[]).filter(
    (s) => selectedCases.has(s.caseId) && selectedArms.has(s.arm),
  );
  return { samples: [...samples, ...incompleteSamples], incomplete };
};
