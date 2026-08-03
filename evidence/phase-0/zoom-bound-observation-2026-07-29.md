# CPU renderer zoom-bound observation

- Observed: 2026-07-29
- Environment: Microsoft Edge on the Cloudflare Pages PR preview
- Interior view: Stability
- Quality profile: Detailed
- Observed magnification: `5.42e6×`
- Observed center: approximately `-0.148858861 + 1.02595154i`
- Proposed supported ceiling: `6.00e6×`

At approximately `5.42e6×`, the rendered structure was still recognizable but
the result appeared to be at the practical edge of useful detail for the
current CPU renderer and its finite iteration, period, resolution, and
classification budgets. The displayed stable frame is direct product-use
evidence for choosing a nearby, memorable preliminary ceiling of
`6,000,000×`.

This observation does not identify binary64 coordinate spacing as the limiting
factor. With the default vertical span of `2.5`, the selected ceiling
corresponds to a vertical span of approximately `4.17e-7`. At the roughly
660-pixel-tall raster in the observation, that is approximately `6.31e-10`
complex-plane units per pixel, still far larger than binary64 spacing near the
observed coordinates.

The practical limit instead covers the complete numerical path: finite
iteration and period searches, fixed cycle tolerances, accumulated orbit
error, raster sampling density, and render latency. The application therefore
describes the ceiling as reliable for the **current renderer and numerical
budget**, rather than as a fundamental floating-point limit.

## Limitations and follow-up

- This is a qualitative observation, not a timed benchmark.
- The exact PR preview commit was not recorded in the browser capture.
- It does not replace target-device CPU timing or browser long-task evidence.
- It does not compare direct WebGPU or perturbation renderers.
- The ceiling may be revised if a later renderer and verification strategy
  demonstrates reliable semantics beyond it.

The code derives its minimum viewport span from the named
`MAX_MAGNIFICATION = 6_000_000` domain constant. Unit tests verify the
derivation and clamp, while Playwright verifies the visible deep-zoom feedback
in both supported browser engines.
