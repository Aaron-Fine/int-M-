# Early certified-acceptance measurement

> Offline Node measurement. Iteration counts, not wall-clock. No binary64 error
> allowance eta (eta = 0). Not a release gate. Approximate where stated below.

- Date: 2026-10-10; commit `69f385b` on `proof/certified-acceptance` (working tree not clean: includes this tool, its package.json script and tsconfig.tools.json entry, and possibly unrelated changes)
- Command: `npm run evidence:early-accept -- --schedule geometric`
- Environment: Node v24.19.0, linux 7.2.8-200.fc44.x86_64 x64, 11th Gen Intel(R) Core(TM) i7-1185G7 @ 3.00GHz, 15703 MiB RAM
- Samples: 13 corpus cases x 96x72 pixel-center raster = 89856 pixels (20346 analytic fast-path pixels have 0 production iterations and are excluded from certification)
- Runtime: 5.8 s total (single process, includes the production re-runs and extended scans; informational only)
- Budgets: each case uses its corpus profile (Quick 256/16, Balanced 512/32, Detailed 1024/64 for maxIterations/maxPeriod); the extended budget is 4x maxIterations.
- Certification: prefilter |z_n - z_(n-p)| < 0.01; radius ladder r in {2,4,16,64,256} x |f^p(z0)-z0| and {1e-3, 1e-4}, floored at 1.00e-12 and clipped to <= 0.1; tried in ascending order (stopping at a 'q' or divisor failure, which is monotone in r), first success taken; smallest p first; an exact radius-independent rejection q >= prod 2|z_j| >= 1 is applied first (counted); attempt schedule: geometric, 4 attempts per octave from n = 16; z0 = z_n; no warmup; n - p >= 1.

## Approximations and caveats

- eta = 0: exact-real arithmetic is assumed for the certification inequalities, evaluated in binary64. The radius floor (`--r-floor`) keeps r well above binary64 resolution; the etaRoom figures below say how much slack a real eta would have.
- Cost unit: one op = one complex z^2+c step (the p-step lookahead walk, shared by all radii at an (n, p) attempt) or one real error-recursion step (e_j, R_j, q; counted per tried radius, p steps each). A production "iteration" is counted as 1 op although its lag scan also does up to maxPeriod comparisons, so attempt cost relative to production work is overstated, possibly by an order of magnitude; the last savings column re-weights a production iteration as 8 and 32 ops (a sensitivity, not a calibrated figure). Prefilter comparisons are not counted (production performs the same comparisons).
- Savings assume a combined scheme: the certifier runs alongside the production scan and the pixel stops at whichever accepts first. Gross savings = sum over pixels certified within the production budget of max(0, n_prod - n_cert) (for unresolved pixels n_prod = maxIterations). Attempt cost is counted on every non-analytic pixel up to min(n_cert, n_prod), including escaping pixels. Net = gross - attempt cost. Escaping pixels contribute their iterations to the denominator and no saving.
- "n_cert" for production-accepted pixels is found by scanning up to the extended budget even when production already accepted, so "cert later" is measured, not assumed.
- Bucketing: |lambda| is production's multiplier modulus for accepted pixels and the certified q (an upper bound on |lambda|) for unresolved pixels that certify; pixels with neither are in the "none" row. Period is production's accepted period, else the certified period.
- The raster is a downsampled raster of the case view, not the shipping 1024x640 raster; pixel centers follow the viewport transform. Distributions are therefore per-sample, not area-exact.

## Per case

