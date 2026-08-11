# Mandelbrot Interiority

An interactive atlas of the Mandelbrot set's interior.

Most Mandelbrot viewers emphasize escape-time coloring and ever-deeper zooms. This project takes a deliberately different path: bounded navigation, mathematically meaningful interior coloring, honest uncertainty, and a small catalog of named hyperbolic components.

The first release will focus on:

- multiplier coordinates inside detected attracting components;
- intrinsic stability, using the per-iterate exponent `κ = -log|λ| / p`;
- period as a secondary structural view;
- a precise inspector that separates the computed outcome from the evidence supporting it;
- a small, reproducibly generated catalog with internal and angled addresses; and
- smooth interaction with rendering and numerical work kept off the main UI thread.

Significant Curves, Sharkovsky-order overlays, perturbation rendering, and renormalization coordinates remain research extensions. The architecture will preserve room for them without making the first release carry their complexity.

## Design principles

- **Interiority first.** The inside of the set is the subject, not empty space behind an escape-time image.
- **Bounded on purpose.** The useful zoom range is a product constraint to be measured, documented, and tested.
- **Meaning before decoration.** Colors represent declared mathematical quantities and always have a legend.
- **Evidence is explicit.** `attracting-cycle`, `escaped`, and `unresolved` are outcomes; CPU, GPU, analytic, and catalog checks are evidence.
- **Canonical parameters stay canonical.** Coordinate systems are chart layers around the Mandelbrot parameter `c`, never replacements for it.
- **Measure before adding machinery.** Phase 0 selected Worker CPU; WebGPU and perturbation have explicit reconsideration gates rather than speculative production implementations.
- **Small, reproducible data.** The initial catalog is generated and validated by this project rather than copied from a large externally published database.

## Technical direction

The initial implementation is a Vite-based, strict TypeScript application with vanilla DOM/CSS. Orbit classification, palette mapping, and raster production run in a worker behind a renderer-neutral protocol; the main thread handles interaction, accessibility, and presentation. Phase 0 selected the Worker CPU renderer and a `6,000,000×` supported product ceiling. Direct WebGPU is deferred until it is enabled by default in stable Firefox across every supported desktop platform and it passes the numerical and fallback gates in [ADR 0002](docs/decisions/0002-phase-0-renderer-zoom-and-gpu-gate.md). Production perturbation remains a separately gated research extension.

The orbit engine will consume canonical complex parameters. Pixel-to-parameter and other coordinate conversions will live at an isolated chart boundary, leaving a clean seam for later experiments with multiplier, Böttcher, or straightening coordinates.

See [the project plan](docs/PLAN.md), [the research notes](docs/RESEARCH.md), [the implementation guide](docs/IMPLEMENTATION.md), [the Phase 0/1 closeout evidence](docs/verification/PHASE-0-1-CLOSEOUT.md), and [the SysML v2 system model](model/README.md).

## Run locally

Node.js 24.18.0 LTS and npm 11 are required.

```sh
npm ci
npm run dev
```

Run `npm run check` before submitting a pull request. It checks formatting, linting, strict TypeScript, the independently generated component catalog, unit tests, and the production build.

## Status

Phase 0 is closed. The first worker-rendered vertical slice is implemented: progressive CPU rendering, bounded pan and zoom through `6,000,000×`, stability/multiplier/period views, an evidence-aware inspector, and an eleven-component low-period catalog. Direct WebGPU and perturbation are intentionally deferred rather than missing Phase 0 work.

Application code and documentation are licensed under GPL-3.0-only. Independently generated catalog data and numerical fixtures are dedicated to the public domain under CC0-1.0. External catalog data will not be imported without an explicit compatible data license.
