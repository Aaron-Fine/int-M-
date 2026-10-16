# Consolidated browser evidence harness and e2e suite — design

- Date: 2026-10-16
- Status: approved 2026-10-16 (owner: implement, browser-only renderer, update dependencies)
- Scope: the release evidence runners under `tools/benchmark/`, the
  Playwright suite under `tests/e2e/`, the browser's renderer modes, and the
  npm dependencies

## Intent

Stop rendering the same views over and over in separate browser sessions,
and stop spending browser time on the slow reference kernel.

- **What the owner asked for:** "so many integration tests that are different
  tests all rendering the same thing is a waste of time"; "use the new fast
  renderer"; both the evidence runners and the e2e suite; "now that testing
  is done, we should just be using the new renderer" (the owner then chose
  to remove the old kernels entirely); "update
  dependencies while you are working on this implementation".
- **Success criteria:**
  - One release evidence session covers both browsers in **≤ 30 minutes** on
    the target laptop (owner choice), replacing the five runners used for
    Phase 2 closeout (about 10 hours on 2026-10-15).
  - Every render taken in a session yields every metric that render can
    give; no metric requires re-rendering a view in another runner.
  - The browser runs only the production renderer: no URL parameter or
    message field can select another classifier or renderer-path variant.
    Old-build or mirroring-off arms run only on request (`--compare`).
  - A stall or a locked session costs at most one case, never the session.
  - The e2e suite runs against the production bundle, has no test that
    depends on the slow reference kernel, and loads the default view fewer
    times.
- **Assumptions (stated, correct me):** the plan §9 release protocol is
  unchanged (branded browsers, headed, ≥21 warm pairs, BCa intervals); Node
  evidence (lag comparisons, tournament judge, Lean work) is out of scope;
  past evidence directories stay as recorded, reproducible from their
  commits.

## Production renderer only (browser)

The shipped app can run only the production path: the watched-lag
triggered kernel, two-lane row kernel, center-out bands, MessageChannel
yields, zero-copy output, and conjugate mirroring (its default-on status is
still an open owner decision; `?perf=1&conjugateMirror=0` stays as the one
diagnostic toggle until it is decided).

- **Removed from the browser:** the `?classifierMode=`, `?bandOrder=`,
  `?yieldMechanism=`, and `?frameOutput=` parameters; the matching
  `RenderMessage` and tile-protocol fields; the differential-stats plumbing
  through the worker, tile pool, and perf hook. The render worker and tile
  workers call the production kernel directly.
- **Removed from the codebase (owner decision after a keep/remove
  review, 2026-10-16):** `legacy-scan`, `checkpoint`, `differential`, the
  instrumented counting kernel and diagnostics counters, and the
  renderer-path variants (legacy band order, legacy-merge output, timeout
  yields), with the tools and tests that only compared against them.
- **Replacement reference:** a golden kernel fixture
  (`fixtures/kernel-golden.v1.json`): per-case SHA-256 of the classifier's
  output channels on the frozen corpus at 160×100, generated before the
  removal with equality to `legacy-scan` asserted, and checked by a unit
  test. ADR 0007 records the decision.
- **Acceptance:** the golden test stays green through the removal; no
  reference-kernel symbol remains in `src/`, `tools/`, or `tests/`; the
  inspector and the default view's stable-canvas hash are unchanged.

## Evidence harness

### Modules

`tools/benchmark/harness/`, one concern per module:

