# int(M)

**An atlas of dynamics inside the Mandelbrot set**

int(M) is a bounded, interactive exploration of the structure that conventional Mandelbrot renderers usually flatten into a black silhouette. It will visualize attracting-cycle periods, multiplier coordinates, convergence behavior, and mathematically meaningful component identifiers.

The name uses the standard notation `int(M)` for the interior of the Mandelbrot set.

## Status

Research and planning. Implementation has intentionally not started.

- [Project plan](docs/PLAN.md)
- [Research notes](docs/RESEARCH.md)

## Project thesis

Most Mandelbrot viewers emphasize exterior coloring or unlimited zoom depth. int(M) instead focuses on the dynamics of hyperbolic components:

- multiplier magnitude and phase as internal coordinates;
- attracting-cycle period and convergence behavior;
- internal and angled internal addresses;
- curated analytic curves and component-ordering overlays;
- explicit distinction between escaped, analytically known, attractor-detected, and unresolved points.

Zoom will be bounded on purpose. The goal is an understandable and trustworthy atlas, not an extreme-zoom benchmark.

## Design principles

1. **Mathematical honesty.** Failure to escape is not automatically classified as interior.
2. **Focused scope.** Prefer a few well-explained views over a general fractal laboratory.
3. **Responsive interaction.** Rendering and numerical work stay off the main UI thread.
4. **Separated concerns.** Orbit calculation, classification, coloring, overlays, and presentation remain independent.
5. **Progressive computation.** Fast GPU estimates may be refined or verified by CPU workers.
6. **Small, readable implementation.** Minimize dependencies and abstractions that do not earn their complexity.

## Planned technology

The application is expected to use TypeScript, Web Workers, Canvas/OffscreenCanvas, and WebGPU where available. A CPU-worker renderer will remain the correctness reference and compatibility fallback.

No implementation choices in these documents are irreversible. The plan identifies validation gates where measurements should decide between alternatives.

## License

No license has been selected yet.
