// Throwaway prototype: analytic period-3 / period-4 fast paths, structured like
// the shipped p1/p2 fast paths (closed-form multiplier + attraction margin),
// with an a-posteriori floating-point error allowance so near-boundary or
// ill-conditioned pixels are refused (fall through to the orbit kernel).
import {
  classifyAnalyticInto,
  OrbitScratch,
  type OrbitSample,
  type OrbitOptions,
} from '../../../src/domain/orbit.ts';
import { classifyTriggeredOrbitInto } from '../../../src/domain/orbit-triggered.ts';

const MARGIN = 1e-12;
const EPS = 2.220446049250313e-16;
export const EVIDENCE_ANALYTIC_P3 = 5;
export const EVIDENCE_ANALYTIC_P4 = 6;
export const stats = { p3Tried: 0, p3Refused: 0, p4Tried: 0, p4Refused: 0, p4RefusedByErr: 0 };

const finish = (out: OrbitSample, period: number, lr: number, li: number, ev: number) => {
  const m = Math.hypot(lr, li);
  out.status = 2;
  out.iterations = 0;
  out.evidence = ev;
  out.period = period;
  out.multiplierRe = lr;
  out.multiplierIm = li;
  out.multiplierMagnitude = m;
  out.multiplierAngle = m === 0 ? 0 : Math.atan2(li, lr);
};

// Period 3: λ = 4(c+2) ± 4i·c·sqrt(4c+7)  (roots of λ² − 8(c+2)λ + 64·G3(c)).
export const tryP3 = (cRe: number, cIm: number, out: OrbitSample): boolean => {
  stats.p3Tried++;
  const wr = 4 * cRe + 7,
    wi = 4 * cIm; // 4c+7 (Re exact near c=-7/4 by Sterbenz)
  const wm = Math.sqrt(wr * wr + wi * wi);
  let sr = Math.sqrt(0.5 * (wm + wr));
  let si = Math.sqrt(0.5 * Math.max(0, wm - wr));
  if (wi < 0) si = -si;
  if (wr < 0 && sr === 0) {
    /* pure imaginary sqrt */
  }
  // t = 4i·c·s
  const csr = cRe * sr - cIm * si,
    csi = cRe * si + cIm * sr;
  const tr = -4 * csi,
    ti = 4 * csr;
  const ar = 4 * (cRe + 2),
    ai = 4 * cIm;
  const l1r = ar + tr,
    l1i = ai + ti,
    l2r = ar - tr,
    l2i = ai - ti;
  const m1 = l1r * l1r + l1i * l1i,
    m2 = l2r * l2r + l2i * l2i;
  const lr = m1 <= m2 ? l1r : l2r,
    li = m1 <= m2 ? l1i : l2i;
  const mag = Math.sqrt(Math.min(m1, m2));
  // Rounding allowance: a few ulps of the two summands (generous constant).
  const err = 32 * EPS * (Math.sqrt(ar * ar + ai * ai) + Math.sqrt(tr * tr + ti * ti));
  if (mag + err < 1 - MARGIN) {
    finish(out, 3, lr, li, EVIDENCE_ANALYTIC_P3);
    return true;
  }
  stats.p3Refused++;
  return false;
};

// Period 4: μ = λ/16 solves μ³ + (c²−3)μ² − (c⁴+c³−c²−3)μ − G4(c) = 0.
// Cardano for all three roots, two Newton polishes each, keep min |μ|,
// then a first-order a-posteriori error allowance |M|/|M'| + coefficient rounding.
let rRe = 0,
  rIm = 0;
