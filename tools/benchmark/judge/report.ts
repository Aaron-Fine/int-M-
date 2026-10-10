/** Tournament report: ranking, results.json payload, and summary.md text. */
import type { CandidateParity } from './aggregate';
import type { EnvironmentRecord } from './env';
import type { CandidateTiming, CaseTiming } from './perf-run';

export const EVIDENCE_LABEL =
  'directional Node evidence, serial CPU renderer, local laptop; not the release protocol; browsers via CI/Stage A';

export interface RankedCandidate {
  readonly rank: number;
  readonly id: string;
  readonly policy: string;
  readonly geomeanSpeedup: number;
  readonly ciLo: number;
  readonly ciHi: number;
  readonly verdict: 'faster' | 'slower' | 'indistinguishable';
  readonly worstCase: string;
  readonly worstRatio: number;
  readonly slowerCases: readonly string[];
  readonly confirmedSlowerCases: readonly string[];
}

export interface TournamentFlags {
  readonly command: string;
  readonly candidates: readonly string[];
  readonly cases: readonly string[];
  readonly reps: number;
  readonly warmups: number;
  readonly timingRaster: string;
  readonly parityRaster: string;
  readonly shippingRaster: string;
  readonly shippingCases: readonly string[];
  readonly includeDemo: boolean;
  readonly oracle: boolean;
  readonly perfFailed: boolean;
  readonly bootstrapSeed: number;
  readonly bootstrapResamples: number;
  readonly slowerThreshold: number;
}

export interface TournamentResults {
  readonly schemaVersion: 1;
  readonly label: string;
  readonly environment: EnvironmentRecord;
  readonly flags: TournamentFlags;
  readonly candidates: readonly { readonly id: string; readonly description: string }[];
  readonly parity: readonly CandidateParity[];
  readonly perf: readonly CandidateTiming[];
  readonly ranking: readonly RankedCandidate[];
}

export const rankCandidates = (
  parity: readonly CandidateParity[],
  perf: readonly CandidateTiming[],
): RankedCandidate[] => {
  const ranked: Omit<RankedCandidate, 'rank'>[] = [];
  for (const timing of perf) {
    const gate = parity.find((entry) => entry.id === timing.id);
    const aggregate = timing.aggregate;
    if (aggregate === undefined || gate?.passed !== true) continue;
    ranked.push({
      id: timing.id,
      policy: gate.policy,
      geomeanSpeedup: aggregate.geomeanSpeedup,
      ciLo: aggregate.ci.lo,
      ciHi: aggregate.ci.hi,
      verdict:
        aggregate.ci.lo > 1 ? 'faster' : aggregate.ci.hi < 1 ? 'slower' : 'indistinguishable',
      worstCase: aggregate.worstCase?.caseId ?? 'n/a',
      worstRatio: aggregate.worstCase?.ratio ?? Number.NaN,
      slowerCases: aggregate.slowerCases,
      confirmedSlowerCases: aggregate.confirmedSlowerCases,
    });
  }
  ranked.sort((a, b) => b.geomeanSpeedup - a.geomeanSpeedup);
  return ranked.map((entry, index) => ({ rank: index + 1, ...entry }));
};

const fixed = (value: number | undefined, digits = 3): string =>
  value === undefined || !Number.isFinite(value) ? 'n/a' : value.toFixed(digits);

const sci = (value: number | undefined): string =>
  value === undefined || !Number.isFinite(value) ? String(value) : value.toExponential(2);

const row = (cells: readonly (string | number)[]): string => `| ${cells.join(' | ')} |`;

const table = (
  header: readonly string[],
  rows: readonly (readonly (string | number)[])[],
): string[] => [row(header), row(header.map(() => '---')), ...rows.map(row), ''];

const rankingSection = (results: TournamentResults): string[] => {
  const lines = ['## Ranking (parity-passed candidates, by geometric-mean speedup)', ''];
  if (results.ranking.length === 0) return [...lines, 'No candidate passed parity and timing.', ''];
  return [
    ...lines,
    ...table(
      [
        'Rank',
        'Candidate',
        'Parity policy',
        'Geomean speedup',
        '95% CI',
        'Worst case',
        'Cases >3% slower',
        'Verdict',
      ],
      results.ranking.map((r) => [
        r.rank,
        r.id,
        r.policy,
        `${fixed(r.geomeanSpeedup)}x`,
        `[${fixed(r.ciLo)}, ${fixed(r.ciHi)}]`,
        `${r.worstCase} (${fixed(r.worstRatio)}x)`,
        r.slowerCases.length === 0
          ? 'none'
          : `${r.slowerCases.length} (${r.confirmedSlowerCases.length} CI-confirmed)`,
        r.verdict === 'indistinguishable' ? 'CI contains 1.0' : r.verdict,
      ]),
    ),
  ];
};

