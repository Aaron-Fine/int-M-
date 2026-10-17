// Timing only: production classifyInto vs prototype classifyH vs a null wrapper
// (same call structure, no p3/p4 tests), interleaved with rotating order.
import { readFileSync, writeFileSync } from 'node:fs';
import {
  OrbitScratch,
  createOrbitSample,
  resolveOrbitOptions,
  classifyInto,
  classifyAnalyticInto,
} from '../../../src/domain/orbit.ts';
import { classifyTriggeredOrbitInto } from '../../../src/domain/orbit-triggered.ts';
import { getQualityProfile } from '../../../src/ui/view-state.ts';
import { classifyH } from './p34.ts';
const classifyNull = (cRe: number, cIm: number, options: any, scratch: OrbitScratch, out: any) => {
  if (classifyAnalyticInto(cRe, cIm, out)) return;
  scratch.ensureCapacity(options.maxPeriod);
  classifyTriggeredOrbitInto(cRe, cIm, options, scratch, out);
};
const W = Number(process.argv[2] ?? 256),
  H = Number(process.argv[3] ?? 160),
  REPS = Number(process.argv[4] ?? 21);
const corpus = JSON.parse(
  readFileSync(new URL('../../../tools/benchmark/corpus.v1.json', import.meta.url), 'utf8'),
);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
const fns = [
  ['prod', classifyInto],
  ['null', classifyNull],
  ['proto', classifyH],
] as const;
const lines: string[] = [];
let tot: Record<string, number> = { prod: 0, null: 0, proto: 0 };
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
    s = createOrbitSample();
  const t: Record<string, number[]> = { prod: [], null: [], proto: [] };
  for (let r = 0; r <= REPS; r++) {
    for (let k = 0; k < 3; k++) {
      const [name, fn] = fns[(r + k) % 3];
      const t0 = performance.now();
      for (let i = 0; i < n; i++) (fn as any)(cRe[i], cIm[i], opts, sc, s);
      const dt = performance.now() - t0;
      if (r > 0) t[name].push(dt);
    }
  }
  const m = { prod: median(t.prod), null: median(t.null), proto: median(t.proto) };
  for (const k of Object.keys(m)) tot[k] += (m as any)[k];
  const line = `${raw.id.padEnd(32)} prod ${m.prod.toFixed(2).padStart(7)}  null ${m.null.toFixed(2).padStart(7)}  proto ${m.proto.toFixed(2).padStart(7)} ms | proto/prod x${(m.prod / m.proto).toFixed(2).padStart(6)}  proto vs null ${(100 * (m.proto / m.null - 1)).toFixed(1).padStart(6)}%`;
  console.log(line);
  lines.push(line);
}
const tl = `corpus sum (ms): prod ${tot.prod.toFixed(1)} null ${tot.null.toFixed(1)} proto ${tot.proto.toFixed(1)}; saving vs prod ${(100 * (1 - tot.proto / tot.prod)).toFixed(1)}%`;
console.log(tl);
lines.push(tl);
writeFileSync(`timing-${W}x${H}.txt`, lines.join('\n') + '\n');
process.exit(0);
