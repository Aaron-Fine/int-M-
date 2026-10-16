# Renderer-path paired evidence

## m-conjugate-mirror — chromium

Label: release protocol (plan §9): branded stable browser, headed, declared target hardware, ≥21 warm pairs, BCa paired intervals. Browser: Playwright 1.63.0 driving branded stable Google Chrome, headed: flatpak run com.google.Chrome (CDP) 155.0.8059.39. Classifier: default. 22 repetitions (rep 0 cold, excluded).

Ratios are direct/mirror (>1 means mirror is faster): exp of the median paired log-ratio with a 95% BCa interval (10000 resamples, seed 20261015). Regression flag: plan §9 paired median difference > max(5%, 20 ms) with its interval excluding zero.

| Case                            | mirror wall | direct wall | wall ratio [95% BCa] | mirror classifyMs | direct classifyMs | classifier ratio [95% BCa] | regression flag |
| ------------------------------- | ----------- | ----------- | -------------------- | ----------------- | ----------------- | -------------------------- | --------------- |
| mi-easy-default-full            | 196.6 ms    | 238.4 ms    | 1.26× [1.20×, 1.31×] | 115.7 ms          | 158.0 ms          | 1.39× [1.33×, 1.50×]       | no              |
| mi-easy-exterior-heavy          | 108.0 ms    | 106.0 ms    | 0.98× [0.91×, 1.03×] | 47.9 ms           | 50.1 ms           | 1.02× [0.81×, 1.23×]       | no              |
| mi-easy-main-cardioid           | 182.3 ms    | 229.0 ms    | 1.00× [0.89×, 1.07×] | 54.7 ms           | 71.3 ms           | 1.09× [0.89×, 1.15×]       | no              |
| mi-easy-period2-bulb            | 166.2 ms    | 160.2 ms    | 0.96× [0.88×, 1.04×] | 48.0 ms           | 50.2 ms           | 1.01× [0.87×, 1.10×]       | no              |
| mi-hard-rabbit-boundary         | 534.7 ms    | 478.5 ms    | 1.02× [0.90×, 1.08×] | 426.5 ms          | 384.5 ms          | 1.05× [0.90×, 1.07×]       | no              |
| mi-hard-supplied-126x           | 439.7 ms    | 446.0 ms    | 1.07× [0.88×, 1.11×] | 349.6 ms          | 347.7 ms          | 1.05× [0.86×, 1.12×]       | no              |
| mi-hard-supplied-609x           | 306.3 ms    | 303.2 ms    | 0.99× [0.91×, 1.03×] | 227.6 ms          | 230.7 ms          | 0.96× [0.85×, 1.10×]       | no              |
| mi-hard-supplied-13x            | 409.3 ms    | 411.5 ms    | 1.07× [0.90×, 1.10×] | 294.0 ms          | 322.0 ms          | 1.05× [0.91×, 1.11×]       | no              |
| mi-fallback-unknown-high-period | 524.0 ms    | 657.9 ms    | 1.02× [0.93×, 1.06×] | 443.4 ms          | 555.8 ms          | 1.03× [0.97×, 1.07×]       | no              |
| mi-fallback-weak-attraction     | 777.3 ms    | 968.9 ms    | 1.01× [0.98×, 1.15×] | 667.9 ms          | 832.6 ms          | 1.03× [0.96×, 1.16×]       | no              |
| mi-fallback-ambiguous-boundary  | 269.2 ms    | 271.9 ms    | 1.08× [0.89×, 1.11×] | 185.4 ms          | 200.4 ms          | 1.06× [0.85×, 1.13×]       | no              |
| mi-fallback-budget-exhaustion   | 521.6 ms    | 809.5 ms    | 1.52× [1.26×, 1.55×] | 430.2 ms          | 698.4 ms          | 1.61× [1.37×, 1.64×]       | no              |
| mi-scale-6mx-basilica-rim       | 363.6 ms    | 507.1 ms    | 1.40× [1.31×, 1.60×] | 268.1 ms          | 408.5 ms          | 1.65× [1.41×, 1.81×]       | no              |

