# Stage A browser evidence — 2026-09-02 @ 6f49f19

Paired legacy-scan vs checkpoint classifier evidence from the production bundle (`vite build` + `vite preview`), driven through the real application UI by `tools/benchmark/run-stage-a.mjs`. Medians below are **warm** samples (8 pairs per case; cold rep 0 is stored raw in raw-observations.json and excluded). Wall metric: stable-frame `requestToPresentMs` (plan §8).

**Label (chromium):** automation-bundled headless chromium via Playwright — directional only, not release evidence per plan §9 (branded stable browsers, headed, declared target hardware).

## Headline chromium (paired warm medians, ms)

| Case | Designation | legacy-scan median (MAD) | checkpoint median (MAD) | Δ (ckpt−legacy) | Regression flag max(5%, 20 ms) |
| --- | --- | --- | --- | --- | --- |
| mi-easy-default-full | screening | 396.8 ms (8.7 ms) | 263.4 ms (6.4 ms) | -133.4 ms | no |
| mi-easy-exterior-heavy | screening | 187.2 ms (4.1 ms) | 188.4 ms (3.8 ms) | 1.3 ms | no |
| mi-easy-main-cardioid | screening | 266.2 ms (8.0 ms) | 259.9 ms (8.9 ms) | -6.3 ms | no |
| mi-easy-period2-bulb | screening | 397.8 ms (29.3 ms) | 403.7 ms (34.5 ms) | 5.9 ms | no |
| mi-hard-rabbit-boundary | release-gate | 3943.5 ms (541.2 ms) | 598.0 ms (134.6 ms) | -3345.4 ms | no |
| mi-hard-supplied-126x | release-gate | 8509.8 ms (930.5 ms) | 766.2 ms (26.7 ms) | -7743.7 ms | no |
| mi-hard-supplied-609x | release-gate | 2940.8 ms (167.2 ms) | 694.1 ms (64.9 ms) | -2246.7 ms | no |
| mi-hard-supplied-13x | release-gate | 6764.8 ms (992.0 ms) | 830.2 ms (134.8 ms) | -5934.6 ms | no |
| mi-fallback-unknown-high-period | release-gate | 9390.5 ms (699.9 ms) | 1245.9 ms (130.6 ms) | -8144.6 ms | no |
| mi-fallback-weak-attraction | release-gate | 21149.0 ms (1404.0 ms) | 1253.2 ms (278.6 ms) | -19895.8 ms | no |
| mi-fallback-ambiguous-boundary | release-gate | 1281.3 ms (55.5 ms) | 350.3 ms (13.1 ms) | -931.0 ms | no |
| mi-fallback-budget-exhaustion | release-gate | 13646.7 ms (635.5 ms) | 1067.4 ms (251.5 ms) | -12579.3 ms | no |
| mi-scale-6mx-basilica-rim | release-gate | 9206.7 ms (621.5 ms) | 725.3 ms (69.6 ms) | -8481.4 ms | no |

**Label (firefox):** automation-bundled headless Firefox via Playwright — directional only, not release evidence per plan §9 (branded stable browsers, headed, declared target hardware).

## Headline firefox (paired warm medians, ms)

| Case | Designation | legacy-scan median (MAD) | checkpoint median (MAD) | Δ (ckpt−legacy) | Regression flag max(5%, 20 ms) |
| --- | --- | --- | --- | --- | --- |
| mi-easy-default-full | screening | 634.5 ms (18.5 ms) | 283.5 ms (15.5 ms) | -351.0 ms | no |
| mi-easy-exterior-heavy | screening | 304.5 ms (82.0 ms) | 315.0 ms (110.5 ms) | 10.5 ms | no |
| mi-easy-main-cardioid | screening | 280.5 ms (12.5 ms) | 288.0 ms (14.0 ms) | 7.5 ms | no |
| mi-easy-period2-bulb | screening | 335.5 ms (55.5 ms) | 299.0 ms (28.5 ms) | -36.5 ms | no |
| mi-hard-rabbit-boundary | release-gate | 8105.5 ms (850.0 ms) | 472.0 ms (22.0 ms) | -7633.5 ms | no |
| mi-hard-supplied-126x | release-gate | 21877.0 ms (1552.5 ms) | 801.0 ms (32.5 ms) | -21076.0 ms | no |
| mi-hard-supplied-609x | release-gate | 6528.0 ms (1506.5 ms) | 691.0 ms (64.5 ms) | -5837.0 ms | no |
| mi-hard-supplied-13x | release-gate | 16452.0 ms (1326.0 ms) | 809.5 ms (55.5 ms) | -15642.5 ms | no |
| mi-fallback-unknown-high-period | release-gate | 11066.0 ms (1785.0 ms) | 1012.0 ms (178.0 ms) | -10054.0 ms | no |
| mi-fallback-weak-attraction | release-gate | 40566.5 ms (1390.5 ms) | 1498.0 ms (90.5 ms) | -39068.5 ms | no |
| mi-fallback-ambiguous-boundary | release-gate | 2599.0 ms (416.0 ms) | 433.0 ms (75.0 ms) | -2166.0 ms | no |
| mi-fallback-budget-exhaustion | release-gate | 24426.0 ms (2088.5 ms) | 1419.0 ms (454.0 ms) | -23007.0 ms | no |
| mi-scale-6mx-basilica-rim | release-gate | 12380.5 ms (1367.0 ms) | 1758.0 ms (76.0 ms) | -10622.5 ms | no |

