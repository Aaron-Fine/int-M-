import { expect, test } from '@playwright/test';
import type { auditPeriodTwoVerifier } from '../../poc/performance/src/numerics/period-two-verifier';

test('audits the bounded verifier pilot in the browser', async ({ page }) => {
  await page.goto('/');
  const outcomes = await page.evaluate(async () => {
    // Vite serves this research module only for this test; it is not imported
    // by the application or bundled into the production renderer.
    const modulePath = '/poc/performance/src/numerics/period-two-verifier.ts';
    const { auditPeriodTwoVerifier: audit } = (await import(modulePath)) as {
      auditPeriodTwoVerifier: typeof auditPeriodTwoVerifier;
    };
    const radius = 2 ** -32;
    const cases = [
      { re: -1, im: -0 },
      { re: -1 - radius, im: -radius },
      { re: -1 - radius, im: radius },
      { re: -1 + radius, im: -radius },
      { re: -1 + radius, im: radius },
      { re: -1, im: Number.MIN_VALUE },
      { re: -1 + 0.1234567 * radius, im: -0.9876543 * radius },
    ];
    return {
      accepted: cases.map((c) => {
        const result = audit(c);
        if (result.status !== 'audited') return result;
        return {
          status: result.status,
          period: result.verdict.period,
          multiplier: result.verdict.multiplierMagnitude,
          angle: result.verdict.multiplierAngle,
          infiniteKappa: result.verdict.kappa === Infinity,
          nonzeroExactResidual: result.certificate.closure.exactResidualSquared.numerator > 0n,
        };
      }),
      outside: audit({ re: -1 + 2 * radius, im: 0 }),
      nonfinite: audit({ re: -1, im: NaN }),
    };
  });
  expect(outcomes.accepted).toHaveLength(7);
  for (const outcome of outcomes.accepted) {
    expect(outcome).toMatchObject({
      status: 'audited',
      period: 2,
      multiplier: 0,
      angle: 0,
      infiniteKappa: true,
    });
  }
  expect(outcomes.accepted[5]).toMatchObject({ nonzeroExactResidual: true });
  expect(outcomes.outside).toEqual({ status: 'refused', reason: 'outside-tile' });
  expect(outcomes.nonfinite).toEqual({ status: 'refused', reason: 'nonfinite-parameter' });
});
