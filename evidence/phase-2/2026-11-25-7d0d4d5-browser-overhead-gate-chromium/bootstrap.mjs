/* eslint-disable no-console -- a one-off evidence script that prints its results */
// Paired median of the per-repetition stable-pass wall-time ratio arm/reference,
// with a 95% percentile bootstrap interval of that median (5,000 resamples,
// mulberry32 seed 1), for cold-workers.ts JSON output.
// Usage: node bootstrap.mjs <file.json> [...]
import { readFileSync } from 'node:fs';
const mulberry32 = (a) => () => {
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 === 1 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};
const pct = (r) => `${r >= 1 ? '+' : '−'}${Math.abs((r - 1) * 100).toFixed(1)}%`;
for (const file of process.argv.slice(2)) {
  const data = JSON.parse(readFileSync(file, 'utf8'));
  const [ref, ...others] = data.arms.map((a) => a.name);
  console.log(`${file}  load ${data.load.toFixed(2)}  reps ${data.reps}  ${data.userAgent}`);
  for (const [caseId, byArm] of Object.entries(data.samples)) {
    const base = byArm[ref].map((s) => s.wallMs);
    for (const arm of others) {
      const xs = byArm[arm].map((s) => s.wallMs);
      const ratios = xs.map((x, i) => x / base[i]);
      const random = mulberry32(1);
      const boots = [];
      for (let b = 0; b < 5000; b += 1) {
        boots.push(median(ratios.map(() => ratios[Math.floor(random() * ratios.length)])));
      }
      boots.sort((p, q) => p - q);
      const hashes = new Set(Object.values(data.hashes[caseId])).size === 1 ? 'same' : 'differs';
      console.log(
        `  ${caseId.padEnd(31)} ${arm.padEnd(8)} ${median(base).toFixed(1)} → ${median(xs).toFixed(1)} ms  ${pct(median(ratios))} [${pct(boots[124])}, ${pct(boots[4874])}]  output ${hashes}`,
      );
    }
  }
}