The flag column applies the median part of the plan §9 cap only; the BCa paired interval excluding zero is not computed at 9 screening reps and remains release-gate work.

## Semantic comparison (stable-frame RGBA hash)

Hash: sha-256 over row-major RGBA bytes (documented byte order). This is a palette-inclusive proxy — the ring exposes no per-pixel period histogram. Checkpoint detections are oracle-certified additions, so mismatches are enumerated findings.

### Engine chromium

| Case | matches | mismatches | mismatch repetitions |
| --- | --- | --- | --- |
| mi-easy-default-full | 0 | 9 | 0, 1, 2, 3, 4, 5, 6, 7, 8 |
| mi-easy-exterior-heavy | 9 | 0 | — |
| mi-easy-main-cardioid | 9 | 0 | — |
| mi-easy-period2-bulb | 9 | 0 | — |
| mi-hard-rabbit-boundary | 0 | 9 | 0, 1, 2, 3, 4, 5, 6, 7, 8 |
| mi-hard-supplied-126x | 0 | 9 | 0, 1, 2, 3, 4, 5, 6, 7, 8 |
| mi-hard-supplied-609x | 0 | 9 | 0, 1, 2, 3, 4, 5, 6, 7, 8 |
| mi-hard-supplied-13x | 0 | 9 | 0, 1, 2, 3, 4, 5, 6, 7, 8 |
| mi-fallback-unknown-high-period | 9 | 0 | — |
| mi-fallback-weak-attraction | 0 | 9 | 0, 1, 2, 3, 4, 5, 6, 7, 8 |
| mi-fallback-ambiguous-boundary | 0 | 9 | 0, 1, 2, 3, 4, 5, 6, 7, 8 |
| mi-fallback-budget-exhaustion | 0 | 9 | 0, 1, 2, 3, 4, 5, 6, 7, 8 |
| mi-scale-6mx-basilica-rim | 9 | 0 | — |

Every mismatching case (mi-easy-default-full, mi-hard-rabbit-boundary, mi-hard-supplied-126x, mi-hard-supplied-609x, mi-hard-supplied-13x, mi-fallback-weak-attraction, mi-fallback-ambiguous-boundary, mi-fallback-budget-exhaustion) is an interior/boundary-heavy view — the expected signature of the checkpoint schedule proposing additional oracle-certified candidates (PR 4 evidence). The hash inequality is enumerated as a finding per case and repetition above; it is not treated as a failure.

### Engine firefox

| Case | matches | mismatches | mismatch repetitions |
| --- | --- | --- | --- |
| mi-easy-default-full | 0 | 9 | 0, 1, 2, 3, 4, 5, 6, 7, 8 |
| mi-easy-exterior-heavy | 9 | 0 | — |
| mi-easy-main-cardioid | 9 | 0 | — |
| mi-easy-period2-bulb | 9 | 0 | — |
| mi-hard-rabbit-boundary | 0 | 9 | 0, 1, 2, 3, 4, 5, 6, 7, 8 |
| mi-hard-supplied-126x | 0 | 9 | 0, 1, 2, 3, 4, 5, 6, 7, 8 |
| mi-hard-supplied-609x | 0 | 9 | 0, 1, 2, 3, 4, 5, 6, 7, 8 |
| mi-hard-supplied-13x | 0 | 9 | 0, 1, 2, 3, 4, 5, 6, 7, 8 |
| mi-fallback-unknown-high-period | 9 | 0 | — |
| mi-fallback-weak-attraction | 0 | 9 | 0, 1, 2, 3, 4, 5, 6, 7, 8 |
| mi-fallback-ambiguous-boundary | 0 | 9 | 0, 1, 2, 3, 4, 5, 6, 7, 8 |
| mi-fallback-budget-exhaustion | 0 | 9 | 0, 1, 2, 3, 4, 5, 6, 7, 8 |
| mi-scale-6mx-basilica-rim | 9 | 0 | — |

Every mismatching case (mi-easy-default-full, mi-hard-rabbit-boundary, mi-hard-supplied-126x, mi-hard-supplied-609x, mi-hard-supplied-13x, mi-fallback-weak-attraction, mi-fallback-ambiguous-boundary, mi-fallback-budget-exhaustion) is an interior/boundary-heavy view — the expected signature of the checkpoint schedule proposing additional oracle-certified candidates (PR 4 evidence). The hash inequality is enumerated as a finding per case and repetition above; it is not treated as a failure.

## Scope and honesty notes

- Cold/warm: repetition 0 is cold (fresh browser context per arm; the browser process is shared, so process-level code caches are not cold). Repetitions 1+ re-navigate one persistent page (warm).
- Cancellation interactions, cache/replay/recolor distributions, and catalog shard states are out of scope for this first pass.
- requestToPresentMs ends at the next presentation opportunity after image upload; it is not proof of physical paint (plan §8).
- Detected-period histograms are not exposed by the ring; the RGBA hash is a palette-inclusive proxy for semantic comparison.
- 9 paired repetitions = screening protocol (plan §9); release-gate cases need 21+ reps, BCa paired intervals, branded stable browsers, and declared target hardware.
- The chromium pass ran from build 6f49f19 and the firefox pass from build 73a126a; the measurable application sources are identical between the two revisions (only harness/evidence files changed), and per-engine build revisions are recorded in environment.json (`browsers` map).
