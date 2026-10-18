// Offline: bounding boxes of the 3 period-3 and 6 period-4 hyperbolic components,
// by tracing c(λ) along rays λ = r e^{iθ} from the Gleason centres (r=0) to the
// boundary (r=1), Newton-continuing the root in c. Boxes only gate the fast path;
// correctness never depends on them.
import { writeFileSync } from 'node:fs';
import { type C, add, sub, mul, sc, peval, roots } from './cx.ts';
// p=3: c^3 + 2c^2 + (1-ν)c + (1-ν)^2 = 0, ν = λ/8
const poly3 = (lam: C): C[] => {
  const nu = sc(1 / 8, lam);
  const a = sub([1, 0], nu);
  return [mul(a, a), a, [2, 0], [1, 0]];
};
// p=4: G4(c) + μ(c^4+c^3-c^2-3) - μ^2(c^2-3) - μ^3 = 0, μ = λ/16
const poly4 = (lam: C): C[] => {
  const mu = sc(1 / 16, lam),
    mu2 = mul(mu, mu),
    mu3 = mul(mu2, mu);
  // G4 = 1 + 2c^2 + 3c^3 + 3c^4 + 3c^5 + c^6
  const co: C[] = [
    [1, 0],
    [0, 0],
    [2, 0],
    [3, 0],
    [3, 0],
    [3, 0],
    [1, 0],
  ];
  co[0] = sub(add(co[0], sc(-3, mu)), sc(-3, mu2));
  co[0] = sub(co[0], mu3);
  co[2] = add(co[2], sc(-1, mu));
  co[2] = sub(co[2], mu2);
  co[3] = add(co[3], mu);
  co[4] = add(co[4], mu);
  return co;
};
const trace = (poly: (l: C) => C[], centre: C) => {
  let box = [Infinity, -Infinity, Infinity, -Infinity];
  const NT = 4096,
    NR = 200;
  for (let t = 0; t < NT; t++) {
    const th = (2 * Math.PI * t) / NT;
    let c: C = centre;
    for (let k = 1; k <= NR; k++) {
      const r = k / NR;
      const lam: C = [r * Math.cos(th), r * Math.sin(th)];
      const co = poly(lam);
      for (let it = 0; it < 30; it++) {
        const [p, d] = peval(co, c);
        const step = [0, 0] as C;
        const dd = d[0] * d[0] + d[1] * d[1];
        if (dd === 0) break;
        c = sub(c, [(p[0] * d[0] + p[1] * d[1]) / dd, (p[1] * d[0] - p[0] * d[1]) / dd]);
      }
    }
    box = [
      Math.min(box[0], c[0]),
      Math.max(box[1], c[0]),
      Math.min(box[2], c[1]),
      Math.max(box[3], c[1]),
    ];
  }
  return box;
};
const out: any = { p3: [], p4: [] };
for (const [p, poly, gleason] of [
  [
    3,
    poly3,
    [
      [1, 0],
      [1, 0],
      [2, 0],
      [1, 0],
    ],
  ],
  [
    4,
    poly4,
    [
      [1, 0],
      [0, 0],
      [2, 0],
      [3, 0],
      [3, 0],
      [3, 0],
      [1, 0],
    ],
  ],
] as const) {
  for (const centre of roots(gleason as C[])) {
    const b = trace(poly as any, centre);
    const pad = 0.02 * Math.max(b[1] - b[0], b[3] - b[2]);
    const padded = [b[0] - pad, b[1] + pad, b[2] - pad, b[3] + pad];
    out['p' + p].push({ centre, box: padded });
    console.log(
      `p${p} centre ${centre[0].toFixed(10)} ${centre[1] >= 0 ? '+' : '-'} ${Math.abs(centre[1]).toFixed(10)}i  box re[${padded[0].toFixed(5)}, ${padded[1].toFixed(5)}] im[${padded[2].toFixed(5)}, ${padded[3].toFixed(5)}]`,
    );
  }
}
writeFileSync('boxes.json', JSON.stringify(out, null, 1));
