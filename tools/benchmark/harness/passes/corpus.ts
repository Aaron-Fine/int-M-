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
import { appendPartial, completedCases, readPartial } from '../checkpoint.ts';
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
    hashMismatches: own.filter((s) => s.hash !== reference).length,
    stalls: own.filter((s) => s.retriedAfterStall).length,
    compare,
  };
};
export type CaseSummary = ReturnType<typeof summarizeCase>;

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

interface Live {
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

export const runCorpusPass = async (
  session: Session,
  cases: readonly CorpusCase[],
  arms: readonly ArmSpec[],
  reps: number,
  partialFile: string,
): Promise<CorpusSample[]> => {
  const armByName = new Map(arms.map((arm) => [arm.name, arm]));
  const done = completedCases(
    readPartial(partialFile) as CorpusSample[],
    cases.map((c) => c.id),
    reps,
    arms.map((a) => a.name),
  );
  for (const caseInfo of cases) {
    if (done.has(caseInfo.id)) continue;
    if (sessionLocked() === true)
      throw new Error(`session locked before ${caseInfo.id}; resume with --resume`);
    const caseSamples: CorpusSample[] = [];
    for (let repetition = 0; repetition < reps; repetition += 1) {
      const order = armOrder(
        arms.map((a) => a.name),
        repetition,
      );
      const live = await openLive(session);
      try {
        for (const name of order) {
          const arm = armByName.get(name);
          if (arm === undefined) throw new Error(`unknown arm ${name}`);
          const baseUrl = session.baseUrls[arm.dist ?? 'current'];
          if (baseUrl === undefined) throw new Error(`no served build for arm ${arm.name}`);
          const { capture, retried } = await captureArm(session, live, caseInfo, arm, baseUrl);
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
            hash: capture.hash,
            retriedAfterStall: retried,
          });
        }
      } finally {
        await live.context.close();
      }
    }
    appendPartial(partialFile, caseSamples);
  }
  return readPartial(partialFile) as CorpusSample[];
};
