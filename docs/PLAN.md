# Project Plan

## 1. Purpose

int(M) will be a browser-based atlas of dynamics inside the Mandelbrot set. It will make hyperbolic components legible through attracting periods, multiplier coordinates, component identifiers, and selected mathematical overlays.

The project is deliberately not competing with mature deep-zoom renderers. Its value is interpretation: showing what happens inside the familiar boundary and explaining what the image means.

## 2. Product definition

> A bounded, interactive atlas of periods, multipliers, component structure, and numerical uncertainty inside the Mandelbrot set.

A successful first release should let a curious user:

- navigate the full set and selected interior regions;
- see hyperbolic components colored by mathematically meaningful quantities;
- inspect a point and understand how it was classified;
- identify cataloged components by period, center, internal address, and angled internal address;
- compare multiplier, period, and convergence views;
- enable a small number of explanatory overlays;
- understand why some points remain unresolved.

## 3. Scope

### 3.1 Core views

#### Multiplier view

For a detected attracting cycle of exact period p, calculate its complex multiplier:

`lambda = product(2 * z[j]), j = 0..p-1`

Use multiplier phase and magnitude as internal coordinates:

- hue: argument of lambda;
- lightness or radial tone: magnitude of lambda;
- optional constant-phase internal rays;
- optional constant-magnitude equipotentials.

The exact palette remains a presentation choice. The underlying multiplier values must remain available independently of coloring.

#### Period view

Show the exact detected attracting period as a categorical value. Brightness or saturation may retain multiplier magnitude so that components do not become visually flat.

#### Convergence view

Show the numerical effort required to reach a classification:

- iterations before escape;
- iterations before an attracting-cycle candidate;
- work required to verify or refine the cycle;
- unresolved points.

This is a classification-cost visualization, not an intrinsic measure of mathematical complexity.

### 3.2 Classification states

Every calculated point must have an explicit state:

1. **Escaped** — an escape was observed.
2. **Analytic interior** — membership follows from an implemented analytic test.
3. **Attractor detected** — a periodic attracting cycle was detected and passed the applicable checks.
4. **Unresolved** — the computation budget ended without a reliable classification.
5. **Provisional** — optional state for a GPU result awaiting stronger verification.

The application must never silently translate "reached the iteration limit" into "inside."

### 3.3 Component catalog

Ship a curated static catalog rather than constructing the full component hierarchy at runtime. A record should be able to contain:

- stable project identifier;
- exact period;
- center coordinate stored as decimal strings;
- internal address;
- angled internal address;
- parent component;
- limb or wake metadata;
- optional sourced common aliases;
- source and certification metadata.

Internal addresses are authoritative identifiers. Common names are optional aliases and must not be invented merely to fill the catalog.

The initial catalog should contain only components that add value within the supported zoom and period range. A large database is not a goal by itself.

### 3.4 Overlays

#### Internal-coordinate overlay

Display constant multiplier phase and magnitude within classified components. This is part of the core multiplier view.

#### Significant Curves overlay

Implement only curves that can be traced to explicit results or formulas in the cited research. Initially this is expected to emphasize the main cardioid, period-2 component, and other low-period curves described in the source.

The overlay is educational and can also serve as a numerical validation reference. It is not intended to generate analytic boundaries for every component.

#### Sharkovsky vein overlay

Treat Sharkovsky ordering as a guided, curated view along selected veins:

- display a chosen vein;
- mark the components it encounters;
- label their periods and ordering;
- allow stepwise exploration;
- link each marker to component metadata.

It is not a global ordering imposed on the entire two-dimensional set.

### 3.5 Inspector

A selected point should expose, when available:

- complex coordinate;
- classification state;
- escape or convergence iteration count;
- exact or candidate period;
- multiplier magnitude and phase;
- residual and confidence;
- component identity and aliases;
- internal and angled internal addresses;
- whether the value is GPU-estimated or CPU-verified.

## 4. Explicit non-goals

The initial project will not attempt to provide:

- unlimited or arbitrary-precision zoom;
- a replacement for Kalles Fraktaler, Fraktaler, or other deep-zoom tools;
- exhaustive enumeration of hyperbolic components;
- reproduction of the tera-polynomial center-finding computation;
- a general fractal-formula editor;
- Julia-set, Burning Ship, Multibrot, or three-dimensional rendering;
- video production or zoom-sequence rendering;
- per-pixel SVG output;
- a user-programmable shader language;
- proof that an arbitrary unresolved point belongs to the Mandelbrot set.

