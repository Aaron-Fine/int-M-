# ADR 0014: The generated period ≤12 catalog core

- Status: Accepted
- Date: 2026-10-17
- Amends: [ADR 0004](0004-catalog-disposition.md) (workstream F ships as a
  product feature), [ADR 0009](0009-shareable-url-schema.md) (a link's `sel`
  may name a period 5 to 12 id that the core confirms when it loads),
  [ADR 0011](0011-catalog-schema-v2-and-stable-ids.md) (the
  generation method, the period-4 labels, the encoded form),
  [ADR 0012](0012-catalog-navigation-and-marker-density.md) (the find field,
  one panel description, the asynchronous hand-over, the label width)
- Trace: [PHASE2-TODO item 7](../verification/PHASE2-TODO.md#7-generated-period-12-catalog-workstream-f-as-a-product-feature);
  owner decisions Q3, Q4 and "Item 7 (2026-10-17)"; `MI-PERF-003`,
  `MI-PERF-008`, `MI-VER-PERF-003`, `MI-UX-020`

## Context

The owner chose (Q3) to ship the full period ≤12 core, 4,016 hyperbolic
component centres, generated with a pinned arbitrary-precision tool and
independently cross-checked, with generated labels and curated names where
known. Item 6 built the list, the marker density policy and the viewport
index and tested them on a synthetic catalog of that size. The generator
could not reach period 5: its Durand–Kerner root finder does not converge on
the degree-16 polynomial. ADR 0011 sized an encoded form at about 137 KiB
against a 256 KiB budget. On 2026-10-17 the owner added a find field, labels by
rays for every generated entry, and an in-panel confirmation on narrow layouts.

## Decision

**Root isolation.** For each Lavaurs ray pair of exact period p, both
parameter rays are traced in binary64 (`landing_center`) and must land within
1e-9 of each other. Newton's method in 80-digit `decimal` arithmetic refines
the landing point. Complex ball arithmetic, with every rounding bounded by the
operands' magnitudes, then encloses g(c) = f_c^p(0) at the refined point and
g' over the disk of radius 1e-50 about it, and the Krawczyk test proves that
the disk holds exactly one root of g, a simple one (`tools/catalog_certify.py`).
The same enclosure of f_c^d(0) excludes 0 for every proper divisor d, so the
period is exact. The disks of one period are disjoint, so the 4,016 pairs name
4,016 distinct centres. Since the roots of g are simple and the number of
centres of exact period p is the A000740 count, they are all of them. Only the
Python standard library is used. The stored centre is the nearest binary64.

**The ray pair of each centre is proved** (owner decision 2026-10-17), in the
cross-check (`tools/crosscheck_rays.py`). For every c in the proved disk about
a record's centre, the dynamic rays of f_c with the record's angles a/M and b/M
land at one point:

1. Far out the Böttcher map is close to the identity: for |z| ≥ 3 and |c| ≤ 2.01,
   φ_c(z) = z·e^δ with |δ| ≤ η = (|c|/|z|²)/(1 − |c|/|z|²). Disks about the
   straight rays therefore enclose every ray of the two doubling cycles for
   |w| in [20, 400], one fundamental domain of potential.
2. Pulling a chain of disks back by ±√(w − c) encloses the next fundamental
   domain of the ray of half the angle. At each disk the sign is the one whose
   image meets the disk already known at the junction; if both or neither
   meet, the proof stops.
3. Once one period of potential of both rays lies in a disk D on which every
   w ∈ D has exactly one solution of f^p(z) = w in D (the Krawczyk test with
   the target ranging over D), the inverse branch maps D into a compact part
   of itself. Its iterates carry each ray's later pieces into D and shrink
   them to its unique fixed point, so both rays land there.

Ball arithmetic in binary64, with every rounding bounded, proves 4,014 of the
4,015 pairs, each within at most 744 pull-backs. The period-12 component
nearest −2, whose landing point lies 1.4e-13 from c, is the one proved in
40-digit decimals, about a disk of radius below 1e-24 that the cross-check
proves about its centre (96 pull-backs). The pairs themselves must be
Lavaurs' pairs, which the cross-check recomputes.

The rest is mathematics. By the wake theorem (Douady and Hubbard; Milnor 2000,
"Periodic orbits, external rays and the Mandelbrot set", Theorem 1.2 and its
Corollary 1.3), the dynamic rays of a characteristic pair land together
only for c in the closed wake of that pair (and they do for every c in the
wake), so each centre lies in its pair's wake. Every other period-p component in a wake lies in the wake of a smaller
period-p pair. The centres are proved distinct and complete, so by induction
from the innermost pairs, each centre is the one at whose root its pair's
parameter rays land. The full argument, with its induction, is the
Association lemma under "Elementary lemmas" below.

**Trust base.** What stays unproved: the proofs rely on the following and on
nothing else. This is the one full list. The docstrings of
`tools/crosscheck_rays.py` and `tools/crosscheck_catalog_core.py` point here,
and each elementary lemma is stated and proved in the code, next to the
function it justifies, except Association, which is proved here.

_Arithmetic._ IEEE-754 binary64 with round-to-nearest: only +, −, ×, ÷,
`math.sqrt` and exact operations (the absolute value of a real, negation,
`frexp`, `ldexp`, comparisons) enter a bound. Magnitudes are sqrt(x² + y²) and
complex square roots the real formulas, with each rounding inside the
allowance of 8 × 4.5e-16 relative per operation (8 × 1e-37 in the 40-digit
decimal fallback), and every radius is inflated by 2e-15 relative (1e-35 in
the fallback); the rays' directions come from decimal Taylor series with a
bounded remainder; no C-library function (`hypot`, `cmath`, `exp`, `sin`,
`cos`) enters a bound. Python's exact
integers and `fractions`, and `decimal`, each operation of which is correctly
rounded to the context's precision. `math.nextafter` is exact, and `float()`
of a `Fraction` or `Decimal` is correctly rounded (faithful rounding would
suffice where it is used).

_Published theorems._ Douady and Hubbard's results are cited from their Orsay
notes (1984–85) and Milnor (2000); see Citations.

- Rouché's theorem: a holomorphic g with
  |g(c₀)| < ρ(|g′(c₀)| − sup|g′ − g′(c₀)|) on B(c₀, ρ) has exactly one zero
  there, and it is simple.
- Gleason's lemma: the roots of f_c^p(0) in c are simple. So
  ½ Σ_{d | p} μ(p/d) 2^d (OEIS A000740) counts the period-p centres, and that
  many distinct exact-period roots are all of them.
- Douady–Hubbard (a): c is the centre of a period-p hyperbolic component
  exactly when 0 has exact period p under f_c. Each component has exactly one
  centre and one root.
- Douady–Hubbard (b): for p ≥ 2, each root of a period-p component is the
  landing point of exactly two parameter rays, both of period p and landing
  nowhere else. The
  component lies in their wake, and distinct components have distinct roots.
- Douady–Hubbard (c): parameter rays are pairwise disjoint and lie outside M,
  so the wakes of distinct period-p pairs are nested or disjoint.
- Douady–Hubbard (d): roots are parabolic parameters and lie in no hyperbolic
  component.
- Lavaurs (1986): the pairs of period-p parameter rays that land together are
  exactly those his algorithm produces (recomputed by the cross-check).
- The wake theorem (Douady–Hubbard; Milnor 2000, Theorem 1.2): the dynamic
  rays R_c(a/M) and R_c(b/M) land together only for c in the closed wake of
  the pair (a, b).
- Böttcher's theorem: for c in M, φ_c is a conformal isomorphism from the
  complement of K_c onto the complement of the closed unit disk, tangent to
  the identity at infinity, with φ_c(f_c(z)) = φ_c(z)² and the product formula
  φ_c(z) = z ∏ₙ (1 + c/zₙ²)^(1/2ⁿ⁺¹). The ray R_c(θ) is the preimage of the
  straight ray, and f_c maps R_c(θ) onto R_c(2θ), doubling the potential.
- The maximum principle for the subharmonic Green's function log|φ_c| (for
  the Böttcher estimate).
