# PoC browser companion (`poc/performance/browser/`)

Playwright-driven browser measurements for the performance-plan decision
block in §5 and the renderer-path details in §12: pool sizing (workstream K),
yield mechanism, zero-copy transfer, band order (workstream E details),
conjugate-mirroring savings (workstream M), and coarse-pass cost-estimate
quality (workstream N input). This directory extends the Node harness in
`poc/performance/src/` from Node/V8 evidence to headless-Chromium evidence.

> All evidence here is **directional** (headless Chromium via Playwright). It
> does not replace Stage A browser evidence (plan §9: stable branded Chrome
> and Firefox, headed, on the declared target hardware).

## Status

Milestone 1 (scaffolding) — under construction; measurements land per
milestone. See `results/` for committed raw samples.

## Running

```
npx playwright test --config poc/performance/browser/playwright.config.ts
```

One invocation builds the production app bundle (`vite build` → `dist/`),
builds the microbench page (`vite build` → `dist/poc-bench/`), serves both
through `vite preview` on port 4178, and runs every spec. Raw per-run samples
are appended to `results/<measurement>.json` (every file embeds the plan §9
environment manifest produced by `tools/benchmark/capture-environment.mjs`
plus live browser facts).

Typecheck/lint wiring: `poc/performance/browser/tsconfig.json` extends
`tsconfig.poc.json` (which now includes this directory and grants DOM lib —
the Node-side PoC sources in `poc/performance/src/` do not use DOM globals).
