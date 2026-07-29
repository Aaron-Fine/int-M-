# Research foundation

This document records the mathematical and technical decisions behind `int-M-`. It is not an attempt to survey all Mandelbrot-set research. The filter is practical: does an idea help a small, bounded, interactive atlas explain the interior of the set?

## 1. Product position

Most interactive Mandelbrot software is organized around escape time and zoom depth. The opportunity here is narrower and more distinctive:

- treat attracting dynamics as the primary subject;
- make interior color represent declared mathematical quantities;
- attach human and combinatorial identity to a small number of components;
- distinguish a result from the evidence for that result; and
- stop at an explicit zoom and numerical budget.

The focused first release is therefore:

> multiplier-colored interiors, intrinsic stability, honest uncertainty, a precise inspector, and a small mathematically identified catalog.

Significant Curves, Sharkovsky ordering, perturbation, and renormalization remain compatible research directions, but they do not belong in the initial definition of done.

## 2. Interior quantities worth visualizing

For the quadratic family

`f_c(z) = z² + c`,

suppose a parameter has an attracting cycle of exact period `p`. The multiplier is

`λ = (f_c^p)'(z₀) = ∏(2z_j)`

around that cycle. It provides two immediately useful coordinates:

- `|λ|`, the contraction per full cycle; and
- `arg(λ)`, the rotation accumulated per cycle.

These quantities are preferable to iteration count as primary interior semantics. Iteration count depends strongly on detection thresholds, algorithm, and budget; it remains useful as a diagnostic and cost measure.

### Multiplier coordinates

Within a hyperbolic component, the multiplier map gives a natural internal coordinate. Polar form

`λ = ρ exp(2πiθ)`

separates contraction from angle and maps well to a color legend. This is where polar coordinates genuinely simplify the product: not by writing the global parameter `c` in polar form, but by using polar form in multiplier space.

### Intrinsic stability

Comparing raw `|λ|` across different periods can be misleading because `λ` measures contraction over a full cycle. A period-normalized quantity is

`κ = -log|λ| / p`.

`κ` is the contraction exponent per ordinary iteration:

- it tends to infinity at a superattracting center;
- it tends to zero toward a parabolic boundary; and
- it is comparable across components of different periods.

This makes stability a strong primary or companion view.

The log-multiplier quantity

`g = -log|λ|`

also turns radial multiplication into translation. A punctured component becomes cylinder-like in `(g, θ)`, which may make selected interior relationships easier to inspect.

The Poincaré radius `2 artanh|λ|` can be considered as a display transform for palette spacing near the unit circle. It does not introduce a new semantic field.

## 3. Outcomes, confidence, and evidence

The renderer must not confuse “the algorithm stopped” with “the mathematics is settled.”

A useful result model separates:

```ts
type DynamicsStatus =
  | "escaped"
  | "interior"
  | "attracting-cycle"
  | "unresolved";

type Evidence =
  | "analytic"
  | "gpu-direct"
  | "gpu-perturbation"
  | "cpu-float64"
  | "catalog-validated";
```

Evidence may ultimately be a set of flags because independent checks can agree. Thresholds, residuals, and confidence can accompany it.

“Provisional” should not be a fifth dynamical status. It describes the strength of evidence for a status. An exhausted budget produces `unresolved`, not an invented inside/outside answer.

## 4. Internal and angled addresses

Internal addresses describe the combinatorial route through hyperbolic components. They are useful, compact labels, but an internal address alone need not uniquely distinguish a component.

Angled internal addresses add exact rational rotation data and can distinguish components sharing the same period sequence. Exact angles should be stored as integer numerator/denominator pairs rather than floating-point approximations.

For software identity, the project should assign a stable, version-independent catalog identifier. The mathematical fields then describe the component:

- period;
- internal address;
- angled internal address;
- characteristic parameter-ray pair where known; and
- center parameter with precision and provenance.

Preserving characteristic ray pairs is useful now and also leaves meaningful combinatorial anchors for possible straightening or renormalization experiments later.

Foundational references include Schleicher's work on internal addresses and angled internal addresses:

