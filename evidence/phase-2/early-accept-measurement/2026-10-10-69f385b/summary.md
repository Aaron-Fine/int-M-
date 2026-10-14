# Early certified-acceptance measurement

> Offline Node measurement. Iteration counts, not wall-clock. No binary64 error
> allowance eta (eta = 0). Not a release gate. Approximate where stated below.

- Date: 2026-10-10; commit `69f385b` on `proof/certified-acceptance` (working tree not clean: includes this tool, its package.json script and tsconfig.tools.json entry, and possibly unrelated changes)
- Command: `npm run evidence:early-accept --`
- Environment: Node v24.19.0, linux 7.2.8-200.fc44.x86_64 x64, 11th Gen Intel(R) Core(TM) i7-1185G7 @ 3.00GHz, 15703 MiB RAM
- Samples: 13 corpus cases x 96x72 pixel-center raster = 89856 pixels (20346 analytic fast-path pixels have 0 production iterations and are excluded from certification)
- Runtime: 195.8 s total (single process, includes the production re-runs and extended scans; informational only)
- Budgets: each case uses its corpus profile (Quick 256/16, Balanced 512/32, Detailed 1024/64 for maxIterations/maxPeriod); the extended budget is 4x maxIterations.
- Certification: prefilter |z_n - z_(n-p)| < 0.01; radius ladder r in {2,4,16,64,256} x |f^p(z0)-z0| and {1e-3, 1e-4}, floored at 1.00e-12 and clipped to <= 0.1; tried in ascending order (stopping at a 'q' or divisor failure, which is monotone in r), first success taken; smallest p first; an exact radius-independent rejection q >= prod 2|z_j| >= 1 is applied first (counted); attempt schedule: every iteration n; z0 = z_n; no warmup; n - p >= 1.

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
| mi-easy-default-full            | 66            | 66             | 66/0/0                  | 0               | 132.0 / 270.0              | 0.108 / 0.233              | 60              | 28             | 40                  | 8           |
| mi-easy-exterior-heavy          | 0             | 0              | 0/0/0                   | 0               | n/a / n/a                  | n/a / n/a                  | 0               | 0              | 0                   | 0           |
| mi-easy-main-cardioid           | 0             | 0              | 0/0/0                   | 0               | n/a / n/a                  | n/a / n/a                  | 0               | 0              | 0                   | 0           |
| mi-easy-period2-bulb            | 0             | 0              | 0/0/0                   | 0               | n/a / n/a                  | n/a / n/a                  | 0               | 0              | 0                   | 0           |
| mi-hard-rabbit-boundary         | 1408          | 1408           | 1408/0/0                | 0               | 117.0 / 282.0              | 0.126 / 0.239              | 518             | 254            | 380                 | 45          |
| mi-hard-supplied-126x           | 1121          | 1121           | 1121/0/0                | 0               | 172.0 / 434.0              | 0.186 / 0.350              | 253             | 108            | 191                 | 11          |
| mi-hard-supplied-609x           | 381           | 381            | 381/0/0                 | 0               | 147.0 / 354.0              | 0.228 / 0.434              | 76              | 22             | 53                  | 3           |
| mi-hard-supplied-13x            | 813           | 813            | 813/0/0                 | 0               | 168.0 / 467.2              | 0.139 / 0.270              | 187             | 101            | 143                 | 13          |
| mi-fallback-unknown-high-period | 0             | 0              | 0/0/0                   | 0               | n/a / n/a                  | n/a / n/a                  | 673             | 0              | 0                   | 284         |
| mi-fallback-weak-attraction     | 6761          | 6761           | 6761/0/0                | 0               | 282.0 / 327.0              | 0.300 / 0.327              | 151             | 151            | 151                 | 0           |
| mi-fallback-ambiguous-boundary  | 15            | 15             | 15/0/0                  | 0               | 301.0 / 396.2              | 0.079 / 0.114              | 47              | 18             | 24                  | 9           |
| mi-fallback-budget-exhaustion   | 16            | 16             | 16/0/0                  | 0               | 448.0 / 448.0              | 0.069 / 0.073              | 2054            | 586            | 1006                | 302         |
| mi-scale-6mx-basilica-rim       | 0             | 0              | 0/0/0                   | 0               | n/a / n/a                  | n/a / n/a                  | 3456            | 0              | 0                   | 0           |
| **ALL**                         | 10581         | 10581          | 10581/0/0               | 0               | 270.0 / 330.0              | 0.289 / 0.326              | 7475            | 1268           | 1988                | 675         |

