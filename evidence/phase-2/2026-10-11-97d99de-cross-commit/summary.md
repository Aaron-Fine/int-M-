# Cross-commit stable-pass timing — 2026-10-11 @ 97d99de

How much faster is the unified kernel than main before and after PR 15? Each
commit's own production `CpuRenderer` (serial, Node 24, no worker pool, default
options, `coarseStride` 8) renders the same views; the stable-pass time is the
interval from the coarse frame to the stable frame. Harness:
`cross-commit-bench.ts.txt`, copied into a worktree of each commit and built
with that commit's sources. One process per (case, commit); the first render
is warmup; median of 3 timed renders. Cases ran sequentially with the three
commits interleaved per case and nothing else running.

- `296d5be`: main immediately before PR 15 (mainline kernel).
- `49845bf`: main with PR 15 merged (mainline kernel plus the PR 15 raster
  optimizations, including real-axis half classification).
- `97d99de`: this branch — watched-lag triggered kernel (default), two-lane
  row kernel, prepared coordinates, conjugate mirroring on by default.

| Case                            | Raster    | pre-PR 15 ms | PR 15 ms | head ms | vs pre-PR 15 | vs PR 15 |
| ------------------------------- | --------- | -----------: | -------: | ------: | -----------: | -------: |
| pr15-full-set-512               | 512×384   |        185.9 |    123.4 |    12.5 |        14.9× |     9.9× |
| pr15-period-three-768           | 768×512   |       2336.5 |   2099.8 |   155.7 |        15.0× |    13.5× |
| pr15-full-set-square-1024       | 1024×1024 |       1110.1 |    594.0 |    69.3 |        16.0× |     8.6× |
| pr15-rabbit-square-768          | 768×768   |       4642.2 |   4157.0 |   292.6 |        15.9× |    14.2× |
| mi-easy-default-full            | 1024×640  |        493.0 |    279.9 |    36.3 |        13.6× |     7.7× |
| mi-easy-exterior-heavy          | 1024×640  |        148.2 |    155.1 |    39.9 |         3.7× |     3.9× |
| mi-easy-main-cardioid           | 1024×640  |        166.3 |    147.1 |    40.9 |         4.1× |     3.6× |
| mi-easy-period2-bulb            | 1024×640  |        147.0 |    137.1 |    29.4 |         5.0× |     4.7× |
| mi-hard-rabbit-boundary         | 1024×640  |       4780.2 |   4278.4 |   307.8 |        15.5× |    13.9× |
| mi-hard-supplied-126x           | 1024×640  |      10152.7 |   9431.8 |   382.3 |        26.6× |    24.7× |
| mi-hard-supplied-609x           | 1024×640  |       3392.2 |   3270.0 |   169.5 |        20.0× |    19.3× |
| mi-hard-supplied-13x            | 1024×640  |       7763.0 |   6954.0 |   294.9 |        26.3× |    23.6× |
| mi-fallback-unknown-high-period | 1024×640  |      13639.9 |   8355.1 |   765.7 |        17.8× |    10.9× |
| mi-fallback-weak-attraction     | 1024×640  |      29769.5 |  26822.6 |  1337.3 |        22.3× |    20.1× |
| mi-fallback-ambiguous-boundary  | 1024×640  |        925.4 |    810.0 |   103.8 |         8.9× |     7.8× |
| mi-fallback-budget-exhaustion   | 1024×640  |      20466.9 |   9408.5 |   490.4 |        41.7× |    19.2× |
| mi-scale-6mx-basilica-rim       | 1024×640  |      13736.8 |   4362.6 |   358.1 |        38.4× |    12.2× |

**Geometric mean over the 17 cases: 14.7× faster than pre-PR 15 main, 11.0×
faster than PR 15 main.** The first four rows are PR 15's own measurement
cases; the rest are the frozen corpus at the shipping raster with each case's
quality profile.

## Semantics

- Per-pixel status of the stable frame (`semantic-comparison.json`): **zero
  mismatches** between head and both older commits on all 10,223,616 pixels.
  The older commits run the pre-verifier mainline kernel, so period and
  multiplier semantics differ by design (primitive-period reduction,
  attraction margin, scale-aware closure); only status is compared across
  kernels.
- Head versus the legacy verifier scan (`kernel-parity-1024x640.txt`, frozen
  corpus at 1024×640): zero status, period, or multiplier-bit differences on
  every pixel — the watched-lag kernel reproduces the legacy scan exactly here.

## Limitations

- Node serial renderer: no worker pool, no browser, no colorization or
  presentation. Browser screening evidence for the default flip is recorded
  separately (Stage A screening run of the same date).
- 3 timed renders per (case, commit), one machine; differences of this size
  are far outside run-to-run noise (the tournament's in-tree default-path
  check measured 0.996× [0.989, 1.003]) but no paired intervals are computed.

Files were formatted with Prettier (whitespace only) before the manifest was regenerated.
