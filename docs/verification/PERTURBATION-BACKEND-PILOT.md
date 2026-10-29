# Binary64 perturbation backend pilot (Phase 3 work packet 1)

**Scope:** research only. This is work packet 1 of the
[Phase 3 proof program](PHASE-3-PROOF-PROGRAM.md#work-packets-and-exit-criteria):
one arithmetic backend, a finite domain, its exact operation order, overflow
and underflow rules, and an independent higher-precision oracle, exercised on
small tiles. The product-need gate stays open (owner decision, 2026-10-29:
gate-free preparation only). No renderer imports this code; the
`6,000,000×` ceiling, the production kernels and every fixture the product
uses are unchanged.

The pilot also instantiates P3's local-error inputs per call (part of work
packet 2): every pixel gets a certified bound on its delta error at every
iteration. It classifies **escape only**. Period, multiplier and interior
semantics (packet 3), glitch repair, rebasing and subdivision (packet 4) are
not attempted.

## Backend

The backend is a **binary64 delta orbit against a binary64-stored reference**,
the standard perturbation scheme, with its error audited per call rather than
assumed.

| Part             | Choice                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reference        | A finite binary64 parameter `c_ref`, or (added in packet 3) an exact dyadic `ExactPoint` for depths below binary64 resolution. Its exact critical orbit `Z_k` is enclosed in BigInt ball arithmetic on a `2^-1152` grid (floor rounding, radius `r' = r(2\|X\| + r) + 2` units). Each centre is stored as a binary64 `R_k`; the exact storage error `s_k ≥ \|R_k − Z_k\|` is computed from the decoded `R_k`. |
| Pixel parameter  | `c = c_ref + Δc`, the mathematical sum. `Δc = ((x − w/2)·h, (h/2 − y)·h)` with `h = 2^-e`, which is exactly representable, so the offset error `ρ_C` is zero.                                                                                                                                                                                                                                                 |
| Delta kernel     | `deltaStep`: `t = 2R + d` (`tRe = 2*rRe + dRe`, `tIm = 2*rIm + dIm`), then `d'Re = ((tRe*dRe) − (tIm*dIm)) + ΔcRe` and `d'Im = ((tRe*dIm) + (tIm*dRe)) + ΔcIm`, in exactly this ECMAScript evaluation order. Mathematically `(2R + d)d + Δc = 2Rd + d² + Δc`.                                                                                                                                                 |
| Escape rule      | The production rule: escaped at the first iteration `k ≥ 1` with `\|z_k\|² > 4`.                                                                                                                                                                                                                                                                                                                              |
| Supported domain | `24 ≤ e ≤ 1000`, even tile sides `2..64`, `1 ≤ N ≤ 4096` iterations, finite `\|c_ref\| ≤ 2`. Anything else is refused (`unsupported-tile`).                                                                                                                                                                                                                                                                   |

**Overflow and underflow.** Inside the domain, every offset is a normal
binary64 value. Any nonfinite kernel result makes the pixel `unresolved`
(`nonfinite`). Underflow is allowed: the audit decodes subnormals and zeros
exactly, so any underflow shows up in the measured residual rather than being
assumed away. The reference stops once its ball radius exceeds `2^-64` or
its enclosure leaves `|z| ≤ 4`; a pixel that needs a later reference step is
`unresolved` (`reference-exhausted`), never extrapolated.

## Certificate

The audit applies `reconstruction_error_le_budget`
([ErrorBudget.lean](../../proof/IntMProof/ErrorBudget.lean)) with the **exact**
reference orbit `Z` as `ref`, the computed deltas `d_k` as `delta`, and the
exact offset. Then `ρ_R = 0`, `ρ_C = 0`, and

```
d_{k+1} − (2 Z_k d_k + d_k² + Δc) = η_k + 2 (R_k − Z_k) d_k,
η_k = d_{k+1} − (2 R_k d_k + d_k² + Δc)      (computed exactly in BigInt).
```

So `ρ_D(k) = |η_k| + 2 s_k |d_k|`. The radius premise `|z_k| ≤ M_k` uses
`M_k = |R_k + d_k| + s_k + b_k`. The recurrence

```
b_0 = 0,   b_{k+1} = 2 M_k b_k + b_k² + ρ_D(k)
```

is `errorBudget` evaluated with every operation rounded upward (64-bit
mantissa upper bounds). It gives `|d_k − δ_k| ≤ b_k` for the exact delta
`δ_k = z_k − Z_k`, and `|z_k − (R_k + d_k)| ≤ s_k + b_k`. Escape at `k` is
certified when `|R_k + d_k| > 2 + s_k + b_k` and staying bounded when
`|R_k + d_k| ≤ 2 − (s_k + b_k)`. Both are exact BigInt comparisons on
squares. Anything in between is `unresolved` (`escape-ambiguous`). That
ambiguity band is where a production glitch detector and repair would go
(packet 4).

