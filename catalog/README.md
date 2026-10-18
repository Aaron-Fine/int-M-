# Component catalog

The Mandelbrot Interiority catalog lists every hyperbolic-component centre of
exact period one through twelve: 4,016 entries. It has two files of data and
one of curation.

## Files

- `components.v2.json` holds the eleven entries of period one to four in
  schema v2 ([ADR 0011](../docs/decisions/0011-catalog-schema-v2-and-stable-ids.md)).
  The application imports it at startup. It is generated; never edit it by
  hand. Regenerate it with
  `python3 tools/generate_catalog.py --write catalog/components.v2.json`.
- `core.v1.bin` and its manifest `core.v1.json` hold all 4,016 entries
  through period twelve in a compact binary form
  ([ADR 0014](../docs/decisions/0014-generated-catalog-core.md)). The
  application loads them in a worker after the first frame. They are
  generated; regenerate both with
  `python3 tools/generate_catalog_core.py --write catalog` (about 100 s).
- `curation.v2.json` holds what a person reviewed: the names of the five
  named components, the v1 ids each entry keeps as aliases, and optional
  annotations, keyed by canonical id. Every other entry is labelled by its
  rays, for example "Period 4, rays 6/15 and 9/15". Edit it, then regenerate
  `components.v2.json`; the core does not store labels.

## Ids

An entry's id is `mi-p<p>-<a>-<b>`: its period and the numerators of its two
characteristic rays over `2^p − 1` (the main cardioid is `mi-p1-0-1`). The id
depends only on the component, so regeneration never changes it. The v1 ids
(`mi-p1-main`, `mi-p3-rabbit`, `mi-p4-01`…) are aliases that resolve forever,
because share links (ADR 0009) name them in `sel=`. Never remove an alias.

## What each entry records

- `center`: the nearest binary64 to the centre refined by Newton's method in
  80-digit decimal arithmetic, proved by the Krawczyk test to lie within
  1e-50 of exactly one simple root of exact period, and
  `centerPrecisionDigits`, its correct significant digits (at most 16).
- `period`, `internalAddress`, `angledInternalAddress` and
  `characteristicRays`, all generated from the rays (the main cardioid has no
  angled steps and no ray pair). The core stores only the period and the rays;
  the loader derives the rest.
- `residual`: |f_c^p(0)|, the distance to the refined centre, and the
  smallest |f_c^d(0)| over proper divisors d, at the stored centre.
- `annotation` (optional, curated): one line of at most 280 characters, shown
  in the inspector under the entry's name (ADR 0012).
- `method` and `provenance`: keys into the `methods` and `provenance` tables
  (in `components.v2.json`, and in the core's manifest), which say how the
  fields were computed and which were curated.

## Validation

```sh
npm run catalog:test            # the generator, certification and cross-check unit tests (Python)
npm run catalog:check           # regenerates components.v2.json and requires byte equality
npm run catalog:core:inputs     # the core's manifest matches its sources and its bytes (fast)
npm run catalog:core:verify     # regenerates the core byte for byte, cross-checks it, checks the angled-address fixture
```

`npm run check` runs the first three. `catalog:core:verify` takes about 4.5
minutes (three of them the cross-check, in parallel processes); the
`Catalog core` workflow runs it when the catalog or its tools change and on
every push to main. The cross-check (`tools/crosscheck_catalog_core.py` and
`tools/crosscheck_rays.py`) shares no code with the generator. It proves each
stored centre's root again in exact integer arithmetic, checks the counts
against OEIS A000740, the `orbitAbs` and `centerError` residuals to three digits (the proper-divisor residual only for being positive), divisor periods and conjugate closure,
recomputes Lavaurs' ray pairs, and proves that for c at each centre the pair's
two dynamic rays land together at a repelling periodic point of f_c; with the
wake theorem this proves which pair's parameter rays land at the root of which
centre's component (ADR 0014). The unit tests in `tests/unit/catalog/`
check the loaded files, `fixtures/angled-addresses.p12.json` pins the angled
addresses (`tools/dump_angled_addresses.py`), and the loaders (`src/catalog/schema.ts`,
`src/catalog/core.ts`) reject a malformed file.

The browser loads the core in a worker and checks its SHA-256 with Web Crypto,
which exists only in secure contexts. Production (https) and `localhost` are
fine; over `http://<LAN-IP>` (a phone test, say) the core fails to load with
"the catalog core needs a secure context" in the console, and the panel says
periods 5 to 12 could not be loaded.

The catalog data is dedicated to the public domain under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). The generator
and application source remain licensed under GPL-3.0-only.

## Phase 2 role

The catalog is a navigation, testing and explanation feature, not a
performance dependency ([ADR 0004](../docs/decisions/0004-catalog-disposition.md)):
the renderer never reads it. The curated layer stays intact; the core extends
it, and the explorer falls back to the curated layer when the core cannot be
loaded.
