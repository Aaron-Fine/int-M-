# Implementation foundation

This document records the implementation conventions for Phase 1. It is deliberately narrower than
the [project plan](PLAN.md) and the
[SysML v2 model](../model/MandelbrotInteriority.sysml): those documents define intent and
requirements, while this one defines the working boundaries and repeatable commands.

## Supported environment

- Node.js 24.18.0 LTS (`.nvmrc`)
- npm 11.16.0 (recorded in `packageManager`)
- Python 3.14.6 for the offline catalog generator and CI validation
- Current stable desktop Firefox and Chrome/Chromium
- A mainstream four-core laptop with integrated graphics as the performance baseline

The measured Phase 0 target-hardware results, preliminary budgets, renderer
decision, and reproduction commands are recorded in
[the Phase 0 benchmark report](PHASE0_BENCHMARK.md).
[ADR 0002](decisions/0002-phase-0-renderer-zoom-and-gpu-gate.md) closes the
decision with Worker CPU, a `6,000,000×` product ceiling, and explicit WebGPU
and perturbation reconsideration gates.

TypeScript is pinned to 6.0.3. TypeScript 7 is the current npm `latest`, but the current typed ESLint
release supports TypeScript only through 6.0.x. The project should move to TypeScript 7 after that
toolchain compatibility is explicit.

## Local workflow

```sh
npm ci
npm run dev
```

Vite serves the application at `http://127.0.0.1:5173`. The other common commands are:

| Command                  | Purpose                                               |
| ------------------------ | ----------------------------------------------------- |
| `npm run format`         | Format supported source and documentation             |
| `npm run format:check`   | Check formatting without changing files               |
| `npm run lint`           | Run ESLint with typed, strict TypeScript rules        |
| `npm run typecheck`      | Check UI, worker, Node, and browser-test projects     |
| `npm run catalog:check`  | Independently regenerate and validate catalog data    |
| `npm run fixtures:check` | Regenerate high-precision orbit fixtures              |
| `npm run evidence:cpu`   | Measure the CPU renderer and print environment data   |
| `npm run test:unit`      | Run deterministic unit and worker tests               |
| `npm run test:browser`   | Run end-to-end tests in Chromium and Firefox          |
| `npm run build`          | Type-check and create production assets in `dist/`    |
| `npm run build:assets`   | Create assets after an already-successful type-check  |
| `npm run preview`        | Serve the production build at `http://127.0.0.1:4173` |
| `npm run check`          | Run the fast local pre-PR checks                      |

Install Playwright's managed browsers once on a development machine:

```sh
npx playwright install chromium firefox
```

`npm run test:unit` and `npm run test:browser` contain the deterministic domain, worker, and
interaction checks for the current vertical slice.

## Architecture boundaries

The browser main thread owns DOM interaction, accessibility, viewport intent, and presentation. It
must not run orbit iteration, per-pixel classification, or palette mapping. The rendering worker
owns numerical work, cancellation, progress, semantic frame storage, and raster production. Only
colorized RGBA frames cross back to the UI; the view-independent semantic arrays stay worker-local.
The message protocol between the threads is a domain boundary, not an incidental serialization of
UI state.

The intended dependency direction is:

1. Domain types and pure numerical functions depend on no browser UI.
2. The worker depends on domain and numerical modules.
3. The UI depends on domain contracts and the worker client, but not worker implementation modules.
4. The three current interior views consume the same semantic frame. Changing the view recolors the
   current coarse or stable frame without restarting orbit classification.
5. Catalog identifiers and mathematical evidence remain distinct. A label may be attached only
   when the available evidence supports it, and unresolved points remain explicit.

The Phase 1 semantic frame uses full-raster typed arrays for status, detected period, smooth escape
iteration or multiplier magnitude, and multiplier angle. A bounded, single-entry store retains only
the current stable frame. Its key includes an explicit semantic-algorithm version, canonical
viewport, raster size, and resolved quality limits; it deliberately excludes the selected interior
view. Navigation, resolution, quality, or algorithm changes invalidate the entry. If the view
changes during classification, the worker keeps the same computation and applies the newest view to
subsequent frames.

Selected-point inspection remains a separate computation. The selected coordinate need not be the
center of a sampled raster pixel, and the inspector returns richer evidence than the compact
full-frame representation.

Separate TypeScript configurations enforce different ambient environments for application and worker
code. `tsconfig.app.json` supplies DOM types; `tsconfig.worker.json` supplies Web Worker types. Shared
math and protocol modules should stay free of both environments where practical.

