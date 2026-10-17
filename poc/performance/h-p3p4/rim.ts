import { readFileSync } from 'node:fs';
import { createOrbitSample } from '../../../src/domain/orbit.ts';
import { tryP3, tryP4 } from './p34.ts';
const px = JSON.parse(readFileSync('pixels-256x160.json', 'utf8'));
const s = createOrbitSample();
for (const id of Object.keys(px)) {
  let lo = Infinity,
    hi = 0,
    n = 0;
  for (const [re, im, st] of px[id].all)
    if (st === 0 && (tryP3(re, im, s) || tryP4(re, im, s))) {
      n++;
      lo = Math.min(lo, s.multiplierMagnitude);
      hi = Math.max(hi, s.multiplierMagnitude);
    }
  if (n)
    console.log(
      id,
      'prod-unresolved now algebraic:',
      n,
      '|λ| range',
      lo.toFixed(9),
      hi.toFixed(12),
    );
}
process.exit(0);
