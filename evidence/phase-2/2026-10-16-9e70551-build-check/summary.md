# Renderer-path paired evidence

> **Superseded (added by hand 2026-10-16).** This run held the build order
> fixed (`after` first in every repetition). In headed browsers each
> repetition's first navigation also pays new-window start-up, so the fixed
> order biased the comparison against `after`; the flags below are that
> artifact. The runner now alternates build order, and the corrected run
> (`2026-10-16-9e70551-build-check-alternating`) finds no difference
> (0.98×–1.10×, no flags). The Firefox half of this run stalled (headed
> Firefox, `before` build) and stored no samples. Kept as the record of the
> harness defect; the manifest was regenerated after this note.

## build-59926c5-vs-9e70551 — chromium

Label: release protocol (plan §9): branded stable browser, headed, declared target hardware, ≥21 warm pairs, BCa paired intervals. Browser: Playwright 1.63.0 driving branded stable Google Chrome, headed: flatpak run com.google.Chrome (CDP) 155.0.8059.39. Classifier: default. 22 repetitions (rep 0 cold, excluded).

Ratios are before/after (>1 means after is faster): exp of the median paired log-ratio with a 95% BCa interval (10000 resamples, seed 20261015). Regression flag: plan §9 paired median difference > max(5%, 20 ms) with its interval excluding zero.

| Case                          | after wall | before wall | wall ratio [95% BCa] | after classifyMs | before classifyMs | classifier ratio [95% BCa] | regression flag |
| ----------------------------- | ---------- | ----------- | -------------------- | ---------------- | ----------------- | -------------------------- | --------------- |
| mi-easy-default-full          | 176.7 ms   | 150.9 ms    | 0.87× [0.81×, 0.90×] | 110.9 ms         | —                 | —                          | **flagged**     |
| mi-hard-rabbit-boundary       | 385.7 ms   | 384.1 ms    | 0.97× [0.92×, 0.99×] | 321.0 ms         | —                 | —                          | no              |
| mi-hard-supplied-126x         | 414.3 ms   | 358.5 ms    | 0.93× [0.84×, 0.95×] | 330.0 ms         | —                 | —                          | **flagged**     |
| mi-hard-supplied-13x          | 385.5 ms   | 332.3 ms    | 0.87× [0.83×, 0.89×] | 298.2 ms         | —                 | —                          | **flagged**     |
| mi-fallback-weak-attraction   | 759.1 ms   | 713.3 ms    | 0.94× [0.93×, 0.97×] | 656.5 ms         | —                 | —                          | **flagged**     |
| mi-fallback-budget-exhaustion | 443.9 ms   | 400.8 ms    | 0.91× [0.86×, 0.93×] | 363.7 ms         | —                 | —                          | **flagged**     |

Semantic hash mismatches: 0.
