# Analytic Period-3 Classification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Classify period-3 interior pixels with the closed form λ = 4(c+2) ± 4i·c·√(4c+7), beside the period-1/2 analytic paths, with a derived binary64 error budget, a Lean statement, oracle adjudication of every changed pixel, and no measurable cost for pixels that escape early.

**Architecture:** A pure function `classifyPeriodThreeInto` (`src/domain/analytic-period-three.ts`) evaluates the smaller-modulus root and accepts when |λ̂| plus a derived rounding allowance is below `1 − attractMargin`. Both orbit kernels (the scalar `classifyTriggeredOrbitInto` and the two-lane `TriggeredRowKernel`) call it once per pixel at the first scanning iteration (iteration 24), behind a straight-line test against the padded bounding boxes of the three period-3 components (`src/domain/period-three-gate.ts`), so pixels that escape earlier never reach it. The answer change is adjudicated against an independent double-double period-3 cycle (`ddPeriodThreeCycle`), recorded as evidence, and the golden kernel fixture is regenerated in the commit that changes the kernels (ADR 0007).

**Tech Stack:** TypeScript 6, Vite 8 (SSR builds for tools), Vitest 5, Playwright 1.64 (headless only), Node 24, Lean 4.33.1 with Mathlib (`proof/`), Python 3 `Decimal` fixture generator.

**Spec:** `docs/verification/PHASE2-TODO.md` item "8. Algebraic period-3/4 classification (workstream H)", **period 3 only** (owner decision 2026-10-16: "p3 now, p4 after a rigorous bound"); `docs/verification/WORKSTREAM-H-SPIKE-2026-10-16.md`; the spike prototype `poc/performance/h-p3p4/p34.ts`, `boxes.ts`, `boxes.json`.

## Global Constraints

- `npm run check`, `npm run fixtures:kernel-golden -- --check` (from Task 7, the regeneration task, onward) and `npx playwright test` pass at the end of every task.
- Commit trailer for implementers: `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`.
- No headed browser runs. `npx playwright test` is headless; never pass `--headed`, never run `npm run evidence:release`.
- Follow the conventions in the files you touch (comment style, `eslint-disable-next-line … -- reason` for non-null assertions on spills, Prettier with `printWidth: 100`, single quotes, trailing commas).
- Do not commit until the task's last step. Do not push.
- Other plans land on `phase-2/core-atlas` at the same time (shareable URLs, Phase 2 quick wins). Line numbers drift: locate code by the quoted anchor text, never by line number. ADR 0009 belongs to the shareable-URL plan; this plan's ADR is `0010`.
- Playwright reuses a server already listening on `127.0.0.1:4174` when not in CI. Before `npx playwright test`, run `ss -ltnp | grep 4174`; if another worktree's preview server is listening, stop and report instead of testing against someone else's build.
- Period 4 is out of scope: no cubic solve, no period-4 boxes, no period-4 evidence code.

## Review Focus

1. **c exactly on the airplane cusp −7/4 and near it.** At c = −1.75, λ = 1 and the path must refuse; at −1.750001 it must accept with |λ| = 0.9859959920005762; at −1.749999 it must refuse. Pinned in Task 3 (`accepts just inside the cusp and refuses just outside it`) and Task 7 (row/scalar parity view centred on −1.75 with span 1e-6).
2. **The three superattracting centres (roots of c³ + 2c² + c + 1).** Must accept with |λ| < 1e-13; |λ| = 0 must give arg λ = 0. Pinned in Task 3 and by the dd adjudicator in Task 5.
3. **c near a component boundary where |λ| → 1.** 1 − 1e-9 and 1 − 1e-11 accept with the right modulus; 1 − 1e-13 (inside the 1e-12 margin) refuses. Pinned in Task 3; the golden raster's near-boundary pixels are dd-checked in Task 7.
4. **c in a period-6 satellite of the rabbit, inside the gate box.** Must not be claimed as period 3; the orbit path must still find period 6. Pinned in Task 3 and Task 5, and as an independent `Decimal` fixture in Task 8.
5. **The conjugate parameter c̄.** Must give the conjugate multiplier bit for bit. Pinned in Task 3; the gate's conjugation symmetry is pinned in Task 4.
6. **NaN and infinite inputs.** The closed form and the gate refuse, and the classifier stays unresolved (NaN) or escaped (∞). Pinned in Tasks 3 and 4.
7. **The coarse pass (stride > 1, scalar kernel) against the stable pass (stride 1, row kernel).** Both must write the identical analytic record. Pinned in Task 7 (`period-three-coarse.test.ts`), plus row/scalar parity over the new views.

## Execution

Subagent-driven (`superpowers:subagent-driven-development`), as the owner chose:

- **Implementers: Haiku**, one fresh session per task, transcribing the complete code below. Task 7 is the largest; if a session runs out of room, split it after Step 5 (kernels wired, new tests green) and finish Steps 6–12 in a second session. It is still **one commit**.
- **Per-task reviewers: Sonnet.**
- **Opus reviews** Task 1 (Lean), Task 3 (closed form and error budget) and Task 7 (kernel wiring and the answer change): the mathematically delicate ones.
- Tasks 10 and 11 run Node measurements. Task 11 needs a quiet machine (see its steps). Neither runs a browser.

## Decisions taken in this plan

| Question                             | Decision                                                                                                                                                                                   | Why                                                                                                                                                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Multiplier reported for p3           | The closed-form λ                                                                                                                                                                          | Accurate to 3e-15 against the dd cycle, against up to 1.02e-8 (golden raster) and 2.2e-6 (spike) for the orbit product. At the golden raster it changes **no colorized byte** on any view (measured). |
| Colorizer goldens                    | None exist yet (PHASE2-TODO item 5). Nothing to regenerate. Item 5 will generate its goldens on top of this change.                                                                        | Measured: only the 1,074 status changes alter colours.                                                                                                                                                |
| Placement                            | Once per pixel at the first scanning iteration, `max(cycleWarmup, 2)` (24), inside both kernels, before that iteration's full scan                                                         | Pixels that escape earlier never reach it. The record depends on c alone, so placement changes no bit.                                                                                                |
| Gate shape                           | Box data, tested by a straight-line function (hull first, no loop)                                                                                                                         | Measured in Node at 1024×640: a `for…of` over the box array, inlined into the row kernel's outer loop, cost +8% to +16% on `mi-easy-exterior-heavy`; the straight-line gate measured −4.7% to +0.4%.  |
| Evidence flag, code, source          | `'analytic-period-3-component'`, code `5`, evidence source `'analytic'`                                                                                                                    | It is a closed form accepted directly under the margin, like p1/p2. `'algebraic'` stays reserved for algebraic _candidates_ handed to the verifier.                                                   |
| Iterations on the record             | `0`, as for p1/p2                                                                                                                                                                          | The closed form uses no orbit iterate.                                                                                                                                                                |
| Acceptance procedure                 | Closed-form criterion (margin plus derived allowance), not `verifyCycleInto`; `VERIFIER_REVISION` unchanged; new revision constant `src-analytic-p3-1.0.0`                                 | There is no cycle point to hand to the verifier. ADR 0010 records the reading of `MI-PERF-004` and the deviation from the plan §4 table (bucket 3–4 "common verifier").                               |
| `maxIterations < scanStart`          | The closed form never runs (pixel stays unresolved, as the orbit path leaves it)                                                                                                           | No production budget is that small; pinned by a test so the behaviour is deliberate.                                                                                                                  |
| Lean                                 | A task (verified to compile against the pinned Mathlib on 2026-10-16)                                                                                                                      | Exact identities only; the resultant direction, Fatou uniqueness and the binary64 budget stay outside Lean (follow-ups).                                                                              |
| Spike allowance `32·ε·(\|a\|+\|t\|)` | Justified (about 8× the first-order bound) but replaced by the derived `2⁻⁴⁶·(\|Re c + 2\| + \|Im c\| + 1)`, which needs no extra square roots and is about 2.3× smaller in the rabbit box | See PERFORMANCE-MATHEMATICS §11.4 (Task 3).                                                                                                                                                           |

## Measured facts this plan relies on

A full prototype of this plan was run on `95dbee6` on 2026-10-16 (scratch copy, Node v24, i7-1185G7). All numbers below are deterministic except the timings.

- Unit suite with the code of Tasks 2–8 and 10 extracted from this plan: 64 files, 505 tests passing; lint, typecheck and Prettier clean. The Lean file of Task 1 compiles with the axiom set shown. Task 9 (E2E) was not run during planning.
- Golden raster (160×100): 19,216 pixels change, all period 3: 1,074 `unresolved → attracting-p3` (26 default-full, 620 rabbit boundary, 428 weak attraction) and 18,142 multiplier-only changes. All 19,216 are certified by `ddPeriodThreeCycle` (worst |λ − λ_dd| = 3.0e-15; worst orbit-product error before the change 1.02e-8). Colorized bytes change only at the 1,074 status changes.
- Regenerated golden hashes change for exactly three cases: `mi-easy-default-full` → `7c80c83adfa36fcea06df5d3061602627222fba8c2326331e0c901d8a1a868da`, `mi-hard-rabbit-boundary` → `100815b8269e92e193503fe27ac66517d55c6a939f9ff61ad33d26a8e1d198a3`, `mi-fallback-weak-attraction` → `25246db865fa218504aa600d75f410b3c30eedf61e7a4c4dfa829131dc41cc2d`.
- Stratified grid (`STRATA`, 3,225 points): 39 points take the analytic path under every profile; 16/10/8 of them (quick/balanced/detailed) were unresolved before; the legacy period-reduction counts drop from 6/13/17 to 4/7/9; the oracle's budget misses drop from 14 to 12.
- Fallback overhead (load average 2–5, pinned to one core, 40–60 repetitions): with the straight-line gate, `mi-easy-exterior-heavy` −4.68% [−5.98%, −3.80%] and `mi-fallback-ambiguous-boundary` −1.12% [−2.74%, −0.02%], A/A control −0.20% and −0.63%.

## Out of scope

- Period 4 (needs a rigorous root-error bound first: Kantorovich or a cusp exclusion disk).
- The browser release run in both browsers: deferred to the owner's screen session (Task 12 records it).
- Colorized-buffer goldens (PHASE2-TODO item 5) and corpus rationale corrections (PHASE2-TODO item 0, another plan).
- Exact component outlines and internal-angle labels from the inverse map (spike side finding 3).

## File Structure

| Path                                                                                   | Responsibility                                                                              |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `proof/IntMProof/PeriodThreeMultiplier.lean`                                           | Exact identities: Φ₃, the multiplier quadratic, its closed-form roots, the fixed-point case |
| `src/domain/types.ts`, `src/domain/period-policy.ts`                                   | Evidence flag, code 5, evidence-source mapping                                              |
| `src/domain/analytic-period-three.ts`                                                  | The closed form and its acceptance rule (pure)                                              |
| `src/domain/period-three-gate.ts`                                                      | Box data and the straight-line gate (speed only)                                            |
| `src/domain/orbit-triggered.ts`, `src/render/triggered-rows.ts`                        | Call sites at the first scanning iteration                                                  |
| `tests/unit/domain/dd-oracle.ts`                                                       | `ddPeriodThreeCycle`, the independent adjudicator                                           |
| `tools/kernel_pixel_dump.ts`                                                           | Per-pixel dump of the golden raster (before/after comparison)                               |
| `tools/adjudicate_period_three.ts`                                                     | Changed-pixel adjudication and evidence writer                                              |
| `tools/benchmark/overhead-entry.ts`, `tools/benchmark/fallback-overhead.ts`            | Interleaved three-arm fallback-overhead microbenchmark                                      |
| `tools/generate_orbit_fixtures.py`, `fixtures/orbits.v1.json`                          | Independent 80-digit references for period-3 and period-6 points                            |
| `docs/PERFORMANCE-MATHEMATICS.md` §11, `docs/decisions/0010-analytic-period-three.md`  | Derivation, error budget, decision record                                                   |
| `evidence/phase-2/<date>-<sha>-period-three-adjudication/`, `…-period-three-overhead/` | Recorded evidence                                                                           |

---

<!-- prettier-ignore-start -->
<!-- The task bodies quote code with exact indentation for find-and-replace edits; Prettier would re-indent those fragments. -->

### Task 1: Lean identities for the period-3 multipliers

**Files:**

- Create: `proof/IntMProof/PeriodThreeMultiplier.lean`
- Modify: `proof/IntMProof.lean` (one import)
- Modify: `proof/IntMProof/Axioms.lean` (axiom guards after the `periodThreeFactor_slope_ne_zero` guard)
- Modify: `proof/README.md` (one bullet after the S0 bullet)
- Modify: `docs/verification/LEAN-PROOF-DAG.md` (one table row after the S0 row; one sentence)

**Interfaces:**

- Consumes: `IntMProof.quadratic`, `IntMProof.orbit`, `orbit_succ`, `orbit_zero` (`Quadratic.lean`); `seedPolynomial`, `seedPolynomial_derivative_eval_prod` (`Derivatives.lean`); `periodThreeFactor` (`PeriodThreeLocus.lean`).
- Produces (names cited by Task 3's documentation): `periodThreeDynatomic`, `periodThreeMultiplierPolynomial`, `orbit_three_sub_self`, `periodThreeDynatomic_eq_zero`, `period3_seedDerivative`, `period3_multiplier_root`, `period3_closedForm_roots`, `period3_multiplier_zero_of_center`, `period3_cusp`, `periodThreeDynatomic_fixedPoint`, `periodThreeDynatomic_fixedPoint_multiplier`.

- [ ] **Step 1: Write the failing axiom guards**

In `proof/IntMProof/Axioms.lean`, find this block:

```lean
/-- info: 'IntMProof.periodThreeFactor_slope_ne_zero' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.periodThreeFactor_slope_ne_zero
```

Insert immediately after it (keep one blank line between guards, as the file does):

```lean

/-- info: 'IntMProof.orbit_three_sub_self' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.orbit_three_sub_self

/-- info: 'IntMProof.periodThreeDynatomic_eq_zero' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.periodThreeDynatomic_eq_zero

/-- info: 'IntMProof.period3_seedDerivative' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.period3_seedDerivative

/-- info: 'IntMProof.period3_multiplier_root' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.period3_multiplier_root

/-- info: 'IntMProof.period3_closedForm_roots' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.period3_closedForm_roots

/-- info: 'IntMProof.period3_multiplier_zero_of_center' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.period3_multiplier_zero_of_center

/-- info: 'IntMProof.period3_cusp' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.period3_cusp

/-- info: 'IntMProof.periodThreeDynatomic_fixedPoint' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.periodThreeDynatomic_fixedPoint

/-- info: 'IntMProof.periodThreeDynatomic_fixedPoint_multiplier' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms IntMProof.periodThreeDynatomic_fixedPoint_multiplier
```

- [ ] **Step 2: Run the guard file to verify it fails**

Run: `cd proof && lake env lean IntMProof/Axioms.lean; cd ..`
Expected: errors of the form `unknown constant 'IntMProof.orbit_three_sub_self'`.

- [ ] **Step 3: Write the Lean file**

Create `proof/IntMProof/PeriodThreeMultiplier.lean` with exactly this content (checked against the pinned Mathlib on 2026-10-16; every line is under 100 characters):

```lean
import IntMProof.FastPath
import IntMProof.PeriodThreeLocus

/-!
# Exact period-three multiplier identities (H3)

Exact identities behind the analytic period-three fast path
(`src/domain/analytic-period-three.ts`). The period-three dynatomic factor
`Φ₃(z, c)` is the third return minus the identity with the fixed-point factor
divided out. Every root of `Φ₃` has a three-step multiplier that is a root of
`λ² − 8(c + 2)λ + 64(c³ + 2c² + c + 1)`, whose roots are the closed form
`4(c + 2) ± 4 i c s` with `s² = 4c + 7`. A fixed point can be a root of `Φ₃`
only when its multiplier is a primitive cube root of unity, so its three-step
multiplier is `1`.

None of this certifies binary64 `Math.sqrt`, the rounding allowance, or the
attraction margin. That every root of the multiplier quadratic is realized by
a period-three cycle (the resultant identity) is not proved here.
-/

namespace IntMProof

open Function Polynomial Complex

/-- The period-three dynatomic factor `Φ₃(z, c)`. -/
def periodThreeDynatomic (c z : ℂ) : ℂ :=
  z ^ 6 + z ^ 5 + (3 * c + 1) * z ^ 4 + (2 * c + 1) * z ^ 3 +
    (3 * c ^ 2 + 3 * c + 1) * z ^ 2 + (c + 1) ^ 2 * z + periodThreeFactor c

/-- The period-three multiplier quadratic `M₃(λ, c)`. -/
def periodThreeMultiplierPolynomial (c l : ℂ) : ℂ :=
  l ^ 2 - 8 * (c + 2) * l + 64 * periodThreeFactor c

/-- Exact identity: the third return minus the identity factors through the
fixed-point equation and `Φ₃`. -/
theorem orbit_three_sub_self (c z : ℂ) :
    orbit c 3 z - z = (quadratic c z - z) * periodThreeDynatomic c z := by
  simp only [orbit_succ, orbit_zero, quadratic, periodThreeDynatomic, periodThreeFactor]
  ring

/-- A three-step return that is not a fixed point is a root of `Φ₃`. -/
theorem periodThreeDynatomic_eq_zero {c z : ℂ} (hclose : orbit c 3 z = z)
    (hfix : quadratic c z ≠ z) : periodThreeDynatomic c z = 0 := by
  have h := orbit_three_sub_self c z
  rw [hclose, sub_self] at h
  exact (mul_eq_zero.mp h.symm).resolve_left (sub_ne_zero.mpr hfix)

/-- Exact identity: the three-step seed derivative is `8 z₀ z₁ z₂`. -/
theorem period3_seedDerivative (c z : ℂ) :
    (derivative (seedPolynomial c 3)).eval z =
      8 * (z * orbit c 1 z * orbit c 2 z) := by
  rw [seedPolynomial_derivative_eval_prod]
  simp only [Finset.prod_range_succ, Finset.prod_range_zero, orbit_zero]
  ring

/-- Exact identity: at every root of `Φ₃` the three-step multiplier is a root
of `M₃`. -/
theorem period3_multiplier_root {c z : ℂ} (hΦ : periodThreeDynatomic c z = 0) :
    periodThreeMultiplierPolynomial c ((derivative (seedPolynomial c 3)).eval z) = 0 := by
  rw [period3_seedDerivative]
  unfold periodThreeDynatomic periodThreeFactor at hΦ
  simp only [orbit_succ, orbit_zero, quadratic, periodThreeMultiplierPolynomial,
    periodThreeFactor]
  linear_combination
    (64 * (c ^ 3 * z ^ 2 + 3 * c ^ 2 * z ^ 4 - c ^ 2 * z ^ 3 + 3 * c * z ^ 6 -
      2 * c * z ^ 5 + z ^ 8 - z ^ 7 - (c + 1) * z + 1)) * hΦ

/-- Exact identity: with `s² = 4c + 7` the roots of `M₃` are
`4(c + 2) ± 4 i c s`. -/
theorem period3_closedForm_roots (c s l : ℂ) (hs : s * s = 4 * c + 7) :
    periodThreeMultiplierPolynomial c l = 0 ↔
      l = 4 * (c + 2) + 4 * I * c * s ∨ l = 4 * (c + 2) - 4 * I * c * s := by
  have hfac : periodThreeMultiplierPolynomial c l =
      (l - (4 * (c + 2) + 4 * I * c * s)) * (l - (4 * (c + 2) - 4 * I * c * s)) := by
    unfold periodThreeMultiplierPolynomial periodThreeFactor
    linear_combination (-16 * c ^ 2) * hs + (16 * c ^ 2 * s ^ 2) * I_sq
  rw [hfac, mul_eq_zero, sub_eq_zero, sub_eq_zero]

/-- Superattracting identity: at a primitive period-three centre `0` is a
root of `M₃`. -/
theorem period3_multiplier_zero_of_center {c : ℂ} (hc : periodThreeFactor c = 0) :
    periodThreeMultiplierPolynomial c 0 = 0 := by
  simp [periodThreeMultiplierPolynomial, hc]

/-- The airplane cusp `c = −7/4`: `M₃` is `(λ − 1)²`. -/
theorem period3_cusp (l : ℂ) :
    periodThreeMultiplierPolynomial (-7 / 4) l = (l - 1) ^ 2 := by
  unfold periodThreeMultiplierPolynomial periodThreeFactor
  ring

/-- A fixed point that is also a root of `Φ₃` has a fixed-point multiplier
`2z` with `(2z)² + 2z + 1 = 0`. -/
theorem periodThreeDynatomic_fixedPoint {c z : ℂ} (hfix : quadratic c z = z)
    (hΦ : periodThreeDynatomic c z = 0) : (2 * z) ^ 2 + 2 * z + 1 = 0 := by
  unfold quadratic at hfix
  unfold periodThreeDynatomic periodThreeFactor at hΦ
  linear_combination hΦ -
    (c ^ 2 + c * (2 * z ^ 2 + 2 * z + 2) + z ^ 4 + 2 * z ^ 3 + 3 * z ^ 2 + 4 * z + 1) * hfix

/-- Such a point's three-step multiplier is exactly `1`, so any root of `M₃`
with modulus below `1` belongs to a cycle of exact period three. -/
theorem periodThreeDynatomic_fixedPoint_multiplier {c z : ℂ} (hfix : quadratic c z = z)
    (hΦ : periodThreeDynatomic c z = 0) :
    (derivative (seedPolynomial c 3)).eval z = 1 := by
  have h := periodThreeDynatomic_fixedPoint hfix hΦ
  have h1 : orbit c 1 z = z := by simpa [orbit] using hfix
  have h2 : orbit c 2 z = z := by
    rw [orbit_succ, h1]
    exact hfix
  rw [period3_seedDerivative, h1, h2]
  linear_combination (2 * z - 1) * h

end IntMProof
```

In `proof/IntMProof.lean`, find the line `import IntMProof.FastPath` and add directly below it:

```lean
import IntMProof.PeriodThreeMultiplier
```

- [ ] **Step 4: Build, check the guards, lint**

Run:

```bash
cd proof && lake build && lake env lean IntMProof/Axioms.lean && lake lint && lake exe lint-style; cd ..
```

Expected: `Build completed successfully`; the guard file prints nothing; `lake lint` reports no linter errors; `lint-style` prints at most `warning: nolints file could not be read; treating as empty: scripts/nolints-style.txt` (it already does on this branch) and no style errors.

- [ ] **Step 5: Document the new node**

In `proof/README.md`, find the bullet that begins `- **S0 critical period three:**` and add this bullet directly after it:

```markdown
- **S1 period-three multipliers:** At every root `z` of the period-three dynatomic factor `Φ₃`, the three-step multiplier `8z·f(z)·f²(z)` is a root of `λ²−8(c+2)λ+64(c³+2c²+c+1)`, whose roots are `4(c+2)±4ics` with `s²=4c+7`. A fixed point that is also a root of `Φ₃` has three-step multiplier exactly `1`, so a root of modulus below one belongs to a cycle of exact period three. The cusp `c=−7/4` gives `(λ−1)²` and a period-three centre gives the root `0`. The realization of each root by a cycle (a resultant identity), Fatou uniqueness, and the binary64 error budget of `src/domain/analytic-period-three.ts` are not formalized.
```

In `docs/verification/LEAN-PROOF-DAG.md`, find the table row that begins `| S0 Significant Curves` and add this row directly after it:

```markdown
| S1 Period-three multipliers | S0, E1 | `period3_multiplier_root` shows the three-step multiplier at every root of the dynatomic factor Φ₃ is a root of λ²−8(c+2)λ+64(c³+2c²+c+1); `period3_closedForm_roots` gives its roots 4(c+2)±4ics with s²=4c+7; `periodThreeDynatomic_fixedPoint_multiplier` shows a fixed point that is also a root of Φ₃ has three-step multiplier exactly 1, which is why an accepted \|λ\|<1 has exact period three. The resultant identity (each root is realized by a cycle), Fatou uniqueness, and the binary64 error budget of the production path ([ADR 0010](../decisions/0010-analytic-period-three.md)) are not formalized. |
```

In the same file, replace the sentence `The existing period-one and period-two analytic fast paths are the current closed-form cases;` with `The period-one, period-two and period-three (S1, ADR 0010) analytic fast paths are the current closed-form cases;` (if the sentence is not found verbatim, search for `period-two analytic fast paths are the current closed-form cases` and edit that sentence the same way).

- [ ] **Step 6: Format and run the repository gates**

Run:

```bash
npx prettier --write proof/README.md docs/verification/LEAN-PROOF-DAG.md
npm run check
npx playwright test
```

Expected: `npm run check` ends with the Vite build summary and exit code 0; Playwright reports all tests passed.

- [ ] **Step 7: Commit**

```bash
git add proof/IntMProof/PeriodThreeMultiplier.lean proof/IntMProof.lean proof/IntMProof/Axioms.lean proof/README.md docs/verification/LEAN-PROOF-DAG.md
git commit -m "$(cat <<'EOF'
Lean: period-three multiplier identities (S1)

Phi_3 factorization, the multiplier quadratic and its closed-form roots,
and the fixed-point case with three-step multiplier 1.

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Evidence flag, code and source for the analytic period-3 path

**Files:**

- Modify: `src/domain/types.ts` (`EvidenceFlag`, `ORBIT_EVIDENCE_CODE`, `EVIDENCE_BY_CODE`)
- Modify: `src/domain/period-policy.ts` (`evidenceSourceForFlag` and its two doc comments)
- Test: `tests/unit/domain/period-policy.test.ts`, `tests/unit/ui/view-state.test.ts`, `tests/unit/domain/orbit-scalar-parity.test.ts`

**Interfaces:**

- Produces: `EvidenceFlag` gains `'analytic-period-3-component'`; `ORBIT_EVIDENCE_CODE.analyticPeriod3Component === 5`; `EVIDENCE_BY_CODE[5] === 'analytic-period-3-component'`; `evidenceSourceForFlag('analytic-period-3-component') === 'analytic'`. The inspector's existing `formatEvidence` turns the flag into `Analytic Period 3 Component` with no code change in `src/ui/application.ts`.

- [ ] **Step 1: Write the failing tests**

In `tests/unit/domain/period-policy.test.ts`, inside `it('maps evidence flags to sources per the documented mapping', …)`, after the line `expect(evidenceSourceForFlag('analytic-period-2-bulb')).toBe('analytic');` add:

```ts
    expect(evidenceSourceForFlag('analytic-period-3-component')).toBe('analytic');
```

In the same file, inside `it('stamps the evidence source at the rich result boundary only for attracting results', …)`, after the line `expect(analyticResult).toMatchObject({ evidenceSource: 'analytic' });` add:

```ts

    const periodThree = createOrbitSample();
    periodThree.status = 2;
    periodThree.evidence = ORBIT_EVIDENCE_CODE.analyticPeriod3Component;
    periodThree.period = 3;
    expect(materializeOrbitResult(periodThree)).toMatchObject({
      evidence: ['analytic-period-3-component'],
      evidenceSource: 'analytic',
    });
```

In the same file, inside `it('classifies every current attracting path with a source the vocabulary covers', …)`, in the array that starts `for (const flag of [`, add `'analytic-period-3-component',` after `'analytic-period-2-bulb',`.

In `tests/unit/ui/view-state.test.ts`, inside `it('keeps the analytic evidence source reserved for the closed-form paths', …)`, after `expect(evidenceSourceForFlag('analytic-period-2-bulb')).toBe('analytic');` add:

```ts
    expect(evidenceSourceForFlag('analytic-period-3-component')).toBe('analytic');
```

In `tests/unit/domain/orbit-scalar-parity.test.ts`, inside `it('maps primitive evidence codes to the legacy evidence strings', …)`, after the line `[ORBIT_EVIDENCE_CODE.iterationLimit, ['iteration-limit']],` add:

```ts
      [ORBIT_EVIDENCE_CODE.analyticPeriod3Component, ['analytic-period-3-component']],
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/domain/period-policy.test.ts tests/unit/ui/view-state.test.ts tests/unit/domain/orbit-scalar-parity.test.ts`
Expected: FAIL in all three files (`expected 'fallback' to be 'analytic'`, and the evidence-code mapping returns `['iteration-limit']`).

- [ ] **Step 3: Implement**

In `src/domain/types.ts` make three edits.

Replace:

```ts
  | 'converged-cycle'
  | 'iteration-limit';
```

with:

```ts
  | 'converged-cycle'
  | 'iteration-limit'
  | 'analytic-period-3-component';
```

Replace:

```ts
  iterationLimit: 4,
} as const);
```

with:

```ts
  iterationLimit: 4,
  analyticPeriod3Component: 5,
} as const);
```

Replace:

```ts
  'iteration-limit',
]);
```

with:

```ts
  'iteration-limit',
  'analytic-period-3-component',
]);
```

In `src/domain/period-policy.ts` make three edits.

Replace:

```ts
 * - 'analytic'  — the closed-form main-cardioid / period-2-bulb fast paths
 *   (evidence flags 'analytic-main-cardioid' / 'analytic-period-2-bulb').
 *   Bucket 1–2 in the plan's operational table ("closed-form tests").
