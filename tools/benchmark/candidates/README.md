# Optimization tournament: how to add a candidate

The judge (`npm run tournament`) decides, impartially and reproducibly, which
optimization candidates are correct and fastest. You do not run the judge to
"win": you add one file that renders a corpus case through production code with
your optimization flag enabled. The judge does the rest.

> All numbers are **directional Node evidence, serial CPU renderer, local
> laptop; not the release protocol; browsers via CI/Stage A.**

## Adding a candidate (three steps)

1. Create `tools/benchmark/candidates/<id>.ts` exporting a `Candidate`
   (`./types.ts`). The `id` is lowercase kebab-case and unique.
2. Register it in `tools/benchmark/candidates/index.ts`: **one import line and
   one array entry**.
3. Run `npm run tournament -- parity --candidates <id>`, then
   `npm run tournament -- all --candidates <id>`.

Do not edit the judge (`tools/benchmark/judge/`, `tournament.ts`), the baseline,
or the corpus. Your optimization lives in `src/` behind a flag; your candidate
file only turns the flag on.

## Minimal candidate

Most candidates wrap the production renderer with a request option. The helper
`productionCandidate` does the rendering, unpacking, colorizing and diagnostics
for you (the worked example is the baseline in `baseline.ts`):

```ts
import { productionCandidate } from './support';
import type { Candidate } from './types';

export const myFlag: Candidate = productionCandidate({
  id: 'my-flag',
  description: 'One sentence: what changes.',
  requestOptions: { quality: { maxIterations: 256, maxPeriod: 32, coarseStride: 2 } }, // any DynamicsRenderRequest option (illustrative; a quality change alters pixels, so the parity gate will report it)
});
```

The baseline is the production `CpuRenderer` with default options, so a
candidate that changes only `requestOptions` is compared against the kernel
that ships. If your flag is not reachable through `DynamicsRenderRequest`,
implement `Candidate` yourself: call your production entry point inside
`render(spec)` and return a `RenderedFrame` (see `types.ts`; `support.ts` has
the unpacking helpers).

The candidate registry (`index.ts`) is currently empty: the reference-kernel
candidates were removed with ADR 0007. `--include-demo` candidates are the
only ones the judge exercises until a new candidate is registered.

## The contract (`types.ts`)

```ts
interface Candidate {
  id: string;
  description: string;
  render(spec: CaseRenderSpec): RenderedFrame | Promise<RenderedFrame>;
  certificates?(): ReadonlyMap<number, unknown> | Record<string, unknown>;
  reset?(): void;
  tolerance?: FieldTolerancePolicy;
  parityPolicy?: 'bit-identical' | 'semantic-revision'; // default 'bit-identical'
}
```

- `render` may be async (production yields to the event loop). **The whole call
  is what is timed.** It must produce the stable (stride-1) frame. The coarse
  preview pass is part of the production `CpuRenderer.render` and is timed with
  it; if your optimization removes or changes it, that counts.
- `RenderedFrame.readFields()` returns every stored channel (`status`,
  `period`, `smoothIteration`, `multiplierMagnitude`, `multiplierAngle`;
  optional `iterations`, `evidence`). `colorize(view)` returns RGBA for
  `stability`, `multiplier`, `period`. Both are called by the judge **outside**
  the timed region, immediately after `render`, so do not do output conversion
  work you want counted inside `render`; do put your real algorithm there.
- The "stability" view is derived by the production colorizer from the stored
  magnitude; it is checked through the RGBA buffer, not as a separate field.
- `spec.diagnostics` is true only in the untimed parity pass: expose
  `certificates()` then. **Timed renders never see the flag**, so diagnostic
  work cannot slow your timing. There are no per-render counters: the counting
  kernel was removed with ADR 0007.
- `reset()` is called before each case; clear caches that could leak work
  between cases. A candidate may keep a warm cache within a timed series only
  if production would too; the judge renders the same case ABBA repeatedly, so
  a result cache would show absurd speedups and is a defect (the judge cannot
  detect it; reviewers will).

## Parity policies

