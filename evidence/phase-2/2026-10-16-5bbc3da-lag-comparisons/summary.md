# Lag comparisons — 2026-10-16 @ 5bbc3da

Workstream C gate component `Lag comparisons reduced >50%` for the default watched-lag kernel ([ADR 0006](../../../docs/decisions/0006-watched-lag-default-classifier.md)), frozen corpus at the shipping 1024×640 raster, each case at its corpus profile. Produced by `npm run bench:lag-comparisons -- 1024x640` (`tools/benchmark/lag-comparisons.ts`).

- **legacy-scan:** the instrumented reference kernel's own `lagComparisons` counter.
- **triggered-scan:** a counting replica of `classifyTriggeredOrbitInto` (one comparison per watched-lag test, one per lag distance of each full scan). The replica was checked against the production kernel on every pixel (status, iterations, period, multiplier, smooth iteration): **0 mismatches**, so its counts describe the shipped path.

Deterministic counts in Node; the machine's load does not affect them. Browser runs execute the same kernel, so the counts carry over.

| Case                            | Designation  | legacy comparisons | watched-lag comparisons |                                 reduction |
| ------------------------------- | ------------ | -----------------: | ----------------------: | ----------------------------------------: |
| mi-easy-default-full            | screening    |         99,064,636 |               5,125,978 |                                     94.8% |
| mi-easy-exterior-heavy          | screening    |                  0 |                       0 | — (no lag scans: escape or analytic only) |
| mi-easy-main-cardioid           | screening    |            454,396 |                  24,840 |                                     94.5% |
| mi-easy-period2-bulb            | screening    |                  0 |                       0 | — (no lag scans: escape or analytic only) |
| mi-hard-rabbit-boundary         | release-gate |      1,343,250,967 |              68,847,821 |                                     94.9% |
| mi-hard-supplied-126x           | release-gate |      2,962,752,405 |              90,915,205 |                                     96.9% |
| mi-hard-supplied-609x           | release-gate |        902,132,075 |              28,229,198 |                                     96.9% |
| mi-hard-supplied-13x            | release-gate |      2,264,821,746 |              68,783,590 |                                     97.0% |
| mi-fallback-unknown-high-period | release-gate |      4,435,553,664 |             226,290,668 |                                     94.9% |
| mi-fallback-weak-attraction     | release-gate |      8,137,709,224 |             371,317,659 |                                     95.4% |
| mi-fallback-ambiguous-boundary  | release-gate |        205,030,506 |              11,103,051 |                                     94.6% |
| mi-fallback-budget-exhaustion   | release-gate |      5,542,619,776 |             270,333,332 |                                     95.1% |
| mi-scale-6mx-basilica-rim       | release-gate |      5,112,791,040 |             230,686,720 |                                     95.5% |
| **all cases**                   |              |     31,006,180,435 |           1,371,658,062 |                                     95.6% |

Every case that scans lags is reduced 94.5%–97.0%, far past the gate's >50%.
