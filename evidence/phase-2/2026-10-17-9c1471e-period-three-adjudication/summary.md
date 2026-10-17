# Period-3 answer-change adjudication — 2026-10-17 @ 9c1471e

Workstream H period 3 ([ADR 0010](../../../docs/decisions/0010-analytic-period-three.md)).
Plan §3: a changed answer ships only when the oracle supports it; ADR 0007:
an intended kernel change regenerates the golden fixture with oracle evidence
for the changed pixels.

- **Before:** `8c100ed` (kernels without the period-3 path). **After:** `9c1471e` (the after dump was taken at `6854097`, which records `afterCommit` in the JSON files; `src/` and the kernel tools are identical to `9c1471e`: the only difference is `tools/generate_orbit_fixtures.py`, which the classifier does not use).
- **Raster:** the golden raster, 160×100, every frozen-corpus case at its
  profile (`tools/kernel_pixel_dump.ts`).
- **Oracle:** `ddPeriodThreeCycle` (`tests/unit/domain/dd-oracle.ts`): a
  binary64 orbit seed, dd Newton on f³(z) − z, dd divisor test and dd
  |λ| < 1. It uses no closed form.
- **Supported** means: the new record is exactly the analytic period-3 record
  at c, and the dd cycle has primitive period 3 with |λ − λ_dd| ≤ 1e-12.
- Command: `npm run evidence:period-three -- before.json after.json <this directory>`.
  Node, deterministic; the machine does not affect the result.

## Changed pixels

| Case                        | Transition                     | Pixels |
| --------------------------- | ------------------------------ | -----: |
| mi-easy-default-full        | unresolved -> attracting-p3    |     26 |
| mi-easy-default-full        | attracting-p3 -> attracting-p3 |     70 |
| mi-hard-rabbit-boundary     | unresolved -> attracting-p3    |    620 |
| mi-hard-rabbit-boundary     | attracting-p3 -> attracting-p3 |   2500 |
| mi-fallback-weak-attraction | unresolved -> attracting-p3    |    428 |
| mi-fallback-weak-attraction | attracting-p3 -> attracting-p3 |  15572 |

All 19,216 changed pixels are supported: **0 unsupported**. The largest
distance between the closed-form multiplier and the dd multiplier is
3.0e-15; before the change, the orbit-product multiplier of the 18,142
already-period-3 pixels was up to 1.02e-8 from the dd value.

**The changed set equals the analytic answer set.** The tool evaluates the
analytic classifier at every pixel centre: it answers 19,216 pixels, exactly
the 19,216 that changed; no pixel the analytic path answers is unchanged and
no other pixel changed in any case. The tool exits 1 if this fails
(`changedSetEqualsAnalyticSet` in `semantic-comparison.json`).

## Colour

| Case                        | View       | Colour changed: status | Colour changed: multiplier only |
| --------------------------- | ---------- | ---------------------: | ------------------------------: |
| mi-easy-default-full        | stability  |                     26 |                               0 |
| mi-easy-default-full        | multiplier |                     26 |                               0 |
| mi-easy-default-full        | period     |                     26 |                               0 |
| mi-hard-rabbit-boundary     | stability  |                    620 |                               0 |
| mi-hard-rabbit-boundary     | multiplier |                    620 |                               0 |
| mi-hard-rabbit-boundary     | period     |                    620 |                               0 |
| mi-fallback-weak-attraction | stability  |                    428 |                               0 |
| mi-fallback-weak-attraction | multiplier |                    428 |                               0 |
| mi-fallback-weak-attraction | period     |                    428 |                               0 |

Re-checked under the current colorizer (`colorizeFrame` with the period key
built from each frame, no isolation): the multiplier change alone alters no
colorized byte in any view (0 multiplier-only changes in every row, all three
views, all cases); only the 1,074 status changes are visible. Other cases: no
change.

## Limits

- One raster and one corpus. `tests/unit/render/period-three-golden-oracle.test.ts`
  repeats the dd check for every analytic period-3 pixel of this raster on
  every test run.
- The dd oracle certifies |λ| < 1 without a margin; agreement within 1e-12 with
  the analytic multiplier, which carries the margin, is what is claimed.
- No semantic change outside period 3 (no other transition occurs).
