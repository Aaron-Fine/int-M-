# Renderer-path efficiency bundle — paired evidence (directional)

Build under test: the renderer-path bundle at commit `1552c24` (production bundle via `vite build` + `vite preview`), driven through the real application UI by `tools/benchmark/run-renderer-path.mjs`. Wall metric: stable-frame `requestToPresentMs` (plan §8); `t50RowsMs` derives from per-band completion elapsed (`bandsElapsedMs`, band-boundary observability). Engine: Playwright automation-bundled headless Chromium — **directional only**, not release evidence per plan §9 (branded stable browsers, headed, declared target hardware, ≥21 reps with BCa intervals).

Every sample of every detail is stored raw in `raw-observations.json` (`runsByDetail`); aggregates below are derived views. All details used 9 paired repetitions on the same 4-case subset (2 easy + 2 hard), `classifierMode=legacy-scan` fixed for every arm, arm/dist order alternating per repetition, cold rep 0 excluded from medians.

Provenance of each detail (intermediate builds were measured on working trees whose content is pinned by their milestone commits; the `?`-toggle arms make each pairing reproducible from the named commit):

| Detail                     | Build                                                                           | Pairing                                                                    |
| -------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `m1-center-out-pure-order` | M1 working tree (pre-hybrid order; superseded)                                  | `?bandOrder=center-out` (pure center-out all waves) vs `?bandOrder=legacy` |
| `m1-center-out`            | same build, shipped hybrid order (center-out first wave, row-ordered remainder) | default order vs `?bandOrder=legacy`                                       |
| `m2-yield`                 | M2 commit `09efabd`                                                             | `?yieldMechanism=message-channel` vs `?yieldMechanism=timeout`             |
| `m3-zero-copy-packed`      | M3 commit `837695b`                                                             | default zero-copy packed output vs `?frameOutput=legacy-merge`             |
| `m4-bundle-vs-baseline`    | bundle `1552c24` vs baseline build `6855809`                                    | whole-build paired comparison (two preview servers, alternating per rep)   |

## M1 first pass — pure center-out dispatch order (superseded design)

| Case                    | candidate median | baseline median | Δ      | t50-rows cand → base | yieldWait cand → base | cap max(5%, 20 ms) |
| ----------------------- | ---------------- | --------------- | ------ | -------------------- | --------------------- | ------------------ |
| mi-easy-default-full    | 363.6            | 372.5           | -8.9   | 77.8 → 144.2         | — → —                 | ok                 |
| mi-easy-exterior-heavy  | 169.4            | 171.5           | -2.1   | 27.8 → 49.8          | — → —                 | ok                 |
| mi-hard-rabbit-boundary | 4246.8           | 3329.1          | 917.7  | 813.9 → 1527.6       | — → —                 | **FLAGGED**        |
| mi-hard-supplied-126x   | 7117.2           | 7536.0          | -418.8 | 1662.5 → 3875.5      | — → —                 | ok                 |

**Honest finding:** the pure center-out order deferred expensive periphery bands behind the dispatch queue on the periphery-heavy `mi-hard-rabbit-boundary`: the paired median regressed beyond the cap (+918 ms). This motivated the shipped hybrid order below — first wave center-out, remainder in row order — which keeps the t50 win without the tail cost. The superseded run is retained as raw data.

## M1 gate — center-out first-wave scheduling (shipped design)

| Case                    | candidate median | baseline median | Δ      | t50-rows cand → base | yieldWait cand → base | cap max(5%, 20 ms) |
| ----------------------- | ---------------- | --------------- | ------ | -------------------- | --------------------- | ------------------ |
| mi-easy-default-full    | 387.0            | 403.6           | -16.7  | 84.1 → 159.9         | — → —                 | ok                 |
| mi-easy-exterior-heavy  | 179.4            | 180.2           | -0.9   | 28.8 → 54.3          | — → —                 | ok                 |
| mi-hard-rabbit-boundary | 3295.9           | 4145.0          | -849.1 | 785.7 → 2127.1       | — → —                 | ok                 |
| mi-hard-supplied-126x   | 8057.7           | 7821.2          | 236.5  | 1901.2 → 3775.1      | — → —                 | ok                 |

Gate result: t50-rows improves 47–63% on every case with no throughput cost (all Δ within the cap; worst Δ +3.0% on `mi-hard-supplied-126x`, under the 5% arm of the cap). Cancellation semantics and semantic results unchanged (paired RGBA hashes identical).

## M2 gate — MessageChannel port yields vs nested setTimeout(0)

