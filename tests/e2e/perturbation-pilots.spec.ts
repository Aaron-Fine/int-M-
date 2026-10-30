import { expect, test } from '@playwright/test';
import type {
  checkBackendTile,
  checkInteriorTile,
  OracleTile,
  TileReport,
} from '../../poc/performance/src/numerics/perturbation-browser-check';

// Runs the Phase 3 perturbation pilots (binary64 backend and certified V0
// verifier) inside the browser page and compares them with the committed
// interval-oracle fixtures, using the same checks as the Node unit tests.
// Vite serves the research modules and fixtures only for this test; nothing
// here is imported by the application or bundled into the renderer.

interface Fixture {
  readonly tiles: readonly OracleTile[];
}

const BACKEND_TILES = ['seahorse-step-2^-31', 'misiurewicz-i-step-2^-60'];
const INTERIOR_TILES = ['minibrot-p25-step-2^-24', 'minibrot-p34-step-2^-33'];

test('perturbation backend pilot agrees with its oracle fixture in the browser', async ({
  page,
}) => {
  await page.goto('/');
  const reports = await page.evaluate(
    async ({ ids }) => {
      const modulePath = '/poc/performance/src/numerics/perturbation-browser-check.ts';
      const { checkBackendTile: check } = (await import(modulePath)) as {
        checkBackendTile: typeof checkBackendTile;
      };
      const fixture = (await (
        await fetch('/fixtures/perturbation-tiles.v1.json')
      ).json()) as Fixture;
      return ids.map((id): TileReport => {
        const tile = fixture.tiles.find((candidate) => candidate.id === id);
        if (tile === undefined) throw new Error(`missing fixture tile ${id}`);
        return check(tile);
      });
    },
    { ids: BACKEND_TILES },
  );
  expect(reports.map((report) => report.id)).toEqual(BACKEND_TILES);
  for (const report of reports) {
    expect(report.failures, report.id).toEqual([]);
    expect(report.pixels, report.id).toBe(256);
    expect(report.compared, report.id).toBeGreaterThan(200);
  }
});

test('perturbation verifier pilot agrees with its oracle fixture in the browser', async ({
  page,
}) => {
  await page.goto('/');
  const reports = await page.evaluate(
    async ({ ids }) => {
      const modulePath = '/poc/performance/src/numerics/perturbation-browser-check.ts';
      const { checkInteriorTile: check } = (await import(modulePath)) as {
        checkInteriorTile: typeof checkInteriorTile;
      };
      const fixture = (await (
        await fetch('/fixtures/perturbation-interior.v1.json')
      ).json()) as Fixture;
      return ids.map((id): TileReport => {
        const tile = fixture.tiles.find((candidate) => candidate.id === id);
        if (tile === undefined) throw new Error(`missing fixture tile ${id}`);
        return check(tile);
      });
    },
    { ids: INTERIOR_TILES },
  );
  expect(reports.map((report) => report.id)).toEqual(INTERIOR_TILES);
  for (const report of reports) {
    expect(report.failures, report.id).toEqual([]);
    expect(report.pixels, report.id).toBe(256);
    expect(report.compared, report.id).toBeGreaterThan(0);
  }
});
