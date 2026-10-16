# Release evidence session

## chromium — budgets

| Case                            | Class      | coarse median (ms) | coarse budget (ms) | stable median (ms) | stable budget (ms) | verdict (coarse / stable) |
| ------------------------------- | ---------- | ------------------ | ------------------ | ------------------ | ------------------ | ------------------------- |
| mi-easy-default-full            | Easy       | 51.80              | 100                | 177.30             | 250                | pass / pass               |
| mi-easy-exterior-heavy          | Easy       | 42.80              | 100                | 94.60              | 250                | pass / pass               |
| mi-easy-main-cardioid           | Easy       | 58.90              | 100                | 150.60             | 250                | pass / pass               |
| mi-easy-period2-bulb            | Easy       | 64.80              | 100                | 142.60             | 250                | pass / pass               |
| mi-hard-rabbit-boundary         | Hard known | 59.80              | 100                | 465.50             | 600                | pass / pass               |
| mi-hard-supplied-126x           | Hard known | 63.20              | 100                | 406.20             | 600                | pass / pass               |
| mi-hard-supplied-609x           | Hard known | 58.20              | 100                | 299.80             | 600                | pass / pass               |
| mi-hard-supplied-13x            | Hard known | 57.70              | 100                | 370.20             | 600                | pass / pass               |
| mi-fallback-unknown-high-period | Fallback   | 61.00              | 100                | 501.40             | 1500               | pass / pass               |
| mi-fallback-weak-attraction     | Fallback   | 49.20              | 100                | 749.80             | 1500               | pass / pass               |
| mi-fallback-ambiguous-boundary  | Fallback   | 53.50              | 100                | 261.30             | 1500               | pass / pass               |
| mi-fallback-budget-exhaustion   | Fallback   | 57.60              | 100                | 442.70             | 1500               | pass / pass               |
| mi-scale-6mx-basilica-rim       | Scale      | 63.90              | 100                | 351.80             | 1500               | pass / pass               |

## chromium — hook overhead

| Case                            | pairs | plain/hook ratio | interval       |
| ------------------------------- | ----- | ---------------- | -------------- |
| pooled (gated)                  | 273   | 0.996            | [0.981, 1.007] |
| mi-easy-default-full            | 21    | 0.992            | [0.903, 1.067] |
| mi-easy-exterior-heavy          | 21    | 0.991            | [0.896, 1.023] |
| mi-easy-main-cardioid           | 21    | 0.971            | [0.958, 0.999] |
| mi-easy-period2-bulb            | 21    | 0.963            | [0.931, 1.025] |
| mi-hard-rabbit-boundary         | 21    | 1.006            | [0.948, 1.017] |
| mi-hard-supplied-126x           | 21    | 1.008            | [0.923, 1.026] |
| mi-hard-supplied-609x           | 21    | 1.023            | [0.969, 1.035] |
| mi-hard-supplied-13x            | 21    | 1.073            | [0.972, 1.088] |
| mi-fallback-unknown-high-period | 21    | 0.978            | [0.951, 1.041] |
| mi-fallback-weak-attraction     | 21    | 1.005            | [0.981, 1.023] |
| mi-fallback-ambiguous-boundary  | 21    | 0.969            | [0.949, 0.991] |
| mi-fallback-budget-exhaustion   | 21    | 0.997            | [0.969, 1.052] |
| mi-scale-6mx-basilica-rim       | 21    | 0.972            | [0.920, 1.023] |

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

| Distribution    | Metric                               | n   | median (MAD)     | p95     | min / max         | provenance violations | raced |
| --------------- | ------------------------------------ | --- | ---------------- | ------- | ----------------- | --------------------- | ----- |
| cancel          | cancelAckMs                          | 50  | 11.6 ms (2.3 ms) | 16.7 ms | 1.6 ms / 17.7 ms  | 0                     | 16    |
| cancel          | childQuiescenceMs                    | 50  | 11.7 ms (2.2 ms) | 16.8 ms | 2.7 ms / 17.7 ms  | 0                     | 16    |
| inflight-replay | requestToPresentMs (replayed coarse) | 50  | 39.1 ms (6.2 ms) | 66.3 ms | 21.9 ms / 82.0 ms | 0                     | 0     |
| recolor         | requestToPresentMs                   | 50  | 38.5 ms (7.3 ms) | 48.6 ms | 20.9 ms / 62.3 ms | 0                     | 0     |
| recolor         | colorizeMs                           | 50  | 25.0 ms (6.5 ms) | 38.0 ms | 18.0 ms / 56.0 ms | 0                     | 0     |
| semantic-cache  | requestToPresentMs                   | 50  | 16.6 ms (0.5 ms) | 32.6 ms | 15.9 ms / 32.7 ms | 0                     | 0     |
| semantic-cache  | colorizeMs                           | 50  | 15.1 ms (0.4 ms) | 24.7 ms | 14.6 ms / 27.2 ms | 0                     | 0     |

Honesty notes: cancel and inflight-replay rows count only samples that won their race; raced samples are reported, not dropped. Violations count every provenance check that failed.

## firefox — budgets

