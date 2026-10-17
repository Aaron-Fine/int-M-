# ADR 0011: Catalog schema v2 and stable component ids

- Status: Accepted
- Date: 2026-10-17
- Amends: [ADR 0004](0004-catalog-disposition.md) (the curated layer's file),
  [ADR 0009](0009-shareable-url-schema.md) (catalog ids in `sel=`)
- Trace: [PHASE2-TODO item 4](../verification/PHASE2-TODO.md#4-catalog-schema-and-tests);
  PLAN §3.3 and §11; `MI-PERF-003`, `MI-UX-019`

## Context

PLAN §3.3 asks each catalog entry to carry a stable project identifier,
validation residuals and method, provenance and a schema version. Schema v1
(`catalog/components.v1.json`) carried none of the last three, and its
period-4 ids `mi-p4-01`…`mi-p4-06` were ordinals: the position of the centre
in a sort, which any regeneration with more periods or a different sort would
renumber. Five of those six entries had no internal address and none had an
angled address. Share links (ADR 0009) name catalog ids in `sel=`, so an id
is a public interface. The owner ruled (2026-10-17) that when the ordinal ids
are replaced, the old ids stay as aliases and the link version `v` does not
change.

PHASE2-TODO item 7 will generate the full period ≤12 core: 4,016 centres in
an encoded form within 256 KiB. The id scheme and schema must scale to it.

## Decision

**Ids.** A component's canonical id is `mi-p<p>-<a>-<b>`, where `a/(2^p−1)`
and `b/(2^p−1)` are its lower and upper characteristic angles (the external
rays landing at its root), written over `2^p − 1` without reducing. The main
cardioid's root angle 0 is the Lavaurs pair 0/1 and 1/1, so its id is
`mi-p1-0-1`. Examples: the Douady rabbit is `mi-p3-1-2` (rays 1/7, 2/7), the
period-2 bulb `mi-p2-1-2`, the 1/4 bulb `mi-p4-1-2`.

Why rays:

- **Unique.** Exactly two rays land at the root of each component of period
  p > 1, both of exact period p, and each angle of exact period p lands at
  exactly one such root (Douady–Hubbard; Lavaurs' pairing enumerates them).
- **Stable.** The id is a mathematical property of the component, not of a
  sort, a precision or a generator run. Adding periods, refining centres or
  reordering the file cannot change it.
- **Self-checking and compact.** The loader rejects an id that disagrees with
  the entry's period and rays. For p ≤ 12 the numerators fit in 12 bits, so an
  encoded core can store `(p, a, b)` and derive the id, the internal address
  and the angled internal address from them instead of storing strings.

Rejected: the internal address alone is not unique (the rabbit and co-rabbit
share `1 → 3`; PLAN §3.3 says so). The angled internal address is unique
(Schleicher) but long at period 12, awkward in a URL, and itself computed from
the rays. A centre hash depends on precision and rounding. Ordinals are what
broke.

**Aliases.** Every v1 id stays resolvable forever as an alias of its entry.
`findCatalogComponent` resolves ids and aliases; a v1 link with
`sel=mi-p4-02` opens with the canonical selection `mi-p4-6-9`, without a
notice, and the address bar is rewritten with the canonical id once the view
settles. `v` stays 1: the meaning of `sel` (one catalog component) is
unchanged. Aliases live in `catalog/curation.v2.json`, never collide with a
canonical id or each other, and are never removed.

**Schema v2.** `catalog/components.v2.json` replaces the v1 file. Top level:
`schemaVersion: 2`, `license`, `maxPeriod`, a `methods` table and a
`provenance` table. Each entry: `id`, optional `aliases`, `label`, `period`,
`center` (the nearest binary64 to the refined centre), `centerPrecisionDigits`,
`internalAddress`, `angledInternalAddress` and `characteristicRays` (absent
for the main cardioid), `residual`, `method` and `provenance`:

- `residual.orbitAbs` is |f_c^p(0)|, `residual.centerError` the distance to
  the 80-digit refined centre, and `residual.properDivisorOrbitMinAbs` the
  smallest |f_c^d(0)| over proper divisors d (absent for p = 1), each
  evaluated at the stored centre in 80-digit arithmetic, to three significant
  digits. Together they show the stored value is a centre of exact period p.
- `method` and `provenance` are keys into the top-level tables, so a 4,016-entry
  core spends one small index per entry on them. Provenance records the
  generator, its arguments, and which fields were curated (`curated-label`:
  label and aliases from the curation file; `generated-label`: none).

**Generation.** `tools/generate_catalog.py` writes the whole file from first
principles plus the curation file: Durand–Kerner seeds refined by Newton in
80-digit decimal arithmetic; Lavaurs' ray pairing with each pair matched to the
one centre both of its rays land on; the internal address from the kneading
sequence; angled-address denominators by Schleicher's formula and numerators
from the tuned sub-wake that contains the lower ray (`tools/catalog_combinatorics.py`).
`npm run catalog:check` regenerates the file and requires byte equality;
`npm run catalog:test` tests the combinatorics, including injectivity of the
angled addresses and their conjugation symmetry through period 8. The loader
(`src/catalog/schema.ts`) validates the structure on every load; the unit
tests in `tests/unit/catalog/` check exact periods, ray pairs, recomputed
internal addresses, Schleicher denominators, conjugate closure and the v1
aliases.

**Scaling to item 7.** The JSON form costs about 1 KiB per entry and is for
the curated layer. The generated core keeps the same fields but encodes them:
per entry the period, `a` and `b` (5 bytes), the centre (16), the three
residuals as float32 (12) and the method and provenance indexes (2), about
35 bytes, or about 137 KiB (140 kB) for 4,016 entries before compression, inside the
256 KiB budget. Ids, addresses and generated labels are derived on load. Wherever the angled-address numerators are derived rather than stored (the
tests today, the loader of the compact form), they use Schleicher's
closed-form rule from θ alone, which needs no Lavaurs table.
Curated labels and aliases stay in the small curation file, keyed by
canonical id. Sharding by period is possible without changing ids.

## Consequences

- The eleven components, their labels, and their keyboard focus order are
  unchanged. Their centres move by at most 2.1·10⁻¹⁵ (v1 stored the binary64
  Durand–Kerner roots; v2 stores the correctly rounded refined centres), far
  below a pixel at the zoom ceiling.
- The six period-4 entries now have internal and angled addresses:
  `1 →½ 2 →½ 3 →½ 4` (rays 7/15, 8/15), `1 →½ 2 →½ 4` (6/15, 9/15),
  `1 →⅓ 3 →½ 4` and `1 →⅔ 3 →½ 4` (3/15, 4/15 and 11/15, 12/15),
  `1 →¼ 4` and `1 →¾ 4` (1/15, 2/15 and 13/15, 14/15). The airplane gains its
  angled address `1 →½ 2 →½ 3`. Every field v1 had reviewed is reproduced.
- New share links carry canonical ids; v1 links keep working through aliases
  (`tests/unit/ui/share-state.test.ts`, the `Shareable links (MI-UX-019)` e2e
  scenario for `sel=mi-p4-02`).
- The period-4 labels remain the v1 placeholders ("Period-4 component N").
  Naming them is an item 6 or 7 curation decision; a label change does not
  change an id.

## Amendment (2026-10-17, ADR 0012)

[ADR 0012](0012-catalog-navigation-and-marker-density.md) adds an optional
`annotation` to each entry: at most 280 characters, carried from
`curation.v2.json` by the generator and validated by the loader. The change is
additive, so `schemaVersion` stays 2. ADR 0012 also makes the catalog order
(period, then lower characteristic angle) the keyboard focus order of the
markers in place of the file order; the file order itself is unchanged.
