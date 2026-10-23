# Analytic Period-4 Classification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Classify period-4 interior pixels by solving the cycle-product cubic μ³ + (c²−3)μ² − (c⁴+c³−c²−3)μ − G₄(c) = 0 and accepting only when a rigorous a-posteriori root enclosure puts an exact root inside the attraction margin, with a Lean statement of exact period, oracle adjudication of every changed pixel, and no measurable cost for pixels that escape early.

**Architecture:** A pure function `classifyPeriodFourInto` (`src/domain/analytic-period-four.ts`) computes an untrusted candidate root (Cardano plus two Newton steps per root), then certifies it with +, −, ×, ÷ and √ only: upper bounds F ≥ |M(μ̃)| and K ≥ |M″(μ̃)|/2 and a lower bound D ≤ |M′(μ̃)| for the exact cubic at the binary64 parameter, from a written binary64 error budget. If h(8K + 16h) < D with h = F/D, Rouché's theorem puts exactly one exact root within 2h(1 + 2⁻⁴⁰) of the candidate, and the pixel is accepted when 16|μ̃| + 64h + 2⁻⁵⁰ < 1 − attractMargin. Near the three primitive cusps D vanishes and the pixel falls through to the unchanged orbit path. Both kernels try the solve once per pixel at the first scanning iteration, exactly where the period-3 closed form runs, behind padded boxes of the six components: a straight-line gate in the scalar kernel, and in the row kernel two per-row windows on Re c with one call site shared with period 3, so `classifyRow` gains no inlinable call. The answer change is adjudicated against an independent double-double period-4 cycle and recorded as evidence; the kernel and colorized goldens and the affected screenshot baselines are regenerated in the commit that changes the kernels.

**Tech Stack:** TypeScript 6.0, Vite 8.3 (SSR builds for tools), Vitest 5.0, Playwright 1.64 (headless; the pinned visual container for screenshot baselines), Node 24, Lean 4.33.1 with Mathlib v4.33.1 (`proof/`), Python 3 `Decimal` fixture generator (standard library only).

**Spec:** `docs/verification/PHASE2-TODO.md` item "8. Algebraic period-3/4 classification (workstream H)", the bullet "**Period 4, after a rigorous root-error bound** (Kantorovich, or a cusp exclusion disk): the cubic solve inside the component boxes. This also resolves the unresolved half of the 6,000,000× basilica-rim view." Done when: "the hard views gain as the spike measured, in the browsers, and every changed pixel is adjudicated against the oracle" (the browser half is the owner's deferred session). Owner decisions: 2026-10-16 "adopt period 3 now and period 4 only after its error bound is rigorous"; 2026-10-17 period 3 "Accept, like p1/p2"; for period 4 the bar is a **rigorous** bound and the spike's heuristic cusp bound is not acceptable. Background: `docs/verification/WORKSTREAM-H-SPIKE-2026-10-16.md`, `poc/performance/h-p3p4/p34.ts` (`tryP4`), `docs/decisions/0010-analytic-period-three.md`, `docs/PERFORMANCE-MATHEMATICS.md` §11, and the period-3 plan `docs/superpowers/plans/2026-10-16-analytic-period-three.md`, whose structure this plan mirrors.

## Global Constraints

- `npm run check` passes at every commit.
- No headed browsers. `npx playwright test` is headless and the visual container (`npm run test:visual:container`) is headless; never pass `--headed`, and never run `npm run evidence:release`. The browser release-harness run is deferred to the owner's headed session.
- In Markdown, never wrap an inline code span across lines. After editing Markdown, run `npx prettier --write <files>` twice, then `npx prettier --check <files>`.
- No new npm dependencies. Lean changes must build with the repository's existing Lean setup: from `proof/`, `lake build`, `lake env lean IntMProof/Axioms.lean`, `lake lint` and `lake exe lint-style` (CI: `.github/workflows/ci.yml`, `leanprover/lean-action` with lint and axiom audit, then the same two commands).
- Commit messages use the "Area: summary" style and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. The controller commits this plan file itself, with `git commit -- docs/superpowers/plans/2026-10-17-analytic-period-four.md`.
- Golden changes follow `fixtures/README.md`: the fixtures are `fixtures/kernel-golden.v1.json` and `fixtures/colorized-golden.v1.json`, plus the advisory screenshot baselines of the views they alter; they are regenerated only in Task 7's reviewed commit, which changes the kernels, with oracle evidence for every changed pixel.
- Follow the conventions of the files you touch (comment style, `eslint-disable-next-line … -- reason` for non-null assertions on spills, Prettier with `printWidth: 100`, single quotes, trailing commas).
- Do not commit until the task's last step. Do not push.
- Other plans land on `phase-2/core-atlas` at the same time. Line numbers drift: locate code by the quoted anchor text, never by line number. ADR numbers 0010–0012 are taken; this plan's ADR is `0013`.
- Playwright reuses a server already listening on `127.0.0.1:4174` when not in CI. Before `npx playwright test`, run `ss -ltnp | grep 4174`; if another worktree's preview server is listening, stop and report instead of testing against someone else's build.
- Never weaken the certificate, the margin or the allowance to make a test pass. A refusal is always safe; an acceptance must be proved. If a pinned expectation in this plan fails, stop and report it.

## Review Focus

1. **c within about 1e-12 of a primitive cusp** (a root of (4c + 3)³ + 108). The cubic has a double root at λ = 1 there, so the certificate must fail and the pixel fall through to the orbit path although the cycle attracts (1 − |λ| = 6.3e-5 at 1e-12 from the real cusp). Pinned in Task 3 (`falls through within 1e-12 of the real primitive cusp although the cycle attracts`, and the exact audit's cusp rings down to 1e-16) and Task 7 (row/scalar parity view on the real cusp with span 1e-6).
2. **The satellite roots c = −5/4 and 1/4 ± i/2, and the 6,000,000× view beside −5/4.** There λ = 1 is a simple root: refuse at the root, accept at −5/4 − 1e-9 with |λ| = 1 − 1.6e-8. Pinned in Task 3, Task 5 (dd agreement), Task 7 (golden oracle: all 8,000 pixels of the view's left half) and Task 10 (all 327,680 pixels at the shipping raster).
3. **Period-8 satellites inside the period-4 boxes** (c = −1.369, c = 0.32484 + 0.56386i). Never period 4; the orbit path still finds period 8. Pinned in Task 3, Task 5 and Task 8 (an 80-digit fixture).
4. **Rows of the real-axis band |Im c| ≤ 6.7e-4**, where the airplane window and both period-4 axis windows apply to one row. The row kernel must equal the scalar kernel bit for bit. Pinned in Task 4 (window form against the gate at every edge ± 1 ulp) and Task 7 (views at −1.6 and on the real primitive component; the box-edge row test).
5. **NaN, ±∞, |c| > 4 and conjugate parameters.** Refusal leaves the record untouched; c̄ gives the conjugate multiplier bit for bit. Pinned in Task 3.
6. **The coarse pass (stride > 1, scalar kernel) against the stable pass (stride 1, row kernel).** Both write the identical analytic record. Pinned in Task 7 (`period-four-coarse.test.ts`), plus row/scalar parity over the new views.

## Execution

Subagent-driven (`superpowers:subagent-driven-development`):

- **Implementers:** Haiku where this plan holds the complete code and the work is transcription: Tasks 2, 4, 5, 6, 8, 9 and 12. Sonnet for Tasks 1 (Lean build and lint), 3 (the certificate and the long §12 text), 7 (kernel wiring, goldens, the visual container; split the session after Step 6 if it runs out of room, still **one commit**), 10 and 11 (measurements that need judgement).
- **Per-task reviewers:** Sonnet.
- **Opus reviews** Task 1 (Lean), Task 3 (the certificate and the error budget) and Task 7 (kernel wiring and the answer change), the mathematically delicate ones.
- Task 11 needs a quiet machine (see its steps). Tasks 7 and 10 are deterministic.

## Why the bound is rigorous (summary for reviewers)

The full argument is PERFORMANCE-MATHEMATICS §12 (Task 3, Step 5). In short:

1. **What the spike solved.** The cycle product μ = z₁z₂z₃z₄ of each of the three period-4 cycles is a root of the monic cubic M(μ, c) = μ³ + (c² − 3)μ² − (c⁴ + c³ − c² − 3)μ − G₄(c), and the cycle's multiplier is λ = 16μ. The spike ran Cardano on this cubic, polished each root twice with Newton, kept the smallest |μ|, and accepted with a first-order allowance 64(|M| + 128u·M̄)/|M′| that divided by an unverified |M′| and had no second-order term.
2. **Enclosure.** For a monic cubic, Taylor's formula at μ̃ is exact: M(μ̃ + w) = M(μ̃) + M′(μ̃)w + ½M″(μ̃)w² + w³. With F ≥ |M(μ̃)|, D ≤ |M′(μ̃)|, K ≥ |M″(μ̃)|/2 and F + Kr² + r³ < Dr, Rouché's theorem gives exactly one root in |μ − μ̃| < r. With r = 2h(1 + 2⁻⁴⁰), h = F/D, the computed test h(8K + 16h) < D implies that inequality with a factor of two to spare.
3. **Rounding.** F, D and K are computed from the binary64 coefficients with a monomial-expansion bound: every computed polynomial differs from the exact one by at most ((1 + κ)^N − 1)·Σ|monomials|, κ = √2γ₂ per complex operation (Higham, Lemma 3.5), N = 11 for M and 7 for M′ in the code's evaluation order. The constant E = 2⁻⁴⁷ = 64u covers 31.2u plus the rounding of the bounds themselves; every subtraction in the bounds is arranged to round in the safe direction. The candidate may use any function (Math.cbrt, atan2, cos, sin); nothing relies on its accuracy.
4. **Period.** A root of the period-4 dynatomic factor Φ₄ that returns in two steps has four-step multiplier exactly 1 (Lean, Task 1), so |λ| < 1 forces exact period 4, and Fatou gives uniqueness.
5. **Where it fails.** The discriminant of M vanishes only at c = 0, −2 and the three primitive cusps; at the satellite roots λ = 1 is a simple root. So the certificate degrades only near the three cusps (within about 1e-12) and within the margin plus the allowance of |λ| = 1, where it refuses and the orbit path, unchanged, decides. It is never wrong; it is only less often fast.
6. **Checked three ways during planning:** an exact BigInt audit of every inequality at 19,664 parameters (it becomes a unit test, Task 3); a 50-digit mpmath sweep of 132,152 parameters on a bit-exact binary64 mirror (worst observed error-to-allowance ratio 4.2·10⁻³, no unsound acceptance); and the dd oracle on 51,042 accepted parameters and on every changed golden-raster pixel (ratio at most 4.5·10⁻³).

## Decisions taken in this plan

| Question                     | Decision                                                                                                                                                                                                                                                                            | Why                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Error bound method           | A-posteriori Rouché enclosure (the Kantorovich-type test, with the exact cubic Taylor remainder), from a written binary64 budget; no a-priori cusp exclusion disk                                                                                                                   | Needs no cusp locations or disk radii; it refuses by itself wherever the root is ill-conditioned, and it is a proof for every finite c, not only for the corpus                                                                                                                                                                                    |
| Candidate                    | Cardano plus two Newton steps on each of the three roots, smallest \|μ\|² kept (the spike's solve, reordered); Math.cbrt, atan2, cos, sin allowed                                                                                                                                   | The candidate is untrusted; the certificate uses only +, −, ×, ÷, √. Measured 190 ns per call in Node (the spike measured 300–330 ns for its version)                                                                                                                                                                                              |
| Allowance                    | A = 64h + 2⁻⁵⁰ with h = F/D; accept iff certified and 16\|μ̃\| + A < 1 − attractMargin                                                                                                                                                                                               | §12.4: 64h ≥ twice the enclosure radius 32h(1 + 2⁻⁴⁰), and 2⁻⁵⁰ covers the modulus and sum roundings                                                                                                                                                                                                                                               |
| Input guard                  | Refuse \|c\| > 4 (and NaN, ±∞) before any work                                                                                                                                                                                                                                      | All six components lie in \|c\| < 2.2; the guard bounds every intermediate, so overflow never needs an argument                                                                                                                                                                                                                                    |
| Multiplier reported          | λ̃ = 16μ̃, \|λ̃\| = 16\|μ̃\|                                                                                                                                                                                                                                                            | Within A/2 of the exact root by the certificate; measured within 4.5·10⁻³·A of the dd cycle; the orbit product was up to 3.2·10⁻⁶ off on the golden raster                                                                                                                                                                                         |
| Placement                    | Once per pixel at the first scanning iteration, `max(cycleWarmup, 2)` (24), in both kernels, beside the period-3 call                                                                                                                                                               | Pixels that escape earlier never reach it; the record depends on c alone, so placement changes no bit. Period-3 and period-4 boxes are disjoint, so at most one solve runs                                                                                                                                                                         |
| Gate                         | Four folded boxes (`src/domain/period-four-gate.ts`). Scalar kernel: straight-line `inPeriodFourGate`. Row kernel: two Re c windows per row (the two real-axis boxes share \|Im c\| values) and one spill block and call site shared with period 3, choosing the solve by a ternary | ADR 0010: an inlined gate call in `classifyRow` cost about 10% on the far exterior through TurboFan's inlining budget; the solve itself is far too large to inline. Measured within ±1% (Task 11 re-measures)                                                                                                                                      |
| Evidence flag, code, source  | `'analytic-period-4-component'`, code `6`, evidence source `'analytic'`; inspector "Analytic Period 4 Component" and "Analytic closed form"                                                                                                                                         | Accepted directly under the margin like periods 1–3; `'algebraic'` stays reserved for algebraic candidates handed to the verifier                                                                                                                                                                                                                  |
| Acceptance procedure         | Margin plus the certified allowance, not `verifyCycleInto`; `VERIFIER_REVISION` unchanged; new revision `src-analytic-p4-1.0.0`; `MI-PERF-004`'s parenthetical names it                                                                                                             | There is no cycle point to hand to the verifier; the owner accepted period 3 on these terms and set the condition for period 4 (a rigorous bound), which §12 meets. Open question 1 asks the owner to confirm                                                                                                                                      |
| ADR                          | New ADR 0013; ADR 0010 Decision 7 gets a one-line pointer                                                                                                                                                                                                                           | The method (an enclosure, not a closed form) differs enough that an amendment would bury it                                                                                                                                                                                                                                                        |
| `SEMANTIC_ALGORITHM_VERSION` | 3 → 4                                                                                                                                                                                                                                                                               | The period-3 change bumped it to 3 for the same reason (classification output changed)                                                                                                                                                                                                                                                             |
| Diagnostics                  | Optional fourth argument `certificate?: PeriodFourCertificate`; the kernels never pass it                                                                                                                                                                                           | Tests and the adjudication tool need F, D, K, h and A; a wrapper would be small enough for V8 to inline into `classifyRow`                                                                                                                                                                                                                         |
| Lean                         | Task 1, `proof/IntMProof/PeriodFourMultiplier.lean` (S2), verified to compile against the pinned Mathlib on 2026-10-17 (about 15 s)                                                                                                                                                 | Exact identities and exact period; Rouché, the resultant direction, Fatou and the binary64 budget stay outside Lean                                                                                                                                                                                                                                |
| Adjudication tolerance       | Supported iff the dd cycle has primitive period 4 and \|λ̃ − λ_dd\| ≤ A + 10⁻¹²                                                                                                                                                                                                      | The certificate's own claim is A/2; 10⁻¹² covers dd error. Near the real cusp A reaches 5.6·10⁻⁹ on the golden raster, so a flat 10⁻¹² (period 3) would reject correct pixels                                                                                                                                                                      |
| Deep view                    | Adjudicate the 6,000,000× view at the shipping raster 1024×640 too (the pixel dump gains `--raster` and `--cases`); record its `semantic-comparison.json` only                                                                                                                      | Its 327,680 changed rows make a 30 MB raw file; the golden-raster run keeps the per-pixel record                                                                                                                                                                                                                                                   |
| Screenshot baselines         | Regenerate the three affected baselines per engine (`default-stability`, `period-four-126x-period`, `catalog-overlay`) in the Task 7 commit through the container; leave the pending `selected-marker-evidence` untouched                                                           | `fixtures/README.md` rule 3; measured: exactly these six images differ, and the pending one differed before this change                                                                                                                                                                                                                            |
| Cross-engine bits            | Accepted: the candidate's last bits may differ between JS engines                                                                                                                                                                                                                   | Math.cbrt, atan2, cos, sin are implementation-approximated (both engines use fdlibm-derived code, which the spec does not require). The multiplier then differs in the last bits and, at a knife-edge pixel, the decision may differ; both answers are sound. Today status and period depend only on correctly rounded operations. Open question 2 |

## Measured facts this plan relies on

A full prototype of Tasks 2–9 was run on a scratch copy of `50d048b` on 2026-10-17 (Node v24.19.0, i7-1185G7), and the Lean file of Task 1 was compiled against the repository's `proof/` build. All numbers below are deterministic except the timings.

- Unit suite with the code of Tasks 2–8: 90 files, 817 tests passing (from 84 files and 769 tests); `npm run check` passes; `npx playwright test` passes (113 passed, 1 skipped), including Task 9's test in both engines. The Lean file compiles with 11 axiom guards of the standard set.
- Golden raster (160×100): 12,435 pixels change, all period 4, **0 unsupported**. Unresolved → attracting p4: `mi-easy-default-full` 2, `mi-hard-supplied-126x` 312, `mi-hard-supplied-609x` 84, `mi-hard-supplied-13x` 216, `mi-scale-6mx-basilica-rim` 8,000 (8,614 in all). Multiplier-only (p4 → p4): 30, 1,772, 593, 1,426 (3,821). Worst \|λ̃ − λ_dd\| = 3.5·10⁻¹², largest allowance 5.6·10⁻⁹, worst error/allowance 4.5·10⁻³, worst orbit-product error before 3.2·10⁻⁶. Colorized bytes change only at the 8,614 status changes. Unresolved pixels: default 66 → 64, 126× 498 → 186, 609× 145 → 61, 13× 369 → 153, 6,000,000× 8,000 → 0.
- 6,000,000× view at 1024×640: 327,680 pixels unresolved → attracting p4, 0 unsupported, worst \|λ̃ − λ_dd\| = 1.1·10⁻¹⁴, unresolved after: 0.
- Regenerated kernel golden hashes change for exactly five cases: `mi-easy-default-full` → `b2c71fe71a93839f7d5ccea242f99eb1ef7f5be959360884b170235948ac4215`, `mi-hard-supplied-126x` → `9cac48322be880e6ce47a6ec9ce6f24c87359fe650813612fcea316949955e96`, `mi-hard-supplied-609x` → `c5f0b7e2560ac76d36659779d3b4d9afcd9d5d407f9397328bfc4f3df0b70ead`, `mi-hard-supplied-13x` → `e326e7100ac74fed98b15e9520d16b524f7688eeec3ffdb8667458ed014d5c99`, `mi-scale-6mx-basilica-rim` → `80e288e38eca05ce98e928429fc153edd1d5250eae5e59605842cb47d49802c8`.
- Colorized golden hashes change for exactly seven cases, with unchanged emphasized periods: `mi-easy-default-full/stability` → `bd30ad7f640692877e6a1f83319eca4ca3dc8f7fbdfcd522a41cbbf3a2af8d15`, `/multiplier` → `3877c7143f92c1cc6af28e1b3e37bf199d38895892e6122520b99d04bb834bdd`, `/period` → `ba2a52c71e734cd2f2f658e87b5bd77538cb6a593cf8faa7b7d520ddfe460258`, `/period/isolate-2` → `fa242cedfb98b02286c0675f27e48c05549b1b27d24e493aa31c7444650fb92c`, `mi-hard-supplied-126x/stability` → `751b2f15597f7edbcb6e6595331554d2e818b1b77ab7b446accf81a80836b203`, `/multiplier` → `3e650c1eb88c9dfb82ae7d227c5df033392d8f36ebe01ad916fe2c779f3c9a98`, `/period` → `f7c4049acd383b428c923fde08da7ac687f4fa6035ab637a63e98ad60ac1aed3`.
- Stratified grid (`STRATA`, 3,225 points): 33 points take the period-4 path under every profile; 14/8/8 of them (quick/balanced/detailed) were unresolved before; the legacy period-reduction counts drop from 4/7/9 to 0/0/2 (only period-5 reductions remain); the oracle's budget misses stay at 12. The PoC control sample: 3 period-4 points, no reduction left.
- Gate: 4,782 accepted points on the 1200×1200 global grid, all inside the boxes; none just outside any box edge.
- Exact audit: 19,664 parameters, 19,287 certified, 14,148 accepted, every inequality verified in exact arithmetic.
- Fallback overhead (Node, `taskset -c 3` or `-c 5`, 40 repetitions, 1024×640, load average 1.3–2.1): stable pass `mi-easy-exterior-heavy` −0.34% to +0.21%, `mi-fallback-ambiguous-boundary` −0.88% to −0.04% over four runs; the A/A control arm was quiet in two runs and +18% and +21% on the far exterior in the other two (the bimodal compile ADR 0010 describes, here in the byte-identical control arm; such runs exit 3 and do not count). Coarse pass (stride 8, 4096×2560): +0.50% and −0.74%, control quiet.
- Hard views (stable pass, 1024×640, 15 repetitions, same three-arm tool): time ratio candidate/baseline 0.589 (126×), 0.597 (13×), 0.706 (609×), 0.139 (6,000,000×), 0.966 (default), that is speedups of 1.70×, 1.67×, 1.42×, 7.2× and 1.03×. The spike measured 1.79×, 1.68×, 1.38× and 8.4× (scalar, 256×160, period 3 and 4 together; these views have no period-3 pixels).
- Visual container (`npm run test:visual:container`): with the change, `default-stability`, `period-four-126x-period` and `catalog-overlay` differ in both engines; after regenerating exactly those six images only the pending `selected-marker-evidence` differs, as it does on `50d048b`.

## Open questions for the owner

1. **The acceptance reading and the bar.** Period 4 accepts like periods 1–3, by the verifier's margin plus an allowance and without the cycle verifier, but its allowance is a ball root enclosure whose binary64 bounds are proved on paper (§12.5) and audited exactly at 19,664 parameters in every test run, not machine-checked. Does that meet the "rigorous bound" bar, and may `MI-PERF-004`'s parenthetical name it (Task 12) and ADR 0013 be marked Accepted (Task 7)? If not, the plan stops after Task 6 (nothing user-visible ships before Task 7).
2. **Engine-dependent last bits.** The candidate uses `Math.cbrt`, `Math.atan2`, `Math.cos` and `Math.sin`, which ECMAScript lets engines approximate. Every answer stays sound, but the period-4 multiplier's last bits, and at a knife-edge pixel the accept decision, may differ between Chromium and Firefox, where today status and period depend only on correctly rounded operations. Accept this, or ask for an engine-independent candidate first (a follow-up of about a day: a fixed number of Newton or Durand–Kerner steps in basic operations from fixed starts, re-measured)?

## Out of scope

- The browser release run in both browsers: deferred to the owner's headed session (Task 12 reports it).
- Periods 5 and up, and formalizing Rouché, the resultant direction or the binary64 budget in Lean.
- An engine-independent candidate (open question 2).
- Component outlines and internal-angle labels from the inverse map (spike side finding 3).

## File Structure

| Path                                                                                                   | Responsibility                                                                                                            |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `proof/IntMProof/PeriodFourMultiplier.lean`                                                            | Exact identities: Φ₄, the cycle-product cubic, the four-step derivative, landmarks, exact period of an attracting Φ₄ root |
| `src/domain/types.ts`, `src/domain/period-policy.ts`                                                   | Evidence flag, code 6, evidence-source mapping                                                                            |
| `src/domain/analytic-period-four.ts`                                                                   | The candidate, the Rouché certificate and the acceptance rule (pure)                                                      |
| `src/domain/period-four-gate.ts`                                                                       | Box data and the straight-line gate (speed only)                                                                          |
| `src/domain/orbit-triggered.ts`, `src/render/triggered-rows.ts`                                        | Call sites at the first scanning iteration                                                                                |
| `tests/unit/domain/dd-oracle.ts`                                                                       | `ddPeriodicCycle`, `ddPeriodFourCycle`, the independent adjudicator                                                       |
| `tests/unit/domain/period-four-certificate.test.ts`                                                    | Exact BigInt audit of every certificate inequality                                                                        |
| `tools/kernel_pixel_dump.ts`                                                                           | Per-pixel dump; gains `--raster` and `--cases`                                                                            |
| `tools/adjudicate_period_four.ts`                                                                      | Changed-pixel adjudication and evidence writer                                                                            |
| `tools/benchmark/overhead-entry.ts`, `tools/benchmark/fallback-overhead.ts`                            | The three-arm benchmark; gains `--stride` (coarse pass)                                                                   |
| `tools/generate_orbit_fixtures.py`, `fixtures/orbits.v1.json`                                          | Independent 80-digit references for period-4 points and a period-8 satellite                                              |
| `fixtures/kernel-golden.v1.json`, `fixtures/colorized-golden.v1.json`, `tests/visual/__screenshots__/` | Regenerated goldens and baselines (Task 7 only)                                                                           |
| `docs/PERFORMANCE-MATHEMATICS.md` §12, `docs/decisions/0013-analytic-period-four.md`                   | Derivation, error budget, decision record                                                                                 |
| `evidence/phase-2/<date>-<sha>-period-four-adjudication/`, `…-period-four-overhead/`                   | Recorded evidence                                                                                                         |

---

<!-- prettier-ignore-start -->
<!-- The task bodies quote code with exact indentation for find-and-replace edits; Prettier would re-indent those fragments. -->

### Task 1: Lean identities and exact period for period-4 roots

**Files:**

- Create: `proof/IntMProof/PeriodFourMultiplier.lean`
- Modify: `proof/IntMProof.lean` (one import)
- Modify: `proof/IntMProof/Axioms.lean` (eleven axiom guards after the `period3_not_fixed_of_attracting` guard)
- Modify: `proof/README.md` (one bullet after the S1 bullet)
- Modify: `docs/verification/LEAN-PROOF-DAG.md` (one table row after the S1 row; one sentence)

**Interfaces:**

- Consumes: `IntMProof.quadratic`, `IntMProof.orbit`, `orbit_succ`, `orbit_zero`, `orbit_add` (`Quadratic.lean`); `seedPolynomial`, `seedPolynomial_derivative_eval_prod` (`Derivatives.lean`); both reached through `IntMProof.FastPath` and `IntMProof.PeriodThreeMultiplier`.
- Produces (names cited by Task 3's documentation and ADR 0013): `periodFourFactor`, `periodFourDynatomic`, `periodFourProductPolynomial`, `orbit_four_sub_self`, `periodFourDynatomic_eq_zero`, `period4_seedDerivative`, `period4_product_root`, `period4_product_zero_of_center`, `period4_product_root_satellite`, `periodFourDynatomic_fixedPoint`, `periodFourDynatomic_twoCycle`, `periodFourDynatomic_period_two_multiplier`, `period4_not_period_two_of_attracting`, `period4_not_fixed_of_attracting`.

What is proved here, and what is not: the factorization f⁴(z) − z = (f²(z) − z)·Φ₄; that the cycle product z·f(z)·f²(z)·f³(z) at every root of Φ₄ is a root of the cubic M (the cofactor below was computed with sympy as the exact quotient); that the four-step derivative is sixteen times that product; the centre and satellite-root landmarks; and that a root of Φ₄ returning in two steps has four-step multiplier exactly 1, hence that an attracting Φ₄ root has exact period four. Argued on paper, not in Lean: that every root of M is realized by a cycle (the resultant identity, checked with sympy), Fatou uniqueness, Rouché's theorem as used, and the binary64 budget of §12.5.

- [ ] **Step 1: Write the failing axiom guards**

In `proof/IntMProof/Axioms.lean`, find this block:

```lean
/-- info: 'IntMProof.period3_not_fixed_of_attracting' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.period3_not_fixed_of_attracting
```

Insert immediately after it (one blank line between guards, as the file does):

```lean
/-- info: 'IntMProof.orbit_four_sub_self' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.orbit_four_sub_self

/-- info: 'IntMProof.periodFourDynatomic_eq_zero' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.periodFourDynatomic_eq_zero

/-- info: 'IntMProof.period4_seedDerivative' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.period4_seedDerivative

/-- info: 'IntMProof.period4_product_root' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.period4_product_root

/-- info: 'IntMProof.period4_product_zero_of_center' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.period4_product_zero_of_center

/-- info: 'IntMProof.period4_product_root_satellite' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.period4_product_root_satellite

/-- info: 'IntMProof.periodFourDynatomic_fixedPoint' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.periodFourDynatomic_fixedPoint

/-- info: 'IntMProof.periodFourDynatomic_twoCycle' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.periodFourDynatomic_twoCycle

/-- info: 'IntMProof.periodFourDynatomic_period_two_multiplier' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.periodFourDynatomic_period_two_multiplier

/-- info: 'IntMProof.period4_not_period_two_of_attracting' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.period4_not_period_two_of_attracting

/-- info: 'IntMProof.period4_not_fixed_of_attracting' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.period4_not_fixed_of_attracting
```

- [ ] **Step 2: Run the guard file to verify it fails**

Run: `cd proof && lake env lean IntMProof/Axioms.lean; cd ..`
Expected: errors of the form `unknown constant 'IntMProof.orbit_four_sub_self'`.

- [ ] **Step 3: Write the Lean file**

Create `proof/IntMProof/PeriodFourMultiplier.lean` with exactly this content (checked against the pinned Mathlib on 2026-10-17 with `lake env lean`; every line is under 100 characters; the large `linear_combination` cofactor is the exact quotient of M(z·f·f²·f³) by Φ₄ and takes a few seconds):

```lean
import IntMProof.FastPath
import IntMProof.PeriodThreeMultiplier

/-!
# Exact period-four multiplier identities (H4)

Exact identities behind the analytic period-four fast path
(`src/domain/analytic-period-four.ts`). The period-four dynatomic factor
`Φ₄(z, c)` is the fourth return minus the identity with the period-two
factor divided out. At every root of `Φ₄` the cycle product
`z · f(z) · f²(z) · f³(z)` is a root of the monic cubic
`μ³ + (c² − 3)μ² − (c⁴ + c³ − c² − 3)μ − G₄(c)`, and the four-step multiplier
is sixteen times that product. A root of `Φ₄` that has period one or two has
four-step multiplier exactly `1`, so a root whose four-step multiplier has
modulus below `1` has exact period four.

None of this certifies the binary64 cubic solve, its root-error certificate,
or the attraction margin. That every root of the cubic is realized by a
period-four cycle (the resultant identity) is not proved here.
-/

namespace IntMProof

open Function Polynomial Complex

/-- The period-four Gleason factor `G₄(c)`, whose six roots are the centres of
the period-four hyperbolic components. -/
def periodFourFactor (c : ℂ) : ℂ :=
  c ^ 6 + 3 * c ^ 5 + 3 * c ^ 4 + 3 * c ^ 3 + 2 * c ^ 2 + 1

/-- The period-four dynatomic factor `Φ₄(z, c)`. -/
def periodFourDynatomic (c z : ℂ) : ℂ :=
  z ^ 12 + 6 * c * z ^ 10 + z ^ 9 + (15 * c ^ 2 + 3 * c) * z ^ 8 + 4 * c * z ^ 7 +
    (20 * c ^ 3 + 12 * c ^ 2 + 1) * z ^ 6 + (6 * c ^ 2 + 2 * c) * z ^ 5 +
    (15 * c ^ 4 + 18 * c ^ 3 + 3 * c ^ 2 + 4 * c) * z ^ 4 + (4 * c ^ 3 + 4 * c ^ 2 + 1) * z ^ 3 +
    (6 * c ^ 5 + 12 * c ^ 4 + 6 * c ^ 3 + 5 * c ^ 2 + c) * z ^ 2 +
    (c ^ 4 + 2 * c ^ 3 + c ^ 2 + 2 * c) * z + periodFourFactor c

/-- The cycle-product cubic `M₄(μ, c)`; the four-step multiplier is `16 μ`. -/
def periodFourProductPolynomial (c m : ℂ) : ℂ :=
  m ^ 3 + (c ^ 2 - 3) * m ^ 2 - (c ^ 4 + c ^ 3 - c ^ 2 - 3) * m - periodFourFactor c

/-- Exact identity: the fourth return minus the identity factors through the
second return and `Φ₄`. -/
theorem orbit_four_sub_self (c z : ℂ) :
    orbit c 4 z - z = (orbit c 2 z - z) * periodFourDynatomic c z := by
  simp only [orbit_succ, orbit_zero, quadratic, periodFourDynatomic, periodFourFactor]
  ring

/-- A four-step return that is not a two-step return is a root of `Φ₄`. -/
theorem periodFourDynatomic_eq_zero {c z : ℂ} (hclose : orbit c 4 z = z)
    (htwo : orbit c 2 z ≠ z) : periodFourDynatomic c z = 0 := by
  have h := orbit_four_sub_self c z
  rw [hclose, sub_self] at h
  exact (mul_eq_zero.mp h.symm).resolve_left (sub_ne_zero.mpr htwo)

/-- Exact identity: the four-step seed derivative is `16 z₀ z₁ z₂ z₃`. -/
theorem period4_seedDerivative (c z : ℂ) :
    (derivative (seedPolynomial c 4)).eval z =
      16 * (z * orbit c 1 z * orbit c 2 z * orbit c 3 z) := by
  rw [seedPolynomial_derivative_eval_prod]
  simp only [Finset.prod_range_succ, Finset.prod_range_zero, orbit_zero]
  ring

/-- Exact identity: at every root of `Φ₄` the cycle product is a root of `M₄`. -/
theorem period4_product_root {c z : ℂ} (hΦ : periodFourDynatomic c z = 0) :
    periodFourProductPolynomial c (z * orbit c 1 z * orbit c 2 z * orbit c 3 z) = 0 := by
  unfold periodFourDynatomic periodFourFactor at hΦ
  simp only [orbit_succ, orbit_zero, quadratic, periodFourProductPolynomial, periodFourFactor]
  linear_combination
    (
      15 * c * z ^ 31 - 13 * c * z ^ 28 + z ^ 33 - z ^ 30 + z ^ 29 * (105 * c ^ 2 + 6 * c)
      + z ^ 27 * (455 * c ^ 3 + 78 * c ^ 2) + z ^ 26 * (-78 * c ^ 2 - 5 * c)
      + z ^ 25 * (1365 * c ^ 4 + 468 * c ^ 3 + 15 * c ^ 2 + c) + z ^ 24 * (-286 * c ^ 3
      - 55 * c ^ 2) + z ^ 23 * (3003 * c ^ 5 + 1716 * c ^ 4 + 165 * c ^ 3 + 11 * c ^ 2)
      + z ^ 22 * (-715 * c ^ 4 - 275 * c ^ 3 - 10 * c ^ 2 - c) + z ^ 21 * (5005 * c ^ 6
      + 4290 * c ^ 5 + 825 * c ^ 4 + 75 * c ^ 3 + 4 * c ^ 2) + z ^ 20 * (-1287 * c ^ 5
      - 825 * c ^ 4 - 90 * c ^ 3 - 9 * c ^ 2) + z ^ 19 * (6435 * c ^ 7 + 7722 * c ^ 6
      + 2475 * c ^ 5 + 345 * c ^ 4 + 36 * c ^ 3) + z ^ 18 * (-1716 * c ^ 6 - 1650 * c ^ 5
      - 360 * c ^ 4 - 46 * c ^ 3 - 2 * c ^ 2 - 2) + z ^ 17 * (6435 * c ^ 8 + 10296 * c ^ 7
      + 4950 * c ^ 6 + 1050 * c ^ 5 + 159 * c ^ 4 + 6 * c ^ 3 - c) + z ^ 16 * (-1716 * c ^ 7
      - 2310 * c ^ 6 - 840 * c ^ 5 - 154 * c ^ 4 - 13 * c ^ 3 - 17 * c) + z ^ 15 * (5005 * c ^ 9
      + 10296 * c ^ 8 + 6930 * c ^ 7 + 2142 * c ^ 6 + 441 * c ^ 5 + 42 * c ^ 4 - 8 * c ^ 2 + 2)
      + z ^ 14 * (-1287 * c ^ 8 - 2310 * c ^ 7 - 1260 * c ^ 6 - 336 * c ^ 5 - 40 * c ^ 4
      - 63 * c ^ 2 - 6 * c) + z ^ 13 * (3003 * c ^ 10 + 7722 * c ^ 9 + 6930 * c ^ 8 + 2982 * c ^ 7
      + 819 * c ^ 6 + 132 * c ^ 5 + 4 * c ^ 4 - 27 * c ^ 3 - 2 * c ^ 2 + 13 * c)
      + z ^ 12 * (-715 * c ^ 9 - 1650 * c ^ 8 - 1260 * c ^ 7 - 476 * c ^ 6 - 74 * c ^ 5 + 3 * c ^ 4
      - 133 * c ^ 3 - 39 * c ^ 2) + z ^ 11 * (1365 * c ^ 11 + 4290 * c ^ 10 + 4950 * c ^ 9
      + 2850 * c ^ 8 + 1029 * c ^ 7 + 240 * c ^ 6 + 20 * c ^ 5 - 50 * c ^ 4 - 12 * c ^ 3
      + 35 * c ^ 2 + 5 * c) + z ^ 10 * (-286 * c ^ 10 - 825 * c ^ 9 - 840 * c ^ 8 - 434 * c ^ 7
      - 85 * c ^ 6 + 14 * c ^ 5 - 173 * c ^ 4 - 105 * c ^ 3 - 7 * c ^ 2 - c)
      + z ^ 9 * (455 * c ^ 12 + 1716 * c ^ 11 + 2475 * c ^ 10 + 1845 * c ^ 9 + 861 * c ^ 8
      + 270 * c ^ 7 + 41 * c ^ 6 - 54 * c ^ 5 - 28 * c ^ 4 + 49 * c ^ 3 + 22 * c ^ 2)
      + z ^ 8 * (-78 * c ^ 11 - 275 * c ^ 10 - 360 * c ^ 9 - 246 * c ^ 8 - 57 * c ^ 7 + 27 * c ^ 6
      - 138 * c ^ 5 - 150 * c ^ 4 - 30 * c ^ 3 - 3 * c ^ 2) + z ^ 7 * (105 * c ^ 13 + 468 * c ^ 12
      + 825 * c ^ 11 + 775 * c ^ 10 + 459 * c ^ 9 + 186 * c ^ 8 + 43 * c ^ 7 - 33 * c ^ 6
      - 32 * c ^ 5 + 36 * c ^ 4 + 36 * c ^ 3 + 3 * c ^ 2 + c) + z ^ 6 * (-13 * c ^ 12 - 55 * c ^ 11
      - 90 * c ^ 10 - 79 * c ^ 9 - 18 * c ^ 8 + 27 * c ^ 7 - 62 * c ^ 6 - 119 * c ^ 5 - 48 * c ^ 4
      - 6 * c ^ 3 - c ^ 2) + z ^ 5 * (15 * c ^ 14 + 78 * c ^ 13 + 165 * c ^ 12 + 191 * c ^ 11
      + 141 * c ^ 10 + 72 * c ^ 9 + 23 * c ^ 8 - 10 * c ^ 7 - 18 * c ^ 6 + 12 * c ^ 5 + 26 * c ^ 4
      + 6 * c ^ 3 + c ^ 2) + z ^ 4 * (-c ^ 13 - 5 * c ^ 12 - 10 * c ^ 11 - 11 * c ^ 10 + 14 * c ^ 8
      - 12 * c ^ 7 - 49 * c ^ 6 - 34 * c ^ 5 - 7 * c ^ 4 - c ^ 3) + z ^ 3 * (c ^ 15 + 6 * c ^ 14
      + 15 * c ^ 13 + 21 * c ^ 12 + 19 * c ^ 11 + 12 * c ^ 10 + 5 * c ^ 9 - c ^ 8 - 4 * c ^ 7
      + c ^ 6 + 7 * c ^ 5 + 2 * c ^ 4 - c ^ 3 + c ^ 2 + 1) + z ^ 2 * (c ^ 10 + 3 * c ^ 9
      - 8 * c ^ 7 - 9 * c ^ 6 - 3 * c ^ 5 + c ^ 2 + c) + z * (-c ^ 5 - c ^ 4 + c ^ 3 + c ^ 2
      + 2 * c) - 1) * hΦ

/-- Superattracting identity: at a period-four centre (a root of
`periodFourFactor`) `0` is a root of `M₄`. -/
theorem period4_product_zero_of_center {c : ℂ} (hc : periodFourFactor c = 0) :
    periodFourProductPolynomial c 0 = 0 := by
  simp [periodFourProductPolynomial, hc]

/-- The root of the period-two bulb's `1/2` satellite, `c = −5/4`: the four-step
multiplier `1` (product `1/16`) is a root of `M₄`. -/
theorem period4_product_root_satellite :
    periodFourProductPolynomial (-5 / 4) (1 / 16) = 0 := by
  unfold periodFourProductPolynomial periodFourFactor
  norm_num

/-- A fixed point that is also a root of `Φ₄` has `(2z)² + 1 = 0`: its
fixed-point multiplier is `±i`. -/
theorem periodFourDynatomic_fixedPoint {c z : ℂ} (hfix : quadratic c z = z)
    (hΦ : periodFourDynatomic c z = 0) : (2 * z) ^ 2 + 1 = 0 := by
  unfold quadratic at hfix
  unfold periodFourDynatomic periodFourFactor at hΦ
  linear_combination hΦ -
    (
      c ^ 5 + 5 * c ^ 4 * z ^ 2 + c ^ 4 * z + 3 * c ^ 4 + 10 * c ^ 3 * z ^ 4 + 4 * c ^ 3 * z ^ 3
      + 10 * c ^ 3 * z ^ 2 + 4 * c ^ 3 * z + 3 * c ^ 3 + 10 * c ^ 2 * z ^ 6 + 6 * c ^ 2 * z ^ 5
      + 12 * c ^ 2 * z ^ 4 + 10 * c ^ 2 * z ^ 3 + 7 * c ^ 2 * z ^ 2 + 5 * c ^ 2 * z + 3 * c ^ 2
      + 5 * c * z ^ 8 + 4 * c * z ^ 7 + 6 * c * z ^ 6 + 8 * c * z ^ 5 + 6 * c * z ^ 4
      + 6 * c * z ^ 3 + 7 * c * z ^ 2 + 4 * c * z + 2 * c + z ^ 10 + z ^ 9 + z ^ 8 + 2 * z ^ 7
      + 2 * z ^ 6 + 2 * z ^ 5 + 3 * z ^ 4 + 3 * z ^ 3 + 3 * z ^ 2 + 4 * z) * hfix

/-- A root of the period-two factor that is also a root of `Φ₄` has
`4c + 5 = 0`: its two-step multiplier `4(c + 1)` is `−1`. -/
theorem periodFourDynatomic_twoCycle {c z : ℂ} (htwo : z * z + z + (c + 1) = 0)
    (hΦ : periodFourDynatomic c z = 0) : 4 * c + 5 = 0 := by
  unfold periodFourDynatomic periodFourFactor at hΦ
  linear_combination hΦ -
    (
      c ^ 5 + 5 * c ^ 4 * z ^ 2 - c ^ 4 * z + 2 * c ^ 4 + 10 * c ^ 3 * z ^ 4 - 4 * c ^ 3 * z ^ 3
      + 6 * c ^ 3 * z ^ 2 + c ^ 3 + 10 * c ^ 2 * z ^ 6 - 6 * c ^ 2 * z ^ 5 + 6 * c ^ 2 * z ^ 4
      + 2 * c ^ 2 * z ^ 3 - c ^ 2 * z ^ 2 + c ^ 2 * z + 2 * c ^ 2 + 5 * c * z ^ 8 - 4 * c * z ^ 7
      + 2 * c * z ^ 6 + 4 * c * z ^ 5 - 4 * c * z ^ 4 + 2 * c * z ^ 3 + 3 * c * z ^ 2 - 2 * c * z
      + z ^ 10 - z ^ 9 + 2 * z ^ 7 - 2 * z ^ 6 + 3 * z ^ 4 - 3 * z ^ 3 + 4 * z - 4) * htwo

/-- A root of `Φ₄` that returns in two steps has four-step multiplier exactly `1`. -/
theorem periodFourDynatomic_period_two_multiplier {c z : ℂ} (hclose : orbit c 2 z = z)
    (hΦ : periodFourDynatomic c z = 0) :
    (derivative (seedPolynomial c 4)).eval z = 1 := by
  have h1 : orbit c 1 z = z * z + c := by simp [orbit_succ, quadratic]
  have h3 : orbit c 3 z = orbit c 1 z := by
    rw [show (3 : ℕ) = 2 + 1 from rfl, orbit_add, hclose]
  rw [period4_seedDerivative, h3, hclose, h1]
  by_cases hfix : quadratic c z = z
  · have h := periodFourDynatomic_fixedPoint hfix hΦ
    unfold quadratic at hfix
    rw [hfix]
    linear_combination ((2 * z) ^ 2 - 1) * h
  · have hclose' := hclose
    simp only [orbit_succ, orbit_zero, quadratic] at hclose'
    have hfactor : (z * z + c - z) * (z * z + z + (c + 1)) = 0 := by
      linear_combination hclose'
    have htwo : z * z + z + (c + 1) = 0 :=
      (mul_eq_zero.mp hfactor).resolve_left (sub_ne_zero.mpr (by simpa [quadratic] using hfix))
    have h5 := periodFourDynatomic_twoCycle htwo hΦ
    linear_combination
      (16 * (z - 1) * (2 * (c + 1) + (z - 1) * (z * z + z + (c + 1)))) * htwo +
        (4 * c + 3) * h5

/-- A root of `Φ₄` whose four-step multiplier has modulus below `1` does not
return in two steps (nor, therefore, in one): it has exact period four. -/
theorem period4_not_period_two_of_attracting {c z : ℂ} (hΦ : periodFourDynatomic c z = 0)
    (hatt : ‖(derivative (seedPolynomial c 4)).eval z‖ < 1) : orbit c 2 z ≠ z := by
  intro hclose
  rw [periodFourDynatomic_period_two_multiplier hclose hΦ, norm_one] at hatt
  exact lt_irrefl _ hatt

/-- In particular such a root is not a fixed point. -/
theorem period4_not_fixed_of_attracting {c z : ℂ} (hΦ : periodFourDynatomic c z = 0)
    (hatt : ‖(derivative (seedPolynomial c 4)).eval z‖ < 1) : quadratic c z ≠ z := by
  intro hfix
  apply period4_not_period_two_of_attracting hΦ hatt
  simp only [orbit_succ, orbit_zero, hfix]

end IntMProof
```

In `proof/IntMProof.lean`, find the line `import IntMProof.PeriodThreeMultiplier` and add directly below it:

```lean
import IntMProof.PeriodFourMultiplier
```

- [ ] **Step 4: Build, check the guards, lint**

Run:

```bash
cd proof && lake build && lake env lean IntMProof/Axioms.lean && lake lint && lake exe lint-style; cd ..
```

Expected: `Build completed successfully`; the guard file prints nothing; `lake lint` reports no linter errors; `lint-style` prints at most `warning: nolints file could not be read; treating as empty: scripts/nolints-style.txt` and no style errors. If `period4_product_root` hits the heartbeat limit on a slower machine, add `set_option maxHeartbeats 1000000 in` on the line directly above `theorem period4_product_root` and report that you did.

- [ ] **Step 5: Document the new node**

In `proof/README.md`, find the bullet that begins `- **S1 period-three multipliers:**` and add this bullet directly after it:

```markdown
- **S2 period-four multipliers:** The fourth return minus the identity factors as `(f²(z)−z)·Φ₄(z,c)`. At every root `z` of `Φ₄` the cycle product `μ=z·f(z)·f²(z)·f³(z)` is a root of `μ³+(c²−3)μ²−(c⁴+c³−c²−3)μ−G₄(c)`, and the four-step multiplier is `16μ`. A root of `Φ₄` that returns in two steps has four-step multiplier exactly `1` (a fixed point has `(2z)²=−1`, a two-cycle point has `4c+5=0`), so a `Φ₄` root whose four-step multiplier has modulus below one has exact period four (`period4_not_period_two_of_attracting`). A period-four centre gives the root `0`, and `c=−5/4` gives the root `1/16`. The realization of each root by a cycle (a resultant identity), Fatou uniqueness, Rouché's theorem as used, and the binary64 certificate of `src/domain/analytic-period-four.ts` are not formalized.
```

In `docs/verification/LEAN-PROOF-DAG.md`, find the table row that begins `| S1 Period-three multipliers` and add this row directly after it:

```markdown
| S2 Period-four multipliers  | S1, E1                  | `orbit_four_sub_self` factors f⁴(z)−z through f²(z)−z and the dynatomic factor Φ₄; `period4_product_root` shows the cycle product z·f(z)·f²(z)·f³(z) at every root of Φ₄ is a root of μ³+(c²−3)μ²−(c⁴+c³−c²−3)μ−G₄(c), and `period4_seedDerivative` makes the four-step multiplier 16μ; `periodFourDynatomic_period_two_multiplier` shows a root of Φ₄ that returns in two steps has four-step multiplier exactly 1, and `period4_not_period_two_of_attracting` concludes that a Φ₄ root with \|λ\|<1 has exact period four. The resultant identity, Fatou uniqueness, Rouché's theorem and the binary64 certificate of the production path ([ADR 0013](../decisions/0013-analytic-period-four.md)) are not formalized. |
```

In the same file, replace the sentence `The period-one, period-two and period-three (S1, ADR 0010) analytic fast paths are the current closed-form cases;` with `The period-one, period-two, period-three (S1, ADR 0010) and period-four (S2, ADR 0013) analytic fast paths are the current closed-form cases;` (if the sentence is not found verbatim, search for `analytic fast paths are the current closed-form cases` and edit that sentence the same way).

ADR 0013 is created in Task 7; until then the link in the DAG row is dangling, which no check in `npm run check` follows.

- [ ] **Step 6: Format and run the repository gates**

Run:

```bash
npx prettier --write proof/README.md docs/verification/LEAN-PROOF-DAG.md
npx prettier --write proof/README.md docs/verification/LEAN-PROOF-DAG.md
npx prettier --check proof/README.md docs/verification/LEAN-PROOF-DAG.md
npm run check
```

Expected: Prettier reports both files formatted; `npm run check` ends with the Vite build summary and exit code 0.

- [ ] **Step 7: Commit**

```bash
git add proof/IntMProof/PeriodFourMultiplier.lean proof/IntMProof.lean proof/IntMProof/Axioms.lean proof/README.md docs/verification/LEAN-PROOF-DAG.md
git commit -m "$(cat <<'EOF'
Lean: period-four cycle-product cubic and exact period of attracting roots (S2)

Phi_4 factorization, the cycle-product cubic at every Phi_4 root, the
four-step derivative 16 mu, centre and satellite landmarks, and the
two-step return case with four-step multiplier 1.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Evidence flag, code and source for the analytic period-4 path

**Files:**

- Modify: `src/domain/types.ts` (`EvidenceFlag`, `ORBIT_EVIDENCE_CODE`, `EVIDENCE_BY_CODE`)
- Modify: `src/domain/period-policy.ts` (`evidenceSourceForFlag` and its doc comment)
- Modify: `src/ui/application.ts` (one doc comment)
- Test: `tests/unit/domain/period-policy.test.ts`, `tests/unit/ui/view-state.test.ts`, `tests/unit/domain/orbit-scalar-parity.test.ts`

**Interfaces:**

- Produces: `EvidenceFlag` gains `'analytic-period-4-component'`; `ORBIT_EVIDENCE_CODE.analyticPeriod4Component === 6`; `EVIDENCE_BY_CODE[6] === 'analytic-period-4-component'`; `evidenceSourceForFlag('analytic-period-4-component') === 'analytic'`. The inspector's existing `formatEvidence` turns the flag into `Analytic Period 4 Component` with no code change.

- [ ] **Step 1: Write the failing tests**

In `tests/unit/domain/period-policy.test.ts`, inside `it('maps evidence flags to sources per the documented mapping', …)`, after the line `expect(evidenceSourceForFlag('analytic-period-3-component')).toBe('analytic');` add:

```ts
    expect(evidenceSourceForFlag('analytic-period-4-component')).toBe('analytic');
```

In the same file, inside `it('stamps the evidence source at the rich result boundary only for attracting results', …)`, find:

```ts
    expect(materializeOrbitResult(periodThree)).toMatchObject({
      evidence: ['analytic-period-3-component'],
      evidenceSource: 'analytic',
    });
```

and add directly after it:

```ts

    const periodFour = createOrbitSample();
    periodFour.status = 2;
    periodFour.evidence = ORBIT_EVIDENCE_CODE.analyticPeriod4Component;
    periodFour.period = 4;
    expect(materializeOrbitResult(periodFour)).toMatchObject({
      evidence: ['analytic-period-4-component'],
      evidenceSource: 'analytic',
    });
```

In the same file, inside `it('classifies every current attracting path with a source the vocabulary covers', …)`, in the array that starts `for (const flag of [`, add `'analytic-period-4-component',` after `'analytic-period-3-component',`.

In `tests/unit/ui/view-state.test.ts`, inside `it('keeps the analytic evidence source reserved for the closed-form paths', …)`, after `expect(evidenceSourceForFlag('analytic-period-3-component')).toBe('analytic');` add:

```ts
    expect(evidenceSourceForFlag('analytic-period-4-component')).toBe('analytic');
```

In `tests/unit/domain/orbit-scalar-parity.test.ts`, inside `it('maps primitive evidence codes to the legacy evidence strings', …)`, after the line `[ORBIT_EVIDENCE_CODE.analyticPeriod3Component, ['analytic-period-3-component']],` add:

```ts
      [ORBIT_EVIDENCE_CODE.analyticPeriod4Component, ['analytic-period-4-component']],
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/domain/period-policy.test.ts tests/unit/ui/view-state.test.ts tests/unit/domain/orbit-scalar-parity.test.ts`
Expected: FAIL in all three files (`expected 'fallback' to be 'analytic'`; the code mapping returns `['iteration-limit']` for an unknown code; TypeScript-level errors are not reported by Vitest, so the failures are runtime ones).

- [ ] **Step 3: Implement**

In `src/domain/types.ts` make three edits.

Replace:

```ts
  | 'iteration-limit'
  | 'analytic-period-3-component';
```

with:

```ts
  | 'iteration-limit'
  | 'analytic-period-3-component'
  | 'analytic-period-4-component';
```

Replace:

```ts
  analyticPeriod3Component: 5,
} as const);
```

with:

```ts
  analyticPeriod3Component: 5,
  analyticPeriod4Component: 6,
} as const);
```

Replace:

```ts
  'analytic-period-3-component',
]);
```

with:

```ts
  'analytic-period-3-component',
  'analytic-period-4-component',
]);
```

In `src/domain/period-policy.ts` make three edits.

Replace:

```ts
 * - 'analytic'  — the closed-form main-cardioid, period-2-bulb and period-3
 *   fast paths (evidence flags 'analytic-main-cardioid',
 *   'analytic-period-2-bulb', 'analytic-period-3-component'). Bucket 1–2 in
 *   the plan's operational table ("closed-form tests"); period 3 joins it by
 *   ADR 0010, although the plan's table lists periods 3–4 under the common
 *   verifier.
