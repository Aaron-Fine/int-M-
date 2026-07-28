# Research Notes

## 1. Research question

How can a small browser application reveal meaningful structure inside the Mandelbrot set without becoming another unrestricted deep-zoom renderer?

The most promising answer combines:

- attracting-cycle period;
- the complex multiplier as an internal coordinate;
- internal and angled internal addresses as component identifiers;
- selected analytic curves;
- selected orderings along veins;
- explicit numerical uncertainty;
- GPU acceleration with CPU reference and verification.

This document records the mathematical and computational basis for that direction. It is not a comprehensive survey of complex dynamics.

## 2. The calculation being visualized

For each parameter c, iterate the critical point under:

`f_c(z) = z^2 + c, with z_0 = 0`

A point is outside the Mandelbrot set when this critical orbit escapes. A finite computation that fails to observe escape does not, by itself, prove that the parameter is inside the set.

Within a hyperbolic component, the map has an attracting periodic cycle. If its exact period is p and its points are z[0] through z[p-1], the cycle multiplier is:

`lambda = product(2 * z[j]), j = 0..p-1`

The cycle is attracting when the magnitude of lambda is less than one and superattracting when lambda is zero.

### Design consequence

The renderer must preserve more than an integer escape count. Its semantic result needs classification state, period, multiplier, convergence effort, residual, and confidence evidence.

## 3. Multiplier coordinates

### Source

John Milnor, "Periodic Orbits, External Rays and the Mandelbrot Set: An Expository Account" (2000):

- https://arxiv.org/abs/math/9905169
- https://arxiv.org/pdf/math/9905169

Milnor describes a hyperbolic component of period n and the multiplier map that sends each parameter to the multiplier of its attracting orbit. The multiplier provides a canonical uniformization of the component by the unit disk.

### Relevance

This is the strongest basis for the primary visualization. It is not merely an attractive palette:

- multiplier magnitude measures position from a superattracting center toward the component boundary;
- multiplier phase gives an internal angle;
- constant phase produces internal rays;
- constant magnitude produces internal equipotentials;
- the same coordinate interpretation applies across hyperbolic components of different periods.

### Proposed view

- hue from argument(lambda);
- lightness or radial tone from magnitude(lambda);
- optional phase spokes;
- optional magnitude rings;
- period retained as a separate semantic value and optional categorical layer.

The exact visual encoding requires perceptual testing. The mathematical values must remain independent of the palette.

## 4. Interior classification and uncertainty

A conventional escape-time image normally colors every point that reaches the iteration limit as if it were interior. That conflates several states:

- a point with analytically known membership;
- a point with a detected attracting cycle;
- a point converging too slowly for the budget;
- a point whose numerical behavior is ambiguous;
- a point that would escape after the configured limit.

Near parabolic parameters and component boundaries, convergence and escape behavior can be particularly slow.

### Related recent work

Daniel Meyer and Dierk Schleicher, "Pi in the Mandelbrot Set Everywhere" (2025 preprint):

- https://arxiv.org/abs/2505.07138
- https://arxiv.org/html/2505.07138v1

The work studies escape-time behavior near parabolic and satellite bifurcations. It is not an interior-coloring algorithm, but it reinforces that iteration count near these regions reflects subtle dynamical behavior and should not be treated as a simple binary membership test.

### Design consequence

Expose escaped, analytic interior, attractor detected, provisional, and unresolved as different states. Present the numerical evidence in the inspector.

## 5. Internal and angled internal addresses

### Source

Dierk Schleicher, "Internal Addresses of the Mandelbrot Set and Galois Groups of Polynomials," Arnold Mathematical Journal 3 (2017):

- https://doi.org/10.1007/s40598-016-0042-x
- https://armj.math.stonybrook.edu/pdf-Springer-final/016-0042.pdf

Internal addresses provide a concise, dynamically meaningful description of combinatorial structure. Angled internal addresses add rotation data and can distinguish hyperbolic components more precisely.

### Relevance

The address system provides principled identifiers and hierarchy:

- exact period sequence;
- parent and child relationships;
- limbs and sub-limbs;
- rotation information;
- human-readable component navigation.

It is more reliable than inventing names or identifying components only by proximity.

### Design consequence

Create a static component catalog containing:

- center as decimal strings;
- exact period;
- internal address;
- angled internal address;
- parent identifier;
- optional sourced aliases;
- source metadata.

Common names should remain aliases. Internal addresses should be treated as authoritative mathematical identifiers.

### Open work

The project still needs to determine whether address data will be:

- imported from an existing reusable dataset;
- calculated offline from center/combinatorial data;
- curated manually for the initially supported subset.

This choice depends on source availability, licensing, and validation effort.

