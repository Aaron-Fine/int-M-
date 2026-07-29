# ADR 0001: Interim CPU renderer and bounded binary64 viewport

- Status: Provisional; does not close the Phase 0 comparison criterion
- Date: 2026-07-29
- Baseline: merge commit `7c991a2`

## Context

Phase 0 requires comparable Worker CPU, direct WebGPU, and perturbation-tile
experiments before selecting the initial production renderer and deriving a
zoom bound. The focused vertical slice currently implements only the Worker CPU
path. A renderer-neutral worker boundary exists, but there are no disposable
WebGPU or perturbation implementations and therefore no comparable results.

The current viewport enforces `spanY` from `4` down to `1e-10`. This is a
deliberate product bound in code and tests, but its numerical margin and target
device performance have not yet been established by the full Phase 0
experiment.

## Interim decision

Continue using the binary64 Worker CPU renderer for the Phase 1 candidate. Keep
the existing viewport bound while it is clearly communicated to the user.
Treat both choices as provisional operational decisions, not as evidence that
the Phase 0 experiment criterion passed.

This choice preserves the smallest coherent implementation:

- numerical classification and colorization remain off the UI thread;
- current Firefox and Chrome share one implementation;
- unresolved remains explicit when a finite budget is exhausted;
- independently generated Decimal fixtures cross-check the binary64
  classifier; and
- the renderer-neutral protocol leaves room for a later measured replacement.

## Available measurement

The repeatable `npm run evidence:cpu` harness measures a 512-pixel full-set
view and a 768-pixel period-three neighborhood. The 2026-07-29 hosted-container
result records median coarse frames of 10.12 ms and 25.89 ms, and stable frames
of 209.91 ms and 2273.69 ms respectively.

Those numbers are diagnostic only. The host exposed nine logical AMD EPYC
cores and did not represent the documented four-core laptop baseline. The Node
harness also cannot establish browser main-thread long-task or presentation
latency.

## Consequences

- Phase 1 implementation can continue without introducing an unmeasured GPU
  architecture.
- Phase 0 remains open under its current exit criteria.
- Closing Phase 0 requires either:
  1. running the direct WebGPU and perturbation experiments under the common
     protocol and recording the target-hardware comparison; or
  2. an explicit approved change to the Phase 0 exit criteria explaining why
     those experiments moved to Phase 3.
- A final zoom bound must state the binary64 precision margin, target-device
  latency, resolution, and quality assumptions that justify it.
