import { expect, test } from '@playwright/test';
import type { ConjugateMirrorResult } from '../fixtures/microbench-api';
import { getCorpusCase } from '../fixtures/corpus-views';
import { captureEnvironment, writeResults } from './helpers/results';
import { summarize } from './helpers/stats';

/**
 * Workstream M gate (plan §5): >=1.6x classifier on real-axis-symmetric easy
 * cases in both browsers with semantic parity under the tolerance policy.
 *
 * Two derived symmetric views are measured, both built from exact corpus
 * decimal strings with the imaginary center part forced to exactly 0 so the
 * viewport transform is exactly conjugate-symmetric:
 * - mi-easy-default-full: the corpus default viewport, already real-axis
 *   symmetric (center.im = 0 in the manifest) — the gate's easy-case class.
 * - mi-hard-supplied-126x: the hard corpus view's center re and spanY — a
 *   stress case far above the gate's difficulty.
 *
 * The ratio measured here (full classification vs canonical-half
 * classification + mirror fill) is the dispatch-level saving workstream M
 * would deliver; semantic parity of the mirrored rows is asserted loudly.
 */
test('conjugate-mirroring savings and semantic parity (workstream M)', async ({ page }) => {
  await page.goto('/poc-bench/index.html');

  const easy = getCorpusCase('mi-easy-default-full');
  // Guard: the easy case must still be real-axis-symmetric in the corpus.
  expect(easy.viewport.center.im, 'easy corpus case must have center.im = 0').toBe(0);
  const hard = getCorpusCase('mi-hard-supplied-126x');

  const cases: { viewId: string; source: string; centerRe: string; spanY: string }[] = [
    {
      viewId: easy.id,
      source: 'corpus case as-is (center.im = 0 in the manifest)',
      centerRe: easy.raw.centerRe,
      spanY: easy.raw.spanY,
    },
    {
      viewId: `${hard.id}-symmetric`,
      source: 'corpus case with center.im forced from -1.034028 to exactly 0',
      centerRe: hard.raw.centerRe,
      spanY: hard.raw.spanY,
    },
  ];

  const results: (ConjugateMirrorResult & { source: string })[] = [];
  for (const params of cases) {
    const result = (await page.evaluate((request) => {
      return window.__miPocBench.run('conjugate-mirror', {
        viewId: request.viewId,
        centerRe: request.centerRe,
        spanY: request.spanY,
        edge: 512,
        profileId: 'balanced',
        warmupReps: 1,
        reps: 5,
      });
    }, params)) as ConjugateMirrorResult;
    results.push({ ...result, source: params.source });
  }

  const environment = await captureEnvironment(page, {
    workerCount: null,
    backend: 'microbench-page (src/domain OrbitClassifier, main thread)',
  });

  const perCase = results.map((result) => {
    const ratio =
      summarize(result.samples.map((sample) => sample.fullMs)).median /
      summarize(result.samples.map((sample) => sample.combinedMs)).median;
    const parityHolds = result.parity.mismatchCount === 0;
    return {
      viewId: result.viewId,
      source: result.source,
      centerRe: result.centerRe,
      spanY: result.spanY,
      edge: result.edge,
      profileId: result.profileId,
      warmupReps: result.warmupReps,
      classificationFullMs: summarize(result.samples.map((sample) => sample.fullMs)),
      classificationCanonicalHalfMs: summarize(result.samples.map((sample) => sample.halfMs)),
      mirrorFillMs: summarize(result.samples.map((sample) => sample.mirrorFillMs)),
      halfPlusMirrorMs: summarize(result.samples.map((sample) => sample.combinedMs)),
      wallTimeRatioFullOverHalfPlusMirror: ratio,
      semanticParity: {
        pixelsCompared: result.parity.pixelsCompared,
        mismatchCount: result.parity.mismatchCount,
        mismatchesByField: result.parity.mismatchesByField,
        examples: result.parity.examples,
        verdict: parityHolds
          ? 'PASS: mirrored raster is semantically identical (status, period, |lambda|, kappa, iterations, evidence; arg-lambda negation cancels in the assembled comparison)'
          : 'FINDING: parity violated',
      },
      workstreamMGate: {
        bar: '>=1.6x classifier on real-axis-symmetric easy cases (both browsers) with semantic parity',
        measuredRatio: ratio,
        verdict:
          ratio >= 1.6
            ? 'PASS: at or above the 1.6x bar on this view class'
            : 'FINDING: below the 1.6x bar on this view class',
        note: 'Measured at Balanced on 512^2; only the easy corpus case is real-axis symmetric in the frozen corpus, the hard variant is a stress case above the gate difficulty. Chromium only in this harness (see README limitations).',
      },
    };
  });

  const written = await writeResults('conjugate-mirror', {
    environment,
    samples: results.flatMap((result) =>
      result.samples.map((sample) => ({ viewId: result.viewId, ...sample })),
    ),
    summary: { cases: perCase },
    notes: [
      'Both arms use the app real classifier (src/domain/orbit.ts OrbitClassifier) per pixel via createViewportTransform, on the main thread with no yields; wall time is classification plus mirror fill.',
      'Timed loops write only numeric semantic fields (status, period, |lambda|, arg lambda, kappa, iterations); the per-pixel evidence string materialization the parity comparison needs is confined to a separate untimed pass, so timed classification matches what the production frame writes.',
      'Mirror fill copies six numeric fields and negates arg lambda; the production frame carries four channels, so the measured fill is a conservative overestimate of the production mirror cost.',
      'Mirrored coordinates are built by exact negation of the imaginary part: center.im = 0 makes the viewport transform exactly conjugate-symmetric, so pixel (x, h-1-y) is exactly conj(pixel (x, y)) in binary64.',
      'Canonical half = top half rows (im > 0). Even edge (512) avoids a self-mirror row; one untimed warmup cycle of both arms precedes the 5 measured reps, whose order alternates per rep.',
      'Parity is deterministic and computed once from dedicated evidence-capturing rasters. A mismatch above 1e-12 on any of status/period/|lambda|/kappa/iterations/evidence, or any arg-lambda negation residual, is recorded as a finding and fails the spec.',
    ],
  });
  await test.info().attach('conjugate-mirror-results', { path: written });

  for (const result of results) {
    const entry = perCase.find((candidate) => candidate.viewId === result.viewId);
    if (entry === undefined) throw new Error(`missing summary entry for ${result.viewId}`);
    expect(result.samples.length).toBe(5);
    expect(result.parity.pixelsCompared).toBe((512 * 512) / 2);
    expect(
      result.parity.mismatchCount,
      `FINDING: conjugate-mirror semantic parity violated on ${result.viewId}: ${JSON.stringify(
        result.parity.mismatchesByField,
      )}; examples: ${JSON.stringify(result.parity.examples.slice(0, 5))}`,
    ).toBe(0);
    // Sanity floor, not the gate bar: mirroring must not be slower than full
    // classification. The gate verdict itself is recorded in the summary.
    expect(
      entry.wallTimeRatioFullOverHalfPlusMirror,
      `mirror+simplify should not cost more than it saves on ${result.viewId}`,
    ).toBeGreaterThan(1.2);
  }
});
