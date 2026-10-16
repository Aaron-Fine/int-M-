# Workstream B release gate — 2026-10-15 @ 9e70551 (both engines)

**Assembled by hand (2026-10-16).** `run-b-gate.mjs` writes `summary.md` for
the engine it just ran, while `raw-observations.json`, `environment.json`, and
`semantic-comparison.json` merge both engines. This file joins the two
generated summaries unchanged under per-engine headings. The first Firefox
attempt (2026-10-15 19:07) stalled at `mi-fallback-unknown-high-period` rep 9
(no stable frame in 10 min; session unlocked, no OOM) and stored no samples;
the runner then gained a one-time retry for a sample stalled for 3 min, and
the Firefox rerun used it once (recorded per sample as `retriedAfterStall`).
The manifest was regenerated after this file was assembled.

**Finding: the gate is not met in Firefox.** In Firefox the current build's
`legacy-scan` mode is 27–51% slower than the pre-PR-2 build on six
release-gate cases (BCa-flagged regressions), while easy views improve. In
Chrome every case improves. The production default (watched-lag kernel,
ADR 0006) is not measured here.

## Chrome (branded stable 155, run 2026-10-15)

Paired **whole-build** comparison: the pre-PR-2 baseline build (commit `a6e183838a2c465dd1cc8e40aa2f094465267c90`, built with `vite build` in a temporary worktree fixture) vs the current build (`9e70551`), both pinned to the legacy-scan classifier, driven through the real application UI by `tools/benchmark/run-b-gate.mjs` with region-select chains planned by `tools/benchmark/view-chain.mjs` (unit-pinned against the application viewport math). Medians are **warm** samples (reps 21 pairs per case; cold rep 0 is stored raw and excluded).

**Label (chromium):** Playwright 1.63.0 driving branded stable Google Chrome 155.0.8059.39, headed (flatpak run com.google.Chrome (CDP)) — release protocol (plan §9): branded stable browser, headed, declared target hardware, ≥21 warm pairs, BCa paired intervals.

### Headline (paired warm medians) — end-to-end wall

Wall metric: `mi:render-request` → `mi:stable-presented` mark delta (both builds emit these marks identically inside the present rAF; equals the trace `requestToPresentMs` definition). Cap: plan §9 `max(5%, 20 ms)` regression rule, applied in the regression direction.

| Case                            | Designation  | baseline wall median (MAD) | current wall median (MAD) | Δ (cur−base) | improvement | paired improvement [95% BCa] | regression flag |
| ------------------------------- | ------------ | -------------------------- | ------------------------- | ------------ | ----------- | ---------------------------- | --------------- |
| mi-easy-default-full            | screening    | 471.4 ms (70.6 ms)         | 365.5 ms (64.8 ms)        | -105.9 ms    | 22.5%       | 25.1% [13.1%, 31.8%]         | no              |
| mi-easy-exterior-heavy          | screening    | 196.9 ms (8.7 ms)          | 72.7 ms (9.9 ms)          | -124.2 ms    | 63.1%       | 61.0% [58.2%, 64.3%]         | no              |
| mi-easy-main-cardioid           | screening    | 271.8 ms (16.8 ms)         | 186.4 ms (33.7 ms)        | -85.4 ms     | 31.4%       | 30.8% [27.8%, 37.4%]         | no              |
| mi-easy-period2-bulb            | screening    | 268.5 ms (19.2 ms)         | 205.7 ms (45.2 ms)        | -62.8 ms     | 23.4%       | 31.0% [22.5%, 36.7%]         | no              |
| mi-hard-rabbit-boundary         | release-gate | 2756.6 ms (390.8 ms)       | 2055.6 ms (321.8 ms)      | -701.0 ms    | 25.4%       | 26.4% [4.9%, 27.3%]          | no              |
| mi-hard-supplied-126x           | release-gate | 6939.8 ms (622.8 ms)       | 5293.1 ms (730.7 ms)      | -1646.7 ms   | 23.7%       | 27.7% [14.6%, 38.3%]         | no              |
| mi-hard-supplied-609x           | release-gate | 2562.5 ms (189.0 ms)       | 1507.8 ms (167.8 ms)      | -1054.7 ms   | 41.2%       | 43.1% [26.7%, 44.2%]         | no              |
| mi-hard-supplied-13x            | release-gate | 5459.9 ms (573.3 ms)       | 2860.1 ms (124.0 ms)      | -2599.8 ms   | 47.6%       | 45.7% [35.8%, 50.7%]         | no              |
| mi-fallback-unknown-high-period | release-gate | 8782.6 ms (1062.8 ms)      | 6470.5 ms (980.1 ms)      | -2312.1 ms   | 26.3%       | 27.6% [-6.9%, 37.7%]         | no              |
| mi-fallback-weak-attraction     | release-gate | 16460.2 ms (445.0 ms)      | 12179.7 ms (1018.9 ms)    | -4280.5 ms   | 26.0%       | 26.8% [23.6%, 29.9%]         | no              |
| mi-fallback-ambiguous-boundary  | release-gate | 988.3 ms (59.6 ms)         | 358.4 ms (28.1 ms)        | -629.9 ms    | 63.7%       | 63.4% [58.6%, 64.9%]         | no              |
| mi-fallback-budget-exhaustion   | release-gate | 10388.0 ms (1225.6 ms)     | 9045.1 ms (1241.5 ms)     | -1342.9 ms   | 12.9%       | 9.6% [-2.8%, 28.9%]          | no              |
| mi-scale-6mx-basilica-rim       | release-gate | 9076.4 ms (1254.0 ms)      | 7900.4 ms (1461.5 ms)     | -1176.0 ms   | 13.0%       | 11.8% [-21.7%, 25.7%]        | no              |

