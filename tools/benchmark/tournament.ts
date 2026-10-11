/// <reference types="node" />
/**
 * Optimization-tournament judge. See tools/benchmark/candidates/README.md.
 *
 *   npm run tournament -- parity|perf|report|all [options]
 *
 *   --candidates a,b        candidate ids from the registry (default: all)
 *   --include-demo          add the judge self-test candidates (baseline-clone, wrong, ...)
 *   --cases id,id           corpus case ids (default: all 13)
 *   --reps N                paired repetitions per case (default 11)
 *   --warmups N             untimed warmup renders per arm per case (default 1)
 *   --raster WxH            timing raster (default 512x384)
 *   --parity-raster WxH     parity raster (default 256x160)
 *   --shipping-cases a,b    cases also compared at the shipping raster
 *   --no-shipping | --no-oracle
 *   --perf-failed           also time candidates that failed parity (diagnostic only; never ranked)
 *   --out DIR               evidence directory (default evidence/phase-2/optimization-tournament/<date>-<sha>)
 *   --date YYYY-MM-DD       date used in the default directory name
 *   --from DIR              (report) regenerate summary.md from DIR/results.json
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process, { argv, stderr, stdout } from 'node:process';

import type { Candidate } from './candidates/types';
import { baseline } from './candidates/baseline';
import { createDemoCandidates } from './candidates/demo';
import { CANDIDATES } from './candidates/index';
import type { CandidateParity } from './judge/aggregate';
import {
  loadCorpusCases,
  parseRaster,
  rasterLabel,
  SHIPPING_RASTER,
  type CorpusCase,
} from './judge/corpus';
import { captureEnvironment } from './judge/env';
import { runParity } from './judge/parity-run';
import { runPerf, type CandidateTiming } from './judge/perf-run';
import {
  EVIDENCE_LABEL,
  rankCandidates,
  renderSummary,
  type TournamentFlags,
  type TournamentResults,
} from './judge/report';
import { DEFAULT_BOOTSTRAP_RESAMPLES, DEFAULT_BOOTSTRAP_SEED } from './judge/stats';

const COMMANDS = ['parity', 'perf', 'report', 'all'] as const;
type Command = (typeof COMMANDS)[number];

const DEFAULT_PARITY_RASTER = '256x160';
/** 512x384: the raster of docs/verification/ORBIT-RASTER-OPTIMIZATIONS.md's CPU timings. */
const DEFAULT_TIMING_RASTER = '512x384';
const DEFAULT_SHIPPING_CASES = ['mi-hard-rabbit-boundary', 'mi-easy-default-full'];
const SLOWER_THRESHOLD = 0.03;
const OUT_ROOT = 'evidence/phase-2/optimization-tournament';

interface Options {
  readonly command: Command;
  readonly candidates: readonly string[] | undefined;
  readonly includeDemo: boolean;
  readonly cases: readonly string[] | undefined;
  readonly reps: number;
  readonly warmups: number;
  readonly raster: string;
  readonly parityRaster: string;
  readonly shippingCases: readonly string[];
  readonly oracle: boolean;
  readonly perfFailed: boolean;
  readonly out: string | undefined;
  readonly date: string | undefined;
  readonly from: string | undefined;
}

const VALUE_FLAGS = new Set([
  '--candidates',
  '--cases',
  '--reps',
  '--warmups',
  '--raster',
  '--parity-raster',
  '--shipping-cases',
  '--out',
  '--date',
  '--from',
]);
const BOOLEAN_FLAGS = new Set(['--include-demo', '--no-shipping', '--no-oracle', '--perf-failed']);

const list = (value: string | undefined): readonly string[] | undefined =>
  value === undefined ? undefined : value.split(',').filter((entry) => entry !== '');

const positiveInt = (name: string, value: string | undefined, fallback: number): number => {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1)
    throw new RangeError(`${name} must be a positive integer`);
  return parsed;
};

const parseArgs = (args: readonly string[]): Options => {
  const [commandText, ...rest] = args;
  if (!COMMANDS.includes(commandText as Command)) {
    throw new RangeError(`first argument must be one of ${COMMANDS.join('|')}`);
  }
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i] ?? '';
    if (BOOLEAN_FLAGS.has(arg)) flags.add(arg);
    else if (VALUE_FLAGS.has(arg) && rest[i + 1] !== undefined) {
      values.set(arg, rest[i + 1] ?? '');
      i += 1;
    } else throw new RangeError(`unknown or incomplete option "${arg}"`);
  }
  return {
    command: commandText as Command,
    candidates: list(values.get('--candidates')),
    includeDemo: flags.has('--include-demo'),
    cases: list(values.get('--cases')),
    reps: positiveInt('--reps', values.get('--reps'), 11),
    warmups: positiveInt('--warmups', values.get('--warmups'), 1),
    raster: values.get('--raster') ?? DEFAULT_TIMING_RASTER,
    parityRaster: values.get('--parity-raster') ?? DEFAULT_PARITY_RASTER,
    shippingCases: flags.has('--no-shipping')
      ? []
      : (list(values.get('--shipping-cases')) ?? DEFAULT_SHIPPING_CASES),
    oracle: !flags.has('--no-oracle'),
    perfFailed: flags.has('--perf-failed'),
    out: values.get('--out'),
    date: values.get('--date'),
    from: values.get('--from'),
  };
};