```

with:

```ts
 * - 'analytic'  — the closed-form main-cardioid, period-2-bulb and period-3
 *   fast paths and the certified period-4 cubic solve (evidence flags
 *   'analytic-main-cardioid', 'analytic-period-2-bulb',
 *   'analytic-period-3-component', 'analytic-period-4-component'). Bucket
 *   1–2 in the plan's operational table ("closed-form tests"); periods 3 and
 *   4 join it by ADR 0010 and ADR 0013, although the plan's table lists
 *   periods 3–4 under the common verifier.
```

Replace:

```ts
 * rich result boundary. Total over EvidenceFlag: the three closed-form flags
```

with:

```ts
 * rich result boundary. Total over EvidenceFlag: the four analytic flags
```

Replace:

```ts
  flag === 'analytic-period-3-component'
    ? 'analytic'
    : 'fallback';
```

with:

```ts
  flag === 'analytic-period-3-component' ||
  flag === 'analytic-period-4-component'
    ? 'analytic'
    : 'fallback';
```

In `src/ui/application.ts`, in the doc comment above `const EVIDENCE_SOURCE_LABELS`, replace:

```ts
 * acceptances go through the common verifier and the closed forms (periods
 * 1-3) accept by its attraction margin; neither is a weaker claim.
```

with:

```ts
 * acceptances go through the common verifier and the analytic paths (the
 * closed forms of periods 1-3 and the certified period-4 solve) accept by its
 * attraction margin; neither is a weaker claim.
```

(If that comment's wording differs, find the sentence that mentions `periods` and `attraction margin` in that comment and extend it the same way.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/domain/period-policy.test.ts tests/unit/ui/view-state.test.ts tests/unit/domain/orbit-scalar-parity.test.ts`
Expected: PASS.

- [ ] **Step 5: Repository gates**

Run: `npm run check && npx playwright test`
Expected: both pass. No pixel changes (nothing emits code 6 yet), so no golden moves.

- [ ] **Step 6: Commit**

```bash
git add src/domain/types.ts src/domain/period-policy.ts src/ui/application.ts tests/unit/domain/period-policy.test.ts tests/unit/ui/view-state.test.ts tests/unit/domain/orbit-scalar-parity.test.ts
git commit -m "$(cat <<'EOF'
Domain: evidence flag and analytic source for period 4 (ADR 0013)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: The certified period-4 cubic solve, its error budget and its documentation

**Files:**

- Create: `src/domain/analytic-period-four.ts`
- Modify: `src/domain/index.ts` (exports)
- Test: `tests/unit/domain/analytic-period-four.test.ts`, `tests/unit/domain/period-four-certificate.test.ts`
- Modify: `docs/PERFORMANCE-MATHEMATICS.md` (new §12; one row in the §3 revision table)

**Interfaces:**

- Consumes: `VERIFIER_THRESHOLDS.attractMargin` (`src/domain/verifier.ts`); `ORBIT_EVIDENCE_CODE.analyticPeriod4Component` (Task 2); `PeriodThreeTarget` (`src/domain/analytic-period-three.ts`); Lean theorem names (Task 1, documentation only).
- Produces:
  - `classifyPeriodFourInto(cRe: number, cIm: number, out: PeriodFourTarget, certificate?: PeriodFourCertificate): boolean` — writes `status 2, iterations 0, evidence 6, period 4, multiplierRe/Im/Magnitude/Angle` on acceptance; leaves `out` untouched on refusal; fills `certificate` (when given) on every call that passes the `|c| ≤ 4` guard.
  - `type PeriodFourTarget = PeriodThreeTarget` (`OrbitSample` satisfies it).
  - `interface PeriodFourCertificate { productRe; productIm; residualBound; derivativeBound; curvatureBound; radiusRatio; allowance: number; certified: boolean }`.
  - `PERIOD_FOUR_EVALUATION_BOUND = 2 ** -47`, `PERIOD_FOUR_ANALYTIC_REVISION = 'src-analytic-p4-1.0.0'`.

The expected values in the tests are mpmath values (50 digits) of the smallest root of the exact cubic at the binary64 parameter shown, computed during planning; the boundary points come from the inverse map (the sextic in c for a given λ) continued from the cardioid satellite's centre. The exact audit needs no expected values: it checks every inequality of the certificate in BigInt arithmetic.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/domain/analytic-period-four.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  classifyOrbit,
  classifyPeriodFourInto,
  createOrbitSample,
  ORBIT_EVIDENCE_CODE,
  PERIOD_FOUR_ANALYTIC_REVISION,
  PERIOD_FOUR_EVALUATION_BOUND,
  type OrbitSample,
  type PeriodFourCertificate,
} from '../../../src/domain';

/**
 * Analytic period-4 fast path (ADR 0013). Expected multipliers are mpmath
 * values (50 digits) of the smallest root of the exact cubic at the binary64
 * parameter shown, computed for
 * docs/superpowers/plans/2026-10-17-analytic-period-four.md; the boundary
 * points come from the inverse map lambda = r e^{i}, continued from the
 * cardioid satellite's centre.
 */

const SENTINEL = -7;

const sentinelSample = (): OrbitSample => ({
  ...createOrbitSample(),
  status: 0,
  period: SENTINEL,
  multiplierMagnitude: SENTINEL,
});

const emptyCertificate = (): PeriodFourCertificate => ({
  productRe: Number.NaN,
  productIm: Number.NaN,
  residualBound: Number.NaN,
  derivativeBound: Number.NaN,
  curvatureBound: Number.NaN,
  radiusRatio: Number.NaN,
  allowance: Number.NaN,
  certified: false,
});

const accept = (re: number, im: number): OrbitSample => {
  const sample = sentinelSample();
  expect(classifyPeriodFourInto(re, im, sample)).toBe(true);
  expect(sample.status).toBe(2);
  expect(sample.period).toBe(4);
  expect(sample.iterations).toBe(0);
  expect(sample.evidence).toBe(ORBIT_EVIDENCE_CODE.analyticPeriod4Component);
  return sample;
};

const refuse = (re: number, im: number): PeriodFourCertificate => {
  const sample = sentinelSample();
  const certificate = emptyCertificate();
  expect(classifyPeriodFourInto(re, im, sample, certificate)).toBe(false);
  // A refusal leaves the record untouched.
  expect(sample.period).toBe(SENTINEL);
  expect(sample.multiplierMagnitude).toBe(SENTINEL);
  return certificate;
};

describe('classifyPeriodFourInto', () => {
  it('accepts the six superattracting centres (roots of G4)', () => {
    for (const [re, im] of [
      [-1.9407998065294847, 0],
      [-1.3107026413368328, 0],
      [0.2822713907669139, 0.5300606175785253],
      [0.2822713907669139, -0.5300606175785253],
      [-0.15652016683375505, 1.0322471089228318],
      [-0.15652016683375505, -1.0322471089228318],
    ] as const) {
      expect(accept(re, im).multiplierMagnitude).toBeLessThan(1e-11);
    }
    // |lambda| = 0 exactly gives arg lambda = 0 (superattracting identity).
    const satellite = accept(0.2822713907669139, 0.5300606175785253);
    expect(satellite.multiplierMagnitude).toBe(0);
    expect(satellite.multiplierAngle).toBe(0);
  });

  it('refuses the two satellite roots, where lambda = 1 is a simple root', () => {
    expect(refuse(-1.25, 0).certified).toBe(true);
    expect(refuse(0.25, 0.5).certified).toBe(true);
  });

  it('resolves the 6,000,000x view: inside the 1/2 satellite of the period-2 bulb', () => {
    // c = -5/4 - delta: lambda = 1 - 16 delta + O(delta^2), real.
    expect(Math.abs(accept(-1.250000001, 0).multiplierMagnitude - 0.9999999839999987)).toBeLessThan(
      1e-11,
    );
    expect(Math.abs(accept(-1.2500001, 0).multiplierMagnitude - 0.9999983999999223)).toBeLessThan(
      1e-11,
    );
    // c = -5/4 + delta lies in the period-2 bulb: the 4-cycle repels.
    refuse(-1.249999999, 0);
    refuse(-1.2499999, 0);
  });

  it('falls through within 1e-12 of the real primitive cusp although the cycle attracts', () => {
    // The cusp -1.9405507889761495 (a root of (4c + 3)^3 + 108): the cubic has
    // a double root at lambda = 1, so |M'| -> 0 and the certificate fails.
    const cusp = -1.9405507889761495;
    // 1e-10 inside: |lambda| = 0.99936903026224, allowance 1.3e-6.
    expect(Math.abs(accept(cusp - 1e-10, 0).multiplierMagnitude - 0.9993690302622427)).toBeLessThan(
      2e-6,
    );
    // 1e-12 inside: |lambda| = 0.99993690302937 (attracting) but no certificate.
    expect(refuse(cusp - 1e-12, 0).certified).toBe(false);
    expect(refuse(cusp - 1e-14, 0).certified).toBe(false);
    // Outside the component: the attracting candidate is missing (|lambda| > 1).
    refuse(cusp + 1e-6, 0);
  });

  it('accepts down to the margin near the cardioid satellite boundary and refuses inside it', () => {
    // |lambda| = 1 - 1e-3, 1 - 1e-9 and 1 - 1e-11 at arg lambda = 1.
    const far = accept(0.28932280353135603, 0.48787017199586313);
    expect(Math.abs(far.multiplierMagnitude - 0.9990000000000003)).toBeLessThan(1e-12);
    expect(Math.abs(far.multiplierAngle - 1)).toBeLessThan(1e-12);
    const near = accept(0.2893305340939819, 0.48782915322182385);
    expect(Math.abs(near.multiplierMagnitude - 0.9999999989999996)).toBeLessThan(1e-12);
    const nearer = accept(0.28933053410163573, 0.4878291531812164);
    expect(Math.abs(nearer.multiplierMagnitude - 0.9999999999899993)).toBeLessThan(1e-12);
    // |lambda| = 1 - 1e-13 is inside the 1e-12 attraction margin.
    expect(refuse(0.2893305341017123, 0.48782915318081027).certified).toBe(true);
  });

  it('matches the high-precision multiplier at the three hard corpus centres', () => {
    const cases: readonly (readonly [number, number, number, number])[] = [
      [-0.158902249, -1.034028, -0.5583390470795281, 0.00021966886371906636],
      [-1.94130973, -0.0000974722949, -0.7553327603774783, -0.1131888566758074],
      [0.305376533, 0.552677981, -0.7353829376901141, -0.06370106478279645],
    ];
    for (const [re, im, lambdaRe, lambdaIm] of cases) {
      const sample = accept(re, im);
      expect(Math.abs(sample.multiplierRe - lambdaRe)).toBeLessThan(1e-11);
      expect(Math.abs(sample.multiplierIm - lambdaIm)).toBeLessThan(1e-11);
    }
  });

  it('refuses period-8 satellites inside the gate boxes; the orbit path finds period 8', () => {
    for (const [re, im] of [
      // The 1/2 satellite of the 6,000,000x component, inside its box.
      [-1.369, 0],
      [-1.3695, 0.001],
      // The 1/2 satellite of the cardioid's 1/4 satellite, inside its box.
      [0.3177311315746825, 0.5587291937376531],
    ] as const) {
      expect(refuse(re, im).certified).toBe(true);
      expect(classifyOrbit({ re, im }, { maxIterations: 4096, maxPeriod: 16 })).toMatchObject({
        status: 'attracting-cycle',
        period: 8,
      });
    }
  });

  it('gives the conjugate parameter the conjugate multiplier, bit for bit', () => {
    for (const [re, im] of [
      [-0.158902249, -1.034028],
      [0.305376533, 0.552677981],
      [-1.94130973, -0.0000974722949],
      [-1.3, 0.02],
    ] as const) {
      const direct = accept(re, im);
      const conjugate = accept(re, -im);
      expect(conjugate.multiplierRe).toBe(direct.multiplierRe);
      expect(conjugate.multiplierIm).toBe(-direct.multiplierIm);
      expect(conjugate.multiplierMagnitude).toBe(direct.multiplierMagnitude);
      expect(Math.abs(conjugate.multiplierAngle + direct.multiplierAngle)).toBeLessThan(1e-15);
    }
  });

  it('refuses NaN and infinite parameters', () => {
    for (const [re, im] of [
      [Number.NaN, 0],
      [0, Number.NaN],
      [Number.POSITIVE_INFINITY, 0],
      [Number.NEGATIVE_INFINITY, 0.5],
      [-1.3, Number.POSITIVE_INFINITY],
      [0.28, Number.NEGATIVE_INFINITY],
    ] as const) {
      refuse(re, im);
    }
  });

  it('reports its certificate when asked, and the kernels never need it', () => {
    const certificate = emptyCertificate();
    const sample = sentinelSample();
    expect(classifyPeriodFourInto(-1.250000001, 0, sample, certificate)).toBe(true);
    expect(certificate.certified).toBe(true);
    expect(certificate.residualBound).toBeGreaterThan(0);
    expect(certificate.derivativeBound).toBeGreaterThan(0);
    expect(certificate.allowance).toBe(64 * certificate.radiusRatio + 2 ** -50);
    expect(16 * certificate.productRe).toBe(sample.multiplierRe);
    expect(16 * certificate.productIm).toBe(sample.multiplierIm);
    expect(certificate.allowance).toBeLessThan(1e-11);
  });

  it('documents the evaluation bound (2^-47 = 64 u) and the revision', () => {
    expect(PERIOD_FOUR_EVALUATION_BOUND).toBe(64 * 2 ** -53);
    expect(PERIOD_FOUR_ANALYTIC_REVISION).toBe('src-analytic-p4-1.0.0');
  });
});
```