The `M_k` premise refers to `b_k`, which depends only on `M_j` for `j < k`,
so it holds by induction on the prefix, applying the theorem at each shorter
prefix. That induction is currently argued in this document and the code
comments. A short Lean lemma stating it is the first Lean follow-up.

**Trust boundary.** As in the earlier pilots, the `DataView` decoder
(`binary64Units`), the BigInt checker and their JavaScript execution are
trusted and tested, not formally verified. A certified verdict means: if the
checker executes as written, the Lean theorem's premises hold for this call.

## Independent oracle

[`tools/perturbation_oracle.py`](../../tools/perturbation_oracle.py) iterates
each pixel's exact target parameter **directly**: no reference orbit, no
perturbation, rectangular interval arithmetic on a `2^-1200` grid with
outward-rounded endpoints. It shares no code or arithmetic method with the
TypeScript backend. Its results are committed as
[`fixtures/perturbation-tiles.v1.json`](../../fixtures/perturbation-tiles.v1.json),
with each final box rounded outward to `2^-(e+96)`. A `tools/` unittest
(`npm run catalog:test`) regenerates the fixture and requires an identical
text match.

| Tile                        | Reference                              | Step `h` | `N`  | Oracle verdicts                     |
| --------------------------- | -------------------------------------- | -------- | ---- | ----------------------------------- |
| `seahorse-step-2^-31`       | −0.743643887037151 + 0.13182590420533i | `2^-31`  | 1024 | 144 escaped (970–1024), 112 bounded |
| `misiurewicz-i-step-2^-60`  | `i`                                    | `2^-60`  | 1024 | 255 escaped (47–66), 1 bounded      |
| `misiurewicz-i-step-2^-200` | `i`                                    | `2^-200` | 1024 | 255 escaped (159–178), 1 bounded    |

At `2^-60` and `2^-200`, binary64 cannot represent the pixel parameters at
all. In the centre column of the `2^-60` tile, every parameter
`i(1 + k·2^-60)` rounds to `i` itself, yet the oracle gives escape times from
48 to 870. This is the regime a deeper zoom would need.

## Results

[`perturbation-tile.test.ts`](../../poc/performance/src/numerics/perturbation-tile.test.ts),
9 tests, Node 22.22.0 on 2026-10-29:

- **Agreement.** Every certified pixel on all three tiles matches the oracle's
  status and iteration exactly (766 of 768 pixels certified). The only
  unresolved pixels are the two `c = i` reference pixels themselves: they
  never escape, and their repelling cycle exhausts the reference grid after
  about 460 steps (`reference-exhausted`). Neither the backend nor the oracle
  produced an `escape-ambiguous` pixel.
- **Consistency.** At the reported iteration, every audited disk
  `(R_k + d_k, s_k + b_k)` meets the oracle's box (exact comparison).
- **Tightness.** For every pixel, `b_k ≤ 2^-24 |d_k|` (exact). The measured
  worst case is about `2^-28` after 1024 seahorse iterations and `2^-33.5` on
  the `c = i` tiles. The absolute radius at escape (up to about `2^-26`) is
  dominated by `s_k`, the reference's binary64 storage rounding. That rounding
  affects every pixel of the tile alike and does not blur one delta against
  another.
- **Adversarial kernels.** A kernel that perturbs each step by a relative
  `2^-30` and one with a sign error in `ΔcIm` produce no certified verdict that
  contradicts the oracle. The wrong-sign kernel leaves more than 200 of 256
  pixels unresolved instead of certifying them.
- **Refusals and primitives.** Out-of-domain tiles are refused. The upper-bound
  add, multiply and norm primitives are checked against exact arithmetic on
  200 random cases (sound, and tight to `2^-50`).

The audit costs about 3.5 s for the 1024-iteration seahorse tile and under
0.6 s for each `c = i` tile in Node. That is the cost of the exact BigInt
checker, not of the kernel. **No performance claim is made.**

## What this does not establish

- No period, multiplier, interior or V0/V1 refinement (packet 3). `bounded`
  means only "no escape through `N`".
- No glitch repair, rebasing, tile subdivision, cancellation or memory bound
  (packet 4). Ambiguous pixels are just reported.
- No browser-engine evidence. The kernel is plain ECMAScript Number
  arithmetic, but it has run only in Node here.
- No product-need record, release comparison or zoom-bound change (packet 5
  and the gates in the [proof program](PHASE-3-PROOF-PROGRAM.md)).

## Next steps

1. Lean: state the inductive radius lemma above, and optionally a
   concrete-tile wrapper of `reconstruction_error_le_budget` with
   `ρ_R = ρ_C = 0`.
2. Run the same tiles in Chromium and Firefox through Vite, as the
   period-two pilot does.
3. Packet 3: done in the [verifier pilot](PERTURBATION-VERIFIER-PILOT.md).
4. Packet 4: use the `escape-ambiguous` band as the glitch trigger, and add
   rebasing (`rebase_error_norm_le`) and authoritative repair.
