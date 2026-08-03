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

Direct use of the Cloudflare Pages preview found the practical edge of useful
detail at approximately `5.42e6×` in the Detailed stability view. The
[observation record](../../evidence/phase-0/zoom-bound-observation-2026-07-29.md)
supports a nearby preliminary product ceiling of `6,000,000×`. From the
default vertical span of `2.5`, this derives a minimum `spanY` of approximately
`4.17e-7`.

## Interim decision

Continue using the binary64 Worker CPU renderer for the Phase 1 candidate.
Adopt `6,000,000×` as the preliminary reliability ceiling for that renderer
and its present numerical budgets, and communicate that scope explicitly to
the user. Treat the renderer choice as a provisional operational decision, not
as evidence that the Phase 0 comparison criterion passed.

This choice preserves the smallest coherent implementation:

- numerical classification and colorization remain off the UI thread;
- current Firefox and Chrome share one implementation;
- unresolved remains explicit when a finite budget is exhausted;
- independently generated Decimal fixtures cross-check the binary64
  classifier; and
- the zoom bound reflects observed product behavior without claiming a
  fundamental binary64 limit; and
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
- `MAX_MAGNIFICATION` is the authoritative product limit; the minimum viewport
  span is derived from it and can be revised with later renderer evidence.
- Closing Phase 0 requires either:
  1. running the direct WebGPU and perturbation experiments under the common
     protocol and recording the target-hardware comparison; or
  2. an explicit approved change to the Phase 0 exit criteria explaining why
     those experiments moved to Phase 3.
- Target-device performance runs must still characterize latency, resolution,
  and quality behavior at the preliminary ceiling before finalizing it.