Create `tests/unit/domain/period-four-certificate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  classifyPeriodFourInto,
  createOrbitSample,
  PERIOD_FOUR_BOXES,
  VERIFIER_THRESHOLDS,
  type PeriodFourCertificate,
} from '../../../src/domain';

/**
 * Exact audit of the period-4 root-error certificate (ADR 0013,
 * docs/PERFORMANCE-MATHEMATICS.md section 12). Every binary64 number is a
 * dyadic rational, so the cubic's exact coefficients at the binary64 c, its
 * exact value at the binary64 candidate, and every inequality of the
 * certificate can be checked in exact BigInt arithmetic. For each sampled c
 * this test checks, with no rounding at all:
 *
 * 1. F >= |M(mu~)|, D <= |M'(mu~)| and K >= |3 mu~ + a2| for the exact cubic;
 * 2. whenever the code says "certified", the Rouché inequality
 *    F + K r^2 + r^3 < D r holds for r = 2h (1 + 2^-40), so exactly one root
 *    of the exact cubic lies within r of mu~;
 * 3. whenever the code accepts, 16 |mu~| + 16 r < 1 - attractMargin, so that
 *    root's multiplier is attracting beyond the margin.
 *
 * It does not depend on the floating-point error analysis of section 12.3:
 * it checks that analysis's conclusions directly, point by point.
 */

interface Dyadic {
  /** value = n / 2^s */
  readonly n: bigint;
  readonly s: number;
}

const view = new DataView(new ArrayBuffer(8));

const exact = (x: number): Dyadic => {
  if (!Number.isFinite(x)) throw new RangeError(`not finite: ${x}`);
  if (x === 0) return { n: 0n, s: 0 };
  view.setFloat64(0, x);
  const bits = view.getBigUint64(0);
  const negative = bits >> 63n === 1n;
  const exponent = Number((bits >> 52n) & 0x7ffn);
  const fraction = bits & 0xfffffffffffffn;
  const mantissa = exponent === 0 ? fraction : fraction | (1n << 52n);
  const power = (exponent === 0 ? 1 : exponent) - 1075;
  const n = negative ? -mantissa : mantissa;
  return power >= 0 ? { n: n << BigInt(power), s: 0 } : { n, s: -power };
};

const align = (a: Dyadic, b: Dyadic): [bigint, bigint, number] =>
  a.s >= b.s ? [a.n, b.n << BigInt(a.s - b.s), a.s] : [a.n << BigInt(b.s - a.s), b.n, b.s];
const add = (a: Dyadic, b: Dyadic): Dyadic => {
  const [x, y, s] = align(a, b);
  return { n: x + y, s };
};
const sub = (a: Dyadic, b: Dyadic): Dyadic => add(a, { n: -b.n, s: b.s });
const mul = (a: Dyadic, b: Dyadic): Dyadic => ({ n: a.n * b.n, s: a.s + b.s });
const int = (k: number): Dyadic => ({ n: BigInt(k), s: 0 });
/** Sign of a - b. */
const compare = (a: Dyadic, b: Dyadic): number => {
  const [x, y] = align(a, b);
  return x === y ? 0 : x < y ? -1 : 1;
};

interface Cx {
  readonly re: Dyadic;
  readonly im: Dyadic;
}
const cadd = (a: Cx, b: Cx): Cx => ({ re: add(a.re, b.re), im: add(a.im, b.im) });
const csub = (a: Cx, b: Cx): Cx => ({ re: sub(a.re, b.re), im: sub(a.im, b.im) });
const cmul = (a: Cx, b: Cx): Cx => ({
  re: sub(mul(a.re, b.re), mul(a.im, b.im)),
  im: add(mul(a.re, b.im), mul(a.im, b.re)),
});
const cscale = (k: number, a: Cx): Cx => ({ re: mul(int(k), a.re), im: mul(int(k), a.im) });
const creal = (k: number): Cx => ({ re: int(k), im: int(0) });
const norm2 = (a: Cx): Dyadic => add(mul(a.re, a.re), mul(a.im, a.im));

const certificate = (): PeriodFourCertificate => ({
  productRe: Number.NaN,
  productIm: Number.NaN,
  residualBound: Number.NaN,
  derivativeBound: Number.NaN,
  curvatureBound: Number.NaN,
  radiusRatio: Number.NaN,
  allowance: Number.NaN,
  certified: false,
});

const RADIUS_INFLATION: Dyadic = add(int(1), { n: 1n, s: 40 });
const THRESHOLD = exact(1 - VERIFIER_THRESHOLDS.attractMargin);

interface Tally {
  points: number;
  certified: number;
  accepted: number;
}

/** Audits one parameter; returns whether the code accepted it. */
const audit = (cRe: number, cIm: number, tally: Tally): void => {
  const cert = certificate();
  const accepted = classifyPeriodFourInto(cRe, cIm, createOrbitSample(), cert);
  tally.points += 1;
  if (!cert.certified) {
    expect(accepted).toBe(false);
    return;
  }
  tally.certified += 1;
  const c: Cx = { re: exact(cRe), im: exact(cIm) };
  const mu: Cx = { re: exact(cert.productRe), im: exact(cert.productIm) };
  const c2 = cmul(c, c);
  const a2 = csub(c2, creal(3));
  const a1 = csub(creal(3), cmul(c2, csub(cadd(c2, c), creal(1))));
  const g4 = cadd(
    cmul(c2, cadd(cmul(c2, cadd(cadd(c2, cscale(3, c)), creal(3))), cadd(cscale(3, c), creal(2)))),
    creal(1),
  );
  const a0 = csub(creal(0), g4);
  const residual = cadd(cmul(cadd(cmul(cadd(mu, a2), mu), a1), mu), a0);
  const slope = cadd(cmul(cadd(cscale(3, mu), cscale(2, a2)), mu), a1);
  const curvature = cadd(cscale(3, mu), a2);
  const f = exact(cert.residualBound);
  const d = exact(cert.derivativeBound);
  const k = exact(cert.curvatureBound);
  // 1. The bounds dominate the exact quantities (compare squares; F, D, K > 0).
  expect(compare(norm2(residual), mul(f, f))).toBeLessThanOrEqual(0);
  expect(compare(d, int(0))).toBe(1);
  expect(compare(norm2(slope), mul(d, d))).toBeGreaterThanOrEqual(0);
  expect(compare(norm2(curvature), mul(k, k))).toBeLessThanOrEqual(0);
  // 2. Rouché on |h| = r with r = 2h (1 + 2^-40).
  const r = mul(mul(int(2), exact(cert.radiusRatio)), RADIUS_INFLATION);
  const lhs = add(add(f, mul(k, mul(r, r))), mul(r, mul(r, r)));
  expect(compare(lhs, mul(d, r))).toBe(-1);
  if (!accepted) return;
  tally.accepted += 1;
  // 3. |lambda*| <= 16 |mu~| + 16 r < 1 - attractMargin.
  const slack = sub(THRESHOLD, mul(int(16), r));
  expect(compare(slack, int(0))).toBe(1);
  expect(compare(mul(int(256), norm2(mu)), mul(slack, slack))).toBe(-1);
};

const ring = (centre: readonly [number, number], tally: Tally): void => {
  for (let e = 4; e <= 32; e += 1) {
    const radius = 10 ** (-e / 2);
    for (let k = 0; k < 24; k += 1) {
      const angle = (2 * Math.PI * k) / 24 + 0.0137;
      audit(centre[0] + radius * Math.cos(angle), centre[1] + radius * Math.sin(angle), tally);
    }
  }
};

describe('period-4 certificate, audited in exact arithmetic', () => {
  it('holds on a grid over every gate box and its conjugate', () => {
    const tally: Tally = { points: 0, certified: 0, accepted: 0 };
    const steps = 48;
    for (const box of PERIOD_FOUR_BOXES) {
      const reStep = (box.reMax - box.reMin) / steps;
      const imLow = box.absImMin === 0 ? -box.absImMax : box.absImMin;
      const imStep = (box.absImMax - imLow) / steps;
      for (let i = 0; i < steps; i += 1) {
        for (let j = 0; j < steps; j += 1) {
          const re = box.reMin + (i + 0.5) * reStep;
          const im = imLow + (j + 0.5) * imStep;
          audit(re, im, tally);
          if (box.absImMin > 0) audit(re, -im, tally);
        }
      }
    }
    expect(tally.accepted).toBeGreaterThan(5000);
  });

  it('holds around the cusps, the satellite roots and the centres', () => {
    const tally: Tally = { points: 0, certified: 0, accepted: 0 };
    for (const point of [
      // Primitive cusps: (4c + 3)^3 = -108.
      [-1.9405507889761495, 0],
      [-0.1547246055119252, 1.031047227748952],
      // Satellite roots: lambda = 1 is a simple root there.
      [-1.25, 0],
      [0.25, 0.5],
      // Centres: roots of G4.
      [-1.9407998065294847, 0],
      [-1.310702641336833, 0],
      [0.2822713907669139, 0.5300606175785253],
      [-0.15652016683375508, 1.0322471089228318],
    ] as const) {
      ring(point, tally);
    }
    expect(tally.accepted).toBeGreaterThan(3000);
  });

  it('holds on both sides of the acceptance edge along each box midline', () => {
    const tally: Tally = { points: 0, certified: 0, accepted: 0 };
    const sample = createOrbitSample();
    for (const box of PERIOD_FOUR_BOXES) {
      const im = box.absImMin === 0 ? 0 : 0.5 * (box.absImMin + box.absImMax);
      // Walk the midline; bisect every flip of the decision down to adjacent doubles.
      const steps = 400;
      let previous = box.reMin;
      let previousAccepted = classifyPeriodFourInto(previous, im, sample);
      for (let i = 1; i <= steps; i += 1) {
        const re = box.reMin + ((box.reMax - box.reMin) * i) / steps;
        const accepted = classifyPeriodFourInto(re, im, sample);
        if (accepted !== previousAccepted) {
          let lo = previous;
          let hi = re;
          for (let n = 0; n < 80; n += 1) {
            const mid = 0.5 * (lo + hi);
            if (mid === lo || mid === hi) break;
            if (classifyPeriodFourInto(mid, im, sample) === previousAccepted) lo = mid;
            else hi = mid;
          }
          for (const edge of [lo, hi]) {
            for (let k = -8; k <= 8; k += 1) audit(edge + k * 1e-15, im, tally);
          }
        }
        previous = re;
        previousAccepted = accepted;
      }
    }
    expect(tally.accepted).toBeGreaterThan(50);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/domain/analytic-period-four.test.ts tests/unit/domain/period-four-certificate.test.ts`
Expected: FAIL (`classifyPeriodFourInto is not a function`).

- [ ] **Step 3: Write the module**

Create `src/domain/analytic-period-four.ts`:

```ts
import type { PeriodThreeTarget } from './analytic-period-three';
import { ORBIT_EVIDENCE_CODE } from './types';
import { VERIFIER_THRESHOLDS } from './verifier';

/**
 * Analytic period-4 fast path (workstream H, ADR 0013).
 *
 * For f_c(z) = z^2 + c the products mu = z1 z2 z3 z4 over the three period-4
 * cycles are the roots of the monic cubic
 *
 *   M(mu) = mu^3 + a2 mu^2 + a1 mu + a0,
 *   a2 = c^2 - 3,  a1 = 3 - c^2 (c^2 + c - 1),
 *   a0 = -(c^2 (c^2 (c^2 + 3c + 3) + 3c + 2) + 1) = -G4(c),
 *
 * and each cycle's multiplier is lambda = 16 mu (Lean: period4_product_root,
 * period4_seedDerivative in proof/IntMProof/PeriodFourMultiplier.lean). A
 * root with |lambda| < 1 belongs to a cycle of exact period 4: a root of the
 * period-4 dynatomic factor that returns in one or two steps has four-step
 * multiplier exactly 1 (Lean: period4_not_period_two_of_attracting).
 *
 * The candidate root comes from Cardano's formula and two Newton steps per
 * root; it uses Math.cbrt, Math.atan2, Math.cos and Math.sin, which are not
 * correctly rounded, and that is harmless: acceptance never trusts the
 * candidate. It rests on an a-posteriori Rouché certificate evaluated with
 * +, -, *, / and Math.sqrt only (docs/PERFORMANCE-MATHEMATICS.md section 12):
 *
 *   F >= |M(mu~)|, D <= |M'(mu~)|, K >= |M''(mu~)| / 2, h = F / D,
 *   certified iff h (8K + 16h) < D,
 *
 * which proves that exactly one root of the exact cubic at the binary64
 * parameter c lies within 2h (1 + 2^-40) of mu~. Acceptance:
 *
 *   16 |mu~| + 64 h + 2^-50 < 1 - attractMargin.
 *
 * Near the cusps of the three primitive components the cubic has a double
 * root at lambda = 1 and D vanishes: the certificate fails and the pixel
 * falls through to the orbit path. The answer is never wrong; it is only
 * less often fast.
 *
 * Pure function of c: no orbit state, no iteration count. |c| > 4, NaN and
 * infinite input are refused before any work (every test is written so that
 * NaN fails it). On refusal `out` is untouched. The optional `certificate`
 * receives the candidate and the bounds on every call that reaches the
 * certificate (tests and the adjudication tool); the kernels never pass it,
 * and the function is large on purpose, so that V8 never inlines it into a
 * kernel (ADR 0010, Consequences).
 */

/** Mutable record written on acceptance; structurally satisfied by OrbitSample. */
export type PeriodFourTarget = PeriodThreeTarget;

/** The candidate root and the bounds of its Rouché certificate (section 12). */
export interface PeriodFourCertificate {
  /** Candidate cycle product mu~ = lambda~ / 16. */
  productRe: number;
  productIm: number;
  /** F: an upper bound on |M(mu~)| for the exact coefficients at c. */
  residualBound: number;
  /** D: a lower bound on |M'(mu~)| (may be <= 0: no certificate). */
  derivativeBound: number;
  /** K: an upper bound on |M''(mu~)| / 2 = |3 mu~ + a2|. */
  curvatureBound: number;
  /** h = F / D. */
  radiusRatio: number;
  /** A = 64 h + 2^-50: the multiplier allowance used at acceptance. */
  allowance: number;
  /** The Rouché condition h (8K + 16h) < D holds. */
  certified: boolean;
}

/**
 * E = 2^-47 = 64 u: bounds the relative Horner error (1 + kappa)^11 - 1 of
 * M and M' (kappa = sqrt(2) gamma_2 per complex operation, at most 11 on any
 * monomial), with a factor of two to spare for the rounding of the bounds.
 */
export const PERIOD_FOUR_EVALUATION_BOUND = 2 ** -47;

/**
 * Revision of this acceptance rule (cubic, certificate, allowance, margin).
 * Nothing keys a cache on it: bump SEMANTIC_ALGORITHM_VERSION
 * (src/render/semantic-store.ts) together with this constant.
 */
export const PERIOD_FOUR_ANALYTIC_REVISION = 'src-analytic-p4-1.0.0';

/** Deflation of the computed |M'(mu~)| before its error is subtracted. */
const DERIVATIVE_DEFLATION = 1 - 2 ** -40;
/** Covers the rounding of 16 |mu~| and of the final sum (section 12.4). */
const MODULUS_TAIL = 2 ** -50;
/** sin(2 pi / 3); a candidate rotation only, never part of the certificate. */
const SQRT3_HALF = 0.8660254037844386;
const NEWTON_STEPS = 2;

export const classifyPeriodFourInto = (
  cRe: number,
  cIm: number,
  out: PeriodFourTarget,
  certificate?: PeriodFourCertificate,
): boolean => {
  // |c| (rounded), reused by the certificate. Every period-4 component lies
  // in |c| < 2.2; refusing |c| > 4 keeps every intermediate far from
  // overflow and refuses NaN and infinite input (section 12.6).
  const r = Math.sqrt(cRe * cRe + cIm * cIm);
  if (!(r <= 4)) {
    return false;
  }
  // Coefficients of the monic cubic in mu (exact c, binary64 arithmetic).
  const c2Re = cRe * cRe - cIm * cIm;
  const c2Im = 2 * cRe * cIm;
  const a2Re = c2Re - 3;
  const a2Im = c2Im;
  const sRe = c2Re + cRe - 1;
  const sIm = c2Im + cIm;
  const a1Re = 3 - (c2Re * sRe - c2Im * sIm);
  const a1Im = -(c2Re * sIm + c2Im * sRe);
  const gRe = c2Re + 3 * cRe + 3;
  const gIm = c2Im + 3 * cIm;
  const hRe = c2Re * gRe - c2Im * gIm + 3 * cRe + 2;
  const hIm = c2Re * gIm + c2Im * gRe + 3 * cIm;
  const a0Re = -(c2Re * hRe - c2Im * hIm + 1);
  const a0Im = -(c2Re * hIm + c2Im * hRe);

  // Candidate: Cardano on the depressed cubic y^3 + p y + q (mu = y - a2/3).
  const sqRe = a2Re * a2Re - a2Im * a2Im;
  const sqIm = 2 * a2Re * a2Im;
  const pThirdRe = (a1Re - sqRe / 3) / 3;
  const pThirdIm = (a1Im - sqIm / 3) / 3;
  const cuRe = sqRe * a2Re - sqIm * a2Im;
  const cuIm = sqRe * a2Im + sqIm * a2Re;
  const halfQRe = -((2 * cuRe) / 27 - (a2Re * a1Re - a2Im * a1Im) / 3 + a0Re) / 2;
  const halfQIm = -((2 * cuIm) / 27 - (a2Re * a1Im + a2Im * a1Re) / 3 + a0Im) / 2;
  const pSqRe = pThirdRe * pThirdRe - pThirdIm * pThirdIm;
  const pSqIm = 2 * pThirdRe * pThirdIm;
  const discRe = halfQRe * halfQRe - halfQIm * halfQIm + (pSqRe * pThirdRe - pSqIm * pThirdIm);
  const discIm = 2 * halfQRe * halfQIm + (pSqRe * pThirdIm + pSqIm * pThirdRe);
  const discMagnitude = Math.sqrt(discRe * discRe + discIm * discIm);
  const rootRe = Math.sqrt(0.5 * (discMagnitude + discRe));
  const rootImMagnitude = Math.sqrt(0.5 * Math.max(0, discMagnitude - discRe));
  const rootIm = discIm < 0 ? -rootImMagnitude : rootImMagnitude;
  let uRe = halfQRe + rootRe;
  let uIm = halfQIm + rootIm;
  const vRe = halfQRe - rootRe;
  const vIm = halfQIm - rootIm;
  if (vRe * vRe + vIm * vIm > uRe * uRe + uIm * uIm) {
    uRe = vRe;
    uIm = vIm;
  }
  const cubeRadius = Math.cbrt(Math.sqrt(uRe * uRe + uIm * uIm));
  const cubeAngle = Math.atan2(uIm, uRe) / 3;
  const cubeRe = cubeRadius * Math.cos(cubeAngle);
  const cubeIm = cubeRadius * Math.sin(cubeAngle);

  let bestRe = Number.NaN;
  let bestIm = Number.NaN;
  let bestSquared = Number.POSITIVE_INFINITY;
  for (let k = 0; k < 3; k += 1) {
    const rotRe = k === 0 ? 1 : -0.5;
    const rotIm = k === 0 ? 0 : k === 1 ? SQRT3_HALF : -SQRT3_HALF;
    const xRe = cubeRe * rotRe - cubeIm * rotIm;
    const xIm = cubeRe * rotIm + cubeIm * rotRe;
    const xSquared = xRe * xRe + xIm * xIm;
    let mRe = xRe - a2Re / 3;
    let mIm = xIm - a2Im / 3;
    if (xSquared > 0) {
      // y = x - (p/3) / x
      mRe -= (pThirdRe * xRe + pThirdIm * xIm) / xSquared;
      mIm -= (pThirdIm * xRe - pThirdRe * xIm) / xSquared;
    }
    for (let step = 0; step < NEWTON_STEPS; step += 1) {
      const t1Re = mRe + a2Re;
      const t1Im = mIm + a2Im;
      const t2Re = t1Re * mRe - t1Im * mIm + a1Re;
      const t2Im = t1Re * mIm + t1Im * mRe + a1Im;
      const fRe = t2Re * mRe - t2Im * mIm + a0Re;
      const fIm = t2Re * mIm + t2Im * mRe + a0Im;
      const d1Re = 3 * mRe + 2 * a2Re;
      const d1Im = 3 * mIm + 2 * a2Im;
      const fpRe = d1Re * mRe - d1Im * mIm + a1Re;
      const fpIm = d1Re * mIm + d1Im * mRe + a1Im;
      const fpSquared = fpRe * fpRe + fpIm * fpIm;
      if (!(fpSquared > 0)) {
        break;
      }
      mRe -= (fRe * fpRe + fIm * fpIm) / fpSquared;
      mIm -= (fIm * fpRe - fRe * fpIm) / fpSquared;
    }
    const mSquared = mRe * mRe + mIm * mIm;
    if (mSquared < bestSquared) {
      bestSquared = mSquared;
      bestRe = mRe;
      bestIm = mIm;
    }
  }

  // Certificate at mu~ = best (section 12.3): only +, -, *, / and sqrt.
  const t1Re = bestRe + a2Re;
  const t1Im = bestIm + a2Im;
  const t2Re = t1Re * bestRe - t1Im * bestIm + a1Re;
  const t2Im = t1Re * bestIm + t1Im * bestRe + a1Im;
  const residualRe = t2Re * bestRe - t2Im * bestIm + a0Re;
  const residualIm = t2Re * bestIm + t2Im * bestRe + a0Im;
  const d1Re = 3 * bestRe + 2 * a2Re;
  const d1Im = 3 * bestIm + 2 * a2Im;
  const slopeRe = d1Re * bestRe - d1Im * bestIm + a1Re;
  const slopeIm = d1Re * bestIm + d1Im * bestRe + a1Im;
  // Upper bounds on the absolute-value polynomials of section 12.5.
  const r2 = r * r;
  const b2 = r2 + 3;
  const b1 = r2 * (r2 + r + 1) + 3;
  const b0 = r2 * (r2 * (r2 + 3 * r + 3) + 3 * r + 2) + 1;
  const rho = Math.sqrt(bestSquared);
  const residualScale = ((rho + b2) * rho + b1) * rho + b0;
  const slopeScale = (3 * rho + 2 * b2) * rho + b1;
  const residualBound =
    Math.sqrt(residualRe * residualRe + residualIm * residualIm) +
    PERIOD_FOUR_EVALUATION_BOUND * residualScale;
  const derivativeBound =
    Math.sqrt(slopeRe * slopeRe + slopeIm * slopeIm) * DERIVATIVE_DEFLATION -
    2 * (PERIOD_FOUR_EVALUATION_BOUND * slopeScale);
  const curvatureBound = 3 * rho + b2;
  const radiusRatio = residualBound / derivativeBound;
  const certified =
    derivativeBound > 0 && radiusRatio * (8 * curvatureBound + 16 * radiusRatio) < derivativeBound;
  const allowance = 64 * radiusRatio + MODULUS_TAIL;
  const multiplierMagnitude = 16 * rho;
  if (certificate !== undefined) {
    certificate.productRe = bestRe;
    certificate.productIm = bestIm;
    certificate.residualBound = residualBound;
    certificate.derivativeBound = derivativeBound;
    certificate.curvatureBound = curvatureBound;
    certificate.radiusRatio = radiusRatio;
    certificate.allowance = allowance;
    certificate.certified = certified;
  }
  if (!(certified && multiplierMagnitude + allowance < 1 - VERIFIER_THRESHOLDS.attractMargin)) {
    return false;
  }
  const multiplierRe = 16 * bestRe;
  const multiplierIm = 16 * bestIm;
  out.status = 2;
  out.iterations = 0;
  out.evidence = ORBIT_EVIDENCE_CODE.analyticPeriod4Component;
  out.period = 4;
  out.multiplierRe = multiplierRe;
  out.multiplierIm = multiplierIm;
  out.multiplierMagnitude = multiplierMagnitude;
  out.multiplierAngle = multiplierMagnitude === 0 ? 0 : Math.atan2(multiplierIm, multiplierRe);
  return true;
};
```

In `src/domain/index.ts`, directly after the line `export type { PeriodThreeTarget } from './analytic-period-three';`, insert:

```ts
export {
  classifyPeriodFourInto,
  PERIOD_FOUR_ANALYTIC_REVISION,
  PERIOD_FOUR_EVALUATION_BOUND,
} from './analytic-period-four';
export type { PeriodFourCertificate, PeriodFourTarget } from './analytic-period-four';
```

Notes for the implementer, so nothing is "simplified" by accident:

- Keep every operation in the order written. The error budget (§12.5) counts the roundings of exactly this evaluation order; reordering a sum or factoring differently changes the counts.
- Do not replace `Math.sqrt(x * x + y * y)` by `Math.hypot`: `Math.hypot` is not correctly rounded, and the budget assumes `Math.sqrt`.
- Every test is written so that NaN fails it (`!(r <= 4)`, `!(fpSquared > 0)`, `!(certified && …)`). Do not invert them into `r > 4` and the like.
- The function is deliberately one large body: the kernels call it without inlining, and the optional `certificate` argument is the only diagnostic channel.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/domain/analytic-period-four.test.ts tests/unit/domain/period-four-certificate.test.ts`
Expected: PASS, 11 and 3 tests. The audit takes well under a second.

- [ ] **Step 5: Write PERFORMANCE-MATHEMATICS §12**

In `docs/PERFORMANCE-MATHEMATICS.md`, in the `### Policy revisions` table, add this row after the `src-analytic-p3-1.0.0` row:

```markdown
| `src-analytic-p4-1.0.0` | src/domain/analytic-period-four.ts | The period-4 acceptance: cubic candidate, Rouché certificate, allowance, margin (§12) |
```

Append this section at the end of the file (after §11.6). Section 12.8 is added by Task 7, between 12.7 and 12.9.

````markdown
## 12. Period-4 cubic with a certified root (workstream H, ADR 0013)

Code: [src/domain/analytic-period-four.ts](../src/domain/analytic-period-four.ts) (`classifyPeriodFourInto`, revision `src-analytic-p4-1.0.0`). Exact identities: [proof/IntMProof/PeriodFourMultiplier.lean](../proof/IntMProof/PeriodFourMultiplier.lean). Exact audit: [tests/unit/domain/period-four-certificate.test.ts](../tests/unit/domain/period-four-certificate.test.ts). The spike that motivated it: [WORKSTREAM-H-SPIKE-2026-10-16.md](verification/WORKSTREAM-H-SPIKE-2026-10-16.md). Labels as in §11: **[Lean]** checked in Lean, **[derived]** algebra checked with sympy, **[literature]** standard and not re-derived, and **[paper]** for the floating-point argument of 12.5, which is written out here and audited in exact arithmetic on samples (12.7) but not machine-checked.

The owner's bar (2026-10-16 and 2026-10-17) is a rigorous bound: whenever the code accepts, the exact parameter's cubic has a root with |λ| < 1 − attractMargin, and the cycle has exact period 4. 12.4 and 12.5 prove that for every finite binary64 c; 12.6 says where the proof refuses.

### 12.1 The cubic

The period-4 dynatomic factor and the Gleason centre polynomial are

```text
f⁴(z) − z = (f²(z) − z) · Φ₄(z, c)                              [Lean: orbit_four_sub_self]
Φ₄(z, c)  = z¹² + 6c z¹⁰ + z⁹ + (15c² + 3c) z⁸ + 4c z⁷ + (20c³ + 12c² + 1) z⁶
          + (6c² + 2c) z⁵ + (15c⁴ + 18c³ + 3c² + 4c) z⁴ + (4c³ + 4c² + 1) z³
          + (6c⁵ + 12c⁴ + 6c³ + 5c² + c) z² + (c⁴ + 2c³ + c² + 2c) z + G₄(c),
G₄(c)     = c⁶ + 3c⁵ + 3c⁴ + 3c³ + 2c² + 1.
```

At a root z of Φ₄ put μ = z·f(z)·f²(z)·f³(z), the cycle product. The four-step multiplier is λ = (f⁴)′(z) = 16μ **[Lean: period4_seedDerivative]**, and μ is a root of the monic cubic

```text
M(μ, c) = μ³ + a₂μ² + a₁μ + a₀                                   [Lean: period4_product_root]
a₂ = c² − 3
a₁ = −(c⁴ + c³ − c² − 3)  = 3 − c²(c² + c − 1)
a₀ = −G₄(c)               = −(c²(c²(c² + 3c + 3) + 3c + 2) + 1)
```

This is the cubic the spike solved by Cardano (its `tryP4`, in μ = λ/16). Conversely Res_z(Φ₄, λ − 16μ(z)) = (4096·M(λ/16, c))⁴ **[derived]**: over the twelve roots of Φ₄ the values 16μ(z) are the roots of the cubic in λ, each four times, so every root of M is the product of exactly one 4-cycle.

**Where the roots collide.** The discriminant of M in μ is −c⁶(c + 2)²((4c + 3)³ + 108) **[derived]**. It vanishes at c = 0 (M = (μ − 1)³, λ = 16), at c = −2 (M = (μ − 1)(μ + 1)², λ = ±16) and at the three primitive cusps, the roots of (4c + 3)³ = −108:

```text
c ≈ −1.9405507889761495,   c ≈ −0.1547246055119252 ± 1.031047227748952 i,
```

where the attracting root meets a repelling one at λ = 1. The satellite roots are not among them: at c = −5/4 (the 1/2 satellite of the period-2 bulb) and c = 1/4 ± i/2 (the 1/4 and 3/4 satellites of the cardioid) λ = 1 is a simple root (M′(1/16) = 125/32 at −5/4 **[derived]**; the root **[Lean: period4_product_root_satellite]**). So a root with |λ| < 1 is always simple, and it is badly conditioned only near the three cusps, where the two colliding roots separate like √|c − c_cusp|. At the six centres, the roots of G₄, μ = 0 is a root **[Lean: period4_product_zero_of_center]**.

### 12.2 Exact period and uniqueness

Let μ\* be a root of M with |16μ\*| < 1. By the resultant identity of 12.1 **[derived]** some root z of Φ₄ has (f⁴)′(z) = 16μ\*, and f⁴(z) = z **[Lean: orbit_four_sub_self]**. A root of Φ₄ that returns in two steps has four-step multiplier exactly 1 **[Lean: periodFourDynatomic_period_two_multiplier]**: a fixed point that is a root of Φ₄ has (2z)² = −1 **[Lean: periodFourDynatomic_fixedPoint]**, so (2z)⁴ = 1; a point of the 2-cycle that is a root of Φ₄ forces 4c + 5 = 0 **[Lean: periodFourDynatomic_twoCycle]**, and its four-step multiplier is (4(c + 1))² = 1. So z returns neither in two steps nor in one **[Lean: period4_not_period_two_of_attracting, period4_not_fixed_of_attracting]**: its cycle has exact period 4, and it is attracting. A quadratic polynomial has at most one attracting cycle, and that cycle attracts the critical orbit **[literature: Fatou]**, so this is the cycle the orbit path would find, the other two roots of M have |λ| > 1 **[literature: Fatou–Shishikura]**, and the period-3 and period-4 paths can never both accept. As for periods 2 and 3, no divisor reduction is needed.

The margin, not the box, decides. Inside the period-4 boxes lie period-8 satellites, for example c = −1.369 and c = 0.32484 + 0.56386i, where every root of M has |λ| > 1; the path refuses and the orbit path finds period 8.

### 12.3 Algorithm

1. r = √((Re c)² + (Im c)²). Refuse unless r ≤ 4; this also refuses NaN and ±∞. All six components lie in |c| < 2.2.
2. The coefficients a₂, a₁, a₀ in binary64, in the factored forms of 12.1, in the code's evaluation order.
3. **Candidate.** Cardano on the depressed cubic y³ + py + q (μ = y − a₂/3): one complex cube root from `Math.cbrt`, `Math.atan2`, `Math.cos` and `Math.sin`, the other two by the rotations ω and ω²; two Newton steps on each root; keep the root of smallest |μ|². **Nothing below assumes anything about the candidate's accuracy**, and the functions it uses need not be correctly rounded.
4. **Certificate** at the candidate μ̃, with +, −, ×, ÷ and √ only:
   - the residual M̂ = ((μ̃ + a₂)μ̃ + a₁)μ̃ + a₀ and the slope M̂′ = (3μ̃ + 2a₂)μ̃ + a₁, by Horner;
   - ρ = |μ̃|, b₂ = r² + 3, b₁ = r²(r² + r + 1) + 3, b₀ = r²(r²(r² + 3r + 3) + 3r + 2) + 1, M̄ = ((ρ + b₂)ρ + b₁)ρ + b₀ and M̄′ = (3ρ + 2b₂)ρ + b₁;
   - F = |M̂| + E·M̄, D = |M̂′|·(1 − 2⁻⁴⁰) − 2E·M̄′, K = 3ρ + b₂, h = F/D, with E = 2⁻⁴⁷;
   - certified iff D > 0 and h·(8K + 16h) < D.
5. Accept iff certified and 16ρ + (64h + 2⁻⁵⁰) < 1 − attractMargin.

The record is period 4, λ = 16μ̃, |λ| = 16ρ, arg λ (0 when |λ| = 0, §5), iterations 0 and evidence `analytic-period-4-component`.

### 12.4 The enclosure

**Lemma (Rouché for a cubic).** Let M be a monic cubic, μ̃ ∈ ℂ, F ≥ |M(μ̃)|, 0 < D ≤ |M′(μ̃)| and K ≥ |M″(μ̃)|/2. If r > 0 and F + Kr² + r³ < Dr, then M has exactly one root in the open disk |μ − μ̃| < r.

*Proof.* Taylor's formula at μ̃ is exact for a monic cubic: M(μ̃ + w) = M(μ̃) + M′(μ̃)w + ½M″(μ̃)w² + w³. On |w| = r, |M(μ̃ + w) − M′(μ̃)w| ≤ F + Kr² + r³ < Dr ≤ |M′(μ̃)w|. By Rouché's theorem **[literature]** M(μ̃ + w) and M′(μ̃)w have the same number of zeros in |w| < r, namely one. ∎

This is the a-posteriori Newton–Kantorovich test specialised to a cubic, whose second-order remainder is exact, so no Lipschitz constant has to be estimated.

**From the computed test to the lemma.** Let F̂, D̂, K̂, ĥ be the computed values, and suppose (12.5) that F̂ ≥ |M(μ̃)|, 0 < D̂ ≤ |M′(μ̃)| and K̂(1 + 8u) ≥ |M″(μ̃)|/2 for the exact cubic at the binary64 c. Take r = 2ĥ(1 + 2⁻⁴⁰), a real number that is never computed. Since ĥ ≥ (F̂/D̂)(1 − u), F̂ ≤ D̂ĥ/(1 − u) < D̂r/2, so the lemma applies as soon as K̂(1 + 8u)r² + r³ < D̂r/2, that is

```text
4K̂(1 + 8u)ĥ(1 + 2⁻⁴⁰) + 8ĥ²(1 + 2⁻⁴⁰)² < D̂.
```

The computed test fl(ĥ·fl(8K̂ + 16ĥ)) < D̂ (8K̂ and 16ĥ are exact) gives ĥ(8K̂ + 16ĥ) < D̂/(1 − u)², and the left side above is at most ½(1 + 2⁻⁴⁰)²(1 + 8u)·ĥ(8K̂ + 16ĥ) < D̂. So **a certified candidate has exactly one exact root μ\* with |μ\* − μ̃| < 2ĥ(1 + 2⁻⁴⁰).**