| group                           | prod accepted | also certified | cert earlier/same/later | never certified | n_prod-n_cert median / p90 | n_cert/n_prod median / p90 | prod unresolved | conv <= budget | conv <= ext. budget | late escape |
| ------------------------------- | ------------- | -------------- | ----------------------- | --------------- | -------------------------- | -------------------------- | --------------- | -------------- | ------------------- | ----------- |
| mi-easy-default-full            | 66            | 66             | 66/0/0                  | 0               | 132.0 / 266.0              | 0.166 / 0.281              | 60              | 28             | 40                  | 8           |
| mi-easy-exterior-heavy          | 0             | 0              | 0/0/0                   | 0               | n/a / n/a                  | n/a / n/a                  | 0               | 0              | 0                   | 0           |
| mi-easy-main-cardioid           | 0             | 0              | 0/0/0                   | 0               | n/a / n/a                  | n/a / n/a                  | 0               | 0              | 0                   | 0           |
| mi-easy-period2-bulb            | 0             | 0              | 0/0/0                   | 0               | n/a / n/a                  | n/a / n/a                  | 0               | 0              | 0                   | 0           |
| mi-hard-rabbit-boundary         | 1408          | 1408           | 1408/0/0                | 0               | 115.0 / 274.3              | 0.210 / 0.348              | 518             | 254            | 378                 | 45          |
| mi-hard-supplied-126x           | 1121          | 1121           | 1121/0/0                | 0               | 165.0 / 409.0              | 0.252 / 0.404              | 253             | 108            | 190                 | 11          |
| mi-hard-supplied-609x           | 381           | 381            | 381/0/0                 | 0               | 141.0 / 329.0              | 0.296 / 0.496              | 76              | 22             | 53                  | 3           |
| mi-hard-supplied-13x            | 813           | 813            | 813/0/0                 | 0               | 161.0 / 449.0              | 0.206 / 0.333              | 187             | 101            | 143                 | 13          |
| mi-fallback-unknown-high-period | 0             | 0              | 0/0/0                   | 0               | n/a / n/a                  | n/a / n/a                  | 673             | 0              | 0                   | 284         |
| mi-fallback-weak-attraction     | 6761          | 6761           | 6761/0/0                | 0               | 270.0 / 313.0              | 0.324 / 0.376              | 151             | 151            | 151                 | 0           |
| mi-fallback-ambiguous-boundary  | 15            | 15             | 15/0/0                  | 0               | 301.0 / 394.0              | 0.079 / 0.116              | 47              | 18             | 24                  | 9           |
| mi-fallback-budget-exhaustion   | 16            | 16             | 16/0/0                  | 0               | 441.0 / 441.0              | 0.083 / 0.089              | 2054            | 564            | 1002                | 302         |
| mi-scale-6mx-basilica-rim       | 0             | 0              | 0/0/0                   | 0               | n/a / n/a                  | n/a / n/a                  | 3456            | 0              | 0                   | 0           |
| **ALL**                         | 10581         | 10581          | 10581/0/0               | 0               | 261.0 / 316.0              | 0.313 / 0.377              | 7475            | 1246           | 1981                | 675         |

### Per-case savings

