# Numerical fixtures

`orbits.v1.json` is an independently generated high-precision reference set for
the binary64 TypeScript classifier. It covers:

- an escaped point;
- exact period-one and period-two centers;
- ordinary off-center period-three and period-four attracting points; and
- a known parabolic boundary point that must remain unresolved within the
  declared finite budget.

Regenerate and compare the committed data with:

```sh
npm run fixtures:check
```

The generator uses Python `Decimal` arithmetic at 80 decimal digits and does
not call the TypeScript classifier. Known attracting periods are declared as
fixture inputs; the generator independently iterates to a closed cycle and
computes its multiplier. The TypeScript unit test then compares status, period,
escape iteration, and multiplier magnitude within the declared binary64
tolerance.

These fixtures are useful cross-implementation evidence, not a proof that
every boundary point is correctly classified. The data is dedicated to the
public domain under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/); the generator
and tests remain GPL-3.0-only.
