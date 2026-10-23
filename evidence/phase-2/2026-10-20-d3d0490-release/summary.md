# Release evidence session

Label: release. release protocol (plan §9): branded stable browser, headed, declared target hardware, ≥21 warm pairs, BCa paired intervals

Scope: engines chromium, firefox; cases all 13; reps 25 (1 cold + 24 warm); arms hook, plain, bands8, bands16; skipped passes none.

## chromium — budgets

| Case                            | Class      | coarse median (ms) | coarse budget (ms) | stable median (ms) | stable budget (ms) | verdict (coarse / stable) |
| ------------------------------- | ---------- | ------------------ | ------------------ | ------------------ | ------------------ | ------------------------- |
| mi-easy-default-full            | Easy       | 75.85              | 100                | 292.55             | 250                | pass / fail               |
| mi-easy-exterior-heavy          | Easy       | 44.70              | 100                | 124.30             | 250                | pass / pass               |
| mi-easy-main-cardioid           | Easy       | 72.60              | 100                | 188.20             | 250                | pass / pass               |
| mi-easy-period2-bulb            | Easy       | 67.30              | 100                | 164.40             | 250                | pass / pass               |
| mi-hard-rabbit-boundary         | Hard known | 75.80              | 100                | 499.00             | 600                | pass / pass               |
| mi-hard-supplied-126x           | Hard known | 71.70              | 100                | 360.95             | 600                | pass / pass               |
| mi-hard-supplied-609x           | Hard known | 76.95              | 100                | 309.30             | 600                | pass / pass               |
| mi-hard-supplied-13x            | Hard known | 75.45              | 100                | 425.85             | 600                | pass / pass               |
| mi-fallback-unknown-high-period | Fallback   | 65.20              | 100                | 581.05             | 1500               | pass / pass               |
| mi-fallback-weak-attraction     | Fallback   | 72.25              | 100                | 227.80             | 1500               | pass / pass               |
| mi-fallback-ambiguous-boundary  | Fallback   | 63.20              | 100                | 321.25             | 1500               | pass / pass               |
| mi-fallback-budget-exhaustion   | Fallback   | 73.95              | 100                | 764.50             | 1500               | pass / pass               |
| mi-scale-6mx-basilica-rim       | Scale      | 79.75              | 100                | 273.35             | 1500               | pass / pass               |

Honesty note: `requestToPresentMs` ends at the next presentation opportunity; it is not proof of paint.

## chromium — hook overhead

| Case                            | pairs | plain/hook ratio | interval       |
| ------------------------------- | ----- | ---------------- | -------------- |
| pooled (gated)                  | 312   | 1.002            | [0.986, 1.011] |
| mi-easy-default-full            | 24    | 1.017            | [0.961, 1.055] |
| mi-easy-exterior-heavy          | 24    | 0.993            | [0.937, 1.058] |
| mi-easy-main-cardioid           | 24    | 0.937            | [0.904, 1.011] |
| mi-easy-period2-bulb            | 24    | 0.972            | [0.908, 1.024] |
| mi-hard-rabbit-boundary         | 24    | 0.974            | [0.948, 1.021] |
| mi-hard-supplied-126x           | 24    | 1.003            | [0.946, 1.048] |
| mi-hard-supplied-609x           | 24    | 1.029            | [0.939, 1.082] |
| mi-hard-supplied-13x            | 24    | 1.020            | [0.970, 1.043] |
| mi-fallback-unknown-high-period | 24    | 1.018            | [0.971, 1.047] |
| mi-fallback-weak-attraction     | 24    | 1.018            | [0.982, 1.058] |
| mi-fallback-ambiguous-boundary  | 24    | 0.992            | [0.965, 1.038] |
| mi-fallback-budget-exhaustion   | 24    | 0.998            | [0.979, 1.042] |
| mi-scale-6mx-basilica-rim       | 24    | 0.974            | [0.892, 1.051] |

Ring retention: 9246 bytes measured after 32 recolors (limit 65536).

