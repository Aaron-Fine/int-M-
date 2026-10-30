# Closure tolerance inside the zoom bound — 2026-10-29 @ c5da7c3

Evidence for Decision 1 of [ADR 0015](../../../docs/decisions/0015-verifier-closure-tolerance-and-zoom-bound.md):
the absolute `1e-8` closure tolerance does not accept an escaping point as
attracting inside the 6,000,000× zoom bound. It replaces the scratch probe
the ADR cited with a committed, reproducible comparison.

**Result: 0 false interiors inside the bound** (5,389 attracting verdicts
checked, none escapes within 4× the iteration budget). The controls beyond
the bound reproduce the ADR's known false interiors (9), so the comparison can
detect them.

## Method

- **Production:** `classifyOrbit` from `src/domain` at commit `c5da7c3`, with
  the quality profile of each case (Balanced: 512 iterations, period ≤ 32;
  Detailed: 1,024 iterations, period ≤ 64). `tools/closure_tolerance_production.ts`
  computes each sample's parameter `c` with the renderer's own pixel-centre
  mapping (`createViewportTransform`) at the shipping 1024×640 raster, so the
  oracle sees the exact binary64 value production classified.
- **Oracle:** `iterate_pixel` of `tools/perturbation_oracle.py`, driven by
  `tools/closure_tolerance_compare.py`. Direct rectangular interval iteration
  of `z → z² + c` from `z = 0` on an exact dyadic grid with outward rounding;
  no reference orbit, no floating point. It certifies escape (`|z|² > 4` for
  the whole box) and the escape iteration.
