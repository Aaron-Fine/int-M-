# Worker-stage split probe — not Phase 1 closeout

`n = 3` Chromium samples per size. This is a Task 0 instrumentation probe, not
Phase 1 closeout and not a Path 2 acceptance run. Yield cadence is unchanged.
No tile workers were added.

## Command

Local production preview `http://127.0.0.1:4173/` (headed Playwright Chromium
151). `PHASE1_COMMIT` in the JSON is the parent plan commit; the measured
bundle includes the worker-stage instrumentation.

```sh
PHASE1_SAMPLES=3 \
  PHASE1_CANCEL_PRESSES=8 \
  PHASE1_SKIP_PRODUCTION=1 \
  PHASE1_BROWSERS=chromium \
  PHASE1_OUTPUT=evidence/phase-1/ui-path-worker-stages-probe.json \
  node tools/measure_ui_path.mjs
```

Raw JSON: [ui-path-worker-stages-probe.json](ui-path-worker-stages-probe.json).

## 1024² Balanced (Chromium 151)

Times are worker-side wall clocks copied onto `mi:worker-*` marks. Classify
excludes `setTimeout(0)` yield delay.

| Stage                                                    |    Median |
| -------------------------------------------------------- | --------: |
| e2e stable (`mi:render-request` → `mi:stable-presented`) | 2351.8 ms |
| coarse classify                                          |   35.1 ms |
| coarse colorize                                          |   48.3 ms |
| coarse yield wait (16 awaits)                            |   43.0 ms |
| stable classify                                          | 1638.6 ms |
| stable colorize                                          |   47.3 ms |
| stable yield wait (128 awaits)                           |  527.9 ms |

Share of 2351.8 ms e2e: stable classify **69.7%**, stable yield **22.4%**,
colorize (both stages) **4.1%**, coarse classify+yield **3.3%**. Colorize + UI
present is about **107 ms**, which is already the size of the Chromium 1024²
gap (~102 ms in this probe, ~114 ms in the n=5 closeout set).

Do not treat these medians as closeout. Firefox was not re-measured.
