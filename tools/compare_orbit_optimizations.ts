import { OrbitClassifier, createViewportTransform } from '../src/domain';

const cases = [
  { id: 'full-set', center: { re: -0.75, im: 0 }, spanY: 2.5 },
  { id: 'rabbit', center: { re: -0.12, im: 0.74 }, spanY: 0.35 },
  { id: 'seahorse', center: { re: -0.7435, im: 0.1314 }, spanY: 0.002 },
  { id: 'real-boundary', center: { re: -1.75, im: 0 }, spanY: 0.03 },
];
const reports = [];
for (const viewport of cases) {
  for (const maxIterations of [48, 128, 512]) {
    const scan = new OrbitClassifier({ maxIterations, maxPeriod: 32, cycleDetection: 'scan' });
    const checkpoint = new OrbitClassifier({
      maxIterations,
      maxPeriod: 32,
      cycleDetection: 'checkpoint',
    });
    const transform = createViewportTransform(viewport, { width: 160, height: 120 });
    let statusDifferences = 0;
    let periodDifferences = 0;
    let maxMagnitudeDifference = 0;
    let maxDirectionDifference = 0;
    let firstDifference:
      | {
          point: { re: number; im: number };
          scanStatus: number;
          checkpointStatus: number;
          scanPeriod: number;
          checkpointPeriod: number;
        }
      | undefined;
    for (let y = 0; y < 120; y += 1) {
      for (let x = 0; x < 160; x += 1) {
        const point = transform.pixelToComplex(x, y);
        const a = scan.classifyRaster(point.re, point.im);
        const b = checkpoint.classifyRaster(point.re, point.im);
        if (firstDifference === undefined && (a.status !== b.status || a.period !== b.period)) {
          firstDifference = {
            point,
            scanStatus: a.status,
            checkpointStatus: b.status,
            scanPeriod: a.period,
            checkpointPeriod: b.period,
          };
        }
        if (a.status !== b.status) statusDifferences += 1;
        if (a.period !== b.period) periodDifferences += 1;
        if (a.status === 2 && b.status === 2) {
          maxMagnitudeDifference = Math.max(
            maxMagnitudeDifference,
            Math.abs(
              a.smoothIterationOrMultiplierMagnitude - b.smoothIterationOrMultiplierMagnitude,
            ),
          );
          if (
            a.smoothIterationOrMultiplierMagnitude > 1e-6 &&
            b.smoothIterationOrMultiplierMagnitude > 1e-6
          ) {
            maxDirectionDifference = Math.max(
              maxDirectionDifference,
              Math.hypot(
                a.multiplierUnitRe - b.multiplierUnitRe,
                a.multiplierUnitIm - b.multiplierUnitIm,
              ),
            );
          }
        }
      }
    }
    reports.push({
      id: viewport.id,
      maxIterations,
      samples: 19200,
      statusDifferences,
      periodDifferences,
      maxMagnitudeDifference,
      maxDirectionDifference,
      firstDifference,
    });
  }
}
process.stdout.write(`${JSON.stringify(reports, null, 2)}\n`);