| group                           | production iterations | gross saved iterations | period attempts / radius evals | attempt cost (ops)  | net saved (1 op/iter) | net % if 1 prod iter = 8 / 32 ops |
| ------------------------------- | --------------------- | ---------------------- | ------------------------------ | ------------------- | --------------------- | --------------------------------- |
| mi-easy-default-full            | 73722                 | 16516 (22.40%)         | 2816 / 9396                    | 232328 (315.14%)    | -215812 (-292.74%)    | -16.99% / 12.55%                  |
| mi-easy-exterior-heavy          | 8141                  | 0 (0.00%)              | 0 / 0                          | 0 (0.00%)           | 0 (0.00%)             | 0.00% / 0.00%                     |
| mi-easy-main-cardioid           | 0                     | 0 (0.00%)              | 0 / 0                          | 0 (0.00%)           | 0 (0.00%)             | 0.00% / 0.00%                     |
| mi-easy-period2-bulb            | 0                     | 0 (0.00%)              | 0 / 0                          | 0 (0.00%)           | 0 (0.00%)             | 0.00% / 0.00%                     |
| mi-hard-rabbit-boundary         | 617806                | 249020 (40.31%)        | 43533 / 151221                 | 3286958 (532.04%)   | -3037938 (-491.73%)   | -26.20% / 23.68%                  |
| mi-hard-supplied-126x           | 764429                | 262028 (34.28%)        | 81617 / 240694                 | 11090161 (1450.78%) | -10828133 (-1416.50%) | -147.07% / -11.06%                |
| mi-hard-supplied-609x           | 308752                | 69861 (22.63%)         | 43228 / 92577                  | 4939631 (1599.87%)  | -4869770 (-1577.24%)  | -177.36% / -27.37%                |
| mi-hard-supplied-13x            | 544270                | 210290 (38.64%)        | 25627 / 90565                  | 3707687 (681.22%)   | -3497397 (-642.59%)   | -46.52% / 17.35%                  |
| mi-fallback-unknown-high-period | 1708465               | 0 (0.00%)              | 332 / 2                        | 12492 (0.73%)       | -12492 (-0.73%)       | -0.09% / -0.02%                   |
| mi-fallback-weak-attraction     | 2853217               | 1903281 (66.71%)       | 479565 / 1781992               | 37826868 (1325.76%) | -35923587 (-1259.06%) | -99.01% / 25.28%                  |
| mi-fallback-ambiguous-boundary  | 149487                | 9179 (6.14%)           | 1478 / 2237                    | 109036 (72.94%)     | -99857 (-66.80%)      | -2.98% / 3.86%                    |
| mi-fallback-budget-exhaustion   | 1959208               | 148464 (7.58%)         | 42244 / 61318                  | 4327648 (220.89%)   | -4179184 (-213.31%)   | -20.03% / 0.68%                   |
| mi-scale-6mx-basilica-rim       | 1769472               | 0 (0.00%)              | 404352 / 1613952               | 36578304 (2067.19%) | -36578304 (-2067.19%) | -258.40% / -64.60%                |
| **ALL**                         | 10756969              | 2868639 (26.67%)       | 1124792 / 4043954              | 102111113 (949.25%) | -99242474 (-922.59%)  | -91.99% / -3.00%                  |

## Aggregated by |lambda| bucket

| group                                   | prod accepted | also certified | cert earlier/same/later | never certified | n_prod-n_cert median / p90 | n_cert/n_prod median / p90 | prod unresolved | conv <= budget | conv <= ext. budget | late escape |
| --------------------------------------- | ------------- | -------------- | ----------------------- | --------------- | -------------------------- | -------------------------- | --------------- | -------------- | ------------------- | ----------- |
| [0,0.5)                                 | 1113          | 1113           | 1113/0/0                | 0               | 51.0 / 129.0               | 0.239 / 0.432              | 0               | 0              | 0                   | 0           |
| [0.5,0.8)                               | 1792          | 1792           | 1792/0/0                | 0               | 141.0 / 241.0              | 0.180 / 0.262              | 395             | 383            | 395                 | 0           |
| [0.8,0.9)                               | 7290          | 7290           | 7290/0/0                | 0               | 270.0 / 315.0              | 0.321 / 0.375              | 400             | 183            | 400                 | 0           |
| [0.9,0.95)                              | 386           | 386            | 386/0/0                 | 0               | 319.0 / 515.0              | 0.380 / 0.496              | 706             | 461            | 706                 | 0           |
| [0.95,0.99)                             | 0             | 0              | 0/0/0                   | 0               | n/a / n/a                  | n/a / n/a                  | 448             | 219            | 448                 | 0           |
| [0.99,1)                                | 0             | 0              | 0/0/0                   | 0               | n/a / n/a                  | n/a / n/a                  | 32              | 0              | 32                  | 0           |
| none (escaped / unresolved-uncertified) | 0             | 0              | 0/0/0                   | 0               | n/a / n/a                  | n/a / n/a                  | 5494            | 0              | 0                   | 675         |