- **Why this oracle, not the double-double one** (`tests/unit/domain/dd-oracle.ts`):
  the dd oracle is a second _classifier_ with its own tolerances (acceptance
  `1e-26`, Newton polish, lag proposals). A disagreement would mix two
  policies and two arithmetics, and dd precision (about `1e-32`) is itself a
  rounded method. The interval oracle shares no code, arithmetic or tolerance
  with production and gives proofs, not estimates: when it certifies escape,
  the point escapes. That is exactly the false-interior question ("production
  says attracting; the point escapes"). It cannot certify an attracting
  cycle, nor give a period, so it is silent on period correctness; that is
  covered by the existing dd adjudication evidence.
- **Horizon:** a production escape or unresolved verdict is checked for the
  case's `maxIterations`. A production attracting verdict is checked for **4×**
  `maxIterations` (2,048 or 4,096), so a transient that escapes after the
  production budget is still caught. Grid ladder: 1,200 bits; a sample whose
  interval box straddles the escape radius (outward-rounding growth, which at
  1,200 bits sets in near iteration 2,900) is re-run at 4,096 bits. No sample
  ended inconclusive.
- **Sampling:** every 16th pixel in both axes (offset 8; 64×40 = 2,560 pixels,
  1/256 of the raster) of the five corpus views below, and every pixel of the
  tiles. Deterministic; no randomness.

## Covered

| Target                                                | Magnification | Profile  | Samples | Production: escaped / attracting / unresolved |
| ----------------------------------------------------- | ------------: | -------- | ------: | --------------------------------------------- |
| `mi-scale-6mx-basilica-rim` (corpus, the bound)       |    6,000,000× | Balanced |   2,560 | 0 / 2,560 / 0                                 |
| `mi-fallback-unknown-high-period`                     |      250,000× | Balanced |   2,560 | 2,341 / 0 / 219                               |
| `mi-fallback-budget-exhaustion`                       |        2,500× | Balanced |   2,560 | 1,699 / 86 / 775                              |
| `mi-hard-supplied-609x`                               |          609× | Detailed |   2,560 | 2,418 / 130 / 12                              |
| `mi-fallback-weak-attraction`                         |          500× | Balanced |   2,560 | 0 / 2,560 / 0                                 |
| `tile-p34-step-2^-31` (48×48 around the p34 minibrot) |   bound pitch | Detailed |   2,304 | 2,300 / 1 / 3                                 |
| `tile-p61-step-2^-31`                                 |   bound pitch | Detailed |   2,304 | 2,303 / 1 / 0                                 |
| `tile-p25-step-2^-26`                                 |  inside bound | Detailed |   2,304 | 2,214 / 51 / 39                               |
| `tile-p34-step-2^-31-balanced`                        |   bound pitch | Balanced |   2,304 | 2,299 / 0 / 5                                 |
| Controls (beyond the bound), four 32×32 tiles         |  2^-33, 2^-40 | Detailed |   4,096 | see below                                     |

The tile pitch `2^-31` is the 6,000,000× bound at an 895 px raster height
(`2.5 / 6e6 / 2^-31`). At the shipping 640 px height the bound's pitch is
about `2^-30.5`, so these tiles are as deep as, or slightly deeper than, the
shipping raster at the bound. The tile references are the pilot's
(`INTERIOR_TILES` in `tools/perturbation_oracle.py`), binary64 values near the
period-34, period-61 and period-25 minibrots.

## Counts

Inside the bound (the 5 corpus views and the 4 tiles; 22,016 pixels classified):

| Category                                                     | Corpus views | Tiles |
| ------------------------------------------------------------ | -----------: | ----: |
| (a) **False interior** (attracting, oracle certifies escape) |        **0** | **0** |
| Attracting, oracle: no escape within 4× budget               |        5,336 |    53 |
| Both escape, same iteration                                  |        6,455 | 9,109 |
| (b) Both escape, **different iteration**                     |            2 |     7 |
| (c) Production escaped, oracle: no escape within budget      |            1 |     0 |
| (c) Oracle inconclusive (interval blow-up at 4,096 bits)     |            0 |     0 |
| (c) Production unresolved, oracle certifies escape           |            0 |     0 |
| Production unresolved, oracle: no escape in budget           |        1,006 |    47 |

(b) Escape iteration shift, production minus oracle, as `shift: pixels`:

- Corpus views: `-40: 1`, `-3: 1` (and `0: 6,455`).
- Tiles: `-1: 1`, `+1: 4`, `+2: 1`, `+4: 1` (and `0: 9,109`).

The shifts are binary64 rounding in the production orbit against the exact
orbit. The one "escape not confirmed" pixel
(`mi-fallback-unknown-high-period` at pixel (344, 136): production escaped at
iteration 423, the exact orbit has not escaped by 512) is the same effect at
a larger distance: both are escape-versus-not verdicts, never an interior
claim. None changes a status.

No period comparison is possible with this oracle (it certifies escape only),
so (c) has no period mismatches to count; the attracting pixels are confirmed
only as "no escape within 4× the budget".

### Controls beyond the bound (not a finding)

| Control        | Samples | Production attracting | False interiors | Escape iteration shifts (pixels) |
| -------------- | ------: | --------------------: | --------------: | -------------------------------: |
| p34 at `2^-33` |   1,024 |                    34 |               1 |                                2 |
| p61 at `2^-33` |   1,024 |                     1 |               0 |                                4 |
| p34 at `2^-40` |   1,024 |                 1,024 |               0 |                                0 |
| p61 at `2^-40` |   1,024 |                    30 |               8 |                               36 |

The 9 false interiors all have the signature ADR 0015 records: period 34 or
61, `|λ|` from 0.34 to 0.98, accepted at an early cycle start (iterations 72
to 987), the exact orbit escaping at iteration 658 to 3,916. Shifts reach
`-32`, `-31`, `+19` and `+45` iterations (full histogram in
`comparison.json`). This is the reference behavior beyond the bound; it shows
the harness sees a false interior when one exists.

## Limits

- **A subsample, not the full raster.** The corpus views use 1/256 of their
  pixels. Absence of a false interior in the sample is evidence, not proof.
- **Two corpus views are all-attracting** (the bound view and
  `mi-fallback-weak-attraction`), so they test the interior side only: 5,120
  attracting verdicts, none escapes within 4× the budget. The bound view's
  centre (-1.25) is the period-doubling point of the period-2 bulb, so an
  attracting cycle fills its `4e-7` span.
- **Minibrot tiles at the bound hold few attracting pixels** (1, 1, 0, and 51
  at `2^-26`). The references are binary64 values just off the minibrots, so
  inside the bound there is little interior to test; the controls keep the
  harness honest.
- The oracle certifies escape; a pixel it leaves "bounded" is not proved
  attracting.

## Reproduce

```
npm run evidence:closure-tolerance -- evidence/phase-2/2026-10-29-c5da7c3-closure-tolerance --stride 16
npm run evidence:closure-tolerance:compare -- evidence/phase-2/2026-10-29-c5da7c3-closure-tolerance --workers 6
```

The first command writes `production.json` (4,236,886 bytes, SHA-256
`637196502d8420776bb489e05464d17ff1a53bbf4c209292ee69b929b56fb62b`), which
this directory does not keep: every sample in it is in `samples.csv`. The
second reads it. Both steps are deterministic.

Files: `comparison.json` (counts per target and kind, histograms, every
disagreement), `samples.csv` (one row per sample: `c`, production verdict,
oracle verdict, grid bits, category), `environment.json`, `manifest.sha256`.
