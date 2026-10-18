# Stage A browser evidence — 2026-10-15 @ 59926c5

Paired legacy-scan (conjugate mirroring off) vs triggered-scan classifier evidence from the production bundle (`vite build` + `vite preview`), driven through the real application UI by `tools/benchmark/run-stage-a.mjs`. Medians below are **warm** samples (21 pairs per case; cold rep 0 is stored raw in raw-observations.json and excluded). Wall metric: stable-frame `requestToPresentMs` (plan §8).

**Run history (added by hand after the run).** Both halves ran the same
build, `59926c5`. The branded Chrome 155 half ran on 2026-10-11. The branded
Firefox 157 half ran on 2026-10-15 (the generated title carries that date)
from a detached worktree at `59926c5`, so the recorded build and algorithm
revisions match the Chrome half. Two earlier Firefox attempts stored no
samples: on 2026-10-11 host memory pressure stopped the run (a separate
interactive Firefox was open), and on 2026-10-15 the KDE session auto-locked,
which stops frame callbacks in a headed browser and timed out the
stable-frame wait. The completed run was wrapped in
`kde-inhibit --screenSaver --power`. Steam was running in the background
during the Firefox half. The manifest below was regenerated after this note
was added.

**Label (chromium):** Playwright 1.63.0 driving branded stable Google Chrome, headed: flatpak run com.google.Chrome (CDP) — release protocol (plan §9): branded stable browser, headed, declared target hardware, ≥21 warm pairs, BCa paired intervals.

## Headline chromium (paired warm medians, ms)

| Case                            | Designation  | Pairs | legacy-scan median (MAD) | triggered-scan median (MAD) | Speed ratio legacy/candidate [95% BCa] | Δ candidate−legacy [95% BCa]         | Regression flag |
| ------------------------------- | ------------ | ----- | ------------------------ | --------------------------- | -------------------------------------- | ------------------------------------ | --------------- |
| mi-easy-default-full            | screening    | 21    | 277.7 ms (13.5 ms)       | 177.4 ms (8.8 ms)           | 1.58× [1.51×, 1.60×]                   | -99.8 ms [-114.0 ms, -94.0 ms]       | no              |
| mi-easy-exterior-heavy          | screening    | 21    | 100.3 ms (2.1 ms)        | 97.8 ms (5.1 ms)            | 1.01× [0.94×, 1.04×]                   | -0.9 ms [-9.6 ms, 0.2 ms]            | no              |
| mi-easy-main-cardioid           | screening    | 21    | 168.1 ms (8.4 ms)        | 151.6 ms (5.9 ms)           | 1.09× [1.06×, 1.13×]                   | -14.3 ms [-28.7 ms, -12.0 ms]        | no              |
| mi-easy-period2-bulb            | screening    | 21    | 156.6 ms (9.1 ms)        | 156.3 ms (17.3 ms)          | 1.04× [0.92×, 1.13×]                   | -5.7 ms [-22.4 ms, 3.9 ms]           | no              |
| mi-hard-rabbit-boundary         | release-gate | 21    | 1850.4 ms (47.1 ms)      | 470.5 ms (21.4 ms)          | 4.02× [3.74×, 4.19×]                   | -1402.4 ms [-1424.4 ms, -1390.0 ms]  | no              |
| mi-hard-supplied-126x           | release-gate | 21    | 4115.1 ms (56.2 ms)      | 368.1 ms (27.6 ms)          | 11.05× [10.21×, 11.48×]                | -3713.4 ms [-3746.8 ms, -3695.6 ms]  | no              |
| mi-hard-supplied-609x           | release-gate | 21    | 1469.9 ms (27.1 ms)      | 304.4 ms (20.5 ms)          | 4.80× [4.53×, 5.06×]                   | -1165.9 ms [-1230.7 ms, -1145.6 ms]  | no              |
| mi-hard-supplied-13x            | release-gate | 21    | 2900.2 ms (25.7 ms)      | 368.1 ms (17.6 ms)          | 8.27× [7.50×, 8.35×]                   | -2537.7 ms [-2563.5 ms, -2527.2 ms]  | no              |
| mi-fallback-unknown-high-period | release-gate | 21    | 3932.5 ms (31.7 ms)      | 476.9 ms (13.5 ms)          | 8.40× [7.99×, 8.48×]                   | -3455.8 ms [-3500.3 ms, -3435.1 ms]  | no              |
| mi-fallback-weak-attraction     | release-gate | 21    | 10356.3 ms (485.4 ms)    | 757.6 ms (21.2 ms)          | 13.61× [13.03×, 15.03×]                | -9333.8 ms [-11103.5 ms, -9296.9 ms] | no              |
| mi-fallback-ambiguous-boundary  | release-gate | 21    | 381.4 ms (8.6 ms)        | 231.0 ms (9.5 ms)           | 1.67× [1.61×, 1.69×]                   | -153.6 ms [-160.2 ms, -148.6 ms]     | no              |
| mi-fallback-budget-exhaustion   | release-gate | 21    | 7481.3 ms (714.2 ms)     | 432.2 ms (38.1 ms)          | 16.45× [13.56×, 19.29×]                | -6987.6 ms [-9475.1 ms, -6463.5 ms]  | no              |
| mi-scale-6mx-basilica-rim       | release-gate | 21    | 4707.5 ms (389.4 ms)     | 336.3 ms (22.9 ms)          | 13.90× [12.08×, 14.26×]                | -4373.7 ms [-6458.6 ms, -4191.6 ms]  | no              |