| Case                            | Class      | coarse median (ms) | coarse budget (ms) | stable median (ms) | stable budget (ms) | verdict (coarse / stable) |
| ------------------------------- | ---------- | ------------------ | ------------------ | ------------------ | ------------------ | ------------------------- |
| mi-easy-default-full            | Easy       | 47.00              | 100                | 130.00             | 250                | pass / pass               |
| mi-easy-exterior-heavy          | Easy       | 35.00              | 100                | 98.00              | 250                | pass / pass               |
| mi-easy-main-cardioid           | Easy       | 67.00              | 100                | 153.00             | 250                | pass / pass               |
| mi-easy-period2-bulb            | Easy       | 64.00              | 100                | 143.00             | 250                | pass / pass               |
| mi-hard-rabbit-boundary         | Hard known | 49.00              | 100                | 324.00             | 600                | pass / pass               |
| mi-hard-supplied-126x           | Hard known | 48.00              | 100                | 367.00             | 600                | pass / pass               |
| mi-hard-supplied-609x           | Hard known | 49.00              | 100                | 223.00             | 600                | pass / pass               |
| mi-hard-supplied-13x            | Hard known | 51.00              | 100                | 319.00             | 600                | pass / pass               |
| mi-fallback-unknown-high-period | Fallback   | 52.00              | 100                | 593.00             | 1500               | pass / pass               |
| mi-fallback-weak-attraction     | Fallback   | 52.00              | 100                | 1033.00            | 1500               | pass / pass               |
| mi-fallback-ambiguous-boundary  | Fallback   | 42.00              | 100                | 174.00             | 1500               | pass / pass               |
| mi-fallback-budget-exhaustion   | Fallback   | 54.00              | 100                | 398.00             | 1500               | pass / pass               |
| mi-scale-6mx-basilica-rim       | Scale      | 54.00              | 100                | 377.00             | 1500               | pass / pass               |

## firefox — hook overhead

| Case                            | pairs | plain/hook ratio | interval       |
| ------------------------------- | ----- | ---------------- | -------------- |
| pooled (gated)                  | 273   | 0.987            | [0.961, 1.000] |
| mi-easy-default-full            | 21    | 0.962            | [0.860, 1.023] |
| mi-easy-exterior-heavy          | 21    | 1.011            | [0.824, 1.047] |
| mi-easy-main-cardioid           | 21    | 0.993            | [0.947, 1.053] |
| mi-easy-period2-bulb            | 21    | 0.943            | [0.865, 0.993] |
| mi-hard-rabbit-boundary         | 21    | 1.023            | [0.971, 1.085] |
| mi-hard-supplied-126x           | 21    | 1.000            | [0.922, 1.013] |
| mi-hard-supplied-609x           | 21    | 0.942            | [0.892, 0.962] |
| mi-hard-supplied-13x            | 21    | 1.000            | [0.860, 1.007] |
| mi-fallback-unknown-high-period | 21    | 0.989            | [0.880, 1.062] |
| mi-fallback-weak-attraction     | 21    | 0.984            | [0.888, 1.031] |
| mi-fallback-ambiguous-boundary  | 21    | 0.993            | [0.942, 1.028] |
| mi-fallback-budget-exhaustion   | 21    | 0.997            | [0.882, 1.065] |
| mi-scale-6mx-basilica-rim       | 21    | 0.976            | [0.852, 1.058] |

## firefox — parity and stalls

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
| mi-fallback-budget-exhaustion   | 0                            | 1      |
| mi-scale-6mx-basilica-rim       | 0                            | 0      |

## firefox — interactions

| Distribution    | Metric                               | n   | median (MAD)     | p95     | min / max          | provenance violations | raced |
| --------------- | ------------------------------------ | --- | ---------------- | ------- | ------------------ | --------------------- | ----- |
| cancel          | cancelAckMs                          | 50  | 1.0 ms (0.0 ms)  | 3.0 ms  | 0.0 ms / 3.0 ms    | 0                     | 19    |
| cancel          | childQuiescenceMs                    | 50  | 5.0 ms (1.0 ms)  | 7.0 ms  | 1.0 ms / 9.0 ms    | 0                     | 19    |
| inflight-replay | requestToPresentMs (replayed coarse) | 47  | 43.0 ms (8.0 ms) | 75.0 ms | 21.0 ms / 78.0 ms  | 0                     | 3     |
| recolor         | requestToPresentMs                   | 50  | 42.0 ms (4.5 ms) | 82.0 ms | 20.0 ms / 230.0 ms | 0                     | 0     |
| recolor         | colorizeMs                           | 50  | 33.0 ms (6.0 ms) | 43.0 ms | 15.0 ms / 45.0 ms  | 0                     | 0     |
| semantic-cache  | requestToPresentMs                   | 50  | 37.0 ms (4.0 ms) | 52.0 ms | 25.0 ms / 103.0 ms | 0                     | 0     |
| semantic-cache  | colorizeMs                           | 50  | 28.0 ms (1.0 ms) | 30.0 ms | 16.0 ms / 34.0 ms  | 0                     | 0     |

Honesty notes: cancel and inflight-replay rows count only samples that won their race; raced samples are reported, not dropped. Violations count every provenance check that failed.
