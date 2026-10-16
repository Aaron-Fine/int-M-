#!/usr/bin/env node
/**
 * Release-evidence session CLI (performance plan §8/§9). Runs the corpus pass
 * (budgets, hook overhead, parity, compare arms) and the interaction passes
 * for each engine, writes the evidence bundle, and exits non-zero on any
 * failed gate.
 *
 *   node tools/benchmark/run-release.ts [--engines chromium,firefox] [--release]
 *     [--reps N] [--cases id,...] [--compare name=<query>|name=dist:<dir>]...
 *     [--skip-interactions] [--resume] [--out-dir DIR] [--interactions N]
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
import type { Page } from '@playwright/test';
import { BUDGETS } from './harness/budgets.ts';
import { parseCompare, type Compare, type CompareDist } from './harness/compare.ts';
import { writeEvidence } from './harness/evidence.ts';
import { releaseDefaultReps, releaseRepsProblem } from './harness/schedule.ts';
import {
  DIRECTIONAL_LABEL,
  RELEASE_LABEL,
  automationLabel,
  startSession,
  type Session,
} from './harness/session.ts';
import { RESAMPLES } from './harness/stats.ts';
import {
  HOOK_OVERHEAD_MAX,
  hookOverheadVerdict,
  pooledHookOverhead,
  runCorpusPass,
  summarizeCase,
  urlFor,
  type ArmSpec,
  type CorpusCase,
  type CorpusSample,
  type IncompleteCase,
} from './harness/passes/corpus.ts';
import {
  interactionTable,
  runInteractionPass,
  summarizeInteractions,
  waitForStage,
  type InteractionResults,
} from './harness/passes/interactions.ts';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const SEED = 11;
const RING_LIMIT_BYTES = 65_536;
const RING_RECOLORS = 32;
const STEP_TIMEOUT_MS = 2 * 60_000;
const VIEWS = ['stability', 'multiplier', 'period'];
const ENGINES = ['chromium', 'firefox'] as const;
type Engine = (typeof ENGINES)[number];
type CaseSummary = ReturnType<typeof summarizeCase>;
interface RunScope {
  engines: string[];
  /** Case ids run; `all` is true when no --cases subset was given. */
  cases: string[];
  allCases: boolean;
  reps: number;
  arms: string[];
  skippedPasses: string[];
}
interface RunContext {
  release: boolean;
  resume: boolean;
  scope: RunScope;
  reps: number;
  interactions: number;
  skipInteractions: boolean;
  selected: CorpusCase[];
  hardCase: CorpusCase;
  arms: ArmSpec[];
  compares: Compare[];
  compareDists: CompareDist[];
  commit: string;
  outDir: string;
}
interface EngineRun {
  samples: CorpusSample[];
  incomplete: IncompleteCase[];
  interactionResults: InteractionResults | undefined;
  ringBytes: number;
  viewport: Session['viewport'];
  powerMode: Session['powerMode'];
  lockedHint: Session['lockedHint'];
  browserVersion: Session['version'];
  userAgent: Session['userAgent'];
  launchedBy: Session['launchedBy'];
}

const die: (message: string) => never = (message) => {
  throw new Error(message);
};

const int = (name: string, value: string | undefined, fallback: number): number => {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) die(`--${name} must be a positive integer`);
  return parsed;
};

const corpusCases = (): CorpusCase[] =>
  (
    JSON.parse(readFileSync(path.join(repoRoot, 'tools/benchmark/corpus.v1.json'), 'utf8')) as {
      cases: CorpusCase[];
    }
  ).cases;

const shortHead = (): string =>
  execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();

const today = (): string => new Date().toISOString().slice(0, 10);

const partialPath = (outDir: string, engine: Engine): string =>
  path.join(outDir, `.partial-${engine}.json`);

const num = (value: number | undefined, digits = 2): string =>
  value === undefined || !Number.isFinite(value) ? 'n/a' : value.toFixed(digits);

