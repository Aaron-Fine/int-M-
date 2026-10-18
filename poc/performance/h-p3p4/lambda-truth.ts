// Which multiplier is right where production and algebra differ most?
// Reference: iterate far past convergence (orbit settles to the cycle to ~ulp),
// then λ = Π 2 z_j over one period.
import { readFileSync, writeFileSync } from 'node:fs';
import { createOrbitSample } from '../../../src/domain/orbit.ts';
import { tryP3, tryP4 } from './p34.ts';
const px = JSON.parse(readFileSync('pixels-256x160.json', 'utf8'));
const s = createOrbitSample();
const rows: any[] = [];
for (const id of Object.keys(px))
  for (const [re, im, p, mag, ang] of px[id].sel) {
    const ok = p === 3 ? tryP3(re, im, s) : tryP4(re, im, s);
    if (!ok) continue;
    const pr = mag * Math.cos(ang),
      pi = mag * Math.sin(ang);
    rows.push({
      id,
      re,
      im,
      p,
      d: Math.hypot(pr - s.multiplierRe, pi - s.multiplierIm),
      prod: [pr, pi],
      alg: [s.multiplierRe, s.multiplierIm],
    });
  }
rows.sort((a, b) => b.d - a.d);
const out: string[] = [];
for (const r of rows.slice(0, 8)) {
  let zr = 0,
    zi = 0;
  for (let k = 0; k < 3_000_000; k++) {
    const t = zr * zr - zi * zi + r.re;
    zi = 2 * zr * zi + r.im;
    zr = t;
  }
  let lr = 1,
    li = 0;
  for (let k = 0; k < r.p; k++) {
    const a = lr * 2 * zr - li * 2 * zi;
    li = lr * 2 * zi + li * 2 * zr;
    lr = a;
    const t = zr * zr - zi * zi + r.re;
    zi = 2 * zr * zi + r.im;
    zr = t;
  }
  const line = `${r.id} c=${r.re}+${r.im}i p${r.p} |λ|≈${Math.hypot(lr, li).toFixed(6)}  |prod−ref| ${Math.hypot(r.prod[0] - lr, r.prod[1] - li).toExponential(2)}  |alg−ref| ${Math.hypot(r.alg[0] - lr, r.alg[1] - li).toExponential(2)}`;
  console.log(line);
  out.push(line);
}
writeFileSync('lambda-truth.txt', out.join('\n') + '\n');
process.exit(0);