- The Schwarz–Pick lemma, or equivalently the Earle–Hamilton theorem: a
  holomorphic self-map of the disk does not increase hyperbolic distance (for
  the landing lemma).
- Banach's fixed-point theorem, and the mean-value inequality for holomorphic
  maps on a convex set (for the Krawczyk test).

_Association._ The step from the wake theorem's closed wake to the open wake
holds because the centre lies in M, so it is on no parameter ray
(Douady–Hubbard (c)), and it is not the parabolic root (Douady–Hubbard (d)).

_Elementary lemmas, proved in the code comments, except Association, which is proved here._

- The Böttcher estimate (`start_chain`): for |z| ≥ 3 and |c| ≤ 2.01,
  |log(φ_c(z)/z)| ≤ η = q/(1 − q) with q = |c|/|z|², and |z| ≥ 0.99|w| whenever
  |w| ≥ 20. The bound |c| ≤ 2.01 is not assumed: `prove_landing` checks it over
  each disk and refuses a disk that fails it. (It holds because |c| ≤ 2 on M.)
- The square-root perturbation bound (`pull_back`): if |u′ − u| ≤ s < |u| = S,
  then |√u′ − √u| ≤ s/(√S(1 + √(1 − s/S))) on the continuous branch.
- The branch choice (`pull_back`): the two preimage disks are disjoint, the
  true one always tests as meeting the previous disk, and a unique "meets" is
  the true branch.
