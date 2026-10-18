# MI-PERF-007 overhead benchmark — 2026-10-16 @ 9e70551

Paired `?perf=1&perfCounters=1` present vs diagnostics-absent evidence from the production bundle (`vite build` + `vite preview`), driven through the real application UI by `tools/benchmark/run-overhead.mjs`. Wall metric: in-page marks (last `mi:stable-presented` − `mi:app-mount`), available in both arms. 4 selected case(s) × 2 arms × 22 paired repetitions, arm order alternating per repetition; rep 0 cold (fresh context per arm), reps 1+ warm. Every sample is stored raw in raw-observations.json; aggregates below are derived views.

**Label (chromium):** Playwright 1.63.0 driving branded stable Google Chrome, headed: flatpak run com.google.Chrome (CDP) 155.0.8059.39 — release protocol (plan §9): branded stable browser, headed, declared target hardware, ≥21 warm pairs, BCa paired intervals.

## Paired end-to-end opt-in diagnostics overhead

| Case                    | absent median (MAD) | diagnostics median (MAD) | median Δ | 95% paired BCa interval | opt-in ≤5%          |
| ----------------------- | ------------------- | ------------------------ | -------- | ----------------------- | ------------------- |
| mi-easy-default-full    | 288 ms (11)         | 299 ms (12)              | 4.47%    | -4.31% … 14.19%         | **not established** |
| mi-easy-exterior-heavy  | 203 ms (23)         | 197 ms (12)              | -1.85%   | -16.17% … 13.91%        | **not established** |
| mi-hard-rabbit-boundary | 1995 ms (62)        | 1831 ms (38)             | -8.95%   | -12.02% … -4.74%        | within              |
| mi-hard-supplied-126x   | 4229 ms (64)        | 3877 ms (41)             | -7.41%   | -10.17% … -5.89%        | within              |
| **pooled (88 pairs)**   | 1156                | 1034                     | -6.00%   | -7.92% … -4.71%         | within              |

Bootstrap: paired BCa bootstrap of median log(present/absent), B=10000, seed 20260902 (recorded per the evidence contract). Intervals are in log-ratio space; the opt-in claim needs the interval upper bound below +5%. Per-case intervals at 22 pairs are wide; the pooled row is the primary verdict and per-case rows are recorded alongside.

## Recorder cost and retention

- Recorder per-frame cost (Node microbenchmark of the production ring, directional): recordFrame mean 1.11 µs, ring-call mean 3.36 µs — within the ≤0.2 ms/frame budget. The paired browser interval above measures the separate opt-in diagnostics budget.
- Measured retention: budget 65536 bytes. mi-hard-supplied-126x (32×completed): 11830 bytes; mi-easy-exterior-heavy (32×completed): 43970 bytes. Worst-single-trace × capacity extrapolation: 60480 bytes. Within the 64 KiB budget.

## Semantic comparison (diagnostics vs absent stable-canvas hash)

- mi-easy-default-full: 22/22 identical hashes
- mi-easy-exterior-heavy: 22/22 identical hashes
- mi-hard-rabbit-boundary: 22/22 identical hashes
- mi-hard-supplied-126x: 22/22 identical hashes

## Scope and honesty notes

- Execution: headed, branded stable browser on the session display. Automation-bundled engines are directional; the release protocol (plan §9) needs branded stable Firefox, declared target hardware, 21+ paired repetitions with BCa intervals.
- The wall metric is mark-based (mi:app-mount → last mi:stable-presented) rather than the ring’s requestToPresentMs, so it exists identically in the perf0 arm; requestToPresentMs of the perf arm is stored raw for cross-reference.
- The perf=1&perfCounters=1 arm carries the full opt-in diagnostics (hook, trace retention, and per-band counters from the instrumented legacy-scan kernel); both arms run that kernel, and the always-on ring is present in BOTH arms, so the paired delta isolates opt-in overhead on top of the always-on recorder.
- Rep 0 (cold) is included in the paired intervals (worker/module compile noise is paired and largely cancels); warm-only views are derivable from raw-observations.json.
- Retention fills use the ring capacity (32): the hard case alternates semantic-view requests and waits for every trace to complete; the easy case first performs 22 distinct pan renders, then completes the ring through semantic-view requests. The single-trace × 32 extrapolation bounds the all-worst-shape case.
- recorder-cost-node.json is a Node/V8 microbenchmark — directional only. The separate 2% end-to-end always-on budget still needs an instrumented-build vs recorder-free-build comparison; this harness cannot establish it because both arms include the ring.
