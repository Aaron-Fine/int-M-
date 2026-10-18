# ADR 0007: Remove the reference classifier kernels

- Status: Accepted
- Date: 2026-10-16

## Context

ADR 0006 made the watched-lag triggered scan the default after release
evidence in both browsers. The reference lag scan (`legacy-scan`), the
checkpoint schedule, differential mode, the instrumented counting kernel,
and the browser diagnostics around them remained as code nobody runs in
production.

## Decision

Remove them from the codebase (owner decision, 2026-10-16). The bit-for-bit
reference for future kernel changes is the golden kernel fixture
(`fixtures/kernel-golden.v1.json`, `tests/unit/render/kernel-golden.test.ts`):
per-case SHA-256 of the classifier's output channels on the frozen corpus,
generated while `legacy-scan` still existed, with equality between the two
kernels asserted at generation time. The double-double oracle tests remain
the independent correctness reference.

## Consequences

- One classifier, one row path, one renderer; no classifier-mode or
  renderer-variant parameters anywhere.
- A kernel change that alters any output bit fails the golden test; an
  intended change regenerates the fixture in the same commit, with oracle
  evidence for the changed pixels.
- Phase 2 evidence that compared against the reference kernels is
  reproducible from commits up to `872f613`.
- The PoC under `poc/performance/` keeps its own self-contained kernels as
  historical directional evidence.
