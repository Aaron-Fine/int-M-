# Optimization tournament — timing pass (2026-10-11, base d641b8e)

**Evidence tier:** directional Node evidence, serial CPU renderer, local laptop (other desktop load present);
not the release protocol. Browser evidence must come from CI / Stage A.

Each candidate was implemented behind a default-off option in its own worktree branch (based on `d641b8e`), passed the
judge's parity gate (`tools/benchmark/judge`), and was then timed by `npm run tournament -- perf` strictly sequentially:
7 paired ABBA repetitions per case, all 13 corpus cases, 512x384, candidate vs the same worktree's flag-off baseline.
Raw logs are in this directory (`<candidate>.log`, `progress.log`).

| Candidate       | Parity policy                                            | Geomean speedup [95% CI] | Worst case             | Cases >3% slower |
| --------------- | -------------------------------------------------------- | ------------------------ | ---------------------- | ---------------- |
| triggered-scan  | semantic-revision (λ tol 1e-4, set after a first run)    | 3.515x [3.419, 3.577]    | 0.981 (period2-bulb)   | 0                |
| staggered-lag   | semantic-revision (λ tol 1e-4, set after a first run)    | 3.132x [3.003, 3.203]    | 0.943 (exterior-heavy) | 2                |
| interleave-2    | bit-identical                                            | 1.484x [1.451, 1.504]    | 1.110 (exterior-heavy) | 0                |
| ring-wrap       | bit-identical                                            | 1.349x [1.341, 1.370]    | 0.767 (exterior-heavy) | 1                |
| coordinate-prep | bit-identical                                            | 1.068x [1.058, 1.072]    | 0.993 (126x)           | 0                |
| smooth-log2     | bit-identical (smoothing rel tol 1e-12)                  | 0.994x [0.967, 1.025]    | 0.923                  | 1                |
| early-accept    | semantic-revision with certificates (14,554 conversions) | 0.959x [0.942, 0.989]    | 0.645 (main-cardioid)  | 8                |
| v2-prefix-cache | bit-identical                                            | 0.947x [0.943, 0.950]    | 0.923                  | 10               |

Withdrawn before implementation: `neighbor-lag-order` (under exact parity a neighbor hint can only reorder lag tests the
baseline already stops at the smallest accepted lag, so the saving is zero or negative).

## Findings

- The lag scan (up to `maxPeriod` comparisons per iteration with modulo indexing) is the dominant cost: reducing how
  often it runs (triggered/staggered) gives 2.2–7.9x on hard and fallback views.
- early-accept loses on time because its trigger wastes certification attempts near |λ| → 1, but it is 2.04x on the
  weak-attraction case and converts 14,554 budget-unresolved pixels with certificates; rebuilding its trigger on the
  triggered-scan convergence gate is the natural next experiment.
- The cross-run comparison of each worktree's flag-off baseline with the canonical baseline run is inconclusive: the
  canonical and smooth-log2 runs (the first ~40 minutes) were ~20% slower than all later runs, consistent with machine
  load drift. Default-path regressions must be checked in-tree after merging. The paired within-run ratios above are
  not affected by that drift.
- triggered-scan and staggered-lag change λ by up to ~3e-5 and iteration counts at acceptance (a semantic revision),
  and their end-of-budget safety windows are empirical (0 lost acceptances on the corpus), not proved.
