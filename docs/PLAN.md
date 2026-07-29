# Project plan

## 1. Purpose

Mandelbrot Interiority (repository `int-M-`) is a small, focused interactive atlas of the Mandelbrot set's interior.

The project is not trying to win the usual Mandelbrot-viewer contest of maximum zoom depth, maximum palette count, or maximum feature count. Its value is a legible view of attracting dynamics: what component a parameter appears to belong to, its period, its multiplier, how strongly it attracts, how the result was established, and how selected components are identified combinatorially.

The bounded zoom is intentional. It gives the project room to favor explanation, responsiveness, and numerical honesty over spectacle.

## 2. First-release thesis

The first release should tell one coherent story:

1. Begin with a recognizable view of the full Mandelbrot set.
2. Reveal the interior using multiplier or stability coloring.
3. Highlight a small catalog of mathematically identified components.
4. Let the user inspect a point and see its outcome, period, multiplier, coordinates, identifiers, and supporting evidence.
5. Mark results that the numerical budget cannot resolve instead of implying certainty.

If that story is clear and responsive, the project succeeds. Significant Curves, Sharkovsky ordering, deep perturbation zooms, and renormalization views are valuable follow-on research, not prerequisites.

## 3. Release scope

### 3.1 Core views

The renderer will support three related semantic views:

- **Multiplier:** hue may encode `arg(λ)` while lightness or chroma encodes `|λ|`.
- **Stability:** a monotonic scale represents the intrinsic per-iterate stability exponent

  `κ = -log|λ| / p`

  where `λ` is the attracting cycle multiplier and `p` is its period.
- **Period:** selected periods, families, or cataloged components are distinguished with a restrained categorical treatment and a visible legend.

Raw iteration count is diagnostic information and a measure of computational cost. It is not the primary definition of interior complexity.

### 3.2 Outcome and evidence

Mathematical outcome and computational evidence are orthogonal:

```ts
type DynamicsStatus =
  | "escaped"
  | "attracting-cycle"
  | "unresolved";

type Evidence =
  | "analytic"
  | "gpu-direct"
  | "gpu-perturbation"
  | "cpu-float64"
  | "catalog-validated";
```

The exact representation may become flags rather than a single `Evidence` value, because more than one method can support a result. “Provisional” is a confidence or evidence label, not a dynamical state.

### 3.3 Initial component catalog

The first vertical slice includes a deliberately small catalog—approximately 6–12 low-period hyperbolic components. It will be independently generated and validated for this project.

Each entry should be able to carry:

- a stable project identifier;
- a human-readable name where appropriate;
- center parameter `c` and declared precision;
- exact period;
- internal address;
- angled internal address using exact rational angles;
- characteristic parameter-ray pair when known, also as exact rationals;
- validation residuals and method;
- provenance and schema version.

Internal addresses alone are not guaranteed to uniquely identify a component. Angled addresses and characteristic rays provide the distinguishing combinatorics; the stable project identifier provides durable software identity.

### 3.4 Inspector and interaction

The inspector will expose only quantities the current numerical path can defend:

- canonical parameter `c`;
- outcome and evidence;
- period and multiplier when detected;
- `|λ|`, `arg(λ)`, and `κ`;
- iteration and residual diagnostics;
- catalog name and identifiers when matched; and
- an explicit unresolved state when the budget is exhausted.

Navigation preserves ordinary drag-to-pan while adding a visible area-zoom
tool and a Shift-drag accelerator. The free-form selection is fitted to the
viewport aspect ratio so complex-plane pixels remain square. Catalog names
appear automatically once magnification makes them useful, while hover, focus,
selection, and accessible names keep them available below that threshold.

Quick, Balanced, and Detailed profiles expose finite search budgets rather
than raw numerical parameters. Balanced is the default. A higher profile may
reduce the unresolved region but never changes “unresolved” into a certainty
claim. Rendering is progressive and cancellable. A deliberate
device-independent resolution cap prevents high-DPI displays from silently
multiplying the workload.

### 3.5 Research extensions

These are retained in the research plan but excluded from the first-release definition of done:

- Significant Curves overlays;
- Sharkovsky-order views;
- perturbation rendering beyond the bounded v1 need;
- exterior Böttcher coordinates;
- Ecalle/Fatou-coordinate experiments;
- straightening and renormalization-coordinate views;
- larger component catalogs; and
- native SVG export.

