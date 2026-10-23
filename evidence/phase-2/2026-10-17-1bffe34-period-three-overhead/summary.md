# Period-3 fallback overhead — 2026-10-17 @ 1bffe34

Workstream H gate (plan §5): `fallback ≤5%`. Does the analytic period-3 path
([ADR 0010](../../../docs/decisions/0010-analytic-period-three.md)) slow the
views it never answers?

- **Label:** directional (Node v24, one laptop, no browser).
- **Arms**, interleaved in one process, order rotating every repetition:
  `baseline` (`8c100ed`, kernels without the period-3 path), `control` (a byte
  copy of the baseline bundle: an A/A arm for position and JIT noise),
  `candidate` (`1bffe34`, the period-3 path with the per-row gate window).
  Every arm first classifies the whole corpus at 256×160 so its JIT state
  carries feedback from every path.
- **Cases:** `mi-easy-exterior-heavy` (every pixel escapes within a few
  iterations) and `mi-fallback-ambiguous-boundary` (slow escapers that reach
  the first scanning iteration outside the gate), stable pass, 1024×640,
  60 repetitions after one warmup, `taskset -c 3`, 1-minute load average
  1.02 at start.
- **Statistic:** overhead = 1/ratio − 1 for the paired median log-ratio, 95%
  BCa interval, 10,000 resamples, seed 20261016
  (`tools/benchmark/harness/stats.ts`).
- Command: `node tools/benchmark/fallback-overhead.ts <baseline.js> <candidate.js> --reps 60 --out raw-observations.json`.

| Case                           | Baseline median ms | Candidate overhead [95% BCa] | Control (A/A) | Result |
| ------------------------------ | -----------------: | ---------------------------- | ------------- | ------ |
| mi-easy-exterior-heavy         |              34.95 | −6.90% [−7.55%, −6.30%]      | +0.01%        | PASS   |
| mi-fallback-ambiguous-boundary |              96.34 | +0.65% [+0.10%, +1.06%]      | −0.29%        | PASS   |

Both cases are within the 5% limit with a quiet control arm (|A/A| ≤ 2%).

## History: the first wiring failed this gate

The first wiring (commit `9c1471e`) called `inPeriodThreeGate` from each lane
of the two-lane row kernel. Measured the same way at load 1.81, the
far-exterior view was **+10.76% [+10.25%, +11.45%]** (control −0.22%,
FAIL) although none of its pixels reaches the test. Investigation
(single-arm and three-arm runs, `--trace-turbo-inlining`) found the two
inlined gate calls used up TurboFan's inlining budget for
`TriggeredRowKernel.classifyRow`, leaving a refill call to
`classifyAnalyticInto` out of line. That compile is about 11–15% slower on
the far exterior, and whether a run lands in it depends on compile timing
(bimodal; roughly a third of three-arm runs). The exact CPU-level reason
(the extra time profiles inside the escape smoothing's `log2`) was not
pinned down. Commit `1bffe34` computes the gate once per row as a range on
Re c and tests it inline, with classification bit-identical (golden
fixture, parity tests, 26 corpus-output hashes). The negative overhead on
the far exterior reflects the baseline itself sometimes compiling into the
slower state; the fix removes the period-3 trigger, not V8's behaviour.

## Limits

- Node only; the browser release run in both browsers is deferred to the
  owner's screen session.
- Timing noise on this machine moved the A/A arm by up to ±4% during
  planning; only runs with a quiet control count.
