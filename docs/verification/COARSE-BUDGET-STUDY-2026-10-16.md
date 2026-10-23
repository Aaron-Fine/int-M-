# Coarse-budget study, 2026-10-16

Method: the coarse pass is the scalar `OrbitClassifier` at stride `max(2, coarseStride)` with `maxPeriod` capped at 16 (see `CpuRenderer.render`); the study reproduces exactly that call. The stable reference is the same sample positions classified at the profile's own stable `maxIterations`/`maxPeriod`. "Resolvable" pixels are those the reference resolves; the left half of the 6,000,000x basilica-rim view is period-4 interior with |lambda| within 5e-6 of 1, which no reasonable coarse budget resolves, so it stays in the reference's unresolved set and does not count against the budget.

Script: `tools/benchmark/coarse-budget-study.ts` (`npm run coarse-budget-study`). Part 2 was not run because the decision rule stopped at step 1.

Machine: Linux 7.2.8-200.fc44.x86_64, Node v24.19.0. Load average at run time: 2.74 (1 min) per /proc/loadavg, down from about 4.5-5 earlier.

## Part 1: unresolved share of resolvable samples by coarse budget

### mi-scale-6mx-basilica-rim (Balanced, stable budget 512, stride 8, 6000000x)

Reference (stable budget) leaves 50.0% of samples unresolved; the remaining 50.0% are resolvable.

| coarse budget | median ms | unresolved of resolvable | left half | right half | flips |
| ------------- | --------- | ------------------------ | --------- | ---------- | ----- |
| 256           | 12.0      | 0.0%                     | n/a       | 0.0%       | 0     |
| 320           | 11.5      | 0.0%                     | n/a       | 0.0%       | 0     |
| 384           | 12.7      | 0.0%                     | n/a       | 0.0%       | 0     |
| 448           | 14.7      | 0.0%                     | n/a       | 0.0%       | 0     |
| 512           | 15.5      | 0.0%                     | n/a       | 0.0%       | 0     |

### mi-hard-supplied-126x (Detailed, stable budget 1024, stride 8, 126x)

Reference (stable budget) leaves 3.1% of samples unresolved; the remaining 96.9% are resolvable.

| coarse budget | median ms | unresolved of resolvable | left half | right half | flips |
| ------------- | --------- | ------------------------ | --------- | ---------- | ----- |
| 256           | 6.0       | 6.5%                     | 7.1%      | 5.8%       | 0     |
| 320           | 6.6       | 5.2%                     | 5.8%      | 4.6%       | 0     |
| 384           | 6.6       | 4.1%                     | 4.6%      | 3.6%       | 0     |
| 448           | 7.0       | 3.3%                     | 3.8%      | 2.8%       | 0     |
| 512           | 7.0       | 2.8%                     | 3.2%      | 2.3%       | 0     |
| 768           | 7.7       | 1.2%                     | 1.3%      | 1.0%       | 0     |
| 1024          | 8.1       | 0.3%                     | 0.3%      | 0.3%       | 0     |

### mi-fallback-budget-exhaustion (Balanced, stable budget 512, stride 8, 2500x)

Reference (stable budget) leaves 30.4% of samples unresolved; the remaining 69.6% are resolvable.

| coarse budget | median ms | unresolved of resolvable | left half | right half | flips |
| ------------- | --------- | ------------------------ | --------- | ---------- | ----- |
| 256           | 13.5      | 20.2%                    | 7.5%      | 51.1%      | 0     |
| 320           | 15.5      | 12.3%                    | 2.7%      | 35.7%      | 0     |
| 384           | 15.5      | 8.7%                     | 1.3%      | 26.8%      | 0     |
| 448           | 16.6      | 6.2%                     | 0.4%      | 20.4%      | 0     |
| 512           | 17.7      | 4.8%                     | 0.0%      | 16.5%      | 0     |

## Decision

No `deepIterations` chosen. Rule branch 1 applied: on the basilica-rim view U256 is 0.0% (< 2.0%), and it is 0.0% at every budget with 0 flips. The resolvable pixels (all in the right half) are already resolved by the coarse pass at 256, and the left half has no resolvable pixels at all (n/a), so there is no first-frame problem on resolvable pixels to fix with a deeper coarse budget. Task 7 is not to be done on this evidence.

Side observation: the 2500x `mi-fallback-budget-exhaustion` view leaves 20.2% of resolvable samples unresolved at 256 (right half 51.1%), falling to 4.8% at 512, so a coarse-budget gap exists there. Under the current ramp (start 1000x, log-linear to 6,000,000x) that view would only receive about 10% of the ramp's rise, so the ramp as designed would not address it.

## Limits

- Node, scalar classifier, one laptop, directional; browser coarse medians would be checked separately in Task 7.
- The left-half period-4 interior of the basilica-rim view is excluded from the target because the reference stable budget does not resolve it.
- Timing was not the deciding factor (the rule stopped on resolved share), so load sensitivity does not affect the decision.
