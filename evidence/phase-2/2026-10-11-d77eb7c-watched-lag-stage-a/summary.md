# Stage A browser evidence — 2026-10-11 @ d77eb7c

Paired legacy-scan (conjugate mirroring off) vs triggered-scan classifier evidence from the production bundle (`vite build` + `vite preview`), driven through the real application UI by `tools/benchmark/run-stage-a.mjs`. Medians below are **warm** samples (8 pairs per case; cold rep 0 is stored raw in raw-observations.json and excluded). Wall metric: stable-frame `requestToPresentMs` (plan §8).

**Label (chromium):** automation-bundled headless chromium via Playwright — directional only, not release evidence per plan §9 (branded stable browsers, headed, declared target hardware).

## Headline chromium (paired warm medians, ms)

| Case                            | Designation  | legacy-scan median (MAD) | triggered-scan median (MAD) | Δ (candidate−legacy) | Regression flag max(5%, 20 ms) |
| ------------------------------- | ------------ | ------------------------ | --------------------------- | -------------------- | ------------------------------ |
| mi-easy-default-full            | screening    | 235.2 ms (8.0 ms)        | 163.6 ms (4.0 ms)           | -71.6 ms             | no                             |
| mi-easy-exterior-heavy          | screening    | 96.9 ms (1.1 ms)         | 92.7 ms (3.5 ms)            | -4.2 ms              | no                             |
| mi-easy-main-cardioid           | screening    | 150.9 ms (4.5 ms)        | 146.4 ms (7.1 ms)           | -4.5 ms              | no                             |
| mi-easy-period2-bulb            | screening    | 130.8 ms (4.1 ms)        | 126.6 ms (2.1 ms)           | -4.1 ms              | no                             |
| mi-hard-rabbit-boundary         | release-gate | 1667.7 ms (164.9 ms)     | 425.5 ms (13.5 ms)          | -1242.2 ms           | no                             |
| mi-hard-supplied-126x           | release-gate | 4053.6 ms (35.0 ms)      | 377.2 ms (15.5 ms)          | -3676.4 ms           | no                             |
| mi-hard-supplied-609x           | release-gate | 1421.6 ms (19.3 ms)      | 274.8 ms (12.1 ms)          | -1146.8 ms           | no                             |
| mi-hard-supplied-13x            | release-gate | 2847.4 ms (39.3 ms)      | 361.9 ms (14.9 ms)          | -2485.5 ms           | no                             |
| mi-fallback-unknown-high-period | release-gate | 3885.6 ms (40.7 ms)      | 466.1 ms (13.6 ms)          | -3419.5 ms           | no                             |
| mi-fallback-weak-attraction     | release-gate | 9865.3 ms (17.4 ms)      | 749.4 ms (13.5 ms)          | -9115.9 ms           | no                             |
| mi-fallback-ambiguous-boundary  | release-gate | 390.6 ms (20.3 ms)       | 238.3 ms (7.6 ms)           | -152.3 ms            | no                             |
| mi-fallback-budget-exhaustion   | release-gate | 7293.6 ms (283.7 ms)     | 453.3 ms (15.9 ms)          | -6840.4 ms           | no                             |
| mi-scale-6mx-basilica-rim       | release-gate | 4988.1 ms (159.1 ms)     | 373.3 ms (11.3 ms)          | -4614.8 ms           | no                             |

**Label (firefox):** automation-bundled headless Firefox via Playwright — directional only, not release evidence per plan §9 (branded stable browsers, headed, declared target hardware).

## Headline firefox (paired warm medians, ms)

| Case                            | Designation  | legacy-scan median (MAD) | triggered-scan median (MAD) | Δ (candidate−legacy) | Regression flag max(5%, 20 ms) |
| ------------------------------- | ------------ | ------------------------ | --------------------------- | -------------------- | ------------------------------ |
| mi-easy-default-full            | screening    | 471.5 ms (33.5 ms)       | 158.0 ms (19.5 ms)          | -313.5 ms            | no                             |
| mi-easy-exterior-heavy          | screening    | 110.0 ms (11.0 ms)       | 105.0 ms (5.0 ms)           | -5.0 ms              | no                             |
| mi-easy-main-cardioid           | screening    | 166.5 ms (4.5 ms)        | 161.0 ms (8.0 ms)           | -5.5 ms              | no                             |
| mi-easy-period2-bulb            | screening    | 164.5 ms (13.0 ms)       | 154.5 ms (6.0 ms)           | -10.0 ms             | no                             |
| mi-hard-rabbit-boundary         | release-gate | 3762.5 ms (109.0 ms)     | 355.5 ms (12.5 ms)          | -3407.0 ms           | no                             |
| mi-hard-supplied-126x           | release-gate | 9961.0 ms (479.5 ms)     | 399.5 ms (12.0 ms)          | -9561.5 ms           | no                             |
| mi-hard-supplied-609x           | release-gate | 3227.0 ms (124.5 ms)     | 233.0 ms (15.5 ms)          | -2994.0 ms           | no                             |
| mi-hard-supplied-13x            | release-gate | 6627.0 ms (116.0 ms)     | 304.0 ms (14.0 ms)          | -6323.0 ms           | no                             |
| mi-fallback-unknown-high-period | release-gate | 5025.5 ms (188.0 ms)     | 638.0 ms (37.5 ms)          | -4387.5 ms           | no                             |
| mi-fallback-weak-attraction     | release-gate | 19974.0 ms (154.5 ms)    | 1006.0 ms (33.5 ms)         | -18968.0 ms          | no                             |
| mi-fallback-ambiguous-boundary  | release-gate | 600.5 ms (23.5 ms)       | 157.5 ms (7.0 ms)           | -443.0 ms            | no                             |
| mi-fallback-budget-exhaustion   | release-gate | 11586.0 ms (28.5 ms)     | 477.0 ms (24.5 ms)          | -11109.0 ms          | no                             |
| mi-scale-6mx-basilica-rim       | release-gate | 5199.0 ms (78.5 ms)      | 384.0 ms (9.5 ms)           | -4815.0 ms           | no                             |