Semantic hash mismatches: 0.

## m-conjugate-mirror — firefox

Label: release protocol (plan §9): branded stable browser, headed, declared target hardware, ≥21 warm pairs, BCa paired intervals. Browser: Playwright 1.63.0 driving branded stable Firefox, headed: /usr/bin/firefox (WebDriver BiDi) 157.0. Classifier: default. 22 repetitions (rep 0 cold, excluded).

Ratios are direct/mirror (>1 means mirror is faster): exp of the median paired log-ratio with a 95% BCa interval (10000 resamples, seed 20261015). Regression flag: plan §9 paired median difference > max(5%, 20 ms) with its interval excluding zero.

| Case                            | mirror wall | direct wall | wall ratio [95% BCa] | mirror classifyMs | direct classifyMs | classifier ratio [95% BCa] | regression flag |
| ------------------------------- | ----------- | ----------- | -------------------- | ----------------- | ----------------- | -------------------------- | --------------- |
| mi-easy-default-full            | 138.0 ms    | 173.0 ms    | 1.08× [0.97×, 1.17×] | 63.0 ms           | 80.0 ms           | 1.24× [1.02×, 1.25×]       | no              |
| mi-easy-exterior-heavy          | 100.0 ms    | 116.0 ms    | 1.02× [0.90×, 1.12×] | 36.0 ms           | 40.0 ms           | 1.04× [0.95×, 1.13×]       | no              |
| mi-easy-main-cardioid           | 169.0 ms    | 157.0 ms    | 0.93× [0.84×, 1.02×] | 39.0 ms           | 35.0 ms           | 0.92× [0.78×, 1.06×]       | no              |
| mi-easy-period2-bulb            | 152.0 ms    | 165.0 ms    | 1.05× [0.95×, 1.07×] | 33.0 ms           | 31.0 ms           | 0.95× [0.87×, 1.02×]       | no              |
| mi-hard-rabbit-boundary         | 351.0 ms    | 391.0 ms    | 1.00× [0.88×, 1.17×] | 260.0 ms          | 281.0 ms          | 1.01× [0.88×, 1.13×]       | no              |
| mi-hard-supplied-126x           | 474.0 ms    | 492.0 ms    | 1.02× [0.93×, 1.16×] | 342.0 ms          | 363.0 ms          | 1.03× [0.92×, 1.21×]       | no              |
| mi-hard-supplied-609x           | 237.0 ms    | 237.0 ms    | 1.02× [0.89×, 1.14×] | 151.0 ms          | 159.0 ms          | 1.06× [0.85×, 1.17×]       | no              |
| mi-hard-supplied-13x            | 418.0 ms    | 344.0 ms    | 0.89× [0.79×, 0.95×] | 281.0 ms          | 256.0 ms          | 0.93× [0.82×, 0.98×]       | no              |
| mi-fallback-unknown-high-period | 679.0 ms    | 759.0 ms    | 1.05× [0.92×, 1.12×] | 584.0 ms          | 631.0 ms          | 1.06× [0.91×, 1.13×]       | no              |
| mi-fallback-weak-attraction     | 1198.0 ms   | 1334.0 ms   | 1.05× [0.87×, 1.23×] | 1076.0 ms         | 1216.0 ms         | 1.07× [0.84×, 1.22×]       | no              |
| mi-fallback-ambiguous-boundary  | 194.0 ms    | 197.0 ms    | 0.95× [0.89×, 1.03×] | 117.0 ms          | 123.0 ms          | 1.01× [0.85×, 1.07×]       | no              |
| mi-fallback-budget-exhaustion   | 600.0 ms    | 967.0 ms    | 1.76× [1.43×, 2.10×] | 470.0 ms          | 858.0 ms          | 2.12× [1.55×, 2.33×]       | no              |
| mi-scale-6mx-basilica-rim       | 457.0 ms    | 705.0 ms    | 1.59× [1.39×, 1.71×] | 324.0 ms          | 589.0 ms          | 1.79× [1.53×, 1.93×]       | no              |

Semantic hash mismatches: 0.
