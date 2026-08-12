# ADR 0002: Phase 0 renderer, zoom bound, and GPU gate

- Status: Accepted; closes the Phase 0 renderer decision
- Date: 2026-08-11
- Decision baseline: `b663fdf`
- Supersedes: [ADR 0001](0001-interim-renderer-and-zoom.md)

## Context

Phase 0 required measured Worker CPU, direct WebGPU, and perturbation-tile
experiments before selecting the first production renderer and supported zoom
bound. The [target-hardware benchmark](../PHASE0_BENCHMARK.md) supplies those
measurements on the four-core integrated-graphics baseline.

The Worker CPU renderer met the preliminary interaction budgets in stable
Firefox and Chrome. Direct WebGPU was substantially faster in measured Chrome,
but it exceeded the proposed full-set status and period disagreement budgets,
could not preempt submitted work, and was unavailable in stable Firefox on the
measured Linux system. The perturbation tile established feasibility at one
deep location but did not establish the cycle, multiplier, glitch-recovery,
subdivision, or rebasing behavior needed for production use.

The product also has two distinct kinds of bound:

- a **supported product bound**, which includes useful visible detail,
  interaction latency, finite iteration and period budgets, classification
  reliability, and raster density; and
- a **numerical experiment bound**, which shows that one calculation remains
  accurate at one sampled scale but does not promise a useful product view.

Confusing those bounds would turn a successful deep numerical sample into an
unsupported user-facing claim.

## Decision

Use the binary64 Worker CPU renderer as the initial production renderer.

Keep `MAX_MAGNIFICATION = 6_000_000` as the supported product ceiling. The
minimum viewport span remains derived from the default span of `2.5`, giving
`spanY ≈ 4.17e-7`. The `spanY = 1e-8` perturbation comparison is retained as
numerical feasibility evidence only; it does not raise the supported product
ceiling.

Defer direct WebGPU and production perturbation. Neither is required for the
bounded first release.

Preserve the worker-internal semantic boundary:

`OrbitEngine → SemanticTileStore → PaletteMapper → ColorizedFrame`

Only `ColorizedFrame` crosses the worker/UI port. A future GPU renderer must
produce compatible semantic evidence and must not bypass or weaken this
boundary.

## WebGPU production gate

Do not begin productionizing the direct GPU renderer until WebGPU is enabled
by default, without preferences or Nightly builds, in stable Firefox across
all supported desktop platforms: Windows, macOS on supported Intel and Apple
Silicon systems, and Linux.

This is a WebGPU gate, not a WebGL gate. WebGL2 is already broadly available,
but adding a separate GLSL renderer would create another numerical
implementation and lifecycle without removing the direct-`f32` precision or
semantic-agreement problems measured in Phase 0.

Browser-wide availability is necessary but not sufficient. After the platform
gate opens, a production proposal must still demonstrate:

- one shared WebGPU renderer rather than a Firefox-specific engine;
- capability detection and automatic Worker CPU fallback;
- status disagreement no greater than `0.1%` and period disagreement no
  greater than `0.01%` on the declared comparison suite;
- multiplier and stability absolute error no greater than `1e-5` at p95;
- a declared unresolved and CPU-repair policy for uncertain GPU results;
- recovery from adapter rejection, shader failure, allocation failure, and
  device loss;
- truthful cancellation behavior despite non-preemptible submitted GPU work;
- a measured GPU operating range, with automatic CPU selection outside it;
- preservation of the `6,000,000×` product ceiling through CPU fallback; and
- current stable Firefox and Chrome verification on the target hardware class.

The Phase 0 benchmark shader is reusable evidence and a future starting point,
not a production renderer. Once the platform gate opens, the expected work is
moderate to high: extract the shared renderer, integrate semantic frames,
implement fallback and recovery, and then resolve the measured numerical
disagreement. The numerical acceptance work is expected to dominate the
browser-specific work.

Mozilla platform status is tracked in its
[Firefox experimental-features documentation](https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Experimental_features).
The decision should be revisited when that document shows WebGPU enabled by
default on every supported stable desktop Firefox platform.

## Perturbation reconsideration gate

Reconsider production perturbation only when a product requirement cannot be
met within the `6,000,000×` bound using the selected CPU renderer, or when a
separate research feature explicitly requires deeper navigation. A proposal
must include cycle and multiplier semantics, glitch detection and recovery,
tile subdivision, rebasing, high-precision comparison, and bounded memory and
cancellation behavior.

## Consequences

- Phase 0 has one selected production renderer and one supported zoom bound.
- Phase 1 can proceed without maintaining multiple production numerical
  engines.
- Stable Firefox and Chrome retain the same truthful CPU behavior.
- WebGPU availability does not silently change results or supported zoom.
- A future GPU path is additive and capability-gated, with CPU remaining the
  authoritative fallback.
- The `spanY = 1e-8` result remains useful without being misrepresented as a
  `250,000,000×` product promise.
