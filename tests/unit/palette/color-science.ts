/**
 * Colour-science helpers for palette acceptance tests (no browser).
 *
 * - sRGB (IEC 61966-2-1) <-> linear RGB, D65 XYZ and CIELAB (D65 white).
 * - CIEDE2000 colour difference (Sharma, Wu and Dalal 2005).
 * - Colour-vision deficiency simulation: Machado, Oliveira and Fernandes
 *   2009, severity 1.0 (dichromacy), applied to linear RGB and clamped.
 * - WCAG 2.x relative luminance, contrast ratio and alpha compositing.
 */

export type Rgb = readonly [red: number, green: number, blue: number];
export type Vision = 'normal' | 'protan' | 'deutan' | 'tritan';
export const VISIONS: readonly Vision[] = ['normal', 'protan', 'deutan', 'tritan'];

type Matrix = readonly [Rgb, Rgb, Rgb];

/** Machado et al. 2009, Table "severity 1.0" (protanopia, deuteranopia, tritanopia). */
const MACHADO_2009: Record<Exclude<Vision, 'normal'>, Matrix> = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritan: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

const toLinear = (byte: number): number => {
  const c = byte / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const toByte = (linear: number): number => {
  const c = Math.min(1, Math.max(0, linear));
  const encoded = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.round(encoded * 255);
};

/** Simulated appearance of an sRGB colour (bytes in, bytes out). */
export const simulate = (rgb: Rgb, vision: Vision): Rgb => {
  if (vision === 'normal') return rgb;
  const m = MACHADO_2009[vision];
  const lin = [toLinear(rgb[0]), toLinear(rgb[1]), toLinear(rgb[2])] as const;
  const row = (r: Rgb): number => r[0] * lin[0] + r[1] * lin[1] + r[2] * lin[2];
  return [toByte(row(m[0])), toByte(row(m[1])), toByte(row(m[2]))];
};

/** CIELAB (D65) of an sRGB colour. */
export const toLab = (rgb: Rgb): readonly [l: number, a: number, b: number] => {
  const r = toLinear(rgb[0]);
  const g = toLinear(rgb[1]);
  const b = toLinear(rgb[2]);
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (t: number): number => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
};

const degrees = (radians: number): number => (radians * 180) / Math.PI;
const radians = (deg: number): number => (deg * Math.PI) / 180;

/** CIEDE2000 between two CIELAB colours (kL = kC = kH = 1). */
export const ciede2000Lab = (
  lab1: readonly [number, number, number],
  lab2: readonly [number, number, number],
): number => {
  const [l1, a1, b1] = lab1;
  const [l2, a2, b2] = lab2;
  const c1 = Math.hypot(a1, b1);
  const c2 = Math.hypot(a2, b2);
  const cBar7 = ((c1 + c2) / 2) ** 7;
  const g = 0.5 * (1 - Math.sqrt(cBar7 / (cBar7 + 25 ** 7)));
  const a1p = (1 + g) * a1;
  const a2p = (1 + g) * a2;
  const c1p = Math.hypot(a1p, b1);
  const c2p = Math.hypot(a2p, b2);
  const hue = (bp: number, ap: number): number =>
    bp === 0 && ap === 0 ? 0 : (degrees(Math.atan2(bp, ap)) + 360) % 360;
  const h1p = hue(b1, a1p);
  const h2p = hue(b2, a2p);
  const dLp = l2 - l1;
  const dCp = c2p - c1p;
  let dhp = 0;
  if (c1p * c2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(c1p * c2p) * Math.sin(radians(dhp / 2));
  const lBarP = (l1 + l2) / 2;
  const cBarP = (c1p + c2p) / 2;
  let hBarP = h1p + h2p;
  if (c1p * c2p !== 0) {
    if (Math.abs(h1p - h2p) <= 180) hBarP = (h1p + h2p) / 2;
    else if (h1p + h2p < 360) hBarP = (h1p + h2p + 360) / 2;
    else hBarP = (h1p + h2p - 360) / 2;
  }
  const t =
    1 -
    0.17 * Math.cos(radians(hBarP - 30)) +
    0.24 * Math.cos(radians(2 * hBarP)) +
    0.32 * Math.cos(radians(3 * hBarP + 6)) -
    0.2 * Math.cos(radians(4 * hBarP - 63));
  const dTheta = 30 * Math.exp(-(((hBarP - 275) / 25) ** 2));
  const cBarP7 = cBarP ** 7;
  const rC = 2 * Math.sqrt(cBarP7 / (cBarP7 + 25 ** 7));
  const sL = 1 + (0.015 * (lBarP - 50) ** 2) / Math.sqrt(20 + (lBarP - 50) ** 2);
  const sC = 1 + 0.045 * cBarP;
  const sH = 1 + 0.015 * cBarP * t;
  const rT = -Math.sin(radians(2 * dTheta)) * rC;
  return Math.sqrt(
    (dLp / sL) ** 2 + (dCp / sC) ** 2 + (dHp / sH) ** 2 + rT * (dCp / sC) * (dHp / sH),
  );
};

/** CIEDE2000 between two sRGB colours as seen under the given vision. */
export const deltaE = (first: Rgb, second: Rgb, vision: Vision = 'normal'): number =>
  ciede2000Lab(toLab(simulate(first, vision)), toLab(simulate(second, vision)));

/** WCAG 2.x relative luminance of an sRGB colour. */
export const relativeLuminance = (rgb: Rgb): number =>
  0.2126 * toLinear(rgb[0]) + 0.7152 * toLinear(rgb[1]) + 0.0722 * toLinear(rgb[2]);

/** WCAG 2.x contrast ratio. */
export const contrastRatio = (first: Rgb, second: Rgb): number => {
  const l1 = relativeLuminance(first);
  const l2 = relativeLuminance(second);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};

/** Source-over compositing of `top` at `alpha` onto an opaque `bottom` (sRGB bytes). */
export const composite = (top: Rgb, alpha: number, bottom: Rgb): Rgb => [
  top[0] * alpha + bottom[0] * (1 - alpha),
  top[1] * alpha + bottom[1] * (1 - alpha),
  top[2] * alpha + bottom[2] * (1 - alpha),
];
