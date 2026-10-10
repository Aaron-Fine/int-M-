# Chart views: Riemann sphere, multiplier cylinder, and Koenigs basin torus

**Status:** Design approved in conversation on 2026-10-10; awaiting written-spec review.
**Sequencing:** Starts only after the current performance work is complete: the certified early-accept pilot,
workstream M (conjugate mirroring) behind its flag, and any transplant follow-up those produce. Nothing here
changes classifier semantics or the `legacy-scan` default.

## Intent

The user wants to explore the visual elegance of viewing the Mandelbrot family in other spaces — a sphere, a
cylinder, and genuine tori — inside the app, on desktop and mobile. Success means:

- each view is reachable from the normal explorer, renders through the existing worker/classifier pipeline, and
  supports mouse, keyboard, and touch;
- every pixel of every view means an exact canonical parameter `c` (or an exact dynamical-plane point `z` for a
  fixed `c`), or is explicitly marked as outside the chart — no resampled images, no silent branch switches;
- the views are labeled as visual charts, not certified claims.

What the user said: app view modes (not proofs, not performance charts); a sphere as both a rotatable globe and a
flat chart at infinity; the interior multiplier view as a seamless flat strip; both the interior torus idea and the
Koenigs basin torus, with the Koenigs torus in a new dynamical-plane panel; touch controls for mobile throughout; this
work after the performance work. Assumptions (open to correction): the existing semantic colorings (Stability,
Multiplier, Period) are reused in the parameter-plane charts; the parameter-plane interior view is a cylinder (the
torus lives in the basin, see §5).

## 1. Decomposition and order

| #   | Sub-project                                   | Depends on                                                              | Deliverable                                                                                         |
| --- | --------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1   | Chart seam, sphere views, touch gesture layer | —                                                                       | `Chart` abstraction; affine (unchanged), inverted `w = 1/c`, and globe charts; shared gesture layer |
| 2   | Multiplier cylinder                           | 1                                                                       | Per-component `(θ, g)` strip via Newton pull-back of the multiplier map                             |
| 3   | Dynamical-plane panel and Koenigs torus       | 1 (uses the classifier's accepted cycle data, not sub-project 2's code) | z-plane panel for a selected `c`, torus texture, fundamental-domain inset                           |

Each sub-project gets its own implementation plan and lands independently behind no flag beyond the view selector
(the default view stays the affine parameter plane).

## 2. Architecture: the chart seam (approach A)

This implements PLAN.md §5.3: orbit calculation operates only on canonical `c` (and, in the panel, canonical `z` for
a fixed canonical `c`); charts map to or from them.

- `src/domain/chart.ts`: a serializable `ChartDescriptor` discriminated union and `createChart(descriptor): Chart`
  with `toParameter(pixel): Complex | undefined` (and `fromParameter` where defined, for readouts, markers, and
  cross-view navigation). `undefined` means background (off-globe, the point at infinity) or outside the chart.
- Descriptor kinds: `affine` (wraps today's `Viewport`; must be bit-for-bit identical to `pixelToComplex`),
  `inverted` (`c = 1/w` on an affine `w` viewport), `globe` (unit quaternion rotation + zoom), `multiplierCylinder`
  (component seed, `θ`/`g` window), `dynamical` (fixed `c`, cycle seed, affine `z` viewport).
- The worker protocol carries descriptors instead of bare viewports; the worker rebuilds the `Chart` and calls it per
  pixel where `pixelToComplex` is called today. Descriptors are versioned with the semantic revision so cached tiles
  never cross charts.
- Optimizations keep their preconditions explicit: row banding works for every chart; conjugate mirroring (workstream
  M) is enabled only for affine charts whose pixel centers are exact conjugates and is automatically off otherwise;
  certified early accept (if shipped) is chart-independent because it acts per `c`.
- Interaction is a per-chart controller in `src/ui/` fed by one gesture layer (§6).

## 3. Sub-project 1: sphere views

- **Flat chart at infinity (`inverted`):** `c = 1/w`; `w = 0` (`c = ∞`) renders as background. Uses the existing 2D
  pan/zoom controller. A chart toggle sits beside the semantic-view selector.
- **Globe (`globe`):** orthographic rendering of the Riemann sphere. A screen pixel inside the disk maps to a sphere
  point under the current rotation, then to `c` by inverse stereographic projection; pixels outside the disk and the
  north pole are background. Zoom narrows the visible cap and is capped where the flat views are strictly better.
  Rendering near the pole gets no speedup — every visible `c` is still classified.
- **Readouts:** hover/tap shows `c` (and `w` in the inverted chart); "open in plane view" recenters the affine view.
- **Tests:** chart round trips (`toParameter ∘ fromParameter`) on sampled points; affine chart bit-equality with
  `pixelToComplex` over full rasters; globe background/pole handling; quaternion normalization under long drags.

## 4. Sub-project 2: multiplier cylinder

- **Entry:** tap/click an interior pixel the classifier accepted (period `p`, cycle point `z*`, multiplier `λ₀`). Exit
  recenters the plane view on the `c` under the cursor.
- **Coordinates:** strip pixel `(x, y)` ↦ `θ = x (mod 2π)`, `g = y`, `λ = e^{−g+iθ}`. `g > 0` is the component
  (toward the superattracting center as `g → ∞`, capped at `g_max`); `g = 0` is its boundary; `g < 0` is the analytic
  continuation of the cycle beyond it. Horizontal panning wraps seamlessly.
- **Inverse map:** solve `F(c, z) = (f_c^p(z) − z, (f_c^p)′(z) − λ) = 0` by two-variable complex Newton, with the
  Jacobian from orbit recurrences for the `z`- and `c`-derivatives and the mixed second derivatives (all canonical).
  Each pixel warm-starts from its neighbor; each tile starts by continuation from `λ₀` along a path in `log λ`.
  Initial period cap `p ≤ 32`.
- **Validity (outside-chart marking):** a pixel is outside the chart unless Newton converges, `|det J|` stays above a
  floor, the solution's cycle keeps minimal period `p` (the verifier's divisor-separation test), and the step from its
  neighbor is bounded. The component's root (`θ = 0`, `g = 0`, `λ = 1`) is a branch point; the cut is shown, never
  crossed silently. The `g > 0` region is exact and its `θ`-seam is bit-identical (the multiplier map is a bijection
  from the component onto the disk).