## chromium — parity and stalls

| Case                            | hash mismatches (hook/plain) | stalls |
| ------------------------------- | ---------------------------- | ------ |
| mi-easy-default-full            | 0                            | 0      |
| mi-easy-exterior-heavy          | 0                            | 0      |
| mi-easy-main-cardioid           | 0                            | 0      |
| mi-easy-period2-bulb            | 0                            | 0      |
| mi-hard-rabbit-boundary         | 0                            | 0      |
| mi-hard-supplied-126x           | 0                            | 0      |
| mi-hard-supplied-609x           | 0                            | 0      |
| mi-hard-supplied-13x            | 0                            | 0      |
| mi-fallback-unknown-high-period | 0                            | 0      |
| mi-fallback-weak-attraction     | 0                            | 0      |
| mi-fallback-ambiguous-boundary  | 0                            | 0      |
| mi-fallback-budget-exhaustion   | 0                            | 0      |
| mi-scale-6mx-basilica-rim       | 0                            | 0      |

## chromium — interactions

| Distribution    | Metric                               | n   | median (MAD)      | p95     | min / max         | provenance violations | raced |
| --------------- | ------------------------------------ | --- | ----------------- | ------- | ----------------- | --------------------- | ----- |
| cancel          | cancelAckMs                          | 50  | 8.7 ms (3.7 ms)   | 18.2 ms | 2.0 ms / 18.5 ms  | 0                     | 16    |
| cancel          | childQuiescenceMs                    | 50  | 8.7 ms (3.7 ms)   | 18.2 ms | 2.0 ms / 18.6 ms  | 0                     | 16    |
| inflight-replay | requestToPresentMs (replayed coarse) | 50  | 42.9 ms (8.4 ms)  | 75.1 ms | 22.6 ms / 83.3 ms | 0                     | 0     |
| recolor         | requestToPresentMs                   | 50  | 41.8 ms (10.5 ms) | 58.1 ms | 22.7 ms / 68.8 ms | 0                     | 0     |
| recolor         | colorizeMs                           | 50  | 32.7 ms (8.8 ms)  | 48.1 ms | 20.7 ms / 63.7 ms | 0                     | 0     |
| semantic-cache  | requestToPresentMs                   | 50  | 32.1 ms (0.2 ms)  | 32.5 ms | 16.3 ms / 32.6 ms | 0                     | 0     |
| semantic-cache  | colorizeMs                           | 50  | 16.5 ms (1.3 ms)  | 22.5 ms | 14.9 ms / 27.0 ms | 0                     | 0     |

Honesty notes: cancel and inflight-replay rows count only samples that won their race; raced samples are reported, not dropped. Violations count every provenance check that failed.

## chromium — memory (MI-PERF-006)

| Figure                                  | Status   | High-water | At case              | Cases | Basis                                                                                                                                                                                                                            |
| --------------------------------------- | -------- | ---------- | -------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JS heap (main thread only, lower bound) | measured | 2.6 MiB    | mi-easy-default-full | 13    | Main-thread V8 JS heap used (CDP Performance.getMetrics JSHeapUsedSize), polled every 50 ms from navigation to the stable frame; excludes worker heaps and ArrayBuffer backing stores; a lower bound on the true peak            |
| Retained after stable (all workers)     | measured | 24.3 MiB   | mi-easy-default-full | 13    | performance.measureUserAgentSpecificMemory() total after the stable frame, in a cross-origin-isolated copy of the same build (includes same-origin workers and buffers); a post-render snapshot, not the peak during computation |

Honesty note: informational, not a gate. A figure is the maximum over one fresh page per case; "not measured" means no honest figure was obtained, and the reason column says why (unsupported engine, unavailable API, or a failed measurement). No proxy is substituted. Definitions: evidence/phase-2/README.md, "Memory high-water".

## chromium — compare bands8

