// Tiny complex helpers (allocation-y; used only offline for boxes).
export type C = [number, number];
export const add = (a: C, b: C): C => [a[0] + b[0], a[1] + b[1]];
export const sub = (a: C, b: C): C => [a[0] - b[0], a[1] - b[1]];
export const mul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
export const div = (a: C, b: C): C => {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
};
export const sc = (s: number, a: C): C => [s * a[0], s * a[1]];
export const abs = (a: C) => Math.hypot(a[0], a[1]);
// Evaluate polynomial (coeffs low->high, complex) and derivative at x.
export const peval = (co: C[], x: C): [C, C] => {
  let p: C = [0, 0],
    d: C = [0, 0];
  for (let k = co.length - 1; k >= 0; k--) {
    d = add(mul(d, x), p);
    p = add(mul(p, x), co[k]);
  }
  return [p, d];
};
// Durand-Kerner roots of monic-normalised polynomial.
export const roots = (co: C[]): C[] => {
  const n = co.length - 1;
  const lead = co[n];
  const m = co.map((a) => div(a, lead));
  let z: C[] = Array.from({ length: n }, (_, k) => mul([0.4, 0.9], k === 0 ? [1, 0] : z0pow(k)));
  function z0pow(k: number): C {
    let r: C = [1, 0];
    for (let i = 0; i < k; i++) r = mul(r, [0.4, 0.9]);
    return r;
  }
  for (let it = 0; it < 500; it++) {
    z = z.map((zi, i) => {
      let den: C = [1, 0];
      z.forEach((zj, j) => {
        if (j !== i) den = mul(den, sub(zi, zj));
      });
      return sub(zi, div(peval(m, zi)[0], den));
    });
  }
  return z;
};