const log = (message: string): void => {
  stderr.write(`[tournament] ${message}\n`);
};

const selectCases = (ids: readonly string[] | undefined): readonly CorpusCase[] => {
  const all = loadCorpusCases();
  if (ids === undefined) return all;
  return ids.map((id) => {
    const found = all.find((entry) => entry.id === id);
    if (found === undefined)
      throw new RangeError(`unknown case "${id}"; known: ${all.map((c) => c.id).join(', ')}`);
    return found;
  });
};

const selectCandidates = (
  options: Options,
): { all: readonly Candidate[]; demo: ReadonlySet<string> } => {
  const demo = options.includeDemo ? createDemoCandidates() : [];
  const registry = [...CANDIDATES, ...demo];
  const ids = registry.map((candidate) => candidate.id);
  if (new Set(ids).size !== ids.length || ids.includes(baseline.id)) {
    throw new RangeError(
      `candidate ids must be unique and not "${baseline.id}": ${ids.join(', ')}`,
    );
  }
  const wanted = options.candidates;
  const chosen =
    wanted === undefined
      ? registry
      : wanted.map((id) => {
          const found = registry.find((candidate) => candidate.id === id);
          if (found === undefined)
            throw new RangeError(`unknown candidate "${id}"; known: ${ids.join(', ')}`);
          return found;
        });
  return { all: chosen, demo: new Set(demo.map((candidate) => candidate.id)) };
};

const printParity = (results: readonly CandidateParity[]): void => {
  for (const p of results) {
    stdout.write(`\n=== ${p.id}  [${p.policy}]  ${p.passed ? 'PASS' : 'FAIL'}\n`);
    if (!p.passed) stdout.write(`    reasons: ${p.failureReasons.join('; ')}\n`);
    for (const problem of p.toleranceProblems) stdout.write(`    tolerance rejected: ${problem}\n`);
    for (const t of p.declaredTolerances) {
      stdout.write(
        `    tolerance ${t.field}: declared ${t.declared}; max observed abs ${t.maxObservedAbs.toExponential(2)}${t.maxObservedRel === undefined ? '' : ` rel ${t.maxObservedRel.toExponential(2)}`}; ${t.pixelsWithinTolerance} pixel-fields within tolerance\n`,
      );
    }
    for (const c of p.cases.filter((entry) => entry.error !== undefined)) {
      stdout.write(`    ERROR ${c.caseId} @ ${c.raster}: ${c.error}\n`);
    }
    if (p.violationCount > 0) {
      const byField = Object.entries(p.violationsByField)
        .map(([field, count]) => `${field}=${count}`)
        .join(' ');
      stdout.write(`    violations by field: ${byField}\n`);
    }
    for (const m of p.firstMismatches) {
      stdout.write(
        `    mismatch: case=${m.caseId} raster=${m.raster} pixel=${m.pixel} (${m.x},${m.y}) field=${m.field} baseline=${String(m.baseline)} candidate=${String(m.candidate)}\n`,
      );
    }
    if (p.violationCount > p.firstMismatches.length) {
      stdout.write(
        `    ... ${p.violationCount} violations in total (first ${p.firstMismatches.length} shown)\n`,
      );
    }
    if (p.policy === 'semantic-revision') {
      stdout.write(`    unresolved->accepted conversions: ${p.conversionCount}\n`);
      for (const c of p.firstConversions) {
        stdout.write(
          `    conversion: case=${c.caseId} pixel=${c.pixel} c=${c.c.re}${c.c.im < 0 ? '' : '+'}${c.c.im}i period=${c.period} |lambda|=${c.multiplierMagnitude} arg=${c.multiplierAngle} certificate=${JSON.stringify(c.certificate)}\n`,
        );
      }
    }
    if (p.oracle !== undefined)
      stdout.write(`    oracle fixtures: ${p.oracle.ok ? 'pass' : 'FAIL'}\n`);
  }
};