const parityTable = (results: TournamentResults): string[] => [
  '## Parity gate',
  '',
  ...table(
    [
      'Candidate',
      'Parity policy',
      'Result',
      'Violations',
      'Changed pixels',
      'Conversions',
      'Oracle',
    ],
    results.parity.map((p) => [
      p.id,
      p.policy,
      p.passed ? 'PASS' : 'FAIL',
      p.violationCount,
      `${p.changedPixels} / ${p.pixelsCompared}`,
      p.conversionCount,
      p.oracle === undefined ? 'not run' : p.oracle.ok ? 'pass' : 'FAIL',
    ]),
  ),
];

const mismatchLines = (p: CandidateParity): string[] =>
  p.firstMismatches.length === 0
    ? []
    : [
        `First ${p.firstMismatches.length} mismatches:`,
        '',
        ...table(
          ['Case', 'Raster', 'Pixel (x,y)', 'Field', 'Baseline', 'Candidate'],
          p.firstMismatches.map((m) => [
            m.caseId,
            m.raster,
            `${m.pixel} (${m.x},${m.y})`,
            m.field,
            String(m.baseline),
            String(m.candidate),
          ]),
        ),
      ];

const toleranceLines = (p: CandidateParity): string[] => [
  ...p.toleranceProblems.map((problem) => `- REJECTED tolerance: ${problem}`),
  ...(p.declaredTolerances.length === 0
    ? ['Declared tolerances: none (all fields bit-identical).', '']
    : [
        `Declared tolerances${p.toleranceNote === undefined ? '' : ` (${p.toleranceNote})`}:`,
        '',
        ...table(
          ['Field', 'Declared', 'Max observed abs', 'Max observed rel', 'Pixels within tolerance'],
          p.declaredTolerances.map((t) => [
            t.field,
            t.declared,
            sci(t.maxObservedAbs),
            sci(t.maxObservedRel),
            t.pixelsWithinTolerance,
          ]),
        ),
      ]),
];

const conversionLines = (p: CandidateParity): string[] => {
  if (p.policy !== 'semantic-revision') return [];
  if (p.conversionCount === 0) return ['Unresolved-to-accepted conversions: 0.', ''];
  return [
    `Unresolved-to-accepted conversions: ${p.conversionCount} (first ${p.firstConversions.length} listed):`,
    '',
    ...table(
      ['Case', 'Pixel (x,y)', 'c', 'Period', 'lambda (mag, angle)', 'Certificate'],
      p.firstConversions.map((c) => [
        c.caseId,
        `${c.pixel} (${c.x},${c.y})`,
        `${c.c.re} ${c.c.im < 0 ? '-' : '+'} ${Math.abs(c.c.im)}i`,
        c.period,
        `${c.multiplierMagnitude.toPrecision(6)}, ${c.multiplierAngle.toPrecision(6)}`,
        `\`${c.certificate === undefined ? 'MISSING' : JSON.stringify(c.certificate).slice(0, 200)}\``,
      ]),
    ),
  ];
};

const diagnosticLines = (p: CandidateParity): string[] => {
  const entries = Object.entries(p.iterationDeltas).filter(([, d]) => d.differing > 0);
  if (entries.length === 0) return [];
  return [
    'Iteration-count differences (candidate minus baseline, by baseline status; diagnostic, never gating):',
    '',
    ...table(
      ['Baseline status', 'Pixels', 'Differing', 'Min', 'Median', 'P90', 'Max', 'Mean'],
      entries.map(([klass, d]) => [
        klass,
        d.compared,
        d.differing,
        d.min,
        d.p50,
        d.p90,
        d.max,
        fixed(d.mean, 2),
      ]),
    ),
    Object.keys(p.evidenceChanges).length === 0
      ? ''
      : `Evidence-code changes: ${JSON.stringify(p.evidenceChanges)}`,
    '',
  ];
};

const oracleLines = (p: CandidateParity): string[] =>
  p.oracle === undefined
    ? []
    : [
        `Oracle fixtures (fixtures/orbits.v1.json, ${p.oracle.ok ? 'pass' : 'FAIL'}):`,
        '',
        ...table(
          ['Fixture', 'Expected', 'Baseline', 'Candidate', 'OK'],
          p.oracle.fixtures.map((f) => [
            f.id,
            f.expected,
            f.baseline,
            f.candidate,
            f.ok ? 'yes' : 'NO',
          ]),
        ),
      ];

