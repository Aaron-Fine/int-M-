# Orbit and raster optimizations — October 4, 2026

Implemented on `perf/orbit-raster-optimizations` from main commit
`296d5be52fc944e38a69108f333b5472edc2444e`.

This branch's default classifier is the phase 2 verifier scan (`classifyInto`),
not that mainline kernel. The digests and timings below record the kernel that
merged to main. They are not an acceptance test for this branch.

## Enabled changes

- A scalar `OrbitClassifier.classifyRaster(re, im)` returns borrowed reusable
  storage. Raster classification builds no per-sample result/evidence objects
  and computes neither the discarded stability logarithm nor an eager angle.
  `classify()` and `classifyOrbit()` retain rich inspector results.
- Numerical cycle confirmation calculates `hypot` only once after forward
  closure and reuses its value. The original `hypot` attraction comparison is
  retained to preserve rounding at the unit-multiplier boundary.
- Escape smoothing uses `log2(0.5 * log2(magnitudeSquared))`, eliminating the
  intermediate square root. This is algebraically equivalent; binary64
  rounding need not be bit-identical.
- History storage advances and scans backward with wrap branches instead of
  modulo. The recurrence loop stays inside the iteration kernel: moving it into
  a helper caused an off-axis performance regression during development.
- Raster real coordinates are prepared once per column and imaginary
  coordinates once per sampled row, using the canonical pixel-center formula.
  Repeated additions are avoided to prevent cumulative deep-zoom drift. Coarse
  sampling retains its clipped block-center mapping.
- Stable views centered exactly at `center.im === 0` classify only the upper
  half, including the middle row for odd heights. Conjugate rows preserve
  status, period, escape smoothing, and multiplier magnitude; only the imaginary
  multiplier direction changes sign. This works for serial frames and arbitrary
  band slices. The worker pool schedules bands over `ceil(height / 2)` and
  mirrors results in the supervisor. Off-axis views and coarse previews retain
  full sampling. Cancellation still checks/yields at the established row cadence.
- Semantic frames use two Float32 multiplier direction channels in place of one
  Float64 angle channel. The raster still uses **21 bytes per pixel**. Multiplier
  hue computes `atan2` during colorization, and stripes consume direction
  directly. Other views need no angle conversion. Inspector values retain
  binary64 precision. Zero multiplier direction is `(1, 0)`.
- The semantic algorithm version advances to 2, and detector selection is part
  of the semantic cache key. Tile transfers carry both direction buffers.

Float32 storage bounds each unit-direction component's rounding error by about
`3e-8`. Unit tests check that bound over a rabbit raster. Hue byte rounding or
stripe sign can change for samples immediately next to a coloring threshold;
classification, period, and magnitude remain binary64. This representation is
intended for coloring, not numerical evidence.

## Checkpoint experiment: implemented, disabled by default

Set `quality.cycleDetection: 'checkpoint'` explicitly to try the alternative
raster detector, or use that option with `OrbitClassifier`/`classifyOrbit`.
The default is `'scan'`. Inspection also honors an explicitly requested mode.

Growing Brent-style checkpoint windows propose recurrence lags. Candidates
still undergo the original history recurrence, forward closure, and finite
attracting-multiplier checks. An ascending history scan checks smaller periods
at each proposed acceptance. Sparse exhaustive checks run at checkpoint
boundaries and at the final iteration budget.

**That is insufficient for equivalence to exhaustive detection.** Delayed
acceptance changes which phase of a slowly converging orbit is tested. The
original scan can first accept a multiple of the eventual period; the delayed
scan can report a smaller period and a different multiplier, or miss a cycle
before the iteration budget expires. Neither tolerance-based detector proves
an exact minimal period. We preserve the established semantics in production
instead of treating a candidate detector as interchangeable evidence.

The differential harness compares 230,400 samples: four viewports × three
iteration budgets (48, 128, 512) × 160 × 120. At budget 512, the rabbit viewport
has 4 status and 330 period-channel differences; the real-boundary viewport has
4 status and 1,304 period-channel differences. The period count also includes
status changes that switch the stored period to/from zero. First differing
coordinates are recorded in the evidence JSON for follow-up investigation.

A future promotion needs an explicit minimal-period policy, differential
acceptance criteria, and independent higher-precision fixtures near slow
convergence. A final-budget fallback alone does not recover earlier acceptance.

## Default performance

Same machine and Node version, median of three stable-render samples. The
measurements invoke the serial production CPU renderer, including its yields,
without browser painting or actual child workers. They establish CPU results,
not a browser or GPU speedup. No explicit warmup is used. The first baseline
case briefly overlapped differential verification; the square cases below and
subsequent baseline cases ran alone.

| Case                          | Raster      | Baseline stable ms | Default stable ms | Speedup |
| ----------------------------- | ----------- | -----------------: | ----------------: | ------: |
| full-set-512                  | 512 × 384   |             255.86 |            138.42 |   1.85× |
| period-three-neighborhood-768 | 768 × 512   |            3414.27 |           2860.88 |   1.19× |
| full-set-square-512           | 512 × 512   |             437.71 |            218.94 |   2.00× |
| full-set-square-1024          | 1024 × 1024 |            1952.46 |            721.58 |   2.71× |
| rabbit-square-768             | 768 × 768   |            6341.14 |           5565.90 |   1.14× |

Raw samples, environment, reference comparisons, and checkpoint discrepancies:
[ORBIT-RASTER-EVIDENCE-2026-10-04.json](ORBIT-RASTER-EVIDENCE-2026-10-04.json).
Experimental timing is included there separately and must not be presented as
production performance.

## Verification and reproduction

- `npm run check`: formatting, lint, all TypeScript configurations, generated
  catalog/fixture validation, 108 unit tests, and production build passed.
- 36,864 original-vs-default samples matched status, period, detection iteration,
  and evidence. Attracting magnitude, angle, and stability matched exactly in
  that comparison. Escape smoothing changed by at most `1.43e-14`.
- Frozen digests generated from the reference commit are retained in
  `fixtures/orbit-raster-regression.v1.json` and tested against the default kernel.
- Tests cover scratch wraps/resets, omitted raster logs/angles, exact canonical
  deep-zoom coordinates, clipped coarse samples, arbitrary band merges,
  Float32 direction error, cancellation, five-buffer tile transfer, and actual
  in-process tile-handler merging at even/odd/one-row heights and off-axis views.
- Local Chromium/Firefox verification could not run: Playwright's Chromium
  download returned an invalid/truncated archive. Browser CI remains a required
  review gate; this is not a local browser pass.

```sh
npm ci
npm run check
npm run evidence:cpu
npm run evidence:optimizations
INTM_EVIDENCE_DETECTION=checkpoint npm run evidence:cpu
npm run test:browser
```

The CPU harness now includes the original rectangular cases plus full-set
512²/1024² and rabbit 768² cases. `evidence:optimizations` reports discrepancies
rather than masking them or claiming an equivalence pass. No transcendental
approximation or GPU shader change is included.
