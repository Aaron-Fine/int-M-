# SysML v2 model

This directory contains the compact systems model for Mandelbrot Interiority.
It exists to make the product requirements, proposed logical architecture, and
verification intent reviewable alongside the implementation.

The model is intentionally small. It does not model TypeScript classes, source
files, detailed shader pipelines, palette values, or speculative research
features.

## Model organization

[`MandelbrotInteriority.sysml`](MandelbrotInteriority.sysml) contains:

- `SystemContext` — the user, browser, static host, and development context;
- `Architecture` — the proposed main-thread UI, rendering worker, numerical
  services, catalog, and offline generation toolchain;
- `UserExperienceRequirements` — the sixteen baselined Phase 1 UX
  requirements;
- `RequirementSatisfaction` — proposed allocation of those requirements to
  logical components; and
- `Verification` — grouped verification cases that cover every UX
  requirement.

The requirements are normative for Phase 1. Phase 0 selected the Worker CPU
production numerical path, the worker-internal semantic boundary, and the
`6,000,000×` product ceiling. Architecture for later WebGPU and perturbation
paths remains proposed and is governed by
[ADR 0002](../docs/decisions/0002-phase-0-renderer-zoom-and-gpu-gate.md).

## Default experience

The model defines the initial experience as:

- full-set viewport;
- stability view;
- balanced quality profile;
- pan pointer tool, with an explicit zoom-area alternative;
- the selected Worker CPU renderer with bounded automatic worker recovery;
- essential catalog markers;
- system-preferred theme; and
- an inspector that opens when the user selects a point.

The intended first-use sequence is a truthful coarse silhouette followed by
progressive stability refinement. No splash screen, configuration dialog, or
blocking tutorial is required.

Users may switch among Quick, Balanced, and Detailed numerical budgets.
Balanced remains the first-use default; unresolved always means that the
selected budget did not support a stronger claim.

## Semantic tile boundary

`SemanticTile` is the worker-internal, palette-independent result of numerical
classification. The model explicitly carries it from `OrbitEngine` through
`SemanticTileStore` to `PaletteMapper`. The store retains the current stable
result so a change of interior view can recolor existing semantics instead of
recomputing the orbit data.

`PaletteMapper` converts that semantic data into a `ColorizedFrame`. Only the
colorized frame crosses `UIWorkerPort` to the main-thread UI; the larger typed
semantic buffers remain off the UI thread. The Phase 1 implementation may use
one full-viewport semantic tile. The same boundary permits later subdivision
into multiple tiles without requiring that complexity now.

## Language baseline

The textual model targets OMG SysML v2 and the
[`2026-05` SysML v2 Release](https://github.com/Systems-Modeling/SysML-v2-Release/releases/tag/2026-05).
That release contains the current textual notation, standard libraries,
examples, and pilot implementation.

The source is kept in one file for simple Git review and broad tool import.
Split packages into separate files only when the model becomes difficult to
navigate.

## Validation

Before a requirement baseline is merged:

1. check that every requirement has a stable short identifier;
2. check that every requirement is covered by a verification objective;
3. check satisfaction paths against the proposed architecture;
4. parse the model with a compatible SysML v2 tool pinned to the recorded
   language baseline; and
5. review requirement wording independently of parser conformance.

Parser conformance does not establish that a requirement is useful, testable,
or correctly allocated. Those remain engineering-review decisions.

## Relationship to other documentation

- [`docs/PLAN.md`](../docs/PLAN.md) provides the product narrative, phase
  boundaries, and delivery sequence.
- [`docs/RESEARCH.md`](../docs/RESEARCH.md) records mathematical and technical
  rationale.
- This model supplies stable requirement identifiers and explicit
  requirement-to-architecture-to-verification traceability.