- **Display:** the chart's `c` goes through the normal classifier, so every semantic view works. Expected picture:
  the component as a smooth stability gradient above the line, straight multiplier-angle stripes, and satellite bulbs
  hanging below at `θ = 2πp′/q` in Farey order. Readout: `θ/2π` (snapping to `p′/q` near bulbs), `g`, `|λ|`, `c`.
- **Tests (oracles):** main cardioid closed form `c = λ/2 − λ²/4` (the Lean-proved D0 chart) and period-two closed
  form `c = λ/4 − 1` (FastPath) at sampled pixels; round trips against classifier-accepted pixels; tile-seam
  continuity; `θ`-wrap bit-identity for `g > 0`; bulb roots at `θ = 2πp′/q`; outside-chart marking near the root.

## 5. Sub-project 3: dynamical-plane panel and Koenigs torus

- **Panel:** a second canvas showing the `z`-plane of one selected `c`, chosen by tap/click in any parameter view
  (desktop may also follow the cursor, throttled). Same chart seam (`dynamical` descriptor), worker protocol, and
  gesture layer. Escaping pixels use the existing palette, so the filled Julia set appears.
- **Torus coordinate:** for interior `c` with `0 < |λ| < 1`, cycle point `z₀*`, and Koenigs map `φ` with
  `φ(f^p w) = λ·φ(w)`: for a basin pixel `z`, iterate until `f^m(z)` lands in the linearization disk around `z₀*` and
  set `T(z) = log φ(f^m(z))` in `ℂ/(2πiℤ + (log λ)ℤ)`. This is well-defined (landing times that differ by `p` shift
  `log φ` by `log λ`; `z` and `f(z)` share landing points), so `T(f(z)) = T(z)`. `φ` comes from the limit
  `λ^{−n}(f^{np}(w) − z₀*)`, stopped when the quadratic remainder is below pixel scale; the linearization disk may reuse
  the certified-acceptance contraction radius. Normalize to `ℂ/(ℤ + τℤ)` with `τ = log λ / 2πi` (`Im τ > 0`).
- **Display:** basin pixels take a doubly periodic texture on the torus (default checkerboard of the fundamental
  parallelogram; optional ℘-function domain coloring). An inset shows the flat fundamental parallelogram with the same
  texture and the marked projection of the critical point. As `c` moves, the lattice `τ(c)` shears and twists live;
  `τ → i∞` toward the component center. Stretch item: a decorative, explicitly non-conformal 3D donut of the texture.
- **Fallbacks:** superattracting `c` (`λ = 0`, no torus) uses a Böttcher log-polar texture and says so; `|λ| ≥ 1` or
  unresolved `c` shows the Julia set without a torus; pixels that do not land within budget are marked unresolved
  (expected as `|λ| → 1`). The panel is labeled a visual chart, not a certified claim.
- **Tests:** invariance `T(f(z)) ≡ T(z)` mod the lattice at sampled basin points; `φ(f^p w) ≈ λφ(w)`; period-one
  closed form `z* = (1 − √(1−4c))/2`, `λ = 1 − √(1−4c)`; texture continuity across fundamental annuli; fallbacks.

## 6. Touch and input (all views)

One gesture layer on Pointer Events feeds every chart controller:

- one-finger drag: pan (globe: rotate); two-finger pinch: zoom about the midpoint; two-finger twist: globe roll about
  the view axis; double-tap: zoom in; long-press: the existing region/inspection affordance; tap: select (cylinder
  entry, panel `c`).
- Gestures cancel cleanly into the existing render-cancellation path; `touch-action: none` only on canvases; page
  scroll, keyboard controls, and accessibility semantics stay intact. Keyboard equivalents exist for every gesture.
- The gesture reducer is a pure function over pointer events (unit-testable with synthetic sequences). CI runs a
  Playwright touch-emulation test; local browser installs are known to be unreliable on the development machine, so
  browser evidence comes from CI.

## 7. Error handling and honesty

- Outside-chart, background, unresolved, and fallback states each have a distinct, legend-documented color.
- No view claims certification; readouts show the canonical `c` (and `z`) actually computed.
- Descriptor versioning prevents cache reuse across charts or semantic revisions.

## 8. Testing and evidence summary

Unit tests per chart (round trips, oracles, seams), gesture-reducer tests, worker protocol tests for every descriptor
kind, and CI browser tests (Chromium and Firefox) including touch emulation. Performance: each view reports render
time through the existing observability; no performance gate is claimed for the new views, but the affine path must
show no regression (bit-identical output and Stage A-style timing parity on the corpus).

## 9. Out of scope

Deep-zoom/perturbation work; certification of chart outputs; Böttcher/external-ray charts outside the set (beyond the
superattracting fallback texture); straightening/renormalization charts; user-supplied texture images (possible later).
