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
- **Measure before adding machinery.** WebGPU and perturbation are adopted only when small Phase 0 experiments justify their cost.
- **Small, reproducible data.** The initial catalog is generated and validated by this project rather than copied from a large externally published database.

## Technical direction

The initial implementation is a Vite-based, strict TypeScript application with vanilla DOM/CSS. Orbit classification, palette mapping, and raster production run in a worker behind a renderer-neutral protocol; the main thread handles interaction, accessibility, and presentation. The worker CPU renderer is the measured baseline while direct WebGPU and perturbation remain explicit Phase 0/Phase 3 experiments.

The orbit engine will consume canonical complex parameters. Pixel-to-parameter and other coordinate conversions will live at an isolated chart boundary, leaving a clean seam for later experiments with multiplier, Böttcher, or straightening coordinates.

See [the project plan](docs/PLAN.md), [the research notes](docs/RESEARCH.md), [the implementation guide](docs/IMPLEMENTATION.md), and [the SysML v2 system model](model/README.md).

## Run locally

Node.js 22 and npm 10 or newer are required.

```sh
npm ci
npm run dev
```

Run `npm run check` before submitting a pull request. It checks formatting, linting, strict TypeScript, the independently generated component catalog, unit tests, and the production build.

## Status

The first worker-rendered vertical slice is implemented: progressive CPU rendering, bounded pan and zoom, stability/multiplier/period views, an evidence-aware inspector, and an eleven-component low-period catalog. Direct WebGPU, perturbation, and the remaining Phase 0 measurements are not yet production features.

Application code and documentation are licensed under GPL-3.0-only. Independently generated catalog data and numerical fixtures are dedicated to the public domain under CC0-1.0. External catalog data will not be imported without an explicit compatible data license.