| Case                            | pairs | wall ratio (arm/hook) | wall interval  | classify ratio | stable Δ (ms) | regression | hash mismatches (arm vs hook) |
| ------------------------------- | ----- | --------------------- | -------------- | -------------- | ------------- | ---------- | ----------------------------- |
| mi-easy-default-full            | 24    | 0.961                 | [0.921, 1.031] | 0.964          | 10.85         | no         | 0                             |
| mi-easy-exterior-heavy          | 24    | 1.035                 | [0.921, 1.086] | 1.013          | -4.35         | no         | 0                             |
| mi-easy-main-cardioid           | 24    | 0.996                 | [0.943, 1.072] | 1.021          | 0.65          | no         | 0                             |
| mi-easy-period2-bulb            | 24    | 0.983                 | [0.917, 1.023] | 1.000          | 2.80          | no         | 0                             |
| mi-hard-rabbit-boundary         | 24    | 0.919                 | [0.896, 0.961] | 0.894          | 39.85         | yes        | 0                             |
| mi-hard-supplied-126x           | 24    | 1.014                 | [0.969, 1.068] | 1.008          | -5.20         | no         | 0                             |
| mi-hard-supplied-609x           | 24    | 1.034                 | [0.992, 1.071] | 1.032          | -10.45        | no         | 0                             |
| mi-hard-supplied-13x            | 24    | 0.940                 | [0.875, 0.971] | 0.942          | 26.20         | yes        | 0                             |
| mi-fallback-unknown-high-period | 24    | 0.977                 | [0.933, 1.026] | 0.975          | 13.50         | no         | 0                             |
| mi-fallback-weak-attraction     | 24    | 0.985                 | [0.961, 1.022] | 0.975          | 3.25          | no         | 0                             |
| mi-fallback-ambiguous-boundary  | 24    | 1.046                 | [0.998, 1.100] | 1.061          | -14.50        | no         | 0                             |
| mi-fallback-budget-exhaustion   | 24    | 0.959                 | [0.930, 1.005] | 0.954          | 31.20         | no         | 0                             |
| mi-scale-6mx-basilica-rim       | 24    | 0.927                 | [0.860, 0.975] | 0.876          | 20.50         | yes        | 0                             |

## chromium — compare bands16

| Case                            | pairs | wall ratio (arm/hook) | wall interval  | classify ratio | stable Δ (ms) | regression | hash mismatches (arm vs hook) |
| ------------------------------- | ----- | --------------------- | -------------- | -------------- | ------------- | ---------- | ----------------------------- |
| mi-easy-default-full            | 24    | 0.928                 | [0.883, 0.966] | 0.877          | 22.55         | yes        | 0                             |
| mi-easy-exterior-heavy          | 24    | 1.074                 | [1.037, 1.145] | 1.020          | -8.55         | no         | 0                             |
| mi-easy-main-cardioid           | 24    | 0.998                 | [0.942, 1.067] | 1.113          | 0.45          | no         | 0                             |
| mi-easy-period2-bulb            | 24    | 0.999                 | [0.955, 1.048] | 1.035          | 0.15          | no         | 0                             |
| mi-hard-rabbit-boundary         | 24    | 0.941                 | [0.885, 0.962] | 0.883          | 28.95         | yes        | 0                             |
| mi-hard-supplied-126x           | 24    | 1.066                 | [1.005, 1.105] | 1.101          | -23.70        | no         | 0                             |
| mi-hard-supplied-609x           | 24    | 1.008                 | [0.982, 1.040] | 1.029          | -2.55         | no         | 0                             |
| mi-hard-supplied-13x            | 24    | 0.887                 | [0.850, 0.910] | 0.842          | 46.85         | yes        | 0                             |
| mi-fallback-unknown-high-period | 24    | 0.963                 | [0.933, 1.012] | 0.957          | 21.60         | no         | 0                             |
| mi-fallback-weak-attraction     | 24    | 0.999                 | [0.930, 1.044] | 0.958          | 0.25          | no         | 0                             |
| mi-fallback-ambiguous-boundary  | 24    | 1.119                 | [1.063, 1.146] | 1.137          | -37.15        | no         | 0                             |
| mi-fallback-budget-exhaustion   | 24    | 0.985                 | [0.938, 1.028] | 0.975          | 11.50         | no         | 0                             |
| mi-scale-6mx-basilica-rim       | 24    | 0.920                 | [0.887, 0.950] | 0.871          | 21.20         | yes        | 0                             |