- Dierk Schleicher, [Internal Addresses in the Mandelbrot Set and Irreducibility of Polynomials](https://arxiv.org/abs/math/9411238)
- Dierk Schleicher, [Internal Addresses of the Mandelbrot Set and Galois Groups of Polynomials](https://arxiv.org/abs/math/9411239)

## 5. A small reproducible catalog

The v1 catalog should contain roughly 6–12 recognizable low-period hyperbolic components. It is part of the first vertical slice, not a later annotation feature: identity is central to the atlas's story.

Catalog centers should be generated independently at high precision. Validation should include:

- a small residual for `f_c^p(0) = 0`;
- exclusion of every proper divisor of `p`;
- repeatable precision and rounding rules;
- independent high-precision golden fixtures;
- exact rational combinatorial data where available; and
- recorded method, source, and schema version.

The catalog should not claim the stronger meaning of “certified” unless its procedure actually establishes that standard.

### External database licensing decision

The period-41 database described by Nicolae Mihalache and François Vigneron is scientifically important, but the available licensing evidence does not authorize redistribution of the data in this project.

- The accompanying [`fvigneron/Mandelbrot`](https://github.com/fvigneron/Mandelbrot) repository uses a BSD-3-Clause-Attribution license whose text applies to the software.
- The [database paper](https://ar5iv.labs.arxiv.org/html/2402.06083) describes scientific availability, but no separate, explicit database-reuse license was identified.
- Database compilations can carry rights distinct from the software that generated them, including the EU sui generis database right described in the [EU summary of Directive 96/9/EC](https://eur-lex.europa.eu/EN/legal-content/summary/legal-protection-databases.html).

The conservative resolution is:

1. do not copy or redistribute that database;
2. do not treat the code license as a license to the data;
3. generate the small v1 catalog independently;
4. retain computation and provenance records; and
5. reconsider external data only if an explicit compatible license is supplied by the rightsholder.

This removes the external database as a Phase 0 dependency. A permissive code license and a separate CC0 dedication for independently generated catalog data are plausible choices, but the project owner must select and record them.

## 6. Significant Curves

Significant Curves propose structural curves associated with hyperbolic components and may create an unusually expressive overlay for an interior atlas. Their appeal is explanatory: they could connect visible component geometry with combinatorial organization.

They also carry risks:

- definitions and computational procedures need careful reconstruction;
- the visual may imply theorem-level certainty where the implementation is approximate;
- intersections and occlusion can overwhelm the core color semantics; and
- validating a curve overlay is substantially harder than validating a selected point.

The right treatment is an optional research overlay after the core atlas is stable. It should carry provenance, approximation method, and error or validity information.

Relevant recent work:

- Thies Brockmoeller, Oscar Scherz, and Nedim Srkalovic, [Pi in the Mandelbrot Set Everywhere](https://arxiv.org/abs/2505.07138)

## 7. Sharkovsky ordering

Sharkovsky's theorem belongs to real one-dimensional dynamics, while the Mandelbrot set parameterizes complex quadratic dynamics. A project overlay must therefore state exactly which real slice, orbit relation, or derived combinatorial construction it is displaying. The ordering should not be presented as a generic total order on complex hyperbolic components.

This idea is strongest as a selected explanatory overlay or guided comparison, not as the base coloring.

Relevant recent work:

- Reila Zheng, [Sharkovsky's Ordering in the Mandelbrot Set](https://arxiv.org/abs/2506.06163)

## 8. Coordinate systems and transformations

Different coordinate spaces are useful in different domains. No single transformed plane should replace the canonical parameter plane.

### Useful now

- **Multiplier polar coordinates:** natural inside a detected hyperbolic component.
- **Log-multiplier coordinates:** turn radial contraction into an additive potential and make a punctured component cylinder-like.
- **Exact rational angle coordinates:** essential for angled addresses and characteristic rays.
- **Normalized device and tile coordinates:** implementation coordinates only, isolated from dynamics.

### Potentially useful later

- **Böttcher/external-potential coordinates:** natural outside the Mandelbrot set for equipotentials and external rays.
- **Koenigs linearization:** conceptually valuable for checking local attracting behavior, but not required as a v1 visual mode.
- **Fatou and Ecalle coordinates:** important near parabolic dynamics, but specialized and numerically delicate.
- **Straightening coordinates:** central to renormalization and small copies, but partial, expensive, and dependent on identifying suitable polynomial-like restrictions.

Global polar coordinates `c = re^{iθ}` do not substantially simplify Mandelbrot dynamics because the family is not radially symmetric in parameter space.

## 9. Preserving a path to renormalization

No renormalization machinery is needed in the first release. A few architectural seams prevent needless future rewrites:

> Orbit calculation operates exclusively on canonical Mandelbrot parameters `c`. Screen, multiplier, Böttcher, and future straightening coordinates are chart layers that map to or from `c`. Chart conversion is isolated from orbit iteration and may be partial, approximate, and versioned.

Practical consequences:

- canonical `c` remains the source of truth;
- the orbit kernel accepts `c`, not screen coordinates;
- CPU pixel mapping lives in one isolated function;
- a WebGPU path has one corresponding `parameter_for_pixel` function;
- a future nonlinear chart can supply a per-pixel `c` buffer or lookup;
- persisted/share state is versioned;
- characteristic ray pairs can be retained in catalog entries; and
- future chart results may declare a validity domain and an error estimate.

Do not build a generalized coordinate plug-in system, renormalization class hierarchy, or speculative chart API now.

Foundational references:

- Adrien Douady and John H. Hubbard, [Étude dynamique des polynômes complexes](https://www.numdam.org/item/ASENS_1985_4_18_2_287_0/)
- Luna Lomonaco and Carsten L. Petersen, [On the Notions of Renormalization and Multimodality](https://arxiv.org/abs/1505.05422)

## 10. CPU, WebGPU, and perturbation

### What can run on the GPU

Most independent per-pixel work is GPU-shaped:

- direct orbit iteration;
- escape checks;
- derivative accumulation;
- bounded cycle candidates;
- multiplier accumulation after a candidate period is known;
- status and semantic-field output; and
- final palette mapping.

Reduction-heavy, branching, high-precision, and sparse verification work is often better on the CPU.

### Precision constraint

Portable WGSL provides `f32` and optionally `f16`, not general `f64`. Direct WebGPU therefore has a shallower useful parameter-resolution limit than JavaScript's binary64 arithmetic.

This does not automatically require arbitrary precision or perturbation. The product has a bounded zoom, and its useful bound should be measured.

### Perturbation shape

For a high-precision reference parameter `c₀` and reference orbit `Z_n`, nearby pixels use

`c = c₀ + δc`

and evolve a lower-precision delta orbit. Expanding

`Z_{n+1} + δz_{n+1} = (Z_n + δz_n)² + c₀ + δc`

gives

`δz_{n+1} = 2Z_nδz_n + δz_n² + δc`.

The CPU can compute the reference orbit at high precision; the GPU can evaluate many nearby delta orbits. Practical implementations must detect loss of perturbative accuracy and may need tile subdivision, a new reference, or rebasing.

Perturbation is a credible Phase 3 extension, but productionizing it before the bounded need is measured would add two numerical systems and difficult edge cases prematurely.

## 11. Phase 0 numerical experiments

Three disposable experiments should compare the options before a production renderer is selected:

1. **Worker CPU:** representative 512- and 768-pixel renders with realistic attracting-cycle detection, progressive output, and cancellation.
2. **Direct WebGPU:** the same views, sampled against CPU and high-precision fixtures to find performance and practical `f32` limits.
3. **One perturbation tile:** a CPU reference orbit plus GPU delta orbits, sampled against direct high-precision results.

The experiments should report:

- coarse- and stable-frame latency;
- cancellation response;
- memory and transfer costs;
- maximum useful zoom at the selected resolution;
- disagreement by status, period, multiplier, and stability;
- unresolved fraction; and
- implementation complexity observed.

The result is one initial production path, not three maintained renderers.

## 12. Correctness strategy

Binary64 CPU results are a useful independent baseline, not mathematical ground truth. Validation combines:

- analytically known points;
- independently computed high-precision fixtures;
- exact-period checks over proper divisors;
- invariant checks such as conjugate symmetry;
- comparisons between independent numerical paths;
- catalog residuals and provenance; and
- versioned semantic or image regressions.

Selected points, catalog labels, and sparse samples deserve stronger CPU/high-precision verification. Bulk pixels that cannot be resolved within the budget remain visibly unresolved.

## 13. Rendering semantics and palettes

Dynamics output should be semantic where memory permits:

- status and evidence;
- period;
- multiplier;
- stability;
- iteration cost;
- residual/confidence; and
- catalog match.

Color is a later mapping from those values. This enables:

- palette changes without recomputing dynamics;
- explicit legends;
- color-vision-safe alternatives;
- meaningful inspector values; and
- future research overlays that do not rewrite the orbit kernel.

The period view should emphasize selected periods or families rather than attempting a flat palette of dozens of equally important colors.

## 14. SVG

SVG is well suited to vector overlays, labels, legends, component markers, and exported annotations. It is poorly suited to representing every pixel of a dense fractal raster as native vector geometry.

A pragmatic future export is hybrid:

- raster image for the computed field;
- SVG for catalog markers, labels, rays, curves, and legend; or
- an SVG wrapper containing the raster plus vector annotations.

Native SVG output is therefore an extension, not a first-release rendering target.

## 15. Accessibility and interaction

Accessibility cannot be postponed because the product communicates largely through color:

- stable legends;
- monotonic lightness for scalar stability;
- non-color cues for selection and catalog identity;
- color-vision-deficiency checks;
- keyboard inspection;
- readable unresolved treatment; and
- a device-independent render-resolution cap.

The first-run experience should begin with the recognizable full set, reveal the interior semantics, point out a few catalog components, and invite inspection before expecting the user to understand the coordinate systems.

## 16. Research decisions

The current decisions are:

- Build a focused TypeScript web atlas.
- Keep all orbit and raster work off the main thread.
- Make multiplier and intrinsic stability the primary interior semantics.
- Use period as a secondary structural view.
- Separate status from evidence and expose unresolved results.
- Include a small independently generated catalog in the first vertical slice.
- Store exact rational angle data and durable project identifiers.
- Do not import the published center database without an explicit data license.
- Preserve canonical `c` and isolate chart mapping for future coordinate work.
- Measure CPU, direct WebGPU, and one perturbation tile in Phase 0.
- Select one initial production renderer from those measurements.
- Treat perturbation, Significant Curves, Sharkovsky ordering, and renormalization as research extensions.
- Keep the zoom bounded and derive the bound from numerical and interaction budgets.

These choices deliberately concentrate the project on a legible mathematical idea rather than a broad fractal-viewer feature set.
