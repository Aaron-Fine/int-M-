# Conjugate-symmetry mirroring (workstream M) — Node classifier measurement, 2026-10-10 @ bc73142

**Label: directional Node/V8 evidence — NOT the plan section 9 release protocol.** Single thread, `classifyRows` only (no tile pool, no coarse pass, no colorize, no frame delivery), one machine (11th Gen i7-1185G7, 8 logical cores, Node v24.19.0, Linux; load average ~1.2-1.5 from unrelated processes). No browser was used (local Playwright browser downloads are truncated), so the gate's "in both browsers" and "frame-level" conditions are **not** evaluated here. The working tree contained the uncommitted workstream M implementation; HEAD was bc73142 when the run started and had moved to 1aa8871 (another agent's commit, unrelated files) by the time the JSON recorded it (`git.dirty: true`). The directory name uses the start-of-run sha. The benchmark invokes only the classifier/mirror modules; a later refactor (a row-skip helper, lint fixes) and a 15-pair re-run of two cases afterwards (default-full 1.987, 13x@im0 2.008) did not change results.

## Method

- Harness: `tools/benchmark/conjugate-mirror.ts` (production `classifyRows`, `planConjugateMirror`, `applyConjugateMirror`), shipping raster **1024x640** from `tools/benchmark/corpus.v1.json`, stride 1, each case at its corpus quality profile.
- Two arms per paired repetition, **15 pairs per case, arm order alternating** (even repetitions direct-first, odd mirrored-first), one unrecorded JIT warmup pair at 256x160 per case. Pairs are only run for views where the plan finds exact conjugate rows; other views have nothing to pair (mirrored arm would be the identical code path) and are reported with 0% mirrored.
  - direct: classify every row.
  - mirrored: plan + classify only unmirrored rows + fill (plan and fill cost **included**).
- Time = classifier time (row-yield wait excluded, as in production `timing.classifyMs`). Speedup = direct / mirrored per pair; median, p90 and p10 are over the 15 per-pair speedups.
- Parity: every pair compares all three semantic channels (packed status+period, smooth/magnitude, angle) with `Object.is`: **0 mismatches in every case, both classifier modes, for the 1024x640 corpus views** (whose pixel pitch does not reach the signed-zero region). A review found sign-of-zero angle differences in deep on-axis cardioid views with the original copy rule, fixed by the magnitude-aware rule; status, period, and magnitude were bit-identical throughout.
- "Derived (@im0)" rows recentre a corpus view onto the axis (`center.im := 0`, same `re`, `spanY`). They are NOT corpus cases and most are a different region than the original (the hard `126x`, `13x`, `rabbit` @im0 views are cheap interior-dominated regions, 60-100 ms; only `609x@im0`, which is a sub-1e-4 shift, is a faithful hard symmetric view). The corpus cases that are exactly axis-symmetric are `mi-easy-default-full`, `mi-fallback-budget-exhaustion`, and `mi-scale-6mx-basilica-rim`.
- Results: `results-legacy-scan.json` / `table-legacy-scan.md` (production default classifier) and `results-checkpoint.json` / `table-checkpoint.md` (opt-in checkpoint classifier). Progress logs are included.

## Gate comparison (>= 1.6x classifier on real-axis-symmetric easy cases; no corpus case beyond the regression cap)

legacy-scan (default classifier), median / p90 / p10 of per-pair speedup:

| Case                                    | Mirrored pixels | Direct ms | Mirrored ms |      Median |       p90 |       p10 | Gate 1.6x                                 |
| --------------------------------------- | --------------: | --------: | ----------: | ----------: | --------: | --------: | ----------------------------------------- |
| mi-easy-default-full (corpus, Easy)     |           50.0% |     378.2 |       189.6 |   **1.985** |     2.076 |     1.917 | pass                                      |
| mi-easy-main-cardioid (corpus, Easy)    |           12.2% |      62.6 |        56.3 |       1.108 |     1.175 |     1.016 | n/a (partial exact pairs, lucky rounding) |
| mi-easy-exterior-heavy (corpus)         |            0.0% |         - |           - |           - |         - |         - | n/a (view does not contain the axis)      |
| mi-easy-period2-bulb (corpus)           |            0.0% |         - |           - |           - |         - |         - | n/a (center.im = 0.05, no exact pairs)    |
| easy @im0 variants (3)                  |           50.0% | 48.6-64.6 |   25.5-34.8 | 1.867-1.903 | 2.11-2.20 | 1.52-1.70 | pass (derived)                            |
| mi-hard-supplied-609x @im0              |           50.0% |    2886.8 |      1443.8 |       2.004 |     2.099 |     1.798 | pass (derived, faithful hard view)        |
| mi-hard-supplied-13x @im0               |           50.0% |    1061.4 |       532.6 |       1.951 |     2.036 |     1.712 | pass (derived)                            |
| mi-fallback-budget-exhaustion (corpus)  |           50.0% |   19345.0 |      9696.5 |       2.003 |     2.041 |     1.895 | pass (not Easy; symmetric)                |
| mi-scale-6mx-basilica-rim (corpus)      |           50.0% |   17062.2 |      8558.7 |       1.997 |     2.035 |     1.943 | pass (not Easy; symmetric)                |
| mi-fallback-ambiguous-boundary (corpus) |            5.0% |     743.4 |       740.6 |       1.017 |     1.029 |     0.986 | not applicable; shows no regression       |

checkpoint classifier: mi-easy-default-full 1.951 median (p90 2.127, p10 1.686); budget-exhaustion 2.006; basilica-rim 2.011; all derived variants 1.88-1.97. Full tables in the files above.

Regression cap: no paired case has a median below 1.0. The worst single pair is 0.974 under legacy-scan (ambiguous-boundary, 5% mirrored) and 0.887 under checkpoint (main-cardioid, 12% mirrored, an ~80 ms case, so a few ms of noise); both are cases where the mirrored rows are a small share of the work. Views with no exact conjugate rows take the unchanged path and add only plan construction (~0.1 ms per 640 rows, `planMedianMs` in the JSON). The only exact-symmetric Easy corpus case is `mi-easy-default-full`; the other Easy cases do not straddle the axis symmetrically, so the mirroring gate population in the corpus is one case.

## Reading the numbers

- The classifier-only ceiling is 2.0x at 50% mirrored rows; measured 1.95-2.01x medians, i.e. mirror fill (about 2.5 ms at 1024x640) and plan are negligible here. The 1.57x PoC median (512x512, main thread, 5 reps, includes JIT noise and a 6-field fill) is not reproduced at the shipping raster: the lowest per-pair speedup on the binding easy case is 1.89 under legacy-scan (1.24 for one noisy checkpoint pair; checkpoint median 1.951).
- This is classifier time only. In the app the coarse pass, colorize, frame delivery and worker scheduling are unchanged by the flag, so the end-to-end frame ratio will be lower than these figures; the gate's frame-level, two-browser wall-clock evidence has still to be collected.
- Applicability is narrow by construction: rows mirror only where the binary64 pixel-center imaginary parts are exact negations, which requires `center.im === 0` (or lucky exactly-representable arithmetic, e.g. `mi-easy-main-cardioid`). A user who pans off the axis loses the optimisation entirely.
