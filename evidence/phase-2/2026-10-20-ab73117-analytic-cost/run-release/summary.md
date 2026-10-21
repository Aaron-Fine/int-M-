# Directional evidence session

Label: directional. automation-bundled engine — directional only, not release evidence per plan §9

Scope: engines chromium, firefox; cases mi-easy-default-full, mi-easy-exterior-heavy, mi-hard-supplied-126x, mi-hard-supplied-13x, mi-hard-rabbit-boundary, mi-scale-6mx-basilica-rim, mi-fallback-weak-attraction (subset); reps 21 (1 cold + 20 warm); arms hook, plain, base; skipped passes interactions, memory.

## chromium — budgets

| Case                        | Class      | coarse median (ms) | coarse budget (ms) | stable median (ms) | stable budget (ms) | verdict (coarse / stable) |
| --------------------------- | ---------- | ------------------ | ------------------ | ------------------ | ------------------ | ------------------------- |
| mi-easy-default-full        | Easy       | 61.45              | 100                | 194.40             | 250                | pass / pass               |
| mi-easy-exterior-heavy      | Easy       | 42.45              | 100                | 98.45              | 250                | pass / pass               |
| mi-hard-supplied-126x       | Hard known | 61.60              | 100                | 332.45             | 600                | pass / pass               |
| mi-hard-supplied-13x        | Hard known | 69.35              | 100                | 353.05             | 600                | pass / pass               |
| mi-hard-rabbit-boundary     | Hard known | 66.25              | 100                | 445.60             | 600                | pass / pass               |
| mi-scale-6mx-basilica-rim   | Scale      | 76.45              | 100                | 255.20             | 1500               | pass / pass               |
| mi-fallback-weak-attraction | Fallback   | 77.90              | 100                | 278.85             | 1500               | pass / pass               |

Honesty note: `requestToPresentMs` ends at the next presentation opportunity; it is not proof of paint.

## chromium — hook overhead

| Case                                  | pairs | plain/hook ratio | interval       |
| ------------------------------------- | ----- | ---------------- | -------------- |
| pooled (not gated: not a release run) | 140   | 1.003            | [0.988, 1.022] |
| mi-easy-default-full                  | 20    | 1.043            | [1.020, 1.063] |
| mi-easy-exterior-heavy                | 20    | 1.042            | [0.996, 1.091] |
| mi-hard-supplied-126x                 | 20    | 0.984            | [0.903, 1.015] |
| mi-hard-supplied-13x                  | 20    | 0.976            | [0.950, 1.007] |
| mi-hard-rabbit-boundary               | 20    | 0.993            | [0.962, 1.042] |
| mi-scale-6mx-basilica-rim             | 20    | 0.992            | [0.943, 1.032] |
| mi-fallback-weak-attraction           | 20    | 1.000            | [0.945, 1.030] |

Ring retention: 9986 bytes measured after 32 recolors (limit 65536).

## chromium — parity and stalls

| Case                        | hash mismatches (hook/plain) | stalls |
| --------------------------- | ---------------------------- | ------ |
| mi-easy-default-full        | 0                            | 0      |
| mi-easy-exterior-heavy      | 0                            | 0      |
| mi-hard-supplied-126x       | 0                            | 0      |
| mi-hard-supplied-13x        | 0                            | 0      |
| mi-hard-rabbit-boundary     | 0                            | 0      |
| mi-scale-6mx-basilica-rim   | 0                            | 0      |
| mi-fallback-weak-attraction | 0                            | 0      |

## chromium — interactions

Skipped (--skip-interactions).

## chromium — memory (MI-PERF-006)

Skipped (--skip-memory).

## chromium — compare base

| Case                        | pairs | wall ratio (arm/hook) | wall interval  | classify ratio | stable Δ (ms) | regression | hash mismatches (arm vs hook) |
| --------------------------- | ----- | --------------------- | -------------- | -------------- | ------------- | ---------- | ----------------------------- |
| mi-easy-default-full        | 20    | 1.227                 | [1.118, 1.309] | 1.308          | -43.25        | no         | 0                             |
| mi-easy-exterior-heavy      | 20    | 1.119                 | [1.054, 1.200] | 1.102          | -11.60        | no         | 0                             |
| mi-hard-supplied-126x       | 20    | 1.002                 | [0.984, 1.016] | 0.990          | -0.85         | no         | 0                             |
| mi-hard-supplied-13x        | 20    | 1.064                 | [1.033, 1.096] | 1.074          | -22.95        | no         | 0                             |
| mi-hard-rabbit-boundary     | 20    | 1.050                 | [1.018, 1.099] | 1.044          | -21.65        | no         | 0                             |
| mi-scale-6mx-basilica-rim   | 20    | 1.019                 | [0.998, 1.055] | 1.015          | -4.70         | no         | 0                             |
| mi-fallback-weak-attraction | 20    | 1.009                 | [0.972, 1.041] | 1.017          | -2.40         | no         | 0                             |

