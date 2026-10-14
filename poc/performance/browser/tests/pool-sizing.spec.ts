import { expect, test } from '@playwright/test';
import type { PoolSizingResult, PoolSizingSample } from '../fixtures/microbench-api';
import { captureEnvironment, writeResults } from './helpers/results';
import { summarize } from './helpers/stats';

/**
 * Workstream K gate (plan §5): hard-view wall-clock >=20% better on a
 * >=8-core target class in both browsers; easy views <3% slower; memory
 * within budget. This measurement decides the first clause on this machine
 * (directional, headless Chromium).
 */
test('pool sizing curve on a hard corpus view (workstream K)', async ({ page }) => {
  await page.goto('/poc-bench/index.html');

  // Full protocol by default; overridable for quick probes (recorded in the
  // results file either way). Balanced (512 iterations / period 32) is the
  // default profile: Detailed at 1024^2 costs minutes per rep on a single
  // worker on the reference machine, which would blow the harness budget.
  const sizes = (process.env['MI_POC_SIZES'] ?? '1,2,4,6,8')
    .split(',')
    .map((value) => Number.parseInt(value, 10));
  const measuredReps = Number(process.env['MI_POC_REPS'] ?? 5);
  const warmupReps = Number(process.env['MI_POC_WARMUP'] ?? 1);
  const profileId = (process.env['MI_POC_PROFILE'] ?? 'balanced') as 'balanced' | 'detailed';

  const result = (await page.evaluate(
    (params) =>
      window.__miPocBench.run('pool-sizing', {
        caseId: 'mi-hard-supplied-126x',
        profileId: params.profileId,
        edge: 1024,
        sizes: params.sizes,
        warmupReps: params.warmupReps,
        measuredReps: params.measuredReps,
      }),
    { sizes, measuredReps, warmupReps, profileId },
  )) as PoolSizingResult;

  const measured = result.samples.filter((sample: PoolSizingSample) => sample.phase === 'measured');
  const actualSizes = [...new Set(result.samples.map((sample) => sample.workerCount))].sort(
    (a, b) => a - b,
  );
  expect(actualSizes).toEqual(sizes);
  expect(measured.length).toBe(measuredReps * actualSizes.length);
  expect(result.hardwareConcurrency).toBeGreaterThan(0);
  expect(measured.every((sample) => sample.wallMs > 0)).toBe(true);

  const environment = await captureEnvironment(page, {
    workerCount: Math.max(...sizes),
    backend: 'poc tile-pool driver over src/worker/tile.worker.ts',
  });

  const perSize = sizes.map((workerCount) => {
    const walls = measured
      .filter((sample) => sample.workerCount === workerCount)
      .map((sample) => sample.wallMs);
    return { workerCount, wallMs: summarize(walls) };
  });
  const wallOf = (workerCount: number): number => {
    const entry = perSize.find((candidate) => candidate.workerCount === workerCount);
    if (entry === undefined) throw new Error(`no samples for pool size ${workerCount}`);
    return entry.wallMs.median;
  };
  // Baselines for ratio reporting: pool 4 (the production cap) and pool 1
  // when present; otherwise fall back to the largest/smallest measured size.
  const baselineLarge = sizes.includes(4) ? 4 : Math.max(...sizes);
  const baselineSmall = sizes.includes(1) ? 1 : Math.min(...sizes);

  const written = await writeResults('pool-sizing', {
    environment,
    samples: result.samples,
    summary: {
      caseId: result.caseId,
      profileId: result.profileId,
      edge: result.edge,
      quality: result.quality,
      viewport: result.viewport,
      hardwareConcurrency: result.hardwareConcurrency,
      spawnMsByWorkerCount: result.spawnMsByWorkerCount,
      wallMsPerWorkerCount: perSize,
      medianRatioVersusProductionCap: perSize.map((entry) => ({
        workerCount: entry.workerCount,
        ratio: entry.wallMs.median / wallOf(baselineLarge),
      })),
      medianRatioVersusSingleWorker: perSize.map((entry) => ({
        workerCount: entry.workerCount,
        ratio:
          entry.workerCount === baselineSmall ? 1 : entry.wallMs.median / wallOf(baselineSmall),
      })),
      workstreamKGate: {
        bar: 'hard-view wall-clock >=20% better on a >=8-core target class (both browsers)',
        hardwareConcurrency: result.hardwareConcurrency,
        note: 'Compare pool 6/8 medians against the production cap of 4 workers; sizes measured in fixed ascending order with warm pools.',
      },
    },
    notes: [
      'Driver reuses src/worker/tile.worker.ts, splitRowBands, and the tile message protocol with a parameterized count; production clampTileWorkers (cap 4) is deliberately bypassed and src/ is unmodified.',
      'One band per worker per frame (production static banding shape); workers persist across warmup + measured reps; fresh pool per size.',
      'Worker-object construction time is recorded separately (spawnMsByWorkerCount); module fetch/compile is absorbed by the warmup rep.',
      'Median wall-clock of 5 measured reps; single-machine single-browser directional evidence.',
      'Balanced profile is the default because Detailed at 1024^2 costs minutes per rep on a single worker on the reference machine; the corpus record for this case nominally carries Detailed.',
    ],
  });
  await test.info().attach('pool-sizing-results', { path: written });

  expect(wallOf(1)).toBeGreaterThan(0);
});