### Per-case savings

| group                           | production iterations | gross saved iterations | period attempts / radius evals | attempt cost (ops)     | net saved (1 op/iter)    | net % if 1 prod iter = 8 / 32 ops |
| ------------------------------- | --------------------- | ---------------------- | ------------------------------ | ---------------------- | ------------------------ | --------------------------------- |
| mi-easy-default-full            | 73722                 | 17614 (23.89%)         | 78140 / 245854                 | 6765222 (9176.67%)     | -6747608 (-9152.77%)     | -1123.19% / -262.88%              |
| mi-easy-exterior-heavy          | 8141                  | 0 (0.00%)              | 0 / 0                          | 0 (0.00%)              | 0 (0.00%)                | 0.00% / 0.00%                     |
| mi-easy-main-cardioid           | 0                     | 0 (0.00%)              | 0 / 0                          | 0 (0.00%)              | 0 (0.00%)                | 0.00% / 0.00%                     |
| mi-easy-period2-bulb            | 0                     | 0 (0.00%)              | 0 / 0                          | 0 (0.00%)              | 0 (0.00%)                | 0.00% / 0.00%                     |
| mi-hard-rabbit-boundary         | 617806                | 265154 (42.92%)        | 881684 / 3115651               | 76145049 (12325.07%)   | -75879895 (-12282.16%)   | -1497.72% / -342.24%              |
| mi-hard-supplied-126x           | 764429                | 281760 (36.86%)        | 3760446 / 7566946              | 481010916 (62924.21%)  | -480729156 (-62887.35%)  | -7828.67% / -1929.52%             |
| mi-hard-supplied-609x           | 308752                | 76520 (24.78%)         | 1606007 / 2179348              | 169888919 (55024.39%)  | -169812399 (-54999.61%)  | -6853.27% / -1694.73%             |
| mi-hard-supplied-13x            | 544270                | 224179 (41.19%)        | 1292366 / 4077492              | 209579343 (38506.50%)  | -209355164 (-38465.31%)  | -4772.12% / -1162.14%             |
| mi-fallback-unknown-high-period | 1708465               | 0 (0.00%)              | 14180 / 105                    | 531149 (31.09%)        | -531149 (-31.09%)        | -3.89% / -0.97%                   |
| mi-fallback-weak-attraction     | 2853217               | 1983832 (69.53%)       | 5700762 / 20394669             | 462179433 (16198.54%)  | -460195601 (-16129.01%)  | -1955.29% / -436.68%              |
| mi-fallback-ambiguous-boundary  | 149487                | 9650 (6.46%)           | 22791 / 41416                  | 1935316 (1294.64%)     | -1925666 (-1288.18%)     | -155.37% / -34.00%                |
| mi-fallback-budget-exhaustion   | 1959208               | 169154 (8.63%)         | 2682512 / 2238938              | 176936730 (9031.03%)   | -176767576 (-9022.40%)   | -1120.24% / -273.59%              |
| mi-scale-6mx-basilica-rim       | 1769472               | 0 (0.00%)              | 13125888 / 48610728            | 1241766144 (70177.21%) | -1241766144 (-70177.21%) | -8772.15% / -2193.04%             |
| **ALL**                         | 10756969              | 3027863 (28.15%)       | 29164776 / 88471147            | 2826738221 (26278.20%) | -2823710358 (-26250.06%) | -3256.63% / -793.05%              |

## Aggregated by |lambda| bucket

| group                                   | prod accepted | also certified | cert earlier/same/later | never certified | n_prod-n_cert median / p90 | n_cert/n_prod median / p90 | prod unresolved | conv <= budget | conv <= ext. budget | late escape |
| --------------------------------------- | ------------- | -------------- | ----------------------- | --------------- | -------------------------- | -------------------------- | --------------- | -------------- | ------------------- | ----------- |
| [0,0.5)                                 | 1113          | 1113           | 1113/0/0                | 0               | 63.0 / 136.0               | 0.082 / 0.131              | 0               | 0              | 0                   | 0           |
| [0.5,0.8)                               | 1792          | 1792           | 1792/0/0                | 0               | 146.0 / 248.0              | 0.155 / 0.232              | 323             | 323            | 323                 | 0           |
| [0.8,0.9)                               | 7290          | 7290           | 7290/0/0                | 0               | 282.0 / 327.0              | 0.297 / 0.326              | 348             | 304            | 348                 | 0           |
| [0.9,0.95)                              | 386           | 386            | 386/0/0                 | 0               | 342.0 / 552.0              | 0.337 / 0.444              | 754             | 369            | 754                 | 0           |
| [0.95,0.99)                             | 0             | 0              | 0/0/0                   | 0               | n/a / n/a                  | n/a / n/a                  | 497             | 271            | 497                 | 0           |
| [0.99,1)                                | 0             | 0              | 0/0/0                   | 0               | n/a / n/a                  | n/a / n/a                  | 66              | 1              | 66                  | 0           |
| none (escaped / unresolved-uncertified) | 0             | 0              | 0/0/0                   | 0               | n/a / n/a                  | n/a / n/a                  | 5487            | 0              | 0                   | 675         |