## firefox — budgets

| Case                            | Class      | coarse median (ms) | coarse budget (ms) | stable median (ms) | stable budget (ms) | verdict (coarse / stable) |
| ------------------------------- | ---------- | ------------------ | ------------------ | ------------------ | ------------------ | ------------------------- |
| mi-easy-default-full            | Easy       | 50.50              | 100                | 198.00             | 250                | pass / pass               |
| mi-easy-exterior-heavy          | Easy       | 40.50              | 100                | 112.00             | 250                | pass / pass               |
| mi-easy-main-cardioid           | Easy       | 69.00              | 100                | 157.00             | 250                | pass / pass               |
| mi-easy-period2-bulb            | Easy       | 67.00              | 100                | 163.00             | 250                | pass / pass               |
| mi-hard-rabbit-boundary         | Hard known | 59.50              | 100                | 292.50             | 600                | pass / pass               |
| mi-hard-supplied-126x           | Hard known | 58.00              | 100                | 327.00             | 600                | pass / pass               |
| mi-hard-supplied-609x           | Hard known | 52.50              | 100                | 218.50             | 600                | pass / pass               |
| mi-hard-supplied-13x            | Hard known | 56.00              | 100                | 319.00             | 600                | pass / pass               |
| mi-fallback-unknown-high-period | Fallback   | 65.50              | 100                | 742.00             | 1500               | pass / pass               |
| mi-fallback-weak-attraction     | Fallback   | 71.50              | 100                | 224.50             | 1500               | pass / pass               |
| mi-fallback-ambiguous-boundary  | Fallback   | 43.00              | 100                | 207.00             | 1500               | pass / pass               |
| mi-fallback-budget-exhaustion   | Fallback   | 67.50              | 100                | 938.50             | 1500               | pass / pass               |
| mi-scale-6mx-basilica-rim       | Scale      | 58.00              | 100                | 195.50             | 1500               | pass / pass               |

Honesty note: `requestToPresentMs` ends at the next presentation opportunity; it is not proof of paint.

## firefox — hook overhead

| Case                            | pairs | plain/hook ratio | interval       |
| ------------------------------- | ----- | ---------------- | -------------- |
| pooled (gated)                  | 312   | 0.993            | [0.970, 1.014] |
| mi-easy-default-full            | 24    | 0.986            | [0.914, 1.058] |
| mi-easy-exterior-heavy          | 24    | 0.996            | [0.932, 1.076] |
| mi-easy-main-cardioid           | 24    | 0.991            | [0.942, 1.036] |
| mi-easy-period2-bulb            | 24    | 1.022            | [0.968, 1.081] |
| mi-hard-rabbit-boundary         | 24    | 0.966            | [0.937, 1.023] |
| mi-hard-supplied-126x           | 24    | 0.970            | [0.894, 1.053] |
| mi-hard-supplied-609x           | 24    | 0.995            | [0.903, 1.019] |
| mi-hard-supplied-13x            | 24    | 0.950            | [0.882, 1.037] |
| mi-fallback-unknown-high-period | 24    | 0.975            | [0.860, 1.097] |
| mi-fallback-weak-attraction     | 24    | 0.975            | [0.942, 1.061] |
| mi-fallback-ambiguous-boundary  | 24    | 1.005            | [0.932, 1.066] |
| mi-fallback-budget-exhaustion   | 24    | 1.002            | [0.887, 1.228] |
| mi-scale-6mx-basilica-rim       | 24    | 1.023            | [0.947, 1.095] |

Ring retention: 9465 bytes measured after 32 recolors (limit 65536).

## firefox — parity and stalls

