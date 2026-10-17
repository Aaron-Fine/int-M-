// Step 2: Amdahl bound. Classify each corpus view at WxH with the production
// scalar classifier, record status/period/iterations, then time the whole
// raster vs. only the period-3/4 attracting pixels (batch timing, median of reps).
import { readFileSync, writeFileSync } from 'node:fs';
import {
  OrbitClassifier,
  OrbitScratch,
  createOrbitSample,
  createViewportTransform,
} from '../../../src/domain/index.ts';
import { getQualityProfile } from '../../../src/ui/view-state.ts';
import { classifyRows } from '../../../src/render/classify-rows.ts';
import { unpackStatus, unpackPeriod } from '../../../src/render/packed-semantic.ts';

const W = Number(process.argv[2] ?? 256),
  H = Number(process.argv[3] ?? 160);
const REPS = Number(process.argv[4] ?? 9);
const corpus = JSON.parse(
  readFileSync(new URL('../../../tools/benchmark/corpus.v1.json', import.meta.url), 'utf8'),
);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

const rows: any[] = [];
const dump: any = {};
for (const raw of corpus.cases) {
  const quality = getQualityProfile(raw.profile.toLowerCase()).quality;
  const opts = { maxIterations: quality.maxIterations, maxPeriod: quality.maxPeriod };
  const viewport = {
    center: { re: Number(raw.center.re), im: Number(raw.center.im) },
    spanY: Number(raw.spanY),
  };
  const size = { width: W, height: H };
  const tf = createViewportTransform(viewport, size);
  const n = W * H;
  const cRe = new Float64Array(n),
    cIm = new Float64Array(n);
  for (let y = 0; y < H; y++) {
    const im = viewport.center.im - (y + 0.5 - H / 2) * tf.unitsPerPixel;
    for (let x = 0; x < W; x++) {
      cRe[y * W + x] = viewport.center.re + (x + 0.5 - W / 2) * tf.unitsPerPixel;
      cIm[y * W + x] = im;
    }
  }
  const clf = new OrbitClassifier(opts, new OrbitScratch(opts.maxPeriod));
  const s = createOrbitSample();
  const status = new Uint8Array(n),
    period = new Uint16Array(n),
    iters = new Uint32Array(n),
    evid = new Uint8Array(n);
  const mag = new Float64Array(n),
    ang = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    clf.classifyInto(cRe[i], cIm[i], s);
    status[i] = s.status;
    period[i] = s.status === 2 ? s.period : 0;
    iters[i] = s.iterations;
    evid[i] = s.evidence;
    mag[i] = s.status === 2 ? s.multiplierMagnitude : 0;
    ang[i] = s.status === 2 ? s.multiplierAngle : 0;
  }
  // Cross-check against the production stable-pass row kernel (status + period).
  const band = await classifyRows(
    { viewport, size, quality } as any,
    quality,
    1,
    0,
    H,
    new AbortController().signal,
  );
  let mismatch = 0;
  for (let i = 0; i < n; i++) {
    const w = band.packedStatusPeriod[i];
    if (unpackStatus(w) !== status[i] || (status[i] === 2 && unpackPeriod(w) !== period[i]))
      mismatch++;
  }
  const sel: number[] = [];
  const cnt: Record<string, number> = { esc: 0, unres: 0, p1: 0, p2: 0, p3: 0, p4: 0, other: 0 };
  let itAll = 0,
    it34 = 0;
  for (let i = 0; i < n; i++) {
    itAll += iters[i];
    if (status[i] === 1) cnt.esc++;
    else if (status[i] === 0) cnt.unres++;
    else if (period[i] === 1) cnt.p1++;
    else if (period[i] === 2) cnt.p2++;
    else if (period[i] === 3 || period[i] === 4) {
      cnt['p' + period[i]]++;
      sel.push(i);
      it34 += iters[i];
    } else cnt.other++;
  }
  const sRe = Float64Array.from(sel, (i) => cRe[i]),
    sIm = Float64Array.from(sel, (i) => cIm[i]);
  const tAll: number[] = [],
    tSel: number[] = [];
  for (let r = 0; r <= REPS; r++) {
    let t0 = performance.now();
    for (let i = 0; i < n; i++) clf.classifyInto(cRe[i], cIm[i], s);
    const a = performance.now() - t0;
    t0 = performance.now();
    for (let i = 0; i < sRe.length; i++) clf.classifyInto(sRe[i], sIm[i], s);
    const b = performance.now() - t0;
    if (r > 0) {
      tAll.push(a);
      tSel.push(b);
    }
  }
  const ta = median(tAll),
    ts = median(tSel);
  const p34iters = sel.map((i) => iters[i]);
  rows.push({
    id: raw.id,
    profile: raw.profile,
    n,
    ...cnt,
    frac34: (cnt.p3 + cnt.p4) / n,
    iterShare34: it34 / itAll,
    msAll: ta,
    ms34: ts,
    timeShare34: ts / ta,
    nsPer34: sel.length ? (ts * 1e6) / sel.length : NaN,
    nsPerAll: (ta * 1e6) / n,
    meanIter34: sel.length ? it34 / sel.length : NaN,
    minIter34: sel.length ? Math.min(...p34iters) : NaN,
    maxIter34: sel.length ? Math.max(...p34iters) : NaN,
    rowKernelMismatch: mismatch,
  });
  dump[raw.id] = {
    W,
    H,
    opts,
    sel: sel.map((i) => [cRe[i], cIm[i], period[i], mag[i], ang[i], iters[i]]),
    all: Array.from({ length: n }, (_, i) => [
      cRe[i],
      cIm[i],
      status[i],
      period[i],
      mag[i],
      ang[i],
    ]),
  };
}
writeFileSync(`measure-${W}x${H}.json`, JSON.stringify(rows, null, 1));
writeFileSync(`pixels-${W}x${H}.json`, JSON.stringify(dump));
const f = (x: number, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '-');
console.log(`raster ${W}x${H}, median of ${REPS} reps (Node ${process.version})`);
console.log(
  'id'.padEnd(32),
  'prof'.padEnd(8),
  '%esc  %unr  %p1  %p2  %p3  %p4  %oth | %p34px %p34iter %p34time | ns/px all  ns/px p34  meanIt p34 | rowK mism',
);
let sumAll = 0,
  sum34 = 0;
for (const r of rows) {
  sumAll += r.msAll;
  sum34 += r.ms34;
  const pc = (k: string) => f((100 * r[k]) / r.n).padStart(4);
  console.log(
    r.id.padEnd(32),
    r.profile.padEnd(8),
    pc('esc'),
    pc('unres'),
    pc('p1'),
    pc('p2'),
    pc('p3'),
    pc('p4'),
    pc('other'),
    '|',
    f(100 * r.frac34).padStart(5),
    f(100 * r.iterShare34).padStart(7),
    f(100 * r.timeShare34).padStart(8),
    '|',
    f(r.nsPerAll, 0).padStart(9),
    f(r.nsPer34, 0).padStart(10),
    f(r.meanIter34).padStart(10),
    '|',
    r.rowKernelMismatch,
  );
}
console.log(
  `corpus total: all ${sumAll.toFixed(1)} ms, p3/p4 pixels ${sum34.toFixed(1)} ms => ${((100 * sum34) / sumAll).toFixed(2)}% (sum-of-times weighting)`,
);