### Classifier column (stable-frame `classifyMs`, warm paired medians)

Observed from Worker frame messages on both builds without touching any application source: the stable-pass classification wall as each build defines it (tiled job wall from dispatch to last band, yields subtracted). Pool parallelism and scheduling sit inside this number; the single-threaded classifier comparison remains the pr2 Node microbench (`poc/performance/results/pr2/pr2-microbench.json`).

| Case                            | baseline classify median (MAD) | current classify median (MAD) | Δ (cur−base) | classify improvement | paired improvement [95% BCa] | regression flag |
| ------------------------------- | ------------------------------ | ----------------------------- | ------------ | -------------------- | ---------------------------- | --------------- |
| mi-easy-default-full            | 344.2 ms (48.6 ms)             | 252.8 ms (34.8 ms)            | -91.4 ms     | 26.6%                | 26.8% [15.1%, 31.5%]         | no              |
| mi-easy-exterior-heavy          | 93.1 ms (5.6 ms)               | 21.3 ms (3.3 ms)              | -71.7 ms     | 77.1%                | 76.3% [69.0%, 78.7%]         | no              |
| mi-easy-main-cardioid           | 111.7 ms (8.6 ms)              | 37.6 ms (5.8 ms)              | -74.1 ms     | 66.3%                | 64.1% [56.7%, 67.4%]         | no              |
| mi-easy-period2-bulb            | 105.6 ms (10.7 ms)             | 38.5 ms (11.4 ms)             | -67.1 ms     | 63.5%                | 65.3% [60.6%, 68.5%]         | no              |
| mi-hard-rabbit-boundary         | 2582.0 ms (375.5 ms)           | 1919.3 ms (313.8 ms)          | -662.7 ms    | 25.7%                | 25.9% [4.7%, 27.6%]          | no              |
| mi-hard-supplied-126x           | 6792.5 ms (612.0 ms)           | 5205.7 ms (716.5 ms)          | -1586.8 ms   | 23.4%                | 27.7% [14.1%, 38.3%]         | no              |
| mi-hard-supplied-609x           | 2445.5 ms (192.2 ms)           | 1429.2 ms (154.3 ms)          | -1016.3 ms   | 41.6%                | 43.4% [27.0%, 44.7%]         | no              |
| mi-hard-supplied-13x            | 5319.5 ms (544.5 ms)           | 2736.3 ms (89.2 ms)           | -2583.2 ms   | 48.6%                | 46.5% [35.5%, 50.6%]         | no              |
| mi-fallback-unknown-high-period | 8476.4 ms (1112.0 ms)          | 6268.3 ms (944.2 ms)          | -2208.1 ms   | 26.0%                | 28.3% [-8.6%, 39.0%]         | no              |
| mi-fallback-weak-attraction     | 16061.0 ms (449.7 ms)          | 11840.7 ms (986.8 ms)         | -4220.3 ms   | 26.3%                | 27.8% [24.0%, 30.9%]         | no              |
| mi-fallback-ambiguous-boundary  | 858.5 ms (44.7 ms)             | 290.8 ms (23.7 ms)            | -567.7 ms    | 66.1%                | 67.0% [62.1%, 68.5%]         | no              |
| mi-fallback-budget-exhaustion   | 10182.9 ms (1203.2 ms)         | 8876.7 ms (1241.7 ms)         | -1306.2 ms   | 12.8%                | 9.9% [-4.5%, 28.7%]          | no              |
| mi-scale-6mx-basilica-rim       | 8876.9 ms (1263.0 ms)          | 7697.8 ms (1404.7 ms)         | -1179.1 ms   | 13.3%                | 12.0% [-23.3%, 25.5%]        | no              |

