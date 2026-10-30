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
2. **No interim heuristic.** The closure tolerance is not made to depend on
   the view (see the rejected alternative below). The classification of a
   pixel stays a function of its parameter `c` (and the quality profile), as
   ADRs 0010 and 0013 already require.
3. **Precision floor for any new arithmetic backend.** A backend with
   different precision, such as perturbation, must show that the arithmetic
   error of its closure and divisor frames stays safely below the acceptance
   and exclusion bounds. Where that margin cannot be shown, the pixel is
   unresolved, never accepted. This depends on the backend, not the view.
   Packet 1 and 3's audited budgets are the model for it.
4. **Deeper zoom requires certified acceptance.** Before the zoom ceiling is
   raised, interior classification beyond today's bound moves to acceptance
   through `existsUnique_primitive_critical_of_center_window`
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

5. Raising the zoom ceiling still requires the Phase 3 product-need gate and
   release evidence ([proof program](../verification/PHASE-3-PROOF-PROGRAM.md)).
   This ADR adds Decisions 3 and 4 to those requirements.

## Rejected alternative: a depth-scaled tolerance

An earlier draft of this ADR (2026-10-29, same day) required any deeper or
differently precise classifier to cap the acceptance bound at a fixed fraction
of the view's pixel spacing. The owner withdrew it after reviewing its impacts:

- **The answer would depend on the view.** The same `c` could be attracting
  at one zoom or window size and unresolved at another. Zooming in could flip
  a pixel. The inspector, the semantic cache and shared URLs would all have to
  carry the view's pixel spacing to stay consistent.
- **It does not remove the cause.** The false interiors come from transients:
  orbits pass close to a cycle and later leave. They can come arbitrarily
  close, so any tolerance can be fooled. A tighter one only makes it rarer,
  and no theorem relates a fraction of a pixel to correctness.
- **It costs where nothing is broken.** Inside the bound no false interior
  was observed. A tighter bound there would turn slow-converging boundary
  pixels unresolved or cost iterations, and change the goldens.
- **It would be replaced.** Its only use is deeper zoom, which already needs
  Phase 3, where Decision 4 is the target.

If an interim is ever needed, it should depend on `c` alone. One example:
require the closure residual to contract by about `|λ|` over one more period
before accepting. That is the uncertified form of the `r(1 − q)` closure
margin above, and it is recorded here as an option, not a requirement.

## Consequences

- No user-visible or fixture change now.
- Phase 3 packet 4 (glitch repair and rebasing) and any perturbation renderer
  must meet the precision floor (Decision 3). Any deeper zoom must use
  certified acceptance (Decision 4). The packet 3 pilot's mitigation of
  checking only the last window of a certified-bounded prefix is not a
  substitute for either.
- **Evidence for Decision 1:** a committed run
  ([2026-10-29-c5da7c3-closure-tolerance](../../evidence/phase-2/2026-10-29-c5da7c3-closure-tolerance/summary.md))
  compared production `classifyOrbit` with the independent interval oracle on
  a 1/256 subsample of the five deepest frozen-corpus views (including the
  6,000,000× case) at the shipping raster, and on four minibrot tiles at the
  bound's pixel pitch. Of 5,389 attracting verdicts, **0 are false interiors**
  (none escapes within four times the iteration budget). 9 escape iterations
  of 15,573 shifted (-40 to +4 steps), and 1 production escape was not
  confirmed by the oracle within its budget; none changes a status. Controls
  beyond the bound (`2^-33`, `2^-40`) reproduce 9 false interiors, so the
  comparison can detect them. It is a subsample and certifies escape only:
  evidence, not proof, and no period comparison.