| Case                            | hash mismatches (hook/plain) | stalls |
| ------------------------------- | ---------------------------- | ------ |
| mi-easy-default-full            | 0                            | 0      |
| mi-easy-exterior-heavy          | 0                            | 1      |
| mi-easy-main-cardioid           | 0                            | 0      |
| mi-easy-period2-bulb            | 0                            | 0      |
| mi-hard-rabbit-boundary         | 0                            | 0      |
| mi-hard-supplied-126x           | 0                            | 0      |
| mi-hard-supplied-609x           | 0                            | 0      |
| mi-hard-supplied-13x            | 0                            | 0      |
| mi-fallback-unknown-high-period | 0                            | 0      |
| mi-fallback-weak-attraction     | 0                            | 0      |
| mi-fallback-ambiguous-boundary  | 0                            | 1      |
| mi-fallback-budget-exhaustion   | 0                            | 0      |
| mi-scale-6mx-basilica-rim       | 0                            | 1      |

## firefox — interactions

| Distribution    | Metric                               | n   | median (MAD)      | p95     | min / max         | provenance violations | raced |
| --------------- | ------------------------------------ | --- | ----------------- | ------- | ----------------- | --------------------- | ----- |
| cancel          | cancelAckMs                          | 50  | 1.0 ms (0.0 ms)   | 3.0 ms  | 0.0 ms / 3.0 ms   | 0                     | 19    |
| cancel          | childQuiescenceMs                    | 50  | 3.0 ms (1.0 ms)   | 7.0 ms  | 0.0 ms / 21.0 ms  | 0                     | 19    |
| inflight-replay | requestToPresentMs (replayed coarse) | 48  | 49.5 ms (11.5 ms) | 84.0 ms | 27.0 ms / 89.0 ms | 0                     | 2     |
| recolor         | requestToPresentMs                   | 50  | 41.0 ms (5.5 ms)  | 85.0 ms | 22.0 ms / 98.0 ms | 0                     | 0     |
| recolor         | colorizeMs                           | 50  | 33.0 ms (3.5 ms)  | 45.0 ms | 16.0 ms / 54.0 ms | 0                     | 0     |
| semantic-cache  | requestToPresentMs                   | 50  | 35.0 ms (5.0 ms)  | 91.0 ms | 21.0 ms / 96.0 ms | 0                     | 0     |
| semantic-cache  | colorizeMs                           | 50  | 24.0 ms (3.5 ms)  | 29.0 ms | 15.0 ms / 53.0 ms | 0                     | 0     |

Honesty notes: cancel and inflight-replay rows count only samples that won their race; raced samples are reported, not dropped. Violations count every provenance check that failed.

## firefox — memory (MI-PERF-006)

| Figure                                  | Status       | High-water | At case | Cases | Basis                                                                                            |
| --------------------------------------- | ------------ | ---------- | ------- | ----- | ------------------------------------------------------------------------------------------------ |
| JS heap (main thread only, lower bound) | not measured | n/a        | n/a     | 0     | Firefox over WebDriver BiDi exposes no CDP, performance.memory or measureUserAgentSpecificMemory |
| Retained after stable (all workers)     | not measured | n/a        | n/a     | 0     | Firefox over WebDriver BiDi exposes no CDP, performance.memory or measureUserAgentSpecificMemory |

Honesty note: informational, not a gate. A figure is the maximum over one fresh page per case; "not measured" means no honest figure was obtained, and the reason column says why (unsupported engine, unavailable API, or a failed measurement). No proxy is substituted. Definitions: evidence/phase-2/README.md, "Memory high-water".

## firefox — compare bands8