| Module                            | Responsibility                                                                                                                                                                                                                                                                                                                                              | Depends on                       |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `session.mjs`                     | Build the production bundle once (`vite build`); serve it and any `--compare` builds with `vite preview`; launch the branded browser (absorbs `release-browser.mjs`: Chrome over CDP, Firefox over BiDi); calibrate the viewport to the 1024×640 raster; report power mode; check `loginctl` `LockedHint`.                                                  | vite, Playwright                 |
| `capture.mjs`                     | One in-page capture per render: the stable computed trace and all its frames, the mark-based wall (`mi:render-request` → `mi:stable-presented`, available with and without `?perf=1`), an in-page SHA-256 of the canvas (row-major RGBA), the achieved viewport, and a stall-aware wait (3 min, then one retry in a fresh context, recorded on the sample). | page only                        |
| `stats.mjs`                       | Median, MAD, nearest-rank p95 (only with ≥ 40 observations), paired BCa ratio and difference (wrapping `bca.ts`, 10,000 resamples, recorded seed), and the plan §9 regression flag (paired median > max(5%, 20 ms) with the interval excluding zero). Pure functions.                                                                                       | `bca.ts`                         |
| `budgets.mjs` + `budgets.v1.json` | The frozen latency budgets (coarse ≤ 100 ms every case; stable ≤ 250 ms Easy, ≤ 600 ms Hard known, ≤ 1,500 ms Fallback and Scale; warm medians, both browsers) and their evaluation per case. Pure.                                                                                                                                                         | corpus                           |
| `evidence.mjs`                    | Per-engine `environment.json` merge (capture-environment skeleton plus browser facts), raw writer, per-case checkpoint file, summary assembly from sections, `manifest.sha256` last.                                                                                                                                                                        | `manifest.mjs`                   |
| `passes/corpus.mjs`               | The corpus pass (below).                                                                                                                                                                                                                                                                                                                                    | session, capture, stats, budgets |
| `passes/interactions.mjs`         | The interaction pass (below), ported from `run-operational.mjs` including its provenance checks.                                                                                                                                                                                                                                                            | session, capture                 |

Entry point: `tools/benchmark/run-release.mjs`.

```
node tools/benchmark/run-release.mjs [--engines chromium,firefox] [--release]
    [--reps 22] [--cases <id,…>] [--compare name=<query>|name=dist:<dir>]…
    [--skip-interactions] [--resume] [--out-dir <dir>]
```

`--release` means branded, headed, ≥ 22 repetitions (the plan §9
protocol); without it the automation-bundled engines run headless and every
artifact says "directional". `npm run evidence:release` runs the full
session; `npm run evidence:smoke` runs headless with `--reps 2 --cases
mi-easy-default-full,mi-hard-supplied-126x`.

Retired after the harness reproduces their measurements:
`run-stage-a.mjs`, `run-operational.mjs`, `run-overhead.mjs`,
`run-renderer-path.mjs`, `run-b-gate.mjs` (and `release-browser.mjs`, folded
into `session.mjs`). `view-chain.mjs` stays only if a future `--compare`
against a pre-`?view=` build needs pointer-driven navigation; otherwise it
retires with the B gate. The evidence README's runner sections are rewritten
for the new harness.

### Corpus pass

Per engine, per corpus case (13), per repetition (22; rep 0 cold):

- **Arms:** `hook` (`?perf=1&view=…&quality=…`, full trace) and `plain`
  (`?view=…&quality=…`, mark wall and hash only), both on the production
  default kernel. Each `--compare name=…` adds one arm: a query toggle on the
  same build (only `conjugateMirror=0` remains) or a whole other build (`dist:<dir>`, served from its own preview server, hook on).
- **Order:** arm order rotates per repetition (all arms, all positions), and
  every repetition uses a fresh browser context, so headed new-window cost
  is spread evenly (the 2026-10-16 fixed-order bias is not repeatable).
- **Metrics from the same renders:**
  - latency: stable and coarse `requestToPresentMs` (hook arm) → budget
    pass/fail per case;
  - hook overhead: paired plain/hook mark-wall ratio with BCa, per case and
    pooled → the plan §8 ≤ 5% opt-in check (replaces `run-overhead.mjs`);
  - parity: hash equal across arms and repetitions (mismatches enumerated);
  - classify time, band completion times and imbalance, colorize time
    (hook arm);
  - each `--compare` arm: paired ratio against `hook` for wall and
    classify time, and the regression flag.