**From the root to acceptance.** ρ̂ = fl(√(fl(Re μ̃²) + fl(Im μ̃²))) ≥ |μ̃|(1 − u)², and 16ρ̂ is exact, so |λ\*| = 16|μ\*| ≤ 16ρ̂(1 + 2.01u) + 32ĥ(1 + 2⁻⁴⁰). The allowance Â = fl(64ĥ + 2⁻⁵⁰) ≥ (64ĥ + 2⁻⁵⁰)(1 − u) exceeds 32ĥ(1 + 2⁻⁴⁰) by at least 2⁻⁵⁰(1 − u) ≥ 7.9u. If fl(16ρ̂ + Â) < T, where T is the binary64 value of 1 − attractMargin, then 16ρ̂ + Â < T/(1 − u) < T + 1.01u and 16ρ̂ < 1, so

```text
|λ*| ≤ 16ρ̂ + 2.01u + 32ĥ(1 + 2⁻⁴⁰) ≤ 16ρ̂ + Â − 5.8u < T.
```

> **Acceptance implies |λ\*| < 1 − 10⁻¹² for a root of the exact cubic at the binary64 parameter c, hence (12.2) an attracting cycle of exact period 4. The reported λ̃ = 16μ̃ lies within 32ĥ(1 + 2⁻⁴⁰) < Â/2 of λ\*.**

### 12.5 Floating-point error budget [paper]

Model: IEEE binary64, round to nearest, unit roundoff u = 2⁻⁵³. ECMAScript evaluates each operation exactly rounded, left to right, and does not contract to FMA; `Math.sqrt` is correctly rounded. Multiplication by a power of two and negation are exact. Write κ = √2·γ₂ = 2√2·u/(1 − 2u) ≈ 2.83u.

1. **Elementary operations [literature: Higham, Accuracy and Stability of Numerical Algorithms, 2nd ed., Lemma 3.5].** For complex x and y, fl(x ± y) = (x ± y)(1 + δ) with |δ| ≤ u, and the conventional product, real part fl(fl(ac) − fl(bd)) and imaginary part fl(fl(ad) + fl(bc)), satisfies fl(xy) = xy(1 + δ) with |δ| ≤ κ. A real constant times a complex number (3c, 3μ̃) is two real products: |δ| ≤ u. Squaring c is a conventional product.
2. **Monomial expansion.** Expand a computed expression as the sum of the monomials of its expression tree, without combining like terms. Each rounded operation multiplies every monomial of its result by its own factor (1 + δ), so the computed value is Σₘ m·∏ₖ(1 + δₖ) and |computed − exact| ≤ ((1 + κ)^N − 1)·Σₘ|m| ≤ γ′_N·Σₘ|m|, γ′_N = Nκ/(1 − Nκ), where N is the largest number of rounded operations on one monomial.
3. **Counting.** In the code's order, N = 11 for the residual. The c⁶ monomial of a₀ meets the three squarings c² (3), the two additions in g = c² + 3c + 3 (2), the product c²·g (1), the two additions in h = c²g + 3c + 2 (2), the product c²·h (1), the addition of 1 (1) and the final Horner addition (1); the c⁵ monomial (3c in place of the innermost c²) also meets 11. The other monomials meet at most 9, and μ̃³ meets 5. For the slope N = 7: the c⁴ monomial of a₁ meets c² twice (2), the two additions in c² + c − 1 (2), the product (1), 3 − · (1) and the final Horner addition (1). So γ′₁₁ ≤ 31.2u and γ′₇ ≤ 19.8u. (A monomial tracker run during planning confirmed the counts for the code as written.) Each coefficient appears in the tree with its absolute value and no monomial is duplicated, so Σₘ|m| is exactly M̄(|c|, |μ̃|) for the residual and M̄′(|c|, |μ̃|) for the slope, the polynomials of 12.3 with |c| and |μ̃| in place of r and ρ.
4. **The bounds themselves.** r̂ ≥ |c|(1 − u)² and ρ̂ ≥ |μ̃|(1 − u)². The quantities b̂₂, b̂₁, b̂₀, M̄̂ and M̄̂′ are sums and products of non-negative numbers, so each rounding can only lower a monomial by a factor (1 − u): every monomial meets at most 11 roundings and at most six factors r̂ or three factors ρ̂, so M̄̂ ≥ M̄(|c|, |μ̃|)(1 − u)²³ ≥ M̄(|c|, |μ̃|)(1 − 35u), and likewise M̄̂′. E·M̄̂ and 2E·M̄̂′ are exact.
5. **F is an upper bound.** |M(μ̃)| ≤ |M̂| + γ′₁₁M̄ by step 2, where M̂ is the computed complex residual. Its computed modulus satisfies |M̂| ≤ fl|M̂|(1 + 2.01u), and fl|M̂| ≤ (1 + u)²|M̂| ≤ (1 + 2.01u)(1 + γ′₁₁)M̄. The sum F̂ = fl(fl|M̂| + E·M̄̂) ≥ (fl|M̂| + E·M̄̂)(1 − u). Hence F̂ ≥ |M(μ̃)| as soon as E·M̄̂(1 − u) ≥ (γ′₁₁ + 3.02u)M̄, and 64u(1 − 35u)(1 − u) ≥ 34.3u does it, with a factor 1.86 to spare.
6. **D is a lower bound.** |M′(μ̃)| ≥ |M̂′| − γ′₇M̄′, and |M̂′| ≥ fl|M̂′|(1 − 2u). The code computes a = fl(fl|M̂′|·(1 − 2⁻⁴⁰)) ≤ |M̂′|(1 − 2⁻⁴⁰)(1 + u)/(1 − 2u) and b = 2E·M̄̂′ ≥ 128u(1 − 35u)M̄′ ≥ γ′₇M̄′, then D̂ = fl(a − b). If a ≤ b, D̂ ≤ 0 and the test refuses. Otherwise D̂ ≤ (a − b)(1 + u) ≤ a(1 + u) − b ≤ |M̂′| − γ′₇M̄′ ≤ |M′(μ̃)|, because (1 − 2⁻⁴⁰)(1 + u)²/(1 − 2u) < 1. The deflation by 2⁻⁴⁰ is what lets the rounded subtraction err only downwards.
7. **K is an upper bound up to 8u.** |M″(μ̃)|/2 = |3μ̃ + a₂| ≤ 3|μ̃| + |c|² + 3 ≤ (3ρ̂ + r̂² + 3)(1 + 4.1u), and K̂ = fl(fl(3ρ̂) + fl(fl(r̂·r̂) + 3)) ≥ (3ρ̂ + r̂² + 3)(1 − u)³, so |M″(μ̃)|/2 ≤ K̂(1 + 8u). The factor 2 in 8K + 16h absorbs it (12.4).
8. **Overflow and underflow.** Step 1 of 12.3 refuses |c| > 4, so whenever the code accepts (16ρ̂ < 1) every intermediate is below about 10⁴ and nothing overflows; a candidate that overflows makes ρ̂, F̂ or D̂ infinite or NaN, and every test in the code is written so that ∞ and NaN refuse. Gradual underflow, which needs a component below 2⁻⁹⁶⁹, adds at most 2⁻¹⁰⁷⁴ absolutely per operation; that is far below E·M̄ ≥ 64u (M̄ ≥ b₀ ≥ 1), 2E·M̄′ ≥ 384u and the 7.9u tail of the allowance that absorb it.

The constants: E = 2⁻⁴⁷ = 64u, about twice γ′₁₁ + 3u; the deflation 1 − 2⁻⁴⁰; the tail 2⁻⁵⁰ = 8u; and the factors 2 in h(8K + 16h) and in 2E·M̄′. Each is a power of two, so no constant is itself rounded.

**Sizes.** On the golden raster (160×100) the allowance runs from 4.5·10⁻¹³ (the cardioid satellites) to 5.6·10⁻⁹ (next to the real primitive cusp in the 609× view); over the 6,000,000× view it is 3.6·10⁻¹². The worst |λ̃ − λ_dd| there was 3.5·10⁻¹², at most 4.5·10⁻³ of the allowance.

**The spike's allowance.** The prototype accepted when 16|μ̃| + 64(|M̂| + 128u·M̄)/|M̂′| < 1 − 10⁻¹². That is a first-order estimate: it divides by the computed |M̂′| without bounding its error and has no second-order term, so near a double root it can understate the error, and it is not a proof. It refused nothing on the corpus. 12.4 adds the second-order and cubic terms exactly and 12.5 bounds every rounding, at a similar allowance away from the cusps.

### 12.6 Where the certificate refuses

- **Near the three primitive cusps.** D ~ |c − c_cusp|^½ while F stays near E·M̄ (about 1.5·10⁻¹² at the real cusp; D = 7.5·10⁻³, 7.5·10⁻⁵ and 7.5·10⁻⁶ at distances 10⁻⁶, 10⁻¹⁰ and 10⁻¹²), so h grows like |c − c_cusp|^−½ and the Rouché test fails within about 10⁻¹² of a cusp. Measured: at −1.9405507889761495 − 10⁻¹² the cycle has 1 − |λ| = 6.3·10⁻⁵ and the test fails; at − 10⁻¹⁰ it passes with an allowance of 1.3·10⁻⁶. Those pixels fall through to the orbit path, which needs about 4·23/(1 − |λ|) ≈ 1.5·10⁶ iterations there and leaves them unresolved, as today. At the product's 6,000,000× ceiling a pixel is about 6.5·10⁻¹⁰ wide, more than the refused disk.
- **Near |λ| = 1.** Points with 1 − attractMargin − A ≤ |λ| < 1 − attractMargin are refused, as in §11.4; no iteration budget detects them either.
- **Nowhere else.** Over 132,152 sampled parameters in and around the six components, no attracting point outside these two zones was refused.

The answer is never wrong; it is only less often fast.

### 12.7 Verification

- **Exact audit** ([period-four-certificate.test.ts](../tests/unit/domain/period-four-certificate.test.ts)). For 19,664 parameters (a grid over every box and its conjugate, rings around the cusps, the satellite roots and the centres down to radius 10⁻¹⁶, and both sides of the acceptance edge on every box midline), every binary64 number is converted to an exact dyadic rational; the test recomputes the exact cubic at the binary64 c and its exact value at the binary64 candidate in BigInt arithmetic, and checks F̂ ≥ |M|, D̂ ≤ |M′|, K̂ ≥ |M″|/2, the Rouché inequality for r = 2ĥ(1 + 2⁻⁴⁰) and, at acceptance, 16|μ̃| + 16r < T, with no rounding at all. It checks the conclusions of 12.5 point by point, not the argument.
- **High-precision sweep** (planning, 2026-10-17: Python mpmath at 50 digits on a bit-exact binary64 mirror of the code; the mirror's decisions matched the TypeScript on 3,000 random box points). 132,152 parameters: grids over the boxes, rings around the cusps, satellite roots and centres down to 10⁻¹⁶, inverse-map points at |λ| = 1 − 10⁻ᵏ for k = 1…14, the 6,000,000× view, and random points over |c| < 4. No acceptance with |λ\*| ≥ 1 − 10⁻¹²; worst |λ̃ − λ\*| = 4.2·10⁻³ of the allowance.
- **Independent oracle** ([period-four-golden-oracle.test.ts](../tests/unit/render/period-four-golden-oracle.test.ts)). Every analytic period-4 pixel of the golden raster is certified period 4 by the dd period-4 cycle, which uses no cubic, with |λ̃ − λ_dd| ≤ A + 10⁻¹².

### 12.9 What is proved and what is not

- **Lean (S2 in the [proof DAG](verification/LEAN-PROOF-DAG.md)):** the Φ₄ factorization, the cycle-product cubic at every Φ₄ root, the four-step derivative 16μ, the centre and satellite landmarks, and the two-step return case with four-step multiplier 1, hence exact period 4 for an attracting Φ₄ root.
- **On paper:** Rouché's theorem as used (literature), the binary64 budget of 12.5, audited exactly on 19,664 parameters in every test run.
- **Not proved:** the resultant identity (sympy-checked), Fatou uniqueness (literature), and the gate containment of 12.8 (measured on dense grids).
````

- [ ] **Step 6: Format and run the repository gates**

Run:

```bash
npx prettier --write docs/PERFORMANCE-MATHEMATICS.md
npx prettier --write docs/PERFORMANCE-MATHEMATICS.md
npx prettier --check docs/PERFORMANCE-MATHEMATICS.md src/domain tests/unit/domain
npm run check
```

Expected: all pass. Nothing calls the new function from a kernel yet, so no golden moves.

- [ ] **Step 7: Commit**

```bash
git add src/domain/analytic-period-four.ts src/domain/index.ts tests/unit/domain/analytic-period-four.test.ts tests/unit/domain/period-four-certificate.test.ts docs/PERFORMANCE-MATHEMATICS.md
git commit -m "$(cat <<'EOF'
Domain: certified period-4 cubic solve with a Rouché root enclosure (ADR 0013)

Untrusted Cardano candidate; acceptance only through F >= |M|, D <= |M'|,
K >= |M''|/2 with h(8K + 16h) < D and 16|mu| + 64h + 2^-50 < 1 - margin.
The binary64 budget is PERFORMANCE-MATHEMATICS section 12; an exact BigInt
audit checks every inequality at 19,664 parameters.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: The gate: component boxes as data behind a straight-line test

**Files:**

- Create: `src/domain/period-four-gate.ts`
- Modify: `src/domain/index.ts` (exports)
- Test: `tests/unit/domain/period-four-gate.test.ts`

**Interfaces:**

- Consumes: `classifyPeriodFourInto` (Task 3) and `PERIOD_THREE_BOXES` (existing), in the test only.
- Produces: `interface PeriodFourBox { reMin; reMax; absImMin; absImMax }`; `CARDIOID_SATELLITE_BOX`, `COMPLEX_PRIMITIVE_BOX`, `BULB_SATELLITE_BOX`, `REAL_PRIMITIVE_BOX`, `PERIOD_FOUR_BOXES`; `inPeriodFourGate(cRe: number, cIm: number): boolean`. Task 7's row kernel reads the four boxes directly.

The box values are the spike's padded boxes (`poc/performance/h-p3p4/boxes.json`), with each conjugate pair folded through |Im c| into the union of the pair's two boxes (for the complex primitive pair the two boxes differ in the last bits, so the folded box takes the smaller `reMin` and the larger `reMax`).

- [ ] **Step 1: Write the failing test**

Create `tests/unit/domain/period-four-gate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  BULB_SATELLITE_BOX,
  CARDIOID_SATELLITE_BOX,
  classifyPeriodFourInto,
  COMPLEX_PRIMITIVE_BOX,
  createOrbitSample,
  inPeriodFourGate,
  PERIOD_FOUR_BOXES,
  PERIOD_THREE_BOXES,
  REAL_PRIMITIVE_BOX,
} from '../../../src/domain';

/**
 * The gate decides only whether the cubic solve is tried, so it must contain
 * every parameter the solve accepts (ADR 0013). Measured on dense grids and
 * along every box edge; not a proof.
 */
const inAnyBox = (re: number, im: number): boolean =>
  PERIOD_FOUR_BOXES.some(
    (box) =>
      re >= box.reMin &&
      re <= box.reMax &&
      Math.abs(im) >= box.absImMin &&
      Math.abs(im) <= box.absImMax,
  );

