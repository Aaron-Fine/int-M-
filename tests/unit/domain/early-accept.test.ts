import { describe, expect, it } from 'vitest';

import {
  classifyInto,
  createOrbitSample,
  OrbitClassifier,
  OrbitScratch,
  resolveOrbitOptions,
  type OrbitSample,
} from '../../../src/domain';
import {
  CERT_REASON,
  certifyCycle,
  CertifyWorkspace,
  createCertificateRecord,
} from '../../../src/domain/certify-cycle';

interface View {
  readonly re: number;
  readonly im: number;
  readonly spanY: number;
}

const VIEWS: readonly View[] = [
  { re: -0.12, im: 0.74, spanY: 0.1 },
  { re: -1.94, im: 0.0005, spanY: 0.004 },
  { re: -0.75, im: 0.1, spanY: 0.3 },
];

const WIDTH = 40;
const HEIGHT = 30;
const OPTIONS = { maxIterations: 512, maxPeriod: 32 } as const;

describe('classifierMode early-accept', () => {
  it('matches the legacy scan except for certified unresolved-to-attracting conversions', () => {
    const legacyOptions = resolveOrbitOptions(OPTIONS);
    const legacyScratch = new OrbitScratch(OPTIONS.maxPeriod);
    const early = new OrbitClassifier(
      { ...OPTIONS, classifierMode: 'early-accept' },
      new OrbitScratch(OPTIONS.maxPeriod),
    );
    const state = early.earlyAccept;
    expect(state).not.toBeNull();
    const legacy: OrbitSample = createOrbitSample();
    const candidate: OrbitSample = createOrbitSample();
    let attractingKept = 0;
    let conversions = 0;
    let certifiedBeforeProduction = 0;
    for (const view of VIEWS) {
      for (let y = 0; y < HEIGHT; y += 1) {
        for (let x = 0; x < WIDTH; x += 1) {
          const re = view.re + ((x + 0.5) / WIDTH - 0.5) * view.spanY * (WIDTH / HEIGHT);
          const im = view.im + ((y + 0.5) / HEIGHT - 0.5) * view.spanY;
          classifyInto(re, im, legacyOptions, legacyScratch, legacy);
          early.classifyInto(re, im, candidate);
          if (legacy.status === 2) {
            expect(candidate.status).toBe(2);
            expect(candidate.period).toBe(legacy.period);
            expect(
              Math.abs(candidate.multiplierMagnitude - legacy.multiplierMagnitude),
            ).toBeLessThan(2e-4);
            attractingKept += 1;
            if (state?.certified === true) certifiedBeforeProduction += 1;
          } else if (legacy.status === 1) {
            expect(candidate.status).toBe(1);
            expect(candidate.iterations).toBe(legacy.iterations);
            expect(Object.is(candidate.smoothIteration, legacy.smoothIteration)).toBe(true);
            expect(Object.is(candidate.magnitudeSquared, legacy.magnitudeSquared)).toBe(true);
          } else if (candidate.status === 2) {
            expect(state?.certified).toBe(true);
            conversions += 1;
          } else {
            expect(candidate.status).toBe(0);
          }
        }
      }
    }
    expect(attractingKept).toBeGreaterThan(100);
    // Early acceptance fires on production-accepted pixels (it is the point).
    expect(certifiedBeforeProduction).toBeGreaterThan(0);
    expect(conversions).toBeGreaterThanOrEqual(0);
    expect(state?.counters.certifications).toBeGreaterThan(0);
  });

  it('is off by default: the default classifier carries no early-accept state', () => {
    expect(new OrbitClassifier(OPTIONS).earlyAccept).toBeNull();
  });
});

describe('certifyCycle', () => {
  // c = -0.12 + 0.74i (rabbit): attracting period-3 cycle.
  const cRe = -0.12;
  const cIm = 0.74;
  const converge = (): { re: number; im: number } => {
    let re = 0;
    let im = 0;
    for (let i = 0; i < 4000; i += 1) {
      const next = re * re - im * im + cRe;
      im = 2 * re * im + cIm;
      re = next;
    }
    return { re, im };
  };

  it('certifies a converged period-3 cycle and rejects wrong periods', () => {
    const z0 = converge();
    const ws = new CertifyWorkspace(32);
    const rec = createCertificateRecord(32);
    expect(certifyCycle(ws, rec, cRe, cIm, z0.re, z0.im, 3, 1e-6)).toBe(CERT_REASON.certified);
    expect(rec.q).toBeLessThan(1);
    expect(rec.residual).toBeLessThanOrEqual(rec.closureLimit);
    // Period 6 is a non-primitive multiple: the divisor-separation test refuses it.
    expect(certifyCycle(ws, rec, cRe, cIm, z0.re, z0.im, 6, 1e-6)).toBe(
      CERT_REASON.divisorSeparation,
    );
    // Too-small radius: closure window fails; huge radius: refused outright.
    expect(certifyCycle(ws, rec, cRe, cIm, z0.re + 1e-3, z0.im, 3, 1e-9)).toBe(
      CERT_REASON.closureWindow,
    );
    expect(certifyCycle(ws, rec, cRe, cIm, z0.re, z0.im, 3, 0.5)).toBe(CERT_REASON.radiusTooLarge);
  });
});
