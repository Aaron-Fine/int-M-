# MI-PERF-007 overhead benchmark — 2026-10-15 @ 9e70551

> **Harness note (added by hand 2026-10-16).** This run hashed each canvas in
> Node after shipping its RGBA bytes over the automation channel (about 10 s
> and a large Node heap per sample, outside the timed window). The runner now
> hashes in the page. A like-for-like rerun stalled (headed Firefox) and is
> not recorded. The manifest was regenerated after this note.

Paired `?perf=1&perfCounters=1` present vs diagnostics-absent evidence from the production bundle (`vite build` + `vite preview`), driven through the real application UI by `tools/benchmark/run-overhead.mjs`. Wall metric: in-page marks (last `mi:stable-presented` − `mi:app-mount`), available in both arms. 4 selected case(s) × 2 arms × 22 paired repetitions, arm order alternating per repetition; rep 0 cold (fresh context per arm), reps 1+ warm. Every sample is stored raw in raw-observations.json; aggregates below are derived views.

**Label (firefox):** Playwright 1.63.0 driving branded stable Firefox, headed: /usr/bin/firefox (WebDriver BiDi) 157.0 — release protocol (plan §9): branded stable browser, headed, declared target hardware, ≥21 warm pairs, BCa paired intervals.

## Paired end-to-end opt-in diagnostics overhead

| Case                    | absent median (MAD) | diagnostics median (MAD) | median Δ | 95% paired BCa interval | opt-in ≤5%          |
| ----------------------- | ------------------- | ------------------------ | -------- | ----------------------- | ------------------- |
| mi-easy-default-full    | 374 ms (34)         | 440 ms (55)              | 7.69%    | -0.16% … 17.26%         | **not established** |
| mi-easy-exterior-heavy  | 212 ms (34)         | 224 ms (31)              | 1.75%    | -16.08% … 18.76%        | **not established** |
| mi-hard-rabbit-boundary | 3988 ms (669)       | 5009 ms (900)            | 13.74%   | -3.96% … 52.78%         | **not established** |
| mi-hard-supplied-126x   | 10412 ms (972)      | 11792 ms (851)           | 10.41%   | 2.95% … 13.18%          | **not established** |
| **pooled (88 pairs)**   | 1947                | 2359                     | 9.45%    | 3.02% … 13.18%          | **not established** |

Bootstrap: paired BCa bootstrap of median log(present/absent), B=10000, seed 20260902 (recorded per the evidence contract). Intervals are in log-ratio space; the opt-in claim needs the interval upper bound below +5%. Per-case intervals at 22 pairs are wide; the pooled row is the primary verdict and per-case rows are recorded alongside.

## Recorder cost and retention

- Recorder per-frame cost (Node microbenchmark of the production ring, directional): recordFrame mean 1.34 µs, ring-call mean 3.64 µs — within the ≤0.2 ms/frame budget. The paired browser interval above measures the separate opt-in diagnostics budget.
- Measured retention: budget 65536 bytes. mi-hard-supplied-126x (32×completed): 10711 bytes; mi-easy-exterior-heavy (32×completed): 35797 bytes. Worst-single-trace × capacity extrapolation: 49280 bytes. Within the 64 KiB budget.

## Semantic comparison (diagnostics vs absent stable-canvas hash)

- mi-easy-default-full: 22/22 identical hashes
- mi-easy-exterior-heavy: 22/22 identical hashes
- mi-hard-rabbit-boundary: 22/22 identical hashes
- mi-hard-supplied-126x: 22/22 identical hashes

## Scope and honesty notes

- Execution: headed, branded stable browser on the session display. Automation-bundled engines are directional; the release protocol (plan §9) needs branded stable Firefox, declared target hardware, 21+ paired repetitions with BCa intervals.
- The wall metric is mark-based (mi:app-mount → last mi:stable-presented) rather than the ring’s requestToPresentMs, so it exists identically in the perf0 arm; requestToPresentMs of the perf arm is stored raw for cross-reference.
- The perf=1&perfCounters=1 arm carries the full opt-in diagnostics (hook, trace retention, and per-band counters); the always-on ring is present in BOTH arms, so the paired delta isolates opt-in overhead on top of the always-on recorder.
- Rep 0 (cold) is included in the paired intervals (worker/module compile noise is paired and largely cancels); warm-only views are derivable from raw-observations.json.
- Retention fills use the ring capacity (32): the hard case alternates semantic-view requests and waits for every trace to complete; the easy case first performs 22 distinct pan renders, then completes the ring through semantic-view requests. The single-trace × 32 extrapolation bounds the all-worst-shape case.
- recorder-cost-node.json is a Node/V8 microbenchmark — directional only. The separate 2% end-to-end always-on budget still needs an instrumented-build vs recorder-free-build comparison; this harness cannot establish it because both arms include the ring.