const cbrtC = (x: number, y: number) => {
  const r = Math.cbrt(Math.sqrt(x * x + y * y));
  const t = Math.atan2(y, x) / 3;
  rRe = r * Math.cos(t);
  rIm = r * Math.sin(t);
};
export const tryP4 = (cRe: number, cIm: number, out: OrbitSample): boolean => {
  stats.p4Tried++;
  const c2r = cRe * cRe - cIm * cIm,
    c2i = 2 * cRe * cIm;
  const c3r = c2r * cRe - c2i * cIm,
    c3i = c2r * cIm + c2i * cRe;
  const c4r = c2r * c2r - c2i * c2i,
    c4i = 2 * c2r * c2i;
  const c5r = c4r * cRe - c4i * cIm,
    c5i = c4r * cIm + c4i * cRe;
  const c6r = c3r * c3r - c3i * c3i,
    c6i = 2 * c3r * c3i;
  const a2r = c2r - 3,
    a2i = c2i;
  const a1r = -(c4r + c3r - c2r - 3),
    a1i = -(c4i + c3i - c2i);
  const a0r = -(c6r + 3 * c5r + 3 * c4r + 3 * c3r + 2 * c2r + 1),
    a0i = -(c6i + 3 * c5i + 3 * c4i + 3 * c3i + 2 * c2i);
  // depressed: μ = y − a2/3; p = a1 − a2²/3; q = 2a2³/27 − a2·a1/3 + a0
  const s2r = a2r * a2r - a2i * a2i,
    s2i = 2 * a2r * a2i;
  const s3r = s2r * a2r - s2i * a2i,
    s3i = s2r * a2i + s2i * a2r;
  const pr = a1r - s2r / 3,
    pi = a1i - s2i / 3;
  const qr = (2 * s3r) / 27 - (a2r * a1r - a2i * a1i) / 3 + a0r,
    qi = (2 * s3i) / 27 - (a2r * a1i + a2i * a1r) / 3 + a0i;
  // D = q²/4 + p³/27
  const p2r = pr * pr - pi * pi,
    p2i = 2 * pr * pi,
    p3r = p2r * pr - p2i * pi,
    p3i = p2r * pi + p2i * pr;
  const Dr = (qr * qr - qi * qi) / 4 + p3r / 27,
    Di = (2 * qr * qi) / 4 + p3i / 27;
  const dm = Math.sqrt(Dr * Dr + Di * Di);
  let sr = Math.sqrt(0.5 * (dm + Dr)),
    si = Math.sqrt(0.5 * Math.max(0, dm - Dr));
  if (Di < 0) si = -si;
  // pick sign maximising |−q/2 ± sqrt(D)| for stability
  let ur = -qr / 2 + sr,
    ui = -qi / 2 + si;
  const vr0 = -qr / 2 - sr,
    vi0 = -qi / 2 - si;
  if (vr0 * vr0 + vi0 * vi0 > ur * ur + ui * ui) {
    ur = vr0;
    ui = vi0;
  }
  cbrtC(ur, ui);
  let Ur = rRe,
    Ui = rIm;
  let bestR = 0,
    bestI = 0,
    bestM = Infinity;
  for (let k = 0; k < 3; k++) {
    // rotate by ω^k
    const ang = (2 * Math.PI * k) / 3;
    const co = Math.cos(ang),
      sn = Math.sin(ang);
    const uR = Ur * co - Ui * sn,
      uI = Ur * sn + Ui * co;
    const um = uR * uR + uI * uI;
    let vR = 0,
      vI = 0;
    if (um > 0) {
      const nr = -pr / 3,
        ni = -pi / 3;
      vR = (nr * uR + ni * uI) / um;
      vI = (ni * uR - nr * uI) / um;
    }
    let mr = uR + vR - a2r / 3,
      mi = uI + vI - a2i / 3;
    for (let it = 0; it < 2; it++) {
      // M = ((μ + a2)μ + a1)μ + a0 ; M' = (3μ + 2a2)μ + a1
      let fr = mr + a2r,
        fi = mi + a2i;
      let tr2 = fr * mr - fi * mi + a1r,
        ti2 = fr * mi + fi * mr + a1i;
      const Mr = tr2 * mr - ti2 * mi + a0r,
        Mi = tr2 * mi + ti2 * mr + a0i;
      fr = 3 * mr + 2 * a2r;
      fi = 3 * mi + 2 * a2i;
      const dr = fr * mr - fi * mi + a1r,
        di = fr * mi + fi * mr + a1i;
      const dd = dr * dr + di * di;
      if (dd === 0) break;
      mr -= (Mr * dr + Mi * di) / dd;
      mi -= (Mi * dr - Mr * di) / dd;
    }
    const mm = mr * mr + mi * mi;
    if (mm < bestM) {
      bestM = mm;
      bestR = mr;
      bestI = mi;
    }
  }
  const mu = Math.sqrt(bestM);
  if (16 * mu >= 1) {
    stats.p4Refused++;
    return false;
  }
  // a-posteriori allowance at the chosen root
  let fr = bestR + a2r,
    fi = bestI + a2i;
  const tr2 = fr * bestR - fi * bestI + a1r,
    ti2 = fr * bestI + fi * bestR + a1i;
  const Mr = tr2 * bestR - ti2 * bestI + a0r,
    Mi = tr2 * bestI + ti2 * bestR + a0i;
  fr = 3 * bestR + 2 * a2r;
  fi = 3 * bestI + 2 * a2i;
  const dr = fr * bestR - fi * bestI + a1r,
    di = fr * bestI + fi * bestR + a1i;
  const cm = Math.sqrt(cRe * cRe + cIm * cIm);
  const cm2 = cm * cm,
    cm3 = cm2 * cm;
  const coefMag =
    mu * mu * mu +
    (cm2 + 3) * mu * mu +
    (cm2 * cm2 + cm3 + cm2 + 3) * mu +
    (cm3 * cm3 + 3 * cm3 * cm2 + 3 * cm2 * cm2 + 3 * cm3 + 2 * cm2 + 1);
  const err =
    (16 * 4 * (Math.sqrt(Mr * Mr + Mi * Mi) + 64 * EPS * coefMag)) / Math.sqrt(dr * dr + di * di);
  if (16 * mu + err < 1 - MARGIN) {
    finish(out, 4, 16 * bestR, 16 * bestI, EVIDENCE_ANALYTIC_P4);
    return true;
  }
  stats.p4Refused++;
  stats.p4RefusedByErr++;
  return false;
};