| Case                    | candidate median | baseline median | Δ      | t50-rows cand → base | yieldWait cand → base | cap max(5%, 20 ms) |
| ----------------------- | ---------------- | --------------- | ------ | -------------------- | --------------------- | ------------------ |
| mi-easy-default-full    | 343.9            | 381.2           | -37.3  | 78.2 → 70.6          | 2.4 → 2.0             | ok                 |
| mi-easy-exterior-heavy  | 162.2            | 196.4           | -34.2  | 29.4 → 34.2          | 4.1 → 4.1             | ok                 |
| mi-hard-rabbit-boundary | 2795.0           | 2951.5          | -156.5 | 657.5 → 734.9        | 1.4 → 1.3             | ok                 |
| mi-hard-supplied-126x   | 5843.7           | 6276.3          | -432.6 | 1315.3 → 1558.3      | 3.2 → 63.3            | ok                 |

Gate result: stable wall improves on every case (−37 to −433 ms median); on the yield-dense Detailed profile the per-frame suspended-at-yield time (`yieldWaitMs` = the bandElapsed−bandCompute yield budget) drops 63.3 → 3.2 ms — the HTML 4 ms nested-timer clamp (plan §12) was the dominant yield cost. Cancel-to-child-quiescence through the real tile handler (`cancel-quiescence-node.json`, Node, directional): both mechanisms ~1.2 ms median with zero post-cancel results; browser clamp magnitudes per hop (4.1 → 0.1 ms) are established in `poc/performance/browser/results/yield-ab.json`.

## M3 gate — zero-copy packed output vs legacy-merge arm (same build)

| Case                    | candidate median | baseline median | Δ      | t50-rows cand → base | yieldWait cand → base | cap max(5%, 20 ms) |
| ----------------------- | ---------------- | --------------- | ------ | -------------------- | --------------------- | ------------------ |
| mi-easy-default-full    | 413.4            | 421.5           | -8.1   | 91.2 → 93.0          | 2.7 → 3.4             | ok                 |
| mi-easy-exterior-heavy  | 162.6            | 175.9           | -13.3  | 29.2 → 29.0          | 3.5 → 4.0             | ok                 |
| mi-hard-rabbit-boundary | 2435.2           | 2572.8          | -137.5 | 568.9 → 615.5        | 1.3 → 1.4             | ok                 |
| mi-hard-supplied-126x   | 5610.7           | 5548.8          | 62.0   | 1301.5 → 1298.8      | 2.8 → 3.2             | ok                 |

Gate result: `mergeCpuMs` 0.1 ms (legacy-merge) → 0.000 ms (zero-copy); stable wall better or equal on 3 of 4 cases, worst Δ +62 ms (+1.1%) on `mi-hard-supplied-126x` — within the cap. Semantic hashes byte-identical across arms: the packed layout (`poc-packed-1.0.0`) decodes to exactly the baseline RGBA.

## M4 gate — bundled build (`1552c24`) vs baseline build (`6855809`)

| Case                    | bundled median | baseline median | Δ                | t50-rows bundled (baseline uninstrumented) | cap max(5%, 20 ms) |
| ----------------------- | -------------- | --------------- | ---------------- | ------------------------------------------ | ------------------ |
| mi-easy-default-full    | 354.2          | 424.8           | -70.7 (-16.6%)   | 81.5 (—)                                   | ok                 |
| mi-easy-exterior-heavy  | 145.0          | 222.1           | -77.1 (-34.7%)   | 29.5 (—)                                   | ok                 |
| mi-hard-rabbit-boundary | 2254.4         | 2477.7          | -223.3 (-9.0%)   | 495.0 (—)                                  | ok                 |
| mi-hard-supplied-126x   | 5233.4         | 7218.5          | -1985.2 (-27.5%) | 1293.6 (—)                                 | ok                 |

Gate result: the bundle improves every measured case (−3% to −28%), with **zero** per-case regressions beyond the cap on this pass, and the stable canvas RGBA hash is **identical between the two builds on all 72 paired samples** (semantic results, including the packed-layout decode, are unchanged). The baseline build predates band observability, so baseline t50/yieldWait are absent (`—`); the M1/M2 in-bundle arms quantify those details. An earlier paired pass of the same cases measured `mi-hard-rabbit-boundary` beyond the cap (+196 ms median) before a harness defect was fixed (the baseline server was serving the bundled bundle, making that pass invalid); the invalid run was replaced in full in `raw-observations.json` and is not cited. Cross-run variance on hard cases is large (rabbit-boundary medians ranged 2.3–4.3 s across runs); release-gate decisions need the plan §9 protocol (21+ reps, branded browsers, declared hardware).

## Scope and honesty notes

- Automation-bundled headless Chromium via Playwright: directional screening evidence, not the release protocol of plan §9.
- Cold/warm: repetition 0 is cold (fresh context per arm); repetitions 1+ re-navigate one persistent page (warm). Medians are warm.
- Cancellation interactions and cache/replay/recolor distributions are covered by unit/e2e tests (green) and remain out of scope of these paired wall-metric runs.
- The RGBA hash is a palette-inclusive proxy; byte-identity across arms/builds here is the strongest semantic statement the ring supports.
- Hard-case medians vary run-to-run on this shared laptop (thermal/load); per-case cap evaluation is within-run paired, as reported.
