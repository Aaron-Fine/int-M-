# Analytic-path overhead gate, Chromium only, cloud container — 2026-11-25 @ 7d0d4d5

A partial, directional rerun of the gate of
[ADR 0010](../../../docs/decisions/0010-analytic-period-three.md) (amendment of
2026-10-21), following the
[2026-10-21 record](../2026-10-21-f97dd6a-browser-overhead-gate/summary.md).

**This record does not satisfy the gate.** It is Chromium only (no Firefox was
available), the Chromium is not the revision the pinned Playwright bundles, the
machine was a shared cloud container under load, and the 21-repetition runs
did not resolve 5% there (see Noise). Result in one line: the three gate views
came out at or below +5% in the two 63-repetition runs, and above +5% on
`mi-fallback-ambiguous-boundary` in three of the five 21-repetition runs; a
build compared with itself moved by as much.

## Is the rerun due?

By the triggers the TODO item and the ADR name, **no**:

- **Kernel code: unchanged.** Every source file in the benchmark bundle has
  the same git blob at `f97dd6a` and `7d0d4d5`: `src/render/triggered-rows.ts`
  (`TriggeredRowKernel.classifyRow`), `src/domain/orbit-triggered.ts`
  (`classifyTriggeredOrbitInto`), `src/domain/analytic-period-three.ts`
  (`classifyGatedAnalyticInto`), `analytic-period-four.ts`,
  `analytic-gate-windows.ts`, `orbit.ts`, `verifier.ts`, `types.ts`,
  `period-three-gate.ts`, `period-four-gate.ts`, `src/render/classify-rows.ts`,
  `row-bands.ts`, `yield-policy.ts`, `packed-semantic.ts`,
  `render-cancelled-error.ts`, and the tool, its entry and the corpus.
  `git diff f97dd6a 7d0d4d5` touches none of them.
- **The bundle differs only in dead module constants.** The two bundles built
  from `tools/benchmark/cold-worker-entry.ts` differ in 17 added unminified
  lines ([bundle-diff-f97dd6a-vs-head.txt](bundle-diff-f97dd6a-vs-head.txt)): one
  new field of an unused frozen object and two new unused frozen arrays (the
  multiplier contour levels of `src/domain/semantic.ts`), which the bundler
  keeps because `Object.freeze` is a side effect. They run once at worker
  start, before the timed section, and no function body differs. Output hashes
  are identical between the two builds on all eight views.
- **Pinned engines: unchanged.** `package-lock.json` is the same blob;
  `package.json` gained two script lines only. `@playwright/test` is 1.64.1 at
  both commits (bundled Chromium 156.0.8078.4, Firefox 157.0).

The item stays open as a pre-release step. This run was made anyway because a
Chromium newer than the bundled one was at hand.

## Setup

- **Label:** directional. Chrome for Testing 158.0.8127.36 (Playwright
  revision 1243, a different revision from the 1248 / 156.0.8078.4 that the
  pinned Playwright 1.64.1 bundles), headless, `--no-sandbox`. Two binaries of
  that build: `chrome-headless-shell` (what Playwright's headless launch uses
  by default; files `chromium-headless-shell-*`) and full `chrome` in headless
  mode (files `chromium-*`). Node v24.22.3; shared cloud container, 4 vCPUs
  (Intel Xeon 2.10 GHz); 1024×640; 4 workers, 8 bands per worker;
  cross-origin isolated; arms interleaved with rotating order.
- **Load:** the ADR asks for a 1-minute load below 1.0 at the start of each
  run. Only the first run met it (0.88). The others started at 5.5 to 9.5
  (recorded in each JSON as `load`): the runs were back to back, each loading
  all four vCPUs, and other work shared the container.
- **Arms:** `cand` = `7d0d4d5` from `git archive`; `none` = the same tree with
  [no-analytic-variant.diff](no-analytic-variant.diff) applied (the 2026-10-21
  patch, unchanged; it applies cleanly); `base` = `f97dd6a`; `control` /
  `same` = a second copy of the `cand` bundle. Bundles built as in the
  2026-10-21 record ([bundle-sha256.txt](bundle-sha256.txt)).
- **Tool:** `tools/benchmark/cold-workers.ts` hard-codes
  `launch({ headless: true })` and cannot take a browser path. The runs used a
  scratch copy with one line changed
  ([executable-path-wrapper.diff](executable-path-wrapper.diff)); the tracked
  tool is untouched.
- **Statistic:** as on 2026-10-21, the paired median of the per-repetition
  stable-pass wall-time ratio and a 95% percentile bootstrap interval of that
  median (5,000 resamples, seed 1), computed by [bootstrap.mjs](bootstrap.mjs)
  ([bootstrap-output.txt](bootstrap-output.txt)). The generator is this
  script's own, so intervals are not bit-comparable with the 2026-10-21 ones.

## Gate views: current against no-analytic

Rule: paired median at most +5% on each of the three views, in both bundled
engines, 21 repetitions, load below 1.0.

21 repetitions, the ADR's form (runs in the order made):

