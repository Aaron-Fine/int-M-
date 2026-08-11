# Phase 0 rendering experiment protocol

This protocol makes the Worker CPU, direct WebGPU, and perturbation-tile
experiments comparable. An absent result is recorded as absent; a renderer
design document is not a measurement.

## Initial fixed cases

| Case                            | Viewport                             |    Raster | Quality                   |
| ------------------------------- | ------------------------------------ | --------: | ------------------------- |
| `full-set-512`                  | center `-0.5 + 0i`, `spanY=2.5`      | 512 × 384 | 512 iterations, period 32 |
| `period-three-neighborhood-768` | center `-0.12 + 0.74i`, `spanY=0.35` | 768 × 512 | 512 iterations, period 32 |

The initial hosted CPU harness implements both cases. The later target-hardware
comparison used square rasters and a tighter rabbit view so it could compare
the CPU and direct WebGPU implementations over identical workloads and add a
1024² capacity case:

| Final comparison case    | Viewport                                                        | Raster    | Quality                   |
| ------------------------ | --------------------------------------------------------------- | --------- | ------------------------- |
| `full-set-512`           | center `-0.75 + 0i`, `spanY=2.5`                                | 512 × 512 | 512 iterations, period 32 |
| `rabbit-detail-768`      | center `-0.1225611668766535 + 0.7448617666197435i`, `spanY=.05` | 768 × 768 | 512 iterations, period 32 |
| `full-set-capacity-1024` | center `-0.75 + 0i`, `spanY=2.5`                                | 1024²     | 512 iterations, period 32 |

CPU and direct WebGPU use the same canonical `c` mapping, rasters, numerical
budgets, semantic status codes, and output fields for those cases. The
perturbation experiment intentionally uses a separate 256² deep tile at
`spanY=1e-8`; comparability there means direct high-precision status and escape
iteration checks against the CPU and GPU results, not an identical full-set
workload.

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

## Final Phase 0 results

| Experiment        | Harness                                                      | Recorded result                                     | Closeout state                                                                                                                |
| ----------------- | ------------------------------------------------------------ | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Worker CPU        | `tools/run-phase0-benchmark.mjs`                             | [Target-hardware benchmark](../PHASE0_BENCHMARK.md) | Pass: Chrome and Firefox worker timing, cancellation, long-task, memory, resolution, and unresolved evidence                  |
| Direct WebGPU     | `tools/phase0-browser-benchmark.ts`                          | [Target-hardware benchmark](../PHASE0_BENCHMARK.md) | Pass as experiment; rejected for production because of Firefox availability, semantic disagreement, and zoom                  |
| Perturbation tile | `tools/generate_perturbation_fixture.py` and browser harness | [Target-hardware benchmark](../PHASE0_BENCHMARK.md) | Pass as experiment; production use deferred because semantic, glitch-recovery, subdivision, and rebase evidence is incomplete |

The target-hardware report records seven warmed samples for the 512² and 768²
cases, three capacity samples at 1024², twelve cancellation samples, browser
and hardware details, error summaries, and declared limitations. For these
small sample counts, the harness's nearest-rank p95 is the recorded maximum.

The application baseline was commit `7c991a2`; the disposable benchmark files
were in the measurement working tree and were subsequently committed in
`b663fdf`. Raw browser JSON was not retained in the repository. That provenance
limitation prevents the report from serving as a permanent performance
guarantee, but it does not prevent the bounded Phase 0 selection: the harness
is now reproducible, the summarized measurements answer the renderer question,
and the production choice is the conservative CPU path. Future performance
claims must rerun the committed harness and retain their raw results.
