# Workstream H spike: closed-form period-3/4 classification

- Date: 2026-10-16. Repository state: `phase-2/closeout` at `84a3f87`.
- Requested by the owner as an exploratory spike ("to satisfy my curiosity at
  least"). Scripts and outputs: [`poc/performance/h-p3p4/`](../../poc/performance/h-p3p4/README.md).
- **Directional evidence:** Node v24.19.0 on the i7-1185G7 target laptop,
  single thread, the scalar `classifyInto`, a 256×160 raster, and no browser
  runs.
- Every claim carries a label: **[measured]** (run in the spike),
  **[derived]** (algebra done in the spike and checked with sympy) or
  **[literature]** (recalled, not re-derived).
- **Owner decision (2026-10-16):** adopt period 3 now and period 4 after a
  rigorous error bound, as Phase 2 work ([PHASE2-TODO](PHASE2-TODO.md)).

## Verdict

H is worth pursuing as a small extension of the existing analytic fast paths:
period 3 first, then period 4 once its error bound is rigorous. On this corpus
in Node it meets the plan's gate (`Targeted ≥15% or weighted ≥5%; fallback
≤5%; zero incorrect results`):

- the four hard views run 1.4–2.0× faster;
- summed corpus time falls 45–48%;
- there were zero incorrect results over 532,480 pixels;
- the algebra is 5–37× cheaper per pixel it handles than the orbit path, so
  the kill condition does not fire.

Three caveats:

1. **The gain is concentrated.** It exists only near nine small components,
   and two corpus rationales are wrong in ways that inflate it. If "weighted"
   means the plain median of per-view speedups, the gain is about 4%, under
   the 5% bar.
2. **Fallback overhead is borderline.** The far-exterior view slows 3–8%,
   against a 5% limit.
3. **It changes answers.** About 24,800 pixels production leaves unresolved
   become attracting. A 5,000,000-iteration re-run confirms every one, but it
   is still an answer change that plan §3 must accept.

## 1. The mathematics

### Polynomials [derived]

**Periodic points.** The dynatomic polynomial Φ_p(z, c) is f^p(z) − z with
the lower-period factors divided out.

| p   | deg_z Φ_p | cycles | Gleason centre polynomial           | components                                                                                |
| --- | --------- | ------ | ----------------------------------- | ----------------------------------------------------------------------------------------- |
| 3   | 6         | 2      | G3 = c³ + 2c² + c + 1               | 3 (airplane, rabbit, co-rabbit)                                                           |
| 4   | 12        | 3      | G4 = c⁶ + 3c⁵ + 3c⁴ + 3c³ + 2c² + 1 | 6 (two 1/4-satellites of the cardioid, the 1/2-satellite of the p2 bulb, three primitive) |

**Multiplier polynomials.** These come from Res_z(Φ_p, λ − (f^p)′). The
resultant is M_p(λ, c)^p, because each cycle is counted p times.

- **p = 3.** Write ν = λ/8 = z₁z₂z₃. Then ν² − (c+2)ν + G3(c) = 0. The
  discriminant collapses to −c²(4c+7), which gives the closed form:

  λ = 4(c + 2) ± 4i·c·√(4c + 7)

  One complex square root yields both 3-cycles' multipliers. At c = −7/4 this
  gives λ = 1. At the G3 roots it gives λ = 0.

- **p = 4.** Write μ = λ/16 = z₁z₂z₃z₄. Then
  μ³ + (c² − 3)μ² − (c⁴ + c³ − c² − 3)μ − G4(c) = 0. This is a cubic in λ,
  one root per 4-cycle.

- **Inverse direction.** Read as polynomials in c, these become the component
  parameterizations: for p = 3, c³ + 2c² + (1 − ν)c + (1 − ν)² = 0 (a cubic
  in c); for p = 4, G4(c) + μ(c⁴ + c³ − c² − 3) − μ²(c² − 3) − μ³ = 0 (a
  sextic in c).

### Giarrusso and Fisher [literature]

Giarrusso and Fisher, "A parameterization of the period 3 hyperbolic
components of the Mandelbrot set", Proc. AMS 123 (1995) 3731–3737. The spike
confirmed the citation only; it could not retrieve the paper, so the form of
their radicals is recalled, not checked.

The paper solves for c as a function of λ by radicals, one branch per
period-3 component, mapping the unit λ-disk onto each component. That is the
direction for drawing boundaries (λ = e^{iθ}) or placing internal-angle
labels. A per-pixel test needs the opposite direction, λ(c), which is the easy
one: a quadratic for p = 3, a cubic for p = 4.

### Per-pixel test and why it is correct

**Uniqueness [literature, standard].** A quadratic polynomial has at most one
attracting cycle (Fatou). Branch selection is therefore "take the root of
smallest modulus" and test |λ| < 1 − margin, with nothing tracked between
pixels.

**Exact period [derived].** A root of M_p fails to have exact period p only
for a lower-period cycle whose multiplier is a root of unity, and there
|λ_p| = 1:

- p = 3: a fixed point with λ₁ = e^{±2πi/3};
- p = 4: λ₁ = ±i, or a 2-cycle with λ₂ = −1.

The margin therefore implies exact period, and no divisor reduction is
needed. The code already makes the same argument for the period-2 bulb.

**Conditioning, p = 3 [derived].**

- Near the airplane cusp, both 4c + 7 and c + 2 are computed exactly
  (Sterbenz), and the complex square root has a relative error of a few ulps.
- λ is the sum of two terms each of size at most about 8, with no
  catastrophic cancellation, so its absolute error is about 1e-14 everywhere.
- The prototype adds a 32·ε·(|a| + |t|) allowance on top of the 1e-12
  margin.
- A Lean error budget looks feasible next to
  `proof/IntMProof/PeriodThreeLocus.lean`, which already proves that G3 is the
  exact period-3 critical locus.

**Conditioning, p = 4 [derived].** Cardano is ill-conditioned near a double
root of the cubic. A double root with |λ| ≤ 1 can only be λ = 1, at the cusps
of the three primitive components, where the cost is about √ε. The prototype
guards this with a first-order a-posteriori allowance,
2(|M| + coefficient rounding)/|M′|. That is honest but **not a proof**: it
lacks the Kantorovich second-order term. It refused nothing on this corpus.

**Cost.**

- p = 3: about 12 flops plus a complex square root.
- p = 4: a Cardano solve with a complex cube root and two Newton polishes per
  root.
- Both run only inside a gate: nine padded bounding boxes behind a
  one-compare hull. The boxes affect only speed, never answers.

**The current path, for comparison [measured].**

- A p3/p4 pixel needs at least 24 iterations (`cycleWarmup`). The mean is
  160–410 and the maximum 1,021, because convergence takes about
  p·23/(−ln|λ|) iterations. A lag scan and the verifier walk follow.
- That costs 960–2,280 ns per pixel, against 63 ns (p3) and 300–330 ns (p4)
  for the algebra.
- Near |λ| → 1 the orbit path cannot finish within the budget at all.

## 2. Upside: the Amdahl bound [measured]

Production `classifyInto` at 256×160 with each view's profile. Status and
period match the production two-lane row kernel, with 0 mismatches on every
view. "Time share" is the batch time for the production-p3/p4 pixels alone,
divided by the time for the whole raster (median of 9).

| view                     | p3 % px | p4 % px | iteration share | time share | ns/px p3/p4 |
| ------------------------ | ------: | ------: | --------------: | ---------: | ----------: |
| easy-default-full        |     0.4 |     0.2 |           11.7% |       6.1% |        1173 |
| hard-rabbit-boundary     |    15.6 |       0 |           32.4% |      29.4% |         963 |
| hard-supplied-126x       |       0 |    11.1 |           31.8% |      32.0% |        1702 |
| hard-supplied-609x       |       0 |     3.7 |           23.6% |      22.7% |        1594 |
| hard-supplied-13x        |       0 |     8.9 |           33.9% |      31.8% |        1619 |
| fallback-weak-attraction |    97.4 |       0 |           96.7% |      95.8% |        2276 |
| the other 7 views        |       0 |       0 |               0 |          0 |           – |

Across the corpus these pixels take 30.7% of summed time, so the bound does
not kill H. Weak attraction alone accounts for 80% of that share.

## 3. Prototype [measured]

`classifyH` runs the production p1/p2 fast paths, then the p3 closed form and
the p4 Cardano solve inside the box gate. Everything else, including every
refusal, falls through to the unchanged `classifyTriggeredOrbitInto`.

### Agreement with production (13 views × 40,960 pixels)

- **56,198** pixels were taken by the algebra where production also said
  p3/p4; status and period match exactly.
- **0** production-p3/p4 pixels were missed. There were **0** contradictions
  (no pixel where production says escaped or another period and the algebra
  claims p3/p4), and **0** fall-through mismatches.
- **Multiplier.** The worst differences from production are |Δλ| = 2.2e-6,
  Δ|λ| = 1.9e-6 and Δarg = 2.3e-6 rad. The algebra is the accurate side: on
  the 8 worst pixels, against a reference λ after 3,000,000 settling
  iterations, production is 1.5–2.2e-6 off and the algebra 0.4–6.7e-12 off.
- **24,839** pixels change from production-unresolved to attracting p3/p4,
  with |λ| between 0.884 and 0.99999998. A re-run of the production classifier
  with a 5,000,000-iteration, period-64 budget confirms every one; that is
  the same algorithm with a bigger budget, not an independent oracle. 20,480
  of them are the left half of the 6,000,000× view.

### Timing (interleaved, rotating order, median of 21)

| view                     | production ms | prototype ms |    speedup |
| ------------------------ | ------------: | -----------: | ---------: |
| hard-rabbit-boundary     |         22.45 |        11.23 |      2.00× |
| hard-supplied-126x       |         29.13 |        16.28 |      1.79× |
| hard-supplied-13x        |         20.94 |        12.47 |      1.68× |
| hard-supplied-609x       |         11.59 |         8.38 |      1.38× |
| fallback-weak-attraction |         116.0 |         2.89 |        40× |
| scale-6mx-basilica-rim   |          87.2 |         10.4 |       8.4× |
| easy-default-full        |          5.56 |         5.07 |      1.10× |
| the other 6 views        |               |              | 0.94–1.02× |

**Aggregates.** The plan declares no weighted aggregate, and the choice
matters:

- sum of times: −48% (−45% in a second run);
- geometric mean: about 1.8×;
- plain median of per-view speedups: about 1.04×;
- without the two mislabelled views, the sum of times falls 13%.

**Fallback overhead** (prototype against a null wrapper with the same call
structure, two runs of 101 repetitions): easy-exterior-heavy +4.7% and
+7.8%, ambiguous-boundary +3.3% and +3.4%, elsewhere within noise. That is
about 4 ns on pixels that escape in about 70 ns. Since the gate there is a
single compare, the cost is codegen of the larger function, not the test
itself. A likely fix, untested here, is to run the test inside the kernel at
the first scheduled scan (iteration 24), so early escapers never pay it.

## 4. Gate assessment

| clause         | result                                                                                                                                                |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Targeted ≥15%  | **Pass** on all four hard views (1.38–2.00×) [measured, Node]                                                                                         |
| Weighted ≥5%   | **Pass** on summed time, geometric mean, and the corpus without the two mislabelled views; **fail** as a plain median of per-view speedups (about 4%) |
| Fallback ≤5%   | **Borderline**: 3–8% on the far exterior; needs the in-kernel placement or similar                                                                    |
| Zero incorrect | **Pass** on 532,480 pixels; p3 has a clean error argument, the p4 cusp bound is heuristic                                                             |
| Kill condition | **Not triggered**: 5–37× cheaper per pixel handled                                                                                                    |

## What shipping it would take

1. **Plumbing:** two new evidence codes and `EvidenceFlag` values, and an
   `analytic` evidence-source mapping.
2. **Period 3:** the closed form with a written error budget, optionally with
   a Lean statement following `PeriodThreeLocus` and the `FastPath.lean`
   `period2_bulb_abs` pattern.
3. **Period 4:** a rigorous root-error bound (Kantorovich) or a cusp
   exclusion disk. On this corpus p3 alone delivers the rabbit and
   weak-attraction wins; p4 delivers 126×, 13×, 609× and 6,000,000×.
4. **Answer-change adjudication:** record the unresolved → attracting change
   against the double-double oracle, per plan §3. It lowers the unresolved
   rate.
5. **Fallback:** fix where the test runs.
6. **Evidence:** a browser run on the row kernel.
7. **Corpus:** decide whether this corpus, built around p3/p4 catalog
   components, represents real use.

## Side findings

1. **Two corpus rationales disagree with the classifier, both in H's favour
   [measured].**
   - `mi-fallback-weak-attraction` says "~97% period-6, |λ| up to ~0.81". The
     classifier gives 97.4% **period 3**, |λ| 0.848–0.902, arg λ ≈ −π. The
     view sits inside the rabbit next to its 1/2 root, not inside the period-6
     satellite. At its centre (−0.1205, 0.8268) the result is period 3,
     |λ| = 0.876.
   - `mi-scale-6mx-basilica-rim` says "~50% near-parabolic exterior". Its left
     half (Re c < −1.25) is the **interior of the period-4 bulb**, with |λ|
     between 1 − 5e-6 and 1 − 2e-8. All 20,480 of those pixels confirm as
     period 4 with the 5,000,000-iteration budget.

   Both need a corpus note whatever happens to H, because neither case
   exercises what its rationale claims.

2. **The algebraic multipliers are about 10⁶ times more accurate** than the
   shipped orbit-product multipliers near the boundary (1e-12 against 2e-6).
   That matters for the multiplier and stability colourings.
3. **Exact boundaries and internal angles for display.** Centres are not new:
   the catalog already holds the Gleason roots. What is new is cheap exact
   outlines and internal-angle positions for the nine p3/p4 components
   (λ = e^{iθ} into the cubic or sextic in c). These could draw outlines or
   labels next to the existing catalog markers.
4. **The scalar classifier matches the two-lane row kernel** exactly on
   status and period on all 13 views [measured].

## Caveats

- Node only, scalar classifier, one laptop, no browser runs.
- The 256×160 raster is far below the 1024×640 shipping raster.
- Easy-view timings move about ±10% between runs.
- The 5,000,000-iteration confirmation is the production algorithm with a
  larger budget, not an independent oracle. The independent support is the
  mathematics in §1.