The flag column applies the median part of the plan §9 cap only; the BCa paired interval excluding zero is not computed at 9 screening reps and remains release-gate work.

## Semantic comparison (stable-frame RGBA hash)

Hash: sha-256 over row-major RGBA bytes (documented byte order). This is a palette-inclusive proxy — the ring exposes no per-pixel period histogram. Mismatches are enumerated findings. identical hashes expected on every case: the watched-lag triggered scan is bit-identical to the legacy scan on the corpus (Node parity); any mismatch is a finding

### Engine chromium

| Case                            | matches | mismatches | mismatch repetitions |
| ------------------------------- | ------- | ---------- | -------------------- |
| mi-easy-default-full            | 9       | 0          | —                    |
| mi-easy-exterior-heavy          | 9       | 0          | —                    |
| mi-easy-main-cardioid           | 9       | 0          | —                    |
| mi-easy-period2-bulb            | 9       | 0          | —                    |
| mi-hard-rabbit-boundary         | 9       | 0          | —                    |
| mi-hard-supplied-126x           | 9       | 0          | —                    |
| mi-hard-supplied-609x           | 9       | 0          | —                    |
| mi-hard-supplied-13x            | 9       | 0          | —                    |
| mi-fallback-unknown-high-period | 9       | 0          | —                    |
| mi-fallback-weak-attraction     | 9       | 0          | —                    |
| mi-fallback-ambiguous-boundary  | 9       | 0          | —                    |
| mi-fallback-budget-exhaustion   | 9       | 0          | —                    |
| mi-scale-6mx-basilica-rim       | 9       | 0          | —                    |

Every case × repetition hash matched between the two modes.

### Engine firefox

| Case                            | matches | mismatches | mismatch repetitions |
| ------------------------------- | ------- | ---------- | -------------------- |
| mi-easy-default-full            | 9       | 0          | —                    |
| mi-easy-exterior-heavy          | 9       | 0          | —                    |
| mi-easy-main-cardioid           | 9       | 0          | —                    |
| mi-easy-period2-bulb            | 9       | 0          | —                    |
| mi-hard-rabbit-boundary         | 9       | 0          | —                    |
| mi-hard-supplied-126x           | 9       | 0          | —                    |
| mi-hard-supplied-609x           | 9       | 0          | —                    |
| mi-hard-supplied-13x            | 9       | 0          | —                    |
| mi-fallback-unknown-high-period | 9       | 0          | —                    |
| mi-fallback-weak-attraction     | 9       | 0          | —                    |
| mi-fallback-ambiguous-boundary  | 9       | 0          | —                    |
| mi-fallback-budget-exhaustion   | 9       | 0          | —                    |
| mi-scale-6mx-basilica-rim       | 9       | 0          | —                    |

Every case × repetition hash matched between the two modes.

## Scope and honesty notes

- Cold/warm: repetition 0 is cold (fresh browser context per arm; the browser process is shared, so process-level code caches are not cold). Repetitions 1+ re-navigate one persistent page (warm).
- Cancellation interactions, cache/replay/recolor distributions, and catalog shard states are out of scope for this first pass.
- requestToPresentMs ends at the next presentation opportunity after image upload; it is not proof of physical paint (plan §8).
- Detected-period histograms are not exposed by the ring; the RGBA hash is a palette-inclusive proxy for semantic comparison.
- 9 paired repetitions = screening protocol (plan §9); release-gate cases need 21+ reps, BCa paired intervals, branded stable browsers, and declared target hardware.

## Browser builds

The installed Playwright (1.63.0) expects chromium v1243 and firefox v1543, whose CDN downloads timed out on this machine. Both engines ran from earlier cached Playwright builds through the runner's `--executable` option: Chromium 151.0.7922.34 (`chromium-1234`) and the `firefox-1538` build (versions as reported in `environment.json`). The legacy-scan arm used `--baseline-mirror-off` (`conjugateMirror=0`), i.e. the production default before mirroring became default-on; the candidate arm is the new production default. Manifest regenerated after this note.

Files were formatted with Prettier (whitespace only) before the manifest was regenerated.