// Bounding boxes from boxes.ts (padded 2%; conjugate pairs folded via |Im c|).
export const inP3Box = (re: number, aim: number) =>
  (re >= -0.22324 && re <= -0.0265 && aim >= 0.64574 && aim <= 0.84221) ||
  (re >= -1.76901 && re <= -1.74717 && aim <= 0.01256);
export const inP4Box = (re: number, aim: number) =>
  (re >= 0.2353 && re <= 0.32682 && aim >= 0.48531 && aim <= 0.57683) ||
  (re >= -0.16289 && re <= -0.15226 && aim >= 1.02709 && aim <= 1.03819) ||
  (re >= -1.37046 && re <= -1.24764 && aim <= 0.06137) ||
  (re >= -1.94156 && re <= -1.9404 && aim <= 0.00067);

// Prototype classifier: production fast paths, then p3/p4 algebra, then the
// unchanged production orbit kernel.
export const classifyH = (
  cRe: number,
  cIm: number,
  options: OrbitOptions,
  scratch: OrbitScratch,
  out: OrbitSample,
) => {
  if (classifyAnalyticInto(cRe, cIm, out)) return;
  const aim = cIm < 0 ? -cIm : cIm;
  // Coarse gate: hull of all nine boxes (one or two compares for most of the plane).
  if (cRe <= 0.32682 && cRe >= -1.94156 && aim <= 1.03819) {
    if (inP3Box(cRe, aim) && tryP3(cRe, cIm, out)) return;
    if (inP4Box(cRe, aim) && tryP4(cRe, cIm, out)) return;
  }
  scratch.ensureCapacity(options.maxPeriod);
  classifyTriggeredOrbitInto(cRe, cIm, options, scratch, out);
};