### Confounds (read before quoting any number above)

- **Era mismatch (documented, not removable here):** the baseline build predates the renderer-path bundle (MessageChannel yields, zero-copy transfer, packed output, center-out band order) and PR 4. The end-to-end wall column therefore measures PR 2 **plus** every later renderer-path improvement — it is an upper bound on B's end-to-end contribution, not an isolation of it.
- **Classifier column semantics:** `classifyMs` is each build's own stable-pass classification wall (tiled job wall from dispatch to last band, yields subtracted). Both builds use the same 4-worker pool shape, but scheduling/transfer improvements sit inside the current arm's number, so this column is directional corroboration, not a single-threaded kernel measurement. The single-threaded classifier evidence remains `poc/performance/results/pr2/pr2-microbench.json` (hard anchor −0.3%, full-set −5.0%: no ≥10% classifier win in Node).
- **View driving:** both arms reach corpus views through the same synthetic pointer chains (region-select + pan over the real UI). The planner replicates the application viewport math exactly (unit-pinned) and every sample records the achieved viewport (exact hook readback on the current arm; 9-digit readout + magnification on the baseline arm). Chain landing precision is binary64-level on the current arm; the baseline readout verifies to display precision.
- **No `?view=` on the baseline:** the pre-PR-2 build has no benchmark parameters, so corpus views are UI-driven on both arms; the corpus decimal strings are honored through the planner targets, not through URL parameters.

### Scope and honesty notes

- Cold/warm: repetition 0 is cold (fresh browser context per arm; the browser process is shared, so process-level code caches are not cold). Repetitions 1+ re-navigate one persistent page (warm).
- Cancellation interactions, cache/replay/recolor distributions, and catalog shard states are out of scope for this pass.
- markWallMs ends at the same rAF callback as the trace requestToPresentMs; it is not proof of physical paint (plan §8).
- The RGBA hash is a palette-inclusive proxy; cross-build hash mismatches are expected on interior/boundary-heavy views (PR 3 verifier reductions + PR 5 period-policy display landed between the arms) and are enumerated in semantic-comparison.json.
- 22 repetitions (21 warm pairs) in branded stable browsers, headed, on the declared target hardware: the plan §9 release protocol, with 95% BCa paired intervals (10000 resamples, seed 20261015).

## Firefox (branded stable 157, run 2026-10-15/16)

Paired **whole-build** comparison: the pre-PR-2 baseline build (commit `a6e183838a2c465dd1cc8e40aa2f094465267c90`, built with `vite build` in a temporary worktree fixture) vs the current build (`9e70551`), both pinned to the legacy-scan classifier, driven through the real application UI by `tools/benchmark/run-b-gate.mjs` with region-select chains planned by `tools/benchmark/view-chain.mjs` (unit-pinned against the application viewport math). Medians are **warm** samples (reps 21 pairs per case; cold rep 0 is stored raw and excluded).

**Label (firefox):** Playwright 1.63.0 driving branded stable Firefox 157.0, headed (/usr/bin/firefox (WebDriver BiDi)) — release protocol (plan §9): branded stable browser, headed, declared target hardware, ≥21 warm pairs, BCa paired intervals.

### Headline (paired warm medians) — end-to-end wall

Wall metric: `mi:render-request` → `mi:stable-presented` mark delta (both builds emit these marks identically inside the present rAF; equals the trace `requestToPresentMs` definition). Cap: plan §9 `max(5%, 20 ms)` regression rule, applied in the regression direction.