| Run                             | Start load | `mi-easy-default-full` | `mi-easy-exterior-heavy`  | `mi-fallback-ambiguous-boundary` |
| ------------------------------- | ---------: | ---------------------- | ------------------------- | -------------------------------- |
| headless shell, run 1           |       0.88 | −16.3% [−22.1%, −5.3%] | **+5.3%** [−8.8%, +15.7%] | **+7.0%** [+1.4%, +14.4%]        |
| chrome, run 1                   |       6.89 | −9.3% [−12.8%, −0.9%]  | +2.2% [−3.4%, +6.9%]      | +2.6% [−1.5%, +8.3%]             |
| headless shell, run 2           |       6.87 | −6.4% [−15.0%, +0.4%]  | −8.6% [−15.9%, −3.8%]     | **+13.8%** [+1.2%, +18.2%]       |
| chrome, run 2                   |       7.19 | −7.0% [−16.2%, +2.4%]  | +2.2% [−5.8%, +5.7%]      | **+6.5%** [−0.1%, +10.0%]        |
| headless shell, run 3 (3 views) |       7.09 | −4.8% [−11.2%, −1.7%]  | +0.1% [−7.1%, +8.7%]      | +0.7% [−4.0%, +3.7%]             |

63 repetitions, three arms in one run (`none`, `cand`, and `control`, a second
copy of the `cand` bundle; not the ADR's form):

| Run            | Start load | Arm     | `mi-easy-default-full` | `mi-easy-exterior-heavy` | `mi-fallback-ambiguous-boundary` |
| -------------- | ---------: | ------- | ---------------------- | ------------------------ | -------------------------------- |
| headless shell |       5.49 | cand    | −8.8% [−13.9%, −6.4%]  | −4.2% [−10.5%, +6.3%]    | +4.5% [+1.1%, +9.2%]             |
| headless shell |       5.49 | control | −9.5% [−14.5%, −3.9%]  | −2.4% [−9.6%, +2.5%]     | +2.4% [−0.5%, +7.3%]             |
| chrome         |       9.46 | cand    | −11.2% [−16.2%, −8.7%] | +3.4% [−0.4%, +6.8%]     | +3.7% [+2.2%, +7.4%]             |
| chrome         |       9.46 | control | −12.5% [−16.3%, −9.9%] | +3.7% [−2.0%, +7.4%]     | +2.3% [−1.9%, +5.0%]             |

Reading, against the rule:

- `mi-easy-default-full`: at most +5% in all seven runs (−4.8% to −16.3%).
- `mi-easy-exterior-heavy`: at most +5% in six of seven runs; +5.3% in the
  one run that started below load 1.0, with an interval of [−8.8%, +15.7%].
- `mi-fallback-ambiguous-boundary`: above +5% in three of the five
  21-repetition runs (+7.0%, +13.8%, +6.5%), at or below in the other two and
  in both 63-repetition runs (+4.5%, +3.7%). All seven estimates are
  positive and four intervals exclude 0, so a real cost of a few percent on
  this view in Chromium 158 is likely; whether it is above or below 5% this
  machine did not settle. On 2026-10-21 Chromium 156 measured +0.9%
  [−4.8%, +3.8%] and Firefox +3.7% [+2.8%, +8.7%] on the same kernel code.

**Verdict: no pass and no fail recorded.** Taken by the letter (21
repetitions), the runs disagree with each other. The kernel sources are those
that passed on 2026-10-21, so any difference from that record comes from the
engine build (158 against 156) or from this machine, and these runs cannot
tell which.

## Noise

- The same bundle against itself, 21 repetitions, headless shell, three views:
  −0.5% [−7.9%, +2.1%], −0.1% [−3.5%, +2.4%], and on ambiguous boundary
  **−6.5% [−9.2%, −2.9%]**: a difference of more than 5% with an interval
  excluding 0 between two copies of one file.
- `f97dd6a` against `7d0d4d5` (no function differs), 21 repetitions, headless
  shell, eight views: −4.5% to +2.6%, intervals up to [−10.2%, +17.4%];
  identical output on all eight views.
- In the 63-repetition runs `cand` and `control` are one bundle and differ by
  up to 2.1 points.
- Medians of one arm moved between runs by 30% or more (the no-analytic
  default view: 119 ms to 171 ms).

## Other views (21 repetitions, two runs per binary)

The views the paths answer are faster with them, as on 2026-10-21:
`mi-fallback-weak-attraction` −83.2% to −84.8%, `mi-scale-6mx-basilica-rim`
−64.5% to −66.8%, `mi-hard-supplied-126x` −12.0% to −17.3%,
`mi-hard-supplied-13x` −12.5% to −19.7%, `mi-hard-rabbit-boundary` −9.6% to
−20.0%. The tool reports "OUTPUT DIFFERS" on the six views the paths answer
and exits 1, as expected; exterior-heavy and ambiguous boundary have identical
output in both arms.

## Not covered

- Firefox, in any build.
- The bundled Chromium 156.0.8078.4 (revision 1248), and a quiet machine.
- The coarse (scalar) pass, which this tool does not time.

## Files

- `chromium-headless-shell-no-analytic-vs-current{,-run2,-run3}.json`,
  `chromium-no-analytic-vs-current{,-run2}.json`: 21-repetition gate runs.
- `chromium-headless-shell-three-arm-63.json`, `chromium-three-arm-63.json`:
  63-repetition runs with the control arm.
- `chromium-headless-shell-control-same-bundle.json`,
  `chromium-headless-shell-f97dd6a-vs-current.json`: noise controls.
- `bootstrap.mjs`, `bootstrap-output.txt`: the statistic and its output.
- `no-analytic-variant.diff`, `executable-path-wrapper.diff`,
  `bundle-diff-f97dd6a-vs-head.txt`, `bundle-sha256.txt`.
- `manifest.sha256`: SHA-256 of every other file in this folder.

The raw JSON records the arm bundles' scratchpad paths; the bundles were not
kept.
