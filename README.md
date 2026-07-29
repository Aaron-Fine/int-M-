# int-M-

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
- **Evidence is explicit.** `interior`, `escaped`, and `unresolved` are outcomes; CPU, GPU, analytic, and catalog checks are evidence.
- **Canonical parameters stay canonical.** Coordinate systems are chart layers around the Mandelbrot parameter `c`, never replacements for it.
- **Measure before adding machinery.** WebGPU and perturbation are adopted only when small Phase 0 experiments justify their cost.
- **Small, reproducible data.** The initial catalog is generated and validated by this project rather than copied from a large externally published database.

## Technical direction

The application is planned as a TypeScript web project with all rendering and orbit work performed away from the main UI thread. Phase 0 will compare a worker-based CPU renderer, direct WebGPU computation, and a small CPU-reference/GPU-perturbation experiment before the production renderer is selected.

The orbit engine will consume canonical complex parameters. Pixel-to-parameter and other coordinate conversions will live at an isolated chart boundary, leaving a clean seam for later experiments with multiplier, Böttcher, or straightening coordinates.

See [the project plan](docs/PLAN.md) and [the research notes](docs/RESEARCH.md).

## Status

Research and planning. Production implementation has not started.

License selection for the code and project-generated catalog is a Phase 0 decision. External catalog data will not be imported without an explicit compatible data license.
