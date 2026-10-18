# ADR 0012: Catalog navigation and marker density

- Status: Accepted
- Date: 2026-10-17
- Amends: [ADR 0011](0011-catalog-schema-v2-and-stable-ids.md) (an optional
  `annotation` field; the marker focus order)
- Trace: [PHASE2-TODO item 6](../verification/PHASE2-TODO.md#6-catalog-navigation-and-annotations);
  owner decision Q4; `MI-UX-020`, `MI-UX-006`, `MI-UX-015`, `MI-PERF-008`

## Context

The catalog has eleven entries today, each drawn as a marker on the canvas and
reachable only through those markers. PHASE2-TODO item 7 will add the full
period ≤12 core: 4,016 entries with ids `mi-p<p>-<a>-<b>`, generated labels
and curated names where known. Drawing a marker per entry would put thousands
of buttons on the canvas. The owner chose (Q4) a zoom-dependent cap of about
40 interactive markers, lowest periods first, with a list that reaches every
entry. Item 6 builds that list, the cap and the lookup behind it, and tests
them on a synthetic catalog of the core's size, so that item 7 supplies the
data and an asynchronous hand-over.

## Decision

**Order.** The catalog order is by period, then by the lower characteristic
angle a/(2^p − 1): the order of the components' roots around the set. It uses
exact integers that the id carries (read here from `characteristicRays`;
item 7's compact form stores `(p, a, b)`), and it is total, because within a period no two components share
a lower angle. The list uses it, and so does the keyboard focus order of the
markers, which therefore never depends on the view. The file order is not
changed.

**Panel.** A "Catalog" section after the legend in the side panel. On narrow
screens the side panel already stacks below the canvas, so the panel never
takes canvas space. Each period is a native `<details>` disclosure (keyboard
operable without script); a group of at most 8 entries starts open, so all of
today's catalog is visible, and a larger group builds its buttons the first
time it opens and scrolls inside a 20rem box. Each entry is a button named by
its label; activating it zooms to the component and selects it, and focus
stays on the button. Selecting a component any other way (its marker, a
shared link) marks its entry with `aria-current` and opens its group.

**Zoom span.** Activation centres the view on the component and sets the view
height to 2.5 times Heiland-Allen's size estimate (`componentSizeEstimate`:
about a bulb's diameter, 1 for the main cardioid), clamped to the zoom range,
so never past the `6,000,000×` ceiling. The estimate needs p complex
multiplications at load, no stored field, and follows the component's real
size: the airplane opens at 53×, the period-2 bulb at 2×.

**Annotations.** An optional `annotation` per entry: one line of at most 280
characters (code points), with no leading or trailing white space and no
control characters, carried by `tools/generate_catalog.py` from
`catalog/curation.v2.json` and validated by the generator and the loader. It
is additive, so `schemaVersion` stays 2 and the share-link version stays 1.
The inspector shows it under the entry's name. The five named components carry
one.

**Glossary.** A disclosure at the end of the catalog panel defines period,
characteristic rays, internal address and angled internal address, the terms
the panel's grouping and order and the inspector's catalog facts use. It
lives with the list it explains; the inspector's own help explains the
numerical evidence instead.

**Marker density (Q4).** `planMarkers` is a pure function of the index, the
view, the canvas size and the root font size:

1. Candidates are the in-view entries of the lowest periods: whole periods in
   ascending order until at least 40 are collected, plus the selected entry
   when it is in view.
2. In priority order (the selected entry, then period, then larger size
   estimate, then catalog order), a candidate is placed unless 40 are placed
   or its 1.5rem dot would overlap a dot already placed.
3. A placed marker whose 2.75rem hit box overlaps another's is compact: its
   hit box shrinks to its dot, so hit boxes never overlap and every target
   keeps at least 24 × 24 CSS px (WCAG 2.5.8).
4. In priority order, a label is shown only where it covers no earlier label
   and no other marker; the selected entry always keeps its label. A
   collision hides a label, never its marker.
5. The markers return in catalog order.

So the count is at most 40 at any zoom, the selected entry is always shown
when in view, and an entry left off the canvas is still in the list.

**Viewport index.** Built once at load: one bucket per period, sorted by
Re c. A query binary-searches each bucket for the view's Re range, examines
only that slab, and stops after the first period that brings the candidates
to 40. At the default view it examines periods 1 to 6, 53 of 4,016 entries; at
the zoom ceiling a slab a few pixels wide. The tests count examined entries
rather than time them.

## Alternatives rejected

- **Clustering** (one marker per group of nearby components): a cluster has
  no single component to select or name, and Q4 chose the cap.
- **A list only for generated entries**: it leaves the canvas without any
  marker for a high-period component, even when zoomed onto it.
- **Spatial focus order** (left to right): also view-independent, but it
  differs from the list order and interleaves periods.
- **A uniform grid index**: at the default view every cell is in view, so it
  would scan all entries; the period walk is what bounds the work, and the Re
  slab is enough inside it.
- **A period-based zoom span**: components of one period differ in size by
  orders of magnitude (period 4: 0.001 to 0.12).

## Consequences

- Markers can become compact (24px hit box) when a neighbour is close: on
  today's catalog, the airplane and the period-4 component at the tip are
  compact on a 1280-px-wide window, and at phone widths that period-4 marker
  is left off because its dot would cover the airplane's. It stays in the
  list.
- The marker focus order within periods 3 and 4 changes from the file order
  to the catalog order (the rabbit now precedes the airplane).
- The advisory `selected-marker-evidence.png` baseline changes for certain
  (the annotation line). `catalog-overlay.png` and `selected-marker.png` may
  change where a label is now hidden. The raster golden views are unaffected.
  The owner regenerates the affected baselines in the container; none has
  been regenerated here.
- A group of more than 8 entries builds its buttons on first open, so the
  panel stays light at item 7's size (the period-12 group has 2,010 entries).
  Item 7 owns the full-size check of that path.
- Item 7 supplies the data and an asynchronous hand-over: the loader, the order, the index, the policy and
  the panel are tested at its size. A find field for its 2,010-entry
  period-12 group is left to item 7.

## Amendment (2026-10-17, ADR 0014)

[ADR 0014](0014-generated-catalog-core.md) adds the find field this decision
left to item 7, puts the panel's one description on its region instead of on
every entry, scrolls a selection made outside the panel into view inside its
group's list, adds periods 5 to 12 when the core arrives without disturbing
the groups already shown, and widens the marker label maximum to 14rem. On the
real core the default view places 29 markers on a 922×576 canvas and 16 on
300×225; the policy is unchanged.

## Amendment (2026-10-18, nomenclature)

Owner decision 2026-10-18: user-visible names follow the literature where it
has them (Milnor 2000; Schleicher, "Internal addresses in the Mandelbrot set";
Bartholdi and Nekrashevych, "Twisted rabbit problem"). A curated label is the
literature component name, with the centre's Julia-set name in parentheses
where the literature names one: "1/2-bulb (basilica)", "1/3-bulb (Douady
rabbit)", "2/3-bulb (corabbit)", "Airplane component". The two rays that land
at a component's root are the "parameter ray pair" (formerly "characteristic
rays"), angles kept unreduced as a/(2^p − 1). The inspector writes the angled
internal address as a chain with the rotation as a subscript on each arrow,
1 →₁/₃ 3 →₁/₂ 6, with a spoken form for assistive technology. Ids, aliases
and code identifiers are unchanged. Text above that names the entries or the glossary term by their old names is historical.

## Amendment (2026-10-18, references)

Owner decision 2026-10-18: terms such as Fatou, Julia and Douady get
references, and "these links should not be part of the annotation". Annotation
text therefore stays plain and carries no URLs. A shared table,
`catalog/references.v1.json`, holds the links: Wikipedia or arXiv only, `https`
on exactly `en.wikipedia.org` or `arxiv.org`, with a `source` that matches the
host. Each curated entry may list keys from it in `references`, in display
order, and the generator copies them into `components.v2.json`. The inspector
shows them as a "References:" line under the annotation, and each glossary
term shows its own. Both link to concepts and to the people they are named
after. A link opens in a new tab with `rel="noopener noreferrer"`, and a
visually hidden suffix gives its name as "title – source, opens in a new tab".
The generator and the loader reject an unknown or repeated key, an empty
list, and any URL outside the two hosts.
