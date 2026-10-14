import { expect, test } from '@playwright/test';
import type { BandOrderResult, YieldAbResult, ZeroCopyResult } from '../fixtures/microbench-api';
import { captureEnvironment, writeResults } from './helpers/results';
import { median, summarize } from './helpers/stats';

const isNumber = (value: number): boolean => Number.isFinite(value);

test('yield mechanism A/B: nested setTimeout vs MessageChannel (plan §12)', async ({ page }) => {
  await page.goto('/poc-bench/index.html');

  const result = (await page.evaluate(() =>
    window.__miPocBench.run('yield-ab', { hops: 200, cancelReps: 21 }),
  )) as YieldAbResult;

  const setTimeoutChain = result.chains.find((chain) => chain.mechanism === 'settimeout');
  const channelChain = result.chains.find((chain) => chain.mechanism === 'messagechannel');
  if (setTimeoutChain === undefined || channelChain === undefined) {
    throw new Error('yield A/B result is missing a mechanism chain');
  }

  // The HTML timer-nesting clamp: hops 0..4 run at timer-policy latency,
  // hops from ~5 on should show the observed clamp (≈4 ms).
  const steadyHops = (perHopMs: readonly number[]): number[] => perHopMs.slice(5).filter(isNumber);
  const clampMedian = median(steadyHops(setTimeoutChain.perHopMs));
  const channelMedian = median(steadyHops(channelChain.perHopMs));
  expect(channelMedian).toBeLessThan(clampMedian);

  const cancelMedian = (mechanism: string): number =>
    median(
      result.cancelSamples
        .filter((sample) => sample.mechanism === mechanism)
        .map((sample) => sample.quiescenceMs),
    );

  const environment = await captureEnvironment(page, {
    workerCount: null,
    backend: 'microbench-page (yield mechanism A/B)',
  });
  const written = await writeResults('yield-ab', {
    environment,
    samples: [
      ...setTimeoutChain.perHopMs.map((ms, hop) => ({
        kind: 'hop',
        mechanism: 'settimeout',
        hop,
        ms,
      })),
      ...channelChain.perHopMs.map((ms, hop) => ({
        kind: 'hop',
        mechanism: 'messagechannel',
        hop,
        ms,
      })),
      ...result.cancelSamples.map((sample) => ({ kind: 'cancel', ...sample })),
    ],
    summary: {
      hops: result.hops,
      cancelReps: result.cancelReps,
      setTimeout: {
        firstFiveHopsMedianMs: median(setTimeoutChain.perHopMs.slice(0, 5)),
        steadyStateMedianMs: clampMedian,
        steadyStateMaxMs: Math.max(...steadyHops(setTimeoutChain.perHopMs)),
        cancelToQuiescenceMedianMs: cancelMedian('settimeout'),
      },
      messageChannel: {
        steadyStateMedianMs: channelMedian,
        steadyStateMaxMs: Math.max(...steadyHops(channelChain.perHopMs)),
        cancelToQuiescenceMedianMs: cancelMedian('messagechannel'),
      },
      decision:
        'If MessageChannel steady-state and cancel-to-quiescence are ~4 ms+ better per yield, replacing nested setTimeout(0) yields removes timer-policy cost from classifyRows (workstream E detail).',
    },
    notes: [
      'Per-hop chain: each hop schedules the next from inside the previous callback, exactly like the awaited yields in src/render/classify-rows.ts, so timer nesting grows and the HTML 4 ms clamp (after 5 nested levels) becomes visible in the raw per-hop samples.',
      'Cancel-to-quiescence: synthetic 64-row workload, ~1 ms spin per row, production yield mask for 1024 iterations (yieldMaskForQuality), cancel at 30 ms; the metric is cancel() to loop exit.',
      'MessageChannel hops 0..4 are excluded from the steady-state stats so the comparison is clamp-affected timer hops vs task-source hops.',
    ],
  });
  await test.info().attach('yield-ab-results', { path: written });
});

