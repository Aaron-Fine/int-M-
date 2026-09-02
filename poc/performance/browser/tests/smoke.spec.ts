import { expect, test } from '@playwright/test';
import type { EnvironmentSample } from '../fixtures/microbench-api';
import { captureEnvironment, writeResults } from './helpers/results';
import { median } from './helpers/stats';

test.describe('PoC browser harness smoke', () => {
  test('production bundle boots to a stable frame', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/');
    await expect(page.locator('#explorer')).toHaveAttribute('data-render-stage', 'stable', {
      timeout: 30_000,
    });
  });

  test('microbench page registers runners and records environment samples', async ({ page }) => {
    await page.goto('/poc-bench/index.html');
    await expect(page.locator('#status')).toContainText('Microbench runners ready');

    const runnerNames = await page.evaluate(() => window.__miPocBench.runnerNames);
    expect(runnerNames).toContain('environment');

    // Three raw samples of the worker sanity probe; one aggregate summary.
    const samples: EnvironmentSample[] = [];
    for (let rep = 0; rep < 3; rep += 1) {
      const sample = (await page.evaluate(() =>
        window.__miPocBench.run('environment'),
      )) as EnvironmentSample;
      expect(sample.echoWorkerRoundtripMs).toBeGreaterThan(0);
      expect(sample.hardwareConcurrency).toBeGreaterThan(0);
      samples.push(sample);
    }

    const environment = await captureEnvironment(page, {
      workerCount: null,
      backend: 'microbench-page',
    });
    const written = await writeResults('smoke', {
      environment,
      samples,
      summary: {
        runnerNames,
        samplesRecorded: samples.length,
        medianEchoWorkerRoundtripMs: median(samples.map((sample) => sample.echoWorkerRoundtripMs)),
      },
      notes: [
        'Smoke milestone (M1): proves the production bundle boots and the microbench page + worker mechanics load.',
        'Echo roundtrip includes one cold worker spawn; it is a sanity probe, not a benchmark sample.',
      ],
    });
    await test.info().attach('smoke-results', { path: written });
  });
});