**Label (firefox):** Playwright 1.63.0 driving branded stable Firefox, headed: /usr/bin/firefox (WebDriver BiDi) — release protocol (plan §9): branded stable browser, headed, declared target hardware, ≥21 warm pairs, BCa paired intervals.

## Headline firefox (paired warm medians, ms)

| Case                            | Designation  | Pairs | legacy-scan median (MAD) | triggered-scan median (MAD) | Speed ratio legacy/candidate [95% BCa] | Δ candidate−legacy [95% BCa]           | Regression flag |
| ------------------------------- | ------------ | ----- | ------------------------ | --------------------------- | -------------------------------------- | -------------------------------------- | --------------- |
| mi-easy-default-full            | screening    | 21    | 302.0 ms (15.0 ms)       | 125.0 ms (6.0 ms)           | 2.38× [2.28×, 2.54×]                   | -175.0 ms [-220.0 ms, -169.0 ms]       | no              |
| mi-easy-exterior-heavy          | screening    | 21    | 97.0 ms (6.0 ms)         | 90.0 ms (5.0 ms)            | 1.06× [0.97×, 1.10×]                   | -6.0 ms [-13.0 ms, -1.0 ms]            | no              |
| mi-easy-main-cardioid           | screening    | 21    | 150.0 ms (4.0 ms)        | 136.0 ms (6.0 ms)           | 1.09× [1.03×, 1.10×]                   | -13.0 ms [-20.0 ms, -13.0 ms]          | no              |
| mi-easy-period2-bulb            | screening    | 21    | 135.0 ms (8.0 ms)        | 134.0 ms (7.0 ms)           | 1.07× [0.97×, 1.15×]                   | -9.0 ms [-23.0 ms, -3.0 ms]            | no              |
| mi-hard-rabbit-boundary         | release-gate | 21    | 3320.0 ms (263.0 ms)     | 295.0 ms (20.0 ms)          | 10.97× [9.80×, 11.63×]                 | -2989.0 ms [-3217.0 ms, -2687.0 ms]    | no              |
| mi-hard-supplied-126x           | release-gate | 21    | 7796.0 ms (117.0 ms)     | 325.0 ms (16.0 ms)          | 23.55× [21.16×, 24.44×]                | -7410.0 ms [-7536.0 ms, -7368.0 ms]    | no              |
| mi-hard-supplied-609x           | release-gate | 21    | 2742.0 ms (110.0 ms)     | 194.0 ms (10.0 ms)          | 13.73× [13.17×, 14.50×]                | -2532.0 ms [-2599.0 ms, -2435.0 ms]    | no              |
| mi-hard-supplied-13x            | release-gate | 21    | 5750.0 ms (166.0 ms)     | 296.0 ms (30.0 ms)          | 19.93× [17.30×, 20.49×]                | -5437.0 ms [-5641.0 ms, -5383.0 ms]    | no              |
| mi-fallback-unknown-high-period | release-gate | 21    | 4785.0 ms (56.0 ms)      | 586.0 ms (59.0 ms)          | 8.21× [7.28×, 8.75×]                   | -4218.0 ms [-4235.0 ms, -4131.0 ms]    | no              |
| mi-fallback-weak-attraction     | release-gate | 21    | 21854.0 ms (1109.0 ms)   | 1010.0 ms (91.0 ms)         | 22.16× [20.92×, 23.38×]                | -20913.0 ms [-22168.0 ms, -20418.0 ms] | no              |
| mi-fallback-ambiguous-boundary  | release-gate | 21    | 732.0 ms (59.0 ms)       | 158.0 ms (14.0 ms)          | 4.68× [4.24×, 4.97×]                   | -566.0 ms [-633.0 ms, -541.0 ms]       | no              |
| mi-fallback-budget-exhaustion   | release-gate | 21    | 14797.0 ms (2107.0 ms)   | 616.0 ms (161.0 ms)         | 26.06× [17.07×, 27.89×]                | -14170.0 ms [-16075.0 ms, -12529.0 ms] | no              |
| mi-scale-6mx-basilica-rim       | release-gate | 21    | 6353.0 ms (901.0 ms)     | 444.0 ms (112.0 ms)         | 14.82× [12.25×, 17.59×]                | -5913.0 ms [-6608.0 ms, -5319.0 ms]    | no              |