describe('period-4 gate', () => {
  it('agrees with a plain loop over PERIOD_FOUR_BOXES on a grid', () => {
    for (let i = 0; i < 400; i += 1) {
      const re = -2 + (2.4 * (i + 0.5)) / 400;
      for (let j = 0; j < 400; j += 1) {
        const im = -1.1 + (2.2 * (j + 0.5)) / 400;
        expect(inPeriodFourGate(re, im)).toBe(inAnyBox(re, im));
      }
    }
  });

  it('is disjoint from the period-3 boxes', () => {
    for (const four of PERIOD_FOUR_BOXES) {
      for (const three of PERIOD_THREE_BOXES) {
        const reOverlap = four.reMin <= three.reMax && three.reMin <= four.reMax;
        const imOverlap = four.absImMin <= three.absImMax && three.absImMin <= four.absImMax;
        expect(reOverlap && imOverlap).toBe(false);
      }
    }
  });

  it('reduces to two Re c windows per row (the row kernel form)', () => {
    // TriggeredRowKernel.classifyRow evaluates the gate once per row as two
    // windows on Re c (src/render/triggered-rows.ts). That is exact because
    // the off-axis bands are disjoint from each other and from the axis band,
    // and only the two axis boxes share |Im c| values.
    expect(CARDIOID_SATELLITE_BOX.absImMin).toBeGreaterThan(BULB_SATELLITE_BOX.absImMax);
    expect(COMPLEX_PRIMITIVE_BOX.absImMin).toBeGreaterThan(CARDIOID_SATELLITE_BOX.absImMax);
    expect(BULB_SATELLITE_BOX.absImMin).toBe(0);
    expect(REAL_PRIMITIVE_BOX.absImMin).toBe(0);
    expect(REAL_PRIMITIVE_BOX.absImMax).toBeLessThan(BULB_SATELLITE_BOX.absImMax);
    // The kernel's windows, written as in triggered-rows.ts (keep in sync with
    // it; tests/unit/render/triggered-rows.test.ts compares the kernel itself
    // with the scalar gate at every box edge).
    const inRowWindows = (cRe: number, cIm: number): boolean => {
      const absIm = Math.abs(cIm);
      let reMin = Number.POSITIVE_INFINITY;
      let reMax = Number.NEGATIVE_INFINITY;
      let axisReMin = Number.POSITIVE_INFINITY;
      let axisReMax = Number.NEGATIVE_INFINITY;
      if (absIm >= CARDIOID_SATELLITE_BOX.absImMin && absIm <= CARDIOID_SATELLITE_BOX.absImMax) {
        reMin = CARDIOID_SATELLITE_BOX.reMin;
        reMax = CARDIOID_SATELLITE_BOX.reMax;
      } else if (
        absIm >= COMPLEX_PRIMITIVE_BOX.absImMin &&
        absIm <= COMPLEX_PRIMITIVE_BOX.absImMax
      ) {
        reMin = COMPLEX_PRIMITIVE_BOX.reMin;
        reMax = COMPLEX_PRIMITIVE_BOX.reMax;
      } else if (absIm <= BULB_SATELLITE_BOX.absImMax) {
        reMin = BULB_SATELLITE_BOX.reMin;
        reMax = BULB_SATELLITE_BOX.reMax;
        if (absIm <= REAL_PRIMITIVE_BOX.absImMax) {
          axisReMin = REAL_PRIMITIVE_BOX.reMin;
          axisReMax = REAL_PRIMITIVE_BOX.reMax;
        }
      }
      return (cRe >= reMin && cRe <= reMax) || (cRe >= axisReMin && cRe <= axisReMax);
    };
    const bits = new DataView(new ArrayBuffer(8));
    const step = (value: number, ulps: number): number => {
      bits.setFloat64(0, value);
      bits.setBigInt64(0, bits.getBigInt64(0) + BigInt(value < 0 ? -ulps : ulps));
      return bits.getFloat64(0);
    };
    const res = [-2.2, -1.6, -0.9, 0, 0.3];
    const ims = [0, -0, 0.3, 0.9, 1.2, Number.NaN, Number.POSITIVE_INFINITY];
    for (const box of PERIOD_FOUR_BOXES) {
      for (const value of [box.reMin, box.reMax]) {
        res.push(step(value, -1), value, step(value, 1));
      }
      res.push(0.5 * (box.reMin + box.reMax));
      for (const value of [box.absImMin, box.absImMax]) {
        for (const v of value === 0 ? [0, -0, 5e-324] : [step(value, -1), value, step(value, 1)]) {
          ims.push(v, -v);
        }
      }
      ims.push(0.5 * (box.absImMin + box.absImMax));
    }
    res.push(Number.NaN, Number.NEGATIVE_INFINITY);
    for (let i = 0; i < 200; i += 1) res.push(-2.1 + (2.4 * (i + 0.5)) / 200);
    for (let j = 0; j < 200; j += 1) ims.push(-1.1 + (2.2 * (j + 0.5)) / 200);
    for (const cRe of res) {
      for (const cIm of ims) {
        expect(inRowWindows(cRe, cIm)).toBe(inPeriodFourGate(cRe, cIm));
      }
    }
  });

  it('contains the six period-4 centres and is conjugation-symmetric', () => {
    for (const [re, im] of [
      [-1.9407998065294847, 0],
      [-1.3107026413368328, 0],
      [0.2822713907669139, 0.5300606175785253],
      [0.2822713907669139, -0.5300606175785253],
      [-0.15652016683375505, 1.0322471089228318],
      [-0.15652016683375505, -1.0322471089228318],
    ] as const) {
      expect(inPeriodFourGate(re, im)).toBe(true);
    }
    expect(inPeriodFourGate(-1.3, 0.05)).toBe(inPeriodFourGate(-1.3, -0.05));
  });

  it('rejects NaN and infinite parameters and the far exterior', () => {
    expect(inPeriodFourGate(Number.NaN, 0)).toBe(false);
    expect(inPeriodFourGate(-1.3, Number.NaN)).toBe(false);
    expect(inPeriodFourGate(Number.NEGATIVE_INFINITY, 0)).toBe(false);
    expect(inPeriodFourGate(-1.3, Number.POSITIVE_INFINITY)).toBe(false);
    expect(inPeriodFourGate(2.5, 1)).toBe(false);
  });

  it('contains every parameter the solve accepts on a dense grid', () => {
    const sample = createOrbitSample();
    let accepted = 0;
    const steps = 1200;
    for (let i = 0; i < steps; i += 1) {
      const re = -2.1 + (2.7 * (i + 0.5)) / steps;
      for (let j = 0; j < steps; j += 1) {
        const im = -1.3 + (2.6 * (j + 0.5)) / steps;
        if (classifyPeriodFourInto(re, im, sample)) {
          accepted += 1;
          if (!inPeriodFourGate(re, im)) {
            throw new Error(`accepted outside the gate at ${re} + ${im}i`);
          }
        }
      }
    }
    // The six period-4 components on this 1200 x 1200 grid.
    expect(accepted).toBe(4782);
  });

  it('contains every accepted parameter on a fine grid around each box', () => {
    const sample = createOrbitSample();
    const steps = 300;
    for (const box of PERIOD_FOUR_BOXES) {
      // The box, widened by half its size on every side, in both half-planes.
      const reWidth = box.reMax - box.reMin;
      const imWidth = box.absImMax - box.absImMin;
      const reLow = box.reMin - 0.5 * reWidth;
      const imLow = Math.max(0, box.absImMin - 0.5 * imWidth);
      const imHigh = box.absImMax + 0.5 * imWidth;
      let accepted = 0;
      for (let i = 0; i < steps; i += 1) {
        const re = reLow + (2 * reWidth * (i + 0.5)) / steps;
        for (let j = 0; j < steps; j += 1) {
          const absIm = imLow + ((imHigh - imLow) * (j + 0.5)) / steps;
          for (const im of [absIm, -absIm]) {
            if (!classifyPeriodFourInto(re, im, sample)) continue;
            accepted += 1;
            if (!inPeriodFourGate(re, im)) {
              throw new Error(`accepted outside the gate at ${re} + ${im}i`);
            }
          }
        }
      }
      expect(accepted).toBeGreaterThan(0);
    }
  });

  it('refuses the solve just outside every box edge', () => {
    const sample = createOrbitSample();
    const samples = 4000;
    for (const box of PERIOD_FOUR_BOXES) {
      const reStep = (box.reMax - box.reMin) / samples;
      const imStep = (box.absImMax - box.absImMin) / samples;
      for (let k = 0; k <= samples; k += 1) {
        const re = box.reMin + k * reStep;
        const absIm = box.absImMin + k * imStep;
        const outside: (readonly [number, number])[] = [
          [re, box.absImMax + 1e-9],
          [box.reMin - 1e-9, absIm],
          [box.reMax + 1e-9, absIm],
        ];
        if (box.absImMin > 0) outside.push([re, box.absImMin - 1e-9]);
        for (const [cRe, cIm] of outside) {
          expect(classifyPeriodFourInto(cRe, cIm, sample)).toBe(false);
          expect(classifyPeriodFourInto(cRe, -cIm, sample)).toBe(false);
        }
      }
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/domain/period-four-gate.test.ts`
Expected: FAIL (`inPeriodFourGate is not a function`).

- [ ] **Step 3: Write the module**

Create `src/domain/period-four-gate.ts`:

```ts
/**
 * Speed gate for the analytic period-4 fast path (ADR 0013): padded bounding
 * boxes of the six period-4 hyperbolic components, as data.
 *
 * Provenance: poc/performance/h-p3p4/boxes.ts traced each component's
 * boundary (lambda = e^{i theta}, 4096 angles, Newton-continued from the
 * Gleason centre) and padded each box by 2% of its larger side
 * (boxes.json). Conjugate pairs are folded through |Im c|, so the six
 * components need four boxes; each folded box is the union of the pair's
 * boxes.
 *
 * The gate decides only whether the cubic solve is tried. It must contain
 * every parameter the solve accepts; then it changes speed, never answers.
 * tests/unit/domain/period-four-gate.test.ts checks that on dense grids and
 * along every box edge (measured, not proved). Every accepted parameter lies
 * in a period-4 hyperbolic component (proved: section 12.2), so the gate
 * only has to contain the six components.
 */

export interface PeriodFourBox {
  readonly reMin: number;
  readonly reMax: number;
  /** Bounds on |Im c|. */
  readonly absImMin: number;
  readonly absImMax: number;
}

/** The 1/4 and 3/4 satellites of the main cardioid (centre 0.2823 ± 0.5301i). */
export const CARDIOID_SATELLITE_BOX: PeriodFourBox = Object.freeze({
  reMin: 0.23529958578850574,
  reMax: 0.32682245620675104,
  absImMin: 0.48530870690834227,
  absImMax: 0.5768264028817619,
});

/** The primitive pair off the axis (centre -0.1565 ± 1.0322i). */
export const COMPLEX_PRIMITIVE_BOX: PeriodFourBox = Object.freeze({
  reMin: -0.16288539392175883,
  reMax: -0.15226407057808444,
  absImMin: 1.0270921619889395,
  absImMax: 1.0381904413114849,
});

/** The 1/2 satellite of the period-2 bulb, on the real axis (centre -1.3107). */
export const BULB_SATELLITE_BOX: PeriodFourBox = Object.freeze({
  reMin: -1.3704609181790832,
  reMax: -1.247638021212175,
  absImMin: 0,
  absImMax: 0.06136520988414045,
});

/** The primitive component on the real axis (centre -1.9408). */
export const REAL_PRIMITIVE_BOX: PeriodFourBox = Object.freeze({
  reMin: -1.9415634026360422,
  reMax: -1.940401662163363,
  absImMin: 0,
  absImMax: 0.0006668835570036569,
});

export const PERIOD_FOUR_BOXES: readonly PeriodFourBox[] = Object.freeze([
  CARDIOID_SATELLITE_BOX,
  COMPLEX_PRIMITIVE_BOX,
  BULB_SATELLITE_BOX,
  REAL_PRIMITIVE_BOX,
]);

/**
 * True when c lies in a period-4 box. NaN and infinite input give false
 * (every comparison with NaN is false; infinities fail the bounds).
 *
 * Straight-line on purpose: the scalar kernel inlines this test into its
 * orbit loop. The row kernel does not call it: it evaluates the same test
 * once per row as two windows on Re c (src/render/triggered-rows.ts), because
 * the off-axis boxes' |Im c| bands are disjoint from each other and from the
 * axis band, and on the axis only the two real boxes overlap in |Im c|
 * (tests/unit/domain/period-four-gate.test.ts checks this).
 */
export const inPeriodFourGate = (cRe: number, cIm: number): boolean => {
  const absIm = cIm < 0 ? -cIm : cIm;
  return (
    (cRe >= BULB_SATELLITE_BOX.reMin &&
      cRe <= BULB_SATELLITE_BOX.reMax &&
      absIm <= BULB_SATELLITE_BOX.absImMax) ||
    (cRe >= REAL_PRIMITIVE_BOX.reMin &&
      cRe <= REAL_PRIMITIVE_BOX.reMax &&
      absIm <= REAL_PRIMITIVE_BOX.absImMax) ||
    (cRe >= CARDIOID_SATELLITE_BOX.reMin &&
      cRe <= CARDIOID_SATELLITE_BOX.reMax &&
      absIm >= CARDIOID_SATELLITE_BOX.absImMin &&
      absIm <= CARDIOID_SATELLITE_BOX.absImMax) ||
    (cRe >= COMPLEX_PRIMITIVE_BOX.reMin &&
      cRe <= COMPLEX_PRIMITIVE_BOX.reMax &&
      absIm >= COMPLEX_PRIMITIVE_BOX.absImMin &&
      absIm <= COMPLEX_PRIMITIVE_BOX.absImMax)
  );
};
```

In `src/domain/index.ts`, directly after the line `export type { PeriodThreeBox } from './period-three-gate';`, insert:

```ts
export {
  BULB_SATELLITE_BOX,
  CARDIOID_SATELLITE_BOX,
  COMPLEX_PRIMITIVE_BOX,
  inPeriodFourGate,
  PERIOD_FOUR_BOXES,
  REAL_PRIMITIVE_BOX,
} from './period-four-gate';
export type { PeriodFourBox } from './period-four-gate';
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/domain/period-four-gate.test.ts`
Expected: PASS, 8 tests (the global grid count is exactly 4,782; about two seconds).

- [ ] **Step 5: Repository gates**

Run: `npm run check`
Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add src/domain/period-four-gate.ts src/domain/index.ts tests/unit/domain/period-four-gate.test.ts
git commit -m "$(cat <<'EOF'
Domain: period-4 component boxes and straight-line gate (ADR 0013)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: An independent double-double period-4 adjudicator

**Files:**

- Modify: `tests/unit/domain/dd-oracle.ts` (`ddPeriodThreeCycle` becomes a call of the new `ddPeriodicCycle`; new `ddPeriodFourCycle`)
- Test: `tests/unit/domain/dd-period-four.test.ts`

**Interfaces:**

- Consumes: `ddVerifyCycle`, `DDOracleVerdict`, `DD_PERIOD_THREE_OPTIONS` (existing, same file).
- Produces: `ddPeriodicCycle(cRe: number, cIm: number, period: number): DDOracleVerdict`; `ddPeriodThreeCycle(cRe, cIm)` (unchanged behaviour: it is `ddPeriodicCycle(cRe, cIm, 3)`); `ddPeriodFourCycle(cRe: number, cIm: number): DDOracleVerdict`. Used by Tasks 6, 7 and 10.

The oracle uses no cubic: a binary64 critical-orbit seed (4,096 iterations), then dd Newton on f⁴(z) − z from each of the next four orbit points, the dd divisor test and dd |λ| < 1. Measured during planning: it certifies period 4 at all 51,042 parameters the period-4 path accepts on dense grids over the boxes, cusp rings and the 6,000,000× view, with |λ̃ − λ_dd| at most 4.5·10⁻³ of the certificate's allowance.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/domain/dd-period-four.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { ddPeriodFourCycle, ddPeriodThreeCycle } from './dd-oracle';

/**
 * The dd period-4 adjudicator (ADR 0013) uses no cubic: a binary64 orbit
 * seed, dd Newton on f_c^4(z) - z, dd divisor and attraction checks.
 * Expected moduli are mpmath values of the smallest root of the exact cubic
 * at the same binary64 parameters
 * (docs/superpowers/plans/2026-10-17-analytic-period-four.md).
 */
const certifiedMagnitude = (re: number, im: number): number => {
  const verdict = ddPeriodFourCycle(re, im);
  if (verdict.status !== 'attracting-cycle') {
    throw new Error(`not certified at ${re} + ${im}i: ${verdict.status}`);
  }
  expect(verdict.cycle.primitive).toBe(4);
  return verdict.cycle.magnitude;
};

describe('ddPeriodFourCycle', () => {
  it('certifies period 4 at the superattracting centres', () => {
    expect(certifiedMagnitude(-1.310702641336833, 0)).toBeLessThan(1e-12);
    expect(certifiedMagnitude(0.2822713907669139, 0.5300606175785253)).toBeLessThan(1e-12);
    expect(certifiedMagnitude(-0.15652016683375505, -1.0322471089228318)).toBeLessThan(1e-12);
  });

  it('agrees with the cubic near the satellite root, the cusp and a component boundary', () => {
    const cases: readonly (readonly [number, number, number])[] = [
      [-1.250000001, 0, 0.9999999839999987],
      [-1.2500001, 0, 0.9999983999999223],
      [-1.9405507890761495, 0, 0.9993690302622427],
      [0.2893305340939819, 0.48782915322182385, 0.9999999989999996],
      [-0.158902249, -1.034028, 0.5583390902919884],
    ];
    for (const [re, im, magnitude] of cases) {
      expect(Math.abs(certifiedMagnitude(re, im) - magnitude)).toBeLessThan(1e-12);
    }
  });

  it('does not certify period 4 inside period-8 satellites', () => {
    for (const [re, im] of [
      [-1.369, 0],
      [0.32484, 0.56386],
    ] as const) {
      const verdict = ddPeriodFourCycle(re, im);
      expect(verdict.status === 'attracting-cycle' && verdict.cycle.primitive === 4).toBe(false);
    }
  });

  it('reports the escape of an exterior parameter', () => {
    expect(ddPeriodFourCycle(2.5, 1)).toEqual({ status: 'escaped', escapeIteration: 1 });
  });

  it('reduces a fixed point and a 2-cycle through the dd divisor test', () => {
    for (const [re, primitive] of [
      [0, 1],
      [-1, 2],
    ] as const) {
      const verdict = ddPeriodFourCycle(re, 0);
      expect(verdict.status).toBe('attracting-cycle');
      if (verdict.status === 'attracting-cycle') {
        expect(verdict.cycle.primitive).toBe(primitive);
      }
    }
  });

  it('leaves the period-3 adjudicator unchanged', () => {
    const verdict = ddPeriodThreeCycle(-0.1205, 0.8268);
    expect(verdict.status === 'attracting-cycle' && verdict.cycle.primitive).toBe(3);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/domain/dd-period-four.test.ts`
Expected: FAIL (`ddPeriodFourCycle is not a function`).

- [ ] **Step 3: Implement**

In `tests/unit/domain/dd-oracle.ts`, replace everything from the line `/**` that opens the comment ` * Independent check of an analytic period-3 claim. It uses no closed form:` down to the end of the file (the whole `ddPeriodThreeCycle` comment and function) with:

```ts
/**
 * Independent check of an analytic period-p claim (p = 3: ADR 0010; p = 4:
 * ADR 0013). It uses no closed form and no cubic: the binary64 critical
 * orbit runs DD_PERIOD_THREE_OPTIONS.seedIterations steps (a seed only; an
 * escape is reported as escaped), then each of the next p iterates is
 * polished as a period-p cycle start by dd Newton on f_c^p(z) - z and
 * certified by ddCertifiedCycle (dd divisor test, dd |lambda| < 1). The first
 * certified cycle is returned. Unlike classifyDDMinimal it needs no orbit
 * convergence, so it reaches cycles with |lambda| near 1 that no iteration
 * budget can.
 *
 * It is an adjudicator, not a classifier: its |lambda| < 1 test has no
 * margin, so at a parabolic parameter it can certify |lambda| = 1 - O(1e-12)
 * (at c = -7/4 it reports 1 - 1.4e-12). Callers compare its multiplier with
 * the analytic one within 1e-12, and the analytic paths refuse there.
 */
export const ddPeriodicCycle = (cRe: number, cIm: number, period: number): DDOracleVerdict => {
  let zRe = 0;
  let zIm = 0;
  for (let iteration = 1; iteration <= DD_PERIOD_THREE_OPTIONS.seedIterations; iteration += 1) {
    const nextRe = zRe * zRe - zIm * zIm + cRe;
    zIm = 2 * zRe * zIm + cIm;
    zRe = nextRe;
    if (zRe * zRe + zIm * zIm > 4) {
      return { status: 'escaped', escapeIteration: iteration };
    }
  }
  for (let phase = 0; phase < period; phase += 1) {
    const cycle = ddVerifyCycle(
      cRe,
      cIm,
      { re: { hi: zRe, lo: 0 }, im: { hi: zIm, lo: 0 } },
      period,
      DD_PERIOD_THREE_OPTIONS.newtonSteps,
    );
    if (cycle !== undefined) {
      return { status: 'attracting-cycle', cycle };
    }
    const nextRe = zRe * zRe - zIm * zIm + cRe;
    zIm = 2 * zRe * zIm + cIm;
    zRe = nextRe;
  }
  return { status: 'unresolved' };
};

/** The period-3 adjudicator (ADR 0010). */
export const ddPeriodThreeCycle = (cRe: number, cIm: number): DDOracleVerdict =>
  ddPeriodicCycle(cRe, cIm, 3);

/** The period-4 adjudicator (ADR 0013). */
export const ddPeriodFourCycle = (cRe: number, cIm: number): DDOracleVerdict =>
  ddPeriodicCycle(cRe, cIm, 4);
```

Keep the `DD_PERIOD_THREE_OPTIONS` declaration above it unchanged.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/domain/dd-period-four.test.ts tests/unit/domain/dd-period-three.test.ts tests/unit/domain/orbit-oracle-adjudication.test.ts`
Expected: PASS (6 new tests; the period-3 suites are unchanged by the refactor).

- [ ] **Step 5: Repository gates**

Run: `npm run check`
Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add tests/unit/domain/dd-oracle.ts tests/unit/domain/dd-period-four.test.ts
git commit -m "$(cat <<'EOF'
Tests: dd period-4 adjudicator, independent of the cubic (ADR 0013)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Tools for the before/after comparison (the baseline commit)

This commit is the **baseline** for Tasks 10 and 11: the kernels are still unchanged here, and every tool those tasks run exists in it. Its subject line is looked up later with `git log --grep`, so keep it verbatim.

**Files:**

- Modify: `tools/benchmark/overhead-entry.ts` (`timeCase` gains a `stride` argument)
- Modify: `tools/benchmark/fallback-overhead.ts` (`--stride`)
- Modify: `tools/kernel_pixel_dump.ts` (`--raster`, `--cases`; `PixelDump.raster` becomes a `RasterSize`)
- Create: `tools/adjudicate_period_four.ts`
- Modify: `package.json` (script `evidence:period-four`), `tsconfig.node.json` (include the tool)

**Interfaces:**

- Consumes: `classifyPeriodFourInto`, `PeriodFourCertificate` (Task 3); `ddPeriodFourCycle` (Task 5); `colorizeFrame` (`src/render/colorize.ts`); `SemanticFrame` (`src/render/renderer.ts`); `PACK_PERIOD_BITS`, `PACK_PERIOD_MAX` (`src/render/packed-semantic.ts`); `loadCorpusCases` (`tools/benchmark/judge/corpus.ts`).
- Produces:
  - `timeCase(caseId: string, size: RasterSize, stride = 1): Promise<number>`; `node tools/benchmark/fallback-overhead.ts <baseline.js> <candidate.js> [--reps N] [--raster WxH] [--cases id,id] [--stride S] [--out file.json]`; the JSON rows gain `stride`.
  - `dumpPixels(raster: RasterSize = DUMP_RASTER, caseIds?: readonly string[]): Promise<PixelDump>`; `npm run fixtures:pixel-dump -- <out.json> [--raster WxH] [--cases id,id]`.
  - `npm run evidence:period-four -- <before.json> <after.json> <out-dir>`: writes `raw-observations.json` and `semantic-comparison.json`, prints the summary tables, exits 1 if any changed pixel is unsupported or the changed set differs from the analytic answer set. It adjudicates every corpus case the after dump holds, at the dump's raster.

- [ ] **Step 1: The coarse-pass stride in the overhead entry**

In `tools/benchmark/overhead-entry.ts`, replace:

```ts
/** Wall time in ms of one stable-pass classification of a corpus case. */
export const timeCase = async (caseId: string, size: RasterSize): Promise<number> => {
```

with:

```ts
/**
 * Wall time in ms of one classification pass of a corpus case: the stable
 * pass (stride 1, the two-lane row kernel) by default, or a coarse pass
 * (stride > 1, the scalar kernel).
 */
export const timeCase = async (caseId: string, size: RasterSize, stride = 1): Promise<number> => {
```

and, in the same function's `classifyRows` call, replace:

```ts
    quality,
    1,
    0,
    size.height,
```

with:

```ts
    quality,
    stride,
    0,
    size.height,
```

- [ ] **Step 2: `--stride` in the benchmark driver**

In `tools/benchmark/fallback-overhead.ts` make five edits.

Replace:

```ts
 * Usage:
 *   node tools/benchmark/fallback-overhead.ts <baseline.js> <candidate.js>
 *     [--reps N] [--raster WxH] [--cases id,id] [--out file.json]
```

with:

```ts
 * Usage:
 *   node tools/benchmark/fallback-overhead.ts <baseline.js> <candidate.js>
 *     [--reps N] [--raster WxH] [--cases id,id] [--stride S] [--out file.json]
 * --stride 1 (the default) times the stable pass (the two-lane row kernel);
 * a larger stride times a coarse pass (the scalar kernel). Both arms must
 * accept the stride argument (tools/benchmark/overhead-entry.ts).
```

Replace:

```ts
    size: { readonly width: number; readonly height: number },
  ) => Promise<number>;
```

with:

```ts
    size: { readonly width: number; readonly height: number },
    stride?: number,
  ) => Promise<number>;
```

Replace:

```ts
const cases = (option('--cases') ?? DEFAULT_CASES.join(',')).split(',');
```

with:

```ts
const cases = (option('--cases') ?? DEFAULT_CASES.join(',')).split(',');
const stride = Number(option('--stride') ?? '1');
if (!Number.isInteger(stride) || stride < 1) {
  throw new RangeError('--stride must be a positive integer');
}
```

Replace:

```ts
      const ms = await arm.timeCase(caseId, size);
```

with:

```ts
      const ms = await arm.timeCase(caseId, size, stride);
```

Replace:

```ts
    reps,
    raster: size,
```

with:

```ts
    reps,
    raster: size,
    stride,
```

- [ ] **Step 3: Raster and case options in the pixel dump**

In `tools/kernel_pixel_dump.ts` make seven edits.

Replace:

```ts
 * Usage: npm run fixtures:pixel-dump -- <out.json>
 */
```

with:

```ts
 * Usage: npm run fixtures:pixel-dump -- <out.json> [--raster WxH] [--cases id,id]
 * --raster and --cases select another raster (the shipping 1024x640 for the
 * deep-view check) and a subset of the corpus.
 */
```

Replace:

```ts
import { classifyRows } from '../src/render/classify-rows';
```

with:

```ts
import type { RasterSize } from '../src/domain';
import { classifyRows } from '../src/render/classify-rows';
```

Replace:

```ts
  readonly raster: typeof DUMP_RASTER;
```

with:

```ts
  readonly raster: RasterSize;
```

Replace:

```ts
export const dumpPixels = async (): Promise<PixelDump> => {
  const cases: Record<string, PixelDumpCase> = {};
  for (const corpusCase of loadCorpusCases()) {
```

with:

```ts
export const dumpPixels = async (
  raster: RasterSize = DUMP_RASTER,
  caseIds?: readonly string[],
): Promise<PixelDump> => {
  const cases: Record<string, PixelDumpCase> = {};
  for (const corpusCase of loadCorpusCases()) {
    if (caseIds !== undefined && !caseIds.includes(corpusCase.id)) continue;
```

Replace `      { viewport: corpusCase.viewport, size: DUMP_RASTER, quality },` with `      { viewport: corpusCase.viewport, size: raster, quality },`, and in the same call replace `      DUMP_RASTER.height,` with `      raster.height,`.

Replace:

```ts
  return { schemaVersion: 1, raster: DUMP_RASTER, commit, cases };
```

with:

```ts
  return { schemaVersion: 1, raster, commit, cases };
```

Replace the body of `main`:

```ts
  const target = process.argv[2];
  if (target === undefined) {
    process.stderr.write('usage: npm run fixtures:pixel-dump -- <out.json>\n');
    process.exit(2);
  }
  // Resolved from the repo root (npm runs scripts there).
  writeFileSync(path.resolve(process.cwd(), target), `${JSON.stringify(await dumpPixels())}\n`);
```

with:

```ts
  const args = process.argv.slice(2);
  const target = args[0];
  if (target === undefined) {
    process.stderr.write(
      'usage: npm run fixtures:pixel-dump -- <out.json> [--raster WxH] [--cases id,id]\n',
    );
    process.exit(2);
  }
  const option = (name: string): string | undefined => {
    const index = args.indexOf(name);
    return index === -1 ? undefined : args[index + 1];
  };
  const rasterText = option('--raster');
  const match = rasterText === undefined ? null : /^(\d+)x(\d+)$/.exec(rasterText);
  if (rasterText !== undefined && match === null) {
    throw new RangeError('--raster must look like 1024x640');
  }
  const raster =
    match === null ? DUMP_RASTER : { width: Number(match[1]), height: Number(match[2]) };
  const caseIds = option('--cases')?.split(',');
  // Resolved from the repo root (npm runs scripts there).
  writeFileSync(
    path.resolve(process.cwd(), target),
    `${JSON.stringify(await dumpPixels(raster, caseIds))}\n`,
  );
```

`tools/adjudicate_period_three.ts` keeps compiling: it reads the raster from the dump and passes it where a `RasterSize` is expected.

- [ ] **Step 4: The period-4 adjudication tool**

Create `tools/adjudicate_period_four.ts` (it follows `tools/adjudicate_period_three.ts`; the differences are the oracle, the allowance-based tolerance, the unresolved tally, and that it adjudicates whichever corpus cases the dumps hold):

```ts
/**
 * Oracle adjudication of every pixel the analytic period-4 path changed
 * (ADR 0007 intended-change rule; ADR 0013). Compares two pixel dumps of the
 * golden raster (tools/kernel_pixel_dump.ts), before and after the change,
 * and checks every changed pixel against the dd period-4 cycle
 * (tests/unit/domain/dd-oracle.ts ddPeriodFourCycle: dd Newton and dd
 * certification, no cubic). Also tallies the unresolved pixels of every case
 * before and after (the deep-view check of the 6,000,000x view). It reads the
 * raster from the dumps and adjudicates every corpus case the after dump
 * holds.
 *
 * Usage: npm run evidence:period-four -- <before.json> <after.json> <out-dir>
 * Writes <out-dir>/raw-observations.json and <out-dir>/semantic-comparison.json
 * and prints the summary tables. Exits 1 if any changed pixel is unsupported.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  classifyPeriodFourInto,
  createOrbitSample,
  createViewportTransform,
  type OrbitSample,
  type PeriodFourCertificate,
} from '../src/domain';
import { prepareRealColumns, preparedRowImaginary } from '../src/render/classify-rows';
import { colorizeFrame } from '../src/render/colorize';
import type { SemanticFrame } from '../src/render/renderer';
import { PACK_PERIOD_BITS, PACK_PERIOD_MAX } from '../src/render/packed-semantic';
import { ddPeriodFourCycle } from '../tests/unit/domain/dd-oracle';
import { loadCorpusCases } from './benchmark/judge/corpus';
import type { PixelDump, PixelDumpCase } from './kernel_pixel_dump';

/**
 * Complex distance allowed between the analytic and the dd multiplier, on
 * top of the certificate's own allowance (dd rounding and dd Newton error).
 */
export const ADJUDICATION_TOLERANCE = 1e-12;

const UNRESOLVED_WORD = 3 << PACK_PERIOD_BITS;
const ATTRACTING_P4_WORD = (2 << PACK_PERIOD_BITS) | 4;
const STATUS_NAMES: Readonly<Record<number, string>> = {
  1: 'escaped',
  2: 'attracting',
  3: 'unresolved',
};

const describeWord = (word: number): string => {
  const status = STATUS_NAMES[word >>> PACK_PERIOD_BITS] ?? 'unknown';
  return status === 'attracting' ? `attracting-p${String(word & PACK_PERIOD_MAX)}` : status;
};

/** |m1 e^{i a1} - m2 e^{i a2}|. */
const distance = (m1: number, a1: number, m2: number, a2: number): number =>
  Math.hypot(m1 * Math.cos(a1) - m2 * Math.cos(a2), m1 * Math.sin(a1) - m2 * Math.sin(a2));

interface Pixel {
  readonly word: number;
  readonly magnitude: number;
  readonly angle: number;
}

const pixelAt = (dump: PixelDumpCase, offset: number): Pixel => ({
  word: dump.packedStatusPeriod[offset] ?? -1,
  magnitude: dump.smoothIterationOrMultiplierMagnitude[offset] ?? Number.NaN,
  angle: dump.multiplierAngle[offset] ?? Number.NaN,
});

const samePixel = (a: Pixel, b: Pixel): boolean =>
  a.word === b.word && Object.is(a.magnitude, b.magnitude) && Object.is(a.angle, b.angle);

interface Verdict {
  readonly analyticError: number | null;
  readonly beforeError: number | null;
  readonly allowance: number;
  readonly supported: boolean;
}

const emptyCertificate = (): PeriodFourCertificate => ({
  productRe: Number.NaN,
  productIm: Number.NaN,
  residualBound: Number.NaN,
  derivativeBound: Number.NaN,
  curvatureBound: Number.NaN,
  radiusRatio: Number.NaN,
  allowance: Number.NaN,
  certified: false,
});

/**
 * Supported: the new answer is exactly the analytic period-4 record at c,
 * and the dd period-4 cycle certifies period 4 with a multiplier within the
 * certificate's allowance plus ADJUDICATION_TOLERANCE of it.
 */
const adjudicate = (
  cRe: number,
  cIm: number,
  before: Pixel,
  after: Pixel,
  sample: OrbitSample,
): Verdict => {
  const certificate = emptyCertificate();
  const matchesAnalytic =
    classifyPeriodFourInto(cRe, cIm, sample, certificate) &&
    after.word === ATTRACTING_P4_WORD &&
    Object.is(sample.multiplierMagnitude, after.magnitude) &&
    Object.is(sample.multiplierAngle, after.angle);
  const oracle = ddPeriodFourCycle(cRe, cIm);
  if (oracle.status !== 'attracting-cycle' || oracle.cycle.primitive !== 4) {
    return {
      analyticError: null,
      beforeError: null,
      allowance: certificate.allowance,
      supported: false,
    };
  }
  const { magnitude, angle } = oracle.cycle;
  const analyticError = distance(after.magnitude, after.angle, magnitude, angle);
  const beforeError =
    before.word === ATTRACTING_P4_WORD
      ? distance(before.magnitude, before.angle, magnitude, angle)
      : null;
  return {
    analyticError,
    beforeError,
    allowance: certificate.allowance,
    supported: matchesAnalytic && analyticError <= certificate.allowance + ADJUDICATION_TOLERANCE,
  };
};

type Row = [number, number, number, number, number | null, number | null, number];

const frameOf = (dump: PixelDump, data: PixelDumpCase): SemanticFrame => ({
  stage: 'stable',
  size: dump.raster,
  sampleStride: 1,
  progress: 1,
  bands: [
    {
      y0: 0,
      y1: dump.raster.height,
      packedStatusPeriod: Uint32Array.from(data.packedStatusPeriod),
      smoothIterationOrMultiplierMagnitude: Float64Array.from(
        data.smoothIterationOrMultiplierMagnitude,
      ),
      multiplierAngle: Float64Array.from(data.multiplierAngle),
    },
  ],
});

/**
 * Pixels whose colorized RGBA differs between the dumps, per semantic view,
 * split into status changes and multiplier-only changes.
 */
const colorChanges = (
  before: PixelDump,
  after: PixelDump,
  beforeCase: PixelDumpCase,
  afterCase: PixelDumpCase,
): Record<string, { statusChanged: number; multiplierOnly: number }> => {
  const result: Record<string, { statusChanged: number; multiplierOnly: number }> = {};
  for (const view of ['stability', 'multiplier', 'period'] as const) {
    const old = colorizeFrame(frameOf(before, beforeCase), view);
    const now = colorizeFrame(frameOf(after, afterCase), view);
    const counts = { statusChanged: 0, multiplierOnly: 0 };
    for (let pixel = 0; pixel < beforeCase.packedStatusPeriod.length; pixel += 1) {
      const o = 4 * pixel;
      if (
        old[o] === now[o] &&
        old[o + 1] === now[o + 1] &&
        old[o + 2] === now[o + 2] &&
        old[o + 3] === now[o + 3]
      ) {
        continue;
      }
      if (beforeCase.packedStatusPeriod[pixel] === afterCase.packedStatusPeriod[pixel]) {
        counts.multiplierOnly += 1;
      } else {
        counts.statusChanged += 1;
      }
    }
    result[view] = counts;
  }
  return result;
};

const countUnresolved = (data: PixelDumpCase): number =>
  data.packedStatusPeriod.reduce((count, word) => count + (word === UNRESOLVED_WORD ? 1 : 0), 0);

/** The tables summary.md quotes, from semantic-comparison.json. */
const printSummary = (comparison: {
  readonly transitionsByCase: Record<string, Record<string, number>>;
  readonly colorChangesByCase: Record<string, ReturnType<typeof colorChanges>>;
  readonly unresolvedByCase: Record<string, { before: number; after: number }>;
  readonly changedPixels: number;
  readonly unsupportedPixels: number;
  readonly maxAnalyticError: number;
  readonly maxBeforeError: number;
  readonly maxAllowance: number;
  readonly maxErrorToAllowance: number;
}): void => {
  process.stdout.write('| Case | Transition | Pixels |\n| --- | --- | ---: |\n');
  for (const [caseId, tally] of Object.entries(comparison.transitionsByCase)) {
    for (const [transition, count] of Object.entries(tally)) {
      process.stdout.write(`| ${caseId} | ${transition} | ${String(count)} |\n`);
    }
  }
  process.stdout.write(
    '\n| Case | View | Colour changed: status | Colour changed: multiplier only |\n',
  );
  process.stdout.write('| --- | --- | ---: | ---: |\n');
  for (const [caseId, views] of Object.entries(comparison.colorChangesByCase)) {
    for (const [view, counts] of Object.entries(views)) {
      if (counts.statusChanged + counts.multiplierOnly === 0) continue;
      process.stdout.write(
        `| ${caseId} | ${view} | ${String(counts.statusChanged)} | ${String(counts.multiplierOnly)} |\n`,
      );
    }
  }
  process.stdout.write(
    '\n| Case | Unresolved before | Unresolved after |\n| --- | ---: | ---: |\n',
  );
  for (const [caseId, counts] of Object.entries(comparison.unresolvedByCase)) {
    if (counts.before === counts.after) continue;
    process.stdout.write(`| ${caseId} | ${String(counts.before)} | ${String(counts.after)} |\n`);
  }
  process.stdout.write(
    `\nchanged ${String(comparison.changedPixels)}, unsupported ${String(comparison.unsupportedPixels)}, ` +
      `max analytic error ${comparison.maxAnalyticError.toExponential(2)}, ` +
      `max allowance ${comparison.maxAllowance.toExponential(2)}, ` +
      `max error/allowance ${comparison.maxErrorToAllowance.toExponential(2)}, ` +
      `max orbit-product error before ${comparison.maxBeforeError.toExponential(2)}\n`,
  );
};

const parseArguments = (): { beforePath: string; afterPath: string; outDir: string } => {
  const [beforePath, afterPath, outDir] = process.argv.slice(2);
  if (beforePath === undefined || afterPath === undefined || outDir === undefined) {
    process.stderr.write(
      'usage: npm run evidence:period-four -- <before.json> <after.json> <out-dir>\n',
    );
    process.exit(2);
  }
  return { beforePath, afterPath, outDir };
};

// eslint-disable-next-line complexity -- one pass over every pixel of every case; the branches are the tallies
const main = (): void => {
  const { beforePath, afterPath, outDir } = parseArguments();
  const before = JSON.parse(readFileSync(path.resolve(beforePath), 'utf8')) as PixelDump;
  const after = JSON.parse(readFileSync(path.resolve(afterPath), 'utf8')) as PixelDump;
  const { width, height } = after.raster;
  const sample = createOrbitSample();
  const rows: Record<string, Row[]> = {};
  const transitions: Record<string, Record<string, number>> = {};
  const colors: Record<string, ReturnType<typeof colorChanges>> = {};
  const unresolved: Record<string, { before: number; after: number }> = {};
  const unsupported: string[] = [];
  let changed = 0;
  let analyticAnswered = 0;
  const outsideChanged: string[] = [];
  let maxAnalyticError = 0;
  let maxBeforeError = 0;
  let maxAllowance = 0;
  let maxErrorToAllowance = 0;

  // Every corpus case the after dump holds (all of them at the golden
  // raster; a subset for the deep-view check at the shipping raster).
  const cases = loadCorpusCases().filter((candidate) => after.cases[candidate.id] !== undefined);
  for (const corpusCase of cases) {
    const beforeCase = before.cases[corpusCase.id];
    const afterCase = after.cases[corpusCase.id];
    if (beforeCase === undefined || afterCase === undefined) {
      throw new Error(`dump lacks ${corpusCase.id}`);
    }
    unresolved[corpusCase.id] = {
      before: countUnresolved(beforeCase),
      after: countUnresolved(afterCase),
    };
    const transform = createViewportTransform(corpusCase.viewport, after.raster);
    const columns = new Float64Array(width);
    prepareRealColumns(transform, width, 1, columns);
    const caseRows: Row[] = [];
    const tally: Record<string, number> = {};
    for (let y = 0; y < height; y += 1) {
      const cIm = preparedRowImaginary(transform, height, 1, y);
      for (let x = 0; x < width; x += 1) {
        const offset = y * width + x;
        const old = pixelAt(beforeCase, offset);
        const now = pixelAt(afterCase, offset);
        const cRe = columns[x] ?? Number.NaN;
        const answeredAnalytically = classifyPeriodFourInto(cRe, cIm, sample);
        if (answeredAnalytically) analyticAnswered += 1;
        if (samePixel(old, now)) {
          // An unchanged pixel must lie outside the analytic path's answers.
          if (answeredAnalytically)
            outsideChanged.push(`${corpusCase.id} (${String(x)}, ${String(y)})`);
          continue;
        }
        changed += 1;
        const transition = `${describeWord(old.word)} -> ${describeWord(now.word)}`;
        tally[transition] = (tally[transition] ?? 0) + 1;
        const verdict = adjudicate(cRe, cIm, old, now, sample);
        if (!verdict.supported) unsupported.push(`${corpusCase.id} (${String(x)}, ${String(y)})`);
        maxAnalyticError = Math.max(maxAnalyticError, verdict.analyticError ?? 0);
        maxBeforeError = Math.max(maxBeforeError, verdict.beforeError ?? 0);
        maxAllowance = Math.max(maxAllowance, verdict.allowance);
        if (verdict.analyticError !== null) {
          maxErrorToAllowance = Math.max(
            maxErrorToAllowance,
            verdict.analyticError / verdict.allowance,
          );
        }
        caseRows.push([
          x,
          y,
          old.word,
          now.word,
          verdict.analyticError,
          verdict.beforeError,
          verdict.allowance,
        ]);
      }
    }
    transitions[corpusCase.id] = tally;
    colors[corpusCase.id] = colorChanges(before, after, beforeCase, afterCase);
    if (caseRows.length > 0) rows[corpusCase.id] = caseRows;
  }

  const raw = {
    schemaVersion: 1,
    description:
      'Every pixel whose stable-pass output changed at the golden raster (ADR 0013), with its dd adjudication. c is the golden-raster pixel centre of (x, y) for the corpus viewport (createViewportTransform, prepareRealColumns). Aggregates in semantic-comparison.json and summary.md are derived views.',
    raster: after.raster,
    beforeCommit: before.commit,
    afterCommit: after.commit,
    fields: ['x', 'y', 'beforeWord', 'afterWord', 'analyticError', 'beforeError', 'allowance'],
    fieldNotes: {
      beforeWord: 'packed status/period word before (poc-packed-1.0.0)',
      afterWord: 'packed status/period word after',
      analyticError: '|lambda_after - lambda_dd|; null when dd did not certify period 4',
      beforeError: '|lambda_before - lambda_dd| when the pixel was already period 4, else null',
      allowance: 'the certificate allowance A = 64 h + 2^-50 at c (PERFORMANCE-MATHEMATICS 12)',
    },
    statusWords: {
      [String(UNRESOLVED_WORD)]: 'unresolved',
      [String(ATTRACTING_P4_WORD)]: 'attracting-p4',
    },
    unsupported,
    cases: rows,
  };
  const comparison = {
    schemaVersion: 1,
    description:
      'Analytic period-4 path (ADR 0013): every pixel whose stable-pass output changed at the golden raster, adjudicated against the dd period-4 cycle',
    raster: after.raster,
    beforeCommit: before.commit,
    afterCommit: after.commit,
    tolerance: ADJUDICATION_TOLERANCE,
    changedPixels: changed,
    analyticAnsweredPixels: analyticAnswered,
    analyticAnsweredButUnchanged: outsideChanged,
    changedSetEqualsAnalyticSet: outsideChanged.length === 0 && analyticAnswered === changed,
    unsupportedPixels: unsupported.length,
    transitionsByCase: transitions,
    colorChangesByCase: colors,
    unresolvedByCase: unresolved,
    maxAnalyticError,
    maxBeforeError,
    maxAllowance,
    maxErrorToAllowance,
  };
  writeFileSync(path.join(outDir, 'raw-observations.json'), `${JSON.stringify(raw, null, 2)}\n`);
  writeFileSync(
    path.join(outDir, 'semantic-comparison.json'),
    `${JSON.stringify(comparison, null, 2)}\n`,
  );
  printSummary(comparison);
  process.stdout.write(
    `analytic path answered ${String(analyticAnswered)}, changed ${String(changed)}, answered but unchanged ${String(outsideChanged.length)}\n`,
  );
  if (!comparison.changedSetEqualsAnalyticSet) {
    process.stderr.write('changed pixel set differs from the analytic path answer set\n');
    process.exit(1);
  }
  if (unsupported.length > 0) process.exit(1);
};

main();
```

In `package.json`, add after the `"evidence:period-three"` script (mind the commas):

```json
    "evidence:period-four": "vite build --ssr tools/adjudicate_period_four.ts --outDir .evidence-build/period-four --emptyOutDir --logLevel warn && node .evidence-build/period-four/adjudicate_period_four.js",
```

In `tsconfig.node.json`, add `"tools/adjudicate_period_four.ts",` to the `include` array directly after `"tools/adjudicate_period_three.ts",`.

- [ ] **Step 5: Smoke-test the tools**

Run:

```bash
npx prettier --write tools/benchmark/overhead-entry.ts tools/benchmark/fallback-overhead.ts tools/kernel_pixel_dump.ts tools/adjudicate_period_four.ts package.json tsconfig.node.json
npm run lint && npm run typecheck
mkdir -p .evidence-build/h4/smoke-out
npm run fixtures:pixel-dump -- .evidence-build/h4/smoke.json --raster 64x40 --cases mi-easy-exterior-heavy
node -e 'const d = JSON.parse(require("fs").readFileSync(".evidence-build/h4/smoke.json", "utf8")); console.log(JSON.stringify(d.raster), Object.keys(d.cases).join(","))'
npm run evidence:period-four -- .evidence-build/h4/smoke.json .evidence-build/h4/smoke.json .evidence-build/h4/smoke-out; echo "exit $?"
```

Expected: lint and typecheck pass; `{"width":64,"height":40} mi-easy-exterior-heavy`; the tool prints `changed 0, unsupported 0, …` and `analytic path answered 0, changed 0, answered but unchanged 0`, then `exit 0`. (`.evidence-build/` is ignored by git.)

- [ ] **Step 6: Repository gates**

Run: `npm run check`
Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add tools/benchmark/overhead-entry.ts tools/benchmark/fallback-overhead.ts tools/kernel_pixel_dump.ts tools/adjudicate_period_four.ts package.json tsconfig.node.json
git commit -m "$(cat <<'EOF'
Tools: coarse-pass stride, dump raster, period-4 adjudicator (H4 baseline)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Wire the solve into both kernels; regenerate the goldens and baselines

This is the answer-changing commit (plan §3, ADR 0007): the kernels, every test that pins the old answers, the regenerated golden fixtures, the regenerated screenshot baselines, the in-repo oracle evidence (`period-four-golden-oracle.test.ts`), ADR 0013 and the semantic cache version land together. **One commit.**

**Files:**

- Modify: `src/domain/orbit-triggered.ts` (call site at the first scanning iteration; doc comment)
- Modify: `src/render/triggered-rows.ts` (imports, per-row windows, both lanes, module comment)
- Modify: `src/domain/orbit.ts` (doc comments only)
- Modify: `src/render/semantic-store.ts` (`SEMANTIC_ALGORITHM_VERSION` 3 → 4)
- Create: `tests/unit/domain/period-four-placement.test.ts`
- Create: `tests/unit/render/period-four-golden-oracle.test.ts`
- Create: `tests/unit/render/period-four-coarse.test.ts`
- Modify: `tests/unit/render/triggered-rows.test.ts` (six views, one edge test)
- Modify: `tests/unit/domain/orbit-scalar-parity.test.ts`, `tests/unit/domain/orbit-oracle-adjudication.test.ts`, `tests/unit/domain/verifier.test.ts`, `poc/performance/src/control.test.ts`
- Modify: `tsconfig.app.json` (exclude the golden-oracle test, like the period-3 one)
- Modify: `tools/generate_kernel_golden.ts` (`kernel` label); regenerate `fixtures/kernel-golden.v1.json` and `fixtures/colorized-golden.v1.json`
- Modify: `tests/visual/__screenshots__/{chromium,firefox}/{default-stability,period-four-126x-period,catalog-overlay}.png` (regenerated in the container)
- Create: `docs/decisions/0013-analytic-period-four.md`
- Modify: `docs/decisions/0010-analytic-period-three.md` (one pointer), `docs/PERFORMANCE-MATHEMATICS.md` (§12.8; §8 table; §9; §10), `fixtures/README.md` (the baseline note)

**Interfaces:**

- Consumes: `classifyPeriodFourInto`, `PeriodFourCertificate` (Task 3); `inPeriodFourGate`, the four boxes, `PERIOD_FOUR_BOXES` (Task 4); `ddPeriodFourCycle` (Task 5); `GOLDEN_RASTER` (`tools/generate_kernel_golden.ts`); `prepareRealColumns`, `preparedRowImaginary`, `classifyRows` (`src/render/classify-rows.ts`); `packStatusPeriod` (`src/render/packed-semantic.ts`).
- Produces: pixels inside a period-4 component, away from the cusps and the margin, carry `period 4`, `iterations 0`, evidence code 6 and the certified multiplier from every classifier entry point (scalar `classifyInto`, `OrbitClassifier`, `classifyOrbit`, the row kernel, the coarse and stable passes).

- [ ] **Step 1: Write the new failing tests**

Create `tests/unit/domain/period-four-placement.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { classifyOrbit, inPeriodFourGate } from '../../../src/domain';

/**
 * Where the period-4 cubic solve runs (ADR 0013): once per pixel, at the
 * first scanning iteration max(cycleWarmup, 2), before that iteration's
 * scan, exactly where the period-3 closed form runs. Pixels that escape
 * earlier never reach it.
 */
const CENTRE = { re: -1.310702641336833, im: 0 };
const ANALYTIC = {
  status: 'attracting-cycle',
  period: 4,
  iterations: 0,
  evidence: ['analytic-period-4-component'],
  evidenceSource: 'analytic',
};

describe('placement of the period-4 cubic solve', () => {
  it('runs at the first scanning iteration', () => {
    // scanStart = max(0, 2) = 2.
    expect(classifyOrbit(CENTRE, { maxIterations: 2, maxPeriod: 4, cycleWarmup: 0 })).toMatchObject(
      ANALYTIC,
    );
    // scanStart = 40, reached exactly at the end of the budget.
    expect(
      classifyOrbit(CENTRE, { maxIterations: 40, maxPeriod: 4, cycleWarmup: 40 }),
    ).toMatchObject(ANALYTIC);
  });

  it('does not run when the budget ends before the first scanning iteration', () => {
    expect(classifyOrbit(CENTRE, { maxIterations: 30, maxPeriod: 4, cycleWarmup: 40 })).toEqual({
      status: 'unresolved',
      iterations: 30,
      evidence: ['iteration-limit'],
    });
  });

  it('never answers for a pixel inside the gate that escapes first', () => {
    for (const [c, escapeIteration] of [
      [{ re: 0.235528, im: 0.570191 }, 18],
      [{ re: -0.152875, im: 1.02712 }, 21],
      [{ re: -1.37015, im: 0.0605981 }, 19],
      // Escapes at iteration 24 itself: the escape test comes first.
      [{ re: 0.239189, im: 0.567903 }, 24],
    ] as const) {
      expect(inPeriodFourGate(c.re, c.im)).toBe(true);
      expect(classifyOrbit(c)).toMatchObject({
        status: 'escaped',
        escapeIteration,
        evidence: ['escape-radius'],
      });
    }
  });
});
```

Create `tests/unit/render/period-four-golden-oracle.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  classifyPeriodFourInto,
  createOrbitSample,
  createViewportTransform,
  type PeriodFourCertificate,
} from '../../../src/domain';
import {
  classifyRows,
  prepareRealColumns,
  preparedRowImaginary,
} from '../../../src/render/classify-rows';
import { packStatusPeriod } from '../../../src/render/packed-semantic';
import { GOLDEN_RASTER } from '../../../tools/generate_kernel_golden';
import { loadCorpusCases, profileQuality } from '../../../tools/benchmark/judge/corpus';
import { ddPeriodFourCycle } from '../domain/dd-oracle';

/**
 * ADR 0007/0013: every pixel the analytic period-4 path answers on the golden
 * raster is checked against the dd period-4 cycle (no cubic). This is the set
 * of pixels the change moved: unresolved -> attracting p4, and attracting p4
 * with the certified multiplier instead of the orbit product
 * (evidence/phase-2/<date>-<commit>-period-four-adjudication/).
 */
const EXPECTED_ANALYTIC_PIXELS: Readonly<Record<string, number>> = {
  'mi-easy-default-full': 32,
  'mi-hard-supplied-126x': 2084,
  'mi-hard-supplied-609x': 677,
  'mi-hard-supplied-13x': 1642,
  'mi-scale-6mx-basilica-rim': 8000,
};

/**
 * |lambda_analytic - lambda_dd| may not exceed the certificate's allowance
 * plus this (dd rounding and dd Newton error). Measured worst on this raster:
 * 3.5e-12 against an allowance of 5.6e-9 (ratio 4.5e-3), near the real cusp.
 */
const DD_TOLERANCE = 1e-12;

describe('analytic period-4 pixels on the golden raster', () => {
  for (const corpusCase of loadCorpusCases()) {
    it(`are dd-certified in ${corpusCase.id}`, async () => {
      const quality = profileQuality(corpusCase.profile);
      const band = await classifyRows(
        { viewport: corpusCase.viewport, size: GOLDEN_RASTER, quality },
        quality,
        1,
        0,
        GOLDEN_RASTER.height,
        new AbortController().signal,
      );
      const transform = createViewportTransform(corpusCase.viewport, GOLDEN_RASTER);
      const columns = new Float64Array(GOLDEN_RASTER.width);
      prepareRealColumns(transform, GOLDEN_RASTER.width, 1, columns);
      const sample = createOrbitSample();
      const certificate = {} as PeriodFourCertificate;
      const word = packStatusPeriod(2, 4);
      let analytic = 0;
      for (let y = 0; y < GOLDEN_RASTER.height; y += 1) {
        const cIm = preparedRowImaginary(transform, GOLDEN_RASTER.height, 1, y);
        for (let x = 0; x < GOLDEN_RASTER.width; x += 1) {
          const cRe = columns[x] ?? Number.NaN;
          if (!classifyPeriodFourInto(cRe, cIm, sample, certificate)) continue;
          analytic += 1;
          const o = y * GOLDEN_RASTER.width + x;
          // The kernel wrote exactly the analytic record.
          expect(band.packedStatusPeriod[o]).toBe(word);
          expect(band.smoothIterationOrMultiplierMagnitude[o]).toBe(sample.multiplierMagnitude);
          expect(band.multiplierAngle[o]).toBe(sample.multiplierAngle);
          const oracle = ddPeriodFourCycle(cRe, cIm);
          if (oracle.status !== 'attracting-cycle' || oracle.cycle.primitive !== 4) {
            throw new Error(`dd did not certify period 4 at ${cRe} + ${cIm}i (${oracle.status})`);
          }
          const error = Math.hypot(
            sample.multiplierMagnitude * Math.cos(sample.multiplierAngle) -
              oracle.cycle.magnitude * Math.cos(oracle.cycle.angle),
            sample.multiplierMagnitude * Math.sin(sample.multiplierAngle) -
              oracle.cycle.magnitude * Math.sin(oracle.cycle.angle),
          );
          expect(error).toBeLessThanOrEqual(certificate.allowance + DD_TOLERANCE);
        }
      }
      expect(analytic).toBe(EXPECTED_ANALYTIC_PIXELS[corpusCase.id] ?? 0);
    }, 60_000);
  }
});
```

Create `tests/unit/render/period-four-coarse.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  classifyPeriodFourInto,
  createOrbitSample,
  createViewportTransform,
} from '../../../src/domain';
import {
  classifyRows,
  prepareRealColumns,
  preparedRowImaginary,
} from '../../../src/render/classify-rows';
import { packStatusPeriod } from '../../../src/render/packed-semantic';

/**
 * The coarse pass (stride > 1, scalar classifier) and the stable pass
 * (stride 1, two-lane row kernel) both answer period-4 pixels with the
 * certified cubic solve (ADR 0013): same record at the same parameter. The
 * view lies inside the 1/2 satellite of the period-2 bulb, on the real axis,
 * so both axis windows of the row kernel are exercised.
 */
const VIEW = { center: { re: -1.310702641336833, im: 0 }, spanY: 0.02 };
const SIZE = { width: 96, height: 64 };
const QUALITY = { maxIterations: 256, maxPeriod: 16, coarseStride: 8 };

describe('period-4 fast path in the coarse and stable passes', () => {
  for (const stride of [8, 1]) {
    it(`writes the analytic record at every sampled period-4 pixel (stride ${stride})`, async () => {
      const band = await classifyRows(
        { viewport: VIEW, size: SIZE, quality: QUALITY },
        QUALITY,
        stride,
        0,
        SIZE.height,
        new AbortController().signal,
      );
      const transform = createViewportTransform(VIEW, SIZE);
      const columns = new Float64Array(SIZE.width);
      prepareRealColumns(transform, SIZE.width, stride, columns);
      const sample = createOrbitSample();
      let analytic = 0;
      for (let y = 0; y < SIZE.height; y += stride) {
        const cIm = preparedRowImaginary(transform, SIZE.height, stride, y);
        for (let x = 0; x < SIZE.width; x += stride) {
          const o = y * SIZE.width + x;
          expect(classifyPeriodFourInto(columns[x] ?? Number.NaN, cIm, sample)).toBe(true);
          analytic += 1;
          expect(band.packedStatusPeriod[o]).toBe(packStatusPeriod(2, 4));
          expect(band.smoothIterationOrMultiplierMagnitude[o]).toBe(sample.multiplierMagnitude);
          expect(band.multiplierAngle[o]).toBe(sample.multiplierAngle);
        }
      }
      expect(analytic).toBe((SIZE.width / stride) * (SIZE.height / stride));
    });
  }
});
```

In `tests/unit/render/triggered-rows.test.ts` make six edits.

Replace:

```ts
import { PERIOD_THREE_BOXES } from '../../../src/domain/period-three-gate';
```

with:

```ts
import { PERIOD_FOUR_BOXES } from '../../../src/domain/period-four-gate';
import { PERIOD_THREE_BOXES } from '../../../src/domain/period-three-gate';
```

Replace:

```ts
  // The co-rabbit (Im c < 0): the row window must use |Im c|.
  { center: { re: -0.1225611668766535, im: -0.7448617666197435 }, spanY: 0.3 },
];
```

with:

```ts
  // The co-rabbit (Im c < 0): the row window must use |Im c|.
  { center: { re: -0.1225611668766535, im: -0.7448617666197435 }, spanY: 0.3 },
  // Period-4 gate boxes (ADR 0013): the cardioid satellite and its
  // conjugate, the complex primitive, the real primitive and its cusp, and
  // the axis band where both axis windows apply.
  { center: { re: 0.2822713907669139, im: 0.5300606175785253 }, spanY: 0.1 },
  { center: { re: 0.2822713907669139, im: -0.5300606175785253 }, spanY: 0.1 },
  { center: { re: -0.15652016683375508, im: 1.0322471089228318 }, spanY: 0.012 },
  { center: { re: -1.9407998065294847, im: 0 }, spanY: 0.0014 },
  { center: { re: -1.9405507889761495, im: 0 }, spanY: 1e-6 },
  { center: { re: -1.6, im: 0 }, spanY: 0.0012 },
];
```

Replace `): { mismatches: number; period3: number } => {` with `): { mismatches: number; period3: number; period4: number } => {`.

In `compareOneRow`, replace:

```ts
  let mismatches = 0;
  let period3 = 0;
  for (let x = 0; x < width; x += 1) {
```

with:

```ts
  let mismatches = 0;
  let period3 = 0;
  let period4 = 0;
  for (let x = 0; x < width; x += 1) {
```

then replace `    if (status === 2 && sample.period === 3) period3 += 1;` with:

```ts
    if (status === 2 && sample.period === 3) period3 += 1;
    if (status === 2 && sample.period === 4) period4 += 1;
```

and replace `  return { mismatches, period3 };` with `  return { mismatches, period3, period4 };`.

Finally, directly before the line `  it('never writes outside its row when a parked lane would escape (offset > 0)', () => {`, insert:

```ts
  it('matches the scalar kernel at every period-4 gate box edge (rows and columns)', () => {
    // Calls classifyRow directly with row imaginary parts and columns at each
    // box's |Im c| band and Re c window edges, +-0 and +-1 ulp, in both
    // half-planes, so a drift in the kernel's per-row windows (versus
    // inPeriodFourGate) shows up as a bitwise difference.
    const bits = new DataView(new ArrayBuffer(8));
    const step = (value: number, ulps: number): number => {
      bits.setFloat64(0, value);
      bits.setBigInt64(0, bits.getBigInt64(0) + BigInt(value < 0 ? -ulps : ulps));
      return bits.getFloat64(0);
    };
    const around = (value: number): number[] => [step(value, -1), value, step(value, 1)];
    const rows = new Set<number>([0, -0]);
    const columnSet = new Set<number>();
    for (const box of PERIOD_FOUR_BOXES) {
      for (const edge of [box.absImMin, box.absImMax]) {
        for (const v of around(edge)) {
          rows.add(v);
          rows.add(-v);
        }
      }
      for (const edge of [box.reMin, box.reMax]) for (const v of around(edge)) columnSet.add(v);
      columnSet.add((box.reMin + box.reMax) / 2);
    }
    const columns = Float64Array.from(columnSet);
    for (const options of [
      { maxIterations: 512, maxPeriod: 32 },
      { maxIterations: 100, maxPeriod: 7, cycleWarmup: 0 },
      { maxIterations: 33, maxPeriod: 1, cycleWarmup: 2 },
    ] satisfies Partial<OrbitOptions>[]) {
      const kernel = new TriggeredRowKernel(options);
      const scalar = new OrbitClassifier(options);
      const sample = createOrbitSample();
      let mismatches = 0;
      let accepted = 0;
      for (const cIm of rows) {
        const result = compareOneRow(kernel, scalar, sample, columns, cIm);
        mismatches += result.mismatches;
        accepted += result.period4;
      }
      expect(mismatches).toBe(0);
      if (options.maxIterations === 512) expect(accepted).toBeGreaterThan(0);
    }
  });
```

In `tsconfig.app.json`, in the `exclude` array, add `"tests/unit/render/period-four-golden-oracle.test.ts",` directly after `"tests/unit/render/period-three-golden-oracle.test.ts",`.

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `npx vitest run tests/unit/domain/period-four-placement.test.ts tests/unit/render/period-four-golden-oracle.test.ts tests/unit/render/period-four-coarse.test.ts tests/unit/render/triggered-rows.test.ts`
Expected: FAIL — `runs at the first scanning iteration` (the evidence is `converged-cycle`), the golden-oracle cases for `mi-easy-default-full`, `mi-hard-supplied-126x`, `mi-hard-supplied-609x`, `mi-hard-supplied-13x` and `mi-scale-6mx-basilica-rim` (the band word or the multiplier differs), and both coarse cases. The other tests in these files pass, including the row/scalar parity tests (both kernels still agree).

- [ ] **Step 3: Wire the scalar kernel**

In `src/domain/orbit-triggered.ts`, replace the import lines:

```ts
import { classifyPeriodThreeInto } from './analytic-period-three';
import type { OrbitSample, OrbitScratch } from './orbit';
import { inPeriodThreeGate } from './period-three-gate';
```

with:

```ts
import { classifyPeriodFourInto } from './analytic-period-four';
import { classifyPeriodThreeInto } from './analytic-period-three';
import type { OrbitSample, OrbitScratch } from './orbit';
import { inPeriodFourGate } from './period-four-gate';
import { inPeriodThreeGate } from './period-three-gate';
```

Replace:

```ts
 * Orbit loop of the triggered kernel, from z = 0. The caller has already
 * handled the period-1 and period-2 analytic fast paths; the period-3 one
 * runs inside the loop at the first scanning iteration (ADR 0010). `scratch`
 * must have power-of-two capacity of at least maxPeriod + 1 (OrbitScratch
 * guarantees it).
```

with:

```ts
 * Orbit loop of the triggered kernel, from z = 0. The caller has already
 * handled the period-1 and period-2 analytic fast paths; the period-3 closed
 * form and the period-4 cubic solve run inside the loop at the first scanning
 * iteration (ADR 0010, ADR 0013). `scratch` must have power-of-two capacity
 * of at least maxPeriod + 1 (OrbitScratch guarantees it).
```

Replace:

```ts
    // Analytic period-3 fast path (ADR 0010): once per pixel, at the first
    // scanning iteration and before its full scan. A pixel that escapes
    // earlier never reaches this test. The closed form depends on c alone,
    // so its record is the same wherever it runs. The orbit doubles
    // round-trip through the spill across the call (hot-loop rule).
    if (iteration === scanStart && inPeriodThreeGate(cRe, cIm)) {
      spill[SPILL_Z_RE] = zRe;
      spill[SPILL_Z_IM] = zIm;
      if (classifyPeriodThreeInto(cRe, cIm, out)) {
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fixed-size spill
      zRe = spill[SPILL_Z_RE]!;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fixed-size spill
      zIm = spill[SPILL_Z_IM]!;
    }
```

with:

```ts
    // Analytic period-3 and period-4 fast paths (ADR 0010, ADR 0013): once
    // per pixel, at the first scanning iteration and before its full scan. A
    // pixel that escapes earlier never reaches this test. The period-3 and
    // period-4 boxes are disjoint, so at most one solve runs. Each record
    // depends on c alone, so it is the same wherever it runs. The orbit
    // doubles round-trip through the spill across the call (hot-loop rule).
    if (iteration === scanStart) {
      const periodThree = inPeriodThreeGate(cRe, cIm);
      if (periodThree || inPeriodFourGate(cRe, cIm)) {
        spill[SPILL_Z_RE] = zRe;
        spill[SPILL_Z_IM] = zIm;
        if (
          periodThree
            ? classifyPeriodThreeInto(cRe, cIm, out)
            : classifyPeriodFourInto(cRe, cIm, out)
        ) {
          return;
        }
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fixed-size spill
        zRe = spill[SPILL_Z_RE]!;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fixed-size spill
        zIm = spill[SPILL_Z_IM]!;
      }
    }
```

- [ ] **Step 4: Wire the two-lane row kernel**

In `src/render/triggered-rows.ts`:

(a) In the import block from `'../domain'`, replace:

```ts
import {
  AIRPLANE_BOX,
  classifyAnalyticInto,
  classifyPeriodThreeInto,
```

with:

```ts
import {
  AIRPLANE_BOX,
  BULB_SATELLITE_BOX,
  CARDIOID_SATELLITE_BOX,
  classifyAnalyticInto,
  classifyPeriodFourInto,
  classifyPeriodThreeInto,
  COMPLEX_PRIMITIVE_BOX,
```

and replace:

```ts
  RABBIT_BOX,
  resolveOrbitOptions,
```

with:

```ts
  RABBIT_BOX,
  REAL_PRIMITIVE_BOX,
  resolveOrbitOptions,
```

(b) In the module comment, replace the two paragraphs from ` * Per pixel, a lane performs exactly the operations of` through ` * upgrading V8.` (the line before the blank ` *` line that precedes ` * Lockstep shape:`) with:

```ts
 * Per pixel, a lane performs exactly the operations of
 * classifyTriggeredOrbitInto in the same order (the analytic prologue, the
 * step, the escape test, the ring store, the watched-lag test, the period-3
 * closed form or the period-4 cubic solve at the first scanning iteration,
 * the full scans with their argmin, and the canonical verifier call), so
 * every result is bit-identical to the scalar kernel;
 * tests/unit/render/triggered-rows.test.ts pins that. Two harmless
 * reorderings: the ring store happens before the escape test (an escaped
 * pixel's last slot is never read: a lane's next pixel overwrites slots
 * before it reads them), and the watched-lag test is evaluated during warmup
 * but only used from the first scanning iteration.
 *
 * Hot-loop rules from orbit.ts: the lockstep loop has no calls. The rare
 * calls (verifier on a proposal, analytic closed forms on a region hit) run
 * with every double the loops carry round-tripped through `spill`.
 * classifyRow adds no inlinable call for the period-3 and period-4 paths
 * (ADR 0010, ADR 0013): each gate is evaluated once per row as windows on
 * Re c (one for period 3, two for period 4) computed from the box data before
 * the lanes start, one call site per lane picks the solve, and only the
 * solves, which are large, are called. Observed with V8 in Node 24: calling
 * inPeriodThreeGate here made the far-exterior stable pass, where no pixel
 * reaches the gate, about 10% slower in some compiles. The working
 * explanation is that the inlined gate spent TurboFan's inlining budget and
 * left a refill call to classifyAnalyticInto out of line. This depends on V8
 * heuristics and is unguarded: rerun tools/benchmark/fallback-overhead.ts
 * (stable and coarse pass) after changing classifyRow or upgrading V8.
```

(c) In `classifyRow`, directly after the period-3 window block, which ends:

```ts
    } else if (absIm >= AIRPLANE_BOX.absImMin && absIm <= AIRPLANE_BOX.absImMax) {
      p3ReMin = AIRPLANE_BOX.reMin;
      p3ReMax = AIRPLANE_BOX.reMax;
    }
```

insert:

```ts
    // Period-4 gate (ADR 0013), per row, as two Re c windows: the off-axis
    // boxes' |Im c| bands are disjoint from each other and from the axis
    // band, and on the axis band the 1/2 satellite of the period-2 bulb and
    // the real primitive component both apply. Empty windows when no band
    // holds |cIm| (NaN included). Written out, not called.
    let p4ReMin = Number.POSITIVE_INFINITY;
    let p4ReMax = Number.NEGATIVE_INFINITY;
    let p4AxisReMin = Number.POSITIVE_INFINITY;
    let p4AxisReMax = Number.NEGATIVE_INFINITY;
    if (absIm >= CARDIOID_SATELLITE_BOX.absImMin && absIm <= CARDIOID_SATELLITE_BOX.absImMax) {
      p4ReMin = CARDIOID_SATELLITE_BOX.reMin;
      p4ReMax = CARDIOID_SATELLITE_BOX.reMax;
    } else if (absIm >= COMPLEX_PRIMITIVE_BOX.absImMin && absIm <= COMPLEX_PRIMITIVE_BOX.absImMax) {
      p4ReMin = COMPLEX_PRIMITIVE_BOX.reMin;
      p4ReMax = COMPLEX_PRIMITIVE_BOX.reMax;
    } else if (absIm <= BULB_SATELLITE_BOX.absImMax) {
      p4ReMin = BULB_SATELLITE_BOX.reMin;
      p4ReMax = BULB_SATELLITE_BOX.reMax;
      if (absIm <= REAL_PRIMITIVE_BOX.absImMax) {
        p4AxisReMin = REAL_PRIMITIVE_BOX.reMin;
        p4AxisReMax = REAL_PRIMITIVE_BOX.reMax;
      }
    }
```

(d) Lane A. Replace the comment and block:

```ts
        // Analytic period-3 fast path at the first scanning iteration, as in
        // classifyTriggeredOrbitInto (ADR 0010).
        let analyticA = false;
        if (itA === scanStart && cA >= p3ReMin && cA <= p3ReMax) {
          spill[S_ZA_RE] = zaRe;
          spill[S_ZA_IM] = zaIm;
          spill[S_ZB_RE] = zbRe;
          spill[S_ZB_IM] = zbIm;
          spill[S_CA] = cA;
          spill[S_CB] = cB;
          analyticA = classifyPeriodThreeInto(cA, cIm, out);
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fixed-size spill
          zaRe = spill[S_ZA_RE]!;
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fixed-size spill
          zaIm = spill[S_ZA_IM]!;
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fixed-size spill
          zbRe = spill[S_ZB_RE]!;
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fixed-size spill
          zbIm = spill[S_ZB_IM]!;
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fixed-size spill
          cA = spill[S_CA]!;
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fixed-size spill
          cB = spill[S_CB]!;
        }
```

with:

```ts
        // Analytic period-3 and period-4 fast paths at the first scanning
        // iteration, as in classifyTriggeredOrbitInto (ADR 0010, ADR 0013).
        let analyticA = false;
        if (itA === scanStart) {
          const periodThreeA = cA >= p3ReMin && cA <= p3ReMax;
          if (
            periodThreeA ||
            (cA >= p4ReMin && cA <= p4ReMax) ||
            (cA >= p4AxisReMin && cA <= p4AxisReMax)
          ) {
            spill[S_ZA_RE] = zaRe;
            spill[S_ZA_IM] = zaIm;
            spill[S_ZB_RE] = zbRe;
            spill[S_ZB_IM] = zbIm;
            spill[S_CA] = cA;
            spill[S_CB] = cB;
            analyticA = periodThreeA
              ? classifyPeriodThreeInto(cA, cIm, out)
              : classifyPeriodFourInto(cA, cIm, out);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fixed-size spill
            zaRe = spill[S_ZA_RE]!;
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fixed-size spill
            zaIm = spill[S_ZA_IM]!;
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fixed-size spill
            zbRe = spill[S_ZB_RE]!;
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fixed-size spill
            zbIm = spill[S_ZB_IM]!;
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fixed-size spill
            cA = spill[S_CA]!;
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fixed-size spill
            cB = spill[S_CB]!;
          }
        }
```

(e) Lane B. Replace:

```ts
        let analyticB = false;
        if (itB === scanStart && cB >= p3ReMin && cB <= p3ReMax) {
          spill[S_ZA_RE] = zaRe;
          spill[S_ZA_IM] = zaIm;
          spill[S_ZB_RE] = zbRe;
          spill[S_ZB_IM] = zbIm;
          spill[S_CA] = cA;
          spill[S_CB] = cB;
          analyticB = classifyPeriodThreeInto(cB, cIm, out);
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fixed-size spill
          zaRe = spill[S_ZA_RE]!;
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fixed-size spill
          zaIm = spill[S_ZA_IM]!;
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fixed-size spill
          zbRe = spill[S_ZB_RE]!;
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fixed-size spill
          zbIm = spill[S_ZB_IM]!;
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fixed-size spill
          cA = spill[S_CA]!;
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fixed-size spill
          cB = spill[S_CB]!;
        }
```

with:

```ts
        let analyticB = false;
        if (itB === scanStart) {
          const periodThreeB = cB >= p3ReMin && cB <= p3ReMax;
          if (
            periodThreeB ||
            (cB >= p4ReMin && cB <= p4ReMax) ||
            (cB >= p4AxisReMin && cB <= p4AxisReMax)
          ) {
            spill[S_ZA_RE] = zaRe;
            spill[S_ZA_IM] = zaIm;
            spill[S_ZB_RE] = zbRe;
            spill[S_ZB_IM] = zbIm;
            spill[S_CA] = cA;
            spill[S_CB] = cB;
            analyticB = periodThreeB
              ? classifyPeriodThreeInto(cB, cIm, out)
              : classifyPeriodFourInto(cB, cIm, out);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fixed-size spill
            zaRe = spill[S_ZA_RE]!;
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fixed-size spill
            zaIm = spill[S_ZA_IM]!;
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fixed-size spill
            zbRe = spill[S_ZB_RE]!;
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fixed-size spill
            zbIm = spill[S_ZB_IM]!;
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fixed-size spill
            cA = spill[S_CA]!;
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fixed-size spill
            cB = spill[S_CB]!;
          }
        }
```

The only differences from the old blocks are the outer `if (itX === scanStart)`, the window test and the ternary; the spill and reload lines are unchanged (one level deeper).

- [ ] **Step 5: Run the new tests and the row/scalar parity test to verify they pass**

Run: `npx vitest run tests/unit/domain/period-four-placement.test.ts tests/unit/render/period-four-golden-oracle.test.ts tests/unit/render/period-four-coarse.test.ts tests/unit/render/triggered-rows.test.ts`
Expected: PASS: 3 + 13 + 2 + 5 tests (the row kernel equals the scalar kernel bit for bit on every view, including the six new ones and every period-4 box edge; 12,435 golden-raster pixels dd-certified).

- [ ] **Step 6: Run the whole unit suite and confirm exactly the expected failures**

Run: `npm run test:unit 2>&1 | grep -E '×|Tests '`
Expected failures, and only these (17):

- `poc/performance/src/control.test.ts`: the three `agrees on status, iterations, and evidence, and on period except documented non-primitive legacy multiples …` cases;
- `orbit-oracle-adjudication.test.ts`: the three `supports every changed legacy answer and certifies every attracting claim …` cases (`expected -30 to be -16` and the like);
- `orbit-scalar-parity.test.ts`: `matches the legacy reference on every differential stratum (quick)` and `(default)`, `matches the legacy reference and the independent fixtures through the scalar core`, `keeps OrbitClassifier.classify identical to the legacy reference`;
- `verifier.test.ts`: `agrees bit for bit with the inline lag-scan policy body in classifyInto` (`expected 0 to be greater than 0`: all ten of its points now take an analytic path);
- `kernel-golden.test.ts`: `mi-easy-default-full`, `mi-hard-supplied-126x`, `mi-hard-supplied-609x`, `mi-hard-supplied-13x`, `mi-scale-6mx-basilica-rim`;
- `colorized-golden.test.ts`: `colorizes every case byte for byte as recorded`.

If anything else fails, stop and report.

- [ ] **Step 7: Update the differential and oracle tests for the documented divergence**

`tests/unit/domain/orbit-scalar-parity.test.ts` — replace:

```ts
  if (
    production.status === 'attracting-cycle' &&
    production.evidence[0] === 'analytic-period-3-component'
  ) {
    // Documented divergence (ADR 0010; every one adjudicated against the dd
    // period-3 cycle in orbit-oracle-adjudication.test.ts): the closed-form
    // period-3 path answers instead of the lag scan. Legacy either found the
    // same primitive period (possibly as a multiple, with an orbit-product
    // multiplier) or ran out of budget; it never escaped or found another
    // period.
    expect(production.period).toBe(3);
    expect(production.iterations).toBe(0);
    if (legacy.status === 'attracting-cycle') {
      expect(legacy.period % 3).toBe(0);
      if (legacy.period === 3) {
        expect(
          Math.abs(production.multiplierMagnitude - legacy.multiplierMagnitude),
        ).toBeLessThanOrEqual(LEGACY_PERIOD_THREE_MAGNITUDE_TOLERANCE);
      }
```

with:

```ts
  if (
    production.status === 'attracting-cycle' &&
    (production.evidence[0] === 'analytic-period-3-component' ||
      production.evidence[0] === 'analytic-period-4-component')
  ) {
    // Documented divergence (ADR 0010, ADR 0013; every one adjudicated
    // against the dd period-3 or period-4 cycle in
    // orbit-oracle-adjudication.test.ts): the period-3 closed form or the
    // certified period-4 cubic solve answers instead of the lag scan. Legacy
    // either found the same primitive period (possibly as a multiple, with an
    // orbit-product multiplier) or ran out of budget; it never escaped or
    // found another period.
    const period = production.evidence[0] === 'analytic-period-3-component' ? 3 : 4;
    expect(production.period).toBe(period);
    expect(production.iterations).toBe(0);
    if (legacy.status === 'attracting-cycle') {
      expect(legacy.period % period).toBe(0);
      if (legacy.period === period) {
        expect(
          Math.abs(production.multiplierMagnitude - legacy.multiplierMagnitude),
        ).toBeLessThanOrEqual(LEGACY_ANALYTIC_MAGNITUDE_TOLERANCE);
      }
```

and, in the same file, replace:

```ts
/**
 * Largest |lambda| difference allowed between the closed-form period-3
 * multiplier and the legacy orbit product. The orbit product is the
 * inaccurate side (about 1e-8 on the golden raster, 2.2e-6 in the H spike);
 * the dd adjudication pins the closed form itself to 1e-12.
 */
const LEGACY_PERIOD_THREE_MAGNITUDE_TOLERANCE = 1e-5;
```

with:

```ts
/**
 * Largest |lambda| difference allowed between the analytic period-3 or
 * period-4 multiplier and the legacy orbit product. The orbit product is the
 * inaccurate side (up to 1.02e-8 for period 3 and 3.2e-6 for period 4 on the
 * golden raster, 2.2e-6 in the H spike); the dd adjudication pins the
 * analytic multipliers to 1e-12 (period 3) and to the certificate's
 * allowance (period 4).
 */
const LEGACY_ANALYTIC_MAGNITUDE_TOLERANCE = 1e-5;
```

`tests/unit/domain/orbit-oracle-adjudication.test.ts` — eight edits.

Replace:

```ts
import {
  classifyInto,
  createOrbitSample,
```

with:

```ts
import {
  classifyInto,
  classifyPeriodFourInto,
  createOrbitSample,
```

Replace:

```ts
  type OrbitResult,
} from '../../../src/domain';
```

with:

```ts
  type OrbitResult,
  type PeriodFourCertificate,
} from '../../../src/domain';
```

Replace:

```ts
  classifyDDMinimal,
  ddPeriodThreeCycle,
```

with:

```ts
  classifyDDMinimal,
  ddPeriodFourCycle,
  ddPeriodThreeCycle,
```

Replace:

```ts
  analyticPeriodThree: number;
  unresolvedToPeriodThree: number;
```

with:

```ts
  analyticPeriodThree: number;
  unresolvedToPeriodThree: number;
  analyticPeriodFour: number;
  unresolvedToPeriodFour: number;
```

Replace:

```ts
        analyticPeriodThree: 0,
        unresolvedToPeriodThree: 0,
```

with:

```ts
        analyticPeriodThree: 0,
        unresolvedToPeriodThree: 0,
        analyticPeriodFour: 0,
        unresolvedToPeriodFour: 0,
```

Find the period-3 block, which ends:

```ts
            adjudication.unsupported.push(
              `${index}: analytic period 3 not dd-certified (dd ${check.status})`,
            );
          }
          continue;
        }
```

and insert directly after it:

```ts

        if (
          production.status === 'attracting-cycle' &&
          production.evidence[0] === 'analytic-period-4-component'
        ) {
          // ADR 0013: the certified period-4 cubic solve, checked against the
          // dd period-4 cycle (no cubic, no orbit convergence). The multiplier
          // must agree within the certificate's own allowance.
          adjudication.analyticPeriodFour += 1;
          if (legacy.status === 'unresolved') {
            adjudication.unresolvedToPeriodFour += 1;
          }
          const certificate = {} as PeriodFourCertificate;
          classifyPeriodFourInto(point.re, point.im, createOrbitSample(), certificate);
          const check = ddPeriodFourCycle(point.re, point.im);
          if (
            check.status !== 'attracting-cycle' ||
            check.cycle.primitive !== 4 ||
            multiplierDistance(production, check.cycle) >
              certificate.allowance + ANALYTIC_PERIOD_FOUR_DD_TOLERANCE
          ) {
            adjudication.unsupported.push(
              `${index}: analytic period 4 not dd-certified (dd ${check.status})`,
            );
          }
          continue;
        }
```

Replace:

```ts
      // Unresolved-rate delta vs legacy, quantified: the only status flips
      // on this grid are unresolved -> analytic period 3 (ADR 0010), each
      // dd-certified above.
      expect(adjudication.unresolvedDelta).toBe(-adjudication.unresolvedToPeriodThree);
```

with:

```ts
      // Unresolved-rate delta vs legacy, quantified: the only status flips
      // on this grid are unresolved -> analytic period 3 (ADR 0010) and
      // unresolved -> analytic period 4 (ADR 0013), each dd-certified above.
      expect(adjudication.unresolvedDelta).toBe(
        -adjudication.unresolvedToPeriodThree - adjudication.unresolvedToPeriodFour,
      );
```

Replace:

```ts
      // Since ADR 0010 the period-3 reductions (6 -> 3, 12 -> 3) are answered
      // by the closed form and adjudicated above; the rest are period 4 and 5.
      const expectedReductions: Record<string, number> = { quick: 4, balanced: 7, detailed: 9 };
```

with:

```ts
      // Since ADR 0010 the period-3 reductions (6 -> 3, 12 -> 3) and since
      // ADR 0013 the period-4 ones (8 -> 4, 12 -> 4) are answered by the
      // analytic paths and adjudicated above; the rest are period 5.
      const expectedReductions: Record<string, number> = { quick: 0, balanced: 0, detailed: 2 };
```

Replace:

```ts
      expect(adjudication.unresolvedToPeriodThree).toBe(
        expectedUnresolvedToPeriodThree[profile.label],
      );
```

with:

```ts
      expect(adjudication.unresolvedToPeriodThree).toBe(
        expectedUnresolvedToPeriodThree[profile.label],
      );
      // ADR 0013: 33 grid points take the certified period-4 path under every
      // profile; of those, the legacy scan left this many unresolved.
      expect(adjudication.analyticPeriodFour).toBe(33);
      const expectedUnresolvedToPeriodFour: Record<string, number> = {
        quick: 14,
        balanced: 8,
        detailed: 8,
      };
      expect(adjudication.unresolvedToPeriodFour).toBe(
        expectedUnresolvedToPeriodFour[profile.label],
      );
```

and, directly after the line `const ANALYTIC_PERIOD_THREE_TOLERANCE = 1e-12;`, insert:

```ts

/**
 * Allowed excess of |lambda_analytic - lambda_dd| over the period-4
 * certificate's own allowance (dd rounding and dd Newton error; ADR 0013).
 */
const ANALYTIC_PERIOD_FOUR_DD_TOLERANCE = 1e-12;
```

(`missedDetections` stays 12: no budget miss on the grid is a period-4 point.)

`tests/unit/domain/verifier.test.ts` — replace:

```ts
      { re: -0.2015625000000001, im: -0.7031250000000001 },
    ];
```

with:

```ts
      { re: -0.2015625000000001, im: -0.7031250000000001 },
      // Period 5 near its centre: a lag-scan acceptance at iteration 24.
      { re: -0.5043, im: 0.5628 },
    ];
```

and replace:

```ts
      // Only lag-scan acceptances replay through the verifier; the analytic
      // period-3 path (ADR 0010) has no cycle start to replay.
```

with:

```ts
      // Only lag-scan acceptances replay through the verifier; the analytic
      // period-3 and period-4 paths (ADR 0010, ADR 0013) have no cycle start
      // to replay.
```

`poc/performance/src/control.test.ts` — four edits.

Replace:

```ts
      let analyticPeriodThree = 0;
```

with:

```ts
      let analyticPeriodThree = 0;
      let analyticPeriodFour = 0;
```

Replace:

```ts
        // ADR 0010: the analytic period-3 path answers instead of the lag
        // scan (closed-form multiplier, iterations 0). The legacy control
        // found the same primitive period, possibly as a multiple, or ran
        // out of budget; every such pixel is checked against the dd period-3
        // cycle in tests/unit/domain/orbit-oracle-adjudication.test.ts.
```

with:

```ts
        // ADR 0010 and ADR 0013: the analytic period-3 and period-4 paths
        // answer instead of the lag scan (analytic multiplier, iterations 0).
        // The legacy control found the same primitive period, possibly as a
        // multiple, or ran out of budget; every such pixel is checked against
        // the dd period-3 or period-4 cycle in
        // tests/unit/domain/orbit-oracle-adjudication.test.ts.
```

Directly after the block that ends:

```ts
          analyticPeriodThree += 1;
          continue;
        }
```

insert:

```ts
        if (
          production.status === 'attracting-cycle' &&
          production.evidence[0] === 'analytic-period-4-component'
        ) {
          expect(production.period).toBe(4);
          if (control.status === 'attracting') {
            expect(control.period % 4).toBe(0);
          } else {
            expect(control.status).toBe('unresolved');
          }
          analyticPeriodFour += 1;
          continue;
        }
```

Replace:

```ts
      // The stratified corpus sample contains period-4 structure the legacy
      // scan reports as 8/12: the documented reduction class must be present
      // and is exactly what the oracle adjudication covers.
      expect(reduced).toBeGreaterThan(0);
      // The sample's three rabbit-stratum points take the analytic path.
      expect(analyticPeriodThree).toBe(3);
```

with:

```ts
      // The stratified corpus sample's period-4 structure, which the legacy
      // scan reports as 8/12, takes the certified period-4 path since ADR 0013,
      // so no reduction remains in this sample; the reduction class stays
      // covered by tests/unit/domain/orbit-oracle-adjudication.test.ts
      // (period-5 reductions under the detailed profile).
      expect(reduced).toBe(0);
      // The sample's three rabbit-stratum points take the analytic path.
      expect(analyticPeriodThree).toBe(3);
      // Its three period-4 points take the certified period-4 path.
      expect(analyticPeriodFour).toBe(3);
```

Run: `npx vitest run tests/unit/domain/orbit-scalar-parity.test.ts tests/unit/domain/orbit-oracle-adjudication.test.ts tests/unit/domain/verifier.test.ts poc/performance/src/control.test.ts`
Expected: PASS.

- [ ] **Step 8: Regenerate the golden fixtures**

In `src/render/semantic-store.ts`, replace:

```ts
// v3: the analytic period-3 fast path changed classification output (ADR 0010).
const SEMANTIC_ALGORITHM_VERSION = 3;
```

with:

```ts
// v3: the analytic period-3 fast path changed classification output (ADR 0010).
// v4: the certified period-4 cubic solve changed classification output (ADR 0013).
const SEMANTIC_ALGORITHM_VERSION = 4;
```

In `tools/generate_kernel_golden.ts`, replace:

```ts
    kernel: 'watched-lag triggered scan (ADR 0006) with the analytic period-3 path (ADR 0010)',
```

with:

```ts
    kernel:
      'watched-lag triggered scan (ADR 0006) with the analytic period-3 (ADR 0010) and period-4 (ADR 0013) paths',
```

Then run:

```bash
npm run fixtures:kernel-golden
npm run fixtures:colorized-golden
git diff --stat fixtures/
git diff fixtures/kernel-golden.v1.json | grep '^[-+] '
```

Expected: both files change; the kernel diff names exactly the five cases `mi-easy-default-full`, `mi-hard-supplied-126x`, `mi-hard-supplied-609x`, `mi-hard-supplied-13x`, `mi-scale-6mx-basilica-rim` with the new hashes listed under "Measured facts", plus the `kernel` label and `generatedFrom` (the current HEAD, which is Task 6's commit). The colorized diff names exactly the seven cases listed there (`generatedFrom` changes too) and no `emphasizedPeriods` value. If any other case changes, stop and report.

- [ ] **Step 9: Regenerate the affected screenshot baselines (pinned container, headless)**

`fixtures/README.md` rule 3: a golden change that alters a screenshot view regenerates the affected baselines in the same commit. Run:

```bash
npm run test:visual:container; echo "exit $?"
```

Expected: `exit 1` with failures only for `raster: default-stability`, `raster: period-four-126x-period`, `UI state: catalog overlay on the default view` and the already-pending `UI state: a selected catalog marker and its evidence`, in both engines. Then regenerate exactly the three affected tests:

```bash
npm run test:visual:container -- --update-snapshots=all -g "raster: default-stability|raster: period-four-126x-period|UI state: catalog overlay"
git status --short tests/visual
npm run test:visual:container; echo "exit $?"
```

Expected: six PNG files modified (`catalog-overlay.png`, `default-stability.png`, `period-four-126x-period.png` under `chromium/` and `firefox/`); the final compare fails only on the pending `selected marker and its evidence` test in both engines, as it does before this change. If the container cannot run (no podman or docker, or no image), skip this step, and say in the commit message: "Screenshot baselines not regenerated: the advisory visual job will differ on default-stability, period-four-126x-period and catalog-overlay until they are regenerated in the container."

In `fixtures/README.md`, at the end of the paragraph that begins `Pending (2026-10-17, PHASE2-TODO item 6):`, add a new paragraph after it:

```markdown
Since ADR 0013 (2026-10-17) the period-4 path changes the default and 126× rasters, so `default-stability.png`, `period-four-126x-period.png` and `catalog-overlay.png` were regenerated in the container, in both engines, in the commit that changed the kernels. The selected-marker baselines still await the owner.
```

(If you skipped the container, write instead: `Since ADR 0013 (2026-10-17) the period-4 path changes the default and 126× rasters; default-stability.png, period-four-126x-period.png and catalog-overlay.png await regeneration in the container, like the selected-marker baselines.` with each file name in its own code span.)

- [ ] **Step 10: Document the decision**

Create `docs/decisions/0013-analytic-period-four.md`:

````markdown
# ADR 0013: Analytic period-4 classification with a certified root

- Status: Accepted
- Date: 2026-10-17

## Context

The workstream H spike ([record](../verification/WORKSTREAM-H-SPIKE-2026-10-16.md)) solved the cycle-product cubic of the three period-4 cycles by Cardano and found that period-4 pixels dominate the hard views: in Node the prototype ran the 126×, 13× and 609× views 1.4–1.8× faster and the 6,000,000× view 8.4× faster, and it resolved the left half of that view, which no iteration budget reaches (|λ| between 1 − 5·10⁻⁶ and 1 − 2·10⁻⁸). Its acceptance bound was first order and heuristic near the cusps. Owner decisions: adopt period 3 now and period 4 only after its error bound is rigorous (2026-10-16); period 3 is accepted "like p1/p2", by the margin plus a derived allowance (2026-10-17, [ADR 0010](0010-analytic-period-three.md) Decision 2); for period 4 the bar is a rigorous bound, and a heuristic cusp bound is not acceptable.

## Decision

1. A fourth analytic fast path, `classifyPeriodFourInto` (`src/domain/analytic-period-four.ts`, revision `src-analytic-p4-1.0.0`). It computes an untrusted candidate root of the cubic μ³ + (c² − 3)μ² − (c⁴ + c³ − c² − 3)μ − G₄(c) (Cardano and two Newton steps per root) and accepts only through an a-posteriori Rouché enclosure: with F ≥ |M(μ̃)|, D ≤ |M′(μ̃)|, K ≥ |M″(μ̃)|/2 for the exact cubic at the binary64 parameter and h = F/D, it requires h(8K + 16h) < D and 16|μ̃| + 64h + 2⁻⁵⁰ < 1 − attractMargin. The enclosure, the exact period and the binary64 budget are in [PERFORMANCE-MATHEMATICS §12](../PERFORMANCE-MATHEMATICS.md#12-period-4-cubic-with-a-certified-root-workstream-h-adr-0013); the exact identities are checked in `proof/IntMProof/PeriodFourMultiplier.lean`. Acceptance implies an exact root with |λ| < 1 − 10⁻¹² and a cycle of exact period 4, for every finite binary64 c.
2. Acceptance is the analytic criterion of periods 1–3 (plan §4, bucket 1–2): the verifier policy's attraction margin applied to a multiplier known to lie within a proved allowance, without `verifyCycleInto` (there is no cycle point to hand to it). This extends the owner's period-3 ruling under the owner's own condition for period 4, a rigorous bound; `MI-PERF-004`'s parenthetical names it. `VERIFIER_REVISION` does not change.
3. Placement: both kernels try it once per pixel at the first scanning iteration, `max(cycleWarmup, 2)` = 24, exactly where the period-3 closed form runs. The period-3 and period-4 boxes are disjoint, so at most one solve runs. The record depends on c alone, so placement changes no bit.
4. Gate: padded bounding boxes of the six components, folded by conjugation into four (`src/domain/period-four-gate.ts`). The scalar kernel calls the straight-line `inPeriodFourGate`. The row kernel evaluates it once per row as two windows on Re c (the two real-axis boxes share |Im c| values) and shares one spill block and call site per lane with period 3, so `classifyRow` gains no inlinable call (ADR 0010, Consequences). The gate must contain every accepted parameter; it is measured on dense grids, and every accepted parameter lies in a period-4 component by Decision 1.
5. Evidence: flag `analytic-period-4-component`, code 6, evidence source `analytic`. The inspector shows "Analytic Period 4 Component" and "Analytic closed form". Iterations are 0.
6. Multiplier: period-4 pixels report λ̃ = 16μ̃, within half the allowance of the exact root; measured within 4.5·10⁻³ of the allowance of the dd cycle on the golden raster, against up to 3.2·10⁻⁶ for the orbit product.
7. Inputs with |c| > 4, NaN and ±∞ are refused before any work. Near the three primitive cusps (within about 10⁻¹²) and within the margin plus the allowance of |λ| = 1 the certificate refuses and the unchanged orbit path decides.
8. This supersedes ADR 0010 Decision 7 ("Period 4 is out of scope until its root-error bound is rigorous").

## Consequences

- Answer change (plan §3: a changed answer ships only when the oracle supports it). On the golden raster (160×100) 8,614 pixels move from unresolved to attracting period 4 (2 in the default view, 312 at 126×, 84 at 609×, 216 at 13×, and all 8,000 of the 6,000,000× view's left half), and 3,821 period-4 pixels report the certified multiplier instead of the orbit product. All 12,435 are checked against the independent dd period-4 cycle (`tests/unit/render/period-four-golden-oracle.test.ts`). At the shipping raster the 6,000,000× view's 327,680 unresolved pixels all resolve, each dd-adjudicated.
- The golden kernel fixture changes for five cases and the colorized-buffer golden for seven, in the same commit; the advisory screenshot baselines of `default-stability`, `period-four-126x-period` and `catalog-overlay` are regenerated there in both engines. `SEMANTIC_ALGORITHM_VERSION` becomes 4.
- The differential tests against the frozen legacy port and the PoC control kernel gain one documented divergence class, analytic period 4, adjudicated in `tests/unit/domain/orbit-oracle-adjudication.test.ts`; the legacy period-4 reductions (8 → 4, 12 → 4) on the stratified grid are now answered analytically, so only period-5 reductions remain there.
- Speed, measured in Node while planning (the overhead evidence records the final run): the stable pass ran the 126×, 13×, 609× and 6,000,000× views 1.70×, 1.67×, 1.42× and 7.2× faster, as the spike measured, and the far-exterior and ambiguous-boundary views stayed within ±1% in both passes. The row kernel's code generation remains the fragile point ADR 0010 records: rerun `tools/benchmark/fallback-overhead.ts`, with and without `--stride`, after any change to `classifyRow` or a V8 upgrade.
- The candidate uses `Math.cbrt`, `Math.atan2`, `Math.cos` and `Math.sin`, which ECMAScript does not require to be correctly rounded. The certificate does not depend on them, so every answer is sound in every engine, but the multiplier's last bits, and at a knife-edge pixel the decision itself, may differ between engines. Before this change status and period depended only on correctly rounded operations.
- The browser release run in both browsers is deferred to the owner's screen session.
````

In `docs/decisions/0010-analytic-period-three.md`, replace the line:

```markdown
7. Period 4 is out of scope until its root-error bound is rigorous.
```

with:

```markdown
7. Period 4 is out of scope until its root-error bound is rigorous. Superseded 2026-10-17 by [ADR 0013](0013-analytic-period-four.md), which ships period 4 with a certified root enclosure.
```

In `docs/PERFORMANCE-MATHEMATICS.md`:

(a) Insert this section directly before the heading `### 12.9 What is proved and what is not`:

````markdown
### 12.8 Placement and gate

Both kernels, [orbit-triggered.ts](../src/domain/orbit-triggered.ts) and the two-lane [triggered-rows.ts](../src/render/triggered-rows.ts), try the solve once per pixel at the first scanning iteration, `max(cycleWarmup, 2)` = 24, before that iteration's full scan, in the same branch as the period-3 closed form (§11.5). The period-3 and period-4 boxes are disjoint, so the branch runs at most one solve. A pixel that escapes earlier never reaches it (c = 0.239189 + 0.567903i, inside the cardioid satellites' box, escapes at iteration 24 and stays escaped: the escape test comes first). The record depends on c alone, so it is bit-identical in both kernels and both passes. With `maxIterations` below the first scanning iteration the solve never runs and the pixel stays unresolved, as the orbit path would leave it.

The gate ([period-four-gate.ts](../src/domain/period-four-gate.ts)) holds four boxes: the cardioid's 1/4 and 3/4 satellites and the complex primitive pair, each folded by conjugation, the 1/2 satellite of the period-2 bulb, and the real primitive component. It must contain every accepted parameter. A unit test checks a 1200 × 1200 grid (4,782 accepted points, all inside), finer grids around every box and points just outside every box edge: measured, not proved, although every accepted parameter does lie in one of the six components (12.2). The scalar kernel calls the straight-line gate. The row kernel evaluates it once per row as two windows on Re c: the off-axis bands are disjoint from each other and from the axis band, and on rows with |Im c| ≤ 6.7·10⁻⁴ both real-axis boxes apply. Each lane has one spill block and one call site, which picks the period-3 or the period-4 solve by a ternary, so `classifyRow` gains no inlinable call (ADR 0010: an inlined gate call there cost about 10% on the far-exterior stable pass). Measured in Node within ±1% on `mi-easy-exterior-heavy` and `mi-fallback-ambiguous-boundary` in the stable and the coarse pass; rerun `tools/benchmark/fallback-overhead.ts`, with and without `--stride`, after any change to `classifyRow` or a V8 upgrade.

Cost: about 190 ns per attempt in Node (the period-3 closed form: about 50 ns), against 1.6–1.7 µs per period-4 pixel on the orbit path in the spike, and unbounded for the near-parabolic pixels the orbit path leaves unresolved.
````

(b) In the §8 claim-taxonomy table, in the row `Closed form evaluated in binary64`, replace the cell text ending `adds a derived binary64 rounding allowance to the same margin` with the same text followed by `; the period-4 cubic (§12, ADR 0013) has an untrusted candidate and accepts only through the certified enclosure of the next row`.

(c) In the same table, in the row `Certified numerical result`, replace the cell text `None in the implementation. The double-double oracle is a higher-precision floating reference, not a certified enclosure` with `The period-4 Rouché disk (§12.4): a ball root enclosure whose binary64 bounds are argued on paper (§12.5) and audited in exact arithmetic on samples, not machine-checked. The double-double oracle is a higher-precision floating reference, not a certified enclosure`.

(d) In the same table, in the row `Experimental`, replace the cell text `Workstream H period 4 (not started; period 3 shipped, §11); workstream J (not started);` with `Workstream J (not started; workstream H shipped period 3, §11, and period 4, §12);`.

(e) In §9, replace:

```markdown
  forms for periods 1, 2 and 3 are the plan's bucket 1–2 exception: they
  accept directly under the same attraction margin, with a derived binary64
  allowance for period 3 (§11, ADR 0010).
```

with:

```markdown
  forms for periods 1, 2 and 3 are the plan's bucket 1–2 exception: they
  accept directly under the same attraction margin, with a derived binary64
  allowance for period 3 (§11, ADR 0010). The period-4 path (§12, ADR 0013)
  is the same exception: its cubic candidate only proposes, and it accepts
  through a ball root enclosure whose binary64 bounds are proved on paper.
```

and replace:

```markdown
  not mathematical facts; "certified" is reserved for interval/ball or
  equivalent proof and does not describe any current acceptance path.
```

with:

```markdown
  not mathematical facts; "certified" is reserved for interval/ball or
  equivalent proof. It describes only the period-4 enclosure of §12, whose
  binary64 bounds are argued on paper and audited exactly on samples, not
  machine-checked.
```

(f) In §10, replace `The period-one, period-two and period-three (§11) analytic tests are the` with `The period-one, period-two, period-three (§11) and period-four (§12) analytic tests are the`.

- [ ] **Step 11: Update the classifier's documentation comments**

In `src/domain/orbit.ts`, replace:

```ts
 * through to the orbit loop. The period-3 closed form
 * (src/domain/analytic-period-three.ts) is not tried here: it runs inside the
 * orbit loop at the first scanning iteration, so pixels that escape early
 * never pay for it (ADR 0010).
```

with:

```ts
 * through to the orbit loop. The period-3 closed form and the period-4 cubic
 * solve (src/domain/analytic-period-three.ts, analytic-period-four.ts) are not
 * tried here: they run inside the orbit loop at the first scanning iteration,
 * so pixels that escape early never pay for them (ADR 0010, ADR 0013).
```

and replace:

```ts
 *    instead of the orbit product. Every such answer is checked against the
 *    dd period-3 cycle in tests/unit/domain/orbit-oracle-adjudication.test.ts.
```

with:

```ts
 *    instead of the orbit product. Every such answer is checked against the
 *    dd period-3 cycle in tests/unit/domain/orbit-oracle-adjudication.test.ts.
 * 7. Analytic period 4 (ADR 0013). At the same iteration the kernels try the
 *    certified period-4 cubic solve (src/domain/analytic-period-four.ts)
 *    inside padded component boxes. It accepts with iterations 0 and the
 *    certified multiplier, so pixels the legacy scan left unresolved become
 *    attracting period 4 (the left half of the 6,000,000x view among them),
 *    and period-4 pixels carry the certified multiplier instead of the orbit
 *    product. Every such answer is checked against the dd period-4 cycle in
 *    tests/unit/domain/orbit-oracle-adjudication.test.ts.
```

- [ ] **Step 12: Repository gates**

Run:

```bash
npx prettier --write docs/decisions/0013-analytic-period-four.md docs/decisions/0010-analytic-period-three.md docs/PERFORMANCE-MATHEMATICS.md fixtures/README.md
npx prettier --write docs/decisions/0013-analytic-period-four.md docs/decisions/0010-analytic-period-three.md docs/PERFORMANCE-MATHEMATICS.md fixtures/README.md
npx prettier --check .
npm run check
ss -ltnp | grep 4174
npx playwright test
```

Expected: `npm run check` passes (90 files; the golden checks pass against the regenerated fixtures); nothing else listens on 4174; Playwright passes in both engines.

- [ ] **Step 13: Commit (one commit for the whole answer change)**

```bash
git add src/domain/orbit-triggered.ts src/render/triggered-rows.ts src/domain/orbit.ts src/render/semantic-store.ts \
  tests/unit/domain/period-four-placement.test.ts tests/unit/render/period-four-golden-oracle.test.ts tests/unit/render/period-four-coarse.test.ts \
  tests/unit/render/triggered-rows.test.ts tests/unit/domain/orbit-scalar-parity.test.ts tests/unit/domain/orbit-oracle-adjudication.test.ts \
  tests/unit/domain/verifier.test.ts poc/performance/src/control.test.ts tsconfig.app.json tools/generate_kernel_golden.ts \
  fixtures/kernel-golden.v1.json fixtures/colorized-golden.v1.json fixtures/README.md tests/visual/__screenshots__ \
  docs/decisions/0013-analytic-period-four.md docs/decisions/0010-analytic-period-three.md docs/PERFORMANCE-MATHEMATICS.md
git commit -m "$(cat <<'EOF'
Kernels: certified period-4 solve at the first scan (ADR 0013)

Both kernels try the period-4 cubic solve once per pixel at iteration 24,
behind the component-box gate, in the branch of the period-3 closed form.
8,614 golden-raster pixels move from unresolved to attracting period 4 and
3,821 report the certified multiplier; all 12,435 are dd-certified in
period-four-golden-oracle.test.ts. Fixtures regenerated in this commit
(ADR 0007, fixtures/README.md): kernel-golden.v1.json (mi-easy-default-full,
mi-hard-supplied-126x, mi-hard-supplied-609x, mi-hard-supplied-13x,
mi-scale-6mx-basilica-rim) and colorized-golden.v1.json (four default-view
and three 126x cases), and the default-stability, period-four-126x-period
and catalog-overlay screenshot baselines in both engines. The semantic
cache algorithm version is bumped to 4.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

(If Step 9 was skipped, drop the screenshot clause and add its sentence instead.)

---

### Task 8: Independent 80-digit fixtures for period-4 points and a period-8 satellite

**Files:**

- Modify: `tools/generate_orbit_fixtures.py` (one `expectedEvidence`, four new cases)
- Modify: `fixtures/orbits.v1.json` (regenerated)
- Modify: `fixtures/README.md` (the orbit-fixture list)
- Modify: `tests/unit/domain/orbit-scalar-parity.test.ts` (the legacy tolerance)

**Interfaces:**

- Consumes: the wired kernels (Task 7). The generator itself is independent: Python `Decimal` at 80 digits iterates the critical orbit to a closed cycle of the declared period and computes its multiplier; it uses no cubic and no TypeScript.

The new parameters, chosen during planning with mpmath: |λ| ≈ 0.99 in the 1/2 satellite of the period-2 bulb (c = −5/4 − 6.25·10⁻⁴), in the real primitive component 2.5·10⁻⁸ from its cusp, and on the cardioid satellite's rim at arg λ = 2; and a strongly attracting period-8 point (|λ₈| = 0.0046) inside the cardioid satellites' gate box, which the period-4 path must not answer. At |λ| = 0.99 the generator needs about 21,000–26,000 iterations; the whole run takes about a second.

- [ ] **Step 1: Add the cases**

In `tools/generate_orbit_fixtures.py`, replace:

```python
    {
        "id": "period-four-off-center",
        "parameter": {"re": "-1.30", "im": "0"},
        "expectedStatus": "attracting-cycle",
        "knownPeriod": 4,
        "maxIterations": 2048,
    },
```

with:

```python
    {
        "id": "period-four-off-center",
        "parameter": {"re": "-1.30", "im": "0"},
        "expectedStatus": "attracting-cycle",
        "knownPeriod": 4,
        "maxIterations": 2048,
        "expectedEvidence": ["analytic-period-4-component"],
    },
    {
        "id": "period-four-basilica-rim",
        "parameter": {"re": "-1.250625", "im": "0"},
        "expectedStatus": "attracting-cycle",
        "knownPeriod": 4,
        "maxIterations": 65536,
        "expectedEvidence": ["analytic-period-4-component"],
    },
    {
        "id": "period-four-real-primitive-near-cusp",
        "parameter": {"re": "-1.9405508139761496", "im": "0"},
        "expectedStatus": "attracting-cycle",
        "knownPeriod": 4,
        "maxIterations": 65536,
        "expectedEvidence": ["analytic-period-4-component"],
    },
    {
        "id": "period-four-cardioid-satellite-rim",
        "parameter": {"re": "0.32045830055798563", "im": "0.5123032453806926"},
        "expectedStatus": "attracting-cycle",
        "knownPeriod": 4,
        "maxIterations": 65536,
        "expectedEvidence": ["analytic-period-4-component"],
    },
    {
        "id": "period-eight-cardioid-satellite-satellite",
        "parameter": {"re": "0.32484", "im": "0.56386"},
        "expectedStatus": "attracting-cycle",
        "knownPeriod": 8,
        "maxIterations": 16384,
        "expectedEvidence": ["converged-cycle"],
    },
```

- [ ] **Step 2: Regenerate the fixture and run the fixture test**

Run:

```bash
python3 tools/generate_orbit_fixtures.py > fixtures/orbits.v1.json
npx prettier --write fixtures/orbits.v1.json
npm run fixtures:check
npx vitest run tests/unit/domain/orbit-fixtures.test.ts tests/unit/domain/orbit-scalar-parity.test.ts
```

Expected: `validated 14 high-precision orbit fixtures at 80 decimal digits`; `orbit-fixtures.test.ts` passes (the period-4 cases match within the declared 1e-7 and report `analytic-period-4-component`; the period-8 case is found by the lag scan). `orbit-scalar-parity.test.ts` fails exactly one test, `matches the legacy reference and the independent fixtures through the scalar core`, with `expected 0.0000303… to be less than or equal to 0.00001`: at the near-cusp point the legacy orbit product is 3.0e-5 from the certified multiplier (the certified one matches the 80-digit value within 1e-7).

The new magnitudes in `fixtures/orbits.v1.json` start: `period-four-basilica-rim` 0.98999699948762809, `period-four-real-primitive-near-cusp` 0.99002309841361240, `period-four-cardioid-satellite-rim` 0.98999999999999948, `period-eight-cardioid-satellite-satellite` 0.0045885161166684027. If they differ in the first twelve digits, stop and report.

- [ ] **Step 3: Widen the legacy tolerance to the measured orbit-product error**

In `tests/unit/domain/orbit-scalar-parity.test.ts`, replace:

```ts
 * golden raster, 2.2e-6 in the H spike); the dd adjudication pins the
 * analytic multipliers to 1e-12 (period 3) and to the certificate's
 * allowance (period 4).
 */
const LEGACY_ANALYTIC_MAGNITUDE_TOLERANCE = 1e-5;
```

with:

```ts
 * golden raster, 2.2e-6 in the H spike, 3.0e-5 at the near-cusp period-4
 * fixture); the dd adjudication pins the analytic multipliers to 1e-12
 * (period 3) and to the certificate's allowance (period 4).
 */
const LEGACY_ANALYTIC_MAGNITUDE_TOLERANCE = 1e-4;
```

Run: `npx vitest run tests/unit/domain/orbit-fixtures.test.ts tests/unit/domain/orbit-scalar-parity.test.ts`
Expected: PASS.

- [ ] **Step 4: Document the fixtures**

In `fixtures/README.md`, replace:

```markdown
  satellite inside that path's gate box, which it must not answer; and
```

with:

```markdown
  satellite inside that path's gate box, which it must not answer;
- period-four points at |λ| ≈ 0.99 in the 1/2 satellite of the period-2 bulb,
  next to the real primitive cusp and on a cardioid satellite's rim, which the
  certified period-4 path answers (ADR 0013), and a period-eight point inside
  that path's gate box, which it must not answer; and
```

- [ ] **Step 5: Repository gates**

Run:

```bash
npx prettier --write fixtures/README.md
npx prettier --write fixtures/README.md
npx prettier --check fixtures/README.md fixtures/orbits.v1.json
npm run check
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add tools/generate_orbit_fixtures.py fixtures/orbits.v1.json fixtures/README.md tests/unit/domain/orbit-scalar-parity.test.ts
git commit -m "$(cat <<'EOF'
Fixtures: 80-digit references for period-4 points and a period-8 satellite

The legacy-parity tolerance for analytic multipliers widens to 1e-4: the
orbit product is 3.0e-5 off at the near-cusp period-4 fixture, where the
certified multiplier matches the 80-digit reference.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: The inspector reports how a period-4 pixel was classified (E2E)

**Files:**

- Modify: `tests/e2e/explorer.spec.ts` (one test)

**Interfaces:**

- Consumes: the catalog marker `Inspect Period-4 component 2, period 4` (the 1/2 satellite of the period-2 bulb, centre −1.3107, visible at the default view), the inspector's `.inspector__classification`, `.inspector__evidence` and `.facts`, and Task 2's label.

- [ ] **Step 1: Write the test**

In `tests/e2e/explorer.spec.ts`, directly before the line `  test('zooms to a selected area and reveals labels as magnification increases', async ({`, insert:

```ts
  test('a period-4 marker reports the certified period-4 solve', async ({ page }) => {
    await page.goto('/');

    const marker = page.getByRole('button', { name: 'Inspect Period-4 component 2, period 4' });
    await expect(marker).toBeVisible({ timeout: 20_000 });
    await marker.focus();
    await marker.press('Enter');

    await expect(page.getByRole('heading', { name: 'Period-4 component 2' })).toBeVisible();
    const pointEvidence = page.getByRole('region', { name: 'Point evidence' });
    await expect(pointEvidence.locator('.inspector__classification')).toHaveText(
      'Attracting cycle',
      { timeout: 10_000 },
    );
    // ADR 0013: the certified cubic solve answers, and the inspector says so.
    await expect(pointEvidence.locator('.inspector__evidence')).toHaveText(
      'Analytic Period 4 Component',
    );
    await expect(
      pointEvidence.locator('.facts').getByText('Analytic closed form', { exact: true }),
    ).toBeVisible();
  });
```

- [ ] **Step 2: Run it**

Run: `ss -ltnp | grep 4174; npx playwright test tests/e2e/explorer.spec.ts -g "period-4 marker reports"`
Expected: nothing else on port 4174; 2 passed (Chromium and Firefox).

- [ ] **Step 3: Repository gates**

Run: `npm run check && npx playwright test`
Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/explorer.spec.ts
git commit -m "$(cat <<'EOF'
E2E: a period-4 marker reports the certified period-4 solve

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Record the oracle adjudication of every changed pixel, and the deep view

**Files:**

- Create: `evidence/phase-2/<date>-<sha>-period-four-adjudication/` with `environment.json`, `raw-observations.json`, `semantic-comparison.json`, `deep-view-1024x640.json`, `summary.md`, `manifest.sha256`

Shell variables do not persist between separate commands: every command block below sets the variables it uses. `<date>` is today's date (`date +%F`); `<sha>` is the short SHA of the **Task 7 commit** (the build whose answers are adjudicated): `git log --format=%h --grep='^Kernels: certified period-4 solve' -1`. The baseline is the Task 6 commit: `git log --format=%h --grep='^Tools: coarse-pass stride, dump raster, period-4 adjudicator' -1`. The after dumps are taken at the current HEAD; Tasks 8 and 9 do not touch `src/`, so its kernels are those of the Task 7 commit, and the summary says so.

**Interfaces:**

- Consumes: `npm run fixtures:pixel-dump` with `--raster` and `--cases`, and `npm run evidence:period-four` (Task 6).

- [ ] **Step 1: Produce the before and after dumps**

```bash
BASE=$(git log --format=%h --grep='^Tools: coarse-pass stride, dump raster, period-4 adjudicator' -1)
echo "baseline $BASE"
git diff --stat "$(git log --format=%h --grep='^Kernels: certified period-4 solve' -1)" HEAD -- src
git worktree add .worktrees/h4-baseline "$BASE"
ln -s "$PWD/node_modules" .worktrees/h4-baseline/node_modules
mkdir -p .evidence-build/h4
(cd .worktrees/h4-baseline && npm run fixtures:pixel-dump -- ../../.evidence-build/h4/before.json)
(cd .worktrees/h4-baseline && npm run fixtures:pixel-dump -- ../../.evidence-build/h4/deep-before.json --raster 1024x640 --cases mi-scale-6mx-basilica-rim)
npm run fixtures:pixel-dump -- .evidence-build/h4/after.json
npm run fixtures:pixel-dump -- .evidence-build/h4/deep-after.json --raster 1024x640 --cases mi-scale-6mx-basilica-rim
git worktree remove --force .worktrees/h4-baseline
ls -la .evidence-build/h4/
```

Expected: `baseline <sha>` (non-empty); the `git diff --stat … -- src` prints nothing (no `src/` change since Task 7); `before.json` and `after.json` of about 7 MB, `deep-before.json` about 20 MB and `deep-after.json` about 32 MB; the worktree removed.

- [ ] **Step 2: Run the adjudication at the golden raster into the evidence directory**

```bash
SHA=$(git log --format=%h --grep='^Kernels: certified period-4 solve' -1)
DIR="evidence/phase-2/$(date +%F)-$SHA-period-four-adjudication"
mkdir -p "$DIR"
npm run evidence:period-four -- .evidence-build/h4/before.json .evidence-build/h4/after.json "$DIR" | tee .evidence-build/h4/adjudication.txt; echo "exit ${PIPESTATUS[0]}"
```

Expected output (deterministic; if any number differs, stop and report instead of editing), then `exit 0`:

```text
| Case | Transition | Pixels |
| --- | --- | ---: |
| mi-easy-default-full | attracting-p4 -> attracting-p4 | 30 |
| mi-easy-default-full | unresolved -> attracting-p4 | 2 |
| mi-hard-supplied-126x | unresolved -> attracting-p4 | 312 |
| mi-hard-supplied-126x | attracting-p4 -> attracting-p4 | 1772 |
| mi-hard-supplied-609x | unresolved -> attracting-p4 | 84 |
| mi-hard-supplied-609x | attracting-p4 -> attracting-p4 | 593 |
| mi-hard-supplied-13x | unresolved -> attracting-p4 | 216 |
| mi-hard-supplied-13x | attracting-p4 -> attracting-p4 | 1426 |
| mi-scale-6mx-basilica-rim | unresolved -> attracting-p4 | 8000 |

| Case | View | Colour changed: status | Colour changed: multiplier only |
| --- | --- | ---: | ---: |
| mi-easy-default-full | stability | 2 | 0 |
| mi-easy-default-full | multiplier | 2 | 0 |
| mi-easy-default-full | period | 2 | 0 |
| mi-hard-supplied-126x | stability | 312 | 0 |
| mi-hard-supplied-126x | multiplier | 312 | 0 |
| mi-hard-supplied-126x | period | 312 | 0 |
| mi-hard-supplied-609x | stability | 84 | 0 |
| mi-hard-supplied-609x | multiplier | 84 | 0 |
| mi-hard-supplied-609x | period | 84 | 0 |
| mi-hard-supplied-13x | stability | 216 | 0 |
| mi-hard-supplied-13x | multiplier | 216 | 0 |
| mi-hard-supplied-13x | period | 216 | 0 |
| mi-scale-6mx-basilica-rim | stability | 8000 | 0 |
| mi-scale-6mx-basilica-rim | multiplier | 8000 | 0 |
| mi-scale-6mx-basilica-rim | period | 8000 | 0 |

| Case | Unresolved before | Unresolved after |
| --- | ---: | ---: |
| mi-easy-default-full | 66 | 64 |
| mi-hard-supplied-126x | 498 | 186 |
| mi-hard-supplied-609x | 145 | 61 |
| mi-hard-supplied-13x | 369 | 153 |
| mi-scale-6mx-basilica-rim | 8000 | 0 |

changed 12435, unsupported 0, max analytic error 3.51e-12, max allowance 5.63e-9, max error/allowance 4.51e-3, max orbit-product error before 3.20e-6
analytic path answered 12435, changed 12435, answered but unchanged 0
```

- [ ] **Step 3: The deep view at the shipping raster**

```bash
DIR=$(ls -d evidence/phase-2/*-period-four-adjudication)
mkdir -p .evidence-build/h4/deep-out
npm run evidence:period-four -- .evidence-build/h4/deep-before.json .evidence-build/h4/deep-after.json .evidence-build/h4/deep-out | tee .evidence-build/h4/deep.txt; echo "exit ${PIPESTATUS[0]}"
cp .evidence-build/h4/deep-out/semantic-comparison.json "$DIR/deep-view-1024x640.json"
```

Expected output (deterministic), then `exit 0`; it takes about 20 s:

```text
| Case | Transition | Pixels |
| --- | --- | ---: |
| mi-scale-6mx-basilica-rim | unresolved -> attracting-p4 | 327680 |

| Case | View | Colour changed: status | Colour changed: multiplier only |
| --- | --- | ---: | ---: |
| mi-scale-6mx-basilica-rim | stability | 327680 | 0 |
| mi-scale-6mx-basilica-rim | multiplier | 327680 | 0 |
| mi-scale-6mx-basilica-rim | period | 327680 | 0 |

| Case | Unresolved before | Unresolved after |
| --- | ---: | ---: |
| mi-scale-6mx-basilica-rim | 327680 | 0 |

changed 327680, unsupported 0, max analytic error 1.13e-14, max allowance 3.59e-12, max error/allowance 3.15e-3, max orbit-product error before 0.00e+0
analytic path answered 327680, changed 327680, answered but unchanged 0
```

The deep run's per-pixel `raw-observations.json` (327,680 rows, about 30 MB) stays in `.evidence-build/`: it exceeds the plain-JSON size the evidence policy admits, and the run is reproducible from the two commands above. The golden-raster run is the normative record.

- [ ] **Step 4: Environment, summary, formatting, manifest**

```bash
DIR=$(ls -d evidence/phase-2/*-period-four-adjudication)
node tools/benchmark/capture-environment.mjs --out "$DIR/environment.json" --note "Workstream H period 4 (ADR 0013): oracle adjudication of every pixel whose stable-pass output changed at the golden raster, and of the 6,000,000x view at 1024x640 (npm run evidence:period-four); Node, deterministic, no timing."
```

Create `summary.md` in that directory with this content, replacing `<DATE>`, `<SHA>`, `<BASE>` (Step 1), `<HEAD>` (`git log --format=%h -1`) and pasting the three tables from `.evidence-build/h4/adjudication.txt`:

```markdown
# Period-4 answer-change adjudication — <DATE> @ <SHA>

Workstream H period 4 ([ADR 0013](../../../docs/decisions/0013-analytic-period-four.md)).
Plan §3: a changed answer ships only when the oracle supports it; ADR 0007:
an intended kernel change regenerates the golden fixture with oracle evidence
for the changed pixels.

- **Before:** `<BASE>` (kernels without the period-4 path). **After:** `<SHA>` (the after dumps were taken at `<HEAD>`, which records `afterCommit` in the JSON files; `src/` is identical to `<SHA>`).
- **Raster:** the golden raster, 160×100, every frozen-corpus case at its profile (`tools/kernel_pixel_dump.ts`); and the 6,000,000× view alone at the shipping raster, 1024×640.
- **Oracle:** `ddPeriodFourCycle` (`tests/unit/domain/dd-oracle.ts`): a binary64 orbit seed, dd Newton on f⁴(z) − z, dd divisor test and dd |λ| < 1. It uses no cubic.
- **Supported** means: the new record is exactly the analytic period-4 record at c, and the dd cycle has primitive period 4 with |λ − λ_dd| ≤ A + 1e-12, where A is the certificate's allowance at c (PERFORMANCE-MATHEMATICS §12.4: the certificate itself claims A/2).
- Command: `npm run evidence:period-four -- before.json after.json <this directory>`; the deep view: the same with `--raster 1024x640 --cases mi-scale-6mx-basilica-rim` dumps. Node, deterministic; the machine does not affect the result.

## Changed pixels

<paste the first table>

All 12,435 changed pixels are supported: **0 unsupported**. The largest distance between the certified multiplier and the dd multiplier is 3.5e-12, at most 4.5e-3 of the allowance (largest allowance 5.6e-9, next to the real primitive cusp in the 609× view); before the change, the orbit-product multiplier of the 3,821 already-period-4 pixels was up to 3.2e-6 from the dd value.

**The changed set equals the analytic answer set.** The tool evaluates the analytic classifier at every pixel centre: it answers 12,435 pixels, exactly the 12,435 that changed; no other pixel changed in any case (`changedSetEqualsAnalyticSet` in `semantic-comparison.json`).

## Colour

<paste the second table>

The multiplier change alone alters no colorized byte in any view; only the 8,614 status changes are visible. Other cases: no change.

## Unresolved pixels

<paste the third table>

## The 6,000,000× view at 1024×640

All 327,680 pixels of the view's left half move from unresolved to attracting period 4 and are supported (0 unsupported; largest |λ − λ_dd| 1.1e-14, allowance 3.6e-12); no pixel of the view stays unresolved. This resolves the unresolved half of the basilica-rim view (PHASE2-TODO item 8). The comparison is `deep-view-1024x640.json`; its per-pixel rows (30 MB) are not committed and are reproduced by the command above.

## Limits

- One raster and one corpus, plus one view at the shipping raster. `tests/unit/render/period-four-golden-oracle.test.ts` repeats the dd check for every analytic period-4 pixel of the golden raster on every test run.
- The dd oracle certifies |λ| < 1 without a margin; agreement within the allowance with the analytic multiplier, which carries the margin, is what is claimed. The acceptance itself rests on the enclosure of PERFORMANCE-MATHEMATICS §12, not on this comparison.
- No semantic change outside period 4 (no other transition occurs).
```

Then:

```bash
DIR=$(ls -d evidence/phase-2/*-period-four-adjudication)
npx prettier --write "$DIR"
npx prettier --write "$DIR"
npx prettier --check "$DIR"
node tools/benchmark/manifest.mjs "$DIR"
node tools/benchmark/manifest.mjs --check "$DIR"
du -h "$DIR/raw-observations.json"
```

Expected: the manifest check passes; `raw-observations.json` is about 2.0 MB (below the 5 MiB plain-JSON threshold of `evidence/phase-2/README.md`).

- [ ] **Step 5: Repository gates**

Run: `npm run check`
Expected: pass.

- [ ] **Step 6: Commit**

```bash
DIR=$(ls -d evidence/phase-2/*-period-four-adjudication)
git add "$DIR"
git commit -m "$(cat <<'EOF'
Evidence: dd adjudication of every pixel the period-4 path changed

12,435 changed golden-raster pixels and 327,680 pixels of the 6,000,000x
view at 1024x640, 0 unsupported (ADR 0013).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Record the fallback overhead and the hard-view gain

**Files:**

- Create: `evidence/phase-2/<date>-<sha>-period-four-overhead/` with `environment.json`, `raw-observations.json`, `summary.md`, `manifest.sha256` (no semantic comparison: the arms classify identically outside period-4 components, Task 10 adjudicates the rest, and timing is the subject)

`<sha>` is the Task 7 commit, as in Task 10. Shell variables do not persist between separate commands: every command block below sets the variables it uses. If you rerun Step 3 on a later date, delete the earlier, incomplete directory first.

**Interfaces:**

- Consumes: `tools/benchmark/overhead-entry.ts` and `tools/benchmark/fallback-overhead.ts` with `--stride` (Task 6).

Three runs, all with the same three interleaved arms (`baseline` = Task 6, `control` = a byte copy of it, `candidate` = HEAD):

1. **The gate** (`fallback ≤ 5%`): the stable pass on `mi-easy-exterior-heavy` and `mi-fallback-ambiguous-boundary`, 1024×640, 60 repetitions.
2. **The coarse pass** on the same two cases (stride 8, 4096×2560, so the scalar kernel classifies as many pixels as a 1024×640 stable pass would at a quarter of the cost), 40 repetitions. The period-3 work did not measure it.
3. **The gain** on the spike's views: `mi-hard-supplied-126x`, `mi-hard-supplied-13x`, `mi-hard-supplied-609x`, `mi-scale-6mx-basilica-rim`, `mi-easy-default-full`, stable pass, 1024×640, 15 repetitions. The tool reports "overhead" = candidate/baseline − 1; the speedup is 1/(1 + overhead).

- [ ] **Step 1: Check the machine is quiet**

Run: `uptime; ps -eo pcpu,comm --sort=-pcpu | head -6`
Expected: 1-minute load average below 2 and no browser, test runner or build near the top. If other work is running, wait and re-check every few minutes; after 30 minutes without a quiet window, stop and report `BLOCKED: no quiet window for the fallback-overhead run` to the controller. Do not inhibit the screen lock or change power settings.

- [ ] **Step 2: Build both arms**

```bash
BASE=$(git log --format=%h --grep='^Tools: coarse-pass stride, dump raster, period-4 adjudicator' -1)
git worktree add .worktrees/h4-baseline "$BASE"
ln -s "$PWD/node_modules" .worktrees/h4-baseline/node_modules
(cd .worktrees/h4-baseline && npx vite build --ssr tools/benchmark/overhead-entry.ts --outDir ../../.evidence-build/overhead4/baseline --emptyOutDir --logLevel warn)
npx vite build --ssr tools/benchmark/overhead-entry.ts --outDir .evidence-build/overhead4/candidate --emptyOutDir --logLevel warn
git worktree remove --force .worktrees/h4-baseline
ls .evidence-build/overhead4/baseline/overhead-entry.js .evidence-build/overhead4/candidate/overhead-entry.js
```

Expected: both bundle files exist.

- [ ] **Step 3: Run the three measurements pinned to one core**

```bash
uptime | tee .evidence-build/overhead4/load.txt
B=.evidence-build/overhead4/baseline/overhead-entry.js
C=.evidence-build/overhead4/candidate/overhead-entry.js
taskset -c 3 node tools/benchmark/fallback-overhead.ts "$B" "$C" --reps 60 --out .evidence-build/overhead4/stable.json | tee .evidence-build/overhead4/stable.txt; echo "exit ${PIPESTATUS[0]}"
taskset -c 3 node tools/benchmark/fallback-overhead.ts "$B" "$C" --reps 40 --stride 8 --raster 4096x2560 --out .evidence-build/overhead4/coarse.json | tee .evidence-build/overhead4/coarse.txt; echo "exit ${PIPESTATUS[0]}"
taskset -c 3 node tools/benchmark/fallback-overhead.ts "$B" "$C" --reps 15 --cases mi-hard-supplied-126x,mi-hard-supplied-13x,mi-hard-supplied-609x,mi-scale-6mx-basilica-rim,mi-easy-default-full --out .evidence-build/overhead4/hard.json | tee .evidence-build/overhead4/hard.txt; echo "exit ${PIPESTATUS[0]}"
```

Expected: each run prints `exit 0` and `PASS` on every line. The prototype measured: stable `mi-easy-exterior-heavy` within −0.34% … +0.21% and `mi-fallback-ambiguous-boundary` within −0.88% … −0.04%; coarse +0.50% and −0.74%; hard views −41.06% (126×), −40.27% (13×), −29.36% (609×), −86.12% (6,000,000×), −3.36% (default), that is 1.70×, 1.67×, 1.42×, 7.2× and 1.03×. Your numbers will differ by a few percent.

- `exit 3` (NOISY: the A/A control moved more than 2%): this happened in two of four prototype stable runs, always on the far exterior with the control arm at +18% to +21%, the bimodal compile ADR 0010 describes, landing in the byte-identical control copy. Re-check Step 1, then rerun that measurement on another core (`taskset -c 5`, then `taskset -c 6`). After three noisy runs of the same measurement, stop and report `BLOCKED: environment too noisy` with the outputs.
- `exit 1` (a case above 5% with a quiet control): do not change code. Stop and report `BLOCKED: fallback overhead above 5%` with the `.txt` and `.json` files. The controller escalates to the owner (the H gate says fallback ≤ 5%).
- The hard-view run is not a gate; if its control arm is noisy, rerun it once and record whichever run had the quieter control.

- [ ] **Step 4: Environment, raw observations, summary, manifest**

```bash
SHA=$(git log --format=%h --grep='^Kernels: certified period-4 solve' -1)
DIR="evidence/phase-2/$(date +%F)-$SHA-period-four-overhead"
mkdir -p "$DIR"
node -e 'const fs = require("fs"); const read = (n) => JSON.parse(fs.readFileSync(`.evidence-build/overhead4/${n}.json`, "utf8")); fs.writeFileSync(process.argv[1], JSON.stringify({ schemaVersion: 1, description: "Three runs of tools/benchmark/fallback-overhead.ts (ADR 0013): the stable-pass gate, the coarse pass, and the hard-view gain; each as the tool wrote it, every sample included", runs: { stable: read("stable"), coarse: read("coarse"), hardViews: read("hard") } }, null, 2) + "\n");' "$DIR/raw-observations.json"
node tools/benchmark/capture-environment.mjs --out "$DIR/environment.json" --note "Workstream H period 4 (ADR 0013): fallback-overhead microbenchmark (stable and coarse pass) and the hard-view gain, three interleaved arms (baseline, A/A control, candidate) in one Node process, pinned with taskset; directional Node evidence, not a release measurement."
```

Create `summary.md` in that directory, replacing the placeholders with the values from the three `.txt` files, `load.txt` and `git`:

```markdown
# Period-4 fallback overhead and hard-view gain — <DATE> @ <SHA>

Workstream H gate (plan §5): `fallback ≤5%`. Does the certified period-4 path
([ADR 0013](../../../docs/decisions/0013-analytic-period-four.md)) slow the
views it never answers, and how much faster are the views it does answer?

- **Label:** directional (Node v24, one laptop, no browser).
- **Arms**, interleaved in one process, order rotating every repetition:
  `baseline` (`<BASE>`, kernels with the period-3 path and without the
  period-4 path), `control` (a byte copy of the baseline bundle: an A/A arm
  for position and JIT noise), `candidate` (`<SHA>`). Every arm first
  classifies the whole corpus at 256×160 so its JIT state carries feedback
  from every path.
- **Statistic:** overhead = 1/ratio − 1 for the paired median log-ratio, 95%
  BCa interval, 10,000 resamples, seed 20261016
  (`tools/benchmark/harness/stats.ts`). Speedup = 1/(1 + overhead).
- `taskset -c <CORE>`; 1-minute load average <LOAD> at start.

## The gate: stable pass, 1024×640, 60 repetitions

| Case                           | Baseline median ms | Candidate overhead [95% BCa] | Control (A/A) | Result |
| ------------------------------ | -----------------: | ---------------------------- | ------------- | ------ |
| mi-easy-exterior-heavy         |              <ms>  | <x%> [<lo%>, <hi%>]          | <c%>          | PASS   |
| mi-fallback-ambiguous-boundary |              <ms>  | <x%> [<lo%>, <hi%>]          | <c%>          | PASS   |

Both cases are within the 5% limit with a quiet control arm (|A/A| ≤ 2%).

## The coarse pass: stride 8, 4096×2560, 40 repetitions

| Case                           | Baseline median ms | Candidate overhead [95% BCa] | Control (A/A) | Result |
| ------------------------------ | -----------------: | ---------------------------- | ------------- | ------ |
| mi-easy-exterior-heavy         |              <ms>  | <x%> [<lo%>, <hi%>]          | <c%>          | PASS   |
| mi-fallback-ambiguous-boundary |              <ms>  | <x%> [<lo%>, <hi%>]          | <c%>          | PASS   |

The scalar kernel inlines `inPeriodFourGate` beside `inPeriodThreeGate`; at
this raster it classifies 163,840 pixels per repetition.

## The gain: stable pass, 1024×640, 15 repetitions

| Case                      | Baseline median ms | Candidate overhead [95% BCa] | Speedup | Spike (Node, scalar, 256×160) |
| ------------------------- | -----------------: | ---------------------------- | ------: | ----------------------------: |
| mi-hard-supplied-126x     |              <ms>  | <x%> [<lo%>, <hi%>]          |   <s>×  |                         1.79× |
| mi-hard-supplied-13x      |              <ms>  | <x%> [<lo%>, <hi%>]          |   <s>×  |                         1.68× |
| mi-hard-supplied-609x     |              <ms>  | <x%> [<lo%>, <hi%>]          |   <s>×  |                         1.38× |
| mi-scale-6mx-basilica-rim |              <ms>  | <x%> [<lo%>, <hi%>]          |   <s>×  |                          8.4× |
| mi-easy-default-full      |              <ms>  | <x%> [<lo%>, <hi%>]          |   <s>×  |                         1.10× |

The spike's column is its period-3-plus-period-4 prototype against production
of the time; these four hard views have no period-3 pixels, so the comparison
is like for like. The 6,000,000× view also resolves completely (Task 10).

## Limits

- Node only; the browser release run in both browsers is deferred to the
  owner's screen session.
- The far-exterior stable pass is bimodal in V8 (ADR 0010); runs whose A/A
  control moved by more than 2% were discarded and rerun.
- `raw-observations.json` holds the three runs as the tool wrote them, every
  sample included.
```

Then:

```bash
DIR=$(ls -d evidence/phase-2/*-period-four-overhead)
npx prettier --write "$DIR"
npx prettier --write "$DIR"
npx prettier --check "$DIR"
node tools/benchmark/manifest.mjs "$DIR"
node tools/benchmark/manifest.mjs --check "$DIR"
```

Expected: the manifest check passes.

- [ ] **Step 5: Repository gates**

Run: `npm run check`
Expected: pass.

- [ ] **Step 6: Commit**

```bash
DIR=$(ls -d evidence/phase-2/*-period-four-overhead)
git add "$DIR"
git commit -m "$(cat <<'EOF'
Evidence: period-4 fallback overhead within 5% and the hard-view gain (Node)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Traceability, plan status, and the deferred browser run

**Files:**

- Modify: `docs/verification/REQUIREMENTS.md` (`MI-PERF-004` statement; `MI-PERF-001`, `MI-PERF-002`, `MI-PERF-004` trace rows)
- Modify: `model/MandelbrotInteriority.sysml` (`MI-PERF-004` doc, worded as in `REQUIREMENTS.md`)
- Modify: `docs/PERFORMANCE-PLAN.md` (workstream H row)
- Modify: `docs/verification/WORKSTREAM-DISPOSITIONS.md` (H row and H section)
- Modify: `docs/verification/PHASE-2-CLOSEOUT.md` (three sentences that say only period 3 differs)
- Modify: `docs/verification/PHASE2-TODO.md` (item 8 checkbox)
- Modify: `docs/decisions/0013-analytic-period-four.md` (evidence links)

**Interfaces:**

- Consumes: the two evidence directory names from Tasks 10 and 11, `ls -d evidence/phase-2/*-period-four-adjudication evidence/phase-2/*-period-four-overhead`, and the Task 7 short SHA, `git log --format=%h --grep='^Kernels: certified period-4 solve' -1`. Below they are `<ADJ>`, `<OVH>` (directory names only, without `evidence/phase-2/`) and `<K>`. Replace every placeholder; Step 9 checks that none is left.

- [ ] **Step 1: Check every anchor exists exactly once**

```bash
grep -cF "with a declared binary64 allowance, ADR 0010); exhausted or ambiguous work shall remain unresolved." docs/verification/REQUIREMENTS.md
grep -cF '(../../evidence/phase-2/2026-10-17-1bffe34-period-three-overhead/summary.md)), each with environment, raw observations, summary and a verified manifest' docs/verification/REQUIREMENTS.md
grep -cF '`src/domain/analytic-period-three.ts` and `src/domain/period-three-gate.ts` (ADR 0010)' docs/verification/REQUIREMENTS.md
grep -cF 'and since 9c1471e the golden kernel fixture guards the post-ADR-0010 kernel;' docs/verification/REQUIREMENTS.md
grep -cF 'every changed pixel dd-adjudicated in `tests/unit/render/period-three-golden-oracle.test.ts` and `tests/unit/domain/orbit-oracle-adjudication.test.ts`)' docs/verification/REQUIREMENTS.md
grep -cF 'are accepted by the attraction margin plus a derived allowance (owner decision 2026-10-17, [ADR 0010](../decisions/0010-analytic-period-three.md))' docs/verification/REQUIREMENTS.md
grep -cF '* binary64 allowance, ADR 0010); exhausted or ambiguous work' model/MandelbrotInteriority.sysml
grep -cF 'Browser release run pending (owner). Period 4 not started: it needs a rigorous root-error bound.' docs/PERFORMANCE-PLAN.md
grep -cF '**Period 3 landed** (ADR 0010); period 4 not started' docs/verification/WORKSTREAM-DISPOSITIONS.md
grep -cF 'exclusion disk) before its cubic solve may accept.' docs/verification/WORKSTREAM-DISPOSITIONS.md
grep -cF 'Since 2026-10-17 that holds except the analytic period-3 class (ADR 0010)' docs/verification/PHASE-2-CLOSEOUT.md
grep -cF 'since 2026-10-17 the analytic period-3 class differs by design, ADR 0010,' docs/verification/PHASE-2-CLOSEOUT.md
grep -cF 'scan holds only outside the analytic period-3 pixels.' docs/verification/PHASE-2-CLOSEOUT.md
grep -cF -- '- [ ] **Period 4, after a rigorous root-error bound**' docs/verification/PHASE2-TODO.md
```

Expected: every count is `1`. If one is `0`, another plan edited that text: find the equivalent sentence by its meaning and edit it the same way; report what you changed.

- [ ] **Step 2: REQUIREMENTS.md**

In `docs/verification/REQUIREMENTS.md`:

Replace `with a declared binary64 allowance, ADR 0010); exhausted or ambiguous work shall remain unresolved.` (the `MI-PERF-004` statement) with `with a declared binary64 allowance, ADR 0010; the period-4 cubic solve accepts the same way through a certified root enclosure, ADR 0013); exhausted or ambiguous work shall remain unresolved.`

Replace `(../../evidence/phase-2/2026-10-17-1bffe34-period-three-overhead/summary.md)), each with environment, raw observations, summary and a verified manifest` with:

```markdown
(../../evidence/phase-2/2026-10-17-1bffe34-period-three-overhead/summary.md)), each with environment, raw observations, summary and a verified manifest. Workstream H period 4 (ADR 0013): oracle adjudication of every changed golden-raster pixel and of the 6,000,000× view at 1024×640 ([`evidence/phase-2/<ADJ>/`](../../evidence/phase-2/<ADJ>/summary.md)) and the Node fallback-overhead and hard-view measurement ([`evidence/phase-2/<OVH>/`](../../evidence/phase-2/<OVH>/summary.md)), each with environment, raw observations, summary and a verified manifest
```

Replace `` `src/domain/analytic-period-three.ts` and `src/domain/period-three-gate.ts` (ADR 0010) `` with:

```markdown
`src/domain/analytic-period-three.ts` and `src/domain/period-three-gate.ts` (ADR 0010), `src/domain/analytic-period-four.ts` and `src/domain/period-four-gate.ts` (ADR 0013)
```

Replace `and since 9c1471e the golden kernel fixture guards the post-ADR-0010 kernel;` with:

```markdown
and the analytic period-4 class (ADR 0013, 2026-10-17): its 12,435 changed golden-raster pixels (8,614 status changes) are each dd-adjudicated in [the period-4 adjudication evidence](../../evidence/phase-2/<ADJ>/summary.md); since <K> the golden kernel fixture guards the post-ADR-0013 kernel;
```

Replace `` every changed pixel dd-adjudicated in `tests/unit/render/period-three-golden-oracle.test.ts` and `tests/unit/domain/orbit-oracle-adjudication.test.ts`) `` with:

```markdown
every changed pixel dd-adjudicated in `tests/unit/render/period-three-golden-oracle.test.ts` and `tests/unit/domain/orbit-oracle-adjudication.test.ts`); workstream H period 4 (ADR 0013: the same margin, reached through a certified root enclosure; every changed pixel dd-adjudicated in `tests/unit/render/period-four-golden-oracle.test.ts` and `tests/unit/domain/orbit-oracle-adjudication.test.ts`, every certificate inequality audited exactly in `tests/unit/domain/period-four-certificate.test.ts`)
```

Replace `are accepted by the attraction margin plus a derived allowance (owner decision 2026-10-17, [ADR 0010](../decisions/0010-analytic-period-three.md))` with:

```markdown
are accepted by the attraction margin plus a derived allowance (owner decision 2026-10-17, [ADR 0010](../decisions/0010-analytic-period-three.md)); the period-4 cubic solve is accepted by the same margin through a certified root enclosure with a proved binary64 budget ([ADR 0013](../decisions/0013-analytic-period-four.md), PERFORMANCE-MATHEMATICS §12)
```

- [ ] **Step 3: The SysML model**

In `model/MandelbrotInteriority.sysml`, inside `requirement <'MI-PERF-004'> CommonAcceptance`, replace:

```text
             * binary64 allowance, ADR 0010); exhausted or ambiguous work
             * shall remain unresolved.
```

with:

```text
             * binary64 allowance, ADR 0010; the period-4 cubic solve
             * accepts the same way through a certified root enclosure,
             * ADR 0013); exhausted or ambiguous work shall remain
             * unresolved.
```

(`model/` is outside Prettier; keep the comment's indentation and width.)

- [ ] **Step 4: PERFORMANCE-PLAN workstream H row**

In `docs/PERFORMANCE-PLAN.md`, replace `Browser release run pending (owner). Period 4 not started: it needs a rigorous root-error bound.` with:

```markdown
Browser release run pending (owner). **Period 4 landed** ([ADR 0013](decisions/0013-analytic-period-four.md), 2026-10-17): the cycle-product cubic, accepted only through a certified root enclosure with a proved binary64 budget ([PERFORMANCE-MATHEMATICS §12](PERFORMANCE-MATHEMATICS.md#12-period-4-cubic-with-a-certified-root-workstream-h-adr-0013)), tried at the same iteration behind its own boxes. Node evidence: every changed golden-raster pixel and the 6,000,000× view at 1024×640 dd-adjudicated ([adjudication](../evidence/phase-2/<ADJ>/summary.md)); fallback overhead within 5% in both passes and the hard-view gain ([overhead](../evidence/phase-2/<OVH>/summary.md)). Browser release run pending (owner).
```

- [ ] **Step 5: WORKSTREAM-DISPOSITIONS**

In `docs/verification/WORKSTREAM-DISPOSITIONS.md`, replace the H-row cell text `**Period 3 landed** (ADR 0010); period 4 not started` with `**Period 3 and period 4 landed** (ADR 0010, ADR 0013)`, and in the `## Workstream H — p3/p4 algebraic experiment` section replace:

```markdown
cheaper per pixel handled ([spike](WORKSTREAM-H-SPIKE-2026-10-16.md)). Period 4 is not
started: it needs a rigorous root-error bound (Kantorovich or a cusp
exclusion disk) before its cubic solve may accept.
```

with:

```markdown
cheaper per pixel handled ([spike](WORKSTREAM-H-SPIKE-2026-10-16.md)).
Period 4 landed on 2026-10-17 ([ADR 0013](../decisions/0013-analytic-period-four.md)):
its cubic solve accepts only through a certified root enclosure (an
a-posteriori Rouché test with a proved binary64 budget,
[PERFORMANCE-MATHEMATICS §12](../PERFORMANCE-MATHEMATICS.md#12-period-4-cubic-with-a-certified-root-workstream-h-adr-0013)).
Every changed pixel is dd-adjudicated
([adjudication](../../evidence/phase-2/<ADJ>/summary.md)), the fallback
overhead is within 5% ([overhead](../../evidence/phase-2/<OVH>/summary.md)),
and the unresolved half of the 6,000,000× view resolves. The browser release
run for both periods is deferred to the owner's screen session.
```

- [ ] **Step 6: PHASE-2-CLOSEOUT**

In `docs/verification/PHASE-2-CLOSEOUT.md`:

Replace `Since 2026-10-17 that holds except the analytic period-3 class (ADR 0010), whose every changed pixel is dd-adjudicated ([evidence](../../evidence/phase-2/2026-10-17-9c1471e-period-three-adjudication/summary.md)); outside it no stratum's` with:

```markdown
Since 2026-10-17 that holds except the analytic period-3 and period-4 classes (ADR 0010, ADR 0013), whose every changed pixel is dd-adjudicated ([period 3](../../evidence/phase-2/2026-10-17-9c1471e-period-three-adjudication/summary.md), [period 4](../../evidence/phase-2/<ADJ>/summary.md)); outside them no stratum's
```

Replace:

```markdown
  since 2026-10-17 the analytic period-3 class differs by design, ADR 0010,
  every changed pixel dd-adjudicated.)
```

with:

```markdown
  since 2026-10-17 the analytic period-3 and period-4 classes differ by
  design, ADR 0010 and ADR 0013, every changed pixel dd-adjudicated.)
```

Replace:

```markdown
  so it now guards the post-ADR-0010 kernel, and equality with the reference
  scan holds only outside the analytic period-3 pixels.
```

with:

```markdown
  and since <K> for the analytic period-4 pixels (ADR 0013, 2026-10-17;
  12,435 golden-raster pixels, 8,614 status changes, each dd-adjudicated in
  the [period-4 adjudication evidence](../../evidence/phase-2/<ADJ>/summary.md)),
  so it now guards the post-ADR-0013 kernel, and equality with the reference
  scan holds only outside the analytic period-3 and period-4 pixels.
```

- [ ] **Step 7: PHASE2-TODO item 8**

In `docs/verification/PHASE2-TODO.md`, item 8: change `- [ ] **Period 4, after a rigorous root-error bound**` to `- [x] **Period 4, after a rigorous root-error bound**`, and append to the end of that bullet's text (after `the unresolved half of the 6,000,000× basilica-rim view.`):

```markdown
 Done: [ADR 0013](../decisions/0013-analytic-period-four.md), a certified root enclosure with a proved binary64 budget ([PERFORMANCE-MATHEMATICS §12](../PERFORMANCE-MATHEMATICS.md#12-period-4-cubic-with-a-certified-root-workstream-h-adr-0013)); [adjudication](../../evidence/phase-2/<ADJ>/summary.md): 12,435 changed golden-raster pixels and all 327,680 pixels of the 6,000,000× view's left half at 1024×640, 0 unsupported; Node [overhead and gain](../../evidence/phase-2/<OVH>/summary.md).
```

Leave `- [ ] A release-harness run in both browsers.` unticked, and append to it: ` It now covers period 4 too.` Leave the `**Done when:**` paragraph unchanged: its browser half is the owner's deferred run.

Keep each Markdown link and code span on one line (Prettier does not rewrap prose here, but do not wrap by hand inside a code span or link either).

- [ ] **Step 8: ADR 0013 evidence links**

In `docs/decisions/0013-analytic-period-four.md`, append to the end of the `## Consequences` list:

```markdown
- Evidence: [adjudication](../../evidence/phase-2/<ADJ>/summary.md) (every
  changed pixel and the 6,000,000× view at 1024×640, 0 unsupported) and
  [fallback overhead and gain](../../evidence/phase-2/<OVH>/summary.md)
  (Node, directional).
```

- [ ] **Step 9: Repository gates**

Run:

```bash
F="docs/verification/REQUIREMENTS.md docs/PERFORMANCE-PLAN.md docs/verification/WORKSTREAM-DISPOSITIONS.md docs/verification/PHASE-2-CLOSEOUT.md docs/verification/PHASE2-TODO.md docs/decisions/0013-analytic-period-four.md"
npx prettier --write $F
npx prettier --write $F
npx prettier --check $F
grep -rn '<ADJ>\|<OVH>\|<K>' docs model --exclude-dir=superpowers || echo no-placeholders
npm run check
ss -ltnp | grep 4174
npx playwright test
```

Expected: `no-placeholders`; all gates pass.

- [ ] **Step 10: Commit**

```bash
git add docs/verification/REQUIREMENTS.md model/MandelbrotInteriority.sysml docs/PERFORMANCE-PLAN.md docs/verification/WORKSTREAM-DISPOSITIONS.md docs/verification/PHASE-2-CLOSEOUT.md docs/verification/PHASE2-TODO.md docs/decisions/0013-analytic-period-four.md
git commit -m "$(cat <<'EOF'
Docs and model: workstream H period 4 traced (MI-PERF-001, -002, -004); browser run deferred

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 11: Report the deferred browser evidence run**

Do not run it. Report to the controller, for the owner:

> **Deferred (owner's screen session):** the headed release harness in both
> branded browsers on the period-4 build, `kde-inhibit --screenSaver --power npm run evidence:release`,
> to measure the targeted and weighted H clauses (the hard views
> `mi-hard-supplied-126x`, `-13x`, `-609x`, `mi-scale-6mx-basilica-rim`,
> and `mi-fallback-weak-attraction`) and the fallback cases in the browsers.
> It closes the remaining unticked box of PHASE2-TODO item 8 for periods 3
> and 4, and the item's "in the browsers" half of its done-when.

---

<!-- prettier-ignore-end -->

## Self-review

- **Spec coverage.** The period-4 Gleason polynomial and its six components, what the spike solved (the cycle-product cubic in μ = λ/16) and why it was heuristic: "Why the bound is rigorous" and §12.1, §12.5 (Task 3). A rigorous bound with every rounding step: §12.4 (Rouché, with the exact cubic Taylor remainder, a Kantorovich-type test) and §12.5 (Task 3), checked numerically during planning (worst error-to-allowance ratio 4.2·10⁻³ over 132,152 parameters; exact audit of 19,664) and in every test run (Task 3's exact audit). Fall-through near the cusps and the boundary: §12.6, pinned in Task 3. Exact period 4, not a divisor: Lean, Task 1 (`period4_not_period_two_of_attracting`), and §12.2. ADR 0013 and the PERFORMANCE-MATHEMATICS section: Tasks 3 and 7. Gate placement with boxes and per-row windows so early escapers never pay: Tasks 4 and 7, §12.8. Evidence code and flag: Task 2. Golden regeneration in the same reviewed commit with oracle adjudication of every changed pixel and 0 unsupported: Tasks 5, 7, 10. The Node overhead benchmark within 5% on `mi-easy-exterior-heavy` and `mi-fallback-ambiguous-boundary`, on a quiet machine with the load average recorded, plus the coarse pass the period-3 work did not measure: Tasks 6 and 11. The deep view (6,000,000× left half resolves), headless in Node, at the golden and the shipping raster: Task 10; its speed: Task 11. Traces `MI-PERF-001`, `MI-PERF-004` (and `MI-PERF-002`, whose claim would otherwise go stale), the SysML model, PHASE2-TODO item 8 ticked except the browser run: Task 12. `SEMANTIC_ALGORITHM_VERSION`: Task 7 (3 → 4, as period 3 did 2 → 3).
- **Type consistency.** `classifyPeriodFourInto(cRe, cIm, out, certificate?)`, `PeriodFourCertificate` (eight fields), `PeriodFourTarget`, `inPeriodFourGate(cRe, cIm)`, the four box names, `PERIOD_FOUR_BOXES`, `ddPeriodicCycle(cRe, cIm, period)`, `ddPeriodFourCycle(cRe, cIm)`, `dumpPixels(raster, caseIds)`, `timeCase(caseId, size, stride)` and `LEGACY_ANALYTIC_MAGNITUDE_TOLERANCE` are used with the same names and shapes in every task.
- **Review Focus.** Each of the six lines has a test in the owning task, named in the Review Focus section.
- **Placeholders.** The only placeholders are the evidence directory names and SHAs, which exist only after Tasks 7, 10 and 11 run; Task 12 Step 9 greps for them.
