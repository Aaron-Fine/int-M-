# ADR 0015: The verifier's closure tolerance and the zoom bound

- Status: Accepted
- Date: 2026-10-29

## Context

The common verifier (`src/domain/verifier.ts`, `src-verifier-1.0.0`) accepts a
proposed cycle when its closure residual is at most `1e-8 · s`, with
`s = max(1, |Re z|, |Im z|)`. Divisors are excluded above `1e-6 · s`, and the
multiplier must satisfy `|λ| < 1 − 1e-12`. The closure bound is **absolute**:
it does not depend on the view's depth or on the arithmetic that produced the
frames.

At the supported ceiling of `6,000,000×`
([ADR 0002](0002-phase-0-renderer-zoom-and-gpu-gate.md)), the minimum span is
`2.5 / 6,000,000`. That is about `2^-31` per pixel at 1,000 px height, so
`1e-8` spans roughly 20 pixels.

The Phase 3 packet 3 pilot
([PERTURBATION-VERIFIER-PILOT.md](../verification/PERTURBATION-VERIFIER-PILOT.md))
evaluated the verifier's decision on exact orbit frames, checked against an
independent interval oracle. It compared production `classifyOrbit` with the
oracle on minibrot tiles (scratch probe, directional):

- **Inside the bound** (32×32 tiles at `2^-31` around the period-34 and
  period-61 minibrots, and `2^-26` around period 25): no false interior.
  5 of 1,024 escape iterations on one tile shifted by a few steps.
- **Beyond the bound** (`2^-33`, `2^-40`): escape iterations shift by 1 to 19
  steps from binary64 rounding. Separately, 3 escaping pixels per tile are
  accepted as attracting (periods 34 and 61, `|λ|` from 0.51 to 0.999). Their
  orbits pass within `1e-8` of the minibrot's cycle at an early cycle start
  (iterations 72 to 184), then escape at iterations 534 to 1279. The verifier's
  decision on the **exact** frames at that start accepts as well, so the cause
  is the policy, not rounding.

So a deeper zoom, or a more precise backend such as perturbation, cannot reuse
the absolute closure bound. Higher precision fixes the arithmetic, not the
semantics.

## Decision

1. **The zoom ceiling stays at `6,000,000×`.** The production verifier policy,
   `VERIFIER_REVISION`, the kernels and every golden fixture are unchanged by
   this ADR. Inside the bound, the evidence above shows no false interior.
2. **Short-term rule for any change that goes deeper or changes the
   classifier's arithmetic precision:** the closure tolerance must scale with
   the view's depth and with the precision of the arithmetic in use. Such a
   change must state, and test, all of:
   - an **upper limit tied to depth**: the acceptance bound stays below a fixed
     fraction of the pixel spacing of the view being rendered, so a nearby
     exterior orbit's close pass cannot satisfy it;
   - a **lower limit tied to precision**: the acceptance bound stays above a
     stated multiple of the closure frame's arithmetic error at the chosen
     precision (binary64 today; the audited perturbation budgets of packets 1
     and 3 when they apply), so true cycles can still be accepted;
   - **refusal** when the precision limit exceeds the depth limit: the pixel
     is unresolved, never accepted;
   - the **exclusion bound** scaled with the acceptance bound, keeping today's
     `10^4` ratio of squares unless the change argues otherwise.

   The constants are set in the change that applies the rule, from measured
   evidence against an independent oracle. That change also bumps
   `VERIFIER_REVISION` and updates the goldens with oracle evidence, as the
   [fixture policy](../../fixtures/README.md) requires.

3. **Long-term target: certified acceptance.** Before the zoom ceiling is
   raised, interior classification should move toward acceptance through
   `existsUnique_primitive_critical_of_center_window`
   (`proof/IntMProof/CertifiedAcceptance.lean`). That means a disk around the
   cycle start with:
   - a uniform return-multiplier bound `q < 1`;
   - a closure margin `≤ r(1 − q)`;
   - proper-divisor separation;
   - critical-orbit entry.

   This replaces the tolerance with a proof that an attracting cycle exists,
   and it yields a certified multiplier enclosure. Its prerequisites, in order:
   a research pilot on the packet 3 tiles (acceptance and refusal counts, and
   cost); Lean lemmas connecting the computed disk walk to the theorem's
   hypotheses; and a binary64 ball-arithmetic production path measured against
   ADR 0010's overhead gate.

4. Raising the zoom ceiling still requires the Phase 3 product-need gate and
   release evidence ([proof program](../verification/PHASE-3-PROOF-PROGRAM.md)).
   This ADR adds the requirement that the closure semantics are addressed by
   Decision 2 or Decision 3 first.

## Consequences

- No user-visible or fixture change now.
- Phase 3 packet 4 (glitch repair and rebasing) and any perturbation renderer
  must carry a depth- and precision-aware acceptance rule (Decision 2) or
  certified acceptance (Decision 3). The packet 3 pilot's mitigation of
  checking only the last window of a certified-bounded prefix is not a
  substitute for either.
- The inside-the-bound result is a directional scratch probe. A committed
  evidence run, with an independent oracle across the frozen corpus's deepest
  views, is a useful follow-up. It would turn "no false interior observed"
  into recorded evidence.