Speed ratio: exp of the median paired log-ratio ln(legacy/candidate), >1 means the candidate is faster. Intervals: 95% BCa bootstrap over the warm pairs (10000 resamples, seed 20261011, `tools/benchmark/bca.ts`). Regression flag (plan §9): the paired median difference exceeds max(5% of the legacy median, 20 ms) and its BCa interval excludes zero.

## Semantic comparison (stable-frame RGBA hash)

Hash: sha-256 over row-major RGBA bytes (documented byte order). This is a palette-inclusive proxy — the ring exposes no per-pixel period histogram. Mismatches are enumerated findings. identical hashes expected on every case: the watched-lag triggered scan is bit-identical to the legacy scan on the corpus (Node parity); any mismatch is a finding

### Engine chromium

| Case                            | matches | mismatches | mismatch repetitions |
| ------------------------------- | ------- | ---------- | -------------------- |
| mi-easy-default-full            | 22      | 0          | —                    |
| mi-easy-exterior-heavy          | 22      | 0          | —                    |
| mi-easy-main-cardioid           | 22      | 0          | —                    |
| mi-easy-period2-bulb            | 22      | 0          | —                    |
| mi-hard-rabbit-boundary         | 22      | 0          | —                    |
| mi-hard-supplied-126x           | 22      | 0          | —                    |
| mi-hard-supplied-609x           | 22      | 0          | —                    |
| mi-hard-supplied-13x            | 22      | 0          | —                    |
| mi-fallback-unknown-high-period | 22      | 0          | —                    |
| mi-fallback-weak-attraction     | 22      | 0          | —                    |
| mi-fallback-ambiguous-boundary  | 22      | 0          | —                    |
| mi-fallback-budget-exhaustion   | 22      | 0          | —                    |
| mi-scale-6mx-basilica-rim       | 22      | 0          | —                    |

Every case × repetition hash matched between the two modes.

### Engine firefox

| Case                            | matches | mismatches | mismatch repetitions |
| ------------------------------- | ------- | ---------- | -------------------- |
| mi-easy-default-full            | 22      | 0          | —                    |
| mi-easy-exterior-heavy          | 22      | 0          | —                    |
| mi-easy-main-cardioid           | 22      | 0          | —                    |
| mi-easy-period2-bulb            | 22      | 0          | —                    |
| mi-hard-rabbit-boundary         | 22      | 0          | —                    |
| mi-hard-supplied-126x           | 22      | 0          | —                    |
| mi-hard-supplied-609x           | 22      | 0          | —                    |
| mi-hard-supplied-13x            | 22      | 0          | —                    |
| mi-fallback-unknown-high-period | 22      | 0          | —                    |
| mi-fallback-weak-attraction     | 22      | 0          | —                    |
| mi-fallback-ambiguous-boundary  | 22      | 0          | —                    |
| mi-fallback-budget-exhaustion   | 22      | 0          | —                    |
| mi-scale-6mx-basilica-rim       | 22      | 0          | —                    |

Every case × repetition hash matched between the two modes.

## Scope and honesty notes

- Cold/warm: repetition 0 is cold (fresh browser context per arm; the browser process is shared, so process-level code caches are not cold). Repetitions 1+ re-navigate one persistent page (warm).
- Cancellation interactions, cache/replay/recolor distributions, and catalog shard states are out of scope for this first pass.
- requestToPresentMs ends at the next presentation opportunity after image upload; it is not proof of physical paint (plan §8).
- Detected-period histograms are not exposed by the ring; the RGBA hash is a palette-inclusive proxy for semantic comparison.
- 22 repetitions per case (21 warm pairs) in branded stable browsers, headed, on the declared target hardware: the plan §9 release protocol. Easy (screening) cases ran at the release count too. Contexts use deviceScaleFactor 1 so the raster is exactly the shipping 1024x640 raster; no p95 is quoted (fewer than 40 observations per case and arm).