- Krawczyk with a target (`maps_into_itself`): if K_w(z) = z − Y(F(z) − w) maps
  D into B(m, shift + κr) inside D with κ < 1, then every w in D has exactly
  one F-preimage in D, and the inverse branch g maps D into a smaller
  concentric disk.
- Landing (`prove_landing`): such a g is a hyperbolic s-contraction
  (s = r′/r) with a unique repelling fixed point ζ. Each later period of a ray
  lies in g^k(D), so both rays land at ζ.
- The rounding of `float_size`, `float_sqrt`, `DecimalBalls.sqrt` and
  `unit_direction`: each is within a stated number of units, inside the
  allowance.
- The Rouché bounds (`disk_radii`, `magnitude_bounds`): the deviation
  recurrences e₍ₙ₊₁₎ ≤ 2|zₙ|eₙ + eₙ² + ρ (and the derivative analogue), by
  induction from fₙ₊₁ = fₙ² + c, with outward magnitudes: integer square roots
  of the truncated coordinates, floored and ceiled.
- Exact period (`prove_root_at`): |f^d(0)| is bounded away from 0 on the disk
  for every proper divisor d.
- Distinct centres (`check_collection`): the disks of one period are pairwise
  disjoint, and the scan stops only past the largest radius.
- The refined disk (`refined_disk`): |c₁ − c₀| + ρ₁ ≤ ρ in exact fractions, so
  the refined root is the record's root.
- Association (`check_record` and `check_collection` together): by induction
  on wake nesting, each record's centre is the centre of the component rooted
  at its pair's landing point. Let H_P be the period-p component at whose root
  the parameter rays of the pair P land. The record's centre c_P is the centre
  of a period-p component H (Douady–Hubbard (a)), and H lies in the wake W_P:
  H is connected, meets W_P at c_P, and misses its boundary, which is two
  parameter rays outside M and a root, which is in no hyperbolic component
  (Douady–Hubbard (d)). Suppose H is not H_P. Its root pair P′ differs from P
  (Douady–Hubbard (a), (b)), and H lies in W_P′, so the two wakes nest
  (Douady–Hubbard (c)). W_P inside W_P′ is impossible: the root of P′ lies on
  the boundary of H, so in the closure of W_P; it is neither on P's rays nor
  P's root (Douady–Hubbard (b)), so it would lie in W_P, inside the open W_P′,
  on whose boundary it lies. So W_P′ lies strictly inside W_P, and by
  induction on the number of period-p wakes inside a wake, the record of P′
  holds H's centre. Two records would then share a centre, but their disks are
  disjoint. So H is H_P, for every pair P. (Period 1 has one centre, 0.)