const table = (headers: readonly string[], rows: readonly (readonly string[])[]): string =>
  [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');

/** Opens a fresh hook page, drives interior-view recolors, and measures the ring's JSON size. */
const ringBytesAfterRecolors = async (session: Session, caseInfo: CorpusCase): Promise<number> => {
  const baseUrl = session.baseUrls['current'];
  if (baseUrl === undefined) die('no current build served');
  const context = await session.browser.newContext({
    viewport: session.viewport,
    deviceScaleFactor: 1,
  });
  try {
    const page: Page = await context.newPage();
    await page.goto(urlFor(baseUrl, caseInfo, { name: 'hook', hook: true }), {
      timeout: STEP_TIMEOUT_MS,
    });
    let last = (await waitForStage(page, 'stable', 0)).id;
    for (let index = 0; index < RING_RECOLORS; index += 1) {
      await page
        .getByLabel('Interior view')
        .selectOption(VIEWS[(index + 1) % VIEWS.length] ?? 'stability');
      last = (await waitForStage(page, 'stable', last)).id;
    }
    const snapshot = await page.evaluate(() => {
      const ring = (globalThis as unknown as { __miRenderTrace?: { snapshot(): unknown } })
        .__miRenderTrace;
      if (ring === undefined) throw new Error('render trace hook missing');
      return ring.snapshot();
    });
    return new TextEncoder().encode(JSON.stringify(snapshot)).length;
  } finally {
    await context.close();
  }
};

/** One engine's session: corpus pass, interaction pass, ring check. Closes the session on every path. */
const runEngine = async (engine: Engine, ctx: RunContext): Promise<EngineRun> => {
  process.stderr.write(`[run-release] ${engine}: starting session\n`);
  const session = await startSession({
    engine,
    release: ctx.release,
    compareDists: ctx.compareDists,
  });
  try {
    const { samples, incomplete } = await runCorpusPass(
      session,
      ctx.selected,
      ctx.arms,
      ctx.reps,
      partialPath(ctx.outDir, engine),
      ctx.release,
      {
        header: {
          release: ctx.release,
          reps: ctx.reps,
          arms: ctx.arms.map((arm) => arm.name),
          commit: ctx.commit,
          caseIds: ctx.selected.map((caseInfo) => caseInfo.id),
        },
      },
    );
    const interactionResults = ctx.skipInteractions
      ? undefined
      : await runInteractionPass(session, ctx.interactions);
    const ringBytes = await ringBytesAfterRecolors(session, ctx.hardCase);
    return {
      samples,
      incomplete,
      interactionResults,
      ringBytes,
      viewport: session.viewport,
      powerMode: session.powerMode,
      lockedHint: session.lockedHint,
      browserVersion: session.version,
      userAgent: session.userAgent,
      launchedBy: session.launchedBy,
    };
  } finally {
    await session.close();
  }
};

/** Plain/hook overhead pooled across all cases of one engine run. */
const pooledOverhead = (samples: CorpusSample[]) => pooledHookOverhead(samples, SEED);

/** Returns one message per failed gate: budgets, hash parity, hook overhead, ring retention, provenance. */
const gateFailures = (
  engine: Engine,
  run: EngineRun,
  summaries: CaseSummary[],
  release: boolean,
): string[] => {
  const failures: string[] = [];
  if (run.ringBytes > RING_LIMIT_BYTES) {
    failures.push(`${engine}: ring retention ${run.ringBytes} bytes > ${RING_LIMIT_BYTES}`);
  }
  for (const summary of summaries) {
    const label = `${engine} ${summary.caseId}`;
    if (summary.incomplete !== undefined) {
      failures.push(
        `${label}: incomplete after ${summary.incomplete.stalls} stalls (${summary.incomplete.reason})`,
      );
    }
    if (summary.budget.coarse === 'fail' || summary.budget.stable === 'fail') {
      failures.push(
        `${label}: budget failed (coarse ${summary.budget.coarse}, stable ${summary.budget.stable})`,
      );
    }
    if (summary.hashMismatches > 0) {
      failures.push(`${label}: ${summary.hashMismatches} hash mismatch(es)`);
    }
  }
  const pooled = pooledOverhead(run.samples);
  if (hookOverheadVerdict(pooled, release) === 'fail') {
    const lower = pooled?.interval[0];
    failures.push(
      `${engine}: hook overhead may exceed 5% (pooled plain/hook lower bound ${num(lower, 3)} < ${num(1 / HOOK_OVERHEAD_MAX, 3)})`,
    );
  }
  if (run.interactionResults !== undefined) {
    const violations = summarizeInteractions(run.interactionResults).reduce(
      (sum, row) => sum + row.violations,
      0,
    );
    if (violations > 0) failures.push(`${engine}: ${violations} provenance violation(s)`);
  }
  return failures;
};

const budgetSection = (engine: Engine, summaries: CaseSummary[]): string =>
  `## ${engine} — budgets\n\n${table(
    [
      'Case',
      'Class',
      'coarse median (ms)',
      'coarse budget (ms)',
      'stable median (ms)',
      'stable budget (ms)',
      'verdict (coarse / stable)',
    ],
    summaries.map((summary) => [
      summary.caseId,
      summary.caseClass,
      num(summary.coarseMedianMs),
      String(BUDGETS.coarseMedianMs),
      num(summary.stableMedianMs),
      String(summary.budget.stableBudgetMs),
      summary.incomplete === undefined
        ? `${summary.budget.coarse} / ${summary.budget.stable}`
        : `incomplete (${summary.incomplete.reason})`,
    ]),
  )}\n\nHonesty note: \`requestToPresentMs\` ends at the next presentation opportunity; it is not proof of paint.`;

const overheadSection = (
  engine: Engine,
  run: EngineRun,
  summaries: CaseSummary[],
  release: boolean,
): string => {
  const pooled = pooledOverhead(run.samples);
  const row = (label: string, overhead: ReturnType<typeof pooledOverhead>) => [
    label,
    String(overhead?.pairs ?? 0),
    num(overhead?.ratio, 3),
    overhead ? `[${num(overhead.interval[0], 3)}, ${num(overhead.interval[1], 3)}]` : 'n/a',
  ];
  return `## ${engine} — hook overhead\n\n${table(
    ['Case', 'pairs', 'plain/hook ratio', 'interval'],
    [
      row(release ? 'pooled (gated)' : 'pooled (not gated: not a release run)', pooled),
      ...summaries.map((summary) => row(summary.caseId, summary.hookOverhead)),
    ],
  )}\n\nRing retention: ${run.ringBytes} bytes measured after ${RING_RECOLORS} recolors (limit ${RING_LIMIT_BYTES}).`;
};

const paritySection = (engine: Engine, summaries: CaseSummary[]): string =>
  `## ${engine} — parity and stalls\n\n${table(
    ['Case', 'hash mismatches (hook/plain)', 'stalls'],
    summaries.map((summary) => [
      summary.caseId,
      String(summary.hashMismatches),
      String(summary.stalls),
    ]),
  )}`;

const interactionSection = (engine: Engine, run: EngineRun): string =>
  run.interactionResults === undefined
    ? `## ${engine} — interactions\n\nSkipped (--skip-interactions).`
    : `## ${engine} — interactions\n\n${interactionTable(summarizeInteractions(run.interactionResults))}\n\nHonesty notes: cancel and inflight-replay rows count only samples that won their race; raced samples are reported, not dropped. Violations count every provenance check that failed.`;

const compareSection = (engine: Engine, compare: Compare, summaries: CaseSummary[]): string =>
  `## ${engine} — compare ${compare.arm.name}\n\n${table(
    [
      'Case',
      'pairs',
      'wall ratio (arm/hook)',
      'wall interval',
      'classify ratio',
      'stable Δ (ms)',
      'regression',
      'hash mismatches (arm vs hook)',
    ],
    summaries.map((summary) => {
      const entry = summary.compare[compare.arm.name];
      return [
        summary.caseId,
        String(entry?.wall?.pairs ?? 0),
        num(entry?.wall?.ratio, 3),
        entry?.wall
          ? `[${num(entry.wall.interval[0], 3)}, ${num(entry.wall.interval[1], 3)}]`
          : 'n/a',
        num(entry?.classify?.ratio, 3),
        num(entry?.regression?.deltaMs),
        entry?.regression?.flagged ? 'yes' : 'no',
        String(entry?.hashMismatches ?? 0),
      ];
    }),
  )}`;

const labelOf = (release: boolean): 'release' | 'directional' =>
  release ? 'release' : 'directional';

const scopeText = (scope: RunScope): string =>
  [
    `engines ${scope.engines.join(', ')}`,
    scope.allCases ? `cases all ${scope.cases.length}` : `cases ${scope.cases.join(', ')} (subset)`,
    `reps ${scope.reps} (1 cold + ${scope.reps - 1} warm)`,
    `arms ${scope.arms.join(', ')}`,
    `skipped passes ${scope.skippedPasses.length === 0 ? 'none' : scope.skippedPasses.join(', ')}`,
  ].join('; ');

const summaryHeader = (ctx: RunContext): string =>
  `# ${ctx.release ? 'Release' : 'Directional'} evidence session\n\nLabel: ${labelOf(ctx.release)}. ${
    ctx.release ? RELEASE_LABEL : DIRECTIONAL_LABEL
  }\n\nScope: ${scopeText(ctx.scope)}.\n`;

/** Protocol facts shared by an engine's environment entry and raw entry. */
const protocolFacts = (ctx: RunContext, engine: Engine, run: EngineRun) => ({
  label: labelOf(ctx.release),
  labelText: ctx.release ? RELEASE_LABEL : DIRECTIONAL_LABEL,
  scope: ctx.scope,
  automation: automationLabel(engine, ctx.release, run.launchedBy),
  seed: SEED,
  resamples: RESAMPLES,
  powerMode: run.powerMode,
  viewport: run.viewport,
  lockedHint: run.lockedHint,
});

const writeEngineEvidence = (
  ctx: RunContext,
  engine: Engine,
  run: EngineRun,
  summaries: CaseSummary[],
): void => {
  const facts = protocolFacts(ctx, engine, run);
  writeEvidence(ctx.outDir, {
    engine,
    environment: {
      engine,
      browserVersion: run.browserVersion,
      userAgent: run.userAgent,
      launchedBy: run.launchedBy,
      release: ctx.release,
      reps: ctx.reps,
      interactions: ctx.skipInteractions ? null : ctx.interactions,
      commit: ctx.commit,
      ...facts,
    },
    raw: {
      ...facts,
      release: ctx.release,
      reps: ctx.reps,
      commit: ctx.commit,
      caseIds: ctx.selected.map((caseInfo) => caseInfo.id),
      arms: ctx.arms.map((arm) => arm.name),
      samples: run.samples,
      incomplete: run.incomplete,
      interactions: run.interactionResults ?? null,
      ringBytes: run.ringBytes,
    },
    summaryHeader: summaryHeader(ctx),
    summarySections: [
      budgetSection(engine, summaries),
      overheadSection(engine, run, summaries, ctx.release),
      paritySection(engine, summaries),
      interactionSection(engine, run),
      ...ctx.compares.map((compare) => compareSection(engine, compare, summaries)),
    ],
  });
};

/**
 * With --resume, an engine whose evidence is already written under the same
 * protocol is not measured again; its gates are re-evaluated from the raw file.
 */
const finishedEngine = (ctx: RunContext, engine: Engine): EngineRun | undefined => {
  if (!ctx.resume) return undefined;
  const rawPath = path.join(ctx.outDir, 'raw-observations.json');
  if (!existsSync(rawPath)) return undefined;
  const entry = (
    JSON.parse(readFileSync(rawPath, 'utf8')) as {
      byEngine?: Record<string, Record<string, unknown> | undefined>;
    }
  ).byEngine?.[engine];
  if (entry === undefined) return undefined;
  const same =
    entry['reps'] === ctx.reps &&
    entry['release'] === ctx.release &&
    entry['commit'] === ctx.commit &&
    JSON.stringify(entry['caseIds']) === JSON.stringify(ctx.selected.map((c) => c.id)) &&
    JSON.stringify(entry['arms']) === JSON.stringify(ctx.arms.map((a) => a.name)) &&
    (entry['interactions'] === null) === ctx.skipInteractions &&
    Array.isArray(entry['incomplete']) &&
    entry['incomplete'].length === 0;
  if (!same) return undefined;
  return {
    samples: entry['samples'] as CorpusSample[],
    incomplete: [],
    interactionResults: (entry['interactions'] ?? undefined) as InteractionResults | undefined,
    ringBytes: entry['ringBytes'] as number,
    viewport: entry['viewport'] as Session['viewport'],
    powerMode: entry['powerMode'] as Session['powerMode'],
    lockedHint: entry['lockedHint'] as Session['lockedHint'],
    browserVersion: '',
    userAgent: '',
    launchedBy: undefined,
  };
};

const parseCli = () =>
  parseArgs({
    options: {
      engines: { type: 'string', default: ENGINES.join(',') },
      release: { type: 'boolean', default: false },
      reps: { type: 'string' },
      cases: { type: 'string' },
      compare: { type: 'string', multiple: true, default: [] },
      'skip-interactions': { type: 'boolean', default: false },
      resume: { type: 'boolean', default: false },
      'out-dir': { type: 'string' },
      interactions: { type: 'string' },
    },
  }).values;
type Cli = ReturnType<typeof parseCli>;

const parseEngines = (value: string): Engine[] => {
  const engines = value.split(',').map((engine) => engine.trim());
  for (const engine of engines) {
    if (!(ENGINES as readonly string[]).includes(engine)) die(`unknown engine ${engine}`);
  }
  return engines as Engine[];
};

const selectCases = (all: CorpusCase[], list: string | undefined): CorpusCase[] =>
  list === undefined
    ? all
    : list.split(',').map((id) => {
        const found = all.find((caseInfo) => caseInfo.id === id);
        if (found === undefined) die(`unknown case ${id}`);
        return found;
      });

/** A release session is the whole protocol: it refuses flags that narrow it. */
const checkReleaseFlags = (values: Cli, interactions: number): void => {
  if (!values.release) return;
  if (values.cases !== undefined) die('--release runs the whole corpus; drop --cases');
  if (values['skip-interactions'])
    die('--release runs the interaction pass; drop --skip-interactions');
  if (interactions < 50) die('--release requires --interactions >= 50');
};

const buildContext = (values: Cli, engines: Engine[]): RunContext => {
  const release = values.release;
  const interactions = int('interactions', values.interactions, 50);
  checkReleaseFlags(values, interactions);
  const allCases = corpusCases();
  const selected = selectCases(allCases, values.cases);
  const hardCase = allCases.find((caseInfo) => caseInfo.id === 'mi-hard-supplied-126x');
  if (hardCase === undefined) die('corpus is missing mi-hard-supplied-126x');
  const compares = values.compare.map((spec) => parseCompare(spec, process.cwd()));
  const arms: ArmSpec[] = [
    { name: 'hook', hook: true },
    { name: 'plain', hook: false },
    ...compares.map((compare) => compare.arm),
  ];
  const reps = int('reps', values.reps, release ? releaseDefaultReps(arms.length) : 9);
  const problem = release ? releaseRepsProblem(reps, arms.length) : undefined;
  if (problem !== undefined) die(problem);
  const commit = shortHead();
  const outDir = values['out-dir']
    ? path.resolve(process.cwd(), values['out-dir'])
    : path.join(repoRoot, `evidence/phase-2/${today()}-${commit}-${labelOf(release)}`);
  const skipInteractions = values['skip-interactions'];
  return {
    release,
    resume: values.resume,
    scope: {
      engines,
      cases: selected.map((caseInfo) => caseInfo.id),
      allCases: values.cases === undefined,
      reps,
      arms: arms.map((arm) => arm.name),
      skippedPasses: skipInteractions ? ['interactions'] : [],
    },
    reps,
    interactions,
    skipInteractions,
    selected,
    hardCase,
    arms,
    compares,
    compareDists: compares.flatMap((compare) => (compare.dist ? [compare.dist] : [])),
    commit,
    outDir,
  };
};

/** Measures (or, on --resume, reloads) one engine; returns its gate failures. */
const processEngine = async (ctx: RunContext, engine: Engine): Promise<string[]> => {
  const summarize = (run: EngineRun) =>
    ctx.selected.map((caseInfo) =>
      summarizeCase(caseInfo, run.samples, ctx.arms, SEED, run.incomplete),
    );
  const finished = finishedEngine(ctx, engine);
  if (finished !== undefined) {
    process.stderr.write(
      `[run-release] ${engine}: evidence already written with this protocol; skipping\n`,
    );
    return gateFailures(engine, finished, summarize(finished), ctx.release);
  }
  const run = await runEngine(engine, ctx);
  const summaries = summarize(run);
  const failures = gateFailures(engine, run, summaries, ctx.release);
  // Remove the partial before writing: the manifest hashes every file in outDir.
  rmSync(partialPath(ctx.outDir, engine), { force: true });
  writeEngineEvidence(ctx, engine, run, summaries);
  process.stderr.write(`[run-release] ${engine}: evidence written to ${ctx.outDir}\n`);
  return failures;
};

const main = async (): Promise<void> => {
  const values = parseCli();
  const engines = parseEngines(values.engines);
  const ctx = buildContext(values, engines);
  if (!ctx.resume) {
    for (const engine of engines) {
      if (existsSync(partialPath(ctx.outDir, engine))) {
        die(`${partialPath(ctx.outDir, engine)} exists; pass --resume to continue or remove it`);
      }
    }
  }

  const failures: string[] = [];
  try {
    for (const engine of engines) failures.push(...(await processEngine(ctx, engine)));
  } catch (error) {
    // Gates already collected for finished engines are still results.
    for (const failure of failures) process.stderr.write(`FAILED: ${failure}\n`);
    throw error;
  }

  if (failures.length > 0) {
    for (const failure of failures) process.stderr.write(`FAILED: ${failure}\n`);
    process.exitCode = 1;
  } else {
    process.stderr.write('all release gates passed\n');
  }
};

main().catch((error: unknown) => {
  process.stderr.write(`run-release: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
