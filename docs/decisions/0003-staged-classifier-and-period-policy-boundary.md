# ADR 0003: Staged classifier and period-policy boundary

- Status: Accepted; closes the PR 3–PR 5 classifier-staging decision
- Date: 2026-09-02
- Decision baseline: `f0044b3`

## Context

The Phase 2 performance plan
([§2 diagnosis](../plans/int-m-performance-plan.html)) identifies the dominant
classifier cost: after warmup, the legacy orbit classifier scans candidate
lags from period 1 through `maxPeriod` for every unresolved iteration,
approximately `O(maxIterations × maxPeriod)` comparisons per pixel — roughly
512 × 32 on Balanced and 1024 × 64 on Detailed before verification and output
work. Replacing that scan changes when and how periods are detected, so it
touches the project's truth guarantees, not only its speed.

Three plan invariants constrain any change. Candidate generation is not proof
(invariant 1): approximate checkpoints, catalog proximity, charts, and algebra
may only propose. One verifier decides (invariant 2): every attracting result
passes the same finite-value, primitive-period, closure, residual, and
attraction checks. Systematic and opportunistic claims differ (invariant 8):
quality describes the guaranteed search budget, and independently found higher
periods may be displayed only after verification and with origin metadata.

The work also has a measurement problem. A new detection schedule can shift
detection iteration, propose different cycle-start phases, and legitimately
round `|λ|` differently; the semantic compatibility contract (plan §3) requires
that such changes be measured against the legacy classifier and adjudicated by
an independent oracle before they can become the reported answer.

## Decision

Stage the classifier work in three landed layers, each with a frozen,
individually versioned boundary:

1. **Verifier-gated acceptance (PR 3).**
   [src/domain/verifier.ts](../../src/domain/verifier.ts) freezes the common
   acceptance policy (revision `src-verifier-1.0.0`): finite-value refusal,
   scale-aware closure, three-way proper-divisor reduction, and the attraction
   margin. It is the only code path that writes attracting status; the lag
   scan and the analytic fast paths migrated to it. Mathematics and thresholds
   are specified in [PERFORMANCE-MATHEMATICS.md](../PERFORMANCE-MATHEMATICS.md).
2. **Checkpoint candidates behind a differential flag (PR 4).**
   [src/domain/checkpoint.ts](../../src/domain/checkpoint.ts) (revision
   `src-checkpoint-1.0.0`) ports the PoC's power-of-two checkpoint schedule
   exactly. It is reachable through the versioned
   `OrbitOptions.classifierMode`: `'legacy-scan'` (default) | `'checkpoint'` |
   `'differential'`. Differential mode runs both kernels per pixel, reports the
   legacy answer, and counts status/period/`|λ|`-bit disagreements into a
   preallocated record. **The legacy scan remains the reported answer
   everywhere; the default flips only on Stage A browser evidence** (plan §9).
3. **Period policy boundary (PR 5).**
   [src/domain/period-policy.ts](../../src/domain/period-policy.ts) (revision
   `period-policy-1.0.0`) separates `systematicMaxPeriod` (the profile's
   deliberate search range within `maxIterations`) from
   `opportunisticMaxPeriod` (the highest period allowed from an independent
   candidate source, same verifier, bounded cost), stamps the plan §4
   `evidenceSource` vocabulary on rich results, and derives the user-facing
   quality language. The initial derivation keeps the opportunistic ceiling
   equal to the systematic one, because no independent candidate source has
   shipped a measured win above the caps; the policy is test-pinned so raising
   it cannot alter classification outcomes, `maxIterations`, or acceptance
   thresholds.

## Consequences

- The `O(iterations × periods)` scan is still the shipped behavior. The
  directional PoC and pr4 evidence (comparison reductions ~97% per raster
  slice, hard-view speedups of 11.6–14.8×, zero period disagreements,
  unresolved never worse than legacy) supports the checkpoint schedule but
  does not decide the default; Stage A does.
- Candidate sources can be added without touching acceptance: proposals are
  capped, budgeted, and verified through the frozen policy, so no future
  source (catalog, chart, algebra, Newton) changes what "attracting" means.
- The period-policy vocabulary can never masquerade as a quality increase:
  raising the opportunistic ceiling is a seam for verified discoveries only,
  and a policy revision bump is required when the derivation or per-profile
  values change.
- Divergence measurement is honest by construction: the differential mode
  counts `|λ|` last-ulp rounding differences instead of hiding them, and the
  double-double oracle adjudicates the class.
- Unresolved remains the answer at ambiguity and at budget end; the kill
  condition (any false attracting result or wrong primitive period;
  unresolved rate +>0.1 percentage point) is evaluated at Stage A, not by
  this ADR.
