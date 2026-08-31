# Phase 2 frozen benchmark corpus (v1)

This document is the human-readable spec for the machine-readable corpus in
[tools/benchmark/corpus.v1.json](../../tools/benchmark/corpus.v1.json), which
[tools/benchmark/validate-corpus.ts](../../tools/benchmark/validate-corpus.ts)
validates (CI runs the validation via
[tests/unit/benchmark/corpus.test.ts](../../tests/unit/benchmark/corpus.test.ts);
a CLI wrapper lives at `tools/benchmark/validate-corpus-cli.mjs`). The corpus
freezes the required benchmark classes of the performance plan §9. Case IDs and
viewport parameters are frozen: changing geometry, profile, designation, or
stratum tags invalidates comparisons against earlier evidence and requires a new
corpus version (`schemaVersion` bump and a new document section).

## Coordinate conventions

- A case is a **center plus an authoritative `spanY`**, matching the
  application's `Viewport` model. The horizontal span follows the raster
  aspect: `spanX = spanY · width / height`. For the shipping 1024×640 raster
  `spanX = 1.6 · spanY`; for the square diagnostic rasters `spanX = spanY`.
- Coordinates are **exact decimal strings** in the JSON. They are never
  round-tripped through binary64 inside the manifest; a run parses each string
  once into a `Viewport` and records that parse as part of the run.
- **Magnification** is `2.5 / spanY`, where 2.5 is the default viewport span
  (`DEFAULT_VIEWPORT.spanY`). Truncated decimal spans (the three supplied hard
  views and the 6,000,000× Scale case) are truncations or roundings of the
  exact rational `2.5 / magnification`, noted per case.
- Rasters: `shipping-1024x640` (the product viewport) plus diagnostic
  `diagnostic-768` (768²) and `diagnostic-1024` (1024²).

## Cases

| ID                                | Class      | Center (re, im)                         | spanY                     | ≈ mag      | Profile  | Designation  |
| --------------------------------- | ---------- | --------------------------------------- | ------------------------- | ---------- | -------- | ------------ |
| `mi-easy-default-full`            | Easy       | −0.75, 0                                | 2.5                       | 1×         | Balanced | screening    |
| `mi-easy-exterior-heavy`          | Easy       | 2.5, 1                                  | 2                         | 1.25×      | Balanced | screening    |
| `mi-easy-main-cardioid`           | Easy       | 0.1, 0.05                               | 0.2                       | 12.5×      | Balanced | screening    |
| `mi-easy-period2-bulb`            | Easy       | −1.05, 0.05                             | 0.15                      | ~16.7×     | Balanced | screening    |
| `mi-hard-rabbit-boundary`         | Hard known | −0.1225611668766535, 0.7448617666197435 | 0.3                       | ~8.3×      | Balanced | release-gate |
| `mi-hard-supplied-126x`           | Hard known | −0.158902249, −1.034028                 | 0.019841269841269841269   | 126×       | Detailed | release-gate |
| `mi-hard-supplied-609x`           | Hard known | −1.94130973, −0.0000974722949           | 0.0041050903119868637110  | 609×       | Detailed | release-gate |
| `mi-hard-supplied-13x`            | Hard known | 0.305376533, 0.552677981                | 0.19230769230769230769    | 13×        | Detailed | release-gate |
| `mi-fallback-unknown-high-period` | Fallback   | −0.7436438870371587, 0.1318259042053119 | 0.00001                   | 250,000×   | Balanced | release-gate |
| `mi-fallback-weak-attraction`     | Fallback   | −0.1205, 0.8268                         | 0.005                     | 500×       | Balanced | release-gate |
| `mi-fallback-ambiguous-boundary`  | Fallback   | 0.3, 0.008                              | 0.02                      | 125×       | Balanced | release-gate |
| `mi-fallback-budget-exhaustion`   | Fallback   | −1.401155189092, 0                      | 0.001                     | 2,500×     | Balanced | release-gate |
| `mi-scale-6mx-basilica-rim`       | Scale      | −1.25, 0                                | 0.00000041666666666666667 | 6,000,000× | Balanced | release-gate |

The three `mi-hard-supplied-*` cases are the supplied hard views. Per plan §9
they are recorded here as exact center+span seeds, not as screenshot
approximations. Their `spanY` strings are the 20-significant-digit truncations
of 2.5/126, 2.5/609, and 2.5/13 respectively.