The corpus is rendered at 256x160 for every case, plus 1024x640 (the shipping
raster) for `mi-hard-rabbit-boundary` and `mi-easy-default-full`, and compared
with baseline. The oracle fixtures (`fixtures/orbits.v1.json`, rendered as 1x1
rasters) are also checked: you fail if you contradict a fixture or lose a
fixture baseline gets right.

### `bit-identical` (default)

Every field of every pixel and every RGBA view must equal baseline's bit for
bit. `status` and `period` (and any classification field) are always exact.
You may declare tolerances on float fields only:

```ts
tolerance: {
  smoothIteration: { relative: 1e-12 },
  multiplierDirection: { absolute: 3e-8 }, // wrap-safe, on cos/sin of the angle
  multiplierMagnitude: { absolute: 1e-9 },
  rgbaMaxChannelDelta: 1,
  note: 'why this is justified',
},
```

Deviation allowed is `absolute + relative * |baseline|`. The judge enforces
hard ceilings (smooth 1e-9, magnitude 1e-6 abs / 1e-9 rel, direction and
angle 1e-6, RGBA 2 bytes); anything above is rejected as FAIL. Every declared
tolerance and the maximum deviation actually observed are printed in the
report.

### `semantic-revision`

For optimizations that intentionally change results (certified early
acceptance, certified neighbor transplant). Rules, per **baseline** status:

1. Baseline **attracting**: the candidate must also accept, with identical
   status and period. Magnitude and direction may differ only within the
   declared tolerance (the candidate may report lambda at a refined cycle
   point). `iterations`/`evidence` may differ and are not compared.
2. Baseline **escaped**: bit-identical on every field. No smooth tolerance.
3. Baseline **unresolved**: may stay unresolved (exact), or the candidate may
   accept it. Every such conversion is counted, the first 20 are listed
   (case, pixel, c, period, lambda), and the candidate **must** expose its
   certificate data for each converted pixel through `certificates()` (key =
   pixel index `y * width + x`, JSON-serializable value). A conversion that
   becomes an escape fails.
4. Any other difference fails: period change, acceptance turned into
   unresolved, any escape-field change.

RGBA views must match baseline exactly on pixels whose semantic fields did not
change; pixels that changed are exempt (their colors follow their new values).
Passing parity under this policy means "equal except for declared, certified
revisions", and the report, summary table, and `summary.md` label the policy.

## Performance

Only candidates that pass parity are timed, sequentially in one process, for
every corpus case at 512x384 (the raster used for the CPU timings in
`docs/verification/ORBIT-RASTER-OPTIMIZATIONS.md`; small enough to run all 13
cases, large enough that per-pixel work dominates; override with
`--raster WxH`, the shipping raster is `1024x640`). Per case and candidate:
one warmup render per arm, then 11 repetitions (`--reps`), each rendering
baseline and candidate in ABBA order (BAAB on odd repetitions), `global.gc()`
before every render. The repetition value per arm is the mean of its two
renders; the paired ratio is baseline/candidate (above 1 is faster). Reported
per case: median ratio, bootstrap 95% CI of the median (seed 0x1d3a5, 2000
resamples), P10/P90; aggregated: geometric-mean speedup over cases with a
hierarchical bootstrap CI, worst case, number of cases more than 3% slower.

Ranking is by geometric-mean speedup; a CI containing 1.0 is reported as
"indistinguishable". A case counts as a regression when the median ratio is
below 1/1.03; "CI-confirmed" when the whole CI is.

## Commands

```sh
npm run tournament -- parity [--candidates a,b] [--cases id,id] [--include-demo]
npm run tournament -- perf   [--reps N] [--raster WxH] ...
npm run tournament -- report [--out DIR]     # parity + perf + evidence files
npm run tournament -- all    ...             # same as report
npm run tournament -- report --from DIR      # re-render summary.md from DIR/results.json
```

Evidence goes to `evidence/phase-2/optimization-tournament/<date>-<shortsha>/`
(`results.json`, `summary.md`) unless `--out` is given. Close other heavy
processes first: the judge records load average at start but cannot fix a busy
machine. `--include-demo` adds the judge's self-test candidates
(`baseline-clone`, and deliberately wrong ones that must FAIL).