| group                                   | production iterations | gross saved iterations | period attempts / radius evals | attempt cost (ops)  | net saved (1 op/iter) | net % if 1 prod iter = 8 / 32 ops |
| --------------------------------------- | --------------------- | ---------------------- | ------------------------------ | ------------------- | --------------------- | --------------------------------- |
| [0,0.5)                                 | 98056                 | 79024 (80.59%)         | 1210 / 2344                    | 32391 (33.03%)      | 46633 (47.56%)        | 76.46% / 79.56%                   |
| [0.5,0.8)                               | 565268                | 416560 (73.69%)        | 31237 / 108518                 | 2768410 (489.75%)   | -2351850 (-416.06%)   | 12.47% / 58.39%                   |
| [0.8,0.9)                               | 3201404               | 2047616 (63.96%)       | 503359 / 1846396               | 41726740 (1303.39%) | -39679124 (-1239.43%) | -98.96% / 23.23%                  |
| [0.9,0.95)                              | 642287                | 269215 (41.91%)        | 77547 / 259645                 | 8840751 (1376.45%)  | -8571536 (-1334.53%)  | -130.14% / -1.10%                 |
| [0.95,0.99)                             | 370688                | 56224 (15.17%)         | 54809 / 169216                 | 7892874 (2129.25%)  | -7836650 (-2114.08%)  | -250.99% / -51.37%                |
| [0.99,1)                                | 28160                 | 0 (0.00%)              | 3954 / 7764                    | 462186 (1641.29%)   | -462186 (-1641.29%)   | -205.16% / -51.29%                |
| none (escaped / unresolved-uncertified) | 5851106               | 0 (0.00%)              | 452676 / 1650071               | 40387761 (690.26%)  | -40387761 (-690.26%)  | -86.28% / -21.57%                 |

## Aggregated by period

| group  | prod accepted | also certified | cert earlier/same/later | never certified | n_prod-n_cert median / p90 | n_cert/n_prod median / p90 | prod unresolved | conv <= budget | conv <= ext. budget | late escape |
| ------ | ------------- | -------------- | ----------------------- | --------------- | -------------------------- | -------------------------- | --------------- | -------------- | ------------------- | ----------- |
| p1     | 0             | 0              | 0/0/0                   | 0               | n/a / n/a                  | n/a / n/a                  | 0               | 0              | 0                   | 0           |
| p2     | 0             | 0              | 0/0/0                   | 0               | n/a / n/a                  | n/a / n/a                  | 0               | 0              | 0                   | 0           |
| p3     | 8084          | 8084           | 8084/0/0                | 0               | 267.0 / 312.0              | 0.318 / 0.376              | 453             | 352            | 453                 | 0           |
| p4     | 1975          | 1975           | 1975/0/0                | 0               | 145.0 / 373.0              | 0.246 / 0.413              | 270             | 159            | 270                 | 0           |
| p5-8   | 293           | 293            | 293/0/0                 | 0               | 201.0 / 433.0              | 0.180 / 0.336              | 81              | 57             | 81                  | 0           |
| p9-16  | 162           | 162            | 162/0/0                 | 0               | 271.0 / 475.8              | 0.136 / 0.315              | 102             | 69             | 102                 | 0           |
| p17-32 | 56            | 56             | 56/0/0                  | 0               | 431.0 / 542.5              | 0.105 / 0.198              | 1058            | 600            | 1058                | 0           |
| p33-64 | 11            | 11             | 11/0/0                  | 0               | 433.0 / 777.0              | 0.110 / 0.167              | 17              | 9              | 17                  | 0           |