These can be reconsidered only after the focused application is complete.

## 5. Technical architecture

### 5.1 Technology direction

Expected baseline:

- TypeScript;
- a minimal browser build tool;
- Canvas with OffscreenCanvas where supported;
- Web Workers;
- WebGPU compute and rendering where supported;
- typed arrays for numerical buffers;
- a CPU worker path as correctness reference and compatibility fallback.

Avoid a UI framework until ordinary DOM and Canvas code demonstrably becomes harder to maintain.

### 5.2 Threading rule

The main UI thread handles:

- input events;
- DOM updates;
- high-level render requests;
- accessibility state;
- small status messages.

It does not:

- iterate orbits;
- classify pixels;
- color full image buffers;
- process completed tiles individually;
- construct overlays through expensive numerical work.

A render coordinator worker owns the OffscreenCanvas and rendering state. CPU math workers and WebGPU communicate through the coordinator. MessageChannel connections should allow worker-to-worker data flow without routing each tile through the main thread.

### 5.3 Semantic rendering buffers

Orbit calculation produces semantic data, not final colors. A compact per-pixel representation should support:

- status;
- period;
- iteration or convergence count;
- multiplier real and imaginary parts;
- residual or confidence.

Coloring consumes these buffers in a separate pass. A palette or display-mode change must not repeat orbit calculation.

### 5.4 Progressive rendering

Rendering should:

1. produce a coarse preview quickly;
2. refine in tiles;
3. prioritize the center and visible areas of interest;
4. assign every request a monotonically increasing epoch;
5. discard results from stale epochs;
6. cancel or cheaply abandon obsolete work;
7. reuse compatible cached dynamics when only color or overlays change.

### 5.5 Numerical modes

#### Direct GPU mode

For wide views, use native WGSL f32 iteration. This is the simplest and fastest path where coordinate precision is sufficient.

#### CPU reference perturbation mode

For zoomed views:

1. a CPU worker calculates a binary64 reference orbit for a tile or known component center;
2. each GPU pixel stores its small coordinate offset from that reference;
3. the GPU iterates the perturbation recurrence;
4. unreliable perturbations are marked rather than silently accepted;
5. affected tiles are subdivided or sent to CPU verification.

For reference parameter C and pixel c = C + dc:

`dZ[n+1] = 2 * Z[n] * dZ[n] + dZ[n]^2 + dc`

This mode is intended to avoid f32 coordinate collapse, not to provide unlimited deep zoom.

#### CPU verification mode

CPU workers use JavaScript binary64 for:

- the selected point;
- catalog centers and labeled components;
- GPU-ambiguous pixels;
- regression samples;
- pixels near classification thresholds.

The inspector should distinguish provisional and verified values.

### 5.6 Perturbation validity

A reference orbit is local. Use tile-local references or known component centers rather than assuming one viewport-center reference works everywhere.

The first implementation should handle failure conservatively:

- detect perturbation glitches or excessive difference-orbit growth;
- subdivide affected tiles;
- calculate a closer reference;
- fall back to CPU binary64 for remaining ambiguity.

Sophisticated rebasing and series approximation are outside the initial scope.

### 5.7 Bounded zoom

The zoom bound is a product feature, not an apology. It should be chosen from measured reliability.

The application should report:

- current magnification;
- pixel scale;
- configured coordinate limit;
- classification budget;
- whether coordinate precision or convergence is the current constraint.

The initial numerical bound is unresolved. A viewport width around 1e-9 to 1e-10 is a hypothesis to test, not a committed requirement.

## 6. Data flow

1. UI sends viewport, mode, palette, overlay, and computation limits.
2. Coordinator chooses direct GPU, perturbation, or CPU mode.
3. CPU workers generate reference orbits when required.
4. GPU or CPU workers calculate semantic dynamics tiles.
5. Ambiguous GPU results are queued for verification.
6. Coordinator caches semantic tiles.
7. Coloring pass produces the displayed image.
8. Overlay pass adds curves, component markers, and labels.
9. Inspector requests receive high-priority CPU verification.

## 7. Correctness strategy

### 7.1 Reference implementation

Build the CPU binary64 classifier first. It defines semantics and produces test vectors for the GPU implementation.