## 4. Explicit non-goals for the first release

- arbitrary-depth exploration;
- a general-purpose fractal framework;
- user-programmable color curves;
- exhaustive component classification;
- proof-grade certification of every rendered pixel;
- reproducing or redistributing the published period-41 center database;
- a general coordinate-system plug-in architecture;
- maintaining CPU, direct-GPU, and perturbation renderers at production quality without measured need; or
- replacing canonical Mandelbrot parameters with a transformed coordinate space.

## 5. Architecture

### 5.1 Application shape

The preferred application shape is a Vite application using strict TypeScript and vanilla DOM/CSS:

- a small UI layer on the main thread;
- a rendering coordinator in a worker;
- numerical kernels that can run on worker CPU or WebGPU;
- a shared semantic result model consumed by palettes and the inspector; and
- static, versioned catalog and validation fixtures; and
- Playwright browser tests plus linting and static analysis in the development workflow.

TypeScript is appropriate for the product shell, worker orchestration, state, inspection, and WebGPU integration. It does not imply that every future high-precision operation must be handwritten in TypeScript. A small WebAssembly numerical module remains an option if later measurements justify it.

### 5.2 Threading invariant

The main thread handles input, layout, accessibility, and presentation. Orbit iteration, component detection, catalog matching, and raster production occur in workers or GPU commands coordinated by a worker.

Every render request has an identity and cancellation path. Stale work must be discarded before it can replace a newer frame.

### 5.3 Coordinate invariant

> Orbit calculation operates exclusively on canonical Mandelbrot parameters `c`. Screen, multiplier, Böttcher, and future straightening coordinates are chart layers that map to or from `c`. Chart conversion is isolated from orbit iteration and may be partial, approximate, and versioned.

For the first release this requires only:

- one CPU pixel-to-parameter boundary;
- one corresponding WGSL `parameter_for_pixel` boundary if WebGPU is selected;
- canonical `c` as the source of truth in inspection and saved state; and
- versioned persisted/share state.

Future nonlinear charts may provide a precomputed per-pixel parameter buffer without changing the orbit engine. No general chart interface or renormalization implementation is needed now.

### 5.4 Semantic render data

Rendering produces semantic values before final aesthetic colors. The Phase 1 worker retains a compact full-raster representation containing:

- outcome/status;
- detected period;
- smooth escape iteration for escaped pixels; and
- multiplier magnitude and angle for detected attracting cycles.

These fields support every current interior view, so palettes and legends can map the same classified frame to stability, multiplier, or period color without repeating orbit work. The semantic arrays remain worker-local; only RGBA output crosses to the main thread.

Evidence flags, convergence diagnostics, catalog matches, and other richer values are computed for selected-point inspection or offline validation rather than allocated for every pixel. A later view that genuinely needs another per-pixel field must make that addition explicit and advance the semantic-algorithm version.

### 5.5 Numerical paths

The production plan will select the smallest renderer that meets the bounded product need.

1. **Worker CPU baseline.** Binary64 establishes a portable implementation baseline, fallback, and independent comparison path. It is not a mathematical truth oracle.
2. **Direct WebGPU.** WGSL `f32` can handle large amounts of per-pixel orbit work, but its useful zoom and classification limits must be measured.
3. **CPU-reference/GPU perturbation.** A high-precision reference orbit plus GPU delta orbits is technically viable. It is adopted only if the bounded zoom target exceeds direct GPU precision and the added numerical edge cases are justified.

CPU verification should concentrate on catalog entries, selected inspector points, sparse samples, and golden fixtures. Ambiguous bulk pixels remain `unresolved`; they do not trigger an unbounded CPU rescue queue.

### 5.6 Progressive rendering and cache

A navigation action should produce:

1. an immediate reused or coarse frame;
2. a low-resolution current frame;
3. progressively refined tiles or passes; and
4. a stable final frame within the configured numerical budget.

The bounded Phase 1 cache retains one stable semantic frame. Its key includes
the canonical viewport, resolution, selected quality profile and numerical
limits, and semantic-algorithm version. It excludes the selected interior view
and cosmetic palette inputs. A profile, navigation, resolution, or algorithm
change cancels stale work; a view change recolors the cached frame, or updates
the requested palette while the same dynamics computation continues. Raster
rendering and point inspection use the same quality profile.