### Why each case exists

**Easy** protects startup and common navigation (plan §9). All four are
screening cases; they are the cheap control arm of every paired run.

- `mi-easy-default-full` — the application's default first viewport. A balanced
  mix: cheap exterior, catalog periods, and boundary filaments.
- `mi-easy-exterior-heavy` — a far-field rect entirely outside the set. Every
  sampled pixel escapes within a few iterations; this is the floor of the
  workload envelope.
- `mi-easy-main-cardioid` — a rect verified fully inside the main cardioid.
  Every sampled pixel classifies through the analytic period-1 path.
- `mi-easy-period2-bulb` — a rect verified fully inside the period-2 disk
  {|c + 1| < 1/4}. Every sampled pixel classifies through the analytic period-2
  path.

**Hard known** exercises long-lived interior orbits and the current complaint
surface. The rabbit case carries the curated catalog into the gate; the three
supplied views are measured at Detailed because they anchor the worst declared
hard-view budget. All are release-gate cases.

- `mi-hard-rabbit-boundary` — centered on catalog `mi-p3-rabbit`, widened until
  the view contains the rabbit interior _plus_ its boundary filaments and the
  surrounding exterior (a tight span would be pure interior and would not
  exercise the boundary).
- `mi-hard-supplied-126x` — near catalog `mi-p4-03`; a period-doubling tower
  p4→p28 with a persistent unresolved band.
- `mi-hard-supplied-609x` — near catalog `mi-p4-01`; mostly slow-escaping
  near-boundary exterior with a p4–p20 attracting fraction.
- `mi-hard-supplied-13x` — near catalog `mi-p4-06`; the widest mix, including
  near-parabolic pixels whose accepted multiplier magnitude reaches 1.0 at
  sample precision.

**Fallback** ensures heuristics fail safely and cheaply (plan §9). All are
release-gate cases at Balanced, the default heuristic budget.

- `mi-fallback-unknown-high-period` — Seahorse Valley at 250,000×, far beyond
  any cataloged component. No attracting cycles are detected at all; the
  workload is slow-escaping boundary and budget exhaustion.
- `mi-fallback-weak-attraction` — the period-6 satellite capping the Douady
  rabbit's far internal ray (the ray from the rabbit's catalog center away from
  its cardioid root). ~97% of sampled pixels are attracting period-6 with
  accepted multiplier magnitudes up to ~0.81; orbits with |λ| approaching 1
  correctly stay unresolved, which is itself the fallback behavior under test.
  The chosen coordinates were located by scanning the internal ray with the
  checked-in classifier; the closure-acceptance rules cap the weakest accepted
  attraction near |λ| ≈ 0.81 in this region.
- `mi-fallback-ambiguous-boundary` — the Elephant Valley filament comb at
  (0.3, 0.008): status flips between neighboring pixels, with slow-escape
  exterior, high-period filament attractors (p15–p32), and a thin unresolved
  fraction.
- `mi-fallback-budget-exhaustion` — the neighborhood of the Feigenbaum
  period-doubling accumulation point on the real axis: ~30% of sampled pixels
  exhaust the Balanced budget, and the only detected cycles sit at the
  period-32 cap.

**Scale** protects the declared product zoom envelope (plan §9).

- `mi-scale-6mx-basilica-rim` — `spanY` is the decimal rounding of the exact
  rational 1/2,400,000, i.e. exactly 6,000,000× against the 2.5 default span,
  the product's declared `MAX_MAGNIFICATION`. The center is the basilica
  disk's 1/2-parabolic point (−5/4, 0) — an exact rational coordinate, chosen
  because the disk boundary is locally vertical there: the shipping raster
  splits deterministically into ~50% analytic period-2 interior and ~50%
  near-parabolic exterior that exhausts the budget.

### Stratum evidence

The stratum tags describe the **expected workload stratum** of each case. They
were verified by sampling each shipping raster (stride ≤ 12 in each axis) with
the checked-in classifier at the case's designated profile. Representative
measured distributions (Balanced unless noted; non-normative, recorded to
justify the tags):

- `mi-easy-default-full`: 85% escaped, 14% attracting (periods 1–21), 0.5%
  unresolved.
