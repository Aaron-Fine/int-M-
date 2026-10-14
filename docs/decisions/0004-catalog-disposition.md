# ADR 0004: Catalog disposition for Phase 2

- Status: Accepted; closes the Phase 2 catalog-scope decision
- Date: 2026-09-02
- Decision baseline: `f0044b3`
- Governs: [catalog/](../../catalog/README.md), workstream F of the
  [performance plan](../plans/int-m-performance-plan.html)

## Context

The performance plan's §6 target architecture describes a four-layer catalog:
the curated identity layer, an exhaustive period-12 core (4,016 hyperbolic
component centers), demand-loaded performance patches, and an ephemeral
session atlas. Building the generated core is the largest single deliverable
in the plan: a pinned exact/ball-arithmetic toolchain, degree-2048 root
isolation, independent cross-checking, a binary schema, and dynamic marker UI.

Plan revision 3 demoted workstream F to conditional/deferred on four recorded
facts. First, the checkpoint classifier (workstream C) detects periods 5–12
systematically with no catalog data, so the plan's hard-view exit criterion
never touches F. Second, the plan's own coverage analysis shows an arbitrary
deep view may contain no period-12-or-lower center, so the generated core
cannot be load-bearing for speed at the zoom ceiling. Third, catalog seeding
matters only through catalog-seeded Newton (workstream G), which is itself
conditional and has independent seed sources (the session atlas and
adjacent-pixel transplantation). Fourth, F's ship gate is correctness, not
speed — it is an atlas product feature wearing a performance-plan hat. The
frozen benchmark corpus v1 correspondingly reserves its Catalog class as
conditional on F or G shipping
([PERFORMANCE-CORPUS.md](../verification/PERFORMANCE-CORPUS.md)).

## Decision

Keep the curated identity layer as the only shipped catalog in Phase 2, and
defer the generated period-12 core and the demand-loaded runtime shards to a
product (atlas) phase:

- `catalog/components.v1.json` — the eleven named period 1–4 component
  centers — is retained as-is for navigation, tests, explanations, and stable
  IDs. It keeps its existing Phase 1 validation
  (`npm run catalog:check` regeneration check; CC0-1.0 data licensing).
- The exhaustive period-12 core, the compact index, demand-loaded shards, and
  the dynamic marker/clustering UI are **not built in this phase**. The
  deferred default flips only if workstream F's evidence gate fires: the
  checkpoint classifier and the Newton/transplantation proof of concept must
  quantify seed value that checkpoint detection alone cannot provide, and any
  generated data ships only after independent validation (counts, residuals,
  divisor exclusions, conjugate closure) with a pinned, reproducible
  toolchain.
- The requirement text stays conditional rather than retired:
  `MI-PERF-003` records both the intact curated layer and the conditional
  generated-core clause
  ([REQUIREMENTS.md](../verification/REQUIREMENTS.md#phase-2-performance-requirements)).

## Consequences

- Phase 2 carries no generated-data correctness risk: nothing ships that
  cannot currently be reproduced and cross-checked, and the curated layer's
  Phase 1 accessibility validation stands (plan §12 exit criteria).
- The catalog remains a navigation and explanation feature in this phase, not
  a performance dependency; corpus v1 needs no Catalog class and no
  cold/warm-shard operational cases.
- The deferral is a sequencing decision, not a rejection: the plan's §6
  generator specification (exact-period center factors by integer-polynomial
  division, independent validation, content hashes) remains the
  product-phase specification if the evidence gate fires later.
- The ephemeral session atlas is unaffected by this decision and remains
  unbuilt until a candidate source consumes it.