**Citations.** Checked against arXiv math/9905169 on 2026-10-18: J. Milnor, "Periodic
orbits, external rays and the Mandelbrot set: an expository account",
Astérisque 261 (2000), 277–333 (arXiv math/9905169), where Theorem 1.2 is "The
Wake W_P", Corollary 1.3 gives the nesting or disjointness of closed wakes,
and Theorem 3.1 is the version proved in §3. P. Lavaurs, "Une description
combinatoire de l'involution définie par M sur les rationnels à dénominateur
impair", C. R. Acad. Sci. Paris (4) 303 (1986), 143–146. A. Douady and
J. H. Hubbard, "Étude dynamique des polynômes complexes", Publications
mathématiques d'Orsay 84-02 (1984) and 85-04 (1985), cited without theorem
numbers. J. Milnor, _Dynamics in One Complex Variable_ (Böttcher's theorem and
external rays), cited without a section number. C. J. Earle and R. S.
Hamilton, "A fixed point theorem for holomorphic mappings" (1970), cited
without a page number. The last three could not be checked against the text.
The Milnor entries were checked by reading the paper's statements of Theorem
1.2, Corollary 1.3 and Theorem 3.1 against the uses above.

**Independent cross-check.** `tools/crosscheck_catalog_core.py` reads only the
shipped files and imports none of the generator's modules. It recomputes the
counts by the Möbius formula and compares them with A000740, and evaluates
f_c^p(0) and its derivative exactly in integer arithmetic at each stored
binary64 centre. Rouché's theorem then proves that a disk of four Newton steps
about it holds exactly one simple root (the generator uses the Krawczyk test
at the 80-digit point), with f_c^d(0) bounded away from 0 for every proper
divisor. It checks the stored `orbitAbs` and `centerError` to three digits against its
own exact values; for the proper-divisor residual it checks only that the
stored value is positive (its exact-period proof bounds the divisor orbits
independently), and `centerPrecisionDigits` is not recomputed. It also checks
every exact-period
angle used once, both rays sharing a kneading sequence, exact conjugate
closure, the half-plane invariant, real centres exactly where the rays are
symmetric and in angle order along the axis, disjoint disks, and a finite,
positive `componentSizeEstimate` for every entry.

| Measured on the planning laptop (2026-10-17)             | Value                                             |
| -------------------------------------------------------- | ------------------------------------------------- |
| Generation (`catalog:core:check`), one core              | 95–102 s (Lavaurs pairing 13 s, ray tracing most) |
| Cross-check with the ray proofs, several processes       | about 3 minutes (180.8 s; 7.4 minutes in one)     |
| Components per period                                    | 1, 1, 3, 6, 15, 27, 63, 120, 252, 495, 1023, 2010 |
| Largest distance from a stored centre to its proved root | 1.12e-16                                          |
| Largest \|f_c^p(0)\| at a stored centre (period 12)      | 1.33e-10                                          |
| Smallest stored proper-divisor \|f_c^d(0)\| (generator)  | 0.00154                                           |
| Closest centres of one period (period 12)                | 7.06e-6 apart                                     |
| `catalog/core.v1.bin`                                    | 136,560 bytes (133.4 KiB; 88.7 kB compressed)     |