## firefox — budgets

| Case                        | Class      | coarse median (ms) | coarse budget (ms) | stable median (ms) | stable budget (ms) | verdict (coarse / stable) |
| --------------------------- | ---------- | ------------------ | ------------------ | ------------------ | ------------------ | ------------------------- |
| mi-easy-default-full        | Easy       | 56.00              | 100                | 197.00             | 250                | pass / pass               |
| mi-easy-exterior-heavy      | Easy       | 38.00              | 100                | 103.00             | 250                | pass / pass               |
| mi-hard-supplied-126x       | Hard known | 58.00              | 100                | 304.00             | 600                | pass / pass               |
| mi-hard-supplied-13x        | Hard known | 58.00              | 100                | 268.50             | 600                | pass / pass               |
| mi-hard-rabbit-boundary     | Hard known | 58.00              | 100                | 281.50             | 600                | pass / pass               |
| mi-scale-6mx-basilica-rim   | Scale      | 65.50              | 100                | 209.00             | 1500               | pass / pass               |
| mi-fallback-weak-attraction | Fallback   | 64.50              | 100                | 199.00             | 1500               | pass / pass               |

Honesty note: `requestToPresentMs` ends at the next presentation opportunity; it is not proof of paint.

## firefox — hook overhead

| Case                                  | pairs | plain/hook ratio | interval       |
| ------------------------------------- | ----- | ---------------- | -------------- |
| pooled (not gated: not a release run) | 140   | 0.992            | [0.978, 1.016] |
| mi-easy-default-full                  | 20    | 0.948            | [0.865, 1.041] |
| mi-easy-exterior-heavy                | 20    | 0.985            | [0.905, 1.102] |
| mi-hard-supplied-126x                 | 20    | 1.028            | [0.984, 1.042] |
| mi-hard-supplied-13x                  | 20    | 1.023            | [0.981, 1.041] |
| mi-hard-rabbit-boundary               | 20    | 1.018            | [0.939, 1.032] |
| mi-scale-6mx-basilica-rim             | 20    | 0.983            | [0.957, 1.018] |
| mi-fallback-weak-attraction           | 20    | 0.982            | [0.934, 1.015] |

Ring retention: 9112 bytes measured after 32 recolors (limit 65536).

## firefox — parity and stalls

| Case                        | hash mismatches (hook/plain) | stalls |
| --------------------------- | ---------------------------- | ------ |
| mi-easy-default-full        | 0                            | 0      |
| mi-easy-exterior-heavy      | 0                            | 0      |
| mi-hard-supplied-126x       | 0                            | 0      |
| mi-hard-supplied-13x        | 0                            | 0      |
| mi-hard-rabbit-boundary     | 0                            | 0      |
| mi-scale-6mx-basilica-rim   | 0                            | 0      |
| mi-fallback-weak-attraction | 0                            | 0      |

## firefox — interactions

Skipped (--skip-interactions).

## firefox — memory (MI-PERF-006)

Skipped (--skip-memory).

## firefox — compare base

| Case                        | pairs | wall ratio (arm/hook) | wall interval  | classify ratio | stable Δ (ms) | regression | hash mismatches (arm vs hook) |
| --------------------------- | ----- | --------------------- | -------------- | -------------- | ------------- | ---------- | ----------------------------- |
| mi-easy-default-full        | 20    | 1.237                 | [1.122, 1.304] | 1.488          | -38.00        | no         | 0                             |
| mi-easy-exterior-heavy      | 20    | 1.139                 | [1.122, 1.210] | 1.493          | -14.00        | no         | 0                             |
| mi-hard-supplied-126x       | 20    | 1.072                 | [1.032, 1.156] | 1.086          | -21.00        | no         | 0                             |
| mi-hard-supplied-13x        | 20    | 1.110                 | [1.036, 1.151] | 1.196          | -29.50        | no         | 0                             |
| mi-hard-rabbit-boundary     | 20    | 1.059                 | [1.007, 1.108] | 1.112          | -16.50        | no         | 0                             |
| mi-scale-6mx-basilica-rim   | 20    | 1.000                 | [0.959, 1.063] | 0.968          | 0.00          | no         | 0                             |
| mi-fallback-weak-attraction | 20    | 1.008                 | [0.960, 1.043] | 1.042          | -1.50         | no         | 0                             |