### 5.7 Bounded zoom

The bound is selected from evidence, not an arbitrary marketing number. Phase 0 measures where:

- direct `f32` rendering loses pixel-scale parameter distinctions;
- binary64 becomes unreliable for the selected diagnostics;
- perturbation begins to pay for its complexity; and
- memory, latency, or iteration budgets stop supporting the intended interaction.

The UI communicates the bound as part of the atlas's scope.

## 6. Data flow

```text
UI input
  -> versioned viewport request
  -> worker rendering coordinator
  -> chart mapping to canonical c
  -> selected numerical kernel
  -> semantic tile data
  -> palette/legend mapping
  -> canvas presentation
  -> inspector and catalog annotation
```

Catalog generation and high-precision validation are offline development tools, not browser hot-path dependencies.

## 7. Correctness and numerical honesty

Validation uses several independent forms of evidence:

- analytic checks at known parameters;
- independently generated high-precision golden fixtures;
- exact-period checks against all proper divisors;
- catalog residuals and provenance;
- CPU/GPU comparison samples;
- conjugate-symmetry and other invariants; and
- deterministic regression images or semantic tile snapshots.

Disagreement thresholds must be declared per field. A pixel that exceeds the numerical budget or fails a confidence test is rendered and inspected as `unresolved`.

Persisted or shareable state includes a schema and algorithm version so future coordinate or numerical changes do not silently reinterpret old links.

## 8. Accessibility and visual language

Accessibility is part of the first slice because color carries meaning:

- every view has a readable legend;
- stability uses monotonic lightness;
- categorical distinctions are not hue-only;
- palettes are checked for common color-vision deficiencies;
- the inspector is keyboard reachable;
- quality selection and explanatory disclosures are keyboard operable;
- catalog highlighting has a non-color cue; and
- collapsed catalog labels retain accessible names;
- area selection has a visible non-color boundary and mode state; and
- unresolved regions have a stable, clearly explained treatment.

The period view will not assign dozens of equally prominent categorical colors. It will emphasize selected periods, families, boundaries, or catalog entries appropriate to the current story.

### 8.1 UX requirements and traceability

The normative first-release UX requirements are `MI-UX-001` through `MI-UX-016` in [the SysML v2 system model](../model/MandelbrotInteriority.sysml). They cover the first-use render and defaults, progressive and truthful feedback, focused controls, responsive bounded point and area navigation, adaptive catalog labels, discoverable semantic definitions, evidence-bounded inspection, selectable quality budgets, resilient renderer fallback, keyboard operation, and accessible presentation. The same model traces each requirement to a responsible logical component and to a verification objective; [the model guide](../model/README.md) explains the organization and validation baseline.

## 9. Delivery phases

### Phase 0 — decisions, provenance, and disposable experiments

Phase 0 ends uncertainty before production architecture hardens.

#### Mathematical and product contract

- Define multiplier, stability, period, outcome, evidence, and unresolved semantics.
- Record the coordinate invariant and the role of canonical `c`.
- Define the first-run story and initial 6–12 catalog components.
- Define the bounded-navigation promise in measurable terms.
- Correct the research bibliography, author names, and identifier terminology.

#### Data and licensing

- Record GPL-3.0-only for application code and documentation, and CC0-1.0 for independently generated catalog data and numerical fixtures.
- Treat the published period-41 center database as unavailable for redistribution unless its rightsholder supplies an explicit compatible data license.
- Define the catalog schema, stable identifier convention, exact rational-angle representation, provenance fields, and schema version.
- Specify a reproducible high-precision catalog-generation and exact-period-validation procedure.
- Create a small set of independently generated high-precision golden fixtures.

#### Three disposable rendering experiments

1. **Worker CPU:** render representative 512- and 768-pixel views with realistic cycle detection and cancellation.
2. **Direct WebGPU:** measure latency, numerical disagreement against sampled CPU/high-precision results, and the practical `f32` zoom limit.
3. **Perturbation tile:** compute one representative tile from a CPU reference orbit and compare it with direct high-precision samples, including rebasing or glitch behavior if encountered.

These experiments answer a decision; they are not three production renderers.

#### Budgets and decision record

Set preliminary budgets for:

- time to coarse and stable frame;
- cancellation response;
- main-thread long tasks;
- maximum render resolution and memory;
- iteration and period limits;
- numerical disagreement and unresolved behavior;
- catalog matching; and
- accessibility checks.

Record:

- the initial production rendering path;
- the preliminary zoom bound;
- why perturbation is included now, deferred, or rejected; and
- which semantic fields must be retained per pixel.

#### Phase 0 exit criteria

Phase 0 is complete when:

- the mathematical terms, status/evidence model, and v1 story are unambiguous;
- licenses and data provenance are recorded;
- catalog schema and golden-fixture procedures are reproducible;
- all three experiments have comparable measurements;
- one initial rendering path and a preliminary zoom bound are selected; and
- no unresolved external data dependency blocks the production scaffold.

### Phase 1 — focused vertical slice

Build the smallest end-to-end atlas:

- Vite application shell with strict TypeScript and vanilla DOM/CSS;
- all orbit and render work off the main thread;
- pan, point zoom, and bounded area-selection zoom;
- the Phase 0-selected renderer;
- one primary multiplier/stability view with legend;
- explicit outcome and evidence;
- selected-point inspector;
- adaptive labels for cataloged points as the view is magnified;
- plain-language definitions for multiplier, period, and stability evidence;
- Quick, Balanced, and Detailed numerical quality profiles with truthful
  unresolved treatment;
- the initial catalog and identifiers;
- worker-local semantic-frame reuse across stability, multiplier, and period views;
- progressive rendering, cancellation, and resolution cap;
- one guided first-run path;
- basic keyboard and color-vision accessibility;
- Playwright coverage, linting, and static analysis; and
- a production deployment on Cloudflare Pages with pull-request previews.

The slice should be deployable and useful on its own.

### Phase 2 — core atlas

Deepen the same story without changing its shape:

- refine multiplier, stability, and period views;
- expand the catalog only as the generation and validation process supports;
- add shareable versioned URLs;
- improve catalog navigation and explanatory annotations;
- tune palettes and legends through accessibility testing;
- optimize the selected renderer from measured profiles; and
- formalize semantic and image regression tests.

### Phase 3 — measured numerical extension

Only if Phase 0 or real use demonstrates a meaningful gap:

- productionize perturbation and rebasing;
- introduce the smallest justified high-precision CPU or WebAssembly component;
- extend the bounded zoom;
- retain explicit evidence and unresolved behavior; and
- compare the complexity and maintenance cost with the product value gained.

### Research extensions

Explore independently, promoting only work that reinforces the interior-atlas thesis:

- Significant Curves overlays;
- Sharkovsky-order relationships;
- interior distance or potential fields;
- exterior Böttcher views;
- Ecalle/Fatou boundary experiments;
- straightening and renormalization coordinates;
- larger or externally sourced catalogs with compatible licensing; and
- export formats, including SVG where the semantics suit vector output.

## 10. Open decisions

Phase 0 must resolve:

- the exact first catalog entries and naming convention;
- the initial renderer selected by the three experiments;
- preliminary zoom, resolution, period, and iteration bounds;
- how catalog matching confidence is expressed; and
- the initial accessible palette and unresolved-region treatment.

These are intentionally not open-ended framework decisions. They are bounded choices for the first release.

## 11. First-release definition of done

The first release is complete when:

- the full-set first-run story is clear without prior fractal knowledge;
- all rendering and orbit math remain off the main UI thread;
- interaction stays responsive within documented device and resolution budgets;
- multiplier and stability coloring have accurate legends;
- dynamical terms have discoverable plain-language definitions;
- point and area-selection zoom remain responsive within the deliberate bound;
- catalog labels become available when magnification makes them useful;
- quality selection changes both rendering and point-inspection budgets;
- period is available as a restrained secondary structural view;
- outcome and evidence are separately inspectable;
- unresolved results are visible and explained;
- the initial catalog is reproducible, versioned, and provenance-complete;
- internal and angled addresses are represented correctly;
- CPU, GPU, and high-precision fixtures agree within declared tolerances;
- keyboard and color-vision accessibility checks pass;
- the `MI-UX-001` through `MI-UX-016` verification objectives pass in supported current Firefox and Chrome releases; and
- the Cloudflare Pages deployment communicates its deliberate zoom bound.

Overlays, perturbation, renormalization coordinates, and an exhaustive catalog are not required for this milestone.
