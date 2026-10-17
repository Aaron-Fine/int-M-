# Component catalog

`components.v2.json` is the Mandelbrot Interiority catalog: every
hyperbolic-component centre of exact period one through four, eleven entries
in all. Its schema and id scheme are recorded in
[ADR 0011](../docs/decisions/0011-catalog-schema-v2-and-stable-ids.md).

## Files

- `components.v2.json` is generated; never edit it by hand. Regenerate it with
  `python3 tools/generate_catalog.py --write catalog/components.v2.json`.
- `curation.v2.json` holds what a person reviewed: the names (labels) and the
  v1 ids each entry keeps as aliases, keyed by canonical id. Edit it, then
  regenerate.

## Ids

An entry's id is `mi-p<p>-<a>-<b>`: its period and the numerators of its two
characteristic rays over `2^p − 1` (the main cardioid is `mi-p1-0-1`). The id
depends only on the component, so regeneration never changes it. The v1 ids
(`mi-p1-main`, `mi-p3-rabbit`, `mi-p4-01`…) are aliases that resolve forever,
because share links (ADR 0009) name them in `sel=`. Never remove an alias.

## What each entry records

- `center`: the nearest binary64 to the centre refined by Newton's method in
  80-digit decimal arithmetic, and `centerPrecisionDigits`, its correct
  significant digits (at most 16).
- `period`, `internalAddress`, `angledInternalAddress` and
  `characteristicRays`, all generated from the rays (the main cardioid has no
  angled steps and no ray pair).
- `residual`: |f_c^p(0)|, the distance to the refined centre, and the
  smallest |f_c^d(0)| over proper divisors d, at the stored centre.
- `method` and `provenance`: keys into the file's `methods` and `provenance`
  tables, which say how the fields were computed and which were curated.

## Validation

```sh
npm run catalog:test   # the combinatorics and generator unit tests (Python)
npm run catalog:check  # regenerates the file and requires byte equality
```

`npm run check` runs both, and the unit tests in `tests/unit/catalog/` check
the loaded file: exact periods, ray pairs, recomputed internal addresses,
Schleicher denominators, conjugate closure and the v1 aliases. The loader
(`src/catalog/schema.ts`) rejects a malformed file at startup. This is
reproducible validation, not a claim of formal certification.

The catalog data is dedicated to the public domain under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). The generator
and application source remain licensed under GPL-3.0-only.

## Phase 2 role

Per [ADR 0004](../docs/decisions/0004-catalog-disposition.md), this curated
identity layer is the only shipped catalog in the Phase 2 performance work: it
stays a navigation, testing, and explanation feature and is deliberately not a
performance dependency. The exhaustive period-12 core (PHASE2-TODO item 7)
will extend this schema in an encoded form (ADR 0011, "Scaling to item 7").
An absent generated layer means "not yet built," not "impossible."
