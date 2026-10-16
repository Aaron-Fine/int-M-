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
import { writeEvidence } from './harness/evidence.ts';
import { startSession, type Session } from './harness/session.ts';
import {
  pooledHookOverhead,
  runCorpusPass,
  summarizeCase,
  urlFor,
  type ArmSpec,
  type CorpusCase,
  type CorpusSample,
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
const HOOK_OVERHEAD_LIMIT = 1.05;
const RING_LIMIT_BYTES = 65_536;
const RING_RECOLORS = 32;
const STEP_TIMEOUT_MS = 2 * 60_000;
const VIEWS = ['stability', 'multiplier', 'period'];
const ENGINES = ['chromium', 'firefox'] as const;
type Engine = (typeof ENGINES)[number];
type CaseSummary = ReturnType<typeof summarizeCase>;
interface CompareDist {
  name: string;
  dir: string;
}
interface Compare {
  arm: ArmSpec;
  dist?: CompareDist;
}
interface RunContext {
  release: boolean;
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
  interactionResults: InteractionResults | undefined;
  ringBytes: number;
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

/** Parses `name=<query>` or `name=dist:<dir>`. */
const parseCompare = (spec: string): Compare => {
  const eq = spec.indexOf('=');
  if (eq < 1 || eq === spec.length - 1)
    die(`--compare expects name=<query>|name=dist:<dir>: ${spec}`);
  const name = spec.slice(0, eq);
  const value = spec.slice(eq + 1);
  if (value.startsWith('dist:')) {
    const dir = path.resolve(process.cwd(), value.slice('dist:'.length));
    return { arm: { name, hook: true, dist: name }, dist: { name, dir } };
  }
  return { arm: { name, hook: true, query: value } };
};

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
    const samples = await runCorpusPass(
      session,
      ctx.selected,
      ctx.arms,
      ctx.reps,
      partialPath(ctx.outDir, engine),
      ctx.release,
    );
    const interactionResults = ctx.skipInteractions
      ? undefined
      : await runInteractionPass(session, ctx.interactions);
    const ringBytes = await ringBytesAfterRecolors(session, ctx.hardCase);
    return {
      samples,
      interactionResults,
      ringBytes,
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
const gateFailures = (engine: Engine, run: EngineRun, summaries: CaseSummary[]): string[] => {
  const failures: string[] = [];
  if (run.ringBytes > RING_LIMIT_BYTES) {
    failures.push(`${engine}: ring retention ${run.ringBytes} bytes > ${RING_LIMIT_BYTES}`);
  }
  for (const summary of summaries) {
    const label = `${engine} ${summary.caseId}`;
    if (summary.budget.coarse === 'fail' || summary.budget.stable === 'fail') {
      failures.push(
        `${label}: budget failed (coarse ${summary.budget.coarse}, stable ${summary.budget.stable})`,
      );
    }
    if (summary.hashMismatches > 0) {
      failures.push(`${label}: ${summary.hashMismatches} hash mismatch(es)`);
    }
  }
  const upper = pooledOverhead(run.samples)?.interval[1];
  if (upper !== undefined && upper > HOOK_OVERHEAD_LIMIT) {
    failures.push(
      `${engine}: pooled hook overhead upper bound ${num(upper, 3)} > ${HOOK_OVERHEAD_LIMIT}`,
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
      `${summary.budget.coarse} / ${summary.budget.stable}`,
    ]),
  )}`;

const overheadSection = (engine: Engine, run: EngineRun, summaries: CaseSummary[]): string => {
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
      row('pooled (gated)', pooled),
      ...summaries.map((summary) => row(summary.caseId, summary.hookOverhead)),
    ],
  )}`;
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

const writeEngineEvidence = (
  ctx: RunContext,
  engine: Engine,
  run: EngineRun,
  summaries: CaseSummary[],
): void => {
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
    },
    raw: {
      samples: run.samples,
      interactions: run.interactionResults ?? null,
      ringBytes: run.ringBytes,
    },
    summarySections: [
      budgetSection(engine, summaries),
      overheadSection(engine, run, summaries),
      paritySection(engine, summaries),
      interactionSection(engine, run),
      ...ctx.compares.map((compare) => compareSection(engine, compare, summaries)),
    ],
  });
};

const main = async (): Promise<void> => {
  const { values } = parseArgs({
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
  });

  const engines = values.engines.split(',').map((engine) => engine.trim());
  for (const engine of engines) {
    if (!(ENGINES as readonly string[]).includes(engine)) die(`unknown engine ${engine}`);
  }
  const release = values.release;
  const reps = int('reps', values.reps, release ? 22 : 9);
  const interactions = int('interactions', values.interactions, 50);
  if (release && reps < 22) die('--release requires --reps >= 22');
  if (release && interactions < 50) die('--release requires --interactions >= 50');

  const allCases = corpusCases();
  const selected = values.cases
    ? values.cases.split(',').map((id) => {
        const found = allCases.find((caseInfo) => caseInfo.id === id);
        if (found === undefined) die(`unknown case ${id}`);
        return found;
      })
    : allCases;
  const hardCase = allCases.find((caseInfo) => caseInfo.id === 'mi-hard-supplied-126x');
  if (hardCase === undefined) die('corpus is missing mi-hard-supplied-126x');

  const compares = values.compare.map(parseCompare);
  const arms: ArmSpec[] = [
    { name: 'hook', hook: true },
    { name: 'plain', hook: false },
    ...compares.map((compare) => compare.arm),
  ];
  const commit = shortHead();
  const outDir = values['out-dir']
    ? path.resolve(process.cwd(), values['out-dir'])
    : path.join(repoRoot, `evidence/phase-2/${today()}-${commit}-release`);
  if (!values.resume) {
    for (const engine of engines as Engine[]) {
      if (existsSync(partialPath(outDir, engine))) {
        die(`${partialPath(outDir, engine)} exists; pass --resume to continue or remove it`);
      }
    }
  }

  const ctx: RunContext = {
    release,
    reps,
    interactions,
    skipInteractions: values['skip-interactions'],
    selected,
    hardCase,
    arms,
    compares,
    compareDists: compares.flatMap((compare) => (compare.dist ? [compare.dist] : [])),
    commit,
    outDir,
  };

  const failures: string[] = [];
  for (const engine of engines as Engine[]) {
    const run = await runEngine(engine, ctx);
    const summaries = selected.map((caseInfo) => summarizeCase(caseInfo, run.samples, arms, SEED));
    failures.push(...gateFailures(engine, run, summaries));
    // Remove the partial before writing: the manifest hashes every file in outDir.
    rmSync(partialPath(outDir, engine), { force: true });
    writeEngineEvidence(ctx, engine, run, summaries);
    process.stderr.write(`[run-release] ${engine}: evidence written to ${outDir}\n`);
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