Phase 1 uses the binary64 CPU implementation inside a replaceable module Worker. The UI worker
client retains the current render and point-inspection intent, automatically recreates the Worker
once after a consecutive worker, message-decoding, or reported render failure, and then exposes a
nonblocking manual retry instead of entering a restart loop. A future GPU or WebAssembly
implementation must satisfy the same protocol, preserve the CPU path as its automatic fallback,
and must not leak renderer-specific state into the UI.

Selected coordinates use viewport-aware display precision. The number of displayed decimal places
is derived from the vertical units per raster pixel, retains one guard digit so adjacent selectable
samples remain distinguishable, and is capped at 15 decimal places for binary64. This policy avoids
implying fixed sub-raster precision at the full-set view while allowing appropriately finer
coordinates at higher magnification. Catalog source coordinates remain stored independently at
their canonical data precision.

## Testing boundaries

- Verification is layered. Pure domain mathematics uses deterministic inputs
  and declared numerical tolerances; worker tests verify message ordering,
  cancellation, and evidence-budget propagation; browser tests verify
  user-visible invariants rather than incidental pixel-perfect values. For
  example, rectangle fitting is checked numerically in unit tests, while
  Playwright checks that a visible selection meaningfully increases
  magnification, enables reset, reveals the appropriate labels, and starts a
  replacement render.
- Unit tests should cover pure complex arithmetic, viewport transforms, orbit/classification rules,
  catalog matching, cancellation state, and protocol validation.
- Worker tests should verify progressive/coarse-to-stable messages, semantic-frame reuse and
  in-progress view coalescing, and rejection of work superseded by different dynamics.
- Playwright tests should cover the first-use render, reset, bounded zoom feedback, semantic legend,
  keyboard operation, arbitrary-point inspector evidence, bounded worker recovery, and manual retry.
  Record immediate pointer-pan feedback and pointer-cancel rollback in the manual release-browser
  evidence because CI's synthetic pointer path does not expose that intermediate state reliably.
- Numerical fixtures must state their provenance and tolerances. Independently generated fixtures
  intended for reuse belong under CC0-1.0; application tests remain GPL-3.0-only.
- Performance assertions should use broad budgets and recorded hardware context. Avoid making CI
  timing on shared runners the normative performance measurement.

## Continuous integration

`.github/workflows/ci.yml` runs two jobs for pull requests and changes to `main`:

- static checks, unit tests, and a production build;
- Playwright tests against current managed Chromium and Firefox binaries.

The jobs use `npm ci` and the checked-in lockfile. Failed browser runs upload their Playwright report;
successful quality runs retain the built `dist/` directory briefly for inspection. Branch protection
should require both jobs before merge.

## Cloudflare Pages

Cloudflare Pages can deploy the Vite output without Workers or a Wrangler configuration. Connect the
GitHub repository and use these project settings:

| Setting                | Value                                            |
| ---------------------- | ------------------------------------------------ |
| Production branch      | `main`                                           |
| Build command          | `npm run build`                                  |
| Build output directory | `dist`                                           |
| Root directory         | repository root                                  |
| Node version           | `24.18.0` via `.nvmrc` or `NODE_VERSION=24.18.0` |

Enable preview deployments for pull requests. Do not store secrets in Vite `VITE_*` variables: all
such variables are compiled into client assets. The application is intended to remain a fully static
site, so no runtime secret should be necessary.

`public/_headers` adds conservative browser security headers to the deployed assets. If a later
WebAssembly renderer uses shared memory, add and test
`Cross-Origin-Embedder-Policy: require-corp` alongside the existing opener policy; that change can
affect externally loaded resources and should not be made speculatively.

## Requirements traceability

This foundation directly supports:

| Requirement or decision     | Foundation support                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------- |
| MI-UX-001 through MI-UX-006 | Vite entry point, first-use browser-test boundary, and production build               |
| MI-UX-007 through MI-UX-009 | Main-thread/worker separation, point/area navigation, and interaction tests           |
| MI-UX-010 through MI-UX-012 | Semantic boundary, adaptive labels, definitions, and evidence tests                   |
| MI-UX-013                   | Explicit worker progress, error, and cancellation responsibility                      |
| MI-UX-014                   | Replaceable Worker lifecycle, bounded recovery, manual retry, and future CPU fallback |
| MI-UX-015 and MI-UX-016     | Firefox/Chromium coverage plus keyboard/accessibility test boundary                   |
| Phase 1 deployment          | Reproducible Vite build and documented Cloudflare Pages settings                      |
| Phase 1 quality             | Strict TypeScript, ESLint, Prettier, Vitest, Playwright, and required CI              |

These entries establish the verification hooks; they do not claim that the user-visible requirement
is satisfied before the corresponding behavior and tests exist.
