# Component catalog

`components.v1.json` is the initial Mandelbrot Interiority catalog. It contains
every hyperbolic-component center of exact period one through four: eleven
entries in total.

The numerical centers are generated independently by
[`tools/generate_catalog.py`](../tools/generate_catalog.py). The generator
discovers roots of `f_c^p(0) = 0`, excludes roots belonging to every proper
divisor of `p`, and refines the remaining roots with decimal arithmetic. Run:

```sh
npm run catalog:check
```

The check regenerates the center set and compares it with the curated catalog.
This is reproducible validation, not a claim of formal certification.

Combinatorial fields are deliberately optional. Internal addresses, angled
internal addresses, characteristic rays, and familiar names appear only where
they have been reviewed. An absent field means “not yet recorded,” not “does
not exist.”

The catalog data is dedicated to the public domain under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). The generator
and application source remain licensed under GPL-3.0-only.
