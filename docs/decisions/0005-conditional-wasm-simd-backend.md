# ADR 0005: Conditional Wasm SIMD backend

- Status: Proposed; direction accepted, implementation not started
- Date: 2026-09-02
- Decision baseline: `f0044b3`
- Governs: workstream I of the
  [performance plan](../plans/int-m-performance-plan.html)

## Context

The plan sequences Wasm SIMD late on purpose (§11 sequencing rationale): a
vectorized `O(iterations × periods)` algorithm still wastes most of its work,
so the scalar algorithm is changed first — PR 3 froze acceptance, PR 4
replaced the all-lag scan with checkpoint candidates — and homogeneous
work queues that SIMD can exploit exist only after that. Fixed-width
WebAssembly SIMD with `f64x2` is available in modern Chrome and Firefox, but
plan §7 is explicit that browser support alone does not guarantee speed,
successful instantiation, or parity on every target environment.

The repository currently contains no WebAssembly code, no Rust toolchain
pinning, and no `wasm-build.json` evidence path; the only backend is the
binary64 TypeScript scalar kernel, with the automatic scalar Worker CPU
fallback requirement (`MI-PERF-005`) already normative. No measurement exists
for any Wasm variant on this codebase.

## Decision

Accept the conditional direction of plan §7 as the standing proposal, with
implementation gated on all of the following conditions:

- **Scalar Wasm is a gated stepping stone, not a deliverable.** It ships
  independently only if it clears ≥1.2× the staged TypeScript classifier with
  semantic parity.
- **SIMD Wasm must earn its complexity on top of scalar Wasm:** classifier
  ≥1.20× scalar Wasm, combined classifier ≥1.50× staged TypeScript, and
  end-to-end ≥1.25× staged TypeScript in each release browser, with no corpus
  case beyond the normative regression cap (the plan's final noise-aware
  5%/20 ms rule; SIMD's workstream-specific allowance is a 10% hard-case
  tail).
- **Capability handling is mandatory:** feature detection of the actual
  module, a self-test at instantiation, and automatic fallback to the
  TypeScript scalar path on unsupported or failed execution. The SIMD module
  is a separate artifact so unsupported engines reject it at validation time;
  TypeScript — not code inside that module — is the fallback.
- **Design constraints from plan §7** carry into any implementation: pinned
  Rust `wasm32-unknown-unknown` crate, no relaxed SIMD and no fast-math
  assumptions, one private instance and pre-sized aligned arena per tile
  worker, structure-of-arrays inputs, scalar odd tail and scalar fallback for
  divergent queues, no JavaScript↔Wasm crossing per pixel, cold compilation
  never delaying the first coarse preview, responsiveness budgets
  (kernel-call p95 ≤25 ms and p99 ≤50 ms; cancel-to-child-quiescence p95
  ≤50 ms), and overhead caps (packing, egress copy, and merge ≤15% of stable
  wall time; peak memory <25% above staged TypeScript).

Status: **proposed and not started.** No workstream I PR exists; nothing in
this ADR authorizes shipping Wasm before its gates are met with Stage A-grade
evidence under the
[benchmark contract](../verification/PERFORMANCE-CORPUS.md#protocol-summary).

## Consequences

- The TypeScript scalar kernel remains the shipping backend and the mandatory
  fallback; `MI-PERF-005` (capability detection, self-test, parity,
  fallback) is the requirement any future implementation satisfies.
- "SIMD is available" is never a shipping reason: insufficient end-to-end gain
  is a defined rejection path, and a rejected experiment is recorded with its
  measurements per the plan's closeout rules.
- If pursued, the work arrives after the scalar algorithm is finalized, so
  lane queues are same-stage/same-period and the comparison baseline is the
  staged TypeScript classifier — not the legacy scan.
- The deployment CSP is reviewed explicitly at that time and is not weakened
  silently; if shared memory were ever proposed, the COOP/COEP question would
  be a new decision, not an extension of this one (plan §12 exclusions).
- Revisit triggers: Stage A completing the staged-TypeScript baseline, or a
  workstream B/C gate outcome that changes the comparison baseline.
