# Operational suite — 2026-10-15 @ 9e70551 (uncommitted source changes)

> **Note (added by hand 2026-10-16).** "Uncommitted source changes" refers to
> harness files only (a new `tools/benchmark/lag-comparisons.ts` and edits to
> `tools/benchmark/run-overhead.mjs`); `src/` and `index.html` were exactly
> `9e70551`, so the measured bundle is that commit. The manifest was
> regenerated after this note.

Cache, replay, recolor, and cancellation distributions from the production bundle, driven through the real application UI and read from the always-on render-trace ring (`tools/benchmark/run-operational.mjs`). Every interaction and its full trace are in raw-observations.json.

## chromium — Playwright 1.63.0 driving branded stable Google Chrome, headed: flatpak run com.google.Chrome (CDP)

Label: release protocol (plan §9): branded stable browser, headed, declared target hardware, ≥50 interactions per distribution

| Distribution    | Metric                               | n   | median (MAD)     | p95      | min / max          | provenance violations | raced |
| --------------- | ------------------------------------ | --- | ---------------- | -------- | ------------------ | --------------------- | ----- |
| cancel          | cancelAckMs                          | 50  | 8.6 ms (3.3 ms)  | 16.4 ms  | 1.6 ms / 18.1 ms   | 0                     | 16    |
| cancel          | childQuiescenceMs                    | 50  | 8.6 ms (3.3 ms)  | 16.4 ms  | 1.9 ms / 18.1 ms   | 0                     | 16    |
| inflight-replay | requestToPresentMs (replayed coarse) | 50  | 45.6 ms (8.8 ms) | 100.4 ms | 27.4 ms / 113.3 ms | 0                     | 0     |
| recolor         | requestToPresentMs                   | 50  | 41.3 ms (5.3 ms) | 61.2 ms  | 22.0 ms / 63.3 ms  | 0                     | 0     |
| recolor         | colorizeMs                           | 50  | 27.0 ms (8.1 ms) | 50.2 ms  | 17.2 ms / 53.6 ms  | 0                     | 0     |
| semantic-cache  | requestToPresentMs                   | 50  | 24.1 ms (7.9 ms) | 32.7 ms  | 15.7 ms / 32.9 ms  | 0                     | 0     |
| semantic-cache  | colorizeMs                           | 50  | 15.7 ms (0.9 ms) | 25.6 ms  | 14.6 ms / 25.9 ms  | 0                     | 0     |

Sources distinguishable: every interaction carried its expected source, reused frames named the computation they reused, and no compute field appeared on a non-computed frame.

## firefox — Playwright 1.63.0 driving branded stable Firefox, headed: /usr/bin/firefox (WebDriver BiDi)

Label: release protocol (plan §9): branded stable browser, headed, declared target hardware, ≥50 interactions per distribution

| Distribution    | Metric                               | n   | median (MAD)      | p95     | min / max          | provenance violations | raced |
| --------------- | ------------------------------------ | --- | ----------------- | ------- | ------------------ | --------------------- | ----- |
| cancel          | cancelAckMs                          | 50  | 1.0 ms (0.0 ms)   | 2.0 ms  | 0.0 ms / 3.0 ms    | 0                     | 16    |
| cancel          | childQuiescenceMs                    | 50  | 5.0 ms (1.0 ms)   | 7.0 ms  | 2.0 ms / 9.0 ms    | 0                     | 16    |
| inflight-replay | requestToPresentMs (replayed coarse) | 50  | 53.0 ms (12.5 ms) | 94.0 ms | 23.0 ms / 195.0 ms | 0                     | 0     |
| recolor         | requestToPresentMs                   | 50  | 40.5 ms (7.5 ms)  | 54.0 ms | 21.0 ms / 56.0 ms  | 0                     | 0     |
| recolor         | colorizeMs                           | 50  | 31.0 ms (6.0 ms)  | 43.0 ms | 17.0 ms / 44.0 ms  | 0                     | 0     |
| semantic-cache  | requestToPresentMs                   | 50  | 36.0 ms (4.0 ms)  | 46.0 ms | 21.0 ms / 47.0 ms  | 0                     | 0     |
| semantic-cache  | colorizeMs                           | 50  | 28.0 ms (1.0 ms)  | 30.0 ms | 16.0 ms / 34.0 ms  | 0                     | 0     |

Sources distinguishable: every interaction carried its expected source, reused frames named the computation they reused, and no compute field appeared on a non-computed frame.

## Scope and honesty notes

- `requestToPresentMs` ends at the next presentation opportunity after image upload; it is not proof of physical paint (plan §8).
- Cancellation timings are main-thread deltas from the cancel request: acknowledgment when the worker accepted the cancel, quiescence when the renderer and every nested tile worker had stopped (or the pool was reset).
- `raced` counts interactions where the stable frame arrived before the cancel or view change took effect; they are stored but excluded from the distribution.
- Cold worker and fallback-recovery behavior are covered by Stage A cold repetitions and the browser recovery test, not measured here; cold Wasm and catalog shard states do not apply (no Wasm backend, workstream F deferred).