| Case                            | Designation  | baseline wall median (MAD) | current wall median (MAD) | Δ (cur−base) | improvement | paired improvement [95% BCa] | regression flag |
| ------------------------------- | ------------ | -------------------------- | ------------------------- | ------------ | ----------- | ---------------------------- | --------------- |
| mi-easy-default-full            | screening    | 364.0 ms (21.0 ms)         | 347.0 ms (9.0 ms)         | -17.0 ms     | 4.7%        | 4.2% [0.0%, 8.0%]            | no              |
| mi-easy-exterior-heavy          | screening    | 206.0 ms (8.0 ms)          | 79.0 ms (4.0 ms)          | -127.0 ms    | 61.7%       | 59.8% [51.7%, 62.1%]         | no              |
| mi-easy-main-cardioid           | screening    | 261.0 ms (8.0 ms)          | 133.0 ms (7.0 ms)         | -128.0 ms    | 49.0%       | 50.6% [46.9%, 51.2%]         | no              |
| mi-easy-period2-bulb            | screening    | 261.0 ms (19.0 ms)         | 124.0 ms (11.0 ms)        | -137.0 ms    | 52.5%       | 49.2% [45.3%, 55.5%]         | no              |
| mi-hard-rabbit-boundary         | release-gate | 3070.0 ms (440.0 ms)       | 4332.0 ms (1050.0 ms)     | 1262.0 ms    | -41.1%      | -28.5% [-89.1%, -13.4%]      | **flagged**     |
| mi-hard-supplied-126x           | release-gate | 7881.0 ms (875.0 ms)       | 11057.0 ms (759.0 ms)     | 3176.0 ms    | -40.3%      | -50.3% [-61.2%, -31.5%]      | **flagged**     |
| mi-hard-supplied-609x           | release-gate | 2925.0 ms (353.0 ms)       | 3904.0 ms (1150.0 ms)     | 979.0 ms     | -33.5%      | -26.5% [-56.8%, -3.4%]       | **flagged**     |
| mi-hard-supplied-13x            | release-gate | 5636.0 ms (803.0 ms)       | 7697.0 ms (1134.0 ms)     | 2061.0 ms    | -36.6%      | -39.0% [-75.5%, -17.3%]      | no              |
| mi-fallback-unknown-high-period | release-gate | 7878.0 ms (723.0 ms)       | 6807.0 ms (1113.0 ms)     | -1071.0 ms   | 13.6%       | 11.6% [-5.5%, 31.9%]         | no              |
| mi-fallback-weak-attraction     | release-gate | 19129.0 ms (576.0 ms)      | 24667.0 ms (1215.0 ms)    | 5538.0 ms    | -29.0%      | -33.8% [-44.0%, -25.6%]      | **flagged**     |
| mi-fallback-ambiguous-boundary  | release-gate | 1009.0 ms (74.0 ms)        | 752.0 ms (192.0 ms)       | -257.0 ms    | 25.5%       | 25.3% [7.2%, 34.5%]          | no              |
| mi-fallback-budget-exhaustion   | release-gate | 11468.0 ms (1430.0 ms)     | 16862.0 ms (1544.0 ms)    | 5394.0 ms    | -47.0%      | -40.7% [-64.1%, -33.1%]      | **flagged**     |
| mi-scale-6mx-basilica-rim       | release-gate | 7699.0 ms (1324.0 ms)      | 5881.0 ms (716.0 ms)      | -1818.0 ms   | 23.6%       | 18.5% [4.8%, 22.3%]          | no              |

### Classifier column (stable-frame `classifyMs`, warm paired medians)

Observed from Worker frame messages on both builds without touching any application source: the stable-pass classification wall as each build defines it (tiled job wall from dispatch to last band, yields subtracted). Pool parallelism and scheduling sit inside this number; the single-threaded classifier comparison remains the pr2 Node microbench (`poc/performance/results/pr2/pr2-microbench.json`).

