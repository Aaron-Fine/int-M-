# Phase 0 rendering experiment protocol

This protocol makes the Worker CPU, direct WebGPU, and perturbation-tile
experiments comparable. An absent result is recorded as absent; a renderer
design document is not a measurement.

## Fixed cases

| Case                            | Viewport                             |    Raster | Quality                   |
| ------------------------------- | ------------------------------------ | --------: | ------------------------- |
| `full-set-512`                  | center `-0.5 + 0i`, `spanY=2.5`      | 512 × 384 | 512 iterations, period 32 |
| `period-three-neighborhood-768` | center `-0.12 + 0.74i`, `spanY=0.35` | 768 × 512 | 512 iterations, period 32 |

The CPU harness implements both cases. A GPU or perturbation harness must use
the same canonical `c` mapping, raster, numerical budgets, semantic status
codes, and output fields.

## Required environment record

- commit SHA and uncommitted-change state;
- browser and runtime versions;
- operating system;
- CPU model and logical-core count;
- GPU model, driver, and WebGPU adapter limits where applicable;
- total memory and reported GPU memory where available;
- power mode; and
- whether the run represents the four-core integrated-graphics target.

## Required measurements

Run one unrecorded warm-up followed by at least five recorded samples per case.
Report median and 95th percentile for:

- time to complete coarse frame;
- time to stable frame;
- cancellation acknowledgement;
- colorization-only time;
- peak retained semantic bytes;
- GPU allocation bytes where applicable; and
- browser main-thread tasks longer than 50 ms.

For direct WebGPU, also report:

- adapter availability in current Firefox and Chrome;
- shader precision and practical `f32` zoom limit;
- sampled status, period, and multiplier disagreement against the Decimal
  fixtures and CPU reference; and
- unresolved count and any hardware-specific failures.

For perturbation, also report:

- CPU reference-orbit precision and generation time;
- per-tile delta precision;
- rebases and detected glitches;
- direct high-precision disagreements; and
- reference-orbit and tile memory.

## Current results

| Experiment        | Harness                | Recorded result                                                                         | Closeout state                                                                                  |
| ----------------- | ---------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Worker CPU        | `npm run evidence:cpu` | [`cpu-reference-2026-07-29.json`](../../evidence/phase-0/cpu-reference-2026-07-29.json) | Partial: direct renderer invocation in hosted container, three samples, no worker/browser trace |
| Direct WebGPU     | None                   | None                                                                                    | Not run                                                                                         |
| Perturbation tile | None                   | None                                                                                    | Not run                                                                                         |

The CPU result establishes that the harness works and exposes a meaningful
worst-case difference between the two views. It does not satisfy the
target-hardware budget, the five-sample protocol, or the three-renderer
comparison.