- **Retention:** after the last case, the hook page's ring snapshot size is
  recorded against the 64 KiB budget (replaces the overhead runner's fills).

Estimate: 13 × 22 × 2 renders per engine at ~0.3–1 s each including
navigation → about 10 minutes per engine.

### Interaction pass

After the corpus pass, on contexts already open: cancel (acknowledgment and
quiescence), in-flight replay, recolor, and semantic-cache distributions,
50 interactions each, with `run-operational.mjs`'s per-interaction provenance
checks (expected source, `originComputeId` equal to the reused computation,
no compute fields on reused frames). Estimate: 1–2 minutes per engine.

### Robustness

- Refuse to start on a locked session; re-check before each case and stop
  cleanly (checkpoint kept) if it locks.
- Stall: one retry per sample in a fresh context, marked
  `retriedAfterStall`, counted in the summary; a second stall stops the
  case and records it as incomplete.
- Checkpoint: after each case, the engine's samples are appended to
  `<out-dir>/.partial-<engine>.json`; `--resume` skips completed cases.
  The final write removes the partial file.
- The queue wrapper (`kde-inhibit --screenSaver --power`) stays outside the
  harness; the harness documents it and reports the lock state it saw.

### Output

One directory per session, `evidence/phase-2/<date>-<commit>-release/`:
`environment.json` (both engines), `raw-observations.json` (every sample;
compressed per the evidence contract if it reaches 5 MiB),
`semantic-comparison.json`, `summary.md`, `manifest.sha256` last. Summary
sections: budgets; hook overhead; parity; interactions; band balance; one
section per `--compare` arm; stalls and lock events; honesty notes
(`requestToPresentMs` is not proof of paint, and so on).

### Testing

- Unit tests (vitest, `tests/unit/benchmark/`): `stats.mjs` (median, p95
  threshold, regression flag), `budgets.mjs` (evaluation at and around each
  threshold), the arm/order schedule (every arm in every position over a
  rotation), checkpoint merge and `--resume` selection, summary section
  assembly from fixed samples.
- `npm run evidence:smoke`: headless end to end (2 reps, 2 cases, one
  `--compare conjugateMirror=0`); run by hand before release sessions, not
  in wall-clock CI (plan §9).
- Acceptance: one release session on the target laptop finishes within 30
  minutes for both browsers, and its budget, overhead, parity, and
  interaction results agree with the 2026-10-15 runs within their
  intervals.

## E2E suite

- **Production bundle.** `playwright.config.ts` serves `vite build` +
  `vite preview` (port 4173) instead of `npm run dev`; local and CI use the
  same command. A `test:browser:dev` script keeps the dev-server variant for
  debugging.
- **Provenance test on the fast kernel.** `render traces carry delivery
provenance and two-event cancellation timing` drops
  `classifierMode=legacy-scan` (18–28 s today). On the hard 126× view at
  Detailed: press `+` when the coarse frame appears; if the stable frame won
  the race, repeat (up to 5 attempts) until a trace closes as `cancelled`
  with acknowledgment ≤ quiescence. Then select another interior view during
  a coarse frame and assert an `inflight-replay` frame naming the active
  computation, then after the stable frame assert `recolor`.
- **One first-use flow instead of four default-view tests.** These four
  only read or lightly change the default view and become one test with
  `test.step`s on one page, in this order: first-use explanations and guide
  (`starts with a useful, explained semantic view`) → evidence terms and
  help (`explains evidence terms…`, ending with the Detailed quality
  selection moved to the last step) → interior views
  (`changes semantic views…`) → WCAG scan of the primary states, Explore and
  a catalog selection (`has no automated WCAG A or AA violations…`).
  Every assertion is kept.
- **Stay isolated:** forced colors (needs `emulateMedia` before load),
  phone layouts (viewport), recovery and failure injection, nested-worker
  counting (needs a fresh page), navigation and zoom, catalog keyboard,
  arbitrary points, coarse/stable ordering, pan/Escape.
- Acceptance: the suite passes in both engines with the same assertions,
  with three fewer default-view loads per engine and no test above 10 s.

## Dependency update

Update every npm dependency to its latest release, one package group at a
time, each followed by `npm run check` and the browser suite:

- minor and patch: `@axe-core/playwright`, `@playwright/test` (download the
  matching browsers), `eslint`, `globals`, `prettier` (reformat if its
  output changes), `typescript-eslint`, `vite`, `vitest`;
- `npm audit fix` for the high-severity `source-map-js` advisory
  (GHSA-68fv-2mgg-jv7q, a dev dependency);
- **TypeScript 6 to 7** (major, native compiler): adopt only if
  `typescript-eslint` supports it and every project typechecks; otherwise
  stay on the latest 6.x and record why;
- **`@types/node`**: latest 24.x, matching the Node 24 runtime the
  toolchain runs on (26.x describes APIs the runtime lacks).

The lockfile is regenerated with the pinned npm major (`packageManager`).

## Out of scope

- Node evidence (`bench:lag-comparisons`, the tournament judge, Lean).
- Changing the release protocol's statistics or repetition counts.
- Memory high-water measurement (open in the Phase 2 closeout; can become a
  corpus-pass metric later).
- Re-running the 2026-10-15 decisions; the harness reproduces their
  measurements once as its acceptance check, nothing more.