| Case                            | baseline classify median (MAD) | current classify median (MAD) | Δ (cur−base) | classify improvement | paired improvement [95% BCa] | regression flag |
| ------------------------------- | ------------------------------ | ----------------------------- | ------------ | -------------------- | ---------------------------- | --------------- |
| mi-easy-default-full            | 260.0 ms (17.0 ms)             | 275.0 ms (9.0 ms)             | 15.0 ms      | -5.8%                | -6.9% [-12.8%, -2.3%]        | no              |
| mi-easy-exterior-heavy          | 108.0 ms (6.0 ms)              | 24.0 ms (3.0 ms)              | -84.0 ms     | 77.8%                | 76.0% [70.7%, 78.9%]         | no              |
| mi-easy-main-cardioid           | 109.0 ms (5.0 ms)              | 24.0 ms (3.0 ms)              | -85.0 ms     | 78.0%                | 78.2% [74.8%, 80.0%]         | no              |
| mi-easy-period2-bulb            | 108.0 ms (8.0 ms)              | 22.5 ms (3.0 ms)              | -85.5 ms     | 79.2%                | 78.4% [75.6%, 82.9%]         | no              |
| mi-hard-rabbit-boundary         | 2933.0 ms (381.0 ms)           | 4201.0 ms (1033.0 ms)         | 1268.0 ms    | -43.2%               | -31.5% [-98.6%, -15.6%]      | **flagged**     |
| mi-hard-supplied-126x           | 7763.0 ms (926.0 ms)           | 10916.0 ms (772.0 ms)         | 3153.0 ms    | -40.6%               | -51.1% [-61.8%, -32.0%]      | **flagged**     |
| mi-hard-supplied-609x           | 2819.0 ms (348.0 ms)           | 3788.0 ms (1110.0 ms)         | 969.0 ms     | -34.4%               | -28.9% [-58.2%, -4.9%]       | **flagged**     |
| mi-hard-supplied-13x            | 5492.0 ms (798.0 ms)           | 7528.0 ms (1188.0 ms)         | 2036.0 ms    | -37.1%               | -39.3% [-78.1%, -18.0%]      | no              |
| mi-fallback-unknown-high-period | 7680.0 ms (929.0 ms)           | 6501.0 ms (1092.0 ms)         | -1179.0 ms   | 15.4%                | 12.9% [-6.0%, 35.3%]         | no              |
| mi-fallback-weak-attraction     | 18771.0 ms (596.0 ms)          | 24356.0 ms (1212.0 ms)        | 5585.0 ms    | -29.8%               | -34.3% [-44.7%, -26.6%]      | **flagged**     |
| mi-fallback-ambiguous-boundary  | 894.0 ms (70.0 ms)             | 659.0 ms (196.0 ms)           | -235.0 ms    | 26.3%                | 25.5% [9.4%, 36.1%]          | no              |
| mi-fallback-budget-exhaustion   | 10835.0 ms (1295.0 ms)         | 16443.0 ms (1681.0 ms)        | 5608.0 ms    | -51.8%               | -43.8% [-68.7%, -38.6%]      | **flagged**     |
| mi-scale-6mx-basilica-rim       | 7123.0 ms (1095.0 ms)          | 5697.0 ms (760.0 ms)          | -1426.0 ms   | 20.0%                | 16.9% [5.0%, 21.6%]          | no              |

### Confounds (read before quoting any number above)

- **Era mismatch (documented, not removable here):** the baseline build predates the renderer-path bundle (MessageChannel yields, zero-copy transfer, packed output, center-out band order) and PR 4. The end-to-end wall column therefore measures PR 2 **plus** every later renderer-path improvement — it is an upper bound on B's end-to-end contribution, not an isolation of it.
- **Classifier column semantics:** `classifyMs` is each build's own stable-pass classification wall (tiled job wall from dispatch to last band, yields subtracted). Both builds use the same 4-worker pool shape, but scheduling/transfer improvements sit inside the current arm's number, so this column is directional corroboration, not a single-threaded kernel measurement. The single-threaded classifier evidence remains `poc/performance/results/pr2/pr2-microbench.json` (hard anchor −0.3%, full-set −5.0%: no ≥10% classifier win in Node).
- **View driving:** both arms reach corpus views through the same synthetic pointer chains (region-select + pan over the real UI). The planner replicates the application viewport math exactly (unit-pinned) and every sample records the achieved viewport (exact hook readback on the current arm; 9-digit readout + magnification on the baseline arm). Chain landing precision is binary64-level on the current arm; the baseline readout verifies to display precision.
- **No `?view=` on the baseline:** the pre-PR-2 build has no benchmark parameters, so corpus views are UI-driven on both arms; the corpus decimal strings are honored through the planner targets, not through URL parameters.

### Scope and honesty notes

- Cold/warm: repetition 0 is cold (fresh browser context per arm; the browser process is shared, so process-level code caches are not cold). Repetitions 1+ re-navigate one persistent page (warm).
- Stalls: a sample whose stable frame did not arrive within 3 min was retried once in a fresh context and marked `retriedAfterStall` (firefox: 1 retried).
- Cancellation interactions, cache/replay/recolor distributions, and catalog shard states are out of scope for this pass.
- markWallMs ends at the same rAF callback as the trace requestToPresentMs; it is not proof of physical paint (plan §8).
- The RGBA hash is a palette-inclusive proxy; cross-build hash mismatches are expected on interior/boundary-heavy views (PR 3 verifier reductions + PR 5 period-policy display landed between the arms) and are enumerated in semantic-comparison.json.
- 22 repetitions (21 warm pairs) in branded stable browsers, headed, on the declared target hardware: the plan §9 release protocol, with 95% BCa paired intervals (10000 resamples, seed 20261015).