| Case                            | pairs | wall ratio (arm/hook) | wall interval  | classify ratio | stable Δ (ms) | regression | hash mismatches (arm vs hook) |
| ------------------------------- | ----- | --------------------- | -------------- | -------------- | ------------- | ---------- | ----------------------------- |
| mi-easy-default-full            | 24    | 0.954                 | [0.904, 1.024] | 0.968          | 8.50          | no         | 0                             |
| mi-easy-exterior-heavy          | 24    | 1.035                 | [0.950, 1.108] | 1.119          | -4.00         | no         | 0                             |
| mi-easy-main-cardioid           | 24    | 1.000                 | [0.931, 1.046] | 1.023          | 0.00          | no         | 0                             |
| mi-easy-period2-bulb            | 24    | 1.035                 | [0.944, 1.132] | 1.042          | -5.50         | no         | 0                             |
| mi-hard-rabbit-boundary         | 24    | 0.978                 | [0.894, 1.010] | 0.959          | 7.00          | no         | 0                             |
| mi-hard-supplied-126x           | 24    | 0.927                 | [0.843, 0.995] | 0.903          | 22.50         | yes        | 0                             |
| mi-hard-supplied-609x           | 24    | 1.013                 | [0.902, 1.070] | 0.970          | -3.00         | no         | 0                             |
| mi-hard-supplied-13x            | 24    | 0.944                 | [0.823, 1.012] | 0.913          | 18.50         | no         | 0                             |
| mi-fallback-unknown-high-period | 24    | 0.917                 | [0.824, 1.175] | 0.956          | 62.50         | no         | 0                             |
| mi-fallback-weak-attraction     | 24    | 0.984                 | [0.853, 1.035] | 0.978          | 3.50          | no         | 0                             |
| mi-fallback-ambiguous-boundary  | 24    | 1.000                 | [0.927, 1.117] | 1.080          | 0.00          | no         | 0                             |
| mi-fallback-budget-exhaustion   | 24    | 1.053                 | [0.853, 1.147] | 1.060          | -42.50        | no         | 0                             |
| mi-scale-6mx-basilica-rim       | 24    | 1.065                 | [0.960, 1.215] | 1.066          | -11.50        | no         | 0                             |

## firefox — compare bands16

| Case                            | pairs | wall ratio (arm/hook) | wall interval  | classify ratio | stable Δ (ms) | regression | hash mismatches (arm vs hook) |
| ------------------------------- | ----- | --------------------- | -------------- | -------------- | ------------- | ---------- | ----------------------------- |
| mi-easy-default-full            | 24    | 0.983                 | [0.933, 1.034] | 0.940          | 3.00          | no         | 0                             |
| mi-easy-exterior-heavy          | 24    | 1.060                 | [1.005, 1.202] | 1.165          | -6.50         | no         | 0                             |
| mi-easy-main-cardioid           | 24    | 1.025                 | [0.955, 1.066] | 1.013          | -4.00         | no         | 0                             |
| mi-easy-period2-bulb            | 24    | 1.037                 | [0.984, 1.091] | 1.072          | -6.00         | no         | 0                             |
| mi-hard-rabbit-boundary         | 24    | 0.984                 | [0.925, 1.038] | 0.963          | 4.50          | no         | 0                             |
| mi-hard-supplied-126x           | 24    | 1.017                 | [0.904, 1.086] | 0.993          | -5.50         | no         | 0                             |
| mi-hard-supplied-609x           | 24    | 1.049                 | [0.971, 1.118] | 1.086          | -10.00        | no         | 0                             |
| mi-hard-supplied-13x            | 24    | 0.957                 | [0.884, 1.032] | 0.904          | 12.00         | no         | 0                             |
| mi-fallback-unknown-high-period | 24    | 0.950                 | [0.914, 0.988] | 0.958          | 40.00         | no         | 0                             |
| mi-fallback-weak-attraction     | 24    | 1.006                 | [0.952, 1.091] | 1.010          | -1.50         | no         | 0                             |
| mi-fallback-ambiguous-boundary  | 24    | 1.066                 | [0.993, 1.135] | 1.133          | -14.50        | no         | 0                             |
| mi-fallback-budget-exhaustion   | 24    | 0.993                 | [0.920, 1.044] | 1.008          | 7.00          | no         | 0                             |
| mi-scale-6mx-basilica-rim       | 24    | 1.083                 | [0.996, 1.131] | 1.039          | -17.50        | no         | 0                             |
