# Workstream H spike: closed-form period-3/4 classification (2026-10-16)

These are the throwaway scripts and outputs behind
[WORKSTREAM-H-SPIKE-2026-10-16.md](../../../docs/verification/WORKSTREAM-H-SPIKE-2026-10-16.md).
The evidence is **directional**: Node only, the scalar classifier, a 256×160
raster, one laptop, and no browser runs. The scripts are kept as a record.
They are not maintained, linted or typechecked, and nothing in `src/`
imports them.

The spike ran against `phase-2/closeout` at `84a3f87`. The scripts import the
repository's `src/` through relative paths and run on Node 24 with the
extensionless-import hook:

```sh
cd poc/performance/h-p3p4
node --import ./register.mjs measure.ts     # Amdahl bound  -> measure-256x160.{txt,json}
node --import ./register.mjs compare.ts     # agreement      -> compare-256x160.{txt,json}
node --import ./register.mjs timing.ts      # paired timing  -> timing-256x160.txt
```

- `p34.ts`: the prototype classifier (p3 closed form; p4 Cardano solve inside
  component boxes; everything else falls through to production).
- `boxes.ts` → `boxes.json`: padded bounding boxes of the nine p3/p4
  components.
- `lambda-truth.ts`, `rim.ts`: the multiplier accuracy check and the |λ|
  range of the unresolved → attracting pixels. `lambda-truth.ts` reads
  `pixels-256x160.json`, a 32 MB per-pixel dump from `measure.ts` that was
  not committed; regenerate it first.
- `multpoly.py`, `verify-forms.py`: the symbolic derivation and checks. They
  need `sympy`, which was installed in a scratch virtual environment.
- `timing-fallback.ts`: the fallback-overhead measurement.

Some scripts may refer to helper names from the prototype as it was during
the spike. If one no longer runs against the current `src/`, check out
`84a3f87`.