const printPerf = (timings: readonly CandidateTiming[]): void => {
  for (const t of timings) {
    const a = t.aggregate;
    stdout.write(
      a === undefined
        ? `\n=== ${t.id}: no timing${t.error === undefined ? '' : ` (${t.error})`}\n`
        : `\n=== ${t.id}: geomean speedup ${a.geomeanSpeedup.toFixed(3)}x  95% CI [${a.ci.lo.toFixed(3)}, ${a.ci.hi.toFixed(3)}]  worst ${a.worstCase?.caseId ?? 'n/a'} ${a.worstCase?.ratio.toFixed(3) ?? ''}x  cases >3% slower: ${a.slowerCases.length}\n`,
    );
  }
};

const outputDirectory = (options: Options, shortSha: string): string => {
  const date = options.date ?? new Date().toISOString().slice(0, 10);
  return options.out ?? join(OUT_ROOT, `${date}-${shortSha}`);
};

const writeEvidence = (dir: string, results: TournamentResults): void => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
  writeFileSync(join(dir, 'summary.md'), `${renderSummary(results)}\n`);
  try {
    execFileSync('node_modules/.bin/prettier', ['--write', dir], { stdio: 'ignore' });
  } catch {
    log('prettier not run on the evidence directory (run `npx prettier --write` on it manually)');
  }
  log(`wrote ${join(dir, 'results.json')} and ${join(dir, 'summary.md')}`);
};

const regenerateFromDirectory = (dir: string): void => {
  const results = JSON.parse(readFileSync(join(dir, 'results.json'), 'utf8')) as TournamentResults;
  writeEvidence(dir, { ...results, ranking: rankCandidates(results.parity, results.perf) });
};

const run = async (options: Options): Promise<number> => {
  if (options.command === 'report' && options.from !== undefined) {
    regenerateFromDirectory(options.from);
    return 0;
  }
  const environment = captureEnvironment();
  const cases = selectCases(options.cases);
  const { all: candidates, demo } = selectCandidates(options);
  const shippingCaseIds = options.shippingCases.filter((id) => cases.some((c) => c.id === id));
  log(
    `candidates: ${candidates.map((c) => c.id).join(', ')}; ${cases.length} case(s); load ${environment.loadAverageAtStart.map((v) => v.toFixed(2)).join('/')}`,
  );

  const parity = (
    await runParity(baseline, candidates, {
      cases,
      parityRaster: parseRaster(options.parityRaster),
      shippingRaster: SHIPPING_RASTER,
      shippingCaseIds,
      oracle: options.oracle,
      log,
    })
  ).candidates;
  printParity(parity);

  let perf: readonly CandidateTiming[] = [];
  if (options.command !== 'parity') {
    const timed = options.perfFailed
      ? candidates
      : candidates.filter((c) => parity.find((p) => p.id === c.id)?.passed === true);
    log(
      `timing ${timed.length} of ${candidates.length} candidate(s)${options.perfFailed ? ' (--perf-failed: diagnostic only, ineligible for ranking)' : ' that passed parity'}`,
    );
    perf = await runPerf(baseline, timed, {
      cases,
      raster: parseRaster(options.raster),
      reps: options.reps,
      warmups: options.warmups,
      log,
    });
    printPerf(perf);
  }

  if (options.command === 'report' || options.command === 'all') {
    const flags: TournamentFlags = {
      command: `npm run tournament -- ${argv.slice(2).join(' ')}`,
      candidates: candidates.map((c) => c.id),
      cases: cases.map((c) => c.id),
      reps: options.reps,
      warmups: options.warmups,
      timingRaster: rasterLabel(parseRaster(options.raster)),
      parityRaster: rasterLabel(parseRaster(options.parityRaster)),
      shippingRaster: rasterLabel(SHIPPING_RASTER),
      shippingCases: shippingCaseIds,
      includeDemo: options.includeDemo,
      oracle: options.oracle,
      perfFailed: options.perfFailed,
      bootstrapSeed: DEFAULT_BOOTSTRAP_SEED,
      bootstrapResamples: DEFAULT_BOOTSTRAP_RESAMPLES,
      slowerThreshold: SLOWER_THRESHOLD,
    };
    const results: TournamentResults = {
      schemaVersion: 1,
      label: EVIDENCE_LABEL,
      environment,
      flags,
      candidates: [baseline, ...candidates].map((c) => ({ id: c.id, description: c.description })),
      parity,
      perf,
      ranking: rankCandidates(parity, perf),
    };
    writeEvidence(outputDirectory(options, environment.git.shortSha), results);
  }
  return parity.some((p) => !p.passed && !demo.has(p.id)) ? 1 : 0;
};

// The production row-yield scheduler holds a MessagePort that keeps the event
// loop alive, so exit explicitly once stdout has drained.
const finish = (code: number): void => {
  stdout.write('', () => {
    process.exit(code);
  });
};

try {
  finish(await run(parseArgs(argv.slice(2))));
} catch (error: unknown) {
  stderr.write(`tournament: ${error instanceof Error ? error.message : String(error)}\n`);
  finish(2);
}