- `mi-easy-exterior-heavy`: 100% escaped, ≤ 3 iterations.
- `mi-easy-main-cardioid`: 100% analytic period-1.
- `mi-easy-period2-bulb`: 100% analytic period-2.
- `mi-hard-rabbit-boundary`: 64% escaped, 29% attracting (p3 dominant, p1–p27),
  6% unresolved.
- `mi-hard-supplied-126x` (Detailed): 84% escaped, 11% attracting (p4, p8, p12,
  p16–p28), 5% unresolved.
- `mi-hard-supplied-609x` (Detailed): 95% escaped, 4% attracting (p4–p20), 2%
  unresolved.
- `mi-hard-supplied-13x` (Detailed): 72% escaped, 24% attracting (p1, p4, p8,
  p12 and higher), 4% unresolved.
- `mi-fallback-unknown-high-period`: 91% escaped (slow), 9% unresolved, no
  detected cycles.
- `mi-fallback-weak-attraction`: 97% attracting p6 (|λ| up to 0.81), 3%
  unresolved.
- `mi-fallback-ambiguous-boundary`: 96% escaped (slow tail to the budget), 3%
  attracting (p15–p32), 1% unresolved.
- `mi-fallback-budget-exhaustion`: 67% escaped, 30% unresolved, 3% attracting
  at the period-32 cap.
- `mi-scale-6mx-basilica-rim`: 50% unresolved, 50% analytic period-2.

## Protocol summary

The full protocol is normative in the performance plan §9; the corpus fixes the
repetition counts and the case split:

- **Screening cases** (the Easy set): 9–11 paired repetitions, full-corpus
  median comparisons.
- **Release-gate cases** (Hard known, Fallback, Scale): at least 21 paired
  repetitions.
- Any reported **p95** requires at least 40 observations.
- **Cancellation distributions** require at least 50 interactions.
- Every sample is stored; aggregates are derived, never primary.
- Report median, median absolute deviation, paired interval, min/max, and p95
  only with adequate samples. Paired intervals are 95% BCa bootstrap intervals
  on paired per-case differences (log-ratios for speed ratios) with the
  resampling seed recorded in the manifest.
- Runs use the production bundle (`vite build` + `vite preview`), current
  stable branded Chrome and Firefox, DevTools closed, with the environment
  record captured by `tools/benchmark/capture-environment.mjs`.
- Separate cold page/process, cold worker/Wasm compile, cold semantic cache,
  warm code/pool, computed, cache, replay, and recolor cases.
- Randomize or alternate baseline/candidate order; a single run does not
  establish a ship claim.

## Stratified holdout policy

Catalog work must not overfit the frozen named cases (plan §9). The corpus
therefore defines a deterministic stratified holdout over the nine workload
strata: `exterior`, `periods 1–4`, `periods 5–8`, `periods 9–12`,
`uncataloged/higher-period`, `weak attraction`, `boundary`,
`high-unresolved`, and `simd-divergent`.

- **Holdout sample rule.** For each case and raster, the holdout set is the
  pixels whose row-major index `y · width + x` is divisible by the prime 97
  (≈ 6,756 pixels on the shipping raster). The rule is fixed, seedless, and
  reproducible from the JSON alone.
- **Use.** Semantic comparison evidence compares holdout pixels against the
  independent high-precision oracles (status, primitive period, residual,
  multiplier, and expected ambiguity). Continuous evidence is compared by
  tolerances and distributions; discrete fields are hashed with documented
  byte order.
- **Overfit guard.** A catalog patch or classifier change is accepted only if
  holdout disagreement does not increase in any stratum (semantic change cap:
  unresolved-rate increase ≤ 0.1 percentage point unless oracle-supported and
  explicitly approved). Holdout pixels are never used to tune parameters.
- **Coverage.** The validator requires every stratum to be tagged by at least
  one case; the table above shows the current coverage. The validator also
  requires every plan §9 class (Easy, Hard known, Fallback, Scale) to be
  present.

### Catalog class (reserved)

The plan §9 Catalog class ("Representative period 8, period 12, loaded
high-period patch hit, cold/warm shard states") is **conditional on workstream
F or G shipping**. It is intentionally absent from corpus v1; if the condition
fires, add the cases as `class: "Catalog"` in a new corpus version rather than
editing frozen entries.
