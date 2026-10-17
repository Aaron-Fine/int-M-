# ADR 0009: Shareable URL schema

- Status: Accepted
- Date: 2026-10-16

## Context

PLAN §5.3 and §7 require versioned share state, so that a later coordinate or
numerical change never silently reinterprets an old link. Phase 2 adds
shareable URLs ([PHASE2-TODO item 3](../verification/PHASE2-TODO.md#3-shareable-versioned-urls)),
traced to `MI-UX-019`. The owner chose the format on 2026-10-16 (Q2): a
versioned query string with exact decimals, written with `replaceState` once
a view settles, where an old or broken link falls back visibly.

The explorer already reads `?perf=1&view=<re>,<im>,<spanY>&quality=<id>`
(`src/ui/benchmark-params.ts`). The release harness
(`tools/benchmark/harness/passes/corpus.ts`), its `--compare dist:<dir>` arms
against earlier builds, and the e2e provenance test depend on it. Its `view`
key means a viewport, but the product schema uses `view` for the semantic
view.

## Decision

A link has this form:

```text
?v=1&c=<re>,<im>&s=<spanY>&view=<stability|multiplier|period>&q=<quick|balanced|detailed>&sel=<catalog id | re,im>
```

- **Numbers.** Written as the shortest decimal that reads back as the same
  binary64 value (`String(x)`, with `e+` shortened to `e` because a query
  string decodes `+` as a space). On reading, a strict decimal of at most 400
  characters becomes the nearest binary64 value. Extra digits are rounded
  without a notice: binary64 cannot hold them, and they are far below the
  pixel spacing at the `6,000,000×` ceiling.
- **Version.** `v` versions the field layout and what each field means or
  how it parses. Version 1 fixes the canonical-`c` viewport with `s` as the
  vertical span (`src/domain/viewport.ts`), the three semantic view ids, the
  three quality profile ids and their budgets, and the catalog ids in
  `catalog/components.v1.json`. A link restores a place and its settings, not
  a frozen image, so `v` bumps only when a field's meaning or parsing changes:
  for example, when a view or quality id is redefined or removed. Rendering,
  palette and legend improvements, such as colouring the top periods in the
  period view, do not bump it. The decoder accepts only versions it can show
  faithfully, so an old or unknown version is rejected with a notice, never
  reinterpreted. A future decoder keeps reading v1 wherever v1's meaning can
  still be honoured.
- **Fields.** `c` and `s` travel together. With both absent the default
  viewport applies. With one absent or malformed, the default viewport applies
  and the notice says so. A span outside the zoom bounds is clamped to the
  nearest bound, with a notice. The centre need only be finite, because the
  explorer's own panning is unbounded. `view`, `q` and `sel` are optional;
  each malformed value falls back to its default and is listed in the notice.
  `sel` names a catalog id that exists, or holds an exact `re,im` pair. A
  repeated key is malformed. Parameters the schema does not own are ignored.
- **Rejection.** A query with `c`, `s`, `q`, `sel` or a semantic-view `view`
  but no `v` is unversioned. A `v` other than exactly `1` is unsupported. In
  both cases nothing in the link is applied: the default view opens with a
  notice. The notice repeats the version only when it is one to four digits.
- **Writing.** The address bar is updated with `history.replaceState` 500 ms
  after a stable frame, never during a pointer session or while a render is
  pending (its stable frame reschedules the write). It uses `replaceState`, not
  `pushState`: the explorer does not create history entries, so Back leaves
  the explorer instead of stepping back through views, and no `popstate`
  handling is needed. The default state writes no parameters. Parameters the
  schema does not own, such as `perf=1`, stay in the address bar. A link that
  was refused or adjusted is not rewritten until the view differs from the one
  the page opened with, so it stays in the address bar beside its notice.
- **Copy link.** A Copy link control copies the origin, path and v1 fields,
  never `perf` or other foreign parameters, and announces the result in the
  existing feedback live region. Without clipboard access it updates the
  address bar at once and says so. A view that cannot be encoded (a
  non-finite centre or span, reachable only by unbounded panning) copies
  nothing and says "Could not create a link for this view."
- **Benchmark hook: kept separate.** `perf=1` remains an orthogonal diagnostic
  switch: a v1 link with `perf=1` restores the view and enables the hook. The
  harness's `view=<re>,<im>,<spanY>&quality=<id>` applies only when the URL has
  no share fields. It is a harness interface, not an earlier share-link
  version, and it still means what it always meant. Migrating the harness to
  v1 would break `--compare` against every build made before this ADR, which
  only reads `?view=`. Inside a v1 link the harness triple is a malformed
  `view` and `quality` is ignored.

## Consequences

- A copied or bookmarked link reopens the same viewport, semantic view,
  quality profile and selection. A selected point is inspected again on load.
- Catalog ids become part of v1. PHASE2-TODO item 4 plans a stable id scheme
  because today's `mi-p4-NN` ids are ordinal. If ids change, the old ids must
  stay resolvable or `v` must be bumped.
- Changing a quality profile's budget or a semantic view's meaning bumps `v`.
  Classifier improvements that keep the common acceptance procedure
  (`MI-PERF-004`) do not: a link names a place, a view and a budget, not a
  frozen image.
- On a harness page the address bar is rewritten to v1 (plus `perf=1`) after
  the view settles. The harness reads the viewport from the hook, not from the
  URL, and the write happens at least 500 ms after the stable frame on which
  its wall-clock measurement ends.
- The codec is pure (`src/ui/share-state.ts`, `src/ui/share-link.ts`) and
  covered by unit tests. The browser behaviour is covered by the
  `Shareable links (MI-UX-019)` scenarios in both engines.
