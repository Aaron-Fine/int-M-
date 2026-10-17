// Step 3: agreement of the prototype with production on every pixel of every
// corpus view, oracle re-run (huge budget) for any disagreement, and timing.
import { readFileSync, writeFileSync } from 'node:fs';
import {
  OrbitScratch,
  createOrbitSample,
  resolveOrbitOptions,
  classifyInto,
} from '../../../src/domain/orbit.ts';
import { getQualityProfile } from '../../../src/ui/view-state.ts';
import { classifyH, tryP3, tryP4, stats } from './p34.ts';

const W = Number(process.argv[2] ?? 256),
  H = Number(process.argv[3] ?? 160),
  REPS = Number(process.argv[4] ?? 9);
const corpus = JSON.parse(
  readFileSync(new URL('../../../tools/benchmark/corpus.v1.json', import.meta.url), 'utf8'),
);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
const oracleOpts = resolveOrbitOptions({ maxIterations: 5_000_000, maxPeriod: 64 });
const oracleScratch = new OrbitScratch(64);
const res: any[] = [];
let worstDl = 0,
  worstDmag = 0,
  worstDang = 0,
  agreeN = 0;
const lines: string[] = [];
for (const raw of corpus.cases) {
  const q = getQualityProfile(raw.profile.toLowerCase()).quality;
  const opts = resolveOrbitOptions({ maxIterations: q.maxIterations, maxPeriod: q.maxPeriod });
  const span = Number(raw.spanY),
    cr0 = Number(raw.center.re),
    ci0 = Number(raw.center.im);
  const upp = span / H,
    n = W * H;
  const cRe = new Float64Array(n),
    cIm = new Float64Array(n);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      cRe[y * W + x] = cr0 + (x + 0.5 - W / 2) * upp;
      cIm[y * W + x] = ci0 - (y + 0.5 - H / 2) * upp;
    }
  const sc = new OrbitScratch(opts.maxPeriod),
    a = createOrbitSample(),
    b = createOrbitSample(),
    o = createOrbitSample();
  const cat: Record<string, number> = {};
  const bump = (k: string) => (cat[k] = (cat[k] ?? 0) + 1);
  const disagreements: any[] = [];
  for (let i = 0; i < n; i++) {
    classifyInto(cRe[i], cIm[i], opts, sc, a);
    classifyH(cRe[i], cIm[i], opts, sc, b);
    const algebraic = b.status === 2 && b.evidence >= 5;
    if (!algebraic) {
      if (a.status !== b.status || (a.status === 2 && a.period !== b.period))
        bump('BUG-fallthrough-mismatch');
      // production p3/p4 that algebra did not take (refused or outside box)
      if (a.status === 2 && (a.period === 3 || a.period === 4)) bump(`prod-p${a.period}-not-taken`);
      continue;
    }
    if (a.status === 2 && a.period === b.period) {
      bump(`agree-p${b.period}`);
      agreeN++;
      const dl = Math.hypot(a.multiplierRe - b.multiplierRe, a.multiplierIm - b.multiplierIm);
      worstDl = Math.max(worstDl, dl);
      worstDmag = Math.max(worstDmag, Math.abs(a.multiplierMagnitude - b.multiplierMagnitude));
      if (b.multiplierMagnitude > 1e-6) {
        let d = Math.abs(a.multiplierAngle - b.multiplierAngle);
        d = Math.min(d, 2 * Math.PI - d);
        worstDang = Math.max(worstDang, d);
      }
    } else {
      const key = `prod-${a.status === 0 ? 'unresolved' : a.status === 1 ? 'escaped' : 'p' + a.period}->alg-p${b.period}`;
      bump(key);
      classifyInto(cRe[i], cIm[i], oracleOpts, oracleScratch, o);
      const oracleAgrees = o.status === 2 && o.period === b.period;
      bump(
        oracleAgrees
          ? 'oracle-confirms'
          : `ORACLE-${o.status === 0 ? 'unresolved' : o.status === 1 ? 'escaped' : 'p' + o.period}`,
      );
      if (disagreements.length < 5 || !oracleAgrees)
        disagreements.push({
          c: [cRe[i], cIm[i]],
          prod: a.status,
          alg: { p: b.period, mag: b.multiplierMagnitude },
          oracle: {
            s: o.status,
            p: o.period,
            it: o.iterations,
            mag: o.multiplierMagnitude,
            dl: Math.hypot(o.multiplierRe - b.multiplierRe, o.multiplierIm - b.multiplierIm),
          },
        });
    }
  }
  // Timing: full raster, production vs prototype, interleaved reps.
  const tp: number[] = [],
    th: number[] = [];
  for (let r = 0; r <= REPS; r++) {
    let t0 = performance.now();
    for (let i = 0; i < n; i++) classifyInto(cRe[i], cIm[i], opts, sc, a);
    const ta = performance.now() - t0;
    t0 = performance.now();
    for (let i = 0; i < n; i++) classifyH(cRe[i], cIm[i], opts, sc, b);
    const tb = performance.now() - t0;
    if (r > 0) {
      tp.push(ta);
      th.push(tb);
    }
  }
  const row = {
    id: raw.id,
    prodMs: median(tp),
    protoMs: median(th),
    speedup: median(tp) / median(th),
    cat,
    disagreements,
  };
  res.push(row);
  const line = `${raw.id.padEnd(32)} prod ${row.prodMs.toFixed(2).padStart(7)} ms  proto ${row.protoMs.toFixed(2).padStart(7)} ms  x${row.speedup.toFixed(2).padStart(6)}  ${JSON.stringify(cat)}`;
  console.log(line);
  lines.push(line);
}
// Microbench: algebraic test alone on all period-3 / period-4 pixels of the corpus.
const px = JSON.parse(readFileSync(`pixels-${W}x${H}.json`, 'utf8'));
const s3: number[][] = [],
  s4: number[][] = [];
for (const id of Object.keys(px)) for (const e of px[id].sel) (e[2] === 3 ? s3 : s4).push(e);
const out = createOrbitSample();
const bench = (set: number[][], fn: (r: number, i: number, o: any) => boolean) => {
  const ts: number[] = [];
  for (let r = 0; r < 15; r++) {
    const t0 = performance.now();
    for (const e of set) fn(e[0], e[1], out);
    ts.push(performance.now() - t0);
  }
  return (median(ts.slice(3)) * 1e6) / set.length;
};
const tail = [
  `agreeing algebraic pixels ${agreeN}; worst |Δλ| ${worstDl.toExponential(2)}, worst Δ|λ| ${worstDmag.toExponential(2)}, worst Δarg ${worstDang.toExponential(2)} rad`,
  `microbench ns/pixel: tryP3 on ${s3.length} p3 pixels ${bench(s3, tryP3).toFixed(1)}; tryP4 on ${s4.length} p4 pixels ${bench(s4, tryP4).toFixed(1)}`,
  `stats ${JSON.stringify(stats)}`,
];
let sp = 0,
  sh = 0;
for (const r of res) {
  sp += r.prodMs;
  sh += r.protoMs;
}
tail.push(
  `corpus sum: prod ${sp.toFixed(1)} ms, proto ${sh.toFixed(1)} ms, saving ${(100 * (1 - sh / sp)).toFixed(1)}%`,
);
for (const t of tail) console.log(t);
writeFileSync(`compare-${W}x${H}.json`, JSON.stringify(res, null, 1));
writeFileSync(`compare-${W}x${H}.txt`, [...lines, ...tail].join('\n') + '\n');
process.exit(0);
