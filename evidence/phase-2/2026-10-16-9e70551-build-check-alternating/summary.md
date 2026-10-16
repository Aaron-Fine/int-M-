# Renderer-path paired evidence

## build-59926c5-vs-9e70551-alternating — chromium

Label: release protocol (plan §9): branded stable browser, headed, declared target hardware, ≥21 warm pairs, BCa paired intervals. Browser: Playwright 1.63.0 driving branded stable Google Chrome, headed: flatpak run com.google.Chrome (CDP) 155.0.8059.39. Classifier: default. 22 repetitions (rep 0 cold, excluded).

Ratios are before/after (>1 means after is faster): exp of the median paired log-ratio with a 95% BCa interval (10000 resamples, seed 20261015). Regression flag: plan §9 paired median difference > max(5%, 20 ms) with its interval excluding zero.

| Case                          | after wall | before wall | wall ratio [95% BCa] | after classifyMs | before classifyMs | classifier ratio [95% BCa] | regression flag |
| ----------------------------- | ---------- | ----------- | -------------------- | ---------------- | ----------------- | -------------------------- | --------------- |
| mi-easy-default-full          | 169.2 ms   | 167.4 ms    | 1.01× [0.95×, 1.05×] | 99.4 ms          | —                 | —                          | no              |
| mi-hard-rabbit-boundary       | 387.4 ms   | 390.6 ms    | 1.00× [0.98×, 1.02×] | 313.0 ms         | —                 | —                          | no              |
| mi-hard-supplied-126x         | 388.9 ms   | 384.2 ms    | 0.98× [0.86×, 1.07×] | 307.4 ms         | —                 | —                          | no              |
| mi-hard-supplied-13x          | 347.2 ms   | 368.2 ms    | 1.10× [0.84×, 1.11×] | 262.6 ms         | —                 | —                          | no              |
| mi-fallback-weak-attraction   | 748.4 ms   | 750.6 ms    | 1.01× [0.96×, 1.04×] | 647.4 ms         | —                 | —                          | no              |
| mi-fallback-budget-exhaustion | 430.2 ms   | 431.1 ms    | 1.01× [0.91×, 1.09×] | 357.1 ms         | —                 | —                          | no              |

Semantic hash mismatches: 0.