```

with:

```ts
 * - 'analytic'  — the closed-form main-cardioid, period-2-bulb and period-3
 *   fast paths (evidence flags 'analytic-main-cardioid',
 *   'analytic-period-2-bulb', 'analytic-period-3-component'). Bucket 1–2 in
 *   the plan's operational table ("closed-form tests"); period 3 joins it by
 *   ADR 0010, although the plan's table lists periods 3–4 under the common
 *   verifier.
```

Replace:

```ts
 * rich result boundary. Total over EvidenceFlag: the two closed-form flags
```

with:

```ts
 * rich result boundary. Total over EvidenceFlag: the three closed-form flags
```

Replace:

```ts
export const evidenceSourceForFlag = (flag: EvidenceFlag): EvidenceSource =>
  flag === 'analytic-main-cardioid' || flag === 'analytic-period-2-bulb' ? 'analytic' : 'fallback';
```

with:

```ts
export const evidenceSourceForFlag = (flag: EvidenceFlag): EvidenceSource =>
  flag === 'analytic-main-cardioid' ||
  flag === 'analytic-period-2-bulb' ||
  flag === 'analytic-period-3-component'
    ? 'analytic'
    : 'fallback';
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/domain/period-policy.test.ts tests/unit/ui/view-state.test.ts tests/unit/domain/orbit-scalar-parity.test.ts`
Expected: PASS.

- [ ] **Step 5: Repository gates**

Run: `npm run check && npx playwright test`
Expected: both pass. No pixel changes (nothing emits code 5 yet), so the golden fixture is untouched.

- [ ] **Step 6: Commit**

```bash
git add src/domain/types.ts src/domain/period-policy.ts tests/unit/domain/period-policy.test.ts tests/unit/ui/view-state.test.ts tests/unit/domain/orbit-scalar-parity.test.ts
git commit -m "$(cat <<'EOF'
Domain: evidence flag and analytic source for period 3 (ADR 0010)

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: The period-3 closed form, its error budget and its documentation

**Files:**

- Create: `src/domain/analytic-period-three.ts`
- Modify: `src/domain/index.ts` (exports)
- Test: `tests/unit/domain/analytic-period-three.test.ts`
- Modify: `docs/PERFORMANCE-MATHEMATICS.md` (new §11; one row in the §3 revision table)

**Interfaces:**

- Consumes: `VERIFIER_THRESHOLDS.attractMargin` (`src/domain/verifier.ts`); `ORBIT_EVIDENCE_CODE.analyticPeriod3Component` (Task 2); Lean theorem names (Task 1, documentation only).
- Produces:
  - `classifyPeriodThreeInto(cRe: number, cIm: number, out: PeriodThreeTarget): boolean` — writes `status 2, iterations 0, evidence 5, period 3, multiplierRe/Im/Magnitude/Angle` on acceptance; leaves `out` untouched on refusal.
  - `interface PeriodThreeTarget { status; iterations; evidence; period; multiplierRe; multiplierIm; multiplierMagnitude; multiplierAngle }` (all `number`; `OrbitSample` satisfies it).
  - `PERIOD_THREE_ALLOWANCE_COEFFICIENT = 2 ** -46`, `PERIOD_THREE_ANALYTIC_REVISION = 'src-analytic-p3-1.0.0'`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/domain/analytic-period-three.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  classifyOrbit,
  classifyPeriodThreeInto,
  createOrbitSample,
  ORBIT_EVIDENCE_CODE,
  PERIOD_THREE_ALLOWANCE_COEFFICIENT,
  PERIOD_THREE_ANALYTIC_REVISION,
  type OrbitSample,
} from '../../../src/domain';

/**
 * Analytic period-3 fast path (ADR 0010). Expected multipliers are mpmath
 * values (50 digits) of the closed form at the binary64 parameter shown,
 * computed for docs/superpowers/plans/2026-10-16-analytic-period-three.md;
 * the boundary points come from the inverse map lambda = r e^{i}, continued
 * from the rabbit centre.
 */

const SENTINEL = -7;

const sentinelSample = (): OrbitSample => ({
  ...createOrbitSample(),
  status: 0,
  period: SENTINEL,
  multiplierMagnitude: SENTINEL,
});

const accept = (re: number, im: number): OrbitSample => {
  const sample = sentinelSample();
  expect(classifyPeriodThreeInto(re, im, sample)).toBe(true);
  expect(sample.status).toBe(2);
  expect(sample.period).toBe(3);
  expect(sample.iterations).toBe(0);
  expect(sample.evidence).toBe(ORBIT_EVIDENCE_CODE.analyticPeriod3Component);
  return sample;
};

const refuse = (re: number, im: number): void => {
  const sample = sentinelSample();
  expect(classifyPeriodThreeInto(re, im, sample)).toBe(false);
  // A refusal leaves the record untouched.
  expect(sample.period).toBe(SENTINEL);
  expect(sample.multiplierMagnitude).toBe(SENTINEL);
};