## 6. Certified hyperbolic centers

### Source

Nicolae Mihalache and François Vigneron, "How to Split a Tera-Polynomial" (2024 preprint):

- https://arxiv.org/abs/2402.06083
- https://arxiv.org/html/2402.06083v2

The authors describe algorithms for roots associated with periodic critical dynamics and Misiurewicz-Thurston parameters. They report certified computation of all hyperbolic centers through period 41 and provide an associated implementation and database to the scientific community.

### Relevance

The results can support:

- verified center coordinates;
- regression tests across many periods;
- curated navigation targets;
- component labels;
- canonical perturbation references;
- comparison between runtime period detection and known centers.

### Design consequence

Do not reproduce the center-enumeration algorithm. Investigate using an appropriately licensed subset of the published results as static reference data.

The catalog should include only the range that improves the supported atlas. Completeness through period 41 is not itself a product requirement.

## 7. Significant curves

### Source

Dalibor Martisek, "Significant Curves of the Mandelbrot Set," MENDEL 27(2), 2021:

- https://doi.org/10.13164/mendel.2021.2.030
- https://mendel-journal.org/index.php/mendel/article/view/157

The paper describes analytic curves associated with the main hyperbolic component, internal and external bounds, and curves of low period.

### Relevance

These curves can provide:

- educational overlays;
- comparison between analytic and numerically rendered structure;
- regression and visual-validation references;
- an explanation of the simplest component boundaries.

### Design constraint

Do not generalize the paper beyond its results. The first overlay should implement only explicitly sourced formulas and clearly label what each curve represents.

This is a secondary layer, not the renderer's central organizing principle.

## 8. Sharkovsky ordering along veins

### Source

W. Zheng, "Sharkovsky's Ordering in the Mandelbrot Set" (2025 preprint):

- https://arxiv.org/abs/2506.06163
- https://arxiv.org/html/2506.06163

The work studies ordering and dynamics of hyperbolic components along veins in the Mandelbrot set, extending ideas associated with Sharkovsky ordering beyond the real quadratic family.

### Relevance

The natural visualization is not a global colored field. It is a curated path:

- select a vein;
- draw it from the main cardioid toward a tip;
- mark intersected or associated hyperbolic components;
- present their periods in the proved ordering;
- connect markers to component identifiers and dynamics.

### Design consequence

Implement this as a guided explanatory overlay after the core atlas works. Begin with only a few source-backed veins.

Avoid presenting an arbitrary radial line or nearest-component sequence as "Sharkovsky ordering."

## 9. Interior and exterior distance estimates

### Sources

Albert Lobo, "Interior and Exterior Distance Bounds for the Mandelbrot Set," updated 2022:

- https://albertlobo.com/fractals/interior-exterior-distance-bounds-mandelbrot-set

Lindsay Robert Wilson, "Distance Estimation Method for Drawing Mandelbrot and Julia Sets" (2012):

- https://www.imajeenyus.com/mathematics/20121112_distance_estimates/distance_estimation_method_for_fractals.pdf

Claude Heiland-Allen, Mandelbrot renderer notes and practical interior distance material:

- https://mathr.co.uk/mandelbrot/book-draft-2017-11-10.pdf

### Relevance

Interior distance estimates could produce meaningful boundary-relative shading and adaptive sampling. However, practical interior estimates require:

- a correctly identified exact period;
- a well-refined attracting cycle;
- propagated derivatives;
- care around misidentified period multiples and boundaries.

### Decision

Treat interior distance as future research. Multiplier coordinates are simpler, more canonical, and sufficient to establish the project's identity.

## 10. Perturbation rendering

### Sources

Claude Heiland-Allen, "Deep Zoom Theory and Practice" (2021):

- https://mathr.co.uk/blog/2021-05-14_deep_zoom_theory_and_practice.html

Claude Heiland-Allen, "Deep Zoom":

- https://mathr.co.uk/web/deep-zoom.html

Kalles Fraktaler 2+ description:

- https://mathr.co.uk/kf/kf.html

### Method

Let C be a reference parameter with CPU-calculated orbit:

`Z[n+1] = Z[n]^2 + C`

For a nearby pixel c = C + dc and orbit z = Z + dZ:

`dZ[n+1] = 2 * Z[n] * dZ[n] + dZ[n]^2 + dc`

The reference orbit is calculated in CPU binary64. The GPU stores the small dc and dZ values in f32. This avoids adding a tiny pixel displacement directly to a coordinate of order one in single precision.

### Relevance to a bounded atlas

Perturbation is useful even without unlimited zoom:

- direct GPU f32 loses coordinate resolution at modest zoom;
- JavaScript binary64 remains adequate for the deliberately bounded range;
- many GPU pixels can share one precise CPU reference orbit;
- cataloged component centers can serve as canonical interior references;
- tile-local references can handle uncataloged and exterior regions.

