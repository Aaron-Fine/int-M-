# Period-4 answer-change adjudication — 2026-10-17 @ cf414cc

Workstream H period 4 ([ADR 0013](../../../docs/decisions/0013-analytic-period-four.md)).
Plan §3: a changed answer ships only when the oracle supports it; ADR 0007:
an intended kernel change regenerates the golden fixture with oracle evidence
for the changed pixels.

- **Before:** `30af42c` (kernels without the period-4 path). **After:** `cf414cc` (the after dumps were taken at `152354c`, which records `afterCommit` in the JSON files; `src/` is identical to `cf414cc`).
- **Raster:** the golden raster, 160×100, every frozen-corpus case at its profile (`tools/kernel_pixel_dump.ts`); and the 6,000,000× view alone at the shipping raster, 1024×640.
- **Oracle:** `ddPeriodFourCycle` (`tests/unit/domain/dd-oracle.ts`): a binary64 orbit seed, dd Newton on f⁴(z) − z, dd divisor test and dd |λ| < 1. It uses no cubic.
- **Supported** means: the new record is exactly the analytic period-4 record at c, and the dd cycle has primitive period 4 with |λ − λ_dd| ≤ A + 1e-12, where A is the certificate's allowance at c (PERFORMANCE-MATHEMATICS §12.4: the certificate itself claims A/2).
- Command: `npm run evidence:period-four -- before.json after.json <this directory>`; the deep view: the same with `--raster 1024x640 --cases mi-scale-6mx-basilica-rim` dumps. Node, deterministic; the machine does not affect the result.

## Changed pixels

| Case                      | Transition                     | Pixels |
| ------------------------- | ------------------------------ | -----: |
| mi-easy-default-full      | attracting-p4 -> attracting-p4 |     30 |
| mi-easy-default-full      | unresolved -> attracting-p4    |      2 |
| mi-hard-supplied-126x     | unresolved -> attracting-p4    |    312 |
| mi-hard-supplied-126x     | attracting-p4 -> attracting-p4 |   1772 |
| mi-hard-supplied-609x     | unresolved -> attracting-p4    |     84 |
| mi-hard-supplied-609x     | attracting-p4 -> attracting-p4 |    593 |
| mi-hard-supplied-13x      | unresolved -> attracting-p4    |    216 |
| mi-hard-supplied-13x      | attracting-p4 -> attracting-p4 |   1426 |
| mi-scale-6mx-basilica-rim | unresolved -> attracting-p4    |   8000 |

All 12,435 changed pixels are supported: **0 unsupported**. The largest distance between the certified multiplier and the dd multiplier is 3.5e-12, at most 4.5e-3 of the allowance (largest allowance 5.6e-9, next to the real primitive cusp in the 609× view); before the change, the orbit-product multiplier of the 3,821 already-period-4 pixels was up to 3.2e-6 from the dd value.

**The changed set equals the analytic answer set.** The tool evaluates the analytic classifier at every pixel centre: it answers 12,435 pixels, exactly the 12,435 that changed; no other pixel changed in any case (`changedSetEqualsAnalyticSet` in `semantic-comparison.json`).

## Colour

| Case                      | View       | Colour changed: status | Colour changed: multiplier only |
| ------------------------- | ---------- | ---------------------: | ------------------------------: |
| mi-easy-default-full      | stability  |                      2 |                               0 |
| mi-easy-default-full      | multiplier |                      2 |                               0 |
| mi-easy-default-full      | period     |                      2 |                               0 |
| mi-hard-supplied-126x     | stability  |                    312 |                               0 |
| mi-hard-supplied-126x     | multiplier |                    312 |                               0 |
| mi-hard-supplied-126x     | period     |                    312 |                               0 |
| mi-hard-supplied-609x     | stability  |                     84 |                               0 |
| mi-hard-supplied-609x     | multiplier |                     84 |                               0 |
| mi-hard-supplied-609x     | period     |                     84 |                               0 |
| mi-hard-supplied-13x      | stability  |                    216 |                               0 |
| mi-hard-supplied-13x      | multiplier |                    216 |                               0 |
| mi-hard-supplied-13x      | period     |                    216 |                               0 |
| mi-scale-6mx-basilica-rim | stability  |                   8000 |                               0 |
| mi-scale-6mx-basilica-rim | multiplier |                   8000 |                               0 |
| mi-scale-6mx-basilica-rim | period     |                   8000 |                               0 |

The multiplier change alone alters no colorized byte in any view; only the 8,614 status changes are visible. Other cases: no change.

## Unresolved pixels

| Case                      | Unresolved before | Unresolved after |
| ------------------------- | ----------------: | ---------------: |
| mi-easy-default-full      |                66 |               64 |
| mi-hard-supplied-126x     |               498 |              186 |
| mi-hard-supplied-609x     |               145 |               61 |
| mi-hard-supplied-13x      |               369 |              153 |
| mi-scale-6mx-basilica-rim |              8000 |                0 |

## The 6,000,000× view at 1024×640

All 327,680 pixels of the view's left half move from unresolved to attracting period 4 and are supported (0 unsupported; largest |λ − λ_dd| 1.1e-14, allowance 3.6e-12); no pixel of the view stays unresolved. This resolves the unresolved half of the basilica-rim view (PHASE2-TODO item 8). The comparison is `deep-view-1024x640.json`; its per-pixel rows (30 MB) are not committed and are reproduced by the command above.

## Limits

- One raster and one corpus, plus one view at the shipping raster. `tests/unit/render/period-four-golden-oracle.test.ts` repeats the dd check for every analytic period-4 pixel of the golden raster on every test run.
- The dd oracle certifies |λ| < 1 without a margin; agreement within the allowance with the analytic multiplier, which carries the margin, is what is claimed. The acceptance itself rests on the enclosure of PERFORMANCE-MATHEMATICS §12, not on this comparison.
- No semantic change outside period 4 (no other transition occurs).
