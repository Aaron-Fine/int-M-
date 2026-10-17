# Fixtures

Every committed fixture, what it pins, and how it is checked. `npm run check`
runs every gating check listed here.

| Fixture                                                     | Kind                    | Pins                                                                                                                     | Checked by                                                                    |
| ----------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `orbits.v1.json`                                            | Independent reference   | Status, period, escape iteration and multiplier of chosen points, from a Python `Decimal` generator                      | `npm run fixtures:check`; `tests/unit/domain/orbit-fixtures.test.ts`          |
| `kernel-golden.v1.json`                                     | Golden                  | SHA-256 of the classifier's output channels for every frozen-corpus case at 160×100 (ADR 0007)                           | `tests/unit/render/kernel-golden.test.ts`; `npm run fixtures:golden:check`    |
| `colorized-golden.v1.json`                                  | Golden (the image gate) | SHA-256 of the colorized RGBA bytes of each semantic view on three views, plus one isolated period (Q6, `MI-VER-UX-006`) | `tests/unit/render/colorized-golden.test.ts`; `npm run fixtures:golden:check` |
| [`../catalog/components.v2.json`](../catalog/README.md)     | Independent reference   | Catalog centres, combinatorics, residuals and ids (ADR 0011)                                                             | `npm run catalog:test`; `npm run catalog:check`; `tests/unit/catalog/`        |
| [`../tests/visual/__screenshots__/`](#advisory-screenshots) | Advisory baseline       | Browser screenshots of three views and two UI states in Chromium and Firefox                                             | `npm run test:visual:container` only; never gating                            |

The frozen benchmark corpus (`tools/benchmark/corpus.v1.json`) is an input,
not a fixture; it changes only under
[PERFORMANCE-CORPUS.md](../docs/verification/PERFORMANCE-CORPUS.md).

## Golden fixture policy

An **independent reference** is computed by a separate implementation from
first principles. When the code disagrees with it, the code is wrong unless
the reference's own generator is shown to be wrong. A **golden** records what
the code produced at a reviewed commit. It is not evidence of correctness; it
makes every change to an output visible and deliberate.

1. **When.** A golden changes only in the commit that changes the behaviour it
   pins, never in a separate "update fixtures" commit and never to make an
   unrelated change pass.
2. **Who.** The owner, or an agent whose task (a plan step or an ADR) names the
   fixture as an expected change. An implementer whose change unexpectedly
   alters a golden stops and reports the failing cases; it does not
   regenerate.
3. **Evidence.** A changed kernel golden needs oracle evidence for every
   changed pixel (ADR 0007; ADR 0010's adjudication is the precedent). A
   changed colorized golden whose kernel golden is unchanged is a palette or
   colorizer change: the palette acceptance tests (`tests/unit/palette/`) must
   pass, `npm run evidence:palette` is rerun and recorded under
   `evidence/phase-2/`, and the advisory screenshots of the affected views
   are regenerated in the same commit so the reviewer sees the pixels.
4. **Record.** The commit message names the fixture, the cases that changed
   and why. The generator writes `generatedFrom` (the commit it ran on). An
   answer change (a pixel's status, period or evidence) also needs an ADR or
   an ADR amendment, as ADR 0010 did. The reviewer checks that the fixture
   diff names only the cases the change explains.
5. **Tolerance.** Goldens compare exact bytes through SHA-256: the tolerance
   is zero. Independent references declare their own tolerances (the orbit
   fixtures' binary64 multiplier tolerance is in their test).

Regenerate a golden with `npm run fixtures:kernel-golden` or
`npm run fixtures:colorized-golden`; add `-- --check` to compare without
writing. The catalog regenerates with
`python3 tools/generate_catalog.py --write catalog/components.v2.json`, and
its curated part (`catalog/curation.v2.json`) changes only by owner review.

## Colorized-buffer goldens

`colorized-golden.v1.json` is the image-regression gate the owner chose (Q6).
Each case classifies a frozen-corpus view at the kernel golden's raster
(160×100) with the production row kernel, colorizes it with `colorizeFrame`,
and hashes the RGBA bytes:

- views: the default full-set view (`mi-easy-default-full`), the 126×
  period-4 neighbourhood (`mi-hard-supplied-126x`) and the 2,500× Feigenbaum
  view (`mi-fallback-budget-exhaustion`);
- semantic views: stability, multiplier and period, plus the default view's
  period view with period 2 isolated.

Period-view cases also record their emphasized periods, so a failure shows
whether the period key changed. When this golden fails and the kernel golden
passes, only the colours changed.

## Advisory screenshots

`tests/visual/` compares browser screenshots against baselines in
`tests/visual/__screenshots__/<engine>/`: the three golden views (stability,
period and multiplier respectively), the catalog overlay, and a selected
marker with its evidence panel. They are written and compared only in the
pinned Playwright container, because fonts and anti-aliasing differ between
hosts:

```sh
npm run test:visual:container                          # compare
npm run test:visual:container -- --update-snapshots=all # rewrite the baselines
```

The suite has its own configuration (`playwright.visual.config.ts`), so
`npx playwright test` and `npm run check` never run it, and CI runs it in a
separate job that cannot fail the build (`continue-on-error`). A difference
is a prompt to look at the report (`playwright-report-visual/`), not a
failure. Commit new baselines with the change that explains them.

## Orbit fixtures

`orbits.v1.json` is an independently generated high-precision reference set for
the binary64 TypeScript classifier. It covers:

- an escaped point;
- exact period-one and period-two centers;
- ordinary off-center period-three and period-four attracting points;
- period-three points near the airplane cusp, near the rabbit's boundary
  (|λ| = 0.99) and at the weak-attraction corpus centre, which the analytic
  period-3 path answers (ADR 0010), and a period-six point of the rabbit's
  satellite inside that path's gate box, which it must not answer; and
- a known parabolic boundary point that must remain unresolved within the
  declared finite budget.

Regenerate and compare the committed data with:

```sh
npm run fixtures:check
```

The generator uses Python `Decimal` arithmetic at 80 decimal digits and does
not call the TypeScript classifier. Known attracting periods are declared as
fixture inputs; the generator independently iterates to a closed cycle and
computes its multiplier. The TypeScript unit test then compares status, period,
escape iteration, and multiplier magnitude within the declared binary64
tolerance. Cases that pin an acceptance path carry `expectedEvidence`, which the
test compares with the result's evidence flags (generated, not hand-added).

These fixtures are useful cross-implementation evidence, not a proof that
every boundary point is correctly classified.

## Retired fixtures

- `orbit-raster-regression.v1.json` (2026-10-04, `138a31b`): per-viewport
  digests of the reference `OrbitClassifier`. Its test was removed with the
  reference kernels; the kernel golden replaced it (ADR 0007), and its digests
  no longer match after the analytic period-3 path (ADR 0010). Deleted
  2026-10-17; recover it from `138a31b` if needed.

The fixture data is dedicated to the public domain under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/); the generators
and tests remain GPL-3.0-only.