**Encoding.** `catalog/core.v1.bin` is a 16-byte header (magic `MICORE`,
format version 1, maximum period, record size, count) and 4,016 records of 34
bytes, little-endian, in catalog order: the period (u8), the lower and upper
ray numerators over 2^p − 1 (u16 each), the centre as two binary64 values
(exact round trip), `centerPrecisionDigits` (u8), and the three residuals as
float32 of their three-significant-digit values. One method and one
provenance apply to every record, so the manifest `catalog/core.v1.json`
holds them, with the counts per period, the length, the SHA-256 and the
SHA-256 of each generator source. Ids, labels and both addresses are derived
on load; the angled addresses by Schleicher's closed-form rules
(`src/catalog/combinatorics.ts`), which agree with the generator's tuned
sub-wake method on all 4,015 entries of period 2 to 12. That agreement is
pinned: `tools/dump_angled_addresses.py` writes the generator's addresses to
`fixtures/angled-addresses.p12.json`, the `Catalog core` workflow and
`catalog:core:verify` regenerate them to check the file, and
`tests/unit/catalog/core/angled-addresses.test.ts` compares the closed form
with it in `npm run check`. The curated JSON
stays as it is: it is reviewed text, and the five names, the aliases and the
annotations come from it.

**Checks.** Regeneration takes about 100 s, the cross-check about 3 minutes
in parallel processes, and the whole `catalog:core:verify` about 5 minutes, so
`npm run check` runs only `catalog:core:inputs` (0.15 s): the
generator sources must hash to the manifest's `inputs` and the binary to its
SHA-256, so a generator change without a regeneration fails at once. The
`Catalog core` workflow (`.github/workflows/catalog-core.yml`) regenerates the
core byte for byte and runs the cross-check on pull requests that change
`catalog/`, the generator or cross-check tools or their tests, on every push
to main, and on request (owner decision 2026-10-17);
`npm run catalog:core:verify` runs the same locally.

**Loader off the main thread.** The core loads in two steps after the first
stable frame:

1. A worker fetches the binary, checks its length and SHA-256 against the
   manifest, decodes it to validate every record, and transfers the bytes
   back.
2. The main thread decodes the transferred bytes again, without the
   addresses, which are computed when first read: 8.5 ms in Chromium and
   20 ms in Firefox. It then merges the curated entries, builds the index and
   adds the panel's groups: 7 ms and 16 ms.

The client gives up after 30 s and also fails on a worker error or an
unreadable message, terminating the worker on every exit. A failed load,
including a core that fails to build in step 2 (an inconsistent merge, before
any state changes), leaves the curated catalog, says so in the panel and logs
the reason. A throw after the hand-over has begun is a bug, not a failed load,
and is only logged.

**While the core loads**, the panel lists periods 1 to 4 and says "Loading
periods 5 to 12…" where the new groups will appear, so nothing above them
moves; the markers are the curated ones. If the file is unreachable or does
not match its manifest, the panel says that periods 5 to 12 could not be
loaded, and the curated catalog and rendering are unaffected (MI-PERF-003).

**Links before the core.** A link's `sel=` with a v1 alias or a period ≤4 id
resolves at once, as before. A well-formed id of period 5 to 12 (two rays of
exact period with one kneading sequence) is kept, stays in the address bar,
and is selected when the core arrives; if the core has no such entry, the link
notice says that the selected component was not found. `v` stays 1.

**Labels.** Every generated entry is labelled
`Period <p>, rays <a>/<2^p−1> and <b>/<2^p−1>`, the six period-4 entries
included; only the five named
components keep curated names. Ids do not change. A marker whose label starts
with its period is named `Inspect <label>`, without a repeated period.

**Find field.** Above the groups, a search field filters by one or two ray
fractions (by value, so `2/5` finds 6/15), by an `mi-` prefix of an id or
alias, or by label text from a word start (a trailing number must end a word,
so `period 1` does not find period 12). Results replace the groups while a
query is active: at most 50 buttons in catalog order, with a polite count
("2,010 components match; showing the first 50.") written 400 ms after typing
pauses. Each result is a normal Tab stop (no roving tabindex); Escape clears
the field. The search reads the data, not the DOM, so unbuilt groups need not
open.

