# ADR 0008: Remove conjugate mirroring

- Status: Accepted
- Date: 2026-10-16

## Context

For a view centred exactly on the real axis (`center.im === 0`), the lower
half of the image is the conjugate of the upper half. The classifier could
classify only the upper half and copy the rest, with bit-identical output
(the symmetry is proved in `proof/IntMProof/Symmetry.lean`). The optimization
applied only to such views: in the frozen corpus, 3 of 13 views (the default
full set, the Feigenbaum point `mi-fallback-budget-exhaustion`, and the
basilica rim).

The release run
([evidence](../../evidence/phase-2/2026-10-15-9e70551-conjugate-mirror/summary.md))
measured the classifier at 1.39× in Chrome and 1.24× in Firefox on the default
view, below the plan's ≥1.6× gate. The other two symmetric views (Fallback
and Scale classes) reached 1.4×–1.8× in wall time.

## Decision

Remove it (owner decision, 2026-10-16): "Considering its limited scope of
applicability I do not think that the added complexity is worth it. Lets
remove it."

## Consequences

- Every row is classified directly, and bands cover the whole raster. The
  browser has no renderer toggles: `?conjugateMirror=0` is ignored like any
  unknown parameter.
- Pixels are unchanged, since mirroring was bit-identical. The golden kernel
  fixture and the stable-frame hashes are unchanged.
- Latency on the three symmetric views rises to the mirror-off arm of the
  paired release run. The default view's stable wall time goes from 196.6 to
  238.4 ms in Chrome and from 138 to 173 ms in Firefox (Easy budget 250 ms).
  The Feigenbaum point goes from 521.6 to 809.5 ms in Chrome and from 600 to
  967 ms in Firefox. The basilica rim goes from 363.6 to 507.1 ms in Chrome and
  from 457 to 705 ms in Firefox (Fallback and Scale budget 1,500 ms). Every
  budget still holds, but the Chrome default-view margin shrinks to about 12 ms
  in that run. The owner has deferred the confirming headed release session on
  the mirror-free build.
- The Lean symmetry theorem stays, since it concerns the mathematics. A future
  reintroduction would start from it and from the removed code at the commit
  before the removal (`git log -- src/domain/conjugate-mirror.ts`).