### Failure handling

Perturbation is local and can fail through cancellation or excessive difference-orbit growth. The bounded project should prefer simple conservative recovery:

1. mark a glitch;
2. subdivide the affected tile;
3. calculate a closer reference;
4. fall back to CPU binary64 if necessary.

Do not begin with sophisticated rebasing, series approximation, or unlimited-reference management.

## 11. Browser GPU constraints

### Sources

W3C, WebGPU Shading Language:

- https://www.w3.org/TR/WGSL/

MDN, WebGPU API:

- https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API

MDN, GPUComputePipeline:

- https://developer.mozilla.org/en-US/docs/Web/API/GPUComputePipeline

### Current constraints

WGSL's concrete scalar types include f32 and optional f16 but not f64. WGSL also permits implementation differences from full IEEE-754 behavior, including unspecified rounding direction in some contexts and documented accuracy bounds.

WebGPU compute pipelines are available in Web Workers on supporting browsers, but WebGPU is not yet a universal compatibility baseline.

### Design consequence

- use WebGPU compute for direct orbit iteration, perturbation, provisional cycle detection, multipliers, and coloring;
- keep the GPU device and OffscreenCanvas in a render worker;
- retain CPU binary64 workers for correctness reference, verification, and fallback;
- do not require WebGPU merely to open and understand the application;
- test GPU results against deterministic CPU results.

## 12. Cycle detection and multiplier verification

The exact runtime algorithm remains to be prototyped. A likely bounded approach is:

1. iterate through a burn-in period;
2. save a reference orbit value;
3. detect a candidate return within a scaled tolerance;
4. treat the return interval as candidate period p;
5. repeat for additional cycles;
6. refine a periodic point using Newton's method on f_c^p(z) - z;
7. test proper divisors of p;
8. calculate the multiplier;
9. accept only with an adequate residual and attracting magnitude.

### Risks

- convergence near the component boundary can be slow;
- a multiple of the exact period can be detected;
- absolute tolerances do not scale uniformly;
- GPU f32 can disagree with CPU binary64;
- perturbation can become unreliable even when the reference itself is valid.

### Required prototype

Before committing to the catalog or overlays, build a CPU test harness over known centers and nearby points. Period semantics and confidence evidence must stabilize before GPU porting.

## 13. Rendering architecture implications

The research supports a hybrid pipeline:

- wide view: direct GPU f32;
- zoomed view: CPU binary64 reference orbit plus GPU perturbations;
- ambiguous result: tile subdivision or CPU verification;
- color change: GPU recoloring of cached semantic buffers;
- inspected point: high-priority CPU verification;
- unsupported GPU: CPU worker fallback.

The semantic calculation result should remain independent from its presentation so that multiplier, period, and convergence views share the same computation.

## 14. Research-backed boundaries

The following boundaries keep the project focused:

- multiplier coordinates before interior distance estimates;
- curated component catalog before exhaustive enumeration;
- selected Significant Curves before general analytic-curve tooling;
- selected Sharkovsky veins before a global combinatorial explorer;
- bounded CPU binary64 references before arbitrary precision;
- tile subdivision before sophisticated perturbation rebasing;
- CPU correctness before GPU optimization;
- explicit unresolved states before aggressive classification.

## 15. Questions requiring further research

1. Where is the certified center database distributed, and what are its reuse terms?
2. Is there a maintained, reusable dataset of internal and angled internal addresses?
3. What is the most reliable bounded cycle-detection algorithm for CPU and GPU parity?
4. What perturbation glitch criterion is appropriate for the supported range?
5. How should multiplier colors remain perceptually legible across periods and near magnitude one?
6. Which Significant Curves formulas should be included in the first overlay?
7. Which veins from the Sharkovsky work make the clearest guided examples?
8. What numerical and catalog limits should define the maximum zoom?
9. What level of GPU/CPU disagreement is acceptable for provisional rendering?
10. Which browser matrix is realistic for WebGPU and OffscreenCanvas?

## 16. Preliminary conclusion

The recent literature does not supply one new "interior coloring algorithm." Instead, it supplies several compatible structures:

- multiplier uniformization gives the primary internal coordinate;
- internal addresses give component identity and hierarchy;
- certified centers give reference data;
- Significant Curves give low-period analytic overlays;
- Sharkovsky ordering gives curated paths through component periods;
- perturbation provides a practical CPU/GPU numerical bridge;
- explicit uncertainty prevents a finite computation from masquerading as proof.

Together these support a project that is distinct from conventional Mandelbrot viewers while remaining narrow enough to implement and maintain.