describe('classifyPeriodThreeInto', () => {
  it('accepts the three superattracting centres (roots of c^3 + 2c^2 + c + 1)', () => {
    const airplane = accept(-1.7548776662466927, 0);
    expect(airplane.multiplierMagnitude).toBeLessThan(1e-13);
    const rabbit = accept(-0.12256116687665362, 0.7448617666197442);
    expect(rabbit.multiplierMagnitude).toBeLessThan(1e-13);
    const corabbit = accept(-0.12256116687665362, -0.7448617666197442);
    expect(corabbit.multiplierMagnitude).toBeLessThan(1e-13);
    // Superattracting identity: |lambda| = 0 means arg lambda = 0.
    if (rabbit.multiplierMagnitude === 0) {
      expect(rabbit.multiplierAngle).toBe(0);
    }
  });

  it('refuses the airplane cusp c = -7/4 exactly, where lambda = 1', () => {
    refuse(-1.75, 0);
  });

  it('accepts just inside the cusp and refuses just outside it', () => {
    // c = -7/4 - delta (inside the airplane): lambda = 1 - 4 delta - 14 sqrt(delta).
    expect(Math.abs(accept(-1.750001, 0).multiplierMagnitude - 0.9859959920005762)).toBeLessThan(
      1e-13,
    );
    expect(
      Math.abs(accept(-1.750000000001, 0).multiplierMagnitude - 0.9999859993737094),
    ).toBeLessThan(1e-13);
    // c = -7/4 + delta: |lambda| > 1 on both roots.
    refuse(-1.749999, 0);
    refuse(-1.749999999999, 0);
  });

  it('accepts down to the margin near the rabbit boundary and refuses inside it', () => {
    // |lambda| = 1 - 1e-3, 1 - 1e-9 and 1 - 1e-11 at arg lambda = 1.
    const far = accept(-0.04585527427169738, 0.6923152138236197);
    expect(Math.abs(far.multiplierMagnitude - 0.9989999999999998)).toBeLessThan(1e-13);
    expect(Math.abs(far.multiplierAngle - 1)).toBeLessThan(1e-12);
    const near = accept(-0.04577863707377464, 0.692264905409385);
    expect(Math.abs(near.multiplierMagnitude - 0.9999999990000003)).toBeLessThan(1e-13);
    const nearer = accept(-0.045778636997903986, 0.6922649053595819);
    expect(Math.abs(nearer.multiplierMagnitude - 0.99999999999)).toBeLessThan(1e-13);
    // |lambda| = 1 - 1e-13 is inside the 1e-12 attraction margin.
    refuse(-0.04577863699714528, 0.6922649053590838);
  });

  it('matches the high-precision multiplier at the weak-attraction corpus centre', () => {
    const sample = accept(-0.1205, 0.8268);
    expect(Math.abs(sample.multiplierRe - -0.8746775181866886)).toBeLessThan(1e-14);
    expect(Math.abs(sample.multiplierIm - -0.04004509961793429)).toBeLessThan(1e-14);
  });

  it('refuses a period-6 satellite of the rabbit inside the gate box', () => {
    // On the segment from the rabbit's 1/2 root to the period-6 centre:
    // |lambda_3| = 1.0246 (repelling), |lambda_6| = 0.9015.
    const satellite = { re: -0.1155037469844854, im: 0.8402560718860035 };
    refuse(satellite.re, satellite.im);
    const result = classifyOrbit(satellite, { maxIterations: 4096, maxPeriod: 8 });
    expect(result).toMatchObject({ status: 'attracting-cycle', period: 6 });
    // The period-6 centre itself.
    refuse(-0.11341865594943658, 0.860569472501573);
    expect(classifyOrbit({ re: -0.11341865594943658, im: 0.860569472501573 })).toMatchObject({
      status: 'attracting-cycle',
      period: 6,
    });
  });

  it('gives the conjugate parameter the conjugate multiplier, bit for bit', () => {
    for (const [re, im] of [
      [-0.1205, 0.8268],
      [-0.04585527427169738, 0.6923152138236197],
      [-1.755, 0.003],
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
      [-0.12, Number.POSITIVE_INFINITY],
      [-1.75, Number.NEGATIVE_INFINITY],
    ] as const) {
      refuse(re, im);
    }
  });

  it('keeps the classifier honest on NaN and infinite parameters', () => {
    expect(classifyOrbit({ re: Number.NaN, im: 0 }).status).toBe('unresolved');
    expect(classifyOrbit({ re: Number.POSITIVE_INFINITY, im: 0 }).status).toBe('escaped');
  });

  it('documents the allowance coefficient (2^-46 = 128 u) and the revision', () => {
    expect(PERIOD_THREE_ALLOWANCE_COEFFICIENT).toBe(128 * 2 ** -53);
    expect(PERIOD_THREE_ANALYTIC_REVISION).toBe('src-analytic-p3-1.0.0');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/domain/analytic-period-three.test.ts`
Expected: FAIL (`classifyPeriodThreeInto is not a function`).

- [ ] **Step 3: Write the module**

Create `src/domain/analytic-period-three.ts`:

```ts
import { VERIFIER_THRESHOLDS } from './verifier';
import { ORBIT_EVIDENCE_CODE } from './types';

/**
 * Analytic period-3 fast path (workstream H, ADR 0010).
 *
 * For f_c(z) = z^2 + c the multipliers of the two period-3 cycles are the
 * roots of lambda^2 - 8(c + 2) lambda + 64 (c^3 + 2c^2 + c + 1), that is
 *
 *   lambda = 4(c + 2) +- 4i c sqrt(4c + 7).
 *
 * A quadratic polynomial has at most one attracting cycle, so the root of
 * smallest modulus decides. A root with |lambda| < 1 belongs to a cycle of
 * exact period 3: a fixed point that is also a period-3 root has three-step
 * multiplier exactly 1 (proof/IntMProof/PeriodThreeMultiplier.lean). The
 * derivation and the binary64 error budget are in
 * docs/PERFORMANCE-MATHEMATICS.md section 11.
 *
 * Acceptance: |lambda_hat| + allowance < 1 - attractMargin, where the
 * allowance bounds the binary64 error of lambda_hat and of its modulus for
 * every finite c (section 11.4):
 *
 *   allowance = 2^-46 (|Re c + 2| + |Im c| + 1).
 *
 * Pure function of c: no orbit state, no iteration count. NaN or infinite
 * input is refused (every comparison with NaN is false). On refusal `out` is
 * untouched.
 */

/** 2^-46 = 128 u for binary64 (u = 2^-53), the allowance coefficient. */
export const PERIOD_THREE_ALLOWANCE_COEFFICIENT = 2 ** -46;

/** Revision of this acceptance rule (closed form, allowance, margin). */
export const PERIOD_THREE_ANALYTIC_REVISION = 'src-analytic-p3-1.0.0';

/** Mutable record written on acceptance; structurally satisfied by OrbitSample. */
export interface PeriodThreeTarget {
  status: number;
  iterations: number;
  evidence: number;
  period: number;
  multiplierRe: number;
  multiplierIm: number;
  multiplierMagnitude: number;
  multiplierAngle: number;
}

export const classifyPeriodThreeInto = (
  cRe: number,
  cIm: number,
  out: PeriodThreeTarget,
): boolean => {
  // w = 4c + 7. 4 * cRe and 4 * cIm are exact; for cRe in [-3.5, -0.875]
  // (the airplane component) 4 * cRe + 7 is exact as well (Sterbenz).
  const wRe = 4 * cRe + 7;
  const wIm = 4 * cIm;
  // s = sqrt(w), principal branch, in the stable form: the larger component
  // from the half-sum without cancellation, the other by division. Either
  // sign of s gives the same pair of roots, so the branch cut is harmless.
  const wMagnitude = Math.sqrt(wRe * wRe + wIm * wIm);
  let sRe: number;
  let sIm: number;
  if (wRe >= 0) {
    sRe = Math.sqrt(0.5 * (wMagnitude + wRe));
    sIm = sRe === 0 ? 0 : wIm / (2 * sRe);
  } else {
    const sImMagnitude = Math.sqrt(0.5 * (wMagnitude - wRe));
    sIm = wIm < 0 ? -sImMagnitude : sImMagnitude;
    sRe = (wIm < 0 ? -wIm : wIm) / (2 * sImMagnitude);
  }
  // t = 4i * c * s and a = 4(c + 2); the roots are a + t and a - t.
  const csRe = cRe * sRe - cIm * sIm;
  const csIm = cRe * sIm + cIm * sRe;
  const tRe = -4 * csIm;
  const tIm = 4 * csRe;
  const aRe = 4 * (cRe + 2);
  const aIm = 4 * cIm;
  const plusRe = aRe + tRe;
  const plusIm = aIm + tIm;
  const minusRe = aRe - tRe;
  const minusIm = aIm - tIm;
  const plusSquared = plusRe * plusRe + plusIm * plusIm;
  const minusSquared = minusRe * minusRe + minusIm * minusIm;
  const usePlus = plusSquared <= minusSquared;
  const multiplierRe = usePlus ? plusRe : minusRe;
  const multiplierIm = usePlus ? plusIm : minusIm;
  const multiplierMagnitude = Math.sqrt(usePlus ? plusSquared : minusSquared);
  const shiftedRe = cRe + 2;
  const allowance =
    PERIOD_THREE_ALLOWANCE_COEFFICIENT *
    ((shiftedRe < 0 ? -shiftedRe : shiftedRe) + (cIm < 0 ? -cIm : cIm) + 1);
  if (!(multiplierMagnitude + allowance < 1 - VERIFIER_THRESHOLDS.attractMargin)) {
    return false;
  }
  out.status = 2;
  out.iterations = 0;
  out.evidence = ORBIT_EVIDENCE_CODE.analyticPeriod3Component;
  out.period = 3;
  out.multiplierRe = multiplierRe;
  out.multiplierIm = multiplierIm;
  out.multiplierMagnitude = multiplierMagnitude;
  out.multiplierAngle = multiplierMagnitude === 0 ? 0 : Math.atan2(multiplierIm, multiplierRe);
  return true;
};
```

In `src/domain/index.ts`, directly after the first line `export * from './complex';`, insert:

```ts
export {
  classifyPeriodThreeInto,
  PERIOD_THREE_ALLOWANCE_COEFFICIENT,
  PERIOD_THREE_ANALYTIC_REVISION,
} from './analytic-period-three';
export type { PeriodThreeTarget } from './analytic-period-three';
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/domain/analytic-period-three.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Write PERFORMANCE-MATHEMATICS §11**

In `docs/PERFORMANCE-MATHEMATICS.md`, in the `### Policy revisions` table, add this row after the `period-policy-1.0.0` row:

```markdown
| `src-analytic-p3-1.0.0` | src/domain/analytic-period-three.ts | The period-3 closed-form acceptance: smallest-modulus root, rounding allowance, margin (§11) |
```

Append this section at the end of the file:

````markdown
## 11. Period-3 closed form (workstream H, ADR 0010)

Code: [src/domain/analytic-period-three.ts](../src/domain/analytic-period-three.ts)
(`classifyPeriodThreeInto`, revision `src-analytic-p3-1.0.0`). Exact
identities: [proof/IntMProof/PeriodThreeMultiplier.lean](../proof/IntMProof/PeriodThreeMultiplier.lean).
The spike that motivated it: [WORKSTREAM-H-SPIKE-2026-10-16.md](verification/WORKSTREAM-H-SPIKE-2026-10-16.md).
Labels as in §8: **[Lean]** checked in Lean, **[derived]** algebra checked
with sympy, **[literature]** standard and not re-derived.

### 11.1 The multipliers

The period-3 dynatomic factor is

```text
Φ₃(z, c) = (f³(z) − z) / (f(z) − z)
         = z⁶ + z⁵ + (3c+1)z⁴ + (2c+1)z³ + (3c²+3c+1)z² + (c+1)²z + G₃(c),
G₃(c)   = c³ + 2c² + c + 1.
```

At a root z of Φ₃ the three-step multiplier is λ = (f³)′(z) = 8·z·f(z)·f²(z),
and it is a root of

```text
M₃(λ, c) = λ² − 8(c+2)λ + 64·G₃(c)          [Lean: period3_multiplier_root]
```

The discriminant is 64(c+2)² − 256·G₃(c) = −64c²(4c+7), so with s² = 4c+7

```text
λ± = 4(c+2) ± 4i·c·s                         [Lean: period3_closedForm_roots]
```

Conversely, Res_z(Φ₃, λ − (f³)′) = M₃(λ, c)³ **[derived]**
([multpoly.py](../poc/performance/h-p3p4/multpoly.py)): each root of M₃ is the
multiplier of three roots of Φ₃, counted with multiplicity, that is of one
3-cycle. Landmarks: at the airplane cusp c = −7/4, M₃ = (λ − 1)²
**[Lean: period3_cusp]**; at a root of G₃, λ = 0 is a root
**[Lean: period3_multiplier_zero_of_center]**.

### 11.2 Exact period and uniqueness

Let λ\* be the root of smaller modulus and suppose |λ\*| < 1. By 11.1 some root
z of Φ₃ has (f³)′(z) = λ\*. If z were a fixed point, (2z)² + 2z + 1 = 0 and
(f³)′(z) = (2z)³ = 1 **[Lean: periodThreeDynatomic_fixedPoint_multiplier]**,
which contradicts |λ\*| < 1. So f³(z) = z **[Lean: orbit_three_sub_self]** and
f(z) ≠ z: the cycle through z has exact period 3, and it is attracting. A
quadratic polynomial has at most one attracting cycle, and that cycle attracts
the critical orbit **[literature: Fatou]**, so this is the cycle the orbit path
would find, and the larger root belongs to the other, repelling 3-cycle. As for
the period-2 bulb, no divisor reduction is needed: the only proper divisor,
period 1, is excluded because its three-step multiplier would be exactly 1.

The period-6 satellites of the rabbit show why the margin, not a region test,
decides: at c = −0.1155037 + 0.8402561i, inside the rabbit's gate box,
both roots have |λ| > 1 (the smaller is 1.0246), the closed form refuses, and
the orbit path finds the attracting period-6 cycle (|λ₆| = 0.9015).

### 11.3 Algorithm

1. w = 4c + 7.
2. s = √w, principal branch, stable form: for Re w ≥ 0,
   Re s = √((|w| + Re w)/2) and Im s = Im w / (2 Re s) (Im s = 0 when Re s = 0);
   otherwise |Im s| = √((|w| − Re w)/2) with the sign of Im w, and
   Re s = |Im w| / (2|Im s|). |w| = √((Re w)² + (Im w)²).
3. t = 4i·c·s, a = 4(c + 2), λ± = a ± t.
4. Keep the root with the smaller squared modulus; m̂ = √(that squared modulus).
5. Accept iff m̂ + A < 1 − attractMargin, with A = 2⁻⁴⁶·(|Re c + 2| + |Im c| + 1).

The record is period 3, λ, |λ|, arg λ (0 when |λ| = 0, §5), iterations 0 and
evidence `analytic-period-3-component`.

### 11.4 Floating-point error budget

Model: IEEE binary64 with round to nearest, unit roundoff u = 2⁻⁵³. ECMAScript
evaluates each operation exactly rounded and does not contract to FMA.
`Math.sqrt` is correctly rounded; `Math.hypot` and `Math.atan2` are
implementation-approximated, so the accept decision uses neither (`atan2`
only formats arg λ after acceptance). First-order bounds; the slack in A
absorbs every O(u²) term.

1. **Inputs, and Sterbenz near the cusp.** Re â = 4·fl(Re c + 2) and
   Im â = 4·Im c (multiplying by 4 is exact), so |â − a| ≤ u|a|. In the
   airplane box Re c ∈ [−1.770, −1.747] ⊂ [−4, −1], so Re c + 2 is exact by
   Sterbenz and â = a. Re ŵ = fl(4 Re c + 7) and Im ŵ = 4 Im c, so
   |ŵ − w| ≤ u|w|; in the airplane box 4 Re c ∈ [−14, −3.5], so 4 Re c + 7 is
   exact as well. Near the cusp, where w → 0 and λ → 1, the inputs therefore
   carry no rounding at all.
2. **The complex square root.** |ŵ| has relative error ≤ 2u (two squares and a
   sum: 2u in the radicand, halved by the square root, plus its own rounding).
   The half-sum (|ŵ| + |Re ŵ|)/2 adds two non-negative numbers, so it has no
   cancellation: ≤ 3u; its square root ≤ 2.5u; the other component costs one
   division: ≤ 3.5u. So |ŝ − √ŵ| ≤ 3.5u|s|. Because Im ŵ = Im w exactly, √ŵ and
   √w lie on the same side of the branch cut, and
   |√ŵ − √w| = |ŵ − w| / |√ŵ + √w| ≤ (u/2)|s|. In total |ŝ − s| ≤ 4u|s|. Either
   sign of s gives the same pair {a + t, a − t}, so the branch cut cannot
   change which roots are compared.
3. **t = 4i·c·ŝ.** A product of two complex numbers in binary64 without FMA
   has normwise relative error ≤ √5·u **[literature: Brent, Percival and
   Zimmermann 2007]**; the factors 4 and i are exact. So
   |t̂ − t| ≤ (4 + √5)u|t| ≈ 6.24u|t|.
4. **λ̂ = â ± t̂**, one rounding per component: |λ̂ − λ| ≤ u|a| + 6.24u|t| + u|λ|.
5. **The modulus.** m̂ = |λ̂|(1 + η) with |η| ≤ 2u.

Together: |λ| ≤ m̂ + E with E ≤ u|a| + 6.24u|t| + 3u, using |λ| ≤ 1 at
acceptance. At acceptance |t| = |a − λ| ≤ |a| + 1, so E ≤ 9.24u + 7.24u|a|,
and |a| = 4|c + 2| ≤ 4L with L = |Re c + 2| + |Im c|. Hence
E ≤ 9.24u + 28.96u·L. The code's allowance A = 128u·(L + 1) is at least four
times this for every L ≥ 0, which also covers the second-order terms, the
rounding of L itself, and the rounding of the final sum and comparison
(≤ 2u). Therefore:

> **Acceptance implies |λ| < 1 − 10⁻¹² for the exact closed-form root at the
> binary64 parameter c.**

Sizes: in the rabbit box L ≤ 2.81 and A ≤ 4.9·10⁻¹⁴; in the airplane box
L ≤ 0.26 and A ≤ 1.8·10⁻¹⁴. The worst measured |λ̂ − λ_dd| over the 19,216
analytic pixels of the golden raster is 3.0·10⁻¹⁵ (ADR 0010).

**Root selection.** The squared-modulus comparison can pick the wrong root
only when the two moduli agree to within about 2E. Both roots cannot be
accepted (11.2: at most one attracting cycle) unless they coincide, which
happens only at c = 0 (λ = 8) and c = −7/4 (λ = 1), both refused. So a wrong
pick can only occur when nothing is accepted; it never changes an answer.

**No catastrophic cancellation.** λ = a ± t subtracts two numbers of size up
to about 8.6 to produce |λ| < 1, a loss of up to three decimal digits of
relative accuracy. It does no harm: a and t carry only O(u) relative error
(steps 1–3 have no earlier cancellation to amplify), the decision is absolute
(|λ| against 1 − 10⁻¹²), and the absolute error stays below 5·10⁻¹⁴, about
twenty times inside the margin. Relative accuracy of λ is lost only near the
centres, where |λ| ≪ 1 and arg λ carries no information; at exact 0 the
identity rule of §5 applies.

**The spike's allowance.** The prototype used 32·ε·(|a| + |t|) with
ε = 2⁻⁵² = 2u, that is 64u(|a| + |t|), on top of the margin. It is justified:
it exceeds the first-order bound u|a| + 6.24u|t| + 3u by about eight times
wherever |a| + |t| ≥ 1, which holds in every gate box. It did not name the
modulus rounding term (its slack covers it), and it needs two extra square
roots for |a| and |t|. The production allowance is the bound derived above,
in terms of c alone, and is about 2.3 times smaller in the rabbit box
(4.9·10⁻¹⁴ against 1.1·10⁻¹³).

**Non-finite and extreme input.** NaN propagates and every comparison with
NaN is false, so the test refuses. Overflow (|c| ≳ 10¹⁵⁴) gives an infinite or
NaN modulus and refuses. (Re ŵ)² + (Im ŵ)² underflows only when Re c = −7/4
exactly and |Im c| < about 4·10⁻¹⁵⁵; there both roots are 1 ± O(10⁻⁷⁷) and the
margin refuses whatever ŝ is.

**The margin.** attractMargin = 10⁻¹² is the verifier's policy (§3):
near-parabolic cycles stay unresolved. The allowance is added on top of it,
so the closed form never accepts a point the policy would refuse in exact
arithmetic. Points with 1 − 10⁻¹² − A ≤ |λ| < 1 − 10⁻¹² are refused and fall to
the orbit path, which cannot detect them within any budget (§6): they end
unresolved, as the policy intends.

### 11.6 What is proved and what is not

- **Lean (S1 in the [proof DAG](verification/LEAN-PROOF-DAG.md)):** the Φ₃
  factorization, the multiplier quadratic, its closed-form roots, the cusp and
  centre landmarks, and the fixed-point case with three-step multiplier 1.
- **Not in Lean:** the resultant identity (each root of M₃ is realized by a
  cycle; sympy-checked), Fatou uniqueness (literature), the binary64 budget of
  11.4 (a written argument, checked numerically by the dd adjudicator in
  `tests/unit/domain/dd-oracle.ts` and the golden-raster test), and the gate
  containment of 11.5 (measured on a dense grid). Formalizing the resultant
  direction is a follow-up; the binary64 budget would need the refinement work
  the Phase 3 program describes.
````

(§11.5 is added in Task 7, when the kernels call the closed form.)

- [ ] **Step 6: Repository gates**

Run: `npx prettier --write docs/PERFORMANCE-MATHEMATICS.md && npm run check && npx playwright test`
Expected: both pass. Nothing calls `classifyPeriodThreeInto` from a kernel yet, so the golden fixture is untouched.

- [ ] **Step 7: Commit**

```bash
git add src/domain/analytic-period-three.ts src/domain/index.ts tests/unit/domain/analytic-period-three.test.ts docs/PERFORMANCE-MATHEMATICS.md
git commit -m "$(cat <<'EOF'
Domain: period-3 closed form with a derived rounding allowance (ADR 0010)

Not wired into the kernels yet. PERFORMANCE-MATHEMATICS section 11 holds the
exact-period argument and the binary64 error budget.

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: The gate: component boxes as data behind a straight-line test

**Files:**

- Create: `src/domain/period-three-gate.ts`
- Modify: `src/domain/index.ts` (exports)
- Test: `tests/unit/domain/period-three-gate.test.ts`

**Interfaces:**

- Consumes: `classifyPeriodThreeInto` (Task 3), in the test only.
- Produces: `interface PeriodThreeBox { reMin; reMax; absImMin; absImMax }`; `RABBIT_BOX`, `AIRPLANE_BOX`, `PERIOD_THREE_BOXES`, `PERIOD_THREE_HULL`; `inPeriodThreeGate(cRe: number, cIm: number): boolean`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/domain/period-three-gate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  classifyPeriodThreeInto,
  createOrbitSample,
  inPeriodThreeGate,
  PERIOD_THREE_BOXES,
  PERIOD_THREE_HULL,
} from '../../../src/domain';

/**
 * The gate decides only whether the closed form is tried, so it must
 * contain every parameter the closed form accepts (ADR 0010). Measured on a
 * dense grid and along every box edge; not a proof.
 */
describe('period-3 gate', () => {
  it('has a hull equal to the bounding box of its boxes', () => {
    expect(PERIOD_THREE_HULL.reMin).toBe(Math.min(...PERIOD_THREE_BOXES.map((b) => b.reMin)));
    expect(PERIOD_THREE_HULL.reMax).toBe(Math.max(...PERIOD_THREE_BOXES.map((b) => b.reMax)));
    expect(PERIOD_THREE_HULL.absImMin).toBe(0);
    expect(PERIOD_THREE_HULL.absImMax).toBe(Math.max(...PERIOD_THREE_BOXES.map((b) => b.absImMax)));
  });

  it('agrees with a plain loop over PERIOD_THREE_BOXES on a grid', () => {
    const inAnyBox = (re: number, im: number): boolean =>
      PERIOD_THREE_BOXES.some(
        (box) =>
          re >= box.reMin &&
          re <= box.reMax &&
          Math.abs(im) >= box.absImMin &&
          Math.abs(im) <= box.absImMax,
      );
    for (let i = 0; i < 400; i += 1) {
      const re = -2 + (2.2 * (i + 0.5)) / 400;
      for (let j = 0; j < 400; j += 1) {
        const im = -1.1 + (2.2 * (j + 0.5)) / 400;
        expect(inPeriodThreeGate(re, im)).toBe(inAnyBox(re, im));
      }
    }
  });

  it('contains the three period-3 centres and is conjugation-symmetric', () => {
    expect(inPeriodThreeGate(-1.7548776662466927, 0)).toBe(true);
    expect(inPeriodThreeGate(-0.12256116687665362, 0.7448617666197442)).toBe(true);
    expect(inPeriodThreeGate(-0.12256116687665362, -0.7448617666197442)).toBe(true);
    expect(inPeriodThreeGate(-0.1205, 0.8268)).toBe(inPeriodThreeGate(-0.1205, -0.8268));
  });

  it('rejects NaN and infinite parameters and the far exterior', () => {
    expect(inPeriodThreeGate(Number.NaN, 0.7)).toBe(false);
    expect(inPeriodThreeGate(-0.1, Number.NaN)).toBe(false);
    expect(inPeriodThreeGate(Number.NEGATIVE_INFINITY, 0)).toBe(false);
    expect(inPeriodThreeGate(-0.1, Number.POSITIVE_INFINITY)).toBe(false);
    expect(inPeriodThreeGate(2.5, 1)).toBe(false);
  });

  it('contains every parameter the closed form accepts on a dense grid', () => {
    const sample = createOrbitSample();
    let accepted = 0;
    const steps = 1200;
    for (let i = 0; i < steps; i += 1) {
      const re = -2.1 + (2.7 * (i + 0.5)) / steps;
      for (let j = 0; j < steps; j += 1) {
        const im = -1.3 + (2.6 * (j + 0.5)) / steps;
        if (classifyPeriodThreeInto(re, im, sample)) {
          accepted += 1;
          if (!inPeriodThreeGate(re, im)) {
            throw new Error(`accepted outside the gate at ${re} + ${im}i`);
          }
        }
      }
    }
    // The three period-3 components on this 1200 x 1200 grid.
    expect(accepted).toBe(11602);
  });

  it('refuses the closed form just outside every box edge', () => {
    const sample = createOrbitSample();
    const samples = 4000;
    for (const box of PERIOD_THREE_BOXES) {
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
          expect(classifyPeriodThreeInto(cRe, cIm, sample)).toBe(false);
          expect(classifyPeriodThreeInto(cRe, -cIm, sample)).toBe(false);
        }
      }
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/domain/period-three-gate.test.ts`
Expected: FAIL (`inPeriodThreeGate is not a function`).

- [ ] **Step 3: Write the module**

Create `src/domain/period-three-gate.ts`:

```ts
/**
 * Speed gate for the analytic period-3 fast path (ADR 0010): padded
 * bounding boxes of the three period-3 hyperbolic components, as data.
 *
 * Provenance: poc/performance/h-p3p4/boxes.ts traced each component's
 * boundary (lambda = e^{i theta}, 4096 angles, Newton-continued from the
 * Gleason centre) and padded each box by 2% of its larger side
 * (boxes.json). Conjugate pairs are folded through |Im c|, so the rabbit and
 * co-rabbit share one box.
 *
 * The gate decides only whether the closed form is tried. It must contain
 * every parameter the closed form accepts; then it changes speed, never
 * answers. tests/unit/domain/period-three-gate.test.ts checks that on a
 * dense grid and along every box edge (measured, not proved).
 */

export interface PeriodThreeBox {
  readonly reMin: number;
  readonly reMax: number;
  /** Bounds on |Im c|. */
  readonly absImMin: number;
  readonly absImMax: number;
}

/** Douady rabbit (Im c > 0) and co-rabbit (Im c < 0). */
export const RABBIT_BOX: PeriodThreeBox = Object.freeze({
  reMin: -0.2232411450425719,
  reMax: -0.026495368185881676,
  absImMin: 0.6457354802064695,
  absImMax: 0.8422103415192167,
});

/** Airplane, on the real axis. */
export const AIRPLANE_BOX: PeriodThreeBox = Object.freeze({
  reMin: -1.7690122266456996,
  reMax: -1.747173345346132,
  absImMin: 0,
  absImMax: 0.012559928628381378,
});

export const PERIOD_THREE_BOXES: readonly PeriodThreeBox[] = Object.freeze([
  RABBIT_BOX,
  AIRPLANE_BOX,
]);

/** Hull of PERIOD_THREE_BOXES: the first, cheapest test. */
export const PERIOD_THREE_HULL: PeriodThreeBox = Object.freeze({
  reMin: AIRPLANE_BOX.reMin,
  reMax: RABBIT_BOX.reMax,
  absImMin: 0,
  absImMax: RABBIT_BOX.absImMax,
});

/**
 * True when c lies in a period-3 box. NaN and infinite input give false
 * (every comparison with NaN is false; infinities fail the bounds).
 *
 * Straight-line on purpose: the kernels inline this test into their outer
 * loop, and a loop over PERIOD_THREE_BOXES there slowed the far-exterior
 * stable pass by about 10% in Node (ADR 0010, fallback-overhead evidence).
 */
export const inPeriodThreeGate = (cRe: number, cIm: number): boolean => {
  const absIm = cIm < 0 ? -cIm : cIm;
  if (!(cRe <= PERIOD_THREE_HULL.reMax && cRe >= PERIOD_THREE_HULL.reMin)) {
    return false;
  }
  if (!(absIm <= PERIOD_THREE_HULL.absImMax)) {
    return false;
  }
  return (
    (cRe >= RABBIT_BOX.reMin &&
      cRe <= RABBIT_BOX.reMax &&
      absIm >= RABBIT_BOX.absImMin &&
      absIm <= RABBIT_BOX.absImMax) ||
    (cRe >= AIRPLANE_BOX.reMin &&
      cRe <= AIRPLANE_BOX.reMax &&
      absIm >= AIRPLANE_BOX.absImMin &&
      absIm <= AIRPLANE_BOX.absImMax)
  );
};
```

In `src/domain/index.ts`, directly after the line `export type { PeriodThreeTarget } from './analytic-period-three';` (Task 3), insert:

```ts
export {
  AIRPLANE_BOX,
  inPeriodThreeGate,
  PERIOD_THREE_BOXES,
  PERIOD_THREE_HULL,
  RABBIT_BOX,
} from './period-three-gate';
export type { PeriodThreeBox } from './period-three-gate';
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/domain/period-three-gate.test.ts`
Expected: PASS, 6 tests (the grid count is exactly 11,602).

- [ ] **Step 5: Repository gates**

Run: `npm run check && npx playwright test`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add src/domain/period-three-gate.ts src/domain/index.ts tests/unit/domain/period-three-gate.test.ts
git commit -m "$(cat <<'EOF'
Domain: period-3 component boxes and straight-line gate (ADR 0010)

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: An independent double-double period-3 adjudicator

**Files:**

- Modify: `tests/unit/domain/dd-oracle.ts` (`ddVerifyCycle` gains an optional Newton budget; new `ddPeriodThreeCycle`)
- Test: `tests/unit/domain/dd-period-three.test.ts`

**Interfaces:**

- Consumes: `ddVerifyCycle`, `DDOracleVerdict`, `DD_ORACLE_OPTIONS` (existing, same file).
- Produces: `ddVerifyCycle(cRe, cIm, start, proposedPeriod, newtonSteps = DD_ORACLE_OPTIONS.newtonSteps)` (existing callers unchanged); `DD_PERIOD_THREE_OPTIONS = { seedIterations: 4096, newtonSteps: 64 }`; `ddPeriodThreeCycle(cRe: number, cIm: number): DDOracleVerdict`. Used by Tasks 7 and 10.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/domain/dd-period-three.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { ddPeriodThreeCycle } from './dd-oracle';

/**
 * The dd period-3 adjudicator (ADR 0010) uses no closed form: a binary64
 * orbit seed, dd Newton on f_c^3(z) - z, dd divisor and attraction checks.
 * Expected moduli are mpmath values of the closed form at the same binary64
 * parameters (docs/superpowers/plans/2026-10-16-analytic-period-three.md).
 */
const certifiedMagnitude = (re: number, im: number): number => {
  const verdict = ddPeriodThreeCycle(re, im);
  if (verdict.status !== 'attracting-cycle') {
    throw new Error(`not certified at ${re} + ${im}i: ${verdict.status}`);
  }
  expect(verdict.cycle.primitive).toBe(3);
  return verdict.cycle.magnitude;
};

describe('ddPeriodThreeCycle', () => {
  it('certifies period 3 at the superattracting centres', () => {
    expect(certifiedMagnitude(-0.12256116687665362, 0.7448617666197442)).toBeLessThan(1e-12);
    expect(certifiedMagnitude(-1.7548776662466927, 0)).toBeLessThan(1e-12);
  });

  it('agrees with the closed-form modulus near the cusp and the rabbit boundary', () => {
    const cases: readonly (readonly [number, number, number])[] = [
      [-0.1205, 0.8268, 0.8755937247517454],
      [-1.750001, 0, 0.9859959920005762],
      [-0.04585527427169738, 0.6923152138236197, 0.9989999999999998],
      [-0.04577863707377464, 0.692264905409385, 0.9999999990000003],
      [-0.045778636997903986, 0.6922649053595819, 0.99999999999],
    ];
    for (const [re, im, magnitude] of cases) {
      expect(Math.abs(certifiedMagnitude(re, im) - magnitude)).toBeLessThan(1e-12);
    }
  });

  it('does not certify period 3 inside the period-6 satellite of the rabbit', () => {
    for (const [re, im] of [
      [-0.1155037469844854, 0.8402560718860035],
      [-0.11341865594943658, 0.860569472501573],
    ] as const) {
      const verdict = ddPeriodThreeCycle(re, im);
      expect(verdict.status === 'attracting-cycle' && verdict.cycle.primitive === 3).toBe(false);
    }
  });

  it('reports the escape of an exterior parameter', () => {
    expect(ddPeriodThreeCycle(2.5, 1)).toEqual({ status: 'escaped', escapeIteration: 1 });
  });

  it('reduces a fixed point to period 1 through the dd divisor test', () => {
    const verdict = ddPeriodThreeCycle(0, 0);
    expect(verdict.status).toBe('attracting-cycle');
    if (verdict.status === 'attracting-cycle') {
      expect(verdict.cycle.primitive).toBe(1);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/domain/dd-period-three.test.ts`
Expected: FAIL (`ddPeriodThreeCycle is not a function`).

- [ ] **Step 3: Implement**

In `tests/unit/domain/dd-oracle.ts`, replace:

```ts
export const ddVerifyCycle = (
  cRe: number,
  cIm: number,
  start: DDPoint,
  proposedPeriod: number,
): DDOracleCycle | undefined => {
```

with:

```ts
export const ddVerifyCycle = (
  cRe: number,
  cIm: number,
  start: DDPoint,
  proposedPeriod: number,
  newtonSteps: number = DD_ORACLE_OPTIONS.newtonSteps,
): DDOracleCycle | undefined => {
```

and, in the same function, replace:

```ts
  for (let polish = 0; polish <= DD_ORACLE_OPTIONS.newtonSteps; polish += 1) {
```

with:

```ts
  for (let polish = 0; polish <= newtonSteps; polish += 1) {
```

Append to the end of the file:

```ts

// ---------------------------------------------------------------------------
// Period-3 adjudicator for the analytic fast path (ADR 0010).
// ---------------------------------------------------------------------------

/** Seed orbit length and Newton budget of ddPeriodThreeCycle. */
export const DD_PERIOD_THREE_OPTIONS = Object.freeze({
  seedIterations: 4096,
  newtonSteps: 64,
} as const);

/**
 * Independent check of an analytic period-3 claim. It uses no closed form:
 * the binary64 critical orbit runs DD_PERIOD_THREE_OPTIONS.seedIterations
 * steps (a seed only; an escape is reported as escaped), then each of the
 * next three iterates is polished as a period-3 cycle start by dd Newton on
 * f_c^3(z) - z and certified by ddCertifiedCycle (dd divisor test, dd
 * |lambda| < 1). The first certified cycle is returned. Unlike
 * classifyDDMinimal it needs no orbit convergence, so it reaches cycles with
 * |lambda| near 1 that no iteration budget can.
 *
 * It is an adjudicator, not a classifier: its |lambda| < 1 test has no
 * margin, so at a parabolic parameter it can certify |lambda| = 1 - O(1e-12)
 * (at c = -7/4 it reports 1 - 1.4e-12). Callers compare its multiplier with
 * the analytic one within 1e-12, and the analytic path refuses there.
 */
export const ddPeriodThreeCycle = (cRe: number, cIm: number): DDOracleVerdict => {
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
  for (let phase = 0; phase < 3; phase += 1) {
    const cycle = ddVerifyCycle(
      cRe,
      cIm,
      { re: { hi: zRe, lo: 0 }, im: { hi: zIm, lo: 0 } },
      3,
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/domain/dd-period-three.test.ts tests/unit/domain/orbit-oracle-adjudication.test.ts`
Expected: PASS (the existing adjudication suite is unchanged by the default parameter).

- [ ] **Step 5: Repository gates**

Run: `npm run check && npx playwright test`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add tests/unit/domain/dd-oracle.ts tests/unit/domain/dd-period-three.test.ts
git commit -m "$(cat <<'EOF'
Tests: dd period-3 adjudicator, independent of the closed form (ADR 0010)

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Tools for the before/after comparison (the baseline commit)

This commit is the **baseline** for Tasks 10 and 11: the kernels are still unchanged here. Its subject line is looked up later with `git log --grep`, so keep it verbatim.

**Files:**

- Create: `tools/kernel_pixel_dump.ts`
- Create: `tools/benchmark/overhead-entry.ts`
- Create: `tools/benchmark/fallback-overhead.ts`
- Modify: `package.json` (script `fixtures:pixel-dump`)
- Modify: `tsconfig.node.json` (include `tools/kernel_pixel_dump.ts`, `tools/benchmark/fallback-overhead.ts`)
- Modify: `tsconfig.tools.json` (include `tools/benchmark/overhead-entry.ts`)

**Interfaces:**

- Consumes: `classifyRows` (`src/render/classify-rows.ts`); `loadCorpusCases`, `profileQuality` (`tools/benchmark/judge/corpus.ts`); `median`, `pairedRatio` (`tools/benchmark/harness/stats.ts`).
- Produces:
  - `DUMP_RASTER = { width: 160, height: 100 }`; `interface PixelDumpCase { packedStatusPeriod: number[]; smoothIterationOrMultiplierMagnitude: number[]; multiplierAngle: number[] }`; `interface PixelDump { schemaVersion: 1; raster; commit: string; cases: Record<string, PixelDumpCase> }`; `dumpPixels(): Promise<PixelDump>`; CLI `npm run fixtures:pixel-dump -- <out.json>`.
  - Bundle exports `corpusCaseIds(): readonly string[]` and `timeCase(caseId: string, size: RasterSize): Promise<number>`.
  - CLI `node tools/benchmark/fallback-overhead.ts <baseline.js> <candidate.js> [--reps N] [--raster WxH] [--cases id,id] [--out file.json]`, exit 0 pass / 1 regression / 3 noisy.

- [ ] **Step 1: Write the pixel dump tool**

Create `tools/kernel_pixel_dump.ts`:

```ts
/**
 * Per-pixel kernel dump (evidence aid, not a fixture): the stable-pass output
 * channels of classifyRows for every frozen-corpus case at the golden raster
 * (tools/generate_kernel_golden.ts), written as JSON so two builds can be
 * compared pixel by pixel. JSON numbers round-trip binary64 exactly.
 * Usage: npm run fixtures:pixel-dump -- <out.json>
 */
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { classifyRows } from '../src/render/classify-rows';
import { loadCorpusCases, profileQuality } from './benchmark/judge/corpus';

export const DUMP_RASTER = { width: 160, height: 100 } as const;

export interface PixelDumpCase {
  readonly packedStatusPeriod: number[];
  readonly smoothIterationOrMultiplierMagnitude: number[];
  readonly multiplierAngle: number[];
}

export interface PixelDump {
  readonly schemaVersion: 1;
  readonly raster: typeof DUMP_RASTER;
  readonly commit: string;
  readonly cases: Record<string, PixelDumpCase>;
}

export const dumpPixels = async (): Promise<PixelDump> => {
  const cases: Record<string, PixelDumpCase> = {};
  for (const corpusCase of loadCorpusCases()) {
    const quality = profileQuality(corpusCase.profile);
    const band = await classifyRows(
      { viewport: corpusCase.viewport, size: DUMP_RASTER, quality },
      quality,
      1,
      0,
      DUMP_RASTER.height,
      new AbortController().signal,
    );
    cases[corpusCase.id] = {
      packedStatusPeriod: Array.from(band.packedStatusPeriod),
      smoothIterationOrMultiplierMagnitude: Array.from(band.smoothIterationOrMultiplierMagnitude),
      multiplierAngle: Array.from(band.multiplierAngle),
    };
  }
  const commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  return { schemaVersion: 1, raster: DUMP_RASTER, commit, cases };
};

const main = async (): Promise<void> => {
  const target = process.argv[2];
  if (target === undefined) {
    process.stderr.write('usage: npm run fixtures:pixel-dump -- <out.json>\n');
    process.exit(2);
  }
  // Resolved from the repo root (npm runs scripts there).
  writeFileSync(path.resolve(process.cwd(), target), `${JSON.stringify(await dumpPixels())}\n`);
};

if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('kernel_pixel_dump.js')
) {
  await main();
  // The yield scheduler's MessagePort keeps the event loop alive; exit explicitly as the other tools do.
  process.exit(0);
}
```

- [ ] **Step 2: Write the benchmark bundle entry**

Create `tools/benchmark/overhead-entry.ts`:

```ts
/**
 * Bundle entry for the fallback-overhead microbenchmark
 * (tools/benchmark/fallback-overhead.ts). Built once per arm, each bundle
 * carrying its own copy of the classifier, so two builds can be timed
 * interleaved in one Node process.
 */
import type { RasterSize } from '../../src/domain';
import { classifyRows } from '../../src/render/classify-rows';
import { loadCorpusCases, profileQuality } from './judge/corpus';

/** Ids of every frozen-corpus case, in corpus order. */
export const corpusCaseIds = (): readonly string[] => loadCorpusCases().map((c) => c.id);

/** Wall time in ms of one stable-pass classification of a corpus case. */
export const timeCase = async (caseId: string, size: RasterSize): Promise<number> => {
  const corpusCase = loadCorpusCases().find((candidate) => candidate.id === caseId);
  if (corpusCase === undefined) throw new RangeError(`unknown corpus case ${caseId}`);
  const quality = profileQuality(corpusCase.profile);
  const signal = new AbortController().signal;
  const started = performance.now();
  await classifyRows(
    { viewport: corpusCase.viewport, size, quality },
    quality,
    1,
    0,
    size.height,
    signal,
  );
  return performance.now() - started;
};
```

- [ ] **Step 3: Write the benchmark driver**

Create `tools/benchmark/fallback-overhead.ts`:

```ts
/**
 * Fallback-overhead microbenchmark for the analytic period-3 path (ADR 0010;
 * plan section 5, workstream H gate "fallback <=5%"). Directional Node
 * evidence, not a release measurement.
 *
 * Three arms run interleaved in one Node process, each an SSR bundle of
 * tools/benchmark/overhead-entry.ts with its own copy of the classifier:
 * `baseline` (the build before the change), `control` (a byte copy of the
 * baseline bundle, an A/A arm that measures position and JIT noise) and
 * `candidate`. The arm order rotates every repetition; repetition 0 is
 * warmup and is discarded. Overhead is 1/ratio - 1 for the paired
 * median log-ratio of tools/benchmark/harness/stats.ts (95% BCa interval).
 *
 * Usage:
 *   node tools/benchmark/fallback-overhead.ts <baseline.js> <candidate.js>
 *     [--reps N] [--raster WxH] [--cases id,id] [--out file.json]
 * Exit 0: every case within 5% and the control arm within 2%.
 * Exit 1: a case above 5% with a quiet control arm (a real regression).
 * Exit 3: the control arm moved more than 2% (too noisy; rerun on an idle
 * machine).
 */
import { copyFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { median, pairedRatio } from './harness/stats.ts';

type ArmName = 'baseline' | 'control' | 'candidate';

interface Arm {
  readonly name: ArmName;
  readonly corpusCaseIds: () => readonly string[];
  readonly timeCase: (
    caseId: string,
    size: { readonly width: number; readonly height: number },
  ) => Promise<number>;
}

const DEFAULT_CASES = ['mi-easy-exterior-heavy', 'mi-fallback-ambiguous-boundary'];
const OVERHEAD_LIMIT = 0.05;
const CONTROL_LIMIT = 0.02;
const SEED = 20_261_016;

const args = process.argv.slice(2);
const option = (name: string): string | undefined => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};
const [baselinePath, candidatePath] = args;
if (baselinePath === undefined || candidatePath === undefined) {
  process.stderr.write('usage: fallback-overhead.ts <baseline.js> <candidate.js> [options]\n');
  process.exit(2);
}
const reps = Number(option('--reps') ?? '60');
const rasterMatch = /^(\d+)x(\d+)$/.exec(option('--raster') ?? '1024x640');
if (rasterMatch === null) throw new RangeError('--raster must look like 1024x640');
const size = { width: Number(rasterMatch[1]), height: Number(rasterMatch[2]) };
const cases = (option('--cases') ?? DEFAULT_CASES.join(',')).split(',');
const load = os.loadavg()[0] ?? 0;
if (load > 1.5) {
  process.stderr.write(`warning: 1-minute load average ${load.toFixed(2)}; expect noise\n`);
}

const importArm = async (name: ArmName, file: string): Promise<Arm> => {
  const module = (await import(pathToFileURL(path.resolve(file)).href)) as Pick<
    Arm,
    'timeCase' | 'corpusCaseIds'
  >;
  return { name, timeCase: module.timeCase, corpusCaseIds: module.corpusCaseIds };
};
// The control arm must be a distinct module instance: copy the baseline file.
const controlPath = path.join(mkdtempSync(path.join(os.tmpdir(), 'h3-control-')), 'control.js');
copyFileSync(path.resolve(baselinePath), controlPath);
const arms = [
  await importArm('baseline', baselinePath),
  await importArm('control', controlPath),
  await importArm('candidate', candidatePath),
];

// Production-like JIT state: every arm first classifies the whole corpus at a
// small raster, so its kernel carries feedback from every path (escape,
// lag scan, verifier, analytic) before the measured cases run.
const WARMUP_RASTER = { width: 256, height: 160 };
for (const arm of arms) {
  for (const caseId of arm.corpusCaseIds()) await arm.timeCase(caseId, WARMUP_RASTER);
}

const samples = new Map<string, Record<ArmName, number[]>>();
for (const caseId of cases) samples.set(caseId, { baseline: [], control: [], candidate: [] });

for (let rep = 0; rep <= reps; rep += 1) {
  for (const caseId of cases) {
    for (let slot = 0; slot < arms.length; slot += 1) {
      const arm = arms[(rep + slot) % arms.length];
      if (arm === undefined) continue;
      const ms = await arm.timeCase(caseId, size);
      if (rep > 0) samples.get(caseId)?.[arm.name].push(ms);
    }
  }
}

const overheadOf = (baseline: number[], other: number[]) => {
  const paired = pairedRatio(baseline, other, SEED);
  // pairedRatio is baseline/other (above 1: other faster).
  return paired === undefined
    ? { estimate: Number.NaN, interval: null }
    : {
        estimate: 1 / paired.ratio - 1,
        interval: [1 / paired.interval[1] - 1, 1 / paired.interval[0] - 1] as const,
      };
};

const rows = cases.map((caseId) => {
  const arm = samples.get(caseId) ?? { baseline: [], control: [], candidate: [] };
  const candidate = overheadOf(arm.baseline, arm.candidate);
  const control = overheadOf(arm.baseline, arm.control);
  return {
    caseId,
    reps,
    raster: size,
    medianMs: {
      baseline: median(arm.baseline),
      control: median(arm.control),
      candidate: median(arm.candidate),
    },
    candidateOverhead: candidate,
    controlOverhead: control,
    controlQuiet: Math.abs(control.estimate) <= CONTROL_LIMIT,
    withinLimit: candidate.estimate <= OVERHEAD_LIMIT,
    samples: arm,
  };
});
const noisy = rows.some((row) => !row.controlQuiet);
const regression = rows.some((row) => !row.withinLimit);

const percent = (value: number): string => `${(100 * value).toFixed(2)}%`;
for (const row of rows) {
  process.stdout.write(
    `${row.caseId.padEnd(32)} baseline ${row.medianMs.baseline?.toFixed(2) ?? '-'} ms  ` +
      `candidate ${percent(row.candidateOverhead.estimate)} ` +
      `[${row.candidateOverhead.interval?.map(percent).join(', ') ?? '-'}]  ` +
      `control ${percent(row.controlOverhead.estimate)}  ` +
      `${!row.controlQuiet ? 'NOISY' : row.withinLimit ? 'PASS' : 'FAIL'}\n`,
  );
}
const out = option('--out');
if (out !== undefined) {
  writeFileSync(
    out,
    `${JSON.stringify({ seed: SEED, limit: OVERHEAD_LIMIT, controlLimit: CONTROL_LIMIT, loadAverage: load, rows }, null, 2)}\n`,
  );
}
// The bundles' yield scheduler keeps the event loop alive; exit explicitly.
process.exit(noisy ? 3 : regression ? 1 : 0);
```

- [ ] **Step 4: Register scripts and tsconfig entries**

In `package.json`, find the `"kernel-bench": …` script line and add after it (fix the comma on the previous line so the JSON stays valid):

```json
    "fixtures:pixel-dump": "vite build --ssr tools/kernel_pixel_dump.ts --outDir .evidence-build/pixel-dump --emptyOutDir --logLevel warn && node .evidence-build/pixel-dump/kernel_pixel_dump.js"
```

In `tsconfig.node.json`, in the `include` array, add these two entries directly after `"tools/generate_kernel_golden.ts"` (keep commas valid):

```json
    "tools/kernel_pixel_dump.ts",
    "tools/benchmark/fallback-overhead.ts"
```

In `tsconfig.tools.json`, in the `include` array, add directly after `"tools/benchmark/kernel-bench.ts",`:

```json
    "tools/benchmark/overhead-entry.ts",
```

- [ ] **Step 5: Run the tools to verify they work**

Run:

```bash
mkdir -p .evidence-build/h3
npm run fixtures:pixel-dump -- .evidence-build/h3/smoke.json
node -e "const d=require('./.evidence-build/h3/smoke.json'); const ids=Object.keys(d.cases); console.log(ids.length, d.cases[ids[0]].packedStatusPeriod.length, d.raster.width, d.raster.height)"
npx vite build --ssr tools/benchmark/overhead-entry.ts --outDir .evidence-build/overhead/smoke --emptyOutDir --logLevel warn
node tools/benchmark/fallback-overhead.ts .evidence-build/overhead/smoke/overhead-entry.js .evidence-build/overhead/smoke/overhead-entry.js --reps 2 --raster 128x80; echo "exit $?"
```

Expected: the node one-liner prints `13 16000 160 100`; the benchmark prints two case lines and `exit 0` or `exit 3` (an A/A comparison of a build with itself at 2 repetitions; either is fine for this smoke run, `exit 1` is not).

- [ ] **Step 6: Repository gates**

Run: `npm run check && npx playwright test`
Expected: both pass.

- [ ] **Step 7: Commit (keep the subject line verbatim)**

```bash
git add tools/kernel_pixel_dump.ts tools/benchmark/overhead-entry.ts tools/benchmark/fallback-overhead.ts package.json tsconfig.node.json tsconfig.tools.json
git commit -m "$(cat <<'EOF'
Tools: kernel pixel dump and fallback-overhead bench (H3 baseline)

The kernels are unchanged at this commit; Tasks 10 and 11 of the analytic
period-3 plan build their baseline from it.

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Wire the closed form into both kernels; regenerate the golden fixture

This is the answer-changing commit (plan §3, ADR 0007): the kernels, every test that pins the old answers, the regenerated golden fixture, the in-repo oracle evidence (`period-three-golden-oracle.test.ts`) and ADR 0010 land together. **One commit.**

**Files:**

- Modify: `src/domain/orbit-triggered.ts` (call site at the first scanning iteration; doc comment)
- Modify: `src/render/triggered-rows.ts` (both lanes; module comment)
- Modify: `src/domain/orbit.ts` (doc comments only)
- Create: `tests/unit/domain/period-three-placement.test.ts`
- Create: `tests/unit/render/period-three-golden-oracle.test.ts`
- Create: `tests/unit/render/period-three-coarse.test.ts`
- Modify: `tests/unit/render/triggered-rows.test.ts` (three views)
- Modify: `tests/unit/domain/orbit-scalar-parity.test.ts`, `tests/unit/domain/orbit-oracle-adjudication.test.ts`, `tests/unit/domain/verifier.test.ts`, `tests/unit/domain/orbit.test.ts`, `poc/performance/src/control.test.ts`
- Modify: `tsconfig.app.json` (exclude the golden-oracle test, like the kernel-golden test)
- Modify: `tools/generate_kernel_golden.ts` (`kernel` label), `fixtures/kernel-golden.v1.json` (regenerated)
- Create: `docs/decisions/0010-analytic-period-three.md`
- Modify: `docs/PERFORMANCE-MATHEMATICS.md` (§11.5; §8 table; §9; §10)

**Interfaces:**

- Consumes: `classifyPeriodThreeInto` (Task 3), `inPeriodThreeGate` (Task 4), `ddPeriodThreeCycle` (Task 5), `GOLDEN_RASTER` (`tools/generate_kernel_golden.ts`), `prepareRealColumns`, `preparedRowImaginary`, `classifyRows` (`src/render/classify-rows.ts`), `packStatusPeriod` (`src/render/packed-semantic.ts`).
- Produces: pixels inside a period-3 component carry `period 3`, `iterations 0`, evidence code 5 and the closed-form multiplier from every classifier entry point (scalar `classifyInto`, `OrbitClassifier`, `classifyOrbit`, the row kernel, the coarse and stable passes).

- [ ] **Step 1: Write the new failing tests**

Create `tests/unit/domain/period-three-placement.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { classifyOrbit, inPeriodThreeGate } from '../../../src/domain';

/**
 * Where the period-3 closed form runs (ADR 0010): once per pixel, at the
 * first scanning iteration max(cycleWarmup, 2), before that iteration's
 * scan. Pixels that escape earlier never reach it.
 */
const RABBIT = { re: -0.12256116687665362, im: 0.7448617666197442 };
const ANALYTIC = {
  status: 'attracting-cycle',
  period: 3,
  iterations: 0,
  evidence: ['analytic-period-3-component'],
  evidenceSource: 'analytic',
};

describe('placement of the period-3 closed form', () => {
  it('runs at the first scanning iteration', () => {
    // scanStart = max(0, 2) = 2.
    expect(classifyOrbit(RABBIT, { maxIterations: 2, maxPeriod: 3, cycleWarmup: 0 })).toMatchObject(
      ANALYTIC,
    );
    // scanStart = 40, reached exactly at the end of the budget.
    expect(
      classifyOrbit(RABBIT, { maxIterations: 40, maxPeriod: 3, cycleWarmup: 40 }),
    ).toMatchObject(ANALYTIC);
  });

  it('does not run when the budget ends before the first scanning iteration', () => {
    expect(classifyOrbit(RABBIT, { maxIterations: 30, maxPeriod: 3, cycleWarmup: 40 })).toEqual({
      status: 'unresolved',
      iterations: 30,
      evidence: ['iteration-limit'],
    });
  });

  it('never answers for a pixel inside the gate that escapes first', () => {
    for (const [c, escapeIteration] of [
      [{ re: -0.03, im: 0.84 }, 13],
      // Escapes at iteration 24 itself: the escape test comes first.
      [{ re: -0.2, im: 0.66 }, 24],
      [{ re: -1.768, im: 0.012 }, 21],
    ] as const) {
      expect(inPeriodThreeGate(c.re, c.im)).toBe(true);
      expect(classifyOrbit(c)).toMatchObject({
        status: 'escaped',
        escapeIteration,
        evidence: ['escape-radius'],
      });
    }
  });
});
```

Create `tests/unit/render/period-three-golden-oracle.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  classifyPeriodThreeInto,
  createOrbitSample,
  createViewportTransform,
} from '../../../src/domain';
import {
  classifyRows,
  prepareRealColumns,
  preparedRowImaginary,
} from '../../../src/render/classify-rows';
import { packStatusPeriod } from '../../../src/render/packed-semantic';
import { GOLDEN_RASTER } from '../../../tools/generate_kernel_golden';
import { loadCorpusCases, profileQuality } from '../../../tools/benchmark/judge/corpus';
import { ddPeriodThreeCycle } from '../domain/dd-oracle';

/**
 * ADR 0007/0010: every pixel the analytic period-3 path answers on the golden
 * raster is checked against the dd period-3 cycle (no closed form). This is
 * a superset of the pixels the change moved: unresolved -> attracting p3, and
 * attracting p3 with the closed-form multiplier instead of the orbit product
 * (evidence/phase-2/<date>-<commit>-period-three-adjudication/).
 */
const EXPECTED_ANALYTIC_PIXELS: Readonly<Record<string, number>> = {
  'mi-easy-default-full': 96,
  'mi-hard-rabbit-boundary': 3120,
  'mi-fallback-weak-attraction': 16000,
};

/** |lambda_analytic - lambda_dd| bound; the error budget gives about 5e-14. */
const TOLERANCE = 1e-12;

describe('analytic period-3 pixels on the golden raster', () => {
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
      const word = packStatusPeriod(2, 3);
      let analytic = 0;
      for (let y = 0; y < GOLDEN_RASTER.height; y += 1) {
        const cIm = preparedRowImaginary(transform, GOLDEN_RASTER.height, 1, y);
        for (let x = 0; x < GOLDEN_RASTER.width; x += 1) {
          const cRe = columns[x] ?? Number.NaN;
          if (!classifyPeriodThreeInto(cRe, cIm, sample)) continue;
          analytic += 1;
          const o = y * GOLDEN_RASTER.width + x;
          // The kernel wrote exactly the analytic record.
          expect(band.packedStatusPeriod[o]).toBe(word);
          expect(band.smoothIterationOrMultiplierMagnitude[o]).toBe(sample.multiplierMagnitude);
          expect(band.multiplierAngle[o]).toBe(sample.multiplierAngle);
          const oracle = ddPeriodThreeCycle(cRe, cIm);
          if (oracle.status !== 'attracting-cycle' || oracle.cycle.primitive !== 3) {
            throw new Error(`dd did not certify period 3 at ${cRe} + ${cIm}i (${oracle.status})`);
          }
          const error = Math.hypot(
            sample.multiplierMagnitude * Math.cos(sample.multiplierAngle) -
              oracle.cycle.magnitude * Math.cos(oracle.cycle.angle),
            sample.multiplierMagnitude * Math.sin(sample.multiplierAngle) -
              oracle.cycle.magnitude * Math.sin(oracle.cycle.angle),
          );
          expect(error).toBeLessThanOrEqual(TOLERANCE);
        }
      }
      expect(analytic).toBe(EXPECTED_ANALYTIC_PIXELS[corpusCase.id] ?? 0);
    }, 60_000);
  }
});
```

Create `tests/unit/render/period-three-coarse.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  classifyPeriodThreeInto,
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
 * (stride 1, two-lane row kernel) both answer period-3 pixels with the
 * closed form (ADR 0010): same record at the same parameter.
 */
const VIEW = { center: { re: -0.1205, im: 0.8268 }, spanY: 0.005 };
const SIZE = { width: 96, height: 64 };
const QUALITY = { maxIterations: 256, maxPeriod: 16, coarseStride: 8 };

describe('period-3 fast path in the coarse and stable passes', () => {
  for (const stride of [8, 1]) {
    it(`writes the analytic record at every sampled period-3 pixel (stride ${stride})`, async () => {
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
          expect(classifyPeriodThreeInto(columns[x] ?? Number.NaN, cIm, sample)).toBe(true);
          analytic += 1;
          expect(band.packedStatusPeriod[o]).toBe(packStatusPeriod(2, 3));
          expect(band.smoothIterationOrMultiplierMagnitude[o]).toBe(sample.multiplierMagnitude);
          expect(band.multiplierAngle[o]).toBe(sample.multiplierAngle);
        }
      }
      expect(analytic).toBe((SIZE.width / stride) * (SIZE.height / stride));
    });
  }
});
```

In `tests/unit/render/triggered-rows.test.ts`, replace:

```ts
  { center: { re: 0.1, im: 0.05 }, spanY: 0.2 },
];
```

with:

```ts
  { center: { re: 0.1, im: 0.05 }, spanY: 0.2 },
  // Period-3 gate boxes (ADR 0010): the airplane, its cusp, and the rabbit rim.
  { center: { re: -1.7548776662466927, im: 0 }, spanY: 0.03 },
  { center: { re: -1.75, im: 0 }, spanY: 1e-6 },
  { center: { re: -0.0458, im: 0.6923 }, spanY: 0.002 },
];
```

In `tsconfig.app.json`, in the `exclude` array, replace:

```json
    "tests/unit/render/kernel-golden.test.ts"
```

with:

```json
    "tests/unit/render/kernel-golden.test.ts",
    "tests/unit/render/period-three-golden-oracle.test.ts"
```

(If `kernel-golden.test.ts` is no longer the last entry, add the new entry after it with valid commas.)

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `npx vitest run tests/unit/domain/period-three-placement.test.ts tests/unit/render/period-three-golden-oracle.test.ts tests/unit/render/period-three-coarse.test.ts`
Expected: FAIL — `runs at the first scanning iteration` (evidence is `converged-cycle` or the status is unresolved), the golden-oracle cases for default-full, rabbit boundary and weak attraction (band word or multiplier differs), and both coarse cases. The other tests in these files pass (they pin behaviour that does not change).

- [ ] **Step 3: Wire the scalar kernel**

In `src/domain/orbit-triggered.ts`, replace the first import line:

```ts
import type { OrbitSample, OrbitScratch } from './orbit';
```

with:

```ts
import { classifyPeriodThreeInto } from './analytic-period-three';
import type { OrbitSample, OrbitScratch } from './orbit';
import { inPeriodThreeGate } from './period-three-gate';
```

Replace:

```ts
 * Orbit loop of the triggered kernel, from z = 0. The caller has already
 * handled the analytic fast paths. `scratch` must have power-of-two capacity
 * of at least maxPeriod + 1 (OrbitScratch guarantees it).
```

with:

```ts
 * Orbit loop of the triggered kernel, from z = 0. The caller has already
 * handled the period-1 and period-2 analytic fast paths; the period-3 one
 * runs inside the loop at the first scanning iteration (ADR 0010). `scratch`
 * must have power-of-two capacity of at least maxPeriod + 1 (OrbitScratch
 * guarantees it).
```

Replace:

```ts
    if (!fired && iteration !== due && iteration !== maxIterations) {
      continue;
    }
```

with:

```ts
    if (!fired && iteration !== due && iteration !== maxIterations) {
      continue;
    }
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

- [ ] **Step 4: Wire the two-lane row kernel**

In `src/render/triggered-rows.ts`:

(a) In the import block from `'../domain'`, replace:

```ts
  classifyAnalyticInto,
  createOrbitSample,
```

with:

```ts
  classifyAnalyticInto,
  classifyPeriodThreeInto,
  createOrbitSample,
  inPeriodThreeGate,
```

(b) In the module comment, replace:

```ts
 * classifyTriggeredOrbitInto in the same order (the analytic prologue, the
 * step, the escape test, the ring store, the watched-lag test, the full scans
 * with their argmin, and the canonical verifier call), so every result is
```

with:

```ts
 * classifyTriggeredOrbitInto in the same order (the analytic prologue, the
 * step, the escape test, the ring store, the watched-lag test, the period-3
 * closed form at the first scanning iteration, the full scans with their
 * argmin, and the canonical verifier call), so every result is
```

(c) **Lane A.** Replace everything from the line `      } else if (watchedA <= armA || itA === dueA) {` up to, but not including, the blank line that precedes `      // Lane B event.` with:

```ts
      } else if (watchedA <= armA || itA === dueA) {
        // Analytic period-3 fast path at the first scanning iteration, as in
        // classifyTriggeredOrbitInto (ADR 0010).
        let analyticA = false;
        if (itA === scanStart && inPeriodThreeGate(cA, cIm)) {
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
        if (analyticA) {
          const o = offset + xA;
          packed[o] = ATTRACTING_BASE | out.period;
          primary[o] = out.multiplierMagnitude;
          angle[o] = out.multiplierAngle;
          pendingA = true;
        } else {
          if (itA === scheduledA) {
            scheduledA = itA + intervalA;
            intervalA = Math.min(2 * intervalA, TRIGGERED_SCAN_INTERVAL_MAX);
          }
          // Full scan of lane A: the legacy lag scan of this iteration.
          const currentSlot = ((itA - 1) & mask) << 2;
          const largestPeriod = Math.min(maxPeriod, itA - 1);
          let nearestLag = 1;
          let nearestSquared = Number.POSITIVE_INFINITY;
          let accepted = false;
          for (let period = 1; period <= largestPeriod; period += 1) {
            const previousSlot = (currentSlot - (period << 2)) & ((mask << 2) | 3);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- masked slot < ring length
            const distanceRe = zaRe - ring[previousSlot]!;
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- masked slot < ring length
            const distanceIm = zaIm - ring[previousSlot + 1]!;
            const distanceSquared = distanceRe * distanceRe + distanceIm * distanceIm;
            if (distanceSquared < nearestSquared) {
              nearestSquared = distanceSquared;
              nearestLag = period;
            }
            if (distanceSquared > toleranceSquared) {
              continue;
            }
            spill[S_ZA_RE] = zaRe;
            spill[S_ZA_IM] = zaIm;
            spill[S_ZB_RE] = zbRe;
            spill[S_ZB_IM] = zbIm;
            spill[S_CA] = cA;
            spill[S_CB] = cB;
            spill[S_NEAREST] = nearestSquared;
            const verdict = verifyCycleInto(
              cA,
              cIm,
              zaRe,
              zaIm,
              period,
              itA,
              ORBIT_EVIDENCE_CODE.convergedCycle,
              out,
            );
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
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fixed-size spill
            nearestSquared = spill[S_NEAREST]!;
            if (verdict === VERIFIER_VERDICT.accepted) {
              accepted = true;
              break;
            }
          }
          const o = offset + xA;
          if (accepted) {
            packed[o] = ATTRACTING_BASE | out.period;
            primary[o] = out.multiplierMagnitude;
            angle[o] = out.multiplierAngle;
            pendingA = true;
          } else if (itA === maxIterations) {
            packed[o] = UNRESOLVED_WORD;
            primary[o] = 0;
            angle[o] = 0;
            pendingA = true;
          } else {
            watchA = nearestLag;
            dueA = Math.min(scheduledA, maxIterations);
          }
        }
      }
```

(d) **Lane B.** Replace everything from the line `      } else if (watchedB <= armB || itB === dueB) {` up to, but not including, the last three lines of the file (`    }`, `  }`, `}`) with:

```ts
      } else if (watchedB <= armB || itB === dueB) {
        let analyticB = false;
        if (itB === scanStart && inPeriodThreeGate(cB, cIm)) {
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
        if (analyticB) {
          const o = offset + xB;
          packed[o] = ATTRACTING_BASE | out.period;
          primary[o] = out.multiplierMagnitude;
          angle[o] = out.multiplierAngle;
          pendingB = true;
        } else {
          if (itB === scheduledB) {
            scheduledB = itB + intervalB;
            intervalB = Math.min(2 * intervalB, TRIGGERED_SCAN_INTERVAL_MAX);
          }
          const currentSlot = (((itB - 1) & mask) << 2) + 2;
          const largestPeriod = Math.min(maxPeriod, itB - 1);
          let nearestLag = 1;
          let nearestSquared = Number.POSITIVE_INFINITY;
          let accepted = false;
          for (let period = 1; period <= largestPeriod; period += 1) {
            const previousSlot = (currentSlot - (period << 2)) & ((mask << 2) | 3);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- masked slot < ring length
            const distanceRe = zbRe - ring[previousSlot]!;
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- masked slot < ring length
            const distanceIm = zbIm - ring[previousSlot + 1]!;
            const distanceSquared = distanceRe * distanceRe + distanceIm * distanceIm;
            if (distanceSquared < nearestSquared) {
              nearestSquared = distanceSquared;
              nearestLag = period;
            }
            if (distanceSquared > toleranceSquared) {
              continue;
            }
            spill[S_ZA_RE] = zaRe;
            spill[S_ZA_IM] = zaIm;
            spill[S_ZB_RE] = zbRe;
            spill[S_ZB_IM] = zbIm;
            spill[S_CA] = cA;
            spill[S_CB] = cB;
            spill[S_NEAREST] = nearestSquared;
            const verdict = verifyCycleInto(
              cB,
              cIm,
              zbRe,
              zbIm,
              period,
              itB,
              ORBIT_EVIDENCE_CODE.convergedCycle,
              out,
            );
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
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fixed-size spill
            nearestSquared = spill[S_NEAREST]!;
            if (verdict === VERIFIER_VERDICT.accepted) {
              accepted = true;
              break;
            }
          }
          const o = offset + xB;
          if (accepted) {
            packed[o] = ATTRACTING_BASE | out.period;
            primary[o] = out.multiplierMagnitude;
            angle[o] = out.multiplierAngle;
            pendingB = true;
          } else if (itB === maxIterations) {
            packed[o] = UNRESOLVED_WORD;
            primary[o] = 0;
            angle[o] = 0;
            pendingB = true;
          } else {
            watchB = nearestLag;
            dueB = Math.min(scheduledB, maxIterations);
          }
        }
      }
```

Run `npx prettier --write src/render/triggered-rows.ts src/domain/orbit-triggered.ts` and check `git diff --stat src/render/triggered-rows.ts` shows only these edits (the lane bodies are re-indented one level, nothing else).

- [ ] **Step 5: Run the new tests and the row/scalar parity test to verify they pass**

Run: `npx vitest run tests/unit/domain/period-three-placement.test.ts tests/unit/render/period-three-golden-oracle.test.ts tests/unit/render/period-three-coarse.test.ts tests/unit/render/triggered-rows.test.ts`
Expected: PASS (row kernel equals the scalar kernel bit for bit on all views, including the three new ones; 19,216 golden-raster pixels dd-certified).

- [ ] **Step 6: Run the whole unit suite and confirm exactly the expected failures**

Run: `npm run test:unit 2>&1 | grep -E '×|Tests '`
Expected failures, and only these:

- `orbit-scalar-parity.test.ts`: `matches the legacy reference on every differential stratum (quick)` and `(default)`, `matches the legacy reference and the independent fixtures through the scalar core`, `reuses one sample record and scratch without leaking state between points`, `keeps OrbitClassifier.classify identical to the legacy reference`;
- `orbit-oracle-adjudication.test.ts`: the three `supports every changed legacy answer …` cases and `certifies every production attracting claim or leaves it honestly unadjudicated` (`expected 12 to be 14`);
- `verifier.test.ts`: `agrees bit for bit with the inline lag-scan policy body in classifyInto`;
- `orbit.test.ts`: `detects an attracting period-three component numerically`;
- `poc/performance/src/control.test.ts`: the three `agrees on status, iterations, and evidence …` cases;
- `kernel-golden.test.ts`: `mi-easy-default-full`, `mi-hard-rabbit-boundary`, `mi-fallback-weak-attraction`.

If anything else fails, stop and report.

- [ ] **Step 7: Update the differential and oracle tests for the documented divergence**

`tests/unit/domain/orbit-scalar-parity.test.ts` — replace:

```ts
const expectLegacyParity = (production: OrbitResult, legacy: OrbitResult): void => {
  if (production.status === 'attracting-cycle' && legacy.status === 'attracting-cycle') {
```

with:

```ts
const expectLegacyParity = (production: OrbitResult, legacy: OrbitResult): void => {
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
    } else {
      expect(legacy.status).toBe('unresolved');
    }
    return;
  }
  if (production.status === 'attracting-cycle' && legacy.status === 'attracting-cycle') {
```

and, in the same file, replace the first occurrence of:

```ts
const PROFILES: readonly
```

with:

```ts
/**
 * Largest |lambda| difference allowed between the closed-form period-3
 * multiplier and the legacy orbit product. The orbit product is the
 * inaccurate side (about 1e-8 on the golden raster, 2.2e-6 in the H spike);
 * the dd adjudication pins the closed form itself to 1e-12.
 */
const LEGACY_PERIOD_THREE_MAGNITUDE_TOLERANCE = 1e-5;

const PROFILES: readonly
```

`tests/unit/domain/orbit-oracle-adjudication.test.ts` — five edits.

Replace:

```ts
import { classifyDDMinimal, type DDOracleVerdict } from './dd-oracle';
```

with:

```ts
import {
  classifyDDMinimal,
  ddPeriodThreeCycle,
  type DDOracleCycle,
  type DDOracleVerdict,
} from './dd-oracle';
```

Replace:

```ts
interface Adjudication {
  changed: number;
  periodReductions: string[];
```

with:

```ts
interface Adjudication {
  changed: number;
  periodReductions: string[];
  analyticPeriodThree: number;
  unresolvedToPeriodThree: number;
```

Replace:

```ts
        changed: 0,
        periodReductions: [],
        falseAttracting: 0,
```

with:

```ts
        changed: 0,
        periodReductions: [],
        analyticPeriodThree: 0,
        unresolvedToPeriodThree: 0,
        falseAttracting: 0,
```

Find the block that starts `        if (\n          production.status === legacy.status &&` (the "unchanged answer, continue" check) and insert directly **before** it:

```ts
        if (
          production.status === 'attracting-cycle' &&
          production.evidence[0] === 'analytic-period-3-component'
        ) {
          // ADR 0010: the closed-form period-3 path. Every such answer,
          // changed or not, is checked against the dd period-3 cycle, which
          // uses no closed form and needs no orbit convergence.
          adjudication.analyticPeriodThree += 1;
          if (legacy.status === 'unresolved') {
            adjudication.unresolvedToPeriodThree += 1;
          }
          const check = ddPeriodThreeCycle(point.re, point.im);
          if (
            check.status !== 'attracting-cycle' ||
            check.cycle.primitive !== 3 ||
            multiplierDistance(production, check.cycle) > ANALYTIC_PERIOD_THREE_TOLERANCE
          ) {
            adjudication.unsupported.push(
              `${index}: analytic period 3 not dd-certified (dd ${check.status})`,
            );
          }
          continue;
        }

```

Replace:

```ts
      // Unresolved-rate delta vs legacy, quantified: zero on this grid
      // (every disagreement is a period reduction, no status flips).
      expect(adjudication.unresolvedDelta).toBe(0);
```

with:

```ts
      // Unresolved-rate delta vs legacy, quantified: the only status flips
      // on this grid are unresolved -> analytic period 3 (ADR 0010), each
      // dd-certified above.
      expect(adjudication.unresolvedDelta).toBe(-adjudication.unresolvedToPeriodThree);
```

Replace:

```ts
      const expectedReductions: Record<string, number> = { quick: 6, balanced: 13, detailed: 17 };
      expect(adjudication.periodReductions.length).toBe(expectedReductions[profile.label]);
      expect(adjudication.periodReductions.length).toBe(adjudication.changed);
```

with:

```ts
      // Since ADR 0010 the period-3 reductions (6 -> 3, 12 -> 3) are answered
      // by the closed form and adjudicated above; the rest are period 4 and 5.
      const expectedReductions: Record<string, number> = { quick: 4, balanced: 7, detailed: 9 };
      expect(adjudication.periodReductions.length).toBe(expectedReductions[profile.label]);
      expect(adjudication.periodReductions.length).toBe(adjudication.changed);
      // ADR 0010: 39 grid points take the analytic period-3 path under every
      // profile (the closed form ignores the budget); of those, the legacy
      // scan left this many unresolved.
      expect(adjudication.analyticPeriodThree).toBe(39);
      const expectedUnresolvedToPeriodThree: Record<string, number> = {
        quick: 16,
        balanced: 10,
        detailed: 8,
      };
      expect(adjudication.unresolvedToPeriodThree).toBe(
        expectedUnresolvedToPeriodThree[profile.label],
      );
```

Replace `    expect(missedDetections).toBe(14);` with:

```ts
    // Two budget misses of the lag scan are answered by the closed form
    // since ADR 0010.
    expect(missedDetections).toBe(12);
```

And replace:

```ts
/** Declared binary64 multiplier tolerance (fixtures/orbits.v1.json policy). */
```

with:

```ts
/**
 * Complex distance allowed between the closed-form period-3 multiplier and
 * the dd-certified one. The error budget (docs/PERFORMANCE-MATHEMATICS.md
 * section 11) bounds the closed form by about 5e-14; measured worst 3e-15 on
 * the golden raster.
 */
const ANALYTIC_PERIOD_THREE_TOLERANCE = 1e-12;

/** |lambda_production - lambda_dd| from magnitude and angle. */
const multiplierDistance = (
  production: { readonly multiplierMagnitude: number; readonly multiplierAngle: number },
  cycle: DDOracleCycle,
): number =>
  Math.hypot(
    production.multiplierMagnitude * Math.cos(production.multiplierAngle) -
      cycle.magnitude * Math.cos(cycle.angle),
    production.multiplierMagnitude * Math.sin(production.multiplierAngle) -
      cycle.magnitude * Math.sin(cycle.angle),
  );

/** Declared binary64 multiplier tolerance (fixtures/orbits.v1.json policy). */
```

`tests/unit/domain/verifier.test.ts` — inside `it('agrees bit for bit with the inline lag-scan policy body in classifyInto', …)`, replace:

```ts
      classifyInto(point.re, point.im, options, scratch, sample);
      if (sample.status !== 2) {
        continue;
      }
```

with:

```ts
      classifyInto(point.re, point.im, options, scratch, sample);
      // Only lag-scan acceptances replay through the verifier; the analytic
      // period-3 path (ADR 0010) has no cycle start to replay.
      if (sample.status !== 2 || sample.evidence !== ORBIT_EVIDENCE_CODE.convergedCycle) {
        continue;
      }
```

`tests/unit/domain/orbit.test.ts` — replace:

```ts
  it('detects an attracting period-three component numerically', () => {
```

with:

```ts
  it('recognizes the period-three rabbit centre analytically', () => {
```

and, in that test, replace:

```ts
      expect(result.evidence).toEqual(['converged-cycle']);
```

with:

```ts
      expect(result.evidence).toEqual(['analytic-period-3-component']);
      expect(result.evidenceSource).toBe('analytic');
      expect(result.iterations).toBe(0);
```

`poc/performance/src/control.test.ts` — replace:

```ts
      const classifier = new OrbitClassifier(profile.options);
      let reduced = 0;
```

with:

```ts
      const classifier = new OrbitClassifier(profile.options);
      let reduced = 0;
      let analyticPeriodThree = 0;
```

then replace:

```ts
        const productionFields = comparableFields(production);
        const controlFields = comparableFields(control);
        expect(controlFields['status']).toBe(productionFields['status']);
```

with:

```ts
        // ADR 0010: the analytic period-3 path answers instead of the lag
        // scan (closed-form multiplier, iterations 0). The legacy control
        // found the same primitive period, possibly as a multiple, or ran
        // out of budget; every such pixel is checked against the dd period-3
        // cycle in tests/unit/domain/orbit-oracle-adjudication.test.ts.
        if (
          production.status === 'attracting-cycle' &&
          production.evidence[0] === 'analytic-period-3-component'
        ) {
          expect(production.period).toBe(3);
          if (control.status === 'attracting') {
            expect(control.period % 3).toBe(0);
          } else {
            expect(control.status).toBe('unresolved');
          }
          analyticPeriodThree += 1;
          continue;
        }
        const productionFields = comparableFields(production);
        const controlFields = comparableFields(control);
        expect(controlFields['status']).toBe(productionFields['status']);
```

and replace the first occurrence of:

```ts
      expect(reduced).toBeGreaterThan(0);
    });
```

with:

```ts
      expect(reduced).toBeGreaterThan(0);
      // The sample's three rabbit-stratum points take the analytic path.
      expect(analyticPeriodThree).toBe(3);
    });
```

- [ ] **Step 8: Regenerate the golden kernel fixture**

In `tools/generate_kernel_golden.ts`, replace:

```ts
    kernel: 'watched-lag triggered scan (ADR 0006)',
```

with:

```ts
    kernel: 'watched-lag triggered scan (ADR 0006) with the analytic period-3 path (ADR 0010)',
```

Run:

```bash
npm run fixtures:kernel-golden
npm run fixtures:kernel-golden -- --check && echo golden-ok
git diff --stat fixtures/kernel-golden.v1.json
git diff fixtures/kernel-golden.v1.json | grep '^[-+] '
```

Expected: `golden-ok`; the diff changes `kernel`, `generatedFrom` and exactly three case hashes:

```text
+    "mi-easy-default-full": "7c80c83adfa36fcea06df5d3061602627222fba8c2326331e0c901d8a1a868da",
+    "mi-hard-rabbit-boundary": "100815b8269e92e193503fe27ac66517d55c6a939f9ff61ad33d26a8e1d198a3",
+    "mi-fallback-weak-attraction": "25246db865fa218504aa600d75f410b3c30eedf61e7a4c4dfa829131dc41cc2d",
```

If a different case changes, or a hash differs, stop and report (do not commit).

- [ ] **Step 9: Document the decision**

Create `docs/decisions/0010-analytic-period-three.md`:

```markdown
# ADR 0010: Analytic period-3 classification

- Status: Accepted
- Date: 2026-10-16

## Context

The workstream H spike ([record](../verification/WORKSTREAM-H-SPIKE-2026-10-16.md))
found that the multipliers of the two period-3 cycles have the closed form
λ = 4(c+2) ± 4i·c·√(4c+7). In Node, period-3 and period-4 pixels took 30.7% of
summed corpus time; the closed form answers a period-3 pixel in about 60 ns
against 1–2 µs for the orbit path, and it decides cycles too weakly
attracting for any iteration budget. Owner decision (2026-10-16): adopt
period 3 now and period 4 after a rigorous root-error bound.

## Decision

1. A third closed-form fast path, `classifyPeriodThreeInto`
   (`src/domain/analytic-period-three.ts`, revision `src-analytic-p3-1.0.0`).
   It keeps the root of smaller modulus and accepts iff
   |λ̂| + 2⁻⁴⁶·(|Re c + 2| + |Im c| + 1) < 1 − attractMargin. The exact-period
   argument and the binary64 error budget are in
   [PERFORMANCE-MATHEMATICS §11](../PERFORMANCE-MATHEMATICS.md#11-period-3-closed-form-workstream-h-adr-0010);
   the exact identities are checked in
   `proof/IntMProof/PeriodThreeMultiplier.lean`.
2. Acceptance is the closed-form criterion the period-1 and period-2 paths
   already use (plan §4, bucket 1–2: a conservative binary64 criterion), not
   `verifyCycleInto`: there is no cycle point to hand to the verifier. We read
   `MI-PERF-004`'s "common declared acceptance procedure" as the verifier
   policy's attraction margin applied to an exact multiplier, with a declared
   binary64 allowance. The plan §4 table lists periods 3–4 as "checkpoint;
   optional algebraic candidate" under the common verifier; this ADR records
   the deviation for period 3. `VERIFIER_REVISION` does not change.
3. Placement: both kernels (`classifyTriggeredOrbitInto` and
   `TriggeredRowKernel`) try it once per pixel at the first scanning
   iteration, `max(cycleWarmup, 2)` = 24, before that iteration's scan.
   Pixels that escape earlier never reach it. The record depends on c alone,
   so placement changes no bit. With `maxIterations` below the first
   scanning iteration it never runs; no production budget is that small.
4. Gate: padded bounding boxes of the three period-3 components
   (`src/domain/period-three-gate.ts`), tested by a straight-line function,
   hull first. The gate must contain every accepted parameter (checked on a
   dense grid and along every box edge), so it changes speed, not answers.
5. Evidence: flag `analytic-period-3-component`, code 5, evidence source
   `analytic` (a closed form, like periods 1 and 2; `algebraic` stays
   reserved for algebraic candidates handed to the verifier). The inspector
   shows "Analytic Period 3 Component" and "Analytic closed form". Iterations
   are 0, as for the other closed forms.
6. Multiplier: period-3 pixels report the closed-form λ. It agrees with a dd
   reference to 3·10⁻¹⁵ on the golden raster, against up to 1.02·10⁻⁸ there
   (2.2·10⁻⁶ in the spike) for the orbit product.
7. Period 4 is out of scope until its root-error bound is rigorous.

## Consequences

- Answer change (plan §3: a changed answer ships only when the oracle
  supports it). On the golden raster (160×100) 1,074 pixels move from
  unresolved to attracting period 3 (26 in the default view, 620 at the rabbit
  boundary, 428 in the weak-attraction view), and 18,142 period-3 pixels
  report the closed-form multiplier instead of the orbit product. All 19,216
  are checked against the independent dd period-3 cycle
  (`tests/unit/render/period-three-golden-oracle.test.ts`).
- The golden kernel fixture is regenerated in the same commit; three cases
  change (`mi-easy-default-full`, `mi-hard-rabbit-boundary`,
  `mi-fallback-weak-attraction`).
- Colour: the multiplier change alone alters no colorized byte on the golden
  raster in any view; only the status changes are visible. No colorized-buffer
  goldens exist yet (PHASE2-TODO item 5), so none are regenerated; item 5
  generates its goldens on top of this change.
- The differential tests against the frozen legacy port and the PoC control
  kernel gain one documented divergence class, analytic period 3, each case
  adjudicated in `tests/unit/domain/orbit-oracle-adjudication.test.ts`.
- A loop over the box data inside the gate cost about 10% on the far
  exterior in Node (the gate is inlined into the row kernel's outer loop); the
  straight-line gate does not.
- The browser release run in both browsers is deferred to the owner's screen
  session.
```

In `docs/PERFORMANCE-MATHEMATICS.md`, insert this subsection directly before `### 11.6 What is proved and what is not`:

```markdown
### 11.5 Placement and gate

Both kernels, [orbit-triggered.ts](../src/domain/orbit-triggered.ts) and the
two-lane [triggered-rows.ts](../src/render/triggered-rows.ts), try the closed
form once per pixel at the first scanning iteration, `max(cycleWarmup, 2)` =
24, before that iteration's full scan. A pixel that escapes earlier, inside
the gate or not, never reaches it (c = −0.2 + 0.66i escapes at iteration 24
and stays escaped: the escape test comes first). The record depends on c
alone, so it is bit-identical to a test before the loop, in both kernels and
in both passes. With `maxIterations` below the first scanning iteration the
test never runs and the pixel stays unresolved, as the orbit path would leave
it; no production budget is that small.

The gate ([period-three-gate.ts](../src/domain/period-three-gate.ts)) holds
the padded bounding boxes of the three components, traced from the inverse
map in the spike. It must contain every accepted parameter, which a unit test
checks on a 1200 × 1200 grid (11,602 accepted points, all inside) and just
outside every box edge: it is measured, not proved. The gate test is written
as straight-line comparisons because the kernels inline it into their outer
loop, where a loop over the box array slowed the far-exterior stable pass by
about 10% in Node ([ADR 0010](decisions/0010-analytic-period-three.md)).
```

In the same file make three more edits.

In the §8 claim taxonomy table, in the row that begins `| Closed form evaluated in binary64`, replace the text `The analytic fast paths in src/domain/orbit.ts (previously mirrored in the checkpoint module, removed 2026-10-16, ADR 0007); verifier-gated since PR 3 (attraction margin, fall-through to the orbit walk)` with `The analytic fast paths in src/domain/orbit.ts (previously mirrored in the checkpoint module, removed 2026-10-16, ADR 0007); verifier-gated since PR 3 (attraction margin, fall-through to the orbit walk). The period-3 closed form (§11, src/domain/analytic-period-three.ts, ADR 0010) adds a derived binary64 rounding allowance to the same margin`.

In the row that begins `| Experimental`, replace `Workstream H (not started)` with `Workstream H period 4 (not started; period 3 shipped, §11)`.

In §9, replace:

```markdown
- Candidate generation is not proof (plan invariant 1): checkpoints, catalogs,
  charts, algebra, and Newton only propose; the verifier decides.
```

with:

```markdown
- Candidate generation is not proof (plan invariant 1): checkpoints, catalogs,
  charts, algebra, and Newton only propose; the verifier decides. The closed
  forms for periods 1, 2 and 3 are the plan's bucket 1–2 exception: they
  accept directly under the same attraction margin, with a derived binary64
  allowance for period 3 (§11, ADR 0010).
```

In §10, the sentence spans a line break. Replace:

```markdown
The existing period-one and period-two analytic tests are the current
closed-form hot paths.
```

with:

```markdown
The period-one, period-two and period-three (§11) analytic tests are the
current closed-form hot paths.
```

- [ ] **Step 10: Update the classifier's documentation comments**

In `src/domain/orbit.ts`, replace:

```ts
 * (record untouched) otherwise, including margin-adjacent points, which fall
 * through to the orbit loop.
 */
```

with:

```ts
 * (record untouched) otherwise, including margin-adjacent points, which fall
 * through to the orbit loop. The period-3 closed form
 * (src/domain/analytic-period-three.ts) is not tried here: it runs inside the
 * orbit loop at the first scanning iteration, so pixels that escape early
 * never pay for it (ADR 0010).
 */
```

and replace:

```ts
 *    With the default 1e-10 the numeric bounds equal the legacy ones.
 *
```

with:

```ts
 *    With the default 1e-10 the numeric bounds equal the legacy ones.
 * 6. Analytic period 3 (ADR 0010). At the first scanning iteration the
 *    kernels try the period-3 closed form (src/domain/analytic-period-three.ts)
 *    inside padded component boxes. It accepts with iterations 0 and the
 *    closed-form multiplier, so pixels the legacy scan left unresolved become
 *    attracting period 3, and period-3 pixels carry the closed-form multiplier
 *    instead of the orbit product. Every such answer is checked against the
 *    dd period-3 cycle in tests/unit/domain/orbit-oracle-adjudication.test.ts.
 *
```

- [ ] **Step 11: Repository gates**

Run:

```bash
npx prettier --write docs/PERFORMANCE-MATHEMATICS.md docs/decisions/0010-analytic-period-three.md tests poc/performance/src/control.test.ts src tools/generate_kernel_golden.ts tsconfig.app.json
npm run check
npm run fixtures:kernel-golden -- --check && echo golden-ok
npx playwright test
```

Expected: `npm run check` passes (unit suite: no failures); `golden-ok`; Playwright passes.

- [ ] **Step 12: Commit (one commit for the whole answer change)**

```bash
git add src/domain/orbit-triggered.ts src/render/triggered-rows.ts src/domain/orbit.ts \
  tests/unit/domain/period-three-placement.test.ts tests/unit/render/period-three-golden-oracle.test.ts \
  tests/unit/render/period-three-coarse.test.ts tests/unit/render/triggered-rows.test.ts \
  tests/unit/domain/orbit-scalar-parity.test.ts tests/unit/domain/orbit-oracle-adjudication.test.ts \
  tests/unit/domain/verifier.test.ts tests/unit/domain/orbit.test.ts poc/performance/src/control.test.ts \
  tsconfig.app.json tools/generate_kernel_golden.ts fixtures/kernel-golden.v1.json \
  docs/decisions/0010-analytic-period-three.md docs/PERFORMANCE-MATHEMATICS.md
git commit -m "$(cat <<'EOF'
Kernels: analytic period-3 fast path at the first scan (ADR 0010)

Both kernels try the period-3 closed form once per pixel at iteration 24,
behind the component-box gate. 1,074 golden-raster pixels move from
unresolved to attracting period 3 and 18,142 report the closed-form
multiplier; all 19,216 are dd-certified in period-three-golden-oracle.test.ts.
The golden kernel fixture is regenerated in this commit (ADR 0007).

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Independent 80-digit fixtures for period-3 and period-6 points

**Files:**

- Modify: `tools/generate_orbit_fixtures.py` (`CASES`)
- Modify: `fixtures/orbits.v1.json` (regenerated)
- Modify: `fixtures/README.md` (coverage list)

**Interfaces:**

- Consumes: the classifier through the existing `tests/unit/domain/orbit-fixtures.test.ts` and `orbit-scalar-parity.test.ts`, which iterate every fixture.
- Produces: four new fixtures (`period-three-weak-attraction-centre`, `period-three-airplane-near-cusp`, `period-three-rabbit-rim`, `period-six-rabbit-satellite`), 10 in total.

- [ ] **Step 1: Add the cases to the generator**

In `tools/generate_orbit_fixtures.py`, in `CASES`, insert directly before the entry whose `"id"` is `"parabolic-boundary-minus-three-quarters"`:

```python
    {
        "id": "period-three-weak-attraction-centre",
        "parameter": {"re": "-0.1205", "im": "0.8268"},
        "expectedStatus": "attracting-cycle",
        "knownPeriod": 3,
        "maxIterations": 4096,
    },
    {
        "id": "period-three-airplane-near-cusp",
        "parameter": {"re": "-1.750001", "im": "0"},
        "expectedStatus": "attracting-cycle",
        "knownPeriod": 3,
        "maxIterations": 32768,
    },
    {
        "id": "period-three-rabbit-rim",
        "parameter": {"re": "-0.046545032326946937", "im": "0.69276818807760281"},
        "expectedStatus": "attracting-cycle",
        "knownPeriod": 3,
        "maxIterations": 65536,
    },
    {
        "id": "period-six-rabbit-satellite",
        "parameter": {"re": "-0.1155037469844854", "im": "0.8402560718860035"},
        "expectedStatus": "attracting-cycle",
        "knownPeriod": 6,
        "maxIterations": 16384,
    },
```

- [ ] **Step 2: Verify the committed fixture is now stale**

Run: `npm run fixtures:check`
Expected: FAIL (`ValueError: fixtures/orbits.v1.json does not match independently regenerated fixtures`).

- [ ] **Step 3: Regenerate**

Run:

```bash
python3 tools/generate_orbit_fixtures.py > fixtures/orbits.v1.json
npx prettier --write fixtures/orbits.v1.json
npm run fixtures:check
python3 -c "import json; [print(f['id'], f['expected'].get('period'), f['expected'].get('settledAfterIterations'), f['expected'].get('multiplier', {}).get('magnitude', '')[:22]) for f in json.load(open('fixtures/orbits.v1.json'))['fixtures']]"
```

Expected: `validated 10 high-precision orbit fixtures at 80 decimal digits`, then these lines (among the old ones):

```text
period-three-weak-attraction-centre 3 1486 0.87559372475174538293
period-three-airplane-near-cusp 3 11923 0.98599599199999999999
period-three-rabbit-rim 3 19672 0.98999999999999998551
period-six-rabbit-satellite 6 3547 0.90149900969762495019
```

- [ ] **Step 4: Run the fixture consumers**

Run: `npx vitest run tests/unit/domain/orbit-fixtures.test.ts tests/unit/domain/orbit-scalar-parity.test.ts`
Expected: PASS. The three period-3 fixtures take the analytic path (closed form within 1e-7 of the 80-digit multiplier); the period-6 satellite stays on the orbit path and is found as period 6.

- [ ] **Step 5: Document coverage**

In `fixtures/README.md`, replace:

```markdown
- ordinary off-center period-three and period-four attracting points; and
```

with:

```markdown
- ordinary off-center period-three and period-four attracting points;
- period-three points near the airplane cusp, near the rabbit's boundary
  (|λ| = 0.99) and at the weak-attraction corpus centre, which the analytic
  period-3 path answers (ADR 0010), and a period-six point of the rabbit's
  satellite inside that path's gate box, which it must not answer; and
```

- [ ] **Step 6: Repository gates**

Run: `npm run check && npm run fixtures:kernel-golden -- --check && npx playwright test`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add tools/generate_orbit_fixtures.py fixtures/orbits.v1.json fixtures/README.md
git commit -m "$(cat <<'EOF'
Fixtures: 80-digit references for period-3 points and a period-6 satellite

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: The inspector reports how a period-3 pixel was classified (E2E)

**Files:**

- Test: `tests/e2e/explorer.spec.ts` (one new test)

**Interfaces:**

- Consumes: the catalog marker `Inspect Douady rabbit, period 3`, the inspector's `.inspector__classification`, `.inspector__evidence` and the `Evidence source` fact (`src/ui/application.ts`, unchanged), and Task 7's kernel behaviour.

- [ ] **Step 1: Write the test**

In `tests/e2e/explorer.spec.ts`, find the test `test('catalog markers are keyboard-selectable and populate evidence', async ({ page }) => {` and insert this new test directly after that test's closing `});`:

```ts

  test('the Douady rabbit marker reports the analytic period-3 closed form', async ({ page }) => {
    await page.goto('/');

    const rabbit = page.getByRole('button', { name: 'Inspect Douady rabbit, period 3' });
    await expect(rabbit).toBeVisible({ timeout: 20_000 });
    await rabbit.focus();
    await rabbit.press('Enter');

    await expect(page.getByRole('heading', { name: 'Douady rabbit' })).toBeVisible();
    const pointEvidence = page.getByRole('region', { name: 'Point evidence' });
    await expect(pointEvidence.locator('.inspector__classification')).toHaveText(
      'Attracting cycle',
      { timeout: 10_000 },
    );
    // ADR 0010: the closed form answers, and the inspector says so.
    await expect(pointEvidence.locator('.inspector__evidence')).toHaveText(
      'Analytic Period 3 Component',
    );
    await expect(
      pointEvidence.locator('.facts').getByText('Analytic closed form', { exact: true }),
    ).toBeVisible();
  });
```

- [ ] **Step 2: Run it**

Run: `ss -ltnp | grep 4174; npx playwright test tests/e2e/explorer.spec.ts -g "Douady rabbit marker"`
Expected: no other server on 4174 (or stop, see Global Constraints); 2 passed (chromium, firefox).

To see it fail first, temporarily change the expected evidence text to `'Converged Cycle'`, run, confirm the failure message shows `Analytic Period 3 Component`, and restore the text.

- [ ] **Step 3: Repository gates**

Run: `npx prettier --write tests/e2e/explorer.spec.ts && npm run check && npm run fixtures:kernel-golden -- --check && npx playwright test`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/explorer.spec.ts
git commit -m "$(cat <<'EOF'
E2E: the rabbit marker reports the analytic period-3 evidence

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Record the oracle adjudication of every changed pixel

**Files:**

- Create: `tools/adjudicate_period_three.ts`
- Modify: `package.json` (script `evidence:period-three`), `tsconfig.node.json` (include the tool)
- Create: `evidence/phase-2/<date>-<sha>-period-three-adjudication/` with `environment.json`, `raw-observations.json`, `semantic-comparison.json`, `summary.md`, `manifest.sha256`

Shell variables do not persist between separate commands: every command block below sets the variables it uses. `<date>` is today's date (`date +%F`); `<sha>` is the short SHA of the **Task 7 commit** (the build whose answers are adjudicated): `git log --format=%h --grep='^Kernels: analytic period-3 fast path' -1`.

**Interfaces:**

- Consumes: `PixelDump`, `PixelDumpCase` (Task 6); `classifyPeriodThreeInto` (Task 3); `ddPeriodThreeCycle` (Task 5); `colorizeFrame` (`src/render/colorize.ts`); `SemanticFrame` (`src/render/renderer.ts`); `PACK_PERIOD_BITS`, `PACK_PERIOD_MAX` (`src/render/packed-semantic.ts`).
- Produces: CLI `npm run evidence:period-three -- <before.json> <after.json> <out-dir>`; exit 1 if any changed pixel is unsupported.

- [ ] **Step 1: Write the tool**

Create `tools/adjudicate_period_three.ts`:

```ts
/**
 * Oracle adjudication of every pixel the analytic period-3 path changed
 * (ADR 0007 intended-change rule; ADR 0010). Compares two pixel dumps of the
 * golden raster (tools/kernel_pixel_dump.ts), before and after the change,
 * and checks every changed pixel against the dd period-3 cycle
 * (tests/unit/domain/dd-oracle.ts ddPeriodThreeCycle: dd Newton and dd
 * certification, no closed form).
 *
 * Usage: npm run evidence:period-three -- <before.json> <after.json> <out-dir>
 * Writes <out-dir>/raw-observations.json and <out-dir>/semantic-comparison.json
 * and prints the summary table. Exits 1 if any changed pixel is unsupported.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  classifyPeriodThreeInto,
  createOrbitSample,
  createViewportTransform,
  type OrbitSample,
} from '../src/domain';
import { prepareRealColumns, preparedRowImaginary } from '../src/render/classify-rows';
import { colorizeFrame } from '../src/render/colorize';
import type { SemanticFrame } from '../src/render/renderer';
import { PACK_PERIOD_BITS, PACK_PERIOD_MAX } from '../src/render/packed-semantic';
import { ddPeriodThreeCycle } from '../tests/unit/domain/dd-oracle';
import { loadCorpusCases } from './benchmark/judge/corpus';
import type { PixelDump, PixelDumpCase } from './kernel_pixel_dump';

/** Complex distance allowed between the analytic and the dd multiplier. */
export const ADJUDICATION_TOLERANCE = 1e-12;

const UNRESOLVED_WORD = 3 << PACK_PERIOD_BITS;
const ATTRACTING_P3_WORD = (2 << PACK_PERIOD_BITS) | 3;
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
  readonly supported: boolean;
}

/**
 * Supported: the new answer is exactly the analytic period-3 record at c,
 * and the dd period-3 cycle certifies period 3 with a multiplier within
 * ADJUDICATION_TOLERANCE of it.
 */
const adjudicate = (
  cRe: number,
  cIm: number,
  before: Pixel,
  after: Pixel,
  sample: OrbitSample,
): Verdict => {
  const matchesAnalytic =
    classifyPeriodThreeInto(cRe, cIm, sample) &&
    after.word === ATTRACTING_P3_WORD &&
    Object.is(sample.multiplierMagnitude, after.magnitude) &&
    Object.is(sample.multiplierAngle, after.angle);
  const oracle = ddPeriodThreeCycle(cRe, cIm);
  if (oracle.status !== 'attracting-cycle' || oracle.cycle.primitive !== 3) {
    return { analyticError: null, beforeError: null, supported: false };
  }
  const { magnitude, angle } = oracle.cycle;
  const analyticError = distance(after.magnitude, after.angle, magnitude, angle);
  const beforeError =
    before.word === ATTRACTING_P3_WORD
      ? distance(before.magnitude, before.angle, magnitude, angle)
      : null;
  return {
    analyticError,
    beforeError,
    supported: matchesAnalytic && analyticError <= ADJUDICATION_TOLERANCE,
  };
};

type Row = [number, number, number, number, number | null, number | null];

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

/** The tables summary.md quotes, from semantic-comparison.json. */
const printSummary = (comparison: {
  readonly transitionsByCase: Record<string, Record<string, number>>;
  readonly colorChangesByCase: Record<string, ReturnType<typeof colorChanges>>;
  readonly changedPixels: number;
  readonly unsupportedPixels: number;
  readonly maxAnalyticError: number;
  readonly maxBeforeError: number;
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
    `\nchanged ${String(comparison.changedPixels)}, unsupported ${String(comparison.unsupportedPixels)}, ` +
      `max analytic error ${comparison.maxAnalyticError.toExponential(2)}, ` +
      `max orbit-product error before ${comparison.maxBeforeError.toExponential(2)}\n`,
  );
};

const parseArguments = (): { beforePath: string; afterPath: string; outDir: string } => {
  const [beforePath, afterPath, outDir] = process.argv.slice(2);
  if (beforePath === undefined || afterPath === undefined || outDir === undefined) {
    process.stderr.write(
      'usage: npm run evidence:period-three -- <before.json> <after.json> <out-dir>\n',
    );
    process.exit(2);
  }
  return { beforePath, afterPath, outDir };
};

const main = (): void => {
  const { beforePath, afterPath, outDir } = parseArguments();
  const before = JSON.parse(readFileSync(path.resolve(beforePath), 'utf8')) as PixelDump;
  const after = JSON.parse(readFileSync(path.resolve(afterPath), 'utf8')) as PixelDump;
  const { width, height } = after.raster;
  const sample = createOrbitSample();
  const rows: Record<string, Row[]> = {};
  const transitions: Record<string, Record<string, number>> = {};
  const colors: Record<string, ReturnType<typeof colorChanges>> = {};
  const unsupported: string[] = [];
  let changed = 0;
  let maxAnalyticError = 0;
  let maxBeforeError = 0;

  for (const corpusCase of loadCorpusCases()) {
    const beforeCase = before.cases[corpusCase.id];
    const afterCase = after.cases[corpusCase.id];
    if (beforeCase === undefined || afterCase === undefined) {
      throw new Error(`dump lacks ${corpusCase.id}`);
    }
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
        if (samePixel(old, now)) continue;
        changed += 1;
        const transition = `${describeWord(old.word)} -> ${describeWord(now.word)}`;
        tally[transition] = (tally[transition] ?? 0) + 1;
        const verdict = adjudicate(columns[x] ?? Number.NaN, cIm, old, now, sample);
        if (!verdict.supported) unsupported.push(`${corpusCase.id} (${String(x)}, ${String(y)})`);
        maxAnalyticError = Math.max(maxAnalyticError, verdict.analyticError ?? 0);
        maxBeforeError = Math.max(maxBeforeError, verdict.beforeError ?? 0);
        caseRows.push([x, y, old.word, now.word, verdict.analyticError, verdict.beforeError]);
      }
    }
    transitions[corpusCase.id] = tally;
    colors[corpusCase.id] = colorChanges(before, after, beforeCase, afterCase);
    if (caseRows.length > 0) rows[corpusCase.id] = caseRows;
  }

  const raw = {
    schemaVersion: 1,
    description:
      'Every pixel whose stable-pass output changed at the golden raster (ADR 0010), with its dd adjudication. c is the golden-raster pixel centre of (x, y) for the corpus viewport (createViewportTransform, prepareRealColumns). Aggregates in semantic-comparison.json and summary.md are derived views.',
    raster: after.raster,
    beforeCommit: before.commit,
    afterCommit: after.commit,
    fields: ['x', 'y', 'beforeWord', 'afterWord', 'analyticError', 'beforeError'],
    fieldNotes: {
      beforeWord: 'packed status/period word before (poc-packed-1.0.0)',
      afterWord: 'packed status/period word after',
      analyticError: '|lambda_after - lambda_dd|; null when dd did not certify period 3',
      beforeError: '|lambda_before - lambda_dd| when the pixel was already period 3, else null',
    },
    statusWords: {
      [String(UNRESOLVED_WORD)]: 'unresolved',
      [String(ATTRACTING_P3_WORD)]: 'attracting-p3',
    },
    unsupported,
    cases: rows,
  };
  const comparison = {
    schemaVersion: 1,
    description:
      'Analytic period-3 path (ADR 0010): every pixel whose stable-pass output changed at the golden raster, adjudicated against the dd period-3 cycle',
    raster: after.raster,
    beforeCommit: before.commit,
    afterCommit: after.commit,
    tolerance: ADJUDICATION_TOLERANCE,
    changedPixels: changed,
    unsupportedPixels: unsupported.length,
    transitionsByCase: transitions,
    colorChangesByCase: colors,
    maxAnalyticError,
    maxBeforeError,
  };
  writeFileSync(path.join(outDir, 'raw-observations.json'), `${JSON.stringify(raw, null, 2)}\n`);
  writeFileSync(
    path.join(outDir, 'semantic-comparison.json'),
    `${JSON.stringify(comparison, null, 2)}\n`,
  );
  printSummary(comparison);
  if (unsupported.length > 0) process.exit(1);
};

main();
```

In `package.json`, add after the `"fixtures:pixel-dump"` script (Task 6; fix the comma):

```json
    "evidence:period-three": "vite build --ssr tools/adjudicate_period_three.ts --outDir .evidence-build/period-three --emptyOutDir --logLevel warn && node .evidence-build/period-three/adjudicate_period_three.js"
```

In `tsconfig.node.json`, add `"tools/adjudicate_period_three.ts"` to the `include` array directly after `"tools/kernel_pixel_dump.ts",`.

Run: `npx prettier --write tools/adjudicate_period_three.ts package.json tsconfig.node.json && npm run lint && npm run typecheck`
Expected: both pass.

- [ ] **Step 2: Produce the before and after dumps**

```bash
BASE=$(git log --format=%h --grep='^Tools: kernel pixel dump and fallback-overhead bench' -1)
echo "baseline $BASE"
git worktree add .worktrees/h3-baseline "$BASE"
ln -s "$PWD/node_modules" .worktrees/h3-baseline/node_modules
mkdir -p .evidence-build/h3
(cd .worktrees/h3-baseline && npm run fixtures:pixel-dump -- ../../.evidence-build/h3/before.json)
npm run fixtures:pixel-dump -- .evidence-build/h3/after.json
git worktree remove --force .worktrees/h3-baseline
```

Expected: `baseline <sha>` (non-empty), two dump files of about 7 MB each, the worktree removed.

- [ ] **Step 3: Run the adjudication into the evidence directory**

```bash
SHA=$(git log --format=%h --grep='^Kernels: analytic period-3 fast path' -1)
DIR="evidence/phase-2/$(date +%F)-$SHA-period-three-adjudication"
mkdir -p "$DIR"
npm run evidence:period-three -- .evidence-build/h3/before.json .evidence-build/h3/after.json "$DIR" | tee .evidence-build/h3/adjudication.txt
```

Expected output (deterministic; if any number differs, stop and report instead of editing):

```text
| Case | Transition | Pixels |
| --- | --- | ---: |
| mi-easy-default-full | unresolved -> attracting-p3 | 26 |
| mi-easy-default-full | attracting-p3 -> attracting-p3 | 70 |
| mi-hard-rabbit-boundary | unresolved -> attracting-p3 | 620 |
| mi-hard-rabbit-boundary | attracting-p3 -> attracting-p3 | 2500 |
| mi-fallback-weak-attraction | unresolved -> attracting-p3 | 428 |
| mi-fallback-weak-attraction | attracting-p3 -> attracting-p3 | 15572 |

| Case | View | Colour changed: status | Colour changed: multiplier only |
| --- | --- | ---: | ---: |
| mi-easy-default-full | stability | 26 | 0 |
| mi-easy-default-full | multiplier | 26 | 0 |
| mi-easy-default-full | period | 26 | 0 |
| mi-hard-rabbit-boundary | stability | 620 | 0 |
| mi-hard-rabbit-boundary | multiplier | 620 | 0 |
| mi-hard-rabbit-boundary | period | 620 | 0 |
| mi-fallback-weak-attraction | stability | 428 | 0 |
| mi-fallback-weak-attraction | multiplier | 428 | 0 |
| mi-fallback-weak-attraction | period | 428 | 0 |

changed 19216, unsupported 0, max analytic error 3.00e-15, max orbit-product error before 1.02e-8
```

- [ ] **Step 4: Environment, summary, formatting, manifest**

```bash
DIR=$(ls -d evidence/phase-2/*-period-three-adjudication)
node tools/benchmark/capture-environment.mjs --out "$DIR/environment.json" --note "Workstream H period 3 (ADR 0010): oracle adjudication of every pixel whose stable-pass output changed at the golden raster (npm run evidence:period-three); Node, deterministic, no timing."
```

Create `summary.md` in that directory with this content, replacing `<DATE>`, `<SHA>`, `<BASE>` (the baseline SHA printed in Step 2) and pasting the two tables from `.evidence-build/h3/adjudication.txt`:

```markdown
# Period-3 answer-change adjudication — <DATE> @ <SHA>

Workstream H period 3 ([ADR 0010](../../../docs/decisions/0010-analytic-period-three.md)).
Plan §3: a changed answer ships only when the oracle supports it; ADR 0007:
an intended kernel change regenerates the golden fixture with oracle evidence
for the changed pixels.

- **Before:** `<BASE>` (kernels without the period-3 path). **After:** `<SHA>`.
- **Raster:** the golden raster, 160×100, every frozen-corpus case at its
  profile (`tools/kernel_pixel_dump.ts`).
- **Oracle:** `ddPeriodThreeCycle` (`tests/unit/domain/dd-oracle.ts`): a
  binary64 orbit seed, dd Newton on f³(z) − z, dd divisor test and dd
  |λ| < 1. It uses no closed form.
- **Supported** means: the new record is exactly the analytic period-3 record
  at c, and the dd cycle has primitive period 3 with |λ − λ_dd| ≤ 1e-12.
- Command: `npm run evidence:period-three -- before.json after.json <this directory>`.
  Node, deterministic; the machine does not affect the result.

## Changed pixels

<paste the first table>

All 19,216 changed pixels are supported: **0 unsupported**. The largest
distance between the closed-form multiplier and the dd multiplier is
3.0e-15; before the change, the orbit-product multiplier of the 18,142
already-period-3 pixels was up to 1.02e-8 from the dd value.

## Colour

<paste the second table>

The multiplier change alone alters no colorized byte in any view; only the
1,074 status changes are visible. Other cases: no change.

## Limits

- One raster and one corpus. `tests/unit/render/period-three-golden-oracle.test.ts`
  repeats the dd check for every analytic period-3 pixel of this raster on
  every test run.
- The dd oracle certifies |λ| < 1 without a margin; agreement within 1e-12 with
  the analytic multiplier, which carries the margin, is what is claimed.
- No semantic change outside period 3 (no other transition occurs).
```

Then:

```bash
DIR=$(ls -d evidence/phase-2/*-period-three-adjudication)
npx prettier --write "$DIR"
node tools/benchmark/manifest.mjs "$DIR"
node tools/benchmark/manifest.mjs --check "$DIR"
du -h "$DIR/raw-observations.json"
```

Expected: the manifest check passes; `raw-observations.json` is about 1.7 MB (below the 5 MiB plain-JSON threshold of `evidence/phase-2/README.md`).

- [ ] **Step 5: Repository gates**

Run: `npm run check && npm run fixtures:kernel-golden -- --check && npx playwright test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
DIR=$(ls -d evidence/phase-2/*-period-three-adjudication)
git add tools/adjudicate_period_three.ts package.json tsconfig.node.json "$DIR"
git commit -m "$(cat <<'EOF'
Evidence: dd adjudication of every pixel the period-3 path changed

19,216 changed golden-raster pixels, 0 unsupported (ADR 0010).

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Record the fallback-overhead measurement

**Files:**

- Create: `evidence/phase-2/<date>-<sha>-period-three-overhead/` with `environment.json`, `raw-observations.json`, `summary.md`, `manifest.sha256` (no semantic comparison: the arms classify identically outside period-3 components, and timing is the subject)

`<sha>` is the Task 7 commit, as in Task 10. Shell variables do not persist between separate commands: every command block below sets the variables it uses. If you rerun Step 3 on a later date, delete the earlier, incomplete directory first.

**Interfaces:**

- Consumes: `tools/benchmark/overhead-entry.ts`, `tools/benchmark/fallback-overhead.ts` (Task 6).

- [ ] **Step 1: Check the machine is quiet**

Run: `uptime; ps -eo pcpu,comm --sort=-pcpu | head -6`
Expected: 1-minute load average below 2 and no browser or test runner near the top. If other work is running (other agents' Playwright runs pushed the load to 10–30 during planning), wait and re-check every few minutes; after 30 minutes without a quiet window, stop and report `BLOCKED: no quiet window for the fallback-overhead run` to the controller.

- [ ] **Step 2: Build both arms**

```bash
BASE=$(git log --format=%h --grep='^Tools: kernel pixel dump and fallback-overhead bench' -1)
git worktree add .worktrees/h3-baseline "$BASE"
ln -s "$PWD/node_modules" .worktrees/h3-baseline/node_modules
(cd .worktrees/h3-baseline && npx vite build --ssr tools/benchmark/overhead-entry.ts --outDir ../../.evidence-build/overhead/baseline --emptyOutDir --logLevel warn)
npx vite build --ssr tools/benchmark/overhead-entry.ts --outDir .evidence-build/overhead/candidate --emptyOutDir --logLevel warn
git worktree remove --force .worktrees/h3-baseline
ls .evidence-build/overhead/baseline/overhead-entry.js .evidence-build/overhead/candidate/overhead-entry.js
```

Expected: both bundle files exist.

- [ ] **Step 3: Run the benchmark pinned to one core**

```bash
SHA=$(git log --format=%h --grep='^Kernels: analytic period-3 fast path' -1)
DIR="evidence/phase-2/$(date +%F)-$SHA-period-three-overhead"
mkdir -p "$DIR"
taskset -c 3 node tools/benchmark/fallback-overhead.ts .evidence-build/overhead/baseline/overhead-entry.js .evidence-build/overhead/candidate/overhead-entry.js --reps 60 --out "$DIR/raw-observations.json" | tee .evidence-build/overhead/result.txt; echo "exit ${PIPESTATUS[0]}"
```

Expected: `exit 0` and two `PASS` lines. The prototype measured `mi-easy-exterior-heavy … candidate -4.68% [-5.98%, -3.80%] control -0.20% PASS` and `mi-fallback-ambiguous-boundary … candidate -1.12% [-2.74%, -0.02%] control -0.63% PASS`; your numbers will differ, but the candidate should be within a few percent of zero.

- `exit 3` (NOISY): re-check Step 1, then rerun on another core (`taskset -c 5`, then `taskset -c 6`). After three noisy runs, stop and report `BLOCKED: environment too noisy` with the three outputs.
- `exit 1` (FAIL with a quiet control): do not change code. Stop and report `BLOCKED: fallback overhead above 5%` with `result.txt` and the JSON. The controller escalates to the owner (the H gate says fallback ≤ 5%).

- [ ] **Step 4: Environment, summary, formatting, manifest**

```bash
DIR=$(ls -d evidence/phase-2/*-period-three-overhead)
node tools/benchmark/capture-environment.mjs --out "$DIR/environment.json" --note "Workstream H period 3 (ADR 0010): fallback-overhead microbenchmark, three interleaved arms (baseline, A/A control, candidate) in one Node process, pinned with taskset; directional Node evidence, not a release measurement."
```

Create `summary.md` in that directory, replacing the placeholders with the values from `result.txt`, `uptime` and `git`:

```markdown
# Period-3 fallback overhead — <DATE> @ <SHA>

Workstream H gate (plan §5): `fallback ≤5%`. Does the analytic period-3 path
([ADR 0010](../../../docs/decisions/0010-analytic-period-three.md)) slow the
views it never answers?

- **Label:** directional (Node v24, one laptop, no browser).
- **Arms**, interleaved in one process, order rotating every repetition:
  `baseline` (`<BASE>`, kernels without the period-3 path), `control` (a byte
  copy of the baseline bundle: an A/A arm for position and JIT noise),
  `candidate` (`<SHA>`). Every arm first classifies the whole corpus at
  256×160 so its JIT state carries feedback from every path.
- **Cases:** `mi-easy-exterior-heavy` (every pixel escapes within a few
  iterations) and `mi-fallback-ambiguous-boundary` (slow escapers that reach
  the first scanning iteration outside the gate), stable pass, 1024×640,
  60 repetitions after one warmup, `taskset -c <CORE>`, 1-minute load average
  <LOAD> at start.
- **Statistic:** overhead = 1/ratio − 1 for the paired median log-ratio, 95%
  BCa interval, 10,000 resamples, seed 20261016
  (`tools/benchmark/harness/stats.ts`).
- Command: `node tools/benchmark/fallback-overhead.ts <baseline.js> <candidate.js> --reps 60 --out raw-observations.json`.

| Case                           | Baseline median ms | Candidate overhead [95% BCa] | Control (A/A) | Result |
| ------------------------------ | -----------------: | ---------------------------- | ------------- | ------ |
| mi-easy-exterior-heavy         |              <ms>  | <x%> [<lo%>, <hi%>]          | <c%>          | PASS   |
| mi-fallback-ambiguous-boundary |              <ms>  | <x%> [<lo%>, <hi%>]          | <c%>          | PASS   |

Both cases are within the 5% limit with a quiet control arm (|A/A| ≤ 2%).

## Design note

The gate is a straight-line test. With a loop over the box array inlined
into the row kernel's outer loop, the planning prototype measured +8% to
+16% on `mi-easy-exterior-heavy` (control within 2%), although no pixel of
that view reaches the test.

## Limits

- Node only; the browser release run in both browsers is deferred to the
  owner's screen session.
- Timing noise on this machine moved the A/A arm by up to ±4% during
  planning; only runs with a quiet control count.
```

Then:

```bash
DIR=$(ls -d evidence/phase-2/*-period-three-overhead)
npx prettier --write "$DIR"
node tools/benchmark/manifest.mjs "$DIR"
node tools/benchmark/manifest.mjs --check "$DIR"
```

Expected: the manifest check passes.

- [ ] **Step 5: Repository gates**

Run: `npm run check && npm run fixtures:kernel-golden -- --check && npx playwright test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
DIR=$(ls -d evidence/phase-2/*-period-three-overhead)
git add "$DIR"
git commit -m "$(cat <<'EOF'
Evidence: period-3 fallback overhead within 5% (Node, directional)

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Traceability, plan status, and the deferred browser run

**Files:**

- Modify: `docs/PERFORMANCE-PLAN.md` (workstream H row)
- Modify: `docs/verification/REQUIREMENTS.md` (`MI-PERF-001`, `MI-PERF-002`, `MI-PERF-004` trace rows)
- Modify: `docs/verification/WORKSTREAM-DISPOSITIONS.md` (H row and H section)
- Modify: `docs/verification/PHASE2-TODO.md` (item 8 checkboxes)
- Modify: `docs/decisions/0010-analytic-period-three.md` (evidence links)

**Interfaces:**

- Consumes: the two evidence directory names from Tasks 10 and 11: `ls -d evidence/phase-2/*-period-three-adjudication evidence/phase-2/*-period-three-overhead`. Below they are `<ADJ>` and `<OVH>` (directory names only, without `evidence/phase-2/`).

- [ ] **Step 1: Check every anchor exists exactly once**

```bash
grep -cF '| H   | p3/p4 algebraic experiment                           | Not started; no PoC measurement.' docs/PERFORMANCE-PLAN.md
grep -cF '(automation-bundled Chromium and Firefox, screening protocol — directional; gate analysis in [STAGE-A-GATE-ANALYSIS.md](STAGE-A-GATE-ANALYSIS.md))' docs/verification/REQUIREMENTS.md
grep -cF '`src/domain/verifier.ts`, `src/domain/period-policy.ts`, `src/render/classify-rows.ts`' docs/verification/REQUIREMENTS.md
grep -cF 'PR 4 (checkpoint candidate source; exhaustion scan verifier-gated)' docs/verification/REQUIREMENTS.md
grep -cF '| H   | p3/p4 algebraic experiment       | **Not started**; no PoC measurement' docs/verification/WORKSTREAM-DISPOSITIONS.md
grep -cF -- '- [ ] **Period 3:** add the closed form' docs/verification/PHASE2-TODO.md
```

Expected: every count is `1`. If one is `0`, another plan edited that text: find the equivalent sentence by its meaning and edit it the same way; report what you changed.

- [ ] **Step 2: PERFORMANCE-PLAN workstream H row**

In `docs/PERFORMANCE-PLAN.md`, replace the cell text that follows `| H   | p3/p4 algebraic experiment                           | ` (currently `Not started; no PoC measurement.`) with:

```markdown
**Period 3 landed** ([ADR 0010](decisions/0010-analytic-period-three.md), 2026-10-16): closed form λ = 4(c+2) ± 4ic√(4c+7) with a derived binary64 allowance ([PERFORMANCE-MATHEMATICS §11](PERFORMANCE-MATHEMATICS.md#11-period-3-closed-form-workstream-h-adr-0010)), tried once per pixel at the first scanning iteration behind the component-box gate. Node evidence: every changed golden-raster pixel dd-adjudicated ([adjudication](../evidence/phase-2/<ADJ>/summary.md)); fallback overhead within 5% ([overhead](../evidence/phase-2/<OVH>/summary.md)). Browser release run pending (owner). Period 4 not started: it needs a rigorous root-error bound.
```

- [ ] **Step 3: REQUIREMENTS trace rows**

In `docs/verification/REQUIREMENTS.md`:

Replace `(automation-bundled Chromium and Firefox, screening protocol — directional; gate analysis in [STAGE-A-GATE-ANALYSIS.md](STAGE-A-GATE-ANALYSIS.md))` with:

```markdown
(automation-bundled Chromium and Firefox, screening protocol — directional; gate analysis in [STAGE-A-GATE-ANALYSIS.md](STAGE-A-GATE-ANALYSIS.md)). Workstream H period 3 (ADR 0010): oracle adjudication of every changed golden-raster pixel ([`evidence/phase-2/<ADJ>/`](../../evidence/phase-2/<ADJ>/summary.md)) and the Node fallback-overhead measurement ([`evidence/phase-2/<OVH>/`](../../evidence/phase-2/<OVH>/summary.md)), each with environment, raw observations, summary and a verified manifest
```

Replace `` `src/domain/verifier.ts`, `src/domain/period-policy.ts`, `src/render/classify-rows.ts` `` with:

```markdown
`src/domain/verifier.ts`, `src/domain/period-policy.ts`, `src/render/classify-rows.ts`, `src/domain/analytic-period-three.ts` and `src/domain/period-three-gate.ts` (ADR 0010)
```

Replace `PR 4 (checkpoint candidate source; exhaustion scan verifier-gated)` with:

```markdown
PR 4 (checkpoint candidate source; exhaustion scan verifier-gated); workstream H period 3 (ADR 0010: closed-form acceptance under the same attraction margin plus a derived binary64 allowance; every changed pixel dd-adjudicated in `tests/unit/render/period-three-golden-oracle.test.ts` and `tests/unit/domain/orbit-oracle-adjudication.test.ts`)
```

- [ ] **Step 4: WORKSTREAM-DISPOSITIONS**

In `docs/verification/WORKSTREAM-DISPOSITIONS.md`, replace the table cell `**Not started**; no PoC measurement` in the H row with `**Period 3 landed** (ADR 0010); period 4 not started`, and replace the paragraph under `## Workstream H — p3/p4 algebraic experiment` (from `Disposition: **not started**; no PoC measurement exists.` through `from the first Stage A run.`) with:

```markdown
Disposition: **period 3 landed** (owner decision 2026-10-16 after the
[spike](WORKSTREAM-H-SPIKE-2026-10-16.md); [ADR 0010](../decisions/0010-analytic-period-three.md)).
The closed form is tried once per pixel at the first scanning iteration behind
the component-box gate. Node evidence: every changed golden-raster pixel
dd-adjudicated ([adjudication](../../evidence/phase-2/<ADJ>/summary.md)) and
fallback overhead within 5% ([overhead](../../evidence/phase-2/<OVH>/summary.md)).
Gate (plan §5, verbatim): `Targeted ≥15% or weighted ≥5%; fallback ≤5%; zero
incorrect results`; the targeted and weighted clauses still need the browser
release run, which is deferred to the owner's screen session. Period 4 is not
started: it needs a rigorous root-error bound (Kantorovich or a cusp
exclusion disk) before its cubic solve may accept.
```

- [ ] **Step 5: PHASE2-TODO item 8**

In `docs/verification/PHASE2-TODO.md`, item 8:

- change `- [ ] **Period 3:** add the closed form` to `- [x] **Period 3:** add the closed form`, and append ` Done: [ADR 0010](../decisions/0010-analytic-period-three.md), [PERFORMANCE-MATHEMATICS §11](../PERFORMANCE-MATHEMATICS.md#11-period-3-closed-form-workstream-h-adr-0010).` to the end of that bullet's text;
- change `- [ ] Place the test so early escapers never pay it` to `- [x] Place the test so early escapers never pay it`, and append ` Done: first scanning iteration, straight-line gate; Node [overhead](../../evidence/phase-2/<OVH>/summary.md) within 5%.`;
- change `- [ ] Evidence codes and flags for the analytic source;` to `- [x] Evidence codes and flags for the analytic source;`, and append ` Done: [adjudication](../../evidence/phase-2/<ADJ>/summary.md), 19,216 changed pixels, 0 unsupported.`;
- leave `- [ ] A release-harness run in both browsers.` unticked and append ` Deferred to the owner's screen session (headed release harness).`;
- leave the period-4 bullet unchanged.

- [ ] **Step 6: ADR 0010 evidence links**

In `docs/decisions/0010-analytic-period-three.md`, append to the end of the `## Consequences` list:

```markdown
- Evidence: [adjudication](../../evidence/phase-2/<ADJ>/summary.md) (every
  changed pixel, 0 unsupported) and [fallback overhead](../../evidence/phase-2/<OVH>/summary.md)
  (Node, directional).
```

- [ ] **Step 7: Repository gates**

Run:

```bash
npx prettier --write docs/PERFORMANCE-PLAN.md docs/verification/REQUIREMENTS.md docs/verification/WORKSTREAM-DISPOSITIONS.md docs/verification/PHASE2-TODO.md docs/decisions/0010-analytic-period-three.md
grep -rn '<ADJ>\|<OVH>' docs --exclude-dir=superpowers || echo no-placeholders
npm run check && npm run fixtures:kernel-golden -- --check && npx playwright test
```

Expected: `no-placeholders`; all gates pass.

- [ ] **Step 8: Commit**

```bash
git add docs/PERFORMANCE-PLAN.md docs/verification/REQUIREMENTS.md docs/verification/WORKSTREAM-DISPOSITIONS.md docs/verification/PHASE2-TODO.md docs/decisions/0010-analytic-period-three.md
git commit -m "$(cat <<'EOF'
Docs: workstream H period 3 traced; browser run deferred to the owner

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 9: Report the deferred browser evidence run**

Do not run it. Report to the controller, for the owner:

> **Deferred (owner's screen session):** the headed release harness in both
> branded browsers on the period-3 build, `kde-inhibit --screenSaver --power npm run evidence:release`,
> to measure the targeted and weighted H clauses (the four hard views and
> `mi-fallback-weak-attraction`) and the fallback cases in the browsers. It
> closes the remaining unticked period-3 box of PHASE2-TODO item 8.

---

<!-- prettier-ignore-end -->

## Self-review

- **Spec coverage.** Closed form, smallest-modulus root, margin with a written budget: Task 3. Kernel call sites (`orbit-triggered.ts`, the two-lane kernel; `classifyInto` and `verifier.ts` behaviour pinned and documented): Task 7. PERFORMANCE-MATHEMATICS section with Sterbenz near the cusp, the complex square root error, no catastrophic cancellation, the margin, and the verdict on the spike's 32·ε·(|a|+|t|): Task 3 (§11.1–11.4, 11.6) and Task 7 (§11.5). Lean: Task 1, verified to compile; the resultant direction is a named follow-up. Placement at the first scheduled scan and the ≤5% Node microbenchmark on `mi-easy-exterior-heavy` and `mi-fallback-ambiguous-boundary`: Tasks 6, 7, 11. Boxes as data behind a hull test: Task 4. Evidence code, flag, source mapping, inspector text: Tasks 2 and 9. Golden regeneration in the same commit with oracle checks of every changed pixel, using the dd oracle files and the `orbits.v1.json` generator: Tasks 5, 7, 8, 10. Multiplier decision and colorizer impact: Decisions table, ADR 0010, Task 10 colour table. Docs (PERFORMANCE-MATHEMATICS, PERFORMANCE-PLAN H row, REQUIREMENTS `MI-PERF-001`, ADR 0010, PHASE2-TODO ticks): Tasks 3, 7, 12. Deferred browser run: Task 12, Step 9.
- **Type consistency.** `classifyPeriodThreeInto(cRe, cIm, out): boolean`, `inPeriodThreeGate(cRe, cIm): boolean`, `ddPeriodThreeCycle(cRe, cIm): DDOracleVerdict`, `PixelDump`/`PixelDumpCase`, `timeCase`/`corpusCaseIds` are used with the same names and shapes in every task.
- **Review Focus.** Each of the seven lines has a test in the owning task (named in the Review Focus section).
