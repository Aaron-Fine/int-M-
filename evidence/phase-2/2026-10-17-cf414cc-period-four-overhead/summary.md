# Period-4 fallback overhead and hard-view gain — 2026-10-17 @ cf414cc

Workstream H gate (plan §5): `fallback ≤5%`. Does the certified period-4 path
([ADR 0013](../../../docs/decisions/0013-analytic-period-four.md)) slow the
views it never answers, and how much faster are the views it does answer?

- **Label:** directional (Node v24, one laptop, no browser).
- **Arms**, interleaved in one process, order rotating every repetition:
  `baseline` (`30af42c`, kernels with the period-3 path and without the
  period-4 path), `control` (a byte copy of the baseline bundle: an A/A arm
  for position and JIT noise), `candidate` (`cf414cc`; the bundle was built at
  the branch head, which differs from `cf414cc` only in tests, fixtures,
  evidence and docs). Every arm first classifies the whole corpus at 256×160
  so its JIT state carries feedback from every path.
- **Statistic:** overhead = 1/ratio − 1 for the paired median log-ratio, 95%
  BCa interval, 10,000 resamples, seed 20261016
  (`tools/benchmark/harness/stats.ts`). Speedup = 1/(1 + overhead).
- `taskset -c 5`; 1-minute load average at the start of each kept run: 1.28
  (stable), 0.50 (coarse), 0.85 (hard views).

## The gate: stable pass, 1024×640, 60 repetitions

| Case                           | Baseline median ms | Candidate overhead [95% BCa] | Control (A/A) | Result |
| ------------------------------ | -----------------: | ---------------------------- | ------------- | ------ |
| mi-easy-exterior-heavy         |              33.91 | 0.06% [-0.61%, 0.51%]        | -0.91%        | PASS   |
| mi-fallback-ambiguous-boundary |             105.90 | -0.43% [-0.69%, -0.14%]      | -0.11%        | PASS   |

Both cases are within the 5% limit with a quiet control arm (|A/A| ≤ 2%).

A first stable run, on core 3 at load 1.24, was discarded: its control arm
read +18.58% on `mi-easy-exterior-heavy` (the bimodal compile of ADR 0010
landing in the byte-identical control copy; the candidate read 0.12%
[-0.51%, 1.29%] and `mi-fallback-ambiguous-boundary` -0.52% with control
1.04%). The kept run is the rerun on core 5.

## The coarse pass: stride 8, 4096×2560, 40 repetitions

| Case                           | Baseline median ms | Candidate overhead [95% BCa] | Control (A/A) | Result |
| ------------------------------ | -----------------: | ---------------------------- | ------------- | ------ |
| mi-easy-exterior-heavy         |              98.97 | -0.44% [-0.99%, 0.31%]       | -0.35%        | PASS   |
| mi-fallback-ambiguous-boundary |             115.26 | -0.40% [-0.94%, 0.28%]       | -0.50%        | PASS   |

The scalar kernel inlines `inPeriodFourGate` beside `inPeriodThreeGate`; at
this raster it classifies 163,840 pixels per repetition.

An earlier coarse run started at load 1.61 (above the 1.5 limit) and was
discarded for the load (candidate -0.40% and 0.22%, both PASS); the
kept run started at load 0.50.

## The gain: stable pass, 1024×640, 15 repetitions

| Case                      | Baseline median ms | Candidate overhead [95% BCa] | Speedup | Spike (Node, scalar, 256×160) |
| ------------------------- | -----------------: | ---------------------------- | ------: | ----------------------------: |
| mi-hard-supplied-126x     |             424.99 | -41.82% [-42.50%, -41.49%]   |   1.72× |                         1.79× |
| mi-hard-supplied-13x      |             322.70 | -40.73% [-41.71%, -37.83%]   |   1.69× |                         1.68× |
| mi-hard-supplied-609x     |             179.56 | -29.56% [-30.56%, -24.19%]   |   1.42× |                         1.38× |
| mi-scale-6mx-basilica-rim |             821.19 | -86.05% [-86.50%, -85.29%]   |   7.17× |                          8.4× |
| mi-easy-default-full      |              61.98 | -3.02% [-4.22%, 11.70%]      |   1.03× |                         1.10× |

Control (A/A) on these runs: -0.17%, 0.34%, 0.82%, 0.72%, -0.69%. The
default view's interval is wide and includes zero; its speedup is not
established by this run.

The spike's column is its period-3-plus-period-4 prototype against production
of the time; these four hard views have no period-3 pixels, so the comparison
is like for like. The 6,000,000× view also resolves completely (Task 10).

## Limits

- Node only; the browser release run in both browsers is deferred to the
  owner's screen session.
- The far-exterior stable pass is bimodal in V8 (ADR 0010); runs whose A/A
  control moved by more than 2% were discarded and rerun.
- `raw-observations.json` holds the three kept runs as the tool wrote them,
  every sample included. The two discarded runs are described above and not
  kept.