**Lazy groups at scale.** A group builds its buttons once, on first open or
when a selection inside it arrives; a selection from a marker or a link
scrolls its entry into view inside the group's 20rem list without moving focus
or the page. Building the 2,010 period-12 buttons takes 34–39 ms in Chromium
and 47–55 ms in Firefox on a quiet machine (121 ms under heavy load); the
owner accepted the Firefox figure, at the long-task threshold, as measured
(2026-10-17).

**Narrow layouts.** At 68rem and narrower, where the panel sits below the
canvas, a list activation shows "Zoomed to <label>." with a Show the view
button, sticky at the bottom of the panel; focus stays on the entry. It is not
a live region: the canvas toast already announces the zoom once.

**Screen readers.** The panel region carries the one description ("Choose a
component to zoom to it and inspect it."); entries no longer each point to it.

**Marker density on real geometry (Q4).** The policy is unchanged, as the owner
confirmed (2026-10-17). Placed
markers: 29 at the default view on a 922×576 canvas and 16 on 300×225; 25 and
15 at the rabbit (8×); 27 and 11 at the 13× corpus view; 5 at 126×.
Collisions, not the cap, bound the count. Walking further periods would reach
40 on the desktop default view only, with twice the entries examined, while
the phone canvas saturates at 18 even when all 4,016 are examined; so the walk
still stops at the first period that brings the candidates to 40.

**Label width.** Generated labels are 9.5rem (period 4) to 13.7rem (period 12) wide in both engines, so the marker label maximum is 14rem (it was
11rem), and the policy's label box estimate caps at the same width.

## Alternatives rejected

- **Evidence for the ray pairs** (both rays traced in binary64 to the same
  root, plus invariants): rejected by the owner, who asked for a proof.
- **Proving the parameter rays' landing instead**: they land at parabolic
  roots, where convergence is slow and the Krawczyk test degenerates; the
  dynamic rays at a centre land at a repelling point.
- **Durand–Kerner or Aberth on the full polynomial**: degree 2,048 at
  period 12, O(d²) per sweep in Python decimals, with no proof of isolation.
- **mpmath or another arbitrary-precision library**: a new pip dependency; the
  standard library's `decimal` and integers suffice.
- **A JSON or text core**: shortest round-trip decimals and three residuals
  cost about 87 bytes per entry (about 350 kB), over the budget.
- **Regenerating the core in `npm run check`**: it would add about 100 s to
  the 52 s check for a file that changes only with its generator, which the input
  hashes already catch.
- **Posting decoded objects from the worker**: 63 ms of structured-clone
  time on the main thread.
- **`content-visibility: auto` on long lists**: it halves the period-12 build
  (15–18 ms in Chromium) but skipped entries take a placeholder height, so the
  scroll into view lands outside the list.
- **Live-region confirmation**: it would announce the zoom twice.

## Consequences

- The catalog grows from 11 to 4,016 entries; the main chunk grows by
  13.1 kB to 85.4 kB (28.7 kB compressed, +4.5 kB); the worker (5.5 kB) and
  the core asset `core.v1.bin` (136.6 kB) are separate files that load after
  the first frame.
- The six period-4 labels change: "Period-4 component 2" is now "Period 4,
  rays 6/15 and 9/15". Their ids and v1 aliases are unchanged.
- At the default desktop view the core adds 18 markers of periods 5 and 6;
  the advisory `catalog-overlay.png` and `selected-marker.png` baselines
  change, and the owner regenerates them in the container. The colourised
  goldens do not change: markers are DOM outside the buffer.
- The core needs a secure context, because the SHA-256 check uses Web Crypto
  (`crypto.subtle`). Production (https), `localhost` and Playwright are
  fine; a phone test over `http://<LAN-IP>` is not, and ends in "Periods 5 to
  12 could not be loaded." with the reason ("the catalog core needs a secure
  context") in the console. Test on the Pages preview instead.
- Regenerating the core needs about 100 s; `catalog/README.md` says how.