const parityDetails = (p: CandidateParity): string[] => [
  `### ${p.id}: ${p.passed ? 'PASS' : 'FAIL'} (${p.policy})`,
  '',
  p.description,
  '',
  ...(p.failureReasons.length === 0 ? [] : [`Failure reasons: ${p.failureReasons.join('; ')}`, '']),
  ...p.cases
    .filter((c) => c.error !== undefined)
    .map((c) => `- ERROR ${c.caseId} @ ${c.raster}: ${c.error}`),
  ...toleranceLines(p),
  ...(p.violationCount === 0
    ? []
    : [
        `Violations by field: ${Object.entries(p.violationsByField)
          .map(([field, count]) => `\`${field}\` ${count}`)
          .join(', ')}`,
        '',
      ]),
  ...mismatchLines(p),
  ...conversionLines(p),
  ...diagnosticLines(p),
  ...oracleLines(p),
];

const counterRows = (c: CaseTiming): string[][] =>
  Object.keys({ ...c.baselineCounters, ...c.candidateCounters })
    .sort()
    .map((key) => {
      const b = c.baselineCounters[key];
      const k = c.candidateCounters[key];
      return [
        c.caseId,
        key,
        b === undefined ? '-' : String(b),
        k === undefined ? '-' : String(k),
        b !== undefined && k !== undefined && b > 0 ? fixed(k / b) : '-',
      ];
    });

const perfDetails = (t: CandidateTiming, parity: readonly CandidateParity[]): string[] => {
  const eligible = parity.find((p) => p.id === t.id)?.passed === true;
  if (t.error !== undefined) return [`### ${t.id}`, '', `ERROR during timing: ${t.error}`, ''];
  const rows = t.cases.map((c) => [
    c.caseId,
    fixed(c.medianBaselineMs, 1),
    fixed(c.medianCandidateMs, 1),
    fixed(c.summary.medianRatio),
    `[${fixed(c.summary.ci.lo)}, ${fixed(c.summary.ci.hi)}]`,
    fixed(c.summary.p10),
    fixed(c.summary.p90),
    t.aggregate?.slowerCases.includes(c.caseId) === true ? 'SLOWER >3%' : '',
  ]);
  const counters = t.cases.flatMap(counterRows).filter((r) => r[2] !== r[3]);
  return [
    `### ${t.id}${eligible ? '' : ' (parity FAILED: diagnostic timing only, not eligible for ranking)'}`,
    '',
    ...table(
      ['Case', 'Baseline ms', 'Candidate ms', 'Median ratio', '95% CI', 'P10', 'P90', 'Flag'],
      rows,
    ),
    ...(counters.length === 0
      ? []
      : [
          'Counters that differ from baseline (candidate / baseline):',
          '',
          ...table(['Case', 'Counter', 'Baseline', 'Candidate', 'Ratio'], counters),
        ]),
  ];
};

export const renderSummary = (results: TournamentResults): string => {
  const env = results.environment;
  const f = results.flags;
  return [
    '# Optimization tournament summary',
    '',
    `> ${EVIDENCE_LABEL}.`,
    '',
    `- Commit \`${env.git.shortSha}\` on \`${env.git.branch}\`${env.git.dirty ? ` (DIRTY tree, ${env.git.dirtyFiles.length} changed paths; diff sha256 \`${env.git.trackedDiffSha256.slice(0, 12)}\`)` : ''}`,
    `- Node ${env.node}, ${env.cpuModel} (${env.logicalCpus} logical CPUs), load average at start ${env.loadAverageAtStart.map((v) => v.toFixed(2)).join(' / ')}, gc exposed: ${env.gcExposed}`,
    `- Command: \`${f.command}\``,
    `- Timing raster ${f.timingRaster}, ${f.reps} paired repetitions (ABBA/BAAB), ${f.warmups} warmup render(s) per arm; bootstrap seed ${f.bootstrapSeed}, ${f.bootstrapResamples} resamples; slower-than-baseline threshold ${f.slowerThreshold * 100}%`,
    `- Parity raster ${f.parityRaster}; shipping raster ${f.shippingRaster} for ${f.shippingCases.join(', ') || 'no cases'}; oracle fixtures ${f.oracle ? 'on' : 'off'}`,
    '',
    ...(results.flags.includeDemo
      ? ['**Demo (self-test) candidates were included in this run.**', '']
      : []),
    ...rankingSection(results),
    ...parityTable(results),
    ...results.parity.flatMap(parityDetails),
    '## Performance detail',
    '',
    ...results.perf.flatMap((t) => perfDetails(t, results.parity)),
    '## Candidates and flags',
    '',
    ...table(
      ['Candidate', 'Description'],
      results.candidates.map((c) => [c.id, c.description]),
    ),
  ].join('\n');
};