| group  | production iterations | gross saved iterations | period attempts / radius evals | attempt cost (ops)  | net saved (1 op/iter) | net % if 1 prod iter = 8 / 32 ops |
| ------ | --------------------- | ---------------------- | ------------------------------ | ------------------- | --------------------- | --------------------------------- |
| p1     | 0                     | 0 (0.00%)              | 0 / 0                          | 0 (0.00%)           | 0 (0.00%)             | 0.00% / 0.00%                     |
| p2     | 0                     | 0 (0.00%)              | 0 / 0                          | 0 (0.00%)           | 0 (0.00%)             | 0.00% / 0.00%                     |
| p3     | 3224126               | 2116442 (65.64%)       | 517435 / 1921182               | 40697154 (1262.27%) | -38580712 (-1196.63%) | -92.14% / 26.20%                  |
| p4     | 795113                | 411305 (51.73%)        | 116718 / 365149                | 15832860 (1991.27%) | -15421555 (-1939.54%) | -197.18% / -10.50%                |
| p5-8   | 153176                | 83140 (54.28%)         | 14024 / 42613                  | 1848672 (1206.89%)  | -1765532 (-1152.62%)  | -96.58% / 16.56%                  |
| p9-16  | 128049                | 69993 (54.66%)         | 6760 / 19713                   | 862356 (673.46%)    | -792363 (-618.80%)    | -29.52% / 33.62%                  |
| p17-32 | 582168                | 178128 (30.60%)        | 16525 / 44238                  | 2396355 (411.63%)   | -2218227 (-381.03%)   | -20.86% / 17.73%                  |
| p33-64 | 23231                 | 9631 (41.46%)          | 654 / 988                      | 85955 (370.00%)     | -76324 (-328.54%)     | -4.79% / 29.89%                   |

## Disagreements

None.

## Unresolved pixels (production, at its budget)

- 7475 unresolved; 1246 certify within the production budget; 1981 within the extended budget; 5494 remain uncertified (675 of those escape within the extended budget).
- Extended-budget production (same classifier, 4x maxIterations) accepts 1560 of the unresolved pixels.

## Estimated savings

- Production iterations (all non-analytic pixels, escapes included): 10756969
- Gross saved: 2868639 (26.67%); attempt cost: 102111113 ops (949.25%); net: -99242474 (-922.59%); net if a production iteration costs 8 / 32 ops: -91.99% / -3.00%

## Smallest margins observed (eta slack)

- etaRoom, first-success radius (squared units): min 2.88e-24, p01 3.93e-13, p10 2.50e-10, median 7.34e-9, max 2.14e-5 (n = 12562)
- etaRoom, best certifying radius on the ladder (squared units): min 5.38e-14, p01 1.32e-11, p10 1.33e-9, median 1.92e-8, max 3.47e-4 (n = 12562)
- Fraction of certified pixels with selected etaRoom below 1e-20 / 1e-24 / 1e-28 / 1e-30: 0.05% / 0.00% / 0.00% / 0.00%
- Same for best-radius etaRoom: 0.00% / 0.00% / 0.00% / 0.00%
- smallest selected etaRoom: 2.88e-24 (mi-hard-rabbit-boundary, c = -0.12464450020998684, 0.7427784332864101; n_cert = 16, p = 3, r = 2.05e-12, q = 0.0312)
- smallest best-radius etaRoom: 5.38e-14 (mi-hard-supplied-609x, c = -1.9410531618555007, 0.0006152169953754972; n_cert = 3584, p = 4, r = 8.86e-5, q = 0.9953)
- smallest absolute closure slack r(1-q) - res: 9.59e-13 (mi-hard-rabbit-boundary, c = -0.12464450020998684, 0.7427784332864101; n_cert = 16, p = 3, r = 2.05e-12, q = 0.0312)
- largest closure ratio res / (r(1-q)): 1.00e+0 (mi-hard-supplied-13x, c = 0.2719897808632479, 0.5112784083504274; n_cert = 16, p = 4, r = 2.56e-3, q = 0.5000)
- smallest absolute divisor slack dist_d - (e_d + r): 1.02e-3 (mi-hard-supplied-126x, c = -0.1571110232504409, -1.0385749576719576; n_cert = 3584, p = 40, r = 1.62e-5, q = 0.9732)
- largest divisor ratio (e_d + r) / dist_d: 1.25e-1 (mi-hard-supplied-126x, c = -0.16152019432627865, -1.0366459453262786; n_cert = 64, p = 8, r = 3.70e-3, q = 0.9312)
- smallest radius used: 2.05e-12 (mi-hard-rabbit-boundary, c = -0.12464450020998684, 0.7427784332864101; n_cert = 16, p = 3, r = 2.05e-12, q = 0.0312)