test('zero-copy transfer vs structured-clone copy of a semantic frame (plan §12)', async ({
  page,
}) => {
  await page.goto('/poc-bench/index.html');

  const result = (await page.evaluate(() =>
    window.__miPocBench.run('zero-copy', { repsPerMode: 21 }),
  )) as ZeroCopyResult;

  expect(result.samples.length).toBe(42);
  expect(result.samples.every((sample) => sample.intact)).toBe(true);

  const statsFor = (mode: 'copy' | 'transfer'): Record<string, number> => ({
    postMs: summarize(
      result.samples.filter((sample) => sample.mode === mode).map((sample) => sample.postMs),
    ).median,
    roundtripMs: summarize(
      result.samples.filter((sample) => sample.mode === mode).map((sample) => sample.roundtripMs),
    ).median,
  });

  const environment = await captureEnvironment(page, {
    workerCount: 1,
    backend: 'microbench-page (frame echo worker)',
  });
  const written = await writeResults('zero-copy-transfer', {
    environment,
    samples: result.samples,
    summary: {
      width: result.width,
      height: result.height,
      bytesPerRoundtrip: result.bytesPerRoundtrip,
      repsPerMode: result.repsPerMode,
      copy: statsFor('copy'),
      transfer: statsFor('transfer'),
      decision:
        'If transfer roundtrips beat copy roundtrips by a clear margin at ~12.75 MiB per 1024x640 frame (~21 MiB at 1024x1024), pre-sliced transferable band views eliminate the per-band merge memcpy cost the plan prices.',
    },
    notes: [
      'Channels are the real semantic-frame channels (u8 status, u32 period, two f64 channels at 1024x640) filled with a deterministic pattern; integrity is verified after every roundtrip.',
      'Roundtrip = main post -> worker echoes the channels back in the same mode, so both arms pay two crossings; order alternates copy/transfer per rep.',
      'In Chrome the posting thread pays the structured clone synchronously, so postMs captures the copy cost directly; transfer postMs should be near zero.',
    ],
  });
  await test.info().attach('zero-copy-results', { path: written });
});

test('band order: top-to-bottom vs center-out time-to-50%-rows (perceived-latency simulation)', async ({
  page,
}) => {
  await page.goto('/poc-bench/index.html');

  const result = (await page.evaluate(() =>
    window.__miPocBench.run('band-order', {
      rows: 1024,
      bandCount: 16,
      workerCount: 4,
      reps: 11,
    }),
  )) as BandOrderResult;

  expect(result.samples.length).toBe(44);
  expect(result.samples.every((sample) => isNumber(sample.t50RowsMs))).toBe(true);

  const medianFor = (
    profile: string,
    strategy: string,
    field: 'ttfbMs' | 't50RowsMs' | 'totalMs',
  ): number =>
    median(
      result.samples
        .filter((sample) => sample.profile === profile && sample.strategy === strategy)
        .map((sample) => sample[field]),
    );

  const environment = await captureEnvironment(page, {
    workerCount: result.workerCount,
    backend: 'microbench-page (spin-worker band pipeline)',
  });
  const written = await writeResults('band-order', {
    environment,
    samples: result.samples,
    summary: {
      rows: result.rows,
      bandCount: result.bandCount,
      workerCount: result.workerCount,
      reps: result.reps,
      uniform: {
        topToBottom: {
          ttfbMs: medianFor('uniform', 'top-to-bottom', 'ttfbMs'),
          t50RowsMs: medianFor('uniform', 'top-to-bottom', 't50RowsMs'),
          totalMs: medianFor('uniform', 'top-to-bottom', 'totalMs'),
        },
        centerOut: {
          ttfbMs: medianFor('uniform', 'center-out', 'ttfbMs'),
          t50RowsMs: medianFor('uniform', 'center-out', 't50RowsMs'),
          totalMs: medianFor('uniform', 'center-out', 'totalMs'),
        },
      },
      edgesHeavy: {
        topToBottom: {
          ttfbMs: medianFor('edges-heavy', 'top-to-bottom', 'ttfbMs'),
          t50RowsMs: medianFor('edges-heavy', 'top-to-bottom', 't50RowsMs'),
          totalMs: medianFor('edges-heavy', 'top-to-bottom', 'totalMs'),
        },
        centerOut: {
          ttfbMs: medianFor('edges-heavy', 'center-out', 'ttfbMs'),
          t50RowsMs: medianFor('edges-heavy', 'center-out', 't50RowsMs'),
          totalMs: medianFor('edges-heavy', 'center-out', 'totalMs'),
        },
      },
      decision:
        'Perceived-latency gate (plan §12): center-out should present the first band and 50% of rows earlier under skewed costs while costing nothing in throughput (totalMs within noise). With uniform costs the order must NOT matter; that is the control.',
    },
    notes: [
      'HONEST SIMULATION: band jobs are synthetic spins in real workers (deterministic 24 ms uniform; 8-48 ms center-cheap profile); the classifier is not involved and no real view cost is claimed.',
      '16 bands x 64 rows over 4 workers draining a queue in dispatch order; strategy order alternates per rep.',
      'ttfbMs = time to first completed band (first paint proxy); t50RowsMs = time until >=50% of rows are complete.',
    ],
  });
  await test.info().attach('band-order-results', { path: written });
});