| group                                   | production iterations | gross saved iterations | period attempts / radius evals | attempt cost (ops)     | net saved (1 op/iter)    | net % if 1 prod iter = 8 / 32 ops |
| --------------------------------------- | --------------------- | ---------------------- | ------------------------------ | ---------------------- | ------------------------ | --------------------------------- |
| [0,0.5)                                 | 98056                 | 90078 (91.86%)         | 3395 / 7474                    | 134361 (137.03%)       | -44283 (-45.16%)         | 74.74% / 87.58%                   |
| [0.5,0.8)                               | 526356                | 419237 (79.65%)        | 298933 / 775242                | 27352174 (5196.52%)    | -26932937 (-5116.87%)    | -569.92% / -82.74%                |
| [0.8,0.9)                               | 3173756               | 2157153 (67.97%)       | 6241952 / 21304863             | 538934943 (16980.98%)  | -536777790 (-16913.01%)  | -2054.65% / -462.69%              |
| [0.9,0.95)                              | 654575                | 276562 (42.25%)        | 1904068 / 5095816              | 213789081 (32660.75%)  | -213512519 (-32618.50%)  | -4040.34% / -978.40%              |
| [0.95,0.99)                             | 399872                | 84630 (21.16%)         | 3262400 / 9230651              | 469643383 (117448.43%) | -469558753 (-117427.26%) | -14659.89% / -3649.10%            |
| [0.99,1)                                | 57344                 | 203 (0.35%)            | 633338 / 1227259               | 80314641 (140057.62%)  | -80314438 (-140057.27%)  | -17506.85% / -4376.45%            |
| none (escaped / unresolved-uncertified) | 5847010               | 0 (0.00%)              | 16820690 / 50829842            | 1496569638 (25595.47%) | -1496569638 (-25595.47%) | -3199.43% / -799.86%              |

## Aggregated by period

| group  | prod accepted | also certified | cert earlier/same/later | never certified | n_prod-n_cert median / p90 | n_cert/n_prod median / p90 | prod unresolved | conv <= budget | conv <= ext. budget | late escape |
| ------ | ------------- | -------------- | ----------------------- | --------------- | -------------------------- | -------------------------- | --------------- | -------------- | ------------------- | ----------- |
| p1     | 0             | 0              | 0/0/0                   | 0               | n/a / n/a                  | n/a / n/a                  | 0               | 0              | 0                   | 0           |
| p2     | 0             | 0              | 0/0/0                   | 0               | n/a / n/a                  | n/a / n/a                  | 0               | 0              | 0                   | 0           |
| p3     | 8084          | 8084           | 8084/0/0                | 0               | 276.0 / 327.0              | 0.294 / 0.326              | 453             | 352            | 453                 | 0           |
| p4     | 1975          | 1975           | 1975/0/0                | 0               | 152.0 / 405.6              | 0.179 / 0.347              | 271             | 159            | 271                 | 0           |
| p5-8   | 293           | 293            | 293/0/0                 | 0               | 204.0 / 463.6              | 0.139 / 0.285              | 81              | 57             | 81                  | 0           |
| p9-16  | 162           | 162            | 162/0/0                 | 0               | 276.0 / 513.6              | 0.118 / 0.268              | 103             | 69             | 103                 | 0           |
| p17-32 | 56            | 56             | 56/0/0                  | 0               | 436.0 / 572.0              | 0.095 / 0.173              | 1063            | 622            | 1063                | 0           |
| p33-64 | 11            | 11             | 11/0/0                  | 0               | 440.0 / 780.0              | 0.101 / 0.151              | 17              | 9              | 17                  | 0           |

