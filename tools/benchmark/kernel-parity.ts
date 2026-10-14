/**
 * Dev aid: per-pixel parity of a classifier mode against legacy-scan over the
 * corpus (status, period, multiplier), untimed.
 * Usage: node kernel-parity.js [WxH] [mode]
 */
import {
  createOrbitSample,
  createViewportTransform,
  OrbitClassifier,
  type ClassifierMode,
} from '../../src/domain';
import { loadCorpusCases, parseRaster, profileQuality } from './judge/corpus';

const size = parseRaster(process.argv[2] ?? '256x160');
const mode = (process.argv[3] ?? 'triggered-scan') as ClassifierMode;
const a = createOrbitSample();
const b = createOrbitSample();
let totalBad = 0;
for (const c of loadCorpusCases()) {
  const q = profileQuality(c.profile);
  const opts = { maxIterations: q.maxIterations, maxPeriod: q.maxPeriod };
  const legacy = new OrbitClassifier(opts);
  const cand = new OrbitClassifier({ ...opts, classifierMode: mode });
  const tr = createViewportTransform(c.viewport, size);
  let status = 0,
    period = 0,
    lost = 0,
    gained = 0,
    lamMax = 0,
    lamSame = 0,
    att = 0,
    later = 0,
    earlier = 0;
  let first = '';
  for (let y = 0; y < size.height; y += 1)
    for (let x = 0; x < size.width; x += 1) {
      const p = tr.pixelToComplex(x, y);
      legacy.classifyInto(p.re, p.im, a);
      cand.classifyInto(p.re, p.im, b);
      if (a.status !== b.status) {
        status += 1;
        if (a.status === 2) lost += 1;
        if (b.status === 2) gained += 1;
        if (first === '')
          first = `(${x},${y}) legacy ${a.status}/${a.period}@${a.iterations} cand ${b.status}/${b.period}@${b.iterations}`;
        continue;
      }
      if (a.status === 1 && a.smoothIteration !== b.smoothIteration) status += 1000000;
      if (a.status !== 2) continue;
      att += 1;
      if (a.period !== b.period) {
        period += 1;
        if (first === '') first = `(${x},${y}) period ${a.period} vs ${b.period}`;
      }
      const d = Math.hypot(a.multiplierRe - b.multiplierRe, a.multiplierIm - b.multiplierIm);
      if (d === 0) lamSame += 1;
      lamMax = Math.max(lamMax, d);
      if (b.iterations > a.iterations) later += 1;
      if (b.iterations < a.iterations) earlier += 1;
    }
  totalBad += status + period;
  process.stdout.write(
    `${c.id.padEnd(32)} status ${status} (lost ${lost}, gained ${gained}) period ${period} | att ${att} lambda-identical ${((100 * lamSame) / Math.max(1, att)).toFixed(1)}% max|dλ| ${lamMax.toExponential(2)} later ${later} earlier ${earlier} ${first}\n`,
  );
}
process.stdout.write(`TOTAL status+period mismatches: ${totalBad}\n`);