### 7.2 Test classes

Include:

- analytic points in and out of the main cardioid and period-2 bulb;
- known escaping points;
- known hyperbolic centers across several periods;
- points near but not exactly on component boundaries;
- candidate periods with proper divisors;
- CPU versus GPU comparisons over deterministic sample grids;
- perturbation versus direct CPU comparisons at several zoom levels;
- known cases expected to remain unresolved under limited budgets.

### 7.3 Confidence

Confidence must be based on explicit evidence such as:

- escape observed;
- analytic membership test;
- repeated cycle agreement;
- smallest-period divisor checks;
- Newton residual;
- multiplier comfortably within the unit disk;
- agreement between independent methods.

Do not reduce confidence to an unexplained percentage.

### 7.4 Performance

Measure:

- time to first coarse frame;
- time to stable frame;
- UI long tasks;
- cancellation latency;
- GPU/CPU disagreement rate;
- unresolved and glitch rates;
- cost of palette-only redraw;
- worker scaling.

No heavy numerical work on the UI thread is a release criterion.

## 8. Delivery phases

### Phase 0 — Research and documentation

- establish project thesis, scope, terminology, and sources;
- document architectural decisions and open questions;
- select a license before importing third-party data or code.

**Exit condition:** plan and research are reviewable before source scaffolding begins.

### Phase 1 — CPU mathematical reference

- minimal TypeScript application;
- CPU worker orbit calculation;
- explicit classification states;
- period detection and verification;
- multiplier calculation;
- basic pixel inspector;
- deterministic tests.

**Exit condition:** known points and component centers classify correctly under documented limits.

### Phase 2 — Core atlas experience

- bounded navigation;
- progressive tiles;
- multiplier, period, and convergence views;
- off-main-thread coloring and rendering;
- shareable viewport state.

**Exit condition:** the application communicates the interior-dynamics thesis without overlays.

### Phase 3 — WebGPU acceleration

- direct f32 GPU path;
- semantic GPU result buffers;
- GPU/CPU comparison harness;
- compatibility fallback to CPU workers.

**Exit condition:** measured speedup with bounded and documented disagreement behavior.

### Phase 4 — Catalog and identifiers

- curated component catalog;
- internal and angled internal addresses;
- optional sourced aliases;
- component markers, labels, and navigation;
- high-priority verification for inspected catalog components.

**Exit condition:** identifiers are traceable and do not rely on nearest-center guessing alone.

### Phase 5 — Perturbation

- tile-local CPU reference orbits;
- GPU perturbation kernel;
- glitch detection;
- tile subdivision;
- CPU fallback and verification.

**Exit condition:** supported zoom extends beyond direct f32 coordinates while matching CPU reference results within stated tolerances.

### Phase 6 — Mathematical overlays

- internal rays and equipotentials;
- Significant Curves;
- a small number of curated Sharkovsky veins;
- explanatory copy and citations.

**Exit condition:** each overlay is understandable, source-backed, and independently toggleable.

### Phase 7 — Portfolio polish

- accessibility and keyboard navigation;
- responsive layout;
- curated tours;
- performance budget;
- documentation of methods and limitations;
- deployment.

## 9. Open questions and decision gates

Resolve through prototypes or source review:

1. What period and iteration limits provide a responsive, meaningful atlas?
2. Which certified-center data is available in a reusable format and under what terms?
3. Will angled internal addresses be imported, generated offline, or derived at build time?
4. What evidence is sufficient to label a GPU cycle as verified?
5. At what pixel scale should direct f32 switch to perturbation?
6. Is split-reference arithmetic materially better than high-part-only reference values?
7. What glitch criterion works reliably for the bounded range?
8. Which browsers constitute the supported WebGPU target?
9. Is OffscreenCanvas rendering sufficiently portable, and what fallback is acceptable?
10. What initial zoom bound keeps catalog, numerical, and explanatory value aligned?

## 10. Definition of done

The focused project is complete when:

- the main UI remains responsive during every supported render;
- the application visualizes periods and multiplier coordinates inside the set;
- classifications expose evidence and uncertainty;
- known components have traceable identifiers;
- selected Significant Curves and Sharkovsky veins add explanation rather than clutter;
- the documented zoom range is reliable;
- unsupported cases become unresolved instead of mislabeled;
- implementation and documentation remain small enough for one maintainer to understand.