| group  | production iterations | gross saved iterations | period attempts / radius evals | attempt cost (ops)    | net saved (1 op/iter)   | net % if 1 prod iter = 8 / 32 ops |
| ------ | --------------------- | ---------------------- | ------------------------------ | --------------------- | ----------------------- | --------------------------------- |
| p1     | 0                     | 0 (0.00%)              | 0 / 0                          | 0 (0.00%)             | 0 (0.00%)               | 0.00% / 0.00%                     |
| p2     | 0                     | 0 (0.00%)              | 0 / 0                          | 0 (0.00%)             | 0 (0.00%)               | 0.00% / 0.00%                     |
| p3     | 3224126               | 2211367 (68.59%)       | 6480550 / 23306247             | 530605563 (16457.35%) | -528394196 (-16388.76%) | -1988.58% / -445.70%              |
| p4     | 796137                | 443156 (55.66%)        | 4224317 / 11334450             | 616350880 (77417.69%) | -615907724 (-77362.03%) | -9621.55% / -2363.64%             |
| p5-8   | 153176                | 89122 (58.18%)         | 496283 / 1107073               | 65641980 (42853.96%)  | -65552858 (-42795.78%)  | -5298.56% / -1281.00%             |
| p9-16  | 128561                | 73509 (57.18%)         | 265350 / 522000                | 32395992 (25198.93%)  | -32322483 (-25141.75%)  | -3092.69% / -730.29%              |
| p17-32 | 584728                | 200501 (34.29%)        | 805010 / 1294582               | 77423946 (13241.02%)  | -77223445 (-13206.73%)  | -1620.84% / -379.49%              |
| p33-64 | 23231                 | 10208 (43.94%)         | 72576 / 76953                  | 7750222 (33361.55%)   | -7740014 (-33317.61%)   | -4126.25% / -998.61%              |

## Disagreements

None.

## Unresolved pixels (production, at its budget)

- 7475 unresolved; 1268 certify within the production budget; 1988 within the extended budget; 5487 remain uncertified (675 of those escape within the extended budget).
- Extended-budget production (same classifier, 4x maxIterations) accepts 1560 of the unresolved pixels.

## Estimated savings

- Production iterations (all non-analytic pixels, escapes included): 10756969
- Gross saved: 3027863 (28.15%); attempt cost: 2826738221 ops (26278.20%); net: -2823710358 (-26250.06%); net if a production iteration costs 8 / 32 ops: -3256.63% / -793.05%

## Smallest margins observed (eta slack)

- etaRoom, first-success radius (squared units): min 3.09e-19, p01 3.47e-15, p10 3.61e-12, median 1.63e-9, max 1.52e-5 (n = 12569)
- etaRoom, best certifying radius on the ladder (squared units): min 3.09e-19, p01 3.77e-15, p10 4.44e-12, median 1.86e-9, max 1.40e-4 (n = 12569)
- Fraction of certified pixels with selected etaRoom below 1e-20 / 1e-24 / 1e-28 / 1e-30: 0.00% / 0.00% / 0.00% / 0.00%
- Same for best-radius etaRoom: 0.00% / 0.00% / 0.00% / 0.00%
- smallest selected etaRoom: 3.09e-19 (mi-hard-supplied-609x, c = -1.9408821164258347, 0.0009573078547077359; n_cert = 1121, p = 32, r = 1.86e-8, q = 0.9307)
- smallest best-radius etaRoom: 3.09e-19 (mi-hard-supplied-609x, c = -1.9408821164258347, 0.0009573078547077359; n_cert = 1121, p = 32, r = 1.86e-8, q = 0.9307)
- smallest absolute closure slack r(1-q) - res: 2.56e-11 (mi-hard-supplied-609x, c = -1.9415662981444992, 0.0001020807063771392; n_cert = 2605, p = 8, r = 1.19e-6, q = 0.9844)
- largest closure ratio res / (r(1-q)): 1.00e+0 (mi-fallback-weak-attraction, c = -0.12150694444444445, 0.8285013888888889; n_cert = 151, p = 3, r = 1.93e-3, q = 0.9375)
- smallest absolute divisor slack dist_d - (e_d + r): 3.34e-5 (mi-hard-supplied-609x, c = -1.9404830104232804, 0.0005582018521534574; n_cert = 33, p = 32, r = 2.85e-7, q = 0.4611)
- largest divisor ratio (e_d + r) / dist_d: 1.40e-1 (mi-hard-rabbit-boundary, c = -0.12047783354332016, 0.6761117666197435; n_cert = 17, p = 3, r = 3.10e-2, q = 0.9362)
- smallest radius used: 3.20e-9 (mi-hard-supplied-126x, c = -0.1565598768659612, -1.0322367742504408; n_cert = 5, p = 4, r = 3.20e-9, q = 0.0096)
